const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const overlayDir = path.join(__dirname, '../plugins/minecraft-connect/overlay');

describe('Minecraft Connect overlay renderer', () => {
  test('recovers after malformed events, renders payloads as text and cleans up on pagehide', () => {
    const html = fs.readFileSync(path.join(overlayDir, 'minecraft_overlay.html'), 'utf8');
    const script = fs.readFileSync(path.join(overlayDir, 'minecraft_overlay.js'), 'utf8');
    const listeners = new Map();
    const timers = new Map();
    let nextTimer = 0;
    const socket = {
      on: (event, listener) => listeners.set(event, listener),
      disconnect: jest.fn()
    };
    const dom = new JSDOM(html, {
      runScripts: 'outside-only',
      url: 'http://127.0.0.1:3000/plugins/minecraft-connect/overlay/minecraft_overlay.html?lang=en',
      beforeParse(window) {
        window.io = () => socket;
        window.console = { log: jest.fn(), error: jest.fn() };
        window.setTimeout = (callback, delay) => {
          const id = ++nextTimer;
          timers.set(id, { callback, delay });
          return id;
        };
        window.clearTimeout = id => timers.delete(id);
      }
    });

    try {
      dom.window.eval(script);
      dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
      const container = dom.window.document.getElementById('minecraft-overlay');
      const show = listeners.get('minecraft-connect:overlay-show');

      expect(container.children).toHaveLength(0);
      expect(() => show(null)).not.toThrow();
      expect(container.children).toHaveLength(0);

      show({
        action: 'give_item',
        params: { itemId: '<img src=x onerror="window.__overlayInjected=true">' },
        username: '<svg onload="window.__overlayInjected=true">'
      });

      expect(container.querySelector('img, svg')).toBeNull();
      expect(container.textContent).toContain('<img src=x onerror="window.__overlayInjected=true">');
      expect(container.textContent).toContain('<svg onload="window.__overlayInjected=true">');
      expect(dom.window.__overlayInjected).toBeUndefined();
      expect(timers.size).toBeGreaterThan(0);

      dom.window.dispatchEvent(new dom.window.Event('pagehide'));
      expect(container.children).toHaveLength(0);
      expect(timers.size).toBe(0);
      expect(socket.disconnect).toHaveBeenCalledTimes(1);
    } finally {
      dom.window.close();
    }
  });

  test('preserves the live renderer across BFCache and makes final cleanup idempotent', () => {
    const html = fs.readFileSync(path.join(overlayDir, 'minecraft_overlay.html'), 'utf8');
    const script = fs.readFileSync(path.join(overlayDir, 'minecraft_overlay.js'), 'utf8');
    const listeners = new Map();
    const timers = new Map();
    let nextTimer = 0;
    const socket = {
      on: (event, listener) => listeners.set(event, listener),
      disconnect: jest.fn()
    };
    const dom = new JSDOM(html, {
      runScripts: 'outside-only',
      url: 'http://127.0.0.1:3000/plugins/minecraft-connect/overlay/minecraft_overlay.html?lang=en',
      beforeParse(window) {
        window.io = () => socket;
        window.console = { log: jest.fn(), error: jest.fn() };
        window.setTimeout = (callback, delay) => {
          const id = ++nextTimer;
          timers.set(id, { callback, delay });
          return id;
        };
        window.clearTimeout = id => timers.delete(id);
      }
    });

    try {
      dom.window.eval(script);
      dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
      const container = dom.window.document.getElementById('minecraft-overlay');
      listeners.get('minecraft-connect:overlay-show')({
        action: 'give_item',
        params: { itemId: 'fixture-item' },
        username: 'Fixture Viewer'
      });
      const savedCallbacks = [...timers.values()].map(timer => timer.callback);
      expect(container.children).toHaveLength(1);
      expect(timers.size).toBeGreaterThan(0);

      const persistedHide = new dom.window.Event('pagehide');
      Object.defineProperty(persistedHide, 'persisted', { value: true });
      dom.window.dispatchEvent(persistedHide);
      expect(container.children).toHaveLength(1);
      expect(timers.size).toBeGreaterThan(0);
      expect(socket.disconnect).not.toHaveBeenCalled();

      const persistedShow = new dom.window.Event('pageshow');
      Object.defineProperty(persistedShow, 'persisted', { value: true });
      dom.window.dispatchEvent(persistedShow);
      expect(container.children).toHaveLength(1);
      expect(timers.size).toBeGreaterThan(0);
      expect(socket.disconnect).not.toHaveBeenCalled();

      dom.window.dispatchEvent(new dom.window.Event('pagehide'));
      dom.window.dispatchEvent(new dom.window.Event('pagehide'));
      expect(container.children).toHaveLength(0);
      expect(timers.size).toBe(0);
      expect(socket.disconnect).toHaveBeenCalledTimes(1);

      savedCallbacks.forEach(callback => callback());
      expect(container.children).toHaveLength(0);
      expect(timers.size).toBe(0);
      expect(socket.disconnect).toHaveBeenCalledTimes(1);
    } finally {
      dom.window.close();
    }
  });
});
