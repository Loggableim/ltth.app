const fs = require('fs');
const path = require('path');

const pluginRoot = path.join(__dirname, '..', 'plugins', 'webgpu-fireworks');
const read = relative => fs.readFileSync(path.join(pluginRoot, relative), 'utf8');
const engineSource = read('gpu/webgpu-particle-engine.js');
const {
  ALLOWED_VISUAL_STYLES,
  DEFAULT_FIREWORKS_CONFIG,
  normalizeConfig,
  normalizeFireworkTrigger,
  normalizeGiftMapping
} = require('../plugins/webgpu-fireworks/lib/config-schema');
const { SpawnPlanner, distance } = require('../plugins/webgpu-fireworks/lib/spawn-planner');
const WebGPUParticleEngine = require('../plugins/webgpu-fireworks/gpu/webgpu-particle-engine');
const FireworksPlugin = require('../plugins/webgpu-fireworks/main');
const { AudioManager } = require('../plugins/webgpu-fireworks/gpu/engine');

describe('WebGPU Fireworks quality parity', () => {
  test('normalizes global and gift-specific visual styles', () => {
    expect(ALLOWED_VISUAL_STYLES).toEqual(['premium-hybrid', 'realistic', 'stylized-neon']);
    expect(normalizeConfig({}).visualStyle).toBe('premium-hybrid');
    expect(normalizeConfig({ visualStyle: 'stylized-neon' }).visualStyle).toBe('stylized-neon');
    expect(normalizeConfig({ visualStyle: 'unknown' }).visualStyle).toBe('premium-hybrid');
    expect(normalizeGiftMapping({ giftId: '42', shape: 'star', visualStyle: 'realistic' }))
      .toMatchObject({ giftId: '42', shape: 'star', visualStyle: 'realistic' });
  });

  test('keeps exact trigger positions and marks missing positions as automatic', () => {
    const automatic = normalizeFireworkTrigger({ shape: 'heart' }, DEFAULT_FIREWORKS_CONFIG);
    expect(automatic).toMatchObject({ positionMode: 'auto', position: null, visualStyle: 'premium-hybrid' });
    const exact = normalizeFireworkTrigger({ position: { x: 0.2, y: 0.4 }, origin: { x: 0.8, y: 1 } });
    expect(exact).toMatchObject({
      positionMode: 'exact',
      position: { x: 0.2, y: 0.4 },
      origin: { x: 0.8, y: 1 }
    });
  });

  test('spreads automatic rockets across safe target and origin zones', () => {
    const planner = new SpawnPlanner();
    const plans = Array.from({ length: 20 }, (_, index) => planner.plan({ seed: index + 1, orientation: 'landscape', positionMode: 'auto' }));
    const cells = new Set(plans.map(plan => `${Math.floor(plan.position.x * 8)}:${Math.floor(plan.position.y * 8)}`));
    expect(cells.size).toBeGreaterThanOrEqual(10);
    for (let index = 1; index < plans.length; index++) {
      expect(Math.abs(plans[index].origin.x - plans[index - 1].origin.x)).toBeGreaterThan(0.04);
      expect(plans[index].position.x).toBeGreaterThanOrEqual(0.12);
      expect(plans[index].position.x).toBeLessThanOrEqual(0.88);
      expect(plans[index].position.y).toBeGreaterThanOrEqual(0.16);
      expect(plans[index].position.y).toBeLessThanOrEqual(0.62);
    }
    expect(distance(plans[0].position, plans[1].position)).toBeGreaterThanOrEqual(0.18);
  });

  test('creates deterministic finale lanes', () => {
    const first = new SpawnPlanner().planFinale(18, { seed: 1234, orientation: 'portrait' });
    const second = new SpawnPlanner().planFinale(18, { seed: 1234, orientation: 'portrait' });
    expect(first).toEqual(second);
    expect(new Set(first.map(plan => `${plan.position.x.toFixed(2)}:${plan.position.y.toFixed(2)}`)).size).toBe(18);
  });

  test.each([
    ['heart', 1, 36, 19],
    ['paws', 2, 9, 36],
    ['star', 3, 43, 19],
    ['ring', 4, 32, 16],
    ['spiral', 5, 14, 26]
  ])('%s keeps its own readable GPU sprite contract', (shape, shapeId, expectedCount, minimumSize) => {
    const engine = new WebGPUParticleEngine({ width: 1920, height: 1080 }, {});
    engine.initialized = true;
    engine.spawnExplosion({ shape, count: shape === 'paws' || shape === 'spiral' ? 100 : 1, colors: ['#ff00ff'], style: 'premium-hybrid' });
    const commands = engine.spawnQueue.filter(command => command.shape === shapeId);
    expect(commands.reduce((sum, command) => sum + command.count, 0)).toBe(expectedCount);
    expect(commands.every(command => command.size >= minimumSize)).toBe(true);
    expect(new Set(engine.spawnQueue.map(command => command.shape))).toEqual(new Set([shapeId]));
  });

  test('paw and spiral sprites start separated instead of forming an origin blob', () => {
    expect(engineSource).toContain('p.position += p.velocity * (0.22');
    expect(engineSource).toContain('p.size *= 0.82');
    expect(engineSource).toContain('p.position += p.velocity * 0.1');
  });

  test('burst never introduces star sprites and image particles retain native color', () => {
    const engine = new WebGPUParticleEngine({ width: 1920, height: 1080 }, {});
    engine.initialized = true;
    engine.spawnExplosion({ shape: 'burst', count: 30, colors: ['#ff0000'] });
    expect(engine.spawnQueue.some(command => command.shape === 3)).toBe(false);
    expect(engine.spawnQueue.filter(command => command.shape === 0 && ((command.flags >> 8) & 15) === 3)
      .reduce((sum, command) => sum + command.count, 0)).toBe(60);
    expect(engine.spawnQueue.some(command => command.shape === 0 && ((command.flags >> 8) & 15) === 2 && command.size >= 30)).toBe(true);
    expect(engineSource).toContain('p.size *= 0.62');
    engine.spawnQueue.length = 0;
    engine.spawnExplosion({ shape: 'image', count: 4, colors: ['#ffffff'], textureIndex: 2, nativeColor: true });
    expect(engine.spawnQueue.every(command => (command.flags & 1) === 1)).toBe(true);
  });

  test('spawns crackle particles only for an explicit crackling rocket and uses the requested lifetime', () => {
    const engine = new WebGPUParticleEngine({ width: 1920, height: 1080 }, {});
    engine.initialized = true;
    engine.spawnExplosion({ shape: 'heart', count: 36, colors: ['#ff0000'] });
    expect(engine.spawnQueue.some(command => ((command.flags >> 8) & 15) === 8)).toBe(false);
    engine.spawnCrackle({ origin: { x: 900, y: 400 }, colors: ['#ffffff'], intensity: 4, duration: 0.78 });
    const crackles = engine.spawnQueue.filter(command => ((command.flags >> 8) & 15) === 8);
    expect(crackles).toHaveLength(1);
    expect(crackles[0]).toMatchObject({ shape: 7, duration: 0.78, secondary: 0 });
  });

  test('decodes audio while the AudioContext is still suspended', async () => {
    class SuspendedAudioContext {
      constructor() { this.state = 'suspended'; this.destination = {}; }
      createGain() { return { gain: { value: 0 }, connect: jest.fn() }; }
      createDynamicsCompressor() {
        return {
          threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 }, attack: { value: 0 }, release: { value: 0 }, connect: jest.fn()
        };
      }
      decodeAudioData() { return Promise.resolve({ duration: 1 }); }
      resume() { return Promise.resolve(); }
      close() { return Promise.resolve(); }
    }
    const originalWindow = global.window;
    const originalFetch = global.fetch;
    global.window = { AudioContext: SuspendedAudioContext };
    global.fetch = jest.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
    try {
      const audio = new AudioManager();
      audio.init();
      await audio.preload('/sound.mp3', 'test');
      expect(audio.buffers.has('test')).toBe(true);
      expect(audio.getTelemetry()).toMatchObject({ loadedSounds: 1, audioStatus: 'locked' });
      audio.destroy();
    } finally {
      global.window = originalWindow;
      global.fetch = originalFetch;
    }
  });

  test('uses HTML audio when WebAudio remains locked', async () => {
    class LockedAudioContext {
      constructor() { this.state = 'suspended'; this.destination = {}; }
      createGain() { return { gain: { value: 0 }, connect: jest.fn() }; }
      createDynamicsCompressor() {
        return {
          threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 }, attack: { value: 0 }, release: { value: 0 }, connect: jest.fn()
        };
      }
      resume() { return Promise.resolve(); }
      close() { return Promise.resolve(); }
    }
    const play = jest.fn().mockResolvedValue(undefined);
    class HtmlAudio {
      constructor(url) { this.url = url; this.ended = false; }
      play() { return play(); }
      pause() {}
    }
    const originalWindow = global.window;
    const originalAudio = global.Audio;
    global.window = { AudioContext: LockedAudioContext };
    global.Audio = HtmlAudio;
    try {
      const audio = new AudioManager();
      audio.init();
      audio.urls.set('bang', '/bang.mp3');
      expect(await audio.play('bang', 1, 3, { offset: 0.88, maxDuration: 0.8 })).toBe(true);
      expect(play).toHaveBeenCalledTimes(1);
      expect(audio.htmlPools.get('bang')).toHaveLength(4);
      expect(audio.htmlPools.get('bang')[0].currentTime).toBe(0.88);
      expect(audio.getTelemetry()).toMatchObject({ audioBackend: 'html-audio', audioStatus: 'ready-html-audio', lastPlayed: 'bang' });
      audio.destroy();
    } finally {
      global.window = originalWindow;
      global.Audio = originalAudio;
    }
  });

  test('selects howl, whistle and crackling variants while keeping a separate synchronized bang', () => {
    const audio = new AudioManager();
    expect(audio.choose('small', 1, false, { seed: 1, crackleFrequency: 0.5 })).toMatchObject({
      launch: 'launch-basic', crackle: null, crackleProfile: null, launchWindow: null
    });
    expect(audio.choose('big', 6, false, { seed: 99, crackleFrequency: 0.5 })).toMatchObject({
      crackle: 'crackling-medium', crackleProfile: 'short', combo: 6
    });
    expect(audio.choose('massive', 1, false, { seed: 1, crackleFrequency: 0.5 })).toMatchObject({
      launch: 'combined-crackling-bang', bang: 'explosion-huge', crackle: 'crackling-long', crackleProfile: 'long', launchWindow: 4.55
    });
    expect(audio.choose('medium', 1, false, { seed: 1234, crackleFrequency: 0.5 })).toMatchObject({
      crackle: 'crackling-medium', crackleProfile: 'short'
    });
    expect(audio.choose('medium', 1, true, { seed: 1 })).toMatchObject({
      launch: null, bang: 'explosion-medium', crackle: null, crackleProfile: null, launchWindow: null
    });
    expect(audio.useConfiguredUrl('/plugins/webgpu-fireworks/audio/abschussgeraeusch.mp3', 'launch')).toBeNull();
    expect(audio.useConfiguredUrl('/plugins/webgpu-fireworks/audio/explosion_small1.mp3', 'bang')).toBeNull();
  });

  test('a launch recording with crackling always selects the matching visual and audio crackle profile', () => {
    const audio = new AudioManager();
    const random = jest.spyOn(Math, 'random')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.99)
      .mockReturnValue(0);
    try {
      expect(audio.choose('big', 1, false)).toMatchObject({
        launch: 'combined-crackling-bang',
        crackle: 'crackling-medium',
        launchWindow: 4.55
      });
    } finally {
      random.mockRestore();
    }
  });

  test('can force or suppress a crackling rocket without leaving a crackling launch behind', () => {
    const audio = new AudioManager();
    expect(audio.applyCrackleOverride({ launch: 'combined-crackling-bang', launchWindow: 4.55, crackle: 'crackling-long' }, false))
      .toMatchObject({ launch: 'launch-whistle', launchWindow: null, crackle: null, crackleProfile: null });
    const random = jest.spyOn(Math, 'random').mockReturnValue(0);
    try {
      expect(audio.applyCrackleOverride({ launch: 'launch-whistle', launchWindow: null, crackle: null }, true))
        .toMatchObject({ crackle: 'crackling-medium' });
    } finally {
      random.mockRestore();
    }
  });

  test('stops a combined WebAudio launch before its embedded bang', async () => {
    const stop = jest.fn();
    const start = jest.fn();
    class RunningAudioContext {
      constructor() { this.state = 'running'; this.currentTime = 10; this.destination = {}; }
      createGain() {
        return { gain: { value: 0, setValueAtTime: jest.fn(), linearRampToValueAtTime: jest.fn() }, connect: jest.fn() };
      }
      createDynamicsCompressor() {
        return {
          threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 }, attack: { value: 0 }, release: { value: 0 }, connect: jest.fn()
        };
      }
      createBufferSource() { return { connect: jest.fn(), start, stop }; }
      close() { return Promise.resolve(); }
    }
    const originalWindow = global.window;
    global.window = { AudioContext: RunningAudioContext };
    try {
      const audio = new AudioManager();
      audio.init();
      audio.buffers.set('combined-whistle-normal', { duration: 3.39 });
      await audio.play('combined-whistle-normal', 0.55, 1, { offset: 0.88, maxDuration: 1.4, fadeOutDuration: 0.08 });
      expect(start).toHaveBeenCalledWith(0, 0.88);
      expect(stop).toHaveBeenCalledWith(11.4);
      audio.destroy();
    } finally {
      global.window = originalWindow;
    }
  });

  test('imports stable settings once without importing legacy renderer capacity', async () => {
    const writes = new Map();
    const stable = {
      renderer: 'canvas', defaultShape: 'star', audioVolume: 0.25,
      rocketSound: '/plugins/fireworks/audio/abschussgeraeusch.mp3',
      maxTotalParticles: 1200
    };
    const api = {
      getPluginDataDir: () => path.join(__dirname, '.tmp-webgpu-fireworks'),
      getConfig: key => writes.get(key) || null,
      setConfig: (key, value) => { writes.set(key, value); return true; },
      getDatabase: () => ({ getSetting: key => key === 'plugin:fireworks:settings' ? JSON.stringify(stable) : null }),
      log: jest.fn()
    };
    const plugin = new FireworksPlugin(api);
    plugin.loadConfig();
    expect(await plugin.migrateFireworksSettings()).toBe(true);
    expect(plugin.config).toMatchObject({ renderer: 'webgpu', defaultShape: 'star', audioVolume: 0.25, maxTotalParticles: 8192 });
    expect(plugin.config.rocketSound).toContain('/plugins/webgpu-fireworks/audio/');
    expect(await plugin.migrateFireworksSettings()).toBe(false);
  });

  test('keeps every public config key connected to backend, runtime, or settings', () => {
    const consumers = [read('main.js'), read('lib/trigger-policy.js'), read('gpu/engine.js'), read('gpu/webgpu-particle-engine.js'), read('ui/settings.js')].join('\n');
    const missing = Object.keys(DEFAULT_FIREWORKS_CONFIG).filter(key => !new RegExp(`\\b${key}\\b`).test(consumers));
    expect(missing).toEqual([]);
  });

  test('resolves every automatic trigger through the configured color contract', () => {
    const api = { getPluginDataDir: () => __dirname, getConfig: () => null, setConfig: jest.fn(), getDatabase: () => null, log: jest.fn() };
    const plugin = new FireworksPlugin(api);
    plugin.config = { ...plugin.config, colorMode: 'theme', themeColors: ['#112233', '#AABBCC'] };
    expect(plugin.resolveConfiguredColors()).toEqual(['#112233', '#AABBCC']);
    expect(plugin.resolveConfiguredColors(['#FF00FF'])).toEqual(['#FF00FF']);
    plugin.config.colorMode = 'rainbow';
    expect(plugin.resolveConfiguredColors()).toHaveLength(5);
    plugin.config.colorMode = 'random';
    expect(plugin.resolveConfiguredColors()).toHaveLength(3);
    const main = read('main.js');
    expect(main).toContain('colors: this.resolveConfiguredColors(options.colors, effectiveConfig)');
    expect(main).not.toContain('colors: this.generateRandomColors(');
    expect(main).not.toContain('colors: this.config.themeColors');
  });

  test('exposes all three visual styles and gift overrides in settings', () => {
    const html = read('ui/settings.html');
    const source = read('ui/settings.js');
    for (const style of ALLOWED_VISUAL_STYLES) expect(html).toContain(`data-visual-style="${style}"`);
    expect(html).toContain('id="gift-style-override"');
    expect(source).toContain("positionMode: 'auto'");
    expect(source).toContain('/api/webgpu-fireworks/gift-mappings');
    expect(source).toContain('commitThemeColor(colorPicker.value)');
    expect(source).toContain('colors: getConfiguredPreviewColors()');
    expect(source).toContain('schedulePaletteUpdate(true)');
  });

  test('benchmark rockets use explicit safe bottom origins and stay silent', () => {
    const source = read('ui/settings.js');
    expect(source).toContain("origin: { x: Math.random() * 0.84 + 0.08, y: 1.04 }");
    expect(source).toContain("positionMode: 'exact'");
    expect(source).toContain('playSound: false');
    expect(source).toContain('particleSizeRange: [3, 10]');
    expect(source).toContain('particleSizeRange: [1, 4]');
    expect(source).not.toContain('particleSizeMin:');
    expect(source).not.toContain('particleSizeMax:');
  });

  test('keeps the canvas clickable while OBS audio still needs unlocking', () => {
    const source = read('gpu/engine.js');
    expect(source).toContain("const audioUnlock = this.config.audioEnabled !== false && this.audio.status === 'locked'");
    expect(source).toContain("const pointerEvents = clickTrigger || audioUnlock ? 'auto' : 'none'");
    expect(source).toContain('this.canvas.parentElement.style.pointerEvents = pointerEvents');
    expect(source).toContain('engine.applyInteractiveMode();');
    expect(source).toContain('Audio unlocked by canvas interaction');
  });
});
