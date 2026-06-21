/**
 * Test: Flame Overlay Plugin Structure and Configuration
 * 
 * Validates plugin metadata, file structure, and basic functionality
 */

const fs = require('fs');
const path = require('path');

describe('Flame Overlay Plugin', () => {
    const pluginDir = path.join(__dirname, '..', 'plugins', 'flame-overlay');
    
    test('plugin directory exists', () => {
        expect(fs.existsSync(pluginDir)).toBe(true);
    });
    
    test('plugin.json exists and is valid', () => {
        const pluginJsonPath = path.join(pluginDir, 'plugin.json');
        expect(fs.existsSync(pluginJsonPath)).toBe(true);
        
        const pluginJson = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
        
        // Validate required fields
        expect(pluginJson.id).toBe('flame-overlay');
        expect(pluginJson.name).toBe('TikTok Visual Effects Overlay');
        expect(pluginJson.version).toBe('3.0.0');
        expect(pluginJson.entry).toBe('main.js');
        expect(pluginJson.author).toBe('Pup Cid');
        
        // Validate permissions
        expect(Array.isArray(pluginJson.permissions)).toBe(true);
        expect(pluginJson.permissions).toContain('socket.io');
        expect(pluginJson.permissions).toContain('routes');
        expect(pluginJson.permissions).toContain('database');
    });
    
    test('main.js exists and exports a class', () => {
        const mainJsPath = path.join(pluginDir, 'main.js');
        expect(fs.existsSync(mainJsPath)).toBe(true);
        
        const FlameOverlayPlugin = require(mainJsPath);
        expect(typeof FlameOverlayPlugin).toBe('function');
    });
    
    test('required directories exist', () => {
        const dirs = ['ui', 'renderer', 'textures'];
        
        dirs.forEach(dir => {
            const dirPath = path.join(pluginDir, dir);
            expect(fs.existsSync(dirPath)).toBe(true);
        });
    });
    
    test('required files exist', () => {
        const files = [
            'ui/settings.html',
            'renderer/index.html',
            'renderer/flame.js',
            'textures/nzw.png',
            'textures/firetex.png',
            'README.md'
        ];
        
        files.forEach(file => {
            const filePath = path.join(pluginDir, file);
            expect(fs.existsSync(filePath)).toBe(true);
        });
    });
    
    test('texture files are valid images', () => {
        const nzwPath = path.join(pluginDir, 'textures', 'nzw.png');
        const firetexPath = path.join(pluginDir, 'textures', 'firetex.png');
        
        // Check file sizes (should be > 0 bytes)
        const nzwStats = fs.statSync(nzwPath);
        const firetexStats = fs.statSync(firetexPath);
        
        expect(nzwStats.size).toBeGreaterThan(0);
        expect(firetexStats.size).toBeGreaterThan(0);
        
        // Check PNG magic bytes
        const nzwBuffer = fs.readFileSync(nzwPath);
        const firetexBuffer = fs.readFileSync(firetexPath);
        
        // PNG signature: 89 50 4E 47 0D 0A 1A 0A
        expect(nzwBuffer[0]).toBe(0x89);
        expect(nzwBuffer[1]).toBe(0x50);
        expect(nzwBuffer[2]).toBe(0x4E);
        expect(nzwBuffer[3]).toBe(0x47);
        
        expect(firetexBuffer[0]).toBe(0x89);
        expect(firetexBuffer[1]).toBe(0x50);
        expect(firetexBuffer[2]).toBe(0x4E);
        expect(firetexBuffer[3]).toBe(0x47);
    });
    
    test('HTML files are valid', () => {
        const htmlFiles = [
            'ui/settings.html',
            'renderer/index.html'
        ];
        
        htmlFiles.forEach(file => {
            const filePath = path.join(pluginDir, file);
            const content = fs.readFileSync(filePath, 'utf8');
            
            // Basic HTML validation
            expect(content).toContain('<!DOCTYPE html>');
            expect(content).toContain('<html');
            expect(content).toContain('</html>');
            expect(content).toContain('<body');
            expect(content).toContain('</body>');
        });
    });
    
    test('renderer has required shaders', () => {
        const rendererPath = path.join(pluginDir, 'renderer', 'index.html');
        const indexContent = fs.readFileSync(rendererPath, 'utf8');
        
        // index.html must load effects-engine.js (all shaders live there as JS template literals)
        expect(indexContent).toContain('effects-engine.js');
        
        // Inline shader script blocks are intentionally absent – shaders are in effects-engine.js
        expect(indexContent).not.toContain('id="vertex-shader"');
        expect(indexContent).not.toContain('id="fragment-shader"');
        
        // Check that effects-engine.js contains the essential shader uniforms
        const enginePath = path.join(pluginDir, 'renderer', 'effects-engine.js');
        const engineContent = fs.readFileSync(enginePath, 'utf8');
        expect(engineContent).toContain('uTime');
        expect(engineContent).toContain('uFlameColor');
        expect(engineContent).toContain('uFlameSpeed');
        expect(engineContent).toContain('uFlameIntensity');
        expect(engineContent).toContain('uFrameThickness');
    });
    
    test('flame.js has WebGL setup', () => {
        const flameJsPath = path.join(pluginDir, 'renderer', 'flame.js');
        const content = fs.readFileSync(flameJsPath, 'utf8');
        
        // Check for WebGL context creation
        expect(content).toContain('getContext(\'webgl\'');
        expect(content).toContain('alpha: true');
        expect(content).toContain('premultipliedAlpha: true');
        
        // Check for shader compilation
        expect(content).toContain('compileShader');
        expect(content).toContain('VERTEX_SHADER');
        expect(content).toContain('FRAGMENT_SHADER');
        
        // Check for texture loading
        expect(content).toContain('loadTexture');
        expect(content).toContain('/plugins/flame-overlay/textures/nzw.png');
        expect(content).toContain('/plugins/flame-overlay/textures/firetex.png');
    });
    
    test('settings UI has required controls', () => {
        const settingsPath = path.join(pluginDir, 'ui', 'settings.html');
        const content = fs.readFileSync(settingsPath, 'utf8');
        
        // Check for required input fields
        const requiredInputs = [
            'resolutionPreset',
            'customWidth',
            'customHeight',
            'frameMode',
            'frameThickness',
            'flameColor',
            'flameSpeed',
            'flameIntensity',
            'flameBrightness',
            'enableGlow',
            'enableAdditiveBlend',
            'maskOnlyEdges'
        ];
        
        requiredInputs.forEach(inputId => {
            expect(content).toContain(`id="${inputId}"`);
        });
        
        // Check for API endpoints
        expect(content).toContain('/api/flame-overlay/config');
        expect(content).toContain('/api/flame-overlay/gift-catalog');
        expect(content).toContain('/api/flame-overlay/test-event');
        expect(content).toContain('/api/flame-overlay/clear-triggers');
        expect(content).toContain('id="giftCatalogGrid"');
        expect(content).toContain('saveConfig');
        expect(content).toContain('loadConfig');
    });
    
    test('plugin class has required methods', () => {
        const FlameOverlayPlugin = require(path.join(pluginDir, 'main.js'));
        const mockApi = {
            log: jest.fn(),
            getConfig: jest.fn(() => null),
            setConfig: jest.fn(),
            registerRoute: jest.fn(),
            registerSocket: jest.fn(),
            registerTikTokEvent: jest.fn(),
            emit: jest.fn(),
            getApp: jest.fn(() => ({
                use: jest.fn()
            }))
        };
        
        const plugin = new FlameOverlayPlugin(mockApi);
        
        // Check for required methods
        expect(typeof plugin.init).toBe('function');
        expect(typeof plugin.destroy).toBe('function');
        expect(typeof plugin.loadConfig).toBe('function');
        expect(typeof plugin.saveConfig).toBe('function');
        expect(typeof plugin.getResolution).toBe('function');
        expect(typeof plugin.registerTikTokEventHandlers).toBe('function');
        expect(typeof plugin.registerFlowActions).toBe('function');
    });
    
    test('default configuration is valid', () => {
        const FlameOverlayPlugin = require(path.join(pluginDir, 'main.js'));
        const mockApi = {
            log: jest.fn(),
            getConfig: jest.fn(() => null),
            setConfig: jest.fn()
        };
        
        const plugin = new FlameOverlayPlugin(mockApi);
        plugin.loadConfig();
        
        // Check default config values
        expect(plugin.config).toBeDefined();
        expect(plugin.config.resolutionPreset).toBe('tiktok-portrait');
        expect(plugin.config.frameMode).toBe('bottom');
        expect(plugin.config.frameThickness).toBe(150);
        expect(plugin.config.flameColor).toBe('#ff6600');
        expect(plugin.config.flameSpeed).toBe(0.5);
        expect(plugin.config.flameIntensity).toBe(1.3);
        expect(plugin.config.flameBrightness).toBe(0.38);
    });
    
    test('getResolution returns correct values', () => {
        const FlameOverlayPlugin = require(path.join(pluginDir, 'main.js'));
        const mockApi = {
            log: jest.fn(),
            getConfig: jest.fn(() => null),
            setConfig: jest.fn()
        };
        
        const plugin = new FlameOverlayPlugin(mockApi);
        plugin.loadConfig();
        
        // Test TikTok portrait preset
        plugin.config.resolutionPreset = 'tiktok-portrait';
        let resolution = plugin.getResolution();
        expect(resolution).toEqual({ width: 720, height: 1280 });
        
        // Test HD portrait preset
        plugin.config.resolutionPreset = 'hd-portrait';
        resolution = plugin.getResolution();
        expect(resolution).toEqual({ width: 1080, height: 1920 });
        
        // Test custom resolution
        plugin.config.resolutionPreset = 'custom';
        plugin.config.customWidth = 1000;
        plugin.config.customHeight = 2000;
        resolution = plugin.getResolution();
        expect(resolution).toEqual({ width: 1000, height: 2000 });
    });
    
    test('renderer directory is served for flame.js access', () => {
        const FlameOverlayPlugin = require(path.join(pluginDir, 'main.js'));
        const mockApp = {
            use: jest.fn()
        };
        const mockApi = {
            log: jest.fn(),
            getConfig: jest.fn(() => null),
            setConfig: jest.fn(),
            registerRoute: jest.fn(),
            registerSocket: jest.fn(),
            registerTikTokEvent: jest.fn(),
            emit: jest.fn(),
            getApp: jest.fn(() => mockApp)
        };
        
        const plugin = new FlameOverlayPlugin(mockApi);
        plugin.registerRoutes();
        
        // Verify that express.static is called for /flame-overlay path
        // This ensures flame.js can be loaded from http://localhost:3000/flame-overlay/flame.js
        expect(mockApp.use).toHaveBeenCalledWith(
            '/flame-overlay',
            expect.any(Function)
        );
        
        // Verify textures directory is also served
        expect(mockApp.use).toHaveBeenCalledWith(
            '/plugins/flame-overlay/textures',
            expect.any(Function)
        );
    });
    
    test('settings HTML has inline event handlers for CSP', () => {
        const settingsPath = path.join(pluginDir, 'ui', 'settings.html');
        const content = fs.readFileSync(settingsPath, 'utf8');
        
        // These inline event handlers need CSP hashes to work
        expect(content).toContain('onclick="saveConfig()"');
        expect(content).toContain('onclick="loadConfig()"');
        expect(content).toContain('onclick="openOverlay()"');
        expect(content).toContain('onclick="savePreset()"');
    });
});
