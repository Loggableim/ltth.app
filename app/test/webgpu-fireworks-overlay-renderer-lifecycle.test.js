'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const {
  isHttpAllowed,
  isIncomingSocketEventAllowed,
  isOutgoingSocketEventAllowed
} = require('../modules/public-overlay-registry');

const APP_ROOT = path.resolve(__dirname, '..');
const PLUGIN_ROOT = path.join(APP_ROOT, 'plugins/webgpu-fireworks');
const HTML_PATH = path.join(PLUGIN_ROOT, 'overlay.html');
const SCRIPT_PATHS = [
  'gpu/spawn-command-policy.js',
  'gpu/visible-envelope.js',
  'gpu/boykisser-geometry.js',
  'gpu/webgpu-particle-engine.js',
  'gpu/show-plan-v2-runtime.js',
  'gpu/engine.js'
];

function nextTurn() {
  return new Promise(resolve => setImmediate(resolve));
}

describe('WebGPU Fireworks original overlay renderer lifecycle', () => {
  test('preserves BFCache state and final cleanup detaches handlers without starting audio or GPU', async () => {
    const html = fs.readFileSync(HTML_PATH, 'utf8');
    const assets = [...html.matchAll(/<(?:script|link|img)\b[^>]*\bsrc="([^"]+)"/gi)]
      .map(match => match[1]);
    for (const asset of assets) {
      expect(isHttpAllowed({ method:'GET', pathname:new URL(asset, 'http://127.0.0.1').pathname })).toBe(true);
    }
    expect(isHttpAllowed({ method:'GET', pathname:'/api/webgpu-fireworks/config' })).toBe(false);
    expect(isIncomingSocketEventAllowed('webgpu-fireworks:register-overlay')).toBe(false);
    expect(isIncomingSocketEventAllowed('webgpu-fireworks:renderer-status')).toBe(false);
    expect(isOutgoingSocketEventAllowed('webgpu-fireworks:config-update')).toBe(false);
    expect(isOutgoingSocketEventAllowed('webgpu-fireworks:trigger')).toBe(false);

    const requests = [];
    const socketEvents = [];
    const handlers = new Map();
    const socket = {
      connected:false,
      on(eventName, handler) {
        handlers.set(eventName, [...(handlers.get(eventName) || []), handler]);
      },
      off(eventName, handler) {
        handlers.set(eventName, (handlers.get(eventName) || []).filter(candidate => candidate !== handler));
      },
      emit(eventName, payload) { socketEvents.push({ eventName, payload }); },
      disconnect() { this.connected = false; this.disconnectCalls = (this.disconnectCalls || 0) + 1; },
      deliver(eventName, ...args) {
        for (const handler of [...(handlers.get(eventName) || [])]) handler(...args);
      }
    };
    const virtualConsole = new VirtualConsole();
    const rendererErrors = [];
    virtualConsole.on('jsdomError', error => rendererErrors.push(error.message));
    const dom = new JSDOM(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''), {
      url:'http://127.0.0.1:3000/webgpu-fireworks/overlay',
      runScripts:'dangerously',
      pretendToBeVisual:true,
      virtualConsole,
      beforeParse(window) {
        window.i18n = { t:(key, fallback) => fallback };
        window.io = () => socket;
        window.AudioContext = undefined;
        window.webkitAudioContext = undefined;
        window.Audio = undefined;
        window.HTMLCanvasElement.prototype.getContext = () => null;
        window.fetch = async (input, options = {}) => {
          const url = new URL(String(input), window.location.href);
          requests.push({ method:String(options.method || 'GET').toUpperCase(), path:url.pathname });
          return { ok:false, status:404, arrayBuffer:async () => new ArrayBuffer(0), blob:async () => new Blob() };
        };
      }
    });

    try {
      for (const relativePath of SCRIPT_PATHS) {
        const source = fs.readFileSync(path.join(PLUGIN_ROOT, relativePath), 'utf8');
        dom.window.eval(relativePath === 'gpu/engine.js'
          ? `${source}\nAudioManager.prototype.preload = async function() { return false; };`
          : source);
      }
      dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
      await nextTurn();
      await nextTurn();

      const engine = dom.window.fireworksEngineInstance;
      expect(engine).toBeTruthy();
      expect(engine.rendererStatus.state).toBe('unsupported');
      expect(engine.audio.context).toBeNull();
      expect(requests).toEqual([]);

      socket.connected = true;
      socket.deliver('connect');
      await nextTurn();
      socket.deliver('webgpu-fireworks:config-update', {
        config:{ visualStyle:'minimal', audioEnabled:false }
      });
      await nextTurn();
      expect(engine.config.visualStyle).toBe('minimal');
      expect(engine.config.audioEnabled).toBe(false);
      expect(socketEvents.some(item => item.eventName === 'webgpu-fireworks:register-overlay')).toBe(true);

      engine.showGiftPopup({ username:'fixture', coins:1 });
      engine.showFollowerAnimation({ username:'fixture', duration:5000 });
      expect(engine.popupTimers.size).toBe(1);
      expect(engine.followerAnimationTimer).not.toBeNull();

      const cachedHide = new dom.window.Event('pagehide');
      Object.defineProperty(cachedHide, 'persisted', { value:true });
      dom.window.dispatchEvent(cachedHide);
      expect(engine.destroyed).toBe(false);
      const restore = new dom.window.Event('pageshow');
      Object.defineProperty(restore, 'persisted', { value:true });
      dom.window.dispatchEvent(restore);
      socket.deliver('disconnect');
      socket.connected = true;
      socket.deliver('connect');
      socket.deliver('webgpu-fireworks:config-update', {
        config:{ visualStyle:'cinematic', audioEnabled:false }
      });
      await nextTurn();
      expect(engine.config.visualStyle).toBe('cinematic');
      expect(engine.destroyed).toBe(false);

      const finalHide = new dom.window.Event('pagehide');
      Object.defineProperty(finalHide, 'persisted', { value:false });
      dom.window.dispatchEvent(finalHide);
      expect(engine.destroyed).toBe(true);
      expect(socket.disconnectCalls).toBe(1);
      expect([...handlers.values()].every(list => list.length === 0)).toBe(true);
      expect(engine.popupTimers.size).toBe(0);
      expect(engine.followerAnimationTimer).toBeNull();
      const configAfterDestroy = engine.config.visualStyle;
      socket.connected = true;
      socket.deliver('webgpu-fireworks:config-update', { config:{ visualStyle:'late' } });
      expect(engine.config.visualStyle).toBe(configAfterDestroy);
      expect(requests).toEqual([]);
      expect(rendererErrors).toEqual([]);
    } finally {
      dom.window.close();
    }
  });
});
