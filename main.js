document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const loginBtn = document.getElementById('login-btn');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const chatMessages = document.getElementById('chat-messages');
    
    const userProfile = document.getElementById('user-profile');
    const displayNameElem = document.getElementById('display-name');
    const userCoinsElem = document.getElementById('user-coins');
    const jackpotAmountElem = document.getElementById('jackpot-amount');
    const betAmountInput = document.getElementById('bet-amount');
    const setBetBtn = document.getElementById('set-bet-btn');
    const depositBtn = document.getElementById('deposit-btn');
    const withdrawBtn = document.getElementById('withdraw-btn');

    const canvas = document.getElementById('tetris-canvas');
    const nextCanvas = document.getElementById('next-canvas');
    const holdCanvas = document.getElementById('hold-canvas');
    
    const scoreElement = document.getElementById('score');
    const levelElement = document.getElementById('level');
    const linesElement = document.getElementById('lines');
    const finalScoreElement = document.getElementById('final-score');
    
    const startOverlay = document.getElementById('start-overlay');
    const startOverlayText = document.querySelector('#start-overlay p');
    const gameOverlay = document.getElementById('game-overlay');
    const startBtn = document.getElementById('start-btn');
    const restartBtn = document.getElementById('restart-btn');

    // --- Firebase Configuration ---
    const firebaseConfig = {
        apiKey: "AIzaSyApH0U10lGxtcdtQ7fNSYJ7Iz4F5lRfpPA",
        authDomain: "pupu-tetris.firebaseapp.com",
        databaseURL: "https://pupu-tetris-default-rtdb.firebaseio.com",
        projectId: "pupu-tetris",
        storageBucket: "pupu-tetris.firebasestorage.app",
        messagingSenderId: "357553125670",
        appId: "1:357553125670:web:e4a7ff58c177fe3fe7a9e7",
        measurementId: "G-SPG68G1FLZ"
    };

    // Initialize Firebase
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    const auth = firebase.auth();
    const db = firebase.database();
    const firestore = firebase.firestore();

    // --- Auth & Profile ---
    let myName = 'Guest';
    let currentUser = null;
    let myCoins = 0;
    let currentBet = 0;
    const currentRoomId = 'global-room'; // For now, everyone joins the same room or we could make it dynamic

    loginBtn.addEventListener('click', () => {
        if (currentUser) {
            auth.signOut();
        } else {
            const provider = new firebase.auth.GoogleAuthProvider();
            auth.signInWithPopup(provider).catch(error => {
                console.error("Login failed:", error);
                alert("로그인에 실패했습니다.");
            });
        }
    });

    auth.onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user;
            myName = user.displayName || 'User';
            loginBtn.innerText = '로그아웃';
            displayNameElem.innerText = myName;
            userProfile.style.display = 'block';
            addSystemMessage(`${myName}님 환영합니다!`);
            
            // Sync with Firestore for Coins
            const userRef = firestore.collection('users').doc(user.uid);
            const doc = await userRef.get();
            if (!doc.exists) {
                await userRef.set({
                    displayName: myName,
                    coins: 1000, // Initial coins for new users
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                myCoins = 1000;
            } else {
                myCoins = doc.data().coins || 0;
            }
            userCoinsElem.innerText = myCoins.toLocaleString();

            // Listen for coin updates
            userRef.onSnapshot(snapshot => {
                if (snapshot.exists) {
                    myCoins = snapshot.data().coins || 0;
                    userCoinsElem.innerText = myCoins.toLocaleString();
                }
            });

            startOverlayText.innerText = "준비 되셨나요?";
            startBtn.disabled = false;
            startBtn.style.opacity = "1";
        } else {
            currentUser = null;
            myName = 'Guest' + Math.floor(Math.random() * 1000);
            loginBtn.innerText = '로그인';
            userProfile.style.display = 'none';
            addSystemMessage(`로그인이 필요합니다.`);
            startOverlayText.innerText = "게임을 하시려면 로그인이 필요합니다.";
            startBtn.disabled = true;
            startBtn.style.opacity = "0.5";
        }
    });

    // Betting UI Events
    setBetBtn.addEventListener('click', () => {
        const amount = parseInt(betAmountInput.value);
        if (isNaN(amount) || amount < 0) {
            alert("올바른 금액을 입력하세요.");
            return;
        }
        if (amount > myCoins) {
            alert("보유 코인이 부족합니다.");
            return;
        }
        currentBet = amount;
        socket.emit('placeBet', { roomId: currentRoomId, amount: currentBet, userId: currentUser.uid });
        addSystemMessage(`내기 금액이 ${currentBet}코인으로 설정되었습니다.`);
    });

    depositBtn.addEventListener('click', () => {
        // Placeholder for deposit logic
        alert("입금 기능은 준비 중입니다. (테스트용으로 1000코인 지급)");
        if (currentUser) {
            firestore.collection('users').doc(currentUser.uid).update({
                coins: firebase.firestore.FieldValue.increment(1000)
            });
        }
    });

    withdrawBtn.addEventListener('click', () => {
        alert("출금 기능은 준비 중입니다.");
    });

    // --- Socket.io ---
    const socket = io();
    socket.emit('joinRoom', currentRoomId);

    socket.on('garbage', (lines) => {
        addGarbage(lines);
        addSystemMessage(`공격받음! ${lines}줄 추가됨!`);
    });

    socket.on('betPlaced', ({ userId, amount }) => {
        if (userId !== currentUser?.uid) {
            addSystemMessage(`상대방이 ${amount}코인을 걸었습니다.`);
        }
    });

    socket.on('matchResult', async ({ winnerId, loserId, winnerPrize, serverFee }) => {
        if (currentUser && currentUser.uid === winnerId) {
            addSystemMessage(`승리! ${winnerPrize}코인을 획득했습니다! (수수료 ${serverFee} 차감)`);
            await firestore.collection('users').doc(currentUser.uid).update({
                coins: firebase.firestore.FieldValue.increment(winnerPrize)
            });
            // Update server total (optional)
            firestore.collection('system').doc('stats').set({
                serverTotal: firebase.firestore.FieldValue.increment(serverFee)
            }, { merge: true });
        } else if (currentUser && currentUser.uid === loserId) {
            addSystemMessage(`패배... ${currentBet}코인을 잃었습니다.`);
            await firestore.collection('users').doc(currentUser.uid).update({
                coins: firebase.firestore.FieldValue.increment(-currentBet)
            });
        }
    });

    // --- Firebase RTDB Chat ---
    const chatRef = db.ref('messages').limitToLast(50);
    chatRef.on('child_added', (snapshot) => {
        const msg = snapshot.val();
        addMessage(msg.user, msg.text, msg.user === myName);
    });

    function sendMessage() {
        const text = chatInput.value.trim();
        if (text) {
            db.ref('messages').push({
                user: myName,
                text: text,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            });
            chatInput.value = '';
        }
    }

    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    function addMessage(user, text, isMe) {
        const div = document.createElement('div');
        div.className = 'message';
        if (isMe) div.style.background = '#e6e6fa'; 
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


    // --- Tetris Game Logic ---
    const context = canvas.getContext('2d');
    const nextContext = nextCanvas.getContext('2d');
    const holdContext = holdCanvas.getContext('2d');

    const BLOCK_SIZE = 40; 
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
    let arena = createMatrix(10, 20);
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

    let nextQueue = [];
    let holdPiece = null;
    let canHold = true; 

    // --- Core Logic ---

    function draw() {
        context.fillStyle = '#2d3436';
        context.fillRect(0, 0, canvas.width / BLOCK_SIZE, canvas.height / BLOCK_SIZE);
        
        nextContext.fillStyle = '#2d3436';
        nextContext.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
        
        holdContext.fillStyle = '#2d3436';
        holdContext.fillRect(0, 0, holdCanvas.width, holdCanvas.height);

        drawMatrix(arena, {x: 0, y: 0}, context);
        
        if (!isPaused && !isGameOver) {
            const ghostPos = { ...player.pos };
            while (!collide(arena, { pos: ghostPos, matrix: player.matrix })) {
                ghostPos.y++;
            }
            ghostPos.y--; 
            
            drawMatrix(player.matrix, ghostPos, context, true); 
            drawMatrix(player.matrix, player.pos, context);
        }

        if (nextQueue.length > 0) {
            const nextM = nextQueue[0];
            const offsetX = (4 - nextM[0].length) / 2;
            const offsetY = (4 - nextM.length) / 2;
            drawMatrix(nextM, {x: offsetX, y: offsetY}, nextContext);
        }

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
                        ctx.fillStyle = COLORS[value];
                        ctx.fillRect(x + offset.x, y + offset.y, 1, 1);
                        ctx.lineWidth = 0.05;
                        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
                        ctx.strokeRect(x + offset.x, y + offset.y, 1, 1);
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
                if (arena[y][x] === 0) continue outer;
            }
            const row = arena.splice(y, 1)[0].fill(0);
            arena.unshift(row);
            ++y;
            rowCount++;
        }

        if (rowCount > 0) {
            const lineScores = [0, 100, 300, 500, 800];
            player.score += lineScores[rowCount] * player.level;
            player.lines += rowCount;
            player.level = Math.floor(player.lines / 10) + 1;
            dropInterval = Math.max(100, 1000 - (player.level - 1) * 100);

            if (rowCount === 4) {
                socket.emit('attack', { roomId: currentRoomId, lines: 4 }); 
                addSystemMessage("테트리스! 공격을 보냈습니다!");
            }
            updateStats();
        }
    }

    function playerReset() {
        if (nextQueue.length === 0) fillQueue();
        player.matrix = nextQueue.shift();
        fillQueue(); 
        player.pos.y = 0;
        player.pos.x = (arena[0].length / 2 | 0) - (player.matrix[0].length / 2 | 0);
        canHold = true; 
        if (collide(arena, player)) gameOver();
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
        if (collide(arena, player)) player.pos.x -= dir;
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
        while (!collide(arena, player)) player.pos.y++;
        player.pos.y--; 
        merge(arena, player);
        arenaSweep();
        playerReset();
        dropCounter = 0;
    }

    function hold() {
        if (!canHold) return;
        if (holdPiece === null) {
            holdPiece = player.matrix;
            playerReset(); 
        } else {
            const temp = player.matrix;
            player.matrix = holdPiece;
            holdPiece = temp;
            player.pos.y = 0;
            player.pos.x = (arena[0].length / 2 | 0) - (player.matrix[0].length / 2 | 0);
        }
        canHold = false;
    }

    function addGarbage(lines) {
        for (let i = 0; i < lines; i++) arena.shift(); 
        for (let i = 0; i < lines; i++) {
            const row = new Array(10).fill(8); 
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
        if (dropCounter > dropInterval) playerDrop();
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
        addSystemMessage("게임 오버!");
        
        // Notify server for betting
        if (currentUser) {
            socket.emit('gameOver', { roomId: currentRoomId, userId: currentUser.uid });
        }
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
        if (document.activeElement === chatInput) return;
        if (isPaused && !startOverlay.classList.contains('active')) return;
        if ([32, 37, 38, 39, 40].includes(event.keyCode)) event.preventDefault();

        if (event.keyCode === 37) playerMove(-1);
        else if (event.keyCode === 39) playerMove(1);
        else if (event.keyCode === 40) playerDrop();
        else if (event.keyCode === 38) playerRotate(1);
        else if (event.keyCode === 32) hardDrop();
        else if (event.key.toLowerCase() === 'z') hold();
    });

    startBtn.addEventListener('click', resetGame);
    restartBtn.addEventListener('click', resetGame);
});
