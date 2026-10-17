'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const HTML_PATH = path.join(ROOT, 'overlay/overlay.html');
const SCRIPT_PATH = path.join(ROOT, 'overlay/overlay.js');

function loadLocale(locale) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, `locales/${locale}.json`), 'utf8'));
}

function makeI18n(bundle) {
  return {
    t(key, params = {}) {
      const value = key.split('.').reduce((current, part) => current && current[part], bundle);
      if (typeof value !== 'string') return key;
      return value.replace(/\{(\w+)\}/g, (match, name) => (
        Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
      ));
    }
  };
}

function makeSocket() {
  const handlers = new Map();
  return {
    handlers,
    emitted: [],
    disconnectCalls: 0,
    on(event, handler) { handlers.set(event, [...(handlers.get(event) || []), handler]); },
    off(event, handler) { handlers.set(event, (handlers.get(event) || []).filter(item => item !== handler)); },
    emit(event, payload) { this.emitted.push({ event, payload }); },
    deliver(event, payload) { for (const handler of [...(handlers.get(event) || [])]) handler(payload); },
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

function advanceIntervals(intervals, ticks = 40) {
  for (let tick = 0; tick < ticks; tick += 1) {
    for (const timer of [...intervals.values()]) timer.callback();
  }
}

async function createOverlay(locale) {
  const socket = makeSocket();
  const timersRef = { current: null };
  const dom = new JSDOM(fs.readFileSync(HTML_PATH, 'utf8'), {
    url: `http://127.0.0.1/plugins/coinbattle/overlay/overlay.html?lang=${locale}`,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.i18n = makeI18n(loadLocale(locale));
      window.io = () => socket;
      timersRef.current = installTimers(window);
    }
  });
  dom.window.eval(fs.readFileSync(SCRIPT_PATH, 'utf8'));
  await new Promise(resolve => setImmediate(resolve));
  return { dom, socket, timers: timersRef.current };
}

describe('OBS-104 CoinBattle original overlay fixtures (DE/ES/FR)', () => {
  test.each(['de', 'es', 'fr'])('%s applies match-state events to localized team presentation and disposes', async locale => {
    const { dom, socket, timers } = await createOverlay(locale);
    const bundle = loadLocale(locale);
    const translations = bundle.plugins.coinbattle.runtime.overlay;
    try {
      socket.deliver('coinbattle:match-state', {
        active: true,
        match: { mode: 'team', remaining: 120 },
        leaderboard: [],
        teamScores: { red: 8, blue: 5 },
        multiplier: { active: false }
      });
      advanceIntervals(timers.intervals);

      expect(dom.window.document.getElementById('team-scores-container').style.display).toBe('flex');
      expect(dom.window.document.getElementById('team-red-name').textContent).toBe(translations.red_team);
      expect(dom.window.document.getElementById('team-blue-name').textContent).toBe(translations.blue_team);
      expect(dom.window.document.getElementById('team-red-coins').textContent).toBe('8');
      expect(dom.window.document.getElementById('team-blue-coins').textContent).toBe('5');

      const lateEvent = socket.handlers.get('coinbattle:match-state')[0];
      dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide', { persisted: false }));
      expect(socket.disconnectCalls).toBe(1);
      expect([...socket.handlers.values()].every(list => list.length === 0)).toBe(true);
      expect(timers.timeouts.size).toBe(0);
      expect(timers.intervals.size).toBe(0);
      const redAfterDestroy = dom.window.document.getElementById('team-red-coins').textContent;
      lateEvent({ active: true, match: { mode: 'team' }, teamScores: { red: 99, blue: 0 }, leaderboard: [] });
      expect(dom.window.document.getElementById('team-red-coins').textContent).toBe(redAfterDestroy);
      expect(socket.emitted.map(item => item.event)).toEqual(['coinbattle:get-state']);
    } finally {
      dom.window.close();
    }
  });
});
