'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { isHttpAllowed, isIncomingSocketEventAllowed, isOutgoingSocketEventAllowed } = require('../modules/public-overlay-registry');

const APP_ROOT = path.resolve(__dirname, '..');
const PLUGIN_ROOT = path.join(APP_ROOT, 'plugins/visual-fx-frame-webgpu');
const HTML_PATH = path.join(PLUGIN_ROOT, 'renderer/index.html');
const MODULES = [
  'default-config.js',
  'renderer/adaptive-quality.js',
  'renderer/gpu-resources.js',
  'renderer/effect-pipelines.js',
  'renderer/hdr-post-processor.js',
  'renderer/webgpu-effects-engine.js',
  'renderer/overlay-controller.js'
];

function response(status, body) {
  return { ok:status >= 200 && status < 300, status, json:async () => body };
}

function nextTurn() {
  return new Promise(resolve => setImmediate(resolve));
}

describe('Visual FX Frame WebGPU original renderer lifecycle', () => {
  test('hydrates, applies events, ignores stale config, refreshes after BFCache, and disposes late work', async () => {
    const html = fs.readFileSync(HTML_PATH, 'utf8');
    const assets = [...html.matchAll(/<(?:script|link|img)\b[^>]*\bsrc="([^"]+)"/gi)]
      .map(match => match[1]);
    for (const asset of assets) {
      expect(isHttpAllowed({ method:'GET', pathname:new URL(asset, 'http://127.0.0.1').pathname })).toBe(true);
    }
    expect(isHttpAllowed({ method:'GET', pathname:'/api/visual-fx-frame-webgpu/config' })).toBe(true);
    expect(isHttpAllowed({ method:'POST', pathname:'/api/visual-fx-frame-webgpu/config' })).toBe(false);
    expect(isOutgoingSocketEventAllowed('visual-fx-frame-webgpu:config-update')).toBe(true);
    expect(isOutgoingSocketEventAllowed('visual-fx-frame-webgpu:trigger')).toBe(true);
    expect(isOutgoingSocketEventAllowed('visual-fx-frame-webgpu:clear-triggers')).toBe(true);
    expect(isIncomingSocketEventAllowed('visual-fx-frame-webgpu:renderer-status')).toBe(true);

    const requests = [];
    const socketEmits = [];
    const handlers = new Map();
    const deferred = [];
    const socket = {
      connected:false,
      on(eventName, handler) {
        handlers.set(eventName, [...(handlers.get(eventName) || []), handler]);
      },
      off(eventName, handler) {
        handlers.set(eventName, (handlers.get(eventName) || []).filter(candidate => candidate !== handler));
      },
      emit(eventName, payload) { socketEmits.push({ eventName, payload }); },
      disconnect() { this.connected = false; this.disconnectCalls = (this.disconnectCalls || 0) + 1; },
      deliver(eventName, payload) {
        for (const handler of [...(handlers.get(eventName) || [])]) handler(payload);
      }
    };
    const virtualConsole = new VirtualConsole();
    const rendererErrors = [];
    virtualConsole.on('jsdomError', error => rendererErrors.push(error.message));
    const dom = new JSDOM(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''), {
      url:'http://127.0.0.1:3000/visual-fx-frame-webgpu/renderer?debug=true',
      runScripts:'dangerously',
      pretendToBeVisual:true,
      virtualConsole,
      beforeParse(window) {
        window.io = () => socket;
        window.fetch = (input, options = {}) => {
          const url = new URL(String(input), window.location.href);
          const method = String(options.method || 'GET').toUpperCase();
          requests.push({ method, path:url.pathname });
          if (url.origin !== 'http://127.0.0.1:3000' || method !== 'GET' || url.pathname !== '/api/visual-fx-frame-webgpu/config') {
            return Promise.resolve(response(404, {}));
          }
          if (requests.filter(item => item.path === url.pathname).length === 1) {
            return new Promise(resolve => deferred.push({ resolve, config:{ flameColor:'#111111' } }));
          }
          if (requests.filter(item => item.path === url.pathname).length === 2) {
            return new Promise(resolve => deferred.push({ resolve, config:{ flameColor:'#bb0000' } }));
          }
          if (requests.filter(item => item.path === url.pathname).length === 3) {
            return Promise.resolve(response(200, { config:{ flameColor:'#abcdef' } }));
          }
          return new Promise(resolve => deferred.push({ resolve, config:{ flameColor:'#ff00ff' } }));
        };
      }
    });

    try {
      for (const modulePath of MODULES) {
        const source = fs.readFileSync(path.join(PLUGIN_ROOT, modulePath), 'utf8');
        dom.window.eval(source);
      }
      const NativeEngine = dom.window.WebGPUVisualFxEngine;
      dom.window.WebGPUVisualFxEngine = class FixtureEngine extends NativeEngine {
        constructor(canvas, options) {
          super(canvas, options);
          dom.window.__fixtureEngine = this;
        }
      };
      await nextTurn();
      expect(requests).toEqual([{ method:'GET', path:'/api/visual-fx-frame-webgpu/config' }]);
      expect(deferred).toHaveLength(1);

      socket.deliver('visual-fx-frame-webgpu:config-update', { config:{ flameColor:'#22aa22' } });
      deferred.shift().resolve(response(200, { config:{ flameColor:'#111111' } }));
      await nextTurn();
      await nextTurn();
      const engine = dom.window.__fixtureEngine;
      expect(engine.config.flameColor).toBe('#22aa22');
      expect(engine.metrics.state).toBe('unsupported');

      socket.deliver('visual-fx-frame-webgpu:trigger', { type:'gift', effect:'lightning', duration:5000 });
      expect(engine.activeTriggers).toHaveLength(1);
      socket.deliver('visual-fx-frame-webgpu:clear-triggers');
      expect(engine.activeTriggers).toHaveLength(0);

      socket.connected = true;
      socket.deliver('connect');
      await nextTurn();
      expect(deferred).toHaveLength(1);
      socket.deliver('visual-fx-frame-webgpu:config-update', { config:{ flameColor:'#00aa00' } });
      deferred.shift().resolve(response(200, { config:{ flameColor:'#bb0000' } }));
      await nextTurn();
      expect(engine.config.flameColor).toBe('#00aa00');

      const cachedHide = new dom.window.Event('pagehide');
      Object.defineProperty(cachedHide, 'persisted', { value:true });
      dom.window.dispatchEvent(cachedHide);
      expect(engine.destroyed).toBe(false);
      const restore = new dom.window.Event('pageshow');
      Object.defineProperty(restore, 'persisted', { value:true });
      dom.window.dispatchEvent(restore);
      await nextTurn();
      await nextTurn();
      expect(engine.config.flameColor).toBe('#abcdef');

      socket.deliver('connect');
      await nextTurn();
      expect(deferred).toHaveLength(1);
      const finalHide = new dom.window.Event('pagehide');
      Object.defineProperty(finalHide, 'persisted', { value:false });
      dom.window.dispatchEvent(finalHide);
      deferred.shift().resolve(response(200, { config:{ flameColor:'#ff00ff' } }));
      await nextTurn();
      expect(engine.destroyed).toBe(true);
      expect(engine.config.flameColor).toBe('#abcdef');
      expect(socket.disconnectCalls).toBe(1);
      expect([...handlers.values()].every(list => list.length === 0)).toBe(true);
      expect(socketEmits.every(item => item.eventName === 'visual-fx-frame-webgpu:renderer-status')).toBe(true);
      expect(requests.every(item => item.method === 'GET' && item.path === '/api/visual-fx-frame-webgpu/config')).toBe(true);
      socket.connected = true;
      socket.deliver('visual-fx-frame-webgpu:trigger', { effect:'flames' });
      expect(engine.activeTriggers).toHaveLength(0);
      expect(rendererErrors).toEqual([]);
    } finally {
      dom.window.close();
    }
  });
});
