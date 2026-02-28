// --- Firebase Configuration ---
// IMPORTANT: Please replace this with your actual Firebase Project config.
// The user indicated this input "is already there", but we need the keys here for it to work client-side.
// If you are using a hosting provider that auto-injects this, you can comment this out.
const firebaseConfig = {
    apiKey: "YOUR_API_KEY_HERE",
    authDomain: "your-project-id.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project-id.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef"
};

// Initialize Firebase
try {
    if (firebase.apps.length === 0) {
        firebase.initializeApp(firebaseConfig);
    }
} catch (e) {
    console.warn("Firebase Init Warning: Please check firebaseConfig in main.js", e);
}

// --- Application Logic ---
document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    
    // --- State Management ---
    const state = {
        roomId: 'battle_room_1',
        user: {
            id: null,
            name: 'Guest',
            photo: 'https://ui-avatars.com/api/?name=Guest',
            balance: 0,
            isGuest: true
        },
        game: {
            status: 'waiting', // waiting, playing, ended
            currentBet: 10
        }
    };

    // --- DOM Elements ---
    const ui = {
        auth: {
            section: document.getElementById('auth-section'),
            profile: document.getElementById('user-profile'),
            loginBtn: document.getElementById('login-btn'),
            logoutBtn: document.getElementById('logout-btn'),
            avatar: document.getElementById('user-avatar'),
            balance: document.getElementById('user-balance')
        },
        hud: {
            localName: document.getElementById('local-name'),
            localStatus: document.getElementById('local-status'),
            localWins: document.getElementById('local-wins'),
            remoteName: document.getElementById('remote-name'),
            remoteStatus: document.getElementById('remote-status'),
            remoteWins: document.getElementById('remote-wins'),
            timer: document.getElementById('game-timer'),
            pot: document.getElementById('current-pot'),
            round: document.getElementById('round-badge'),
            score: document.getElementById('score-val'),
            lines: document.getElementById('lines-val'),
            combo: document.getElementById('combo-val'),
            atkMeter: document.getElementById('attack-meter'),
            defMeter: document.getElementById('defense-meter'),
            garbageQueue: document.getElementById('garbage-queue')
        },
        overlays: {
            game: document.getElementById('game-overlay'),
            title: document.getElementById('overlay-title'),
            sub: document.getElementById('overlay-subtitle'),
            readyBtn: document.getElementById('ready-btn'),
            countdown: document.getElementById('countdown'),
            backdrop: document.getElementById('modal-backdrop'),
            deposit: document.getElementById('deposit-modal'),
            proposal: document.getElementById('proposal-modal'),
            accept: document.getElementById('accept-modal')
        },
        chat: {
            box: document.getElementById('chat-messages'),
            input: document.getElementById('chat-input'),
            send: document.getElementById('send-btn')
        }
    };

    // --- Authentication (Professional Flow) ---
    const auth = firebase.auth();
    const db = firebase.firestore();

    ui.auth.loginBtn.addEventListener('click', () => {
        const provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).catch(err => {
            console.error("Login Failed:", err);
            addChatMessage('System', `Login failed: ${err.message}`, 'system');
        });
    });

    ui.auth.logoutBtn.addEventListener('click', () => {
        auth.signOut();
    });

    auth.onAuthStateChanged(user => {
        if (user) {
            // User is signed in.
            state.user.id = user.uid;
            state.user.name = user.displayName;
            state.user.photo = user.photoURL;
            state.user.isGuest = false;
            
            // UI Update
            ui.auth.section.classList.add('hidden');
            ui.auth.profile.classList.remove('hidden');
            ui.auth.avatar.src = state.user.photo;
            
            // Load Balance
            loadUserBalance(user.uid);
            
            // Notify Server
            socket.emit('updateProfile', { name: state.user.name, id: state.user.id });
        } else {
            // User is signed out.
            state.user = { id: socket.id, name: `Guest-${socket.id.substr(0,4)}`, isGuest: true };
            ui.auth.section.classList.remove('hidden');
            ui.auth.profile.classList.add('hidden');
        }
    });

    function loadUserBalance(uid) {
        db.collection('users').doc(uid).onSnapshot(doc => {
            if (doc.exists) {
                const data = doc.data();
                state.user.balance = data.usdt || 0;
                ui.auth.balance.innerText = state.user.balance.toLocaleString();
            } else {
                // Create profile
                db.collection('users').doc(uid).set({
                    usdt: 1000, // Free 1k for testing
                    name: state.user.name,
                    email: firebase.auth().currentUser.email
                });
            }
        });
    }

    // --- Game Engine (Professional SRS-Lite) ---
    class TetrisEngine {
        constructor(canvasId, nextId, holdId) {
            this.canvas = document.getElementById(canvasId);
            this.ctx = this.canvas.getContext('2d');
            this.nextCanvas = document.getElementById(nextId);
            this.nextCtx = this.nextCanvas.getContext('2d');
            this.holdCanvas = document.getElementById(holdId);
            this.holdCtx = this.holdCanvas.getContext('2d');

            this.scale = 24; // Block size
            this.cols = 10;
            this.rows = 20;

            this.reset();
            this.loadAssets();
        }

        reset() {
            this.arena = this.createMatrix(this.cols, this.rows);
            this.player = {
                pos: {x: 0, y: 0},
                matrix: null,
                score: 0,
                lines: 0,
                combo: -1,
                b2b: false
            };
            this.queue = [];
            this.hold = null;
            this.canHold = true;
            this.lastTime = 0;
            this.dropCounter = 0;
            this.dropInterval = 1000;
        }

        loadAssets() {
            this.colors = [
                null, 
                '#FF0D72', // T - Magenta
                '#0DC2FF', // I - Cyan
                '#0DFF72', // S - Green
                '#F538FF', // Z - Purple
                '#FF8E0D', // L - Orange
                '#FFE138', // J - Yellow
                '#3877FF', // O - Blue
                '#636e72'  // Garbage
            ];
        }

        createMatrix(w, h) {
            const matrix = [];
            while (h--) matrix.push(new Array(w).fill(0));
            return matrix;
        }

        createPiece(type) {
            if (type === 'I') return [[0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0]];
            if (type === 'L') return [[0, 2, 0], [0, 2, 0], [0, 2, 2]];
            if (type === 'J') return [[0, 3, 0], [0, 3, 0], [3, 3, 0]];
            if (type === 'O') return [[4, 4], [4, 4]];
            if (type === 'Z') return [[5, 5, 0], [0, 5, 5], [0, 0, 0]];
            if (type === 'S') return [[0, 6, 6], [6, 6, 0], [0, 0, 0]];
            if (type === 'T') return [[0, 7, 0], [7, 7, 7], [0, 0, 0]];
        }

        drawMatrix(matrix, offset, ctx, colorOverride = null) {
            matrix.forEach((row, y) => {
                row.forEach((value, x) => {
                    if (value !== 0) {
                        const color = colorOverride || this.colors[value];
                        
                        // Bevel effect
                        ctx.fillStyle = color;
                        ctx.fillRect((x + offset.x) * this.scale, (y + offset.y) * this.scale, this.scale, this.scale);
                        
                        // Inner glow/highlight
                        ctx.fillStyle = 'rgba(255,255,255,0.2)';
                        ctx.fillRect((x + offset.x) * this.scale, (y + offset.y) * this.scale, this.scale, 2);
                        ctx.fillRect((x + offset.x) * this.scale, (y + offset.y) * this.scale, 2, this.scale);

                        ctx.fillStyle = 'rgba(0,0,0,0.2)';
                        ctx.fillRect((x + offset.x) * this.scale + this.scale - 2, (y + offset.y) * this.scale, 2, this.scale);
                        ctx.fillRect((x + offset.x) * this.scale, (y + offset.y) * this.scale + this.scale - 2, this.scale, 2);
                    }
                });
            });
        }

        draw() {
            // Main Board
            this.ctx.fillStyle = '#000';
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            // Grid (optional)
            // this.drawGrid();

            this.drawMatrix(this.arena, {x: 0, y: 0}, this.ctx);

            // Ghost
            if (this.player.matrix) {
                const ghostPos = { ...this.player.pos };
                while (!this.collide(this.arena, { pos: ghostPos, matrix: this.player.matrix })) {
                    ghostPos.y++;
                }
                ghostPos.y--;
                this.drawMatrix(this.player.matrix, ghostPos, this.ctx, 'rgba(255,255,255,0.15)');
                
                // Active Piece
                this.drawMatrix(this.player.matrix, this.player.pos, this.ctx);
            }

            // Next
            this.nextCtx.fillStyle = '#000';
            this.nextCtx.clearRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);
            if (this.queue.length > 0) {
                // Show up to 3 pieces
                for(let i=0; i<Math.min(3, this.queue.length); i++) {
                     this.drawMatrix(this.queue[i], {x: 1, y: 1 + (i*3)}, this.nextCtx);
                }
            }

            // Hold
            this.holdCtx.fillStyle = '#000';
            this.holdCtx.clearRect(0, 0, this.holdCanvas.width, this.holdCanvas.height);
            if (this.hold) {
                this.drawMatrix(this.hold, {x: 1, y: 1}, this.holdCtx);
            }
        }

        collide(arena, player) {
            const [m, o] = [player.matrix, player.pos];
            for (let y = 0; y < m.length; ++y) {
                for (let x = 0; x < m[y].length; ++x) {
                    if (m[y][x] !== 0 && (arena[y + o.y] && arena[y + o.y][x + o.x]) !== 0) {
                        return true;
                    }
                }
            }
            return false;
        }

        merge(arena, player) {
            player.matrix.forEach((row, y) => {
                row.forEach((value, x) => {
                    if (value !== 0) {
                        arena[y + player.pos.y][x + player.pos.x] = value;
                    }
                });
            });
        }

        rotate(matrix, dir) {
            for (let y = 0; y < matrix.length; ++y) {
                for (let x = 0; x < y; ++x) {
                    [matrix[x][y], matrix[y][x]] = [matrix[y][x], matrix[x][y]];
                }
            }
            if (dir > 0) matrix.forEach(row => row.reverse());
            else matrix.reverse();
        }

        // Logic wrappers
        playerMove(dir) {
            this.player.pos.x += dir;
            if (this.collide(this.arena, this.player)) {
                this.player.pos.x -= dir;
            }
        }

        playerRotate(dir) {
            const pos = this.player.pos.x;
            let offset = 1;
            this.rotate(this.player.matrix, dir);
            // Basic wall kick (horizontal only for now)
            while (this.collide(this.arena, this.player)) {
                this.player.pos.x += offset;
                offset = -(offset + (offset > 0 ? 1 : -1));
                if (offset > this.player.matrix[0].length) {
                    this.rotate(this.player.matrix, -dir);
                    this.player.pos.x = pos;
                    return;
                }
            }
        }

        playerDrop() {
            this.player.pos.y++;
            if (this.collide(this.arena, this.player)) {
                this.player.pos.y--;
                this.merge(this.arena, this.player);
                this.sweep();
                this.resetPiece();
            }
            this.dropCounter = 0;
        }

        playerHardDrop() {
            while (!this.collide(this.arena, this.player)) {
                this.player.pos.y++;
            }
            this.player.pos.y--;
            this.merge(this.arena, this.player);
            this.sweep();
            this.resetPiece();
            this.dropCounter = 0;
            
            // Hard drop effect
            createParticles(
                (this.player.pos.x + 1) * 24, 
                (this.player.pos.y + 2) * 24, 
                10, 
                '#ffffff'
            );
        }

        playerHold() {
            if (!this.canHold) return;
            
            if (this.hold === null) {
                this.hold = this.player.matrix;
                this.resetPiece(true); // Draw from queue
            } else {
                const temp = this.player.matrix;
                this.player.matrix = this.hold;
                this.hold = temp;
                this.player.pos.y = 0;
                this.player.pos.x = (this.arena[0].length / 2 | 0) - (this.player.matrix[0].length / 2 | 0);
            }
            this.canHold = false;
        }

        resetPiece(fromHold = false) {
            if (!fromHold) {
                if (this.queue.length === 0) this.fillQueue();
                this.player.matrix = this.queue.shift();
                this.fillQueue();
            }
            
            this.player.pos.y = 0;
            this.player.pos.x = (this.arena[0].length / 2 | 0) - (this.player.matrix[0].length / 2 | 0);
            
            // Game Over Check
            if (this.collide(this.arena, this.player)) {
                this.arena.forEach(row => row.fill(0));
                socket.emit('gameOver', { roomId: state.roomId });
            }
            this.canHold = true;
        }

        fillQueue() {
            const pieces = 'ILJOTSZ';
            while (this.queue.length < 5) {
                const type = pieces[pieces.length * Math.random() | 0];
                this.queue.push(this.createPiece(type));
            }
        }

        sweep() {
            let rowCount = 0;
            outer: for (let y = this.arena.length - 1; y > 0; --y) {
                for (let x = 0; x < this.arena[y].length; ++x) {
                    if (this.arena[y][x] === 0) continue outer;
                }
                const row = this.arena.splice(y, 1)[0].fill(0);
                this.arena.unshift(row);
                ++y;
                rowCount++;
            }

            if (rowCount > 0) {
                // Scoring
                const lineScores = [0, 100, 300, 500, 800];
                this.player.score += lineScores[rowCount] * (this.player.combo + 1 > 0 ? this.player.combo + 2 : 1);
                this.player.lines += rowCount;
                this.player.combo++;
                
                // Attack Logic
                let attack = 0;
                if (rowCount === 2) attack = 1;
                if (rowCount === 3) attack = 2;
                if (rowCount === 4) attack = 4;
                
                // Combo bonus (simplified)
                if (this.player.combo > 1) attack += 1;

                if (attack > 0) {
                    socket.emit('attack', { roomId: state.roomId, lines: attack });
                    showEffect(`ATTACK +${attack}`, 'danger');
                    ui.hud.atkMeter.style.height = `${Math.min(100, attack * 20)}%`;
                    setTimeout(() => ui.hud.atkMeter.style.height = '0%', 500);
                }
                
                // Visual Text
                const texts = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'];
                showEffect(texts[rowCount], 'success');

                ui.hud.score.innerText = this.player.score;
                ui.hud.lines.innerText = this.player.lines;
                ui.hud.combo.innerText = this.player.combo;
            } else {
                this.player.combo = -1;
            }
        }

        addGarbage(lines) {
            for (let i = 0; i < lines; i++) {
                this.arena.shift();
                const row = new Array(10).fill(8); // 8 is garbage color
                row[Math.floor(Math.random() * 10)] = 0;
                this.arena.push(row);
            }
            showEffect('DEFENSE!', 'warning');
            document.querySelector('.main-board').classList.add('shake');
            setTimeout(() => document.querySelector('.main-board').classList.remove('shake'), 300);
        }

        update(time = 0) {
            if (state.game.status !== 'playing') return;
            const deltaTime = time - this.lastTime;
            this.lastTime = time;

            this.dropCounter += deltaTime;
            if (this.dropCounter > this.dropInterval) {
                this.playerDrop();
            }

            this.draw();
            requestAnimationFrame(this.update.bind(this));
        }

        start() {
            this.reset();
            this.fillQueue();
            this.resetPiece();
            this.update();
        }
    }

    // --- Init Game ---
    const game = new TetrisEngine('tetris-canvas', 'next-canvas', 'hold-canvas');

    // --- Network Events ---
    socket.on('init', (data) => {
        if (state.user.isGuest) {
            state.user.id = data.id;
        }
        socket.emit('joinRoom', { roomId: state.roomId, name: state.user.name });
    });

    socket.on('roomUpdate', (room) => {
        // Find self and opponent
        const me = room.players.find(p => p.socketId === socket.id);
        const opp = room.players.find(p => p.socketId !== socket.id);

        if (me) {
            ui.hud.localName.innerText = me.name;
            ui.hud.localWins.innerText = me.wins;
            updateStatusBadge(ui.hud.localStatus, me.ready);
            
            // Show Ready Button if not ready and waiting
            if (room.status === 'waiting' && !me.ready) {
                ui.overlays.game.classList.add('active');
                ui.overlays.readyBtn.classList.remove('hidden');
                ui.overlays.countdown.classList.add('hidden');
            } else if (me.ready && room.status === 'waiting') {
                ui.overlays.title.innerText = "WAITING FOR OPPONENT";
                ui.overlays.readyBtn.classList.add('hidden');
            }
        }

        if (opp) {
            ui.hud.remoteName.innerText = opp.name;
            ui.hud.remoteWins.innerText = opp.wins;
            updateStatusBadge(ui.hud.remoteStatus, opp.ready);
        } else {
            ui.hud.remoteName.innerText = "Searching...";
            ui.hud.remoteStatus.innerText = "...";
            ui.hud.remoteStatus.className = 'status-badge';
        }

        ui.hud.round.innerText = `ROUND ${room.currentRound}`;
        ui.hud.pot.innerText = room.bets.totalPot + (room.bets.currentBet * 2);
    });

    socket.on('startCountdown', (count) => {
        ui.overlays.title.innerText = "GET READY";
        ui.overlays.readyBtn.classList.add('hidden');
        ui.overlays.countdown.classList.remove('hidden');
        ui.overlays.countdown.innerText = count;
    });

    socket.on('countdownUpdate', (c) => ui.overlays.countdown.innerText = c);

    socket.on('gameStart', () => {
        state.game.status = 'playing';
        ui.overlays.game.classList.remove('active');
        game.start();
    });

    socket.on('garbage', (lines) => {
        game.addGarbage(lines);
    });

    socket.on('chatMessage', (data) => addChatMessage(data.name, data.message, 'user'));
    
    // Win/Loss Handling
    socket.on('roundResult', (data) => {
        state.game.status = 'ended';
        ui.overlays.game.classList.add('active');
        
        const isWin = data.winnerId === socket.id;
        ui.overlays.title.innerText = isWin ? "YOU WIN!" : "YOU LOSE";
        ui.overlays.sub.innerText = "Waiting for next steps...";
        ui.overlays.readyBtn.classList.add('hidden');
    });

    socket.on('askForProposal', () => {
        showModal(ui.overlays.proposal);
    });

    socket.on('proposalReceived', (prop) => {
        if (prop.proposer !== socket.id) {
            document.getElementById('prop-amt').innerText = prop.amount;
            showModal(ui.overlays.accept);
        }
    });

    socket.on('matchFinished', (data) => {
        addChatMessage('System', `Match Over: ${data.reason}`, 'system');
        setTimeout(() => location.reload(), 3000);
    });

    // --- Input Handling ---
    document.addEventListener('keydown', e => {
        if (state.game.status !== 'playing') return;
        
        switch(e.keyCode) {
            case 37: game.playerMove(-1); break; // Left
            case 39: game.playerMove(1); break; // Right
            case 40: game.playerDrop(); break; // Down
            case 38: game.playerRotate(1); break; // Up
            case 32: game.playerHardDrop(); break; // Space
            case 90: game.playerHold(); break; // Z
        }
    });

    // --- UI Helpers ---
    function updateStatusBadge(el, isReady) {
        el.innerText = isReady ? "READY" : "WAITING";
        if (isReady) el.classList.add('ready');
        else el.classList.remove('ready');
    }

    function addChatMessage(name, msg, type) {
        const div = document.createElement('div');
        div.className = `msg ${type}`;
        div.innerHTML = type === 'system' ? msg : `<strong>${name}:</strong> ${msg}`;
        ui.chat.box.appendChild(div);
        ui.chat.box.scrollTop = ui.chat.box.scrollHeight;
    }

    function showEffect(text, type) {
        const div = document.createElement('div');
        div.className = 'fx-text';
        div.style.color = type === 'danger' ? '#ff7675' : '#55efc4';
        div.innerText = text;
        div.style.left = '50%'; 
        div.style.top = '50%';
        document.getElementById('fx-container').appendChild(div);
        setTimeout(() => div.remove(), 1000);
    }

    function createParticles(x, y, count, color) {
        // Simple particle system placeholder
        // In a real pro app, this would use a canvas overlay for performance
    }

    function showModal(modal) {
        ui.overlays.backdrop.classList.add('active');
        modal.classList.add('active');
    }

    function closeModal() {
        ui.overlays.backdrop.classList.remove('active');
        document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
    }

    // --- Button Bindings ---
    ui.overlays.readyBtn.addEventListener('click', () => socket.emit('toggleReady', state.roomId));
    
    ui.chat.send.addEventListener('click', () => {
        const msg = ui.chat.input.value;
        if (msg) {
            socket.emit('chatMessage', { roomId: state.roomId, message: msg, name: state.user.name });
            ui.chat.input.value = '';
        }
    });

    ui.chat.input.addEventListener('keydown', e => {
        if (e.key === 'Enter') ui.chat.send.click();
    });

    document.querySelectorAll('.close-modal').forEach(b => b.addEventListener('click', closeModal));
    
    // Deposit/Withdraw
    document.getElementById('deposit-btn').addEventListener('click', () => showModal(ui.overlays.deposit));

    // Bet Proposal
    document.querySelectorAll('.bet-opt').forEach(btn => {
        btn.addEventListener('click', () => {
            socket.emit('proposeBet', { roomId: state.roomId, amount: parseInt(btn.dataset.amt) });
            closeModal();
        });
    });

    document.getElementById('submit-proposal').addEventListener('click', () => {
        const val = document.getElementById('custom-bet').value;
        if (val) {
            socket.emit('proposeBet', { roomId: state.roomId, amount: parseInt(val) });
            closeModal();
        }
    });

    document.getElementById('accept-btn').addEventListener('click', () => {
        socket.emit('respondProposal', { roomId: state.roomId, accept: true });
        closeModal();
    });

    document.getElementById('reject-btn').addEventListener('click', () => {
        socket.emit('respondProposal', { roomId: state.roomId, accept: false });
        closeModal();
    });
});
