/**
 * Test: CSP Configuration for Flame Overlay Plugin
 * 
 * Validates that Content-Security-Policy headers include the necessary hashes
 * for the flame overlay plugin's inline event handlers
 */

const fs = require('fs');
const path = require('path');

describe('CSP Configuration for Flame Overlay', () => {
    let serverJsContent;
    
    beforeAll(() => {
        const serverPath = path.join(__dirname, '..', 'server.js');
        serverJsContent = fs.readFileSync(serverPath, 'utf8');
    });
    
    test('server.js includes CSP hash for saveConfig() inline handler', () => {
        // Hash for onclick="saveConfig()"
        const saveConfigHash = 'sha256-pkIZTNQY7BAA6zzvdEQOswJQVdWjCCJ1kfPGeTNsf7I=';
        expect(serverJsContent).toContain(saveConfigHash);
    });
    
    test('server.js includes CSP hash for loadConfig() inline handler', () => {
        // Hash for onclick="loadConfig()"
        const loadConfigHash = 'sha256-NLOkSEP75l2qahhI8V8waw8g5W+9Zf51oD/q4a/qGUQ=';
        expect(serverJsContent).toContain(loadConfigHash);
    });
    
    test('server.js includes CSP hash for openOverlay() inline handler', () => {
        // Hash for onclick="openOverlay()"
        const openOverlayHash = 'sha256-D/hVuFkLXG80cISOvW06JGm4tZkFXx4l076EvvbhR7c=';
        expect(serverJsContent).toContain(openOverlayHash);
    });
    
    test('CSP hashes are present in both admin and overlay CSP sections', () => {
        // All three hashes should appear twice (once for admin UI, once for overlays)
        const saveConfigHash = 'sha256-pkIZTNQY7BAA6zzvdEQOswJQVdWjCCJ1kfPGeTNsf7I=';
        const matches = serverJsContent.match(new RegExp(saveConfigHash, 'g'));
        expect(matches).not.toBeNull();
        expect(matches.length).toBeGreaterThanOrEqual(2);
    });
    
    test('CSP comment identifies flame overlay inline handlers', () => {
        expect(serverJsContent).toContain('Flame overlay inline handlers');
    });
    
    test('unsafe-hashes directive is present for inline event handlers', () => {
        // The CSP should include 'unsafe-hashes' to allow hashed inline event handlers
        expect(serverJsContent).toContain("'unsafe-hashes'");
    });
});
