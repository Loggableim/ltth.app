'use strict';

const Database = require('better-sqlite3');
const StreamMonstersDatabase = require(
  '../plugins/streamalchemy/backend/streammonsters/database'
);
const StreamMonstersEngine = require(
  '../plugins/streamalchemy/backend/streammonsters/game-engine'
);
const StreamMonstersViewerActivityTracker = require(
  '../plugins/streamalchemy/backend/streammonsters/viewer-activity-tracker'
);

function createSubject({ now = 1_000 } = {}) {
  const sqlite = new Database(':memory:');
  const store = new StreamMonstersDatabase(sqlite);
  store.initialize();
  const emitted = [];
  let currentNow = now;
  const engine = new StreamMonstersEngine({
    store,
    emit: (event, payload) => emitted.push({ event, payload }),
    now: () => currentNow,
    config: {
      hatchDurationMs: 100,
      autoHatchActiveViewers: true
    }
  });
  engine.setStreamKey('creator:stream-1');
  store.upsertGiftMapping({
    giftId: 77,
    giftName: 'Team Heart',
    element: 'Ember',
    effect: 'spawn',
    enabled: true
  });
  return {
    store,
    engine,
    emitted,
    setNow(value) {
      currentNow = value;
    }
  };
}

describe('Stream Monsters live-presence auto hatch', () => {
  test('only treats a recent event from the current live stream as active presence', () => {
    let now = 1_000;
    const tracker = new StreamMonstersViewerActivityTracker({
      now: () => now,
      activeWindowMs: 300_000
    });

    tracker.observe({ userId: 'viewer-a', streamKey: 'creator:stream-1' });
    expect(tracker.isActive({ userId: 'viewer-a', streamKey: 'creator:stream-1' })).toBe(true);
    expect(tracker.isActive({ userId: 'viewer-a', streamKey: 'creator:stream-2' })).toBe(false);

    now = 301_001;
    expect(tracker.isActive({ userId: 'viewer-a', streamKey: 'creator:stream-1' })).toBe(false);
  });

  test('auto-hatches ready owned eggs once only for viewers with current live presence', () => {
    const subject = createSubject();
    const tracker = new StreamMonstersViewerActivityTracker({
      now: () => 1_100,
      activeWindowMs: 300_000
    });
    subject.engine.processGift({
      userId: 'viewer-active',
      giftId: 77,
      giftName: 'Team Heart',
      eventKey: 'gift-active'
    });
    subject.engine.processGift({
      userId: 'viewer-away',
      giftId: 77,
      giftName: 'Team Heart',
      eventKey: 'gift-away'
    });
    tracker.observe({ userId: 'viewer-active', streamKey: 'creator:stream-1' });

    subject.setNow(1_100);
    subject.engine.markReadyEggs();
    const first = subject.engine.autoHatchReadyEggs({
      isViewerActive: userId => tracker.isActive({
        userId,
        streamKey: 'creator:stream-1'
      })
    });
    const replay = subject.engine.autoHatchReadyEggs({
      isViewerActive: userId => tracker.isActive({
        userId,
        streamKey: 'creator:stream-1'
      })
    });

    expect(first).toHaveLength(1);
    expect(first[0].user_id).toBe('viewer-active');
    expect(replay).toEqual([]);
    expect(subject.store.getViewerEggs('viewer-active')[0].state).toBe('hatched');
    expect(subject.store.getViewerEggs('viewer-away')[0].state).toBe('ready');
    expect(subject.emitted.filter(entry => entry.event === 'streammonsters:egg_hatched'))
      .toHaveLength(1);
  });
});
