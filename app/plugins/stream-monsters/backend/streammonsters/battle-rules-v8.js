const RULES_VERSION = 8;
const ARENA_COLLAPSE_ROUND = 5;
const ARENA_COLLAPSE_RECOVERY_PHASE_ROUNDS = 2;
const ARENA_COLLAPSE_DEFENSE_LOCK_ROUND = 8;

function isArenaCollapseDefenseLocked(round) {
  return Math.max(1, Math.round(Number(round) || 1)) >=
    ARENA_COLLAPSE_DEFENSE_LOCK_ROUND;
}

function arenaCollapseRecoveryFactor(round, recoveryType) {
  const normalizedRound = Math.max(1, Math.round(Number(round) || 1));
  if (normalizedRound < ARENA_COLLAPSE_ROUND) return 1;
  const phase = Math.floor(
    (normalizedRound - ARENA_COLLAPSE_ROUND) /
    ARENA_COLLAPSE_RECOVERY_PHASE_ROUNDS
  );
  if (recoveryType === 'shield') {
    return [0.5, 0.25, 0][Math.min(2, phase)];
  }
  if (recoveryType === 'heal') {
    return [1, 0.5, 0][Math.min(2, phase)];
  }
  return 1;
}

function applyArenaCollapse({
  fighters,
  state,
  round,
  actions = []
}) {
  const normalizedRound = Math.max(1, Math.round(Number(round) || 1));
  const sourceState = state && typeof state === 'object' ? state : {};
  if (normalizedRound < ARENA_COLLAPSE_ROUND) {
    return {
      active: false,
      round: normalizedRound,
      damage: 0,
      state: sourceState,
      fighters: []
    };
  }

  const damage = 2 * (normalizedRound - ARENA_COLLAPSE_ROUND + 1);
  const shieldReductions = new Map();
  actions.forEach(action => {
    const reduced = (Array.isArray(action?.outcomes) ? action.outcomes : [])
      .filter(outcome => outcome?.type === 'shield')
      .reduce((total, outcome) => (
        total + Math.max(0, Number(outcome.arenaCollapseReduction) || 0)
      ), 0);
    if (reduced <= 0 || !action?.actorId) return;
    shieldReductions.set(
      action.actorId,
      (shieldReductions.get(action.actorId) || 0) + reduced
    );
  });

  const fighterResults = [];
  const collapsedState = Object.fromEntries(fighters.map((fighter, index) => {
    const monsterId = fighter.monsterId || fighter.monster_id;
    const after = { ...(sourceState[monsterId] || {}) };
    const shieldReduced = shieldReductions.get(monsterId) || 0;
    const hp = Math.max(0, Math.round(Number(after.hp) || 0));
    const hpDamage = hp > 0 ? Math.max(0, Math.min(damage, hp - 1)) : 0;
    after.hp = hp > 0 ? Math.max(1, hp - hpDamage) : 0;
    fighterResults.push({
      monsterId,
      slot: Math.max(1, Number(fighter.slot) || index + 1),
      shieldReduced,
      hpDamage,
      hp: after.hp,
      shield: Math.max(0, Math.round(Number(after.shield) || 0))
    });
    return [monsterId, after];
  }));

  return {
    active: true,
    round: normalizedRound,
    damage,
    state: collapsedState,
    fighters: fighterResults.sort((left, right) => left.slot - right.slot)
  };
}

module.exports = {
  RULES_VERSION,
  ARENA_COLLAPSE_ROUND,
  ARENA_COLLAPSE_RECOVERY_PHASE_ROUNDS,
  ARENA_COLLAPSE_DEFENSE_LOCK_ROUND,
  isArenaCollapseDefenseLocked,
  arenaCollapseRecoveryFactor,
  applyArenaCollapse
};
