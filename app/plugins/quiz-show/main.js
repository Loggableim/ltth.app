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
        this.MIN_ANSWER_DISPLAY_DURATION = 6; // Minimum seconds to display correct answer (requirement)
        this.LEADERBOARD_DISPLAY_DURATION = 6; // Fixed seconds to display leaderboard after question (requirement)
        this.DEFAULT_UNLIMITED_ROUNDS = 10;
        this.MIN_DIFFICULTY = 1;
        this.MAX_DIFFICULTY = 4;

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
            totalRounds: 10, // Total rounds in a quiz session (0 = unlimited)
            showRoundNumber: true, // Show round number in overlay
            ttsEnabled: false,
            ttsVoice: 'default',
            ttsVolume: 80, // NEW: TTS volume (0-100%)
            ttsSpeed: 1.0, // NEW: TTS speed (0.5-2.0, 1.0 = normal)
            ttsStartDelay: 2, // Seconds to wait for TTS before showing question
            autoMode: false, // Auto advance to next question
            autoModeDelay: 5, // Seconds to wait before auto-advancing
            autoRestartRound: true, // Auto-restart a new round after the current round ends
            answerDisplayDuration: this.MIN_ANSWER_DISPLAY_DURATION, // Seconds to display the correct answer (including info text)
            questionCooldownHours: 24, // Sliding cooldown before a question can repeat
            activeShowId: null, // Optional quiz show / playlist id
            categoryVotingEnabled: false,
            categoryVoteDuration: 20,
            categoryVoteCommand: '!vote',
            categoryVoteBeforeQuestion: false,
            categoryVoteOptionsLimit: 4,
            // Voter Icons Configuration
            voterIconsEnabled: true,
            voterIconSize: 'medium', // small, medium, large
            voterIconMaxVisible: 10, // Max icons to show per answer
            voterIconCompactMode: true, // Enable compact mode for many voters
            voterIconAnimation: 'fade', // fade, slide
            voterIconPosition: 'above', // above, beside, embedded
            voterIconShowOnScoreboard: false, // Show avatars in scoreboard
            avatarPerformanceMode: 'balanced', // full, balanced, minimal
            avatarCacheEnabled: true,
            // Overlay accessibility and theme presets
            hudThemePreset: 'neon', // minimal, neon, retro, casino, highContrast
            reducedMotion: false,
            highContrast: false,
            // NEW: Leaderboard display configuration
            leaderboardShowAfterRound: true,
            leaderboardShowAfterQuestion: true, // Show leaderboard after each question
            leaderboardQuestionDisplayType: 'season', // 'round', 'season', 'both' - for after question
            leaderboardRoundDisplayType: 'both', // 'round', 'season', 'both' - for after round
            leaderboardEndGameDisplayType: 'season', // 'round', 'season'
            leaderboardAutoHideDelay: this.LEADERBOARD_DISPLAY_DURATION, // seconds - fixed for after-question leaderboard
            leaderboardAnimationStyle: 'fade', // 'fade', 'slide', 'zoom'
            // NEW: Gift-Joker Integration
            giftJokersEnabled: true,
            giftJokerMappings: {}, // { giftId: jokerType } - loaded from database
            giftJokerShowInHUD: true, // Show gift graphics in HUD
            // NEW: Quiz-Start Gift Configuration
            quizStartGiftEnabled: false,
            quizStartGiftId: null,
            quizStartGiftName: null,
            // NEW: Custom Layout
            activeLayoutId: null, // ID of active layout from overlay_layouts table
            customLayoutEnabled: false, // Use custom layout vs default
            // NEW: Chat Command Configuration
            allowPlainLetters: true, // Allow simple "a", "b", "c", "d"
            allowExclamation: true, // Allow "!a", "!b", "!c", "!d"
            allowSlash: false, // Allow "/a", "/b", "/c", "/d"
            allowFullText: true, // Allow full answer text
            jokerCommandPrefix: '!joker', // Prefix for joker commands
            jokerSuperfanOnly: true, // Restrict jokers to superfans
            answerPermissionLevel: 'all', // 'all', 'subscriber', 'superfan', 'moderator'
            useGCCE: false, // Use Global Chat Command Engine integration
            // NEW: Ultra-Kompakt-Modus
            ultraKompaktModus: false, // Ultra-compact mode: question first, then answers (fits in 600x350)
            ultraKompaktAnswerDelay: 3, // Seconds to wait before showing answers in ultra-compact mode
            // NEW: Slot Machine Mode
            slotMachineEnabled: false, // Enable slot machine category selection
            slotMachineSpinDuration: 3, // Duration of slot machine spin animation in seconds
            slotMachineSpinSpeed: 100, // Speed of category changes in milliseconds
            slotMachineAutoStart: false, // Automatically trigger slot machine when starting quiz
            // NEW: Last Man Standing Mode
            lastManStandingEnabled: false, // Enable Last Man Standing game mode
            lastManStandingJoinTime: 60, // Seconds for join phase before round 1
            lastManStandingInitialTime: 30, // Initial round time in seconds
            lastManStandingMinTime: 10, // Minimum round time after decrements
            lastManStandingDecrement: 2, // Time decrement per round after round 10 (seconds)
            lastManStandingDecrementFromRound: 10, // Round number to start time decrements
            // Expansion defaults
            achievementPopupsEnabled: true,
            achievementsEnabled: true,
            seasonAutomationMode: 'manual', // manual, weekly, monthly
            seasonAutomationDay: 1, // 0-6 for weekly, 1-28 for monthly
            setupWizardCompleted: false,
            setupWizardStep: 'questions',
            healthOverlayTestMode: false
        };

        // Current game state
        this.gameState = {
            isRunning: false,
            currentQuestion: null,
            currentQuestionIndex: -1, // Deprecated: kept for backwards compatibility
            currentQuestionId: null, // ID of the current question being asked
            currentRound: 0, // Current round number (increments with each question)
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
            askedQuestionIds: new Set(), // Set of question IDs asked in current session
            // Store original category filter before slot machine modifies it
            originalCategoryFilter: null,
            // Slot machine state
            slotMachineActive: false,
            slotMachineTimeout: null,
            // Category voting state
            categoryVote: {
                active: false,
                options: [],
                votesByUser: {},
                votesByCategory: {},
                startedAt: null,
                endsAt: null,
                selectedCategory: null
            },
            categoryVoteTimeout: null,
            // Duel mode state
            duel: {
                active: false,
                left: { label: 'Team A', users: [], score: 0, streak: 0, lastAnswerCorrect: null },
                right: { label: 'Team B', users: [], score: 0, streak: 0, lastAnswerCorrect: null },
                winner: null
            },
            userStreaks: {},
            categoryCorrectCounts: {},
            pointsAwardedForRound: false,
            // NEW: Last Man Standing state
            lastManStanding: {
                active: false,
                survivors: new Set(), // userIds still in the game
                eliminated: new Set(), // userIds eliminated
                joinPhase: false,
                joinEndTime: null,
                currentRoundTime: null
            }
        };

        // Timer interval
        this.timerInterval = null;

        // Auto mode timeout
        this.autoModeTimeout = null;

        // End game timeouts
        this.endGameTimeout = null;
        this.endGameAutoRestartTimeout = null;
        this.matchLeaderboardTimeout = null;
        this.seasonLeaderboardTimeout = null;

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

        // Load quiz-start gift configuration from database
        this.loadQuizStartGiftConfig();

        // Load leaderboard display configuration from database
        this.loadLeaderboardDisplayConfig();

        // Load slot machine configuration from database
        this.loadSlotMachineConfig();

        // Load expansion configuration from database
        this.loadSeasonAutomationConfig();
        this.loadSetupWizardState();

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
                    show_after_question BOOLEAN DEFAULT FALSE,
                    question_display_type TEXT DEFAULT 'season' CHECK(question_display_type IN ('round', 'season', 'both')),
                    round_display_type TEXT DEFAULT 'both' CHECK(round_display_type IN ('round', 'season', 'both')),
                    end_game_display_type TEXT DEFAULT 'season' CHECK(end_game_display_type IN ('round', 'season')),
                    auto_hide_delay INTEGER DEFAULT 10,
                    animation_style TEXT DEFAULT 'fade' CHECK(animation_style IN ('fade', 'slide', 'zoom'))
                );

                CREATE TABLE IF NOT EXISTS quiz_start_gift_config (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    enabled BOOLEAN DEFAULT FALSE,
                    gift_id INTEGER DEFAULT NULL,
                    gift_name TEXT DEFAULT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS slot_machine_config (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    enabled BOOLEAN DEFAULT FALSE,
                    spin_duration REAL DEFAULT 3.0,
                    spin_speed INTEGER DEFAULT 100,
                    auto_start BOOLEAN DEFAULT FALSE,
                    spin_sound_path TEXT DEFAULT NULL,
                    stop_sound_path TEXT DEFAULT NULL,
                    win_sound_path TEXT DEFAULT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS quiz_shows (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    categories TEXT DEFAULT '[]',
                    package_ids TEXT DEFAULT '[]',
                    round_count INTEGER DEFAULT 10,
                    question_order TEXT DEFAULT 'random' CHECK(question_order IN ('random', 'sequential')),
                    audience_voting BOOLEAN DEFAULT FALSE,
                    is_active BOOLEAN DEFAULT FALSE,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS category_vote_sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    options TEXT NOT NULL,
                    votes TEXT DEFAULT '{}',
                    selected_category TEXT,
                    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    ended_at DATETIME
                );

                CREATE TABLE IF NOT EXISTS achievement_rules (
                    id TEXT PRIMARY KEY,
                    label TEXT NOT NULL,
                    type TEXT NOT NULL,
                    threshold INTEGER DEFAULT 1,
                    enabled BOOLEAN DEFAULT TRUE
                );

                CREATE TABLE IF NOT EXISTS user_achievements (
                    user_id TEXT NOT NULL,
                    username TEXT NOT NULL,
                    achievement_id TEXT NOT NULL,
                    achievement_label TEXT NOT NULL,
                    unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (user_id, achievement_id)
                );

                CREATE TABLE IF NOT EXISTS sound_assets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_name TEXT NOT NULL UNIQUE,
                    file_name TEXT NOT NULL,
                    file_path TEXT NOT NULL,
                    volume REAL DEFAULT 1.0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS season_automation_config (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    mode TEXT DEFAULT 'manual' CHECK(mode IN ('manual', 'weekly', 'monthly')),
                    rollover_day INTEGER DEFAULT 1,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS setup_wizard_state (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    completed BOOLEAN DEFAULT FALSE,
                    current_step TEXT DEFAULT 'questions',
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE INDEX IF NOT EXISTS idx_questions_category ON questions(category);
                CREATE INDEX IF NOT EXISTS idx_questions_difficulty ON questions(difficulty);
                CREATE INDEX IF NOT EXISTS idx_questions_package ON questions(package_id);
                CREATE INDEX IF NOT EXISTS idx_package_category ON question_packages(category);
                CREATE INDEX IF NOT EXISTS idx_question_history_asked_at ON question_history(asked_at);
                CREATE INDEX IF NOT EXISTS idx_question_history_question_id ON question_history(question_id);
                CREATE INDEX IF NOT EXISTS idx_gift_joker_gift_id ON gift_joker_mappings(gift_id);
                CREATE INDEX IF NOT EXISTS idx_overlay_layouts_orientation ON overlay_layouts(orientation);
                CREATE INDEX IF NOT EXISTS idx_quiz_shows_active ON quiz_shows(is_active);
                CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);
            `);
            
            // Create quiz_leaderboard_entries in main scoped database (per-streamer)
            this.mainDb.exec(`
                CREATE TABLE IF NOT EXISTS quiz_leaderboard_entries (
                    season_id INTEGER NOT NULL,
                    user_id TEXT NOT NULL,
                    username TEXT NOT NULL,
                    points INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY (season_id, user_id)
                );
                
                CREATE INDEX IF NOT EXISTS idx_quiz_leaderboard_season ON quiz_leaderboard_entries(season_id);
                CREATE INDEX IF NOT EXISTS idx_quiz_leaderboard_points ON quiz_leaderboard_entries(points DESC);
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
                this.db.prepare('INSERT INTO leaderboard_display_config (id, show_after_round, show_after_question, question_display_type, round_display_type, end_game_display_type, auto_hide_delay, animation_style) VALUES (1, 1, 0, ?, ?, ?, 10, ?)')
                    .run('season', 'both', 'season', 'fade');
            }

            // Initialize slot machine config if not exists
            const slotMachineConfig = this.db.prepare('SELECT id FROM slot_machine_config WHERE id = 1').get();
            if (!slotMachineConfig) {
                this.db.prepare('INSERT INTO slot_machine_config (id, enabled, spin_duration, spin_speed, auto_start) VALUES (1, 0, 3.0, 100, 0)').run();
            }

            const seasonAutomationConfig = this.db.prepare('SELECT id FROM season_automation_config WHERE id = 1').get();
            if (!seasonAutomationConfig) {
                this.db.prepare('INSERT INTO season_automation_config (id, mode, rollover_day) VALUES (1, ?, ?)')
                    .run(this.config.seasonAutomationMode, this.config.seasonAutomationDay);
            }

            const setupWizardState = this.db.prepare('SELECT id FROM setup_wizard_state WHERE id = 1').get();
            if (!setupWizardState) {
                this.db.prepare('INSERT INTO setup_wizard_state (id, completed, current_step) VALUES (1, 0, ?)')
                    .run(this.config.setupWizardStep);
            }

            const insertAchievementRule = this.db.prepare(`
                INSERT OR IGNORE INTO achievement_rules (id, label, type, threshold, enabled)
                VALUES (?, ?, ?, ?, ?)
            `);
            for (const rule of this.getDefaultAchievementRules()) {
                insertAchievementRule.run(rule.id, rule.label, rule.type, rule.threshold, rule.enabled ? 1 : 0);
            }

            // Initialize default overlay layouts if none exist
            const insertOverlayLayout = this.db.prepare('INSERT INTO overlay_layouts (name, resolution_width, resolution_height, orientation, is_default, layout_config) VALUES (?, ?, ?, ?, ?, ?)');
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
                insertOverlayLayout.run('Default Horizontal', 1920, 1080, 'horizontal', 1, JSON.stringify(horizontalLayout));

                // Default vertical layout (1080x1920)
                const verticalLayout = {
                    question: { x: 40, y: 100, width: 1000, height: 300 },
                    answers: { x: 40, y: 450, width: 1000, height: 800 },
                    timer: { x: 440, y: 1300, width: 200, height: 200 },
                    leaderboard: { x: 40, y: 1550, width: 1000, height: 320 },
                    jokerInfo: { x: 40, y: 50, width: 400, height: 100 }
                };
                insertOverlayLayout.run('Default Vertical', 1080, 1920, 'vertical', 1, JSON.stringify(verticalLayout));
            }

            const splitscreenLayoutExists = this.db.prepare('SELECT id FROM overlay_layouts WHERE LOWER(name) = ?').get('splitscreen');
            if (!splitscreenLayoutExists) {
                const splitscreenLayout = {
                    mode: 'splitscreen',
                    question: { x: 170, y: 1010, width: 740, height: 150, visible: true },
                    answers: { x: 170, y: 1175, width: 740, height: 420, visible: true },
                    timer: { x: 170, y: 970, width: 740, height: 34, visible: true },
                    leaderboard: { x: 170, y: 1010, width: 740, height: 650, visible: true },
                    jokerInfo: { x: 170, y: 1610, width: 740, height: 90, visible: true }
                };
                insertOverlayLayout.run('splitscreen', 1080, 1920, 'vertical', 0, JSON.stringify(splitscreenLayout));
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

            // Add new leaderboard display config columns if they don't exist
            const leaderboardConfigColumns = this.db.pragma('table_info(leaderboard_display_config)');
            const hasShowAfterQuestion = leaderboardConfigColumns.some(col => col.name === 'show_after_question');
            const hasQuestionDisplayType = leaderboardConfigColumns.some(col => col.name === 'question_display_type');
            
            if (!hasShowAfterQuestion) {
                this.api.log('Adding show_after_question column to leaderboard_display_config...', 'info');
                this.db.exec('ALTER TABLE leaderboard_display_config ADD COLUMN show_after_question BOOLEAN DEFAULT FALSE');
            }
            
            if (!hasQuestionDisplayType) {
                this.api.log('Adding question_display_type column to leaderboard_display_config...', 'info');
                this.db.exec("ALTER TABLE leaderboard_display_config ADD COLUMN question_display_type TEXT DEFAULT 'season' CHECK(question_display_type IN ('round', 'season', 'both'))");
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
                const insertMany = this.db.transaction((questions) => {
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
            const cutoff = this.getQuestionCooldownCutoff();
            const result = this.db.prepare('DELETE FROM question_history WHERE asked_at < ?').run(cutoff);
            
            if (result.changes > 0) {
                this.api.log(`Cleaned up ${result.changes} old question history entries`, 'info');
            }
        } catch (error) {
            this.api.log('Error cleaning up question history: ' + error.message, 'warn');
        }
    }

    getTodaysAskedQuestionIds() {
        try {
            const cooldownCutoff = this.getQuestionCooldownCutoff();
            const rows = this.db.prepare(
                'SELECT DISTINCT question_id FROM question_history WHERE asked_at >= ?'
            ).all(cooldownCutoff);
            
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

    getLastAskedMap() {
        try {
            const rows = this.db.prepare('SELECT question_id, MAX(asked_at) as last_asked FROM question_history GROUP BY question_id').all();
            const map = new Map();
            
            for (const row of rows) {
                const rawTimestamp = row.last_asked ? new Date(row.last_asked).getTime() : 0;
                const timestamp = isNaN(rawTimestamp) ? 0 : rawTimestamp;
                map.set(row.question_id, timestamp);
            }
            
            return map;
        } catch (error) {
            this.api.log('Error building last asked map: ' + error.message, 'warn');
            return new Map();
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

    getQuestionCooldownMs() {
        const hours = Number(this.config.questionCooldownHours);
        const safeHours = Number.isFinite(hours) && hours >= 0 ? hours : 24;
        return safeHours * 60 * 60 * 1000;
    }

    getQuestionCooldownCutoff() {
        return new Date(Date.now() - this.getQuestionCooldownMs()).toISOString();
    }

    normalizeVoteValue(value) {
        return String(value || '')
            .trim()
            .toLowerCase()
            .replace(/^#/, '');
    }

    startCategoryVote(categories = [], durationSeconds = this.config.categoryVoteDuration) {
        const options = [...new Set(categories.map(category => String(category || '').trim()).filter(Boolean))]
            .slice(0, Math.max(2, Number(this.config.categoryVoteOptionsLimit) || 4));

        if (options.length < 2) {
            return null;
        }

        if (this.gameState.categoryVoteTimeout) {
            clearTimeout(this.gameState.categoryVoteTimeout);
            this.gameState.categoryVoteTimeout = null;
        }

        const duration = Math.max(5, Math.min(120, Number(durationSeconds) || 20));
        const votesByCategory = {};
        for (const option of options) {
            votesByCategory[option] = 0;
        }

        this.gameState.categoryVote = {
            active: true,
            options,
            votesByUser: {},
            votesByCategory,
            startedAt: Date.now(),
            endsAt: Date.now() + duration * 1000,
            selectedCategory: null
        };

        this.api.emit('quiz-show:category-vote-started', this.gameState.categoryVote);
        this.api.emit('quiz-show:category-vote-update', this.gameState.categoryVote);

        this.gameState.categoryVoteTimeout = setTimeout(() => {
            this.finishCategoryVote();
        }, duration * 1000);
        if (this.gameState.categoryVoteTimeout.unref) {
            this.gameState.categoryVoteTimeout.unref();
        }

        return this.gameState.categoryVote;
    }

    resolveCategoryVote(message) {
        const voteState = this.gameState.categoryVote;
        if (!voteState || !voteState.active) {
            return null;
        }

        const trimmed = String(message || '').trim();
        const command = this.config.categoryVoteCommand || '!vote';
        let rawVote = trimmed;

        if (trimmed.toLowerCase().startsWith(command.toLowerCase())) {
            rawVote = trimmed.slice(command.length).trim();
        }

        const numericIndex = parseInt(rawVote, 10);
        if (Number.isInteger(numericIndex) && numericIndex >= 1 && numericIndex <= voteState.options.length) {
            return voteState.options[numericIndex - 1];
        }

        const normalized = this.normalizeVoteValue(rawVote);
        return voteState.options.find(option => this.normalizeVoteValue(option) === normalized) || null;
    }

    recordCategoryVote({ userId, username, message }) {
        const voteState = this.gameState.categoryVote;
        if (!voteState || !voteState.active || !userId) {
            return false;
        }

        if (voteState.votesByUser[userId]) {
            return false;
        }

        const category = this.resolveCategoryVote(message);
        if (!category) {
            return false;
        }

        voteState.votesByUser[userId] = {
            username: username || userId,
            category,
            votedAt: Date.now()
        };
        voteState.votesByCategory[category] = (voteState.votesByCategory[category] || 0) + 1;

        this.api.emit('quiz-show:category-vote-update', voteState);
        return true;
    }

    finishCategoryVote() {
        const voteState = this.gameState.categoryVote;
        if (!voteState || !voteState.active) {
            return {
                selectedCategory: voteState?.selectedCategory || null,
                vote: voteState || null
            };
        }

        if (this.gameState.categoryVoteTimeout) {
            clearTimeout(this.gameState.categoryVoteTimeout);
            this.gameState.categoryVoteTimeout = null;
        }

        let selectedCategory = voteState.options[0] || null;
        let highestVotes = -1;
        for (const option of voteState.options) {
            const count = voteState.votesByCategory[option] || 0;
            if (count > highestVotes) {
                highestVotes = count;
                selectedCategory = option;
            }
        }

        voteState.active = false;
        voteState.selectedCategory = selectedCategory;
        if (selectedCategory) {
            this.config.categoryFilter = [selectedCategory];
            this.saveConfig();
        }

        this.api.emit('quiz-show:category-vote-ended', {
            selectedCategory,
            votesByCategory: voteState.votesByCategory,
            totalVotes: Object.keys(voteState.votesByUser).length
        });

        return {
            selectedCategory,
            vote: voteState
        };
    }

    startDuel(options = {}) {
        const toUserList = (users) => Array.isArray(users)
            ? users.map(user => String(user || '').trim()).filter(Boolean)
            : String(users || '').split(',').map(user => user.trim()).filter(Boolean);

        this.gameState.duel = {
            active: true,
            left: {
                label: options.leftLabel || 'Team A',
                users: toUserList(options.leftUsers),
                score: 0,
                streak: 0,
                lastAnswerCorrect: null
            },
            right: {
                label: options.rightLabel || 'Team B',
                users: toUserList(options.rightUsers),
                score: 0,
                streak: 0,
                lastAnswerCorrect: null
            },
            winner: null
        };

        this.config.gameMode = 'duel';
        this.api.emit('quiz-show:duel-update', this.gameState.duel);
        return this.gameState.duel;
    }

    stopDuel() {
        if (!this.gameState.duel) {
            return null;
        }

        const duel = this.gameState.duel;
        if (duel.left.score > duel.right.score) {
            duel.winner = 'left';
        } else if (duel.right.score > duel.left.score) {
            duel.winner = 'right';
        } else {
            duel.winner = 'tie';
        }
        duel.active = false;
        this.api.emit('quiz-show:duel-ended', duel);
        return duel;
    }

    getDuelSideForUser(userId) {
        const duel = this.gameState.duel;
        if (!duel || !duel.active || !userId) {
            return null;
        }
        if (duel.left.users.includes(userId)) {
            return duel.left;
        }
        if (duel.right.users.includes(userId)) {
            return duel.right;
        }
        return null;
    }

    applyDuelAnswerResult(userId, isCorrect, points = 0) {
        const side = this.getDuelSideForUser(userId);
        if (!side) {
            return null;
        }

        side.lastAnswerCorrect = !!isCorrect;
        if (isCorrect) {
            side.score += Number(points) || 0;
            side.streak += 1;
        } else {
            side.streak = 0;
        }

        this.api.emit('quiz-show:duel-update', this.gameState.duel);
        return side;
    }

    getDefaultAchievementRules() {
        return [
            { id: 'fastest-answer', label: 'Schnellste Antwort', type: 'fastest', threshold: 1, enabled: true },
            { id: 'streak-3', label: '3er-Serie', type: 'streak', threshold: 3, enabled: true },
            { id: 'streak-5', label: '5er-Serie', type: 'streak', threshold: 5, enabled: true },
            { id: 'category-specialist', label: 'Kategorie-Profi', type: 'categoryCorrect', threshold: 5, enabled: true },
            { id: 'duel-winner', label: 'Duel-Sieg', type: 'duelWinner', threshold: 1, enabled: true }
        ];
    }

    evaluateAchievements(context = {}) {
        if (!this.config.achievementsEnabled) {
            return [];
        }

        const rules = this.getDefaultAchievementRules();
        const awards = [];

        for (const rule of rules) {
            if (!rule.enabled) continue;

            const matches =
                (rule.type === 'fastest' && context.isFirstCorrect) ||
                (rule.type === 'streak' && Number(context.streak || 0) >= rule.threshold) ||
                (rule.type === 'categoryCorrect' && Number(context.categoryCorrectCount || 0) >= rule.threshold) ||
                (rule.type === 'duelWinner' && context.duelWinner);

            if (matches) {
                awards.push({
                    id: rule.id,
                    label: rule.label,
                    userId: context.userId,
                    username: context.username,
                    unlockedAt: new Date().toISOString()
                });
            }
        }

        for (const award of awards) {
            this.persistAchievementAward(award);
            if (this.config.achievementPopupsEnabled) {
                this.api.emit('quiz-show:achievement-unlocked', award);
            }
        }

        return awards;
    }

    persistAchievementAward(award) {
        if (!this.db || !award.userId || !award.id) {
            return;
        }

        try {
            this.db.prepare(`
                INSERT OR IGNORE INTO user_achievements (user_id, username, achievement_id, achievement_label, unlocked_at)
                VALUES (?, ?, ?, ?, ?)
            `).run(award.userId, award.username || award.userId, award.id, award.label, award.unlockedAt);
        } catch (error) {
            this.api.log('Error persisting achievement: ' + error.message, 'warn');
        }
    }

    shouldRollSeason({ now = new Date(), activeSeason = null } = {}) {
        const mode = this.config.seasonAutomationMode || 'manual';
        if (mode === 'manual' || !activeSeason || !activeSeason.start_date) {
            return false;
        }

        const start = new Date(activeSeason.start_date);
        if (Number.isNaN(start.getTime())) {
            return false;
        }

        const current = new Date(now);
        if (mode === 'weekly') {
            const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
            return current.getTime() - start.getTime() >= oneWeekMs &&
                current.getUTCDay() === Number(this.config.seasonAutomationDay);
        }

        if (mode === 'monthly') {
            const day = Math.max(1, Math.min(28, Number(this.config.seasonAutomationDay) || 1));
            return (current.getUTCFullYear() > start.getUTCFullYear() ||
                current.getUTCMonth() > start.getUTCMonth()) &&
                current.getUTCDate() >= day;
        }

        return false;
    }

    checkSeasonAutomation() {
        if (!this.db) {
            return null;
        }

        try {
            const activeSeason = this.db.prepare('SELECT * FROM leaderboard_seasons WHERE is_active = 1').get();
            if (!this.shouldRollSeason({ activeSeason })) {
                return activeSeason || null;
            }

            const now = new Date().toISOString();
            const nextName = this.config.seasonAutomationMode === 'monthly'
                ? `Season ${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
                : `Season KW ${this.getISOWeek(new Date())}`;

            this.db.prepare('UPDATE leaderboard_seasons SET is_active = 0, end_date = ? WHERE is_active = 1').run(now);
            const result = this.db.prepare('INSERT INTO leaderboard_seasons (season_name, start_date, is_active) VALUES (?, ?, 1)')
                .run(nextName, now);
            const season = { id: result.lastInsertRowid, season_name: nextName, start_date: now, end_date: null, is_active: 1 };
            this.api.emit('quiz-show:season-changed', season);
            return season;
        } catch (error) {
            this.api.log('Error checking season automation: ' + error.message, 'warn');
            return null;
        }
    }

    getISOWeek(date) {
        const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
        return Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
    }

    isAllowedSoundFileName(fileName) {
        const baseName = path.basename(String(fileName || ''));
        if (!baseName || baseName !== fileName || !/^[\w .()-]+$/.test(baseName)) {
            return false;
        }
        return ['.mp3', '.wav', '.ogg', '.m4a', '.aac'].includes(path.extname(baseName).toLowerCase());
    }

    buildHealthPayload() {
        const safeCount = (sql) => {
            if (!this.db) return 0;
            try {
                return this.db.prepare(sql).get().count || 0;
            } catch (error) {
                return 0;
            }
        };

        const safeGet = (sql) => {
            if (!this.db) return null;
            try {
                return this.db.prepare(sql).get() || null;
            } catch (error) {
                return null;
            }
        };

        return {
            success: true,
            checks: {
                database: { status: this.db ? 'ok' : 'missing' },
                socket: { status: this.api && this.api.emit ? 'ok' : 'missing' },
                tts: { status: this.config.ttsEnabled ? 'enabled' : 'disabled' },
                openai: { status: this.getOpenAIConfig().api_key ? 'configured' : 'missing' }
            },
            inventory: {
                questions: safeCount('SELECT COUNT(*) as count FROM questions'),
                categories: safeCount('SELECT COUNT(*) as count FROM categories'),
                sounds: safeCount('SELECT COUNT(*) as count FROM game_sounds')
            },
            setup: {
                completed: !!this.config.setupWizardCompleted,
                step: this.config.setupWizardStep || 'questions'
            },
            activeSeason: safeGet('SELECT * FROM leaderboard_seasons WHERE is_active = 1'),
            overlay: {
                url: '/quiz-show/overlay',
                splitscreenUrl: '/quiz-show/overlay/splitscreen',
                leaderboardUrl: '/quiz-show/leaderboard-overlay'
            },
            quiz: {
                isRunning: this.gameState.isRunning,
                roundState: this.gameState.roundState,
                currentRound: this.gameState.currentRound,
                totalRounds: this.config.totalRounds
            }
        };
    }

    _broadcastQuestionsUpdate() {
        if (!this.db) return;
        try {
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
        } catch (error) {
            this.api.log('Error broadcasting questions update: ' + error.message, 'warn');
        }
    }

    getActiveShowConfig() {
        if (!this.db || !this.config.activeShowId) {
            return null;
        }

        try {
            const row = this.db.prepare('SELECT * FROM quiz_shows WHERE id = ?').get(this.config.activeShowId);
            if (!row) {
                return null;
            }
            return {
                ...row,
                categories: JSON.parse(row.categories || '[]'),
                packageIds: JSON.parse(row.package_ids || '[]'),
                audienceVoting: !!row.audience_voting
            };
        } catch (error) {
            this.api.log('Error loading active quiz show: ' + error.message, 'warn');
            return null;
        }
    }

    applyActiveShowConfig(show) {
        if (!show) {
            return;
        }

        if (Array.isArray(show.categories) && show.categories.length > 0 && !this.config.categoryVotingEnabled) {
            this.config.categoryFilter = show.categories;
        }
        if (show.round_count) {
            this.config.totalRounds = show.round_count;
        }
        this.config.randomQuestions = show.question_order !== 'sequential';

        if (Array.isArray(show.packageIds) && show.packageIds.length > 0 && this.db) {
            try {
                this.db.prepare('UPDATE question_packages SET is_selected = 0').run();
                const selectPackage = this.db.prepare('UPDATE question_packages SET is_selected = 1 WHERE id = ?');
                for (const packageId of show.packageIds) {
                    selectPackage.run(packageId);
                }
            } catch (error) {
                this.api.log('Error applying quiz show packages: ' + error.message, 'warn');
            }
        }
    }

    getCategoryVoteOptions(show = null) {
        if (show && Array.isArray(show.categories) && show.categories.length >= 2) {
            return show.categories;
        }

        if (!this.db) {
            return [];
        }

        try {
            const limit = Math.max(2, Number(this.config.categoryVoteOptionsLimit) || 4);
            return this.db.prepare(`
                SELECT category as name, COUNT(*) as count
                FROM questions
                WHERE category IS NOT NULL AND category != ''
                GROUP BY category
                ORDER BY count DESC, category ASC
                LIMIT ?
            `).all(limit).map(row => row.name);
        } catch (error) {
            this.api.log('Error loading category vote options: ' + error.message, 'warn');
            return [];
        }
    }

    async runCategoryVotingBeforeRound(show = null) {
        if (!this.config.categoryVotingEnabled && !(show && show.audienceVoting)) {
            return null;
        }
        if (!this.config.categoryVoteBeforeQuestion && !(show && show.audienceVoting)) {
            return null;
        }
        if (this.gameState.categoryVote && this.gameState.categoryVote.active) {
            return null;
        }

        const options = this.getCategoryVoteOptions(show);
        if (options.length < 2) {
            return null;
        }

        const duration = Math.max(5, Math.min(120, Number(this.config.categoryVoteDuration) || 20));
        this.startCategoryVote(options, duration);
        await new Promise(resolve => setTimeout(resolve, duration * 1000 + 100));
        return this.finishCategoryVote();
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

    loadQuizStartGiftConfig() {
        try {
            const config = this.db.prepare('SELECT * FROM quiz_start_gift_config WHERE id = 1').get();
            if (config) {
                this.config.quizStartGiftEnabled = config.enabled;
                this.config.quizStartGiftId = config.gift_id;
                this.config.quizStartGiftName = config.gift_name;
                this.api.log(`Quiz-start gift configured: ${config.enabled ? config.gift_name : 'disabled'}`, 'info');
            }
        } catch (error) {
            this.api.log('Error loading quiz-start gift config: ' + error.message, 'warn');
        }
    }

    loadLeaderboardDisplayConfig() {
        try {
            const config = this.db.prepare('SELECT * FROM leaderboard_display_config WHERE id = 1').get();
            if (config) {
                this.config.leaderboardShowAfterRound = config.show_after_round;
                this.config.leaderboardShowAfterQuestion = config.show_after_question;
                this.config.leaderboardQuestionDisplayType = config.question_display_type;
                this.config.leaderboardRoundDisplayType = config.round_display_type;
                this.config.leaderboardEndGameDisplayType = config.end_game_display_type;
                this.config.leaderboardAutoHideDelay = config.auto_hide_delay;
                this.config.leaderboardAnimationStyle = config.animation_style;
                this.api.log(`Leaderboard display config loaded`, 'info');
            }
        } catch (error) {
            this.api.log('Error loading leaderboard display config: ' + error.message, 'warn');
        }
    }

    loadSlotMachineConfig() {
        try {
            const config = this.db.prepare('SELECT * FROM slot_machine_config WHERE id = 1').get();
            if (config) {
                this.config.slotMachineEnabled = config.enabled;
                this.config.slotMachineSpinDuration = config.spin_duration;
                this.config.slotMachineSpinSpeed = config.spin_speed;
                this.config.slotMachineAutoStart = config.auto_start;
                this.api.log(`Slot machine config loaded: ${config.enabled ? 'enabled' : 'disabled'}`, 'info');
            }
        } catch (error) {
            this.api.log('Error loading slot machine config: ' + error.message, 'warn');
        }
    }

    loadSeasonAutomationConfig() {
        try {
            const config = this.db.prepare('SELECT * FROM season_automation_config WHERE id = 1').get();
            if (config) {
                this.config.seasonAutomationMode = config.mode || 'manual';
                this.config.seasonAutomationDay = config.rollover_day || 1;
            }
        } catch (error) {
            this.api.log('Error loading season automation config: ' + error.message, 'warn');
        }
    }

    loadSetupWizardState() {
        try {
            const state = this.db.prepare('SELECT * FROM setup_wizard_state WHERE id = 1').get();
            if (state) {
                this.config.setupWizardCompleted = !!state.completed;
                this.config.setupWizardStep = state.current_step || 'questions';
            }
        } catch (error) {
            this.api.log('Error loading setup wizard state: ' + error.message, 'warn');
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

        this.api.registerRoute('get', '/quiz-show/overlay/splitscreen', (req, res) => {
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
                this.checkSeasonAutomation();

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
                    leaderboard = this.mainDb.prepare(`
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
                this._broadcastQuestionsUpdate();

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
                this._broadcastQuestionsUpdate();

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
                this._broadcastQuestionsUpdate();

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

                const insertMany = this.db.transaction((questions) => {
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
                this._broadcastQuestionsUpdate();

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
                    data = this.mainDb.prepare(`
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
                const insert = this.mainDb.prepare(`
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

                const leaderboardData = this.mainDb.prepare(`
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
                const leaderboard = this.mainDb.prepare(`
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

        // Question cooldown configuration
        this.api.registerRoute('get', '/api/quiz-show/question-cooldown', (req, res) => {
            res.json({
                success: true,
                hours: this.config.questionCooldownHours,
                milliseconds: this.getQuestionCooldownMs()
            });
        });

        this.api.registerRoute('post', '/api/quiz-show/question-cooldown', async (req, res) => {
            try {
                const hours = Number(req.body.hours);
                if (!Number.isFinite(hours) || hours < 0 || hours > 168) {
                    return res.status(400).json({ success: false, error: 'Cooldown must be between 0 and 168 hours' });
                }
                this.config.questionCooldownHours = hours;
                await this.saveConfig();
                this.cleanupQuestionHistory();
                this.api.emit('quiz-show:config-updated', this.config);
                res.json({ success: true, hours, milliseconds: this.getQuestionCooldownMs() });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Quiz show / playlist management
        this.api.registerRoute('get', '/api/quiz-show/shows', (req, res) => {
            try {
                const shows = this.db.prepare('SELECT * FROM quiz_shows ORDER BY created_at DESC').all()
                    .map(show => ({
                        ...show,
                        categories: JSON.parse(show.categories || '[]'),
                        package_ids: JSON.parse(show.package_ids || '[]'),
                        audience_voting: !!show.audience_voting,
                        is_active: !!show.is_active
                    }));
                res.json({ success: true, shows, activeShowId: this.config.activeShowId });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('post', '/api/quiz-show/shows', async (req, res) => {
            try {
                const name = String(req.body.name || '').trim();
                if (!name) {
                    return res.status(400).json({ success: false, error: 'Show name is required' });
                }

                const categories = Array.isArray(req.body.categories) ? req.body.categories.filter(Boolean) : [];
                const packageIds = Array.isArray(req.body.packageIds) ? req.body.packageIds.map(Number).filter(Number.isInteger) : [];
                const roundCount = Math.max(1, Math.min(250, Number(req.body.roundCount) || 10));
                const questionOrder = ['random', 'sequential'].includes(req.body.questionOrder) ? req.body.questionOrder : 'random';
                const audienceVoting = req.body.audienceVoting ? 1 : 0;

                const result = this.db.prepare(`
                    INSERT INTO quiz_shows (name, description, categories, package_ids, round_count, question_order, audience_voting)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `).run(
                    name,
                    String(req.body.description || ''),
                    JSON.stringify(categories),
                    JSON.stringify(packageIds),
                    roundCount,
                    questionOrder,
                    audienceVoting
                );

                res.json({ success: true, id: result.lastInsertRowid });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('put', '/api/quiz-show/shows/:id', async (req, res) => {
            try {
                const id = parseInt(req.params.id, 10);
                const name = String(req.body.name || '').trim();
                if (!Number.isInteger(id) || !name) {
                    return res.status(400).json({ success: false, error: 'Valid id and name are required' });
                }

                if (req.body.activate) {
                    this.db.prepare('UPDATE quiz_shows SET is_active = 0').run();
                    this.config.activeShowId = id;
                    this.config.categoryFilter = Array.isArray(req.body.categories) && req.body.categories.length > 0 ? req.body.categories : this.config.categoryFilter;
                    this.config.totalRounds = Number(req.body.roundCount) || this.config.totalRounds;
                    this.config.randomQuestions = req.body.questionOrder !== 'sequential';
                    this.config.categoryVoteBeforeQuestion = !!req.body.audienceVoting;
                }

                const result = this.db.prepare(`
                    UPDATE quiz_shows
                    SET name = ?, description = ?, categories = ?, package_ids = ?, round_count = ?, question_order = ?,
                        audience_voting = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `).run(
                    name,
                    String(req.body.description || ''),
                    JSON.stringify(Array.isArray(req.body.categories) ? req.body.categories.filter(Boolean) : []),
                    JSON.stringify(Array.isArray(req.body.packageIds) ? req.body.packageIds.map(Number).filter(Number.isInteger) : []),
                    Math.max(1, Math.min(250, Number(req.body.roundCount) || 10)),
                    ['random', 'sequential'].includes(req.body.questionOrder) ? req.body.questionOrder : 'random',
                    req.body.audienceVoting ? 1 : 0,
                    req.body.activate ? 1 : 0,
                    id
                );

                await this.saveConfig();
                res.json({ success: true, changed: result.changes });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('delete', '/api/quiz-show/shows/:id', async (req, res) => {
            try {
                const id = parseInt(req.params.id, 10);
                const result = this.db.prepare('DELETE FROM quiz_shows WHERE id = ?').run(id);
                if (this.config.activeShowId === id) {
                    this.config.activeShowId = null;
                    await this.saveConfig();
                }
                res.json({ success: true, changed: result.changes });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Audience category voting
        this.api.registerRoute('get', '/api/quiz-show/category-vote', (req, res) => {
            res.json({ success: true, vote: this.gameState.categoryVote });
        });

        this.api.registerRoute('post', '/api/quiz-show/category-vote/start', (req, res) => {
            try {
                const categories = Array.isArray(req.body.categories) && req.body.categories.length > 0
                    ? req.body.categories
                    : this.db.prepare('SELECT name FROM categories ORDER BY name LIMIT ?').all(this.config.categoryVoteOptionsLimit || 4).map(row => row.name);
                const vote = this.startCategoryVote(categories, req.body.duration || this.config.categoryVoteDuration);
                if (!vote) {
                    return res.status(400).json({ success: false, error: 'At least two categories are required' });
                }
                res.json({ success: true, vote });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('post', '/api/quiz-show/category-vote/finish', (req, res) => {
            try {
                res.json({ success: true, ...this.finishCategoryVote() });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Duel mode controls
        this.api.registerRoute('post', '/api/quiz-show/duel/start', async (req, res) => {
            try {
                const duel = this.startDuel(req.body || {});
                await this.saveConfig();
                res.json({ success: true, duel });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('post', '/api/quiz-show/duel/stop', async (req, res) => {
            try {
                const duel = this.stopDuel();
                if (this.config.gameMode === 'duel') {
                    this.config.gameMode = 'classic';
                    await this.saveConfig();
                }
                res.json({ success: true, duel });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Achievements
        this.api.registerRoute('get', '/api/quiz-show/achievements', (req, res) => {
            try {
                const rules = this.db.prepare('SELECT * FROM achievement_rules ORDER BY id').all();
                const unlocked = this.db.prepare('SELECT * FROM user_achievements ORDER BY unlocked_at DESC LIMIT 100').all();
                res.json({ success: true, rules, unlocked });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('post', '/api/quiz-show/achievements/rules', (req, res) => {
            try {
                const rules = Array.isArray(req.body.rules) ? req.body.rules : [];
                const upsert = this.db.prepare(`
                    INSERT OR REPLACE INTO achievement_rules (id, label, type, threshold, enabled)
                    VALUES (?, ?, ?, ?, ?)
                `);
                for (const rule of rules) {
                    if (!rule.id || !rule.label || !rule.type) continue;
                    upsert.run(rule.id, rule.label, rule.type, Number(rule.threshold) || 1, rule.enabled ? 1 : 0);
                }
                res.json({ success: true, rules: this.db.prepare('SELECT * FROM achievement_rules ORDER BY id').all() });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Season automation
        this.api.registerRoute('get', '/api/quiz-show/season-automation', (req, res) => {
            try {
                const config = this.db.prepare('SELECT * FROM season_automation_config WHERE id = 1').get();
                res.json({ success: true, config });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('post', '/api/quiz-show/season-automation', async (req, res) => {
            try {
                const mode = ['manual', 'weekly', 'monthly'].includes(req.body.mode) ? req.body.mode : 'manual';
                const day = mode === 'monthly'
                    ? Math.max(1, Math.min(28, Number(req.body.rolloverDay) || 1))
                    : Math.max(0, Math.min(6, Number(req.body.rolloverDay) || 1));
                this.db.prepare(`
                    INSERT OR REPLACE INTO season_automation_config (id, mode, rollover_day, updated_at)
                    VALUES (1, ?, ?, CURRENT_TIMESTAMP)
                `).run(mode, day);
                this.config.seasonAutomationMode = mode;
                this.config.seasonAutomationDay = day;
                await this.saveConfig();
                res.json({ success: true, config: { mode, rollover_day: day } });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Health and setup
        this.api.registerRoute('get', '/api/quiz-show/health', (req, res) => {
            res.json(this.buildHealthPayload());
        });

        this.api.registerRoute('get', '/api/quiz-show/setup-wizard', (req, res) => {
            res.json({
                success: true,
                completed: !!this.config.setupWizardCompleted,
                step: this.config.setupWizardStep || 'questions',
                health: this.buildHealthPayload()
            });
        });

        this.api.registerRoute('post', '/api/quiz-show/setup-wizard', async (req, res) => {
            try {
                const step = String(req.body.step || this.config.setupWizardStep || 'questions');
                const completed = !!req.body.completed;
                this.db.prepare(`
                    INSERT OR REPLACE INTO setup_wizard_state (id, completed, current_step, updated_at)
                    VALUES (1, ?, ?, CURRENT_TIMESTAMP)
                `).run(completed ? 1 : 0, step);
                this.config.setupWizardCompleted = completed;
                this.config.setupWizardStep = step;
                await this.saveConfig();
                res.json({ success: true, completed, step });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Sound effects management
        this.api.registerRoute('get', '/api/quiz-show/sounds', (req, res) => {
            try {
                const sounds = this.db.prepare('SELECT * FROM game_sounds ORDER BY event_name').all();
                const assets = this.db.prepare('SELECT * FROM sound_assets ORDER BY event_name').all();
                res.json({ success: true, sounds, assets });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('post', '/api/quiz-show/sounds', (req, res) => {
            try {
                const { event_name, file_path, fileName, contentBase64, volume } = req.body;
                const eventName = String(event_name || '').trim();
                if (!eventName) {
                    return res.status(400).json({ success: false, error: 'event_name is required' });
                }

                let resolvedPath = file_path;
                let resolvedFileName = fileName;

                if (contentBase64 || fileName) {
                    if (!this.isAllowedSoundFileName(fileName)) {
                        return res.status(400).json({ success: false, error: 'Unsupported or unsafe sound file name' });
                    }

                    const soundsDir = path.join(this.api.getPluginDataDir(), 'sounds');
                    fs.mkdirSync(soundsDir, { recursive: true });
                    resolvedFileName = `${Date.now()}-${path.basename(fileName)}`;
                    resolvedPath = path.join(soundsDir, resolvedFileName);

                    if (contentBase64) {
                        const buffer = Buffer.from(String(contentBase64).replace(/^data:audio\/[a-z0-9.+-]+;base64,/i, ''), 'base64');
                        fs.writeFileSync(resolvedPath, buffer);
                    }

                    this.db.prepare(`
                        INSERT OR REPLACE INTO sound_assets (event_name, file_name, file_path, volume)
                        VALUES (?, ?, ?, ?)
                    `).run(eventName, resolvedFileName, resolvedPath, Number(volume) || 1.0);
                }
                
                this.db.prepare(`
                    INSERT OR REPLACE INTO game_sounds (event_name, file_path, volume) 
                    VALUES (?, ?, ?)
                `).run(eventName, resolvedPath, Number(volume) || 1.0);

                const sounds = this.db.prepare('SELECT * FROM game_sounds').all();
                this.api.emit('quiz-show:sounds-updated', sounds);

                res.json({ success: true, sounds });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('delete', '/api/quiz-show/sounds/:eventName', (req, res) => {
            try {
                const eventName = String(req.params.eventName || '').trim();
                const asset = this.db.prepare('SELECT * FROM sound_assets WHERE event_name = ?').get(eventName);
                this.db.prepare('DELETE FROM game_sounds WHERE event_name = ?').run(eventName);
                this.db.prepare('DELETE FROM sound_assets WHERE event_name = ?').run(eventName);
                if (asset && asset.file_path && fs.existsSync(asset.file_path)) {
                    fs.unlinkSync(asset.file_path);
                }
                const sounds = this.db.prepare('SELECT * FROM game_sounds ORDER BY event_name').all();
                this.api.emit('quiz-show:sounds-updated', sounds);
                res.json({ success: true, sounds });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('post', '/api/quiz-show/sounds/test', (req, res) => {
            try {
                const eventName = String(req.body.eventName || '').trim();
                if (!eventName) {
                    return res.status(400).json({ success: false, error: 'eventName is required' });
                }
                this.playSound(eventName);
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
                const config = this.getOpenAIConfig();
                
                // Don't send the full API key to the client, just indicate if it's set
                const response = {
                    hasApiKey: !!config?.api_key,
                    apiKeyPreview: config?.api_key ? `${config.api_key.substring(0, 7)}...${config.api_key.substring(config.api_key.length - 4)}` : null,
                    model: config?.model || 'gpt-5-mini',
                    defaultPackageSize: 10 // No longer stored in quiz plugin DB
                };

                res.json({ success: true, config: response });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Update OpenAI configuration (deprecated - now managed in main settings)
        this.api.registerRoute('post', '/api/quiz-show/openai/config', async (req, res) => {
            try {
                // This route is deprecated - OpenAI config is now managed in main settings
                // Return a message directing users to the main settings panel
                res.status(400).json({ 
                    success: false, 
                    error: 'OpenAI-Konfiguration wird jetzt im Haupteinstellungspanel verwaltet. Bitte speichern Sie Ihren API-Schlüssel dort.' 
                });
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
                const config = this.getOpenAIConfig();
                
                const response = {
                    hasKey: !!config?.api_key,
                    model: config?.model || 'gpt-5-mini',
                    defaultPackageSize: 10 // No longer stored in quiz plugin DB
                };

                res.json({ success: true, config: response });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Update AI configuration (unified endpoint for settings tab) - deprecated
        this.api.registerRoute('post', '/api/quiz-show/ai-config', async (req, res) => {
            try {
                // This route is deprecated - OpenAI config is now managed in main settings
                res.status(400).json({ 
                    success: false, 
                    error: 'OpenAI-Konfiguration wird jetzt im Haupteinstellungspanel verwaltet. Bitte speichern Sie Ihren API-Schlüssel dort.' 
                });
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

                // Get OpenAI config from main settings
                const config = this.getOpenAIConfig();
                
                if (!config || !config.api_key) {
                    return res.status(400).json({ success: false, error: 'OpenAI API-Schlüssel nicht konfiguriert. Bitte konfigurieren Sie ihn im Haupteinstellungspanel.' });
                }

                // Get existing questions for this category to avoid duplicates
                const existingQuestions = this.db.prepare(`
                    SELECT question FROM questions WHERE category = ?
                `).all(category).map(q => q.question);

                // Generate questions using OpenAI
                const OpenAIQuizService = require('./openai-service');
                const service = new OpenAIQuizService(config.api_key, config.model);
                
                const size = packageSize || 10;
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

                const insertMany = this.db.transaction((questions) => {
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
                this._broadcastQuestionsUpdate();

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

        // Batch generate multiple question packages with OpenAI
        this.api.registerRoute('post', '/api/quiz-show/packages/batch-generate', async (req, res) => {
            try {
                const { categories, packageSize } = req.body;

                if (!categories || !Array.isArray(categories) || categories.length === 0) {
                    return res.status(400).json({ success: false, error: 'Kategorien erforderlich (Array)' });
                }

                // Get OpenAI config
                const config = this.db.prepare('SELECT api_key, model FROM openai_config WHERE id = 1').get();
                
                if (!config || !config.api_key) {
                    return res.status(400).json({ success: false, error: 'OpenAI API-Schlüssel nicht konfiguriert' });
                }

                const OpenAIQuizService = require('./openai-service');
                const service = new OpenAIQuizService(config.api_key, config.model);
                const size = packageSize || config.default_package_size || 10;

                // Start batch generation - return immediately and process in background
                res.json({ 
                    success: true, 
                    message: `Batch-Generierung gestartet für ${categories.length} Kategorien`,
                    totalCategories: categories.length
                });

                // Process categories in background
                this.processBatchGeneration(categories, size, service);
            } catch (error) {
                this.api.log('Error starting batch generation: ' + error.message, 'error');
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
                this._broadcastQuestionsUpdate();

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

        // ===== Quiz-Start Gift Routes =====
        
        // Get quiz-start gift configuration
        this.api.registerRoute('get', '/api/quiz-show/quiz-start-gift', (req, res) => {
            try {
                const config = this.db.prepare('SELECT * FROM quiz_start_gift_config WHERE id = 1').get();
                res.json({ success: true, config: config || { enabled: false, gift_id: null, gift_name: null } });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Save quiz-start gift configuration
        this.api.registerRoute('post', '/api/quiz-show/quiz-start-gift', (req, res) => {
            try {
                const { enabled, giftId, giftName } = req.body;

                // Check if config exists
                const existing = this.db.prepare('SELECT id FROM quiz_start_gift_config WHERE id = 1').get();
                
                if (existing) {
                    // Update existing config
                    this.db.prepare(`
                        UPDATE quiz_start_gift_config 
                        SET enabled = ?, gift_id = ?, gift_name = ?, updated_at = CURRENT_TIMESTAMP 
                        WHERE id = 1
                    `).run(enabled ? 1 : 0, giftId || null, giftName || null);
                } else {
                    // Insert new config
                    this.db.prepare(`
                        INSERT INTO quiz_start_gift_config (id, enabled, gift_id, gift_name) 
                        VALUES (1, ?, ?, ?)
                    `).run(enabled ? 1 : 0, giftId || null, giftName || null);
                }

                // Reload quiz-start gift config into memory
                this.loadQuizStartGiftConfig();

                const config = this.db.prepare('SELECT * FROM quiz_start_gift_config WHERE id = 1').get();
                res.json({ success: true, config });
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

        // Activate layout (set as active and broadcast to overlays)
        this.api.registerRoute('post', '/api/quiz-show/layouts/:id/activate', (req, res) => {
            try {
                const layoutId = parseInt(req.params.id);
                const layout = this.db.prepare('SELECT * FROM overlay_layouts WHERE id = ?').get(layoutId);
                
                if (!layout) {
                    return res.status(404).json({ success: false, error: 'Layout not found' });
                }

                // Store active layout ID in config
                this.config.activeLayoutId = layoutId;
                this.config.customLayoutEnabled = true;
                this.saveConfig();

                // Parse layout config
                layout.layout_config = JSON.parse(layout.layout_config);

                // Broadcast to all overlays
                this.api.emit('quiz-show:layout-updated', {
                    layout,
                    customLayoutEnabled: true
                });

                res.json({ success: true, layout });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Deactivate custom layout (revert to default positioning)
        this.api.registerRoute('post', '/api/quiz-show/layouts/deactivate', (req, res) => {
            try {
                this.config.activeLayoutId = null;
                this.config.customLayoutEnabled = false;
                this.saveConfig();

                // Broadcast to all overlays to disable custom layout
                this.api.emit('quiz-show:layout-updated', {
                    layout: null,
                    customLayoutEnabled: false
                });

                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get active layout
        this.api.registerRoute('get', '/api/quiz-show/layouts/active', (req, res) => {
            try {
                if (!this.config.customLayoutEnabled || !this.config.activeLayoutId) {
                    return res.json({ success: true, layout: null, customLayoutEnabled: false });
                }

                const layout = this.db.prepare('SELECT * FROM overlay_layouts WHERE id = ?').get(this.config.activeLayoutId);
                
                if (!layout) {
                    // Active layout was deleted, reset config
                    this.config.activeLayoutId = null;
                    this.config.customLayoutEnabled = false;
                    this.saveConfig();
                    return res.json({ success: true, layout: null, customLayoutEnabled: false });
                }

                layout.layout_config = JSON.parse(layout.layout_config);
                res.json({ success: true, layout, customLayoutEnabled: true });
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
                    show_after_question: false,
                    question_display_type: 'season',
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
                const { showAfterRound, showAfterQuestion, questionDisplayType, roundDisplayType, endGameDisplayType, autoHideDelay, animationStyle } = req.body;

                // Validate values
                if (questionDisplayType && !['round', 'season', 'both'].includes(questionDisplayType)) {
                    return res.status(400).json({ success: false, error: 'Invalid question display type' });
                }
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
                    if (showAfterQuestion !== undefined) {
                        updates.push('show_after_question = ?');
                        values.push(showAfterQuestion ? 1 : 0);
                    }
                    if (questionDisplayType) {
                        updates.push('question_display_type = ?');
                        values.push(questionDisplayType);
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
                    this.db.prepare('INSERT INTO leaderboard_display_config (id, show_after_round, show_after_question, question_display_type, round_display_type, end_game_display_type, auto_hide_delay, animation_style) VALUES (1, ?, ?, ?, ?, ?, ?, ?)')
                        .run(
                            showAfterRound !== false ? 1 : 0, 
                            showAfterQuestion === true ? 1 : 0,
                            questionDisplayType || 'season',
                            roundDisplayType || 'both', 
                            endGameDisplayType || 'season', 
                            autoHideDelay || 10, 
                            animationStyle || 'fade'
                        );
                }

                // Update config in memory
                if (showAfterRound !== undefined) this.config.leaderboardShowAfterRound = showAfterRound;
                if (showAfterQuestion !== undefined) this.config.leaderboardShowAfterQuestion = showAfterQuestion;
                if (questionDisplayType) this.config.leaderboardQuestionDisplayType = questionDisplayType;
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

        // ===== NEW: Slot Machine Configuration Routes =====

        // Get slot machine config
        this.api.registerRoute('get', '/api/quiz-show/slot-machine-config', (req, res) => {
            try {
                const config = this.db.prepare('SELECT * FROM slot_machine_config WHERE id = 1').get();
                res.json({ success: true, config: config || { 
                    enabled: false, 
                    spin_duration: 3.0, 
                    spin_speed: 100, 
                    auto_start: false 
                }});
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Update slot machine config
        this.api.registerRoute('post', '/api/quiz-show/slot-machine-config', (req, res) => {
            try {
                const { enabled, spinDuration, spinSpeed, autoStart } = req.body;

                // Validate values
                if (spinDuration !== undefined && (spinDuration < 1 || spinDuration > 10)) {
                    return res.status(400).json({ success: false, error: 'Spin duration must be between 1 and 10 seconds' });
                }
                if (spinSpeed !== undefined && (spinSpeed < 50 || spinSpeed > 500)) {
                    return res.status(400).json({ success: false, error: 'Spin speed must be between 50 and 500 milliseconds' });
                }

                // Update or insert
                const existing = this.db.prepare('SELECT id FROM slot_machine_config WHERE id = 1').get();
                
                if (existing) {
                    const updates = [];
                    const values = [];
                    
                    if (enabled !== undefined) {
                        updates.push('enabled = ?');
                        values.push(enabled ? 1 : 0);
                    }
                    if (spinDuration !== undefined) {
                        updates.push('spin_duration = ?');
                        values.push(spinDuration);
                    }
                    if (spinSpeed !== undefined) {
                        updates.push('spin_speed = ?');
                        values.push(spinSpeed);
                    }
                    if (autoStart !== undefined) {
                        updates.push('auto_start = ?');
                        values.push(autoStart ? 1 : 0);
                    }
                    
                    if (updates.length > 0) {
                        updates.push('updated_at = CURRENT_TIMESTAMP');
                        this.db.prepare(`UPDATE slot_machine_config SET ${updates.join(', ')} WHERE id = 1`).run(...values);
                    }
                } else {
                    this.db.prepare('INSERT INTO slot_machine_config (id, enabled, spin_duration, spin_speed, auto_start) VALUES (1, ?, ?, ?, ?)')
                        .run(enabled !== false ? 1 : 0, spinDuration || 3.0, spinSpeed || 100, autoStart === true ? 1 : 0);
                }

                // Update config in memory
                if (enabled !== undefined) this.config.slotMachineEnabled = enabled;
                if (spinDuration !== undefined) this.config.slotMachineSpinDuration = spinDuration;
                if (spinSpeed !== undefined) this.config.slotMachineSpinSpeed = spinSpeed;
                if (autoStart !== undefined) this.config.slotMachineAutoStart = autoStart;

                const config = this.db.prepare('SELECT * FROM slot_machine_config WHERE id = 1').get();
                res.json({ success: true, config });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });
    }

    getDefaultHUDConfig() {
        return {
            theme: 'dark',
            themePreset: this.config.hudThemePreset || 'neon',
            reducedMotion: !!this.config.reducedMotion,
            highContrast: !!this.config.highContrast,
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
            },
            avatarPerformance: {
                mode: this.config.avatarPerformanceMode || 'balanced',
                cacheEnabled: this.config.avatarCacheEnabled !== false,
                maxVisible: this.config.voterIconMaxVisible || 10
            }
        };
    }

    registerSocketEvents() {
        // Start quiz
        this.api.registerSocket('quiz-show:start', async (socket, data) => {
            try {
                // If a round has ended but quiz session is still "running", treat this as a new quiz start
                // This handles the case where a quiz ended but wasn't explicitly stopped
                if (this.gameState.isRunning && this.gameState.roundState === 'ended') {
                    this.api.log('Previous quiz session ended but not stopped - resetting for new session', 'info');
                    this.resetGameState();
                } else if (this.gameState.isRunning) {
                    // Quiz is actively running
                    socket.emit('quiz-show:error', { message: 'Quiz already running' });
                    return;
                }

                const questionCount = this.db.prepare('SELECT COUNT(*) as count FROM questions').get().count;
                if (questionCount === 0) {
                    socket.emit('quiz-show:error', { message: 'No questions available' });
                    return;
                }

                // Check if slot machine mode is enabled and should auto-start
                if (this.config.slotMachineEnabled && this.config.slotMachineAutoStart) {
                    // Trigger slot machine animation before starting round
                    await this.triggerSlotMachine();
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
                    await this.endRound({ suppressTTS: true });
                }

                // Check if total rounds limit has been reached
                const totalRoundsReached = this.config.totalRounds > 0 && this.gameState.currentRound >= this.config.totalRounds;
                
                if (totalRoundsReached) {
                    // Round limit reached - show final leaderboard and reset game state
                    this.api.log(`Total rounds limit (${this.config.totalRounds}) reached - resetting for new game`, 'info');
                    
                    // Show final leaderboard before ending
                    await this.showLeaderboardAtEnd();
                    
                    // Get MVP and broadcast quiz-ended event to all clients
                    const mvp = this.getMVPPlayer();
                    this.api.emit('quiz-show:quiz-ended', { 
                        mvp,
                        message: 'Quiz beendet. Klicken Sie "Quiz starten", um eine neue Runde zu beginnen.' 
                    });
                    
                    // Reset game state for new game
                    this.resetGameState();
                    return;
                }

                await this.stopActiveTTS();
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
                // Allow stopping if quiz is running OR if a round just ended
                if (!this.gameState.isRunning && this.gameState.roundState !== 'ended') {
                    socket.emit('quiz-show:error', { message: 'Quiz not running' });
                    return;
                }

                // Clear timer interval if it's still running
                if (this.timerInterval) {
                    clearInterval(this.timerInterval);
                    this.timerInterval = null;
                }

                // Clear auto mode timeout if it's running
                if (this.autoModeTimeout) {
                    clearTimeout(this.autoModeTimeout);
                    this.autoModeTimeout = null;
                }

                // Only call endRound if quiz is still actively running
                // If roundState is 'ended', the round already ended and we just need to reset
                if (this.gameState.isRunning && this.gameState.roundState === 'running') {
                    await this.endRound({ suppressTTS: true });
                }
                
                // Get MVP for display
                const mvp = this.getMVPPlayer();

                // Show end game leaderboard
                await this.showLeaderboardAtEnd();

                this.resetGameState();
                await this.stopActiveTTS();

                this.api.emit('quiz-show:stopped', {});
                this.api.emit('quiz-show:quiz-ended', { mvp });
                socket.emit('quiz-show:stopped', { success: true });
            } catch (error) {
                this.api.log('Error stopping quiz: ' + error.message, 'error');
                socket.emit('quiz-show:error', { message: error.message });
            }
        });

        // Trigger slot machine manually
        this.api.registerSocket('quiz-show:trigger-slot-machine', async (socket, data) => {
            try {
                if (!this.config.slotMachineEnabled) {
                    socket.emit('quiz-show:error', { message: 'Slot machine mode is not enabled' });
                    return;
                }

                await this.triggerSlotMachine();
                socket.emit('quiz-show:slot-machine-triggered', { success: true });
            } catch (error) {
                this.api.log('Error triggering slot machine: ' + error.message, 'error');
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

    // ============================================
    // LAST MAN STANDING MODE
    // ============================================

    startLMSJoinPhase() {
        this.gameState.lastManStanding.active = true;
        this.gameState.lastManStanding.joinPhase = true;
        this.gameState.lastManStanding.survivors = new Set();
        this.gameState.lastManStanding.eliminated = new Set();
        this.gameState.lastManStanding.joinEndTime = Date.now() + this.config.lastManStandingJoinTime * 1000;

        this.api.log(`Last Man Standing join phase started (${this.config.lastManStandingJoinTime}s). Use !join to participate.`, 'info');
        this.api.emit('quiz-show:lms-join-phase-started', {
            duration: this.config.lastManStandingJoinTime,
            endTime: this.gameState.lastManStanding.joinEndTime
        });

        // Auto-end join phase after timeout
        setTimeout(() => {
            this.endLMSJoinPhase();
        }, this.config.lastManStandingJoinTime * 1000);
    }

    endLMSJoinPhase() {
        this.gameState.lastManStanding.joinPhase = false;
        const participantCount = this.gameState.lastManStanding.survivors.size;

        this.api.log(`Last Man Standing join phase ended. Participants: ${participantCount}`, 'info');
        this.api.emit('quiz-show:lms-join-phase-ended', {
            participants: participantCount
        });

        if (participantCount < 2) {
            this.api.log('Not enough participants for Last Man Standing. Disabling LMS mode.', 'warn');
            this.gameState.lastManStanding.active = false;
            this.config.lastManStandingEnabled = false;
        }
    }

    handleLMSJoin(userId, username, profilePictureUrl) {
        if (!this.gameState.lastManStanding.survivors.has(userId)) {
            this.gameState.lastManStanding.survivors.add(userId);
            this.api.log(`${username} joined Last Man Standing (${this.gameState.lastManStanding.survivors.size} total)`, 'info');
            this.api.emit('quiz-show:lms-joined', { username, userId });
        }
    }

    autoJoinLMS(userId, username, profilePictureUrl) {
        if (this.gameState.lastManStanding.active && !this.gameState.lastManStanding.survivors.has(userId)) {
            this.gameState.lastManStanding.survivors.add(userId);
            this.api.log(`${username} auto-joined Last Man Standing via first-round answer (${this.gameState.lastManStanding.survivors.size} total)`, 'info');
        }
    }

    getLMSTimerDuration() {
        const currentRound = this.gameState.currentRound;
        const decrementFrom = this.config.lastManStandingDecrementFromRound || 10;
        const decrement = this.config.lastManStandingDecrement || 2;
        const minTime = this.config.lastManStandingMinTime || 10;

        let time = this.config.lastManStandingInitialTime || 30;

        if (currentRound >= decrementFrom) {
            const decrementRounds = currentRound - decrementFrom + 1;
            time -= decrementRounds * decrement;
            time = Math.max(time, minTime);
        }

        this.gameState.lastManStanding.currentRoundTime = time;
        return time;
    }

    eliminateLMSPlayer(userId, reason) {
        if (!this.gameState.lastManStanding.active) return;
        if (!this.gameState.lastManStanding.survivors.has(userId)) return;

        this.gameState.lastManStanding.survivors.delete(userId);
        this.gameState.lastManStanding.eliminated.add(userId);

        const survivors = this.gameState.lastManStanding.survivors.size;
        this.api.log(`Player eliminated: ${userId} (${reason}). Survivors: ${survivors}`, 'info');
        this.api.emit('quiz-show:lms-eliminated', { userId, reason, survivors });

        // Check for winner
        if (survivors === 1) {
            const winnerId = Array.from(this.gameState.lastManStanding.survivors)[0];
            this.handleLMSWinner(winnerId);
        }
    }

    handleLMSWinner(winnerId) {
        this.api.log(`Last Man Standing winner: ${winnerId}`, 'info');
        this.api.emit('quiz-show:lms-winner', { userId: winnerId });

        // End the quiz after a short delay
        setTimeout(async () => {
            await this.endRound({ suppressTTS: true });
            this.api.emit('quiz-show:quiz-ended', {
                message: 'Last Man Standing beendet!'
            });
            this.resetGameState();
        }, 5000);
    }

    showLMSSurvivors() {
        const survivors = Array.from(this.gameState.lastManStanding.survivors);
        if (survivors.length === 0) return;

        // Get user data for survivors (username, profilePictureUrl)
        const survivorsData = survivors.map(userId => {
            const answerData = this.gameState.answers.get(userId);
            return {
                userId,
                username: answerData?.username || userId,
                profilePictureUrl: answerData?.profilePictureUrl || null
            };
        });

        this.api.emit('quiz-show:lms-survivors', { survivors: survivorsData });
    }

    registerTikTokEvents() {
        // Handle chat messages for answers and jokers
        this.api.registerTikTokEvent('chat', async (data) => {
            const userId = data.uniqueId || data.nickname || data.userId;
            const username = data.nickname || data.username || userId;
            const message = (data.message || data.comment || '').trim();
            const isSuperFan = data.teamMemberLevel >= 1 || data.isSubscriber;

            if (this.gameState.categoryVote && this.gameState.categoryVote.active) {
                const recorded = this.recordCategoryVote({ userId, username, message });
                if (recorded) {
                    return;
                }
            }

            if (!this.gameState.isRunning) {
                return;
            }
            
            // Extract profile picture URL from various possible fields
            const profilePictureUrl = this.extractProfilePicture(data);

            // Check for joker commands (respecting permission settings)
            const canUseJoker = !this.config.jokerSuperfanOnly || isSuperFan;
            if (canUseJoker && message.toLowerCase().startsWith(this.config.jokerCommandPrefix.toLowerCase())) {
                this.handleJokerCommand(userId, username, message);
                return;
            }

            // Check for !join command in Last Man Standing mode (during join phase)
            if (this.config.lastManStandingEnabled && this.gameState.lastManStanding.joinPhase) {
                if (message.toLowerCase() === '!join') {
                    this.handleLMSJoin(userId, username, profilePictureUrl);
                    return;
                }
            }

            // Check for answers
            this.handleAnswer(userId, username, message, profilePictureUrl);
        });

        // Handle gift events for joker activation and quiz start
        this.api.registerTikTokEvent('gift', async (data) => {
            const userId = data.uniqueId || data.userId;
            const username = data.nickname || data.username || userId;
            const giftId = data.giftId || data.gift_id;

            // Check if this gift should start the quiz
            if (this.config.quizStartGiftEnabled && 
                this.config.quizStartGiftId && 
                giftId === this.config.quizStartGiftId) {
                
                // Check if quiz is already running
                if (this.gameState.isRunning) {
                    this.api.log(`Quiz already running, ignoring quiz-start gift from ${username}`, 'info');
                    return;
                }

                // Check if there are questions available
                const questionCount = this.db.prepare('SELECT COUNT(*) as count FROM questions').get().count;
                if (questionCount === 0) {
                    this.api.log('Cannot start quiz: No questions available', 'warn');
                    this.api.emit('quiz-show:error', { 
                        message: 'Keine Fragen verfügbar',
                        type: 'no_questions'
                    });
                    return;
                }

                try {
                    // Enable auto mode for gift-triggered quiz (remains enabled for session)
                    this.config.autoMode = true;

                    this.api.log(`Quiz started by gift from ${username} (Gift: ${this.config.quizStartGiftName})`, 'info');
                    
                    // Start the quiz
                    await this.startRound();
                    
                    // Emit event to notify UI
                    this.api.emit('quiz-show:started-by-gift', {
                        username,
                        giftName: this.config.quizStartGiftName
                    });
                } catch (error) {
                    this.api.log(`Error starting quiz from gift: ${error.message}`, 'error');
                    this.api.emit('quiz-show:error', { 
                        message: error.message,
                        type: 'quiz_start_error'
                    });
                }
                
                return; // Don't process as joker
            }

            // Only process joker gifts if quiz is running
            if (!this.gameState.isRunning) {
                return;
            }

            // Check if this gift is mapped to a joker
            if (this.config.giftJokerMappings && this.config.giftJokerMappings[giftId]) {
                const jokerType = this.config.giftJokerMappings[giftId];
                this.handleJokerCommand(userId, username, `!joker${jokerType}`, true);
            }
        });
    }

    // Helper function to check if categoryFilter is set to "All"
    isCategoryFilterAll(categoryFilter) {
        if (!categoryFilter) return true;
        if (Array.isArray(categoryFilter)) {
            return categoryFilter.length === 0 || categoryFilter.includes('Alle');
        }
        return categoryFilter === 'Alle';
    }

    selectNextQuestion(availableQuestions) {
        if (!availableQuestions || availableQuestions.length === 0) {
            return null;
        }

        const lastAskedMap = this.getLastAskedMap();
        const totalRoundsConfigured = this.config.totalRounds > 0 ? this.config.totalRounds : Math.max(this.DEFAULT_UNLIMITED_ROUNDS, this.gameState.askedQuestionIds.size + 1);
        const roundsCompleted = this.gameState.currentRound;
        const progress = totalRoundsConfigured > 0 ? Math.min(1, (roundsCompleted + 1) / totalRoundsConfigured) : 0;

        let preferredDifficulty = 1;
        if (progress >= 0.9) {
            preferredDifficulty = 4;
        } else if (progress >= 0.7) {
            preferredDifficulty = 3;
        } else if (progress >= 0.4) {
            preferredDifficulty = 2;
        }

        const buckets = {};
        for (let d = this.MIN_DIFFICULTY; d <= this.MAX_DIFFICULTY; d++) {
            buckets[d] = [];
        }
        for (const question of availableQuestions) {
            const difficulty = Math.max(this.MIN_DIFFICULTY, Math.min(this.MAX_DIFFICULTY, question.difficulty || this.MIN_DIFFICULTY));
            buckets[difficulty].push(question);
        }

        const selectFromPool = (pool) => {
            if (!pool || pool.length === 0) {
                return null;
            }

            let oldestTimestamp = Number.MAX_SAFE_INTEGER;
            for (const q of pool) {
                const ts = lastAskedMap.get(q.id) || 0;
                if (ts < oldestTimestamp) {
                    oldestTimestamp = ts;
                }
            }

            const candidates = pool.filter(q => (lastAskedMap.get(q.id) || 0) === oldestTimestamp);
            if (candidates.length === 0) {
                return null;
            }

            if (this.config.randomQuestions) {
                const randomIndex = Math.floor(Math.random() * candidates.length);
                return candidates[randomIndex];
            }

            candidates.sort((a, b) => a.id - b.id);
            return candidates[0];
        };

        const difficultyOrder = [preferredDifficulty];
        for (let d = this.MAX_DIFFICULTY; d > preferredDifficulty; d--) {
            difficultyOrder.push(d);
        }
        for (let d = preferredDifficulty - 1; d >= this.MIN_DIFFICULTY; d--) {
            difficultyOrder.push(d);
        }

        for (const diff of difficultyOrder) {
            const candidate = selectFromPool(buckets[diff]);
            if (candidate) {
                return candidate;
            }
        }

        return selectFromPool(availableQuestions) || availableQuestions[0];
    }

    /**
     * Trigger the slot machine animation to select a category
     * @returns {Promise<string>} The selected category
     */
    async triggerSlotMachine() {
        try {
            // Prevent overlapping slot machine animations
            if (this.gameState.slotMachineActive) {
                this.api.log('Slot machine already active, ignoring trigger', 'warn');
                return null;
            }

            this.gameState.slotMachineActive = true;

            // Build question pool respecting selected packages
            const selectedPackages = this.db.prepare('SELECT id FROM question_packages WHERE is_selected = 1').all();
            let questions;
            if (selectedPackages.length > 0) {
                const packageIds = selectedPackages
                    .map(p => Number(p.id))
                    .filter(id => Number.isInteger(id) && id > 0);
                
                if (packageIds.length > 0) {
                    const placeholders = packageIds.map(() => '?').join(',');
                    questions = this.db.prepare(`SELECT id, category FROM questions WHERE package_id IN (${placeholders})`).all(...packageIds);
                } else {
                    questions = [];
                }
            } else {
                questions = this.db.prepare('SELECT id, category FROM questions').all();
            }
            
            // Only consider questions that are still eligible (not asked in session or today)
            const todaysAskedQuestionIds = this.getTodaysAskedQuestionIds();
            const availableQuestions = questions.filter(q => 
                !this.gameState.askedQuestionIds.has(q.id) &&
                !todaysAskedQuestionIds.has(q.id)
            );

            const categoryNames = [...new Set(availableQuestions.map(q => q.category).filter(Boolean))];
            
            if (categoryNames.length === 0) {
                this.api.log('Slot machine aborted: No available categories with remaining questions', 'warn');
                this.gameState.slotMachineActive = false;
                this.gameState.slotMachineTimeout = null;
                this.api.emit('quiz-show:error', { 
                    message: 'Keine verfügbaren Kategorien mit offenen Fragen für die Slot Machine',
                    type: 'slot_machine_no_categories'
                });
                return null;
            }
            
            // Select a random category
            const selectedCategory = categoryNames[Math.floor(Math.random() * categoryNames.length)];
            
            this.api.log(`Slot machine selected category: ${selectedCategory}`, 'info');
            
            // Emit slot machine start event with all categories
            this.api.emit('quiz-show:slot-machine-start', {
                categories: categoryNames,
                spinDuration: this.config.slotMachineSpinDuration,
                spinSpeed: this.config.slotMachineSpinSpeed
            });
            
            // Play slot machine spin sound
            this.playSound('slot_machine_spin');
            
            // Wait for spin animation to complete
            this.gameState.slotMachineTimeout = setTimeout(() => {
                // Emit slot machine stop event with selected category
                this.api.emit('quiz-show:slot-machine-stop', {
                    selectedCategory: selectedCategory
                });
                
                // Play slot machine stop sound
                this.playSound('slot_machine_stop');
                
                // Store original category filter if not already stored
                if (!this.gameState.originalCategoryFilter) {
                    this.gameState.originalCategoryFilter = this.config.categoryFilter;
                }
                
                // Update category filter to selected category
                this.config.categoryFilter = [selectedCategory];
                this.saveConfig();
                
                // Wait a bit for the win animation
                setTimeout(() => {
                    // Play win sound
                    this.playSound('slot_machine_win');
                    
                    // Mark slot machine as inactive
                    this.gameState.slotMachineActive = false;
                    this.gameState.slotMachineTimeout = null;
                }, 1000);
            }, this.config.slotMachineSpinDuration * 1000);
            
            // Wait for the entire animation
            await new Promise(resolve => setTimeout(resolve, (this.config.slotMachineSpinDuration + 1) * 1000));
            
            return selectedCategory;
        } catch (error) {
            this.api.log(`Error in slot machine: ${error.message}`, 'error');
            this.gameState.slotMachineActive = false;
            this.gameState.slotMachineTimeout = null;
            throw error;
        }
    }

    async startRound() {
        this.checkSeasonAutomation();

        // If total round limit reached but state not reset yet (e.g., auto-mode edge case), reset before starting new session
        // This covers situations where a scheduled restart fires after the previous game exceeded totalRounds but state was not cleared yet
        this.api.log(`startRound invoked with currentRound=${this.gameState.currentRound}, totalRounds=${this.config.totalRounds}`, 'debug');
        // Use >= because after finishing the configured totalRounds the counter remains at the limit until we intentionally reset for a new session
        if (this.config.totalRounds > 0 && this.gameState.currentRound >= this.config.totalRounds) {
            this.api.log('Round limit reached before startRound - resetting game state for new session', 'info');
            this.resetGameState();
        }

        // Last Man Standing: start join phase on round 1
        if (this.config.lastManStandingEnabled && this.gameState.currentRound === 0) {
            this.startLMSJoinPhase();
            // Wait for join phase to complete
            await new Promise(resolve => setTimeout(resolve, this.config.lastManStandingJoinTime * 1000));
            if (!this.gameState.lastManStanding.active) {
                throw new Error('Last Man Standing cancelled - not enough participants');
            }
        }

        const activeShow = this.getActiveShowConfig();
        this.applyActiveShowConfig(activeShow);
        await this.runCategoryVotingBeforeRound(activeShow);

        // Get questions from database
        let questions;
        
        // Check if any packages are selected
        const selectedPackages = this.db.prepare('SELECT id FROM question_packages WHERE is_selected = 1').all();
        
        if (selectedPackages.length > 0) {
            // Get questions from selected packages
            const packageIds = selectedPackages.map(p => p.id);
            const placeholders = packageIds.map(() => '?').join(',');
            questions = this.db.prepare(`SELECT * FROM questions WHERE package_id IN (${placeholders})`).all(...packageIds);
        } else {
            // Get all questions
            questions = this.db.prepare('SELECT * FROM questions').all();
        }
        
        // Always apply category filter if configured (even when packages are selected)
        if (this.config.categoryFilter && !this.isCategoryFilterAll(this.config.categoryFilter)) {
            const categories = Array.isArray(this.config.categoryFilter) ? this.config.categoryFilter : [this.config.categoryFilter];
            questions = questions.filter(q => categories.includes(q.category));
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

        // Select question from available ones with difficulty progression and repetition avoidance
        const selectedQuestion = this.selectNextQuestion(availableQuestions);

        if (!selectedQuestion) {
            throw new Error('No selectable question found');
        }

        // Record this question as asked (for daily tracking)
        this.recordQuestionAsked(selectedQuestion.id);
        
        // Add to session tracking (for round tracking)
        this.gameState.askedQuestionIds.add(selectedQuestion.id);
        
        // Increment round counter
        const previousRound = this.gameState.currentRound;
        this.gameState.currentRound++;
        this.api.log(`Round counter: ${previousRound} -> ${this.gameState.currentRound} (Total rounds: ${this.config.totalRounds})`, 'debug');

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
            },
            pointsAwardedForRound: false
        };

        // TTS announcement if enabled - generate and wait before showing question
        if (this.config.ttsEnabled) {
            const ttsText = `Neue Frage: ${selectedQuestion.question}. Antworten: A: ${answers[0]}, B: ${answers[1]}, C: ${answers[2]}, D: ${answers[3]}`;
            const voiceConfig = this.config.ttsVoice || 'default';
            
            // Start TTS playback first (will use pre-generated audio if available)
            const ttsStartDelay = (this.config.ttsStartDelay || 2) * 1000;
            
            // Start TTS immediately
            this.playTTS(selectedQuestion.id, ttsText, voiceConfig).catch(error => {
                this.api.log(`TTS error: ${error.message}`, 'error');
            });
            
            // Wait for TTS to start before showing question
            await new Promise(resolve => setTimeout(resolve, ttsStartDelay));
            
            // Pre-generate TTS for the next question in background
            const nextQuestion = this.getNextQuestion();
            if (nextQuestion) {
                this.preGenerateTTS(nextQuestion).catch(error => {
                    this.api.log(`TTS pre-generation error: ${error.message}`, 'warn');
                });
            }
        }

        // Start timer (after TTS delay if enabled)
        this.startTimer();

        // Play timer start sound
        this.playSound('timer_start');

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
            if (this.config.categoryFilter && !this.isCategoryFilterAll(this.config.categoryFilter)) {
                // Handle both array and string for backwards compatibility
                const categories = Array.isArray(this.config.categoryFilter) ? this.config.categoryFilter : [this.config.categoryFilter];
                questions = questions.filter(q => categories.includes(q.category));
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

            // Filter out questions asked recently using the configured cooldown
            const cooldownCutoff = Date.now() - this.getQuestionCooldownMs();
            const recentlyAskedIds = this.db.prepare(
                'SELECT DISTINCT question_id FROM question_history WHERE asked_at > ?'
            ).all(new Date(cooldownCutoff).toISOString()).map(row => row.question_id);

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

            const nextQuestion = this.selectNextQuestion(availableQuestions);
            return nextQuestion || null;
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

    /**
     * Get the effective answer display duration (minimum 6 seconds)
     * @returns {number} Duration in seconds (always >= MIN_ANSWER_DISPLAY_DURATION)
     */
    getAnswerDisplayDuration() {
        const configValue = this.config.answerDisplayDuration || this.MIN_ANSWER_DISPLAY_DURATION;
        return Math.max(this.MIN_ANSWER_DISPLAY_DURATION, configValue);
    }

    async endRound(options = {}) {
        const suppressTTS = options.suppressTTS || false;
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }

        this.gameState.roundState = 'ended';
        // Keep isRunning true until quiz is explicitly stopped to allow proper state management
        // This allows the stop button to work correctly after a round ends

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
        if (this.config.ttsEnabled && !suppressTTS) {
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
                    speed: this.config.ttsSpeed || 1.0,
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
            answerDisplayDuration: this.getAnswerDisplayDuration(), // Send to overlay - minimum 6 seconds
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

        // Track if leaderboard will be shown (need to check for data availability)
        let willShowLeaderboard = false;
        
        // Use minimum 6 seconds for answer display (timer hiding is handled in overlay)
        const answerDisplayDuration = this.getAnswerDisplayDuration();
        
        // Show leaderboard after question if configured
        if (this.config.leaderboardShowAfterQuestion) {
            setTimeout(async () => {
                await this.showLeaderboardAfterQuestion();
            }, answerDisplayDuration * 1000); // Show after answer display duration (min 6s)
            // Check if there's data to show
            willShowLeaderboard = await this.hasLeaderboardData(this.config.leaderboardQuestionDisplayType);
        }

        // Show leaderboard after round if configured (only if not showing after question, to avoid duplication)
        if (this.config.leaderboardShowAfterRound && !this.config.leaderboardShowAfterQuestion) {
            setTimeout(async () => {
                await this.showLeaderboardAfterRound();
            }, answerDisplayDuration * 1000); // Show after answer display duration (min 6s)
            // Check if there's data to show
            willShowLeaderboard = await this.hasLeaderboardData(this.config.leaderboardRoundDisplayType);
        }

        // Check if we've reached the total rounds limit
        const totalRoundsReached = this.config.totalRounds > 0 && this.gameState.currentRound >= this.config.totalRounds;

        // Debug logging for auto mode
        this.api.log(`Auto mode check: autoMode=${this.config.autoMode}, autoRestartRound=${this.config.autoRestartRound}, totalRoundsReached=${totalRoundsReached}, currentRound=${this.gameState.currentRound}, totalRounds=${this.config.totalRounds}, willShowLeaderboard=${willShowLeaderboard}`, 'debug');

        // Auto mode - automatically advance to next question after delay
        // AUTO MODE: Advances questions regardless of autoRestartRound setting
        // AUTO RESTART: Only controls whether to start new match after total rounds reached
        if (this.config.autoMode && !totalRoundsReached) {
            const answerDisplayDuration = this.getAnswerDisplayDuration() * 1000;
            const autoDelay = (this.config.autoModeDelay || 5) * 1000;
            
            // Add leaderboard display duration ONLY if configured to show AND there's data to display
            let leaderboardDisplayDuration = 0;
            if (willShowLeaderboard && (this.config.leaderboardShowAfterQuestion || this.config.leaderboardShowAfterRound)) {
                leaderboardDisplayDuration = this.LEADERBOARD_DISPLAY_DURATION * 1000;
            }
            
            const totalDelay = answerDisplayDuration + leaderboardDisplayDuration + autoDelay;
            
            this.api.log(`Auto mode: scheduling next round in ${totalDelay}ms (answerDisplay: ${answerDisplayDuration}ms + leaderboardDisplay: ${leaderboardDisplayDuration}ms + autoDelay: ${autoDelay}ms)`, 'info');
            
            this.autoModeTimeout = setTimeout(() => {
                this.autoModeTimeout = null;
                this.api.log('Auto mode: starting next round now', 'info');
                this.startRound().catch(err => {
                    this.api.log('Error auto-starting next round: ' + err.message, 'error');
                });
            }, totalDelay);
        } else if (totalRoundsReached) {
            // Round limit reached - show final leaderboard and end game
            this.api.log(`Total rounds limit (${this.config.totalRounds}) reached - game ending`, 'info');
            
            // Show Match Leaderboard for 30 seconds, then Season Leaderboard for 30 seconds
            const endGameAnswerDisplayDuration = this.getAnswerDisplayDuration() * 1000;
            this.clearEndGameTimeouts();
            
            this.matchLeaderboardTimeout = setTimeout(async () => {
                await this.showMatchLeaderboard();
                this.matchLeaderboardTimeout = null;
            }, endGameAnswerDisplayDuration);
            
            this.seasonLeaderboardTimeout = setTimeout(async () => {
                await this.showSeasonLeaderboard();
                this.seasonLeaderboardTimeout = null;
            }, endGameAnswerDisplayDuration + 30000); // After answer display + 30s match leaderboard
            
            // After both leaderboards (30s + 30s), either hide everything or start new round if auto-play is active
            const totalLeaderboardDelay = endGameAnswerDisplayDuration + 60000; // answer display + 60s (30s match + 30s season)
            this.endGameTimeout = setTimeout(async () => {
                this.api.emit('quiz-show:hide-leaderboard');
                
                // Check if auto-play with new round start is active
                if (this.config.autoMode && this.config.autoRestartRound !== false) {
                    const autoDelay = (this.config.autoModeDelay || 5) * 1000;
                    this.endGameAutoRestartTimeout = setTimeout(() => {
                        const completedRounds = this.gameState.currentRound; // Capture before reset
                        this.api.log(`Auto mode: starting new game session after completing ${completedRounds} rounds`, 'info');
                        // Reset game state to start fresh (clears askedQuestionIds and resets currentRound to 0)
                        this.resetGameState();
                        this.api.log('Game state reset: currentRound is now 0, starting fresh session', 'info');
                        this.startRound().catch(err => {
                            this.api.log('Error auto-starting next round after game end: ' + err.message, 'error');
                        });
                        this.endGameAutoRestartTimeout = null;
                    }, autoDelay);
                } else {
                    // No auto-play, reset game state and emit quiz ended event
                    this.resetGameState();
                    const mvp = this.getMVPPlayer();
                    this.api.emit('quiz-show:quiz-ended', { mvp });
                    this.api.emit('quiz-show:stopped', {});
                }
                this.endGameTimeout = null;
            }, totalLeaderboardDelay);
        } else {
            // Auto mode not enabled - quiz should stay in ended state waiting for manual control
            // User must either click "Next Question" or "Stop Quiz"
            this.api.log(`Auto mode not triggered: autoMode=${this.config.autoMode}`, 'debug');
        }
    }

    /**
     * Check if there's leaderboard data available to display
     * @param {string} displayType - 'round', 'season', or 'both'
     * @returns {boolean} True if there's data to display
     */
    async hasLeaderboardData(displayType = 'both') {
        try {
            let hasData = false;

            if (displayType === 'round' || displayType === 'both') {
                // Check if there are any correct users in the current round
                const results = this.calculateResults();
                if (results.correctUsers && results.correctUsers.length > 0) {
                    hasData = true;
                }
            }

            if (displayType === 'season' || displayType === 'both') {
                // Check if there's any season leaderboard data
                const activeSeason = this.db.prepare('SELECT id FROM leaderboard_seasons WHERE is_active = 1').get();
                if (activeSeason) {
                    const count = this.mainDb.prepare(
                        'SELECT COUNT(*) as count FROM quiz_leaderboard_entries WHERE season_id = ?'
                    ).get(activeSeason.id);
                    if (count && count.count > 0) {
                        hasData = true;
                    }
                }
            }

            return hasData;
        } catch (error) {
            this.api.log('Error checking leaderboard data: ' + error.message, 'error');
            return false;
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
                    const seasonLeaderboard = this.mainDb.prepare(
                        'SELECT user_id, username, points FROM quiz_leaderboard_entries WHERE season_id = ? ORDER BY points DESC LIMIT 10'
                    ).all(activeSeason.id);
                    
                    leaderboard = seasonLeaderboard.map((entry, index) => ({
                        username: entry.username,
                        points: entry.points,
                        rank: index + 1
                    }));
                }
            }

            // Only emit if there's data to display, otherwise emit hide immediately
            if (leaderboard && leaderboard.length > 0) {
                // Emit leaderboard display event
                this.api.emit('quiz-show:show-leaderboard', {
                    leaderboard,
                    displayType,
                    animationStyle
                });

                // Auto-hide leaderboard after configured duration
                setTimeout(() => {
                    this.api.emit('quiz-show:hide-leaderboard');
                }, this.LEADERBOARD_DISPLAY_DURATION * 1000);
            } else {
                // No data to display - emit hide immediately to prevent blocking
                this.api.log('No leaderboard data available, skipping display', 'info');
                this.api.emit('quiz-show:hide-leaderboard');
            }
            
            // Return whether leaderboard was shown
            return leaderboard && leaderboard.length > 0;
        } catch (error) {
            this.api.log('Error showing leaderboard: ' + error.message, 'error');
            return false;
        }
    }

    async showLeaderboardAfterQuestion() {
        try {
            const displayType = this.config.leaderboardQuestionDisplayType || 'season';
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
                    const seasonLeaderboard = this.mainDb.prepare(
                        'SELECT user_id, username, points FROM quiz_leaderboard_entries WHERE season_id = ? ORDER BY points DESC LIMIT 10'
                    ).all(activeSeason.id);
                    
                    leaderboard = seasonLeaderboard.map((entry, index) => ({
                        username: entry.username,
                        points: entry.points,
                        rank: index + 1
                    }));
                }
            }

            // Only emit if there's data to display, otherwise emit hide immediately
            if (leaderboard && leaderboard.length > 0) {
                // Emit leaderboard display event
                this.api.emit('quiz-show:show-leaderboard', {
                    leaderboard,
                    displayType,
                    animationStyle,
                    context: 'after-question'
                });

                // Auto-hide leaderboard after configured duration
                setTimeout(() => {
                    this.api.emit('quiz-show:hide-leaderboard');
                }, this.LEADERBOARD_DISPLAY_DURATION * 1000);
            } else {
                // No data to display - emit hide immediately to prevent blocking
                this.api.log('No leaderboard data available, skipping display', 'info');
                this.api.emit('quiz-show:hide-leaderboard');
            }
            
            // Return whether leaderboard was shown
            return leaderboard && leaderboard.length > 0;
        } catch (error) {
            this.api.log('Error showing leaderboard after question: ' + error.message, 'error');
            return false;
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
                    const seasonLeaderboard = this.mainDb.prepare(
                        'SELECT user_id, username, points FROM quiz_leaderboard_entries WHERE season_id = ? ORDER BY points DESC LIMIT 10'
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

    /**
     * Show Match Leaderboard (current round/match results)
     */
    async showMatchLeaderboard() {
        try {
            const animationStyle = this.config.leaderboardAnimationStyle || 'fade';
            
            // Get round leaderboard (current question results)
            const results = this.calculateResults();
            const leaderboard = results.correctUsers.map((user, index) => ({
                username: user.username,
                points: index === 0 ? this.config.pointsFirstCorrect : this.config.pointsOtherCorrect,
                rank: index + 1
            }));

            if (leaderboard && leaderboard.length > 0) {
                // Emit match leaderboard display event
                this.api.emit('quiz-show:show-leaderboard', {
                    leaderboard,
                    displayType: 'Match',
                    animationStyle,
                    context: 'end-game-match'
                });
                
                this.api.log('Match leaderboard displayed for 30 seconds', 'info');
            } else {
                this.api.log('No match leaderboard data available', 'info');
            }
        } catch (error) {
            this.api.log('Error showing match leaderboard: ' + error.message, 'error');
        }
    }

    /**
     * Show Season Leaderboard (overall season standings)
     */
    async showSeasonLeaderboard() {
        try {
            const animationStyle = this.config.leaderboardAnimationStyle || 'fade';
            
            // Get season leaderboard
            const activeSeason = this.db.prepare('SELECT id FROM leaderboard_seasons WHERE is_active = 1').get();
            if (activeSeason) {
                const seasonLeaderboard = this.mainDb.prepare(
                    'SELECT user_id, username, points FROM quiz_leaderboard_entries WHERE season_id = ? ORDER BY points DESC LIMIT 10'
                ).all(activeSeason.id);
                
                const leaderboard = seasonLeaderboard.map((entry, index) => ({
                    username: entry.username,
                    points: entry.points,
                    rank: index + 1
                }));

                if (leaderboard && leaderboard.length > 0) {
                    // Emit season leaderboard display event
                    this.api.emit('quiz-show:show-leaderboard', {
                        leaderboard,
                        displayType: 'Season',
                        animationStyle,
                        context: 'end-game-season'
                    });
                    
                    this.api.log('Season leaderboard displayed for 30 seconds', 'info');
                } else {
                    this.api.log('No season leaderboard data available', 'info');
                }
            }
        } catch (error) {
            this.api.log('Error showing season leaderboard: ' + error.message, 'error');
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
        if (correctUsers.length > 0 && !this.gameState.pointsAwardedForRound) {
            // First correct answer
            const firstUser = correctUsers[0];
            this.addPoints(firstUser.userId, firstUser.username, this.config.pointsFirstCorrect);
            this.applyAnswerProgress(firstUser, true, this.config.pointsFirstCorrect, true);

            // Other correct answers (if multiple winners enabled)
            if (this.config.multipleWinners && correctUsers.length > 1) {
                for (let i = 1; i < correctUsers.length; i++) {
                    const user = correctUsers[i];
                    this.addPoints(user.userId, user.username, this.config.pointsOtherCorrect);
                    this.applyAnswerProgress(user, true, this.config.pointsOtherCorrect, false);
                }
            }

            for (const [userId, answerData] of answers) {
                if (!correctUsers.some(user => user.userId === userId)) {
                    this.applyAnswerProgress({
                        userId,
                        username: answerData.username,
                        answer: answerData.answer
                    }, false, 0, false);
                }
            }

            this.gameState.pointsAwardedForRound = true;
        } else if (correctUsers.length === 0 && !this.gameState.pointsAwardedForRound) {
            for (const [userId, answerData] of answers) {
                this.applyAnswerProgress({
                    userId,
                    username: answerData.username,
                    answer: answerData.answer
                }, false, 0, false);
            }
            this.gameState.pointsAwardedForRound = true;
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

    applyAnswerProgress(user, isCorrect, points, isFirstCorrect) {
        if (!user || !user.userId) {
            return;
        }

        if (isCorrect) {
            this.gameState.userStreaks[user.userId] = (this.gameState.userStreaks[user.userId] || 0) + 1;
            const category = this.gameState.currentQuestion?.category || 'Allgemein';
            const categoryKey = `${user.userId}:${category}`;
            this.gameState.categoryCorrectCounts[categoryKey] = (this.gameState.categoryCorrectCounts[categoryKey] || 0) + 1;
            this.applyDuelAnswerResult(user.userId, true, points);
            this.evaluateAchievements({
                userId: user.userId,
                username: user.username,
                isFirstCorrect,
                streak: this.gameState.userStreaks[user.userId],
                categoryCorrectCount: this.gameState.categoryCorrectCounts[categoryKey],
                duelWinner: false
            });
        } else {
            this.gameState.userStreaks[user.userId] = 0;
            this.applyDuelAnswerResult(user.userId, false, 0);
        }
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
            const existing = this.mainDb.prepare(`
                SELECT points FROM quiz_leaderboard_entries 
                WHERE season_id = ? AND user_id = ?
            `).get(activeSeason.id, userId);

            if (existing) {
                // Update existing entry
                this.mainDb.prepare(`
                    UPDATE quiz_leaderboard_entries 
                    SET points = points + ?, username = ? 
                    WHERE season_id = ? AND user_id = ?
                `).run(points, username, activeSeason.id, userId);
            } else {
                // Insert new entry
                this.mainDb.prepare(`
                    INSERT INTO quiz_leaderboard_entries (season_id, user_id, username, points) 
                    VALUES (?, ?, ?, ?)
                `).run(activeSeason.id, userId, username, points);
            }

            // Get updated total points
            const updated = this.mainDb.prepare(`
                SELECT points FROM quiz_leaderboard_entries 
                WHERE season_id = ? AND user_id = ?
            `).get(activeSeason.id, userId);

            // Broadcast leaderboard update
            const leaderboardData = this.mainDb.prepare(`
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
        const validLetters = ['a', 'b', 'c', 'd'];
        
        // Parse answer with configured command prefixes
        let cleanAnswer = normalized;
        let matchedPrefix = false;
        
        // Check for exclamation prefix (!a, !b, etc.)
        if (this.config.allowExclamation && normalized.startsWith('!')) {
            cleanAnswer = normalized.substring(1).trim();
            matchedPrefix = true;
        }
        // Check for slash prefix (/a, /b, etc.)
        else if (this.config.allowSlash && normalized.startsWith('/')) {
            cleanAnswer = normalized.substring(1).trim();
            matchedPrefix = true;
        }
        // Plain letters allowed without prefix
        else if (this.config.allowPlainLetters && validLetters.includes(normalized)) {
            cleanAnswer = normalized;
            matchedPrefix = true;
        }
        
        // Check if it's a valid letter answer
        const isLetter = validLetters.includes(cleanAnswer) && (matchedPrefix || this.config.allowPlainLetters);
        
        // Check if full text answers are allowed and match
        const isFullText = this.config.allowFullText && this.gameState.currentQuestion.answers.some(
            ans => ans.toLowerCase().trim() === normalized
        );

        // No valid answer format matched
        if (!isLetter && !isFullText) {
            return;
        }

        // Determine which answer index this is for
        let answerIndex = -1;
        if (isLetter) {
            answerIndex = validLetters.indexOf(cleanAnswer);
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
        
        // Get joker type from command (remove prefix)
        const prefix = this.config.jokerCommandPrefix.toLowerCase();
        if (!command.startsWith(prefix)) {
            return; // Not a valid joker command
        }
        
        const jokerSuffix = command.substring(prefix.length);

        if (jokerSuffix === '25' && this.config.joker25Enabled && this.gameState.jokersUsed['25'] === 0) {
            // 25% Joker - removes 1 wrong answer
            jokerType = '25';
            jokerData = this.activate25Joker();
            this.gameState.jokersUsed['25']++;
        } else if (jokerSuffix === '50' && this.config.joker50Enabled && this.gameState.jokersUsed['50'] === 0) {
            // 50:50 Joker
            jokerType = '50';
            jokerData = this.activate5050Joker();
            this.gameState.jokersUsed['50']++;
        } else if (jokerSuffix === 'info' && this.config.jokerInfoEnabled && this.gameState.jokersUsed['info'] === 0) {
            // Info Joker
            jokerType = 'info';
            jokerData = this.activateInfoJoker();
            this.gameState.jokersUsed['info']++;
        } else if (jokerSuffix === 'time' && this.config.jokerTimeEnabled && this.gameState.jokersUsed['time'] === 0) {
            // Time Joker
            jokerType = 'time';
            jokerData = this.activateTimeJoker();
            this.gameState.jokersUsed['time']++;
        } else if (jokerSuffix === '' || jokerSuffix.trim() === '') {
            // No specific joker type - auto-select first available with priority: 50:50 -> 25% -> time
            if (this.config.joker50Enabled && this.gameState.jokersUsed['50'] === 0) {
                jokerType = '50';
                jokerData = this.activate5050Joker();
                this.gameState.jokersUsed['50']++;
            } else if (this.config.joker25Enabled && this.gameState.jokersUsed['25'] === 0) {
                jokerType = '25';
                jokerData = this.activate25Joker();
                this.gameState.jokersUsed['25']++;
            } else if (this.config.jokerTimeEnabled && this.gameState.jokersUsed['time'] === 0) {
                jokerType = 'time';
                jokerData = this.activateTimeJoker();
                this.gameState.jokersUsed['time']++;
            }
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
            currentRound: this.gameState.currentRound,
            totalRounds: this.config.totalRounds,
            showRoundNumber: this.config.showRoundNumber,
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
                position: this.config.voterIconPosition,
                performanceMode: this.config.avatarPerformanceMode,
                cacheEnabled: this.config.avatarCacheEnabled
            },
            themePreset: this.config.hudThemePreset,
            reducedMotion: this.config.reducedMotion,
            highContrast: this.config.highContrast,
            duel: this.gameState.duel,
            ultraKompaktModus: this.config.ultraKompaktModus, // NEW: Ultra-compact mode
            ultraKompaktAnswerDelay: this.config.ultraKompaktAnswerDelay // NEW: Answer delay in ultra-compact mode
        };

        this.api.emit('quiz-show:state-update', state);
    }

    clearEndGameTimeouts() {
        if (this.matchLeaderboardTimeout) {
            clearTimeout(this.matchLeaderboardTimeout);
            this.matchLeaderboardTimeout = null;
        }

        if (this.seasonLeaderboardTimeout) {
            clearTimeout(this.seasonLeaderboardTimeout);
            this.seasonLeaderboardTimeout = null;
        }

        if (this.endGameTimeout) {
            clearTimeout(this.endGameTimeout);
            this.endGameTimeout = null;
        }

        if (this.endGameAutoRestartTimeout) {
            clearTimeout(this.endGameAutoRestartTimeout);
            this.endGameAutoRestartTimeout = null;
        }
    }

    resetGameState() {
        // Clear timer interval if it's still running
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }

        // Clear auto mode timeout if active
        this.clearEndGameTimeouts();

        if (this.autoModeTimeout) {
            clearTimeout(this.autoModeTimeout);
            this.autoModeTimeout = null;
        }

        // Clear slot machine timeout if active
        if (this.gameState.slotMachineTimeout) {
            clearTimeout(this.gameState.slotMachineTimeout);
        }

        if (this.gameState.categoryVoteTimeout) {
            clearTimeout(this.gameState.categoryVoteTimeout);
        }

        // Restore original category filter if it was modified by slot machine
        if (this.gameState.originalCategoryFilter) {
            this.config.categoryFilter = this.gameState.originalCategoryFilter;
            this.saveConfig();
        }

        this.gameState = {
            isRunning: false,
            currentQuestion: null,
            currentQuestionIndex: -1, // Deprecated: kept for backwards compatibility
            currentQuestionId: null,
            currentRound: 0,
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
            askedQuestionIds: new Set(), // Reset asked questions tracking
            // Reset slot machine state
            originalCategoryFilter: null,
            slotMachineActive: false,
            slotMachineTimeout: null,
            categoryVote: {
                active: false,
                options: [],
                votesByUser: {},
                votesByCategory: {},
                startedAt: null,
                endsAt: null,
                selectedCategory: null
            },
            categoryVoteTimeout: null,
            duel: {
                active: false,
                left: { label: 'Team A', users: [], score: 0, streak: 0, lastAnswerCorrect: null },
                right: { label: 'Team B', users: [], score: 0, streak: 0, lastAnswerCorrect: null },
                winner: null
            },
            userStreaks: {},
            categoryCorrectCounts: {},
            pointsAwardedForRound: false
        };
        
        // Clear TTS cache on reset
        this.ttsCache = {
            nextQuestionId: null,
            audioUrl: null,
            text: null
        };
    }

    /**
     * Get OpenAI configuration from main settings database
     * @returns {Object} OpenAI configuration with api_key and model
     */
    getOpenAIConfig() {
        try {
            const mainDb = this.api.getDatabase();
            
            // Get API key from main settings
            const apiKeyResult = mainDb.getSetting('openai_api_key');
            const modelResult = mainDb.getSetting('openai_model');
            
            return {
                api_key: apiKeyResult || null,
                model: modelResult || 'gpt-5-mini'
            };
        } catch (error) {
            this.api.log('Error getting OpenAI config: ' + error.message, 'error');
            return {
                api_key: null,
                model: 'gpt-5-mini'
            };
        }
    }

    /**
     * Stop active TTS playback and clear any queued items
     */
    async stopActiveTTS() {
        if (!this.config.ttsEnabled) return;

        try {
            const port = process.env.PORT || 3000;
            await axios.post(`http://localhost:${port}/api/tts/queue/skip`, {});
            await axios.post(`http://localhost:${port}/api/tts/queue/clear`, {});
        } catch (error) {
            this.api.log(`TTS stop error: ${error.message}`, 'warn');
        }
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
                speed: this.config.ttsSpeed || 1.0,
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
                    speed: this.config.ttsSpeed || 1.0,
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

            const mvp = this.mainDb.prepare(`
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

    /**
     * Process batch AI question generation in background
     * @param {Array<string>} categories - Array of category names
     * @param {number} size - Number of questions per package
     * @param {Object} service - OpenAI service instance
     */
    async processBatchGeneration(categories, size, service) {
        let successCount = 0;
        let failedCategories = [];
        
        for (let i = 0; i < categories.length; i++) {
            const category = categories[i].trim();
            
            if (!category) {
                continue; // Skip empty categories
            }
            
            try {
                this.api.log(`Batch generation: Processing ${i + 1}/${categories.length} - ${category}`, 'info');
                
                // Emit progress update
                this.api.emit('quiz-show:batch-generation-progress', {
                    current: i + 1,
                    total: categories.length,
                    category,
                    status: 'processing'
                });

                // Get existing questions for this category to avoid duplicates
                const existingQuestions = this.db.prepare(`
                    SELECT question FROM questions WHERE category = ?
                `).all(category).map(q => q.question);

                // Generate questions using OpenAI
                const questions = await service.generateQuestions(category, size, existingQuestions);

                if (questions.length === 0) {
                    this.api.log(`No questions generated for category: ${category}`, 'warn');
                    failedCategories.push(category);
                    
                    this.api.emit('quiz-show:batch-generation-progress', {
                        current: i + 1,
                        total: categories.length,
                        category,
                        status: 'failed',
                        error: 'Keine Fragen generiert'
                    });
                    continue;
                }

                // Create question package
                const name = `${category} - ${new Date().toLocaleDateString('de-DE')}`;
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

                const insertMany = this.db.transaction((questions) => {
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

                successCount++;
                
                this.api.log(`Batch generation: Successfully created package for ${category} (${questions.length} questions)`, 'info');
                
                this.api.emit('quiz-show:batch-generation-progress', {
                    current: i + 1,
                    total: categories.length,
                    category,
                    status: 'success',
                    packageId,
                    questionCount: questions.length
                });
                
                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                this.api.log(`Batch generation error for ${category}: ${error.message}`, 'error');
                failedCategories.push(category);
                
                this.api.emit('quiz-show:batch-generation-progress', {
                    current: i + 1,
                    total: categories.length,
                    category,
                    status: 'failed',
                    error: error.message
                });
            }
        }

        // Emit completion event
        this.api.emit('quiz-show:batch-generation-complete', {
            totalCategories: categories.length,
            successCount,
            failedCount: failedCategories.length,
            failedCategories
        });

        // Broadcast questions updated
        this._broadcastQuestionsUpdate();
        
        this.api.log(`Batch generation complete: ${successCount}/${categories.length} successful`, 'info');
    }

    async destroy() {
        // Clear all timers and timeouts
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        if (this.autoModeTimeout) {
            clearTimeout(this.autoModeTimeout);
            this.autoModeTimeout = null;
        }
        if (this.endGameTimeout) {
            clearTimeout(this.endGameTimeout);
            this.endGameTimeout = null;
        }
        if (this.endGameAutoRestartTimeout) {
            clearTimeout(this.endGameAutoRestartTimeout);
            this.endGameAutoRestartTimeout = null;
        }
        if (this.matchLeaderboardTimeout) {
            clearTimeout(this.matchLeaderboardTimeout);
            this.matchLeaderboardTimeout = null;
        }
        if (this.seasonLeaderboardTimeout) {
            clearTimeout(this.seasonLeaderboardTimeout);
            this.seasonLeaderboardTimeout = null;
        }
        if (this.gameState && this.gameState.categoryVoteTimeout) {
            clearTimeout(this.gameState.categoryVoteTimeout);
            this.gameState.categoryVoteTimeout = null;
        }
        if (this.gameState && this.gameState.slotMachineTimeout) {
            clearTimeout(this.gameState.slotMachineTimeout);
            this.gameState.slotMachineTimeout = null;
        }

        // Clear TTS cache
        this.ttsCache = { nextQuestionId: null, audioUrl: null, text: null };

        // Close database connection
        if (this.db) {
            this.db.close();
            this.db = null;
        }

        await this.saveConfig();

        this.api.log('Quiz Show Plugin destroyed', 'info');
    }
}

module.exports = QuizShowPlugin;

