'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const HTML_PATH = path.join(ROOT, 'overlay/minecraft_overlay.html');
const SCRIPT_PATH = path.join(ROOT, 'overlay/minecraft_overlay.js');

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
    disconnectCalls: 0,
    on(event, handler) { handlers.set(event, [...(handlers.get(event) || []), handler]); },
    off(event, handler) { handlers.set(event, (handlers.get(event) || []).filter(item => item !== handler)); },
    emit() {},
    deliver(event, payload) { for (const handler of [...(handlers.get(event) || [])]) handler(payload); },
    disconnect() { this.disconnectCalls += 1; }
  };
}

function installTimers(window) {
  let nextId = 0;
  const timers = new Map();
  window.setTimeout = (callback, delay = 0) => {
    const id = ++nextId;
    timers.set(id, { callback, delay });
    return id;
  };
  window.clearTimeout = id => timers.delete(id);
  return timers;
}

async function createOverlay(locale) {
  const socket = makeSocket();
  const timersRef = { current: null };
  const requests = [];
  const dom = new JSDOM(fs.readFileSync(HTML_PATH, 'utf8'), {
    url: `http://127.0.0.1/plugins/minecraft-connect/overlay/minecraft_overlay.html?lang=${locale}`,
    runScripts: 'outside-only',
    beforeParse(window) {
      window.i18n = makeI18n(loadLocale(locale));
      window.io = () => socket;
      window.fetch = async input => {
        requests.push(String(input));
        throw new Error('unexpected network request');
      };
      timersRef.current = installTimers(window);
    }
  });
  dom.window.eval(fs.readFileSync(SCRIPT_PATH, 'utf8'));
  await new Promise(resolve => setImmediate(resolve));
  return { dom, socket, timers: timersRef.current, requests };
}

describe('OBS-104 Minecraft Connect original overlay fixtures (DE/ES/FR)', () => {
  test.each(['de', 'es', 'fr'])('%s renders the synthetic action in the selected locale and blocks late events', async locale => {
    const { dom, socket, timers, requests } = await createOverlay(locale);
    const bundle = loadLocale(locale);
    const translations = bundle.plugins['minecraft-connect'].minecraft_connect.overlay;
    try {
      expect(fs.readFileSync(HTML_PATH, 'utf8')).toContain('/plugins/minecraft-connect/overlay/minecraft_overlay.js');
      expect(requests).toEqual([]);
      socket.deliver('minecraft-connect:overlay-show', {
        action: 'spawn_entity',
        username: 'SyntheticViewer',
        params: { count: 2, entityId: 'sheep' }
      });
      const notification = dom.window.document.querySelector('.mc-notification');
      expect(notification).not.toBeNull();
      expect(notification.querySelector('.mc-notification-title').textContent).toBe(translations.actions.spawn_entity);
      expect(notification.querySelector('.mc-notification-action').textContent).toBe(
        translations.parameters.spawn_entity.replace('{count}', '2').replace('{entity}', 'sheep')
      );
      expect(notification.querySelector('.mc-notification-user').textContent).toBe(
        translations.triggered_by.replace('{username}', 'SyntheticViewer')
      );
      expect(timers.size).toBeGreaterThan(0);

      const lateEvent = socket.handlers.get('minecraft-connect:overlay-show')[0];
      dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide', { persisted: false }));
      expect(socket.disconnectCalls).toBe(1);
      expect(timers.size).toBe(0);
      expect(dom.window.document.querySelectorAll('.mc-notification')).toHaveLength(0);
      lateEvent({ action: 'give_item', username: 'TooLate', params: { count: 1, itemId: 'emerald' } });
      expect(dom.window.document.querySelectorAll('.mc-notification')).toHaveLength(0);
      expect(requests).toEqual([]);
    } finally {
      dom.window.close();
    }
  });
});
