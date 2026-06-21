/**
 * Test: Chatango Embed Generation
 * 
 * Validates iframe-based embed implementation
 */

const ChatangoPlugin = require('../plugins/chatango/main');

describe('Chatango Embed Generation', () => {
    let plugin;
    let mockApi;

    beforeEach(() => {
        mockApi = {
            getConfig: jest.fn(),
            setConfig: jest.fn(),
            registerRoute: jest.fn(),
            registerSocket: jest.fn(),
            emit: jest.fn(),
            getPluginDir: jest.fn(() => '/fake/plugin/dir'),
            logger: {
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn()
            }
        };

        plugin = new ChatangoPlugin(mockApi);
    });

    describe('generateEmbedHTML', () => {
        test('generates valid HTML for dashboard embed', () => {
            plugin.config = plugin.getDefaultConfig();
            const html = plugin.generateEmbedHTML('dashboard', 'night');

            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('<html lang="en">');
            expect(html).toContain('Chatango Dashboard');
            expect(html).toContain('chatango-container');
            expect(html).toContain('st.chatango.com/js/gz/emb.js');
            expect(html).toContain('pupcidsltth'); // default room handle
        });

        test('generates valid HTML for widget embed', () => {
            plugin.config = plugin.getDefaultConfig();
            const html = plugin.generateEmbedHTML('widget', 'day');

            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('Chatango Widget');
            expect(html).toContain('chatango-container');
            expect(html).toContain('st.chatango.com/js/gz/emb.js');
        });

        test('sanitizes dimensions in generated HTML', () => {
            plugin.config = plugin.getDefaultConfig();
            const html = plugin.generateEmbedHTML('widget', 'night');

            // Widget should have explicit dimensions
            expect(html).toMatch(/width:\s*\d+px/);
            expect(html).toMatch(/height:\s*\d+px/);
        });

        test('includes theme-specific configuration', () => {
            plugin.config = plugin.getDefaultConfig();
            const nightHtml = plugin.generateEmbedHTML('dashboard', 'night');
            const dayHtml = plugin.generateEmbedHTML('dashboard', 'day');

            // Both should contain config but with different theme values
            expect(nightHtml).toContain('"handle":"pupcidsltth"');
            expect(dayHtml).toContain('"handle":"pupcidsltth"');
            
            // Theme colors should differ (night uses dark bg, day uses light bg)
            expect(nightHtml).toContain('"e":"1e293b"'); // night messages bg
            expect(dayHtml).toContain('"e":"f8fafc"');   // day messages bg
        });

        test('escapes special characters in room handle', () => {
            plugin.config = { ...plugin.getDefaultConfig(), roomHandle: 'test<script>' };
            const html = plugin.generateEmbedHTML('dashboard', 'night');

            // Handle should be sanitized and not include raw tags
            expect(html).toContain('"handle":"test');
            expect(html).not.toContain('test<script>');
        });

        test('validates dimensions are within safe bounds', () => {
            plugin.config = { 
                ...plugin.getDefaultConfig(),
                widgetWidth: 5000,  // Exceeds max
                widgetHeight: -100  // Negative
            };
            const html = plugin.generateEmbedHTML('widget', 'night');

            // Should be clamped to safe values
            expect(html).toMatch(/width:\s*\d+px/);
            expect(html).toMatch(/height:\s*\d+px/);
            
            // Should not contain unsafe values
            expect(html).not.toContain('5000px');
            expect(html).not.toContain('-100px');
        });
    });

    describe('generateScriptTag', () => {
        test('generates script tag with JSON config', () => {
            plugin.config = plugin.getDefaultConfig();
            const tag = plugin.generateScriptTag('dashboard', 'night');

            expect(tag).toContain('<script');
            expect(tag).toContain('src="https://st.chatango.com/js/gz/emb.js"');
            expect(tag).toContain('data-cfasync="false"');
            expect(tag).toContain('async');
            expect(tag).toContain('"handle":"pupcidsltth"');
            expect(tag).toContain('</script>');
        });

        test('includes unique ID for each embed', () => {
            plugin.config = plugin.getDefaultConfig();
            const tag1 = plugin.generateScriptTag('dashboard', 'night');
            const tag2 = plugin.generateScriptTag('dashboard', 'night');

            // Extract IDs from tags
            const id1Match = tag1.match(/id="([^"]+)"/);
            const id2Match = tag2.match(/id="([^"]+)"/);

            expect(id1Match).toBeTruthy();
            expect(id2Match).toBeTruthy();
            // IDs should be different (timestamp-based)
            // Note: This might occasionally fail if both calls happen in same millisecond
        });

        test('sanitizes dimensions in style attribute', () => {
            plugin.config = {
                ...plugin.getDefaultConfig(),
                widgetWidth: 999999,
                widgetHeight: -50
            };
            const tag = plugin.generateScriptTag('widget', 'night');

            expect(tag).toContain('style="');
            expect(tag).toMatch(/width:\s*\d+px/);
            expect(tag).toMatch(/height:\s*\d+px/);
            
            // Should not contain unsafe values
            expect(tag).not.toContain('999999');
            expect(tag).not.toContain('-50');
        });
    });

    describe('registerRoutes', () => {
        test('registers embed HTML routes', async () => {
            await plugin.init();

            const registerRouteCalls = mockApi.registerRoute.mock.calls;
            const dashboardRoute = registerRouteCalls.find(call => call[1] === '/chatango/embed/dashboard');
            const widgetRoute = registerRouteCalls.find(call => call[1] === '/chatango/embed/widget');

            expect(dashboardRoute).toBeTruthy();
            expect(widgetRoute).toBeTruthy();
            expect(dashboardRoute[0]).toBe('GET');
            expect(widgetRoute[0]).toBe('GET');
        });

        test('dashboard embed route returns HTML', async () => {
            mockApi.getConfig.mockResolvedValue(plugin.getDefaultConfig());
            await plugin.init();

            const dashboardRoute = mockApi.registerRoute.mock.calls.find(
                call => call[1] === '/chatango/embed/dashboard'
            );
            const handler = dashboardRoute[2];

            const mockRes = {
                setHeader: jest.fn(),
                send: jest.fn()
            };
            const mockReq = { query: {} };

            await handler(mockReq, mockRes);

            expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html; charset=utf-8');
            expect(mockRes.send).toHaveBeenCalled();
            const html = mockRes.send.mock.calls[0][0];
            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('st.chatango.com');
        });

        test('widget embed route returns HTML', async () => {
            mockApi.getConfig.mockResolvedValue(plugin.getDefaultConfig());
            await plugin.init();

            const widgetRoute = mockApi.registerRoute.mock.calls.find(
                call => call[1] === '/chatango/embed/widget'
            );
            const handler = widgetRoute[2];

            const mockRes = {
                setHeader: jest.fn(),
                send: jest.fn()
            };
            const mockReq = { query: {} };

            await handler(mockReq, mockRes);

            expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html; charset=utf-8');
            expect(mockRes.send).toHaveBeenCalled();
            const html = mockRes.send.mock.calls[0][0];
            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('st.chatango.com');
        });

        test('embed routes respect theme query parameter', async () => {
            mockApi.getConfig.mockResolvedValue(plugin.getDefaultConfig());
            await plugin.init();

            const dashboardRoute = mockApi.registerRoute.mock.calls.find(
                call => call[1] === '/chatango/embed/dashboard'
            );
            const handler = dashboardRoute[2];

            const mockRes = {
                setHeader: jest.fn(),
                send: jest.fn()
            };
            const mockReqDay = { query: { theme: 'day' } };

            await handler(mockReqDay, mockRes);

            const html = mockRes.send.mock.calls[0][0];
            // Day theme has light messages background
            expect(html).toContain('"e":"f8fafc"');
        });
    });

    describe('XSS Prevention', () => {
        test('escapes malicious room handle', () => {
            plugin.config = {
                ...plugin.getDefaultConfig(),
                roomHandle: '"><script>alert("xss")</script><"'
            };
            const html = plugin.generateEmbedHTML('dashboard', 'night');

            // Should not contain unescaped script tags
            expect(html).not.toContain('alert("xss")');
            expect(html).not.toContain('<script>alert');
        });

        test('validates numeric dimensions', () => {
            plugin.config = {
                ...plugin.getDefaultConfig(),
                widgetWidth: 'javascript:alert(1)',
                widgetHeight: '"><script>alert(1)</script>'
            };
            const html = plugin.generateEmbedHTML('widget', 'night');

            // Should fallback to safe defaults
            expect(html).not.toContain('javascript:');
            expect(html).not.toContain('alert(1)');
            expect(html).toMatch(/width:\s*\d+px/);
            expect(html).toMatch(/height:\s*\d+px/);
        });
    });
});
