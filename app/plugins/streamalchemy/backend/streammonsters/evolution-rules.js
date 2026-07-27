const STAT_KEYS = Object.freeze(['vitality', 'might', 'guard', 'agility']);

const ELEMENT_STAT_GRANTS = Object.freeze({
  Ember: Object.freeze({ vitality: 0, might: 2, guard: 0, agility: 1 }),
  Tide: Object.freeze({ vitality: 2, might: 0, guard: 1, agility: 0 }),
  Grove: Object.freeze({ vitality: 1, might: 0, guard: 2, agility: 0 }),
  Gale: Object.freeze({ vitality: 0, might: 1, guard: 0, agility: 2 }),
  Volt: Object.freeze({ vitality: 0, might: 2, guard: 0, agility: 1 }),
  Lunar: Object.freeze({ vitality: 1, might: 1, guard: 1, agility: 0 })
});

const EMPTY_STAT_GRANT = Object.freeze({
  vitality: 0,
  might: 0,
  guard: 0,
  agility: 0
});
const LEVEL_POWER_WEIGHT = 4;
const SKILL_TIER_POWER_WEIGHT = 3;

function evolutionStatGrant(element, stage) {
  const normalizedStage = Math.max(1, Math.min(3, Number(stage) || 1));
  const grant = normalizedStage >= 2
    ? ELEMENT_STAT_GRANTS[element]
    : EMPTY_STAT_GRANT;
  if (!grant) throw new Error(`STREAM_MONSTERS_EVOLUTION_ELEMENT_UNKNOWN:${element}`);
  return { ...grant };
}

function applyEvolutionGrant(stats, element, stage) {
  const grant = evolutionStatGrant(element, stage);
  return Object.fromEntries(STAT_KEYS.map(key => [
    key,
    Math.max(0, Number(stats?.[key]) || 0) + grant[key]
  ]));
}

function effectiveCombatPower(monster) {
  const level = Math.max(1, Number(monster?.level) || 1);
  const stage = Math.max(
    1,
    Math.min(3, Number(monster?.evolution_stage ?? monster?.evolutionStage) || 1)
  );
  const statTotal = STAT_KEYS.reduce(
    (total, key) => total + Math.max(0, Number(monster?.stats?.[key]) || 0),
    0
  );
  return Math.round(
    (level * LEVEL_POWER_WEIGHT) +
    statTotal +
    ((stage - 1) * SKILL_TIER_POWER_WEIGHT)
  );
}

module.exports = {
  STAT_KEYS,
  ELEMENT_STAT_GRANTS,
  LEVEL_POWER_WEIGHT,
  SKILL_TIER_POWER_WEIGHT,
  evolutionStatGrant,
  applyEvolutionGrant,
  effectiveCombatPower
};
