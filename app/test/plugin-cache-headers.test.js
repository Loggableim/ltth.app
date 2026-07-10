/**
 * Test: Global OBS Cache Headers
 * 
 * Verifies that the global middleware protects core and plugin OBS routes from
 * stale Browser Source content.
 * 
 * Expected behavior:
 * - Overlay and OBS HUD files: no-cache, no-store, must-revalidate
 * - Other static assets (images, CSS) are left to their static middleware
 */

const assert = require('assert');
const {
    NO_STORE_CACHE_CONTROL,
    obsCacheControl
} = require('../modules/obs-cache-control');

// Helper function to create a mock response object
function createMockResponse() {
    return {
        headers: {},
        setHeader: function(name, value) {
            this.headers[name.toLowerCase()] = value;
        }
    };
}

function applyCacheHeaders(path, method = 'GET') {
    const req = { method, path };
    const res = createMockResponse();
    let nextCalled = false;

    obsCacheControl(req, res, () => {
        nextCalled = true;
    });

    assert.strictEqual(nextCalled, true);
    return res;
}

describe('Global OBS Cache Headers', () => {

    describe('Overlay Files', () => {
        it('should set no-cache headers for overlay.html files', () => {
            const res = applyCacheHeaders('/webgpu-emoji-rain/overlay.html');

            assert.strictEqual(res.headers['cache-control'], NO_STORE_CACHE_CONTROL);
            assert.strictEqual(res.headers['pragma'], 'no-cache');
            assert.strictEqual(res.headers['expires'], '0');
        });

        it('should set no-cache headers for obs-hud.html files', () => {
            const res = applyCacheHeaders('/webgpu-emoji-rain/obs-hud.html');

            assert.strictEqual(res.headers['cache-control'], NO_STORE_CACHE_CONTROL);
            assert.strictEqual(res.headers['pragma'], 'no-cache');
            assert.strictEqual(res.headers['expires'], '0');
        });

        it('should set no-cache headers for JavaScript files', () => {
            const res = applyCacheHeaders('/fireworks/gpu/engine.js');

            assert.strictEqual(res.headers['cache-control'], NO_STORE_CACHE_CONTROL);
            assert.strictEqual(res.headers['pragma'], 'no-cache');
            assert.strictEqual(res.headers['expires'], '0');
        });

        it('should set no-cache headers for any HTML file', () => {
            const res = applyCacheHeaders('/fireworks/ui/settings.html');

            assert.strictEqual(res.headers['cache-control'], NO_STORE_CACHE_CONTROL);
            assert.strictEqual(res.headers['pragma'], 'no-cache');
            assert.strictEqual(res.headers['expires'], '0');
        });
    });

    describe('Other Asset Files', () => {
        it('should leave CSS caching to static middleware', () => {
            const res = applyCacheHeaders('/webgpu-emoji-rain/style.css');

            assert.strictEqual(res.headers['cache-control'], undefined);
            assert.strictEqual(res.headers['pragma'], undefined);
            assert.strictEqual(res.headers['expires'], undefined);
        });

        it('should leave image caching to static middleware', () => {
            const res = applyCacheHeaders('/webgpu-emoji-rain/icon.png');

            assert.strictEqual(res.headers['cache-control'], undefined);
            assert.strictEqual(res.headers['pragma'], undefined);
            assert.strictEqual(res.headers['expires'], undefined);
        });
    });

    describe('Edge Cases', () => {
        it('should set no-cache headers for paths containing "overlay" substring', () => {
            const res = applyCacheHeaders('/coinbattle/overlay/overlay.html');

            assert.strictEqual(res.headers['cache-control'], NO_STORE_CACHE_CONTROL);
            assert.strictEqual(res.headers['pragma'], 'no-cache');
            assert.strictEqual(res.headers['expires'], '0');
        });

        it('should set no-cache headers for paths containing "obs-hud" substring', () => {
            const res = applyCacheHeaders('/webgpu-emoji-rain/obs-hud.html');

            assert.strictEqual(res.headers['cache-control'], NO_STORE_CACHE_CONTROL);
            assert.strictEqual(res.headers['pragma'], 'no-cache');
            assert.strictEqual(res.headers['expires'], '0');
        });

        it('should set no-cache headers for JS files in overlay directory', () => {
            const res = applyCacheHeaders('/webgpu-emoji-rain/overlay/script.js');

            assert.strictEqual(res.headers['cache-control'], NO_STORE_CACHE_CONTROL);
            assert.strictEqual(res.headers['pragma'], 'no-cache');
            assert.strictEqual(res.headers['expires'], '0');
        });

        it('should set no-store headers for dynamic API responses', () => {
            const res = applyCacheHeaders('/api/interactive-story/overlay-positions');

            assert.strictEqual(res.headers['cache-control'], NO_STORE_CACHE_CONTROL);
        });

        it('should not add cache headers to non-GET requests', () => {
            const res = applyCacheHeaders('/api/interactive-story/overlay-positions', 'POST');

            assert.strictEqual(res.headers['cache-control'], undefined);
        });
    });
});
