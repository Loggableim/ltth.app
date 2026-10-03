const { selectBattleWinner } = require('./battle-tie-break');

const RULES_VERSION = 8;
const ARENA_COLLAPSE_WARNING_ROUND = 3;
const ARENA_COLLAPSE_ROUND = 4;
const ARENA_COLLAPSE_RECOVERY_PHASE_ROUNDS = 2;
const ARENA_COLLAPSE_DEFENSE_LOCK_ROUND = 8;
const ARENA_COLLAPSE_ENFORCED_KO_ROUND = 12;
const MAX_RULES_V8_ROUNDS = 64;

function arenaCollapseStatus(round) {
  const normalizedRound = Math.max(1, Math.round(Number(round) || 1));
  if (normalizedRound >= ARENA_COLLAPSE_ROUND) return 'active';
  if (normalizedRound === ARENA_COLLAPSE_WARNING_ROUND) return 'warning';
  return 'inactive';
}

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
  actions = [],
  seed = ''
}) {
  const normalizedRound = Math.max(1, Math.round(Number(round) || 1));
  const sourceState = state && typeof state === 'object' ? state : {};
  const status = arenaCollapseStatus(normalizedRound);
  if (status !== 'active') {
    return {
      active: false,
      status,
      round: normalizedRound,
      damage: 0,
      state: sourceState,
      fighters: [],
      terminal: false,
      winnerId: null,
      terminalReason: null
    };
  }

  const isEnforcedKO = normalizedRound >= ARENA_COLLAPSE_ENFORCED_KO_ROUND;
  const isDefenseLocked = normalizedRound >= ARENA_COLLAPSE_DEFENSE_LOCK_ROUND;
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

    // R8+: decay lingering shields by 50%
    if (isDefenseLocked && !isEnforcedKO) {
      after.shield = Math.max(0, Math.floor((after.shield || 0) * 0.5));
    }

    if (isEnforcedKO) {
      // R12+: strip all shields, lethal damage (remove hp-1 clamp)
      after.shield = 0;
      const hp = Math.max(0, Math.round(Number(after.hp) || 0));
      after.hp = Math.max(0, hp - damage);
    } else {
      const hp = Math.max(0, Math.round(Number(after.hp) || 0));
      const hpDamage = hp > 0 ? Math.max(0, Math.min(damage, hp - 1)) : 0;
      after.hp = hp > 0 ? Math.max(1, hp - hpDamage) : 0;
    }

    fighterResults.push({
      monsterId,
      slot: Math.max(1, Number(fighter.slot) || index + 1),
      shieldReduced,
      hpDamage: isEnforcedKO
        ? Math.max(0, Math.round(Number(sourceState[monsterId]?.hp) || 0) - after.hp)
        : Math.max(0, Math.round(Number(sourceState[monsterId]?.hp) || 0) - after.hp),
      hp: after.hp,
      shield: Math.max(0, Math.round(Number(after.shield) || 0))
    });
    return [monsterId, after];
  }));

  let terminal = false;
  let winnerId = null;
  let terminalReason = null;

  if (isEnforcedKO) {
    const living = fighters.filter(fighter => {
      const monsterId = fighter.monsterId || fighter.monster_id;
      return collapsedState[monsterId]?.hp > 0;
    });
    if (living.length < 2) {
      terminal = true;
      if (living.length === 1) {
        const monsterId = living[0].monsterId || living[0].monster_id;
        // Ensure survivor has at least 1 HP
        collapsedState[monsterId].hp = Math.max(1, collapsedState[monsterId].hp);
        winnerId = monsterId;
      } else {
        // Both eliminated — use tiebreak
        const fighterForTiebreak = fighters.map(fighter => ({
          monsterId: fighter.monsterId || fighter.monster_id,
          agility: fighter.agility || fighter.stats?.agility
        }));
        winnerId = selectBattleWinner(fighterForTiebreak, collapsedState, seed);
        if (winnerId && collapsedState[winnerId]) {
          collapsedState[winnerId].hp = 1;
          // Zero out the loser
          fighters.forEach(fighter => {
            const monsterId = fighter.monsterId || fighter.monster_id;
            if (monsterId !== winnerId && collapsedState[monsterId]) {
              collapsedState[monsterId].hp = 0;
            }
          });
        }
      }
      terminalReason = 'knockout';
    }
  }

  return {
    active: true,
    status,
    round: normalizedRound,
    damage,
    state: collapsedState,
    fighters: fighterResults.sort((left, right) => left.slot - right.slot),
    terminal,
    winnerId,
    terminalReason
  };
}

module.exports = {
  RULES_VERSION,
  ARENA_COLLAPSE_WARNING_ROUND,
  ARENA_COLLAPSE_ROUND,
  ARENA_COLLAPSE_RECOVERY_PHASE_ROUNDS,
  ARENA_COLLAPSE_DEFENSE_LOCK_ROUND,
  ARENA_COLLAPSE_ENFORCED_KO_ROUND,
  MAX_RULES_V8_ROUNDS,
  arenaCollapseStatus,
  isArenaCollapseDefenseLocked,
  arenaCollapseRecoveryFactor,
  applyArenaCollapse
};
