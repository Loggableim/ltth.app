'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { isHttpAllowed, isOutgoingSocketEventAllowed } = require('../../../modules/public-overlay-registry');

const APP_ROOT = path.resolve(__dirname, '../../..');
const HTML_PATH = path.join(__dirname, '../streammonsters-overlay.html');
const MODULES = [
  'streammonsters-rules-v8-pacing.js',
  'streammonsters-portrait-arena.js',
  'streammonsters-effects-renderer.js',
  'streammonsters-presentation.js',
  'streammonsters-overlay-runtime.js',
  'streammonsters-egg-stage-view.js',
  'streammonsters-arena-director.js',
  'streammonsters-audio-engine.js',
  'streammonsters-arena-view.js',
  'streammonsters-chat-view.js'
];

function makeResponse(status, body) {
  return {
    ok:status >= 200 && status < 300,
    status,
    json:async () => body
  };
}

function flushMicrotasks() {
  return new Promise(resolve => setImmediate(resolve));
}

describe('Stream Monsters original overlay renderer lifecycle', () => {
  test('loads a public snapshot, consumes an allowlisted event, restores BFCache state, and cleans up finally', async () => {
    const html = fs.readFileSync(HTML_PATH, 'utf8');
    const documentAssets = [...html.matchAll(/<(?:script|link|img)\b[^>]*\b(?:src|href)="([^"]+)"/gi)]
      .map(match => match[1])
      .filter(url => url.startsWith('/'));
    expect(documentAssets.length).toBeGreaterThan(0);
    for (const asset of documentAssets) {
      expect(isHttpAllowed({ method:'GET', pathname:new URL(asset, 'http://127.0.0.1').pathname })).toBe(true);
    }

    const requests = [];
    const handlers = new Map();
    let timerId = 0;
    const socket = {
      connected:true,
      on(event, handler) {
        handlers.set(event, [...(handlers.get(event) || []), handler]);
        if (event === 'connect') queueMicrotask(() => handler());
      },
      off(event, handler) {
        handlers.set(event, (handlers.get(event) || []).filter(item => item !== handler));
      },
      disconnect() {
        this.connected = false;
        this.disconnectCalls = (this.disconnectCalls || 0) + 1;
      },
      deliver(event, payload) {
        for (const handler of [...(handlers.get(event) || [])]) handler(payload);
      }
    };
    const snapshot = {
      hype:{ points:18 },
      gcce:{ commandPrefix:'!', registeredCommands:[], commandReferences:{} },
      config:{ hatchDurationMs:0, overlayLanguage:'de' },
      battle:{ matches:[] },
      recentEvents:[],
      eventCursor:0
    };
    const virtualConsole = new VirtualConsole();
    const rendererErrors = [];
    virtualConsole.on('jsdomError', error => rendererErrors.push(error.message));
    const dom = new JSDOM(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''), {
      url:'http://127.0.0.1:3000/stream-monsters/overlay?lang=de',
      runScripts:'dangerously',
      pretendToBeVisual:true,
      virtualConsole,
      beforeParse(window) {
        window.i18n = { init:async () => {}, updateDOM:() => {} };
        window.io = () => socket;
        window.HTMLCanvasElement.prototype.getContext = () => null;
        window.matchMedia = () => ({ matches:false, addEventListener() {}, removeEventListener() {} });
        window.fetch = async (input, options = {}) => {
          const url = new URL(String(input), window.location.href);
          const method = String(options.method || 'GET').toUpperCase();
          requests.push({ method, path:url.pathname });
          if (url.origin !== 'http://127.0.0.1:3000') return makeResponse(404, {});
          if (method === 'GET' && url.pathname === '/api/stream-monsters/state') {
            return makeResponse(200, snapshot);
          }
          if (method === 'GET' && url.pathname.startsWith('/plugins/stream-monsters/locales/')) {
            const localePath = path.join(APP_ROOT, 'plugins/stream-monsters/locales', path.basename(url.pathname));
            return fs.existsSync(localePath)
              ? makeResponse(200, JSON.parse(fs.readFileSync(localePath, 'utf8')))
              : makeResponse(404, {});
          }
          if (method === 'GET' && url.pathname === '/plugins/stream-monsters/assets/audio/manifest.json') {
            return makeResponse(200, {});
          }
          // The overlay's existing heartbeat is recorded but never reaches a server.
          if (method === 'POST' && url.pathname === '/api/stream-monsters/overlay/heartbeat') {
            return makeResponse(404, {});
          }
          return makeResponse(404, {});
        };
        window.setTimeout = (callback, delay = 0) => {
          const id = ++timerId;
          window.__timers.set(id, { callback, delay, interval:false });
          return id;
        };
        window.clearTimeout = id => window.__timers.delete(id);
        window.setInterval = (callback, delay = 0) => {
          const id = ++timerId;
          window.__timers.set(id, { callback, delay, interval:true });
          return id;
        };
        window.clearInterval = id => window.__timers.delete(id);
        window.__timers = new Map();
        window.requestAnimationFrame = callback => {
          const id = ++timerId;
          window.__timers.set(id, { callback, interval:false });
          return id;
        };
        window.cancelAnimationFrame = id => window.__timers.delete(id);
      }
    });

    try {
      for (const file of MODULES) {
        const source = fs.readFileSync(path.join(__dirname, `../${file}`), 'utf8');
        dom.window.eval(source);
      }
      const inlineScript = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
        .map(match => match[1])
        .find(source => source.includes('createReconnectController'));
      expect(inlineScript).toBeTruthy();
      dom.window.eval(inlineScript);

      await flushMicrotasks();
      await flushMicrotasks();
      expect(requests.filter(request => request.path === '/api/stream-monsters/state')).toHaveLength(1);
      expect(dom.window.document.getElementById('hype-value').textContent).toBe('18%');

      const pageShow = new dom.window.Event('pageshow');
      Object.defineProperty(pageShow, 'persisted', { value:true });
      dom.window.dispatchEvent(pageShow);
      await flushMicrotasks();
      await flushMicrotasks();
      expect(requests.filter(request => request.path === '/api/stream-monsters/state')).toHaveLength(2);

      expect(isOutgoingSocketEventAllowed('streammonsters:hype_changed')).toBe(true);
      socket.deliver('streammonsters:hype_changed', { hype:{ points:27 } });
      expect(dom.window.document.getElementById('hype-value').textContent).toBe('27%');

      const pageHide = new dom.window.Event('pagehide');
      Object.defineProperty(pageHide, 'persisted', { value:false });
      dom.window.dispatchEvent(pageHide);
      expect(socket.disconnectCalls).toBe(1);
      expect(handlers.get('streammonsters:hype_changed')).toHaveLength(0);
      expect(dom.window.__timers.size).toBe(0);
      socket.connected = true;
      dom.window.dispatchEvent(pageShow);
      await flushMicrotasks();
      expect(requests.filter(request => request.path === '/api/stream-monsters/state')).toHaveLength(2);
      expect(requests.every(({ method, path:requestPath }) => (
        method === 'GET' || (method === 'POST' && requestPath === '/api/stream-monsters/overlay/heartbeat')
      ))).toBe(true);
      expect(rendererErrors).toEqual([]);
    } finally {
      dom.window.close();
    }
  });
});
