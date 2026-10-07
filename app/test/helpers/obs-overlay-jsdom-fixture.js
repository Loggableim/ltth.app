'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM, requestInterceptor, VirtualConsole } = require('jsdom');

const APP_ROOT = path.resolve(__dirname, '../..');
const REPO_ROOT = path.resolve(APP_ROOT, '..');
const ORIGIN = 'http://127.0.0.1:3000';
const SCRIPT_PATHS = Object.freeze({
  '/socket.io/socket.io.js': null,
  '/js/i18n-client.js': path.join(APP_ROOT, 'public/js/i18n-client.js'),
  '/plugins/advanced-timer/overlay/overlay.js': path.join(APP_ROOT, 'plugins/advanced-timer/overlay/overlay.js'),
  '/plugins/goals/overlay/overlay.js': path.join(APP_ROOT, 'plugins/goals/overlay/overlay.js')
});

function socketClientSource() {
  return `(() => {
    const handlers = new Map();
    const emitted = [];
    const socket = {
      connected: true,
      disconnectedByRenderer: false,
      disconnectCalls: 0,
      on(event, handler) {
        const list = handlers.get(event) || [];
        list.push(handler);
        handlers.set(event, list);
        if (event === 'connect') queueMicrotask(() => { if (socket.connected) handler(); });
        return socket;
      },
      off(event, handler) {
        handlers.set(event, (handlers.get(event) || []).filter(candidate => candidate !== handler));
        return socket;
      },
      emit(event, payload) {
        emitted.push({ event, payload });
        window.__fixtureSocketEmitted(event, payload);
        return socket;
      },
      deliver(event, payload) {
        for (const handler of handlers.get(event) || []) handler(payload);
      },
      simulateTransportDisconnect() {
        if (!socket.connected) return;
        socket.connected = false;
        socket.deliver('disconnect');
      },
      simulateTransportReconnect() {
        if (socket.disconnectedByRenderer) throw new Error('renderer-closed fixture socket cannot reconnect');
        if (socket.connected) return;
        socket.connected = true;
        socket.deliver('connect');
      },
      queueDelivery(event, payload) {
        const queuedHandlers = [...(handlers.get(event) || [])];
        return () => queuedHandlers.forEach(handler => handler(payload));
      },
      disconnectFixture() {
        socket.connected = false;
        handlers.clear();
      },
      disconnect() {
        if (!socket.connected) return;
        socket.disconnectCalls += 1;
        socket.disconnectedByRenderer = true;
        socket.connected = false;
        for (const handler of handlers.get('disconnect') || []) handler();
        handlers.clear();
      },
      handlers,
      emitted
    };
    if (!window.__fixtureNoGlobalSocket) window.socket = socket;
    window.__fixtureSocketFactoryCalls = 0;
    window.io = () => { window.__fixtureSocketFactoryCalls += 1; return socket; };
    window.__fixtureSocket = socket;
  })();`;
}

function createFixtureTransport({ plugin, id, timerOutcomes = [], translationOutcomes = [], timer } = {}) {
  const requests = [];
  const resourceRequests = [];
  const socketEmits = [];
  const deniedRequests = [];
  let timerOutcomeIndex = 0;
  let translationOutcomeIndex = 0;
  let nextTimerId = 0;
  const pendingTimerResponses = [];
  const pendingTranslationResponses = [];
  const closedDoms = new WeakSet();
  let activeDoms = 0;
  const allowedSocketEvents = plugin === 'goals'
    ? new Set(['goals:subscribe', 'goals:animation-end', 'goals:unsubscribe'])
    : new Set();

  function response(status, body) {
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : status === 404 ? 'Not Found' : 'Synthetic Service Unavailable',
      json: async () => body
    };
  }

  async function fetch(input, options = {}) {
    const url = new URL(String(input), ORIGIN);
    const method = String(options.method || 'GET').toUpperCase();
    requests.push({ method, path: url.pathname, search: url.search });

    if (url.origin !== ORIGIN || method !== 'GET') {
      deniedRequests.push({ method, url: url.href, reason: 'origin-or-method' });
      return response(404, { success: false, error: 'Fixture route denied' });
    }
    if (url.pathname === `/api/i18n/translations/${url.pathname.split('/').at(-1)}` && /^[a-z]{2}$/.test(url.pathname.split('/').at(-1))) {
      const locale = url.pathname.split('/').at(-1);
      const localePath = path.join(APP_ROOT, 'plugins', plugin, 'locales', `${locale}.json`);
      if (fs.existsSync(localePath)) {
        const outcome = translationOutcomes[translationOutcomeIndex++] || {};
        if (outcome.reject) throw new Error('Synthetic translation network failure');
        if (outcome.defer) return new Promise(resolve => pendingTranslationResponses.push({ locale, resolve }));
        if (outcome.status && outcome.status !== 200) return response(outcome.status, { success: false, error: 'Synthetic translation unavailable' });
        return response(200, JSON.parse(fs.readFileSync(localePath, 'utf8')));
      }
      deniedRequests.push({ method, url: url.href, reason: 'unknown-locale' });
      return response(404, { success: false, error: 'Fixture locale denied' });
    }

    if (plugin === 'advanced-timer') {
      const timerPath = `/api/advanced-timer/timers/${id}`;
      if (url.pathname === timerPath) {
        const outcome = timerOutcomes[timerOutcomeIndex++] || { status: 200 };
        if (outcome.reject) throw new Error('Synthetic network failure');
        if (outcome.defer) {
          return new Promise(resolve => {
            pendingTimerResponses.push({ resolve, outcome });
          });
        }
        if (outcome.status !== 200) return response(outcome.status, { success: false, error: 'Synthetic timer unavailable' });
        return response(200, { success: true, timer: { ...timer } });
      }
      if (url.pathname === `${timerPath}/rotator`) return response(200, { success: true, settings: { enabled: false } });
      if (url.pathname === `${timerPath}/threshold-effects`) return response(200, { success: true, settings: { enabled: false } });
    }

    deniedRequests.push({ method, url: url.href, reason: 'unknown-route' });
    return response(404, { success: false, error: 'Fixture route denied' });
  }

  function onSocketEmit(event, payload) {
    socketEmits.push({ event, payload });
    if (!allowedSocketEvents.has(event)) deniedRequests.push({ event, payload, reason: 'unknown-socket-event' });
  }

  const resourceInterceptor = requestInterceptor(async (request, { element }) => {
      const url = request.url;
      resourceRequests.push({ url, element: element?.localName || null });
      let parsed;
      try { parsed = new URL(url); } catch (_) {
        deniedRequests.push({ url: String(url), reason: 'invalid-resource-url' });
        throw new Error('Fixture resource URL rejected');
      }
      const expectedSearch = parsed.pathname === '/plugins/advanced-timer/overlay/overlay.js' ? '?v=3' : '';
      if (parsed.origin !== ORIGIN || parsed.search !== expectedSearch || request.method !== 'GET' || !Object.hasOwn(SCRIPT_PATHS, parsed.pathname)) {
        deniedRequests.push({ url: parsed.href, reason: 'unknown-script-resource' });
        throw new Error('Fixture resource URL rejected');
      }
      const contents = parsed.pathname === '/socket.io/socket.io.js'
        ? socketClientSource()
        : fs.readFileSync(SCRIPT_PATHS[parsed.pathname], 'utf8');
      return new Response(contents, { status: 200, headers: { 'content-type': 'text/javascript; charset=utf-8' } });
    });

  function createDom({ html, pathname, locale, query, noGlobalSocket = false, existingWindowSocket = null }) {
    const virtualConsole = new VirtualConsole();
    const rendererErrors = [];
    virtualConsole.on('jsdomError', error => rendererErrors.push(error.message));
    const dom = new JSDOM(html, {
      url: `${ORIGIN}${pathname}?lang=${locale}&${query}`,
      runScripts: 'dangerously',
      resources: { interceptors: [resourceInterceptor], userAgent: 'LTTH source-only JSDOM fixture' },
      virtualConsole,
      beforeParse(window) {
        window.__fixtureNoGlobalSocket = noGlobalSocket;
        if (existingWindowSocket) {
          window.socket = existingWindowSocket;
          window.__fixtureExistingWindowSocket = window.socket;
        }
        window.fetch = fetch;
        window.__fixtureSocketEmitted = onSocketEmit;
        window.__fixtureTimers = { timeouts: [], intervals: [] };
        const pendingTimeouts = new Map();
        window.__fixtureTimers.flushTimeouts = async () => {
          const due = [...pendingTimeouts.values()].sort((a, b) => a.delay - b.delay);
          for (const timeout of due) {
            pendingTimeouts.delete(timeout.id);
            timeout.callback(...timeout.args);
            await Promise.resolve();
          }
          await Promise.resolve();
        };
        window.__fixtureTimers.pendingTimeoutCount = () => pendingTimeouts.size;
        window.setTimeout = (callback, delay = 0, ...args) => {
          const id = ++nextTimerId;
          const record = { id, callback, delay: Number(delay) || 0, args };
          pendingTimeouts.set(id, record);
          window.__fixtureTimers.timeouts.push(record);
          return id;
        };
        window.clearTimeout = id => { pendingTimeouts.delete(id); };
        window.setInterval = (callback, delay = 0) => {
          const id = ++nextTimerId;
          window.__fixtureTimers.intervals.push({ id, callback, delay: Number(delay) || 0 });
          return id;
        };
        window.clearInterval = () => {};
        window.console = {
          log() {},
          warn() {},
          error(...args) { rendererErrors.push(args.map(String).join(' ')); }
        };
      }
    });
    activeDoms += 1;
    const domReady = new Promise(resolve => {
      const finishDomReady = async () => {
        if (dom.window.i18n?.ready) await dom.window.i18n.ready;
        await Promise.resolve();
        setImmediate(resolve);
      };
      if (dom.window.document.readyState === 'loading') {
        dom.window.document.addEventListener('DOMContentLoaded', finishDomReady, { once: true });
      } else {
        finishDomReady();
      }
    });
    const loaded = new Promise((resolve, reject) => {
      dom.window.addEventListener('load', resolve, { once: true });
      dom.window.addEventListener('error', reject, { once: true });
    });
    return { dom, loaded, domReady, rendererErrors };
  }

  return {
    requests,
    resourceRequests,
    socketEmits,
    deniedRequests,
    createDom,
    resolveNextTimerResponse() {
      const pending = pendingTimerResponses.shift();
      if (!pending) throw new Error('No deferred timer response is pending');
      const status = pending.outcome.status || 200;
      const body = pending.outcome.body || { success: true, timer: { ...timer } };
      pending.resolve(response(status, body));
    },
    resolveNextTranslationResponse() {
      const pending = pendingTranslationResponses.shift();
      if (!pending) throw new Error('No deferred translation response is pending');
      const localePath = path.join(APP_ROOT, 'plugins', plugin, 'locales', `${pending.locale}.json`);
      pending.resolve(response(200, JSON.parse(fs.readFileSync(localePath, 'utf8'))));
    },
    closeDom(dom) {
      if (closedDoms.has(dom)) return;
      closedDoms.add(dom);
      activeDoms -= 1;
      dom.window.__fixtureSocket?.disconnectFixture();
      // i18n's DOMContentLoaded listener is async and may resume after load.
      // Prevent that pending harness-only update from touching a closed document.
      if (dom.window.i18n) dom.window.i18n.updateDOM = () => {};
      dom.window.close();
    },
    isClosed: () => activeDoms === 0
  };
}

function readOverlayHtml(plugin) {
  const relativePath = plugin === 'advanced-timer'
    ? 'app/plugins/advanced-timer/overlay/index.html'
    : plugin === 'goals'
      ? 'app/plugins/goals/overlay/index.html'
      : null;
  if (!relativePath) throw new Error(`Unknown overlay fixture plugin: ${plugin}`);
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

function readOverlayScript(plugin) {
  const relativePath = plugin === 'advanced-timer'
    ? 'app/plugins/advanced-timer/overlay/overlay.js'
    : plugin === 'goals'
      ? 'app/plugins/goals/overlay/overlay.js'
      : null;
  if (!relativePath) throw new Error(`Unknown overlay fixture plugin: ${plugin}`);
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

module.exports = { createFixtureTransport, readOverlayHtml, readOverlayScript };
