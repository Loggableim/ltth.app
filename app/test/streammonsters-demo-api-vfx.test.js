'use strict';

const Database = require('better-sqlite3');
const StreamMonstersDatabase = require('../plugins/streamalchemy/backend/streammonsters/database');
const StreamMonstersEngine = require('../plugins/streamalchemy/backend/streammonsters/game-engine');
const StreamMonstersRoutes = require('../plugins/streamalchemy/backend/streammonsters/routes');

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    sendFile: jest.fn()
  };
}

function harness() {
  const registered = [];
  const emitted = [];
  const store = new StreamMonstersDatabase(new Database(':memory:'));
  store.initialize();
  const routes = new StreamMonstersRoutes({
    api: {
      registerRoute: (method, routePath, handler) => registered.push({ method, routePath, handler }),
      emit: (event, payload) => emitted.push({ event, payload })
    },
    pluginDir: process.cwd(),
    store,
    engine: new StreamMonstersEngine({ store }),
    generationPool: {},
    systemAnalyzer: {},
    managedRuntime: {},
    localModelInstaller: {},
    configProvider: {
      getConfig: () => ({ streamMonsters: { hatchDurationMs: 120_000 } }),
      updateConfig: jest.fn()
    }
  });
  routes.register();
  return {
    emitted,
    demo: registered.find(entry => entry.method === 'POST' && entry.routePath === '/api/streammonsters/demo').handler
  };
}

function localRequest(body) {
  return {
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    headers: {},
    body
  };
}

describe('Stream Monsters targeted demo API', () => {
  test('keeps a bodyless request backward compatible and adds spawn, hatch and skill cards', () => {
    const { demo, emitted } = harness();
    const res = response();
    demo(localRequest(undefined), res);

    expect(res.body).toEqual({ success: true, demo: true });
    expect(emitted.map(entry => entry.event)).toEqual(expect.arrayContaining([
      'streammonsters:egg_spawned',
      'streammonsters:hatch_started',
      'streammonsters:egg_hatched',
      'streammonsters:battle_skill_used',
      'streammonsters:battle_special_charged'
    ]));
    const evolution = emitted.find(entry => (
      entry.event === 'streammonsters:monster_evolved'
    ))?.payload;
    expect(evolution).toEqual(expect.objectContaining({
      statsBefore: { vitality: 7, might: 8, guard: 6, agility: 7 },
      statChanges: { vitality: 0, might: 2, guard: 0, agility: 1 },
      statsAfter: { vitality: 7, might: 10, guard: 6, agility: 8 },
      unlockedSkill: expect.objectContaining({
        id: 'ashfang:A:stage-2',
        choice: 'A',
        icon: '🔥',
        nameKey: 'skillNameAshfangAStage2',
        shortTextKey: 'skillEffectAshfangAStage2',
        role: 'striker',
        evolutionStage: 2
      }),
      monster: expect.objectContaining({
        stats: { vitality: 7, might: 10, guard: 6, agility: 8 },
        evolution_stage: 2
      })
    }));
  });

  test.each([
    ['ashfang', {
      element: 'Ember',
      changes: { vitality: 0, might: 2, guard: 0, agility: 1 },
      after: { vitality: 7, might: 10, guard: 6, agility: 8 },
      skill: {
        id: 'ashfang:A:stage-2',
        choice: 'A',
        icon: '🔥',
        nameKey: 'skillNameAshfangAStage2',
        shortTextKey: 'skillEffectAshfangAStage2',
        role: 'striker',
        evolutionStage: 2
      }
    }],
    ['oakheart', {
      element: 'Grove',
      changes: { vitality: 1, might: 0, guard: 2, agility: 0 },
      after: { vitality: 8, might: 8, guard: 8, agility: 7 },
      skill: {
        id: 'oakheart:B:stage-2',
        choice: 'B',
        icon: '🪵',
        nameKey: 'skillNameOakheartBStage2',
        shortTextKey: 'skillEffectOakheartBStage2',
        role: 'guardian',
        evolutionStage: 2
      }
    }]
  ])(
    'derives the %s Stage-II evolution preview from element and role rules',
    (templateId, expected) => {
      const { demo, emitted } = harness();
      const res = response();
      demo(localRequest({ scene: 'evolution', templateId }), res);

      const evolution = emitted.find(entry => (
        entry.event === 'streammonsters:monster_evolved'
      ))?.payload;
      expect(res.statusCode).toBe(200);
      expect(evolution).toEqual(expect.objectContaining({
        statsBefore: { vitality: 7, might: 8, guard: 6, agility: 7 },
        statChanges: expected.changes,
        statsAfter: expected.after,
        unlockedSkill: expect.objectContaining(expected.skill),
        monster: expect.objectContaining({
          element: expected.element,
          stats: expected.after,
          evolution_stage: 2
        })
      }));
      expect(Object.values(evolution.statChanges).reduce(
        (total, amount) => total + amount,
        0
      )).toBe(3);
    }
  );

  test.each([
    'spawn',
    'ready',
    'hatch',
    'collection',
    'evolution',
    'match',
    'attack',
    'defense',
    'skill',
    'multihit',
    'special',
    'ko',
    'xp',
    'rankup'
  ])(
    'emits only the requested %s preview sequence with validated catalog/layout metadata',
    scene => {
      const { demo, emitted } = harness();
      const res = response();
      demo(localRequest({
        scene,
        templateId: 'ashfang',
        layout: 'portrait',
        anchor: 'middle-left',
        scale: 115
      }), res);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(expect.objectContaining({
        success: true,
        demo: true,
        scene,
        templateId: 'ashfang',
        layout: 'portrait',
        anchor: 'middle-left',
        scale: 115
      }));
      expect(emitted.length).toBeGreaterThan(0);
      for (const entry of emitted) {
        expect(entry.payload).toEqual(expect.objectContaining({
          demo: true,
          preview: { scene, layout: 'portrait', anchor: 'middle-left', scale: 115 }
        }));
      }
      const allowed = {
        spawn: ['streammonsters:egg_spawned'],
        ready: ['streammonsters:egg_ready'],
        hatch: ['streammonsters:hatch_started', 'streammonsters:egg_hatched'],
        collection: ['streammonsters:collection_shown'],
        evolution: ['streammonsters:monster_evolved'],
        match: ['streammonsters:battle_match_found', 'streammonsters:battle_choice_opened'],
        attack: ['streammonsters:battle_choice_opened', 'streammonsters:battle_skill_used'],
        defense: ['streammonsters:battle_choice_opened', 'streammonsters:battle_skill_used'],
        skill: [
          'streammonsters:battle_choice_opened',
          'streammonsters:battle_choice_locked',
          'streammonsters:battle_skill_used'
        ],
        multihit: ['streammonsters:battle_choice_opened', 'streammonsters:battle_skill_used'],
        special: [
          'streammonsters:battle_choice_opened',
          'streammonsters:battle_special_charged',
          'streammonsters:battle_skill_used'
        ],
        ko: [
          'streammonsters:battle_choice_opened',
          'streammonsters:battle_skill_used',
          'streammonsters:battle_completed'
        ],
        xp: ['streammonsters:monster_xp_awarded', 'streammonsters:monster_level_up'],
        rankup: [
          'streammonsters:arena_rating_changed',
          'streammonsters:season_rank_changed'
        ]
      };
      expect(emitted.map(entry => entry.event)).toEqual(allowed[scene]);
      if (scene === 'rankup') {
        expect(emitted[0].payload).toEqual(expect.objectContaining({
          before: { rating: 995, tier: 'Bronze' },
          after: { rating: 1011, tier: 'Silver' },
          delta: 16
        }));
        expect(emitted[1].payload).toEqual(expect.objectContaining({
          before: 'Silver',
          after: 'Gold',
          score: expect.objectContaining({
            points: 275,
            rank: 'Gold'
          })
        }));
      }
      if (['match', 'attack', 'defense', 'skill', 'multihit', 'special', 'ko'].includes(scene)) {
        const roster = emitted.find(entry => (
          entry.event === 'streammonsters:battle_choice_opened'
        ))?.payload?.fighters;
        expect(roster).toEqual([
          expect.objectContaining({
            slot: 1,
            name: 'Ashfang',
            imageUrl: '/plugins/streamalchemy/assets/streammonsters/furry/ashfang.webp'
          }),
          expect.objectContaining({
            slot: 2,
            imageUrl: expect.stringMatching(
              /^\/plugins\/streamalchemy\/assets\/streammonsters\/furry\/.+\.webp$/
            )
          })
        ]);
        expect(roster[0].skills).toEqual([
          expect.objectContaining({
            choice: 'A',
            icon: '🔥',
            nameKey: 'skillNameAshfangAStage1',
            shortTextKey: 'skillEffectAshfangAStage1',
            available: true
          }),
          expect.objectContaining({
            choice: 'B',
            icon: '🛡️',
            nameKey: 'skillNameAshfangBStage1',
            shortTextKey: 'skillEffectAshfangBStage1',
            available: true
          }),
          expect.objectContaining({
            choice: 'C',
            icon: '☄️',
            nameKey: 'skillNameAshfangCStage1',
            shortTextKey: 'skillEffectAshfangCStage1',
            available: scene === 'special',
            chargeRequired: 100
          })
        ]);
        expect(roster[1].skills).toEqual([
          expect.objectContaining({
            choice: 'A',
            icon: '🌊',
            nameKey: 'skillNameRippleAStage1',
            shortTextKey: 'skillEffectRippleAStage1',
            available: true
          }),
          expect.objectContaining({
            choice: 'B',
            icon: '🌫️',
            nameKey: 'skillNameRippleBStage1',
            shortTextKey: 'skillEffectRippleBStage1',
            available: true
          }),
          expect.objectContaining({
            choice: 'C',
            icon: '💧',
            nameKey: 'skillNameRippleCStage1',
            shortTextKey: 'skillEffectRippleCStage1',
            available: false,
            chargeRequired: 100
          })
        ]);
        for (const fighter of roster) {
          expect(fighter.skills.map(skill => skill.choice)).toEqual(['A', 'B', 'C']);
          expect(JSON.stringify(fighter.skills)).not.toMatch(
            /"id"|"effects"|"power"|"vfxKey"|"role"/
          );
        }
      }
    }
  );

  test('emits a canonical redacted completion payload for the K.O. preview', () => {
    const { demo, emitted } = harness();
    const res = response();

    demo(localRequest({
      scene: 'ko',
      templateId: 'ashfang',
      layout: 'portrait'
    }), res);

    const completed = emitted.find(entry => (
      entry.event === 'streammonsters:battle_completed'
    ))?.payload;
    expect(completed).toEqual(expect.objectContaining({
      eventId: expect.stringMatching(/^demo-match:.+:ko:completed$/),
      sequence: 5,
      matchId: expect.stringMatching(/^demo-match:/),
      winnerSlot: 1,
      terminalReason: 'knockout',
      knockout: {
        round: 1,
        remainingHp: 50,
        maxHp: 50
      },
      winner: expect.objectContaining({
        slot: 1,
        viewerName: '@demo-viewer',
        name: 'Ashfang',
        element: 'Ember',
        templateId: 'ashfang',
        evolutionStage: 1,
        level: 4
      }),
      ratingChanges: [
        { slot: 1, before: 900, after: 916, delta: 16 },
        { slot: 2, before: 900, after: 884, delta: -16 }
      ]
    }));
    expect(completed.winner).not.toHaveProperty('monster_id');
    expect(completed.winner).not.toHaveProperty('user_id');
  });

  test('uses a fresh event namespace for every battle preview request', () => {
    const { demo, emitted } = harness();
    const runPreview = () => {
      const start = emitted.length;
      const res = response();
      demo(localRequest({
        scene: 'skill',
        templateId: 'ashfang',
        layout: 'portrait'
      }), res);
      expect(res.statusCode).toBe(200);
      return emitted.slice(start);
    };

    const first = runPreview();
    const second = runPreview();
    const firstRoster = first.find(entry => (
      entry.event === 'streammonsters:battle_choice_opened'
    ))?.payload;
    const secondRoster = second.find(entry => (
      entry.event === 'streammonsters:battle_choice_opened'
    ))?.payload;
    const firstAction = first.find(entry => (
      entry.event === 'streammonsters:battle_skill_used'
    ))?.payload;
    const secondAction = second.find(entry => (
      entry.event === 'streammonsters:battle_skill_used'
    ))?.payload;

    expect(firstRoster.matchId).toMatch(/^demo-match:/);
    expect(secondRoster.matchId).toMatch(/^demo-match:/);
    expect(firstAction.matchId).toBe(firstRoster.matchId);
    expect(secondAction.matchId).toBe(secondRoster.matchId);
    expect(firstAction.eventId).toMatch(/^demo-match:.+:attack$/);
    expect(secondAction.eventId).toMatch(/^demo-match:.+:attack$/);
    expect(secondRoster.matchId).not.toBe(firstRoster.matchId);
    expect(secondAction.eventId).not.toBe(firstAction.eventId);
  });

  test.each([
    [{ scene: 'unknown' }, 'STREAM_MONSTERS_DEMO_SCENE_INVALID'],
    [{ scene: 'attack', templateId: 'missing' }, 'STREAM_MONSTERS_DEMO_TEMPLATE_INVALID'],
    [{ scene: 'attack', layout: 'square' }, 'STREAM_MONSTERS_DEMO_LAYOUT_INVALID'],
    [{ scene: 'attack', anchor: 'left' }, 'STREAM_MONSTERS_DEMO_ANCHOR_INVALID'],
    [{ scene: 'attack', scale: 131 }, 'STREAM_MONSTERS_DEMO_SCALE_INVALID']
  ])('rejects invalid targeted demo input %#', (body, error) => {
    const { demo, emitted } = harness();
    const res = response();
    demo(localRequest(body), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ success: false, error });
    expect(emitted).toEqual([]);
  });
});
