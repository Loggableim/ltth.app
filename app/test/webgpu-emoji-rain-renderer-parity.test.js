const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = path.join(__dirname, '..');
const CORE_PATH = path.join(APP, 'plugins', 'webgpu-emoji-rain', 'gpu', 'webgpu-emoji-engine.js');
const ADAPTER_PATH = path.join(APP, 'plugins', 'webgpu-emoji-rain', 'gpu', 'engine.js');
const read = filePath => fs.readFileSync(filePath, 'utf8');
const flushAsyncWork = () => new Promise(resolve => setImmediate(resolve));

function loadCore() {
  const context = vm.createContext({
    navigator: {},
    performance: { now: () => 0 },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    addEventListener: jest.fn(),
    setTimeout,
    clearTimeout,
    console
  });
  vm.runInContext(read(CORE_PATH), context);
  return context.WebGPUEmojiEngine;
}

async function loadAdapter({ mappings = {} } = {}) {
  const socketHandlers = {};
  const socket = {
    connected: true,
    on: jest.fn((eventName, handler) => {
      socketHandlers[eventName] = handler;
    }),
    emit: jest.fn()
  };

  class FakeRenderer {
    constructor(canvas, options) {
      this.canvas = canvas;
      this.options = options;
      this.spawn = jest.fn().mockResolvedValue(1);
      this.clear = jest.fn();
      this.configure = jest.fn();
      this.destroy = jest.fn();
      this.setPaused = jest.fn();
      this.setSpeed = jest.fn();
      this.setBoundingBox = jest.fn();
      this.setTheme = jest.fn();
    }

    async init() {
      return true;
    }
  }

  const elements = new Map();
  const getElement = id => {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        dataset: {},
        style: {},
        classList: { add: jest.fn(), remove: jest.fn() },
        textContent: ''
      });
    }
    return elements.get(id);
  };

  const contextObject = {
    WebGPUEmojiEngine: FakeRenderer,
    fetch: jest.fn(async url => ({
      ok: true,
      json: async () => url.includes('user-mappings')
        ? { success: true, mappings }
        : {
            success: true,
            config: {
              enabled: true,
              obs_hud_enabled: true,
              emoji_lifetime_ms: 7600,
              heart_balloon_profile_every: 5,
              heart_balloon_pop_y: 0.5,
              heart_balloon_wind_strength: 0.45
            }
          }
    })),
    io: jest.fn(() => socket),
    document: {
      readyState: 'complete',
      body: { dataset: {}, style: {}, classList: { add: jest.fn(), remove: jest.fn() } },
      getElementById: getElement,
      addEventListener: jest.fn()
    },
    location: { pathname: '/webgpu-emoji-rain/obs-hud', search: '' },
    performance: { now: () => 1000 },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    addEventListener: jest.fn(),
    setTimeout,
    clearTimeout,
    console
  };
  contextObject.window = contextObject;
  contextObject.globalThis = contextObject;

  const context = vm.createContext(contextObject);
  vm.runInContext(read(ADAPTER_PATH), context);
  await flushAsyncWork();
  await flushAsyncWork();

  return {
    context,
    renderer: context.__webgpuEmojiRain.renderer,
    socket,
    socketHandlers
  };
}

describe('WebGPU EmojiRain renderer parity', () => {
  test('core controls mutate live simulation state instead of inert adapter fields', () => {
    const WebGPUEmojiEngine = loadCore();
    const engine = new WebGPUEmojiEngine({}, { config: { max_emojis_on_screen: 320 } });

    for (const method of ['setPaused', 'setSpeed', 'setBoundingBox', 'setTheme', 'recordDropped']) {
      expect(typeof engine[method]).toBe('function');
    }

    engine.setPaused(true);
    expect(engine.paused).toBe(true);
    engine.setPaused(false);
    expect(engine.paused).toBe(false);

    engine.setSpeed(2.5);
    expect(engine.speed ?? engine.simulationSpeed ?? engine.config.speed).toBeCloseTo(2.5);

    const boundingBox = { x: 0.1, y: 0.2, width: 0.7, height: 0.6 };
    engine.setBoundingBox(boundingBox);
    expect(engine.boundingBox).toEqual(boundingBox);

    engine.setTheme('neon');
    expect(engine.theme ?? engine.config.theme).toBe('neon');

    const before = engine.droppedParticles;
    engine.recordDropped(3, 'particle-budget');
    expect(engine.droppedParticles).toBe(before + 3);
  });

  test('gift, balloon, sticker, profile and superfan remain distinct GPU spawn kinds', async () => {
    const WebGPUEmojiEngine = loadCore();
    const engine = new WebGPUEmojiEngine({}, { config: { max_emojis_on_screen: 320 } });
    engine.running = true;
    engine.logicalWidth = 1920;
    engine.logicalHeight = 1080;
    engine.ensureAsset = jest.fn().mockResolvedValue(0);
    engine._writeParticle = jest.fn();

    const kinds = ['gift', 'balloon', 'sticker', 'profile', 'superfan'];
    const encodedKinds = [];
    for (const kind of kinds) {
      engine._writeParticle.mockClear();
      await engine.spawn({ asset: '⭐', count: 1, kind });
      expect(engine._writeParticle).toHaveBeenCalledTimes(1);
      encodedKinds.push(engine._writeParticle.mock.calls[0][0].kind);
    }

    expect(new Set(encodedKinds).size).toBe(kinds.length);
  });

  test('particle ABI keeps the random seed out of the transient impact pulse slot', () => {
    const WebGPUEmojiEngine = loadCore();
    const engine = new WebGPUEmojiEngine({}, { config: { max_emojis_on_screen: 320 } });
    engine.logicalWidth = 1920;
    engine.logicalHeight = 1080;
    const command = engine._createSpawnCommand({ kind: 'gift', x: 0.5, y: 0.5, size: 96 }, 0, 4, false, 0, 1);
    command.seed = 8192;

    const encoded = engine._encodeParticle(command);
    const floats = new Float32Array(encoded);

    expect(floats[11]).toBe(0);
    expect(floats[26]).toBe(8192);
  });

  test('particle buffer capacity stays fixed and safe across hot config changes', () => {
    const WebGPUEmojiEngine = loadCore();
    const engine = new WebGPUEmojiEngine({}, { config: { max_emojis_on_screen: 128 } });
    const getCapacity = () => engine.particleCapacity ?? engine.capacity ?? engine.bufferCapacity;
    const initialCapacity = getCapacity();

    expect(Number.isFinite(initialCapacity)).toBe(true);
    expect(initialCapacity).toBeGreaterThanOrEqual(128);

    engine.configure({ max_emojis_on_screen: 4096 });
    expect(getCapacity()).toBe(initialCapacity);
    expect(engine.maxParticles).toBeLessThanOrEqual(initialCapacity);

    engine.configure({ max_emojis_on_screen: 64 });
    expect(getCapacity()).toBe(initialCapacity);
    expect(engine.maxParticles).toBeLessThanOrEqual(initialCapacity);
  });

  test('adapter forwards overlay controls into the live WebGPU core', async () => {
    const { renderer, socketHandlers } = await loadAdapter();

    socketHandlers['webgpu-emoji-rain:pause']({ paused: true });
    socketHandlers['webgpu-emoji-rain:resume']({ paused: false });
    socketHandlers['webgpu-emoji-rain:speed']({ speed: 2.25 });
    socketHandlers['webgpu-emoji-rain:theme']({ theme: 'neon' });
    socketHandlers['webgpu-emoji-rain:bounding-box']({
      boundingBox: { x: 0.1, y: 0.15, width: 0.75, height: 0.7 }
    });

    expect(renderer.setPaused).toHaveBeenNthCalledWith(1, true);
    expect(renderer.setPaused).toHaveBeenNthCalledWith(2, false);
    expect(renderer.setSpeed).toHaveBeenCalledWith(2.25);
    expect(renderer.setTheme).toHaveBeenCalledWith('neon');
    expect(renderer.setBoundingBox).toHaveBeenCalledWith({ x: 0.1, y: 0.15, width: 0.75, height: 0.7 });
  });

  test('adapter preserves gift, sticker, profile and superfan semantics', async () => {
    const { renderer, socketHandlers } = await loadAdapter({ mappings: { alice: '{{profilePicture}}' } });

    socketHandlers['webgpu-emoji-rain:gift-balls']({ giftImageUrl: 'https://p16-webcast.tiktokcdn.com/catalog-gift.gif', count: 1, size: 120 });
    socketHandlers['webgpu-emoji-rain:spawn']({ emoji: '/sticker.webp', reason: 'sticker', count: 1 });
    socketHandlers['webgpu-emoji-rain:spawn']({ emoji: '💙', username: 'alice', profilePictureUrl: 'https://p16.tiktokcdn.com/alice.webp', count: 1 });
    socketHandlers['webgpu-emoji-rain:spawn']({ emoji: '🔥', reason: 'gift', burst: true, count: 1 });
    await flushAsyncWork();

    const spawns = renderer.spawn.mock.calls.map(([options]) => options);
    expect(spawns).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'gift', asset: '/api/webgpu-emoji-rain/asset?url=https%3A%2F%2Fp16-webcast.tiktokcdn.com%2Fcatalog-gift.gif' }),
      expect.objectContaining({ kind: 'sticker', asset: '/sticker.webp' }),
      expect.objectContaining({ kind: 'profile', asset: '/api/webgpu-emoji-rain/avatar?url=https%3A%2F%2Fp16.tiktokcdn.com%2Falice.webp' }),
      expect.objectContaining({ kind: 'superfan', asset: '🔥' })
    ]));
  });

  test('profile-picture mappings fall back to a real glyph when the avatar is missing', async () => {
    const { renderer, socketHandlers } = await loadAdapter({ mappings: { alice: '{{profilePicture}}' } });

    socketHandlers['webgpu-emoji-rain:spawn']({ emoji: '💙', username: 'alice', profilePictureUrl: null, count: 1 });
    await flushAsyncWork();

    expect(renderer.spawn).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'profile',
      asset: '👤'
    }));
  });

  test('automatically renders a live-event profile picture when no user mapping exists', async () => {
    const { renderer, socketHandlers } = await loadAdapter();

    socketHandlers['webgpu-emoji-rain:spawn']({
      emoji: '💙',
      username: 'live-viewer',
      profilePictureUrl: 'https://p16-common-sign.tiktokcdn-eu.com/live-viewer.webp',
      reason: 'follow',
      source: 'event:follow',
      count: 1
    });
    await flushAsyncWork();

    expect(renderer.spawn).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'profile',
      asset: '/api/webgpu-emoji-rain/avatar?url=https%3A%2F%2Fp16-common-sign.tiktokcdn-eu.com%2Flive-viewer.webp'
    }));
  });

  test('heart balloons use every-fifth profile placement, spread and pop physics payloads', async () => {
    const { renderer, socketHandlers } = await loadAdapter();

    socketHandlers['webgpu-emoji-rain:heart-balloons']({
      count: 5,
      x: 0.5,
      profilePictureUrl: '/viewer.webp',
      profileEvery: 5,
      popY: 0.42,
      windStrength: 0.7,
      heartColor: '#ff4d8d'
    });
    await flushAsyncWork();
    await flushAsyncWork();

    const hearts = renderer.spawn.mock.calls.map(([options]) => options);
    expect(hearts).toHaveLength(5);
    expect(hearts.slice(0, 4)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'balloon' })
    ]));
    expect(hearts.slice(0, 4).every(options => options.kind === 'balloon')).toBe(true);
    expect(hearts[4]).toEqual(expect.objectContaining({ kind: 'profile', asset: '/viewer.webp' }));
    expect(new Set(hearts.map(options => options.x)).size).toBeGreaterThan(1);
    for (const options of hearts) {
      expect(options).toEqual(expect.objectContaining({ popY: 0.42, windStrength: 0.7 }));
    }
  });

  test('core contains executable GPU timestamp, spawn-command and visual shader contracts', () => {
    const source = read(CORE_PATH);

    expect(source).toMatch(/createQuerySet\s*\(/);
    expect(source).toMatch(/resolveQuerySet\s*\(/);
    expect(source).toMatch(/timestampWrites|writeTimestamp\s*\(/);
    expect(source).toMatch(/spawnCommandBuffer/);
    expect(source).toMatch(/pendingSpawnCommands|spawnCommands/);
    expect(source).not.toMatch(/queue\.writeBuffer\(this\.particleBuffer,\s*slot\s*\*/);

    for (const contract of [
      /colorMode|color_mode|colorShift/i,
      /rainbowEnabled|rainbow_enabled|rainbowMode/i,
      /pixelSize|pixel_size|pixelEnabled/i,
      /shadowStrength|shadowBlur|shadowEnabled|softShadow/i,
      /popY|popHeight|balloonPop/i
    ]) {
      expect(source).toMatch(contract);
    }
  });
});
