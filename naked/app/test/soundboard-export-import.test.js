/**
 * Test for soundboard audio animations export/import functionality
 * Verifies that:
 * - Export endpoint is registered
 * - Import endpoint is registered
 * - Frontend has export/import functions
 * - UI elements are present
 */

const fs = require('fs');
const path = require('path');

describe('Soundboard Audio Animations Export/Import', () => {
    let mainJs;
    let dashboardSoundboardJs;
    let uiHtml;
    
    beforeAll(() => {
        // Read the necessary files
        const mainPath = path.join(__dirname, '../plugins/soundboard/main.js');
        const dashboardPath = path.join(__dirname, '../public/js/dashboard-soundboard.js');
        const uiPath = path.join(__dirname, '../plugins/soundboard/ui/index.html');
        
        mainJs = fs.readFileSync(mainPath, 'utf8');
        dashboardSoundboardJs = fs.readFileSync(dashboardPath, 'utf8');
        uiHtml = fs.readFileSync(uiPath, 'utf8');
    });
    
    describe('Backend API Endpoints', () => {
        test('should register export-animations endpoint', () => {
            expect(mainJs).toContain('/api/soundboard/export-animations');
            expect(mainJs).toContain("registerRoute('get', '/api/soundboard/export-animations'");
        });
        
        test('should register import-animations endpoint', () => {
            expect(mainJs).toContain('/api/soundboard/import-animations');
            expect(mainJs).toContain("registerRoute('post', '/api/soundboard/import-animations'");
        });
        
        test('export endpoint should filter animations and create JSON structure', () => {
            expect(mainJs).toContain('getAllGiftSounds()');
            expect(mainJs).toContain('animationUrl');
            expect(mainJs).toContain('animationType');
            expect(mainJs).toContain('animationVolume');
            expect(mainJs).toContain('exportDate');
        });
        
        test('import endpoint should validate data structure', () => {
            expect(mainJs).toContain('importData.animations');
            expect(mainJs).toContain('Array.isArray');
            expect(mainJs).toContain('Invalid import data format');
        });
        
        test('import endpoint should handle errors gracefully', () => {
            expect(mainJs).toContain('imported');
            expect(mainJs).toContain('updated');
            expect(mainJs).toContain('failed');
        });
    });
    
    describe('Frontend Functions', () => {
        test('should have exportAudioAnimations function', () => {
            expect(dashboardSoundboardJs).toContain('function exportAudioAnimations()');
            expect(dashboardSoundboardJs).toContain('/api/soundboard/export-animations');
        });
        
        test('should have importAudioAnimations function', () => {
            expect(dashboardSoundboardJs).toContain('function importAudioAnimations(file)');
            expect(dashboardSoundboardJs).toContain('/api/soundboard/import-animations');
        });
        
        test('export function should create download link', () => {
            expect(dashboardSoundboardJs).toContain('createElement');
            expect(dashboardSoundboardJs).toContain('a.download');
            expect(dashboardSoundboardJs).toContain('soundboard-animations');
        });
        
        test('import function should validate file type', () => {
            expect(dashboardSoundboardJs).toContain('.json');
            expect(dashboardSoundboardJs).toContain('JSON.parse');
        });
        
        test('import function should reload gift sounds after import', () => {
            expect(dashboardSoundboardJs).toContain('loadGiftSounds()');
            expect(dashboardSoundboardJs).toContain('loadGiftCatalog()');
        });
    });
    
    describe('UI Elements', () => {
        test('should have export button in UI', () => {
            expect(uiHtml).toContain('export-animations-btn');
            expect(uiHtml).toContain('Exportieren');
        });
        
        test('should have import button/label in UI', () => {
            expect(uiHtml).toContain('import-animations-file');
            expect(uiHtml).toContain('Importieren');
        });
        
        test('should have file input for import', () => {
            expect(uiHtml).toContain('type="file"');
            expect(uiHtml).toContain('accept=".json"');
        });
        
        test('should have Audio-Animationen Verwaltung section', () => {
            expect(uiHtml).toContain('Audio-Animationen Verwaltung');
        });
    });
    
    describe('Event Handlers', () => {
        test('should attach click handler to export button', () => {
            expect(dashboardSoundboardJs).toContain("getElementById('export-animations-btn')");
            expect(dashboardSoundboardJs).toContain('exportAudioAnimations');
        });
        
        test('should attach change handler to import file input', () => {
            expect(dashboardSoundboardJs).toContain("getElementById('import-animations-file')");
            expect(dashboardSoundboardJs).toContain("addEventListener('change'");
        });
        
        test('should reset file input after import', () => {
            expect(dashboardSoundboardJs).toContain("e.target.value = ''");
        });
    });
    
    describe('Localization', () => {
        const locales = ['de', 'en', 'fr', 'es'];
        
        locales.forEach(locale => {
            test(`should have ${locale} translations for export/import`, () => {
                const localePath = path.join(__dirname, `../plugins/soundboard/locales/${locale}.json`);
                const localeContent = fs.readFileSync(localePath, 'utf8');
                const localeData = JSON.parse(localeContent);
                
                expect(localeData.soundboard.animations).toBeDefined();
                expect(localeData.soundboard.animations.export).toBeDefined();
                expect(localeData.soundboard.animations.import).toBeDefined();
                expect(localeData.soundboard.animations.exportSuccess).toBeDefined();
                expect(localeData.soundboard.animations.importSuccess).toBeDefined();
            });
        });
    });
});
