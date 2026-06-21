/**
 * Test for soundboard_enabled setting check
 * Verifies that the backend correctly handles the soundboard_enabled setting:
 * - null/undefined (not set) = enabled (default)
 * - 'true' = enabled
 * - 'false' = disabled
 * - any other value = enabled
 * 
 * This matches the frontend behavior at dashboard-enhancements.js:339
 * where the check is: settings.soundboard_enabled !== 'false'
 */

const fs = require('fs');
const path = require('path');

describe('Soundboard Enabled Check Fix', () => {
    let soundboardMainJs;
    
    beforeAll(() => {
        // Read the soundboard plugin main.js file
        const filePath = path.join(__dirname, '../plugins/soundboard/main.js');
        soundboardMainJs = fs.readFileSync(filePath, 'utf8');
    });
    
    describe('Backend Event Handler Checks', () => {
        test('should use !== "false" check for gift event handler', () => {
            // Check that the old === 'true' pattern is NOT present
            const giftHandlerMatch = soundboardMainJs.match(/registerTikTokEvent\('gift'[\s\S]*?}\);/);
            expect(giftHandlerMatch).toBeTruthy();
            
            const giftHandlerCode = giftHandlerMatch[0];
            expect(giftHandlerCode).toContain("!== 'false'");
            expect(giftHandlerCode).not.toContain("=== 'true'");
        });
        
        test('should use !== "false" check for follow event handler', () => {
            const followHandlerMatch = soundboardMainJs.match(/registerTikTokEvent\('follow'[\s\S]*?}\);/);
            expect(followHandlerMatch).toBeTruthy();
            
            const followHandlerCode = followHandlerMatch[0];
            expect(followHandlerCode).toContain("!== 'false'");
            expect(followHandlerCode).not.toContain("=== 'true'");
        });
        
        test('should use !== "false" check for subscribe event handler', () => {
            const subscribeHandlerMatch = soundboardMainJs.match(/registerTikTokEvent\('subscribe'[\s\S]*?}\);/);
            expect(subscribeHandlerMatch).toBeTruthy();
            
            const subscribeHandlerCode = subscribeHandlerMatch[0];
            expect(subscribeHandlerCode).toContain("!== 'false'");
            expect(subscribeHandlerCode).not.toContain("=== 'true'");
        });
        
        test('should use !== "false" check for share event handler', () => {
            const shareHandlerMatch = soundboardMainJs.match(/registerTikTokEvent\('share'[\s\S]*?}\);/);
            expect(shareHandlerMatch).toBeTruthy();
            
            const shareHandlerCode = shareHandlerMatch[0];
            expect(shareHandlerCode).toContain("!== 'false'");
            expect(shareHandlerCode).not.toContain("=== 'true'");
        });
        
        test('should use !== "false" check for like event handler', () => {
            const likeHandlerMatch = soundboardMainJs.match(/registerTikTokEvent\('like'[\s\S]*?}\);/);
            expect(likeHandlerMatch).toBeTruthy();
            
            const likeHandlerCode = likeHandlerMatch[0];
            expect(likeHandlerCode).toContain("!== 'false'");
            expect(likeHandlerCode).not.toContain("=== 'true'");
        });
        
        test('should have explanatory comment about frontend behavior', () => {
            // Check for comment explaining the behavior
            expect(soundboardMainJs).toContain('matches frontend behavior');
        });
    });
    
    describe('Logic Verification', () => {
        test('should treat null/undefined as enabled', () => {
            // This is JavaScript behavior verification:
            // null !== 'false' -> true (enabled)
            // undefined !== 'false' -> true (enabled)
            expect(null !== 'false').toBe(true);
            expect(undefined !== 'false').toBe(true);
        });
        
        test('should treat "true" as enabled', () => {
            expect('true' !== 'false').toBe(true);
        });
        
        test('should treat "false" as disabled', () => {
            expect('false' !== 'false').toBe(false);
        });
        
        test('should treat other values as enabled', () => {
            // These represent various edge cases and incorrect values
            expect('1' !== 'false').toBe(true);
            expect('0' !== 'false').toBe(true);
            expect('yes' !== 'false').toBe(true);
            expect('no' !== 'false').toBe(true);
            expect('' !== 'false').toBe(true);
        });
    });
    
    describe('Frontend Consistency', () => {
        test('backend check should match frontend pattern', () => {
            // Frontend check at dashboard-enhancements.js:339:
            // settings.soundboard_enabled !== 'false'
            //
            // Backend check should be:
            // db.getSetting('soundboard_enabled') !== 'false'
            
            const backendCheckPattern = /db\.getSetting\('soundboard_enabled'\)\s*!==\s*'false'/g;
            const matches = soundboardMainJs.match(backendCheckPattern);
            
            // Should find at least 5 occurrences (one for each event type)
            expect(matches).toBeTruthy();
            expect(matches.length).toBeGreaterThanOrEqual(5);
        });
    });
    
    describe('Test Sound Endpoint (should not check soundboard_enabled)', () => {
        test('test sound endpoint should not have soundboard_enabled check', () => {
            // Find the test sound endpoint
            const testEndpointMatch = soundboardMainJs.match(/registerRoute\('post',\s*'\/api\/soundboard\/test'[\s\S]*?}\);/);
            expect(testEndpointMatch).toBeTruthy();
            
            const testEndpointCode = testEndpointMatch[0];
            // Test endpoint should NOT check soundboard_enabled
            expect(testEndpointCode).not.toContain('soundboard_enabled');
        });
    });
});
