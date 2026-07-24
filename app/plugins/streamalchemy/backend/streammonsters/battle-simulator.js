const { ELEMENTS, getTemplatesForElement } = require('./catalog');
const { resolveBattle } = require('./battle-rules-v3');

const DEFAULT_LEVELS = [1, 10];
const DEFAULT_STATS = [
  { vitality: 7, might: 7, guard: 7, agility: 7 },
  { vitality: 5, might: 9, guard: 8, agility: 6 }
];
const DEFAULT_PERSONALITIES = ['Aggressive', 'Defensive', 'Adaptive'];
const DEFAULT_SEEDS = Object.freeze(Array.from({ length: 4 }, (_, index) => `neutral-${index}`));

function assertLegalStats(stats) {
  const values = ['vitality', 'might', 'guard', 'agility']
    .map(key => Number(stats[key]));
  if (
    values.some(value => !Number.isInteger(value) || value < 0) ||
    values.reduce((sum, value) => sum + value, 0) !== 28
  ) {
    throw new Error('STREAM_MONSTERS_SIMULATOR_REQUIRES_LEGAL_28_POINT_STATS');
  }
}

function simulatorMonster(id, element, level, stats, personality) {
  return {
    monster_id: id,
    user_id: `sim-user:${id}`,
    name: `Simulator ${element}`,
    element,
    template_id: getTemplatesForElement(element)[0].templateId,
    level,
    stats: { ...stats },
    personality
  };
}

function scoreResult(results, element, outcome) {
  const row = results.get(element);
  row[outcome] += 1;
}

function sameAllocation(left, right) {
  return ['vitality', 'might', 'guard', 'agility']
    .every(stat => left[stat] === right[stat]);
}

function runNeutralBalanceMatrix(options = {}) {
  const levels = options.levels || DEFAULT_LEVELS;
  const statAllocations = options.statAllocations || DEFAULT_STATS;
  const personalities = options.personalities || DEFAULT_PERSONALITIES;
  const seeds = options.seeds || DEFAULT_SEEDS;
  statAllocations.forEach(assertLegalStats);

  const totals = new Map(ELEMENTS.map(element => [
    element,
    { element, wins: 0, losses: 0, draws: 0 }
  ]));
  let battleCount = 0;
  let crossAllocationBattleCount = 0;
  let crossPersonalityBattleCount = 0;
  for (let leftIndex = 0; leftIndex < ELEMENTS.length; leftIndex += 1) {
    for (let rightIndex = leftIndex; rightIndex < ELEMENTS.length; rightIndex += 1) {
      const leftElement = ELEMENTS[leftIndex];
      const rightElement = ELEMENTS[rightIndex];
      for (const level of levels) {
        for (let leftStatsIndex = 0; leftStatsIndex < statAllocations.length; leftStatsIndex += 1) {
          for (let rightStatsIndex = 0; rightStatsIndex < statAllocations.length; rightStatsIndex += 1) {
            const leftStats = statAllocations[leftStatsIndex];
            const rightStats = statAllocations[rightStatsIndex];
            for (const leftPersonality of personalities) {
              for (const rightPersonality of personalities) {
                for (const seed of seeds) {
                  const participantA = {
                    id: 'sim-a',
                    element: leftElement,
                    stats: leftStats,
                    personality: leftPersonality
                  };
                  const participantB = {
                    id: 'sim-b',
                    element: rightElement,
                    stats: rightStats,
                    personality: rightPersonality
                  };
                  const battleSeed = [
                    seed,
                    leftElement,
                    rightElement,
                    level,
                    leftStatsIndex,
                    rightStatsIndex,
                    leftPersonality,
                    rightPersonality
                  ].join(':');
                  for (let order = 0; order < 2; order += 1) {
                    const firstConfig = order === 0 ? participantA : participantB;
                    const secondConfig = order === 0 ? participantB : participantA;
                    const first = simulatorMonster(
                      firstConfig.id,
                      firstConfig.element,
                      level,
                      firstConfig.stats,
                      firstConfig.personality
                    );
                    const second = simulatorMonster(
                      secondConfig.id,
                      secondConfig.element,
                      level,
                      secondConfig.stats,
                      secondConfig.personality
                    );
                    const battle = resolveBattle(first, second, battleSeed, {
                      disableElementAdvantage: true
                    });
                    const winner = battle.winnerId === first.monster_id ? firstConfig : secondConfig;
                    const loser = winner === firstConfig ? secondConfig : firstConfig;
                    scoreResult(totals, winner.element, 'wins');
                    scoreResult(totals, loser.element, 'losses');
                    battleCount += 1;
                    if (!sameAllocation(leftStats, rightStats)) crossAllocationBattleCount += 1;
                    if (leftPersonality !== rightPersonality) crossPersonalityBattleCount += 1;
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  const results = Array.from(totals.values()).map(row => {
    const samples = row.wins + row.losses + row.draws;
    return {
      ...row,
      winRate: samples ? row.wins / samples : 0
    };
  });
  return {
    rulesVersion: 3,
    elementAdvantageDisabled: true,
    mirroredOpponentSampling: true,
    battleCount,
    participantSampleCount: battleCount * 2,
    crossAllocationBattleCount,
    crossPersonalityBattleCount,
    levels: [...levels],
    statAllocations: statAllocations.map(stats => ({ ...stats })),
    personalities: [...personalities],
    seeds: [...seeds],
    results
  };
}

module.exports = { runNeutralBalanceMatrix, assertLegalStats };
