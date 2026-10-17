'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, requestInterceptor, VirtualConsole } = require('jsdom');

const APP_ROOT = path.resolve(__dirname, '../..');
const ORIGIN = 'http://127.0.0.1:3000';
const HTML_PATH = path.join(APP_ROOT, 'plugins/stt-ticker/overlay/ticker.html');
const HTML = fs.readFileSync(HTML_PATH, 'utf8');
const LOCALES = Object.freeze(['de', 'en', 'es', 'fr']);

function socketSource() {
  return `(() => {
    const handlers = new Map();
    const emitted = [];
    const socket = {
      on(event, handler) {
        const list = handlers.get(event) || [];
        list.push(handler);
        handlers.set(event, list);
        return socket;
      },
      off(event, handler) {
        handlers.set(event, (handlers.get(event) || []).filter(candidate => candidate !== handler));
        return socket;
      },
      emit(event, payload) {
        emitted.push({ event, payload });
        window.__sttFixtureSocketEmit(event, payload);
        return socket;
      },
      deliver(event, payload) {
        for (const handler of [...(handlers.get(event) || [])]) handler(payload);
      },
      disconnect() { socket.disconnected = true; socket.disconnectCount += 1; return socket; },
      handlers,
      emitted,
      disconnected: false,
      disconnectCount: 0
    };
    window.io = () => socket;
    window.__sttFixtureSocket = socket;
  })();`;
}

function createSttTickerFixture({ locale = 'de', query = '', localeStatus = 200, deferTranslations = false, existingSocket = null } = {}) {
  if (!LOCALES.includes(locale)) throw new Error(`Unsupported fixture locale: ${locale}`);
  const resources = [];
  const requests = [];
  const denied = [];
  const socketEmits = [];
  const errors = [];
  const observerState = { instances: [], created: 0, disconnected: 0 };
  const timers = { nextId: 0, timeouts: new Map(), intervals: new Map() };
  const pendingTranslations = [];
  const interceptor = requestInterceptor(async (request) => {
    const url = new URL(request.url);
    if (url.origin !== ORIGIN || request.method !== 'GET') {
      denied.push({ url: url.href, reason: 'unknown-script-resource' });
      throw new Error('Fixture resource denied');
    }
    if (url.pathname === '/socket.io/socket.io.js' && !url.search) {
      resources.push({ url: request.url, method: request.method, servedFrom: 'local-fake-socket' });
      return new Response(socketSource(), { status: 200, headers: { 'content-type': 'text/javascript; charset=utf-8' } });
    }
    if (url.pathname === '/js/i18n-client.js' && !url.search) {
      resources.push({ url: request.url, method: request.method, servedFrom: 'actual-local-file' });
      const client = fs.readFileSync(path.join(APP_ROOT, 'public/js/i18n-client.js'), 'utf8');
      return new Response(`${client}\nwindow.__sttFixtureI18nSawIo = typeof io !== 'undefined'; window.__sttFixtureI18nReady = window.i18n.ready;`, {
        status: 200,
        headers: { 'content-type': 'text/javascript; charset=utf-8' }
      });
    }
    denied.push({ url: url.href, reason: 'unknown-script-resource' });
    throw new Error('Fixture resource denied');
  });
  async function fetch(input, options = {}) {
    const url = new URL(String(input), ORIGIN);
    const method = String(options.method || 'GET').toUpperCase();
    requests.push({ method, path: url.pathname, search: url.search });
    if (url.origin !== ORIGIN || method !== 'GET') {
      denied.push({ method, url: url.href, reason: 'origin-or-method' });
      return { ok: false, status: 404, json: async () => ({ error: 'fixture_route_denied' }) };
    }
    const match = url.pathname.match(/^\/api\/i18n\/translations\/([a-z]{2})$/);
    if (match && LOCALES.includes(match[1])) {
      const status = localeStatus === 'locale' && match[1] === locale ? 503 : 200;
      const localePath = path.join(APP_ROOT, 'plugins/stt-ticker/locales', `${match[1]}.json`);
      const translationResponse = {
        ok: status === 200,
        status,
        statusText: status === 200 ? 'OK' : 'Service Unavailable',
        json: async () => status === 200 ? JSON.parse(fs.readFileSync(localePath, 'utf8')) : { error: 'synthetic_unavailable' }
      };
      if (!deferTranslations) return translationResponse;
      return new Promise(resolve => pendingTranslations.push({ locale: match[1], response: translationResponse, resolve }));
    }
    denied.push({ method, url: url.href, reason: 'unknown-route' });
    return { ok: false, status: 404, json: async () => ({ error: 'fixture_route_denied' }) };
  }

  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(HTML, {
    url: `${ORIGIN}/plugins/stt-ticker/overlay/ticker.html?lang=${locale}${query ? `&${query}` : ''}`,
    runScripts: 'dangerously',
    resources: { interceptors: [interceptor], userAgent: 'LTTH STT source fixture' },
    virtualConsole,
    beforeParse(window) {
      if (existingSocket) window.socket = existingSocket;
      window.__sttFixtureFetch = fetch;
      window.fetch = fetch;
      window.__sttFixtureSocketEmit = (event, payload) => socketEmits.push({ event, payload });
      window.__sttFixtureObserverState = observerState;
      const NativeMutationObserver = window.MutationObserver;
      window.MutationObserver = class FixtureMutationObserver extends NativeMutationObserver {
        constructor(callback) {
          super(callback);
          this.fixtureActive = true;
          observerState.created += 1;
          observerState.instances.push(this);
        }

        disconnect() {
          if (this.fixtureActive) {
            this.fixtureActive = false;
            observerState.disconnected += 1;
          }
          return super.disconnect();
        }
      };
      window.fetch = fetch;
      window.console = { log() {}, warn() {}, error(...args) { errors.push(args.map(String).join(' ')); } };
      window.setTimeout = (callback, delay = 0, ...args) => {
        const id = ++timers.nextId;
        timers.timeouts.set(id, { callback, delay, args });
        return id;
      };
      window.clearTimeout = id => timers.timeouts.delete(id);
      window.setInterval = (callback, delay = 0, ...args) => {
        const id = ++timers.nextId;
        timers.intervals.set(id, { callback, delay, args });
        return id;
      };
      window.clearInterval = id => timers.intervals.delete(id);
    }
  });
  const loaded = new Promise((resolve) => dom.window.addEventListener('load', resolve, { once: true }));
  return {
    dom,
    loaded,
    html: HTML,
    requests,
    resources,
    denied,
    socketEmits,
    errors,
    timers,
    pendingTranslations,
    releaseTranslations() {
      for (const pending of pendingTranslations.splice(0)) pending.resolve(pending.response);
    },
    async waitForI18n() { await dom.window.__sttFixtureI18nReady; },
    observerState,
    close() { dom.window.close(); }
  };
}

module.exports = { createSttTickerFixture, LOCALES, HTML_PATH };
