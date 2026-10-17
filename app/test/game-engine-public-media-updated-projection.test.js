'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const GameEnginePlugin = require('../plugins/game-engine/main');
const { protectPublicSocket } = require('../modules/public-overlay-access');
const { projectPublicOverlayPayload } = require('../modules/public-overlay-payload-projection');

const overlayPath = path.resolve(__dirname, '../plugins/game-engine/overlay/connect4.html');

function createSockets() {
  const local = [];
  const publicPackets = [];
  const publicSocket = {
    handshake: { headers: { host: 'fixture-media.trycloudflare.com' } },
    join: jest.fn(),
    use: jest.fn(),
    emit(eventName, payload) { publicPackets.push({ eventName, payload }); }
  };
  protectPublicSocket({ socket: publicSocket, logger: { warn: jest.fn() } });
  const io = {
    emit(eventName, payload) {
      local.push({ eventName, payload });
      publicSocket.emit(eventName, payload);
    }
  };
  return { local, publicPackets, io };
}

function createOverlay() {
  const html = fs.readFileSync(overlayPath, 'utf8');
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  const helper = scripts.find(([, attributes, script]) => !/\bsrc\s*=/.test(attributes)
    && script.includes('function bindRuntimeI18nRerender'));
  const main = scripts.find(([, attributes, script]) => !/\bsrc\s*=/.test(attributes)
    && script.includes("socket.on('game-engine:media-updated'"));
  if (!main) throw new Error('Connect4 overlay media-updated consumer was not found');
  const dom = new JSDOM(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''), {
    runScripts: 'outside-only', url: 'http://localhost/overlay/game-engine/connect4'
  });
  const handlers = new Map();
  const socket = {
    on: jest.fn((name, handler) => handlers.set(name, handler)),
    emit: jest.fn(),
    off: jest.fn()
  };
  dom.window.io = () => socket;
  dom.window.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
  dom.window.console.log = jest.fn();
  dom.window.console.error = jest.fn();
  dom.window.console.warn = jest.fn();
  dom.window.i18n = { initialized: false, ready: Promise.resolve(), onChange: jest.fn(), onLanguageChange: jest.fn() };
  if (helper) dom.window.eval(helper[2]);
  dom.window.eval(main[2]);
  return { dom, handlers, close: () => dom.window.close() };
}

describe('Game Engine public Connect4 media-updated projection', () => {
  test('preserves the actual media route notification while removing producer metadata', () => {
    const sockets = createSockets();
    const plugin = Object.assign(Object.create(GameEnginePlugin.prototype), {
      api: { registerRoute: jest.fn() }, io: sockets.io,
      db: { getGameMedia: jest.fn(() => null), removeGameMedia: jest.fn() },
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
    });
    plugin.registerRoutes();
    const [, , removeMedia] = plugin.api.registerRoute.mock.calls
      .find(([method, route]) => method === 'DELETE' && route === '/api/game-engine/media/:gameType/:mediaEvent');
    expect(removeMedia).toBeDefined();
    const response = { status: jest.fn(function status() { return this; }), json: jest.fn() };
    removeMedia({ params: { gameType: 'connect4', mediaEvent: 'piece_drop' } }, response);
    expect(sockets.local).toContainEqual({
      eventName: 'game-engine:media-updated',
      payload: { gameType: 'connect4', mediaEvent: 'piece_drop' }
    });
    expect(sockets.publicPackets).toContainEqual({
      eventName: 'game-engine:media-updated', payload: { gameType: 'connect4' }
    });
    expect(response.json).toHaveBeenCalledWith({ success: true });

    const overlay = createOverlay();
    const before = overlay.dom.window.fetch.mock.calls.length;
    overlay.handlers.get('game-engine:media-updated')({ gameType: 'connect4' });
    expect(overlay.dom.window.fetch.mock.calls.length).toBeGreaterThan(before);
    expect(overlay.dom.window.fetch.mock.calls.some(([url]) => String(url).includes('/api/game-engine/media/connect4'))).toBe(true);
    overlay.close();
  });

  test.each([
    { gameType: 'wheel', mediaEvent: 'piece_drop' },
    { gameType: 'connect4', mediaEvent: 'unknown-event' },
    null
  ])('withholds invalid or irrelevant media updates %# from public sockets', payload => {
    expect(projectPublicOverlayPayload('game-engine:media-updated', payload)).toBeNull();
    const sockets = createSockets();
    sockets.io.emit('game-engine:media-updated', payload);
    expect(sockets.local).toEqual([{ eventName: 'game-engine:media-updated', payload }]);
    expect(sockets.publicPackets).toEqual([]);
  });

  test('drops unrelated producer metadata while retaining the consumer trigger', () => {
    expect(projectPublicOverlayPayload('game-engine:media-updated', {
      gameType: 'connect4', mediaEvent: 'piece_drop', filePath: 'C:\\private\\secret.wav'
    })).toEqual({ gameType: 'connect4' });
  });
});
