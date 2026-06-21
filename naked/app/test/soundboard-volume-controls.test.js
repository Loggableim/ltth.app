/**
 * Test for soundboard volume controls
 * Verifies that volume sliders are properly integrated with preview functionality
 * and that inline volume controls are present in the gift sounds table and event sounds
 */

const fs = require('fs');
const path = require('path');

describe('Soundboard Volume Controls', () => {
    let dashboardSoundboardJs;
    let soundboardHtml;
    
    beforeAll(() => {
        // Read the dashboard-soundboard.js file
        const filePath = path.join(__dirname, '../public/js/dashboard-soundboard.js');
        dashboardSoundboardJs = fs.readFileSync(filePath, 'utf8');
        
        // Read the HTML file
        const htmlPath = path.join(__dirname, '../plugins/soundboard/ui/index.html');
        soundboardHtml = fs.readFileSync(htmlPath, 'utf8');
    });
    
    test('should have generateUniqueSoundId helper function', () => {
        expect(dashboardSoundboardJs).toContain('function generateUniqueSoundId()');
        expect(dashboardSoundboardJs).toContain('soundIdCounter');
    });
    
    test('should create volume sliders in MyInstants search results', () => {
        expect(dashboardSoundboardJs).toContain('type="range"');
        expect(dashboardSoundboardJs).toContain('min="0" max="100"');
        expect(dashboardSoundboardJs).toContain('Vol:');
    });
    
    test('should read volume from slider when testing sounds', () => {
        expect(dashboardSoundboardJs).toContain('volumeInputId');
        expect(dashboardSoundboardJs).toContain('dataset.volumeInputId');
        expect(dashboardSoundboardJs).toContain('parseFloat(volumeInput.value) / 100.0');
    });
    
    test('should update volume label when slider changes', () => {
        expect(dashboardSoundboardJs).toContain("addEventListener('input'");
        expect(dashboardSoundboardJs).toContain('volumeLabel.textContent');
    });
    
    test('should use unique IDs for each sound control', () => {
        // Check that we're using the helper function instead of inline generation
        expect(dashboardSoundboardJs).toContain('const soundId = generateUniqueSoundId()');
        
        // Should not have the old inline ID generation
        expect(dashboardSoundboardJs).not.toContain('Math.random().toString(36)');
    });
    
    test('should have inline volume controls in gift sound table', () => {
        // Check for inline volume slider creation
        expect(dashboardSoundboardJs).toContain('gift-vol-');
        expect(dashboardSoundboardJs).toContain('gift-anim-vol-');
        expect(dashboardSoundboardJs).toContain('data-volume-type="sound"');
        expect(dashboardSoundboardJs).toContain('data-volume-type="animation"');
    });
    
    test('should have updateGiftVolume function for inline volume updates', () => {
        expect(dashboardSoundboardJs).toContain('async function updateGiftVolume(gift, volume, volumeType)');
        expect(dashboardSoundboardJs).toContain("volumeType === 'sound'");
        expect(dashboardSoundboardJs).toContain("volumeType === 'animation'");
    });
    
    test('should have event sound volume sliders in HTML', () => {
        // Check for volume sliders in Event Sounds section
        expect(soundboardHtml).toContain('soundboard-follow-volume-slider');
        expect(soundboardHtml).toContain('soundboard-subscribe-volume-slider');
        expect(soundboardHtml).toContain('soundboard-share-volume-slider');
        expect(soundboardHtml).toContain('soundboard-gift-volume-slider');
        expect(soundboardHtml).toContain('soundboard-like-volume-slider');
        
        // Check for volume labels
        expect(soundboardHtml).toContain('soundboard-follow-volume-label');
        expect(soundboardHtml).toContain('soundboard-subscribe-volume-label');
        expect(soundboardHtml).toContain('soundboard-share-volume-label');
        expect(soundboardHtml).toContain('soundboard-gift-volume-label');
        expect(soundboardHtml).toContain('soundboard-like-volume-label');
    });
    
    test('should have initializeEventSoundSliders function', () => {
        expect(dashboardSoundboardJs).toContain('function initializeEventSoundSliders()');
        expect(dashboardSoundboardJs).toContain('setupSlider');
        expect(dashboardSoundboardJs).toContain('initializeEventSoundSliders()');
    });
    
    test('should sync event sound sliders with hidden inputs', () => {
        // Check that sliders update the hidden input fields
        expect(dashboardSoundboardJs).toContain('input.value = volumeValue.toFixed(1)');
        expect(dashboardSoundboardJs).toContain('slider.value = percentage');
    });
});
