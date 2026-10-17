'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { isHttpAllowed, isOutgoingSocketEventAllowed } = require('../../../modules/public-overlay-registry');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const HTML_PATH = path.join(ROOT, 'plugins/clarityhud/overlays/full.html');
const SCRIPT_PATH = path.join(ROOT, 'plugins/clarityhud/overlays/full.js');
const I18N_CLIENT_PATH = path.join(ROOT, 'public/js/i18n-client.js');
const LIB_DIR = path.join(ROOT, 'plugins/clarityhud/lib');
const ORIGIN = 'http://127.0.0.1:3000';
const LIBRARIES = [
  'animations.js', 'i18n-runtime.js', 'layout-engine.js', 'accessibility.js',
  'emoji-parser.js', 'badge-renderer.js', 'message-parser.js', 'virtual-scroller.js'
];
const EVENT_TYPES = ['chat', 'follow', 'share', 'like', 'gift', 'sub', 'treasure', 'join'];

function makeSocket(connected = false) {
  const handlers = new Map();
  return {
    connected,
    handlers,
    emitted: [],
    disconnectCalls: 0,
    on(event, handler) {
      const list = handlers.get(event) || [];
      list.push(handler);
      handlers.set(event, list);
    },
    off(event, handler) {
      handlers.set(event, (handlers.get(event) || []).filter(candidate => candidate !== handler));
    },
    emit(event, payload) { this.emitted.push({ event, payload }); },
    deliver(event, payload) {
      if (event === 'connect') this.connected = true;
      if (event === 'disconnect') this.connected = false;
      [...(handlers.get(event) || [])].forEach(handler => handler(payload));
    },
    capture(event) { return [...(handlers.get(event) || [])]; },
    disconnect() { this.disconnectCalls += 1; }
  };
}

function installTimers(window) {
  let nextId = 0;
  const timeouts = new Map();
  const animationFrames = new Map();
  window.setTimeout = (callback, delay = 0) => {
    const id = ++nextId;
    timeouts.set(id, { callback, delay });
    return id;
  };
  window.clearTimeout = id => timeouts.delete(id);
  window.requestAnimationFrame = callback => {
    const id = ++nextId;
    animationFrames.set(id, callback);
    return id;
  };
  window.cancelAnimationFrame = id => animationFrames.delete(id);
  window.ResizeObserver = undefined;
  return {
    timeouts,
    animationFrames,
    runTimeout(id) {
      const timeout = timeouts.get(id);
      if (!timeout) return false;
      timeouts.delete(id);
      timeout.callback();
      return true;
    }
  };
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (predicate()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  throw new Error('Timed out waiting for ClarityHUD renderer fixture condition');
}

function emptyEvents() {
  return Object.fromEntries(EVENT_TYPES.map(type => [type, []]));
}

function stateResponse(message, timestamp, includeFollow = false, includeSuperFan = false) {
  const events = emptyEvents();
  if (message) events.chat = [{ type: 'chat', timestamp, message, user: { nickname: 'History' } }];
  if (includeFollow) events.follow = [{ type: 'follow', timestamp, user: { uniqueId: 'locale-follow-1', nickname: 'NewFollower' } }];
  if (includeSuperFan) events['superfan-display'] = [{
    eventType: 'superfan-join', displayName: 'History Fan', level: 3,
    profilePictureUrl: 'https://p16-sign.tiktokcdn.com/history-fan.jpg'
  }];
  return { success: true, events };
}

async function createRenderer({ connected = false, includeSharedI18n = false, existingWindowSocket = null } = {}) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('log', () => {});
  virtualConsole.on('info', () => {});
  virtualConsole.on('warn', message => errors.push(String(message)));
  virtualConsole.on('error', message => errors.push(String(message)));
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(fs.readFileSync(HTML_PATH, 'utf8'), {
    runScripts: 'outside-only',
    url: `${ORIGIN}/overlay/clarity/full`,
    pretendToBeVisual: true,
    virtualConsole
  });
  const { window } = dom;
  const socket = makeSocket(connected);
  const timers = installTimers(window);
  const requests = [];
  window.ClarityHUDI18n = {
    text: (key, fallback = '') => {
      if (key.endsWith('.overlay.event.follow')) {
        return { de: 'Gefolgt', en: 'Followed', es: 'Siguió', fr: 'A suivi' }[window.i18n?.getLocale()] || fallback;
      }
      return fallback;
    }
  };
  const io = jest.fn(() => socket);
  window.io = io;
  if (existingWindowSocket) window.socket = existingWindowSocket;
  window.fetch = input => {
    const url = new URL(String(input), ORIGIN);
    if (url.pathname.startsWith('/api/i18n/translations/')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    }
    return new Promise(resolve => requests.push({
      method: 'GET',
      path: url.pathname,
      resolve(payload) { resolve({ ok: true, status: 200, json: async () => payload }); }
    }));
  };

  if (includeSharedI18n) window.eval(fs.readFileSync(I18N_CLIENT_PATH, 'utf8'));
  const domReady = new Promise(resolve => window.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  for (const library of LIBRARIES) window.eval(fs.readFileSync(path.join(LIB_DIR, library), 'utf8'));
  window.eval(fs.readFileSync(SCRIPT_PATH, 'utf8'));
  await domReady;
  await waitFor(() => requests.length === 1);
  return { dom, socket, io, timers, requests, errors };
}

function resolveRequest(requests, pathName, occurrence, payload) {
  const matching = requests.filter(request => request.path === pathName);
  if (!matching[occurrence]) throw new Error(`Missing request ${pathName} #${occurrence}`);
  matching[occurrence].resolve(payload);
}

async function resolveInitialReads(requests, includeFollow = false, includeSuperFan = false) {
  resolveRequest(requests, '/api/clarityhud/settings/full', 0, {
    success: true,
    settings: { showChat: true, showFollows: true, showSuperFans: true, layoutMode: 'singleStream', feedDirection: 'top', maxLines: 20, reduceMotion: true, animationIn: 'none' }
  });
  await waitFor(() => requests.filter(request => request.path === '/api/clarityhud/state/full').length === 1);
  resolveRequest(requests, '/api/clarityhud/state/full', 0, stateResponse('Initial history', 1, includeFollow, includeSuperFan));
  await waitFor(() => requests.length === 2 && requests.every(request => request.method === 'GET'));
}

describe('ClarityHUD full original renderer lifecycle fixture', () => {
  test('hydrates public SuperFan history from its queue without type or timestamp fields', async () => {
    const { dom, requests, errors } = await createRenderer();
    const { window } = dom;
    try {
      await resolveInitialReads(requests, false, true);
      await waitFor(() => window.document.querySelector('.superfan-avatar'));
      const card = [...window.document.querySelectorAll('.event-item')]
        .find(item => item.querySelector('.event-username')?.textContent === 'History Fan');
      expect(card).toBeTruthy();
      expect(card.querySelector('.event-gift-info')?.textContent).toBe('Level 3');
      expect(card.querySelector('.superfan-avatar').src).toBe('https://p16-sign.tiktokcdn.com/history-fan.jpg');
      expect(errors).toEqual([]);
    } finally {
      window.close();
    }
  });

  test('relocalizes retained event labels on shared locale broadcasts without dropping events', async () => {
    const { dom, socket, timers, requests } = await createRenderer({ includeSharedI18n: true });
    const { window } = dom;
    try {
      await resolveInitialReads(requests, true);
      await waitFor(() => window.i18n?.initialized === true && window.socket === socket);
      await waitFor(() => window.document.querySelector('#overlay-container .feed-container') && socket.handlers.has('clarityhud.update.follow'));
      expect(window.i18n.onLanguageChangeCallbacks.length).toBe(1);
      const followCard = () => [...window.document.querySelectorAll('#overlay-container .event-item')]
        .find(card => card.querySelector('.event-username')?.textContent === 'NewFollower');
      await waitFor(() => Boolean(followCard()));
      window.ClarityHUDI18n.text = (key, fallback = '') => key.endsWith('overlay.event.follow')
        ? ({ de: 'Gefolgt', en: 'Followed', es: 'Siguió', fr: 'A suivi' }[window.i18n.getLocale()] || fallback)
        : fallback;
      const startingLocale = window.i18n.getLocale();
      const intermediateLocale = startingLocale === 'en' ? 'de' : 'en';
      await window.i18n.changeLanguage(intermediateLocale);
      await waitFor(() => followCard()?.querySelector('.event-type')?.textContent === `(${{ de: 'Gefolgt', en: 'Followed' }[intermediateLocale]})`);
      expect(followCard()?.querySelector('.event-type')?.textContent).not.toBe('(A suivi)');

      const localeRetry = [...timers.timeouts.entries()].find(([, timeout]) => timeout.delay === 100);
      expect(localeRetry).toBeDefined();
      expect(timers.runTimeout(localeRetry[0])).toBe(true);
      expect(socket.handlers.get('locale-changed')).toHaveLength(1);
      let localeRenderCallbackCalls = 0;
      const rendererLocaleCallback = window.i18n.onLanguageChangeCallbacks[0];
      window.i18n.onLanguageChangeCallbacks[0] = (...args) => {
        localeRenderCallbackCalls += 1;
        rendererLocaleCallback(...args);
      };
      socket.deliver('locale-changed', { locale: 'fr' });
      await waitFor(() => followCard()?.querySelector('.event-type')?.textContent === '(A suivi)');
      expect(window.document.querySelectorAll('#overlay-container .event-item')).toHaveLength(2);
      expect(followCard()?.querySelector('.event-username')?.textContent).toBe('NewFollower');
      expect(localeRenderCallbackCalls).toBe(1);
    } finally {
      window.close();
    }
  });

  test('publishes its existing socket for shared locale broadcasts and preserves it through BFCache', async () => {
    const { dom, socket, io, timers, requests } = await createRenderer({ includeSharedI18n: true });
    const { window } = dom;
    try {
      await resolveInitialReads(requests);
      await waitFor(() => window.i18n?.initialized === true && window.socket === socket);

      const localeRetry = [...timers.timeouts.entries()].find(([, timeout]) => timeout.delay === 100);
      expect(localeRetry).toBeDefined();
      expect(timers.runTimeout(localeRetry[0])).toBe(true);
      expect(socket.handlers.get('locale-changed')).toHaveLength(1);
      expect(socket.handlers.get('language-changed')).toHaveLength(1);
      expect(io).toHaveBeenCalledTimes(1);

      socket.deliver('locale-changed', { locale: 'fr' });
      await waitFor(() => window.i18n.getLocale() === 'fr');
      expect(window.document.documentElement.lang).toBe('fr');

      window.dispatchEvent(new window.PageTransitionEvent('pagehide', { persisted: true }));
      expect(window.socket).toBe(socket);
      expect(socket.disconnectCalls).toBe(0);
      expect(socket.handlers.get('locale-changed')).toHaveLength(1);
      window.dispatchEvent(new window.PageTransitionEvent('pageshow', { persisted: true }));
      socket.deliver('locale-changed', { locale: 'es' });
      await waitFor(() => window.i18n.getLocale() === 'es');
      expect(window.document.documentElement.lang).toBe('es');

      window.dispatchEvent(new window.PageTransitionEvent('pagehide', { persisted: false }));
      expect(window.socket).toBeUndefined();
      expect(socket.handlers.get('locale-changed')).toHaveLength(0);
      expect(socket.handlers.get('language-changed')).toHaveLength(0);
      expect(socket.disconnectCalls).toBe(1);
      expect(io).toHaveBeenCalledTimes(1);
    } finally {
      window.close();
    }
  });

  test('keeps a pre-existing window socket intact and disconnects only its private overlay socket', async () => {
    const existingWindowSocket = makeSocket(true);
    const { dom, socket, io, requests } = await createRenderer({
      includeSharedI18n: true,
      existingWindowSocket
    });
    const { window } = dom;
    try {
      await resolveInitialReads(requests);
      await waitFor(() => window.i18n?.initialized === true && socket.handlers.has('clarityhud.update.chat'));
      expect(window.socket).toBe(existingWindowSocket);
      expect(existingWindowSocket.handlers.get('locale-changed')).toHaveLength(1);
      expect(socket.handlers.get('locale-changed') || []).toHaveLength(0);
      expect(io).toHaveBeenCalledTimes(1);

      existingWindowSocket.deliver('locale-changed', { locale: 'fr' });
      await waitFor(() => window.i18n.getLocale() === 'fr');
      expect(window.document.documentElement.lang).toBe('fr');

      window.dispatchEvent(new window.PageTransitionEvent('pagehide', { persisted: false }));
      expect(window.socket).toBe(existingWindowSocket);
      expect(existingWindowSocket.disconnectCalls).toBe(0);
      expect(existingWindowSocket.handlers.get('locale-changed')).toHaveLength(0);
      expect(socket.disconnectCalls).toBe(1);
    } finally {
      window.close();
    }
  });

  test('preserves a new follow while reconnect state and settings reads are pending', async () => {
    const { dom, socket, requests } = await createRenderer();
    const { window } = dom;
    try {
      await resolveInitialReads(requests);
      await waitFor(() => window.document.querySelector('#overlay-container').textContent.includes('Initial history'));
      socket.deliver('connect');
      await waitFor(() => requests.filter(request => request.path === '/api/clarityhud/state/full').length === 2);

      socket.deliver('clarityhud.update.follow', {
        user: { uniqueId: 'synthetic-follow-1', nickname: 'NewFollower' },
        uniqueId: 'synthetic-follow-1',
        username: 'NewFollower'
      });

      resolveRequest(requests, '/api/clarityhud/settings/full', 1, {
        success: true,
        settings: { showFollows: true, showChat: true, layoutMode: 'singleStream', feedDirection: 'top', maxLines: 20, reduceMotion: true, animationIn: 'none' }
      });
      resolveRequest(requests, '/api/clarityhud/state/full', 1, stateResponse('Reconnect history', 2));
      await waitFor(() => window.document.querySelector('#overlay-container').textContent.includes('NewFollower'));

      const followCard = [...window.document.querySelectorAll('#overlay-container .event-item')]
        .find(card => card.querySelector('.event-username')?.textContent.trim() === 'NewFollower');
      expect(followCard).toBeDefined();
      expect(followCard.querySelector('.event-type').textContent.trim()).toBe('(Followed)');
      expect(window.document.querySelector('#overlay-container').textContent).toContain('Reconnect history');
      expect(window.document.querySelector('#overlay-container').textContent).toContain('NewFollower');
    } finally {
      window.close();
    }
  });

  test('loads public reads, buffers socket updates across reconnect snapshots, rejects stale reads and cleans up', async () => {
    const { dom, socket, timers, requests, errors } = await createRenderer();
    const { window } = dom;
    try {
      await resolveInitialReads(requests);
      await waitFor(() => window.document.querySelector('.event-item'));
      expect(fs.readFileSync(HTML_PATH, 'utf8')).toContain('<script src="/plugins/clarityhud/overlays/full.js"></script>');
      expect(requests.map(request => request.path).sort()).toEqual([
        '/api/clarityhud/settings/full', '/api/clarityhud/state/full'
      ]);
      expect(requests.every(request => request.method === 'GET')).toBe(true);
      expect(isHttpAllowed({ method: 'GET', pathname: '/overlay/clarity/full' })).toBe(true);
      expect(isHttpAllowed({ method: 'POST', pathname: '/api/clarityhud/settings/full' })).toBe(false);
      expect(isOutgoingSocketEventAllowed('clarityhud.update.chat')).toBe(true);
      const html = fs.readFileSync(HTML_PATH, 'utf8');
      const htmlAssets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
        .map(match => new URL(match[1], ORIGIN).pathname)
        .filter(assetPath => assetPath.startsWith('/'));
      expect(htmlAssets.every(assetPath => isHttpAllowed({ method: 'GET', pathname: assetPath }))).toBe(true);
      expect(socket.emitted).toEqual([]);

      socket.deliver('clarityhud.update.chat', { message: 'Live buffered event', user: { nickname: 'SyntheticViewer' } });
      expect(window.document.querySelector('#overlay-container').textContent).toContain('Live buffered event');

      socket.deliver('connect');
      await waitFor(() => requests.filter(request => request.path === '/api/clarityhud/state/full').length === 2);
      socket.deliver('clarityhud.update.chat', { message: 'During first refresh', user: { nickname: 'BufferedViewer' } });
      socket.deliver('connect');
      await waitFor(() => requests.filter(request => request.path === '/api/clarityhud/state/full').length === 3);
      socket.deliver('clarityhud.update.chat', { message: 'Newest event', user: { nickname: 'NewestViewer' } });
      socket.deliver('clarityhud.settings.full', {
        showChat: true, layoutMode: 'structured', feedDirection: 'top', maxLines: 7, reduceMotion: true, animationIn: 'none'
      });

      resolveRequest(requests, '/api/clarityhud/settings/full', 2, {
        success: true,
        settings: { showChat: true, layoutMode: 'singleStream', feedDirection: 'top', maxLines: 20, reduceMotion: true, animationIn: 'none' }
      });
      resolveRequest(requests, '/api/clarityhud/state/full', 2, stateResponse('New snapshot', 2));
      await waitFor(() => window.document.querySelector('#overlay-container').textContent.includes('Newest event'));
      expect(window.document.querySelector('#overlay-container').textContent).toContain('New snapshot');
      expect(window.document.querySelector('#overlay-container').textContent).toContain('During first refresh');

      resolveRequest(requests, '/api/clarityhud/settings/full', 1, {
        success: true,
        settings: { showChat: true, layoutMode: 'singleStream', feedDirection: 'top', maxLines: 20, reduceMotion: true, animationIn: 'none' }
      });
      resolveRequest(requests, '/api/clarityhud/state/full', 1, stateResponse('Stale snapshot', 1));
      await new Promise(resolve => setImmediate(resolve));
      expect(window.document.querySelector('#overlay-container').className).toBe('layout-structured feed-direction-top');
      expect(window.document.querySelector('#overlay-container').textContent).toContain('New snapshot');
      expect(window.document.querySelector('#overlay-container').textContent).not.toContain('Stale snapshot');

      const lateSocketCallbacks = socket.capture('clarityhud.update.chat');
      window.dispatchEvent(new window.PageTransitionEvent('pagehide', { persisted: true }));
      expect(socket.disconnectCalls).toBe(0);
      window.dispatchEvent(new window.PageTransitionEvent('pageshow', { persisted: true }));
      await waitFor(() => requests.filter(request => request.path === '/api/clarityhud/state/full').length === 4);
      resolveRequest(requests, '/api/clarityhud/settings/full', 3, {
        success: true,
        settings: { showChat: true, layoutMode: 'singleStream', feedDirection: 'top', maxLines: 20, reduceMotion: true, animationIn: 'none' }
      });
      resolveRequest(requests, '/api/clarityhud/state/full', 3, stateResponse('Restored snapshot', 3));
      await waitFor(() => window.document.querySelector('#overlay-container').textContent.includes('Restored snapshot'));

      window.dispatchEvent(new window.PageTransitionEvent('pagehide', { persisted: false }));
      expect(socket.disconnectCalls).toBe(1);
      expect(socket.handlers.get('clarityhud.update.chat')).toHaveLength(0);
      expect(timers.timeouts.size).toBe(0);
      expect(timers.animationFrames.size).toBe(0);
      const textAfterDispose = window.document.querySelector('#overlay-container').textContent;
      lateSocketCallbacks.forEach(callback => callback({ message: 'Late event', user: { nickname: 'Late' } }));
      expect(window.document.querySelector('#overlay-container').textContent).toBe(textAfterDispose);
      expect(socket.emitted).toEqual([]);
      expect(errors).toEqual([]);
    } finally {
      window.close();
    }
  });
});
