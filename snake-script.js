// ==================== 游戏常量 ====================
const GRID_SIZE = 25;
const GAME_STATE = {
    MENU: 'menu',
    PLAYING: 'playing',
    PAUSED: 'paused',
    GAME_OVER: 'gameover'
};

const SPEEDS = {
    easy: 200,
    normal: 120,
    hard: 70
};

const FOOD_TYPES = {
    NORMAL: { class: 'food-normal', score: 10, probability: 0.7 },
    SPEED: { class: 'food-speed', score: 20, probability: 0.1 },
    SLOW: { class: 'food-slow', score: 15, probability: 0.1 },
    BONUS: { class: 'food-bonus', score: 50, probability: 0.1 }
};

const DIRECTIONS = {
    UP: { x: 0, y: -1 },
    DOWN: { x: 0, y: 1 },
    LEFT: { x: -1, y: 0 },
    RIGHT: { x: 1, y: 0 }
};

// ==================== 音效管理器 ====================
class SoundManager {
    constructor() {
        this.audioContext = null;
        this.enabled = true;
        this.bgMusicNodes = [];
        this.init();
    }

    init() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('Web Audio API not supported');
            this.enabled = false;
        }
    }

    playSound(frequency, duration, waveType = 'sine', volume = 0.3) {
        if (!this.enabled || !this.audioContext) return;

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        oscillator.frequency.value = frequency;
        oscillator.type = waveType;
        gainNode.gain.value = volume;

        const now = this.audioContext.currentTime;
        oscillator.start(now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + duration);
        oscillator.stop(now + duration);
    }

    playEatSound() {
        this.playSound(440, 0.05, 'sine', 0.2);
    }

    playSpecialSound() {
        this.playSound(880, 0.1, 'triangle', 0.3);
        setTimeout(() => this.playSound(1100, 0.05, 'triangle', 0.2), 50);
    }

    playGameOverSound() {
        if (!this.enabled || !this.audioContext) return;

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        const now = this.audioContext.currentTime;
        oscillator.frequency.setValueAtTime(440, now);
        oscillator.frequency.exponentialRampToValueAtTime(110, now + 0.5);
        oscillator.type = 'sawtooth';
        gainNode.gain.value = 0.3;

        oscillator.start(now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        oscillator.stop(now + 0.5);
    }

    playCollisionSound() {
        this.playSound(220, 0.03, 'square', 0.2);
    }

    startBGMusic() {
        if (!this.enabled || !this.audioContext || this.bgMusicNodes.length > 0) return;

        const notes = [523.25, 587.33, 659.25, 783.99]; // C D E G
        const beatDuration = 0.3;
        const pattern = [0, 2, 1, 3, 0, 2, 1, 2];

        const playNote = (noteIndex, time) => {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            oscillator.frequency.value = notes[pattern[noteIndex % pattern.length]];
            oscillator.type = 'square';
            gainNode.gain.value = 0.05;

            oscillator.start(time);
            gainNode.gain.exponentialRampToValueAtTime(0.01, time + beatDuration * 0.8);
            oscillator.stop(time + beatDuration);

            this.bgMusicNodes.push({ oscillator, gainNode });

            if (this.bgMusicNodes.length > 100) {
                this.bgMusicNodes.shift();
            }
        };

        let noteIndex = 0;
        const scheduleNotes = () => {
            const now = this.audioContext.currentTime;
            for (let i = 0; i < 8; i++) {
                playNote(noteIndex + i, now + i * beatDuration);
            }
            noteIndex += 8;
        };

        scheduleNotes();
        this.bgMusicInterval = setInterval(scheduleNotes, beatDuration * 8 * 1000);
    }

    stopBGMusic() {
        if (this.bgMusicInterval) {
            clearInterval(this.bgMusicInterval);
            this.bgMusicInterval = null;
        }
        this.bgMusicNodes.forEach(({ oscillator, gainNode }) => {
            try {
                oscillator.stop();
            } catch (e) {
                // Already stopped
            }
        });
        this.bgMusicNodes = [];
    }

    toggle() {
        this.enabled = !this.enabled;
        if (!this.enabled) {
            this.stopBGMusic();
        }
        return this.enabled;
    }
}

// ==================== 游戏主类 ====================
class SnakeGame {
    constructor() {
        this.soundManager = new SoundManager();
        this.state = GAME_STATE.MENU;
        this.score = 0;
        this.difficulty = 'normal';
        this.obstacleMode = false;
        this.soundEnabled = true;

        this.snake = [];
        this.direction = DIRECTIONS.RIGHT;
        this.nextDirection = DIRECTIONS.RIGHT;
        this.food = null;
        this.foodType = 'NORMAL';
        this.obstacles = [];
        this.gameLoop = null;

        this.currentEffect = null;
        this.effectTimeout = null;
        this.currentSpeed = SPEEDS.normal;

        this.initDOM();
        this.initEventListeners();
        this.loadSettings();
    }

    // ==================== 初始化 ====================
    initDOM() {
        this.elements = {
            menuScreen: document.getElementById('menuScreen'),
            gameScreen: document.getElementById('gameScreen'),
            pauseOverlay: document.getElementById('pauseOverlay'),
            gameOverOverlay: document.getElementById('gameOverOverlay'),
            leaderboardOverlay: document.getElementById('leaderboardOverlay'),

            gameGrid: document.getElementById('gameGrid'),
            scoreDisplay: document.getElementById('scoreDisplay'),
            difficultyDisplay: document.getElementById('difficultyDisplay'),
            effectDisplay: document.getElementById('effectDisplay'),
            effectText: document.getElementById('effectText'),
            finalScore: document.getElementById('finalScore'),
            newRecordBadge: document.getElementById('newRecordBadge'),
            leaderboardList: document.getElementById('leaderboardList'),
            soundIcon: document.getElementById('soundIcon'),

            difficultyButtons: document.querySelectorAll('.btn-difficulty'),
            obstacleToggle: document.getElementById('obstacleToggle'),
            soundToggle: document.getElementById('soundToggle'),
            soundToggleBtn: document.getElementById('soundToggleBtn'),

            startBtn: document.getElementById('startBtn'),
            leaderboardBtn: document.getElementById('leaderboardBtn'),
            resumeBtn: document.getElementById('resumeBtn'),
            restartBtn: document.getElementById('restartBtn'),
            menuBtn: document.getElementById('menuBtn'),
            playAgainBtn: document.getElementById('playAgainBtn'),
            viewLeaderboardBtn: document.getElementById('viewLeaderboardBtn'),
            backToMenuBtn: document.getElementById('backToMenuBtn'),
            closeLeaderboardBtn: document.getElementById('closeLeaderboardBtn')
        };

        this.createGrid();
    }

    createGrid() {
        this.cells = [];
        this.elements.gameGrid.innerHTML = '';

        for (let y = 0; y < GRID_SIZE; y++) {
            this.cells[y] = [];
            for (let x = 0; x < GRID_SIZE; x++) {
                const cell = document.createElement('div');
                cell.className = 'grid-cell';
                cell.dataset.x = x;
                cell.dataset.y = y;
                this.cells[y][x] = cell;
                this.elements.gameGrid.appendChild(cell);
            }
        }
    }

    initEventListeners() {
        // 难度选择
        this.elements.difficultyButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                this.elements.difficultyButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.difficulty = btn.dataset.difficulty;
            });
        });

        // 复选框
        this.elements.obstacleToggle.addEventListener('change', (e) => {
            this.obstacleMode = e.target.checked;
        });

        this.elements.soundToggle.addEventListener('change', (e) => {
            this.soundEnabled = e.target.checked;
            this.soundManager.enabled = this.soundEnabled;
            if (!this.soundEnabled) {
                this.soundManager.stopBGMusic();
            } else if (this.state === GAME_STATE.PLAYING) {
                this.soundManager.startBGMusic();
            }
        });

        // 音效切换按钮
        this.elements.soundToggleBtn.addEventListener('click', () => {
            this.soundEnabled = this.soundManager.toggle();
            this.elements.soundIcon.textContent = this.soundEnabled ? '🔊' : '🔇';
            this.elements.soundToggle.checked = this.soundEnabled;
        });

        // 按钮事件
        this.elements.startBtn.addEventListener('click', () => this.startGame());
        this.elements.leaderboardBtn.addEventListener('click', () => this.showLeaderboard());
        this.elements.resumeBtn.addEventListener('click', () => this.resumeGame());
        this.elements.restartBtn.addEventListener('click', () => this.restartGame());
        this.elements.menuBtn.addEventListener('click', () => this.returnToMenu());
        this.elements.playAgainBtn.addEventListener('click', () => this.restartGame());
        this.elements.viewLeaderboardBtn.addEventListener('click', () => {
            this.hideOverlay(this.elements.gameOverOverlay);
            this.showLeaderboard();
        });
        this.elements.backToMenuBtn.addEventListener('click', () => {
            this.hideOverlay(this.elements.gameOverOverlay);
            this.returnToMenu();
        });
        this.elements.closeLeaderboardBtn.addEventListener('click', () => {
            this.hideOverlay(this.elements.leaderboardOverlay);
        });

        // 键盘控制
        document.addEventListener('keydown', (e) => this.handleKeyPress(e));
    }

    handleKeyPress(e) {
        if (this.state === GAME_STATE.PLAYING) {
            // 防止方向键滚动页面
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
                e.preventDefault();
            }

            switch (e.key) {
                case 'ArrowUp':
                case 'w':
                case 'W':
                    if (this.direction !== DIRECTIONS.DOWN) {
                        this.nextDirection = DIRECTIONS.UP;
                    }
                    break;
                case 'ArrowDown':
                case 's':
                case 'S':
                    if (this.direction !== DIRECTIONS.UP) {
                        this.nextDirection = DIRECTIONS.DOWN;
                    }
                    break;
                case 'ArrowLeft':
                case 'a':
                case 'A':
                    if (this.direction !== DIRECTIONS.RIGHT) {
                        this.nextDirection = DIRECTIONS.LEFT;
                    }
                    break;
                case 'ArrowRight':
                case 'd':
                case 'D':
                    if (this.direction !== DIRECTIONS.LEFT) {
                        this.nextDirection = DIRECTIONS.RIGHT;
                    }
                    break;
                case ' ':
                    this.pauseGame();
                    break;
                case 'r':
                case 'R':
                    this.restartGame();
                    break;
                case 'Escape':
                    this.pauseGame();
                    break;
            }
        } else if (this.state === GAME_STATE.PAUSED) {
            if (e.key === ' ' || e.key === 'Escape') {
                e.preventDefault();
                this.resumeGame();
            }
        }
    }

    // ==================== 游戏流程 ====================
    startGame() {
        this.saveSettings();
        this.resetGame();
        this.switchScreen(this.elements.menuScreen, this.elements.gameScreen);
        this.state = GAME_STATE.PLAYING;
        this.currentSpeed = SPEEDS[this.difficulty];

        this.updateDisplay();

        if (this.obstacleMode) {
            this.generateObstacles();
        }

        this.generateFood();

        if (this.soundEnabled) {
            this.soundManager.startBGMusic();
        }

        this.gameLoop = setInterval(() => this.update(), this.currentSpeed);
    }

    resetGame() {
        this.score = 0;
        this.snake = [
            { x: 12, y: 12 },
            { x: 11, y: 12 },
            { x: 10, y: 12 }
        ];
        this.direction = DIRECTIONS.RIGHT;
        this.nextDirection = DIRECTIONS.RIGHT;
        this.food = null;
        this.obstacles = [];
        this.currentEffect = null;

        if (this.effectTimeout) {
            clearTimeout(this.effectTimeout);
            this.effectTimeout = null;
        }

        this.clearGrid();
        this.renderSnake();
    }

    update() {
        this.direction = this.nextDirection;

        const head = this.snake[0];
        const newHead = {
            x: head.x + this.direction.x,
            y: head.y + this.direction.y
        };

        // 碰撞检测
        if (this.checkCollision(newHead)) {
            this.gameOver();
            return;
        }

        this.snake.unshift(newHead);

        // 检查是否吃到食物
        if (newHead.x === this.food.x && newHead.y === this.food.y) {
            this.eatFood();
        } else {
            this.snake.pop();
        }

        this.renderSnake();
    }

    checkCollision(pos) {
        // 墙壁碰撞
        if (pos.x < 0 || pos.x >= GRID_SIZE || pos.y < 0 || pos.y >= GRID_SIZE) {
            return true;
        }

        // 自身碰撞
        for (let i = 0; i < this.snake.length; i++) {
            if (this.snake[i].x === pos.x && this.snake[i].y === pos.y) {
                return true;
            }
        }

        // 障碍物碰撞
        for (let obstacle of this.obstacles) {
            if (obstacle.x === pos.x && obstacle.y === pos.y) {
                return true;
            }
        }

        return false;
    }

    eatFood() {
        const foodInfo = FOOD_TYPES[this.foodType];
        this.score += foodInfo.score;
        this.updateDisplay();

        // 播放音效
        if (this.foodType === 'NORMAL') {
            this.soundManager.playEatSound();
        } else {
            this.soundManager.playSpecialSound();
        }

        // 特殊食物效果
        this.applyFoodEffect();

        this.generateFood();
    }

    applyFoodEffect() {
        // 清除之前的效果
        if (this.effectTimeout) {
            clearTimeout(this.effectTimeout);
            this.currentSpeed = SPEEDS[this.difficulty];
            this.restartGameLoop();
        }

        switch (this.foodType) {
            case 'SPEED':
                this.currentEffect = '⚡ 加速';
                this.currentSpeed = Math.floor(SPEEDS[this.difficulty] * 0.7);
                this.restartGameLoop();
                this.showEffect('⚡ 加速', 5000);
                break;
            case 'SLOW':
                this.currentEffect = '🐌 减速';
                this.currentSpeed = Math.floor(SPEEDS[this.difficulty] * 1.4);
                this.restartGameLoop();
                this.showEffect('🐌 减速', 5000);
                break;
            case 'BONUS':
                this.currentEffect = '💰 额外分数';
                this.showEffect('💰 +50分', 2000);
                break;
        }
    }

    showEffect(text, duration) {
        this.elements.effectDisplay.style.display = 'flex';
        this.elements.effectText.textContent = text;

        this.effectTimeout = setTimeout(() => {
            this.elements.effectDisplay.style.display = 'none';
            this.currentEffect = null;
            this.currentSpeed = SPEEDS[this.difficulty];
            this.restartGameLoop();
        }, duration);
    }

    restartGameLoop() {
        if (this.gameLoop) {
            clearInterval(this.gameLoop);
        }
        if (this.state === GAME_STATE.PLAYING) {
            this.gameLoop = setInterval(() => this.update(), this.currentSpeed);
        }
    }

    generateFood() {
        let attempts = 0;
        const maxAttempts = 100;

        while (attempts < maxAttempts) {
            const newFood = {
                x: Math.floor(Math.random() * GRID_SIZE),
                y: Math.floor(Math.random() * GRID_SIZE)
            };

            // 检查位置是否被占用
            let occupied = false;

            for (let segment of this.snake) {
                if (segment.x === newFood.x && segment.y === newFood.y) {
                    occupied = true;
                    break;
                }
            }

            if (!occupied) {
                for (let obstacle of this.obstacles) {
                    if (obstacle.x === newFood.x && obstacle.y === newFood.y) {
                        occupied = true;
                        break;
                    }
                }
            }

            if (!occupied) {
                this.food = newFood;
                this.foodType = this.selectFoodType();
                this.renderFood();
                return;
            }

            attempts++;
        }
    }

    selectFoodType() {
        const rand = Math.random();
        let cumulative = 0;

        for (let type in FOOD_TYPES) {
            cumulative += FOOD_TYPES[type].probability;
            if (rand < cumulative) {
                return type;
            }
        }

        return 'NORMAL';
    }

    generateObstacles() {
        const numObstacles = 12 + Math.floor(Math.random() * 4); // 12-15

        for (let i = 0; i < numObstacles; i++) {
            let attempts = 0;
            const maxAttempts = 50;

            while (attempts < maxAttempts) {
                const obstacle = {
                    x: 1 + Math.floor(Math.random() * (GRID_SIZE - 2)),
                    y: 1 + Math.floor(Math.random() * (GRID_SIZE - 2))
                };

                // 检查是否在蛇的初始区域
                const distToSnake = Math.abs(obstacle.x - 12) + Math.abs(obstacle.y - 12);
                if (distToSnake < 3) {
                    attempts++;
                    continue;
                }

                // 检查是否与其他障碍物重叠
                let overlap = false;
                for (let obs of this.obstacles) {
                    if (obs.x === obstacle.x && obs.y === obstacle.y) {
                        overlap = true;
                        break;
                    }
                }

                if (!overlap) {
                    this.obstacles.push(obstacle);
                    break;
                }

                attempts++;
            }
        }

        this.renderObstacles();
    }

    // ==================== 渲染 ====================
    clearGrid() {
        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                this.cells[y][x].className = 'grid-cell';
            }
        }
    }

    renderSnake() {
        this.clearGrid();

        // 渲染蛇身
        for (let i = 1; i < this.snake.length; i++) {
            const segment = this.snake[i];
            this.cells[segment.y][segment.x].classList.add('snake-body');
        }

        // 渲染蛇头
        const head = this.snake[0];
        this.cells[head.y][head.x].classList.add('snake-head');

        // 重新渲染食物和障碍物
        this.renderFood();
        this.renderObstacles();
    }

    renderFood() {
        if (this.food) {
            const foodClass = FOOD_TYPES[this.foodType].class;
            this.cells[this.food.y][this.food.x].classList.add(foodClass);
        }
    }

    renderObstacles() {
        for (let obstacle of this.obstacles) {
            this.cells[obstacle.y][obstacle.x].classList.add('obstacle');
        }
    }

    updateDisplay() {
        this.elements.scoreDisplay.textContent = this.score;
        const difficultyText = {
            'easy': '简单',
            'normal': '普通',
            'hard': '困难'
        };
        this.elements.difficultyDisplay.textContent = difficultyText[this.difficulty];
    }

    // ==================== 游戏控制 ====================
    pauseGame() {
        if (this.state !== GAME_STATE.PLAYING) return;

        this.state = GAME_STATE.PAUSED;
        clearInterval(this.gameLoop);
        this.soundManager.stopBGMusic();
        this.showOverlay(this.elements.pauseOverlay);
    }

    resumeGame() {
        if (this.state !== GAME_STATE.PAUSED) return;

        this.state = GAME_STATE.PLAYING;
        this.hideOverlay(this.elements.pauseOverlay);

        if (this.soundEnabled) {
            this.soundManager.startBGMusic();
        }

        this.gameLoop = setInterval(() => this.update(), this.currentSpeed);
    }

    restartGame() {
        this.hideOverlay(this.elements.pauseOverlay);
        this.hideOverlay(this.elements.gameOverOverlay);
        clearInterval(this.gameLoop);
        this.soundManager.stopBGMusic();
        this.startGame();
    }

    returnToMenu() {
        clearInterval(this.gameLoop);
        this.soundManager.stopBGMusic();
        this.hideOverlay(this.elements.pauseOverlay);
        this.hideOverlay(this.elements.gameOverOverlay);
        this.switchScreen(this.elements.gameScreen, this.elements.menuScreen);
        this.state = GAME_STATE.MENU;
    }

    gameOver() {
        this.state = GAME_STATE.GAME_OVER;
        clearInterval(this.gameLoop);
        this.soundManager.stopBGMusic();
        this.soundManager.playGameOverSound();

        this.elements.finalScore.textContent = this.score;

        const isNewRecord = this.saveScore();
        if (isNewRecord) {
            this.elements.newRecordBadge.style.display = 'block';
        } else {
            this.elements.newRecordBadge.style.display = 'none';
        }

        this.showOverlay(this.elements.gameOverOverlay);
    }

    // ==================== UI辅助 ====================
    switchScreen(from, to) {
        from.classList.remove('active');
        to.classList.add('active');
    }

    showOverlay(overlay) {
        overlay.classList.add('active');
    }

    hideOverlay(overlay) {
        overlay.classList.remove('active');
    }

    // ==================== 数据存储 ====================
    loadSettings() {
        const settings = localStorage.getItem('snakeSettings');
        if (settings) {
            const data = JSON.parse(settings);
            this.difficulty = data.difficulty || 'normal';
            this.obstacleMode = data.obstacleMode || false;
            this.soundEnabled = data.soundEnabled !== undefined ? data.soundEnabled : true;

            // 应用到UI
            this.elements.difficultyButtons.forEach(btn => {
                if (btn.dataset.difficulty === this.difficulty) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
            this.elements.obstacleToggle.checked = this.obstacleMode;
            this.elements.soundToggle.checked = this.soundEnabled;
            this.soundManager.enabled = this.soundEnabled;
            this.elements.soundIcon.textContent = this.soundEnabled ? '🔊' : '🔇';
        }
    }

    saveSettings() {
        const settings = {
            difficulty: this.difficulty,
            obstacleMode: this.obstacleMode,
            soundEnabled: this.soundEnabled
        };
        localStorage.setItem('snakeSettings', JSON.stringify(settings));
    }

    saveScore() {
        let leaderboard = JSON.parse(localStorage.getItem('snakeLeaderboard')) || [];

        const newEntry = {
            score: this.score,
            difficulty: this.difficulty,
            obstacle: this.obstacleMode,
            date: new Date().toLocaleDateString('zh-CN'),
            timestamp: Date.now()
        };

        leaderboard.push(newEntry);
        leaderboard.sort((a, b) => b.score - a.score);

        const isNewRecord = leaderboard[0].timestamp === newEntry.timestamp;

        leaderboard = leaderboard.slice(0, 10);
        localStorage.setItem('snakeLeaderboard', JSON.stringify(leaderboard));

        return isNewRecord;
    }

    showLeaderboard() {
        const leaderboard = JSON.parse(localStorage.getItem('snakeLeaderboard')) || [];

        if (leaderboard.length === 0) {
            this.elements.leaderboardList.innerHTML = '<p style="color: #888; text-align: center; padding: 40px;">暂无记录</p>';
        } else {
            this.elements.leaderboardList.innerHTML = leaderboard.map((entry, index) => {
                const difficultyText = {
                    'easy': '简单',
                    'normal': '普通',
                    'hard': '困难'
                };

                return `
                    <div class="leaderboard-item">
                        <div class="leaderboard-rank">#${index + 1}</div>
                        <div class="leaderboard-info">
                            <div class="leaderboard-score">${entry.score} 分</div>
                            <div class="leaderboard-details">
                                ${difficultyText[entry.difficulty]}
                                ${entry.obstacle ? '• 障碍模式' : ''}
                                • ${entry.date}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        this.showOverlay(this.elements.leaderboardOverlay);
    }
}

// ==================== 游戏启动 ====================
document.addEventListener('DOMContentLoaded', () => {
    const game = new SnakeGame();
});
