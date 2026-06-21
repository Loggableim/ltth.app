/**
 * Test: Plugin Cache Headers
 * 
 * Verifies that conservative cache control headers are applied to plugin overlay files
 * to prevent freezing when many gifts come in rapidly (OBS compatibility).
 * 
 * Expected behavior:
 * - Overlay and OBS HUD files: no-cache, no-store, must-revalidate
 * - Other assets (images, CSS): public, max-age=300 (5 minutes)
 */

const assert = require('assert');

// Mock middleware function that replicates server.js cache control logic
function applyCacheHeaders(req, res, next) {
    if (req.path.includes('overlay') || req.path.includes('obs-hud') || req.path.endsWith('.html') || req.path.endsWith('.js')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    } else {
        res.setHeader('Cache-Control', 'public, max-age=300');
    }
    if (next) next(); // Call next if provided (for testing middleware behavior)
}

// Helper function to create a mock response object
function createMockResponse() {
    return {
        headers: {},
        setHeader: function(name, value) {
            this.headers[name.toLowerCase()] = value;
        }
    };
}

describe('Plugin Cache Headers', () => {

    describe('Overlay Files', () => {
        it('should set no-cache headers for overlay.html files', () => {
            const req = { path: '/webgpu-emoji-rain/overlay.html' };
            const res = createMockResponse();

            applyCacheHeaders(req, res);

            assert.strictEqual(res.headers['cache-control'], 'no-cache, no-store, must-revalidate');
            assert.strictEqual(res.headers['pragma'], 'no-cache');
            assert.strictEqual(res.headers['expires'], '0');
        });

        it('should set no-cache headers for obs-hud.html files', () => {
            const req = { path: '/webgpu-emoji-rain/obs-hud.html' };
            const res = createMockResponse();

            applyCacheHeaders(req, res);

            assert.strictEqual(res.headers['cache-control'], 'no-cache, no-store, must-revalidate');
            assert.strictEqual(res.headers['pragma'], 'no-cache');
            assert.strictEqual(res.headers['expires'], '0');
        });

        it('should set no-cache headers for JavaScript files', () => {
            const req = { path: '/fireworks/gpu/engine.js' };
            const res = createMockResponse();

            applyCacheHeaders(req, res);

            assert.strictEqual(res.headers['cache-control'], 'no-cache, no-store, must-revalidate');
            assert.strictEqual(res.headers['pragma'], 'no-cache');
            assert.strictEqual(res.headers['expires'], '0');
        });

        it('should set no-cache headers for any HTML file', () => {
            const req = { path: '/fireworks/ui/settings.html' };
            const res = createMockResponse();

            applyCacheHeaders(req, res);

            assert.strictEqual(res.headers['cache-control'], 'no-cache, no-store, must-revalidate');
            assert.strictEqual(res.headers['pragma'], 'no-cache');
            assert.strictEqual(res.headers['expires'], '0');
        });
    });

    describe('Other Asset Files', () => {
        it('should set short-term cache headers for CSS files', () => {
            const req = { path: '/webgpu-emoji-rain/style.css' };
            const res = createMockResponse();

            applyCacheHeaders(req, res);

            assert.strictEqual(res.headers['cache-control'], 'public, max-age=300');
            assert.strictEqual(res.headers['pragma'], undefined);
            assert.strictEqual(res.headers['expires'], undefined);
        });

        it('should set short-term cache headers for image files', () => {
            const req = { path: '/webgpu-emoji-rain/icon.png' };
            const res = createMockResponse();

            applyCacheHeaders(req, res);

            assert.strictEqual(res.headers['cache-control'], 'public, max-age=300');
            assert.strictEqual(res.headers['pragma'], undefined);
            assert.strictEqual(res.headers['expires'], undefined);
        });
    });

    describe('Edge Cases', () => {
        it('should set no-cache headers for paths containing "overlay" substring', () => {
            const req = { path: '/coinbattle/overlay/overlay.html' };
            const res = createMockResponse();

            applyCacheHeaders(req, res);

            assert.strictEqual(res.headers['cache-control'], 'no-cache, no-store, must-revalidate');
            assert.strictEqual(res.headers['pragma'], 'no-cache');
            assert.strictEqual(res.headers['expires'], '0');
        });

        it('should set no-cache headers for paths containing "obs-hud" substring', () => {
            const req = { path: '/webgpu-emoji-rain/obs-hud.html' };
            const res = createMockResponse();

            applyCacheHeaders(req, res);

            assert.strictEqual(res.headers['cache-control'], 'no-cache, no-store, must-revalidate');
            assert.strictEqual(res.headers['pragma'], 'no-cache');
            assert.strictEqual(res.headers['expires'], '0');
        });

        it('should set no-cache headers for JS files in overlay directory', () => {
            const req = { path: '/webgpu-emoji-rain/overlay/script.js' };
            const res = createMockResponse();

            applyCacheHeaders(req, res);

            assert.strictEqual(res.headers['cache-control'], 'no-cache, no-store, must-revalidate');
            assert.strictEqual(res.headers['pragma'], 'no-cache');
            assert.strictEqual(res.headers['expires'], '0');
        });
    });
});
