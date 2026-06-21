/**
 * Event TTS System Test
 * 
 * Tests the Event TTS Handler for TikTok LIVE events
 * including gift, follow, share, subscribe, like, and join events.
 */

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// Mock logger
const mockLogger = {
    info: (msg) => console.log(`[INFO] ${msg}`),
    warn: (msg) => console.log(`[WARN] ${msg}`),
    error: (msg) => console.log(`[ERROR] ${msg}`),
    debug: (msg) => console.log(`[DEBUG] ${msg}`)
};

// Mock API
class MockAPI {
    constructor(db) {
        this.db = db;
        this.logger = mockLogger;
        this.config = {};
        this.emittedEvents = [];
        this.tiktokEventHandlers = {};
    }

    getDatabase() {
        return this.db;
    }

    getConfig(key) {
        return this.config[key];
    }

    setConfig(key, value) {
        this.config[key] = value;
        return true;
    }

    emit(event, data) {
        this.emittedEvents.push({ event, data });
    }

    getConfigPathManager() {
        return {
            getTikTokSessionId: () => null
        };
    }

    registerRoute() {}
    registerSocket() {}
    
    registerTikTokEvent(eventType, handler) {
        if (!this.tiktokEventHandlers[eventType]) {
            this.tiktokEventHandlers[eventType] = [];
        }
        this.tiktokEventHandlers[eventType].push(handler);
    }
    
    // Simulate TikTok event
    simulateTikTokEvent(eventType, data) {
        const handlers = this.tiktokEventHandlers[eventType] || [];
        handlers.forEach(handler => handler(data));
    }
}

// Mock TTS Plugin
class MockTTSPlugin {
    constructor(api) {
        this.api = api;
        this.logger = mockLogger;
        this.speakCalls = [];
        this.config = {
            eventTTS: {
                enabled: true,
                volume: 80,
                voice: null,
                priorityOverChat: false,
                events: {
                    gift: {
                        enabled: true,
                        template: '{username} hat {giftName} geschenkt!',
                        minCoins: 0,
                        cooldownSeconds: 0
                    },
                    follow: {
                        enabled: true,
                        template: '{username} folgt dir jetzt!',
                        cooldownSeconds: 5
                    },
                    share: {
                        enabled: true,
                        template: '{username} hat den Stream geteilt!',
                        cooldownSeconds: 10
                    },
                    subscribe: {
                        enabled: true,
                        template: '{username} hat abonniert!',
                        cooldownSeconds: 0
                    },
                    like: {
                        enabled: false,
                        template: '{username} liked!',
                        minLikes: 10,
                        cooldownSeconds: 30
                    },
                    join: {
                        enabled: false,
                        template: '{username} ist beigetreten!',
                        cooldownSeconds: 60
                    }
                }
            }
        };
    }
    
    async speak(params) {
        this.speakCalls.push(params);
        return { success: true };
    }
}

// Test database setup
function createTestDatabase() {
    const dbPath = path.join(__dirname, 'test-event-tts.db');
    
    // Remove existing test database
    if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
    }
    
    const db = new Database(dbPath);
    
    // Create required tables
    db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    `);
    
    // Wrap database for compatibility
    return {
        db: db,
        getSetting: (key) => {
            const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
            return row ? row.value : null;
        },
        setSetting: (key, value) => {
            db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
        }
    };
}

describe('Event TTS System', () => {
    let db;
    let mockAPI;
    let mockTTS;
    let EventTTSHandler;
    let handler;

    beforeAll(() => {
        // Create test database
        db = createTestDatabase();
        
        // Load EventTTSHandler
        EventTTSHandler = require('../plugins/tts/event-tts-handler');
    });

    beforeEach(() => {
        // Reset mock API and TTS plugin
        mockAPI = new MockAPI(db);
        mockTTS = new MockTTSPlugin(mockAPI);
        
        // Create handler instance
        handler = new EventTTSHandler(mockTTS);
        handler.init();
    });

    afterEach(() => {
        // Clean up handler
        if (handler) {
            handler.destroy();
        }
    });

    afterAll(() => {
        // Clean up test database
        const dbPath = path.join(__dirname, 'test-event-tts.db');
        if (fs.existsSync(dbPath)) {
            db.db.close();
            fs.unlinkSync(dbPath);
        }
    });

    describe('Gift Events', () => {
        test('should process gift event with correct template', () => {
            mockAPI.simulateTikTokEvent('gift', {
                userId: 'user123',
                username: 'TestUser',
                nickname: 'Test User',
                giftName: 'Rose',
                repeatCount: 1,
                coins: 1
            });

            expect(mockTTS.speakCalls.length).toBe(1);
            expect(mockTTS.speakCalls[0].text).toBe('TestUser hat Rose geschenkt!');
            expect(mockTTS.speakCalls[0].source).toBe('event:gift');
            expect(mockTTS.speakCalls[0].volume).toBe(80);
        });

        test('should filter gifts below minCoins threshold', () => {
            // Set min coins to 10
            mockTTS.config.eventTTS.events.gift.minCoins = 10;
            handler.destroy();
            handler = new EventTTSHandler(mockTTS);
            handler.init();

            mockAPI.simulateTikTokEvent('gift', {
                userId: 'user123',
                username: 'TestUser',
                giftName: 'Rose',
                coins: 1
            });

            expect(mockTTS.speakCalls.length).toBe(0);
        });

        test('should process gifts at or above minCoins threshold', () => {
            mockTTS.config.eventTTS.events.gift.minCoins = 10;
            handler.destroy();
            handler = new EventTTSHandler(mockTTS);
            handler.init();

            mockAPI.simulateTikTokEvent('gift', {
                userId: 'user123',
                username: 'TestUser',
                giftName: 'TikTok',
                coins: 10
            });

            expect(mockTTS.speakCalls.length).toBe(1);
            expect(mockTTS.speakCalls[0].text).toContain('TestUser');
        });

        test('should respect cooldown for gift events', (done) => {
            mockTTS.config.eventTTS.events.gift.cooldownSeconds = 1;
            handler.destroy();
            handler = new EventTTSHandler(mockTTS);
            handler.init();

            // First gift should go through
            mockAPI.simulateTikTokEvent('gift', {
                userId: 'user123',
                username: 'TestUser',
                giftName: 'Rose',
                coins: 1
            });

            expect(mockTTS.speakCalls.length).toBe(1);

            // Second gift immediately should be blocked
            mockAPI.simulateTikTokEvent('gift', {
                userId: 'user123',
                username: 'TestUser',
                giftName: 'Rose',
                coins: 1
            });

            expect(mockTTS.speakCalls.length).toBe(1);

            // After cooldown expires, should go through
            setTimeout(() => {
                mockAPI.simulateTikTokEvent('gift', {
                    userId: 'user123',
                    username: 'TestUser',
                    giftName: 'Rose',
                    coins: 1
                });

                expect(mockTTS.speakCalls.length).toBe(2);
                done();
            }, 1100);
        });

        test('should not process disabled gift events', () => {
            mockTTS.config.eventTTS.events.gift.enabled = false;
            handler.destroy();
            handler = new EventTTSHandler(mockTTS);
            handler.init();

            mockAPI.simulateTikTokEvent('gift', {
                userId: 'user123',
                username: 'TestUser',
                giftName: 'Rose',
                coins: 1
            });

            expect(mockTTS.speakCalls.length).toBe(0);
        });
    });

    describe('Follow Events', () => {
        test('should process follow event', () => {
            mockAPI.simulateTikTokEvent('follow', {
                userId: 'user456',
                username: 'NewFollower',
                nickname: 'New Follower'
            });

            expect(mockTTS.speakCalls.length).toBe(1);
            expect(mockTTS.speakCalls[0].text).toBe('NewFollower folgt dir jetzt!');
            expect(mockTTS.speakCalls[0].source).toBe('event:follow');
        });

        test('should respect cooldown for follow events', (done) => {
            mockAPI.simulateTikTokEvent('follow', {
                userId: 'user456',
                username: 'NewFollower'
            });

            expect(mockTTS.speakCalls.length).toBe(1);

            // Second follow within cooldown should be blocked
            mockAPI.simulateTikTokEvent('follow', {
                userId: 'user456',
                username: 'NewFollower'
            });

            expect(mockTTS.speakCalls.length).toBe(1);

            // After cooldown, should go through
            setTimeout(() => {
                mockAPI.simulateTikTokEvent('follow', {
                    userId: 'user456',
                    username: 'NewFollower'
                });

                expect(mockTTS.speakCalls.length).toBe(2);
                done();
            }, 5100);
        });
    });

    describe('Template System', () => {
        test('should substitute all template variables', () => {
            mockAPI.simulateTikTokEvent('gift', {
                userId: 'user789',
                username: 'TemplateUser',
                nickname: 'Template User',
                giftName: 'Galaxy',
                repeatCount: 5,
                coins: 1000
            });

            expect(mockTTS.speakCalls.length).toBe(1);
            const text = mockTTS.speakCalls[0].text;
            expect(text).toContain('TemplateUser');
            expect(text).toContain('Galaxy');
        });

        test('should handle missing optional data gracefully', () => {
            mockAPI.simulateTikTokEvent('follow', {
                userId: 'user999'
                // Missing username and nickname
            });

            expect(mockTTS.speakCalls.length).toBe(1);
            expect(mockTTS.speakCalls[0].text).toContain('Someone');
        });
    });

    describe('Priority System', () => {
        test('should use normal priority when priorityOverChat is false', () => {
            mockAPI.simulateTikTokEvent('gift', {
                userId: 'user123',
                username: 'TestUser',
                giftName: 'Rose',
                coins: 1
            });

            expect(mockTTS.speakCalls[0].priority).toBe('normal');
        });

        test('should use high priority when priorityOverChat is true', () => {
            mockTTS.config.eventTTS.priorityOverChat = true;
            handler.destroy();
            handler = new EventTTSHandler(mockTTS);
            handler.init();

            mockAPI.simulateTikTokEvent('gift', {
                userId: 'user123',
                username: 'TestUser',
                giftName: 'Rose',
                coins: 1
            });

            expect(mockTTS.speakCalls[0].priority).toBe('high');
        });
    });

    describe('Master Enable/Disable', () => {
        test('should not process any events when eventTTS is disabled', () => {
            mockTTS.config.eventTTS.enabled = false;
            handler.destroy();
            handler = new EventTTSHandler(mockTTS);
            handler.init();

            mockAPI.simulateTikTokEvent('gift', {
                userId: 'user123',
                username: 'TestUser',
                giftName: 'Rose',
                coins: 1
            });

            mockAPI.simulateTikTokEvent('follow', {
                userId: 'user456',
                username: 'NewFollower'
            });

            expect(mockTTS.speakCalls.length).toBe(0);
        });
    });

    describe('Periodic Reminders', () => {
        test('should not announce periodic reminders when TikTok stream is inactive', () => {
            jest.useFakeTimers();

            try {
                mockAPI.tiktok = {
                    isActive: jest.fn(() => false)
                };
                mockTTS.config.eventTTS.advanced = {
                    periodicReminder: {
                        enabled: true,
                        intervalMinutes: 0.001,
                        messages: ['Stream reminder should wait for live mode'],
                        voiceId: null
                    }
                };

                handler.destroy();
                handler = new EventTTSHandler(mockTTS);
                handler.init();

                jest.advanceTimersByTime(60);

                expect(mockTTS.speakCalls.length).toBe(0);
                expect(mockAPI.tiktok.isActive).toHaveBeenCalled();
            } finally {
                handler.destroy();
                jest.useRealTimers();
            }
        });
    });

    describe('Cooldown System', () => {
        test('should track cooldowns per user and event type separately', (done) => {
            mockAPI.simulateTikTokEvent('gift', {
                userId: 'user123',
                username: 'User1',
                giftName: 'Rose',
                coins: 1
            });

            // Same user, different event type - should not be blocked
            mockAPI.simulateTikTokEvent('follow', {
                userId: 'user123',
                username: 'User1'
            });

            // Different user, same event type - should not be blocked
            mockAPI.simulateTikTokEvent('gift', {
                userId: 'user456',
                username: 'User2',
                giftName: 'Rose',
                coins: 1
            });

            expect(mockTTS.speakCalls.length).toBe(3);
            done();
        });
    });
});
