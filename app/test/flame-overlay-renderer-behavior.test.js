const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rendererDir = path.join(__dirname, '..', 'plugins', 'flame-overlay', 'renderer');
const effectsEnginePath = path.join(rendererDir, 'effects-engine.js');
const postProcessorPath = path.join(rendererDir, 'post-processor.js');

function loadEffectsEngine(overrides = {}) {
  const code = fs.readFileSync(effectsEnginePath, 'utf8');
  const context = {
    console: {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    },
    document: {
      addEventListener: jest.fn(),
      getElementById: jest.fn(() => null)
    },
    window: {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      devicePixelRatio: 1,
      innerWidth: 720,
      innerHeight: 1280,
      ...(overrides.window || {})
    },
    Image: overrides.Image || class {},
    Date: overrides.Date || Date,
    setTimeout: overrides.setTimeout || setTimeout,
    clearTimeout: overrides.clearTimeout || clearTimeout,
    requestAnimationFrame: overrides.requestAnimationFrame || (callback => setTimeout(callback, 0)),
    cancelAnimationFrame: overrides.cancelAnimationFrame || clearTimeout,
    module: { exports: {} },
    exports: {}
  };

  vm.runInNewContext(`${code}\nmodule.exports = EffectsEngine;`, context, {
    filename: effectsEnginePath
  });

  return { EffectsEngine: context.module.exports, context };
}

function loadPostProcessor() {
  const code = fs.readFileSync(postProcessorPath, 'utf8');
  const context = {
    console: {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    },
    module: { exports: {} },
    exports: {}
  };

  vm.runInNewContext(`${code}\nmodule.exports = PostProcessor;`, context, {
    filename: postProcessorPath
  });

  return context.module.exports;
}

function makeTriggerEngine(EffectsEngine) {
  const engine = Object.create(EffectsEngine.prototype);
  engine.config = {
    effectType: 'flames',
    flameColor: '#ff6600',
    flameIntensity: 1,
    flameBrightness: 0.25,
    bloomEnabled: false,
    bloomIntensity: 0,
    pulseEnabled: false
  };
  engine.baseConfig = null;
  engine.activeTriggers = [];
  engine.triggerTimers = new Map();
  engine.defaultTriggerDuration = 5000;
  engine.maxTriggerDuration = 30000;
  engine.updateUniforms = jest.fn();
  engine.switchEffect = jest.fn(function switchEffect(effectType) {
    this.config.effectType = effectType;
    return true;
  });
  return engine;
}

describe('Flame Overlay renderer behavior', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('switchEffect synchronizes config.effectType and rejects unknown effects without changing program', () => {
    const { EffectsEngine } = loadEffectsEngine();
    const engine = Object.create(EffectsEngine.prototype);
    const flameProgram = { name: 'flames' };
    const energyProgram = { name: 'energy' };

    engine.config = { effectType: 'flames' };
    engine.programs = { flames: flameProgram, energy: energyProgram };
    engine.currentProgram = flameProgram;
    engine.gl = { useProgram: jest.fn() };
    engine.setupUniformsForProgram = jest.fn();
    engine.updateUniforms = jest.fn();

    expect(engine.switchEffect('energy')).toBe(true);
    expect(engine.currentProgram).toBe(energyProgram);
    expect(engine.config.effectType).toBe('energy');

    expect(engine.switchEffect('missing-effect')).toBe(false);
    expect(engine.currentProgram).toBe(energyProgram);
    expect(engine.config.effectType).toBe('energy');
  });

  test('config updates during active triggers replace the base config and reapply active triggers', () => {
    const { EffectsEngine } = loadEffectsEngine();
    const engine = makeTriggerEngine(EffectsEngine);

    expect(typeof EffectsEngine.prototype.applyConfigUpdate).toBe('function');

    engine.handleTrigger({
      id: 'boost',
      type: 'intensity-boost',
      amount: 1,
      revert: false,
      permanent: true
    });
    expect(engine.config.flameIntensity).toBe(2);

    engine.applyConfigUpdate({
      config: {
        effectType: 'flames',
        flameColor: '#00ff00',
        flameIntensity: 0.25,
        flameBrightness: 0,
        bloomEnabled: false,
        bloomIntensity: 0,
        pulseEnabled: false
      }
    });

    expect(engine.baseConfig.flameColor).toBe('#00ff00');
    expect(engine.baseConfig.flameIntensity).toBe(0.25);
    expect(engine.config.flameColor).toBe('#00ff00');
    expect(engine.config.flameIntensity).toBe(1.25);

    engine.clearTriggers();
    expect(engine.config.flameColor).toBe('#00ff00');
    expect(engine.config.flameIntensity).toBe(0.25);
    expect(engine.config.flameBrightness).toBe(0);
  });

  test('animated base restore restores every base config field at completion', () => {
    const rafCallbacks = [];
    let now = 0;
    const { EffectsEngine } = loadEffectsEngine({
      Date: { now: () => now },
      requestAnimationFrame: callback => {
        rafCallbacks.push(callback);
        return rafCallbacks.length;
      },
      cancelAnimationFrame: jest.fn()
    });
    const engine = Object.create(EffectsEngine.prototype);
    const targetConfig = {
      effectType: 'flames',
      flameColor: '#111111',
      flameIntensity: 0,
      flameBrightness: 0,
      flameSpeed: 0,
      bloomEnabled: false,
      bloomIntensity: 0,
      bloomThreshold: 0,
      pulseEnabled: false,
      pulseAmount: 0,
      smokeEnabled: false,
      layersEnabled: false,
      enableAdditiveBlend: false,
      frameThickness: 0
    };

    engine.config = {
      effectType: 'energy',
      flameColor: '#ffffff',
      flameIntensity: 3,
      flameBrightness: 2,
      flameSpeed: 2,
      bloomEnabled: true,
      bloomIntensity: 2,
      bloomThreshold: 1,
      pulseEnabled: true,
      pulseAmount: 1,
      smokeEnabled: true,
      layersEnabled: true,
      enableAdditiveBlend: true,
      frameThickness: 250
    };
    engine.baseConfig = { ...targetConfig };
    engine.revertAnimationId = null;
    engine.updateUniforms = jest.fn();
    engine.switchEffect = jest.fn(function switchEffect(effectType) {
      this.config.effectType = effectType;
      return true;
    });

    engine.restoreBaseConfig(true);
    expect(rafCallbacks).toHaveLength(1);

    now = 500;
    rafCallbacks.shift()();

    expect(engine.config).toEqual(targetConfig);
    expect(engine.baseConfig).toBeNull();
    expect(engine.revertAnimationId).toBeNull();
  });

  test('revert false triggers get a bounded ttl unless explicitly permanent', () => {
    jest.useFakeTimers();
    const { EffectsEngine } = loadEffectsEngine();
    const engine = makeTriggerEngine(EffectsEngine);

    engine.handleTrigger({
      id: 'ttl-trigger',
      type: 'pulse',
      intensity: 0.8,
      revert: false,
      duration: 999999
    });

    expect(engine.triggerTimers.has('ttl-trigger')).toBe(true);
    expect(engine.activeTriggers).toHaveLength(1);

    jest.advanceTimersByTime(engine.maxTriggerDuration);
    expect(engine.activeTriggers).toHaveLength(0);
    expect(engine.triggerTimers.has('ttl-trigger')).toBe(false);
    expect(engine.config.pulseEnabled).toBe(false);

    engine.handleTrigger({
      id: 'permanent-trigger',
      type: 'pulse',
      intensity: 0.8,
      revert: false,
      permanent: true
    });

    expect(engine.triggerTimers.has('permanent-trigger')).toBe(false);
    engine.clearTriggers();
    expect(engine.activeTriggers).toHaveLength(0);
  });

  test('updateUniforms preserves valid zero values and scales frame thickness for high dpi', () => {
    const { EffectsEngine } = loadEffectsEngine({
      window: { devicePixelRatio: 2 }
    });
    const engine = Object.create(EffectsEngine.prototype);
    const gl = {
      useProgram: jest.fn(),
      uniform1f: jest.fn(),
      uniform1i: jest.fn(),
      uniform2f: jest.fn(),
      uniform3f: jest.fn(),
      uniform4f: jest.fn()
    };

    engine.gl = gl;
    engine.currentProgram = {};
    engine.canvas = { width: 1440, height: 2560 };
    engine.textures = {};
    engine.uniforms = {
      flameSpeed: 'flameSpeed',
      flameIntensity: 'flameIntensity',
      flameBrightness: 'flameBrightness',
      frameThickness: 'frameThickness',
      resolution: 'resolution',
      noiseOctaves: 'noiseOctaves',
      pulseAmount: 'pulseAmount',
      pulseSpeed: 'pulseSpeed',
      layerCount: 'layerCount',
      smokeSpeed: 'smokeSpeed'
    };
    engine.config = {
      flameColor: '#000000',
      flameSpeed: 0,
      flameIntensity: 0,
      flameBrightness: 0,
      frameThickness: 0,
      highDPI: true,
      frameMode: 'bottom',
      animationEasing: 'linear',
      noiseOctaves: 0,
      pulseAmount: 0,
      pulseSpeed: 0,
      layerCount: 0,
      smokeSpeed: 0
    };

    engine.updateUniforms();

    expect(gl.uniform1f).toHaveBeenCalledWith('flameSpeed', 0);
    expect(gl.uniform1f).toHaveBeenCalledWith('flameIntensity', 0);
    expect(gl.uniform1f).toHaveBeenCalledWith('flameBrightness', 0);
    expect(gl.uniform1f).toHaveBeenCalledWith('frameThickness', 0);
    expect(gl.uniform1i).toHaveBeenCalledWith('noiseOctaves', 0);
    expect(gl.uniform1f).toHaveBeenCalledWith('pulseAmount', 0);
    expect(gl.uniform1f).toHaveBeenCalledWith('pulseSpeed', 0);
    expect(gl.uniform1i).toHaveBeenCalledWith('layerCount', 0);
    expect(gl.uniform1f).toHaveBeenCalledWith('smokeSpeed', 0);

    gl.uniform1f.mockClear();
    engine.config.frameThickness = 150;
    engine.updateUniforms();

    expect(gl.uniform1f).toHaveBeenCalledWith('frameThickness', 300);
  });

  test('render resolution is capped by the framebuffer budget while canvas CSS fills its host', () => {
    const { EffectsEngine } = loadEffectsEngine({
      window: { devicePixelRatio: 2 }
    });
    const engine = Object.create(EffectsEngine.prototype);
    engine.canvas = { style: {} };
    engine.gl = {
      MAX_TEXTURE_SIZE: 'MAX_TEXTURE_SIZE',
      getParameter: jest.fn(() => 16384),
      viewport: jest.fn()
    };
    engine.config = {
      highDPI: true,
      qualityMode: 'obs-safe',
      resolutionPreset: '4k-landscape'
    };
    engine.postProcessor = null;
    engine.updateUniforms = jest.fn();

    engine.handleResize();

    expect(engine.canvas.width * engine.canvas.height).toBeLessThanOrEqual(16 * 1024 * 1024);
    expect(engine.canvas.style.width).toBe('100%');
    expect(engine.canvas.style.height).toBe('100%');
    expect(engine.gl.viewport).toHaveBeenCalledWith(0, 0, engine.canvas.width, engine.canvas.height);
  });

  test('framePositions are converted from top-left percentages into shader pixel rects', () => {
    const { EffectsEngine } = loadEffectsEngine();
    const engine = Object.create(EffectsEngine.prototype);
    engine.canvas = { width: 1000, height: 2000 };
    engine.config = {
      framePositions: [{ x: 10, y: 20, width: 30, height: 40 }]
    };

    expect(typeof EffectsEngine.prototype.getActiveFrameRectPixels).toBe('function');
    expect(engine.getActiveFrameRectPixels()).toEqual({
      x: 100,
      y: 800,
      width: 300,
      height: 800
    });
  });

  test('shader animations derive effect UVs from the active frame rectangle', () => {
    const content = fs.readFileSync(effectsEnginePath, 'utf8');

    expect(content).toContain('vec2 effectUv = clamp(pixelPos / frameResolution, 0.0, 1.0);');
    expect(content).toContain('vec2 flameUv = effectUv;');
    expect(content).toContain('vec2 smokePos = effectUv;');
    expect(content).toContain('gl_FragColor = renderEnergyWaves(effectUv, pixelPos, edgeDist);');
    expect(content).toContain('gl_FragColor = renderLightning(effectUv, pixelPos, edgeDist);');
  });

  test('flame easing preserves continuous animation time and pulse changes visible output', () => {
    const content = fs.readFileSync(effectsEnginePath, 'utf8');

    expect(content).toContain('float easedCycleTime(float timeValue, int easingType)');
    expect(content).toContain('return (cycle + applyEasing(phase, easingType)) * 10.0;');
    expect(content).toContain('timeAdjusted = easedCycleTime(timeAdjusted, uAnimationEasing);');
    expect(content).toContain('float pulseWave = uPulseEnabled ? sin(uTime * uPulseSpeed) * uPulseAmount : 0.0;');
    expect(content).toContain('result.rgb *= pulseBrightness;');
    expect(content).toContain('result.a *= pulseAlpha;');
  });

  test('texture placeholders receive filter and wrap immediately and keep fallback on image errors', () => {
    const images = [];
    class MockImage {
      constructor() {
        images.push(this);
      }

      set src(value) {
        this._src = value;
      }
    }
    const { EffectsEngine } = loadEffectsEngine({ Image: MockImage });
    const engine = Object.create(EffectsEngine.prototype);
    const texture = { id: 'texture' };
    const gl = {
      TEXTURE_2D: 'TEXTURE_2D',
      RGBA: 'RGBA',
      UNSIGNED_BYTE: 'UNSIGNED_BYTE',
      TEXTURE_MIN_FILTER: 'TEXTURE_MIN_FILTER',
      TEXTURE_MAG_FILTER: 'TEXTURE_MAG_FILTER',
      TEXTURE_WRAP_S: 'TEXTURE_WRAP_S',
      TEXTURE_WRAP_T: 'TEXTURE_WRAP_T',
      LINEAR: 'LINEAR',
      REPEAT: 'REPEAT',
      createTexture: jest.fn(() => texture),
      bindTexture: jest.fn(),
      texImage2D: jest.fn(),
      texParameteri: jest.fn()
    };

    engine.gl = gl;
    engine.textures = {};
    engine.loadTexture('/missing.png', 'noise', gl.LINEAR, gl.REPEAT);

    expect(gl.texParameteri).toHaveBeenCalledWith(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    expect(gl.texParameteri).toHaveBeenCalledWith(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    expect(gl.texParameteri).toHaveBeenCalledWith(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    expect(gl.texParameteri).toHaveBeenCalledWith(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    expect(typeof images[0].onerror).toBe('function');

    images[0].onerror(new Error('missing'));
    expect(engine.textures.noise).toBe(texture);
  });

  test('destroy cancels render loops, timers, socket listeners, DOM listeners, and WebGL resources', () => {
    const clearTimeoutMock = jest.fn();
    const cancelAnimationFrameMock = jest.fn();
    const { EffectsEngine, context } = loadEffectsEngine({
      clearTimeout: clearTimeoutMock,
      cancelAnimationFrame: cancelAnimationFrameMock
    });
    const engine = Object.create(EffectsEngine.prototype);
    const resizeHandler = jest.fn();
    const beforeUnloadHandler = jest.fn();
    const lostHandler = jest.fn();
    const restoredHandler = jest.fn();
    const socketHandler = jest.fn();
    const gl = {
      deleteBuffer: jest.fn(),
      deleteTexture: jest.fn(),
      deleteProgram: jest.fn()
    };

    engine.animationFrameId = 10;
    engine.revertAnimationId = 11;
    engine.triggerTimers = new Map([['trigger', 12]]);
    engine.revertTimeouts = [13];
    engine.socket = { off: jest.fn(), disconnect: jest.fn() };
    engine.socketListeners = [['flame-overlay:trigger', socketHandler]];
    engine.resizeHandler = resizeHandler;
    engine.beforeUnloadHandler = beforeUnloadHandler;
    engine.contextLostHandler = lostHandler;
    engine.contextRestoredHandler = restoredHandler;
    engine.canvas = { removeEventListener: jest.fn() };
    engine.postProcessor = { destroy: jest.fn() };
    engine.gl = gl;
    engine.buffers = { position: 'position-buffer' };
    engine.textures = { noise: 'noise-texture' };
    engine.programs = { flames: 'flames-program' };
    const socket = engine.socket;
    const postProcessor = engine.postProcessor;

    expect(typeof EffectsEngine.prototype.destroy).toBe('function');
    engine.destroy();

    expect(cancelAnimationFrameMock).toHaveBeenCalledWith(10);
    expect(cancelAnimationFrameMock).toHaveBeenCalledWith(11);
    expect(clearTimeoutMock).toHaveBeenCalledWith(12);
    expect(clearTimeoutMock).toHaveBeenCalledWith(13);
    expect(socket.off).toHaveBeenCalledWith('flame-overlay:trigger', socketHandler);
    expect(socket.disconnect).toHaveBeenCalled();
    expect(context.window.removeEventListener).toHaveBeenCalledWith('resize', resizeHandler);
    expect(context.window.removeEventListener).toHaveBeenCalledWith('beforeunload', beforeUnloadHandler);
    expect(engine.canvas.removeEventListener).toHaveBeenCalledWith('webglcontextlost', lostHandler);
    expect(engine.canvas.removeEventListener).toHaveBeenCalledWith('webglcontextrestored', restoredHandler);
    expect(postProcessor.destroy).toHaveBeenCalled();
    expect(gl.deleteBuffer).toHaveBeenCalledWith('position-buffer');
    expect(gl.deleteTexture).toHaveBeenCalledWith('noise-texture');
    expect(gl.deleteProgram).toHaveBeenCalledWith('flames-program');
  });
});

describe('Flame Overlay post processor behavior', () => {
  test('isReady returns false when any tracked framebuffer is incomplete', () => {
    const PostProcessor = loadPostProcessor();
    const postProcessor = Object.create(PostProcessor.prototype);
    postProcessor.framebuffers = {
      scene: { id: 'scene' },
      bright: { id: 'bright' },
      blur1: { id: 'blur1' },
      blur2: { id: 'blur2' }
    };
    postProcessor.framebufferComplete = {
      scene: true,
      bright: true,
      blur1: false,
      blur2: true
    };
    postProcessor.programs = {
      extractBright: {},
      kawaseBlur: {},
      composite: {}
    };

    expect(postProcessor.isReady()).toBe(false);
  });

  test('applyBloom clamps excessive bloom radius to a bounded pass count', () => {
    const PostProcessor = loadPostProcessor();
    const postProcessor = Object.create(PostProcessor.prototype);
    const gl = {
      canvas: { width: 800, height: 600 },
      TEXTURE0: 0,
      TEXTURE_2D: 'TEXTURE_2D',
      useProgram: jest.fn(),
      activeTexture: jest.fn(),
      bindTexture: jest.fn(),
      getUniformLocation: jest.fn((program, name) => name),
      uniform1i: jest.fn(),
      uniform1f: jest.fn(),
      uniform2f: jest.fn(),
      disable: jest.fn()
    };

    postProcessor.gl = gl;
    postProcessor.bloomWidth = 400;
    postProcessor.bloomHeight = 300;
    postProcessor.programs = {
      extractBright: { id: 'extract' },
      kawaseBlur: { id: 'blur' }
    };
    postProcessor.textures = {
      bright: 'bright-texture',
      blur1: 'blur1-texture',
      blur2: 'blur2-texture'
    };
    postProcessor.renderToFramebuffer = jest.fn((name, callback) => callback());
    postProcessor.drawQuad = jest.fn();

    postProcessor.applyBloom('scene-texture', {
      bloomThreshold: 0,
      bloomRadius: 99
    });

    expect(postProcessor.renderToFramebuffer).toHaveBeenCalledTimes(9);
  });
});
