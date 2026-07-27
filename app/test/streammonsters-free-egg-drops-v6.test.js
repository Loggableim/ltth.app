const Database = require('better-sqlite3');
const StreamMonstersDatabase = require('../plugins/streamalchemy/backend/streammonsters/database');
const StreamMonstersEngine = require('../plugins/streamalchemy/backend/streammonsters/game-engine');
const FreeEggDropService = require('../plugins/streamalchemy/backend/streammonsters/free-egg-drop-service');
const StreamAlchemyPlugin = require('../plugins/streamalchemy');

function createSubject({ now = 1_000, config = {} } = {}) {
  const store = new StreamMonstersDatabase(new Database(':memory:'));
  store.initialize();
  const emitted = [];
  let currentNow = now;
  const engine = new StreamMonstersEngine({
    store,
    now: () => currentNow,
    config: { hatchDurationMs: 120_000, eggExpiryMs: 86_400_000 }
  });
  engine.setStreamKey('creator:stream-1');
  const service = new FreeEggDropService({
    store,
    engine,
    emit: (event, payload) => emitted.push({ event, payload }),
    now: () => currentNow,
    config
  });
  return {
    store,
    engine,
    service,
    emitted,
    setNow(value) { currentNow = value; }
  };
}

function offer(subject, userId, eventId, nowMs) {
  return subject.service.onFirstChat({
    userId,
    streamKey: 'creator:stream-1',
    eventId,
    displayName: userId,
    nowMs
  });
}

function adopt(subject, userId, eventId, nowMs) {
  return subject.service.adopt({
    userId,
    streamKey: 'creator:stream-1',
    eventId,
    nowMs
  });
}

describe('Stream Monsters recurring free egg drops', () => {
  test('exposes enabled daily-drop defaults and both GCCE adoption aliases', () => {
    const plugin = new StreamAlchemyPlugin({ getConfig: () => ({}) });
    plugin.config = plugin.loadConfig({});

    expect(plugin.config.streamMonsters).toEqual(expect.objectContaining({
      freeEggDropsEnabled: true,
      freeEggCooldownSeconds: 86_400
    }));
    expect(plugin.buildStreamMonstersCommandDefinitions('!')
      .filter(definition => definition.commandName === 'adopt')
      .map(definition => definition.name))
      .toEqual(['adopt', 'adoptieren']);
  });

  test('observes a first non-command chat without consuming GCCE chat ingress', async () => {
    const observed = [];
    const plugin = new StreamAlchemyPlugin({ log: jest.fn() });
    plugin.config = { enabled: true, streamMonsters: { enabled: true } };
    plugin.streamMonstersEngine = { streamKey: 'creator:stream-1' };
    plugin.streamMonstersGCCERegistrationState = 'active_commands';
    plugin.resolveStreamMonstersViewerId = () => 'viewer-a';
    plugin.streamMonstersFreeEggDrops = {
      onFirstChat: input => observed.push(input)
    };

    await expect(plugin.handleStreamMonstersChat({
      userId: 'platform-a', uniqueId: 'viewer-a', nickname: 'Viewer A',
      comment: 'hello world', eventId: 'chat-1'
    })).resolves.toEqual({ success: false, status: 'gcce_active' });
    expect(observed).toEqual([expect.objectContaining({
      userId: 'viewer-a',
      streamKey: 'creator:stream-1',
      eventId: 'chat:tiktok:chat-1',
      displayName: 'Viewer A'
    })]);
  });

  test('uses an enabled daily default and gives the first chatter a standard egg without Hype', () => {
    const subject = createSubject();

    const offered = offer(subject, 'viewer-a', 'chat-a', 1_000);
    const claimed = adopt(subject, 'viewer-a', 'adopt-a', 1_000);

    expect(offered).toEqual(expect.objectContaining({ success: true, status: 'offered' }));
    expect(claimed).toEqual(expect.objectContaining({ success: true, status: 'claimed' }));
    expect(claimed.egg).toEqual(expect.objectContaining({
      variant: 'standard',
      state: 'incubating',
      hatch_duration_ms: 120_000
    }));
    expect(subject.store.getStreamHype('creator:stream-1')).toEqual(expect.objectContaining({ points: 0 }));
    expect(subject.emitted.map(entry => entry.event)).toEqual([
      'streammonsters:free_egg_offered',
      'streammonsters:free_egg_claimed'
    ]);
  });

  test('keeps an offer reserved for exactly 60 seconds before releasing it publicly', () => {
    const subject = createSubject();
    offer(subject, 'viewer-a', 'chat-a', 1_000);

    expect(adopt(subject, 'viewer-b', 'adopt-too-early', 60_999))
      .toEqual(expect.objectContaining({ success: false, status: 'no_offer' }));
    expect(adopt(subject, 'viewer-b', 'adopt-released', 61_000))
      .toEqual(expect.objectContaining({ success: true, status: 'claimed', sourceUserId: 'viewer-a' }));
    expect(subject.emitted.map(entry => entry.event)).toContain('streammonsters:free_egg_released');
  });

  test('adopts the oldest released offer in public FIFO order', () => {
    const subject = createSubject();
    offer(subject, 'viewer-a', 'chat-a', 1_000);
    offer(subject, 'viewer-b', 'chat-b', 1_001);

    expect(adopt(subject, 'viewer-c', 'adopt-c', 61_001).sourceUserId).toBe('viewer-a');
    expect(adopt(subject, 'viewer-d', 'adopt-d', 61_001).sourceUserId).toBe('viewer-b');
  });

  test('allows one successful claim per configured cooldown across streams', () => {
    const subject = createSubject({ config: { freeEggCooldownSeconds: 120 } });
    offer(subject, 'viewer-a', 'chat-a', 1_000);
    offer(subject, 'viewer-b', 'chat-b', 1_001);
    expect(adopt(subject, 'viewer-c', 'adopt-c', 61_001).success).toBe(true);

    expect(adopt(subject, 'viewer-c', 'adopt-cooldown', 121_000))
      .toEqual(expect.objectContaining({ success: false, status: 'cooldown' }));
  });

  test('deduplicates chat and adoption event ids and allows only one source offer per viewer and stream', () => {
    const subject = createSubject();
    const first = offer(subject, 'viewer-a', 'chat-a', 1_000);
    const retry = offer(subject, 'viewer-a', 'chat-a', 1_000);
    const secondChat = offer(subject, 'viewer-a', 'chat-b', 1_001);
    const claimed = adopt(subject, 'viewer-a', 'adopt-a', 1_001);
    const claimRetry = adopt(subject, 'viewer-a', 'adopt-a', 1_001);

    expect(retry).toEqual(first);
    expect(secondChat).toEqual(expect.objectContaining({ success: true, status: 'already_offered' }));
    expect(claimRetry).toEqual(claimed);
    expect(subject.store.getFreeEggOffers('creator:stream-1')).toHaveLength(1);
    expect(subject.store.getViewerEggs('viewer-a')).toHaveLength(1);
  });

  test('removes outstanding offers and their event receipts when a stream is cleaned up', () => {
    const subject = createSubject();
    offer(subject, 'viewer-a', 'chat-a', 1_000);

    expect(subject.service.cleanupStream({ streamKey: 'creator:stream-1' }))
      .toEqual({ offersRemoved: 1, eventsRemoved: 1 });
    expect(adopt(subject, 'viewer-b', 'adopt-after-cleanup', 61_000))
      .toEqual(expect.objectContaining({ success: false, status: 'no_offer' }));
  });

  test('recovers reserved offers after a service reload', () => {
    const subject = createSubject();
    offer(subject, 'viewer-a', 'chat-a', 1_000);
    const reloaded = new FreeEggDropService({
      store: subject.store,
      engine: subject.engine,
      emit: (event, payload) => subject.emitted.push({ event, payload }),
      now: () => 1_001
    });

    expect(reloaded.adopt({
      userId: 'viewer-a', streamKey: 'creator:stream-1', eventId: 'adopt-a', nowMs: 1_001
    })).toEqual(expect.objectContaining({ success: true, status: 'claimed' }));
  });

  test('atomically creates twenty eggs for twenty concurrent public claims', async () => {
    const subject = createSubject();
    for (let index = 0; index < 20; index += 1) {
      offer(subject, `source-${index}`, `chat-${index}`, 1_000 + index);
    }

    const claims = await Promise.all(Array.from({ length: 20 }, (_, index) => Promise.resolve(
      adopt(subject, `adopter-${index}`, `adopt-${index}`, 61_100)
    )));

    expect(claims.filter(result => result.success)).toHaveLength(20);
    expect(new Set(claims.map(result => result.offerId)).size).toBe(20);
    expect(subject.store.db.prepare('SELECT COUNT(*) AS count FROM streammonsters_free_egg_claims').get().count)
      .toBe(20);
  });
});
