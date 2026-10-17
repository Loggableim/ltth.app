'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const HTML_PATH = path.join(__dirname, '..', 'overlay/game-hud.html');
const ORIGIN = 'http://127.0.0.1:3000';

function makeSocket() {
  const handlers = new Map();
  const emitted = [];
  return {
    handlers,
    emitted,
    connected: true,
    disconnectCalls: 0,
    on(event, handler) {
      const list = handlers.get(event) || [];
      list.push(handler);
      handlers.set(event, list);
    },
    off(event, handler) {
      handlers.set(event, (handlers.get(event) || []).filter(candidate => candidate !== handler));
    },
    emit(event, payload) {
      emitted.push({ event, payload });
    },
    deliver(event, payload) {
      for (const handler of [...(handlers.get(event) || [])]) handler(payload);
    },
    capture(event) {
      return [...(handlers.get(event) || [])];
    },
    disconnect() {
      this.disconnectCalls += 1;
      this.connected = false;
    }
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

function deferred() {
  let resolve;
  const promise = new Promise(resolvePromise => { resolve = resolvePromise; });
  return { promise, resolve };
}

async function createRenderer() {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('log', () => {});
  virtualConsole.on('info', () => {});
  virtualConsole.on('warn', message => errors.push(String(message)));
  virtualConsole.on('error', message => errors.push(String(message)));
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(fs.readFileSync(HTML_PATH, 'utf8'), {
    url: `${ORIGIN}/plugins/game-engine/overlay/game-hud.html?hideWhenInactive=true`,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.io = () => socket;
      window.fetch = input => {
        const url = new URL(String(input), ORIGIN);
        requests.push({ method: 'GET', path: url.pathname });
        if (url.origin !== ORIGIN || url.pathname !== '/api/game-engine/active-session') {
          deniedRequests.push(url.href);
          return Promise.resolve({ ok: false, json: async () => null });
        }
        const pending = deferred();
        pendingReads.push(pending);
        return pending.promise;
      };
      const timers = installTimers(window);
      window.__fixtureTimers = timers;
      window.__fixtureSocket = socket;
    }
  });
  await new Promise(resolve => setImmediate(resolve));
  await Promise.resolve();
  return { dom, socket, timers: dom.window.__fixtureTimers, requests, deniedRequests, pendingReads, errors };
}

let socket;
let requests;
let deniedRequests;
let pendingReads;

beforeEach(() => {
  socket = makeSocket();
  requests = [];
  deniedRequests = [];
  pendingReads = [];
});

function sessionState({ moveCount = 3, player1 = 'Ada', status = 'active' } = {}) {
  return {
    status,
    player1: { nickname: player1, role: 'viewer', color: '#f00' },
    player2: { nickname: 'Bea', role: 'streamer', color: '#00f' },
    currentPlayer: 1,
    moveCount
  };
}

function activeSession(sessionId, state) {
  return { sessionId, gameType: 'connect4', state };
}

async function settle() {
  await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
  await Promise.resolve();
}

describe('Game Engine game-hud original renderer fixture', () => {
  test('loads the real HUD, reads only its allowlisted active-session GET, renders initial state and move updates', async () => {
    const fixture = await createRenderer();
    const { dom } = fixture;
    try {
      expect(fs.readFileSync(HTML_PATH, 'utf8')).toContain("io({ auth: { role: 'overlay' } })");
      expect(requests).toEqual([{ method: 'GET', path: '/api/game-engine/active-session' }]);
      expect(deniedRequests).toEqual([]);
      expect(socket.emitted).toEqual([]);

      pendingReads[0].resolve({ json: async () => activeSession('session-fixture', sessionState()) });
      await settle();
      expect(dom.window.document.getElementById('hud').classList.contains('active')).toBe(true);
      expect(dom.window.document.getElementById('player1-name').textContent).toBe('Ada');
      expect(dom.window.document.getElementById('move-count').textContent).toBe('3');

      socket.deliver('game-engine:move-made', {
        sessionId: 'session-fixture',
        state: sessionState({ moveCount: 4 })
      });
      expect(dom.window.document.getElementById('move-count').textContent).toBe('4');
      expect(requests.every(request => request.method === 'GET')).toBe(true);
    } finally {
      dom.window.close();
    }
  });

  test('reconnect reloads current state; newer socket state wins over late reads', async () => {
    const fixture = await createRenderer();
    const { dom } = fixture;
    try {
      const initialRead = pendingReads[0];
      socket.deliver('game-engine:game-started', {
        sessionId: 'live-session',
        gameType: 'connect4',
        state: sessionState({ moveCount: 8, player1: 'Live Viewer' })
      });
      initialRead.resolve({ json: async () => activeSession('stale-session', sessionState({ player1: 'Stale Viewer' })) });
      await settle();
      expect(dom.window.document.getElementById('player1-name').textContent).toBe('Live Viewer');
      expect(dom.window.document.getElementById('move-count').textContent).toBe('8');

      socket.deliver('connect');
      expect(requests).toHaveLength(2);
      pendingReads[1].resolve({ json: async () => activeSession('reconnected-session', sessionState({ moveCount: 11, player1: 'Reconnected Viewer' })) });
      await settle();
      expect(dom.window.document.getElementById('player1-name').textContent).toBe('Reconnected Viewer');
      expect(dom.window.document.getElementById('move-count').textContent).toBe('11');
    } finally {
      dom.window.close();
    }
  });

  test('preserves BFCache state and cleans late reads, timers and socket handlers on final pagehide', async () => {
    const fixture = await createRenderer();
    const { dom, timers } = fixture;
    const { window } = dom;
    try {
      pendingReads[0].resolve({ json: async () => activeSession('session-fixture', sessionState()) });
      await settle();
      socket.deliver('plinko:spawn-ball', { ballId: 'fixture-ball', nickname: 'Synthetic Viewer', bet: 5 });
      socket.deliver('connect');
      const lateRead = pendingReads[1];
      const lateSocketCallbacks = socket.capture('game-engine:move-made');
      const lateTimeoutCallbacks = [...timers.timeouts.values()].map(timer => timer.callback);
      const lateIntervalCallbacks = [...timers.intervals.values()].map(timer => timer.callback);

      window.dispatchEvent(new window.PageTransitionEvent('pagehide', { persisted: true }));
      window.dispatchEvent(new window.PageTransitionEvent('pageshow', { persisted: true }));
      expect(socket.disconnectCalls).toBe(0);
      expect(socket.handlers.get('game-engine:move-made')).toHaveLength(1);

      window.dispatchEvent(new window.PageTransitionEvent('pagehide', { persisted: false }));
      expect(socket.disconnectCalls).toBe(1);
      expect(socket.handlers.get('game-engine:move-made')).toHaveLength(0);
      expect(timers.timeouts.size).toBe(0);
      expect(timers.intervals.size).toBe(0);

      const playerNameAfterDestroy = window.document.getElementById('player1-name').textContent;
      lateRead.resolve({ json: async () => activeSession('late-session', sessionState({ player1: 'Too Late' })) });
      lateSocketCallbacks.forEach(callback => callback({ sessionId: 'session-fixture', state: sessionState({ player1: 'Too Late' }) }));
      lateTimeoutCallbacks.forEach(callback => callback());
      lateIntervalCallbacks.forEach(callback => callback());
      await settle();
      expect(window.document.getElementById('player1-name').textContent).toBe(playerNameAfterDestroy);
    } finally {
      dom.window.close();
    }
  });
});
