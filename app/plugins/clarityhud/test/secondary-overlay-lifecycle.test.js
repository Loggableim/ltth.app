'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const CHAT_SOURCE = path.join(__dirname, '../overlays/chat.js');
const MULTI_SOURCE = path.join(__dirname, '../overlays/multi.js');

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function response(payload) {
  return { ok: true, status: 200, statusText: 'OK', json: async () => payload };
}

function createSocket() {
  const handlers = new Map();
  return {
    connected: false,
    handlers,
    on(name, callback) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(callback);
    },
    fire(name, payload) {
      if (name === 'connect') this.connected = true;
      if (name === 'disconnect') this.connected = false;
      for (const callback of handlers.get(name) || []) callback(payload);
    }
  };
}

async function waitFor(predicate, label) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function createRenderer({ dock, sourcePath }) {
  const markup = dock === 'chat'
    ? '<!doctype html><body><div id="chat-container"><div id="messages"></div></div><div id="debug-status"></div><div id="debug-socket"></div><div id="debug-events"></div></body>'
    : '<!doctype html><body><div id="multi-container"></div><div id="messages"></div><div id="debug-status"></div><div id="debug-socket"></div><div id="debug-events"></div><div id="debug-streams"></div></body>';
  const dom = new JSDOM(markup, { url: `http://127.0.0.1/overlay/clarity/${dock}`, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  const socket = createSocket();
  const stateRequests = [];
  let languageChangeHandler = null;
  let activeStateRequests = 0;
  let maxActiveStateRequests = 0;
  const domReady = new Promise(resolve => window.document.addEventListener('DOMContentLoaded', resolve, { once: true }));

  window.io = () => socket;
  window.i18n = { onLanguageChange: callback => { languageChangeHandler = callback; } };
  window.ClarityHUDI18n = { text: (_key, fallback = '') => fallback };
  window.matchMedia = () => ({ matches: false, addEventListener: jest.fn() });
  window.requestAnimationFrame = callback => window.setTimeout(() => callback(Date.now()), 0);
  window.fetch = input => {
    const pathname = new URL(String(input), window.location.origin).pathname;
    if (pathname === `/api/clarityhud/settings/${dock}`) {
      const settings = dock === 'chat'
        ? { useVirtualScrolling: false, maxMessages: 2 }
        : { enabled: false, maxMessages: 2, streams: [] };
      return Promise.resolve(response({ success: true, settings }));
    }
    if (pathname === `/api/clarityhud/state/${dock}`) {
      const gate = deferred();
      activeStateRequests += 1;
      maxActiveStateRequests = Math.max(maxActiveStateRequests, activeStateRequests);
      stateRequests.push({
        resolve(payload) {
          gate.resolve(response(payload));
        }
      });
      return gate.promise.then(result => {
        activeStateRequests -= 1;
        return result;
      });
    }
    return Promise.reject(new Error(`Unexpected request: ${pathname}`));
  };

  window.eval(fs.readFileSync(sourcePath, 'utf8'));
  await domReady;
  await waitFor(() => socket.handlers.has('connect'), `${dock} socket handlers`);
  return {
    dom,
    socket,
    stateRequests,
    triggerLanguageChange: () => languageChangeHandler?.(),
    getMaxActiveStateRequests: () => maxActiveStateRequests
  };
}

function chatEvent(eventId, message) {
  return {
    type: 'chat',
    eventId,
    timestamp: Date.now(),
    user: { uniqueId: 'same-local-user', nickname: 'SameViewer' },
    uniqueId: 'same-local-user',
    message,
    comment: message,
    raw: { userId: 'same-local-user-id', uniqueId: 'same-local-user', comment: message }
  };
}

function multiEvent(eventId, message) {
  return {
    eventId,
    sourceId: 'test',
    sourceLabel: 'Synthetic stream',
    streamIndex: 0,
    colors: { text: '#FFFFFF', bg: '#111827', accent: '#60A5FA' },
    user: { uniqueId: 'same-local-user', nickname: 'SameViewer' },
    message,
    timestamp: Date.now(),
    raw: { uniqueId: 'same-local-user', comment: message }
  };
}

describe('ClarityHUD secondary overlay snapshot lifecycle', () => {
  test('chat serializes concurrent connects, retries a raced snapshot, and suppresses its delayed socket packet', async () => {
    const { dom, socket, stateRequests, getMaxActiveStateRequests } = await createRenderer({ dock: 'chat', sourcePath: CHAT_SOURCE });
    try {
      socket.fire('connect');
      await waitFor(() => stateRequests.length === 1, 'first chat state snapshot');
      socket.fire('disconnect');
      socket.fire('connect');

      stateRequests[0].resolve({ success: true, events: { chat: [chatEvent('event-old', 'History event')] } });
      await waitFor(() => stateRequests.length === 2, 'serialized chat reconnect snapshot');

      const live = chatEvent('event-d', 'Newest queued event');
      const newest = chatEvent('event-c', 'Newer history event');
      const older = chatEvent('event-b', 'Older history event');
      const oldest = chatEvent('event-a', 'Oldest history event');
      socket.fire('clarityhud.update.chat', live);
      stateRequests[1].resolve({ success: true, events: { chat: [live, newest, older, oldest] } });

      await waitFor(() => dom.window.document.querySelectorAll('#messages .chat-message').length === 2, 'two reconciled chat events');
      socket.fire('clarityhud.update.chat', live);
      await new Promise(resolve => setTimeout(resolve, 5));

      const visibleMessages = [...dom.window.document.querySelectorAll('#messages .chat-message')].map(node => node.textContent);
      expect(stateRequests).toHaveLength(2);
      expect(getMaxActiveStateRequests()).toBe(1);
      expect(visibleMessages).toHaveLength(2);
      expect(visibleMessages.filter(text => text.includes('Newest queued event'))).toHaveLength(1);
      expect(visibleMessages.filter(text => text.includes('Newest queued event'))).toHaveLength(1);
      expect(visibleMessages.filter(text => text.includes('Newer history event'))).toHaveLength(1);
      expect(visibleMessages.some(text => text.includes('Older history event'))).toBe(false);
      expect(visibleMessages.some(text => text.includes('Oldest history event'))).toBe(false);
    } finally {
      dom.window.close();
    }
  });

  test('multi serializes reconnect snapshots and dedupes a late local packet by its private event ID', async () => {
    const { dom, socket, stateRequests, getMaxActiveStateRequests, triggerLanguageChange } = await createRenderer({ dock: 'multi', sourcePath: MULTI_SOURCE });
    try {
      socket.fire('connect');
      await waitFor(() => stateRequests.length === 1, 'first multi state snapshot');
      socket.fire('disconnect');
      socket.fire('connect');

      stateRequests[0].resolve({ success: true, events: { multi: [multiEvent('event-old', 'History event')] } });
      await waitFor(() => stateRequests.length === 2, 'serialized multi reconnect snapshot');
      await waitFor(() => dom.window.document.querySelectorAll('#messages .chat-message').length === 1, 'first multi history event');
      triggerLanguageChange();
      expect(dom.window.document.querySelectorAll('#messages .chat-message')).toHaveLength(1);

      const live = multiEvent('event-d', 'Newest queued event');
      const newest = multiEvent('event-c', 'Newer history event');
      const older = multiEvent('event-b', 'Older history event');
      const oldest = multiEvent('event-a', 'Oldest history event');
      socket.fire('clarityhud:multi:chat', live);
      stateRequests[1].resolve({ success: true, events: { multi: [live, newest, older, oldest] } });

      await waitFor(() => dom.window.document.querySelectorAll('#messages .chat-message').length === 2, 'two reconciled multi events');
      socket.fire('clarityhud:multi:chat', live);
      await new Promise(resolve => setTimeout(resolve, 5));

      const visibleMessages = [...dom.window.document.querySelectorAll('#messages .chat-message')].map(node => node.textContent);
      expect(stateRequests).toHaveLength(2);
      expect(getMaxActiveStateRequests()).toBe(1);
      expect(visibleMessages).toHaveLength(2);
      expect(visibleMessages.filter(text => text.includes('Newest queued event'))).toHaveLength(1);
      expect(visibleMessages.filter(text => text.includes('Newer history event'))).toHaveLength(1);
      expect(visibleMessages.some(text => text.includes('Older history event'))).toBe(false);
      expect(visibleMessages.some(text => text.includes('Oldest history event'))).toBe(false);
    } finally {
      dom.window.close();
    }
  });
});
