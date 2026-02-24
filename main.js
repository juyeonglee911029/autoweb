document.addEventListener('DOMContentLoaded', () => {
    
    // --- Layout & Navigation ---
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    const mainWrapper = document.querySelector('.main-wrapper');
    const navItems = document.querySelectorAll('.nav-item');
    const viewSections = document.querySelectorAll('.view-section');
    
    const chatToggle = document.getElementById('chat-toggle');
    const closeChat = document.getElementById('close-chat');
    const chatSidebar = document.getElementById('chat-sidebar');

    const supportModal = document.getElementById('support-modal');
    const openSupport = document.getElementById('open-support');
    const closeModals = document.querySelectorAll('.close-modal');

    // Sidebar Toggle
    let isSidebarOpen = window.innerWidth > 1024;
    function toggleSidebar() {
        if (isSidebarOpen) {
            sidebar.style.transform = 'translateX(-100%)';
            if (window.innerWidth > 1024) mainWrapper.style.marginLeft = '0';
        } else {
            sidebar.style.transform = 'translateX(0)';
            if (window.innerWidth > 1024) mainWrapper.style.marginLeft = 'var(--sidebar-width)';
        }
        isSidebarOpen = !isSidebarOpen;
    }
    sidebarToggle.addEventListener('click', toggleSidebar);

    // View Navigation
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            const target = item.getAttribute('data-target') || (item.id === 'nav-tetris' ? 'tetris' : null);
            if (!target) return;
            e.preventDefault();

            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            viewSections.forEach(v => v.classList.remove('active'));
            document.getElementById(`${target}-view`).classList.add('active');
        });
    });

    // Special trigger for Tetris card
    document.querySelectorAll('.tetris-trigger').forEach(trigger => {
        trigger.addEventListener('click', () => {
            document.getElementById('nav-tetris').click();
        });
    });

    // Chat Toggle
    chatToggle.addEventListener('click', () => chatSidebar.classList.toggle('active'));
    closeChat.addEventListener('click', () => chatSidebar.classList.remove('active'));

    // Modal Handling
    openSupport.addEventListener('click', (e) => {
        e.preventDefault();
        supportModal.classList.add('active');
    });
    closeModals.forEach(btn => btn.addEventListener('click', () => {
        supportModal.classList.remove('active');
    }));

    // --- Chat Simulation ---
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');

    function addMessage(user, text, isSystem = false) {
        const msgDiv = document.createElement('div');
        msgDiv.className = isSystem ? 'message system' : 'message';
        if (isSystem) {
            msgDiv.textContent = text;
        } else {
            msgDiv.innerHTML = `<span class="user">${user}:</span> ${text}`;
        }
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    sendBtn.addEventListener('click', () => {
        if (chatInput.value.trim()) {
            addMessage('나(You)', chatInput.value);
            chatInput.value = '';
        }
    });

    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendBtn.click();
    });

    // Simulated Random Messages
    const randomUsers = ['LuckyKing', 'StakeMaster', 'CryptoZero', 'DiamondHand'];
    const randomTexts = ['Tetris 배틀 하실 분?', '오늘 수익 대박이네요!', 'Mines 5개 난이도 실화?', 'Stake 오리지널이 혜자네'];
    
    setInterval(() => {
        if (Math.random() > 0.8) {
            const user = randomUsers[Math.floor(Math.random() * randomUsers.length)];
            const text = randomTexts[Math.floor(Math.random() * randomTexts.length)];
            addMessage(user, text);
        }
    }, 5000);

    // --- Tetris Game Logic ---
    const canvas = document.getElementById('tetris');
    const context = canvas.getContext('2d');
    const nextCanvas = document.getElementById('next');
    const nextContext = nextCanvas.getContext('2d');
    const scoreElement = document.getElementById('score');
    const startBtn = document.getElementById('start-btn');
    const gameOverlay = document.getElementById('game-overlay');

    context.scale(20, 20);
    nextContext.scale(20, 20);

    function createPiece(type) {
        if (type === 'I') return [[0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0]];
        if (type === 'L') return [[0, 2, 0], [0, 2, 0], [0, 2, 2]];
        if (type === 'J') return [[0, 3, 0], [0, 3, 0], [3, 3, 0]];
        if (type === 'O') return [[4, 4], [4, 4]];
        if (type === 'Z') return [[5, 5, 0], [0, 5, 5], [0, 0, 0]];
        if (type === 'S') return [[0, 6, 6], [6, 6, 0], [0, 0, 0]];
        if (type === 'T') return [[0, 7, 0], [7, 7, 7], [0, 0, 0]];
    }

    const colors = [null, '#FF0D72', '#0DC2FF', '#0DFF72', '#F538FF', '#FF8E0D', '#FFE138', '#3877FF'];

    function createMatrix(w, h) {
        const matrix = [];
        while (h--) matrix.push(new Array(w).fill(0));
        return matrix;
    }

    function draw() {
        context.fillStyle = '#000';
        context.fillRect(0, 0, canvas.width, canvas.height);
        drawMatrix(arena, {x: 0, y: 0});
        drawMatrix(player.matrix, player.pos);
    }

    function drawMatrix(matrix, offset) {
        matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    context.fillStyle = colors[value];
                    context.fillRect(x + offset.x, y + offset.y, 1, 1);
                }
            });
        });
    }

    function merge(arena, player) {
        player.matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) arena[y + player.pos.y][x + player.pos.x] = value;
            });
        });
    }

    function collide(arena, player) {
        const [m, o] = [player.matrix, player.pos];
        for (let y = 0; y < m.length; ++y) {
            for (let x = 0; x < m[y].length; ++x) {
                if (m[y][x] !== 0 && (arena[y + o.y] && arena[y + o.y][x + o.x]) !== 0) return true;
            }
        }
        return false;
    }

    function arenaSweep() {
        let rowCount = 1;
        outer: for (let y = arena.length - 1; y > 0; --y) {
            for (let x = 0; x < arena[y].length; ++x) {
                if (arena[y][x] === 0) continue outer;
            }
            const row = arena.splice(y, 1)[0].fill(0);
            arena.unshift(row);
            ++y;
            player.score += rowCount * 10;
            rowCount *= 2;
        }
        updateScore();
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

    function playerDrop() {
        player.pos.y++;
        if (collide(arena, player)) {
            player.pos.y--;
            merge(arena, player);
            playerReset();
            arenaSweep();
            updateScore();
        }
        dropCounter = 0;
    }

    function playerMove(dir) {
        player.pos.x += dir;
        if (collide(arena, player)) player.pos.x -= dir;
    }

    function playerReset() {
        const pieces = 'ILJOTSZ';
        player.matrix = createPiece(pieces[pieces.length * Math.random() | 0]);
        player.pos.y = 0;
        player.pos.x = (arena[0].length / 2 | 0) - (player.matrix[0].length / 2 | 0);
        if (collide(arena, player)) {
            arena.forEach(row => row.fill(0));
            player.score = 0;
            updateScore();
            gameOverlay.classList.remove('hidden');
            cancelAnimationFrame(gameRequestId);
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

    let dropCounter = 0;
    let dropInterval = 1000;
    let lastTime = 0;
    let gameRequestId;

    function update(time = 0) {
        const deltaTime = time - lastTime;
        lastTime = time;
        dropCounter += deltaTime;
        if (dropCounter > dropInterval) playerDrop();
        draw();
        gameRequestId = requestAnimationFrame(update);
    }

    function updateScore() {
        scoreElement.innerText = player.score;
    }

    const arena = createMatrix(12, 20);
    const player = {
        pos: {x: 0, y: 0},
        matrix: null,
        score: 0,
    };

    document.addEventListener('keydown', event => {
        if (document.getElementById('tetris-view').classList.contains('active')) {
            if (event.keyCode === 37) playerMove(-1);
            else if (event.keyCode === 39) playerMove(1);
            else if (event.keyCode === 40) playerDrop();
            else if (event.keyCode === 38) playerRotate(1);
        }
    });

    startBtn.addEventListener('click', () => {
        gameOverlay.classList.add('hidden');
        playerReset();
        updateScore();
        update();
    });

});
