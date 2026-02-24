const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
var admin = require("firebase-admin");

// Firebase Admin Initialization
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

// Serve static files
app.use(express.static(__dirname));

// Route for the main game
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Route for chat (redirect to home or serve same file)
app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Socket.io logic
const rooms = {}; // Simple room management

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  
  // Assign a random guest name
  const guestName = `User${Math.floor(Math.random() * 1000)}`;
  socket.emit('init', { name: guestName });

  socket.on('joinRoom', (roomId) => {
    socket.join(roomId);
    if (!rooms[roomId]) rooms[roomId] = { players: [], bets: {} };
    rooms[roomId].players.push(socket.id);
    console.log(`User ${socket.id} joined room ${roomId}`);
  });

  // Chat
  socket.on('chatMessage', (msg) => {
    io.emit('chatMessage', msg);
  });

  // Betting
  socket.on('placeBet', ({ roomId, amount, userId }) => {
    if (rooms[roomId]) {
      rooms[roomId].bets[socket.id] = { amount, userId };
      io.to(roomId).emit('betPlaced', { userId, amount });
    }
  });

  // Multiplayer Attack (Send garbage lines)
  socket.on('attack', (data) => {
    // data should contain roomId and lines
    if (data.roomId) {
      socket.to(data.roomId).emit('garbage', data.lines);
    } else {
      socket.broadcast.emit('garbage', data.lines);
    }
  });

  // Game Over handling for betting
  socket.on('gameOver', ({ roomId, userId }) => {
    if (rooms[roomId]) {
      // The person who emitted gameOver is the LOSER
      const players = rooms[roomId].players;
      const winnerSocketId = players.find(id => id !== socket.id);
      
      if (winnerSocketId) {
        const winnerBet = rooms[roomId].bets[winnerSocketId];
        const loserBet = rooms[roomId].bets[socket.id];
        
        if (winnerBet && loserBet) {
          const totalPot = winnerBet.amount + loserBet.amount;
          const serverFee = Math.floor(totalPot * 0.2);
          const winnerPrize = totalPot - serverFee;
          
          io.to(roomId).emit('matchResult', {
            winnerId: winnerBet.userId,
            loserId: loserBet.userId,
            winnerPrize: winnerPrize,
            serverFee: serverFee
          });
          
          // Reset bets for this room
          rooms[roomId].bets = {};
        }
      }
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Remove from rooms
    for (const roomId in rooms) {
      rooms[roomId].players = rooms[roomId].players.filter(id => id !== socket.id);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
