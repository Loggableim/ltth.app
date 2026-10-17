'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const GameEnginePlugin = require('../plugins/game-engine/main');
const { isOutgoingSocketEventAllowed } = require('../modules/public-overlay-registry');
const { protectPublicSocket } = require('../modules/public-overlay-access');
const { projectPublicOverlayPayload } = require('../modules/public-overlay-payload-projection');

const chessOverlayPath = path.resolve(__dirname, '../plugins/game-engine/overlay/chess.html');

function createSocketPair() {
  const local = [];
  const publicPackets = [];
  const publicSocket = {
    handshake: { headers: { host: 'fixture-game.trycloudflare.com' } },
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

function createChessOverlay() {
  const source = fs.readFileSync(chessOverlayPath, 'utf8');
  const inlineScript = [...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .find(([, attributes, contents]) => !/\bsrc\s*=/.test(attributes) && contents.includes("socket.on('game-engine:timer-update'"));
  if (!inlineScript) throw new Error('Chess overlay timer consumer was not found');
  const dom = new JSDOM(source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''), {
    runScripts: 'outside-only',
    url: 'http://localhost/plugins/game-engine/overlay/chess.html'
  });
  const handlers = new Map();
  const socket = {
    on: jest.fn((eventName, handler) => handlers.set(eventName, handler)),
    emit: jest.fn(),
    off: jest.fn()
  };
  dom.window.io = jest.fn(() => socket);
  dom.window.fetch = jest.fn(async () => ({ json: async () => ({ timerWarningTime: 30 }) }));
  dom.window.console.log = jest.fn();
  dom.window.eval(inlineScript[2]);
  return {
    dom,
    handlers,
    fire(eventName, payload) { return handlers.get(eventName)?.(payload); },
    close() { dom.window.close(); }
  };
}

describe('Game Engine public chess timer update projection', () => {
  test('keeps only the actual chess overlay timer fields from the live timer producer', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-07T12:00:00.000Z'));
    try {
      const sockets = createSocketPair();
      const plugin = Object.assign(Object.create(GameEnginePlugin.prototype), {
        io: sockets.io,
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        activeSessions: new Map(),
        unifiedQueue: null,
        db: { updateSession: jest.fn() }
      });
      const sessionId = 'fixture-internal-session-id';
      const started = plugin._startChessMatch(
        sessionId,
        { username: 'fixture-white', nickname: 'Fixture White', role: 'viewer', side: 'white', color: '#fff' },
        { username: 'fixture-black', nickname: 'Fixture Black', role: 'streamer', side: 'black', color: '#000' },
        { timerWarningTime: 30 },
        '5+0',
        'white',
        'chess'
      );
      expect(started).toMatchObject({ success: true, sessionId });
      expect(isOutgoingSocketEventAllowed('game-engine:timer-update')).toBe(true);

      jest.advanceTimersByTime(500);
      const localTimerPacket = sockets.local.find(packet => packet.eventName === 'game-engine:timer-update');
      const publicTimerPacket = sockets.publicPackets.find(packet => packet.eventName === 'game-engine:timer-update');
      expect(localTimerPacket).toEqual({
        eventName: 'game-engine:timer-update',
        payload: { sessionId, timers: { white: 299500, black: 300000 }, currentPlayer: 'white' }
      });
      expect(publicTimerPacket).toEqual({
        eventName: 'game-engine:timer-update',
        payload: { timers: { white: 299500, black: 300000 } }
      });
      expect(JSON.stringify(publicTimerPacket)).not.toContain(sessionId);

      const overlay = createChessOverlay();
      overlay.fire(publicTimerPacket.eventName, publicTimerPacket.payload);
      expect(overlay.dom.window.document.getElementById('white-timer').textContent).toBe('4:59');
      expect(overlay.dom.window.document.getElementById('black-timer').textContent).toBe('5:00');
      overlay.fire('game-engine:timer-update', localTimerPacket.payload);
      expect(overlay.dom.window.document.getElementById('white-timer').textContent).toBe('4:59');
      overlay.close();

      const game = plugin.activeSessions.get(sessionId);
      if (game?.timerInterval) clearInterval(game.timerInterval);
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });

  test.each([
    undefined,
    {},
    { timers: { white: 1000 } },
    { timers: { white: -1, black: 1000 } },
    { timers: { white: 1000, black: Infinity } },
    { timers: { white: 1000, black: 40000000000 } }
  ])('withholds malformed public timer payload %# while leaving local delivery intact', payload => {
    expect(projectPublicOverlayPayload('game-engine:timer-update', payload)).toBeNull();
    const sockets = createSocketPair();
    sockets.io.emit('game-engine:timer-update', payload);
    expect(sockets.local).toEqual([{ eventName: 'game-engine:timer-update', payload }]);
    expect(sockets.publicPackets).toEqual([]);
  });

  test('does not expose current player or unknown producer metadata', () => {
    expect(projectPublicOverlayPayload('game-engine:timer-update', {
      sessionId: 'private-session', currentPlayer: 'white', timers: { white: 100, black: 200 },
      source: 'internal', trace: { secret: true }
    })).toEqual({ timers: { white: 100, black: 200 } });
  });
});
