/**
 * Unit Tests for Expression Controller
 * Tests expression triggers, combos, cooldowns, and spam protection
 */

const ExpressionController = require('../modules/ExpressionController');

describe('ExpressionController', () => {
    let controller;
    let mockOSCBridge;
    let mockAPI;
    let sentMessages;

    beforeEach(() => {
        sentMessages = [];
        
        mockOSCBridge = {
            send: jest.fn((address, value) => {
                sentMessages.push({ address, value });
                return true;
            })
        };

        mockAPI = {
            emit: jest.fn(),
            logger: {
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
                debug: jest.fn()
            }
        };

        controller = new ExpressionController(mockAPI, mockOSCBridge);
    });

    afterEach(() => {
        if (controller) {
            controller.destroy();
        }
        jest.clearAllMocks();
    });

    describe('Expression Triggering', () => {
        test('should trigger emote expression', () => {
            const result = controller.triggerExpression('Emote', 0, true);
            
            expect(result).toBe(true);
            expect(mockOSCBridge.send).toHaveBeenCalledWith('/avatar/parameters/EmoteSlot0', 1);
        });

        test('should trigger action expression', () => {
            const result = controller.triggerExpression('Action', 2, false);
            
            expect(result).toBe(true);
            expect(mockOSCBridge.send).toHaveBeenCalledWith('/avatar/parameters/ActionSlot2', 0);
        });

        test('should reject invalid expression type', () => {
            const result = controller.triggerExpression('Invalid', 0, true);
            
            expect(result).toBe(false);
            expect(mockOSCBridge.send).not.toHaveBeenCalled();
        });

        test('should reject invalid emote slot (too high)', () => {
            const result = controller.triggerExpression('Emote', 8, true);
            
            expect(result).toBe(false);
            expect(mockOSCBridge.send).not.toHaveBeenCalled();
        });

        test('should reject invalid emote slot (negative)', () => {
            const result = controller.triggerExpression('Emote', -1, true);
            
            expect(result).toBe(false);
            expect(mockOSCBridge.send).not.toHaveBeenCalled();
        });

        test('should reject invalid action slot', () => {
            const result = controller.triggerExpression('Action', 4, true);
            
            expect(result).toBe(false);
            expect(mockOSCBridge.send).not.toHaveBeenCalled();
        });

        test('should track active expressions', () => {
            controller.triggerExpression('Emote', 0, true);
            expect(controller.activeExpressions.has('Emote_0')).toBe(true);
            
            controller.triggerExpression('Emote', 0, false);
            expect(controller.activeExpressions.has('Emote_0')).toBe(false);
        });

        test('should emit events on trigger', () => {
            controller.triggerExpression('Emote', 3, true);
            
            expect(mockAPI.emit).toHaveBeenCalledWith('osc:expression-triggered', 
                expect.objectContaining({
                    type: 'Emote',
                    slot: 3,
                    hold: true,
                    address: '/avatar/parameters/EmoteSlot3'
                })
            );
        });
    });

    describe('Cooldown System', () => {
        test('should enforce cooldown', () => {
            controller.triggerExpression('Emote', 0, true);
            const result = controller.triggerExpression('Emote', 0, false);
            
            // Second call should be blocked by cooldown
            expect(result).toBe(false);
        });

        test('should allow trigger after cooldown expires', async () => {
            controller.defaultCooldown = 100; // 100ms cooldown
            
            controller.triggerExpression('Emote', 0, true);
            
            // Wait for cooldown to expire
            await new Promise(resolve => setTimeout(resolve, 150));
            
            const result = controller.triggerExpression('Emote', 0, false);
            expect(result).toBe(true);
        });

        test('should have separate cooldowns for different slots', () => {
            controller.triggerExpression('Emote', 0, true);
            const result = controller.triggerExpression('Emote', 1, true);
            
            expect(result).toBe(true);
        });

        test('should track remaining cooldown time', () => {
            controller.setCooldown('Emote', 0, 1000);
            
            const remaining = controller.getRemainingCooldown('Emote', 0);
            expect(remaining).toBeGreaterThan(0);
            expect(remaining).toBeLessThanOrEqual(1000);
        });
    });

    describe('Spam Protection', () => {
        test('should detect spam', () => {
            controller.spamThreshold = 3;
            controller.spamWindow = 1000;
            
            // Trigger 3 times rapidly
            controller.triggerExpression('Emote', 0, true);
            controller._recordTrigger('Emote_0');
            controller._recordTrigger('Emote_0');
            
            // 4th trigger should be blocked
            const isSpamming = controller._isSpamming('Emote_0');
            expect(isSpamming).toBe(true);
        });

        test('should allow triggers after spam window expires', async () => {
            controller.spamThreshold = 2;
            controller.spamWindow = 100;
            
            controller._recordTrigger('Emote_0');
            controller._recordTrigger('Emote_0');
            
            expect(controller._isSpamming('Emote_0')).toBe(true);
            
            // Wait for spam window to expire
            await new Promise(resolve => setTimeout(resolve, 150));
            
            expect(controller._isSpamming('Emote_0')).toBe(false);
        });
    });

    describe('Combo System', () => {
        test('should play simple combo', async () => {
            const combo = [
                { type: 'Emote', slot: 0, duration: 50 },
                { type: 'Emote', slot: 1, duration: 50 }
            ];
            
            const promise = controller.playCombo(combo);
            expect(controller.isPlayingCombo).toBe(true);
            
            await promise;
            
            expect(controller.isPlayingCombo).toBe(false);
            expect(sentMessages.length).toBe(4); // 2 holds + 2 releases
        });

        test('should play combo with pauses', async () => {
            const combo = [
                { type: 'Emote', slot: 0, duration: 50, pause: 50 },
                { type: 'Emote', slot: 1, duration: 50 }
            ];
            
            const startTime = Date.now();
            await controller.playCombo(combo);
            const duration = Date.now() - startTime;
            
            // Should take at least: 50ms (step1) + 50ms (pause) + 50ms (step2) = 150ms
            expect(duration).toBeGreaterThanOrEqual(140); // Allow some timing variance
        });

        test('should reject invalid combo', async () => {
            const result = await controller.playCombo(null);
            expect(result).toBe(false);
            
            const result2 = await controller.playCombo([]);
            expect(result2).toBe(false);
        });

        test('should prevent concurrent combos', async () => {
            const combo = [{ type: 'Emote', slot: 0, duration: 100 }];
            
            controller.playCombo(combo); // Don't await
            const result = await controller.playCombo(combo);
            
            expect(result).toBe(false);
        });

        test('should emit combo completed event', async () => {
            const combo = [{ type: 'Emote', slot: 0, duration: 50 }];
            await controller.playCombo(combo);
            
            expect(mockAPI.emit).toHaveBeenCalledWith('osc:combo-completed',
                expect.objectContaining({ steps: 1 })
            );
        });
    });

    describe('Combo Queue', () => {
        test('should queue combo', () => {
            const combo = [{ type: 'Emote', slot: 0, duration: 50 }];
            controller.queueCombo(combo);
            
            expect(controller.comboQueue.length).toBe(1);
        });

        test('should clear combo queue', () => {
            controller.queueCombo([{ type: 'Emote', slot: 0, duration: 50 }]);
            controller.queueCombo([{ type: 'Emote', slot: 1, duration: 50 }]);
            
            const count = controller.clearQueue();
            
            expect(count).toBe(2);
            expect(controller.comboQueue.length).toBe(0);
        });

        test('should stop current combo', async () => {
            const combo = [
                { type: 'Emote', slot: 0, duration: 200 },
                { type: 'Emote', slot: 1, duration: 200 }
            ];
            
            controller.playCombo(combo); // Don't await
            
            // Wait a bit then stop
            await new Promise(resolve => setTimeout(resolve, 50));
            const result = controller.stopCombo();
            
            expect(result).toBe(true);
            expect(controller.isPlayingCombo).toBe(false);
        });
    });

    describe('Release All', () => {
        test('should release all active expressions', () => {
            controller.triggerExpression('Emote', 0, true);
            controller.triggerExpression('Emote', 1, true);
            controller.triggerExpression('Action', 0, true);
            
            expect(controller.activeExpressions.size).toBe(3);
            
            const count = controller.releaseAll();
            
            expect(count).toBe(3);
            expect(controller.activeExpressions.size).toBe(0);
        });
    });

    describe('State Management', () => {
        test('should return current state', () => {
            controller.triggerExpression('Emote', 0, true);
            controller.queueCombo([{ type: 'Emote', slot: 1, duration: 50 }]);
            
            const state = controller.getState();
            
            expect(state.activeExpressions).toContain('Emote_0');
            expect(state.queueLength).toBe(1);
            expect(state.isPlayingCombo).toBe(false);
            expect(state.timestamp).toBeDefined();
        });
    });

    describe('Cleanup', () => {
        test('should clean up old cooldowns', async () => {
            controller.defaultCooldown = 100;
            controller.setCooldown('Emote', 0, 50);
            
            await new Promise(resolve => setTimeout(resolve, 100));
            
            controller.cleanup();
            
            const isOnCooldown = controller.isOnCooldown('Emote', 0);
            expect(isOnCooldown).toBe(false);
        });

        test('should clean up old trigger history', async () => {
            controller.spamWindow = 100;
            controller._recordTrigger('Emote_0');
            
            await new Promise(resolve => setTimeout(resolve, 150));
            
            controller.cleanup();
            
            expect(controller.triggerHistory.size).toBe(0);
        });

        test('should destroy cleanly', () => {
            controller.triggerExpression('Emote', 0, true);
            controller.queueCombo([{ type: 'Emote', slot: 1, duration: 50 }]);
            controller.startCleanup(1000);
            
            controller.destroy();
            
            expect(controller.activeExpressions.size).toBe(0);
            expect(controller.comboQueue.length).toBe(0);
            expect(controller.cooldowns.size).toBe(0);
            expect(controller.cleanupInterval).toBeUndefined();
        });
    });
});
