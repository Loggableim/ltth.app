'use strict';

const { CHOICES, V6_SKILL_CATALOG } = require('./battle-rules-v5');
const {
  PASSIVE_CHARGE_PER_SECOND,
  MAX_PASSIVE_CHARGE_PER_ROUND
} = require('./battle-charge');
const {
  runV8BalanceMatrix,
  runV8AllPairsNeutralMatrix
} = require('./battle-simulator');

const REPRESENTATIVE_OPTIONS = Object.freeze({
  levels: Object.freeze([1]),
  stages: Object.freeze([1, 2, 3]),
  statProfiles: Object.freeze(['balanced']),
  skillSequences: Object.freeze(['AAA', 'ABA', 'ABB', 'BAB', 'BBA', 'BBC']),
  seeds: Object.freeze([
    'v8-gate-0', 'v8-gate-1', 'v8-gate-2',
    'v8-gate-3', 'v8-gate-4', 'v8-gate-5'
  ]),
  maxRounds: 64
});

const ALL_PAIRS_OPTIONS = Object.freeze({
  levels: Object.freeze([1]),
  stages: Object.freeze([1]),
  statProfiles: Object.freeze(['balanced']),
  skillSequences: Object.freeze(['AAA', 'ABA', 'ABB', 'BAB', 'BBA', 'BBC']),
  seeds: Object.freeze([
    'v8-all-pairs-0', 'v8-all-pairs-1', 'v8-all-pairs-2',
    'v8-all-pairs-3', 'v8-all-pairs-4', 'v8-all-pairs-5'
  ]),
  maxRounds: 64
});

let cachedReport = null;

function effectComponents() {
  const components = Object.fromEntries(CHOICES.map(choice => [choice, new Set()]));
  Object.values(V6_SKILL_CATALOG).forEach(deck => {
    Object.entries(deck || {}).forEach(([choice, skill]) => {
      (skill?.effects || []).forEach(effect => components[choice]?.add(effect.type));
    });
  });
  return Object.fromEntries(CHOICES.map(choice => [choice, [...components[choice]].sort()]));
}

function buildBalanceReport() {
  return {
    rulesVersion: 8,
    skillBudget: {
      choices: [...CHOICES],
      specialChargeRequired: 100,
      passiveChargePerSecond: PASSIVE_CHARGE_PER_SECOND,
      maxPassiveChargePerRound: MAX_PASSIVE_CHARGE_PER_ROUND
    },
    effectComponents: effectComponents(),
    representative: runV8BalanceMatrix(REPRESENTATIVE_OPTIONS),
    allPairs: runV8AllPairsNeutralMatrix(ALL_PAIRS_OPTIONS)
  };
}

function getBalanceReport() {
  cachedReport ||= buildBalanceReport();
  return cachedReport;
}

module.exports = {
  REPRESENTATIVE_OPTIONS,
  ALL_PAIRS_OPTIONS,
  buildBalanceReport,
  getBalanceReport
};
