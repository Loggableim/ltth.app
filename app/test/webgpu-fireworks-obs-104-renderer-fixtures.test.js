'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const APP_ROOT = path.resolve(__dirname, '..');
const PLUGIN_ROOT = path.join(APP_ROOT, 'plugins/webgpu-fireworks');
const HTML_PATH = path.join(PLUGIN_ROOT, 'overlay.html');
const SCRIPT_PATHS = [
  'gpu/spawn-command-policy.js',
  'gpu/visible-envelope.js',
  'gpu/boykisser-geometry.js',
  'gpu/show-plan-v2-runtime.js',
  'gpu/engine.js'
];

function loadLocale(locale) {
  return JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, `locales/${locale}.json`), 'utf8'));
}

function makeI18n(bundle) {
  return {
    t(key, params = {}) {
      const value = key.split('.').reduce((current, part) => current && current[part], bundle);
      if (typeof value !== 'string') return key;
      return value.replace(/\{(\w+)\}/g, (match, name) => (
        Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
      ));
    }
  };
}

function makeSocket() {
  const handlers = new Map();
  return {
    handlers,
    emitted: [],
    connected: false,
    disconnectCalls: 0,
    on(event, handler) { handlers.set(event, [...(handlers.get(event) || []), handler]); },
    off(event, handler) { handlers.set(event, (handlers.get(event) || []).filter(item => item !== handler)); },
    emit(event, payload) { this.emitted.push({ event, payload }); },
    deliver(event, payload) { for (const handler of [...(handlers.get(event) || [])]) handler(payload); },
    disconnect() { this.disconnectCalls += 1; this.connected = false; }
  };
}

function installTimers(window) {
  let nextId = 0;
  const timeouts = new Map();
  window.setTimeout = (callback, delay = 0) => {
    const id = ++nextId;
    timeouts.set(id, { callback, delay });
    return id;
  };
  window.clearTimeout = id => timeouts.delete(id);
  return timeouts;
}

class CpuFixtureRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.initialized = false;
    this.destroyed = false;
    this.maxParticles = 8192;
    this.frameCount = 0;
  }
  async init() { this.initialized = true; return true; }
  resize() {}
  setLogicalSize() {}
  setQuality() {}
  render() { this.frameCount += 1; }
  getMetrics() { return { activeParticles: 0 }; }
  cancelQueuedOwner() { return 0; }
  destroy() { this.destroyed = true; }
}

async function createOverlay(locale) {
  const socket = makeSocket();
  const timeoutsRef = { current: null };
  const requests = [];
  const rendererErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => rendererErrors.push(error.message));
  const sourceHtml = fs.readFileSync(HTML_PATH, 'utf8');
  const dom = new JSDOM(sourceHtml.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''), {
    url: `http://127.0.0.1:3000/plugins/webgpu-fireworks/overlay.html?lang=${locale}`,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.i18n = makeI18n(loadLocale(locale));
      window.io = () => socket;
      window.AudioContext = undefined;
      window.webkitAudioContext = undefined;
      window.Audio = undefined;
      window.WebGPUParticleEngine = CpuFixtureRenderer;
      window.fetch = async (input, options = {}) => {
        const url = new URL(String(input), window.location.href);
        requests.push({ method: String(options.method || 'GET').toUpperCase(), path: url.pathname });
        throw new Error('unexpected renderer fixture network request');
      };
      timeoutsRef.current = installTimers(window);
    }
  });

  for (const relativePath of SCRIPT_PATHS) {
    const source = fs.readFileSync(path.join(PLUGIN_ROOT, relativePath), 'utf8');
    dom.window.eval(relativePath === 'gpu/engine.js'
      ? `${source}\nAudioManager.prototype.preload = async function() { return false; };`
      : source);
  }
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  return { dom, socket, timers: timeoutsRef.current, requests, rendererErrors };
}

describe('OBS-104 WebGPU Fireworks original overlay fixtures (DE/EN/ES/FR)', () => {
  test.each(['de', 'en', 'es', 'fr'])('%s renders a scoped follower event on CPU and cleans up without GPU/audio', async locale => {
    const { dom, socket, timers, requests, rendererErrors } = await createOverlay(locale);
    const bundle = loadLocale(locale);
    const expectedThankYou = bundle.plugins['webgpu-fireworks'].runtime.follow_thanks;
    try {
      const engine = dom.window.fireworksEngineInstance;
      expect(engine).toBeTruthy();
      expect(engine.audio.context).toBeNull();
      expect(engine.renderer).toBeInstanceOf(CpuFixtureRenderer);
      expect(engine.renderer.frameCount).toBeGreaterThan(0);
      expect(requests).toEqual([]);
      expect(socket.emitted).toEqual([]);

      socket.deliver('webgpu-fireworks:follower-animation', {
        username: 'Fixture Viewer',
        duration: 5000,
        position: 'center'
      });
      expect(dom.window.document.getElementById('follower-username').textContent).toBe('Fixture Viewer');
      expect(dom.window.document.getElementById('thank-you-text').textContent).toBe(expectedThankYou);
      expect(dom.window.document.getElementById('follower-animation').classList.contains('show')).toBe(true);
      expect(timers.size).toBeGreaterThan(0);

      const lateEvent = socket.handlers.get('webgpu-fireworks:follower-animation')[0];
      dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide', { persisted: false }));
      expect(engine.destroyed).toBe(true);
      expect(engine.renderer.destroyed).toBe(true);
      expect(socket.disconnectCalls).toBe(1);
      expect([...socket.handlers.values()].every(list => list.length === 0)).toBe(true);
      expect(timers.size).toBe(0);
      expect(requests).toEqual([]);
      expect(rendererErrors).toEqual([]);
      const usernameAfterDestroy = dom.window.document.getElementById('follower-username').textContent;
      lateEvent({ username: 'Too Late' });
      expect(dom.window.document.getElementById('follower-username').textContent).toBe(usernameAfterDestroy);
    } finally {
      dom.window.close();
    }
  });
});
