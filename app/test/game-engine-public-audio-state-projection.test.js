'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const GameEnginePlugin = require('../plugins/game-engine/main');
const { protectPublicSocket } = require('../modules/public-overlay-access');
const { projectPublicOverlayPayload } = require('../modules/public-overlay-payload-projection');

const connect4OverlayPath = path.resolve(__dirname, '../plugins/game-engine/overlay/connect4.html');

function createSocketPair() {
  const local = [];
  const publicPackets = [];
  const publicSocket = {
    handshake: { headers: { host: 'fixture-audio.trycloudflare.com' } },
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

function createConnect4Overlay() {
  const source = fs.readFileSync(connect4OverlayPath, 'utf8');
  const scripts = [...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  const helperScript = scripts.find(([, attributes, contents]) => !/\bsrc\s*=/.test(attributes)
    && contents.includes('function bindRuntimeI18nRerender'));
  const inlineScript = [...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .find(([, attributes, contents]) => !/\bsrc\s*=/.test(attributes)
      && contents.includes("socket.on('game-engine:audio-state-updated'"));
  if (!inlineScript) throw new Error('Connect4 overlay audio-state consumer was not found');
  const dom = new JSDOM(source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''), {
    runScripts: 'outside-only',
    url: 'http://localhost/overlay/game-engine/connect4'
  });
  const handlers = new Map();
  const socket = {
    on: jest.fn((eventName, handler) => handlers.set(eventName, handler)),
    emit: jest.fn(),
    off: jest.fn()
  };
  dom.window.io = jest.fn(() => socket);
  dom.window.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
  dom.window.console.log = jest.fn();
  dom.window.console.error = jest.fn();
  dom.window.i18n = {
    initialized: false,
    ready: Promise.resolve(),
    onChange: jest.fn(),
    onLanguageChange: jest.fn()
  };
  if (helperScript) dom.window.eval(helperScript[2]);
  dom.window.eval(inlineScript[2]);
  return {
    dom,
    handlers,
    close() { dom.window.close(); }
  };
}

describe('Game Engine public Connect4 audio-state projection', () => {
  test('projects the producer packet to the actual Connect4 consumer contract', () => {
    const sockets = createSocketPair();
    const plugin = Object.assign(Object.create(GameEnginePlugin.prototype), {
      api: {
        registerRoute: jest.fn()
      },
      io: sockets.io,
      db: { setGameAudioEnabled: jest.fn(() => true) },
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
    });
    plugin.registerRoutes();
    const [, , updateAudioState] = plugin.api.registerRoute.mock.calls
      .find(([method, route]) => method === 'PUT' && route === '/api/game-engine/audio-state/:gameType/:audioEvent');
    expect(updateAudioState).toBeDefined();
    const response = {
      status: jest.fn(function status() { return this; }),
      json: jest.fn()
    };
    updateAudioState({
      params: { gameType: 'connect4', audioEvent: 'piece_drop' },
      body: { enabled: false, scopeId: 'unneeded-in-connect4-contract' }
    }, response);

    const localPacket = sockets.local.find(packet => packet.eventName === 'game-engine:audio-state-updated');
    const publicPacket = sockets.publicPackets.find(packet => packet.eventName === 'game-engine:audio-state-updated');
    expect(localPacket).toEqual({
      eventName: 'game-engine:audio-state-updated',
      payload: { gameType: 'connect4', scopeId: 'default', audioEvent: 'piece_drop', enabled: false }
    });
    expect(publicPacket).toEqual({
      eventName: 'game-engine:audio-state-updated',
      payload: { gameType: 'connect4', audioEvent: 'piece_drop', enabled: false }
    });
    expect(response.json).toHaveBeenCalledWith({
      success: true, gameType: 'connect4', scopeId: 'default', audioEvent: 'piece_drop', enabled: false
    });

    const overlay = createConnect4Overlay();
    const initialFetches = overlay.dom.window.fetch.mock.calls.length;
    overlay.handlers.get('game-engine:audio-state-updated')(publicPacket.payload);
    expect(overlay.dom.window.fetch.mock.calls.length).toBeGreaterThan(initialFetches);
    expect(overlay.dom.window.fetch.mock.calls.some(([url]) => String(url).includes('/api/game-engine/media/connect4'))).toBe(true);
    overlay.close();
  });

  test.each([
    { gameType: 'wheel', scopeId: '5', audioEvent: 'spinning', enabled: true },
    { gameType: 'slot', scopeId: '2', audioEvent: 'spin', enabled: false },
    { gameType: 'connect4', audioEvent: 'spinning', enabled: true },
    { gameType: 'connect4', audioEvent: 'piece_drop', enabled: 1 },
    undefined
  ])('withholds unrelated or malformed audio state %# from public sockets', payload => {
    expect(projectPublicOverlayPayload('game-engine:audio-state-updated', payload)).toBeNull();
    const sockets = createSocketPair();
    sockets.io.emit('game-engine:audio-state-updated', payload);
    expect(sockets.local).toEqual([{ eventName: 'game-engine:audio-state-updated', payload }]);
    expect(sockets.publicPackets).toEqual([]);
  });

  test('drops extra producer metadata while preserving the known event contract', () => {
    expect(projectPublicOverlayPayload('game-engine:audio-state-updated', {
      gameType: 'connect4', scopeId: 'default', audioEvent: 'timer_warning', enabled: true,
      userId: 'private', trace: { internal: true }
    })).toEqual({ gameType: 'connect4', audioEvent: 'timer_warning', enabled: true });
  });
});
