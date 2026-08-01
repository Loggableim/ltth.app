const Database = require('better-sqlite3');
const StreamAlchemyPlugin = require('../plugins/stream-monsters');
const StreamMonstersDatabase = require(
  '../plugins/stream-monsters/backend/streammonsters/database'
);
const StreamMonstersPublicEventProjector = require(
  '../plugins/stream-monsters/backend/streammonsters/public-event-projector'
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
    const projected = projector.project('streammonsters:achievement_unlocked', {
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
          imageUrl: '/plugins/streamalchemy/assets/streammonsters/furry/ashfang.png'
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
        imageUrl: '/plugins/streamalchemy/assets/streammonsters/furry/ashfang.png',
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
    expect(api.emit).toHaveBeenCalledTimes(2);
    expect(recent).toHaveLength(2);
    expect(JSON.stringify(recent)).not.toContain('tiktok:private-viewer');
  });

  test('deduplicates season rank changes per season, viewer and resulting rank', () => {
    const { store, api, plugin } = createRuntime();
    const raw = {
      userId: 'tiktok:private-viewer',
      before: 'Bronze',
      after: 'Silver',
      score: {
        season_id: 'season-42',
        user_id: 'tiktok:private-viewer',
        points: 105,
        rank: 'Silver',
        title: 'Silver Collector',
        badge: 'silver',
        frame: 'silver'
      }
    };

    const first = plugin.emitStreamMonsters(
      'streammonsters:season_rank_changed',
      raw
    );
    const duplicate = plugin.emitStreamMonsters(
      'streammonsters:season_rank_changed',
      raw
    );
    const nextRank = plugin.emitStreamMonsters(
      'streammonsters:season_rank_changed',
      {
        ...raw,
        after: 'Gold',
        score: { ...raw.score, points: 260, rank: 'Gold' }
      }
    );
    const recent = store.getRecentPublicEvents('creator:live-1');

    expect(first.eventId).toBe(duplicate.eventId);
    expect(first.correlationId).toBe(duplicate.correlationId);
    expect(nextRank.eventId).not.toBe(first.eventId);
    expect(nextRank.correlationId).toBe(first.correlationId);
    expect(first.eventId).toMatch(/^sm-[a-f0-9]{32}$/);
    expect(first.correlationId).toMatch(/^sm-[a-f0-9]{32}$/);
    expect(api.emit).toHaveBeenCalledTimes(2);
    expect(recent).toHaveLength(2);
    expect(JSON.stringify(recent)).not.toContain('tiktok:private-viewer');
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
      .toBe('/api/streammonsters/art/kenney-0123456789abcdef.svg');
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
