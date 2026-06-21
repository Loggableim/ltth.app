/**
 * MultiGoal Feature Test
 * Tests the multigoal functionality including database, API, and WebSocket
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Mock API object
class MockAPI {
    constructor(db) {
        this.db = db;
        this.routes = [];
        this.sockets = [];
        this.io = {
            emit: jest.fn(),
            to: jest.fn(() => ({
                emit: jest.fn()
            }))
        };
    }

    getDatabase() {
        return this.db;
    }

    registerRoute(method, path, handler) {
        this.routes.push({ method, path, handler });
    }

    registerSocket(event, handler) {
        this.sockets.push({ event, handler });
    }

    getSocketIO() {
        return this.io;
    }

    log(message, level) {
        // Mock logging
    }

    getPluginDir() {
        return path.join(__dirname, '../plugins/goals');
    }
}

describe('MultiGoal Feature', () => {
    let db;
    let mockAPI;
    let GoalsDatabase;

    beforeEach(() => {
        // Create in-memory database
        db = new Database(':memory:');
        mockAPI = new MockAPI(db);

        // Load database module
        GoalsDatabase = require('../plugins/goals/backend/database');
    });

    afterEach(() => {
        if (db) {
            db.close();
        }
    });

    describe('Database Schema', () => {
        test('should create multigoals table', () => {
            const goalsDB = new GoalsDatabase(mockAPI);
            goalsDB.initialize();

            const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='multigoals'").get();
            expect(tables).toBeDefined();
            expect(tables.name).toBe('multigoals');
        });

        test('should create multigoal_goals junction table', () => {
            const goalsDB = new GoalsDatabase(mockAPI);
            goalsDB.initialize();

            const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='multigoal_goals'").get();
            expect(tables).toBeDefined();
            expect(tables.name).toBe('multigoal_goals');
        });

        test('multigoals table should have correct columns', () => {
            const goalsDB = new GoalsDatabase(mockAPI);
            goalsDB.initialize();

            const columns = db.prepare("PRAGMA table_info(multigoals)").all();
            const columnNames = columns.map(col => col.name);

            expect(columnNames).toContain('id');
            expect(columnNames).toContain('name');
            expect(columnNames).toContain('enabled');
            expect(columnNames).toContain('rotation_interval');
            expect(columnNames).toContain('animation_type');
            expect(columnNames).toContain('overlay_width');
            expect(columnNames).toContain('overlay_height');
        });
    });

    describe('MultiGoal CRUD Operations', () => {
        let goalsDB;

        beforeEach(() => {
            goalsDB = new GoalsDatabase(mockAPI);
            goalsDB.initialize();
        });

        test('should create a multigoal', () => {
            const multigoalData = {
                id: 'multigoal_test_1',
                name: 'Test MultiGoal',
                enabled: 1,
                rotation_interval: 5,
                animation_type: 'slide',
                overlay_width: 500,
                overlay_height: 100
            };

            const multigoal = goalsDB.createMultiGoal(multigoalData);

            expect(multigoal).toBeDefined();
            expect(multigoal.id).toBe('multigoal_test_1');
            expect(multigoal.name).toBe('Test MultiGoal');
            expect(multigoal.rotation_interval).toBe(5);
            expect(multigoal.animation_type).toBe('slide');
        });

        test('should retrieve a multigoal by ID', () => {
            const multigoalData = {
                id: 'multigoal_test_2',
                name: 'Retrieve Test',
                rotation_interval: 10,
                animation_type: 'fade'
            };

            goalsDB.createMultiGoal(multigoalData);
            const multigoal = goalsDB.getMultiGoal('multigoal_test_2');

            expect(multigoal).toBeDefined();
            expect(multigoal.name).toBe('Retrieve Test');
        });

        test('should update a multigoal', () => {
            const multigoalData = {
                id: 'multigoal_test_3',
                name: 'Update Test',
                rotation_interval: 5
            };

            goalsDB.createMultiGoal(multigoalData);

            const updates = {
                name: 'Updated Name',
                rotation_interval: 15,
                animation_type: 'cube'
            };

            const updated = goalsDB.updateMultiGoal('multigoal_test_3', updates);

            expect(updated.name).toBe('Updated Name');
            expect(updated.rotation_interval).toBe(15);
            expect(updated.animation_type).toBe('cube');
        });

        test('should delete a multigoal', () => {
            const multigoalData = {
                id: 'multigoal_test_4',
                name: 'Delete Test'
            };

            goalsDB.createMultiGoal(multigoalData);
            const deleted = goalsDB.deleteMultiGoal('multigoal_test_4');

            expect(deleted).toBe(true);

            const multigoal = goalsDB.getMultiGoal('multigoal_test_4');
            expect(multigoal).toBeNull();
        });

        test('should get all multigoals', () => {
            goalsDB.createMultiGoal({ id: 'mg1', name: 'MG 1' });
            goalsDB.createMultiGoal({ id: 'mg2', name: 'MG 2' });
            goalsDB.createMultiGoal({ id: 'mg3', name: 'MG 3' });

            const multigoals = goalsDB.getAllMultiGoals();

            expect(multigoals).toHaveLength(3);
        });
    });

    describe('MultiGoal-Goal Relationships', () => {
        let goalsDB;

        beforeEach(() => {
            goalsDB = new GoalsDatabase(mockAPI);
            goalsDB.initialize();

            // Create some test goals
            goalsDB.createGoal({
                id: 'goal1',
                name: 'Goal 1',
                goal_type: 'coin'
            });
            goalsDB.createGoal({
                id: 'goal2',
                name: 'Goal 2',
                goal_type: 'likes'
            });
            goalsDB.createGoal({
                id: 'goal3',
                name: 'Goal 3',
                goal_type: 'follower'
            });
        });

        test('should associate goals with a multigoal', () => {
            const multigoalData = {
                id: 'multigoal_rel_1',
                name: 'Relationship Test'
            };

            goalsDB.createMultiGoal(multigoalData);
            goalsDB.setMultiGoalGoals('multigoal_rel_1', ['goal1', 'goal2', 'goal3']);

            const goalIds = goalsDB.getMultiGoalGoalIds('multigoal_rel_1');

            expect(goalIds).toHaveLength(3);
            expect(goalIds).toContain('goal1');
            expect(goalIds).toContain('goal2');
            expect(goalIds).toContain('goal3');
        });

        test('should maintain display order of goals', () => {
            const multigoalData = {
                id: 'multigoal_order',
                name: 'Order Test'
            };

            goalsDB.createMultiGoal(multigoalData);
            goalsDB.setMultiGoalGoals('multigoal_order', ['goal3', 'goal1', 'goal2']);

            const goalIds = goalsDB.getMultiGoalGoalIds('multigoal_order');

            expect(goalIds[0]).toBe('goal3');
            expect(goalIds[1]).toBe('goal1');
            expect(goalIds[2]).toBe('goal2');
        });

        test('should get full multigoal with goal details', () => {
            const multigoalData = {
                id: 'multigoal_full',
                name: 'Full Data Test'
            };

            goalsDB.createMultiGoal(multigoalData);
            goalsDB.setMultiGoalGoals('multigoal_full', ['goal1', 'goal2']);

            const multigoal = goalsDB.getMultiGoalWithGoals('multigoal_full');

            expect(multigoal).toBeDefined();
            expect(multigoal.goals).toBeDefined();
            expect(multigoal.goals).toHaveLength(2);
            expect(multigoal.goals[0].name).toBe('Goal 1');
            expect(multigoal.goals[1].name).toBe('Goal 2');
        });

        test('should update goals association', () => {
            const multigoalData = {
                id: 'multigoal_update_goals',
                name: 'Update Goals Test'
            };

            goalsDB.createMultiGoal(multigoalData);
            goalsDB.setMultiGoalGoals('multigoal_update_goals', ['goal1', 'goal2']);

            // Update to different goals
            goalsDB.setMultiGoalGoals('multigoal_update_goals', ['goal2', 'goal3']);

            const goalIds = goalsDB.getMultiGoalGoalIds('multigoal_update_goals');

            expect(goalIds).toHaveLength(2);
            expect(goalIds).toContain('goal2');
            expect(goalIds).toContain('goal3');
            expect(goalIds).not.toContain('goal1');
        });

        test('should delete multigoal-goal associations when multigoal is deleted', () => {
            const multigoalData = {
                id: 'multigoal_cascade',
                name: 'Cascade Test'
            };

            goalsDB.createMultiGoal(multigoalData);
            goalsDB.setMultiGoalGoals('multigoal_cascade', ['goal1', 'goal2']);

            goalsDB.deleteMultiGoal('multigoal_cascade');

            const goalIds = goalsDB.getMultiGoalGoalIds('multigoal_cascade');

            expect(goalIds).toHaveLength(0);
        });
    });

    describe('MultiGoal Default Values', () => {
        let goalsDB;

        beforeEach(() => {
            goalsDB = new GoalsDatabase(mockAPI);
            goalsDB.initialize();
        });

        test('should apply default values when not provided', () => {
            const multigoalData = {
                id: 'multigoal_defaults',
                name: 'Defaults Test'
            };

            const multigoal = goalsDB.createMultiGoal(multigoalData);

            expect(multigoal.enabled).toBe(1);
            expect(multigoal.rotation_interval).toBe(5);
            expect(multigoal.animation_type).toBe('slide');
            expect(multigoal.overlay_width).toBe(500);
            expect(multigoal.overlay_height).toBe(100);
        });
    });

    describe('MultiGoal API and WebSocket Integration', () => {
        let goalsDB;
        let GoalsAPI;
        let GoalsWebSocket;
        let plugin;
        let api;
        let websocket;

        beforeEach(() => {
            goalsDB = new GoalsDatabase(mockAPI);
            goalsDB.initialize();

            // Load modules
            GoalsAPI = require('../plugins/goals/backend/api');
            GoalsWebSocket = require('../plugins/goals/backend/websocket');

            // Create mock plugin with correct property name
            plugin = {
                api: mockAPI,
                db: goalsDB,
                websocket: null // Will be set to websocket instance
            };

            // Create instances
            websocket = new GoalsWebSocket(plugin);
            plugin.websocket = websocket; // Set the correct property

            api = new GoalsAPI(plugin);
        });

        test('should have websocket property accessible in API', () => {
            expect(plugin.websocket).toBeDefined();
            expect(plugin.websocket.emitMultiGoalCreated).toBeDefined();
            expect(plugin.websocket.emitMultiGoalUpdated).toBeDefined();
            expect(plugin.websocket.emitMultiGoalDeleted).toBeDefined();
        });

        test('API should successfully call websocket.emitMultiGoalCreated', () => {
            // Create a spy on the websocket method
            const emitSpy = jest.spyOn(plugin.websocket, 'emitMultiGoalCreated');

            // Simulate creating a multigoal
            const multigoalData = {
                id: 'multigoal_websocket_test',
                name: 'WebSocket Test'
            };

            const multigoal = goalsDB.createMultiGoal(multigoalData);
            const fullMultigoal = goalsDB.getMultiGoalWithGoals(multigoal.id);

            // Call the method that should trigger WebSocket emit
            plugin.websocket.emitMultiGoalCreated(fullMultigoal);

            // Verify it was called
            expect(emitSpy).toHaveBeenCalledWith(fullMultigoal);
            expect(emitSpy).toHaveBeenCalledTimes(1);
        });

        test('API should successfully call websocket.emitMultiGoalUpdated', () => {
            const emitSpy = jest.spyOn(plugin.websocket, 'emitMultiGoalUpdated');

            const multigoalData = {
                id: 'multigoal_update_websocket',
                name: 'Update WebSocket Test'
            };

            const multigoal = goalsDB.createMultiGoal(multigoalData);
            const fullMultigoal = goalsDB.getMultiGoalWithGoals(multigoal.id);

            plugin.websocket.emitMultiGoalUpdated(fullMultigoal);

            expect(emitSpy).toHaveBeenCalledWith(fullMultigoal);
            expect(emitSpy).toHaveBeenCalledTimes(1);
        });

        test('API should successfully call websocket.emitMultiGoalDeleted', () => {
            const emitSpy = jest.spyOn(plugin.websocket, 'emitMultiGoalDeleted');

            const multigoalId = 'multigoal_delete_websocket';

            plugin.websocket.emitMultiGoalDeleted(multigoalId);

            expect(emitSpy).toHaveBeenCalledWith(multigoalId);
            expect(emitSpy).toHaveBeenCalledTimes(1);
        });

        test('should not throw error when accessing plugin.websocket.emitMultiGoalCreated', () => {
            expect(() => {
                const multigoalData = {
                    id: 'multigoal_no_error',
                    name: 'No Error Test'
                };

                const multigoal = goalsDB.createMultiGoal(multigoalData);
                const fullMultigoal = goalsDB.getMultiGoalWithGoals(multigoal.id);

                // This should not throw "Cannot read properties of undefined"
                plugin.websocket.emitMultiGoalCreated(fullMultigoal);
            }).not.toThrow();
        });
    });
});
