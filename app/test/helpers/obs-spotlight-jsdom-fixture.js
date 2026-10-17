'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM, requestInterceptor, VirtualConsole } = require('jsdom');

const APP_ROOT = path.resolve(__dirname, '../..');
const REPO_ROOT = path.resolve(APP_ROOT, '..');
const ORIGIN = 'http://127.0.0.1:3000';
const ASSETS = Object.freeze({
  '/fonts/exo-2.css': path.join(APP_ROOT, 'public/fonts/exo-2.css'),
  '/js/i18n-client.js': path.join(APP_ROOT, 'public/js/i18n-client.js'),
  '/plugins/spotlight/lib/animations.js': path.join(APP_ROOT, 'plugins/spotlight/lib/animations.js'),
  '/plugins/spotlight/lib/text-effects.js': path.join(APP_ROOT, 'plugins/spotlight/lib/text-effects.js'),
  '/plugins/spotlight/lib/template-renderer.js': path.join(APP_ROOT, 'plugins/spotlight/lib/template-renderer.js'),
  '/plugins/spotlight/overlays/single-overlay.js': path.join(APP_ROOT, 'plugins/spotlight/overlays/single-overlay.js'),
  '/socket.io/socket.io.js': null
});

function socketSource() {
  return `(() => {
    const handlers = new Map();
    const socket = {
      connected: true, disconnectedByRenderer: false, handlers,
      on(event, handler) { const list = handlers.get(event) || []; list.push(handler); handlers.set(event, list); if (event === 'connect') queueMicrotask(() => handler()); return socket; },
      off(event, handler) { handlers.set(event, (handlers.get(event) || []).filter(item => item !== handler)); return socket; },
      emit(event, payload) { window.__fixtureSocketEmitted(event, payload); return socket; },
      deliver(event, payload) { for (const handler of handlers.get(event) || []) handler(payload); },
      disconnect() { socket.disconnectedByRenderer = true; socket.connected = false; for (const handler of handlers.get('disconnect') || []) handler(); handlers.clear(); }
    };
    window.io = () => socket;
    window.__fixtureSocket = socket;
  })();`;
}

function createSpotlightTransport({ locale }) {
  const requests = [];
  const resources = [];
  const denied = [];
  let active = 0;
  const intervals = new Map();
  let nextInterval = 0;
  const settings = { showProfilePicture: false, preloadImages: false, refreshIntervalSeconds: 0, inAnimationType: 'none', outAnimationType: 'none', animationSpeed: 'fast', showUsername: true, usernameEffect: 'none' };
  const user = { nickname: 'Synthetic Chatter', eventType: 'chat', label: 'Synthetic event', profilePictureUrl: '', metadata: {}, overlaySessionToken: 'fixture-session' };

  const fetch = async (input, options = {}) => {
    const url = new URL(String(input), ORIGIN);
    const method = String(options.method || 'GET').toUpperCase();
    requests.push({ method, path: url.pathname });
    if (url.origin !== ORIGIN || method !== 'GET') {
      denied.push({ path: url.pathname, method, reason: 'origin-or-method' });
      return { ok: false, status: 404, json: async () => ({ success: false }) };
    }
    if (/^\/api\/i18n\/translations\/(de|en|es|fr)$/.test(url.pathname)) {
      const requestedLocale = url.pathname.split('/').at(-1);
      return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'plugins/spotlight/locales', `${requestedLocale}.json`), 'utf8')) };
    }
    if (url.pathname === '/api/lastevent/settings/chatter') return { ok: true, status: 200, json: async () => ({ success: true, settings }) };
    if (url.pathname === '/api/lastevent/last/chatter') return { ok: true, status: 200, json: async () => ({ success: true, user, overlaySessionToken: 'fixture-session' }) };
    denied.push({ path: url.pathname, method, reason: 'unknown-route' });
    return { ok: false, status: 404, json: async () => ({ success: false }) };
  };

  const interceptor = requestInterceptor(async request => {
    const parsed = new URL(request.url);
    resources.push({ path: parsed.pathname, method: request.method });
    if (parsed.origin !== ORIGIN || parsed.search || request.method !== 'GET' || !Object.hasOwn(ASSETS, parsed.pathname)) {
      denied.push({ path: parsed.pathname, method: request.method, reason: 'unknown-asset' });
      throw new Error('Spotlight fixture asset denied');
    }
    const source = parsed.pathname === '/socket.io/socket.io.js' ? socketSource() : fs.readFileSync(ASSETS[parsed.pathname], 'utf8');
    return new Response(source, { status: 200, headers: { 'content-type': parsed.pathname.endsWith('.css') ? 'text/css' : 'text/javascript' } });
  });

  function createDom() {
    const errors = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', error => errors.push(error.message));
    const dom = new JSDOM(fs.readFileSync(path.join(APP_ROOT, 'plugins/spotlight/overlays/chatter.html'), 'utf8'), {
      url: `${ORIGIN}/plugins/spotlight/overlays/chatter.html?lang=${locale}`,
      runScripts: 'dangerously', resources: { interceptors: [interceptor] }, virtualConsole,
      beforeParse(window) {
        window.fetch = fetch;
        window.__fixtureSocketEmitted = (event, payload) => {
          if (!['lastevent.chatter.subscribe', 'lastevent.chatter.unsubscribe'].includes(event)) denied.push({ event, payload, reason: 'unknown-socket-event' });
        };
        window.setInterval = (callback, delay) => { const id = ++nextInterval; intervals.set(id, { callback, delay }); return id; };
        window.clearInterval = id => intervals.delete(id);
        window.console = { log() {}, warn() {}, error: (...args) => errors.push(args.map(String).join(' ')) };
      }
    });
    active += 1;
    const loaded = new Promise((resolve, reject) => { dom.window.addEventListener('load', resolve, { once: true }); dom.window.addEventListener('error', reject, { once: true }); });
    return { dom, loaded, errors };
  }

  return { requests, resources, denied, intervals, createDom, closeDom(dom) { active -= 1; dom.window.close(); }, isClosed: () => active === 0 };
}

module.exports = { createSpotlightTransport, readChatterHtml: () => fs.readFileSync(path.join(REPO_ROOT, 'app/plugins/spotlight/overlays/chatter.html'), 'utf8') };

