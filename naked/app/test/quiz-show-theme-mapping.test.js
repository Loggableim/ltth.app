/**
 * Test for Quiz Show Overlay Theme Mapping Fix
 * 
 * This test ensures that the themeMapping variable is properly scoped
 * within the syncApplicationTheme() function and is accessible to the
 * storage event listener.
 */

const fs = require('fs');
const path = require('path');

describe('Quiz Show Overlay - Theme Mapping', () => {
    let overlayCode;

    beforeAll(() => {
        // Read the overlay JavaScript file
        const overlayPath = path.join(__dirname, '../plugins/quiz-show/quiz_show_overlay.js');
        overlayCode = fs.readFileSync(overlayPath, 'utf8');
    });

    test('themeMapping should be defined before storage event listener', () => {
        // Extract the syncApplicationTheme function
        const functionMatch = overlayCode.match(/function syncApplicationTheme\(\) \{[\s\S]*?\n    \}/);
        
        expect(functionMatch).toBeTruthy();
        
        const functionCode = functionMatch[0];
        
        // Check that themeMapping is defined
        expect(functionCode).toContain('const themeMapping = {');
        
        // Check that themeMapping is defined before the storage event listener
        const themeMappingIndex = functionCode.indexOf('const themeMapping');
        const storageListenerIndex = functionCode.indexOf("window.addEventListener('storage'");
        
        expect(themeMappingIndex).toBeGreaterThan(-1);
        expect(storageListenerIndex).toBeGreaterThan(-1);
        expect(themeMappingIndex).toBeLessThan(storageListenerIndex);
    });

    test('themeMapping should contain correct theme mappings', () => {
        // Extract the themeMapping object
        const themeMappingMatch = overlayCode.match(/const themeMapping = \{[\s\S]*?\};/);
        
        expect(themeMappingMatch).toBeTruthy();
        
        const themeMappingCode = themeMappingMatch[0];
        
        // Verify expected theme mappings exist
        expect(themeMappingCode).toContain("'night': 'dark'");
        expect(themeMappingCode).toContain("'day': 'day'");
        expect(themeMappingCode).toContain("'contrast': 'contrast'");
    });

    test('storage event listener should reference themeMapping', () => {
        // Extract the storage event listener
        const storageListenerMatch = overlayCode.match(/window\.addEventListener\('storage',[\s\S]*?\}\);/);
        
        expect(storageListenerMatch).toBeTruthy();
        
        const listenerCode = storageListenerMatch[0];
        
        // Verify themeMapping is used in the listener
        expect(listenerCode).toContain('themeMapping[e.newValue]');
    });

    test('syncApplicationTheme function should be called on DOMContentLoaded', () => {
        // Verify that syncApplicationTheme is called during initialization
        expect(overlayCode).toContain('syncApplicationTheme()');
        
        // Verify it's called in the DOMContentLoaded listener
        const domLoadMatch = overlayCode.match(/document\.addEventListener\('DOMContentLoaded',[\s\S]*?\}\);/);
        expect(domLoadMatch).toBeTruthy();
        expect(domLoadMatch[0]).toContain('syncApplicationTheme()');
    });
});
