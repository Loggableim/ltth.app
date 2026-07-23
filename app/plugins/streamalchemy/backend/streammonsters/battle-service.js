const STANCES = ['power', 'guard', 'speed'];

class BattleService {
  constructor({ store, now = () => Date.now() }) {
    this.store = store;
    this.now = now;
  }

  resolve(monsterA, monsterB, seed, requestedStanceA = null, requestedStanceB = null) {
    const stanceA = this.normalizeStance(requestedStanceA, monsterA);
    const stanceB = this.normalizeStance(requestedStanceB, monsterB);
    const orderedSides = [
      `${monsterA.monster_id}:${stanceA}`,
      `${monsterB.monster_id}:${stanceB}`
    ].sort();
    const battleId = `battle-${this.hashNumber(`${seed}:${orderedSides.join(':')}`).toString(16)}`;
    const existing = this.store.getBattle(battleId);
    if (existing) return JSON.parse(existing.result_json);

    let hpA = 30 + (monsterA.stats.vitality * 4);
    let hpB = 30 + (monsterB.stats.vitality * 4);
    const elementAdvantageMonsterId = this.elementAdvantageMonsterId(monsterA, monsterB);
    const stanceAdvantageMonsterId = this.stanceAdvantage(stanceA, stanceB)
      ? monsterA.monster_id
      : (this.stanceAdvantage(stanceB, stanceA) ? monsterB.monster_id : null);
    const rounds = [];
    for (let index = 0; index < 3; index += 1) {
      const aFirst = monsterA.stats.agility === monsterB.stats.agility
        ? this.roll(seed, index) >= 50
        : monsterA.stats.agility > monsterB.stats.agility;
      const first = aFirst ? monsterA : monsterB;
      const second = aFirst ? monsterB : monsterA;
      const firstDamage = this.damage(
        first,
        second,
        seed,
        index,
        0,
        stanceAdvantageMonsterId === first.monster_id
      );
      const secondDamage = this.damage(
        second,
        first,
        seed,
        index,
        1,
        stanceAdvantageMonsterId === second.monster_id
      );
      if (aFirst) {
        hpB = Math.max(0, hpB - firstDamage);
        hpA = Math.max(0, hpA - secondDamage);
      } else {
        hpA = Math.max(0, hpA - firstDamage);
        hpB = Math.max(0, hpB - secondDamage);
      }
      rounds.push({
        number: index + 1,
        firstMonsterId: first.monster_id,
        firstDamage,
        secondDamage,
        hpA,
        hpB,
        elementAdvantageMonsterId,
        stanceAdvantageMonsterId
      });
    }

    const winnerId = hpA === hpB
      ? (this.roll(seed, 99) >= 50 ? monsterA.monster_id : monsterB.monster_id)
      : (hpA > hpB ? monsterA.monster_id : monsterB.monster_id);
    const result = {
      battleId,
      seed,
      monsterAId: monsterA.monster_id,
      monsterBId: monsterB.monster_id,
      stanceA,
      stanceB,
      winnerId,
      elementAdvantageMonsterId,
      stanceAdvantageMonsterId,
      rounds
    };
    this.store.createBattle({
      battleId,
      seed,
      monsterAId: monsterA.monster_id,
      monsterBId: monsterB.monster_id,
      userAId: monsterA.user_id,
      userBId: monsterB.user_id,
      stanceA,
      stanceB,
      winnerMonsterId: winnerId,
      result,
      createdAtMs: this.now()
    });
    return result;
  }

  damage(attacker, defender, seed, round, order, hasStanceAdvantage = false) {
    const advantage = this.elementAdvantage(attacker.element, defender.element) ? 3 : 0;
    const stanceBonus = hasStanceAdvantage ? 2 : 0;
    const variance = this.roll(`${seed}:${attacker.monster_id}`, (round * 2) + order) % 3;
    return Math.max(
      1,
      5 + attacker.stats.might + advantage + stanceBonus + variance - Math.floor(defender.stats.guard / 2)
    );
  }

  normalizeStance(stance, monster) {
    const normalized = String(stance || '').trim().toLowerCase();
    return STANCES.includes(normalized) ? normalized : this.stanceForMonster(monster);
  }

  stanceForMonster(monster) {
    const personality = String(monster?.personality || monster?.monster_id || 'Curious');
    return STANCES[this.hashNumber(`stance:${personality}`) % STANCES.length];
  }

  stanceAdvantage(attacker, defender) {
    return new Set(['power:guard', 'guard:speed', 'speed:power'])
      .has(`${attacker}:${defender}`);
  }

  elementAdvantage(attacker, defender) {
    return new Set(['Ember:Grove', 'Grove:Tide', 'Tide:Ember', 'Volt:Gale', 'Gale:Lunar', 'Lunar:Volt'])
      .has(`${attacker}:${defender}`);
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
