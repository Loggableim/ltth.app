const {
  RULES_VERSION,
  elementAdvantage,
  resolveBattle
} = require('./battle-rules-v3');
const { resolveInteractiveRound } = require('./battle-rules-v5');

const STANCES = ['power', 'guard', 'speed'];

class BattleService {
  constructor({ store, now = () => Date.now() }) {
    this.store = store;
    this.now = now;
  }

  resolve(monsterA, monsterB, seed, requestedStanceA = null, requestedStanceB = null, options = {}) {
    const orderedMonsterIds = [monsterA.monster_id, monsterB.monster_id].sort();
    const battleId = `battle-${this.hashNumber(
      `${RULES_VERSION}:${seed}:${orderedMonsterIds.join(':')}`
    ).toString(16)}`;
    const existing = this.store.getBattle(battleId);
    if (existing?.result) return existing.result;

    const result = {
      battleId,
      ...resolveBattle(monsterA, monsterB, seed, options),
      // Stances remain as compatibility metadata, but v3 never reads user input.
      stanceA: this.stanceForMonster(monsterA),
      stanceB: this.stanceForMonster(monsterB)
    };
    this.store.createBattle({
      battleId,
      seed,
      monsterAId: monsterA.monster_id,
      monsterBId: monsterB.monster_id,
      userAId: monsterA.user_id,
      userBId: monsterB.user_id,
      stanceA: result.stanceA,
      stanceB: result.stanceB,
      winnerMonsterId: result.winnerId,
      rulesVersion: RULES_VERSION,
      skills: result.skills,
      result,
      createdAtMs: this.now()
    });
    return result;
  }

  resolveInteractiveRound(input) {
    return resolveInteractiveRound(input);
  }

  normalizeStance(_stance, monster) {
    return this.stanceForMonster(monster);
  }

  stanceForMonster(monster) {
    const personality = String(monster?.personality || monster?.monster_id || 'Curious');
    return STANCES[this.hashNumber(`stance:${personality}`) % STANCES.length];
  }

  stanceAdvantage() {
    return false;
  }

  elementAdvantage(attacker, defender) {
    return elementAdvantage(attacker, defender);
  }

  elementAdvantageMonsterId(monsterA, monsterB) {
    if (this.elementAdvantage(monsterA.element, monsterB.element)) return monsterA.monster_id;
    if (this.elementAdvantage(monsterB.element, monsterA.element)) return monsterB.monster_id;
    return null;
  }

  roll(seed, offset) {
    return this.hashNumber(`${seed}:${offset}`) % 100;
  }

  hashNumber(value) {
    let hash = 2166136261;
    for (const char of String(value)) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }
}

module.exports = BattleService;
module.exports.STANCES = STANCES;
