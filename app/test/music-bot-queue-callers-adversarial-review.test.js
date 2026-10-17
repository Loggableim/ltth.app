const fs = require('fs');
const path = require('path');
const MusicBotPlugin = require('../plugins/music-bot/main');

function response() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
}

test('adversarial: stop failure reports committed ban/queue state and still refreshes history', async () => {
  const routes = new Map();
  const events = [];
  const api = {
    getSocketIO: () => ({ emit: jest.fn() }),
    getDatabase: () => ({}),
    registerRoute: (method, route, handler) => routes.set(`${method}:${route}`, handler),
    emit: (event, payload) => events.push({ event, payload }),
    log: jest.fn()
  };
  const plugin = new MusicBotPlugin(api);
  const queued = { id: 'queued', title: 'Queued', songId: 11 };
  const current = { id: 'current', title: 'Current', songId: 12 };
  const queue = [queued];
  plugin.musicCatalog = { getHistoryEvent: jest.fn(() => ({ songId: 12, id: 'event-12', title: 'Current' })) };
  plugin._resolveTrackBanSelection = jest.fn(() => ({ success: true, type: 'artist', value: 'fixture artist' }));
  plugin._trackMatchesBanSelection = jest.fn(() => true);
  plugin.banList = { addBan: jest.fn(() => ({ id: 7 })) };
  plugin.queueManager = {
    getQueue: jest.fn(() => queue),
    removeSong: jest.fn((index) => ({ success: Boolean(queue.splice(index, 1).length) })),
    markPlaying: jest.fn()
  };
  plugin.playbackEngine = {
    getNowPlaying: jest.fn(() => current),
    stop: jest.fn(async () => { throw new Error('synthetic MPV stop timeout'); })
  };
  plugin._emitQueue = jest.fn();
  plugin._emitPlaybackStopped = jest.fn();
  plugin._emitNowPlaying = jest.fn();
  plugin._registerRoutes();

  const res = response();
  await routes.get('post:/api/plugins/music-bot/bans/from-track')({
    body: { catalogEventId: 'event-12', scope: 'artist', removeQueued: true, stopCurrent: true }
  }, res);

  expect(plugin.banList.addBan).toHaveBeenCalledTimes(1);
  expect(queue).toHaveLength(0);
  expect(plugin.queueManager.removeSong).toHaveBeenCalledTimes(1);
  expect(res.statusCode).toBe(200);
  expect(res.payload).toMatchObject({
    success: true,
    ban: { id: 7 },
    stoppedCurrent: false,
    playbackStopAttempted: true,
    playbackStopped: null,
    playbackStopFailed: true,
    playbackStopFailureCode: 'PLAYBACK_STOP_FAILED',
    playbackAdvanceFailed: false,
    removedQueued: 1,
    queueRemovalComplete: true
  });
  expect(plugin._emitQueue).toHaveBeenCalledTimes(1);
  expect(events).toContainEqual({ event: 'musicbot:history-update', payload: { songId: 12, refresh: true } });
  expect(plugin._emitPlaybackStopped).not.toHaveBeenCalled();
  expect(plugin._emitNowPlaying).not.toHaveBeenCalled();

  const ui = fs.readFileSync(path.resolve(__dirname, '../plugins/music-bot/assets/ui.js'), 'utf8').replace(/\r\n/g, '\n');
  expect(ui).toContain('if (result.playbackStopFailed)');
  expect(ui).toContain("tr('trackBanStopFailed'");
  expect(ui).toContain('if (!result?.success) {');
  expect(ui.indexOf('if (!result?.success)')).toBeLessThan(ui.indexOf('closeTrackBanMenu();'));
});
