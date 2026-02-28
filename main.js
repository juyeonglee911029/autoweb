document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const socket = io();
    
    // UI Elements
    const screens = {
        login: document.getElementById('login-btn'),
        deposit: document.getElementById('deposit-btn'),
        withdraw: document.getElementById('withdraw-btn'),
        readyBtn: document.getElementById('ready-btn'),
        startOverlay: document.getElementById('start-overlay'),
        gameOverlay: document.getElementById('game-overlay'),
        countdown: document.getElementById('countdown-display'),
        proposalModal: document.getElementById('proposal-modal'),
        acceptModal: document.getElementById('accept-modal'),
        effects: document.getElementById('effects-container'),
        depositModal: document.getElementById('deposit-modal'),
        withdrawModal: document.getElementById('withdraw-modal')
    };

    const hud = {
        localName: document.getElementById('local-name'),
        remoteName: document.getElementById('remote-name'),
        localWins: document.getElementById('local-wins'),
        remoteWins: document.getElementById('remote-wins'),
        localReady: document.getElementById('local-ready-badge'),
        remoteReady: document.getElementById('remote-ready-badge'),
        round: document.getElementById('round-display'),
        pot: document.getElementById('current-pot'),
        timer: document.getElementById('game-timer'),
        score: document.getElementById('score'),
        lines: document.getElementById('lines'),
        level: document.getElementById('level'),
        atkBar: document.getElementById('attack-bar'),
        defBar: document.getElementById('defense-bar'),
        garbageQueue: document.getElementById('garbage-queue'),
        userCoins: document.getElementById('user-coins')
    };

    const chat = {
        messages: document.getElementById('chat-messages'),
        input: document.getElementById('chat-input'),
        sendBtn: document.getElementById('send-btn')
    };

    // --- Game State ---
    let roomId = 'battle_room_1'; // Default test room
    let myId = null;
    let myName = 'Guest';
    let gameState = 'waiting'; // waiting, playing, ended

    // --- Tetris Logic Class ---
    class TetrisGame {
        constructor(canvas, nextCanvas, holdCanvas) {
            this.canvas = canvas;
            this.ctx = canvas.getContext('2d');
            this.nextCtx = nextCanvas.getContext('2d');
            this.holdCtx = holdCanvas.getContext('2d');
            
            this.resize();
            
            // Game Properties
            this.arena = this.createMatrix(10, 20);
            this.player = {
                pos: {x: 0, y: 0},
                matrix: null,
                score: 0,
                combo: -1,
                b2b: false
            };
            
            this.nextQueue = [];
            this.holdPiece = null;
            this.canHold = true;
            this.dropCounter = 0;
            this.dropInterval = 1000;
            this.lastTime = 0;
            
            this.garbageQueue = []; // Incoming garbage lines
            this.lastMoveRotate = false; // For T-Spin detection

            this.colors = [
                null, '#FF0D72', '#0DC2FF', '#0DFF72', '#F538FF', '#FF8E0D', '#FFE138', '#3877FF', '#636e72'
            ];
            
            this.fillQueue();
            this.playerReset();
        }

        resize() {
            this.ctx.scale(24, 24); // 240/10 = 24px per block
            this.nextCtx.scale(20, 20);
            this.holdCtx.scale(20, 20);
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
                        ctx.fillStyle = colorOverride || this.colors[value];
                        ctx.fillRect(x + offset.x, y + offset.y, 1, 1);
                        ctx.lineWidth = 0.05;
                        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
                        ctx.strokeRect(x + offset.x, y + offset.y, 1, 1);
                    }
                });
            });
        }

        draw() {
            // Clear
            this.ctx.fillStyle = '#000';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.nextCtx.fillStyle = '#000';
            this.nextCtx.fillRect(0, 0, 100, 100);
            this.holdCtx.fillStyle = '#000';
            this.holdCtx.fillRect(0, 0, 100, 100);

            // Draw Arena
            this.drawMatrix(this.arena, {x: 0, y: 0}, this.ctx);

            // Draw Ghost
            const ghostPos = { ...this.player.pos };
            while (!this.collide(this.arena, { pos: ghostPos, matrix: this.player.matrix })) {
                ghostPos.y++;
            }
            ghostPos.y--;
            this.drawMatrix(this.player.matrix, ghostPos, this.ctx, 'rgba(255,255,255,0.1)');

            // Draw Player
            this.drawMatrix(this.player.matrix, this.player.pos, this.ctx);

            // Draw Next
            if (this.nextQueue[0]) {
                this.drawMatrix(this.nextQueue[0], {x: 1, y: 1}, this.nextCtx);
            }

            // Draw Hold
            if (this.holdPiece) {
                this.drawMatrix(this.holdPiece, {x: 1, y: 1}, this.holdCtx);
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

        playerRotate(dir) {
            const pos = this.player.pos.x;
            let offset = 1;
            this.rotate(this.player.matrix, dir);
            while (this.collide(this.arena, this.player)) {
                this.player.pos.x += offset;
                offset = -(offset + (offset > 0 ? 1 : -1));
                if (offset > this.player.matrix[0].length) {
                    this.rotate(this.player.matrix, -dir);
                    this.player.pos.x = pos;
                    return;
                }
            }
            this.lastMoveRotate = true;
        }

        playerMove(dir) {
            this.player.pos.x += dir;
            if (this.collide(this.arena, this.player)) {
                this.player.pos.x -= dir;
            }
            this.lastMoveRotate = false;
        }

        playerDrop() {
            this.player.pos.y++;
            if (this.collide(this.arena, this.player)) {
                this.player.pos.y--;
                this.merge(this.arena, this.player);
                this.arenaSweep();
                this.playerReset();
            }
            this.dropCounter = 0;
            this.lastMoveRotate = false;
        }

        playerHardDrop() {
            while (!this.collide(this.arena, this.player)) {
                this.player.pos.y++;
            }
            this.player.pos.y--;
            this.merge(this.arena, this.player);
            this.arenaSweep();
            this.playerReset();
            this.dropCounter = 0;
            this.lastMoveRotate = false;
        }

        playerReset() {
            // Check Garbage Queue
            if (this.garbageQueue.length > 0) {
                const lines = this.garbageQueue.shift();
                this.addGarbage(lines);
                updateGarbageUI(this.garbageQueue);
            }

            if (this.nextQueue.length < 3) this.fillQueue();
            this.player.matrix = this.nextQueue.shift();
            this.fillQueue();
            
            this.player.pos.y = 0;
            this.player.pos.x = (this.arena[0].length / 2 | 0) - (this.player.matrix[0].length / 2 | 0);
            this.canHold = true;
            
            if (this.collide(this.arena, this.player)) {
                // Game Over
                socket.emit('gameOver', { roomId });
                gameState = 'ended';
            }
        }

        fillQueue() {
            const pieces = 'ILJOTSZ';
            while (this.nextQueue.length < 3) {
                this.nextQueue.push(this.createPiece(pieces[pieces.length * Math.random() | 0]));
            }
        }

        playerHold() {
            if (!this.canHold) return;
            if (this.holdPiece === null) {
                this.holdPiece = this.player.matrix;
                this.playerReset();
            } else {
                [this.player.matrix, this.holdPiece] = [this.holdPiece, this.player.matrix];
                this.player.pos.y = 0;
                this.player.pos.x = (this.arena[0].length / 2 | 0) - (this.player.matrix[0].length / 2 | 0);
            }
            this.canHold = false;
        }

        // --- Attack & Scoring Logic ---
        arenaSweep() {
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

            // Calculation
            if (rowCount > 0) {
                this.player.combo++;
                let damage = 0;
                let text = '';

                // Base Damage
                if (rowCount === 1) damage = 0; // Single
                else if (rowCount === 2) { damage = 1; text = 'DOUBLE'; }
                else if (rowCount === 3) { damage = 2; text = 'TRIPLE'; }
                else if (rowCount === 4) { damage = 4; text = 'TETRIS'; }

                // Back-to-Back
                if (rowCount === 4) {
                    if (this.player.b2b) {
                        damage += 1;
                        text = 'B2B TETRIS';
                        showEffect('BACK-TO-BACK!', 'fire');
                    }
                    this.player.b2b = true;
                } else {
                    this.player.b2b = false;
                }

                // Combo
                if (this.player.combo > 0) {
                    damage += Math.min(4, Math.floor(this.player.combo / 2)); // Simplified
                    text += ` ${this.player.combo} COMBO`;
                }

                if (damage > 0) {
                    socket.emit('attack', { roomId, lines: damage });
                    showEffect(`${text} (+${damage})`, damage >= 4 ? 'shock' : 'normal');
                    updateAttackBar(damage);
                }

                this.player.score += rowCount * 100;
                hud.score.innerText = this.player.score;
                hud.lines.innerText = parseInt(hud.lines.innerText) + rowCount;
            } else {
                this.player.combo = -1;
            }
        }

        addGarbage(lines) {
            for (let i = 0; i < lines; i++) {
                this.arena.shift();
                const row = new Array(10).fill(8);
                row[Math.floor(Math.random() * 10)] = 0;
                this.arena.push(row);
            }
            showEffect('DEFENSE!', 'shield');
        }

        update(time = 0) {
            if (gameState !== 'playing') return;
            const deltaTime = time - this.lastTime;
            this.lastTime = time;
            this.dropCounter += deltaTime;
            if (this.dropCounter > this.dropInterval) {
                this.playerDrop();
            }
            this.draw();
            this.animationId = requestAnimationFrame(this.update.bind(this));
        }

        stop() {
            if (this.animationId) cancelAnimationFrame(this.animationId);
        }
    }

    // --- Init ---
    const game = new TetrisGame(
        document.getElementById('tetris-canvas'),
        document.getElementById('next-canvas'),
        document.getElementById('hold-canvas')
    );

    // --- Chat Functions ---
    function addChatMessage(name, message, type = 'user') {
        const div = document.createElement('div');
        div.className = `message ${type}`;
        if (type === 'user') {
            div.innerHTML = `<strong>${name}:</strong> ${message}`;
        } else {
            div.innerText = message;
        }
        chat.messages.appendChild(div);
        chat.messages.scrollTop = chat.messages.scrollHeight;
    }

    chat.sendBtn.addEventListener('click', () => {
        const msg = chat.input.value.trim();
        if (msg) {
            socket.emit('chatMessage', { roomId, message: msg, name: myName });
            chat.input.value = '';
        }
    });

    chat.input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') chat.sendBtn.click();
    });

    // --- Dark Mode Toggle ---
    const themeBtn = document.getElementById('dark-mode-toggle');
    themeBtn.addEventListener('click', () => {
        const html = document.documentElement;
        if (html.getAttribute('data-theme') === 'dark') {
            html.setAttribute('data-theme', 'light');
            themeBtn.innerText = '☀️';
        } else {
            html.setAttribute('data-theme', 'dark');
            themeBtn.innerText = '🌙';
        }
    });

    // --- Modal Management ---
    function openModal(modal) {
        modal.classList.add('active');
    }

    function closeModal(modal) {
        modal.classList.remove('active');
    }

    screens.deposit.addEventListener('click', () => openModal(screens.depositModal));
    screens.withdraw.addEventListener('click', () => openModal(screens.withdrawModal));

    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', (e) => {
            closeModal(e.target.closest('.modal'));
        });
    });

    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            closeModal(e.target);
        }
    });

    // --- Socket Events ---
    socket.on('init', (data) => {
        myId = data.id;
        myName = data.name;
        document.getElementById('display-name').innerText = myName;
        socket.emit('joinRoom', { roomId, name: myName });
    });

    socket.on('chatMessage', (data) => {
        addChatMessage(data.name, data.message);
    });

    socket.on('systemMessage', (msg) => {
        addChatMessage(null, msg, 'system');
    });

    socket.on('roomUpdate', (room) => {
        // Update Players
        const me = room.players.find(p => p.socketId === myId);
        const opp = room.players.find(p => p.socketId !== myId);

        if (me) {
            hud.localName.innerText = me.name;
            hud.localWins.innerText = me.wins;
            hud.localReady.className = `badge ${me.ready ? 'ready' : ''}`;
            hud.localReady.innerText = me.ready ? 'READY' : 'WAITING';
            hud.userCoins.innerText = me.holding; // Mock update
            if (me.ready) screens.readyBtn.classList.add('active');
            else screens.readyBtn.classList.remove('active');
        }

        if (opp) {
            hud.remoteName.innerText = opp.name;
            hud.remoteWins.innerText = opp.wins;
            hud.remoteReady.className = `badge ${opp.ready ? 'ready' : ''}`;
            hud.remoteReady.innerText = opp.ready ? 'READY' : 'WAITING';
        } else {
            hud.remoteName.innerText = 'Waiting...';
            hud.remoteReady.innerText = '...';
            hud.remoteReady.className = 'badge';
        }

        // Update Round Info
        hud.round.innerText = `ROUND ${room.currentRound}`;
        hud.pot.innerText = room.bets.totalPot + (room.bets.currentBet * 2);

        // Status Handling
        if (room.status === 'waiting') {
            gameState = 'waiting';
            screens.startOverlay.classList.add('active');
            screens.countdown.classList.add('hidden');
            screens.readyBtn.style.display = 'block';
            screens.gameOverlay.classList.remove('active');
        }
    });

    socket.on('startCountdown', (count) => {
        screens.readyBtn.style.display = 'none';
        screens.countdown.classList.remove('hidden');
        screens.countdown.innerText = count;
    });

    socket.on('countdownUpdate', (count) => {
        screens.countdown.innerText = count;
    });

    socket.on('gameStart', () => {
        gameState = 'playing';
        screens.startOverlay.classList.remove('active');
        game.arena.forEach(row => row.fill(0));
        game.player.score = 0;
        game.playerReset();
        game.stop(); // Ensure no double loop
        game.update();
    });

    socket.on('garbage', (lines) => {
        game.garbageQueue.push(lines);
        updateGarbageUI(game.garbageQueue);
        document.body.classList.add('shake');
        setTimeout(() => document.body.classList.remove('shake'), 300);
    });

    socket.on('roundResult', (data) => {
        gameState = 'ended';
        game.stop();
        screens.gameOverlay.classList.add('active');
        const isMeWinner = data.winnerId === myId;
        
        document.getElementById('overlay-title').innerText = isMeWinner ? 'YOU WIN!' : 'YOU LOSE';
        document.getElementById('round-result-details').innerHTML = `
            <div class="winner-announcement">
                <div class="winner-crown">${isMeWinner ? '👑' : '💀'}</div>
            </div>
            ${data.isMatchOver ? '<h3 style="color:gold">MATCH WINNER!</h3>' : 'Waiting for next round...'}
        `;
    });

    socket.on('askForProposal', (data) => {
        screens.proposalModal.classList.add('active');
    });

    socket.on('proposalReceived', (proposal) => {
        if (proposal.proposer !== myId) {
            document.getElementById('proposal-amount-display').innerText = proposal.amount;
            screens.acceptModal.classList.add('active');
        }
    });

    socket.on('matchFinished', (data) => {
        addChatMessage(null, `Match Finished: ${data.reason || 'Settle complete'}`, 'system');
    });

    // --- Inputs ---
    document.addEventListener('keydown', event => {
        if (gameState !== 'playing') return;
        if ([32, 37, 38, 39, 40].includes(event.keyCode)) event.preventDefault();

        if (event.keyCode === 37) game.playerMove(-1);
        else if (event.keyCode === 39) game.playerMove(1);
        else if (event.keyCode === 40) game.playerDrop();
        else if (event.keyCode === 38) game.playerRotate(1);
        else if (event.keyCode === 32) game.playerHardDrop();
        else if (event.key.toLowerCase() === 'z') game.playerHold();
    });

    screens.readyBtn.addEventListener('click', () => {
        socket.emit('toggleReady', roomId);
    });

    // Proposal Logic
    document.querySelectorAll('.bet-opt').forEach(btn => {
        btn.addEventListener('click', () => {
            const amount = parseInt(btn.dataset.amount);
            socket.emit('proposeBet', { roomId, amount });
            screens.proposalModal.classList.remove('active');
        });
    });

    document.getElementById('propose-custom-btn').addEventListener('click', () => {
        const val = document.getElementById('custom-bet-input').value;
        if (val >= 5) {
            socket.emit('proposeBet', { roomId, amount: parseInt(val) });
            screens.proposalModal.classList.remove('active');
        }
    });

    document.getElementById('accept-bet-btn').addEventListener('click', () => {
        socket.emit('respondProposal', { roomId, accept: true });
        screens.acceptModal.classList.remove('active');
    });

    document.getElementById('reject-bet-btn').addEventListener('click', () => {
        socket.emit('respondProposal', { roomId, accept: false });
        screens.acceptModal.classList.remove('active');
    });

    // --- Effects & Helpers ---
    function showEffect(text, type) {
        const div = document.createElement('div');
        div.className = 'effect-text';
        div.innerText = text;
        if (type === 'fire') div.style.color = '#ff7675';
        if (type === 'shock') div.style.color = '#ffeaa7';
        screens.effects.appendChild(div);
        setTimeout(() => div.remove(), 1000);
    }

    function updateAttackBar(val) {
        const h = Math.min(100, val * 10);
        hud.atkBar.style.height = `${h}%`;
        setTimeout(() => hud.atkBar.style.height = '0%', 500);
    }

    function updateGarbageUI(queue) {
        hud.garbageQueue.innerHTML = '';
        const total = queue.reduce((a, b) => a + b, 0);
        for(let i=0; i<Math.min(total, 10); i++) {
            const d = document.createElement('div');
            d.className = 'garbage-block';
            hud.garbageQueue.appendChild(d);
        }
    }
});
