'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const OVERLAY_PATH = path.join(__dirname, '../plugins/weather-control/overlay.html');
const ENGINE_PATH = path.join(__dirname, '../plugins/weather-control/weather-engine.js');

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
    emit(event, payload) { this.emitted.push({ event, payload }); },
    deliver(event, payload) { (handlers.get(event) || []).forEach(handler => handler(payload)); },
    disconnect() { this.disconnected = true; }
  };
}

function createCanvasContext() {
  const calls = [];
  const gradient = { addColorStop() {} };
  const context = new Proxy({ calls }, {
    get(target, property) {
      if (property in target) return target[property];
      if (property === 'createLinearGradient' || property === 'createRadialGradient') return () => gradient;
      if (property === 'measureText') return () => ({ width: 0 });
      if (property === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      return (...args) => calls.push({ method: String(property), args });
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    }
  });
  return context;
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  throw new Error('Timed out waiting for weather-control renderer state');
}

describe('Weather Control Spanish public renderer effect fixture', () => {
  test('turns one normalized rain event into active particles in the original engine', async () => {
    const socket = createSocket();
    const context = createCanvasContext();
    const frames = new Map();
    const timers = new Map();
    const intervals = new Map();
    let nextId = 0;
    const config = {
      enabled: true,
      qualityPreset: 'low',
      adaptiveQuality: false,
      maxConcurrentEffects: 3,
      effects: {
        rain: {
          defaultIntensity: 0.45,
          defaultDuration: 4200,
          opacity: 0.72,
          particleScale: 1.2,
          wind: 0.3,
          directionDeg: 24,
          layer: 21
        }
      },
      audio: { enabled: false },
      gamification: { enabled: false }
    };
    const html = fs.readFileSync(OVERLAY_PATH, 'utf8')
      .replace('<html lang="en">', '<html lang="es">')
      .replace('<script src="/socket.io/socket.io.js"></script>', '')
      .replace(
        '<script src="/plugins/weather-control/weather-engine.js"></script>',
        `<script>${fs.readFileSync(ENGINE_PATH, 'utf8')}</script>`
      );
    const virtualConsole = new VirtualConsole();
    for (const level of ['log', 'info', 'warn', 'error', 'debug', 'jsdomError']) virtualConsole.on(level, () => {});

    const dom = new JSDOM(html, {
      url: 'http://127.0.0.1:3000/plugins/weather-control/overlay?lang=es&debug=true',
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      virtualConsole,
      beforeParse(window) {
        window.i18n = { t: (_key, fallback) => fallback };
        window.io = () => socket;
        // Synthetic locale seed; this does not exercise translated server responses.
        window.fetch = async input => {
          const url = new URL(String(input), window.location.href);
          if (url.origin !== window.location.origin || ![
            '/api/weather/config', '/api/weather/gamification'
          ].includes(url.pathname)) throw new Error(`Unexpected fixture request: ${url.pathname}`);
          return {
            ok: true,
            json: async () => url.pathname === '/api/weather/gamification'
              ? { success: true, gamification: { enabled: false } }
              : { success: true, config }
          };
        };
        window.HTMLCanvasElement.prototype.getContext = () => context;
        window.requestAnimationFrame = callback => {
          const id = ++nextId;
          frames.set(id, callback);
          return id;
        };
        window.cancelAnimationFrame = id => frames.delete(id);
        window.setTimeout = callback => {
          const id = ++nextId;
          timers.set(id, callback);
          return id;
        };
        window.clearTimeout = id => timers.delete(id);
        window.setInterval = callback => {
          const id = ++nextId;
          intervals.set(id, callback);
          return id;
        };
        window.clearInterval = id => intervals.delete(id);
        window.AudioContext = undefined;
        window.webkitAudioContext = undefined;
      }
    });

    try {
      await waitFor(() => socket.handlers.has('weather:trigger') && dom.window.weatherControl);
      expect(dom.window.document.documentElement.lang).toBe('es');
      expect(dom.window.weatherControl.getStats().activeEffects).toHaveLength(0);

      // Minimal server-shaped event: no username, metadata, auth or account identifiers.
      socket.deliver('weather:trigger', {
        type: 'weather',
        action: 'rain',
        intensity: 0.37,
        duration: 5000,
        permanent: false,
        options: { opacity: 0.64, particleScale: 1.1, wind: -0.2, directionDeg: -18, layer: 12 }
      });

      const stats = dom.window.weatherControl.getStats();
      expect(stats.activeEffects).toHaveLength(1);
      expect(stats.activeEffects[0]).toMatchObject({ type: 'rain', intensity: 0.37, duration: 5000 });
      expect(stats.particles).toBeGreaterThan(0);
      expect(stats.queue).toBe(0);
      expect(socket.emitted.map(item => item.event)).toEqual(['weather:overlay-state']);
    } finally {
      const pagehide = new dom.window.Event('pagehide');
      Object.defineProperty(pagehide, 'persisted', { value: false });
      dom.window.dispatchEvent(pagehide);
      dom.window.close();
    }
  });
});
