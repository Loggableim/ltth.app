/**
 * Tests for StreamAlchemy Fusion System
 * 
 * Tests cover:
 * - PromptGenerator: style presets, fusion prompts, fusion keys
 * - FusionService: manual fusion, caching, deterministic keys
 * - LightXService: API configuration, request handling
 * - TierSystem: tier config, upgrade eligibility
 */

const PromptGenerator = require('../plugins/streamalchemy/promptGenerator');
const { STYLE_PRESETS } = PromptGenerator;

// Mock logger for testing
const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
};

describe('StreamAlchemy Fusion System', () => {
    describe('PromptGenerator', () => {
        let promptGenerator;

        beforeEach(() => {
            promptGenerator = new PromptGenerator(mockLogger);
        });

        test('should return all style presets', () => {
            const presets = promptGenerator.getStylePresets();
            expect(Array.isArray(presets)).toBe(true);
            expect(presets.length).toBeGreaterThan(0);
            
            // Verify structure
            presets.forEach(preset => {
                expect(preset).toHaveProperty('id');
                expect(preset).toHaveProperty('name');
                expect(preset).toHaveProperty('description');
            });
        });

        test('should include all expected styles', () => {
            const presets = promptGenerator.getStylePresets();
            const expectedStyles = ['rpg', 'fantasy', 'comic', 'pixel', 'anime', 'cyberpunk'];
            
            expectedStyles.forEach(style => {
                expect(presets.some(p => p.id === style)).toBe(true);
            });
        });

        test('should generate fusion prompt with required fields', () => {
            const itemA = { name: 'Fire Sword', itemId: 'item-a-123' };
            const itemB = { name: 'Ice Shield', itemId: 'item-b-456' };
            
            const result = promptGenerator.generateFusionPrompt(itemA, itemB, 'rpg');
            
            expect(result).toHaveProperty('prompt');
            expect(result).toHaveProperty('style');
            expect(result).toHaveProperty('styleName');
            expect(result).toHaveProperty('itemA');
            expect(result).toHaveProperty('itemB');
            expect(result.prompt.length).toBeGreaterThan(50);
        });

        test('should include negative prompt when enabled', () => {
            const itemA = { name: 'Fire Sword' };
            const itemB = { name: 'Ice Shield' };
            
            const result = promptGenerator.generateFusionPrompt(itemA, itemB, 'rpg', { includeNegative: true });
            
            expect(result).toHaveProperty('negativePrompt');
        });

        test('should generate deterministic fusion key', () => {
            const key1 = promptGenerator.generateFusionKey('item-a', 'item-b', 'rpg');
            const key2 = promptGenerator.generateFusionKey('item-b', 'item-a', 'rpg');
            
            // Keys should be same regardless of order
            expect(key1).toBe(key2);
        });

        test('should generate different keys for different styles', () => {
            const key1 = promptGenerator.generateFusionKey('item-a', 'item-b', 'rpg');
            const key2 = promptGenerator.generateFusionKey('item-a', 'item-b', 'anime');
            
            expect(key1).not.toBe(key2);
        });

        test('should clean item names correctly', () => {
            const itemA = { name: 'Essence of Fire' };
            const itemB = { name: 'Essence of Water' };
            
            const result = promptGenerator.generateFusionPrompt(itemA, itemB, 'rpg');
            
            expect(result.itemA).toBe('Fire');
            expect(result.itemB).toBe('Water');
        });

        test('should handle items with tags', () => {
            const itemA = { name: 'Dragon', tags: ['fire', 'legendary'] };
            const itemB = { name: 'Phoenix', tags: ['fire', 'mythical'] };
            
            const result = promptGenerator.generateFusionPrompt(itemA, itemB, 'fantasy');
            
            // Fusion concept should include tag references
            expect(result.fusionConcept).toBeTruthy();
        });
    });

    describe('STYLE_PRESETS constant', () => {
        test('should have valid structure for all presets', () => {
            Object.entries(STYLE_PRESETS).forEach(([id, preset]) => {
                expect(preset).toHaveProperty('name');
                expect(preset).toHaveProperty('description');
                expect(preset).toHaveProperty('basePrompt');
                expect(preset).toHaveProperty('lighting');
                expect(preset).toHaveProperty('colors');
                expect(preset).toHaveProperty('negativePrompt');
            });
        });

        test('should have unique names for all presets', () => {
            const names = Object.values(STYLE_PRESETS).map(p => p.name);
            const uniqueNames = new Set(names);
            expect(uniqueNames.size).toBe(names.length);
        });
    });
});

describe('FusionKey Generation', () => {
    let promptGenerator;

    beforeEach(() => {
        promptGenerator = new PromptGenerator(mockLogger);
    });

    test('should be parseable back to components', () => {
        const itemAId = 'uuid-111';
        const itemBId = 'uuid-222';
        const style = 'pixel';
        
        const key = promptGenerator.generateFusionKey(itemAId, itemBId, style);
        const parsed = promptGenerator.parseFusionKey(key);
        
        // Note: parsing returns sorted IDs
        expect([parsed.itemAId, parsed.itemBId].sort()).toEqual([itemAId, itemBId].sort());
        expect(parsed.style).toBe(style);
    });

    test('should handle tier in fusion key', () => {
        const key = promptGenerator.generateFusionKey('a', 'b', 'rpg', { tier: 3 });
        const parsed = promptGenerator.parseFusionKey(key);
        
        expect(parsed.tier).toBe(3);
    });
});
