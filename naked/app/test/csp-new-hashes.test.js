/**
 * Test: CSP Configuration for New Inline Event Handlers
 * 
 * Validates that Content-Security-Policy headers include the necessary hashes
 * for new inline event handlers that were causing CSP violations
 */

const fs = require('fs');
const path = require('path');

describe('CSP Configuration for New Inline Event Handlers', () => {
    let serverJsContent;
    
    beforeAll(() => {
        const serverPath = path.join(__dirname, '..', 'server.js');
        serverJsContent = fs.readFileSync(serverPath, 'utf8');
    });
    
    test('server.js includes CSP hash K5uNRn2aLxLeK0fjnkWTYWN1J4Vdf92BTAKxjxfz/nQ=', () => {
        const hash1 = 'sha256-K5uNRn2aLxLeK0fjnkWTYWN1J4Vdf92BTAKxjxfz/nQ=';
        expect(serverJsContent).toContain(hash1);
    });
    
    test('server.js includes CSP hash 3ymA831yuAiigbGNakMhiy5HDRlr4NxqwATjV/Nn01I=', () => {
        const hash2 = 'sha256-3ymA831yuAiigbGNakMhiy5HDRlr4NxqwATjV/Nn01I=';
        expect(serverJsContent).toContain(hash2);
    });
    
    test('CSP hashes are present in both admin and overlay CSP sections', () => {
        // Both hashes should appear twice (once for admin UI, once for overlays)
        const hash1 = 'sha256-K5uNRn2aLxLeK0fjnkWTYWN1J4Vdf92BTAKxjxfz/nQ=';
        const matches1 = serverJsContent.match(new RegExp(hash1, 'g'));
        expect(matches1).not.toBeNull();
        expect(matches1.length).toBeGreaterThanOrEqual(2);
        
        const hash2 = 'sha256-3ymA831yuAiigbGNakMhiy5HDRlr4NxqwATjV/Nn01I=';
        const matches2 = serverJsContent.match(new RegExp(hash2, 'g'));
        expect(matches2).not.toBeNull();
        expect(matches2.length).toBeGreaterThanOrEqual(2);
    });
    
    test('unsafe-hashes directive is present for inline event handlers', () => {
        // The CSP should include 'unsafe-hashes' to allow hashed inline event handlers
        expect(serverJsContent).toContain("'unsafe-hashes'");
    });
});
