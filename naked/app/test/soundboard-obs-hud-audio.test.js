/**
 * Test for OBS HUD soundboard audio playback
 * Ensures audio elements are appended to the DOM for reliable playback
 */

const fs = require('fs');
const path = require('path');

describe('Soundboard OBS HUD Audio Playback', () => {
    let overlayHtml;

    beforeAll(() => {
        const filePath = path.join(__dirname, '../public/animation-overlay.html');
        overlayHtml = fs.readFileSync(filePath, 'utf8');
    });

    test('should append soundboard audio element to DOM', () => {
        expect(overlayHtml).toContain('document.body.appendChild(audio)');
    });

    test('should remove soundboard audio element after playback', () => {
        // Check for proper cleanup using either .remove() or .removeChild()
        const hasRemove = overlayHtml.includes('audio.remove()');
        const hasRemoveChild = overlayHtml.includes('removeChild(audio)') || 
                               overlayHtml.includes('audio.parentNode.removeChild');
        expect(hasRemove || hasRemoveChild).toBe(true);
    });
});
