'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const CLIENT_SOURCE = fs.readFileSync(path.join(__dirname, '../public/js/i18n-client.js'), 'utf8');
const RETRY_BUDGET = 20;

function createSocket() {
  const handlers = new Map();
  const calls = [];
  return {
    handlers,
    calls,
    on(event, handler) {
      calls.push(['on', event, handler]);
      const list = handlers.get(event) || [];
      list.push(handler);
      handlers.set(event, list);
      return this;
    },
    off(event, handler) {
      calls.push(['off', event, handler]);
      handlers.set(event, (handlers.get(event) || []).filter(candidate => candidate !== handler));
      return this;
    },
    emit(...args) {
      calls.push(['emit', ...args]);
      return this;
    },
    disconnect() {
      calls.push(['disconnect']);
      return this;
    }
  };
}

function pageLifecycleEvent(window, type, persisted) {
  const event = new window.Event(type);
  Object.defineProperty(event, 'persisted', { value: persisted });
  return event;
}

function createI18nSocketFixture({ ioPresent = true, socket, deferTranslations = false } = {}) {
  const timers = new Map();
  const clearedTimers = [];
  const pendingFetches = [];
  const fetchCalls = [];
  const unhandledRejections = [];
  let nextTimerId = 0;
  const dom = new JSDOM('<!doctype html><html lang="de"><head></head><body><span data-i18n="test.label">Fallback</span></body></html>', {
    url: 'http://127.0.0.1:3000/test?lang=de',
    runScripts: 'outside-only',
    beforeParse(window) {
      Object.defineProperty(window.document, 'readyState', { configurable: true, value: 'complete' });
      if (ioPresent) window.io = () => { throw new Error('i18n must not create a socket connection'); };
      if (socket) window.socket = socket;
      window.addEventListener('unhandledrejection', event => unhandledRejections.push(event.reason));
      window.fetch = url => {
        fetchCalls.push(String(url));
        const response = { ok: true, status: 200, statusText: 'OK', json: async () => ({ test: { label: 'Translated' } }) };
        if (!deferTranslations) return Promise.resolve(response);
        return new Promise(resolve => pendingFetches.push(() => resolve(response)));
      };
      window.setTimeout = (callback, delay = 0) => {
        const id = ++nextTimerId;
        timers.set(id, { callback, delay });
        return id;
      };
      window.clearTimeout = id => {
        clearedTimers.push(id);
        timers.delete(id);
      };
      window.console = { log() {}, warn() {}, error() {}, debug() {} };
    }
  });
  dom.window.eval(CLIENT_SOURCE);
  return {
    dom,
    timers,
    clearedTimers,
    pendingFetches,
    fetchCalls,
    unhandledRejections,
    async waitForReady() { await dom.window.i18n.ready; },
    tick() {
      const next = timers.entries().next().value;
      if (!next) return false;
      timers.delete(next[0]);
      next[1].callback();
      return true;
    },
    resolveFetches() {
      for (const resolve of pendingFetches.splice(0)) resolve();
    },
    close() {
      dom.window.dispatchEvent(new dom.window.Event('pagehide'));
      dom.window.close();
    }
  };
}

describe('shared i18n socket-sync lifecycle', () => {
  test('retry budget stops after 20 ticks without creating a socket or leaving a timer', async () => {
    const fixture = createI18nSocketFixture();
    try {
      await fixture.waitForReady();
      expect(fixture.timers.size).toBe(1);
      expect([...fixture.timers.values()].map(timer => timer.delay)).toEqual([100]);
      expect(fixture.dom.window.socket).toBeUndefined();

      let ticks = 0;
      while (fixture.tick()) ticks += 1;
      expect(ticks).toBe(RETRY_BUDGET);
      expect(fixture.timers.size).toBe(0);
      expect(fixture.dom.window.i18n.currentLocale).toBe('de');
      expect(fixture.unhandledRejections).toEqual([]);
    } finally {
      fixture.close();
    }
    expect(fixture.timers.size).toBe(0);
  });

  test('binds the existing late socket once while retry budget remains', async () => {
    const fixture = createI18nSocketFixture();
    const socket = createSocket();
    try {
      await fixture.waitForReady();
      fixture.dom.window.socket = socket;
      expect(fixture.tick()).toBe(true);
      expect(socket.calls.filter(call => call[0] === 'on').map(call => call[1])).toEqual([
        'locale-changed', 'language-changed'
      ]);
      expect(fixture.timers.size).toBe(0);

      socket.handlers.get('locale-changed')[0]({ locale: 'de' });
      expect(socket.calls.filter(call => call[0] === 'on')).toHaveLength(2);
      expect(socket.calls.some(call => call[0] === 'emit' || call[0] === 'disconnect')).toBe(false);
      socket.handlers.get('language-changed')[0]({ locale: 'fr' });
      expect(fixture.fetchCalls).toContain('/api/i18n/translations/fr');
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(fixture.dom.window.i18n.currentLocale).toBe('fr');
      expect(fixture.unhandledRejections).toEqual([]);
    } finally {
      fixture.close();
    }
  });

  test('starts the bounded existing-socket retry when i18n loads before Socket.IO', async () => {
    const fixture = createI18nSocketFixture({ ioPresent: false });
    const socket = createSocket();
    try {
      await fixture.waitForReady();
      expect(fixture.timers.size).toBe(1);

      fixture.dom.window.io = () => { throw new Error('i18n must not create a socket connection'); };
      fixture.dom.window.socket = socket;
      expect(fixture.tick()).toBe(true);
      expect(socket.calls.filter(call => call[0] === 'on').map(call => call[1])).toEqual([
        'locale-changed', 'language-changed'
      ]);
      expect(fixture.timers.size).toBe(0);
    } finally {
      fixture.close();
    }
  });

  test('pagehide cancels pending retry, resolves ready, and repeated cleanup has no side effects', async () => {
    const fixture = createI18nSocketFixture({ deferTranslations: true });
    const lateSocket = createSocket();
    try {
      const ready = fixture.dom.window.i18n.ready;
      let readySettled = false;
      ready.then(() => { readySettled = true; });
      expect(fixture.timers.size).toBe(1);
      expect(fixture.pendingFetches).toHaveLength(1);

      fixture.dom.window.dispatchEvent(new fixture.dom.window.Event('pagehide'));
      fixture.dom.window.dispatchEvent(new fixture.dom.window.Event('pagehide'));
      await ready;
      await Promise.resolve();
      expect(readySettled).toBe(true);
      expect(fixture.timers.size).toBe(0);
      expect(fixture.clearedTimers).toHaveLength(1);

      fixture.dom.window.socket = lateSocket;
      expect(fixture.tick()).toBe(false);
      expect(lateSocket.calls).toEqual([]);
      fixture.resolveFetches();
      await Promise.resolve();
      await Promise.resolve();
      expect(fixture.dom.window.i18n.currentLocale).toBe('de');
      expect(fixture.dom.window.document.querySelector('[data-i18n]').textContent).toBe('Fallback');
      expect(fixture.unhandledRejections).toEqual([]);
      expect(lateSocket.calls.some(call => call[0] === 'emit' || call[0] === 'disconnect')).toBe(false);
    } finally {
      fixture.close();
    }
    expect(fixture.timers.size).toBe(0);
  });

  test('pagehide removes only the client-owned handlers from the existing socket', async () => {
    const socket = createSocket();
    const foreignHandler = jest.fn();
    socket.on('locale-changed', foreignHandler);
    const fixture = createI18nSocketFixture({ socket });
    try {
      await fixture.waitForReady();
      const capturedHandlers = ['locale-changed', 'language-changed'].map(event => socket.handlers.get(event).at(-1));
      expect(socket.calls.filter(call => call[0] === 'on')).toHaveLength(3);

      fixture.dom.window.dispatchEvent(new fixture.dom.window.Event('pagehide'));
      fixture.dom.window.dispatchEvent(new fixture.dom.window.Event('pagehide'));
      expect(socket.handlers.get('locale-changed')).toEqual([foreignHandler]);
      expect(socket.handlers.get('language-changed')).toEqual([]);
      expect(socket.calls.filter(call => call[0] === 'off')).toHaveLength(2);
      for (const handler of capturedHandlers) handler({ locale: 'en' });
      await Promise.resolve();

      expect(fixture.dom.window.i18n.currentLocale).toBe('de');
      expect(fixture.fetchCalls).toEqual(['/api/i18n/translations/de']);
      expect(socket.calls.some(call => call[0] === 'emit' || call[0] === 'disconnect')).toBe(false);
      expect(fixture.unhandledRejections).toEqual([]);
    } finally {
      fixture.close();
    }
  });

  test('BFCache pagehide/pageshow preserves an existing socket sync listener and locale changes', async () => {
    const socket = createSocket();
    const fixture = createI18nSocketFixture({ socket });
    try {
      await fixture.waitForReady();
      for (let cycle = 0; cycle < 2; cycle += 1) {
        fixture.dom.window.dispatchEvent(pageLifecycleEvent(fixture.dom.window, 'pagehide', true));
        fixture.dom.window.dispatchEvent(pageLifecycleEvent(fixture.dom.window, 'pageshow', true));
      }

      expect(socket.handlers.get('locale-changed')).toHaveLength(1);
      expect(socket.handlers.get('language-changed')).toHaveLength(1);
      socket.handlers.get('locale-changed')[0]({ locale: 'fr' });
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(fixture.dom.window.i18n.currentLocale).toBe('fr');
      expect(socket.calls.filter(call => call[0] === 'on')).toHaveLength(2);
      expect(socket.calls.some(call => call[0] === 'emit' || call[0] === 'disconnect')).toBe(false);
      expect(fixture.unhandledRejections).toEqual([]);
    } finally {
      fixture.close();
    }
  });

  test('BFCache restore keeps a pending late-socket retry alive', async () => {
    const fixture = createI18nSocketFixture();
    const socket = createSocket();
    try {
      await fixture.waitForReady();
      for (let cycle = 0; cycle < 2; cycle += 1) {
        fixture.dom.window.dispatchEvent(pageLifecycleEvent(fixture.dom.window, 'pagehide', true));
        fixture.dom.window.dispatchEvent(pageLifecycleEvent(fixture.dom.window, 'pageshow', true));
      }
      fixture.dom.window.socket = socket;

      expect(fixture.tick()).toBe(true);
      expect(socket.calls.filter(call => call[0] === 'on').map(call => call[1])).toEqual([
        'locale-changed', 'language-changed'
      ]);
      expect(fixture.timers.size).toBe(0);
    } finally {
      fixture.close();
    }
  });
});
