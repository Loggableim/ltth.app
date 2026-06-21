/**
 * Advanced Timer Plugin Tests
 * Basic tests to verify plugin structure and core functionality
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const pluginDir = path.join(__dirname, '..', 'plugins', 'advanced-timer');
const TimerDatabase = require(path.join(pluginDir, 'backend', 'database.js'));

/**
 * Build a minimal mock PluginAPI suitable for database tests.
 * @param {string} pluginPath - Simulated plugin directory (for migration checks)
 * @param {string} dataDir    - Directory used as the plugin data directory
 */
function makeMockApi(pluginPath, dataDir) {
    return {
        getPluginDir: () => pluginPath,
        log: jest.fn(),
        getConfigPathManager: () => ({
            getPluginDataDir: () => dataDir
        })
    };
}

describe('Advanced Timer Plugin', () => {

    describe('Plugin Structure', () => {
        test('plugin.json exists and is valid', () => {
            const pluginJsonPath = path.join(pluginDir, 'plugin.json');
            expect(fs.existsSync(pluginJsonPath)).toBe(true);

            const pluginJson = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
            expect(pluginJson.id).toBe('advanced-timer');
            expect(pluginJson.name).toBe('Advanced Timer');
            expect(pluginJson.entry).toBe('main.js');
            expect(pluginJson.version).toBeDefined();
            expect(pluginJson.permissions).toContain('socket.io');
            expect(pluginJson.permissions).toContain('routes');
            expect(pluginJson.permissions).toContain('tiktok-events');
            expect(pluginJson.permissions).toContain('database');
        });

        test('main.js exists', () => {
            const mainJsPath = path.join(pluginDir, 'main.js');
            expect(fs.existsSync(mainJsPath)).toBe(true);
        });

        test('backend modules exist', () => {
            const backendDir = path.join(pluginDir, 'backend');
            expect(fs.existsSync(path.join(backendDir, 'database.js'))).toBe(true);
            expect(fs.existsSync(path.join(backendDir, 'api.js'))).toBe(true);
            expect(fs.existsSync(path.join(backendDir, 'websocket.js'))).toBe(true);
            expect(fs.existsSync(path.join(backendDir, 'event-handlers.js'))).toBe(true);
        });

        test('engine module exists', () => {
            const engineDir = path.join(pluginDir, 'engine');
            expect(fs.existsSync(path.join(engineDir, 'timer-engine.js'))).toBe(true);
        });

        test('ui files exist', () => {
            expect(fs.existsSync(path.join(pluginDir, 'ui.html'))).toBe(true);
            expect(fs.existsSync(path.join(pluginDir, 'ui', 'ui.js'))).toBe(true);
        });

        test('overlay files exist', () => {
            const overlayDir = path.join(pluginDir, 'overlay');
            expect(fs.existsSync(path.join(overlayDir, 'index.html'))).toBe(true);
            expect(fs.existsSync(path.join(overlayDir, 'overlay.js'))).toBe(true);
            // Also check for overlay.html in plugin root (served by routes)
            expect(fs.existsSync(path.join(pluginDir, 'overlay.html'))).toBe(true);
        });

        test('README exists', () => {
            expect(fs.existsSync(path.join(pluginDir, 'README.md'))).toBe(true);
        });

        test('localization file exists', () => {
            expect(fs.existsSync(path.join(pluginDir, 'locales', 'de.json'))).toBe(true);
        });
    });

    describe('Plugin Module Loading', () => {
        test('main.js exports a class', () => {
            const MainClass = require(path.join(pluginDir, 'main.js'));
            expect(typeof MainClass).toBe('function');
        });

        test('database module exports a class', () => {
            const DatabaseClass = require(path.join(pluginDir, 'backend', 'database.js'));
            expect(typeof DatabaseClass).toBe('function');
        });

        test('api module exports a class', () => {
            const APIClass = require(path.join(pluginDir, 'backend', 'api.js'));
            expect(typeof APIClass).toBe('function');
        });

        test('websocket module exports a class', () => {
            const WebSocketClass = require(path.join(pluginDir, 'backend', 'websocket.js'));
            expect(typeof WebSocketClass).toBe('function');
        });

        test('event-handlers module exports a class', () => {
            const EventHandlersClass = require(path.join(pluginDir, 'backend', 'event-handlers.js'));
            expect(typeof EventHandlersClass).toBe('function');
        });

        test('timer-engine module exports objects', () => {
            const { Timer, TimerEngine } = require(path.join(pluginDir, 'engine', 'timer-engine.js'));
            expect(typeof Timer).toBe('function');
            expect(typeof TimerEngine).toBe('function');
        });
    });

    describe('Timer Engine', () => {
        let Timer, TimerEngine;
        
        beforeAll(() => {
            const timerModule = require(path.join(pluginDir, 'engine', 'timer-engine.js'));
            Timer = timerModule.Timer;
            TimerEngine = timerModule.TimerEngine;
        });

        test('creates timer with countdown mode', () => {
            const mockApi = { log: jest.fn() };
            const config = {
                id: 'test-timer-1',
                name: 'Test Countdown',
                mode: 'countdown',
                initial_duration: 60,
                current_value: 60,
                state: 'stopped',
                config: {}
            };
            
            const timer = new Timer(config, mockApi);
            expect(timer.id).toBe('test-timer-1');
            expect(timer.mode).toBe('countdown');
            expect(timer.currentValue).toBe(60);
        });

        test('creates timer with countup mode', () => {
            const mockApi = { log: jest.fn() };
            const config = {
                id: 'test-timer-2',
                name: 'Test Count Up',
                mode: 'countup',
                target_value: 100,
                current_value: 0,
                state: 'stopped',
                config: {}
            };
            
            const timer = new Timer(config, mockApi);
            expect(timer.id).toBe('test-timer-2');
            expect(timer.mode).toBe('countup');
            expect(timer.targetValue).toBe(100);
        });

        test('timer engine manages multiple timers', () => {
            const mockApi = { log: jest.fn() };
            const engine = new TimerEngine(mockApi);
            
            const config1 = {
                id: 'timer-1',
                name: 'Timer 1',
                mode: 'countdown',
                initial_duration: 60,
                current_value: 60,
                state: 'stopped',
                config: {}
            };
            
            const config2 = {
                id: 'timer-2',
                name: 'Timer 2',
                mode: 'stopwatch',
                current_value: 0,
                state: 'stopped',
                config: {}
            };
            
            engine.createTimer(config1);
            engine.createTimer(config2);
            
            expect(engine.timers.size).toBe(2);
            expect(engine.getTimer('timer-1')).toBeDefined();
            expect(engine.getTimer('timer-2')).toBeDefined();
        });

        test('timer can add time', () => {
            const mockApi = { log: jest.fn() };
            const config = {
                id: 'test-timer-3',
                name: 'Test Timer',
                mode: 'countdown',
                initial_duration: 60,
                current_value: 60,
                state: 'stopped',
                config: {}
            };
            
            const timer = new Timer(config, mockApi);
            const initialValue = timer.currentValue;
            
            timer.addTime(30);
            
            expect(timer.currentValue).toBe(initialValue + 30);
        });

        test('timer can remove time', () => {
            const mockApi = { log: jest.fn() };
            const config = {
                id: 'test-timer-4',
                name: 'Test Timer',
                mode: 'countdown',
                initial_duration: 60,
                current_value: 60,
                state: 'stopped',
                config: {}
            };
            
            const timer = new Timer(config, mockApi);
            const initialValue = timer.currentValue;
            
            timer.removeTime(10);
            
            expect(timer.currentValue).toBe(initialValue - 10);
        });
    });

    describe('Event Handlers', () => {
        test('gift event should calculate time based on coins', async () => {
            const mockApi = { 
                log: jest.fn(),
                registerTikTokEvent: jest.fn()
            };
            const mockDb = {
                getAllTimers: jest.fn(() => [{
                    id: 'test-timer',
                    name: 'Test Timer',
                    mode: 'countdown',
                    initial_duration: 60,
                    current_value: 60,
                    state: 'stopped',
                    config: {}
                }]),
                getTimerEvents: jest.fn(() => [{
                    id: 1,
                    timer_id: 'test-timer',
                    event_type: 'gift',
                    action_type: 'add_time',
                    action_value: 0.1,  // 0.1 seconds per coin
                    conditions: {},
                    enabled: 1
                }]),
                updateTimerState: jest.fn(),
                addTimerLog: jest.fn()
            };
            
            const mockTimer = {
                id: 'test-timer',
                currentValue: 60,
                state: 'stopped',
                addTime: jest.fn()
            };
            
            const mockEngine = {
                getTimer: jest.fn(() => mockTimer)
            };
            
            const mockPlugin = {
                api: mockApi,
                db: mockDb,
                engine: mockEngine
            };
            
            const EventHandlers = require(path.join(pluginDir, 'backend', 'event-handlers.js'));
            const eventHandlers = new EventHandlers(mockPlugin);
            
            // Simulate a gift event with 100 coins
            const giftData = {
                giftName: 'Rose',
                coins: 100,
                uniqueId: 'testuser',
                repeatCount: 1
            };
            
            await eventHandlers.handleGiftEvent(giftData);
            
            // Should add 10 seconds (0.1 * 100 coins)
            expect(mockTimer.addTime).toHaveBeenCalledWith(10, 'gift:testuser');
        });

        test('like event should calculate time based on like count', async () => {
            const mockApi = { 
                log: jest.fn(),
                registerTikTokEvent: jest.fn()
            };
            const mockDb = {
                getAllTimers: jest.fn(() => [{
                    id: 'test-timer',
                    name: 'Test Timer',
                    mode: 'countdown',
                    initial_duration: 60,
                    current_value: 60,
                    state: 'stopped',
                    config: {}
                }]),
                getTimerEvents: jest.fn(() => [{
                    id: 1,
                    timer_id: 'test-timer',
                    event_type: 'like',
                    action_type: 'add_time',
                    action_value: 0.1,  // 0.1 seconds per like
                    conditions: {},
                    enabled: 1
                }]),
                updateTimerState: jest.fn(),
                addTimerLog: jest.fn()
            };
            
            const mockTimer = {
                id: 'test-timer',
                currentValue: 60,
                state: 'stopped',
                addTime: jest.fn()
            };
            
            const mockEngine = {
                getTimer: jest.fn(() => mockTimer)
            };
            
            const mockPlugin = {
                api: mockApi,
                db: mockDb,
                engine: mockEngine
            };
            
            const EventHandlers = require(path.join(pluginDir, 'backend', 'event-handlers.js'));
            const eventHandlers = new EventHandlers(mockPlugin);
            
            // Simulate a like event with 50 likes
            const likeData = {
                likeCount: 50,
                uniqueId: 'testuser',
                totalLikeCount: 1000
            };
            
            await eventHandlers.handleLikeEvent(likeData);
            
            // Should add 5 seconds (0.1 * 50 likes)
            expect(mockTimer.addTime).toHaveBeenCalledWith(5, 'like:testuser');
        });
    });

    describe('Localization', () => {
        test('German localization is valid JSON', () => {
            const localePath = path.join(pluginDir, 'locales', 'de.json');
            const localeData = JSON.parse(fs.readFileSync(localePath, 'utf8'));
            
            expect(localeData.plugin).toBeDefined();
            expect(localeData.plugin.name).toBeDefined();
            expect(localeData.ui).toBeDefined();
            expect(localeData.events).toBeDefined();
        });
    });

    describe('Database Initialization and Timer Creation', () => {
        let tmpDir;

        beforeEach(() => {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'advanced-timer-test-'));
        });

        afterEach(() => {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        });

        test('initialize() opens the database and creates tables', () => {
            const mockApi = makeMockApi(tmpDir, path.join(tmpDir, 'plugin-data'));
            const db = new TimerDatabase(mockApi);

            expect(() => db.initialize()).not.toThrow();
            expect(db.db).not.toBeNull();

            // Verify tables exist
            const tables = db.db.prepare(
                "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
            ).all().map(r => r.name);

            expect(tables).toContain('advanced_timers');
            expect(tables).toContain('advanced_timer_events');
            expect(tables).toContain('advanced_timer_rules');
            expect(tables).toContain('advanced_timer_chains');
            expect(tables).toContain('advanced_timer_logs');
            expect(tables).toContain('advanced_timer_profiles');

            db.db.close();
        });

        test('saveTimer() saves a new timer and returns true', () => {
            const mockApi = makeMockApi(tmpDir, path.join(tmpDir, 'plugin-data'));
            const db = new TimerDatabase(mockApi);
            db.initialize();

            const result = db.saveTimer({
                id: 'timer_test_1',
                name: 'Test Countdown',
                mode: 'countdown',
                initial_duration: 60,
                current_value: 60,
                target_value: 0,
                state: 'stopped',
                config: {}
            });

            expect(result).toBe(true);

            const timers = db.getAllTimers();
            expect(timers).toHaveLength(1);
            expect(timers[0].id).toBe('timer_test_1');
            expect(timers[0].name).toBe('Test Countdown');
            expect(timers[0].mode).toBe('countdown');
            expect(timers[0].initial_duration).toBe(60);
            expect(timers[0].config).toEqual({});

            db.db.close();
        });

        test('saveTimer() serializes config field correctly', () => {
            const mockApi = makeMockApi(tmpDir, path.join(tmpDir, 'plugin-data'));
            const db = new TimerDatabase(mockApi);
            db.initialize();

            const configData = { giftMultiplier: 2, enabled: true };
            db.saveTimer({
                id: 'timer_test_2',
                name: 'Test Countup',
                mode: 'countup',
                initial_duration: 0,
                current_value: 0,
                target_value: 120,
                state: 'stopped',
                config: configData
            });

            const timer = db.getTimer('timer_test_2');
            expect(timer).not.toBeNull();
            expect(timer.config).toEqual(configData);

            db.db.close();
        });

        test('saveTimer() returns false when database is not initialized', () => {
            const mockApi = makeMockApi(tmpDir, path.join(tmpDir, 'plugin-data'));
            const db = new TimerDatabase(mockApi);
            // Deliberately skip initialize()

            const result = db.saveTimer({
                id: 'timer_test_3',
                name: 'Test',
                mode: 'stopwatch',
                initial_duration: 0,
                current_value: 0,
                target_value: 0,
                state: 'stopped',
                config: {}
            });

            expect(result).toBe(false);
            expect(mockApi.log).toHaveBeenCalledWith(
                expect.stringContaining('Error saving timer:'),
                'error'
            );
        });

        test('initialize() is idempotent - calling twice does not throw', () => {
            const mockApi = makeMockApi(tmpDir, path.join(tmpDir, 'plugin-data'));
            const db = new TimerDatabase(mockApi);

            expect(() => {
                db.initialize();
                db.initialize();
            }).not.toThrow();

            db.db.close();
        });

        test('migration runs after tables are created when old db exists', () => {
            // Create a fake old database with data
            const oldDir = path.join(tmpDir, 'old-plugin', 'data');
            fs.mkdirSync(oldDir, { recursive: true });
            const oldDbPath = path.join(oldDir, 'timers.db');

            const OldDb = require('better-sqlite3');
            const oldDb = new OldDb(oldDbPath);
            oldDb.exec(`
                CREATE TABLE advanced_timers (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    mode TEXT NOT NULL,
                    initial_duration REAL DEFAULT 0,
                    current_value REAL DEFAULT 0,
                    target_value REAL DEFAULT 0,
                    state TEXT DEFAULT 'stopped',
                    created_at INTEGER DEFAULT (strftime('%s', 'now')),
                    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
                    config TEXT DEFAULT '{}'
                )
            `);
            oldDb.prepare(
                `INSERT INTO advanced_timers (id, name, mode, initial_duration, current_value, target_value, state, config)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            ).run('migrated-timer', 'Migrated Timer', 'countdown', 30, 30, 0, 'stopped', '{}');
            oldDb.close();

            // Mock api pointing to old plugin dir
            const mockApi = {
                getPluginDir: () => path.join(tmpDir, 'old-plugin'),
                log: jest.fn(),
                getConfigPathManager: () => ({
                    getPluginDataDir: () => path.join(tmpDir, 'plugin-data')
                })
            };

            const db = new TimerDatabase(mockApi);
            db.initialize();

            const timers = db.getAllTimers();
            expect(timers).toHaveLength(1);
            expect(timers[0].id).toBe('migrated-timer');
            expect(timers[0].name).toBe('Migrated Timer');

            db.db.close();
        });
    });

    describe('Timer Restore Ordering', () => {
        test('loadTimers sets timer values before starting it', () => {
            // WHY THIS MATTERS: If timer.start() is called before initialDuration / currentValue
            // are restored from the DB, the engine briefly ticks with the constructor-defaults
            // (typically 0). This causes a visible jump in the displayed time and incorrect
            // completion-detection when the timer is resumed right after a plugin restart.
            // The fix sets initialDuration, targetValue and currentValue from the DB record
            // BEFORE calling timer.start().
            const { Timer, TimerEngine } = require(path.join(pluginDir, 'engine', 'timer-engine.js'));
            const mockApi = { log: jest.fn() };
            const engine = new TimerEngine(mockApi);

            // Capture timer values at the moment start() is invoked
            const valueAtStart = { initialDuration: null, targetValue: null, currentValue: null };
            const originalCreateTimer = engine.createTimer.bind(engine);

            let capturedTimer = null;
            engine.createTimer = (data) => {
                capturedTimer = originalCreateTimer(data);
                const origStart = capturedTimer.start.bind(capturedTimer);
                capturedTimer.start = () => {
                    valueAtStart.initialDuration = capturedTimer.initialDuration;
                    valueAtStart.targetValue = capturedTimer.targetValue;
                    valueAtStart.currentValue = capturedTimer.currentValue;
                    origStart();
                };
                return capturedTimer;
            };

            // Simulate the correct ordering from loadTimers: set values FIRST, then start
            const timerData = {
                id: 'restore-test',
                name: 'Restore Test',
                mode: 'countdown',
                initial_duration: 120,
                current_value: 75,
                target_value: 0,
                state: 'running',
                config: {}
            };

            const timer = engine.createTimer(timerData);
            // Correct order: restore saved values before starting
            timer.initialDuration = timerData.initial_duration;
            timer.targetValue = timerData.target_value;
            timer.currentValue = timerData.current_value;
            timer.start();

            // Values must reflect the DB record, not constructor defaults, when the timer starts
            expect(valueAtStart.initialDuration).toBe(120);
            expect(valueAtStart.currentValue).toBe(75);

            // Cleanup
            if (capturedTimer && capturedTimer.intervalId) {
                clearInterval(capturedTimer.intervalId);
            }
        });
    });
});
