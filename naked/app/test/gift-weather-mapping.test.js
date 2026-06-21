/**
 * Test suite for Gift-to-Weather Mapping functionality
 */

const DatabaseManager = require('../modules/database');
const fs = require('fs');
const path = require('path');

describe('Gift-to-Weather Mapping', () => {
    let db;
    const testDbPath = path.join(__dirname, 'test-weather-mapping.db');

    beforeEach(() => {
        // Remove test database if it exists
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }
        
        // Create new test database
        db = new DatabaseManager(testDbPath);
        
        // Add sample gifts to catalog
        db.updateGiftCatalog([
            { id: 1, name: 'Rose', diamond_count: 1 },
            { id: 2, name: 'TikTok', diamond_count: 10 },
            { id: 3, name: 'Universe', diamond_count: 5000 }
        ]);
    });

    afterEach(() => {
        // Close database connection
        if (db && db.db) {
            db.db.close();
        }
        
        // Clean up test database
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }
    });

    test('should create gift weather mapping table', () => {
        const tables = db.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='gift_weather_mappings'").all();
        expect(tables.length).toBe(1);
    });

    test('should set gift weather mapping', () => {
        const result = db.setGiftWeatherMapping(1, 'rain', 0.7, 15000, true);
        expect(result.changes).toBe(1);
    });

    test('should get gift weather mapping', () => {
        db.setGiftWeatherMapping(1, 'rain', 0.7, 15000, true);
        const mapping = db.getGiftWeatherMapping(1);
        
        expect(mapping).toBeDefined();
        expect(mapping.gift_id).toBe(1);
        expect(mapping.weather_effect).toBe('rain');
        expect(mapping.intensity).toBe(0.7);
        expect(mapping.duration).toBe(15000);
        expect(mapping.enabled).toBe(true);
    });

    test('should update existing gift weather mapping', () => {
        db.setGiftWeatherMapping(1, 'rain', 0.5, 10000, true);
        db.setGiftWeatherMapping(1, 'storm', 0.8, 12000, false);
        
        const mapping = db.getGiftWeatherMapping(1);
        expect(mapping.weather_effect).toBe('storm');
        expect(mapping.intensity).toBe(0.8);
        expect(mapping.duration).toBe(12000);
        expect(mapping.enabled).toBe(false);
    });

    test('should get all gift weather mappings with gift details', () => {
        db.setGiftWeatherMapping(1, 'rain', 0.5, 10000, true);
        db.setGiftWeatherMapping(2, 'snow', 0.6, 12000, true);
        db.setGiftWeatherMapping(3, 'storm', 0.9, 8000, true);
        
        const mappings = db.getAllGiftWeatherMappings();
        
        expect(mappings.length).toBe(3);
        
        // Verify first mapping includes gift details
        const stormMapping = mappings.find(m => m.gift_id === 3);
        expect(stormMapping).toBeDefined();
        expect(stormMapping.gift_name).toBe('Universe');
        expect(stormMapping.diamond_count).toBe(5000);
        expect(stormMapping.weather_effect).toBe('storm');
    });

    test('should delete gift weather mapping', () => {
        db.setGiftWeatherMapping(1, 'rain', 0.5, 10000, true);
        const result = db.deleteGiftWeatherMapping(1);
        
        expect(result.changes).toBe(1);
        
        const mapping = db.getGiftWeatherMapping(1);
        expect(mapping).toBeNull();
    });

    test('should clear all gift weather mappings', () => {
        db.setGiftWeatherMapping(1, 'rain', 0.5, 10000, true);
        db.setGiftWeatherMapping(2, 'snow', 0.6, 12000, true);
        
        db.clearGiftWeatherMappings();
        
        const mappings = db.getAllGiftWeatherMappings();
        expect(mappings.length).toBe(0);
    });

    test('should handle non-existent gift mapping', () => {
        const mapping = db.getGiftWeatherMapping(999);
        expect(mapping).toBeNull();
    });

    test('should enforce unique gift_id constraint', () => {
        db.setGiftWeatherMapping(1, 'rain', 0.5, 10000, true);
        
        // This should update, not create a duplicate
        db.setGiftWeatherMapping(1, 'snow', 0.6, 12000, false);
        
        const mappings = db.getAllGiftWeatherMappings();
        const giftOneMappings = mappings.filter(m => m.gift_id === 1);
        
        expect(giftOneMappings.length).toBe(1);
        expect(giftOneMappings[0].weather_effect).toBe('snow');
    });

    test('should convert enabled to boolean correctly', () => {
        db.setGiftWeatherMapping(1, 'rain', 0.5, 10000, true);
        db.setGiftWeatherMapping(2, 'snow', 0.6, 12000, false);
        
        const mapping1 = db.getGiftWeatherMapping(1);
        const mapping2 = db.getGiftWeatherMapping(2);
        
        expect(typeof mapping1.enabled).toBe('boolean');
        expect(mapping1.enabled).toBe(true);
        expect(typeof mapping2.enabled).toBe('boolean');
        expect(mapping2.enabled).toBe(false);
    });

    test('should order mappings by diamond_count DESC', () => {
        db.setGiftWeatherMapping(1, 'rain', 0.5, 10000, true);    // 1 diamond
        db.setGiftWeatherMapping(2, 'snow', 0.6, 12000, true);    // 10 diamonds
        db.setGiftWeatherMapping(3, 'storm', 0.9, 8000, true);    // 5000 diamonds
        
        const mappings = db.getAllGiftWeatherMappings();
        
        // Should be ordered by diamond count descending
        expect(mappings[0].gift_id).toBe(3); // Universe (5000)
        expect(mappings[1].gift_id).toBe(2); // TikTok (10)
        expect(mappings[2].gift_id).toBe(1); // Rose (1)
    });
});
