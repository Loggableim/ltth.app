const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const StreamAlchemyPlugin = require('../plugins/stream-monsters');
const StreamMonstersDatabase = require(
  '../plugins/stream-monsters/backend/streammonsters/database'
);
const StreamMonstersPublicEventProjector = require(
  '../plugins/stream-monsters/backend/streammonsters/public-event-projector'
);
const { CRITICAL_EVENT_TYPES } = StreamMonstersPublicEventProjector;
const CollectionService = require(
  '../plugins/stream-monsters/backend/streammonsters/collection-service'
);
const ProgressionService = require(
  '../plugins/stream-monsters/backend/streammonsters/progression-service'
);
const EggStageProjector = require(
  '../plugins/stream-monsters/backend/streammonsters/egg-stage-projector'
);

function createRuntime() {
  const sqlite = new Database(':memory:');
  const store = new StreamMonstersDatabase(sqlite);
  store.initialize();
  const api = {
    emit: jest.fn(),
    log: jest.fn()
  };
  const plugin = new StreamAlchemyPlugin(api);
  plugin.streamMonstersStore = store;
  plugin.streamMonstersEngine = { streamKey: 'creator:live-1' };
  plugin.streamMonstersPublicEventProjector =
    new StreamMonstersPublicEventProjector({ store });
  return { sqlite, store, api, plugin };
}

describe('Stream Monsters v1.5 public event projection and reconnect outbox', () => {
  test('projects egg_spawned to the overlay contract before live and outbox delivery', () => {
    const { sqlite, store, api, plugin } = createRuntime();
    const raw = {
      userId: 'private-platform-user-id',
      displayName: 'Fixture Viewer',
      hint: '!eggs',
      gift: { giftId: 987654, giftName: 'Gift fixture', providerReceipt: 'private-receipt' },
      event: { providerUrl: 'https://provider.example/private', authorization: 'private-token' },
      egg: {
        egg_id: 'private-egg-row-id',
        user_id: 'private-platform-user-id',
        gift_id: 987654,
        seed: 'private-seed',
        visual_key: 'egg:ember:standard',
        element: 'Ember',
        state: 'incubating',
        variant: 'standard',
        ready_at_ms: 123456,
        image_url: 'https://provider.example/temporary.png',
        display_name: 'Fixture Viewer'
      }
    };

    const emitted = plugin.emitStreamMonsters('streammonsters:egg_spawned', raw);
    const recent = store.getRecentPublicEvents('creator:live-1');
    const pending = store.pendingOutboxEvents();
    expect(api.emit).toHaveBeenCalledWith('streammonsters:egg_spawned', emitted);
    expect(emitted).toEqual(expect.objectContaining({
      displayName: 'Fixture Viewer',
      hint: '!eggs',
      egg: expect.objectContaining({
        element: 'Ember',
        state: 'incubating',
        variant: 'standard',
        readyAtMs: 123456,
        imageUrl: null
      })
    }));
    expect(emitted.egg).not.toHaveProperty('egg_id');
    expect(emitted.egg).not.toHaveProperty('user_id');
    expect(emitted).not.toHaveProperty('gift');
    expect(emitted).not.toHaveProperty('event');
    expect(emitted).toEqual(expect.objectContaining({
      eventId: expect.stringMatching(/^sm-[a-f0-9]{32}$/),
      correlationId: expect.stringMatching(/^sm-[a-f0-9]{32}$/)
    }));
    expect(recent[0]).toEqual(expect.objectContaining({
      eventId: emitted.eventId,
      correlationId: emitted.correlationId,
      type: 'streammonsters:egg_spawned',
      payload: emitted
    }));
    expect(pending).toHaveLength(0);
    expect(JSON.stringify(emitted)).not.toMatch(/private-platform-user-id|private-egg-row-id|private-seed|987654|provider\.example|private-token|private-receipt/);
    sqlite.close();
  });

  test('preserves the validated late-collapse prompt choices from the battle service', () => {
    const projector = new StreamMonstersPublicEventProjector();
    const projected = projector.project('streammonsters:battle_choice_opened', {
      matchId: 'match-collapse-11',
      round: 11,
      deadlineMs: 15_000,
      choices: ['C', 'A', 'C', 'D', null]
    });

    expect(projected.choices).toEqual(['A', 'C']);
    expect(projector.project('streammonsters:battle_choice_opened', {
      matchId: 'legacy-match',
      round: 1,
      deadlineMs: 15_000
    }).choices).toEqual(['A', 'B', 'C']);
  });

  test('projects a charged special without exposing the internal monster database id', () => {
    const projector = new StreamMonstersPublicEventProjector();
    const projected = projector.project('streammonsters:battle_special_charged', {
      matchId: 'match-public-1',
      round: 3,
      slot: 1,
      charge: 100,
      monsterId: 'private-monster-id',
      monster: {
        monster_id: 'private-monster-id',
        name: 'Ashfang',
        element: 'Ember',
        template_id: 'ashfang',
        level: 4
      }
    });

    expect(projected).toEqual({
      matchId: 'match-public-1',
      round: 3,
      slot: 1,
      charge: 100,
      monster: expect.objectContaining({
        name: 'Ashfang',
        element: 'Ember',
        templateId: 'ashfang',
        level: 4
      })
    });
    expect(JSON.stringify(projected)).not.toContain('private-monster-id');
  });

  test('projects battle choice rejection feedback without choice or fighter identifiers', () => {
    const projector = new StreamMonstersPublicEventProjector();
    const projected = projector.project('streammonsters:battle_choice_rejected', {
      matchId: 'match-public-1',
      round: 3,
      slot: 2,
      reason: 'special_not_charged',
      messageKey: 'arenaChoiceSpecialNotCharged',
      choice: 'C',
      requestedChoice: 'C',
      participantId: 'private-participant',
      viewerId: 'private-viewer'
    });

    expect(projected).toEqual({
      matchId: 'match-public-1',
      round: 3,
      slot: 2,
      reason: 'special_not_charged',
      messageKey: 'arenaChoiceSpecialNotCharged'
    });
    expect(JSON.stringify(projected)).not.toMatch(/private|requestedChoice|["']C["']/);
  });

  test('redacts compound private identifiers while preserving public gameplay keys', () => {
    const projector = new StreamMonstersPublicEventProjector();
    const projected = projector.project('streammonsters:future_generic_event_fixture', {
      previousUserId: 'private-previous-user',
      prior_user_id: 'private-prior-user',
      previousViewerId: 'private-viewer',
      sourceUniqueId: 'private-unique-id',
      previousGiftId: 'private-gift',
      actorMonsterId: 'private-monster',
      queuedEggId: 'private-egg',
      stealId: 'private-steal',
      roundSeed: 'private-seed',
      providerVisualKey: 'private-visual-key',
      legacyVisualSource: 'private-visual-source',
      fallbackPoolKey: 'private-pool-key',
      upstreamProviderEventId: 'private-provider-event',
      nested: [{
        targetUserId: 'private-nested-user',
        trigger_gift_id: 'private-nested-gift',
        deterministic_seed: 'private-nested-seed'
      }],
      templateId: 'ashfang',
      skillId: 'ashfang-special',
      matchId: 'match-public-1',
      battleId: 'battle-public-1',
      seasonId: 'season-public-1',
      eventId: 'event-public-1',
      correlationId: 'correlation-public-1',
      vfxKey: 'ember-burst',
      element: 'Ember'
    });

    expect(projected).toEqual(expect.objectContaining({
      templateId: 'ashfang',
      skillId: 'ashfang-special',
      matchId: 'match-public-1',
      battleId: 'battle-public-1',
      seasonId: 'season-public-1',
      eventId: 'event-public-1',
      correlationId: 'correlation-public-1',
      vfxKey: 'ember-burst',
      element: 'Ember'
    }));
    const publicJson = JSON.stringify(projected);
    [
      'private-previous-user',
      'private-prior-user',
      'private-viewer',
      'private-unique-id',
      'private-gift',
      'private-monster',
      'private-egg',
      'private-steal',
      'private-seed',
      'private-visual-key',
      'private-visual-source',
      'private-pool-key',
      'private-provider-event',
      'private-nested-user',
      'private-nested-gift',
      'private-nested-seed'
    ].forEach(secret => expect(publicJson).not.toContain(secret));
  });

  test('projects chat cards without canonical IDs, database IDs, seeds or provider fields', () => {
    const { api, plugin } = createRuntime();

    plugin.emitStreamMonsters('streammonsters:chat_result', {
      userId: 'tiktok:private-platform-id',
      username: 'ReadableViewer',
      command: 'monster',
      transport: 'gcce',
      result: {
        success: true,
        status: 'monster',
        message: 'private server prose',
        messageKey: 'chatResultMonster',
        monster: {
          monster_id: 'private-monster-id',
          user_id: 'tiktok:private-platform-id',
          egg_id: 'private-egg-id',
          seed: 'private-seed',
          gift_id: 777,
          visual_key: 'private-visual-key',
          visual_source: 'provider',
          name: 'Ashfang',
          element: 'Ember',
          template_id: 'ashfang',
          image_url: '/plugins/streamalchemy/assets/streammonsters/furry/ashfang.png',
          level: 4,
          xp: 25,
          stats: { vitality: 7, might: 8, guard: 6, agility: 7 }
        }
      }
    });

    const emitted = api.emit.mock.calls[0][1];
    expect(emitted).toEqual(expect.objectContaining({
      displayName: 'ReadableViewer',
      command: 'monster',
      result: expect.objectContaining({
        status: 'monster',
        monster: expect.objectContaining({
          name: 'Ashfang',
          templateId: 'ashfang',
          level: 4,
          imageUrl: '/plugins/stream-monsters/assets/streammonsters/furry/ashfang.png'
        })
      })
    }));
    const publicJson = JSON.stringify(emitted);
    [
      'tiktok:private-platform-id',
      'private-monster-id',
      'private-egg-id',
      'private-seed',
      'private-visual-key',
      '"gift_id"',
      'private server prose'
    ].forEach(secret => expect(publicJson).not.toContain(secret));
  });

  test('projects monster discoveries to display name and normalized monster only', () => {
    const { store, api, plugin } = createRuntime();
    const emitted = plugin.emitStreamMonsters('streammonsters:monster_discovered', {
      userId: 'tiktok:private-platform-id',
      username: 'ReadableViewer',
      monster: {
        monster_id: 'private-monster-id',
        user_id: 'tiktok:private-platform-id',
        egg_id: 'private-egg-id',
        seed: 'private-seed',
        gift_id: 777,
        visual_key: 'private-visual-key',
        visual_source: 'provider',
        name: 'Ashfang',
        element: 'Ember',
        rarity: 'Rare',
        personality: 'Bold',
        template_id: 'ashfang',
        image_url: '/plugins/streamalchemy/assets/streammonsters/furry/ashfang.png',
        evolution_stage: 2,
        unspent_stat_points: 3,
        level: 4,
        xp: 25,
        stats: { vitality: 7, might: 8, guard: 6, agility: 7 }
      },
      template: {
        id: 'private-template-id',
        visualKey: 'private-template-visual-key',
        providerMetadata: 'private-provider-metadata'
      },
      nested: {
        previousUserId: 'private-previous-user',
        roundSeed: 'private-round-seed'
      }
    });

    expect(emitted).toEqual({
      displayName: 'ReadableViewer',
      monster: {
        name: 'Ashfang',
        element: 'Ember',
        rarity: 'Rare',
        level: 4,
        xp: 25,
        personality: 'Bold',
        templateId: 'ashfang',
        evolutionStage: 2,
        prestigeLevel: 0,
        unspentStatPoints: 3,
        imageUrl: '/plugins/stream-monsters/assets/streammonsters/furry/ashfang.png',
        stats: { vitality: 7, might: 8, guard: 6, agility: 7 }
      },
      eventId: expect.stringMatching(/^sm-[a-f0-9]{32}$/),
      correlationId: expect.stringMatching(/^sm-[a-f0-9]{32}$/)
    });
    expect(api.emit).toHaveBeenCalledTimes(1);
    expect(api.emit).toHaveBeenCalledWith(
      'streammonsters:monster_discovered',
      emitted
    );
    expect(store.getRecentPublicEvents('creator:live-1')).toEqual([
      expect.objectContaining({
        type: 'streammonsters:monster_discovered',
        payload: emitted
      })
    ]);
    const publicJson = JSON.stringify(emitted);
    [
      'tiktok:private-platform-id',
      'private-monster-id',
      'private-egg-id',
      'private-seed',
      'private-visual-key',
      'private-template-id',
      'private-template-visual-key',
      'private-provider-metadata',
      'private-previous-user',
      'private-round-seed'
    ].forEach(secret => expect(publicJson).not.toContain(secret));
  });

  test('uses stable opaque lifecycle IDs, suppresses duplicate live emits and replays one public event', () => {
    const { store, api, plugin } = createRuntime();
    store.resolveViewerIdentity({
      platformUserId: '123456789',
      legacyUserId: 'ReadableViewer',
      updatedAtMs: 1
    });
    const raw = {
      userId: 'tiktok:123456789',
      egg: {
        egg_id: 'private-egg-id',
        user_id: 'tiktok:123456789',
        gift_id: 777,
        seed: 'private-seed',
        visual_key: 'egg:ember:standard',
        element: 'Ember',
        state: 'incubating',
        variant: 'standard',
        ready_at_ms: 121_000,
        image_url: '/plugins/streamalchemy/assets/eggs/ember-standard.png'
      },
      gift: {
        giftId: 777,
        giftName: 'Team Heart',
        element: 'Ember',
        effect: 'spawn'
      }
    };

    const first = plugin.emitStreamMonsters('streammonsters:egg_spawned', raw);
    const duplicate = plugin.emitStreamMonsters('streammonsters:egg_spawned', raw);
    const recent = store.getRecentPublicEvents('creator:live-1');

    expect(first.eventId).toBe(duplicate.eventId);
    expect(first.correlationId).toBe(duplicate.correlationId);
    expect(first.eventId).toMatch(/^sm-[a-f0-9]{32}$/);
    expect(api.emit).toHaveBeenCalledTimes(1);
    expect(recent).toEqual([expect.objectContaining({
      sequence: 1,
      eventId: first.eventId,
      correlationId: first.correlationId,
      type: 'streammonsters:egg_spawned',
      payload: expect.objectContaining({
        displayName: 'ReadableViewer',
        eventId: first.eventId,
        correlationId: first.correlationId,
        egg: expect.objectContaining({
          element: 'Ember',
          readyAtMs: 121_000
        })
      })
    })]);
    const publicJson = JSON.stringify(recent);
    [
      '123456789',
      'private-egg-id',
      'private-seed',
      '"giftId"',
      '"gift_id"',
      'visual_key'
    ].forEach(secret => expect(publicJson).not.toContain(secret));
  });

  test('persists one bounded battle completion for reconnect with its stable identity', () => {
    const { store, api, plugin } = createRuntime();
    const raw = {
      matchId: 'match-public-report',
      winnerSlot: 1,
      completion: 'battle',
      terminalReason: 'knockout',
      knockout: {
        round: 2,
        remainingHp: 8,
        maxHp: 40
      },
      eventId: 'match-public-report:event:9',
      correlationId: 'match-public-report',
      seed: 'private-seed',
      combatReport: {
        roundCount: 2,
        durationMs: 1_500,
        decisiveSkill: {
          round: 2,
          ownerSlot: 1,
          choice: 'C',
          skillName: 'Solar Bloom',
          skillIcon: '☀️',
          actorId: 'private-monster'
        },
        fighters: [{
          slot: 1,
          playerName: 'tiktok:7123456789012345678',
          monsterName: 'Ashfang',
          damageDealt: Number.MAX_VALUE,
          damageBlocked: 1,
          healingDone: 2,
          shieldGained: 4,
          specialsUsed: 1,
          hits: 1,
          evades: 0,
          xpAwarded: 15,
          rating: {
            before: 900,
            after: 916,
            delta: 16,
            eligible: true,
            viewerId: 'private-viewer'
          },
          participantId: 'private-participant',
          actions: [{ seed: 'private-action-seed' }]
        }]
      }
    };

    const first = plugin.emitStreamMonsters(
      'streammonsters:battle_completed',
      raw
    );
    const duplicate = plugin.emitStreamMonsters(
      'streammonsters:battle_completed',
      raw
    );
    const recent = store.getRecentPublicEvents('creator:live-1');

    expect(plugin.streamMonstersPublicEventProjector.isCritical(
      'streammonsters:battle_completed'
    )).toBe(true);
    expect(first.eventId).toBe(raw.eventId);
    expect(duplicate).toEqual(first);
    expect(first.combatReport).toEqual({
      roundCount: 2,
      durationMs: 1_500,
      decisiveSkill: {
        round: 2,
        ownerSlot: 1,
        choice: 'C',
        skillName: 'Solar Bloom',
        skillIcon: '☀️'
      },
      fighters: [{
        slot: 1,
        playerName: 'Viewer',
        monsterName: 'Ashfang',
        damageDealt: 1_000_000,
        damageBlocked: 1,
        healingDone: 2,
        shieldGained: 4,
        specialsUsed: 1,
        hits: 1,
        evades: 0,
        xpAwarded: 15,
        rating: {
          before: 900,
          after: 916,
          delta: 16,
          eligible: true
        }
      }]
    });
    expect(api.emit.mock.calls.filter(([event]) => (
      event === 'streammonsters:battle_completed'
    ))).toHaveLength(1);
    expect(recent).toEqual([expect.objectContaining({
      eventId: raw.eventId,
      correlationId: raw.correlationId,
      type: 'streammonsters:battle_completed',
      payload: first
    })]);
    expect(JSON.stringify(recent)).not.toMatch(
      /private-|viewerId|participantId|actorId|actions|seed/
    );
  });

  test('deduplicates mastery unlocks with stable opaque event and correlation IDs', () => {
    const { store, api, plugin } = createRuntime();
    const raw = {
      userId: 'tiktok:private-viewer',
      templateId: 'ashfang',
      unlock: 'attack_trail',
      mastery: {
        user_id: 'tiktok:private-viewer',
        template_id: 'ashfang',
        points: 25,
        unlocks: ['title', 'attack_trail']
      }
    };

    const first = plugin.emitStreamMonsters(
      'streammonsters:mastery_unlocked',
      raw
    );
    const duplicate = plugin.emitStreamMonsters(
      'streammonsters:mastery_unlocked',
      raw
    );
    const nextUnlock = plugin.emitStreamMonsters(
      'streammonsters:mastery_unlocked',
      { ...raw, unlock: 'mastery_frame' }
    );
    const recent = store.getRecentPublicEvents('creator:live-1');

    expect(first.eventId).toBe(duplicate.eventId);
    expect(first.correlationId).toBe(duplicate.correlationId);
    expect(nextUnlock.eventId).not.toBe(first.eventId);
    expect(nextUnlock.correlationId).toBe(first.correlationId);
    expect(first.eventId).toMatch(/^sm-[a-f0-9]{32}$/);
    expect(first.correlationId).toMatch(/^sm-[a-f0-9]{32}$/);
    expect(first).toMatchObject({ unlock: 'attack_trail' });
    expect(first).not.toHaveProperty('userId');
    expect(first).not.toHaveProperty('templateId');
    expect(first).not.toHaveProperty('mastery');
    expect(api.emit).toHaveBeenCalledTimes(2);
    expect(recent).toHaveLength(2);
    expect(recent[0].payload).toEqual(first);
    expect(JSON.stringify(recent)).not.toContain('tiktok:private-viewer');
  });

  test('withholds unrecognized mastery unlocks while retaining stable critical identities', () => {
    const { sqlite, store, plugin } = createRuntime();
    const raw = {
      userId: 'private-viewer',
      templateId: 'private-template',
      unlock: 'unexpected-unlock',
      mastery: { user_id: 'private-viewer', template_id: 'private-template', points: 50 }
    };
    const emitted = plugin.emitStreamMonsters('streammonsters:mastery_unlocked', raw);
    const recent = store.getRecentPublicEvents('creator:live-1');
    expect(emitted).not.toHaveProperty('unlock');
    expect(emitted).toEqual(expect.objectContaining({
      eventId: expect.stringMatching(/^sm-[a-f0-9]{32}$/),
      correlationId: expect.stringMatching(/^sm-[a-f0-9]{32}$/)
    }));
    expect(recent[0].payload).toEqual(emitted);
    expect(JSON.stringify(emitted)).not.toMatch(/private-viewer|private-template|unexpected-unlock|mastery/);
    sqlite.close();
  });

  test('projects completed mission rows to the displayed mission key only', () => {
    const { sqlite, store, api, plugin } = createRuntime();
    const overlaySource = fs.readFileSync(
      path.resolve(__dirname, '../plugins/stream-monsters/streammonsters-overlay.html'),
      'utf8'
    );
    expect(overlaySource).toContain("mission:value(data?.mission?.mission_key, 'Mission')");
    expect(overlaySource).not.toContain('data?.mission?.population_peak');
    const collection = new CollectionService({
      store,
      emit: (eventType, payload) => plugin.emitStreamMonsters(eventType, payload),
      now: () => 123456,
      getActiveViewerCount: () => 15,
      hasQualifyingHeartGift: () => true
    });
    const streamKey = 'creator:live-1';
    const mission = collection.getStreamMission(streamKey);
    expect(mission.mission_key).toMatch(/^(six_hatches|four_elements|three_battles|heart_chain_five)$/);
    collection.completeMission(streamKey);
    const emitted = api.emit.mock.calls
      .find(([eventType]) => eventType === 'streammonsters:stream_mission_completed')[1];
    const recent = store.getRecentPublicEvents('creator:live-1');
    expect(api.emit).toHaveBeenCalledWith('streammonsters:stream_mission_completed', emitted);
    expect(emitted.mission).toEqual({ mission_key: mission.mission_key });
    expect(emitted).toEqual(expect.objectContaining({
      eventId: expect.stringMatching(/^sm-[a-f0-9]{32}$/),
      correlationId: expect.stringMatching(/^sm-[a-f0-9]{32}$/)
    }));
    expect(recent[0]).toEqual(expect.objectContaining({
      type: 'streammonsters:stream_mission_completed', payload: emitted
    }));
    expect(JSON.stringify(emitted)).not.toMatch(/creator:live-1|population|completed_at|private-one|progress|target/);
    sqlite.close();
  });

  test('withholds unknown mission names while retaining stable outbox identities', () => {
    const { sqlite, plugin } = createRuntime();
    const emitted = plugin.emitStreamMonsters('streammonsters:stream_mission_completed', {
      streamKey: 'creator:live-1',
      mission: { mission_key: 'private-future-mission', stream_key: 'creator:live-1' }
    });
    expect(emitted.mission).toEqual({});
    expect(emitted).toEqual(expect.objectContaining({
      eventId: expect.stringMatching(/^sm-[a-f0-9]{32}$/),
      correlationId: expect.stringMatching(/^sm-[a-f0-9]{32}$/)
    }));
    expect(JSON.stringify(emitted)).not.toMatch(/creator:live-1|private-future-mission/);
    sqlite.close();
  });

  test('projects achievements to the fields read by the original critical card and preserves the public name', () => {
    const { sqlite, store, api, plugin } = createRuntime();
    const overlaySource = fs.readFileSync(
      path.resolve(__dirname, '../plugins/stream-monsters/streammonsters-overlay.html'),
      'utf8'
    );
    expect(overlaySource).toContain('title:text(achievementTitleKey(data?.achievement)');
    expect(overlaySource).toContain('viewer: publicDisplayName(data)');
    const progression = new ProgressionService({
      store,
      emit: (eventType, payload) => plugin.emitStreamMonsters(eventType, payload),
      now: () => new Date(456789)
    });
    progression.unlock('private-viewer-id', 'five_win_streak');
    const emitted = api.emit.mock.calls
      .find(([eventType]) => eventType === 'streammonsters:achievement_unlocked')[1];
    const recent = store.getRecentPublicEvents('creator:live-1');
    expect(api.emit).toHaveBeenCalledWith('streammonsters:achievement_unlocked', emitted);
    expect(emitted).toEqual(expect.objectContaining({
      displayName: 'Viewer', achievement: { achievement_key: 'five_win_streak' },
      eventId: expect.stringMatching(/^sm-[a-f0-9]{32}$/),
      correlationId: expect.stringMatching(/^sm-[a-f0-9]{32}$/)
    }));
    expect(recent[0].payload).toEqual(emitted);
    expect(JSON.stringify(emitted)).not.toMatch(/private-viewer-id|unlocked_at|providerPayload|private-token|messageKey/);
    sqlite.close();
  });

  test('projects completed quest rows from the actual progression producer to the toast contract', () => {
    const { sqlite, store, api, plugin } = createRuntime();
    const overlaySource = fs.readFileSync(
      path.resolve(__dirname, '../plugins/stream-monsters/streammonsters-overlay.html'),
      'utf8'
    );
    expect(overlaySource).toContain('reward: text(questTitleKey(data?.quest)');
    const progression = new ProgressionService({
      store,
      emit: (eventType, payload) => plugin.emitStreamMonsters(eventType, payload),
      now: () => new Date('2026-10-07T12:00:00.000Z')
    });
    progression.incrementQuest(
      'private-quest-viewer', '2026-10-07', 'daily:gift', 'Daily gift',
      1, 1, null, 50, 20
    );
    const emission = api.emit.mock.calls
      .find(([eventType]) => eventType === 'streammonsters:quest_completed');
    expect(emission).toBeDefined();
    const [, payload] = emission;
    expect(payload.quest).toEqual({ quest_key: 'daily:gift' });
    expect(payload).not.toHaveProperty('userId');
    expect(payload).not.toHaveProperty('messageKey');
    expect(payload).not.toHaveProperty('xpReward');
    expect(payload).not.toHaveProperty('seasonReward');
    expect(JSON.stringify(payload)).not.toMatch(/private-quest-viewer|period|target|progress|completed/);
    sqlite.close();
  });

  test('withholds unknown quest keys without adding replay or outbox semantics', () => {
    const { sqlite, plugin } = createRuntime();
    const emitted = plugin.emitStreamMonsters('streammonsters:quest_completed', {
      userId: 'private-quest-viewer',
      quest: { user_id: 'private-quest-viewer', quest_key: 'private:future', period_key: 'private-period' },
      xpReward: 999,
      seasonReward: 999
    });
    expect(emitted.quest).toEqual({});
    expect(emitted).not.toHaveProperty('xpReward');
    expect(emitted).not.toHaveProperty('seasonReward');
    expect(JSON.stringify(emitted)).not.toMatch(/private-quest-viewer|private:future|private-period|999/);
    sqlite.close();
  });

  test('projects hatch_started database eggs to the actual toast and arena fields', () => {
    const { sqlite, store, api, plugin } = createRuntime();
    const overlaySource = fs.readFileSync(
      path.resolve(__dirname, '../plugins/stream-monsters/streammonsters-overlay.html'),
      'utf8'
    );
    expect(overlaySource).toContain('element: elementName(data?.egg?.element)');
    expect(overlaySource).toContain('viewer: publicDisplayName(data)');
    const emitted = plugin.emitStreamMonsters('streammonsters:hatch_started', {
      userId: 'private-hatch-user',
      slot: 2,
      egg: {
        egg_id: 'private-hatch-egg', user_id: 'private-hatch-user', gift_id: 771,
        seed: 'private-hatch-seed', visual_key: 'private-visual-key',
        display_name: 'Fixture Hatch Viewer', element: 'Ember', state: 'ready',
        variant: 'charged', image_url: 'https://provider.example/secret.png'
      }
    });
    const recent = store.getRecentPublicEvents('creator:live-1');
    expect(api.emit).toHaveBeenCalledWith('streammonsters:hatch_started', emitted);
    expect(emitted.displayName).toBe('Fixture Hatch Viewer');
    expect(emitted.egg).toEqual(expect.objectContaining({
      element: 'Ember', state: 'ready', variant: 'charged', imageUrl: null
    }));
    expect(emitted).not.toHaveProperty('slot');
    expect(recent.at(-1).payload).toEqual(emitted);
    expect(JSON.stringify(emitted)).not.toMatch(/private-hatch-user|private-hatch-egg|private-hatch-seed|private-visual-key|provider\.example|771/);
    sqlite.close();
  });

  test('projects free egg claims to the stage consumer and omits the claimant private egg row', () => {
    const { sqlite, store, api, plugin } = createRuntime();
    const stageProjector = new EggStageProjector({ store });
    const eggStage = stageProjector.projectEgg({
      egg_id: 'claimed-private-egg', user_id: 'private-claimant', gift_id: 771,
      element: 'Ember', variant: 'standard', state: 'incubating',
      display_name: 'Claiming Viewer', image_url: '/plugins/stream-monsters/assets/eggs/ember-standard.png',
      created_at_ms: 1000, ready_at_ms: 2000, expires_at_ms: 3000, provenance: 'free'
    });
    const removedEggStage = stageProjector.projectOffer({
      offer_id: 'private-offer-row', element: 'Tide', variant: 'standard',
      stage_state: 'public', source_display_name: 'Source Viewer',
      image_url: '/plugins/stream-monsters/assets/eggs/tide-standard.png',
      offered_at_ms: 500, public_expires_at_ms: 4000
    });
    const consumerSource = fs.readFileSync(
      path.resolve(__dirname, '../plugins/stream-monsters/streammonsters-egg-stage-view.js'),
      'utf8'
    );
    expect(consumerSource).toContain('payload.removedEggStage?.visualId');
    expect(consumerSource).toContain('payload.eggStage || payload.egg_stage || payload.egg');
    const emitted = plugin.emitStreamMonsters('streammonsters:free_egg_claimed', {
      streamKey: 'creator:live-1', offerId: 'private-offer-row',
      sourceUserId: 'private-source', userId: 'private-claimant',
      egg: { egg_id: 'claimed-private-egg', user_id: 'private-claimant', seed: 'private-seed' },
      eggStage, removedEggStage
    });
    const recent = store.getRecentPublicEvents('creator:live-1');
    expect(api.emit).toHaveBeenCalledWith('streammonsters:free_egg_claimed', emitted);
    expect(emitted.eggStage.visualId).toBe(eggStage.visualId);
    expect(emitted.removedEggStage.visualId).toBe(removedEggStage.visualId);
    expect(emitted).not.toHaveProperty('egg');
    expect(emitted).not.toHaveProperty('userId');
    expect(emitted).not.toHaveProperty('sourceUserId');
    expect(recent.find(event => event.type === 'streammonsters:free_egg_claimed').payload).toEqual(emitted);
    expect(JSON.stringify(emitted)).not.toMatch(/private-claimant|private-source|private-offer-row|claimed-private-egg|private-seed|creator:live-1/);
    sqlite.close();
  });

  test('projects egg-ready payloads to toast and shelf fields and removes rescue row ids from claim events', () => {
    const { sqlite, store, api, plugin } = createRuntime();
    const stageProjector = new EggStageProjector({ store });
    const readyEgg = {
      egg_id: 'private-ready-row', user_id: 'private-ready-user', gift_id: 771,
      seed: 'private-ready-seed', visual_key: 'private-visual', element: 'Ember',
      state: 'ready', variant: 'charged', display_name: 'Ready Viewer',
      image_url: 'https://provider.example/private-egg.png',
      ready_at_ms: 2000, expires_at_ms: 3000
    };
    const eggStage = stageProjector.projectEgg(readyEgg);
    const overlaySource = fs.readFileSync(
      path.resolve(__dirname, '../plugins/stream-monsters/streammonsters-overlay.html'),
      'utf8'
    );
    const stageConsumer = fs.readFileSync(
      path.resolve(__dirname, '../plugins/stream-monsters/streammonsters-egg-stage-view.js'),
      'utf8'
    );
    expect(overlaySource).toContain('element:elementName(data?.egg?.element)');
    expect(overlaySource).toContain('safeHint(data?.hint, commandHint');
    expect(stageConsumer).toContain('payload.eggStage || payload.egg_stage || payload.egg');

    const ready = plugin.emitStreamMonsters('streammonsters:egg_ready', {
      userId: 'private-ready-user', egg: readyEgg, eggStage, hint: '!hatch [slot]'
    });
    expect(ready.displayName).toBe('Ready Viewer');
    expect(ready.eggStage.visualId).toBe(eggStage.visualId);
    expect(ready.hint).toBe('!hatch [slot]');
    expect(ready).not.toHaveProperty('userId');
    expect(ready.egg).not.toHaveProperty('egg_id');
    expect(JSON.stringify(ready)).not.toMatch(/private-ready-user|private-ready-row|private-ready-seed|provider\.example/);

    const claimed = plugin.emitStreamMonsters('streammonsters:owned_ready_egg_claimed', {
      rescueId: 'private-rescue-database-row', eggStage
    });
    expect(claimed).toEqual(expect.objectContaining({ eggStage: expect.objectContaining({ visualId: eggStage.visualId }) }));
    expect(claimed).not.toHaveProperty('rescueId');
    expect(api.emit).toHaveBeenCalledWith('streammonsters:owned_ready_egg_claimed', claimed);
    expect(store.getRecentPublicEvents('creator:live-1')
      .find(event => event.type === 'streammonsters:owned_ready_egg_claimed').payload).toEqual(claimed);
    expect(JSON.stringify(claimed)).not.toContain('private-rescue-database-row');
    sqlite.close();
  });

  test('projects actual season rank changes to the rank-card contract and preserves stable outbox identity', () => {
    const { sqlite, store, api, plugin } = createRuntime();
    const userId = store.resolveViewerIdentity({
      platformUserId: 'private-season-platform-id',
      legacyUserId: 'Season Fixture Viewer',
      updatedAtMs: 123456
    });
    const producerPayloads = [];
    const progression = new ProgressionService({
      store,
      emit: (eventType, payload) => {
        producerPayloads.push(payload);
        return plugin.emitStreamMonsters(eventType, payload);
      },
      now: () => new Date('2026-10-07T12:00:00.000Z')
    });
    const overlaySource = fs.readFileSync(
      path.resolve(__dirname, '../plugins/stream-monsters/streammonsters-overlay.html'),
      'utf8'
    );
    const directorSource = fs.readFileSync(
      path.resolve(__dirname, '../plugins/stream-monsters/streammonsters-arena-director.js'),
      'utf8'
    );
    expect(overlaySource).toContain('rank:rankLabel(data?.after || data?.rank || data?.score?.rank)');
    expect(overlaySource).toContain('points: data?.score?.points || data?.points || 0');
    expect(directorSource).toContain("type === 'arena_rating_changed' || type === 'season_rank_changed'");

    progression.addSeasonPoints(userId, 105);
    const rawFirst = producerPayloads[0];
    const first = api.emit.mock.calls
      .find(([eventType]) => eventType === 'streammonsters:season_rank_changed')[1];
    const recentFirst = store.getRecentPublicEvents('creator:live-1')
      .find(event => event.type === 'streammonsters:season_rank_changed');
    expect(rawFirst).toEqual(expect.objectContaining({ before: 'Bronze', after: 'Silver' }));
    expect(rawFirst.score).toEqual(expect.objectContaining({
      season_id: expect.any(String), user_id: userId, points: 105,
      title: 'Silver Collector', badge: 'silver', frame: 'silver',
      updated_at_ms: expect.any(Number)
    }));
    expect(first).toEqual({
      displayName: 'Season Fixture Viewer', after: 'Silver', score: { points: 105 },
      eventId: expect.stringMatching(/^sm-[a-f0-9]{32}$/),
      correlationId: expect.stringMatching(/^sm-[a-f0-9]{32}$/)
    });
    expect(recentFirst.payload).toEqual(first);
    expect(JSON.stringify(first)).not.toMatch(/private-season-platform-id|Season Fixture Viewer.*user|season_id|user_id|updated_at_ms|Silver Collector|silver/);

    const duplicate = plugin.emitStreamMonsters('streammonsters:season_rank_changed', first);
    progression.addSeasonPoints(userId, 150);
    const allRankEmits = api.emit.mock.calls
      .filter(([eventType]) => eventType === 'streammonsters:season_rank_changed')
      .map(([, payload]) => payload);
    const recent = store.getRecentPublicEvents('creator:live-1')
      .filter(event => event.type === 'streammonsters:season_rank_changed');
    expect(duplicate.eventId).toBe(first.eventId);
    expect(duplicate.correlationId).toBe(first.correlationId);
    expect(allRankEmits).toHaveLength(2);
    expect(allRankEmits[1]).toEqual(expect.objectContaining({
      after: 'Gold', score: { points: 255 }, correlationId: first.correlationId
    }));
    expect(allRankEmits[1].eventId).not.toBe(first.eventId);
    expect(recent.map(event => event.payload)).toEqual(allRankEmits);

    const unknown = plugin.emitStreamMonsters('streammonsters:season_rank_changed', {
      userId, after: 'private-future-rank',
      score: { season_id: 'private-season-row', user_id: userId, points: 900, title: 'private-title' }
    });
    expect(unknown).not.toHaveProperty('after');
    expect(unknown).not.toHaveProperty('score');
    expect(unknown).toEqual(expect.objectContaining({
      eventId: expect.stringMatching(/^sm-[a-f0-9]{32}$/),
      correlationId: expect.stringMatching(/^sm-[a-f0-9]{32}$/)
    }));
    expect(JSON.stringify(unknown)).not.toMatch(/private-future-rank|private-season-row|private-title/);
    sqlite.close();
  });

  test('keeps every critical event explicitly dedicated or source-reviewed as an EggStage contract', () => {
    const dedicated = [
      'egg_spawned', 'egg_ready', 'free_egg_claimed', 'owned_ready_egg_claimed',
      'hatch_started', 'egg_hatched', 'monster_discovered', 'monster_evolved',
      'mastery_unlocked', 'stream_mission_completed', 'battle_completed',
      'achievement_unlocked', 'season_rank_changed'
    ].map(type => `streammonsters:${type}`);
    const reviewedStage = [
      ['egg_landed', '../plugins/stream-monsters/backend/streammonsters/game-engine.js'],
      ['egg_stage_updated', '../plugins/stream-monsters/backend/streammonsters/game-engine.js'],
      ['free_egg_reserved', '../plugins/stream-monsters/backend/streammonsters/free-egg-drop-service.js'],
      ['free_egg_public', '../plugins/stream-monsters/backend/streammonsters/free-egg-drop-service.js'],
      ['owned_ready_egg_public', '../plugins/stream-monsters/backend/streammonsters/owned-ready-egg-rescue-service.js'],
      ['unhatched_egg_steal_public', '../plugins/stream-monsters/backend/streammonsters/unhatched-egg-steal-service.js'],
      ['unhatched_egg_steal_claimed', '../plugins/stream-monsters/backend/streammonsters/unhatched-egg-steal-service.js'],
      ['egg_stage_removed', '../plugins/stream-monsters/backend/streammonsters/game-engine.js']
    ];
    const projectorSource = fs.readFileSync(
      path.resolve(__dirname, '../plugins/stream-monsters/backend/streammonsters/public-event-projector.js'),
      'utf8'
    );
    const stageConsumer = fs.readFileSync(
      path.resolve(__dirname, '../plugins/stream-monsters/streammonsters-egg-stage-view.js'),
      'utf8'
    );
    const overlayConsumer = fs.readFileSync(
      path.resolve(__dirname, '../plugins/stream-monsters/streammonsters-overlay.html'),
      'utf8'
    );
    const classified = [
      ...dedicated,
      ...reviewedStage.map(([type]) => `streammonsters:${type}`)
    ].sort();
    expect(classified).toEqual([...CRITICAL_EVENT_TYPES].sort());

    for (const eventType of dedicated) {
      expect(projectorSource).toContain(`eventType === '${eventType}'`);
    }
    for (const [type, producerPath] of reviewedStage) {
      const producerSource = fs.readFileSync(path.resolve(__dirname, producerPath), 'utf8');
      expect(producerSource).toContain(`'streammonsters:${type}'`);
      expect(producerSource).toContain('eggStage');
      expect(`${stageConsumer}\n${overlayConsumer}`).toContain(type);
      expect(projectorSource).toContain('const projected = deepProject(payload) || {};');
    }
  });

  test('rejects expiring provider URLs while retaining packaged and Kenney emergency art', () => {
    const projector = new StreamMonstersPublicEventProjector();
    const remote = projector.project('streammonsters:egg_hatched', {
      monster: {
        name: 'Remote',
        image_url: 'https://provider.example/temporary.png'
      }
    });
    const kenney = projector.project('streammonsters:egg_hatched', {
      monster: {
        name: 'Fallback',
        image_url: '/api/streammonsters/art/kenney-0123456789abcdef.svg'
      }
    });

    expect(remote.monster.imageUrl).toBeNull();
    expect(kenney.monster.imageUrl)
      .toBe('/api/stream-monsters/art/kenney-0123456789abcdef.svg');
  });

  test('publishes the Rules-v5 battle socket aliases with one shared dedupe identity', () => {
    const { api, plugin } = createRuntime();
    const correlationId = 'match-public-15';
    const logicalEvents = [
      {
        legacy: 'streammonsters:battle_choice_opened',
        planned: 'streammonsters:battle_skill_prompt',
        eventId: `${correlationId}:event:1`,
        payload: { matchId: correlationId, round: 1, deadlineMs: 9_000 }
      },
      {
        legacy: 'streammonsters:battle_choice_locked',
        planned: 'streammonsters:battle_skill_locked',
        eventId: `${correlationId}:event:2`,
        payload: {
          matchId: correlationId,
          decision: { round: 1, slot: 1, choice: 'A' }
        }
      },
      {
        legacy: 'streammonsters:battle_skill_used',
        planned: 'streammonsters:battle_action',
        eventId: `${correlationId}:event:3`,
        payload: {
          matchId: correlationId,
          round: 1,
          action: { actorSlot: 1, targetSlot: 2, terminal: false }
        }
      },
      {
        legacy: 'streammonsters:battle_skill_used',
        planned: 'streammonsters:battle_action',
        eventId: `${correlationId}:event:4`,
        payload: {
          matchId: correlationId,
          round: 2,
          action: { actorSlot: 2, targetSlot: 1, terminal: true }
        }
      }
    ];

    for (const entry of logicalEvents) {
      plugin.emitStreamMonsters(entry.legacy, {
        ...entry.payload,
        eventId: entry.eventId,
        correlationId
      });
    }

    for (const entry of logicalEvents) {
      const legacy = api.emit.mock.calls.find(([event, payload]) => (
        event === entry.legacy && payload.eventId === entry.eventId
      ));
      const planned = api.emit.mock.calls.find(([event, payload]) => (
        event === entry.planned && payload.eventId === entry.eventId
      ));
      expect(legacy).toBeDefined();
      expect(planned).toBeDefined();
      expect(planned[1]).toEqual(legacy[1]);
      expect(planned[1].correlationId).toBe(correlationId);
    }

    const knockouts = api.emit.mock.calls.filter(([event]) => (
      event === 'streammonsters:battle_knockout'
    ));
    expect(knockouts).toEqual([[
      'streammonsters:battle_knockout',
      expect.objectContaining({
        eventId: `${correlationId}:event:4`,
        correlationId,
        action: expect.objectContaining({ terminal: true })
      })
    ]]);
  });

  test('never publishes a raw stream key in hype, mission or heart-chain events', () => {
    const { store, api, plugin } = createRuntime();
    const rawStreamKey = 'creator-private:room-private-123';
    const events = [
      ['streammonsters:hype_changed', {
        streamKey: rawStreamKey,
        points: 25,
        nested: { stream_key: rawStreamKey }
      }],
      ['streammonsters:stream_mission_progress', {
        streamKey: rawStreamKey,
        mission: {
          stream_key: rawStreamKey,
          mission_key: 'hatches_six',
          progress: 2,
          target: 6
        }
      }],
      ['streammonsters:heart_chain_changed', {
        streamKey: rawStreamKey,
        length: 5,
        hypeAward: 10
      }],
      ['streammonsters:stream_mission_completed', {
        streamKey: rawStreamKey,
        mission: {
          stream_key: rawStreamKey,
          mission_key: 'hatches_six',
          progress: 6,
          target: 6
        }
      }]
    ];

    for (const [eventType, payload] of events) {
      plugin.emitStreamMonsters(eventType, payload);
    }

    expect(api.emit).toHaveBeenCalledTimes(events.length);
    for (const [, payload] of api.emit.mock.calls) {
      expect(payload).not.toHaveProperty('streamKey');
      expect(JSON.stringify(payload)).not.toContain(rawStreamKey);
    }

    const recent = store.getRecentPublicEvents('creator:live-1');
    expect(recent).toEqual([
      expect.objectContaining({
        type: 'streammonsters:stream_mission_completed',
        payload: expect.not.objectContaining({ streamKey: expect.anything() })
      })
    ]);
    expect(JSON.stringify(recent)).not.toContain(rawStreamKey);
  });
});
