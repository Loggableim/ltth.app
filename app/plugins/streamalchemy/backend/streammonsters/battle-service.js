class BattleService {
  constructor({ store, now = () => Date.now() }) {
    this.store = store;
    this.now = now;
  }

  resolve(monsterA, monsterB, seed) {
    const orderedIds = [monsterA.monster_id, monsterB.monster_id].sort();
    const battleId = `battle-${this.hashNumber(`${seed}:${orderedIds.join(':')}`).toString(16)}`;
    const existing = this.store.getBattle(battleId);
    if (existing) return JSON.parse(existing.result_json);

    let hpA = 30 + (monsterA.stats.vitality * 4);
    let hpB = 30 + (monsterB.stats.vitality * 4);
    const rounds = [];
    for (let index = 0; index < 3; index += 1) {
      const aFirst = monsterA.stats.agility === monsterB.stats.agility
        ? this.roll(seed, index) >= 50
        : monsterA.stats.agility > monsterB.stats.agility;
      const first = aFirst ? monsterA : monsterB;
      const second = aFirst ? monsterB : monsterA;
      const firstDamage = this.damage(first, second, seed, index, 0);
      const secondDamage = this.damage(second, first, seed, index, 1);
      if (aFirst) {
        hpB = Math.max(0, hpB - firstDamage);
        hpA = Math.max(0, hpA - secondDamage);
      } else {
        hpA = Math.max(0, hpA - firstDamage);
        hpB = Math.max(0, hpB - secondDamage);
      }
      rounds.push({ number: index + 1, firstMonsterId: first.monster_id, firstDamage, secondDamage, hpA, hpB });
    }

    const winnerId = hpA === hpB
      ? (this.roll(seed, 99) >= 50 ? monsterA.monster_id : monsterB.monster_id)
      : (hpA > hpB ? monsterA.monster_id : monsterB.monster_id);
    const result = { battleId, seed, monsterAId: monsterA.monster_id, monsterBId: monsterB.monster_id, winnerId, rounds };
    this.store.createBattle({
      battleId,
      seed,
      monsterAId: monsterA.monster_id,
      monsterBId: monsterB.monster_id,
      winnerMonsterId: winnerId,
      result,
      createdAtMs: this.now()
    });
    return result;
  }

  damage(attacker, defender, seed, round, order) {
    const advantage = this.elementAdvantage(attacker.element, defender.element) ? 3 : 0;
    const variance = this.roll(`${seed}:${attacker.monster_id}`, (round * 2) + order) % 3;
    return Math.max(1, 5 + attacker.stats.might + advantage + variance - Math.floor(defender.stats.guard / 2));
  }

  elementAdvantage(attacker, defender) {
    return new Set(['Ember:Grove', 'Grove:Tide', 'Tide:Ember', 'Volt:Gale', 'Gale:Lunar', 'Lunar:Volt'])
      .has(`${attacker}:${defender}`);
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
