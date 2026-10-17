'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM, requestInterceptor, VirtualConsole } = require('jsdom');
const APP_ROOT = path.resolve(__dirname, '../..');
const ORIGIN = 'http://127.0.0.1:3000';
const ASSETS = Object.freeze({
  '/js/i18n-client.js': path.join(APP_ROOT, 'public/js/i18n-client.js'),
  '/js/public-overlay-render-mode.js': path.join(APP_ROOT, 'public/js/public-overlay-render-mode.js'),
  '/socket.io/socket.io.js': null
});
function socketSource() {
  return `(() => {
    const handlers = new Map(); const emitted = [];
    const socket = {
      connected: true, handlers, emitted, disconnectedByHarness: false, disconnectedByRenderer: false,
      on(event, handler) { const list = handlers.get(event) || []; list.push(handler); handlers.set(event, list); if (event === 'connect') queueMicrotask(() => handler()); return socket; },
      off(event, handler) { const list = handlers.get(event) || []; handlers.set(event, list.filter(item => item !== handler)); if (!handlers.get(event).length) handlers.delete(event); return socket; },
      emit(event, payload) { emitted.push({ event, payload }); window.__fixtureSocketEmitted(event, payload); return socket; },
      deliver(event, payload) { for (const handler of handlers.get(event) || []) handler(payload); },
      disconnect() { socket.disconnectedByRenderer = true; socket.connected = false; return socket; },
      disconnectFixture() { socket.disconnectedByHarness = true; socket.connected = false; handlers.clear(); }
    };
    window.io = () => socket; window.__fixtureSocket = socket;
  })();`;
}
function createInteractiveStoryTransport({ locale, deferConfig = false }) {
  const requests = []; const resources = []; const denied = []; let activeDoms = 0;
  const intervals = new Map();
  let releaseConfig = null;
  const config = {
    storyMode: 'dnd', overlayOrientation: 'landscape', overlayResolution: '1920x1080', overlayDisplayMode: 'full',
    overlayFontFamily: 'Segoe UI, sans-serif', overlayFontSize: 1.3, overlayTitleFontSize: 2.5,
    overlayTextColor: '#ffffff', overlayTitleColor: '#e94560', overlayBackgroundGradient: 'linear-gradient(180deg, #000000, #111111)',
    generatingAnimationMode: 'default', generatingAnimationUrl: ''
  };
  const response = (status, body) => ({ ok: status >= 200 && status < 300, status, statusText: status === 200 ? 'OK' : 'Not Found', json: async () => body });
  const fetch = async (input, options = {}) => {
    const url = new URL(String(input), ORIGIN); const method = String(options.method || 'GET').toUpperCase();
    requests.push({ url: url.href, path: url.pathname, method });
    if (url.origin !== ORIGIN || method !== 'GET') { denied.push({ url: url.href, method, reason: 'origin-or-method' }); return response(404, { success: false }); }
    if (url.pathname === '/api/interactive-story/config' && deferConfig) {
      return new Promise(resolve => { releaseConfig = () => resolve(response(200, config)); });
    }
    const localeMatch = /^\/api\/i18n\/translations\/(de|en|es|fr)$/.exec(url.pathname);
    if (localeMatch) return response(200, JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'plugins/interactive-story/locales', `${localeMatch[1]}.json`), 'utf8')));
    if (url.pathname === '/api/interactive-story/config') return response(200, config);
    if (url.pathname === '/api/interactive-story/participants') return response(200, { activeParticipants: [], eliminatedParticipants: [] });
    if (url.pathname === '/api/interactive-story/overlay-positions') return response(200, { version: 2, positions: {} });
    denied.push({ url: url.href, method, reason: 'unknown-route' }); return response(404, { success: false });
  };
  const interceptor = requestInterceptor(async request => {
    const url = new URL(request.url); resources.push({ url: url.href, path: url.pathname, method: request.method });
    if (url.origin !== ORIGIN || url.search || request.method !== 'GET' || !Object.hasOwn(ASSETS, url.pathname)) { denied.push({ url: url.href, method: request.method, reason: 'unknown-asset' }); throw new Error('Interactive Story fixture asset denied'); }
    const source = url.pathname === '/socket.io/socket.io.js' ? socketSource() : fs.readFileSync(ASSETS[url.pathname], 'utf8');
    return new Response(source, { status: 200, headers: { 'content-type': 'text/javascript; charset=utf-8' } });
  });
  function createDom() {
    const errors = []; const virtualConsole = new VirtualConsole(); virtualConsole.on('jsdomError', error => errors.push(error.message));
    const html = fs.readFileSync(path.join(APP_ROOT, 'plugins/interactive-story/overlay.html'), 'utf8');
    const dom = new JSDOM(html, { url: `${ORIGIN}/plugins/interactive-story/overlay.html?lang=${locale}`, runScripts: 'dangerously', resources: { interceptors: [interceptor] }, virtualConsole,
      beforeParse(window) {
        window.fetch = fetch;
        let nextInterval = 0;
        window.setInterval = (callback, delay) => { const id = ++nextInterval; intervals.set(id, { callback, delay }); return id; };
        window.clearInterval = id => intervals.delete(id);
        window.__fixtureSocketEmitted = (event, payload) => denied.push({ event, payload, reason: 'unexpected-socket-emit' });
        window.Audio = function BlockedAudio() { throw new Error('Audio is forbidden in this fixture'); };
        window.HTMLMediaElement.prototype.load = () => { errors.push('media load invoked'); };
        window.HTMLMediaElement.prototype.play = () => { errors.push('media play invoked'); return Promise.resolve(); };
        window.HTMLMediaElement.prototype.pause = () => {};
        window.console = { log() {}, warn() {}, error: (...args) => errors.push(args.map(String).join(' ')) };
      }
    });
    activeDoms += 1;
    const loaded = new Promise((resolve, reject) => { dom.window.addEventListener('load', resolve, { once: true }); dom.window.addEventListener('error', reject, { once: true }); });
    return { dom, loaded, errors };
  }
  return { requests, resources, denied, intervals, createDom, releaseDeferredConfig() { releaseConfig?.(); }, closeDom(dom) { dom.window.__fixtureSocket?.disconnectFixture(); dom.window.close(); activeDoms -= 1; }, isClosed: () => activeDoms === 0 };
}
module.exports = { createInteractiveStoryTransport };
