'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const HTML_PATH = path.join(ROOT, 'overlay/game-hud.html');

function loadLocale(locale) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, `locales/${locale}.json`), 'utf8'));
}

function makeI18n(bundle) {
  return {
    initialized: true,
    ready: Promise.resolve(),
    t(key, params = {}) {
      const value = key.split('.').reduce((current, part) => current && current[part], bundle);
      if (typeof value !== 'string') return key;
      return value.replace(/\{(\w+)\}/g, (match, name) => (
        Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
      ));
    },
    onChange() {},
    onLanguageChange() {}
  };
}

function makeSocket() {
  const handlers = new Map();
  return {
    handlers,
    emitted: [],
    disconnectCalls: 0,
    on(event, handler) {
      handlers.set(event, [...(handlers.get(event) || []), handler]);
    },
    off(event, handler) {
      handlers.set(event, (handlers.get(event) || []).filter(candidate => candidate !== handler));
    },
    emit(event, payload) { this.emitted.push({ event, payload }); },
    deliver(event, payload) {
      for (const handler of [...(handlers.get(event) || [])]) handler(payload);
    },
    disconnect() { this.disconnectCalls += 1; }
  };
}

function installTimers(window) {
  let nextId = 0;
  const timeouts = new Map();
  const intervals = new Map();
  window.setTimeout = (callback, delay = 0) => {
    const id = ++nextId;
    timeouts.set(id, { callback, delay });
    return id;
  };
  window.clearTimeout = id => timeouts.delete(id);
  window.setInterval = (callback, delay = 0) => {
    const id = ++nextId;
    intervals.set(id, { callback, delay });
    return id;
  };
  window.clearInterval = id => intervals.delete(id);
  return { timeouts, intervals };
}

async function settle() {
  await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
  await Promise.resolve();
}

async function createHud(locale) {
  const socket = makeSocket();
  const requests = [];
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(fs.readFileSync(HTML_PATH, 'utf8'), {
    url: `http://127.0.0.1:3000/plugins/game-engine/overlay/game-hud.html?lang=${locale}`,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.i18n = makeI18n(loadLocale(locale));
      window.io = () => socket;
      window.fetch = async input => {
        const url = new URL(String(input), window.location.href);
        requests.push({ method: 'GET', pathname: url.pathname });
        if (url.origin !== 'http://127.0.0.1:3000' || url.pathname !== '/api/game-engine/active-session') {
          throw new Error(`unexpected fixture request: ${url.pathname}`);
        }
        return { ok: true, json: async () => null };
      };
      window.__fixtureTimers = installTimers(window);
    }
  });
  await settle();
  return { dom, socket, requests, errors, timers: dom.window.__fixtureTimers };
}

describe('OBS-104 Game Engine original HUD fixtures (EN/ES/FR)', () => {
  test.each(['en', 'es', 'fr'])('%s renders a real socket event with its local translation and cleans up', async locale => {
    const fixture = await createHud(locale);
    const { dom, socket, requests, errors, timers } = fixture;
    const bundle = loadLocale(locale);
    const expectedGame = bundle.plugins['game-engine'].ui.runtime.hud.chess;
    const expectedStatus = bundle.plugins['game-engine'].ui.runtime.hud.game_running;
    try {
      expect(requests).toEqual([{ method: 'GET', pathname: '/api/game-engine/active-session' }]);
      expect(socket.emitted).toEqual([]);
      socket.deliver('game-engine:game-started', {
        sessionId: `synthetic-${locale}`,
        gameType: 'chess',
        state: {
          status: 'active',
          whitePlayer: { nickname: 'Synthetic White', side: 'white' },
          blackPlayer: { nickname: 'Synthetic Black', side: 'black' },
          currentPlayer: 'white',
          moveCount: 4
        }
      });

      expect(dom.window.document.getElementById('game-name').textContent).toBe(expectedGame);
      expect(dom.window.document.getElementById('game-status').textContent).toBe(expectedStatus);
      expect(dom.window.document.getElementById('player1-name').textContent).toBe('Synthetic White');
      expect(dom.window.document.getElementById('move-count').textContent).toBe('4');
      expect(timers.intervals.size).toBe(1);
      expect(errors).toEqual([]);

      const lateEvent = socket.handlers.get('game-engine:game-started')[0];
      dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide', { persisted: false }));
      expect(socket.disconnectCalls).toBe(1);
      expect([...socket.handlers.values()].every(list => list.length === 0)).toBe(true);
      expect(timers.timeouts.size).toBe(0);
      expect(timers.intervals.size).toBe(0);
      const nameAfterDispose = dom.window.document.getElementById('player1-name').textContent;
      lateEvent({ sessionId: 'late', gameType: 'chess', state: { status: 'active', whitePlayer: { nickname: 'Late' } } });
      expect(dom.window.document.getElementById('player1-name').textContent).toBe(nameAfterDispose);
    } finally {
      dom.window.close();
    }
  });
});
