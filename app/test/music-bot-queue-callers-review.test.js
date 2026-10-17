const fs = require('fs');
const path = require('path');
const MusicBotPlugin = require('../plugins/music-bot/main');

function createFixture(removeSong, { current = null, stop = async () => undefined, advance = async () => ({ success: true }), addBan = jest.fn(() => ({ id: 7 })) } = {}) {
  const routes = new Map();
  const api = {
    getSocketIO: () => ({ emit: jest.fn() }),
    getDatabase: () => ({}),
    registerRoute: (method, route, handler) => routes.set(`${method}:${route}`, handler),
    emit: jest.fn(),
    log: jest.fn()
  };
  const plugin = new MusicBotPlugin(api);
  const track = { id: 'track-1', songId: 41, title: 'Synthetic', artist: 'Fixture Artist' };
  const playback = { current };
  const queue = [track];
  plugin.musicCatalog = null;
  plugin._findTrackForBan = jest.fn(() => track);
  plugin._resolveTrackBanSelection = jest.fn(() => ({ success: true, type: 'artist', value: 'fixture artist' }));
  plugin._trackMatchesBanSelection = jest.fn(() => true);
  plugin.banList = { addBan };
  plugin.queueManager = {
    getQueue: jest.fn(() => queue),
    removeSong: jest.fn((index) => {
      const result = removeSong(index, queue);
      if (result.success) queue.splice(index, 1);
      return result;
    })
  };
  plugin.playbackEngine = {
    getNowPlaying: jest.fn(() => playback.current),
    stop: jest.fn(async () => { await stop(); playback.current = null; }),
    clearNowPlaying: jest.fn(() => { playback.current = null; })
  };
  plugin._emitQueue = jest.fn();
  plugin._playNextFromQueue = jest.fn(advance);
  plugin._registerRoutes();
  return { api, plugin, queue, handler: routes.get('post:/api/plugins/music-bot/bans/from-track') };
}

function response() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
}

test('ban route does not report requested queue cleanup as complete when persistence blocks removal', async () => {
  const fixture = createFixture(() => ({
    success: false,
    blocked: true,
    errorCode: 'QUEUE_PERSISTENCE_BLOCKED',
    error: 'Persistence is blocked'
  }));
  const res = response();
  await fixture.handler({ body: { trackId: 'track-1', scope: 'artist', removeQueued: true, stopCurrent: false } }, res);

  expect(fixture.plugin.banList.addBan).toHaveBeenCalledTimes(1);
  expect(fixture.queue).toHaveLength(1);
  expect(fixture.plugin._emitQueue).toHaveBeenCalledTimes(1);
  expect(res.payload).toMatchObject({
    success: true,
    removedQueued: 0,
    queueRemovalRequested: true,
    queueRemovalComplete: false,
    queueRemovalFailedCount: 1,
    queueRemovalFailureCode: 'QUEUE_PERSISTENCE_BLOCKED'
  });

  const ui = fs.readFileSync(path.resolve(__dirname, '../plugins/music-bot/assets/ui.js'), 'utf8').replace(/\r\n/g, '\n');
  expect(ui).toContain('result.queueRemovalRequested && result.queueRemovalComplete === false');
  expect(ui).toContain("showToast(\n        'warn'");
  expect(ui).toContain("tr('queueMatchesRemovalFailed'");
});

test('ban route marks requested queue cleanup complete only after removal succeeds', async () => {
  const fixture = createFixture((_index, queue) => ({ success: true, song: queue[0] }));
  const res = response();
  await fixture.handler({ body: { trackId: 'track-1', scope: 'artist', removeQueued: true, stopCurrent: false } }, res);

  expect(fixture.queue).toHaveLength(0);
  expect(res.payload).toMatchObject({
    success: true,
    removedQueued: 1,
    queueRemovalRequested: true,
    queueRemovalComplete: true,
    queueRemovalFailedCount: 0,
    queueRemovalFailureCode: null
  });
});

test.each([
  ['queue removal not requested', false],
  ['queue removal requested with no matching entries', true]
])('ban UI reports the saved ban rather than zero queue removals when %s', async (_label, removeQueued) => {
  const fixture = createFixture(() => ({ success: false, errorCode: 'NO_MATCHING_ENTRY' }));
  if (removeQueued) fixture.queue.length = 0;
  const res = response();
  await fixture.handler({ body: {
    trackId: 'track-1', scope: 'artist', removeQueued, stopCurrent: false
  } }, res);

  expect(res.statusCode).toBe(200);
  expect(res.payload).toMatchObject({
    success: true,
    queueRemovalRequested: removeQueued,
    removedQueued: 0,
    queueRemovalComplete: true
  });
  expect(fixture.plugin.banList.addBan).toHaveBeenCalledTimes(1);

  const ui = fs.readFileSync(path.resolve(__dirname, '../plugins/music-bot/assets/ui.js'), 'utf8').replace(/\r\n/g, '\n');
  expect(ui).toContain('if (!result.queueRemovalRequested || Number(result.removedQueued || 0) === 0)');
  expect(ui).toContain("tr('banAdded', 'Ban hinzugefügt.')");
  expect(ui).toContain("tr('queueMatchesRemoved', '{count} Queue-Treffer entfernt.'");
});


test('ban remains committed and queue/history refresh on remove and stop partial failures', async () => {
  const fixture = createFixture(
    () => ({ success: false, blocked: true, errorCode: 'QUEUE_PERSISTENCE_BLOCKED' }),
    { current: { id: 'current-1', title: 'Synthetic current' }, stop: async () => { throw new Error('synthetic stop timeout'); } }
  );
  const res = response();
  await fixture.handler({ body: {
    trackId: 'track-1', scope: 'artist', removeQueued: true, stopCurrent: true
  } }, res);

  expect(fixture.plugin.banList.addBan).toHaveBeenCalledTimes(1);
  expect(fixture.queue).toHaveLength(1);
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
    playbackAdvanceFailureCode: null,
    queueRemovalRequested: true,
    queueRemovalComplete: false,
    queueRemovalFailedCount: 1,
    queueRemovalFailureCode: 'QUEUE_PERSISTENCE_BLOCKED'
  });
  expect(fixture.plugin._emitQueue).toHaveBeenCalledTimes(1);
  expect(fixture.api.emit).toHaveBeenCalledWith('musicbot:history-update', { songId: 41, refresh: true });
  expect(fixture.api.emit).not.toHaveBeenCalledWith('musicbot:playback-stopped', expect.anything());
  expect(fixture.api.emit).not.toHaveBeenCalledWith('musicbot:now-playing', null);
  expect(fixture.plugin._playNextFromQueue).not.toHaveBeenCalled();

  const ui = fs.readFileSync(path.resolve(__dirname, '../plugins/music-bot/assets/ui.js'), 'utf8').replace(/\r\n/g, '\n');
  expect(ui).toContain('if (result.playbackStopFailed)');
  expect(ui).toContain("tr('trackBanStopFailed'");
  expect(ui).toContain('if (result.playbackStopFailed || result.playbackAdvanceFailed || queueRemovalIncomplete) return;');
  expect(ui.indexOf('if (!result?.success)')).toBeLessThan(ui.indexOf('closeTrackBanMenu();'));
});

test('ban removal and stop both complete successfully before emitting success state', async () => {
  const fixture = createFixture((_index, queue) => ({ success: true, song: queue[0] }), {
    current: { id: 'current-1', title: 'Synthetic current' }
  });
  const res = response();
  await fixture.handler({ body: {
    trackId: 'track-1', scope: 'artist', removeQueued: true, stopCurrent: true
  } }, res);

  expect(fixture.queue).toHaveLength(0);
  expect(res.payload).toMatchObject({
    success: true,
    stoppedCurrent: true,
    playbackStopAttempted: true,
    playbackStopped: true,
    playbackStopFailed: false,
    playbackAdvanceFailed: false,
    queueRemovalComplete: true,
    removedQueued: 1
  });
  expect(fixture.api.emit).toHaveBeenCalledWith('musicbot:playback-stopped', {});
  expect(fixture.api.emit).toHaveBeenCalledWith('musicbot:now-playing', null);
  expect(fixture.api.emit).toHaveBeenCalledWith('musicbot:history-update', { songId: 41, refresh: true });
  expect(fixture.plugin._playNextFromQueue).toHaveBeenCalledTimes(1);
});

test.each([
  ['throw', async () => { const error = new Error('synthetic next-track start failure'); error.code = 'NEXT_START_FAILED'; throw error; }, 'NEXT_START_FAILED'],
  ['failure result', async () => ({ success: false, errorCode: 'QUEUE_PERSISTENCE_BLOCKED' }), 'QUEUE_PERSISTENCE_BLOCKED']
])('committed ban and queue/history remain successful when auto-advance returns %s', async (_label, advance, expectedCode) => {
  const fixture = createFixture((_index, queue) => ({ success: true, song: queue[0] }), {
    current: { id: 'current-1', title: 'Synthetic current' },
    advance
  });
  const res = response();
  await fixture.handler({ body: {
    trackId: 'track-1', scope: 'artist', removeQueued: true, stopCurrent: true
  } }, res);

  expect(fixture.plugin.banList.addBan).toHaveBeenCalledTimes(1);
  expect(fixture.queue).toHaveLength(0);
  expect(res.statusCode).toBe(200);
  expect(res.payload).toMatchObject({
    success: true,
    ban: { id: 7 },
    stoppedCurrent: true,
    playbackStopped: true,
    playbackStopFailed: false,
    playbackAdvanceFailed: true,
    playbackAdvanceFailureCode: expectedCode,
    removedQueued: 1,
    queueRemovalComplete: true
  });
  expect(fixture.plugin._emitQueue).toHaveBeenCalledTimes(1);
  expect(fixture.api.emit).toHaveBeenCalledWith('musicbot:history-update', { songId: 41, refresh: true });

  const ui = fs.readFileSync(path.resolve(__dirname, '../plugins/music-bot/assets/ui.js'), 'utf8').replace(/\r\n/g, '\n');
  expect(ui).toContain('if (result.playbackAdvanceFailed)');
  expect(ui).toContain("tr('trackBanAdvanceFailed'");
  expect(ui).toContain('if (result.playbackStopFailed || result.playbackAdvanceFailed || queueRemovalIncomplete) return;');
});

test('ban creation failure does not mutate or report queue/playback cleanup', async () => {
  const addBan = jest.fn(() => { throw new Error('synthetic ban storage failure'); });
  const stop = jest.fn();
  const fixture = createFixture(() => ({ success: true }), {
    current: { id: 'current-1', title: 'Synthetic current' },
    stop,
    addBan
  });
  const res = response();
  await fixture.handler({ body: {
    trackId: 'track-1', scope: 'artist', removeQueued: true, stopCurrent: true
  } }, res);

  expect(res.statusCode).toBe(500);
  expect(res.payload).toMatchObject({ success: false, error: 'synthetic ban storage failure' });
  expect(fixture.plugin.queueManager.removeSong).not.toHaveBeenCalled();
  expect(fixture.plugin.playbackEngine.stop).not.toHaveBeenCalled();
  expect(fixture.plugin._emitQueue).not.toHaveBeenCalled();
  expect(fixture.api.emit).not.toHaveBeenCalled();
});

test('all four moderation locales define both partial-failure warnings with matching placeholders', () => {
  const placeholderSets = new Map();
  for (const locale of ['de', 'en', 'es', 'fr']) {
    const messages = JSON.parse(fs.readFileSync(path.resolve(__dirname, `../plugins/music-bot/locales/${locale}.json`), 'utf8'));
    const moderation = messages.plugins['music-bot'].music_bot.ui.moderation;
    for (const key of ['queueMatchesRemovalFailed', 'trackBanStopFailed', 'trackBanAdvanceFailed']) {
      expect(moderation[key]).toBeTruthy();
      const placeholders = [...moderation[key].matchAll(/\{([^}]+)\}/g)].map((match) => match[1]).sort().join(',');
      const existing = placeholderSets.get(key);
      if (existing === undefined) placeholderSets.set(key, placeholders);
      else expect(placeholders).toBe(existing);
    }
  }
});
