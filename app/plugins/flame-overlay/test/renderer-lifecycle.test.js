const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const pluginRoot = path.join(__dirname, '..');
const htmlSource = fs.readFileSync(path.join(pluginRoot, 'renderer', 'index.html'), 'utf8');
const engineSource = fs.readFileSync(path.join(pluginRoot, 'renderer', 'effects-engine.js'), 'utf8');

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

function createGlStub() {
    let textureId = 0;
    return {
        canvas: { width: 640, height: 480 },
        TEXTURE_2D: 1,
        RGBA: 2,
        UNSIGNED_BYTE: 3,
        TEXTURE_MIN_FILTER: 4,
        TEXTURE_MAG_FILTER: 5,
        TEXTURE_WRAP_S: 6,
        TEXTURE_WRAP_T: 7,
        LINEAR: 8,
        REPEAT: 9,
        CLAMP_TO_EDGE: 10,
        createTexture: jest.fn(() => ({ id: ++textureId })),
        bindTexture: jest.fn(),
        texImage2D: jest.fn(),
        texParameteri: jest.fn(),
        clear: jest.fn(),
        deleteBuffer: jest.fn(),
        deleteTexture: jest.fn(),
        deleteProgram: jest.fn()
    };
}

async function createHarness(fetchImpl) {
    const dom = new JSDOM(htmlSource, { runScripts: 'outside-only', url: 'http://localhost/flame-overlay/overlay' });
    const { window } = dom;
    if (window.document.readyState === 'loading') {
        await new Promise(resolve => window.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    }
    const canvas = window.document.getElementById('flameCanvas');
    const gl = createGlStub();
    const socketHandlers = new Map();
    const images = [];
    const socket = {
        on: jest.fn((name, handler) => socketHandlers.set(name, handler)),
        off: jest.fn((name, handler) => {
            if (socketHandlers.get(name) === handler) socketHandlers.delete(name);
        }),
        disconnect: jest.fn()
    };
    const rafCallbacks = new Map();
    let rafId = 0;

    canvas.getContext = jest.fn(() => gl);
    window.fetch = jest.fn(fetchImpl);
    window.Image = class FakeImage {
        constructor() {
            this.onload = null;
            this.onerror = null;
            images.push(this);
        }

        set src(value) {
            this.source = value;
        }
    };
    window.io = jest.fn(() => socket);
    window.requestAnimationFrame = jest.fn(callback => {
        const id = ++rafId;
        rafCallbacks.set(id, callback);
        return id;
    });
    window.cancelAnimationFrame = jest.fn(id => rafCallbacks.delete(id));
    window.VISUAL_FX_DEFAULT_CONFIG = { effectType: 'flames' };
    window.eval(`${engineSource}\nwindow.EffectsEngine = EffectsEngine;`);

    const Engine = window.EffectsEngine;
    const setup = {
        shaders: jest.fn(function seedPrograms() { this.programs = { flame: { id: 'program' } }; }),
        switchEffect: jest.fn(() => true),
        geometry: jest.fn(function seedGeometry() {
            this.buffers = { position: { id: 'position' }, texCoord: { id: 'texCoord' } };
        }),
        textures: jest.spyOn(Engine.prototype, 'loadTextures'),
        postProcessor: jest.fn(function seedPostProcessor() {
            this.postProcessor = { destroy: jest.fn() };
        }),
        particles: jest.fn(),
        resize: jest.fn()
    };
    Engine.prototype.setupAllShaders = setup.shaders;
    Engine.prototype.switchEffect = setup.switchEffect;
    Engine.prototype.setupGeometry = setup.geometry;
    Engine.prototype.loadTextures = setup.textures;
    Engine.prototype.initPostProcessor = setup.postProcessor;
    Engine.prototype.initParticles = setup.particles;
    Engine.prototype.handleResize = setup.resize;

    const initPromises = [];
    const init = Engine.prototype.init;
    Engine.prototype.init = function trackInit() {
        const promise = init.call(this);
        initPromises.push(promise);
        return promise;
    };

    return { dom, window, canvas, gl, socket, socketHandlers, images, rafCallbacks, setup, initPromises, Engine };
}

describe('Flame renderer page lifecycle', () => {
    test('final pagehide during config fetch prevents late initialization and disposes once', async () => {
        const config = deferred();
        const harness = await createHarness(() => config.promise);
        const engine = new harness.Engine('flameCanvas');
        await Promise.resolve();

        expect(harness.setup.shaders).not.toHaveBeenCalled();
        expect(harness.window.fetch).toHaveBeenCalledTimes(1);

        harness.window.dispatchEvent(new harness.window.PageTransitionEvent('pagehide', { persisted: false }));
        expect(engine.destroyed).toBe(true);

        engine.destroy();
        config.resolve({ json: async () => ({ success: true, config: { effectType: 'flames' } }) });
        await harness.initPromises[0];

        expect(harness.setup.shaders).not.toHaveBeenCalled();
        expect(harness.setup.geometry).not.toHaveBeenCalled();
        expect(harness.setup.textures).not.toHaveBeenCalled();
        expect(harness.setup.postProcessor).not.toHaveBeenCalled();
        expect(harness.socket.on).not.toHaveBeenCalled();
        expect(harness.rafCallbacks.size).toBe(0);
        expect(harness.images).toHaveLength(0);
        expect(harness.gl.deleteBuffer).not.toHaveBeenCalled();
        harness.dom.window.close();
    });

    test('persisted pagehide/show preserves the engine; final pagehide disposes owned resources once', async () => {
        const harness = await createHarness(async () => ({ json: async () => ({ success: true, config: { effectType: 'flames' } }) }));
        const engine = new harness.Engine('flameCanvas');
        await harness.initPromises[0];

        harness.window.dispatchEvent(new harness.window.PageTransitionEvent('pagehide', { persisted: true }));
        harness.window.dispatchEvent(new harness.window.PageTransitionEvent('pageshow', { persisted: true }));
        expect(engine.destroyed).toBe(false);
        expect(harness.setup.shaders).toHaveBeenCalledTimes(1);
        expect(harness.socket.disconnect).not.toHaveBeenCalled();

        const postProcessorDestroy = engine.postProcessor.destroy;
        const staleRafCallback = Array.from(harness.rafCallbacks.values())[0];
        const staleImageLoad = harness.images[0].onload;
        const initialTextureUploadCount = harness.gl.texImage2D.mock.calls.length;
        const staleConfigHandler = harness.socketHandlers.get('flame-overlay:config-update');
        const resizeCount = harness.setup.resize.mock.calls.length;
        harness.window.dispatchEvent(new harness.window.PageTransitionEvent('pagehide', { persisted: false }));
        engine.destroy();

        staleRafCallback();
        staleImageLoad();
        staleConfigHandler({ config: { effectType: 'particles' } });

        expect(engine.destroyed).toBe(true);
        expect(harness.gl.deleteBuffer).toHaveBeenCalledTimes(2);
        expect(harness.gl.deleteTexture).toHaveBeenCalledTimes(2);
        expect(harness.gl.deleteProgram).toHaveBeenCalledTimes(1);
        expect(postProcessorDestroy).toHaveBeenCalledTimes(1);
        expect(harness.socket.disconnect).toHaveBeenCalledTimes(1);
        expect(harness.socketHandlers.size).toBe(0);
        expect(harness.rafCallbacks.size).toBe(0);
        expect(harness.gl.clear).not.toHaveBeenCalled();
        expect(harness.gl.texImage2D).toHaveBeenCalledTimes(initialTextureUploadCount);

        expect(harness.setup.resize).toHaveBeenCalledTimes(resizeCount);
        harness.dom.window.close();
    });
});
