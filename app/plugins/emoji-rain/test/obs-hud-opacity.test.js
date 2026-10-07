const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const EmojiRainPlugin = require('../main');

const rendererPath = path.resolve(__dirname, '../../../public/js/emoji-rain-obs-hud.js');
const rendererSource = fs.readFileSync(rendererPath, 'utf8');

function createHarness(stateResponse = { success: true, state: { opacity: 0.4 } }, options = {}) {
  const capturedConsole = [];
  const virtualConsole = new VirtualConsole();
  ['log', 'info', 'warn', 'error'].forEach(level => {
    virtualConsole.on(level, (...args) => {
      const line = args.map(arg => typeof arg === 'string' ? arg : '[object]').join(' ')
        .replace(/https?:\/\/\S+/g, '[external-url]')
        .slice(0, 240);
      capturedConsole.push(line);
    });
  });
  const dom = new JSDOM('<!doctype html><html><body><div id="canvas-container"></div><div id="resolution-indicator"></div><div id="perf-resolution"></div><div id="perf-hud"></div></body></html>', {
    runScripts: 'outside-only',
    url: 'http://localhost/emoji-rain/obs-hud',
    virtualConsole
  });
  const { window } = dom;
  const eventHandlers = new Map();
  const requestedUrls = [];
  const externalImageSources = [];
  const disconnect = jest.fn();
  const io = jest.fn(() => socket);
  const cancelAnimationFrame = jest.fn();
  const clearInterval = jest.fn();
  const socket = {
    on: jest.fn((name, handler) => eventHandlers.set(name, handler)),
    disconnect
  };
  const world = { bodies: [] };
  const matter = {
    Engine: { create: () => ({ gravity: {}, world }) },
    Render: {},
    World: { add: jest.fn((target, bodies) => target.bodies.push(...(Array.isArray(bodies) ? bodies : [bodies]))) },
    Bodies: {
      rectangle: (...args) => ({ args, vertices: [] }),
      circle: (...args) => ({ args, vertices: [] })
    },
    Body: { setPosition: jest.fn(), setVertices: jest.fn(), setVelocity: jest.fn() },
    Events: { on: jest.fn() }
  };

  window.Matter = matter;
  window.io = io;
  window.requestAnimationFrame = jest.fn(() => 19);
  window.cancelAnimationFrame = cancelAnimationFrame;
  window.setInterval = jest.fn(() => 29);
  window.clearInterval = clearInterval;
  const imageSrcDescriptor = Object.getOwnPropertyDescriptor(window.HTMLImageElement.prototype, 'src');
  Object.defineProperty(window.HTMLImageElement.prototype, 'src', {
    configurable: true,
    get() { return imageSrcDescriptor.get.call(this); },
    set(value) {
      if (/^https?:\/\//i.test(String(value))) externalImageSources.push(String(value));
      imageSrcDescriptor.set.call(this, value);
    }
  });
  window.fetch = jest.fn(async (url) => {
    requestedUrls.push(url);
    if (url === '/api/emoji-rain/overlay/state') {
      return { ok: true, json: async () => await stateResponse };
    }
    if (url === '/api/emoji-rain/config') {
      return { ok: true, json: async () => await (options.configResponse || { success: true, config: options.config || {} }) };
    }
    if (url === '/api/emoji-rain/user-mappings') {
      return { ok: true, json: async () => await (options.mappingsResponse || { success: true, mappings: {} }) };
    }
    throw new Error(`Unexpected URL: ${url}`);
  });
  window.eval(rendererSource);

  return {
    dom,
    window,
    eventHandlers,
    requestedUrls,
    capturedConsole,
    externalImageSources,
    disconnect,
    io,
    cancelAnimationFrame,
    clearInterval,
    container: window.document.getElementById('canvas-container')
  };
}

function createProducerPayload(params) {
  const api = {
    getSocketIO: () => ({}),
    getPluginDataDir: () => '/isolated/emoji-rain-fixture',
    getConfigPathManager: () => ({ getUserConfigsDir: () => '/isolated/emoji-rain-fixture-config' }),
    getDatabase: () => ({ getEmojiRainConfig: () => ({ enabled: true, max_count_per_event: 100, emoji_set: ['💙'] }) }),
    emit: jest.fn(),
    log: jest.fn()
  };
  const plugin = new EmojiRainPlugin(api);
  const spawn = plugin.triggerEmojiRain({ emoji: '💙', x: 0.5, y: 0.2, reason: 'manual', ...params });
  return { spawn, emitted: api.emit.mock.calls[0] };
}

async function settleStartup() {
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
}

describe('EmojiRain OBS HUD opacity contract', () => {
  test('applies the initial public state to the actual canvas container, then applies the existing event', async () => {
    const harness = createHarness();
    await settleStartup();

    expect(harness.requestedUrls).toContain('/api/emoji-rain/overlay/state');
    expect(harness.container.style.opacity).toBe('0.4');
    expect(harness.eventHandlers.has('emoji-rain:opacity')).toBe(true);

    harness.eventHandlers.get('emoji-rain:opacity')({ opacity: 0.75 });
    expect(harness.container.style.opacity).toBe('0.75');
    harness.dom.window.close();
  });

  test('ignores invalid, non-finite, out-of-range, and private event payloads', async () => {
    const harness = createHarness();
    await settleStartup();
    const onOpacity = harness.eventHandlers.get('emoji-rain:opacity');

    [null, '0.1', [], {}, { opacity: '0.2' }, { opacity: NaN }, { opacity: Infinity },
      { opacity: -0.01 }, { opacity: 1.01 }, { opacity: 0.2, username: 'private-viewer' }]
      .forEach(payload => onOpacity(payload));

    expect(harness.container.style.opacity).toBe('0.4');
    expect(harness.container.textContent).toBe('');
    harness.dom.window.close();
  });

  test('keeps a newer socket value when the initial state response arrives late', async () => {
    let resolveState;
    const delayedState = new Promise(resolve => { resolveState = resolve; });
    const harness = createHarness(delayedState);
    await new Promise(resolve => setImmediate(resolve));

    harness.eventHandlers.get('emoji-rain:opacity')({ opacity: 0.85 });
    resolveState({ success: true, state: { opacity: 0.3 } });
    await settleStartup();

    expect(harness.container.style.opacity).toBe('0.85');
    harness.dom.window.close();
  });

  test('uses visible opacity 1 on invalid state and prevents late events after pagehide', async () => {
    const harness = createHarness({ success: true, state: { opacity: '0.2' } });
    await settleStartup();
    expect(harness.container.style.opacity).toBe('1');

    harness.window.dispatchEvent(new harness.window.Event('pagehide'));
    harness.eventHandlers.get('emoji-rain:opacity')({ opacity: 0 });
    expect(harness.container.style.opacity).toBe('1');
    expect(harness.disconnect).toHaveBeenCalledTimes(1);
    expect(harness.clearInterval).toHaveBeenCalledTimes(1);
    expect(harness.cancelAnimationFrame).toHaveBeenCalledWith(19);
    harness.dom.window.close();
  });

  test('rejects hostile producer-shaped counts before DOM or external image effects', async () => {
    const harness = createHarness(undefined, { config: { rate_limit_enabled: false } });
    await settleStartup();
    const emitSpawn = harness.eventHandlers.get('emoji-rain:spawn');
    const hostileProfile = {
      emoji: '{{profilePicture}}',
      x: 0.5,
      y: 0.2,
      username: 'fixture-private-viewer',
      profilePictureUrl: 'https://assets.invalid/fixture-private-avatar.png',
      reason: 'manual',
      source: 'manual',
      burst: false,
      intensity: 1
    };

    const producerOutput = createProducerPayload({ count: -1 });
    expect(producerOutput.emitted[0]).toBe('emoji-rain:spawn');
    expect(producerOutput.spawn.count).toBe(-1);
    emitSpawn(producerOutput.emitted[1]);

    [-1, NaN, Infinity, -Infinity, null, '20'].forEach(count => emitSpawn({ ...hostileProfile, count }));

    expect(harness.container.children.length).toBe(0);
    expect(harness.externalImageSources).toEqual([]);
    expect(harness.container.textContent).not.toContain('fixture-private-viewer');
    expect(harness.container.textContent).not.toContain('fixture-private-avatar');
    expect(harness.capturedConsole.every(line => line.length <= 240)).toBe(true);
    harness.dom.window.close();
  });

  test('bounds a very large finite count to the renderer queue contract', async () => {
    const harness = createHarness(undefined, { config: { rate_limit_enabled: false } });
    await settleStartup();
    harness.eventHandlers.get('emoji-rain:spawn')({
      count: Number.MAX_SAFE_INTEGER,
      emoji: '💙',
      x: 0.5,
      y: 0.1,
      username: null,
      profilePictureUrl: null,
      reason: 'manual',
      source: 'manual',
      burst: false,
      intensity: 1
    });

    expect(harness.container.querySelectorAll('.emoji-sprite')).toHaveLength(500);
    expect(harness.externalImageSources).toEqual([]);
    expect(harness.capturedConsole.every(line => line.length <= 240)).toBe(true);
    harness.dom.window.close();
  });

  test.each(['configResponse', 'mappingsResponse'])('does not reactivate after a delayed %s response', async responseKind => {
    let resolveResponse;
    const response = new Promise(resolve => { resolveResponse = resolve; });
    const options = { [responseKind]: response };
    const harness = createHarness(undefined, options);
    await new Promise(resolve => setImmediate(resolve));

    if (responseKind === 'configResponse') {
      expect(harness.requestedUrls).toContain('/api/emoji-rain/config');
    } else {
      options.configResponse = { success: true, config: {} };
      // The config request was already fulfilled with its default; wait for the mappings read.
      await new Promise(resolve => setImmediate(resolve));
      expect(harness.requestedUrls).toContain('/api/emoji-rain/user-mappings');
    }

    harness.window.dispatchEvent(new harness.window.Event('pagehide'));
    resolveResponse(responseKind === 'configResponse'
      ? { success: true, config: { visual_mode: 'late-private-config' } }
      : { success: true, mappings: { 'late-private-viewer': 'javascript:alert(1)' } });
    await settleStartup();

    expect(harness.io).not.toHaveBeenCalled();
    expect(harness.window.requestAnimationFrame).not.toHaveBeenCalled();
    expect(harness.window.setInterval).not.toHaveBeenCalled();
    expect(harness.container.children.length).toBe(0);
    expect(harness.capturedConsole.every(line => line.length <= 240)).toBe(true);
    harness.dom.window.close();
  });

  test('cancels scheduled work once and ignores an already-copied spawn callback after pagehide', async () => {
    const harness = createHarness();
    await settleStartup();
    const queuedCallback = harness.eventHandlers.get('emoji-rain:spawn');
    harness.window.dispatchEvent(new harness.window.Event('pagehide'));
    harness.window.dispatchEvent(new harness.window.Event('beforeunload'));
    queuedCallback({ count: 1, emoji: '💙', x: 0.5, y: 0.2 });

    expect(harness.disconnect).toHaveBeenCalledTimes(1);
    expect(harness.clearInterval).toHaveBeenCalledTimes(1);
    expect(harness.cancelAnimationFrame).toHaveBeenCalledWith(19);
    expect(harness.container.querySelectorAll('.emoji-sprite')).toHaveLength(0);
    expect(harness.window.requestAnimationFrame).toHaveBeenCalledTimes(1);
    harness.dom.window.close();
  });
});
