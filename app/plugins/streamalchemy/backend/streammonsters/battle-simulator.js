const {
  ELEMENTS,
  TEMPLATE_CATALOG,
  hashNumber
} = require('./catalog');
const {
  maxHp,
  resolveInteractiveRound
} = require('./battle-rules-v5');

const DEFAULT_LEVELS = Object.freeze([1, 5, 10, 15, 20]);
const DEFAULT_SKILL_SEQUENCES = Object.freeze([
  'AAA',
  'ABA',
  'ABB',
  'BAB',
  'BBA',
  'BBC'
]);
const DEFAULT_SEEDS = Object.freeze(
  Array.from({ length: 4 }, (_, index) => `rules-v5-neutral-${index}`)
);

function statsForLevel(level) {
  const stats = { vitality: 7, might: 7, guard: 7, agility: 7 };
  for (let point = 1; point < Math.max(1, Number(level) || 1); point += 1) {
    const key = ['vitality', 'might', 'guard', 'agility'][(point - 1) % 4];
    stats[key] += 1;
  }
  return stats;
}

function assertLegalSequence(sequence) {
  const normalized = String(sequence || '').trim().toUpperCase();
  if (!/^[ABC]{3}$/.test(normalized)) {
    throw new Error('STREAM_MONSTERS_SIMULATOR_REQUIRES_THREE_LEGAL_CHOICES');
  }
  let guaranteedCharge = 0;
  for (const choice of normalized) {
    if (choice === 'C' && guaranteedCharge < 100) {
      throw new Error('STREAM_MONSTERS_SIMULATOR_SPECIAL_NOT_GUARANTEED');
    }
    if (choice === 'A') guaranteedCharge = Math.min(100, guaranteedCharge + 25);
    if (choice === 'B') guaranteedCharge = Math.min(100, guaranteedCharge + 50);
    if (choice === 'C') guaranteedCharge = 0;
  }
  return normalized;
}

function simulatorMonster(id, template, level) {
  return {
    monster_id: id,
    user_id: `sim-user:${id}`,
    name: template.name,
    element: template.element,
    template_id: template.templateId,
    personality: 'Adaptive',
    level,
    stats: statsForLevel(level)
  };
}

function tieBreakWinner(fighters, state, seed) {
  return [...fighters].sort((left, right) => {
    const hp = (state[right.monster_id]?.hp || 0) -
      (state[left.monster_id]?.hp || 0);
    if (hp) return hp;
    const agility = (right.stats?.agility || 0) - (left.stats?.agility || 0);
    if (agility) return agility;
    return hashNumber(`${seed}:winner:${left.monster_id}`) -
      hashNumber(`${seed}:winner:${right.monster_id}`);
  })[0].monster_id;
}

function simulateMatch({
  leftTemplate,
  rightTemplate,
  level,
  leftSequence,
  rightSequence,
  seed,
  mirrored = false
}) {
  const firstTemplate = mirrored ? rightTemplate : leftTemplate;
  const secondTemplate = mirrored ? leftTemplate : rightTemplate;
  const firstSequence = mirrored ? rightSequence : leftSequence;
  const secondSequence = mirrored ? leftSequence : rightSequence;
  const fighters = [
    simulatorMonster('sim-left', firstTemplate, level),
    simulatorMonster('sim-right', secondTemplate, level)
  ];
  let state = {};
  let winnerId = null;
  let rounds = 0;
  for (let round = 1; round <= 3; round += 1) {
    const result = resolveInteractiveRound({
      fighters,
      choices: {
        'sim-left': firstSequence[round - 1],
        'sim-right': secondSequence[round - 1]
      },
      seed,
      round,
      state,
      disableElementAdvantage: true
    });
    state = result.state;
    rounds = round;
    if (result.terminal) {
      winnerId = result.winnerId;
      break;
    }
  }
  winnerId ||= tieBreakWinner(fighters, state, seed);
  const winnerTemplate = winnerId === 'sim-left' ? firstTemplate : secondTemplate;
  return {
    winnerTemplateId: winnerTemplate.templateId,
    winnerElement: winnerTemplate.element,
    rounds,
    state,
    maxHp: Object.fromEntries(fighters.map(fighter => [
      fighter.monster_id,
      maxHp(fighter)
    ]))
  };
}

function emptyScore(key, label) {
  return {
    [key]: label,
    wins: 0,
    losses: 0,
    samples: 0,
    winRate: 0,
    deviation: 0
  };
}

function score(scores, winnerKey, loserKey) {
  scores.get(winnerKey).wins += 1;
  scores.get(winnerKey).samples += 1;
  scores.get(loserKey).losses += 1;
  scores.get(loserKey).samples += 1;
}

function finalizeScores(scores) {
  return [...scores.values()].map(row => {
    const winRate = row.samples ? row.wins / row.samples : 0;
    return {
      ...row,
      winRate,
      deviation: Math.abs(0.5 - winRate)
    };
  });
}

function runV5BalanceMatrix(options = {}) {
  const levels = options.levels || DEFAULT_LEVELS;
  const skillSequences = (options.skillSequences || DEFAULT_SKILL_SEQUENCES)
    .map(assertLegalSequence);
  const seeds = options.seeds || DEFAULT_SEEDS;
  const templates = options.templates || TEMPLATE_CATALOG;
  const templateScores = new Map(templates.map(template => [
    template.templateId,
    emptyScore('templateId', template.templateId)
  ]));
  const elementScores = new Map(ELEMENTS.map(element => [
    element,
    emptyScore('element', element)
  ]));
  let battleCount = 0;
  let specialSequenceBattleCount = 0;
  let mirroredBattleCount = 0;

  for (let leftIndex = 0; leftIndex < templates.length; leftIndex += 1) {
    for (let rightIndex = leftIndex; rightIndex < templates.length; rightIndex += 1) {
      const leftTemplate = templates[leftIndex];
      const rightTemplate = templates[rightIndex];
      for (const level of levels) {
        for (let sequenceIndex = 0; sequenceIndex < skillSequences.length; sequenceIndex += 1) {
          for (let seedIndex = 0; seedIndex < seeds.length; seedIndex += 1) {
            const leftSequence = skillSequences[sequenceIndex];
            const rightSequence = skillSequences[
              (sequenceIndex + seedIndex + 1) % skillSequences.length
            ];
            const battleSeed = [
              seeds[seedIndex],
              leftTemplate.templateId,
              rightTemplate.templateId,
              level,
              sequenceIndex
            ].join(':');
            for (const mirrored of [false, true]) {
              const result = simulateMatch({
                leftTemplate,
                rightTemplate,
                level,
                leftSequence,
                rightSequence,
                seed: battleSeed,
                mirrored
              });
              const winnerTemplate = result.winnerTemplateId === leftTemplate.templateId
                ? leftTemplate
                : rightTemplate;
              const loserTemplate = winnerTemplate === leftTemplate
                ? rightTemplate
                : leftTemplate;
              score(
                templateScores,
                winnerTemplate.templateId,
                loserTemplate.templateId
              );
              score(elementScores, winnerTemplate.element, loserTemplate.element);
              battleCount += 1;
              mirroredBattleCount += mirrored ? 1 : 0;
              if (leftSequence.includes('C') || rightSequence.includes('C')) {
                specialSequenceBattleCount += 1;
              }
            }
          }
        }
      }
    }
  }

  const templateResults = finalizeScores(templateScores);
  const elementResults = finalizeScores(elementScores);
  return {
    rulesVersion: 5,
    elementAdvantageDisabled: true,
    mirroredOpponentSampling: true,
    battleCount,
    participantSampleCount: battleCount * 2,
    mirroredBattleCount,
    specialSequenceBattleCount,
    levels: [...levels],
    skillSequences: [...skillSequences],
    seeds: [...seeds],
    templates: templates.map(template => template.templateId),
    templateResults,
    elementResults,
    maxTemplateDeviation: Math.max(...templateResults.map(row => row.deviation)),
    maxElementDeviation: Math.max(...elementResults.map(row => row.deviation))
  };
}

module.exports = {
  runNeutralBalanceMatrix: runV5BalanceMatrix,
  runV5BalanceMatrix,
  simulateMatch,
  assertLegalSequence,
  statsForLevel
};
