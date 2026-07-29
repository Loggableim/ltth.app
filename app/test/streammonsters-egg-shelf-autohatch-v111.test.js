'use strict';

const Database = require('better-sqlite3');
const StreamAlchemyPlugin = require('../plugins/streamalchemy');
const StreamMonstersDatabase = require(
  '../plugins/streamalchemy/backend/streammonsters/database'
);
const StreamMonstersEngine = require(
  '../plugins/streamalchemy/backend/streammonsters/game-engine'
);
const FreeEggDropService = require(
  '../plugins/streamalchemy/backend/streammonsters/free-egg-drop-service'
);
const EggStageProjector = require(
  '../plugins/streamalchemy/backend/streammonsters/egg-stage-projector'
);
const StreamMonstersPublicEventProjector = require(
  '../plugins/streamalchemy/backend/streammonsters/public-event-projector'
);
const StreamMonstersBattleMatchService = require(
  '../plugins/streamalchemy/backend/streammonsters/battle-match-service'
);
const overlayRuntime = require('../plugins/streamalchemy/streammonsters-overlay-runtime');

function loadViewerActivityTracker() {
  try {
    return require(
      '../plugins/streamalchemy/backend/streammonsters/viewer-activity-tracker'
    );
  } catch {
    return null;
  }
}

function createSubject({ now = 1_000, hatchDurationMs = 100 } = {}) {
  const sqlite = new Database(':memory:');
  const store = new StreamMonstersDatabase(sqlite);
  store.initialize();
  const emitted = [];
  let currentNow = now;
  const engine = new StreamMonstersEngine({
    store,
    emit: (event, payload) => emitted.push({ event, payload }),
    now: () => currentNow,
    config: { hatchDurationMs, eggExpiryMs: 86_400_000 }
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
    sqlite,
    store,
    engine,
    emitted,
    now: () => currentNow,
    setNow(value) {
      currentNow = value;
    }
  };
}

function gift(subject, userId, eventKey) {
  return subject.engine.processGift({
    userId,
    displayName: userId === 'viewer-active' ? 'Active Viewer' : 'Away Viewer',
    giftId: 77,
    giftName: 'Team Heart',
    eventKey
  });
}

describe('Stream Monsters 1.11 living egg shelf and active-owner loop', () => {
  test('tracks only same-stream chat or gift activity for the preceding 300 seconds', () => {
    const ViewerActivityTracker = loadViewerActivityTracker();
    expect(ViewerActivityTracker).toEqual(expect.any(Function));
    if (!ViewerActivityTracker) return;
    let now = 1_000;
    const tracker = new ViewerActivityTracker({ now: () => now });

    expect(tracker.observe({
      userId: 'viewer-a',
      streamKey: 'creator:stream-1',
      source: 'chat'
    })).toBe(true);
    expect(tracker.isActive({
      userId: 'viewer-a',
      streamKey: 'creator:stream-1'
    })).toBe(true);
    expect(tracker.isActive({
      userId: 'viewer-a',
      streamKey: 'creator:stream-2'
    })).toBe(false);
    expect(tracker.observe({
      userId: 'viewer-b',
      streamKey: 'creator:stream-1',
      source: 'follow'
    })).toBe(false);

    now = 301_000;
    expect(tracker.isActive({
      userId: 'viewer-a',
      streamKey: 'creator:stream-1'
    })).toBe(true);
    now = 301_001;
    expect(tracker.isActive({
      userId: 'viewer-a',
      streamKey: 'creator:stream-1'
    })).toBe(false);
  });

  test('auto-hatches each ready owned egg once only for a recently active owner', () => {
    const subject = createSubject();
    gift(subject, 'viewer-active', 'gift-active');
    gift(subject, 'viewer-away', 'gift-away');
    subject.setNow(1_100);
    subject.engine.markReadyEggs();

    expect(typeof subject.engine.autoHatchReadyEggs).toBe('function');
    if (typeof subject.engine.autoHatchReadyEggs !== 'function') return;
    const first = subject.engine.autoHatchReadyEggs({
      isViewerActive: userId => userId === 'viewer-active'
    });
    const replay = subject.engine.autoHatchReadyEggs({
      isViewerActive: userId => userId === 'viewer-active'
    });

    expect(first).toHaveLength(1);
    expect(replay).toEqual([]);
    expect(subject.store.getViewerEggs('viewer-active')[0].state).toBe('hatched');
    expect(subject.store.getViewerEggs('viewer-away')[0].state).toBe('ready');
    expect(subject.emitted.filter(entry => (
      entry.event === 'streammonsters:egg_hatched'
    ))).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({ autoHatch: true })
      })
    ]);
  });

  test('preserves automatic hatch provenance through the public projector only', () => {
    const automatic = createSubject();
    const manual = createSubject();
    gift(automatic, 'viewer-active', 'gift-auto-public');
    gift(manual, 'viewer-active', 'gift-manual-public');
    automatic.setNow(1_100);
    manual.setNow(1_100);
    automatic.engine.markReadyEggs();
    manual.engine.markReadyEggs();

    automatic.engine.autoHatchReadyEggs({ isViewerActive: () => true });
    manual.engine.hatchEgg('viewer-active', 1);

    const automaticRaw = automatic.emitted.find(entry => (
      entry.event === 'streammonsters:egg_hatched'
    )).payload;
    const manualRaw = manual.emitted.find(entry => (
      entry.event === 'streammonsters:egg_hatched'
    )).payload;
    const automaticPublic = new StreamMonstersPublicEventProjector({
      store: automatic.store
    }).project('streammonsters:egg_hatched', automaticRaw);
    const manualPublic = new StreamMonstersPublicEventProjector({
      store: manual.store
    }).project('streammonsters:egg_hatched', manualRaw);

    expect(automaticPublic).toEqual(expect.objectContaining({
      autoHatch: true,
      displayName: '@Active Viewer',
      owner: expect.objectContaining({
        displayName: '@Active Viewer',
        initials: 'AV'
      }),
      egg: expect.objectContaining({ element: 'Ember' }),
      monster: expect.objectContaining({
        name: expect.any(String),
        element: 'Ember'
      })
    }));
    expect(manualPublic.autoHatch).toBeUndefined();
    for (const [raw, projected] of [
      [automaticRaw, automaticPublic],
      [manualRaw, manualPublic]
    ]) {
      const publicJson = JSON.stringify(projected);
      expect(publicJson).not.toContain(raw.userId);
      expect(publicJson).not.toContain(raw.egg.egg_id);
      expect(publicJson).not.toContain(raw.monster.monster_id);
    }
  });

  test('projects ready and hatch removal transitions without exposing ownership ids', () => {
    const subject = createSubject();
    const spawned = gift(subject, 'viewer-active', 'gift-stage');
    const landed = subject.emitted.find(entry => (
      entry.event === 'streammonsters:egg_landed'
    )).payload;

    subject.setNow(1_100);
    subject.engine.markReadyEggs();
    const ready = subject.emitted.find(entry => (
      entry.event === 'streammonsters:egg_ready'
    )).payload;
    expect(ready).toEqual(expect.objectContaining({
      eventId: expect.stringMatching(/^sm-[a-f0-9]{32}$/),
      correlationId: expect.stringMatching(/^sm-[a-f0-9]{32}$/),
      eggStage: expect.objectContaining({
        visualId: landed.eggStage.visualId,
        state: 'ready',
        provenance: 'gift',
        adoptionStatus: 'owned',
        adoptable: false
      })
    }));

    subject.engine.hatchEgg('viewer-active', 1);
    const removals = subject.emitted.filter(entry => (
      entry.event === 'streammonsters:egg_stage_removed'
    ));
    expect(removals).toHaveLength(1);
    expect(removals[0].payload).toEqual(expect.objectContaining({
      eventId: expect.stringMatching(/^sm-[a-f0-9]{32}$/),
      correlationId: expect.stringMatching(/^sm-[a-f0-9]{32}$/),
      eggStage: expect.objectContaining({
        visualId: landed.eggStage.visualId,
        state: 'hatched'
      })
    }));
    expect(JSON.stringify([ready.eggStage, removals[0].payload.eggStage]))
      .not.toMatch(new RegExp(`${spawned.egg.egg_id}|viewer-active|egg_id|user_id`));
  });

  test('emits exact stage refreshes when FIFO eggs are promoted or boosted', () => {
    const subject = createSubject();
    Array.from({ length: 4 }, (_, index) => (
      gift(subject, 'viewer-active', `gift-stage-${index}`)
    ));
    const queued = subject.emitted.filter(entry => (
      entry.event === 'streammonsters:egg_landed'
    ))[3].payload.eggStage;
    expect(queued).toEqual(expect.objectContaining({
      state: 'queued',
      queuePosition: 1,
      timing: expect.objectContaining({ readyAtMs: null })
    }));

    subject.setNow(1_100);
    subject.engine.markReadyEggs();
    const promoted = subject.emitted.find(entry => (
      entry.event === 'streammonsters:egg_stage_updated' &&
      entry.payload.eggStage.visualId === queued.visualId
    ));
    expect(promoted?.payload).toEqual(expect.objectContaining({
      eventId: expect.stringMatching(/^sm-[a-f0-9]{32}$/),
      correlationId: expect.stringMatching(/^sm-[a-f0-9]{32}$/),
      reason: 'promoted',
      eggStage: expect.objectContaining({
        state: 'incubating',
        queuePosition: null,
        timing: expect.objectContaining({ readyAtMs: 1_200 })
      })
    }));

    subject.store.upsertGiftMapping({
      giftId: 88,
      giftName: 'Rose',
      element: 'Ember',
      effect: 'boost',
      enabled: true
    });
    subject.engine.processGift({
      userId: 'viewer-active',
      displayName: 'Active Viewer',
      giftId: 88,
      giftName: 'Rose',
      eventKey: 'boost-stage'
    });
    const boosted = subject.emitted.find(entry => (
      entry.event === 'streammonsters:egg_boosted'
    ));
    expect(boosted?.payload.eggStage).toEqual(expect.objectContaining({
      visualId: queued.visualId,
      state: 'incubating',
      timing: expect.objectContaining({ readyAtMs: 1_000 })
    }));
  });

  test('removes a claimed offer from the public shelf while retaining its private inventory egg', () => {
    const subject = createSubject({ hatchDurationMs: 120_000 });
    const freeEggs = new FreeEggDropService({
      store: subject.store,
      engine: subject.engine,
      now: subject.now
    });
    freeEggs.onFirstChat({
      userId: 'viewer-a',
      streamKey: 'creator:stream-1',
      eventId: 'chat-1',
      displayName: 'Viewer A',
      nowMs: 1_000
    });
    const claimed = freeEggs.adopt({
      userId: 'viewer-a',
      streamKey: 'creator:stream-1',
      eventId: 'adopt-1',
      nowMs: 1_001
    });
    const projector = new EggStageProjector({ store: subject.store, now: subject.now });

    expect(claimed).toEqual(expect.objectContaining({ success: true, status: 'claimed' }));
    expect(subject.store.getViewerEggs('viewer-a')).toEqual([
      expect.objectContaining({ provenance: 'free', ownership_state: 'owned' })
    ]);
    expect(projector.snapshot('creator:stream-1')).toEqual([]);
    freeEggs.destroy();
  });

  test('keeps persisted incubation deadlines and an explicit disabled auto-hatch setting', () => {
    const subject = createSubject({ hatchDurationMs: 120_000 });
    const spawned = gift(subject, 'viewer-active', 'gift-preserved').egg;
    subject.store.db.prepare(
      'UPDATE streammonsters_eggs SET ready_at_ms = ? WHERE egg_id = ?'
    ).run(987_654, spawned.egg_id);
    subject.store.initialize();
    expect(subject.store.getEgg(spawned.egg_id).ready_at_ms).toBe(987_654);

    const plugin = new StreamAlchemyPlugin({ getConfig: () => ({}) });
    expect(plugin.loadConfig({
      streamMonsters: {
        autoHatchActiveViewers: false,
        autoHatchActiveWindowSeconds: 180
      }
    }).streamMonsters).toEqual(expect.objectContaining({
      autoHatchActiveViewers: false,
      autoHatchActiveWindowSeconds: 180
    }));
    expect(plugin.loadConfig({ streamMonsters: {} }).streamMonsters)
      .toEqual(expect.objectContaining({
        autoHatchActiveViewers: true,
        autoHatchActiveWindowSeconds: 300
      }));
  });

  test('sanitizes empty, Unknown and numeric public egg owners to a readable fallback', () => {
    const eggStage = new EggStageProjector({
      store: { getViewerDisplayName: () => '7392847109283746102' }
    });
    const publicEvents = new StreamMonstersPublicEventProjector({
      store: { getViewerDisplayName: () => 'Unknown' }
    });

    for (const sourceDisplayName of [
      '',
      'Unknown',
      '1234567',
      '@42',
      '@7392847109283746102'
    ]) {
      expect(eggStage.projectOffer({
        offer_id: `offer-${sourceDisplayName || 'empty'}`,
        source_display_name: sourceDisplayName,
        element: 'Grove',
        status: 'reserved'
      }).displayName).toBe('Viewer');
    }
    expect(publicEvents.project('streammonsters:egg_hatched', {
      userId: 'tiktok:7392847109283746102',
      displayName: '1234567',
      egg: { element: 'Grove' },
      monster: { name: 'Sprig', element: 'Grove' }
    })).toEqual(expect.objectContaining({
      displayName: 'Viewer',
      owner: expect.objectContaining({ displayName: 'Viewer', initials: 'V' })
    }));
    expect(StreamMonstersBattleMatchService.prototype.publicViewerName.call({
      store: { getViewerDisplayName: () => '42' }
    }, 'viewer-short-numeric')).toBe('Viewer');
  });

  test.each([
    [477, 829],
    [1080, 1920]
  ])('keeps the notification lane above the egg shelf at %ix%i', (width, height) => {
    expect(typeof overlayRuntime.notificationShelfLayout).toBe('function');
    if (typeof overlayRuntime.notificationShelfLayout !== 'function') return;
    const layout = overlayRuntime.notificationShelfLayout({ width, height });

    expect(overlayRuntime.rectanglesOverlap(layout.notification, layout.shelf)).toBe(false);
    expect(layout.notification.y + layout.notification.height)
      .toBeLessThanOrEqual(layout.shelf.y - layout.gap);
    expect(layout.shelf.y + layout.shelf.height)
      .toBeLessThanOrEqual(height * 0.74);
  });
});
