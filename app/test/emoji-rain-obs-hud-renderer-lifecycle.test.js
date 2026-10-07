'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const Matter = require('matter-js');

const APP_ROOT = path.resolve(__dirname, '..');
const HTML_PATH = path.join(APP_ROOT, 'plugins/emoji-rain/obs-hud.html');
const SCRIPT_PATH = path.join(APP_ROOT, 'public/js/emoji-rain-obs-hud.js');
const ORIGIN = 'http://127.0.0.1:3000';

function makeSocket(connected = false) {
  const handlers = new Map();
  return {
    handlers,
    connected,
    emitted: [],
    disconnectCalls: 0,
    on(event, handler) {
      const list = handlers.get(event) || [];
      list.push(handler);
      handlers.set(event, list);
    },
    off(event, handler) {
      handlers.set(event, (handlers.get(event) || []).filter(candidate => candidate !== handler));
    },
    emit(event, payload) { this.emitted.push({ event, payload }); },
    deliver(event, payload) { [...(handlers.get(event) || [])].forEach(handler => handler(payload)); },
    capture(event) { return [...(handlers.get(event) || [])]; },
    disconnect() { this.disconnectCalls += 1; }
  };
}

function installTimers(window) {
  let nextId = 0;
  const timeouts = new Map();
  const intervals = new Map();
  const animationFrames = new Map();
  window.setTimeout = (callback, delay = 0) => {
    const id = ++nextId;
    timeouts.set(id, { callback, delay });
    return id;
  };
  window.clearTimeout = id => timeouts.delete(id);
  window.setInterval = (callback, delay = 0) => {
    const id = ++nextId;
    intervals.set(id, { callback, delay });
    return id;
  };
  window.clearInterval = id => intervals.delete(id);
  window.requestAnimationFrame = callback => {
    const id = ++nextId;
    animationFrames.set(id, callback);
    return id;
  };
  window.cancelAnimationFrame = id => animationFrames.delete(id);
  return { timeouts, intervals, animationFrames };
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (predicate()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  throw new Error('Timed out waiting for renderer fixture condition');
}

async function createRenderer({ connected = false } = {}) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('log', () => {});
  virtualConsole.on('info', () => {});
  virtualConsole.on('warn', () => {});
  virtualConsole.on('error', () => {});
  virtualConsole.on('jsdomError', () => {});
  const dom = new JSDOM(fs.readFileSync(HTML_PATH, 'utf8'), {
    runScripts: 'outside-only',
    url: `${ORIGIN}/emoji-rain/obs-hud`,
    pretendToBeVisual: true,
    virtualConsole
  });
  const { window } = dom;
  const socket = makeSocket(connected);
  const timers = installTimers(window);
  const requests = [];
  window.Matter = Matter;
  window.io = () => socket;
  window.fetch = input => {
    const url = new URL(String(input), ORIGIN);
    return new Promise(resolve => requests.push({
      method: 'GET',
      path: url.pathname,
      resolve(payload) { resolve({ ok: true, status: 200, json: async () => payload }); }
    }));
  };
  window.eval(fs.readFileSync(SCRIPT_PATH, 'utf8'));
  await waitFor(() => requests.length === 1);
  return { dom, socket, timers, requests };
}

function resolveRequest(requests, pathName, occurrence, payload) {
  const matching = requests.filter(request => request.path === pathName);
  if (!matching[occurrence]) throw new Error(`Missing request ${pathName} #${occurrence}`);
  matching[occurrence].resolve(payload);
}

const configResponse = visual_mode => ({
  success: true,
  config: { visual_mode, rate_limit_enabled: false, emoji_set: ['🌧️'] }
});
const mappingsResponse = mappings => ({ success: true, mappings });
const opacityResponse = opacity => ({ success: true, state: { opacity } });

describe('Legacy EmojiRain OBS HUD original renderer fixture', () => {
  test('loads exact read surfaces, refreshes on reconnect, ignores stale reads, and cleans up only on final pagehide', async () => {
    const { dom, socket, timers, requests } = await createRenderer();
    const { window } = dom;
    try {
      await waitFor(() => requests.length === 1);
      resolveRequest(requests, '/api/emoji-rain/config', 0, configResponse('initial-mode'));
      await waitFor(() => requests.length === 2);
      // The public mapping contract intentionally returns no per-user mapping.
      resolveRequest(requests, '/api/emoji-rain/user-mappings', 0, mappingsResponse({}));
      await waitFor(() => requests.length === 3);
      resolveRequest(requests, '/api/emoji-rain/overlay/state', 0, opacityResponse(0.8));
      await waitFor(() => window.document.getElementById('canvas-container').style.opacity === '0.8');

      expect(window.document.body.dataset.visualMode).toBe('initial-mode');
      expect(window.document.getElementById('canvas-container').style.opacity).toBe('0.8');
      expect(socket.emitted).toEqual([]);

      socket.deliver('emoji-rain:spawn', { emoji: '🌧️', count: 1, username: 'NoMapping' });
      expect(window.document.querySelector('.emoji-sprite').textContent).toBe('🌧️');

      socket.deliver('connect');
      socket.deliver('connect');
      await waitFor(() => requests.filter(request => request.path === '/api/emoji-rain/config').length === 3);
      expect(requests.every(request => request.method === 'GET')).toBe(true);
      expect(requests.map(request => request.path)).toEqual([
        '/api/emoji-rain/config', '/api/emoji-rain/user-mappings', '/api/emoji-rain/overlay/state',
        '/api/emoji-rain/config', '/api/emoji-rain/user-mappings', '/api/emoji-rain/overlay/state',
        '/api/emoji-rain/config', '/api/emoji-rain/user-mappings', '/api/emoji-rain/overlay/state'
      ]);

      resolveRequest(requests, '/api/emoji-rain/config', 2, configResponse('newer-mode'));
      resolveRequest(requests, '/api/emoji-rain/user-mappings', 2, mappingsResponse({}));
      resolveRequest(requests, '/api/emoji-rain/overlay/state', 2, opacityResponse(0.4));
      await new Promise(resolve => setImmediate(resolve));

      socket.deliver('emoji-rain:config-update', { config: { visual_mode: 'socket-update' } });
      socket.deliver('emoji-rain:user-mappings-update', { mappings: { SyntheticViewer: '🎉' } });
      resolveRequest(requests, '/api/emoji-rain/config', 1, configResponse('stale-mode'));
      resolveRequest(requests, '/api/emoji-rain/user-mappings', 1, mappingsResponse({ SyntheticViewer: '💥' }));
      resolveRequest(requests, '/api/emoji-rain/overlay/state', 1, opacityResponse(0.9));
      await new Promise(resolve => setImmediate(resolve));

      expect(window.document.body.dataset.visualMode).toBe('socket-update');
      expect(window.document.getElementById('canvas-container').style.opacity).toBe('0.4');
      socket.deliver('emoji-rain:spawn', { emoji: '🌧️', count: 1, username: 'SyntheticViewer' });
      expect([...window.document.querySelectorAll('.emoji-sprite')].map(element => element.textContent)).toContain('🎉');

      const lateSpawnCallbacks = socket.capture('emoji-rain:spawn');
      const lateConfigCallbacks = socket.capture('emoji-rain:config-update');
      window.dispatchEvent(new window.PageTransitionEvent('pagehide', { persisted: true }));
      expect(socket.disconnectCalls).toBe(0);
      expect(window.document.querySelectorAll('.emoji-sprite').length).toBeGreaterThan(0);

      window.dispatchEvent(new window.PageTransitionEvent('pagehide', { persisted: false }));
      expect(socket.disconnectCalls).toBe(1);
      expect(socket.handlers.get('emoji-rain:spawn')).toHaveLength(0);
      expect(timers.timeouts.size).toBe(0);
      expect(timers.intervals.size).toBe(0);
      expect(timers.animationFrames.size).toBe(0);
      expect(window.document.querySelectorAll('.emoji-sprite')).toHaveLength(0);
      lateSpawnCallbacks.forEach(callback => callback({ emoji: 'late', count: 1 }));
      lateConfigCallbacks.forEach(callback => callback({ config: { visual_mode: 'late-mode' } }));
      expect(window.document.body.dataset.visualMode).toBe('socket-update');
      expect(window.document.querySelectorAll('.emoji-sprite')).toHaveLength(0);
      expect(socket.emitted).toEqual([]);
    } finally {
      window.close();
    }
  });
});
