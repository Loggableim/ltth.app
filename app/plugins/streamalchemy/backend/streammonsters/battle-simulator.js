const {
  ELEMENTS,
  TEMPLATE_CATALOG,
  V6_ELEMENT_ADVANTAGE_PAIRS,
  V6_NEUTRAL_OPPONENTS
} = require('./catalog');
const {
  maxHp,
  initialFighterState,
  resolveInteractiveRound
} = require('./battle-rules-v5');
const {
  MAX_PASSIVE_CHARGE_PER_ROUND,
  PASSIVE_CHARGE_PER_SECOND,
  projectPassiveCharge
} = require('./battle-charge');
const {
  ARENA_COLLAPSE_ROUND,
  applyArenaCollapse
} = require('./battle-rules-v8');
const { selectBattleWinner } = require('./battle-tie-break');
const {
  applyEvolutionGrant,
  effectiveCombatPower
} = require('./evolution-rules');

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
const DEFAULT_V6_SEEDS = Object.freeze(
  Array.from({ length: 6 }, (_, index) => `rules-v6-balance-${index}`)
);
const DEFAULT_V7_SEEDS = Object.freeze(
  Array.from({ length: 6 }, (_, index) => `rules-v7-evolution-${index}`)
);
const DEFAULT_V8_SEEDS = Object.freeze(
  Array.from({ length: 6 }, (_, index) => `rules-v8-knockout-${index}`)
);
const DEFAULT_STAT_PROFILES = Object.freeze(['balanced', 'power', 'guard']);
const NEUTRAL_ELEMENT_PAIRS = Object.freeze(ELEMENTS
  .filter(element => (
    ELEMENTS.indexOf(element) < ELEMENTS.indexOf(V6_NEUTRAL_OPPONENTS[element])
  ))
  .map(element => `${element}:${V6_NEUTRAL_OPPONENTS[element]}`));

function statsForLevel(level) {
  const stats = { vitality: 7, might: 7, guard: 7, agility: 7 };
  for (let point = 1; point < Math.max(1, Number(level) || 1); point += 1) {
    const key = ['vitality', 'might', 'guard', 'agility'][(point - 1) % 4];
    stats[key] += 1;
  }
  return stats;
}

function statsForProfile(level, profile = 'balanced') {
  const normalized = String(profile || '').trim().toLowerCase();
  const bases = {
    balanced: { vitality: 7, might: 7, guard: 7, agility: 7 },
    power: { vitality: 6, might: 10, guard: 5, agility: 7 },
    guard: { vitality: 9, might: 5, guard: 9, agility: 5 }
  };
  const rotations = {
    balanced: ['vitality', 'might', 'guard', 'agility'],
    power: ['might', 'agility', 'vitality', 'guard'],
    guard: ['guard', 'vitality', 'agility', 'might']
  };
  if (!bases[normalized]) {
    throw new Error(`STREAM_MONSTERS_SIMULATOR_UNKNOWN_STAT_PROFILE:${profile}`);
  }
  const stats = { ...bases[normalized] };
  for (let point = 1; point < Math.max(1, Number(level) || 1); point += 1) {
    stats[rotations[normalized][(point - 1) % 4]] += 1;
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

function assertRulesV8Sequence(sequence) {
  const normalized = String(sequence || '').trim().toUpperCase();
  if (!/^[ABC]+$/.test(normalized)) {
    throw new Error('STREAM_MONSTERS_V8_SIMULATOR_REQUIRES_LEGAL_CHOICES');
  }
  return normalized;
}

function simulatorMonster(
  id,
  template,
  level,
  statProfile = 'balanced',
  evolutionStage = 1
) {
  const stage = Math.max(1, Math.min(3, Number(evolutionStage) || 1));
  let stats = statProfile === 'v5'
    ? statsForLevel(level)
    : statsForProfile(level, statProfile);
  for (let grantedStage = 2; grantedStage <= stage; grantedStage += 1) {
    stats = applyEvolutionGrant(stats, template.element, grantedStage);
  }
  return {
    monster_id: id,
    user_id: `sim-user:${id}`,
    name: template.name,
    element: template.element,
    template_id: template.templateId,
    personality: 'Adaptive',
    level,
    evolution_stage: stage,
    stats
  };
}

function tieBreakWinner(fighters, state, seed) {
  return selectBattleWinner(fighters.map(fighter => ({
    monsterId: fighter.monster_id,
    agility: fighter.stats?.agility
  })), state, seed);
}

function simulateMatch({
  leftTemplate,
  rightTemplate,
  level,
  leftSequence,
  rightSequence,
  seed,
  mirrored = false,
  rulesVersion = 5,
  statProfile = 'v5',
  leftStage = 1,
  rightStage = 1,
  disableElementAdvantage = true
}) {
  const firstTemplate = mirrored ? rightTemplate : leftTemplate;
  const secondTemplate = mirrored ? leftTemplate : rightTemplate;
  const firstSequence = mirrored ? rightSequence : leftSequence;
  const secondSequence = mirrored ? leftSequence : rightSequence;
  const firstStage = mirrored ? rightStage : leftStage;
  const secondStage = mirrored ? leftStage : rightStage;
  const fighters = [
    simulatorMonster('sim-left', firstTemplate, level, statProfile, firstStage),
    simulatorMonster('sim-right', secondTemplate, level, statProfile, secondStage)
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
      disableElementAdvantage,
      rulesVersion
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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function simulateRulesV8Match({
  leftTemplate,
  rightTemplate,
  level,
  leftSequence,
  rightSequence,
  seed,
  mirrored = false,
  statProfile = 'balanced',
  leftStage = 1,
  rightStage = 1,
  disableElementAdvantage = true,
  maxRounds = 64,
  actionWindowMs = 6_000
}) {
  const firstTemplate = mirrored ? rightTemplate : leftTemplate;
  const secondTemplate = mirrored ? leftTemplate : rightTemplate;
  const firstSequence = assertRulesV8Sequence(
    mirrored ? rightSequence : leftSequence
  );
  const secondSequence = assertRulesV8Sequence(
    mirrored ? leftSequence : rightSequence
  );
  const firstStage = mirrored ? rightStage : leftStage;
  const secondStage = mirrored ? leftStage : rightStage;
  const fighters = [
    simulatorMonster('sim-left', firstTemplate, level, statProfile, firstStage),
    simulatorMonster('sim-right', secondTemplate, level, statProfile, secondStage)
  ];
  const plans = {
    'sim-left': firstSequence,
    'sim-right': secondSequence
  };
  let state = Object.fromEntries(fighters.map(fighter => [
    fighter.monster_id,
    initialFighterState(fighter)
  ]));
  const history = [];
  let winnerId = null;
  let terminal = false;
  let terminalReason = 'guard_bound';
  let illegalChoiceFallbackCount = 0;
  const roundLimit = Math.max(1, Math.round(Number(maxRounds) || 64));
  const chargeWindowMs = Math.max(0, Math.round(Number(actionWindowMs) || 6_000));

  for (let round = 1; round <= roundLimit; round += 1) {
    const availability = {};
    const requestedChoices = {};
    const choices = {};
    fighters.forEach(fighter => {
      const fighterState = state[fighter.monster_id];
      fighterState.charge = projectPassiveCharge({
        baseCharge: fighterState.charge,
        openedAtMs: 0,
        deadlineMs: chargeWindowMs,
        asOfMs: chargeWindowMs,
        ratePerSecond: PASSIVE_CHARGE_PER_SECOND,
        maxGain: MAX_PASSIVE_CHARGE_PER_ROUND
      });
      const availableChoices = fighterState.charge >= 100
        ? ['A', 'B', 'C']
        : ['A', 'B'];
      availability[fighter.monster_id] = {
        charge: fighterState.charge,
        choices: availableChoices
      };
      const plan = plans[fighter.monster_id];
      const requested = plan[(round - 1) % plan.length];
      requestedChoices[fighter.monster_id] = requested;
      if (requested === 'C' && !availableChoices.includes('C')) {
        choices[fighter.monster_id] = 'A';
        illegalChoiceFallbackCount += 1;
      } else {
        choices[fighter.monster_id] = requested;
      }
    });

    const outcome = resolveInteractiveRound({
      fighters,
      choices,
      seed,
      round,
      state,
      disableElementAdvantage,
      rulesVersion: 8
    });
    const collapse = applyArenaCollapse({
      fighters: fighters.map((fighter, index) => ({
        monsterId: fighter.monster_id,
        slot: index + 1
      })),
      state: outcome.state,
      round,
      actions: outcome.actions
    });
    state = collapse.state;
    terminal = outcome.terminal;
    winnerId = outcome.winnerId;
    if (terminal) {
      terminalReason = winnerId ? 'knockout' : 'double_knockout';
    }
    history.push({
      round,
      availability: clone(availability),
      requestedChoices: clone(requestedChoices),
      choices: clone(choices),
      actions: clone(outcome.actions),
      state: clone(state),
      terminal,
      winnerId,
      collapse: collapse.active
        ? {
            round: collapse.round,
            damage: collapse.damage,
            fighters: clone(collapse.fighters)
          }
        : null
    });
    if (terminal) break;
  }

  const winner = winnerId
    ? fighters.find(fighter => fighter.monster_id === winnerId)
    : null;
  return {
    rulesVersion: 8,
    knockoutOnly: true,
    terminal,
    terminalReason,
    winnerTemplateId: winner?.template_id || null,
    winnerElement: winner?.element || null,
    winnerId,
    rounds: history.length,
    state,
    history,
    illegalChoiceFallbackCount,
    maxHp: Object.fromEntries(fighters.map(fighter => [
      fighter.monster_id,
      maxHp(fighter)
    ]))
  };
}

function runV8BalanceMatrix(options = {}) {
  const levels = options.levels || DEFAULT_LEVELS;
  const stages = options.stages || [1, 2, 3];
  const statProfiles = options.statProfiles || DEFAULT_STAT_PROFILES;
  const skillSequences = (options.skillSequences || DEFAULT_SKILL_SEQUENCES)
    .map(assertRulesV8Sequence);
  const seeds = options.seeds || DEFAULT_V8_SEEDS;
  const templates = options.templates || TEMPLATE_CATALOG;
  const maxRounds = Math.max(1, Math.round(Number(options.maxRounds) || 64));
  const templateScores = new Map(templates.map(template => [
    template.templateId,
    emptyScore('templateId', template.templateId)
  ]));
  const elementScores = new Map(ELEMENTS.map(element => [
    element,
    emptyScore('element', element)
  ]));
  let battleCount = 0;
  let resolvedBattleCount = 0;
  let guardBoundCount = 0;
  let mirroredBattleCount = 0;
  let illegalChoiceFallbackCount = 0;

  templates.forEach(leftTemplate => {
    const neutralElement = V6_NEUTRAL_OPPONENTS[leftTemplate.element];
    const rightTemplate = templates.find(template => (
      template.element === neutralElement && template.role === leftTemplate.role
    )) || templates.find(template => template.element === neutralElement);
    if (!rightTemplate) return;
    stages.forEach(stage => {
      levels.forEach(level => {
        statProfiles.forEach(statProfile => {
          skillSequences.forEach((leftSequence, sequenceIndex) => {
            seeds.forEach((baseSeed, seedIndex) => {
              const rightSequence = skillSequences[
                (sequenceIndex + seedIndex + 1) % skillSequences.length
              ];
              const battleSeed = [
                baseSeed,
                leftTemplate.templateId,
                rightTemplate.templateId,
                stage,
                level,
                statProfile,
                sequenceIndex
              ].join(':');
              for (const mirrored of [false, true]) {
                const result = simulateRulesV8Match({
                  leftTemplate,
                  rightTemplate,
                  level,
                  leftSequence,
                  rightSequence,
                  seed: battleSeed,
                  mirrored,
                  statProfile,
                  leftStage: stage,
                  rightStage: stage,
                  disableElementAdvantage: true,
                  maxRounds
                });
                battleCount += 1;
                mirroredBattleCount += mirrored ? 1 : 0;
                illegalChoiceFallbackCount += result.illegalChoiceFallbackCount;
                if (!result.winnerTemplateId) {
                  guardBoundCount += 1;
                  scoreDraw(
                    templateScores,
                    leftTemplate.templateId,
                    rightTemplate.templateId
                  );
                  scoreDraw(
                    elementScores,
                    leftTemplate.element,
                    rightTemplate.element
                  );
                  continue;
                }
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
                resolvedBattleCount += 1;
              }
            });
          });
        });
      });
    });
  });

  const templateResults = finalizeScores(templateScores);
  const elementResults = finalizeScores(elementScores);
  return {
    rulesVersion: 8,
    knockoutOnly: true,
    arenaCollapseRound: ARENA_COLLAPSE_ROUND,
    maxRounds,
    mirroredOpponentSampling: true,
    battleCount,
    resolvedBattleCount,
    guardBoundCount,
    guardBoundRate: battleCount ? guardBoundCount / battleCount : 0,
    participantSampleCount: battleCount * 2,
    mirroredBattleCount,
    illegalChoiceFallbackCount,
    levels: [...levels],
    stages: [...stages],
    statProfiles: [...statProfiles],
    skillSequences: [...skillSequences],
    seeds: [...seeds],
    templates: templates.map(template => template.templateId),
    templateResults,
    elementResults,
    maxTemplateDeviation: Math.max(...templateResults.map(row => row.deviation)),
    maxElementDeviation: Math.max(...elementResults.map(row => row.deviation))
  };
}

function evolutionScore(higherStage, lowerStage) {
  return {
    higherStage,
    lowerStage,
    wins: 0,
    losses: 0,
    samples: 0,
    winRate: 0,
    maxPowerGap: 0
  };
}

function runV7EvolutionBalanceMatrix(options = {}) {
  const levels = options.levels || DEFAULT_LEVELS;
  const stages = Object.freeze([1, 2, 3]);
  const skillSequences = (options.skillSequences || DEFAULT_SKILL_SEQUENCES)
    .map(assertLegalSequence);
  const seeds = options.seeds || DEFAULT_V7_SEEDS;
  const templates = options.templates || TEMPLATE_CATALOG;
  const admittedPowerGap = Math.max(1, Number(options.admittedPowerGap) || 15);
  const comparisons = [
    [1, 1],
    [2, 2],
    [3, 3],
    [2, 1],
    [3, 2],
    [3, 1]
  ];
  const scores = new Map(comparisons.map(([higherStage, lowerStage]) => [
    `${higherStage}:${lowerStage}`,
    evolutionScore(higherStage, lowerStage)
  ]));
  let battleCount = 0;
  let mirroredBattleCount = 0;

  templates.forEach(leftTemplate => {
    const neutralElement = V6_NEUTRAL_OPPONENTS[leftTemplate.element];
    const rightTemplate = templates.find(template => (
      template.element === neutralElement && template.role === leftTemplate.role
    )) || templates.find(template => template.element === neutralElement);
    if (!rightTemplate) return;
    comparisons.forEach(([higherStage, lowerStage]) => {
      const row = scores.get(`${higherStage}:${lowerStage}`);
      levels.forEach(level => {
        skillSequences.forEach((leftSequence, sequenceIndex) => {
          seeds.forEach((baseSeed, seedIndex) => {
            const rightSequence = skillSequences[
              (sequenceIndex + seedIndex + 1) % skillSequences.length
            ];
            const battleSeed = [
              baseSeed,
              leftTemplate.templateId,
              rightTemplate.templateId,
              higherStage,
              lowerStage,
              level,
              sequenceIndex
            ].join(':');
            const higherPower = effectiveCombatPower(simulatorMonster(
              'sim-power-higher',
              leftTemplate,
              level,
              'balanced',
              higherStage
            ));
            const lowerPower = effectiveCombatPower(simulatorMonster(
              'sim-power-lower',
              rightTemplate,
              level,
              'balanced',
              lowerStage
            ));
            row.maxPowerGap = Math.max(
              row.maxPowerGap,
              Math.abs(higherPower - lowerPower)
            );
            for (const mirrored of [false, true]) {
              const result = simulateMatch({
                leftTemplate,
                rightTemplate,
                level,
                leftSequence,
                rightSequence,
                seed: battleSeed,
                mirrored,
                rulesVersion: 7,
                statProfile: 'balanced',
                leftStage: higherStage,
                rightStage: lowerStage,
                disableElementAdvantage: true
              });
              if (result.winnerTemplateId === leftTemplate.templateId) {
                row.wins += 1;
              } else {
                row.losses += 1;
              }
              row.samples += 1;
              battleCount += 1;
              mirroredBattleCount += mirrored ? 1 : 0;
            }
          });
        });
      });
    });
  });
  const finalized = [...scores.values()].map(row => ({
    ...row,
    winRate: row.samples ? row.wins / row.samples : 0
  }));
  return {
    rulesVersion: 7,
    mirroredOpponentSampling: true,
    admittedPowerGap,
    battleCount,
    participantSampleCount: battleCount * 2,
    mirroredBattleCount,
    levels: [...levels],
    stages: [...stages],
    skillSequences: [...skillSequences],
    seeds: [...seeds],
    templates: templates.map(template => template.templateId),
    sameStageResults: finalized.filter(row => row.higherStage === row.lowerStage)
      .map(row => ({
        stage: row.higherStage,
        wins: row.wins,
        losses: row.losses,
        samples: row.samples,
        winRate: row.winRate,
        deviation: Math.abs(0.5 - row.winRate),
        maxPowerGap: row.maxPowerGap
      })),
    crossStageResults: finalized.filter(row => row.higherStage !== row.lowerStage)
  };
}

function scenarioInputs({
  levels,
  statProfiles,
  skillSequences,
  seeds
}, callback) {
  for (const level of levels) {
    for (const statProfile of statProfiles) {
      for (let sequenceIndex = 0; sequenceIndex < skillSequences.length; sequenceIndex += 1) {
        for (let seedIndex = 0; seedIndex < seeds.length; seedIndex += 1) {
          callback({
            level,
            statProfile,
            leftSequence: skillSequences[sequenceIndex],
            rightSequence: skillSequences[
              (sequenceIndex + seedIndex + 1) % skillSequences.length
            ],
            seedIndex,
            sequenceIndex,
            baseSeed: seeds[seedIndex]
          });
        }
      }
    }
  }
}

function runV6BalanceMatrix(options = {}) {
  const levels = options.levels || DEFAULT_LEVELS;
  const statProfiles = options.statProfiles || DEFAULT_STAT_PROFILES;
  const skillSequences = (options.skillSequences || DEFAULT_SKILL_SEQUENCES)
    .map(assertLegalSequence);
  const seeds = options.seeds || DEFAULT_V6_SEEDS;
  const templates = options.templates || TEMPLATE_CATALOG;
  const neutralTemplateScores = new Map(templates.map(template => [
    template.templateId,
    emptyScore('templateId', template.templateId)
  ]));
  const neutralPairScores = new Map(NEUTRAL_ELEMENT_PAIRS.map(pair => {
    const [leftElement, rightElement] = pair.split(':');
    return [pair, {
      pair,
      leftElement,
      rightElement,
      wins: 0,
      losses: 0,
      samples: 0,
      winRate: 0,
      deviation: 0
    }];
  }));
  const advantageScores = new Map(V6_ELEMENT_ADVANTAGE_PAIRS.map(pair => {
    const [attacker, defender] = pair.split(':');
    return [pair, {
      pair,
      attacker,
      defender,
      wins: 0,
      losses: 0,
      samples: 0,
      winRate: 0
    }];
  }));
  let neutralBattleCount = 0;
  let advantageBattleCount = 0;

  for (const pair of NEUTRAL_ELEMENT_PAIRS) {
    const [leftElement, rightElement] = pair.split(':');
    const leftTemplates = templates.filter(template => template.element === leftElement);
    const rightTemplates = templates.filter(template => template.element === rightElement);
    for (const leftTemplate of leftTemplates) {
      for (const rightTemplate of rightTemplates) {
        scenarioInputs({ levels, statProfiles, skillSequences, seeds }, scenario => {
          const battleSeed = [
            scenario.baseSeed,
            'neutral',
            pair,
            leftTemplate.templateId,
            rightTemplate.templateId,
            scenario.level,
            scenario.statProfile,
            scenario.sequenceIndex
          ].join(':');
          for (const mirrored of [false, true]) {
            const result = simulateMatch({
              leftTemplate,
              rightTemplate,
              level: scenario.level,
              leftSequence: scenario.leftSequence,
              rightSequence: scenario.rightSequence,
              seed: battleSeed,
              mirrored,
              rulesVersion: 6,
              statProfile: scenario.statProfile,
              disableElementAdvantage: true
            });
            const leftWon = result.winnerTemplateId === leftTemplate.templateId;
            const winnerTemplate = leftWon ? leftTemplate : rightTemplate;
            const loserTemplate = leftWon ? rightTemplate : leftTemplate;
            score(
              neutralTemplateScores,
              winnerTemplate.templateId,
              loserTemplate.templateId
            );
            const pairScore = neutralPairScores.get(pair);
            pairScore[leftWon ? 'wins' : 'losses'] += 1;
            pairScore.samples += 1;
            neutralBattleCount += 1;
          }
        });
      }
    }
  }

  for (const pair of V6_ELEMENT_ADVANTAGE_PAIRS) {
    const [attacker, defender] = pair.split(':');
    const attackerTemplates = templates.filter(template => template.element === attacker);
    const defenderTemplates = templates.filter(template => template.element === defender);
    for (const leftTemplate of attackerTemplates) {
      for (const rightTemplate of defenderTemplates) {
        scenarioInputs({ levels, statProfiles, skillSequences, seeds }, scenario => {
          const battleSeed = [
            scenario.baseSeed,
            'advantage',
            pair,
            leftTemplate.templateId,
            rightTemplate.templateId,
            scenario.level,
            scenario.statProfile,
            scenario.sequenceIndex
          ].join(':');
          for (const mirrored of [false, true]) {
            const result = simulateMatch({
              leftTemplate,
              rightTemplate,
              level: scenario.level,
              leftSequence: scenario.leftSequence,
              rightSequence: scenario.rightSequence,
              seed: battleSeed,
              mirrored,
              rulesVersion: 6,
              statProfile: scenario.statProfile,
              disableElementAdvantage: false
            });
            const row = advantageScores.get(pair);
            if (result.winnerTemplateId === leftTemplate.templateId) {
              row.wins += 1;
            } else {
              row.losses += 1;
            }
            row.samples += 1;
            advantageBattleCount += 1;
          }
        });
      }
    }
  }

  const neutralResults = [...neutralPairScores.values()].map(row => {
    const winRate = row.samples ? row.wins / row.samples : 0;
    return {
      ...row,
      winRate,
      deviation: Math.abs(0.5 - winRate)
    };
  });
  const templateNeutralResults = finalizeScores(neutralTemplateScores);
  const advantageResults = [...advantageScores.values()].map(row => ({
    ...row,
    winRate: row.samples ? row.wins / row.samples : 0
  }));
  return {
    rulesVersion: 6,
    mirroredOpponentSampling: true,
    battleCount: neutralBattleCount + advantageBattleCount,
    participantSampleCount: (neutralBattleCount + advantageBattleCount) * 2,
    neutralBattleCount,
    advantageBattleCount,
    levels: [...levels],
    statProfiles: [...statProfiles],
    skillSequences: [...skillSequences],
    seeds: [...seeds],
    templates: templates.map(template => template.templateId),
    neutralResults,
    advantageResults,
    templateNeutralResults,
    maxNeutralPairDeviation: Math.max(...neutralResults.map(row => row.deviation)),
    maxNeutralTemplateWinRate: Math.max(
      ...templateNeutralResults.map(row => row.winRate)
    )
  };
}

function emptyScore(key, label) {
  return {
    [key]: label,
    wins: 0,
    losses: 0,
    draws: 0,
    samples: 0,
    winRate: 0,
    deviation: 0
  };
}

function scoreDraw(scores, leftKey, rightKey) {
  scores.get(leftKey).draws += 1;
  scores.get(leftKey).samples += 1;
  scores.get(rightKey).draws += 1;
  scores.get(rightKey).samples += 1;
}

function score(scores, winnerKey, loserKey) {
  scores.get(winnerKey).wins += 1;
  scores.get(winnerKey).samples += 1;
  scores.get(loserKey).losses += 1;
  scores.get(loserKey).samples += 1;
}

function finalizeScores(scores) {
  return [...scores.values()].map(row => {
    const winRate = row.samples
      ? (row.wins + (row.draws * 0.5)) / row.samples
      : 0;
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
  runNeutralBalanceMatrix: runV8BalanceMatrix,
  runV5BalanceMatrix,
  runV6BalanceMatrix,
  runV7EvolutionBalanceMatrix,
  runV8BalanceMatrix,
  simulateMatch,
  simulateRulesV8Match,
  tieBreakWinner,
  assertLegalSequence,
  assertRulesV8Sequence,
  statsForLevel,
  statsForProfile
};
