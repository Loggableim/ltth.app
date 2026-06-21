/**
 * Advanced Timer Plugin - New Features Tests
 * Tests for newly implemented features:
 * - Flow actions (resume, set-value, create, delete, etc.)
 * - Validation (mode-specific requirements)
 * - Fractional gift handling
 * - Profile application
 */

const path = require('path');
const fs = require('fs');

describe('Advanced Timer - New Features', () => {
    const pluginDir = path.join(__dirname, '..', 'plugins', 'advanced-timer');

    describe('Main Module Flow Actions', () => {
        let MainClass;
        let mockApi;
        let plugin;

        beforeEach(() => {
            MainClass = require(path.join(pluginDir, 'main.js'));
            
            // Mock API with registerIFTTTAction
            mockApi = {
                log: jest.fn(),
                registerRoute: jest.fn(),
                registerSocket: jest.fn(),
                registerTikTokEvent: jest.fn(),
                registerIFTTTAction: jest.fn(),
                pluginDir: pluginDir,
                getConfigPathManager: () => null
            };

            plugin = new MainClass(mockApi);
            plugin.db = {
                initialize: jest.fn(),
                getAllTimers: jest.fn().mockReturnValue([]),
                saveTimer: jest.fn().mockReturnValue(true),
                deleteTimer: jest.fn(),
                updateTimerState: jest.fn(),
                addTimerLog: jest.fn(),
                getTimer: jest.fn(),
                getProfile: jest.fn(),
                getAllChains: jest.fn().mockReturnValue([]),
                getAllRules: jest.fn().mockReturnValue([]),
                saveTimerRule: jest.fn()
            };
            plugin.engine = {
                getAllTimers: jest.fn().mockReturnValue([]),
                getTimer: jest.fn(),
                createTimer: jest.fn(),
                removeTimer: jest.fn()
            };
        });

        test('registers resume timer action', () => {
            plugin.registerFlowActions();
            
            const resumeAction = mockApi.registerIFTTTAction.mock.calls.find(
                call => call[0] === 'advanced-timer:resume'
            );
            
            expect(resumeAction).toBeDefined();
            expect(resumeAction[1].name).toBe('Resume Timer');
            expect(resumeAction[1].fields).toHaveLength(1);
            expect(resumeAction[1].fields[0].name).toBe('timerId');
        });

        test('registers set timer value action', () => {
            plugin.registerFlowActions();
            
            const setValueAction = mockApi.registerIFTTTAction.mock.calls.find(
                call => call[0] === 'advanced-timer:set-value'
            );
            
            expect(setValueAction).toBeDefined();
            expect(setValueAction[1].name).toBe('Set Timer Value');
            expect(setValueAction[1].fields).toHaveLength(2);
            expect(setValueAction[1].fields[1].name).toBe('seconds');
        });

        test('registers create timer action', () => {
            plugin.registerFlowActions();
            
            const createAction = mockApi.registerIFTTTAction.mock.calls.find(
                call => call[0] === 'advanced-timer:create'
            );
            
            expect(createAction).toBeDefined();
            expect(createAction[1].name).toBe('Create Timer');
            expect(createAction[1].fields.some(f => f.name === 'name')).toBe(true);
            expect(createAction[1].fields.some(f => f.name === 'mode')).toBe(true);
            expect(createAction[1].fields.some(f => f.name === 'initialDuration')).toBe(true);
            expect(createAction[1].fields.some(f => f.name === 'targetValue')).toBe(true);
        });

        test('registers delete timer action', () => {
            plugin.registerFlowActions();
            
            const deleteAction = mockApi.registerIFTTTAction.mock.calls.find(
                call => call[0] === 'advanced-timer:delete'
            );
            
            expect(deleteAction).toBeDefined();
            expect(deleteAction[1].name).toBe('Delete Timer');
        });

        test('registers like-speed ratio action', () => {
            plugin.registerFlowActions();
            
            const likeSpeedAction = mockApi.registerIFTTTAction.mock.calls.find(
                call => call[0] === 'advanced-timer:set-like-speed'
            );
            
            expect(likeSpeedAction).toBeDefined();
            expect(likeSpeedAction[1].name).toBe('Set Like Speed Ratio');
            expect(likeSpeedAction[1].fields.some(f => f.name === 'ratio')).toBe(true);
            expect(likeSpeedAction[1].fields.some(f => f.name === 'enabled')).toBe(true);
        });

        test('registers chain and rule actions', () => {
            plugin.registerFlowActions();
            
            const triggerChain = mockApi.registerIFTTTAction.mock.calls.find(
                call => call[0] === 'advanced-timer:trigger-chain'
            );
            const enableRule = mockApi.registerIFTTTAction.mock.calls.find(
                call => call[0] === 'advanced-timer:enable-rule'
            );
            const disableRule = mockApi.registerIFTTTAction.mock.calls.find(
                call => call[0] === 'advanced-timer:disable-rule'
            );
            
            expect(triggerChain).toBeDefined();
            expect(enableRule).toBeDefined();
            expect(disableRule).toBeDefined();
        });

        test('registers apply profile action', () => {
            plugin.registerFlowActions();
            
            const applyProfile = mockApi.registerIFTTTAction.mock.calls.find(
                call => call[0] === 'advanced-timer:apply-profile'
            );
            
            expect(applyProfile).toBeDefined();
            expect(applyProfile[1].name).toBe('Apply Timer Profile');
            expect(applyProfile[1].fields[0].name).toBe('profileId');
        });
    });

    describe('Database Helper Methods', () => {
        test('database module exports getAllChains method', () => {
            const DatabaseClass = require(path.join(pluginDir, 'backend', 'database.js'));
            const mockApi = { log: jest.fn() };
            const db = new DatabaseClass(mockApi);
            
            expect(typeof db.getAllChains).toBe('function');
        });

        test('database module exports getAllRules method', () => {
            const DatabaseClass = require(path.join(pluginDir, 'backend', 'database.js'));
            const mockApi = { log: jest.fn() };
            const db = new DatabaseClass(mockApi);
            
            expect(typeof db.getAllRules).toBe('function');
        });
    });

    describe('Overlay Template Validation', () => {
        test('overlay.js validates template parameter', () => {
            const overlayJs = fs.readFileSync(
                path.join(pluginDir, 'overlay', 'overlay.js'),
                'utf8'
            );
            
            // Check for validation logic
            expect(overlayJs).toContain('validTemplates');
            expect(overlayJs).toContain('includes(templateParam)');
            expect(overlayJs).toContain('Invalid template');
        });

        test('overlay.js has safe fallback', () => {
            const overlayJs = fs.readFileSync(
                path.join(pluginDir, 'overlay', 'overlay.js'),
                'utf8'
            );
            
            // Check for fallback to default
            expect(overlayJs).toContain("template = 'default'");
        });
    });

    describe('README Documentation', () => {
        let readme;

        beforeAll(() => {
            readme = fs.readFileSync(path.join(pluginDir, 'README.md'), 'utf8');
        });

        test('documents resume action', () => {
            expect(readme).toContain('Resume Timer');
        });

        test('documents set timer value action', () => {
            expect(readme).toContain('Set Timer Value');
        });

        test('documents create and delete timer actions', () => {
            expect(readme).toContain('Create Timer');
            expect(readme).toContain('Delete Timer');
        });

        test('documents like-speed ratio action', () => {
            expect(readme).toContain('Set Like Speed Ratio');
        });

        test('documents profile application', () => {
            expect(readme).toContain('Apply Timer Profile');
            expect(readme).toContain('/api/advanced-timer/profiles/:id/apply');
        });

        test('documents fractional seconds support', () => {
            expect(readme).toContain('fractional');
            expect(readme).toContain('0.2');
        });

        test('documents validation requirements', () => {
            expect(readme).toContain('Requirements:');
            expect(readme).toContain('initial_duration > 0');
            expect(readme).toContain('target_value >= 0');
        });

        test('documents timer persistence behavior', () => {
            expect(readme).toContain('Running timers automatically resume');
            expect(readme).toContain('Paused timers remain paused');
        });
    });

    describe('Code Validation', () => {
        test('event-handlers.js uses parseFloat for action_value', () => {
            const eventHandlersJs = fs.readFileSync(
                path.join(pluginDir, 'backend', 'event-handlers.js'),
                'utf8'
            );
            
            expect(eventHandlersJs).toContain('parseFloat(event.action_value)');
        });

        test('api.js validates seconds parameter type', () => {
            const apiJs = fs.readFileSync(
                path.join(pluginDir, 'backend', 'api.js'),
                'utf8'
            );
            
            expect(apiJs).toContain('parseFloat(seconds)');
            expect(apiJs).toContain('isNaN(secondsNum)');
            expect(apiJs).toContain('Seconds must be a valid number');
        });

        test('api.js validates mode in create timer', () => {
            const apiJs = fs.readFileSync(
                path.join(pluginDir, 'backend', 'api.js'),
                'utf8'
            );
            
            expect(apiJs).toContain("validModes = ['countdown', 'countup', 'stopwatch', 'loop', 'interval']");
            expect(apiJs).toContain('Countdown and Loop modes require initial_duration > 0');
            expect(apiJs).toContain('Count Up and Interval modes require target_value >= 0');
        });
    });
});
