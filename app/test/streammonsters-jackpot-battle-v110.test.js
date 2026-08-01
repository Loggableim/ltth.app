const BattleMatchService = require(
  '../plugins/stream-monsters/backend/streammonsters/battle-match-service'
);
const {
  projectPassiveCharge
} = require('../plugins/stream-monsters/backend/streammonsters/battle-charge');
const ArenaDirector = require(
  '../plugins/stream-monsters/streammonsters-arena-director'
);
const PublicEventProjector = require(
  '../plugins/stream-monsters/backend/streammonsters/public-event-projector'
);

describe('Stream Monsters 1.10 Jackpot battle contract', () => {
  test('gives Rules-v7 fighters exactly eight seconds to choose', () => {
    const service = new BattleMatchService({
      store: { db: {} },
      autoStart: false,
      rulesVersion: 7
    });

    expect(service.actionWindowMs({ rulesVersion: 7 })).toBe(8_000);
    expect(service.actionWindowMs({ rulesVersion: 6 })).toBe(6_000);
  });

  test('accrues only completed active seconds and pauses outside active battle time', () => {
    expect(projectPassiveCharge({
      baseCharge: 70,
      openedAtMs: 1_000,
      deadlineMs: 9_000,
      asOfMs: 4_900,
      active: true
    })).toBe(85);
    expect(projectPassiveCharge({
      baseCharge: 70,
      openedAtMs: 1_000,
      deadlineMs: 9_000,
      asOfMs: 8_000,
      active: false
    })).toBe(70);
    expect(projectPassiveCharge({
      baseCharge: 70,
      openedAtMs: 1_000,
      deadlineMs: 9_000,
      asOfMs: 8_000,
      pausedMs: 2_000,
      pauseStartedAtMs: 6_000,
      pauseUntilMs: 7_000
    })).toBe(90);
  });

  test('projects an explicit unavailable reason and one ready edge for Special', () => {
    expect(BattleMatchService.projectSpecialAvailability({
      charge: 95,
      wasReady: false
    })).toEqual({
      available: false,
      unavailableReason: 'special_requires_full_charge',
      readyTransition: false
    });
    expect(BattleMatchService.projectSpecialAvailability({
      charge: 100,
      wasReady: false
    })).toEqual({
      available: true,
      unavailableReason: null,
      readyTransition: true
    });
    expect(BattleMatchService.projectSpecialAvailability({
      charge: 100,
      wasReady: true
    }).readyTransition).toBe(false);
  });

  test('keeps localized skill copy, element relation and the unavailable reason public', () => {
    const projected = new PublicEventProjector().project(
      'streammonsters:battle_choice_opened',
      {
        matchId: 'match-public',
        round: 1,
        deadlineMs: 9_000,
        fighters: [{
          slot: 1,
          locked: true,
          name: 'Ashfang',
          element: 'Ember',
          templateId: 'ashfang',
          evolutionStage: 1,
          imageUrl: '/plugins/stream-monsters/assets/streammonsters/furry/ashfang.png',
          skills: [{
            choice: 'C',
            icon: 'S',
            name: 'Inferno Heart',
            nameKey: 'skillNameAshfangC',
            shortText: 'A charged blaze.',
            shortTextKey: 'skillEffectAshfangC',
            elementRelation: 'advantage',
            available: false,
            unavailableReason: 'special_requires_full_charge',
            chargeRequired: 100
          }]
        }]
      }
    );

    expect(projected.fighters[0].skills[0]).toEqual(expect.objectContaining({
      nameKey: 'skillNameAshfangC',
      shortTextKey: 'skillEffectAshfangC',
      elementRelation: 'advantage',
      available: false,
      unavailableReason: 'special_requires_full_charge'
    }));
  });

  test('builds the deterministic Jackpot action choreography in presentation order', () => {
    const action = {
      eventSequence: 41,
      actorSlot: 1,
      targetSlot: 2,
      choice: 'A',
      skill: {
        type: 'attack',
        element: 'Ember',
        projectile: true
      },
      hits: [
        { index: 1, hpDamage: 4, shieldAbsorbed: 2 },
        { index: 2, hpDamage: 3, shieldAbsorbed: 0 }
      ],
      terminal: true
    };

    const first = ArenaDirector.buildJackpotActionTimeline(action);
    expect(ArenaDirector.buildJackpotActionTimeline(action)).toEqual(first);
    expect(first.map(beat => beat.type)).toEqual([
      'entrance',
      'telegraph',
      'anticipation',
      'movement',
      'projectile',
      'shield',
      'hit',
      'number_pop',
      'hud_update',
      'recoil',
      'hit',
      'number_pop',
      'hud_update',
      'recoil',
      'recovery',
      'knockout',
      'winner'
    ]);
    expect(first.map(beat => beat.atMs)).toEqual(
      [...first].sort((left, right) => left.atMs - right.atMs)
        .map(beat => beat.atMs)
    );
  });

  test('normalizes a Rules-v7 battle_action through the current arcade director timeline', () => {
    const timeline = ArenaDirector.buildArcadeTimeline('battle_action', {
      eventId: 'action-7',
      matchId: 'match-7',
      action: {
        rulesVersion: 7,
        actorSlot: 1,
        targetSlot: 2,
        skill: { type: 'attack', projectile: true },
        hits: [{ index: 1, hpDamage: 4 }],
        terminal: true
      }
    });

    expect(timeline.scene).toBe('battle_action');
    expect(timeline.beats.map(beat => beat.type)).toEqual(expect.arrayContaining([
      'telegraph',
      'advance',
      'element_trail',
      'impact',
      'hit_stop',
      'camera_impulse',
      'damage_number',
      'hud',
      'knockout',
      'recover'
    ]));
  });
});
