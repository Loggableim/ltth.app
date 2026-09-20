'use strict';

const {
  buildCombatReport,
  sanitizeCombatReport
} = require(
  '../plugins/stream-monsters/backend/streammonsters/battle-report'
);

const fighters = [
  {
    slot: 1,
    monsterId: 'private-monster-a',
    participantId: 'private-participant-a',
    playerName: '@Alpha',
    monsterName: 'Ashfang'
  },
  {
    slot: 2,
    monsterId: 'private-monster-b',
    participantId: 'private-participant-b',
    playerName: '@Beta',
    monsterName: 'Ripple'
  }
];

const participantResults = [
  {
    slot: 1,
    participantId: 'private-participant-a',
    xpAwarded: 15,
    arenaEligible: true,
    rating: { before: 1_000, after: 1_016, delta: 16 }
  },
  {
    slot: 2,
    participantId: 'private-participant-b',
    xpAwarded: 10,
    arenaEligible: false,
    rating: { before: 1_000, after: 1_000, delta: 0 }
  }
];

function fighter(report, slot) {
  return report.fighters.find(entry => entry.slot === slot);
}

describe('Stream Monsters authoritative combat report', () => {
  test('identifies the largest applied hit block and heal for the KO report', () => {
    const report = buildCombatReport({
      fighters,
      participantResults,
      roundNumber: 2,
      actions: [{
        round: 1,
        actorId: 'private-monster-a',
        targetId: 'private-monster-b',
        choice: 'C',
        skill: { name: 'Solar Bloom' },
        hits: [
          { hpDamage: 4, shieldAbsorbed: 3, evaded: false },
          { hpDamage: 2, shieldAbsorbed: 0, evaded: false }
        ],
        outcomes: [
          { type: 'heal', amount: 2 },
          { type: 'lifesteal', amount: 1 }
        ]
      }, {
        round: 2,
        actorId: 'private-monster-b',
        targetId: 'private-monster-a',
        choice: 'A',
        skill: { name: 'Moon Crash' },
        hits: [{ hpDamage: 6, shieldAbsorbed: 2, evaded: false }],
        outcomes: [],
        terminal: true
      }]
    });

    expect(report.highlights).toEqual({
      largestHit: { slot: 2, amount: 6 },
      largestBlock: { slot: 2, amount: 3 },
      largestHeal: { slot: 1, amount: 2 }
    });
  });

  test('aggregates applied action values at the correct fighter slots', () => {
    const report = buildCombatReport({
      fighters,
      participantResults,
      roundNumber: 2,
      createdAtMs: 1_000,
      completedAtMs: 2_500,
      actions: [{
        sequence: 1,
        round: 1,
        actorId: 'private-monster-a',
        targetId: 'private-monster-b',
        choice: 'C',
        skill: { name: 'Solar Bloom', icon: '☀️' },
        hits: [
          { hpDamage: 4, shieldAbsorbed: 3, evaded: false },
          { hpDamage: 2, shieldAbsorbed: 0, evaded: false }
        ],
        outcomes: [
          { type: 'multihit', hits: 2 },
          { type: 'heal', amount: 2 },
          { type: 'lifesteal', amount: 1 },
          { type: 'shield', amount: 5 }
        ],
        retaliations: [
          { type: 'reflect', hpDamage: 2, shieldAbsorbed: 1 }
        ],
        statusEffects: [],
        terminal: false
      }, {
        sequence: 2,
        round: 1,
        actorId: 'private-monster-b',
        targetId: 'private-monster-a',
        choice: 'A',
        skill: { name: 'Ember Mark', icon: '🔥' },
        hits: [
          { hpDamage: 0, shieldAbsorbed: 0, evaded: true }
        ],
        outcomes: [{ type: 'burn', amount: 2 }],
        retaliations: [],
        statusEffects: [],
        terminal: false
      }, {
        sequence: 3,
        round: 2,
        actorId: 'private-monster-a',
        targetId: 'private-monster-b',
        choice: 'A',
        skill: { name: 'Fang', icon: '🦷' },
        hits: [
          { hpDamage: 0, shieldAbsorbed: 0, evaded: true }
        ],
        outcomes: [],
        retaliations: [],
        statusEffects: [
          { type: 'burn_tick', hpDamage: 2 }
        ],
        terminal: false
      }, {
        sequence: 4,
        round: 2,
        actorId: 'private-monster-b',
        targetId: 'private-monster-a',
        choice: 'A',
        skill: { name: 'Moon Crash', icon: '🌙' },
        hits: [
          { hpDamage: 6, shieldAbsorbed: 2, evaded: false },
          { hpDamage: 1, shieldAbsorbed: 0, evaded: false }
        ],
        outcomes: [{ type: 'multihit', hits: 2 }],
        retaliations: [],
        statusEffects: [],
        terminal: true
      }]
    });

    expect(report).toEqual({
      roundCount: 2,
      durationMs: 1_500,
      decisiveSkill: {
        round: 2,
        ownerSlot: 2,
        choice: 'A',
        skillName: 'Moon Crash',
        skillIcon: '🌙'
      },
      highlights: {
        largestHit: { slot: 2, amount: 6 },
        largestBlock: { slot: 2, amount: 3 },
        largestHeal: { slot: 1, amount: 2 }
      },
      fighters: [{
        slot: 1,
        playerName: '@Alpha',
        monsterName: 'Ashfang',
        damageDealt: 6,
        damageBlocked: 3,
        healingDone: 3,
        shieldGained: 5,
        specialsUsed: 1,
        hits: 2,
        evades: 1,
        xpAwarded: 15,
        rating: {
          before: 1_000,
          after: 1_016,
          delta: 16,
          eligible: true
        }
      }, {
        slot: 2,
        playerName: '@Beta',
        monsterName: 'Ripple',
        damageDealt: 11,
        damageBlocked: 3,
        healingDone: 0,
        shieldGained: 0,
        specialsUsed: 0,
        hits: 2,
        evades: 1,
        xpAwarded: 10,
        rating: {
          before: 1_000,
          after: 1_000,
          delta: 0,
          eligible: false
        }
      }]
    });
    expect(JSON.stringify(report)).not.toMatch(
      /private-monster|private-participant|actorId|targetId|actions|seed/
    );
  });

  test('credits a terminal double knockout to the persisted decisive skill', () => {
    const report = buildCombatReport({
      fighters,
      participantResults,
      roundNumber: 4,
      createdAtMs: 10_000,
      completedAtMs: 12_000,
      actions: [{
        sequence: 8,
        round: 4,
        actorId: 'private-monster-a',
        targetId: 'private-monster-b',
        choice: 'A',
        skill: { name: 'Final Fang', icon: '🦷' },
        hits: [{ hpDamage: 4, shieldAbsorbed: 0, evaded: false }],
        outcomes: [],
        retaliations: [{
          type: 'thorns',
          hpDamage: 4,
          shieldAbsorbed: 0
        }],
        statusEffects: [],
        terminal: true,
        knockouts: [
          { monsterId: 'private-monster-a', cause: 'thorns' },
          { monsterId: 'private-monster-b', cause: 'skill' }
        ]
      }]
    });

    expect(report.decisiveSkill).toEqual({
      round: 4,
      ownerSlot: 1,
      choice: 'A',
      skillName: 'Final Fang',
      skillIcon: '🦷'
    });
    expect(fighter(report, 1)).toEqual(expect.objectContaining({
      damageDealt: 4,
      hits: 1
    }));
    expect(fighter(report, 2)).toEqual(expect.objectContaining({
      damageDealt: 4,
      hits: 0
    }));
  });

  test('does not claim a skipped burn knockout as a skill or Special', () => {
    const report = buildCombatReport({
      fighters,
      participantResults,
      roundNumber: 3,
      createdAtMs: 5_000,
      completedAtMs: 5_800,
      actions: [{
        sequence: 5,
        round: 3,
        actorId: 'private-monster-a',
        targetId: 'private-monster-b',
        choice: 'C',
        skill: { name: 'Unused Special', icon: '!' },
        hits: [],
        outcomes: [],
        retaliations: [],
        statusEffects: [{
          type: 'burn_tick',
          hpDamage: 3
        }],
        terminal: true,
        skipped: 'burn_ko'
      }]
    });

    expect(report.decisiveSkill).toBeNull();
    expect(fighter(report, 1).specialsUsed).toBe(0);
    expect(fighter(report, 2).damageDealt).toBe(3);
  });

  test('returns a safe zero-action report for forfeits and legacy results', () => {
    const report = buildCombatReport({
      fighters,
      participantResults,
      roundNumber: 1,
      createdAtMs: 9_000,
      completedAtMs: 8_000
    });

    expect(report).toEqual(expect.objectContaining({
      roundCount: 1,
      durationMs: 0,
      decisiveSkill: null
    }));
    expect(report.fighters).toHaveLength(2);
    report.fighters.forEach(entry => {
      expect(entry).toEqual(expect.objectContaining({
        damageDealt: 0,
        damageBlocked: 0,
        healingDone: 0,
        shieldGained: 0,
        specialsUsed: 0,
        hits: 0,
        evades: 0
      }));
    });
    expect(fighter(report, 1).xpAwarded).toBe(15);
    expect(fighter(report, 2).rating.eligible).toBe(false);
  });

  test('ignores malformed legacy actions instead of leaking or throwing', () => {
    const report = buildCombatReport({
      fighters: [
        {
          slot: 1,
          monsterId: 'private-monster-a',
          playerName: '7123456789012345678',
          monsterName: null
        },
        {
          slot: 2,
          monsterId: 'private-monster-b',
          playerName: '@Beta',
          monsterName: 'Ripple'
        },
        {
          slot: 99,
          monsterId: 'private-monster-invalid',
          playerName: 'Private Invalid',
          monsterName: 'Invalid'
        }
      ],
      participantResults: 'legacy',
      roundNumber: 'not-a-number',
      createdAtMs: 7_000,
      completedAtMs: 7_500,
      actions: [
        null,
        42,
        {
          round: 'invalid',
          actorId: 'private-unknown',
          targetId: 'private-monster-a',
          choice: 'Z',
          hits: 'invalid',
          outcomes: [null, { type: 'heal', amount: 'invalid' }],
          retaliations: {},
          statusEffects: [{ type: 'unknown', hpDamage: 999 }],
          terminal: true,
          skill: { name: null, icon: null },
          seed: 'private-seed'
        }
      ]
    });

    expect(report).toEqual({
      roundCount: 0,
      durationMs: 500,
      decisiveSkill: null,
      fighters: [{
        slot: 1,
        playerName: 'Viewer',
        monsterName: 'Monster',
        damageDealt: 0,
        damageBlocked: 0,
        healingDone: 0,
        shieldGained: 0,
        specialsUsed: 0,
        hits: 0,
        evades: 0,
        xpAwarded: 0,
        rating: {
          before: 0,
          after: 0,
          delta: 0,
          eligible: false
        }
      }, {
        slot: 2,
        playerName: '@Beta',
        monsterName: 'Ripple',
        damageDealt: 0,
        damageBlocked: 0,
        healingDone: 0,
        shieldGained: 0,
        specialsUsed: 0,
        hits: 0,
        evades: 0,
        xpAwarded: 0,
        rating: {
          before: 0,
          after: 0,
          delta: 0,
          eligible: false
        }
      }]
    });
  });

  test('sanitizes public reports to exact bounded fields', () => {
    const report = sanitizeCombatReport({
      roundCount: Number.MAX_VALUE,
      durationMs: Number.MAX_VALUE,
      decisiveSkill: {
        round: 2,
        ownerSlot: 1,
        choice: 'c',
        skillName: 'S'.repeat(100),
        skillIcon: '*'.repeat(40),
        actorId: 'private-monster-a'
      },
      fighters: [{
        slot: 1,
        playerName: 'tiktok:7123456789012345678',
        monsterName: `\u0000${'M'.repeat(100)}`,
        damageDealt: Infinity,
        damageBlocked: -4,
        healingDone: '3.6',
        shieldGained: Number.MAX_VALUE,
        specialsUsed: 2.2,
        hits: 4,
        evades: 1,
        xpAwarded: Number.MAX_VALUE,
        rating: {
          before: Number.MAX_VALUE,
          after: -1,
          delta: -Number.MAX_VALUE,
          eligible: 1,
          viewerId: 'private-viewer'
        },
        participantId: 'private-participant',
        actions: [{ seed: 'private-seed' }]
      }, {
        slot: 2,
        playerName: '@Beta',
        monsterName: 'Ripple',
        rating: {}
      }, {
        slot: 3,
        playerName: 'Private Invalid',
        monsterName: 'Invalid'
      }],
      seed: 'private-seed',
      actions: [{ actorId: 'private-monster-a' }]
    });

    expect(Object.keys(report)).toEqual([
      'roundCount',
      'durationMs',
      'decisiveSkill',
      'fighters'
    ]);
    expect(report.roundCount).toBe(1_000_000);
    expect(report.durationMs).toBe(2_678_400_000);
    expect(report.decisiveSkill).toEqual({
      round: 2,
      ownerSlot: 1,
      choice: 'C',
      skillName: 'S'.repeat(80),
      skillIcon: '*'.repeat(16)
    });
    expect(report.fighters).toHaveLength(2);
    expect(fighter(report, 1)).toEqual({
      slot: 1,
      playerName: 'Viewer',
      monsterName: 'M'.repeat(80),
      damageDealt: 0,
      damageBlocked: 0,
      healingDone: 4,
      shieldGained: 1_000_000,
      specialsUsed: 2,
      hits: 4,
      evades: 1,
      xpAwarded: 1_000_000,
      rating: {
        before: 1_000_000,
        after: 0,
        delta: -1_000_000,
        eligible: true
      }
    });
    expect(Object.keys(fighter(report, 1))).toEqual([
      'slot',
      'playerName',
      'monsterName',
      'damageDealt',
      'damageBlocked',
      'healingDone',
      'shieldGained',
      'specialsUsed',
      'hits',
      'evades',
      'xpAwarded',
      'rating'
    ]);
    expect(JSON.stringify(report)).not.toMatch(
      /private-|viewerId|participantId|monsterId|actorId|actions|seed/
    );
  });
});
