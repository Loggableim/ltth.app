/**
 * Test: Visual FX Frame Plugin Structure and Configuration
 * 
 * Validates plugin metadata, file structure, and basic functionality
 */

const fs = require('fs');
const path = require('path');

function getInlineEventHandlers(html) {
    return [...html.matchAll(/\s(on[a-z][\w:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)]
        .map(match => ({
            attribute: match[1].toLowerCase(),
            code: match[2] ?? match[3] ?? match[4] ?? ''
        }));
}

function extractFunctionBody(content, functionName) {
    const functionStart = content.indexOf(`function ${functionName}(`);
    expect(functionStart).toBeGreaterThanOrEqual(0);

    const openBrace = content.indexOf('{', functionStart);
    expect(openBrace).toBeGreaterThanOrEqual(0);

    let depth = 0;
    for (let i = openBrace; i < content.length; i++) {
        if (content[i] === '{') depth++;
        if (content[i] === '}') depth--;
        if (depth === 0) {
            return content.slice(openBrace + 1, i);
        }
    }

    throw new Error(`Could not extract function body for ${functionName}`);
}

describe('Visual FX Frame Plugin', () => {
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
        expect(pluginJson.name).toBe('Visual FX Frame');
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
            'default-config.js',
            'ui/settings.html',
            'renderer/index.html',
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
    
    test('legacy flame.js is not an active renderer artifact', () => {
        const flameJsPath = path.join(pluginDir, 'renderer', 'flame.js');
        const rendererPath = path.join(pluginDir, 'renderer', 'index.html');
        const indexContent = fs.readFileSync(rendererPath, 'utf8');

        expect(fs.existsSync(flameJsPath)).toBe(false);
        expect(indexContent).not.toContain('flame.js');
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
    
    test('renderer assets are served through lifecycle-managed plugin routes', () => {
        const FlameOverlayPlugin = require(path.join(pluginDir, 'main.js'));
        const registeredRoutes = new Map();
        const mockApp = {
            use: jest.fn()
        };
        const mockApi = {
            log: jest.fn(),
            getConfig: jest.fn(() => null),
            setConfig: jest.fn(),
            registerRoute: jest.fn((method, routePath, handler) => {
                registeredRoutes.set(`${method.toLowerCase()} ${routePath}`, handler);
            }),
            registerSocket: jest.fn(),
            registerTikTokEvent: jest.fn(),
            emit: jest.fn(),
            getApp: jest.fn(() => mockApp)
        };
        
        const plugin = new FlameOverlayPlugin(mockApi);
        plugin.registerRoutes();

        expect(mockApp.use).not.toHaveBeenCalled();
        expect(registeredRoutes.has('get /flame-overlay/default-config.js')).toBe(true);
        expect(registeredRoutes.has('get /flame-overlay/:asset')).toBe(true);
        expect(registeredRoutes.has('get /plugins/flame-overlay/textures/:texture')).toBe(true);

        const createResponse = () => ({
            status: jest.fn(function setStatus(code) {
                this.statusCode = code;
                return this;
            }),
            json: jest.fn(),
            sendFile: jest.fn()
        });

        const rendererRes = createResponse();
        registeredRoutes.get('get /flame-overlay/:asset')(
            { params: { asset: 'effects-engine.js' } },
            rendererRes
        );
        expect(rendererRes.sendFile).toHaveBeenCalledWith(
            path.join(pluginDir, 'renderer', 'effects-engine.js')
        );

        const defaultsRes = createResponse();
        registeredRoutes.get('get /flame-overlay/default-config.js')({}, defaultsRes);
        expect(defaultsRes.sendFile).toHaveBeenCalledWith(
            path.join(pluginDir, 'default-config.js')
        );

        const textureRes = createResponse();
        registeredRoutes.get('get /plugins/flame-overlay/textures/:texture')(
            { params: { texture: 'nzw.png' } },
            textureRes
        );
        expect(textureRes.sendFile).toHaveBeenCalledWith(
            path.join(pluginDir, 'textures', 'nzw.png')
        );

        const traversalRes = createResponse();
        registeredRoutes.get('get /flame-overlay/:asset')(
            { params: { asset: '../main.js' } },
            traversalRes
        );
        expect(traversalRes.status).toHaveBeenCalledWith(404);
        expect(traversalRes.json).toHaveBeenCalledWith({
            success: false,
            error: 'Asset not found'
        });
    });
    
    test('settings HTML binds UI actions without inline event handlers', () => {
        const settingsPath = path.join(pluginDir, 'ui', 'settings.html');
        const content = fs.readFileSync(settingsPath, 'utf8');

        expect(getInlineEventHandlers(content)).toEqual([]);

        const expectedButtonBindings = [
            ['previewToggle', 'togglePreview'],
            ['previewRefreshBtn', 'refreshPreview'],
            ['previewFullscreenBtn', 'toggleFullscreen'],
            ['applyFramePositionBtn', 'applyFramePosition'],
            ['savePresetBtn', 'savePreset'],
            ['saveConfigBtn', 'saveConfig'],
            ['reloadConfigBtn', 'loadConfig'],
            ['openOverlayBtn', 'openOverlay']
        ];

        expectedButtonBindings.forEach(([id, handler]) => {
            expect(content).toContain(`id="${id}"`);
            expect(content).toContain(`document.getElementById('${id}').addEventListener('click', ${handler})`);
        });
    });

    test('backend, renderer, and settings UI share the visual default source', () => {
        const defaultsPath = path.join(pluginDir, 'default-config.js');
        const defaults = require(defaultsPath).VISUAL_FX_DEFAULT_CONFIG;
        const main = fs.readFileSync(path.join(pluginDir, 'main.js'), 'utf8');
        const renderer = fs.readFileSync(path.join(pluginDir, 'renderer', 'index.html'), 'utf8');
        const settings = fs.readFileSync(path.join(pluginDir, 'ui', 'settings.html'), 'utf8');

        expect(defaults.flameIntensity).toBe(1.3);
        expect(defaults.sparkDensity).toBe(0.52);
        expect(main).toContain("require('./default-config')");
        expect(renderer).toContain('src="default-config.js"');
        expect(settings).toContain('src="/flame-overlay/default-config.js"');
        expect(settings).toContain('window.VISUAL_FX_DEFAULT_CONFIG');
    });

    test('trigger save button persists adjacent trigger settings', () => {
        const settingsPath = path.join(pluginDir, 'ui', 'settings.html');
        const content = fs.readFileSync(settingsPath, 'utf8');
        const body = extractFunctionBody(content, 'saveTriggerRules');

        expect(body).toContain("fetch('/api/flame-overlay/config'");
        expect(body).toContain('triggerRules');
        expect(body).toContain('triggersEnabled');
        expect(body).toContain('chatColorCommands');
        expect(body).toContain('triggerCooldown');
        expect(body).toContain('triggerMaxStack');
    });

    test('trigger status rendering does not inject HTML', () => {
        const settingsPath = path.join(pluginDir, 'ui', 'settings.html');
        const content = fs.readFileSync(settingsPath, 'utf8');
        const body = extractFunctionBody(content, 'updateTriggerStatus');

        expect(body).not.toContain('innerHTML');
        expect(body).toContain('createElement');
        expect(body).toContain('textContent');
    });

    test('preview sizing and overlay window use selected resolution', () => {
        const settingsPath = path.join(pluginDir, 'ui', 'settings.html');
        const content = fs.readFileSync(settingsPath, 'utf8');
        const previewBody = extractFunctionBody(content, 'updatePreviewAspectRatio');
        const openOverlayBody = extractFunctionBody(content, 'openOverlay');

        expect(content).toContain('function getSelectedResolution()');
        expect(previewBody).toContain('getSelectedResolution()');
        expect(previewBody).toMatch(/paddingBottom|aspectRatio/);
        expect(openOverlayBody).toContain('getSelectedResolution()');
        expect(openOverlayBody).not.toContain('width=720,height=1280');
    });

    test('custom resolution edits refresh preview aspect ratio', () => {
        const settingsPath = path.join(pluginDir, 'ui', 'settings.html');
        const content = fs.readFileSync(settingsPath, 'utf8');
        const listenerStart = content.indexOf('CUSTOM_RESOLUTION_INPUTS.forEach');
        expect(listenerStart).toBeGreaterThanOrEqual(0);

        const listenerBlock = content.slice(listenerStart, content.indexOf('// Load configuration', listenerStart));
        expect(listenerBlock).toContain('updatePreviewAspectRatio();');
    });

    test('settings UI exposes accessible status, preview, and remove controls', () => {
        const settingsPath = path.join(pluginDir, 'ui', 'settings.html');
        const content = fs.readFileSync(settingsPath, 'utf8');

        expect(content).toMatch(/id="status"[^>]*role="status"[^>]*aria-live="polite"/);
        expect(content).toMatch(/<iframe[^>]*id="previewIframe"[^>]*title="/);
        expect(content).toContain('<label for="frameX">');
        expect(content).toContain('<label for="frameY">');
        expect(content).toContain('<label for="frameWidth">');
        expect(content).toContain('<label for="frameHeight">');
        expect(content).toContain("removeBtn.setAttribute('aria-label'");
        expect(content).toMatch(/class="btn btn-secondary preset-delete-btn"[^>]*aria-label=/);
    });

    test('settings category navigation is keyboard accessible and exposes pressed state', () => {
        const settingsPath = path.join(pluginDir, 'ui', 'settings.html');
        const content = fs.readFileSync(settingsPath, 'utf8');

        expect(content).toContain('role="toolbar"');
        expect(content).toContain('aria-pressed="true"');
        expect(content).toContain("btn.addEventListener('keydown', focusAdjacentTab)");
        expect(content).toContain("event.key === 'ArrowRight'");
        expect(content).toContain("event.key === 'ArrowLeft'");
    });
});
