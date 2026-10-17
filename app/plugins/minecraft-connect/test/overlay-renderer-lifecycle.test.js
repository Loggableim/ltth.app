'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { isHttpAllowed, isOutgoingSocketEventAllowed } = require('../../../modules/public-overlay-registry');

const HTML_PATH = path.join(__dirname, '../overlay/minecraft_overlay.html');
const SCRIPT_PATH = path.join(__dirname, '../overlay/minecraft_overlay.js');

function createSocket() {
  const handlers = new Map();
  return {
    handlers,
    emitted: [],
    disconnectCalls: 0,
    on(event, handler) {
      const list = handlers.get(event) || [];
      list.push(handler);
      handlers.set(event, list);
    },
    emit(event, payload) { this.emitted.push({ event, payload }); },
    deliver(event, payload) { (handlers.get(event) || []).slice().forEach(handler => handler(payload)); },
    disconnect() { this.disconnectCalls += 1; }
  };
}

function installTimers(window) {
  let nextId = 0;
  const timers = new Map();
  window.setTimeout = (callback, delay) => {
    const id = ++nextId;
    timers.set(id, { callback, delay });
    return id;
  };
  window.clearTimeout = id => timers.delete(id);
  return timers;
}

async function createOverlay() {
  const dom = new JSDOM(fs.readFileSync(HTML_PATH, 'utf8'), {
    runScripts: 'outside-only',
    url: 'http://127.0.0.1/plugins/minecraft-connect/overlay/minecraft_overlay.html'
  });
  const { window } = dom;
  const socket = createSocket();
  const timers = installTimers(window);
  const requests = [];
  const domReady = new Promise(resolve => window.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  window.io = () => socket;
  window.fetch = async url => { requests.push(String(url)); throw new Error('unexpected network request'); };
  window.eval(fs.readFileSync(SCRIPT_PATH, 'utf8'));
  await domReady;
  await Promise.resolve();
  return { dom, socket, timers, requests };
}

describe('Minecraft Connect original renderer lifecycle fixture', () => {
  test('renders event payloads, survives BFCache, and ignores callbacks after final cleanup', async () => {
    const { dom, socket, timers, requests } = await createOverlay();
    const { window } = dom;
    try {
      const overlayHTML = fs.readFileSync(HTML_PATH, 'utf8');
      expect(overlayHTML).toContain('/plugins/minecraft-connect/overlay/minecraft_overlay.css');
      expect(overlayHTML).toContain('/plugins/minecraft-connect/overlay/minecraft_overlay.js');
      expect(requests).toEqual([]);
      expect(socket.emitted).toEqual([]);

      socket.deliver('minecraft-connect:overlay-show', {
        action: 'spawn_entity',
        username: 'SyntheticViewer',
        params: { count: 2, entityId: 'sheep' }
      });
      expect(window.document.querySelector('.mc-notification')).not.toBeNull();
      expect(window.document.querySelector('.mc-notification').textContent).toContain('SyntheticViewer');
      expect(window.document.querySelector('.mc-notification').textContent).toContain('Spawning 2× sheep');

      const lateSocketHandler = [...socket.handlers.get('minecraft-connect:overlay-show')];
      window.dispatchEvent(new window.PageTransitionEvent('pagehide', { persisted: true }));
      expect(socket.disconnectCalls).toBe(0);
      socket.deliver('minecraft-connect:overlay-show', { action: 'give_item', username: 'AfterRestore', params: { count: 1, itemId: 'emerald' } });
      expect(window.document.querySelectorAll('.mc-notification')).toHaveLength(2);

      window.dispatchEvent(new window.PageTransitionEvent('pagehide', { persisted: false }));
      expect(socket.disconnectCalls).toBe(1);
      expect(timers.size).toBe(0);
      expect(window.document.querySelectorAll('.mc-notification')).toHaveLength(0);
      lateSocketHandler.forEach(handler => handler({ action: 'execute_command', username: 'Late', params: { command: 'ignored' } }));
      expect(window.document.querySelectorAll('.mc-notification')).toHaveLength(0);
      expect(requests).toEqual([]);
    } finally {
      window.close();
    }
  });

  test('is a local-only legacy surface, not a public overlay registry entry', () => {
    expect(isHttpAllowed({ method: 'GET', pathname: '/plugins/minecraft-connect/overlay/minecraft_overlay.html' })).toBe(false);
    expect(isOutgoingSocketEventAllowed('minecraft-connect:overlay-show')).toBe(false);
  });
});
