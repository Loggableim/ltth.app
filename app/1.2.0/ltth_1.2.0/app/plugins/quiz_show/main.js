const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

class QuizShowPlugin {
    constructor(api) {
        this.api = api;

        // Plugin-specific database for questions, packages, sounds, etc. (not scoped)
        this.db = null;
        
        // Main scoped database for viewer-related data (quiz_leaderboard_entries)
        this.mainDb = null;

        // Constants
        this.QUESTION_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

        // Plugin configuration
        this.config = {
            roundDuration: 30,
            pointsFirstCorrect: 100,
            pointsOtherCorrect: 50,
            showAnswersAfterTime: true,
            multipleWinners: true,
            shuffleAnswers: false,
            randomQuestions: true,
            joker50Enabled: true,
            jokerInfoEnabled: true,
            jokerTimeEnabled: true,
            joker25Enabled: true, // NEW: 25% joker (removes 1 wrong answer)
            jokerTimeBoost: 15,
            jokersPerRound: 3,
            gameMode: 'classic', // classic, fastestFinger, elimination, marathon
            marathonLength: 15,
            ttsEnabled: false,
            ttsVoice: 'default',
            ttsVolume: 80, // NEW: TTS volume (0-100%)
            autoMode: false, // Auto advance to next question
            autoModeDelay: 5, // Seconds to wait before auto-advancing
            answerDisplayDuration: 5, // Seconds to display the correct answer (including info text)
            // Voter Icons Configuration
            voterIconsEnabled: true,
            voterIconSize: 'medium', // small, medium, large
            voterIconMaxVisible: 10, // Max icons to show per answer
            voterIconCompactMode: true, // Enable compact mode for many voters
            voterIconAnimation: 'fade', // fade, slide
            voterIconPosition: 'above', // above, beside, embedded
            voterIconShowOnScoreboard: false, // Show avatars in scoreboard
            // NEW: Leaderboard display configuration
            leaderboardShowAfterRound: true,
            leaderboardRoundDisplayType: 'both', // 'round', 'season', 'both'
            leaderboardEndGameDisplayType: 'season', // 'round', 'season'
            leaderboardAutoHideDelay: 10, // seconds
            leaderboardAnimationStyle: 'fade', // 'fade', 'slide', 'zoom'
            // NEW: Gift-Joker Integration
            giftJokersEnabled: true,
            giftJokerMappings: {}, // { giftId: jokerType } - loaded from database
            giftJokerShowInHUD: true, // Show gift graphics in HUD
            // NEW: Custom Layout
            activeLayoutId: null, // ID of active layout from overlay_layouts table
            customLayoutEnabled: false // Use custom layout vs default
        };

        // Current game state
        this.gameState = {
            isRunning: false,
            currentQuestion: null,
            currentQuestionIndex: -1, // Deprecated: kept for backwards compatibility
            currentQuestionId: null, // ID of the current question being asked
            startTime: null,
            endTime: null,
            timeRemaining: 0,
            answers: new Map(), // userId -> {answer, timestamp, username, profilePictureUrl}
            correctUsers: [],
            roundState: 'idle', // idle, running, ended
            jokersUsed: {
                '25': 0, // NEW: 25% joker
                '50': 0,
                'info': 0,
                'time': 0
            },
            jokerEvents: [],
            hiddenAnswers: [], // For 50:50 and 25% joker
            revealedWrongAnswer: null, // For info joker
            eliminatedUsers: new Set(), // For elimination mode
            marathonProgress: 0, // For marathon mode
            marathonPlayerId: null, // For marathon mode
            // Voter Icons Data - per answer option
            votersPerAnswer: {
                0: [], // Answer A voters: [{userId, username, profilePictureUrl}]
                1: [], // Answer B voters
                2: [], // Answer C voters
                3: [] // Answer D voters
            },
            // Track asked questions in current session to prevent repetition
            askedQuestionIds: new Set() // Set of question IDs asked in current session
        };

        // Timer interval
        this.timerInterval = null;

        // TTS pre-generation cache
        this.ttsCache = {
            nextQuestionId: null,
            audioUrl: null,
            text: null
        };

        // Statistics
        this.stats = {
            totalRounds: 0,
            totalAnswers: 0,
            totalCorrectAnswers: 0
        };
    }

    async init() {
        this.api.log('Quiz Show Plugin initializing...', 'info');

        // Initialize database
        await this.initDatabase();

        // Load saved configuration
        await this.loadConfig();

        // Load gift-joker mappings from database
        this.loadGiftJokerMappings();

        // Register routes
        this.registerRoutes();

        // Register Socket.IO events
        this.registerSocketEvents();

        // Register TikTok event handlers
        this.registerTikTokEvents();

        this.api.log('Quiz Show Plugin initialized successfully', 'info');
    }

    async initDatabase() {
        try {
            // Use ConfigPathManager to get persistent storage path
            const ConfigPathManager = require('../../modules/config-path-manager');
            const configPathManager = new ConfigPathManager();
            
            // Ensure plugin data directory exists
            const pluginDataDir = configPathManager.getPluginDataDir('quiz_show');
            if (!fs.existsSync(pluginDataDir)) {
                fs.mkdirSync(pluginDataDir, { recursive: true });
            }
            
            const dbPath = path.join(pluginDataDir, 'quiz_show.db');
            
            // Migrate old database if exists
            const oldDbPath = path.join(__dirname, 'data', 'quiz_show.db');
            const oldDataDir = path.join(__dirname, 'data');
            
            if (fs.existsSync(oldDataDir) && !fs.existsSync(dbPath)) {
                this.api.log('Migrating quiz show database to user folder...', 'info');
                // Copy only database files to new location for security
                const files = fs.readdirSync(oldDataDir);
                for (const file of files) {
                    // Only migrate database files (.db, .db-shm, .db-wal)
                    if (file.endsWith('.db') || file.endsWith('.db-shm') || file.endsWith('.db-wal')) {
                        const oldFilePath = path.join(oldDataDir, file);
                        const newFilePath = path.join(pluginDataDir, file);
                        if (!fs.existsSync(newFilePath)) {
                            fs.copyFileSync(oldFilePath, newFilePath);
                            this.api.log(`Migrated ${file}`, 'info');
                        }
                    }
                }
                this.api.log('Database migration completed', 'info');
            }

            // Initialize plugin-specific database for questions/packages (not scoped)
            this.db = new Database(dbPath);
            this.db.pragma('journal_mode = WAL');
            
            // Get main scoped database for viewer data (quiz_leaderboard_entries)
            this.mainDb = this.api.getDatabase().db;
            
            // Create plugin-specific tables (questions, packages, etc.)
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS questions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    question TEXT NOT NULL,
                    answers TEXT NOT NULL,
                    correct INTEGER NOT NULL,
                    category TEXT DEFAULT 'Allgemein',
                    difficulty INTEGER DEFAULT 2,
                    info TEXT DEFAULT NULL,
                    package_id INTEGER DEFAULT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (package_id) REFERENCES question_packages(id) ON DELETE SET NULL
                );

                CREATE TABLE IF NOT EXISTS categories (
                    name TEXT PRIMARY KEY NOT NULL
                );

                CREATE TABLE IF NOT EXISTS question_packages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    category TEXT NOT NULL,
                    question_count INTEGER NOT NULL DEFAULT 0,
                    is_selected BOOLEAN DEFAULT FALSE,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS openai_config (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    api_key TEXT DEFAULT NULL,
                    model TEXT DEFAULT 'gpt-5-mini',
                    default_package_size INTEGER DEFAULT 10
                );

                CREATE TABLE IF NOT EXISTS leaderboard_seasons (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    season_name TEXT NOT NULL,
                    start_date DATETIME NOT NULL,
                    end_date DATETIME,
                    is_active BOOLEAN DEFAULT TRUE
                );

                CREATE TABLE IF NOT EXISTS game_sounds (
                    event_name TEXT PRIMARY KEY,
                    file_path TEXT,
                    volume REAL DEFAULT 1.0
                );

                CREATE TABLE IF NOT EXISTS brand_kit (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    logo_path TEXT,
                    primary_color TEXT,
                    secondary_color TEXT
                );

                CREATE TABLE IF NOT EXISTS question_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    question_id INTEGER NOT NULL,
                    asked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS gift_joker_mappings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    gift_id INTEGER NOT NULL UNIQUE,
                    gift_name TEXT NOT NULL,
                    joker_type TEXT NOT NULL CHECK(joker_type IN ('25', '50', 'time', 'info')),
                    enabled BOOLEAN DEFAULT TRUE,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS overlay_layouts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    resolution_width INTEGER NOT NULL,
                    resolution_height INTEGER NOT NULL,
                    orientation TEXT NOT NULL CHECK(orientation IN ('horizontal', 'vertical')),
                    is_default BOOLEAN DEFAULT FALSE,
                    layout_config TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS tts_config (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    volume_global INTEGER DEFAULT 80 CHECK(volume_global >= 0 AND volume_global <= 100),
                    volume_session INTEGER DEFAULT 80 CHECK(volume_session >= 0 AND volume_session <= 100),
                    enabled BOOLEAN DEFAULT TRUE
                );

                CREATE TABLE IF NOT EXISTS leaderboard_display_config (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    show_after_round BOOLEAN DEFAULT TRUE,
                    round_display_type TEXT DEFAULT 'both' CHECK(round_display_type IN ('round', 'season', 'both')),
                    end_game_display_type TEXT DEFAULT 'season' CHECK(end_game_display_type IN ('round', 'season')),
                    auto_hide_delay INTEGER DEFAULT 10,
                    animation_style TEXT DEFAULT 'fade' CHECK(animation_style IN ('fade', 'slide', 'zoom'))
                );

                CREATE INDEX IF NOT EXISTS idx_questions_category ON questions(category);
                CREATE INDEX IF NOT EXISTS idx_questions_difficulty ON questions(difficulty);
                CREATE INDEX IF NOT EXISTS idx_questions_package ON questions(package_id);
                CREATE INDEX IF NOT EXISTS idx_package_category ON question_packages(category);
                CREATE INDEX IF NOT EXISTS idx_question_history_asked_at ON question_history(asked_at);
                CREATE INDEX IF NOT EXISTS idx_question_history_question_id ON question_history(question_id);
                CREATE INDEX IF NOT EXISTS idx_gift_joker_gift_id ON gift_joker_mappings(gift_id);
                CREATE INDEX IF NOT EXISTS idx_overlay_layouts_orientation ON overlay_layouts(orientation);
            `);
            
            // Create quiz_leaderboard_entries in main scoped database (per-streamer)
            this.mainDb.exec(`
                CREATE TABLE IF NOT EXISTS quiz_quiz_leaderboard_entries (
                    season_id INTEGER NOT NULL,
                    user_id TEXT NOT NULL,
                    username TEXT NOT NULL,
                    points INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY (season_id, user_id)
                );
                
                CREATE INDEX IF NOT EXISTS idx_quiz_leaderboard_season ON quiz_quiz_leaderboard_entries(season_id);
                CREATE INDEX IF NOT EXISTS idx_quiz_leaderboard_points ON quiz_quiz_leaderboard_entries(points DESC);
            `);

            // Ensure default season exists
            const activeSeason = this.db.prepare('SELECT id FROM leaderboard_seasons WHERE is_active = 1').get();
            if (!activeSeason) {
                const now = new Date().toISOString();
                const seasonName = `Season ${new Date().getFullYear()}`;
                this.db.prepare('INSERT INTO leaderboard_seasons (season_name, start_date, is_active) VALUES (?, ?, 1)')
                    .run(seasonName, now);
            }

            // Insert default category if none exist
            const categoryCount = this.db.prepare('SELECT COUNT(*) as count FROM categories').get().count;
            if (categoryCount === 0) {
                this.db.prepare('INSERT INTO categories (name) VALUES (?)').run('Allgemein');
            }

            // Initialize brand kit if not exists
            const brandKit = this.db.prepare('SELECT id FROM brand_kit WHERE id = 1').get();
            if (!brandKit) {
                this.db.prepare('INSERT INTO brand_kit (id, logo_path, primary_color, secondary_color) VALUES (1, NULL, ?, ?)')
                    .run('#3b82f6', '#8b5cf6');
            }

            // Initialize OpenAI config if not exists
            const openaiConfig = this.db.prepare('SELECT id FROM openai_config WHERE id = 1').get();
            if (!openaiConfig) {
                this.db.prepare('INSERT INTO openai_config (id, api_key, model, default_package_size) VALUES (1, NULL, ?, ?)')
                    .run('gpt-5-mini', 10);
            }

            // Initialize TTS config if not exists
            const ttsConfig = this.db.prepare('SELECT id FROM tts_config WHERE id = 1').get();
            if (!ttsConfig) {
                this.db.prepare('INSERT INTO tts_config (id, volume_global, volume_session, enabled) VALUES (1, 80, 80, 1)')
                    .run();
            }

            // Initialize leaderboard display config if not exists
            const leaderboardDisplayConfig = this.db.prepare('SELECT id FROM leaderboard_display_config WHERE id = 1').get();
            if (!leaderboardDisplayConfig) {
                this.db.prepare('INSERT INTO leaderboard_display_config (id, show_after_round, round_display_type, end_game_display_type, auto_hide_delay, animation_style) VALUES (1, 1, ?, ?, 10, ?)')
                    .run('both', 'season', 'fade');
            }

            // Initialize default overlay layouts if none exist
            const layoutCount = this.db.prepare('SELECT COUNT(*) as count FROM overlay_layouts').get().count;
            if (layoutCount === 0) {
                // Default horizontal layout (1920x1080)
                const horizontalLayout = {
                    question: { x: 50, y: 100, width: 1820, height: 200 },
                    answers: { x: 50, y: 350, width: 1820, height: 500 },
                    timer: { x: 860, y: 900, width: 200, height: 200 },
                    leaderboard: { x: 1400, y: 100, width: 470, height: 800 },
                    jokerInfo: { x: 50, y: 900, width: 400, height: 150 }
                };
                this.db.prepare('INSERT INTO overlay_layouts (name, resolution_width, resolution_height, orientation, is_default, layout_config) VALUES (?, ?, ?, ?, ?, ?)')
                    .run('Default Horizontal', 1920, 1080, 'horizontal', 1, JSON.stringify(horizontalLayout));

                // Default vertical layout (1080x1920)
                const verticalLayout = {
                    question: { x: 40, y: 100, width: 1000, height: 300 },
                    answers: { x: 40, y: 450, width: 1000, height: 800 },
                    timer: { x: 440, y: 1300, width: 200, height: 200 },
                    leaderboard: { x: 40, y: 1550, width: 1000, height: 320 },
                    jokerInfo: { x: 40, y: 50, width: 400, height: 100 }
                };
                this.db.prepare('INSERT INTO overlay_layouts (name, resolution_width, resolution_height, orientation, is_default, layout_config) VALUES (?, ?, ?, ?, ?, ?)')
                    .run('Default Vertical', 1080, 1920, 'vertical', 1, JSON.stringify(verticalLayout));
            }

            // Clean up question history older than 24 hours
            this.cleanupQuestionHistory();

            // Migrate schema if needed
            await this.migrateSchema();

            // Migrate old data if exists
            await this.migrateOldData();

            const questionCount = this.db.prepare('SELECT COUNT(*) as count FROM questions').get().count;
            this.api.log(`Database initialized with ${questionCount} questions`, 'info');
        } catch (error) {
            this.api.log('Error initializing database: ' + error.message, 'error');
            throw error;
        }
    }

    async migrateSchema() {
        try {
            // Check if info column exists in questions table
            const columns = this.db.pragma('table_info(questions)');
            const hasInfoColumn = columns.some(col => col.name === 'info');
            const hasPackageIdColumn = columns.some(col => col.name === 'package_id');
            
            if (!hasInfoColumn) {
                this.api.log('Adding info column to questions table...', 'info');
                this.db.exec('ALTER TABLE questions ADD COLUMN info TEXT DEFAULT NULL');
                this.api.log('Schema migration completed', 'info');
            }

            if (!hasPackageIdColumn) {
                this.api.log('Adding package_id column to questions table...', 'info');
                this.db.exec('ALTER TABLE questions ADD COLUMN package_id INTEGER DEFAULT NULL');
                this.api.log('Schema migration completed', 'info');
            }

            // Remove temperature column from openai_config if it exists
            const openaiColumns = this.db.pragma('table_info(openai_config)');
            const hasTempColumn = openaiColumns.some(col => col.name === 'temperature');
            
            if (hasTempColumn) {
                this.api.log('Removing temperature column from openai_config (not supported by GPT-5 models)...', 'info');
                
                // SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
                // Use a transaction for atomicity
                try {
                    this.db.exec('BEGIN TRANSACTION');
                    
                    this.db.exec(`
                        CREATE TABLE openai_config_new (
                            id INTEGER PRIMARY KEY CHECK (id = 1),
                            api_key TEXT DEFAULT NULL,
                            model TEXT DEFAULT 'gpt-5-mini',
                            default_package_size INTEGER DEFAULT 10
                        )
                    `);
                    
                    this.db.exec(`
                        INSERT INTO openai_config_new (id, api_key, model, default_package_size)
                        SELECT id, api_key, model, default_package_size FROM openai_config
                    `);
                    
                    this.db.exec('DROP TABLE openai_config');
                    this.db.exec('ALTER TABLE openai_config_new RENAME TO openai_config');
                    
                    this.db.exec('COMMIT');
                    this.api.log('Temperature column removed successfully', 'info');
                } catch (error) {
                    this.db.exec('ROLLBACK');
                    throw error;
                }
            }
        } catch (error) {
            this.api.log('Error during schema migration: ' + error.message, 'warn');
        }
    }

    async migrateOldData() {
        try {
            // Check if old data exists in config
            const savedQuestions = this.api.getConfig('questions');
            const savedLeaderboard = this.api.getConfig('leaderboard');

            if (savedQuestions && Array.isArray(savedQuestions) && savedQuestions.length > 0) {
                this.api.log('Migrating old questions to SQLite...', 'info');
                
                const insert = this.db.prepare('INSERT INTO questions (question, answers, correct, category, difficulty, info) VALUES (?, ?, ?, ?, ?, ?)');
                const insertMany = this.mainDb.transaction((questions) => {
                    for (const q of questions) {
                        insert.run(
                            q.question,
                            JSON.stringify(q.answers),
                            q.correct,
                            q.category || 'Allgemein',
                            q.difficulty || 2,
                            q.info || null
                        );
                    }
                });
                
                insertMany(savedQuestions);
                this.api.log(`Migrated ${savedQuestions.length} questions`, 'info');
            }

            if (savedLeaderboard && typeof savedLeaderboard === 'object') {
                this.api.log('Migrating old leaderboard to SQLite...', 'info');
                
                const activeSeason = this.db.prepare('SELECT id FROM leaderboard_seasons WHERE is_active = 1').get();
                if (activeSeason) {
                    const insert = this.mainDb.prepare('INSERT INTO quiz_leaderboard_entries (season_id, user_id, username, points) VALUES (?, ?, ?, ?)');
                    const insertMany = this.mainDb.transaction((entries) => {
                        for (const [userId, data] of entries) {
                            insert.run(activeSeason.id, userId, data.username, data.points);
                        }
                    });
                    
                    const entries = Object.entries(savedLeaderboard);
                    insertMany(entries);
                    this.api.log(`Migrated ${entries.length} leaderboard entries`, 'info');
                }
            }
        } catch (error) {
            this.api.log('Error during migration: ' + error.message, 'warn');
        }
    }

    cleanupQuestionHistory() {
        try {
            // Delete question history entries older than 24 hours
            const oneDayAgo = new Date(Date.now() - this.QUESTION_COOLDOWN_MS).toISOString();
            const result = this.db.prepare('DELETE FROM question_history WHERE asked_at < ?').run(oneDayAgo);
            
            if (result.changes > 0) {
                this.api.log(`Cleaned up ${result.changes} old question history entries`, 'info');
            }
        } catch (error) {
            this.api.log('Error cleaning up question history: ' + error.message, 'warn');
        }
    }

    getTodaysAskedQuestionIds() {
        try {
            // Get all question IDs asked within the last 24 hours (sliding window)
            const oneDayAgo = new Date(Date.now() - this.QUESTION_COOLDOWN_MS).toISOString();
            const rows = this.db.prepare(
                'SELECT DISTINCT question_id FROM question_history WHERE asked_at >= ?'
            ).all(oneDayAgo);
            
            return new Set(rows.map(row => row.question_id));
        } catch (error) {
            this.api.log('Error getting today\'s asked questions: ' + error.message, 'warn');
            return new Set();
        }
    }

    recordQuestionAsked(questionId) {
        try {
            this.db.prepare('INSERT INTO question_history (question_id, asked_at) VALUES (?, ?)')
                .run(questionId, new Date().toISOString());
        } catch (error) {
            this.api.log('Error recording asked question: ' + error.message, 'warn');
        }
    }

    async loadConfig() {
        try {
            const savedConfig = this.api.getConfig('config');
            if (savedConfig) {
                this.config = { ...this.config, ...savedConfig };
            }

            const savedStats = this.api.getConfig('stats');
            if (savedStats) {
                this.stats = { ...this.stats, ...savedStats };
            }
        } catch (error) {
            this.api.log('Error loading config: ' + error.message, 'error');
        }
    }

    async saveConfig() {
        try {
            await this.api.setConfig('config', this.config);
            await this.api.setConfig('stats', this.stats);
        } catch (error) {
            this.api.log('Error saving config: ' + error.message, 'error');
        }
    }

    loadGiftJokerMappings() {
        try {
            const mappings = this.db.prepare('SELECT * FROM gift_joker_mappings WHERE enabled = 1').all();
            this.config.giftJokerMappings = {};
            
            for (const mapping of mappings) {
                this.config.giftJokerMappings[mapping.gift_id] = mapping.joker_type;
            }
            
            this.api.log(`Loaded ${mappings.length} gift-joker mappings`, 'info');
        } catch (error) {
            this.api.log('Error loading gift-joker mappings: ' + error.message, 'warn');
        }
    }

    registerRoutes() {
        const path = require('path');

        // Serve UI HTML files
        this.api.registerRoute('get', '/quiz-show/ui', (req, res) => {
            res.sendFile(path.join(__dirname, 'quiz_show.html'));
        });

        this.api.registerRoute('get', '/quiz-show/overlay', (req, res) => {
            res.sendFile(path.join(__dirname, 'quiz_show_overlay.html'));
        });

        this.api.registerRoute('get', '/quiz-show/leaderboard-overlay', (req, res) => {
            res.sendFile(path.join(__dirname, 'quiz_show_leaderboard_overlay.html'));
        });

        // Serve static assets
        this.api.registerRoute('get', '/quiz-show/quiz_show.js', (req, res) => {
            res.sendFile(path.join(__dirname, 'quiz_show.js'));
        });

        this.api.registerRoute('get', '/quiz-show/quiz_show.css', (req, res) => {
            res.sendFile(path.join(__dirname, 'quiz_show.css'));
        });

        this.api.registerRoute('get', '/quiz-show/quiz_show_overlay.js', (req, res) => {
            res.sendFile(path.join(__dirname, 'quiz_show_overlay.js'));
        });

        this.api.registerRoute('get', '/quiz-show/quiz_show_overlay.css', (req, res) => {
            res.sendFile(path.join(__dirname, 'quiz_show_overlay.css'));
        });

        // Get current state
        this.api.registerRoute('get', '/api/quiz-show/state', (req, res) => {
            try {
                // Get questions from database
                const questions = this.db.prepare('SELECT * FROM questions ORDER BY created_at DESC').all();
                const formattedQuestions = questions.map(q => ({
                    id: q.id,
                    question: q.question,
                    answers: JSON.parse(q.answers),
                    correct: q.correct,
                    category: q.category,
                    difficulty: q.difficulty,
                    info: q.info,
                    package_id: q.package_id
                }));

                // Get active season leaderboard
                const activeSeason = this.db.prepare('SELECT id FROM leaderboard_seasons WHERE is_active = 1').get();
                let leaderboard = [];
                if (activeSeason) {
                    leaderboard = this.db.prepare(`
                        SELECT user_id as userId, username, points 
                        FROM quiz_leaderboard_entries 
                        WHERE season_id = ? 
                        ORDER BY points DESC
                    `).all(activeSeason.id);
                }

                // Get question packages
                const packages = this.db.prepare(`
                    SELECT id, name, category, question_count, is_selected, created_at 
                    FROM question_packages 
                    ORDER BY created_at DESC
                `).all();

                // Get OpenAI config status
                const openaiConfig = this.db.prepare('SELECT api_key FROM openai_config WHERE id = 1').get();
                const hasOpenAIKey = !!openaiConfig?.api_key;

                res.json({
                    success: true,
                    config: this.config,
                    questions: formattedQuestions,
                    leaderboard,
                    packages,
                    hasOpenAIKey,
                    gameState: {
                        ...this.gameState,
                        answers: Array.from(this.gameState.answers.entries()),
                        eliminatedUsers: Array.from(this.gameState.eliminatedUsers)
                    },
                    stats: this.stats
                });
            } catch (error) {
                this.api.log('Error getting state: ' + error.message, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Update configuration
        this.api.registerRoute('post', '/api/quiz-show/config', async (req, res) => {
            try {
                this.config = { ...this.config, ...req.body };
                await this.saveConfig();

                // Broadcast config update
                this.api.emit('quiz-show:config-updated', this.config);

                res.json({ success: true, config: this.config });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Add question
        this.api.registerRoute('post', '/api/quiz-show/questions', async (req, res) => {
            try {
                const { question, answers, correct, category, difficulty, info } = req.body;

                if (!question || !answers || answers.length !== 4 || correct === undefined) {
                    return res.status(400).json({ success: false, error: 'Invalid question format' });
                }

                const stmt = this.db.prepare(`
                    INSERT INTO questions (question, answers, correct, category, difficulty, info) 
                    VALUES (?, ?, ?, ?, ?, ?)
                `);
                
                const result = stmt.run(
                    question,
                    JSON.stringify(answers),
                    parseInt(correct),
                    category || 'Allgemein',
                    difficulty || 2,
                    info || null
                );

                // Add category if it doesn't exist
                if (category) {
                    this.db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)').run(category);
                }

                const newQuestion = {
                    id: result.lastInsertRowid,
                    question,
                    answers,
                    correct: parseInt(correct),
                    category: category || 'Allgemein',
                    difficulty: difficulty || 2,
                    info: info || null
                };

                // Broadcast update
                const allQuestions = this.db.prepare('SELECT * FROM questions').all().map(q => ({
                    id: q.id,
                    question: q.question,
                    answers: JSON.parse(q.answers),
                    correct: q.correct,
                    category: q.category,
                    difficulty: q.difficulty,
                    info: q.info
                }));
                this.api.emit('quiz-show:questions-updated', allQuestions);

                res.json({ success: true, question: newQuestion });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Update question
        this.api.registerRoute('put', '/api/quiz-show/questions/:id', async (req, res) => {
            try {
                const questionId = parseInt(req.params.id);
                const { question, answers, correct, category, difficulty, info } = req.body;

                const stmt = this.db.prepare(`
                    UPDATE questions 
                    SET question = ?, answers = ?, correct = ?, category = ?, difficulty = ?, info = ?
                    WHERE id = ?
                `);
                
                const result = stmt.run(
                    question,
                    JSON.stringify(answers),
                    parseInt(correct),
                    category || 'Allgemein',
                    difficulty || 2,
                    info || null,
                    questionId
                );

                if (result.changes === 0) {
                    return res.status(404).json({ success: false, error: 'Question not found' });
                }

                // Add category if it doesn't exist
                if (category) {
                    this.db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)').run(category);
                }

                const updatedQuestion = {
                    id: questionId,
                    question,
                    answers,
                    correct: parseInt(correct),
                    category: category || 'Allgemein',
                    difficulty: difficulty || 2,
                    info: info || null
                };

                // Broadcast update
                const allQuestions = this.db.prepare('SELECT * FROM questions').all().map(q => ({
                    id: q.id,
                    question: q.question,
                    answers: JSON.parse(q.answers),
                    correct: q.correct,
                    category: q.category,
                    difficulty: q.difficulty,
                    info: q.info
                }));
                this.api.emit('quiz-show:questions-updated', allQuestions);

                res.json({ success: true, question: updatedQuestion });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Delete question
        this.api.registerRoute('delete', '/api/quiz-show/questions/:id', async (req, res) => {
            try {
                const questionId = parseInt(req.params.id);
                
                const result = this.db.prepare('DELETE FROM questions WHERE id = ?').run(questionId);

                if (result.changes === 0) {
                    return res.status(404).json({ success: false, error: 'Question not found' });
                }

                // Broadcast update
                const allQuestions = this.db.prepare('SELECT * FROM questions').all().map(q => ({
                    id: q.id,
                    question: q.question,
                    answers: JSON.parse(q.answers),
                    correct: q.correct,
                    category: q.category,
                    difficulty: q.difficulty,
                    info: q.info
                }));
                this.api.emit('quiz-show:questions-updated', allQuestions);

                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Upload questions (JSON)
        this.api.registerRoute('post', '/api/quiz-show/questions/upload', async (req, res) => {
            try {
                let uploadedQuestions = req.body;

                // Handle new format with categories array
                if (uploadedQuestions && uploadedQuestions.categories && uploadedQuestions.questions) {
                    // Import categories first
                    if (Array.isArray(uploadedQuestions.categories)) {
                        for (const cat of uploadedQuestions.categories) {
                            this.db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)').run(cat);
                        }
                    }
                    uploadedQuestions = uploadedQuestions.questions;
                }

                if (!Array.isArray(uploadedQuestions)) {
                    return res.status(400).json({ success: false, error: 'Invalid format: expected array' });
                }

                // Validate and insert questions
                const insert = this.db.prepare(`
                    INSERT INTO questions (question, answers, correct, category, difficulty, info) 
                    VALUES (?, ?, ?, ?, ?, ?)
                `);

                const insertMany = this.mainDb.transaction((questions) => {
                    let added = 0;
                    for (const q of questions) {
                        if (q.question && q.answers && q.answers.length === 4 && q.correct !== undefined) {
                            insert.run(
                                q.question,
                                JSON.stringify(q.answers),
                                parseInt(q.correct),
                                q.category || 'Allgemein',
                                q.difficulty || 2,
                                q.info || null
                            );
                            
                            // Add category if provided
                            if (q.category) {
                                this.db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)').run(q.category);
                            }
                            added++;
                        }
                    }
                    return added;
                });

                const added = insertMany(uploadedQuestions);
                const total = this.db.prepare('SELECT COUNT(*) as count FROM questions').get().count;

                // Broadcast update
                const allQuestions = this.db.prepare('SELECT * FROM questions').all().map(q => ({
                    id: q.id,
                    question: q.question,
                    answers: JSON.parse(q.answers),
                    correct: q.correct,
                    category: q.category,
                    difficulty: q.difficulty,
                    info: q.info
                }));
                this.api.emit('quiz-show:questions-updated', allQuestions);

                res.json({
                    success: true,
                    added,
                    total
                });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Export questions
        this.api.registerRoute('get', '/api/quiz-show/questions/export', (req, res) => {
            try {
                const questions = this.db.prepare('SELECT * FROM questions').all();
                const categories = this.db.prepare('SELECT name FROM categories ORDER BY name').all();
                
                const exported = {
                    categories: categories.map(c => c.name),
                    questions: questions.map(q => ({
                        question: q.question,
                        answers: JSON.parse(q.answers),
                        correct: q.correct,
                        category: q.category,
                        difficulty: q.difficulty,
                        info: q.info
                    }))
                };
                res.json(exported);
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Reset leaderboard
        this.api.registerRoute('post', '/api/quiz-show/leaderboard/reset', async (req, res) => {
            try {
                const activeSeason = this.db.prepare('SELECT id FROM leaderboard_seasons WHERE is_active = 1').get();
                if (activeSeason) {
                    this.mainDb.prepare('DELETE FROM quiz_leaderboard_entries WHERE season_id = ?').run(activeSeason.id);
                }

                this.api.emit('quiz-show:leaderboard-updated', []);

                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Export leaderboard
        this.api.registerRoute('get', '/api/quiz-show/leaderboard/export', (req, res) => {
            try {
                const activeSeason = this.db.prepare('SELECT id FROM leaderboard_seasons WHERE is_active = 1').get();
                let data = [];
                if (activeSeason) {
                    data = this.db.prepare(`
                        SELECT user_id as userId, username, points 
                        FROM quiz_leaderboard_entries 
                        WHERE season_id = ? 
                        ORDER BY points DESC
                    `).all(activeSeason.id);
                }
                res.json(data);
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Import leaderboard
        this.api.registerRoute('post', '/api/quiz-show/leaderboard/import', async (req, res) => {
            try {
                const data = req.body;

                if (!Array.isArray(data)) {
                    return res.status(400).json({ success: false, error: 'Invalid format' });
                }

                const activeSeason = this.db.prepare('SELECT id FROM leaderboard_seasons WHERE is_active = 1').get();
                if (!activeSeason) {
                    return res.status(500).json({ success: false, error: 'No active season' });
                }

                // Clear existing entries
                this.mainDb.prepare('DELETE FROM quiz_leaderboard_entries WHERE season_id = ?').run(activeSeason.id);

                // Insert new entries
                const insert = this.db.prepare(`
                    INSERT INTO quiz_leaderboard_entries (season_id, user_id, username, points) 
                    VALUES (?, ?, ?, ?)
                `);
                
                const insertMany = this.mainDb.transaction((entries) => {
                    for (const entry of entries) {
                        if (entry.userId && entry.username !== undefined && entry.points !== undefined) {
                            insert.run(activeSeason.id, entry.userId, entry.username, entry.points);
                        }
                    }
                });
                
                insertMany(data);

                const leaderboardData = this.db.prepare(`
                    SELECT user_id as userId, username, points 
                    FROM quiz_leaderboard_entries 
                    WHERE season_id = ? 
                    ORDER BY points DESC
                `).all(activeSeason.id);

                this.api.emit('quiz-show:leaderboard-updated', leaderboardData);

                res.json({ success: true, entries: leaderboardData.length });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get all seasons
        this.api.registerRoute('get', '/api/quiz-show/seasons', (req, res) => {
            try {
                const seasons = this.db.prepare('SELECT * FROM leaderboard_seasons ORDER BY start_date DESC').all();
                res.json({ success: true, seasons });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Create new season (archives current)
        this.api.registerRoute('post', '/api/quiz-show/seasons', (req, res) => {
            try {
                const { seasonName } = req.body;
                const now = new Date().toISOString();

                // Archive current active season
                this.db.prepare('UPDATE leaderboard_seasons SET is_active = 0, end_date = ? WHERE is_active = 1')
                    .run(now);

                // Create new season
                const result = this.db.prepare(`
                    INSERT INTO leaderboard_seasons (season_name, start_date, is_active) 
                    VALUES (?, ?, 1)
                `).run(seasonName || `Season ${new Date().getFullYear()}`, now);

                const newSeason = {
                    id: result.lastInsertRowid,
                    season_name: seasonName || `Season ${new Date().getFullYear()}`,
                    start_date: now,
                    end_date: null,
                    is_active: true
                };

                this.api.emit('quiz-show:season-changed', newSeason);

                res.json({ success: true, season: newSeason });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get leaderboard by season
        this.api.registerRoute('get', '/api/quiz-show/seasons/:id/leaderboard', (req, res) => {
            try {
                const seasonId = parseInt(req.params.id);
                const leaderboard = this.db.prepare(`
                    SELECT user_id as userId, username, points 
                    FROM quiz_leaderboard_entries 
                    WHERE season_id = ? 
                    ORDER BY points DESC
                `).all(seasonId);

                res.json({ success: true, leaderboard });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get all categories
        this.api.registerRoute('get', '/api/quiz-show/categories', (req, res) => {
            try {
                const categories = this.db.prepare('SELECT name FROM categories ORDER BY name').all();
                res.json({ success: true, categories: categories.map(c => c.name) });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Sound effects management
        this.api.registerRoute('get', '/api/quiz-show/sounds', (req, res) => {
            try {
                const sounds = this.db.prepare('SELECT * FROM game_sounds').all();
                res.json({ success: true, sounds });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('post', '/api/quiz-show/sounds', (req, res) => {
            try {
                const { event_name, file_path, volume } = req.body;
                
                this.db.prepare(`
                    INSERT OR REPLACE INTO game_sounds (event_name, file_path, volume) 
                    VALUES (?, ?, ?)
                `).run(event_name, file_path, volume || 1.0);

                const sounds = this.db.prepare('SELECT * FROM game_sounds').all();
                this.api.emit('quiz-show:sounds-updated', sounds);

                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Brand kit management
        this.api.registerRoute('get', '/api/quiz-show/brand-kit', (req, res) => {
            try {
                const brandKit = this.db.prepare('SELECT * FROM brand_kit WHERE id = 1').get();
                res.json({ success: true, brandKit: brandKit || {} });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('post', '/api/quiz-show/brand-kit', (req, res) => {
            try {
                const { logo_path, primary_color, secondary_color } = req.body;
                
                this.db.prepare(`
                    INSERT OR REPLACE INTO brand_kit (id, logo_path, primary_color, secondary_color) 
                    VALUES (1, ?, ?, ?)
                `).run(logo_path, primary_color, secondary_color);

                const brandKit = this.db.prepare('SELECT * FROM brand_kit WHERE id = 1').get();
                this.api.emit('quiz-show:brand-kit-updated', brandKit);

                res.json({ success: true, brandKit });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get HUD configuration
        this.api.registerRoute('get', '/api/quiz-show/hud-config', (req, res) => {
            try {
                const hudConfig = this.api.getConfig('hudConfig') || this.getDefaultHUDConfig();
                res.json({ success: true, config: hudConfig });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Update HUD configuration
        this.api.registerRoute('post', '/api/quiz-show/hud-config', async (req, res) => {
            try {
                const hudConfig = req.body;
                await this.api.setConfig('hudConfig', hudConfig);

                // Broadcast update to all overlays
                this.api.emit('quiz-show:hud-config-updated', hudConfig);

                res.json({ success: true, config: hudConfig });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Reset HUD configuration
        this.api.registerRoute('post', '/api/quiz-show/hud-config/reset', async (req, res) => {
            try {
                const defaultConfig = this.getDefaultHUDConfig();
                await this.api.setConfig('hudConfig', defaultConfig);

                // Broadcast update to all overlays
                this.api.emit('quiz-show:hud-config-updated', defaultConfig);

                res.json({ success: true, config: defaultConfig });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ============================================
        // OpenAI Configuration Routes
        // ============================================

        // Get OpenAI configuration
        this.api.registerRoute('get', '/api/quiz-show/openai/config', (req, res) => {
            try {
                const config = this.db.prepare('SELECT api_key, model, default_package_size FROM openai_config WHERE id = 1').get();
                
                // Don't send the full API key to the client, just indicate if it's set
                const response = {
                    hasApiKey: !!config?.api_key,
                    apiKeyPreview: config?.api_key ? `${config.api_key.substring(0, 7)}...${config.api_key.substring(config.api_key.length - 4)}` : null,
                    model: config?.model || 'gpt-5-mini',
                    defaultPackageSize: config?.default_package_size || 10
                };

                res.json({ success: true, config: response });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Update OpenAI configuration
        this.api.registerRoute('post', '/api/quiz-show/openai/config', async (req, res) => {
            try {
                const { apiKey, model, defaultPackageSize } = req.body;

                if (apiKey !== undefined) {
                    // Test the API key if provided
                    if (apiKey) {
                        const OpenAIQuizService = require('./openai-service');
                        const service = new OpenAIQuizService(apiKey, model || 'gpt-5-mini');
                        const isValid = await service.testApiKey();
                        
                        if (!isValid) {
                            return res.status(400).json({ success: false, error: 'Ungültiger API-Schlüssel' });
                        }
                    }

                    this.db.prepare('UPDATE openai_config SET api_key = ? WHERE id = 1').run(apiKey || null);
                }

                if (model !== undefined) {
                    this.db.prepare('UPDATE openai_config SET model = ? WHERE id = 1').run(model);
                }

                if (defaultPackageSize !== undefined) {
                    this.db.prepare('UPDATE openai_config SET default_package_size = ? WHERE id = 1').run(defaultPackageSize);
                }

                res.json({ success: true, message: 'Konfiguration gespeichert' });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Test OpenAI API key
        this.api.registerRoute('post', '/api/quiz-show/openai/test', async (req, res) => {
            try {
                const { apiKey } = req.body;

                if (!apiKey) {
                    return res.status(400).json({ success: false, error: 'API-Schlüssel erforderlich' });
                }

                const OpenAIQuizService = require('./openai-service');
                const service = new OpenAIQuizService(apiKey, 'gpt-5-mini');
                const isValid = await service.testApiKey();
                
                if (isValid) {
                    res.json({ success: true, message: 'API-Schlüssel ist gültig' });
                } else {
                    res.status(400).json({ success: false, error: 'Ungültiger API-Schlüssel' });
                }
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get AI configuration (unified endpoint for settings tab)
        this.api.registerRoute('get', '/api/quiz-show/ai-config', (req, res) => {
            try {
                const config = this.db.prepare('SELECT api_key, model, default_package_size FROM openai_config WHERE id = 1').get();
                
                const response = {
                    hasKey: !!config?.api_key,
                    model: config?.model || 'gpt-5-mini',
                    defaultPackageSize: config?.default_package_size || 10
                };

                res.json({ success: true, config: response });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Update AI configuration (unified endpoint for settings tab)
        this.api.registerRoute('post', '/api/quiz-show/ai-config', async (req, res) => {
            try {
                const { apiKey, model, defaultPackageSize } = req.body;

                if (apiKey !== undefined && apiKey) {
                    // Test the API key if provided
                    const OpenAIQuizService = require('./openai-service');
                    const service = new OpenAIQuizService(apiKey, model || 'gpt-5-mini');
                    const isValid = await service.testApiKey();
                    
                    if (!isValid) {
                        return res.status(400).json({ success: false, error: 'Ungültiger API-Schlüssel' });
                    }

                    this.db.prepare('UPDATE openai_config SET api_key = ? WHERE id = 1').run(apiKey);
                }

                if (model !== undefined) {
                    this.db.prepare('UPDATE openai_config SET model = ? WHERE id = 1').run(model);
                }

                if (defaultPackageSize !== undefined) {
                    this.db.prepare('UPDATE openai_config SET default_package_size = ? WHERE id = 1').run(defaultPackageSize);
                }

                res.json({ success: true, message: 'AI-Konfiguration gespeichert' });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ============================================
        // Question Package Routes
        // ============================================

        // Get all question packages
        this.api.registerRoute('get', '/api/quiz-show/packages', (req, res) => {
            try {
                const packages = this.db.prepare(`
                    SELECT id, name, category, question_count, is_selected, created_at 
                    FROM question_packages 
                    ORDER BY created_at DESC
                `).all();

                res.json({ success: true, packages });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Generate question package with OpenAI
        this.api.registerRoute('post', '/api/quiz-show/packages/generate', async (req, res) => {
            try {
                const { category, packageSize, packageName } = req.body;

                if (!category) {
                    return res.status(400).json({ success: false, error: 'Kategorie erforderlich' });
                }

                // Get OpenAI config
                const config = this.db.prepare('SELECT api_key, model FROM openai_config WHERE id = 1').get();
                
                if (!config || !config.api_key) {
                    return res.status(400).json({ success: false, error: 'OpenAI API-Schlüssel nicht konfiguriert' });
                }

                // Get existing questions for this category to avoid duplicates
                const existingQuestions = this.db.prepare(`
                    SELECT question FROM questions WHERE category = ?
                `).all(category).map(q => q.question);

                // Generate questions using OpenAI
                const OpenAIQuizService = require('./openai-service');
                const service = new OpenAIQuizService(config.api_key, config.model);
                
                const size = packageSize || config.default_package_size || 10;
                const questions = await service.generateQuestions(category, size, existingQuestions);

                if (questions.length === 0) {
                    return res.status(500).json({ success: false, error: 'Keine Fragen generiert' });
                }

                // Create question package
                const name = packageName || `${category} - ${new Date().toLocaleDateString('de-DE')}`;
                const packageResult = this.db.prepare(`
                    INSERT INTO question_packages (name, category, question_count) 
                    VALUES (?, ?, ?)
                `).run(name, category, questions.length);

                const packageId = packageResult.lastInsertRowid;

                // Insert questions with package reference
                const insertQuestion = this.db.prepare(`
                    INSERT INTO questions (question, answers, correct, category, difficulty, info, package_id) 
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `);

                const insertMany = this.mainDb.transaction((questions) => {
                    for (const q of questions) {
                        insertQuestion.run(
                            q.question,
                            JSON.stringify(q.answers),
                            q.correct,
                            q.category,
                            q.difficulty,
                            q.info,
                            packageId
                        );
                    }
                });

                insertMany(questions);

                // Add category if it doesn't exist
                this.db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)').run(category);

                // Broadcast update
                const allQuestions = this.db.prepare('SELECT * FROM questions').all().map(q => ({
                    id: q.id,
                    question: q.question,
                    answers: JSON.parse(q.answers),
                    correct: q.correct,
                    category: q.category,
                    difficulty: q.difficulty,
                    info: q.info,
                    package_id: q.package_id
                }));
                this.api.emit('quiz-show:questions-updated', allQuestions);

                res.json({ 
                    success: true, 
                    package: {
                        id: packageId,
                        name,
                        category,
                        question_count: questions.length
                    },
                    questions 
                });
            } catch (error) {
                this.api.log('Error generating question package: ' + error.message, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Toggle package selection
        this.api.registerRoute('post', '/api/quiz-show/packages/:id/toggle', (req, res) => {
            try {
                const packageId = parseInt(req.params.id);
                
                const pkg = this.db.prepare('SELECT is_selected FROM question_packages WHERE id = ?').get(packageId);
                
                if (!pkg) {
                    return res.status(404).json({ success: false, error: 'Paket nicht gefunden' });
                }

                const newState = !pkg.is_selected;
                this.db.prepare('UPDATE question_packages SET is_selected = ? WHERE id = ?').run(newState ? 1 : 0, packageId);

                res.json({ success: true, isSelected: newState });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Delete question package
        this.api.registerRoute('delete', '/api/quiz-show/packages/:id', (req, res) => {
            try {
                const packageId = parseInt(req.params.id);
                
                // Delete questions in this package
                this.db.prepare('DELETE FROM questions WHERE package_id = ?').run(packageId);
                
                // Delete package
                const result = this.db.prepare('DELETE FROM question_packages WHERE id = ?').run(packageId);

                if (result.changes === 0) {
                    return res.status(404).json({ success: false, error: 'Paket nicht gefunden' });
                }

                // Broadcast update
                const allQuestions = this.db.prepare('SELECT * FROM questions').all().map(q => ({
                    id: q.id,
                    question: q.question,
                    answers: JSON.parse(q.answers),
                    correct: q.correct,
                    category: q.category,
                    difficulty: q.difficulty,
                    info: q.info,
                    package_id: q.package_id
                }));
                this.api.emit('quiz-show:questions-updated', allQuestions);

                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get questions from a specific package
        this.api.registerRoute('get', '/api/quiz-show/packages/:id/questions', (req, res) => {
            try {
                const packageId = parseInt(req.params.id);
                
                const questions = this.db.prepare(`
                    SELECT * FROM questions WHERE package_id = ?
                `).all(packageId).map(q => ({
                    id: q.id,
                    question: q.question,
                    answers: JSON.parse(q.answers),
                    correct: q.correct,
                    category: q.category,
                    difficulty: q.difficulty,
                    info: q.info
                }));

                res.json({ success: true, questions });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ===== NEW: Gift-Joker Mapping Routes =====
        
        // Get all gift-joker mappings
        this.api.registerRoute('get', '/api/quiz-show/gift-jokers', (req, res) => {
            try {
                const mappings = this.db.prepare('SELECT * FROM gift_joker_mappings ORDER BY gift_id').all();
                res.json({ success: true, mappings });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Add or update gift-joker mapping
        this.api.registerRoute('post', '/api/quiz-show/gift-jokers', (req, res) => {
            try {
                const { giftId, giftName, jokerType, enabled } = req.body;

                if (!giftId || !giftName || !jokerType) {
                    return res.status(400).json({ success: false, error: 'Missing required fields' });
                }

                if (!['25', '50', 'time', 'info'].includes(jokerType)) {
                    return res.status(400).json({ success: false, error: 'Invalid joker type' });
                }

                // Check if mapping exists
                const existing = this.db.prepare('SELECT id FROM gift_joker_mappings WHERE gift_id = ?').get(giftId);
                
                if (existing) {
                    // Update existing mapping
                    this.db.prepare('UPDATE gift_joker_mappings SET gift_name = ?, joker_type = ?, enabled = ? WHERE gift_id = ?')
                        .run(giftName, jokerType, enabled !== false ? 1 : 0, giftId);
                } else {
                    // Insert new mapping
                    this.db.prepare('INSERT INTO gift_joker_mappings (gift_id, gift_name, joker_type, enabled) VALUES (?, ?, ?, ?)')
                        .run(giftId, giftName, jokerType, enabled !== false ? 1 : 0);
                }

                // Reload gift joker mappings into config
                this.loadGiftJokerMappings();

                const mappings = this.db.prepare('SELECT * FROM gift_joker_mappings ORDER BY gift_id').all();
                res.json({ success: true, mappings });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Delete gift-joker mapping
        this.api.registerRoute('delete', '/api/quiz-show/gift-jokers/:giftId', (req, res) => {
            try {
                const giftId = parseInt(req.params.giftId);
                this.db.prepare('DELETE FROM gift_joker_mappings WHERE gift_id = ?').run(giftId);
                
                // Reload gift joker mappings into config
                this.loadGiftJokerMappings();

                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get gift catalog from database for gift-joker dropdown
        this.api.registerRoute('get', '/api/quiz-show/gift-catalog', (req, res) => {
            try {
                const db = this.api.getDatabase();
                const gifts = db.getGiftCatalog();
                res.json({ success: true, gifts });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ===== NEW: Overlay Layout Routes =====
        
        // Get all layouts
        this.api.registerRoute('get', '/api/quiz-show/layouts', (req, res) => {
            try {
                const layouts = this.db.prepare('SELECT * FROM overlay_layouts ORDER BY created_at DESC').all()
                    .map(layout => ({
                        ...layout,
                        layout_config: JSON.parse(layout.layout_config)
                    }));
                res.json({ success: true, layouts });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get a specific layout
        this.api.registerRoute('get', '/api/quiz-show/layouts/:id', (req, res) => {
            try {
                const layoutId = parseInt(req.params.id);
                const layout = this.db.prepare('SELECT * FROM overlay_layouts WHERE id = ?').get(layoutId);
                
                if (!layout) {
                    return res.status(404).json({ success: false, error: 'Layout not found' });
                }

                layout.layout_config = JSON.parse(layout.layout_config);
                res.json({ success: true, layout });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Create new layout
        this.api.registerRoute('post', '/api/quiz-show/layouts', (req, res) => {
            try {
                const { name, resolutionWidth, resolutionHeight, orientation, layoutConfig, isDefault } = req.body;

                if (!name || !resolutionWidth || !resolutionHeight || !orientation || !layoutConfig) {
                    return res.status(400).json({ success: false, error: 'Missing required fields' });
                }

                if (!['horizontal', 'vertical'].includes(orientation)) {
                    return res.status(400).json({ success: false, error: 'Invalid orientation' });
                }

                // If this is set as default, unset all other defaults for the same orientation
                if (isDefault) {
                    this.db.prepare('UPDATE overlay_layouts SET is_default = 0 WHERE orientation = ?').run(orientation);
                }

                const result = this.db.prepare(
                    'INSERT INTO overlay_layouts (name, resolution_width, resolution_height, orientation, is_default, layout_config) VALUES (?, ?, ?, ?, ?, ?)'
                ).run(name, resolutionWidth, resolutionHeight, orientation, isDefault ? 1 : 0, JSON.stringify(layoutConfig));

                const newLayout = this.db.prepare('SELECT * FROM overlay_layouts WHERE id = ?').get(result.lastInsertRowid);
                newLayout.layout_config = JSON.parse(newLayout.layout_config);

                res.json({ success: true, layout: newLayout });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Update layout
        this.api.registerRoute('put', '/api/quiz-show/layouts/:id', (req, res) => {
            try {
                const layoutId = parseInt(req.params.id);
                const { name, resolutionWidth, resolutionHeight, orientation, layoutConfig, isDefault } = req.body;

                const existing = this.db.prepare('SELECT id FROM overlay_layouts WHERE id = ?').get(layoutId);
                if (!existing) {
                    return res.status(404).json({ success: false, error: 'Layout not found' });
                }

                if (!['horizontal', 'vertical'].includes(orientation)) {
                    return res.status(400).json({ success: false, error: 'Invalid orientation' });
                }

                // If this is set as default, unset all other defaults for the same orientation
                if (isDefault) {
                    this.db.prepare('UPDATE overlay_layouts SET is_default = 0 WHERE orientation = ? AND id != ?').run(orientation, layoutId);
                }

                this.db.prepare(
                    'UPDATE overlay_layouts SET name = ?, resolution_width = ?, resolution_height = ?, orientation = ?, is_default = ?, layout_config = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
                ).run(name, resolutionWidth, resolutionHeight, orientation, isDefault ? 1 : 0, JSON.stringify(layoutConfig), layoutId);

                const updatedLayout = this.db.prepare('SELECT * FROM overlay_layouts WHERE id = ?').get(layoutId);
                updatedLayout.layout_config = JSON.parse(updatedLayout.layout_config);

                res.json({ success: true, layout: updatedLayout });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Delete layout
        this.api.registerRoute('delete', '/api/quiz-show/layouts/:id', (req, res) => {
            try {
                const layoutId = parseInt(req.params.id);
                const result = this.db.prepare('DELETE FROM overlay_layouts WHERE id = ?').run(layoutId);

                if (result.changes === 0) {
                    return res.status(404).json({ success: false, error: 'Layout not found' });
                }

                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ===== NEW: TTS Configuration Routes =====
        
        // Get TTS config
        this.api.registerRoute('get', '/api/quiz-show/tts-config', (req, res) => {
            try {
                const ttsConfig = this.db.prepare('SELECT * FROM tts_config WHERE id = 1').get();
                res.json({ success: true, config: ttsConfig || { volume_global: 80, volume_session: 80, enabled: true } });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Update TTS config
        this.api.registerRoute('post', '/api/quiz-show/tts-config', (req, res) => {
            try {
                const { volumeGlobal, volumeSession, enabled } = req.body;

                // Validate volume values
                if (volumeGlobal !== undefined && (volumeGlobal < 0 || volumeGlobal > 100)) {
                    return res.status(400).json({ success: false, error: 'Volume must be between 0 and 100' });
                }
                if (volumeSession !== undefined && (volumeSession < 0 || volumeSession > 100)) {
                    return res.status(400).json({ success: false, error: 'Volume must be between 0 and 100' });
                }

                // Update or insert
                const existing = this.db.prepare('SELECT id FROM tts_config WHERE id = 1').get();
                
                if (existing) {
                    const updates = [];
                    const values = [];
                    
                    if (volumeGlobal !== undefined) {
                        updates.push('volume_global = ?');
                        values.push(volumeGlobal);
                    }
                    if (volumeSession !== undefined) {
                        updates.push('volume_session = ?');
                        values.push(volumeSession);
                    }
                    if (enabled !== undefined) {
                        updates.push('enabled = ?');
                        values.push(enabled ? 1 : 0);
                    }
                    
                    if (updates.length > 0) {
                        this.db.prepare(`UPDATE tts_config SET ${updates.join(', ')} WHERE id = 1`).run(...values);
                    }
                } else {
                    this.db.prepare('INSERT INTO tts_config (id, volume_global, volume_session, enabled) VALUES (1, ?, ?, ?)')
                        .run(volumeGlobal || 80, volumeSession || 80, enabled !== false ? 1 : 0);
                }

                // Update config in memory
                this.config.ttsVolume = volumeSession !== undefined ? volumeSession : (volumeGlobal || this.config.ttsVolume);

                const ttsConfig = this.db.prepare('SELECT * FROM tts_config WHERE id = 1').get();
                res.json({ success: true, config: ttsConfig });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ===== NEW: Leaderboard Display Configuration Routes =====
        
        // Get leaderboard display config
        this.api.registerRoute('get', '/api/quiz-show/leaderboard-config', (req, res) => {
            try {
                const config = this.db.prepare('SELECT * FROM leaderboard_display_config WHERE id = 1').get();
                res.json({ success: true, config: config || {
                    show_after_round: true,
                    round_display_type: 'both',
                    end_game_display_type: 'season',
                    auto_hide_delay: 10,
                    animation_style: 'fade'
                }});
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Update leaderboard display config
        this.api.registerRoute('post', '/api/quiz-show/leaderboard-config', (req, res) => {
            try {
                const { showAfterRound, roundDisplayType, endGameDisplayType, autoHideDelay, animationStyle } = req.body;

                // Validate values
                if (roundDisplayType && !['round', 'season', 'both'].includes(roundDisplayType)) {
                    return res.status(400).json({ success: false, error: 'Invalid round display type' });
                }
                if (endGameDisplayType && !['round', 'season'].includes(endGameDisplayType)) {
                    return res.status(400).json({ success: false, error: 'Invalid end game display type' });
                }
                if (animationStyle && !['fade', 'slide', 'zoom'].includes(animationStyle)) {
                    return res.status(400).json({ success: false, error: 'Invalid animation style' });
                }

                // Update or insert
                const existing = this.db.prepare('SELECT id FROM leaderboard_display_config WHERE id = 1').get();
                
                if (existing) {
                    const updates = [];
                    const values = [];
                    
                    if (showAfterRound !== undefined) {
                        updates.push('show_after_round = ?');
                        values.push(showAfterRound ? 1 : 0);
                    }
                    if (roundDisplayType) {
                        updates.push('round_display_type = ?');
                        values.push(roundDisplayType);
                    }
                    if (endGameDisplayType) {
                        updates.push('end_game_display_type = ?');
                        values.push(endGameDisplayType);
                    }
                    if (autoHideDelay !== undefined) {
                        updates.push('auto_hide_delay = ?');
                        values.push(autoHideDelay);
                    }
                    if (animationStyle) {
                        updates.push('animation_style = ?');
                        values.push(animationStyle);
                    }
                    
                    if (updates.length > 0) {
                        this.db.prepare(`UPDATE leaderboard_display_config SET ${updates.join(', ')} WHERE id = 1`).run(...values);
                    }
                } else {
                    this.db.prepare('INSERT INTO leaderboard_display_config (id, show_after_round, round_display_type, end_game_display_type, auto_hide_delay, animation_style) VALUES (1, ?, ?, ?, ?, ?)')
                        .run(showAfterRound !== false ? 1 : 0, roundDisplayType || 'both', endGameDisplayType || 'season', autoHideDelay || 10, animationStyle || 'fade');
                }

                // Update config in memory
                if (showAfterRound !== undefined) this.config.leaderboardShowAfterRound = showAfterRound;
                if (roundDisplayType) this.config.leaderboardRoundDisplayType = roundDisplayType;
                if (endGameDisplayType) this.config.leaderboardEndGameDisplayType = endGameDisplayType;
                if (autoHideDelay !== undefined) this.config.leaderboardAutoHideDelay = autoHideDelay;
                if (animationStyle) this.config.leaderboardAnimationStyle = animationStyle;

                const config = this.db.prepare('SELECT * FROM leaderboard_display_config WHERE id = 1').get();
                res.json({ success: true, config });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });
    }

    getDefaultHUDConfig() {
        return {
            theme: 'dark',
            questionAnimation: 'slide-in-bottom',
            correctAnimation: 'glow-pulse',
            wrongAnimation: 'shake',
            timerVariant: 'circular',
            answersLayout: 'grid',
            animationSpeed: 1,
            glowIntensity: 1,
            customCSS: '',
            streamWidth: 1920,
            streamHeight: 1080,
            positions: {
                question: { top: null, left: null, width: '100%', maxWidth: '1200px' },
                answers: { top: null, left: null, width: '100%', maxWidth: '1200px' },
                timer: { top: null, left: null }
            },
            colors: {
                primary: '#3b82f6',
                secondary: '#8b5cf6',
                success: '#10b981',
                danger: '#ef4444',
                warning: '#f59e0b'
            },
            fonts: {
                family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                sizeQuestion: '2.2rem',
                sizeAnswer: '1.1rem'
            }
        };
    }

    registerSocketEvents() {
        // Start quiz
        this.api.registerSocket('quiz-show:start', async (socket, data) => {
            try {
                if (this.gameState.isRunning) {
                    socket.emit('quiz-show:error', { message: 'Quiz already running' });
                    return;
                }

                const questionCount = this.db.prepare('SELECT COUNT(*) as count FROM questions').get().count;
                if (questionCount === 0) {
                    socket.emit('quiz-show:error', { message: 'No questions available' });
                    return;
                }

                await this.startRound();
                socket.emit('quiz-show:started', { success: true });
            } catch (error) {
                this.api.log('Error starting quiz: ' + error.message, 'error');
                socket.emit('quiz-show:error', { message: error.message });
            }
        });

        // Next question
        this.api.registerSocket('quiz-show:next', async (socket, data) => {
            try {
                if (this.gameState.isRunning) {
                    await this.endRound();
                }

                await this.startRound();
                socket.emit('quiz-show:next', { success: true });
            } catch (error) {
                this.api.log('Error going to next question: ' + error.message, 'error');
                socket.emit('quiz-show:error', { message: error.message });
            }
        });

        // Stop quiz
        this.api.registerSocket('quiz-show:stop', async (socket, data) => {
            try {
                if (!this.gameState.isRunning) {
                    socket.emit('quiz-show:error', { message: 'Quiz not running' });
                    return;
                }

                await this.endRound();
                this.resetGameState();

                // Get MVP for display
                const mvp = this.getMVPPlayer();

                // Show end game leaderboard
                await this.showLeaderboardAtEnd();

                this.api.emit('quiz-show:stopped', {});
                this.api.emit('quiz-show:quiz-ended', { mvp });
                socket.emit('quiz-show:stopped', { success: true });
            } catch (error) {
                this.api.log('Error stopping quiz: ' + error.message, 'error');
                socket.emit('quiz-show:error', { message: error.message });
            }
        });
    }

    extractProfilePicture(data) {
        // Try various fields that might contain the profile picture URL
        return data.profilePictureUrl ||
               data.profilePicture ||
               data.avatarUrl ||
               data.avatarThumb ||
               data.avatarLarger ||
               data.profilePicUrl ||
               (data.user && (data.user.profilePictureUrl || data.user.profilePicture || data.user.avatarUrl || data.user.avatarThumb || data.user.avatarLarger)) ||
               null;
    }

    registerTikTokEvents() {
        // Handle chat messages for answers and jokers
        this.api.registerTikTokEvent('chat', async (data) => {
            if (!this.gameState.isRunning) {
                return;
            }

            const userId = data.uniqueId || data.nickname || data.userId;
            const username = data.nickname || data.username || userId;
            const message = (data.message || data.comment || '').trim();
            const isSuperFan = data.teamMemberLevel >= 1 || data.isSubscriber;
            
            // Extract profile picture URL from various possible fields
            const profilePictureUrl = this.extractProfilePicture(data);

            // Check for joker commands (only superfans)
            if (isSuperFan && message.toLowerCase().startsWith('!joker')) {
                this.handleJokerCommand(userId, username, message);
                return;
            }

            // Check for answers
            this.handleAnswer(userId, username, message, profilePictureUrl);
        });

        // Handle gift events for joker activation
        this.api.registerTikTokEvent('gift', async (data) => {
            if (!this.gameState.isRunning) {
                return;
            }

            const userId = data.uniqueId || data.userId;
            const username = data.nickname || data.username || userId;
            const giftId = data.giftId || data.gift_id;

            // Check if this gift is mapped to a joker
            if (this.config.giftJokers && this.config.giftJokers[giftId]) {
                const jokerType = this.config.giftJokers[giftId];
                this.handleJokerCommand(userId, username, `!joker${jokerType}`, true);
            }
        });
    }

    async startRound() {
        // Get questions from database
        let questions;
        
        // Check if any packages are selected
        const selectedPackages = this.db.prepare('SELECT id FROM question_packages WHERE is_selected = 1').all();
        
        if (selectedPackages.length > 0) {
            // Get questions from selected packages
            const packageIds = selectedPackages.map(p => p.id);
            const placeholders = packageIds.map(() => '?').join(',');
            questions = this.db.prepare(`SELECT * FROM questions WHERE package_id IN (${placeholders})`).all(...packageIds);
        } else if (this.config.categoryFilter && this.config.categoryFilter !== 'Alle') {
            // Fallback to category filter if no packages selected
            questions = this.db.prepare('SELECT * FROM questions WHERE category = ?').all(this.config.categoryFilter);
        } else {
            // Get all questions
            questions = this.db.prepare('SELECT * FROM questions').all();
        }

        if (questions.length === 0) {
            throw new Error('No questions available');
        }

        // Parse JSON answers
        questions = questions.map(q => ({
            ...q,
            answers: JSON.parse(q.answers)
        }));

        // Get today's asked questions to prevent daily repetition
        const todaysAskedQuestionIds = this.getTodaysAskedQuestionIds();
        
        // Filter out questions asked in current session OR today
        const availableQuestions = questions.filter(q => 
            !this.gameState.askedQuestionIds.has(q.id) && 
            !todaysAskedQuestionIds.has(q.id)
        );

        // Check if we have any available questions
        if (availableQuestions.length === 0) {
            // No questions available - emit error to HUD
            this.api.emit('quiz-show:error', { 
                message: 'Neue Fragen notwendig',
                type: 'no_questions_available'
            });
            
            throw new Error('Alle verfügbaren Fragen wurden heute bereits gestellt. Bitte fügen Sie neue Fragen hinzu.');
        }

        // Select question from available ones
        let selectedQuestion;
        if (this.config.randomQuestions) {
            // Random selection
            const randomIndex = Math.floor(Math.random() * availableQuestions.length);
            selectedQuestion = availableQuestions[randomIndex];
        } else {
            // Sequential mode: select the first available question by ID order
            // This ensures consistent ordering even when questions are filtered
            selectedQuestion = availableQuestions[0];
        }

        // Record this question as asked (for daily tracking)
        this.recordQuestionAsked(selectedQuestion.id);
        
        // Add to session tracking (for round tracking)
        this.gameState.askedQuestionIds.add(selectedQuestion.id);

        // Prepare answers (shuffle if configured)
        let answers = [...selectedQuestion.answers];
        let correctIndex = selectedQuestion.correct;

        if (this.config.shuffleAnswers) {
            // Create mapping for shuffling
            const answerMapping = answers.map((ans, idx) => ({ ans, originalIdx: idx }));

            // Fisher-Yates shuffle
            for (let i = answerMapping.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [answerMapping[i], answerMapping[j]] = [answerMapping[j], answerMapping[i]];
            }

            answers = answerMapping.map(item => item.ans);
            correctIndex = answerMapping.findIndex(item => item.originalIdx === selectedQuestion.correct);
        }

        // Update game state
        this.gameState = {
            ...this.gameState,
            isRunning: true,
            currentQuestion: {
                ...selectedQuestion,
                answers,
                correct: correctIndex
            },
            currentQuestionId: selectedQuestion.id, // Store question ID for tracking
            startTime: Date.now(),
            endTime: Date.now() + (this.config.roundDuration * 1000),
            timeRemaining: this.config.roundDuration,
            answers: new Map(),
            correctUsers: [],
            roundState: 'running',
            jokersUsed: {
                '25': 0,
                '50': 0,
                'info': 0,
                'time': 0
            },
            jokerEvents: [],
            hiddenAnswers: [],
            revealedWrongAnswer: null,
            // Reset voters per answer for new question
            votersPerAnswer: {
                0: [], // Answer A
                1: [], // Answer B
                2: [], // Answer C
                3: []  // Answer D
            }
        };

        // Start timer
        this.startTimer();

        // Play timer start sound
        this.playSound('timer_start');

        // TTS announcement if enabled - use new playTTS method
        if (this.config.ttsEnabled) {
            const ttsText = `Neue Frage: ${selectedQuestion.question}. Antworten: A: ${answers[0]}, B: ${answers[1]}, C: ${answers[2]}, D: ${answers[3]}`;
            const voiceConfig = this.config.ttsVoice || 'default';
            
            // Play TTS (will use pre-generated audio if available)
            this.playTTS(selectedQuestion.id, ttsText, voiceConfig).catch(error => {
                this.api.log(`TTS error: ${error.message}`, 'error');
            });
            
            // Pre-generate TTS for the next question in background
            const nextQuestion = this.getNextQuestion();
            if (nextQuestion) {
                this.preGenerateTTS(nextQuestion).catch(error => {
                    this.api.log(`TTS pre-generation error: ${error.message}`, 'warn');
                });
            }
        }

        // Broadcast to overlay and UI
        this.broadcastGameState();

        this.api.log(`Round started with question: ${selectedQuestion.question}`, 'info');
    }

    /**
     * Get the next question that will be asked (for TTS pre-generation)
     */
    getNextQuestion() {
        try {
            // Get all questions from database
            let questions = this.db.prepare('SELECT * FROM questions').all();
            
            if (questions.length === 0) return null;

            // Apply category filter if set
            if (this.config.categoryFilter && this.config.categoryFilter !== 'Alle') {
                questions = questions.filter(q => q.category === this.config.categoryFilter);
            }

            // Apply package filter if any packages are selected
            const selectedPackages = this.db.prepare('SELECT id FROM question_packages WHERE is_selected = 1').all();
            if (selectedPackages.length > 0) {
                const packageIds = selectedPackages.map(p => p.id);
                questions = questions.filter(q => q.package_id && packageIds.includes(q.package_id));
            }

            // Parse answers JSON
            questions = questions.map(q => ({
                ...q,
                answers: typeof q.answers === 'string' ? JSON.parse(q.answers) : q.answers
            }));

            // Filter out questions asked recently (within 24 hours)
            const oneDayAgo = Date.now() - this.QUESTION_COOLDOWN_MS;
            const recentlyAskedIds = this.db.prepare(
                'SELECT DISTINCT question_id FROM question_history WHERE asked_at > ?'
            ).all(new Date(oneDayAgo).toISOString()).map(row => row.question_id);

            // Filter out recently asked questions AND questions asked in this session
            const availableQuestions = questions.filter(q => 
                !recentlyAskedIds.includes(q.id) && !this.gameState.askedQuestionIds.has(q.id)
            );

            if (availableQuestions.length === 0) {
                // If no questions available, just use a random question (but not current one)
                const otherQuestions = questions.filter(q => q.id !== this.gameState.currentQuestionId);
                if (otherQuestions.length === 0) return null;
                
                if (this.config.randomQuestions) {
                    return otherQuestions[Math.floor(Math.random() * otherQuestions.length)];
                } else {
                    return otherQuestions[0];
                }
            }

            // Select next question
            if (this.config.randomQuestions) {
                const randomIndex = Math.floor(Math.random() * availableQuestions.length);
                return availableQuestions[randomIndex];
            } else {
                return availableQuestions[0];
            }
        } catch (error) {
            this.api.log(`Error getting next question for pre-generation: ${error.message}`, 'warn');
            return null;
        }
    }

    startTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }

        this.timerInterval = setInterval(() => {
            const now = Date.now();
            const remaining = Math.max(0, Math.ceil((this.gameState.endTime - now) / 1000));

            this.gameState.timeRemaining = remaining;

            // Broadcast time update
            this.api.emit('quiz-show:time-update', {
                timeRemaining: remaining,
                totalTime: this.config.roundDuration
            });

            // End round when time is up
            if (remaining <= 0) {
                this.endRound();
            }
        }, 100);
    }

    async endRound() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }

        this.gameState.roundState = 'ended';
        this.gameState.isRunning = false;

        // Calculate results
        const results = this.calculateResults();

        // Elimination mode - eliminate users with wrong answers
        if (this.config.gameMode === 'elimination') {
            const correctAnswerIndex = this.gameState.currentQuestion.correct;
            const correctAnswerText = this.gameState.currentQuestion.answers[correctAnswerIndex];
            
            for (const [userId, answerData] of this.gameState.answers.entries()) {
                if (!this.isAnswerCorrect(answerData.answer, correctAnswerIndex, correctAnswerText)) {
                    this.gameState.eliminatedUsers.add(userId);
                }
            }
        }

        // Update statistics
        this.stats.totalRounds++;
        this.stats.totalAnswers += this.gameState.answers.size;
        this.stats.totalCorrectAnswers += results.correctUsers.length;

        await this.saveConfig();

        // Play round end sound
        this.playSound('round_end');

        // Get the correct answer letter
        const correctAnswerLetter = String.fromCharCode(65 + this.gameState.currentQuestion.correct); // A, B, C, D
        const correctAnswerText = this.gameState.currentQuestion.answers[this.gameState.currentQuestion.correct];
        
        // TTS announcement for correct answer and info text if enabled
        if (this.config.ttsEnabled) {
            let ttsText = `Die richtige Antwort ist ${correctAnswerLetter}: ${correctAnswerText}.`;
            
            // Add info text if available
            if (this.gameState.currentQuestion.info) {
                ttsText += ` ${this.gameState.currentQuestion.info}`;
            }
            
            // Parse voice format: "engine:voiceId" or "default"
            let engine = null;
            let voiceId = null;
            
            const voiceConfig = this.config.ttsVoice || 'default';
            if (voiceConfig !== 'default' && voiceConfig.includes(':')) {
                const parts = voiceConfig.split(':');
                engine = parts[0];
                voiceId = parts[1];
            }
            
            // Call TTS plugin via HTTP API
            try {
                const port = process.env.PORT || 3000;
                await axios.post(`http://localhost:${port}/api/tts/speak`, {
                    text: ttsText,
                    userId: 'quiz-show',
                    username: 'Quiz Show',
                    voiceId: voiceId,
                    engine: engine,
                    source: 'quiz-show'
                });
            } catch (error) {
                this.api.log(`TTS error: ${error.message}`, 'error');
            }
        }

        // Broadcast results
        this.api.emit('quiz-show:round-ended', {
            question: this.gameState.currentQuestion,
            correctAnswer: this.gameState.currentQuestion.correct,
            correctAnswerLetter: correctAnswerLetter,
            correctAnswerText: correctAnswerText,
            info: this.gameState.currentQuestion.info,
            answerDisplayDuration: this.config.answerDisplayDuration || 5, // Send to overlay
            results,
            stats: this.stats,
            eliminatedUsers: Array.from(this.gameState.eliminatedUsers),
            votersPerAnswer: this.gameState.votersPerAnswer, // Include voter data for icon display
            voterIconsConfig: {
                enabled: this.config.voterIconsEnabled,
                size: this.config.voterIconSize,
                maxVisible: this.config.voterIconMaxVisible,
                compactMode: this.config.voterIconCompactMode,
                animation: this.config.voterIconAnimation,
                position: this.config.voterIconPosition
            }
        });

        this.api.log(`Round ended. Correct answers: ${results.correctUsers.length}/${this.gameState.answers.size}`, 'info');

        // Show leaderboard after round if configured
        if (this.config.leaderboardShowAfterRound) {
            setTimeout(() => {
                this.showLeaderboardAfterRound();
            }, (this.config.answerDisplayDuration || 5) * 1000); // Show after answer display duration
        }

        // Auto mode - automatically start next round after delay
        if (this.config.autoMode) {
            const delay = (this.config.autoModeDelay || 5) * 1000;
            setTimeout(() => {
                this.startRound().catch(err => {
                    this.api.log('Error auto-starting next round: ' + err.message, 'error');
                });
            }, delay);
        }
    }

    async showLeaderboardAfterRound() {
        try {
            const displayType = this.config.leaderboardRoundDisplayType || 'both';
            const animationStyle = this.config.leaderboardAnimationStyle || 'fade';
            
            let leaderboard = [];

            if (displayType === 'round' || displayType === 'both') {
                // Get round leaderboard (current question results)
                const results = this.calculateResults();
                leaderboard = results.correctUsers.map((user, index) => ({
                    username: user.username,
                    points: index === 0 ? this.config.pointsFirstCorrect : this.config.pointsOtherCorrect,
                    rank: index + 1
                }));
            }

            if (displayType === 'season' || displayType === 'both') {
                // Get season leaderboard
                const activeSeason = this.db.prepare('SELECT id FROM leaderboard_seasons WHERE is_active = 1').get();
                if (activeSeason) {
                    const seasonLeaderboard = this.db.prepare(
                        'SELECT user_id, username, points FROM leaderboard_entries WHERE season_id = ? ORDER BY points DESC LIMIT 10'
                    ).all(activeSeason.id);
                    
                    leaderboard = seasonLeaderboard.map((entry, index) => ({
                        username: entry.username,
                        points: entry.points,
                        rank: index + 1
                    }));
                }
            }

            // Emit leaderboard display event
            this.api.emit('quiz-show:show-leaderboard', {
                leaderboard,
                displayType,
                animationStyle
            });

            // Auto-hide leaderboard after configured delay
            if (this.config.leaderboardAutoHideDelay > 0) {
                setTimeout(() => {
                    this.api.emit('quiz-show:hide-leaderboard');
                }, this.config.leaderboardAutoHideDelay * 1000);
            }
        } catch (error) {
            this.api.log('Error showing leaderboard: ' + error.message, 'error');
        }
    }

    async showLeaderboardAtEnd() {
        try {
            const displayType = this.config.leaderboardEndGameDisplayType || 'season';
            const animationStyle = this.config.leaderboardAnimationStyle || 'fade';
            
            let leaderboard = [];

            if (displayType === 'season') {
                // Get season leaderboard
                const activeSeason = this.db.prepare('SELECT id FROM leaderboard_seasons WHERE is_active = 1').get();
                if (activeSeason) {
                    const seasonLeaderboard = this.db.prepare(
                        'SELECT user_id, username, points FROM leaderboard_entries WHERE season_id = ? ORDER BY points DESC LIMIT 10'
                    ).all(activeSeason.id);
                    
                    leaderboard = seasonLeaderboard.map((entry, index) => ({
                        username: entry.username,
                        points: entry.points,
                        rank: index + 1
                    }));
                }
            } else {
                // Show last round results
                const results = this.calculateResults();
                leaderboard = results.correctUsers.map((user, index) => ({
                    username: user.username,
                    points: index === 0 ? this.config.pointsFirstCorrect : this.config.pointsOtherCorrect,
                    rank: index + 1
                }));
            }

            // Emit leaderboard display event
            this.api.emit('quiz-show:show-leaderboard', {
                leaderboard,
                displayType,
                animationStyle
            });
        } catch (error) {
            this.api.log('Error showing end game leaderboard: ' + error.message, 'error');
        }
    }

    calculateResults() {
        const correctAnswerIndex = this.gameState.currentQuestion.correct;
        const correctAnswerText = this.gameState.currentQuestion.answers[correctAnswerIndex];

        const correctUsers = [];
        const answers = Array.from(this.gameState.answers.entries());

        // Sort by timestamp
        answers.sort((a, b) => a[1].timestamp - b[1].timestamp);

        // Find correct answers
        for (const [userId, answerData] of answers) {
            if (this.isAnswerCorrect(answerData.answer, correctAnswerIndex, correctAnswerText)) {
                correctUsers.push({
                    userId,
                    username: answerData.username,
                    timestamp: answerData.timestamp,
                    answer: answerData.answer
                });
            }
        }

        // Award points
        if (correctUsers.length > 0) {
            // First correct answer
            const firstUser = correctUsers[0];
            this.addPoints(firstUser.userId, firstUser.username, this.config.pointsFirstCorrect);

            // Other correct answers (if multiple winners enabled)
            if (this.config.multipleWinners && correctUsers.length > 1) {
                for (let i = 1; i < correctUsers.length; i++) {
                    const user = correctUsers[i];
                    this.addPoints(user.userId, user.username, this.config.pointsOtherCorrect);
                }
            }
        }

        return {
            correctUsers,
            totalAnswers: this.gameState.answers.size,
            correctAnswer: {
                index: correctAnswerIndex,
                text: correctAnswerText
            }
        };
    }

    isAnswerCorrect(answer, correctIndex, correctText) {
        const normalized = answer.toLowerCase().trim();

        // Check letter (A, B, C, D)
        const letters = ['a', 'b', 'c', 'd'];
        if (normalized === letters[correctIndex]) {
            return true;
        }

        // Check full text match
        if (normalized === correctText.toLowerCase().trim()) {
            return true;
        }

        return false;
    }

    addPoints(userId, username, points) {
        try {
            const activeSeason = this.db.prepare('SELECT id FROM leaderboard_seasons WHERE is_active = 1').get();
            if (!activeSeason) {
                this.api.log('No active season found', 'warn');
                return;
            }

            // Check if entry exists
            const existing = this.db.prepare(`
                SELECT points FROM quiz_leaderboard_entries 
                WHERE season_id = ? AND user_id = ?
            `).get(activeSeason.id, userId);

            if (existing) {
                // Update existing entry
                this.db.prepare(`
                    UPDATE quiz_leaderboard_entries 
                    SET points = points + ?, username = ? 
                    WHERE season_id = ? AND user_id = ?
                `).run(points, username, activeSeason.id, userId);
            } else {
                // Insert new entry
                this.db.prepare(`
                    INSERT INTO quiz_leaderboard_entries (season_id, user_id, username, points) 
                    VALUES (?, ?, ?, ?)
                `).run(activeSeason.id, userId, username, points);
            }

            // Get updated total points
            const updated = this.db.prepare(`
                SELECT points FROM quiz_leaderboard_entries 
                WHERE season_id = ? AND user_id = ?
            `).get(activeSeason.id, userId);

            // Broadcast leaderboard update
            const leaderboardData = this.db.prepare(`
                SELECT user_id as userId, username, points 
                FROM quiz_leaderboard_entries 
                WHERE season_id = ? 
                ORDER BY points DESC
            `).all(activeSeason.id);

            this.api.emit('quiz-show:leaderboard-updated', leaderboardData);

            // Broadcast specific user point gain
            this.api.emit('quiz-show:points-awarded', {
                userId,
                username,
                points,
                totalPoints: updated.points
            });

            // Play sound effect
            this.playSound(points > 0 ? 'answer_correct' : 'answer_wrong');
        } catch (error) {
            this.api.log('Error adding points: ' + error.message, 'error');
        }
    }

    playSound(eventName) {
        try {
            const sound = this.db.prepare('SELECT * FROM game_sounds WHERE event_name = ?').get(eventName);
            if (sound && sound.file_path) {
                this.api.emit('quiz-show:play-sound', {
                    eventName,
                    filePath: sound.file_path,
                    volume: sound.volume || 1.0
                });
            }
        } catch (error) {
            this.api.log('Error playing sound: ' + error.message, 'error');
        }
    }

    handleAnswer(userId, username, message, profilePictureUrl = null) {
        // Check if user is eliminated (elimination mode)
        if (this.config.gameMode === 'elimination' && this.gameState.eliminatedUsers.has(userId)) {
            return;
        }

        // Check if user already answered
        if (this.gameState.answers.has(userId)) {
            return;
        }

        const normalized = message.toLowerCase().trim();

        // Check if it's a valid answer (A/B/C/D or full text)
        const validLetters = ['a', 'b', 'c', 'd'];
        const isLetter = validLetters.includes(normalized);
        const isFullText = this.gameState.currentQuestion.answers.some(
            ans => ans.toLowerCase().trim() === normalized
        );

        if (!isLetter && !isFullText) {
            return;
        }

        // Determine which answer index this is for
        let answerIndex = -1;
        if (isLetter) {
            answerIndex = validLetters.indexOf(normalized);
        } else {
            // Find index of matching answer text
            answerIndex = this.gameState.currentQuestion.answers.findIndex(
                ans => ans.toLowerCase().trim() === normalized
            );
        }

        // Record answer with profile picture
        this.gameState.answers.set(userId, {
            answer: message,
            username,
            timestamp: Date.now(),
            profilePictureUrl,
            answerIndex
        });

        // Add to votersPerAnswer for icon display
        if (answerIndex >= 0 && answerIndex < 4) {
            this.gameState.votersPerAnswer[answerIndex].push({
                userId,
                username,
                profilePictureUrl
            });
        }

        // Fastest Finger mode - end round immediately on first correct answer
        if (this.config.gameMode === 'fastestFinger') {
            const correctAnswerIndex = this.gameState.currentQuestion.correct;
            const correctAnswerText = this.gameState.currentQuestion.answers[correctAnswerIndex];
            
            if (this.isAnswerCorrect(message, correctAnswerIndex, correctAnswerText)) {
                // Correct answer - end round immediately
                setTimeout(() => this.endRound(), 100);
            }
        }

        // Marathon mode - check for streak
        if (this.config.gameMode === 'marathon') {
            const correctAnswerIndex = this.gameState.currentQuestion.correct;
            const correctAnswerText = this.gameState.currentQuestion.answers[correctAnswerIndex];
            
            if (this.isAnswerCorrect(message, correctAnswerIndex, correctAnswerText)) {
                if (!this.gameState.marathonPlayerId) {
                    // First correct answer in marathon
                    this.gameState.marathonPlayerId = userId;
                    this.gameState.marathonProgress = 1;
                } else if (this.gameState.marathonPlayerId === userId) {
                    // Same player continues streak
                    this.gameState.marathonProgress++;
                    
                    // Check if marathon completed
                    if (this.gameState.marathonProgress >= this.config.marathonLength) {
                        this.api.emit('quiz-show:marathon-completed', {
                            userId,
                            username,
                            length: this.gameState.marathonProgress
                        });
                        // Award jackpot bonus
                        this.addPoints(userId, username, this.config.pointsFirstCorrect * 5);
                    }
                }
            } else if (this.gameState.marathonPlayerId === userId) {
                // Wrong answer - reset streak
                this.gameState.marathonProgress = 0;
                this.gameState.marathonPlayerId = null;
            }
        }

        // Broadcast answer count update
        this.api.emit('quiz-show:answer-received', {
            userId,
            username,
            totalAnswers: this.gameState.answers.size
        });
    }

    handleJokerCommand(userId, username, message, isGiftActivated = false) {
        const command = message.toLowerCase().trim();

        // Check joker limits
        const totalJokers = Object.values(this.gameState.jokersUsed).reduce((sum, count) => sum + count, 0);

        if (totalJokers >= this.config.jokersPerRound) {
            return;
        }

        let jokerType = null;
        let jokerData = null;

        if (command === '!joker25' && this.config.joker25Enabled && this.gameState.jokersUsed['25'] === 0) {
            // 25% Joker - removes 1 wrong answer
            jokerType = '25';
            jokerData = this.activate25Joker();
            this.gameState.jokersUsed['25']++;
        } else if (command === '!joker50' && this.config.joker50Enabled && this.gameState.jokersUsed['50'] === 0) {
            // 50:50 Joker
            jokerType = '50';
            jokerData = this.activate5050Joker();
            this.gameState.jokersUsed['50']++;
        } else if (command === '!jokerinfo' && this.config.jokerInfoEnabled && this.gameState.jokersUsed['info'] === 0) {
            // Info Joker
            jokerType = 'info';
            jokerData = this.activateInfoJoker();
            this.gameState.jokersUsed['info']++;
        } else if (command === '!jokertime' && this.config.jokerTimeEnabled && this.gameState.jokersUsed['time'] === 0) {
            // Time Joker
            jokerType = 'time';
            jokerData = this.activateTimeJoker();
            this.gameState.jokersUsed['time']++;
        }

        if (jokerType) {
            const jokerEvent = {
                type: jokerType,
                userId,
                username,
                timestamp: Date.now(),
                data: jokerData,
                isGiftActivated
            };

            this.gameState.jokerEvents.push(jokerEvent);

            // Play joker activation sound
            this.playSound('joker_activated');

            // Broadcast joker activation
            this.api.emit('quiz-show:joker-activated', jokerEvent);

            this.api.log(`Joker ${jokerType} activated by ${username}${isGiftActivated ? ' (via gift)' : ''}`, 'info');
        }
    }

    activate25Joker() {
        const wrongIndices = this.getAvailableWrongAnswers();

        // Remove 1 wrong answer
        if (wrongIndices.length > 0) {
            const randomIdx = Math.floor(Math.random() * wrongIndices.length);
            const toHide = wrongIndices[randomIdx];
            this.gameState.hiddenAnswers.push(toHide);

            return { hiddenAnswers: [toHide] };
        }

        return null;
    }

    activate5050Joker() {
        const wrongIndices = this.getAvailableWrongAnswers();

        // Remove 2 wrong answers
        const toHide = [];
        for (let i = 0; i < 2 && wrongIndices.length > 0; i++) {
            const randomIdx = Math.floor(Math.random() * wrongIndices.length);
            toHide.push(wrongIndices[randomIdx]);
            wrongIndices.splice(randomIdx, 1);
        }

        this.gameState.hiddenAnswers.push(...toHide);

        return { hiddenAnswers: toHide };
    }

    getAvailableWrongAnswers() {
        const correctIndex = this.gameState.currentQuestion.correct;
        return [0, 1, 2, 3].filter(i => 
            i !== correctIndex && !this.gameState.hiddenAnswers.includes(i)
        );
    }

    activateInfoJoker() {
        const correctIndex = this.gameState.currentQuestion.correct;
        const wrongIndices = [0, 1, 2, 3].filter(i =>
            i !== correctIndex && !this.gameState.hiddenAnswers.includes(i)
        );

        if (wrongIndices.length > 0) {
            const wrongIndex = wrongIndices[Math.floor(Math.random() * wrongIndices.length)];
            this.gameState.revealedWrongAnswer = wrongIndex;

            return { revealedWrongAnswer: wrongIndex };
        }

        return null;
    }

    activateTimeJoker() {
        const boost = this.config.jokerTimeBoost;
        this.gameState.endTime += boost * 1000;

        return { timeBoost: boost };
    }

    broadcastGameState() {
        const state = {
            isRunning: this.gameState.isRunning,
            roundState: this.gameState.roundState,
            currentQuestion: {
                question: this.gameState.currentQuestion.question,
                answers: this.gameState.currentQuestion.answers,
                // Don't send correct answer to overlay yet
            },
            timeRemaining: this.gameState.timeRemaining,
            totalTime: this.config.roundDuration,
            answerCount: this.gameState.answers.size,
            jokersUsed: this.gameState.jokersUsed,
            jokerEvents: this.gameState.jokerEvents,
            hiddenAnswers: this.gameState.hiddenAnswers,
            revealedWrongAnswer: this.gameState.revealedWrongAnswer,
            giftJokerMappings: this.config.giftJokerMappings || {}, // NEW: Include gift-joker mappings
            votersPerAnswer: this.gameState.votersPerAnswer, // Include voter icon data
            voterIconsConfig: {
                enabled: this.config.voterIconsEnabled,
                size: this.config.voterIconSize,
                maxVisible: this.config.voterIconMaxVisible,
                compactMode: this.config.voterIconCompactMode,
                animation: this.config.voterIconAnimation,
                position: this.config.voterIconPosition
            }
        };

        this.api.emit('quiz-show:state-update', state);
    }

    resetGameState() {
        this.gameState = {
            isRunning: false,
            currentQuestion: null,
            currentQuestionIndex: -1, // Deprecated: kept for backwards compatibility
            currentQuestionId: null,
            startTime: null,
            endTime: null,
            timeRemaining: 0,
            answers: new Map(),
            correctUsers: [],
            roundState: 'idle',
            jokersUsed: {
                '25': 0,
                '50': 0,
                'info': 0,
                'time': 0
            },
            jokerEvents: [],
            hiddenAnswers: [],
            revealedWrongAnswer: null,
            eliminatedUsers: new Set(),
            marathonProgress: 0,
            marathonPlayerId: null,
            votersPerAnswer: {
                0: [],
                1: [],
                2: [],
                3: []
            },
            askedQuestionIds: new Set() // Reset asked questions tracking
        };
        
        // Clear TTS cache on reset
        this.ttsCache = {
            nextQuestionId: null,
            audioUrl: null,
            text: null
        };
    }

    /**
     * Pre-generate TTS for the next question to eliminate playback delay
     * @param {Object} nextQuestion - The next question to pre-generate TTS for
     */
    async preGenerateTTS(nextQuestion) {
        if (!this.config.ttsEnabled) return;
        if (!nextQuestion) return;

        try {
            // Check if we already have TTS for this question
            if (this.ttsCache.nextQuestionId === nextQuestion.id) {
                this.api.log('TTS already pre-generated for next question', 'debug');
                return;
            }

            // Prepare answers (shuffle if configured, same as in startRound)
            let answers = [...nextQuestion.answers];
            let correctIndex = nextQuestion.correct;

            if (this.config.shuffleAnswers) {
                const answerMapping = answers.map((ans, idx) => ({ ans, originalIdx: idx }));
                for (let i = answerMapping.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [answerMapping[i], answerMapping[j]] = [answerMapping[j], answerMapping[i]];
                }
                answers = answerMapping.map(item => item.ans);
                correctIndex = answerMapping.findIndex(item => item.originalIdx === nextQuestion.correct);
            }

            const ttsText = `Neue Frage: ${nextQuestion.question}. Antworten: A: ${answers[0]}, B: ${answers[1]}, C: ${answers[2]}, D: ${answers[3]}`;
            
            // Parse voice format: "engine:voiceId" or "default"
            let engine = null;
            let voiceId = null;
            
            const voiceConfig = this.config.ttsVoice || 'default';
            if (voiceConfig !== 'default' && voiceConfig.includes(':')) {
                const parts = voiceConfig.split(':');
                engine = parts[0];
                voiceId = parts[1];
            }
            
            // Pre-generate TTS audio via HTTP API
            const port = process.env.PORT || 3000;
            const response = await axios.post(`http://localhost:${port}/api/tts/generate`, {
                text: ttsText,
                userId: 'quiz-show-preload',
                username: 'Quiz Show',
                voiceId: voiceId,
                engine: engine,
                source: 'quiz-show',
                preload: true // Flag to indicate this is for pre-loading
            });

            // Cache the audio URL or data
            if (response.data && response.data.success) {
                this.ttsCache = {
                    nextQuestionId: nextQuestion.id,
                    audioUrl: response.data.audioUrl,
                    text: ttsText
                };
                this.api.log(`TTS pre-generated for question ${nextQuestion.id}`, 'debug');
            }
        } catch (error) {
            this.api.log(`TTS pre-generation error: ${error.message}`, 'warn');
            // Don't fail the quiz on TTS errors
        }
    }

    /**
     * Play pre-generated TTS or generate on-the-fly if not available
     */
    async playTTS(questionId, ttsText, voiceConfig) {
        if (!this.config.ttsEnabled) return;

        try {
            // Check if we have pre-generated TTS for this question
            if (this.ttsCache.nextQuestionId === questionId && this.ttsCache.audioUrl) {
                this.api.log('Playing pre-generated TTS', 'debug');
                
                // Play the cached TTS
                const port = process.env.PORT || 3000;
                await axios.post(`http://localhost:${port}/api/tts/play`, {
                    audioUrl: this.ttsCache.audioUrl,
                    source: 'quiz-show'
                });

                // Clear the cache after use
                this.ttsCache = {
                    nextQuestionId: null,
                    audioUrl: null,
                    text: null
                };
            } else {
                // Fall back to on-the-fly generation
                this.api.log('Generating TTS on-the-fly (no pre-generated audio)', 'debug');
                
                let engine = null;
                let voiceId = null;
                
                if (voiceConfig !== 'default' && voiceConfig.includes(':')) {
                    const parts = voiceConfig.split(':');
                    engine = parts[0];
                    voiceId = parts[1];
                }
                
                const port = process.env.PORT || 3000;
                await axios.post(`http://localhost:${port}/api/tts/speak`, {
                    text: ttsText,
                    userId: 'quiz-show',
                    username: 'Quiz Show',
                    voiceId: voiceId,
                    engine: engine,
                    source: 'quiz-show'
                });
            }
        } catch (error) {
            this.api.log(`TTS playback error: ${error.message}`, 'error');
        }
    }

    getMVPPlayer() {
        try {
            const activeSeason = this.db.prepare('SELECT id FROM leaderboard_seasons WHERE is_active = 1').get();
            if (!activeSeason) return null;

            const mvp = this.db.prepare(`
                SELECT user_id as userId, username, points 
                FROM quiz_leaderboard_entries 
                WHERE season_id = ? 
                ORDER BY points DESC 
                LIMIT 1
            `).get(activeSeason.id);

            return mvp;
        } catch (error) {
            this.api.log('Error getting MVP: ' + error.message, 'error');
            return null;
        }
    }

    async destroy() {
        // Cleanup
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }

        // Close database connection
        if (this.db) {
            this.db.close();
        }

        await this.saveConfig();

        this.api.log('Quiz Show Plugin destroyed', 'info');
    }
}

module.exports = QuizShowPlugin;
