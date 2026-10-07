'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM, requestInterceptor, VirtualConsole } = require('jsdom');
const APP_ROOT = path.resolve(__dirname, '../..');
const ORIGIN = 'http://127.0.0.1:3000';
const ASSETS = Object.freeze({
  '/js/i18n-client.js': path.join(APP_ROOT, 'public/js/i18n-client.js'),
  '/plugins/toptier/assets/animations.css': path.join(APP_ROOT, 'plugins/toptier/assets/animations.css'),
  '/plugins/toptier/assets/overlay.css': path.join(APP_ROOT, 'plugins/toptier/assets/overlay.css'),
  '/plugins/toptier/assets/overlay.js': path.join(APP_ROOT, 'plugins/toptier/assets/overlay.js'),
  '/plugins/toptier/assets/avatar-placeholder.svg': path.join(APP_ROOT, 'plugins/toptier/assets/avatar-placeholder.svg'),
  '/socket.io/socket.io.js': null
});
function socketSource() {
  return `(() => {
    const handlers = new Map(); const emitted = []; let ioCalls = 0;
    const socket = {
      connected: true, handlers, emitted, disconnectedByRenderer: false,
      on(event, handler) { const list = handlers.get(event) || []; list.push(handler); handlers.set(event, list); if (event === 'connect') queueMicrotask(() => handler()); return socket; },
      off(event, handler) { handlers.set(event, (handlers.get(event) || []).filter(candidate => candidate !== handler)); return socket; },
      emit(event, payload) { emitted.push({ event, payload }); window.__fixtureSocketEmitted(event, payload); return socket; },
      deliver(event, payload) { for (const handler of handlers.get(event) || []) handler(payload); },
      queueDelivery(event, payload) { const queued = [...(handlers.get(event) || [])]; return () => queued.forEach(handler => handler(payload)); },
      disconnect() { socket.disconnectedByRenderer = true; socket.connected = false; for (const handler of handlers.get('disconnect') || []) handler(); handlers.clear(); }
    };
    window.io = () => { ioCalls += 1; return socket; }; window.__fixtureSocket = socket;
    window.__fixtureSocketCreationCount = () => ioCalls;
  })();`;
}
function createToptierTransport({ locale, board = 'likes', variant = 'spotlight' }) {
  const requests = []; const resources = []; const denied = []; const timers = new Map(); let nextTimer = 0; let activeDoms = 0;
  const fetch = async (input, options = {}) => {
    const url = new URL(String(input), ORIGIN); const method = String(options.method || 'GET').toUpperCase();
    requests.push({ path: url.pathname, search: url.search, method });
    if (url.origin !== ORIGIN || method !== 'GET') { denied.push({ url: url.href, method, reason: 'origin-or-method' }); return { ok: false, status: 404, json: async () => ({}) }; }
    const match = /^\/api\/i18n\/translations\/(de|en|es|fr)$/.exec(url.pathname);
    if (match) return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'plugins/toptier/locales', `${match[1]}.json`), 'utf8')) };
    denied.push({ url: url.href, method, reason: 'unknown-route' }); return { ok: false, status: 404, json: async () => ({}) };
  };
  const interceptor = requestInterceptor(async request => {
    const url = new URL(request.url); resources.push({ path: url.pathname, method: request.method });
    if (url.origin !== ORIGIN || url.search || request.method !== 'GET' || !Object.hasOwn(ASSETS, url.pathname)) { denied.push({ url: url.href, method: request.method, reason: 'unknown-asset' }); throw new Error('TopTier fixture asset denied'); }
    const source = url.pathname === '/socket.io/socket.io.js' ? socketSource() : fs.readFileSync(ASSETS[url.pathname]);
    const css = url.pathname.endsWith('.css'); const svg = url.pathname.endsWith('.svg');
    return new Response(source, { status: 200, headers: { 'content-type': css ? 'text/css; charset=utf-8' : svg ? 'image/svg+xml' : 'text/javascript; charset=utf-8' } });
  });
  function createDom() {
    const errors = []; const virtualConsole = new VirtualConsole(); virtualConsole.on('jsdomError', error => errors.push(error.message));
    const html = fs.readFileSync(path.join(APP_ROOT, 'plugins/toptier/overlay.html'), 'utf8');
    const dom = new JSDOM(html, { url: `${ORIGIN}/plugins/toptier/overlay.html?lang=${locale}&board=${board}&variant=${variant}&avatars=true&rotation=8000`, runScripts: 'dangerously', resources: { interceptors: [interceptor] }, virtualConsole,
      beforeParse(window) {
        window.fetch = fetch;
        window.__fixtureSocketEmitted = (event, payload) => {
          const requestedBoards = board === 'both' || board === 'combined' ? ['likes', 'gifts'] : [board];
          if (event !== 'toptier:get-board' || !requestedBoards.includes(payload?.board)) denied.push({ event, payload, reason: 'unknown-socket-emit' });
        };
        window.setInterval = (callback, delay = 0) => { const id = ++nextTimer; timers.set(id, { callback, delay, interval: true }); return id; };
        window.clearInterval = id => timers.delete(id);
        window.setTimeout = (callback, delay = 0, ...args) => { const id = ++nextTimer; timers.set(id, { callback, delay, args }); return id; };
        window.clearTimeout = id => timers.delete(id);
        window.console = { log() {}, warn() {}, error: (...args) => errors.push(args.map(String).join(' ')) };
      }
    });
    activeDoms += 1;
    const loaded = new Promise((resolve, reject) => { dom.window.addEventListener('load', resolve, { once: true }); dom.window.addEventListener('error', reject, { once: true }); });
    return { dom, loaded, errors };
  }
  return {
    requests, resources, denied, timers, createDom,
    flushTimeouts() {
      const pending = [...timers.entries()].filter(([, timer]) => !timer.interval);
      for (const [id, timer] of pending) {
        timers.delete(id);
        timer.callback(...(timer.args || []));
      }
    },
    closeDom(dom) { activeDoms -= 1; dom.window.close(); },
    isClosed: () => activeDoms === 0
  };
}
module.exports = { createToptierTransport };
