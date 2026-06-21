/**
 * Test: Verify fireworks overlay has correct transparency and scaling CSS
 */
const fs = require('fs');
const path = require('path');

describe('Fireworks Overlay Transparency', () => {
    let overlayContent;
    
    beforeAll(() => {
        const overlayPath = path.join(__dirname, '../plugins/fireworks/overlay.html');
        overlayContent = fs.readFileSync(overlayPath, 'utf8');
    });
    
    test('should have html element with transparent background', () => {
        expect(overlayContent).toMatch(/html\s*{[^}]*background:\s*transparent/);
        expect(overlayContent).toMatch(/html\s*{[^}]*background-color:\s*transparent/);
    });
    
    test('should have body element with transparent background', () => {
        expect(overlayContent).toMatch(/body\s*{[^}]*background:\s*transparent/);
        expect(overlayContent).toMatch(/body\s*{[^}]*background-color:\s*transparent/);
    });
    
    test('should have container with transparent background', () => {
        expect(overlayContent).toMatch(/#fireworks-container\s*{[^}]*background:\s*transparent/);
        expect(overlayContent).toMatch(/#fireworks-container\s*{[^}]*background-color:\s*transparent/);
    });
    
    test('should have canvas with 100% width and height', () => {
        expect(overlayContent).toMatch(/#fireworks-canvas\s*{[^}]*width:\s*100%/);
        expect(overlayContent).toMatch(/#fireworks-canvas\s*{[^}]*height:\s*100%/);
    });
    
    test('should have canvas with absolute positioning', () => {
        expect(overlayContent).toMatch(/#fireworks-canvas\s*{[^}]*position:\s*absolute/);
    });
    
    test('should have canvas with transparent background', () => {
        expect(overlayContent).toMatch(/#fireworks-canvas\s*{[^}]*background:\s*transparent/);
        expect(overlayContent).toMatch(/#fireworks-canvas\s*{[^}]*background-color:\s*transparent/);
    });
    
    test('should have GPU rendering optimizations', () => {
        expect(overlayContent).toMatch(/will-change:\s*transform/);
        expect(overlayContent).toMatch(/transform:\s*translate3d\(0,\s*0,\s*0\)/);
        expect(overlayContent).toMatch(/backface-visibility:\s*hidden/);
    });
    
    test('should have overlay-bg-transparent class for JavaScript control', () => {
        expect(overlayContent).toMatch(/\.overlay-bg-transparent/);
        expect(overlayContent).toMatch(/overlay-bg-transparent[^}]*background:\s*transparent\s*!important/);
    });
    
    test('should have applyBackgroundConfig function', () => {
        expect(overlayContent).toMatch(/function applyBackgroundConfig/);
        expect(overlayContent).toMatch(/setProperty.*background-color.*important/);
    });
});
