const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const admin = require("firebase-admin");

// Firebase Admin Initialization (Keep existing logic)
try {
  var serviceAccount = require("./serviceAccountKey.json");
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://pupu-tetris-default-rtdb.firebaseio.com"
  });
  console.log("Firebase Admin initialized successfully.");
} catch (error) {
  console.warn("Firebase Admin could not be initialized. Please ensure serviceAccountKey.json is present.");
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Game Constants
const INITIAL_BET = 10;
const MAX_ROUNDS = 3; // BO3

// Room State Management
class GameRoom {
  constructor(id) {
    this.id = id;
    this.players = []; // { socketId, name, ready, coins, holding }
    this.status = 'waiting'; // waiting, countdown, playing, round_end, proposing, finished
    this.currentRound = 1;
    this.scores = {}; // { socketId: wins }
    this.bets = { totalPot: 0, currentBet: INITIAL_BET }; 
    this.roundHistory = [];
    this.proposal = null; // { proposerId, amount, expireTime }
    this.timers = {};
  }

  addPlayer(socketId, name) {
    if (this.players.length >= 2) return false;
    this.players.push({
      socketId,
      name,
      ready: false,
      coins: 1000, // Mock balance if not auth
      holding: 0
    });
    this.scores[socketId] = 0;
    return true;
  }

  removePlayer(socketId) {
    this.players = this.players.filter(p => p.socketId !== socketId);
    // If empty or 1 player left during game, handle cleanup/forfeit
    if (this.players.length === 0) {
      this.clearTimers();
    }
    return this.players.length;
  }

  getPlayer(socketId) {
    return this.players.find(p => p.socketId === socketId);
  }

  getOpponent(socketId) {
    return this.players.find(p => p.socketId !== socketId);
  }

  setReady(socketId, isReady) {
    const player = this.getPlayer(socketId);
    if (player) {
      player.ready = isReady;
      return this.checkAllReady();
    }
    return false;
  }

  checkAllReady() {
    return this.players.length === 2 && this.players.every(p => p.ready);
  }

  resetReady() {
    this.players.forEach(p => p.ready = false);
  }

  clearTimers() {
    Object.values(this.timers).forEach(t => clearTimeout(t));
    this.timers = {};
  }
}

const rooms = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // Basic init
  const guestName = `User${Math.floor(Math.random() * 1000)}`;
  socket.emit('init', { name: guestName, id: socket.id });

  socket.on('joinRoom', ({ roomId, name }) => {
    socket.join(roomId);
    
    if (!rooms[roomId]) {
      rooms[roomId] = new GameRoom(roomId);
    }
    
    const room = rooms[roomId];
    const joined = room.addPlayer(socket.id, name || guestName);

    if (joined) {
      // Mock: Initial Holding for Round 1
      const player = room.getPlayer(socket.id);
      player.holding = INITIAL_BET; // Hold initial bet
      
      io.to(roomId).emit('roomUpdate', sanitizeRoom(room));
    } else {
      socket.emit('error', 'Room is full');
    }
  });

  socket.on('toggleReady', (roomId) => {
    const room = rooms[roomId];
    if (!room || room.status !== 'waiting') return;

    // Toggle logic
    const player = room.getPlayer(socket.id);
    if (player) {
      const newReadyState = !player.ready;
      const allReady = room.setReady(socket.id, newReadyState);
      
      io.to(roomId).emit('roomUpdate', sanitizeRoom(room));

      if (allReady) {
        startCountdown(room);
      }
    }
  });

  socket.on('attack', ({ roomId, lines }) => {
    socket.to(roomId).emit('garbage', lines);
  });

  socket.on('chatMessage', ({ roomId, message, name }) => {
    io.to(roomId).emit('chatMessage', { name: name || guestName, message });
  });

  socket.on('gameOver', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || room.status !== 'playing') return;

    // The sender is the LOSER (because they topped out)
    const loser = room.getPlayer(socket.id);
    const winner = room.getOpponent(socket.id);

    if (winner && loser) {
      handleRoundEnd(room, winner, loser);
    }
  });

  // Next Round Proposal Logic
  socket.on('proposeBet', ({ roomId, amount }) => {
    const room = rooms[roomId];
    if (!room || room.status !== 'proposing') return;
    
    // Verify proposer is the winner of the last round (optional strict check)
    // For now, accept from whoever is supposed to propose
    if (amount < 5 || amount > 100) return; // Validation

    room.proposal = {
      proposer: socket.id,
      amount: amount,
      status: 'pending'
    };
    room.status = 'waiting_accept'; // Wait for loser to accept
    
    io.to(roomId).emit('proposalReceived', room.proposal);
    io.to(roomId).emit('roomUpdate', sanitizeRoom(room));

    // 30s timeout for acceptance
    room.timers.proposal = setTimeout(() => {
      // Auto-reject or auto-accept? Spec says "Auto reject"
      handleProposalRejection(room);
    }, 30000);
  });

  socket.on('respondProposal', ({ roomId, accept }) => {
    const room = rooms[roomId];
    if (!room || room.status !== 'waiting_accept') return;

    clearTimeout(room.timers.proposal);

    if (accept) {
      // Logic for next round
      room.currentRound++;
      room.bets.currentBet = room.proposal.amount;
      // Add holding logic here if we had real db
      room.players.forEach(p => p.holding += room.proposal.amount); // Mock additional holding
      
      room.status = 'waiting';
      room.resetReady();
      room.proposal = null;
      
      io.to(roomId).emit('roomUpdate', sanitizeRoom(room));
      io.to(roomId).emit('systemMessage', `Round ${room.currentRound} starting! Bet increased to ${room.bets.currentBet} USDT.`);
    } else {
      handleProposalRejection(room);
    }
  });

  socket.on('disconnect', () => {
    // Handle disconnect logic...
    for (const rid in rooms) {
      const room = rooms[rid];
      if (room.getPlayer(socket.id)) {
        room.removePlayer(socket.id);
        io.to(rid).emit('roomUpdate', sanitizeRoom(room));
        if (room.players.length === 0) delete rooms[rid];
        else {
            // If game was active, forfeit
             io.to(rid).emit('playerDisconnected');
             // Could trigger auto-win for remaining player
        }
      }
    }
  });
});

function startCountdown(room) {
  room.status = 'countdown';
  let count = 5;
  io.to(room.id).emit('startCountdown', count);
  io.to(room.id).emit('roomUpdate', sanitizeRoom(room));

  room.timers.countdown = setInterval(() => {
    count--;
    if (count <= 0) {
      clearInterval(room.timers.countdown);
      startGame(room);
    } else {
      io.to(room.id).emit('countdownUpdate', count);
    }
  }, 1000);
}

function startGame(room) {
  room.status = 'playing';
  io.to(room.id).emit('gameStart');
  io.to(room.id).emit('roomUpdate', sanitizeRoom(room));
}

function handleRoundEnd(room, winner, loser) {
  room.scores[winner.socketId]++;
  room.status = 'round_end';
  
  const roundData = {
    winnerId: winner.socketId,
    loserId: loser.socketId,
    scores: room.scores
  };
  
  room.roundHistory.push(roundData);

  // Check Match Over
  const maxWins = Math.ceil(MAX_ROUNDS / 2); // 2 wins for BO3
  if (room.scores[winner.socketId] >= maxWins) {
    finishMatch(room, winner);
  } else {
    // Prepare next round proposal
    room.status = 'proposing';
    io.to(room.id).emit('roundResult', { ...roundData, isMatchOver: false });
    // Tell winner to propose
    io.to(winner.socketId).emit('askForProposal', { currentBet: room.bets.currentBet });
    io.to(room.id).emit('roomUpdate', sanitizeRoom(room));
    
    // Timeout for proposal (60s)
    room.timers.proposalWait = setTimeout(() => {
       // If winner doesn't propose, maybe auto-keep same bet?
       // For now, auto-forfeit or just default bet
       if (room.status === 'proposing') {
           room.status = 'waiting';
           room.resetReady();
           io.to(room.id).emit('roomUpdate', sanitizeRoom(room));
       }
    }, 60000);
  }
}

function handleProposalRejection(room) {
  // Settle with current state
  room.status = 'finished';
  io.to(room.id).emit('matchFinished', { reason: 'Next round declined' });
  // Logic to payout based on current wins? 
  // Requirement says: "Refuse -> Settle + Room Close"
  // If it was 1-0 and refused, does winner take all?
  // "Refuse -> Settle": Implies current round holds are settled. 
  // In BO3, if 1-1 and refused, maybe split? 
  // For simplicity: Settle current pool to whomever has more wins, or refund if tie?
  // Let's assume standard settlement for now.
}

function finishMatch(room, winner) {
  room.status = 'finished';
  // Calc totals
  const totalPot = room.players.reduce((acc, p) => acc + p.holding, 0);
  io.to(room.id).emit('roundResult', { 
    winnerId: winner.socketId, 
    scores: room.scores, 
    isMatchOver: true 
  });
  
  io.to(room.id).emit('matchResult', {
    winnerId: winner.socketId,
    prize: totalPot,
    finalScores: room.scores
  });
  
  // Cleanup
  setTimeout(() => {
    delete rooms[room.id];
  }, 5000);
}

function sanitizeRoom(room) {
  // Return a safe version of the room object for clients
  return {
    id: room.id,
    players: room.players.map(p => ({
      socketId: p.socketId,
      name: p.name,
      ready: p.ready,
      holding: p.holding,
      wins: room.scores[p.socketId]
    })),
    status: room.status,
    currentRound: room.currentRound,
    bets: room.bets,
    scores: room.scores
  };
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
