const { ELEMENTS, getTemplatesForElement } = require('./catalog');
const { resolveBattle } = require('./battle-rules-v3');

const DEFAULT_LEVELS = [1, 5, 10, 20];
const DEFAULT_STATS = [
  { vitality: 7, might: 7, guard: 7, agility: 7 },
  { vitality: 5, might: 9, guard: 8, agility: 6 },
  { vitality: 9, might: 5, guard: 9, agility: 5 },
  { vitality: 6, might: 8, guard: 5, agility: 9 }
];
const DEFAULT_PERSONALITIES = ['Aggressive', 'Defensive', 'Adaptive'];
const DEFAULT_SEEDS = Object.freeze(
  Array.from({ length: 16 }, (_, index) => `neutral-${index}`)
);

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
  for (let leftIndex = 0; leftIndex < ELEMENTS.length; leftIndex += 1) {
    for (let rightIndex = leftIndex; rightIndex < ELEMENTS.length; rightIndex += 1) {
      const leftElement = ELEMENTS[leftIndex];
      const rightElement = ELEMENTS[rightIndex];
      for (const level of levels) {
        for (const stats of statAllocations) {
          for (const personality of personalities) {
            for (const seed of seeds) {
              const pairOutcomes = [];
              for (let order = 0; order < 2; order += 1) {
                const firstElement = order === 0 ? leftElement : rightElement;
                const secondElement = order === 0 ? rightElement : leftElement;
                const first = simulatorMonster('sim-a', firstElement, level, stats, personality);
                const second = simulatorMonster('sim-b', secondElement, level, stats, personality);
                const battle = resolveBattle(first, second, `${seed}:${leftElement}:${rightElement}`, {
                  disableElementAdvantage: true
                });
                pairOutcomes.push(battle.winnerId === first.monster_id ? firstElement : secondElement);
                battleCount += 1;
              }

              if (leftElement === rightElement) {
                scoreResult(totals, leftElement, 'draws');
                scoreResult(totals, rightElement, 'draws');
              } else if (pairOutcomes[0] !== pairOutcomes[1]) {
                scoreResult(totals, leftElement, 'draws');
                scoreResult(totals, rightElement, 'draws');
              } else {
                const winner = pairOutcomes[0];
                const loser = winner === leftElement ? rightElement : leftElement;
                scoreResult(totals, winner, 'wins');
                scoreResult(totals, loser, 'losses');
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
      winRate: samples ? (row.wins + (row.draws * 0.5)) / samples : 0
    };
  });
  return {
    rulesVersion: 3,
    elementAdvantageDisabled: true,
    mirroredOpponentSampling: true,
    battleCount,
    levels: [...levels],
    statAllocations: statAllocations.map(stats => ({ ...stats })),
    personalities: [...personalities],
    seeds: [...seeds],
    results
  };
}

module.exports = { runNeutralBalanceMatrix, assertLegalStats };
