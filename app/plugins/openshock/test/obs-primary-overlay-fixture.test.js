'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const HTML_PATH = path.join(__dirname, '../overlay/openshock_overlay.html');
const SCRIPT_PATH = path.join(__dirname, '../overlay/openshock_overlay.js');
const LOCALES = ['de', 'en', 'es', 'fr'];

function lookup(source, dottedPath) {
  return dottedPath.split('.').reduce((value, key) => value && value[key], source);
}

function createSocket() {
  const handlers = new Map();
  return {
    handlers,
    emitted: [],
    connected: true,
    disconnected: 0,
    connectCalls: 0,
    on(event, handler) {
      handlers.set(event, [...(handlers.get(event) || []), handler]);
    },
    off(event, handler) {
      handlers.set(event, (handlers.get(event) || []).filter(item => item !== handler));
    },
    emit(event, payload) { this.emitted.push({ event, payload }); },
    connect() { this.connectCalls += 1; this.connected = true; },
    disconnect() { this.disconnected += 1; },
    deliver(event, payload) {
      for (const handler of [...(handlers.get(event) || [])]) handler(payload);
    }
  };
}

function createTimers(window) {
  let nextId = 0;
  const timeouts = new Map();
  const intervals = new Map();
  window.setTimeout = (callback, delay) => {
    const id = ++nextId;
    timeouts.set(id, { callback, delay });
    return id;
  };
  window.clearTimeout = id => timeouts.delete(id);
  window.setInterval = (callback, delay) => {
    const id = ++nextId;
    intervals.set(id, { callback, delay });
    return id;
  };
  window.clearInterval = id => intervals.delete(id);
  return { timeouts, intervals };
}

async function createRenderer(locale) {
  const localeData = require(`../locales/${locale}.json`);
  const localeMessages = localeData.plugins.openshock;
  const socket = createSocket();
  const requests = [];
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(fs.readFileSync(HTML_PATH, 'utf8'), {
    runScripts: 'outside-only',
    url: `http://127.0.0.1:3000/plugins/openshock/overlay/openshock_overlay.html?locale=${locale}`,
    virtualConsole,
    beforeParse(window) {
      window.io = () => socket;
      window.fetch = async input => {
        const url = new URL(String(input), window.location.href);
        requests.push({ method: 'GET', path: url.pathname });
        return {
          ok: true,
          json: async () => ({ overlay: { enabled: true, showDevice: true, showIntensity: true, showPattern: true, animationDuration: 0, autoHideDelay: 0 } })
        };
      };
      window.i18n = {
        t(key, params = {}) {
          const value = lookup(localeMessages, key.replace(/^plugins\.openshock\./, ''));
          return String(value || key).replace(/\{(\w+)\}/g, (match, name) => params[name] ?? match);
        }
      };
      window.console = { log() {}, warn() {}, error: (...args) => errors.push(args.join(' ')) };
    }
  });
  dom.window.document.documentElement.lang = locale;
  const timers = createTimers(dom.window);
  const domReady = new Promise(resolve => dom.window.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  dom.window.eval(fs.readFileSync(SCRIPT_PATH, 'utf8'));
  await domReady;
  await Promise.resolve();
  await Promise.resolve();
  return { dom, socket, requests, timers, errors, localeMessages };
}

describe('OpenShock primary overlay synthetic OBS renderer fixture', () => {
  test.each(LOCALES)('%s renders a synthetic command safely and cleans up without device actions', async locale => {
    const fixture = await createRenderer(locale);
    const { dom, socket, requests, timers, errors, localeMessages } = fixture;
    const { window } = dom;
    try {
      expect(requests).toEqual([{ method: 'GET', path: '/api/openshock/config' }]);
      expect(socket.handlers.has('openshock:command-sent')).toBe(true);
      expect(socket.emitted).toEqual([]);

      const deviceMarkup = '<img id="fixture-device-xss" src=x>';
      const userMarkup = '<svg id="fixture-user-xss">';
      socket.deliver('openshock:command-sent', {
        command: {
          type: 'vibrate', intensity: 35, duration: 1200,
          deviceId: 'private-device-id', apiKey: 'private-api-key',
          pattern: { steps: [{ intensity: 35, duration: 1200 }], private: 'fixture-secret' }
        },
        deviceId: 'private-device-id', deviceName: deviceMarkup,
        username: userMarkup, source: 'gift', apiKey: 'private-api-key',
        privateMetadata: 'fixture-secret'
      });

      expect(window.document.getElementById('overlay-container').classList.contains('hidden')).toBe(false);
      expect(window.document.getElementById('event-type').textContent).toBe('VIBRATE');
      expect(window.document.getElementById('event-device').textContent).toBe(deviceMarkup);
      expect(window.document.getElementById('event-user').textContent).toBe(userMarkup);
      expect(window.document.getElementById('intensity-value').textContent).toBe('35%');
      expect(window.document.querySelector('#fixture-device-xss, #fixture-user-xss')).toBeNull();
      expect(errors.join('\n')).not.toContain('private-api-key');
      expect(errors.join('\n')).not.toContain('fixture-secret');
      expect(requests).toEqual([{ method: 'GET', path: '/api/openshock/config' }]);
      expect(socket.emitted).toEqual([]);

      socket.deliver('openshock:emergency-stop');
      const expectedEmergencyText = lookup(localeMessages, 'runtime.overlays.main.emergency_stop_activated');
      expect(window.document.getElementById('warning-message').textContent).toBe(expectedEmergencyText);

      const lateHandler = [...socket.handlers.get('openshock:command-sent')];
      window.dispatchEvent(new window.PageTransitionEvent('pagehide', { persisted: true }));
      expect(socket.disconnected).toBe(0);
      socket.connected = false;
      window.dispatchEvent(new window.PageTransitionEvent('pageshow', { persisted: true }));
      expect(socket.connectCalls).toBe(1);
      window.dispatchEvent(new window.PageTransitionEvent('pagehide', { persisted: false }));
      expect(socket.disconnected).toBe(1);
      expect(timers.timeouts.size).toBe(0);
      expect(timers.intervals.size).toBe(0);
      expect([...socket.handlers.values()].every(handlers => handlers.length === 0)).toBe(true);

      const deviceTextAfterCleanup = window.document.getElementById('event-device').textContent;
      lateHandler.forEach(handler => handler({ type: 'shock', intensity: 100, duration: 5000, deviceName: 'late fixture' }));
      expect(window.document.getElementById('event-device').textContent).toBe(deviceTextAfterCleanup);
      expect(requests).toEqual([{ method: 'GET', path: '/api/openshock/config' }]);
      expect(socket.emitted).toEqual([]);
      expect(errors).toEqual([]);
    } finally {
      window.close();
    }
  });
});
