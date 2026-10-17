'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const HTML_PATH = path.join(PLUGIN_ROOT, 'overlay/overlay.html');
const SCRIPT_PATH = path.join(PLUGIN_ROOT, 'overlay/overlay.js');

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

async function loadRenderer() {
  const dom = new JSDOM(fs.readFileSync(HTML_PATH, 'utf8'), {
    url: 'http://127.0.0.1:3000/plugins/coinbattle/overlay/overlay.html?showAvatars=false&showBadges=false',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  const { window } = dom;
  const socket = makeSocket();
  const timers = installTimers(window);
  window.io = () => socket;
  window.eval(fs.readFileSync(SCRIPT_PATH, 'utf8'));
  await new Promise(resolve => window.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  await new Promise(resolve => setImmediate(resolve));
  return { dom, socket, timers };
}

describe('CoinBattle original overlay renderer lifecycle fixture', () => {
  test('loads original HTML and renderer and requests the initial state', async () => {
    const { dom, socket } = await loadRenderer();
    try {
      expect(fs.readFileSync(HTML_PATH, 'utf8')).toContain('<script src="/plugins/coinbattle/overlay/overlay.js"></script>');
      expect(socket.emitted.map(item => item.event)).toEqual(['coinbattle:get-state']);
      socket.deliver('coinbattle:match-state', {
        active: false,
        match: null,
        leaderboard: [],
        teamScores: null,
        multiplier: { active: false }
      });
      expect(dom.window.document.getElementById('timer-container').style.display).toBe('none');
    } finally {
      dom.window.close();
    }
  });

  test('renders match state and timer updates, then requests fresh state after reconnect', async () => {
    const { dom, socket } = await loadRenderer();
    try {
      socket.deliver('coinbattle:match-state', {
        active: true,
        match: { mode: 'solo', remaining: 300 },
        leaderboard: [{ user_id: 'fixture-user', nickname: 'Fixture Viewer', coins: 12 }],
        teamScores: null,
        multiplier: { active: false }
      });
      expect(dom.window.document.getElementById('timer-container').style.display).not.toBe('none');
      expect(dom.window.document.querySelector('.entry-name').textContent).toBe('Fixture Viewer');

      socket.deliver('coinbattle:timer-update', { remaining: 82, total: 300 });
      expect(dom.window.document.getElementById('timer-display').textContent).toBe('01:22');

      socket.deliver('connect');
      expect(socket.emitted.map(item => item.event)).toEqual([
        'coinbattle:get-state',
        'coinbattle:get-state'
      ]);
    } finally {
      dom.window.close();
    }
  });

  test('preserves BFCache state and disposes renderer listeners and owned timers on final pagehide', async () => {
    const { dom, socket, timers } = await loadRenderer();
    const { window } = dom;
    try {
      socket.deliver('coinbattle:match-state', {
        active: true,
        match: { mode: 'solo', remaining: 300 },
        leaderboard: [{ user_id: 'fixture-user', nickname: 'Before BFCache', coins: 12 }],
        teamScores: null,
        multiplier: { active: false }
      });
      socket.deliver('coinbattle:gift-received', {});
      const lateSocketCallbacks = socket.capture('coinbattle:timer-update');
      const lateIntervalCallbacks = [...timers.intervals.values()].map(timer => timer.callback);
      const lateTimeoutCallbacks = [...timers.timeouts.values()].map(timer => timer.callback);
      const requestsBeforeHide = socket.emitted.length;

      window.dispatchEvent(new window.PageTransitionEvent('pagehide', { persisted: true }));
      window.dispatchEvent(new window.PageTransitionEvent('pageshow', { persisted: true }));
      expect(socket.disconnectCalls).toBe(0);
      expect(socket.handlers.get('coinbattle:timer-update')).toHaveLength(1);

      socket.deliver('coinbattle:timer-update', { remaining: 77, total: 300 });
      expect(window.document.getElementById('timer-display').textContent).toBe('01:17');

      window.dispatchEvent(new window.PageTransitionEvent('pagehide', { persisted: false }));
      expect(socket.disconnectCalls).toBe(1);
      expect(socket.handlers.get('coinbattle:timer-update')).toHaveLength(0);
      expect(timers.intervals.size).toBe(0);
      expect(timers.timeouts.size).toBe(0);

      const displayAfterDestroy = window.document.getElementById('timer-display').textContent;
      lateSocketCallbacks.forEach(callback => callback({ remaining: 1, total: 300 }));
      lateIntervalCallbacks.forEach(callback => callback());
      lateTimeoutCallbacks.forEach(callback => callback());
      expect(window.document.getElementById('timer-display').textContent).toBe(displayAfterDestroy);
      expect(socket.emitted).toHaveLength(requestsBeforeHide);
    } finally {
      dom.window.close();
    }
  });
});
