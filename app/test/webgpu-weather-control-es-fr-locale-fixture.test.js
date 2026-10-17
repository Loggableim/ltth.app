'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const APP_ROOT = path.resolve(__dirname, '..');
const PLUGIN_ROOT = path.join(APP_ROOT, 'plugins/webgpu-weather-control');
const HTML_PATH = path.join(PLUGIN_ROOT, 'overlay.html');
const ORIGIN = 'http://127.0.0.1:3000';

function nextTurn() {
  return new Promise(resolve => setImmediate(resolve));
}

function resolveKey(dictionary, key) {
  return key.split('.').reduce((value, part) => value && value[part], dictionary);
}

function createSocket() {
  const handlers = new Map();
  return {
    connected: false,
    handlers,
    emitted: [],
    disconnected: false,
    on(eventName, handler) {
      handlers.set(eventName, [...(handlers.get(eventName) || []), handler]);
    },
    off(eventName, handler) {
      handlers.set(eventName, (handlers.get(eventName) || []).filter(item => item !== handler));
    },
    emit(eventName, payload) { this.emitted.push({ eventName, payload }); },
    disconnect() { this.disconnected = true; },
    deliver(eventName, ...args) {
      for (const handler of [...(handlers.get(eventName) || [])]) handler(...args);
    }
  };
}

describe('WebGPU Weather Control overlay locale fixtures', () => {
  test.each([
    ['de', 'de', '?lang=de'],
    ['en', 'en', '?lang=en'],
    ['es', 'es', '?lang=es'],
    ['fr', 'fr', '?lang=fr'],
    ['invalid locale', 'en', '?lang=xx'],
    ['missing locale', 'en', '']
  ])('loads the %s catalog and localizes the original HUD without changing other query state', async (_label, locale, query) => {
    const html = fs.readFileSync(HTML_PATH, 'utf8');
    const localePath = path.join(PLUGIN_ROOT, 'locales', `${locale}.json`);
    const localeData = JSON.parse(fs.readFileSync(localePath, 'utf8'));
    const pluginLocale = localeData.plugins['webgpu-weather-control'];
    const expectedLabels = {
      community: resolveKey(pluginLocale, 'labels.community_weather'),
      meter: resolveKey(pluginLocale, 'ui.overlay.meter'),
      quest: resolveKey(pluginLocale, 'ui.overlay.quest'),
      streak: resolveKey(pluginLocale, 'ui.overlay.streak'),
      reward: resolveKey(pluginLocale, 'runtime.overlay.reward')
    };
    Object.values(expectedLabels).forEach(value => expect(typeof value).toBe('string'));

    const socket = createSocket();
    const requests = [];
    const raf = new Map();
    const timeouts = new Map();
    const intervals = new Map();
    let nextTimerId = 0;
    const rendererErrors = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', error => rendererErrors.push(error.message));
    const dom = new JSDOM(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''), {
      url: `${ORIGIN}/webgpu-weather-control/overlay${query}`,
      runScripts: 'outside-only',
      pretendToBeVisual: true,
      virtualConsole,
      beforeParse(window) {
        window.io = () => socket;
        Object.defineProperty(window.navigator, 'gpu', { value: undefined, configurable: true });
        window.HTMLCanvasElement.prototype.getContext = () => null;
        window.requestAnimationFrame = callback => {
          const id = ++nextTimerId;
          raf.set(id, callback);
          return id;
        };
        window.cancelAnimationFrame = id => raf.delete(id);
        window.setTimeout = callback => {
          const id = ++nextTimerId;
          timeouts.set(id, callback);
          return id;
        };
        window.clearTimeout = id => timeouts.delete(id);
        window.setInterval = callback => {
          const id = ++nextTimerId;
          intervals.set(id, callback);
          return id;
        };
        window.clearInterval = id => intervals.delete(id);
        window.fetch = (input, options = {}) => {
          const url = new URL(String(input), window.location.href);
          const method = String(options.method || 'GET').toUpperCase();
          if (method !== 'GET') {
            throw new Error(`Unexpected request: ${method} ${url.pathname}`);
          }
          requests.push({ method, path: url.pathname });
          const localeMatch = url.pathname.match(/^\/api\/i18n\/translations\/(de|en|es|fr)$/);
          if (localeMatch) {
            const requestedLocaleData = JSON.parse(fs.readFileSync(
              path.join(PLUGIN_ROOT, 'locales', `${localeMatch[1]}.json`), 'utf8'
            ));
            return Promise.resolve({ ok: true, status: 200, json: async () => requestedLocaleData });
          }
          if (url.pathname !== '/api/webgpu-weather/overlay-config') {
            throw new Error(`Unexpected request: ${method} ${url.pathname}`);
          }
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ success: true, config: { qualityPreset: 'medium', effects: {} } })
          });
        };
      }
    });

    try {
      const framegraphSource = fs.readFileSync(path.join(PLUGIN_ROOT, 'gpu/weather-framegraph.js'), 'utf8');
      const engineSource = fs.readFileSync(path.join(PLUGIN_ROOT, 'gpu/cinematic-weather-engine.js'), 'utf8');
      const inlineScript = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
        .map(match => match[1])
        .find(source => source.includes('new CinematicWeatherEngine'));
      expect(inlineScript).toBeTruthy();
      expect(html).not.toMatch(/i18n-client\.js/i);

      dom.window.eval(framegraphSource);
      dom.window.eval(engineSource);
      dom.window.eval(`${inlineScript}\nwindow.__fixture = { engine, socket, loadOverlayConfig, handlePageHide, overlayLocale };`);
      await nextTurn();
      const fixture = dom.window.__fixture;
      expect(fixture.engine.state).toBe('unsupported');
      void fixture.loadOverlayConfig();
      await nextTurn();
      await nextTurn();
      expect(requests).toEqual([
        { method: 'GET', path: `/api/i18n/translations/${locale}` },
        { method: 'GET', path: '/api/webgpu-weather/overlay-config' }
      ]);
      expect(fixture.overlayLocale).toBe(locale);
      expect(dom.window.document.documentElement.lang).toBe(locale);
      expect(dom.window.location.pathname).toBe('/webgpu-weather-control/overlay');
      expect(dom.window.location.search).toBe(query);

      const overlay = { enabled: true, showMeter: true, showQuest: true, showStreak: true, showRewardFeed: true };
      const unsafeQuestTitle = '<img src=x onerror=alert(1)>';
      socket.deliver('webgpu-weather:gamification-state', {
        overlay,
        communityMeter: { current: 2, max: 5 },
        quest: { active: { title: unsafeQuestTitle } },
        streaks: { current: 3 },
        rewards: { history: [{ label: 'Rain reward' }] }
      });

      const document = dom.window.document;
      expect(document.querySelector('#communityHud').hidden).toBe(false);
      expect(document.querySelector('#communityHud > strong').textContent).toBe(expectedLabels.community);
      expect(document.querySelector('#hudQuest > span:first-child').textContent).toBe(expectedLabels.quest);
      expect(document.querySelector('#hudMeter > span:first-child').textContent).toBe(expectedLabels.meter);
      expect(document.querySelector('#hudStreak > span:first-child').textContent).toBe(expectedLabels.streak);
      expect(document.querySelector('#hudRewardFeed > span:first-child').textContent).toBe(expectedLabels.reward);
      expect(document.querySelector('#hudQuestValue').textContent).toBe(unsafeQuestTitle);
      expect(document.querySelector('#hudQuestValue img')).toBeNull();
      expect(document.querySelector('#communityHud img')).toBeNull();
      expect(document.querySelector('#hudMeterValue').textContent).toBe('2');
      expect(document.querySelector('#hudStreakValue').textContent).toBe('3');
      expect(document.querySelector('#hudRewardValue').textContent).toBe('Rain reward');
      expect(socket.emitted.map(entry => entry.eventName)).toEqual([]);

      dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide', { persisted: false }));
      expect(fixture.engine.state).toBe('destroyed');
      expect(socket.disconnected).toBe(true);
      expect([...socket.handlers.values()].every(handlers => handlers.length === 0)).toBe(true);
      expect(raf.size).toBe(0);
      expect(timeouts.size).toBe(0);
      expect(intervals.size).toBe(0);
      expect(rendererErrors).toEqual([]);
    } finally {
      dom.window.close();
    }
  });
});
