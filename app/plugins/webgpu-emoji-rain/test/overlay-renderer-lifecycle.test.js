'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { isHttpAllowed, isOutgoingSocketEventAllowed } = require('../../../modules/public-overlay-registry');

const HTML_PATH = path.join(__dirname, '../overlay.html');
const ENGINE_PATH = path.join(__dirname, '../gpu/engine.js');
const RENDERER_PATH = path.join(__dirname, '../gpu/webgpu-emoji-engine.js');

function response(status, body) {
  return { ok:status >= 200 && status < 300, status, json:async () => body };
}

function nextTurn() {
  return new Promise(resolve => setImmediate(resolve));
}

describe('WebGPU EmojiRain original overlay lifecycle', () => {
  test('hydrates, applies public events, rejects stale replies, refreshes on BFCache restore, and disposes', async () => {
    const html = fs.readFileSync(HTML_PATH, 'utf8');
    const assets = [...html.matchAll(/<(?:script|link|img)\b[^>]*\bsrc="([^"]+)"/gi)]
      .map(match => match[1]);
    for (const asset of assets) {
      expect(isHttpAllowed({ method:'GET', pathname:new URL(asset, 'http://127.0.0.1').pathname })).toBe(true);
    }
    for (const pathName of [
      '/api/webgpu-emoji-rain/config',
      '/api/webgpu-emoji-rain/user-mappings',
      '/api/webgpu-emoji-rain/overlay/state'
    ]) {
      expect(isHttpAllowed({ method:'GET', pathname:pathName })).toBe(true);
      expect(isHttpAllowed({ method:'POST', pathname:pathName })).toBe(false);
    }
    expect(isOutgoingSocketEventAllowed('webgpu-emoji-rain:spawn')).toBe(true);
    expect(isOutgoingSocketEventAllowed('webgpu-emoji-rain:user-mappings-update')).toBe(true);

    const requests = [];
    const handlers = new Map();
    const intervals = new Map();
    let nextInterval = 0;
    let mappingReads = 0;
    let resolveStaleMapping;
    const socket = {
      connected:false,
      on(eventName, handler) {
        handlers.set(eventName, [...(handlers.get(eventName) || []), handler]);
      },
      off(eventName, handler) {
        handlers.set(eventName, (handlers.get(eventName) || []).filter(candidate => candidate !== handler));
      },
      emit() {},
      disconnect() { this.connected = false; this.disconnectCalls = (this.disconnectCalls || 0) + 1; },
      deliver(eventName, payload) {
        for (const handler of [...(handlers.get(eventName) || [])]) handler(payload);
      }
    };
    const virtualConsole = new VirtualConsole();
    const rendererErrors = [];
    virtualConsole.on('jsdomError', error => rendererErrors.push(error.message));
    const dom = new JSDOM(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''), {
      url:'http://127.0.0.1:3000/webgpu-emoji-rain/overlay',
      runScripts:'dangerously',
      pretendToBeVisual:true,
      virtualConsole,
      beforeParse(window) {
        window.HTMLCanvasElement.prototype.getContext = () => null;
        window.fetch = (input, options = {}) => {
          const url = new URL(String(input), window.location.href);
          const method = String(options.method || 'GET').toUpperCase();
          requests.push({ method, path:url.pathname });
          if (url.origin !== 'http://127.0.0.1:3000' || method !== 'GET') return Promise.resolve(response(404, {}));
          if (url.pathname === '/api/webgpu-emoji-rain/config') {
            return Promise.resolve(response(200, { config:{ enabled:true, rate_limit_enabled:false, emoji_set:['✨'] } }));
          }
          if (url.pathname === '/api/webgpu-emoji-rain/user-mappings') {
            mappingReads++;
            if (mappingReads === 2) {
              return new Promise(resolve => { resolveStaleMapping = () => resolve(response(200, { mappings:{ stale:'🦄' } })); });
            }
            return Promise.resolve(response(200, { mappings:{} }));
          }
          if (url.pathname === '/api/webgpu-emoji-rain/overlay/state') {
            const readNumber = requests.filter(item => item.path === url.pathname).length;
            return Promise.resolve(response(200, { state:{ opacity:readNumber === 1 ? 0.42 : 0.66, speed:1.25, theme:'neon' } }));
          }
          return Promise.resolve(response(404, {}));
        };
        window.io = () => socket;
        window.setInterval = callback => {
          const id = ++nextInterval;
          intervals.set(id, callback);
          return id;
        };
        window.clearInterval = id => intervals.delete(id);
      }
    });

    try {
      dom.window.eval(fs.readFileSync(RENDERER_PATH, 'utf8'));
      dom.window.eval(fs.readFileSync(ENGINE_PATH, 'utf8'));
      dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
      await nextTurn();
      await nextTurn();
      const state = dom.window.__webgpuEmojiRain;
      expect(state.overlay.opacity).toBe(0.42);
      expect(dom.window.document.body.style.opacity).toBe('0.42');
      expect(requests.filter(item => item.path.startsWith('/api/webgpu-emoji-rain/'))).toHaveLength(3);
      expect(state.renderer.metrics.state).toBe('unsupported');

      socket.connected = true;
      socket.deliver('connect');
      await nextTurn();
      expect(typeof resolveStaleMapping).toBe('function');
      socket.deliver('webgpu-emoji-rain:user-mappings-update', { mappings:{ Alice:'🌟' } });
      socket.deliver('webgpu-emoji-rain:opacity', { opacity:0.25 });
      resolveStaleMapping();
      await nextTurn();
      await nextTurn();
      expect(state.userMappings).toEqual({ Alice:'🌟' });
      expect(dom.window.document.body.style.opacity).toBe('0.25');

      expect(isOutgoingSocketEventAllowed('webgpu-emoji-rain:opacity')).toBe(true);
      socket.deliver('webgpu-emoji-rain:spawn', { username:'viewer', count:2, emoji:'✨' });
      expect(state.initQueuedParticles).toBe(2);

      const pageHide = new dom.window.Event('pagehide');
      Object.defineProperty(pageHide, 'persisted', { value:true });
      dom.window.dispatchEvent(pageHide);
      expect(state.renderer.destroyed).toBe(false);
      const pageShow = new dom.window.Event('pageshow');
      Object.defineProperty(pageShow, 'persisted', { value:true });
      dom.window.dispatchEvent(pageShow);
      await nextTurn();
      await nextTurn();
      expect(dom.window.document.body.style.opacity).toBe('0.66');
      expect(mappingReads).toBe(3);

      const finalHide = new dom.window.Event('pagehide');
      Object.defineProperty(finalHide, 'persisted', { value:false });
      dom.window.dispatchEvent(finalHide);
      expect(socket.disconnectCalls).toBe(1);
      expect([...handlers.values()].every(list => list.length === 0)).toBe(true);
      expect(intervals.size).toBe(0);
      expect(state.renderer.destroyed).toBe(true);
      expect(state.initQueuedParticles).toBe(0);
      socket.connected = true;
      socket.deliver('webgpu-emoji-rain:spawn', { count:9 });
      expect(state.initQueuedParticles).toBe(0);
      expect(requests.every(item => item.method === 'GET')).toBe(true);
      expect(rendererErrors).toEqual([]);
    } finally {
      dom.window.close();
    }
  });
});
