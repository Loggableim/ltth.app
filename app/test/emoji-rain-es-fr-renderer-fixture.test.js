'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const Matter = require('matter-js');

const APP_ROOT = path.resolve(__dirname, '..');
const PLUGIN_ROOT = path.join(APP_ROOT, 'plugins/emoji-rain');
const HTML_PATH = path.join(PLUGIN_ROOT, 'obs-hud.html');
const SCRIPT_PATH = path.join(APP_ROOT, 'public/js/emoji-rain-obs-hud.js');
const ORIGIN = 'http://127.0.0.1:3000';
const TRANSLATION_KEY = 'plugins.emoji-rain.emoji_rain.obs_hud.metrics.emojis';

function resolveKey(dictionary, key) {
  return key.split('.').reduce((value, part) => value && value[part], dictionary);
}

function createSocket() {
  const handlers = new Map();
  return {
    handlers,
    emitted: [],
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
    disconnect() { this.disconnected = true; }
  };
}

function installTimers(window) {
  let nextId = 0;
  const timers = { timeouts: new Map(), intervals: new Map(), animationFrames: new Map() };
  window.setTimeout = callback => {
    const id = ++nextId;
    timers.timeouts.set(id, callback);
    return id;
  };
  window.clearTimeout = id => timers.timeouts.delete(id);
  window.setInterval = callback => {
    const id = ++nextId;
    timers.intervals.set(id, callback);
    return id;
  };
  window.clearInterval = id => timers.intervals.delete(id);
  window.requestAnimationFrame = callback => {
    const id = ++nextId;
    timers.animationFrames.set(id, callback);
    return id;
  };
  window.cancelAnimationFrame = id => timers.animationFrames.delete(id);
  return timers;
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (predicate()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  throw new Error('Timed out waiting for EmojiRain ES/FR renderer fixture');
}

describe('EmojiRain Spanish and French public renderer fixtures', () => {
  test.each(['es', 'fr'])('uses the real %s locale asset and safely renders the spawn event', async locale => {
    const localePath = path.join(PLUGIN_ROOT, 'locales', `${locale}.json`);
    const translations = JSON.parse(fs.readFileSync(localePath, 'utf8'));
    const expectedLabel = resolveKey(translations, TRANSLATION_KEY);
    expect(typeof expectedLabel).toBe('string');

    const virtualConsole = new VirtualConsole();
    for (const level of ['log', 'info', 'warn', 'error', 'jsdomError']) virtualConsole.on(level, () => {});
    const dom = new JSDOM(fs.readFileSync(HTML_PATH, 'utf8'), {
      runScripts: 'outside-only',
      url: `${ORIGIN}/emoji-rain/obs-hud?lang=${locale}`,
      pretendToBeVisual: true,
      virtualConsole
    });
    const { window } = dom;
    const socket = createSocket();
    const timers = installTimers(window);
    const requests = [];
    window.document.documentElement.lang = locale;
    window.i18n = {
      t(key, fallback) {
        const value = resolveKey(translations, key);
        return typeof value === 'string' ? value : fallback;
      }
    };
    for (const element of window.document.querySelectorAll('[data-i18n]')) {
      const translated = window.i18n.t(element.getAttribute('data-i18n'), element.textContent);
      if (translated) element.textContent = translated;
    }
    window.Matter = Matter;
    window.io = () => socket;
    window.fetch = (input, options = {}) => {
      const url = new URL(String(input), ORIGIN);
      if (options.method && options.method !== 'GET') throw new Error(`Unexpected fetch method: ${options.method}`);
      if (!['/api/emoji-rain/config', '/api/emoji-rain/user-mappings', '/api/emoji-rain/overlay/state'].includes(url.pathname)) {
        throw new Error(`Unexpected fetch path: ${url.pathname}`);
      }
      return new Promise(resolve => requests.push({
        method: 'GET',
        path: url.pathname,
        resolve(payload) { resolve({ ok: true, status: 200, json: async () => payload }); }
      }));
    };

    try {
      window.eval(fs.readFileSync(SCRIPT_PATH, 'utf8'));
      await waitFor(() => requests.length === 1);
      requests[0].resolve({ success: true, config: { enabled: true, obs_hud_enabled: true, rate_limit_enabled: false } });
      await waitFor(() => requests.length === 2);
      requests[1].resolve({ success: true, mappings: {} });
      await waitFor(() => requests.length === 3);
      requests[2].resolve({ success: true, state: { opacity: 0.75 } });
      await waitFor(() => socket.handlers.has('emoji-rain:spawn'));

      expect(window.document.documentElement.lang).toBe(locale);
      expect(window.document.querySelector('.perf-label[data-i18n="' + TRANSLATION_KEY + '"]').textContent).toBe(expectedLabel);
      expect(requests.map(request => request.path)).toEqual([
        '/api/emoji-rain/config', '/api/emoji-rain/user-mappings', '/api/emoji-rain/overlay/state'
      ]);

      const untrustedText = '<img src=x onerror=alert(1)>';
      socket.deliver('emoji-rain:spawn', { count: 1, emoji: untrustedText, x: 0.5, y: 0.1 });
      const sprite = window.document.querySelector('.emoji-sprite');
      expect(sprite).not.toBeNull();
      expect(sprite.textContent).toBe(untrustedText);
      expect(sprite.querySelector('img')).toBeNull();
      expect(window.document.querySelector('#canvas-container img')).toBeNull();
      expect(socket.emitted).toEqual([]);

      window.dispatchEvent(new window.PageTransitionEvent('pagehide', { persisted: false }));
      expect(socket.disconnected).toBe(true);
      expect(window.document.querySelectorAll('.emoji-sprite')).toHaveLength(0);
      expect(timers.timeouts.size).toBe(0);
      expect(timers.intervals.size).toBe(0);
      expect(timers.animationFrames.size).toBe(0);
    } finally {
      window.close();
    }
  });
});
