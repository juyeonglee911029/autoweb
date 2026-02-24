document.addEventListener('DOMContentLoaded', () => {
    // --- Socket.io Setup ---
    const socket = io();
    let myName = 'Guest';

    const connectionStatus = document.getElementById('connection-status');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const chatMessages = document.getElementById('chat-messages');

    socket.on('init', (data) => {
        myName = data.name;
        addSystemMessage(`채팅방에 ${myName}님으로 접속되었습니다.`);
    });

    socket.on('chatMessage', (msg) => {
        addMessage(msg.user, msg.text, msg.user === myName);
    });

    socket.on('garbage', (lines) => {
        addGarbage(lines);
        addSystemMessage(`공격받음! ${lines}줄 추가됨!`);
    });

    // Chat Functions
    function addMessage(user, text, isMe) {
        const div = document.createElement('div');
        div.className = 'message';
        if (isMe) div.style.background = '#e6e6fa'; // Light purple for me
        div.innerHTML = `<span class="user">${user}:</span> ${text}`;
        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function addSystemMessage(text) {
        const div = document.createElement('div');
        div.className = 'message system';
        div.innerText = text;
        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function sendMessage() {
        const text = chatInput.value.trim();
        if (text) {
            socket.emit('chatMessage', { user: myName, text });
            chatInput.value = '';
        }
    }

    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });


    // --- Tetris Game Logic ---
    const canvas = document.getElementById('tetris-canvas');
    const context = canvas.getContext('2d');
    const nextCanvas = document.getElementById('next-canvas');
    const nextContext = nextCanvas.getContext('2d');
    const holdCanvas = document.getElementById('hold-canvas');
    const holdContext = holdCanvas.getContext('2d');

    const scoreElement = document.getElementById('score');
    const levelElement = document.getElementById('level');
    const linesElement = document.getElementById('lines');
    const finalScoreElement = document.getElementById('final-score');
    
    const startOverlay = document.getElementById('start-overlay');
    const gameOverlay = document.getElementById('game-overlay');
    const startBtn = document.getElementById('start-btn');
    const restartBtn = document.getElementById('restart-btn');

    // Scale
    const BLOCK_SIZE = 30;
    const NEXT_BLOCK_SIZE = 25;
    context.scale(BLOCK_SIZE, BLOCK_SIZE);
    nextContext.scale(NEXT_BLOCK_SIZE, NEXT_BLOCK_SIZE);
    holdContext.scale(NEXT_BLOCK_SIZE, NEXT_BLOCK_SIZE);

    // Pieces
    const SHAPES = 'ILJOTSZ';
    const COLORS = [
        null,
        '#FF0D72', // T
        '#0DC2FF', // O
        '#0DFF72', // L
        '#F538FF', // J
        '#FF8E0D', // I
        '#FFE138', // S
        '#3877FF', // Z
        '#636e72', // Garbage (Gray)
    ];

    function createPiece(type) {
        if (type === 'I') return [[0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0]];
        if (type === 'L') return [[0, 2, 0], [0, 2, 0], [0, 2, 2]];
        if (type === 'J') return [[0, 3, 0], [0, 3, 0], [3, 3, 0]];
        if (type === 'O') return [[4, 4], [4, 4]];
        if (type === 'Z') return [[5, 5, 0], [0, 5, 5], [0, 0, 0]];
        if (type === 'S') return [[0, 6, 6], [6, 6, 0], [0, 0, 0]];
        if (type === 'T') return [[0, 7, 0], [7, 7, 7], [0, 0, 0]];
    }

    function createMatrix(w, h) {
        const matrix = [];
        while (h--) matrix.push(new Array(w).fill(0));
        return matrix;
    }

    // Game State
    const arena = createMatrix(10, 20);
    const player = {
        pos: {x: 0, y: 0},
        matrix: null,
        score: 0,
        level: 1,
        lines: 0,
    };

    let dropCounter = 0;
    let dropInterval = 1000;
    let lastTime = 0;
    let isGameOver = false;
    let isPaused = true;
    let requestID = null;

    // Advanced Features
    let nextQueue = [];
    let holdPiece = null;
    let canHold = true; // Can only hold once per turn

    // --- Core Logic ---

    function draw() {
        // Clear Backgrounds
        context.fillStyle = '#2d3436';
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        nextContext.fillStyle = '#2d3436';
        nextContext.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
        
        holdContext.fillStyle = '#2d3436';
        holdContext.fillRect(0, 0, holdCanvas.width, holdCanvas.height);

        drawMatrix(arena, {x: 0, y: 0}, context);
        
        // Ghost Piece
        if (!isPaused && !isGameOver) {
            const ghostPos = { ...player.pos };
            while (!collide(arena, { pos: ghostPos, matrix: player.matrix })) {
                ghostPos.y++;
            }
            ghostPos.y--; // Back up one step
            
            drawMatrix(player.matrix, ghostPos, context, true); // true for ghost
            drawMatrix(player.matrix, player.pos, context);
        }

        // Draw Next
        if (nextQueue.length > 0) {
            const nextM = nextQueue[0];
            // Center in 4x4 grid (approx)
            const offsetX = (4 - nextM[0].length) / 2;
            const offsetY = (4 - nextM.length) / 2;
            drawMatrix(nextM, {x: offsetX, y: offsetY}, nextContext);
        }

        // Draw Hold
        if (holdPiece) {
            const offsetX = (4 - holdPiece[0].length) / 2;
            const offsetY = (4 - holdPiece.length) / 2;
            drawMatrix(holdPiece, {x: offsetX, y: offsetY}, holdContext);
        }
    }

    function drawMatrix(matrix, offset, ctx, isGhost = false) {
        matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    if (isGhost) {
                        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
                        ctx.fillRect(x + offset.x, y + offset.y, 1, 1);
                        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                        ctx.lineWidth = 0.05;
                        ctx.strokeRect(x + offset.x, y + offset.y, 1, 1);
                    } else {
                        // Main Block
                        ctx.fillStyle = COLORS[value];
                        ctx.fillRect(x + offset.x, y + offset.y, 1, 1);
                        
                        // Bevel effect (simple)
                        ctx.lineWidth = 0.05;
                        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
                        ctx.strokeRect(x + offset.x, y + offset.y, 1, 1);
                        
                        // Shine
                        ctx.fillStyle = 'rgba(255,255,255,0.3)';
                        ctx.fillRect(x + offset.x + 0.1, y + offset.y + 0.1, 0.2, 0.2);
                    }
                }
            });
        });
    }

    function merge(arena, player) {
        player.matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    arena[y + player.pos.y][x + player.pos.x] = value;
                }
            });
        });
    }

    function collide(arena, player) {
        const [m, o] = [player.matrix, player.pos];
        for (let y = 0; y < m.length; ++y) {
            for (let x = 0; x < m[y].length; ++x) {
                if (m[y][x] !== 0 && 
                   (arena[y + o.y] && arena[y + o.y][x + o.x]) !== 0) {
                    return true;
                }
            }
        }
        return false;
    }

    function arenaSweep() {
        let rowCount = 0;
        outer: for (let y = arena.length - 1; y > 0; --y) {
            for (let x = 0; x < arena[y].length; ++x) {
                if (arena[y][x] === 0) {
                    continue outer;
                }
            }
            
            // Row is full
            const row = arena.splice(y, 1)[0].fill(0);
            arena.unshift(row);
            ++y;
            rowCount++;
        }

        if (rowCount > 0) {
            // Scoring
            // 1: 100, 2: 300, 3: 500, 4: 800 (Tetris)
            const lineScores = [0, 100, 300, 500, 800];
            player.score += lineScores[rowCount] * player.level;
            player.lines += rowCount;
            
            // Level Up every 10 lines
            player.level = Math.floor(player.lines / 10) + 1;
            
            // Speed Up
            // Formula: (0.8 - ((Level - 1) * 0.007)) ^ (Level - 1) * 1000 ... simplified:
            // Just subtract 50ms per level, min 100ms
            dropInterval = Math.max(100, 1000 - (player.level - 1) * 100);

            // Multiplayer Attack
            if (rowCount === 4) {
                socket.emit('attack', 4); // Send 4 lines of garbage
                addSystemMessage("테트리스! 공격을 보냈습니다!");
            }

            updateStats();
        }
    }

    function playerReset() {
        if (nextQueue.length === 0) {
            // Init queue
            fillQueue();
        }
        
        player.matrix = nextQueue.shift();
        fillQueue(); // Keep queue full
        
        player.pos.y = 0;
        player.pos.x = (arena[0].length / 2 | 0) - (player.matrix[0].length / 2 | 0);
        
        canHold = true; // Reset hold capability for new turn

        if (collide(arena, player)) {
            gameOver();
        }
    }

    function fillQueue() {
        while (nextQueue.length < 3) {
            nextQueue.push(createPiece(SHAPES[SHAPES.length * Math.random() | 0]));
        }
    }

    function playerDrop() {
        player.pos.y++;
        if (collide(arena, player)) {
            player.pos.y--;
            merge(arena, player);
            arenaSweep();
            playerReset();
        }
        dropCounter = 0;
    }

    function playerMove(dir) {
        player.pos.x += dir;
        if (collide(arena, player)) {
            player.pos.x -= dir;
        }
    }

    function playerRotate(dir) {
        const pos = player.pos.x;
        let offset = 1;
        rotate(player.matrix, dir);
        while (collide(arena, player)) {
            player.pos.x += offset;
            offset = -(offset + (offset > 0 ? 1 : -1));
            if (offset > player.matrix[0].length) {
                rotate(player.matrix, -dir);
                player.pos.x = pos;
                return;
            }
        }
    }

    function rotate(matrix, dir) {
        for (let y = 0; y < matrix.length; ++y) {
            for (let x = 0; x < y; ++x) {
                [matrix[x][y], matrix[y][x]] = [matrix[y][x], matrix[x][y]];
            }
        }
        if (dir > 0) matrix.forEach(row => row.reverse());
        else matrix.reverse();
    }

    function hardDrop() {
        while (!collide(arena, player)) {
            player.pos.y++;
        }
        player.pos.y--; // Back up into valid spot
        merge(arena, player);
        arenaSweep();
        playerReset();
        dropCounter = 0;
    }

    function hold() {
        if (!canHold) return;

        if (holdPiece === null) {
            holdPiece = player.matrix;
            playerReset(); // Get next piece
        } else {
            const temp = player.matrix;
            player.matrix = holdPiece;
            holdPiece = temp;
            
            // Reset position
            player.pos.y = 0;
            player.pos.x = (arena[0].length / 2 | 0) - (player.matrix[0].length / 2 | 0);
        }
        
        canHold = false;
    }

    // Multiplayer: Add Garbage
    function addGarbage(lines) {
        // Remove top 'lines'
        for (let i = 0; i < lines; i++) {
            arena.shift(); 
        }
        // Add bottom 'garbage' lines (random hole)
        for (let i = 0; i < lines; i++) {
            const row = new Array(10).fill(8); // 8 = gray/garbage color? Using 1 for now or special
            // Let's use 1 (Red/T-color) or any existing color for garbage, or add a gray to palette
            // Using 7 (Blue) for now
            const hole = Math.floor(Math.random() * 10);
            row[hole] = 0;
            arena.push(row);
        }
    }

    function update(time = 0) {
        if (isPaused || isGameOver) return;

        const deltaTime = time - lastTime;
        lastTime = time;

        dropCounter += deltaTime;
        if (dropCounter > dropInterval) {
            playerDrop();
        }

        draw();
        requestID = requestAnimationFrame(update);
    }

    function updateStats() {
        scoreElement.innerText = player.score;
        levelElement.innerText = player.level;
        linesElement.innerText = player.lines;
    }

    function gameOver() {
        isGameOver = true;
        cancelAnimationFrame(requestID);
        finalScoreElement.innerText = player.score;
        gameOverlay.classList.add('active');
        addSystemMessage("게임 오버! 다시 도전하세요.");
    }

    function resetGame() {
        arena.forEach(row => row.fill(0));
        player.score = 0;
        player.lines = 0;
        player.level = 1;
        dropInterval = 1000;
        nextQueue = [];
        holdPiece = null;
        updateStats();
        playerReset();
        isGameOver = false;
        isPaused = false;
        
        startOverlay.classList.remove('active');
        gameOverlay.classList.remove('active');
        
        update();
    }

    // Controls
    document.addEventListener('keydown', event => {
        // Chat focus check
        if (document.activeElement === chatInput) return;

        if (isPaused && !startOverlay.classList.contains('active')) return;

        // Prevent scrolling for game keys
        if ([32, 37, 38, 39, 40].includes(event.keyCode)) {
            event.preventDefault();
        }

        if (event.keyCode === 37) { // Left
            playerMove(-1);
        } else if (event.keyCode === 39) { // Right
            playerMove(1);
        } else if (event.keyCode === 40) { // Down
            playerDrop();
        } else if (event.keyCode === 38) { // Up (Rotate)
            playerRotate(1);
        } else if (event.keyCode === 32) { // Space (Hard Drop)
            hardDrop();
        } else if (event.key.toLowerCase() === 'z') { // Z (Hold)
            hold();
        }
    });

    // Buttons
    startBtn.addEventListener('click', resetGame);
    restartBtn.addEventListener('click', resetGame);

    // Modal
    const modal = document.getElementById('modal');
    const privacyLink = document.getElementById('privacy-link');
    const closeBtn = document.querySelector('.close-modal');

    privacyLink.addEventListener('click', (e) => {
        e.preventDefault();
        modal.style.display = 'block';
    });

    closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    window.onclick = (event) => {
        if (event.target == modal) {
            modal.style.display = 'none';
        }
    };
});
