'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM, requestInterceptor, VirtualConsole } = require('jsdom');
const APP_ROOT = path.resolve(__dirname, '../..');
const ORIGIN = 'http://127.0.0.1:3000';
const ASSETS = Object.freeze({
  '/css/themes.css': path.join(APP_ROOT, 'public/css/themes.css'),
  '/js/i18n-client.js': path.join(APP_ROOT, 'public/js/i18n-client.js'),
  '/js/public-overlay-render-mode.js': path.join(APP_ROOT, 'public/js/public-overlay-render-mode.js'),
  '/quiz-show/quiz_show_overlay.css': path.join(APP_ROOT, 'plugins/quiz-show/quiz_show_overlay.css'),
  '/quiz-show/quiz_show_overlay.js': path.join(APP_ROOT, 'plugins/quiz-show/quiz_show_overlay.js'),
  '/socket.io/socket.io.js': null
});
function socketSource() {
  return `(() => {
    const handlers = new Map(); const emitted = [];
    const socket = {
      connected: true, handlers, emitted, disconnectedByRenderer: false,
      on(event, handler) { const list = handlers.get(event) || []; list.push(handler); handlers.set(event, list); if (event === 'connect') queueMicrotask(() => handler()); return socket; },
      off(event, handler) { handlers.set(event, (handlers.get(event) || []).filter(item => item !== handler)); return socket; },
      emit(event, payload) { emitted.push({ event, payload }); window.__fixtureSocketEmitted(event, payload); return socket; },
      deliver(event, payload) { for (const handler of handlers.get(event) || []) handler(payload); },
      disconnect() { socket.disconnectedByRenderer = true; socket.connected = false; for (const handler of handlers.get('disconnect') || []) handler(); handlers.clear(); }
    };
    window.__fixtureSocketFactoryCalls = 0;
    window.io = () => { window.__fixtureSocketFactoryCalls += 1; return socket; }; window.__fixtureSocket = socket;
  })();`;
}
function createQuizShowTransport({ locale, existingWindowSocket = null }) {
  const requests = []; const resources = []; const denied = []; const timers = new Map(); const frames = new Map(); let timerId = 0; let frameId = 0; let activeDoms = 0;
  const config = { theme: 'dark', animationSpeed: 1, questionAnimation: 'fade', colors: {}, fonts: {}, positions: {}, voterIconsConfig: { enabled: false }, customCSS: '' };
  const response = (status, body) => ({ ok: status >= 200 && status < 300, status, statusText: status === 200 ? 'OK' : 'Not Found', json: async () => body });
  const fetch = async (input, options = {}) => {
    const url = new URL(String(input), ORIGIN); const method = String(options.method || 'GET').toUpperCase();
    requests.push({ path: url.pathname, search: url.search, method });
    if (url.origin !== ORIGIN || method !== 'GET') { denied.push({ path: url.pathname, method, reason: 'origin-or-method' }); return response(404, { success: false }); }
    const localePath = /^\/api\/i18n\/translations\/(de|en|es|fr)$/.exec(url.pathname);
    if (localePath) return response(200, JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'plugins/quiz-show/locales', `${localePath[1]}.json`), 'utf8')));
    if (url.pathname === '/api/quiz-show/hud-config') return response(200, { success: true, config });
    if (url.pathname === '/api/quiz-show/brand-kit') return response(200, { success: true, brandKit: { primary_color: '', secondary_color: '', logo_path: '' } });
    if (url.pathname === '/api/quiz-show/state') return response(200, { success: true, config: { customLayoutEnabled: false, activeLayoutId: null } });
    denied.push({ path: url.pathname, method, reason: 'unknown-route' }); return response(404, { success: false });
  };
  const interceptor = requestInterceptor(async request => {
    const url = new URL(request.url); resources.push({ path: url.pathname, method: request.method });
    if (url.origin !== ORIGIN || url.search || request.method !== 'GET' || !Object.hasOwn(ASSETS, url.pathname)) { denied.push({ path: url.pathname, method: request.method, reason: 'unknown-asset' }); throw new Error('Quiz Show fixture asset denied'); }
    const source = url.pathname === '/socket.io/socket.io.js' ? socketSource() : fs.readFileSync(ASSETS[url.pathname], 'utf8');
    const css = url.pathname.endsWith('.css'); return new Response(source, { status: 200, headers: { 'content-type': css ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8' } });
  });
  function createDom() {
    const errors = []; const virtualConsole = new VirtualConsole(); virtualConsole.on('jsdomError', error => errors.push(error.message));
    const html = fs.readFileSync(path.join(APP_ROOT, 'plugins/quiz-show/quiz_show_overlay.html'), 'utf8');
    const dom = new JSDOM(html, { url: `${ORIGIN}/plugins/quiz-show/quiz_show_overlay.html?lang=${locale}`, runScripts: 'dangerously', resources: { interceptors: [interceptor] }, virtualConsole,
      beforeParse(window) {
        if (existingWindowSocket) {
          window.socket = existingWindowSocket;
          window.__fixtureExistingWindowSocket = window.socket;
        }
        window.fetch = fetch;
        window.__fixtureSocketEmitted = (event, payload) => { if (event !== 'quiz-show:get-public-state') denied.push({ event, payload, reason: 'unknown-socket-emit' }); };
        window.Audio = function BlockedAudio() { throw new Error('Audio is forbidden in the CPU fixture'); };
        window.setTimeout = (callback, delay = 0, ...args) => { const id = ++timerId; timers.set(id, { callback, delay, args }); return id; };
        window.clearTimeout = id => timers.delete(id);
        window.setInterval = (callback, delay = 0) => { const id = ++timerId; timers.set(id, { callback, delay, interval: true }); return id; };
        window.clearInterval = id => timers.delete(id);
        window.requestAnimationFrame = callback => { const id = ++frameId; frames.set(id, callback); return id; };
        window.cancelAnimationFrame = id => frames.delete(id);
        window.console = { log() {}, warn() {}, error: (...args) => errors.push(args.map(String).join(' ')) };
      }
    });
    activeDoms += 1;
    const loaded = new Promise((resolve, reject) => { dom.window.addEventListener('load', resolve, { once: true }); dom.window.addEventListener('error', reject, { once: true }); });
    return { dom, loaded, errors };
  }
  return { requests, resources, denied, timers, frames, createDom, closeDom(dom) { activeDoms -= 1; dom.window.close(); }, isClosed: () => activeDoms === 0 };
}
module.exports = { createQuizShowTransport };
