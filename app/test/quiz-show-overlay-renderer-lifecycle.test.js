'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const APP_ROOT = path.resolve(__dirname, '..');
const HTML_PATH = path.join(APP_ROOT, 'plugins/quiz-show/quiz_show_overlay.html');
const SCRIPT_PATH = path.join(APP_ROOT, 'plugins/quiz-show/quiz_show_overlay.js');
const RENDER_MODE_PATH = path.join(APP_ROOT, 'public/js/public-overlay-render-mode.js');
const ORIGIN = 'http://127.0.0.1:3000';

function makeSocket(connected = false) {
  const handlers = new Map();
  const emitted = [];
  return {
    connected,
    handlers,
    emitted,
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
    }
  };
}

function installTimers(window) {
  let nextId = 0;
  const timeouts = new Map();
  const intervals = new Map();
  const animationFrames = new Map();
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
  window.requestAnimationFrame = callback => {
    const id = ++nextId;
    animationFrames.set(id, callback);
    return id;
  };
  window.cancelAnimationFrame = id => animationFrames.delete(id);
  return {
    timeouts,
    intervals,
    animationFrames,
    runLastTimeout() {
      const entry = [...timeouts.entries()].at(-1);
      if (!entry) throw new Error('No synthetic timeout is pending');
      timeouts.delete(entry[0]);
      entry[1].callback();
    }
  };
}

async function createRenderer({ connected = false } = {}) {
  const rendererErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('log', () => {});
  virtualConsole.on('info', () => {});
  virtualConsole.on('warn', message => rendererErrors.push(String(message)));
  virtualConsole.on('error', message => rendererErrors.push(String(message)));
  virtualConsole.on('jsdomError', error => rendererErrors.push(error.message));
  const dom = new JSDOM(fs.readFileSync(HTML_PATH, 'utf8'), {
    url: `${ORIGIN}/quiz-show/overlay`,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole
  });
  const { window } = dom;
  const socket = makeSocket(connected);
  const timers = installTimers(window);
  const requests = [];
  const deniedRequests = [];
  window.io = () => socket;
  window.fetch = async (input, options = {}) => {
    const url = new URL(String(input), ORIGIN);
    const method = String(options.method || 'GET').toUpperCase();
    requests.push({ method, path: url.pathname, search: url.search });
    if (url.origin !== ORIGIN || method !== 'GET') {
      deniedRequests.push({ method, url: url.href });
      return { ok: false, status: 404, json: async () => ({ success: false }) };
    }
    if (url.pathname === '/api/quiz-show/hud-config') {
      return { ok: true, status: 200, json: async () => ({ success: true, config: {} }) };
    }
    if (url.pathname === '/api/quiz-show/brand-kit') {
      return { ok: true, status: 200, json: async () => ({ success: false }) };
    }
    if (url.pathname === '/api/quiz-show/state') {
      return { ok: true, status: 200, json: async () => ({ success: true, config: { customLayoutEnabled: false } }) };
    }
    deniedRequests.push({ method, url: url.href });
    return { ok: false, status: 404, json: async () => ({ success: false }) };
  };
  window.eval(fs.readFileSync(RENDER_MODE_PATH, 'utf8'));
  window.eval(fs.readFileSync(SCRIPT_PATH, 'utf8'));
  await new Promise(resolve => window.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  await new Promise(resolve => setImmediate(resolve));
  await Promise.resolve();
  return { dom, socket, timers, requests, deniedRequests, rendererErrors };
}

describe('Quiz Show original public renderer lifecycle fixture', () => {
  test('loads original entry, reads only existing GET surfaces and renders a synthetic state update', async () => {
    const { dom, socket, requests, deniedRequests, rendererErrors } = await createRenderer();
    try {
      expect(fs.readFileSync(HTML_PATH, 'utf8')).toContain('<script src="/js/public-overlay-render-mode.js"></script>');
      expect(fs.readFileSync(HTML_PATH, 'utf8')).toContain('<script src="/quiz-show/quiz_show_overlay.js"></script>');
      expect(requests.map(request => request.path).sort()).toEqual([
        '/api/quiz-show/brand-kit',
        '/api/quiz-show/hud-config',
        '/api/quiz-show/state'
      ]);
      expect(requests.every(request => request.method === 'GET')).toBe(true);
      expect(deniedRequests).toEqual([]);

      socket.deliver('quiz-show:state-update', {
        isRunning: true,
        currentQuestion: { question: 'Synthetic question?', answers: ['A', 'B', 'C', 'D'] },
        timeRemaining: 20,
        totalTime: 30,
        currentRound: 1,
        totalRounds: 2,
        showRoundNumber: true,
        votersPerAnswer: { 0: [], 1: [], 2: [], 3: [] }
      });
      expect(dom.window.document.getElementById('questionText').textContent).toContain('Synthetic question?');
      expect(dom.window.document.getElementById('answerA').textContent).toBe('A');
      expect(socket.emitted).toEqual([]);
      expect(rendererErrors).toEqual([]);
    } finally {
      dom.window.close();
    }
  });

  test('requests the projected public state on connect, reconnect and BFCache restore', async () => {
    const { dom, socket } = await createRenderer();
    try {
      socket.deliver('connect');
      socket.deliver('connect');
      expect(socket.emitted).toEqual([
        { event: 'quiz-show:get-public-state', payload: undefined },
        { event: 'quiz-show:get-public-state', payload: undefined }
      ]);

      dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pageshow', { persisted: true }));
      expect(socket.emitted).toHaveLength(3);
      expect(socket.emitted[2].event).toBe('quiz-show:get-public-state');
    } finally {
      dom.window.close();
    }
  });

  test('requests one fresh public state when already connected before DOMContentLoaded', async () => {
    const { dom, socket } = await createRenderer({ connected: true });
    try {
      expect(socket.emitted).toEqual([
        { event: 'quiz-show:get-public-state', payload: undefined }
      ]);
    } finally {
      dom.window.close();
    }
  });

  test('keeps the page during BFCache and clears renderer socket, timeouts and animation frames on final pagehide', async () => {
    const { dom, socket, timers } = await createRenderer();
    const { window } = dom;
    try {
      socket.deliver('quiz-show:state-update', {
        isRunning: true,
        currentQuestion: { question: 'Lifecycle fixture?', answers: ['A', 'B', 'C', 'D'] },
        timeRemaining: 20,
        totalTime: 30,
        currentRound: 1,
        totalRounds: 1,
        showRoundNumber: true,
        votersPerAnswer: { 0: [], 1: [], 2: [], 3: [] }
      });
      timers.runLastTimeout();
      const lateSocketCallbacks = socket.capture('quiz-show:state-update');
      const lateConnectCallbacks = socket.capture('connect');
      const lateTimeoutCallbacks = [...timers.timeouts.values()].map(timer => timer.callback);
      const lateIntervalCallbacks = [...timers.intervals.values()].map(timer => timer.callback);
      const lateAnimationFrames = [...timers.animationFrames.values()];

      window.dispatchEvent(new window.PageTransitionEvent('pagehide', { persisted: true }));
      window.dispatchEvent(new window.PageTransitionEvent('pageshow', { persisted: true }));
      expect(socket.disconnectCalls).toBe(0);
      expect(socket.handlers.get('quiz-show:state-update')).toHaveLength(1);

      window.dispatchEvent(new window.PageTransitionEvent('pagehide', { persisted: false }));
      expect(socket.disconnectCalls).toBe(1);
      expect(socket.handlers.get('quiz-show:state-update')).toHaveLength(0);
      expect(timers.timeouts.size).toBe(0);
      expect(timers.intervals.size).toBe(0);
      expect(timers.animationFrames.size).toBe(0);

      const questionAfterDestroy = window.document.getElementById('questionText').textContent;
      lateSocketCallbacks.forEach(callback => callback({ isRunning: true, currentQuestion: { question: 'Too late', answers: [] } }));
      const emittedBeforeLateConnect = socket.emitted.length;
      lateConnectCallbacks.forEach(callback => callback());
      lateTimeoutCallbacks.forEach(callback => callback());
      lateIntervalCallbacks.forEach(callback => callback());
      lateAnimationFrames.forEach(callback => callback(1));
      expect(window.document.getElementById('questionText').textContent).toBe(questionAfterDestroy);
      expect(socket.emitted).toHaveLength(emittedBeforeLateConnect);
    } finally {
      dom.window.close();
    }
  });
});
