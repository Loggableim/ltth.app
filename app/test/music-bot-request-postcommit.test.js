'use strict';

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const MusicBotPlugin = require('../plugins/music-bot/main');

function response() {
  const res = new EventEmitter();
  Object.assign(res, {
    statusCode: 200,
    payload: null,
    writableFinished: false,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    setHeader() {}
  });
  return res;
}

async function invoke(handlers, body) {
  const req = new EventEmitter();
  Object.assign(req, { socket: { remoteAddress: '192.0.2.44' }, body });
  const res = response();
  async function dispatch(index) {
    if (!handlers[index]) return;
    await handlers[index](req, res, () => dispatch(index + 1));
  }
  await dispatch(0);
  return res;
}

function fixture(autoPlay) {
  const routes = new Map();
  const queue = [];
  const song = { id: 'fixture:one', trackKey: 'fixture:one', title: 'Synthetic song', artist: 'Offline', duration: 60 };
  const api = {
    getSocketIO: jest.fn(() => ({ emit: jest.fn() })),
    getDatabase: jest.fn(() => ({})),
    registerRoute: jest.fn((method, route, ...handlers) => routes.set(`${method}:${route}`, handlers)),
    emit: jest.fn(),
    log: jest.fn()
  };
  const plugin = new MusicBotPlugin(api);
  plugin.config.playback.autoPlay = true;
  plugin.musicResolver = { resolve: jest.fn(async () => ({ success: true, song })) };
  plugin.queueManager = {
    addSong: jest.fn((item) => { queue.push(item); return { success: true, song: item, position: queue.length }; })
  };
  plugin.autoDJ = { setRequestSeed: jest.fn(), onSongRequested: jest.fn() };
  plugin.playbackEngine = { getNowPlaying: jest.fn(() => null) };
  plugin._isPlaybackOccupied = jest.fn(() => false);
  plugin._getBanRejection = jest.fn(() => null);
  plugin._invalidateRadioPrefetch = jest.fn();
  plugin._cancelNextSongVote = jest.fn();
  plugin._schedulePreCache = jest.fn();
  plugin._emitSongAdded = jest.fn();
  plugin._emitToast = jest.fn();
  plugin._playNextFromQueue = jest.fn(autoPlay);
  plugin._registerRoutes();
  return { plugin, routes, queue, song };
}

test.each([
  ['throws', async () => { const error = new Error('synthetic MPV startup failure'); error.code = 'MPV_START_FAILED'; throw error; }, 'MPV_START_FAILED'],
  ['returns failure', async () => ({ success: false, errorCode: 'PLAYBACK_SUPERVISOR_LOCKED' }), 'PLAYBACK_SUPERVISOR_LOCKED']
])('reports an accepted queue commit when optional auto-play %s', async (_case, autoPlay, expectedCode) => {
  const state = fixture(autoPlay);
  const res = await invoke(state.routes.get('post:/api/plugins/music-bot/request'), { query: 'synthetic song' });

  expect(res.statusCode).toBe(200);
  expect(res.payload).toMatchObject({
    success: true,
    song: { title: 'Synthetic song', requestedBy: 'dashboard' },
    position: 1,
    playback: { attempted: true, started: false, code: expectedCode }
  });
  expect(state.plugin.queueManager.addSong).toHaveBeenCalledTimes(1);
  expect(state.queue).toHaveLength(1);
  expect(state.plugin.musicResolver.resolve).toHaveBeenCalledTimes(1);

  const ui = fs.readFileSync(path.resolve(__dirname, '../plugins/music-bot/assets/ui.js'), 'utf8').replace(/\r\n/g, '\n');
  expect(ui).toContain('if (result.playback?.started === false)');
  expect(ui).toContain("tr('requestAcceptedPlaybackFailed'");
  expect(ui).toContain('requestFeedback.textContent = `✅ ${tr(\'queueAdded\'');
});
