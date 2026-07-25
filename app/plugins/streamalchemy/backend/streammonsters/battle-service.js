const { getSkillSet } = require('./battle-skill-catalog');

const MAX_ROUNDS = 3;

class BattleService {
  constructor({ store, now = () => Date.now() }) {
    this.store = store;
    this.now = now;
  }

  createBattleState(monsterA, monsterB, seed) {
    const orderedIds = [monsterA.monster_id, monsterB.monster_id].sort();
    const battleId = `battle-${this.hashNumber(`${seed}:${orderedIds.join(':')}`).toString(16)}`;
    const fighterA = this.createFighter(monsterA);
    const fighterB = this.createFighter(monsterB);
    return {
      battleId,
      rulesVersion: 4,
      seed,
      monsterAId: monsterA.monster_id,
      monsterBId: monsterB.monster_id,
      fighters: {
        [monsterA.monster_id]: fighterA,
        [monsterB.monster_id]: fighterB
      },
      rounds: [],
      roundNumber: 0,
      finished: false,
      winnerId: null,
      knockout: null,
      elementAdvantageMonsterId: this.elementAdvantageMonsterId(monsterA, monsterB)
    };
  }

  createFighter(monster) {
    const templateId = monster.template_id || String(monster.visual_key || '').replace(/^furry:/, '') || null;
    return {
      monsterId: monster.monster_id,
      userId: monster.user_id,
      name: monster.name,
      element: monster.element,
      templateId,
      imageUrl: monster.image_url || null,
      personality: monster.personality || 'Curious',
      stats: { ...monster.stats },
      maxHp: 30 + ((Number(monster.stats?.vitality) || 0) * 4),
      hp: 30 + ((Number(monster.stats?.vitality) || 0) * 4),
      shield: 0,
      charge: 0,
      effects: {}
    };
  }

  getAvailableSkills(state, monsterId) {
    const fighter = state.fighters[monsterId];
    if (!fighter) return null;
    const skills = getSkillSet(fighter.templateId, fighter.element);
    return Object.fromEntries(Object.entries(skills).map(([choice, skill]) => [choice, {
      ...skill,
      available: choice !== 'C' || fighter.charge >= 100
    }]));
  }

  resolveRound(state, requestedChoices = {}) {
    if (!state || state.rulesVersion !== 4) throw new Error('STREAM_MONSTERS_INVALID_BATTLE_STATE');
    if (state.finished) return { state, round: null };

    const roundNumber = state.roundNumber + 1;
    const ids = [state.monsterAId, state.monsterBId];
    const choices = Object.fromEntries(ids.map(id => [id, this.normalizeChoice(state, id, requestedChoices[id], roundNumber)]));
    const firstId = this.firstActorId(state, roundNumber);
    const order = [firstId, ids.find(id => id !== firstId)];
    const round = {
      number: roundNumber,
      requestedChoices: {
        [state.monsterAId]: this.normalizeRequestedChoice(requestedChoices[state.monsterAId]),
        [state.monsterBId]: this.normalizeRequestedChoice(requestedChoices[state.monsterBId])
      },
      selectedChoices: choices,
      firstMonsterId: firstId,
      before: this.snapshotFighters(state),
      actions: [],
      knockout: null,
      elementAdvantageMonsterId: state.elementAdvantageMonsterId
    };

    for (let actionIndex = 0; actionIndex < order.length; actionIndex += 1) {
      const actorId = order[actionIndex];
      const targetId = ids.find(id => id !== actorId);
      if (state.fighters[actorId].hp <= 0 || state.fighters[targetId].hp <= 0) break;
      const action = this.resolveAction(state, actorId, targetId, choices[actorId], requestedChoices[actorId], roundNumber, actionIndex);
      round.actions.push(action);
      if (state.fighters[targetId].hp <= 0 || state.fighters[actorId].hp <= 0) {
        const winnerId = state.fighters[actorId].hp > 0 ? actorId : targetId;
        const loserId = winnerId === actorId ? targetId : actorId;
        state.finished = true;
        state.winnerId = winnerId;
        state.knockout = { winnerId, loserId, roundNumber, actionIndex };
        round.knockout = state.knockout;
        break;
      }
    }

    round.after = this.snapshotFighters(state);
    state.rounds.push(round);
    state.roundNumber = roundNumber;
    if (!state.finished && state.roundNumber >= MAX_ROUNDS) {
      state.finished = true;
      state.winnerId = this.winnerFromHp(state);
    }
    return { state, round };
  }

  normalizeRequestedChoice(choice) {
    const normalized = String(choice || '').trim().toUpperCase();
    return ['A', 'B', 'C'].includes(normalized) ? normalized : null;
  }

  normalizeChoice(state, monsterId, requestedChoice, roundNumber) {
    const requested = this.normalizeRequestedChoice(requestedChoice);
    const available = this.getAvailableSkills(state, monsterId);
    if (requested && available[requested]?.available) return requested;
    return this.chooseAutomaticSkill(state, monsterId, roundNumber);
  }

  chooseAutomaticSkill(state, monsterId, roundNumber) {
    const fighter = state.fighters[monsterId];
    const roll = this.roll(`${state.seed}:${monsterId}:auto`, roundNumber);
    if (fighter.charge >= 100 && roll >= 40) return 'C';
    const personality = String(fighter.personality || '').toLowerCase();
    if (personality.includes('brave') || personality.includes('bold') || personality.includes('fierce')) {
      return roll >= 25 ? 'A' : 'B';
    }
    if (personality.includes('calm') || personality.includes('careful') || personality.includes('gentle')) {
      return roll >= 55 ? 'B' : 'A';
    }
    return roll >= 50 ? 'A' : 'B';
  }

  firstActorId(state, roundNumber) {
    const a = state.fighters[state.monsterAId];
    const b = state.fighters[state.monsterBId];
    const aInitiative = (Number(a.stats.agility) || 0) + this.effectAmount(a, 'initiative');
    const bInitiative = (Number(b.stats.agility) || 0) + this.effectAmount(b, 'initiative');
    if (this.effectAmount(a, 'initiative') > 0) this.consumeEffect(a, 'initiative');
    if (this.effectAmount(b, 'initiative') > 0) this.consumeEffect(b, 'initiative');
    if (aInitiative === bInitiative) {
      return this.roll(state.seed, `round:${roundNumber}:initiative`) >= 50 ? a.monsterId : b.monsterId;
    }
    return aInitiative > bInitiative ? a.monsterId : b.monsterId;
  }

  resolveAction(state, actorId, targetId, selectedChoice, requestedChoice, roundNumber, actionIndex) {
    const actor = state.fighters[actorId];
    const target = state.fighters[targetId];
    const skills = this.getAvailableSkills(state, actorId);
    const skill = skills[selectedChoice];
    const before = this.snapshotFighter(actor);
    const targetBefore = this.snapshotFighter(target);
    const effectsTriggered = this.applyStartEffects(state, actor, roundNumber, actionIndex);
    const outcomes = [];

    if (actor.hp > 0) {
      const damageEffect = skill.effects.find(effect => effect.type === 'damage');
      if (damageEffect) {
        const hits = Math.max(1, Number(damageEffect.hits) || 1);
        const totalDamage = this.baseDamage(actor, target, state.seed, roundNumber, actionIndex, damageEffect.bonus);
        const baseHit = Math.floor(totalDamage / hits);
        const remainder = totalDamage % hits;
        const piercing = Number(skill.effects.find(effect => effect.type === 'pierce')?.amount) || 0;
        for (let hitIndex = 0; hitIndex < hits; hitIndex += 1) {
          const damage = baseHit + (hitIndex < remainder ? 1 : 0);
          outcomes.push(this.applyDamage(state, actor, target, damage, piercing, roundNumber, actionIndex, hitIndex));
          if (target.hp <= 0 || actor.hp <= 0) break;
        }
      }
      for (const effect of skill.effects) {
        if (effect.type === 'damage' || effect.type === 'pierce') continue;
        const outcome = this.applySkillEffect(state, actor, target, effect, outcomes);
        if (outcome) outcomes.push(outcome);
      }
      if (selectedChoice === 'C') actor.charge = 0;
      else actor.charge = Math.min(100, actor.charge + (selectedChoice === 'B' ? 50 : 25));
    }

    return {
      monsterId: actorId,
      targetMonsterId: targetId,
      requestedChoice: this.normalizeRequestedChoice(requestedChoice),
      selectedChoice,
      skillId: skill.id,
      skill: {
        id: skill.id,
        name: skill.name,
        description: skill.description,
        icon: skill.icon,
        vfxKey: skill.vfxKey
      },
      before,
      after: this.snapshotFighter(actor),
      targetBefore,
      targetAfter: this.snapshotFighter(target),
      effectsTriggered,
      outcomes,
      seedRolls: {
        initiative: this.roll(state.seed, `round:${roundNumber}:initiative`),
        action: this.roll(state.seed, `round:${roundNumber}:action:${actionIndex}`)
      }
    };
  }

  applyStartEffects(state, fighter, roundNumber, actionIndex) {
    const triggered = [];
    const burn = fighter.effects.burn;
    if (burn?.duration > 0 && fighter.hp > 0) {
      const before = fighter.hp;
      fighter.hp = Math.max(0, fighter.hp - burn.amount);
      triggered.push({ type: 'burn', amount: before - fighter.hp, sourceMonsterId: burn.sourceMonsterId });
      burn.duration -= 1;
      if (burn.duration <= 0) delete fighter.effects.burn;
    }
    return triggered;
  }

  applyDamage(state, attacker, defender, amount, piercing, roundNumber, actionIndex, hitIndex) {
    const evade = defender.effects.evade;
    const evadeRoll = this.roll(state.seed, `round:${roundNumber}:action:${actionIndex}:hit:${hitIndex}:evade`);
    if (evade?.duration > 0 && evadeRoll < evade.chance) {
      this.consumeEffect(defender, 'evade');
      return { type: 'damage', attempted: amount, hpDamage: 0, shieldAbsorbed: 0, evaded: true, evadeRoll };
    }

    if (evade?.duration > 0) this.consumeEffect(defender, 'evade');
    const effectivePiercing = Math.min(amount, piercing);
    const shieldedDamage = Math.max(0, amount - effectivePiercing);
    const shieldAbsorbed = Math.min(defender.shield, shieldedDamage);
    defender.shield -= shieldAbsorbed;
    const hpDamage = Math.max(0, effectivePiercing + shieldedDamage - shieldAbsorbed);
    defender.hp = Math.max(0, defender.hp - hpDamage);
    if (hpDamage > 0) defender.charge = Math.min(100, defender.charge + 25);

    const reactive = this.effectAmount(defender, 'thorns') + this.effectAmount(defender, 'reflect');
    let reactiveDamage = 0;
    if (reactive > 0 && hpDamage > 0 && attacker.hp > 0) {
      reactiveDamage = Math.min(reactive, hpDamage);
      attacker.hp = Math.max(0, attacker.hp - reactiveDamage);
      if (reactiveDamage > 0) attacker.charge = Math.min(100, attacker.charge + 25);
      this.consumeEffect(defender, 'thorns');
      this.consumeEffect(defender, 'reflect');
    }
    return { type: 'damage', attempted: amount, hpDamage, shieldAbsorbed, piercing: effectivePiercing, reactiveDamage, evaded: false, evadeRoll };
  }

  applySkillEffect(state, actor, target, effect, outcomes) {
    switch (effect.type) {
      case 'shield':
        actor.shield += effect.amount;
        return { type: 'shield', amount: effect.amount };
      case 'heal': {
        const amount = Math.min(effect.amount, actor.maxHp - actor.hp);
        actor.hp += amount;
        return { type: 'heal', amount };
      }
      case 'healFromDamage': {
        const damage = outcomes
          ?.filter(outcome => outcome.type === 'damage')
          .reduce((total, outcome) => total + (outcome.hpDamage || 0), 0) || 0;
        const amount = Math.min(Math.floor(damage * effect.ratio), actor.maxHp - actor.hp);
        actor.hp += amount;
        return { type: 'heal', amount, source: 'damage' };
      }
      case 'burn':
      case 'thorns':
      case 'weaken':
      case 'evade':
      case 'reflect':
      case 'initiative':
        target.effects[effect.type] = { ...effect, sourceMonsterId: actor.monsterId };
        // Defensive effects are declared on the actor, offensive status effects
        // on the target. This keeps the catalog compact and replay data explicit.
        if (['thorns', 'evade', 'reflect', 'initiative'].includes(effect.type)) {
          delete target.effects[effect.type];
          actor.effects[effect.type] = { ...effect, sourceMonsterId: actor.monsterId };
        }
        return { type: effect.type, amount: effect.amount || effect.chance || 0, duration: effect.duration || 0 };
      case 'pierce':
        return { type: 'pierce', amount: effect.amount };
      default:
        return null;
    }
  }

  effectAmount(fighter, type) {
    const effect = fighter.effects[type];
    return effect && effect.duration !== 0 ? Number(effect.amount) || 0 : 0;
  }

  baseDamage(attacker, defender, seed, roundNumber, actionIndex, bonus = 0) {
    const advantage = this.elementAdvantage(attacker.element, defender.element) ? 3 : 0;
    const variance = this.roll(`${seed}:${attacker.monsterId}`, `round:${roundNumber}:action:${actionIndex}`) % 3;
    const weaken = this.effectAmount(attacker, 'weaken');
    if (weaken > 0) this.consumeEffect(attacker, 'weaken');
    return Math.max(1, 5 + (Number(attacker.stats.might) || 0) + advantage + variance + (Number(bonus) || 0)
      - Math.floor((Number(defender.stats.guard) || 0) / 2) - weaken);
  }

  consumeEffect(fighter, type) {
    const effect = fighter.effects[type];
    if (!effect) return;
    if (effect.duration == null) {
      delete fighter.effects[type];
      return;
    }
    effect.duration -= 1;
    if (effect.duration <= 0) delete fighter.effects[type];
  }

  snapshotFighter(fighter) {
    return {
      monsterId: fighter.monsterId,
      name: fighter.name,
      element: fighter.element,
      templateId: fighter.templateId,
      imageUrl: fighter.imageUrl,
      maxHp: fighter.maxHp,
      hp: fighter.hp,
      shield: fighter.shield,
      charge: fighter.charge,
      effects: Object.fromEntries(Object.entries(fighter.effects).map(([key, value]) => [key, { ...value }]))
    };
  }

  snapshotFighters(state) {
    return {
      [state.monsterAId]: this.snapshotFighter(state.fighters[state.monsterAId]),
      [state.monsterBId]: this.snapshotFighter(state.fighters[state.monsterBId])
    };
  }

  winnerFromHp(state) {
    const a = state.fighters[state.monsterAId];
    const b = state.fighters[state.monsterBId];
    if (a.hp === b.hp) return this.roll(state.seed, 'winner') >= 50 ? a.monsterId : b.monsterId;
    return a.hp > b.hp ? a.monsterId : b.monsterId;
  }

  finalize(state) {
    if (!state.finished) throw new Error('STREAM_MONSTERS_BATTLE_NOT_FINISHED');
    const result = {
      battleId: state.battleId,
      rulesVersion: 4,
      seed: state.seed,
      monsterAId: state.monsterAId,
      monsterBId: state.monsterBId,
      winnerId: state.winnerId,
      elementAdvantageMonsterId: state.elementAdvantageMonsterId,
      knockout: state.knockout,
      rounds: state.rounds,
      fighters: this.snapshotFighters(state)
    };
    this.store.createBattle({
      battleId: result.battleId,
      seed: result.seed,
      monsterAId: result.monsterAId,
      monsterBId: result.monsterBId,
      winnerMonsterId: result.winnerId,
      result,
      createdAtMs: this.now()
    });
    return result;
  }

  persistRewards(result, rewards = []) {
    const enriched = {
      ...result,
      rewards: rewards.map(reward => ({
        monsterId: reward.monsterId,
        xpAwarded: Number(reward.xpAwarded) || 0,
        levelUps: Number(reward.levelUps) || 0,
        unspentStatPoints: Number(reward.unspentStatPoints) || 0
      }))
    };
    this.store.updateBattleResult(enriched.battleId, enriched);
    return enriched;
  }

  // Compatibility resolver for already deployed automatic battles and their
  // historical replays. New matches use createBattleState/resolveRound.
  resolve(monsterA, monsterB, seed) {
    const orderedIds = [monsterA.monster_id, monsterB.monster_id].sort();
    const battleId = `battle-${this.hashNumber(`${seed}:${orderedIds.join(':')}`).toString(16)}`;
    const existing = this.store.getBattle(battleId);
    if (existing) return JSON.parse(existing.result_json);

    let hpA = 30 + (monsterA.stats.vitality * 4);
    let hpB = 30 + (monsterB.stats.vitality * 4);
    const elementAdvantageMonsterId = this.elementAdvantageMonsterId(monsterA, monsterB);
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
      rounds.push({
        number: index + 1,
        firstMonsterId: first.monster_id,
        firstDamage,
        secondDamage,
        hpA,
        hpB,
        elementAdvantageMonsterId
      });
    }

    const winnerId = hpA === hpB
      ? (this.roll(seed, 99) >= 50 ? monsterA.monster_id : monsterB.monster_id)
      : (hpA > hpB ? monsterA.monster_id : monsterB.monster_id);
    const result = {
      battleId,
      rulesVersion: 3,
      seed,
      monsterAId: monsterA.monster_id,
      monsterBId: monsterB.monster_id,
      winnerId,
      elementAdvantageMonsterId,
      rounds
    };
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
