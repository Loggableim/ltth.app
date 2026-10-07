const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const pluginRoot = path.resolve(__dirname, '..', '..');
const template = fs.readFileSync(path.join(pluginRoot, 'overlay.html'), 'utf8');
const rendererSource = fs.readFileSync(path.join(pluginRoot, 'assets', 'overlay.js'), 'utf8');
const i18nSource = fs.readFileSync(path.resolve(pluginRoot, '../../public/js/i18n-client.js'), 'utf8');

async function createOverlayFixture({ locale = 'de', board = 'both', variant = 'spotlight', avatars = false } = {}) {
  const consoleMessages = [];
  const virtualConsole = new VirtualConsole();
  ['log', 'info', 'warn', 'error'].forEach(level => {
    virtualConsole.on(level, (...args) => {
      consoleMessages.push(args.map(value => typeof value === 'string' ? value : '[object]')
        .join(' ').replace(/https?:\/\/\S+/g, '[external-url]').slice(0, 240));
    });
  });

  const html = template.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: `http://localhost/plugins/toptier/overlay.html?lang=${locale}&board=${board}&variant=${variant}&avatars=${avatars}`,
    virtualConsole
  });
  const { window } = dom;
  window.fetch = async requestUrl => {
    const match = String(requestUrl).match(/\/api\/i18n\/translations\/(de|en|es|fr)$/);
    if (!match) throw new Error('Fixture denied unexpected fetch');
    const translation = require(path.join(pluginRoot, 'locales', `${match[1]}.json`));
    return { ok: true, json: async () => translation };
  };

  window.eval(i18nSource);
  await window.i18n.ready;
  window.i18n.updateDOM();

  const socketHandlers = new Map();
  const emittedSocketEvents = [];
  const socket = {
    on: jest.fn((eventName, handler) => socketHandlers.set(eventName, handler)),
    emit: jest.fn((eventName, payload) => emittedSocketEvents.push({ eventName, payload })),
    disconnect: jest.fn()
  };
  const io = jest.fn(() => socket);
  const intervals = new Map();
  const timeouts = new Map();
  const clearedIntervals = [];
  const clearedTimeouts = [];
  let nextTimerId = 1;
  window.io = io;
  window.setInterval = jest.fn((callback, delay) => {
    const id = nextTimerId++;
    intervals.set(id, { callback, delay });
    return id;
  });
  window.clearInterval = jest.fn(id => {
    clearedIntervals.push(id);
    intervals.delete(id);
  });
  window.setTimeout = jest.fn((callback, delay) => {
    const id = nextTimerId++;
    timeouts.set(id, { callback, delay });
    return id;
  });
  window.clearTimeout = jest.fn(id => {
    clearedTimeouts.push(id);
    timeouts.delete(id);
  });

  window.eval(rendererSource);

  return {
    dom,
    window,
    socket,
    io,
    socketHandlers,
    emittedSocketEvents,
    intervals,
    timeouts,
    clearedIntervals,
    clearedTimeouts,
    consoleMessages,
    root: window.document.getElementById('tt-root'),
    fire(eventName, payload) {
      const handler = socketHandlers.get(eventName);
      if (handler) return handler(payload);
    },
    close() { dom.window.close(); }
  };
}

module.exports = { createOverlayFixture };
