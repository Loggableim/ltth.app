const {
  TEMPLATE_CATALOG,
  getTemplate,
  getTemplatesForElement,
  hashNumber
} = require('./catalog');

const MASTERY_UNLOCKS = Object.freeze([
  [10, 'title'], [25, 'attack_trail'], [50, 'mastery_frame']
]);
const ESSENCE_UNLOCKS = Object.freeze([
  [3, 'palette'], [6, 'hatch_aura'], [12, 'profile_badge']
]);
const MISSION_DEFINITIONS = Object.freeze([
  { key: 'six_hatches', target: 6, event: 'hatch' },
  { key: 'four_elements', target: 4, event: 'element' },
  { key: 'three_battles', target: 3, event: 'battle' },
  { key: 'heart_chain_five', target: 5, event: 'heart_chain' }
]);

class CollectionService {
  constructor({ store, emit = () => {}, now = () => Date.now() }) {
    this.store = store;
    this.emit = emit;
    this.now = now;
  }

  runAtomic(operation) {
    return this.store.runInTransaction(operation);
  }

  emitAfterCommit(event, payload) {
    this.store.afterCommit(() => this.emit(event, payload));
  }

  missionAcceptsEvent(mission, event, monster = null) {
    if (mission.mission_key === 'six_hatches') return event === 'hatch';
    if (mission.mission_key === 'four_elements') return event === 'hatch' && Boolean(monster?.element);
    if (mission.mission_key === 'three_battles') return event === 'battle';
    if (mission.mission_key === 'heart_chain_five') return event === 'heart_chain';
    return false;
  }

  reserveTemplateForEgg(egg) {
    const reservation = this.store.reserveTemplateForEgg(egg, cycle => this.bagOrder(egg, cycle));
    return { ...reservation, template: getTemplate(reservation.template_id), templateId: reservation.template_id };
  }

  bagOrder(egg, cycle) {
    const owned = new Set(cycle === 0 ? this.store.getOwnedTemplateIds(egg.user_id, egg.element) : []);
    return getTemplatesForElement(egg.element)
      .map(entry => ({ entry, score: hashNumber(`${egg.user_id}:${egg.element}:${cycle}:${egg.seed}:${entry.templateId}`) }))
      .sort((left, right) => {
        const leftOwned = owned.has(left.entry.templateId) ? 1 : 0;
        const rightOwned = owned.has(right.entry.templateId) ? 1 : 0;
        return leftOwned - rightOwned || left.score - right.score || left.entry.templateId.localeCompare(right.entry.templateId);
      })
      .map(item => item.entry.templateId);
  }

  recordHatch(monster, streamKey = null) {
    if (!monster?.template_id) return null;
    return this.runAtomic(() => {
      const now = this.now();
      const action = `hatch:${monster.monster_id}`;
      if (!this.store.claimCollectionAction(action, now)) return this.getMastery(monster.user_id, monster.template_id);
      const copies = this.store.countOwnedTemplate(monster.user_id, monster.template_id);
      if (copies === 1) {
        this.emitAfterCommit('streammonsters:monster_discovered', {
          userId: monster.user_id,
          monster,
          template: getTemplate(monster.template_id)
        });
      } else {
        this.addEssence(monster.user_id, monster.element, 1, `duplicate:${monster.monster_id}`);
      }
      const mastery = this.addMastery(monster.user_id, monster.template_id, 5, action);
      if (streamKey) this.recordMissionProgress(streamKey, 'hatch', {
        userId: monster.user_id,
        monster,
        actionKey: `hatch:${monster.monster_id}`
      });
      return mastery;
    });
  }

  recordBattle(monster, { battleId, won = false, streamKey = null } = {}) {
    if (!monster?.template_id || !battleId) return null;
    return this.runAtomic(() => {
      const mastery = this.addMastery(
        monster.user_id,
        monster.template_id,
        2 + (won ? 1 : 0),
        `battle:${battleId}:${monster.monster_id}`
      );
      if (streamKey) this.recordMissionProgress(streamKey, 'battle', {
        userId: monster.user_id,
        monster,
        actionKey: `battle:${battleId}`
      });
      return mastery;
    });
  }

  recordBattleOutcome({ streamKey, battleId, fighters = [] } = {}) {
    if (!battleId) return null;
    return this.runAtomic(() => {
      const validFighters = fighters.filter(fighter => fighter?.monster?.template_id && fighter.monster.user_id);
      validFighters.forEach(fighter => this.addMastery(
        fighter.monster.user_id,
        fighter.monster.template_id,
        2 + (fighter.won ? 1 : 0),
        `battle:${battleId}:${fighter.monster.monster_id}`
      ));
      if (!streamKey || !validFighters.length) return null;
      const result = this.store.recordBattleMission({
        streamKey,
        battleId,
        participants: validFighters.map(fighter => ({
          userId: fighter.monster.user_id,
          monsterId: fighter.monster.monster_id
        })),
        completedAtMs: this.now()
      });
      if (result.accepted) {
        this.emitAfterCommit('streammonsters:stream_mission_progress', { streamKey, mission: result.mission });
      }
      if (result.newlyCompleted) this.completeMission(streamKey, true);
      return result.mission;
    });
  }

  recordMissionCompletion(monster, streamKey) {
    if (!monster?.template_id) return null;
    return this.addMastery(monster.user_id, monster.template_id, 3, `mission:${streamKey}:${monster.monster_id}`);
  }

  addMastery(userId, templateId, points, actionKey) {
    if (!userId || !templateId) return null;
    return this.runAtomic(() => {
      const now = this.now();
      if (actionKey && !this.store.claimCollectionAction(`mastery:${actionKey}`, now)) {
        return this.getMastery(userId, templateId);
      }
      const previous = this.store.getTemplateMastery(userId, templateId);
      const total = previous.points + Math.max(0, Number(points) || 0);
      const unlocks = [...previous.unlocks];
      const newUnlocks = MASTERY_UNLOCKS
        .filter(([threshold, key]) => previous.points < threshold && total >= threshold && !unlocks.includes(key))
        .map(([, key]) => key);
      unlocks.push(...newUnlocks);
      const mastery = this.store.setTemplateMastery(userId, templateId, total, unlocks);
      newUnlocks.forEach(unlock => this.emitAfterCommit('streammonsters:mastery_unlocked', {
        userId, templateId, unlock, mastery
      }));
      return mastery;
    });
  }

  addEssence(userId, element, amount, actionKey) {
    return this.runAtomic(() => {
      const now = this.now();
      if (actionKey && !this.store.claimCollectionAction(`essence:${actionKey}`, now)) {
        return this.getEssence(userId, element);
      }
      const previous = this.store.getElementEssence(userId, element);
      const total = previous.amount + Math.max(0, Number(amount) || 0);
      const unlocks = [...previous.unlocks];
      ESSENCE_UNLOCKS.forEach(([threshold, key]) => {
        if (previous.amount < threshold && total >= threshold && !unlocks.includes(key)) unlocks.push(key);
      });
      return this.store.setElementEssence(userId, element, total, unlocks);
    });
  }

  getMastery(userId, templateId) {
    return this.store.getTemplateMastery(userId, templateId);
  }

  getEssence(userId, element) {
    return this.store.getElementEssence(userId, element);
  }

  getCosmetics(userId) {
    return this.store.getCollectionCosmetics(userId);
  }

  evolveMonster(userId, monsterId) {
    return this.runAtomic(() => {
      const monster = this.store.getMonster(monsterId);
      if (!monster || monster.user_id !== userId) {
        throw new Error('STREAM_MONSTERS_MONSTER_NOT_FOUND');
      }
      const currentStage = Math.max(1, Number(monster.evolution_stage) || 1);
      if (currentStage >= 3) throw new Error('STREAM_MONSTERS_EVOLUTION_MAX_STAGE');
      const nextStage = currentStage + 1;
      const masteryRequired = nextStage === 2 ? 25 : 50;
      const spentRequired = nextStage === 2 ? 3 : 8;
      const mastery = this.getMastery(userId, monster.template_id);
      if (mastery.points < masteryRequired) {
        throw new Error('STREAM_MONSTERS_EVOLUTION_MASTERY_REQUIRED');
      }
      const essence = this.getEssence(userId, monster.element);
      const monsterSpent = Math.max(0, Number(monster.evolution_essence_spent) || 0);
      const spendNow = Math.max(0, spentRequired - monsterSpent);
      if (essence.amount < spendNow) {
        throw new Error('STREAM_MONSTERS_EVOLUTION_ESSENCE_REQUIRED');
      }
      const afterSpend = this.store.spendElementEssence(userId, monster.element, spendNow);
      if (!afterSpend) throw new Error('STREAM_MONSTERS_EVOLUTION_ESSENCE_REQUIRED');
      const stageKey = nextStage === 2 ? 'ii' : 'iii';
      const evolved = this.store.setMonsterEvolutionStage(
        monsterId,
        nextStage,
        spentRequired,
        `/plugins/streamalchemy/assets/streammonsters/furry/evolutions/${monster.template_id}-${stageKey}.png`,
        `furry:${monster.template_id}:evolution-${stageKey}`
      );
      const result = {
        evolutionStage: nextStage,
        spentEssence: spentRequired,
        monster: evolved
      };
      this.emitAfterCommit('streammonsters:monster_evolved', {
        userId,
        ...result
      });
      return result;
    });
  }

  getStreamMission(streamKey) {
    const mission = MISSION_DEFINITIONS[hashNumber(streamKey || 'offline') % MISSION_DEFINITIONS.length];
    return this.store.getOrCreateStreamMission(streamKey || 'offline', mission);
  }

  recordMissionProgress(streamKey, event, { userId = null, monster = null, value = null, actionKey = null } = {}) {
    return this.runAtomic(() => {
      const mission = this.getStreamMission(streamKey);
      if (mission.completed_at_ms || !this.missionAcceptsEvent(mission, event, monster)) return mission;
      if (userId) this.store.addMissionParticipant(streamKey, userId, monster?.monster_id || null);
      if (actionKey && !this.store.claimCollectionAction(`mission:${streamKey}:${actionKey}`, this.now())) return mission;
      let progress = mission.progress;
      if (mission.mission_key === 'six_hatches') progress += 1;
      if (mission.mission_key === 'three_battles') progress += 1;
      if (mission.mission_key === 'heart_chain_five') progress = Math.max(progress, Number(value) || 0);
      if (mission.mission_key === 'four_elements') {
        progress = this.store.recordMissionElement(streamKey, monster.element);
      }
      const updated = this.store.setStreamMissionProgress(
        streamKey,
        Math.min(mission.target, progress),
        progress >= mission.target ? this.now() : null
      );
      this.emitAfterCommit('streammonsters:stream_mission_progress', { streamKey, mission: updated });
      if (updated.completed_at_ms && !mission.completed_at_ms) this.completeMission(streamKey, true);
      return updated;
    });
  }

  completeMission(streamKey, completedDuringProgressUpdate = false) {
    return this.runAtomic(() => {
      const mission = this.getStreamMission(streamKey);
      const completed = mission.completed_at_ms
        ? mission
        : this.store.setStreamMissionProgress(streamKey, mission.target, this.now());
      const newlyCompleted = completedDuringProgressUpdate || !mission.completed_at_ms;
      this.store.getMissionParticipants(streamKey).forEach(participant => {
        this.rewardMissionParticipant(streamKey, participant);
      });
      if (newlyCompleted) {
        this.emitAfterCommit('streammonsters:stream_mission_completed', { streamKey, mission: completed });
      }
      return completed;
    });
  }

  rewardMissionParticipant(streamKey, participant) {
    return this.runAtomic(() => {
      if (!this.store.claimMissionParticipantReward(streamKey, participant.user_id, this.now())) return false;
      this.store.unlockCollectionCosmetic(participant.user_id, `season_badge:${streamKey}`, this.now());
      const target = this.store.getSelectedMonster(participant.user_id) ||
        (participant.selected_monster_id ? this.store.getMonster(participant.selected_monster_id) : null) ||
        this.store.getViewerMonsters(participant.user_id).at(-1);
      if (target) this.recordMissionCompletion(target, streamKey);
      return true;
    });
  }

  getMissionParticipant(streamKey, userId) {
    return this.store.getMissionParticipant(streamKey, userId);
  }

  recordHeartMe({ streamKey, userId, atMs = this.now() }) {
    return this.runAtomic(() => {
      const chain = this.store.getHeartChain(streamKey);
      let length = chain.chain_length;
      let lastUserId = chain.last_user_id;
      let lastGiftAtMs = chain.last_gift_at_ms;
      let awarded = [...chain.awarded];
      if (!lastUserId || atMs - lastGiftAtMs > 8_000) {
        length = 1;
        lastUserId = userId;
        lastGiftAtMs = atMs;
        awarded = [];
      } else if (lastUserId !== userId) {
        length += 1;
        lastUserId = userId;
        lastGiftAtMs = atMs;
      }
      const milestone = [[3, 5], [5, 10], [10, 20]]
        .find(([threshold]) => length >= threshold && !awarded.includes(threshold));
      const hypeAward = milestone ? milestone[1] : 0;
      if (milestone) awarded.push(milestone[0]);
      const updated = this.store.setHeartChain(streamKey, { lastUserId, lastGiftAtMs, length, awarded });
      this.recordMissionProgress(streamKey, 'heart_chain', { userId, value: length });
      const result = { streamKey, length, hypeAward, awarded: updated.awarded };
      this.emitAfterCommit('streammonsters:heart_chain_changed', result);
      return result;
    });
  }

  getHeartChain(streamKey) {
    return this.store.getHeartChain(streamKey);
  }

  selectVisual({ template, egg, kenneyBuilder = null, hasBundledAsset = () => true }) {
    if (hasBundledAsset(template)) {
      return { imageUrl: template.assetPath, visualSource: 'furry', visualKey: `furry:${template.templateId}` };
    }
    const fallback = kenneyBuilder?.build?.({ seed: egg.seed, element: egg.element }) || null;
    return fallback ? { imageUrl: fallback.publicUrl, visualSource: fallback.visualSource, visualKey: fallback.visualKey } : {
      imageUrl: template.assetPath, visualSource: 'furry', visualKey: `furry:${template.templateId}`
    };
  }

  getCatalogState(userId) {
    const owned = new Set(this.store.getOwnedTemplateIds(userId));
    return {
      templates: TEMPLATE_CATALOG.map(template => ({
        ...template,
        owned: owned.has(template.templateId),
        silhouette: !owned.has(template.templateId),
        mastery: this.getMastery(userId, template.templateId)
      })),
      dex: { owned: owned.size, total: TEMPLATE_CATALOG.length },
      essence: ['Ember', 'Tide', 'Grove', 'Gale', 'Volt', 'Lunar'].map(element => this.getEssence(userId, element)),
      cosmetics: this.getCosmetics(userId)
    };
  }

  getCatalogPage(userId, { page = 1, pageSize = 6 } = {}) {
    const state = this.getCatalogState(userId);
    const normalizedPageSize = Math.max(1, Math.min(24, Number.parseInt(pageSize, 10) || 6));
    const totalPages = Math.max(1, Math.ceil(state.templates.length / normalizedPageSize));
    const normalizedPage = Math.max(1, Math.min(totalPages, Number.parseInt(page, 10) || 1));
    const offset = (normalizedPage - 1) * normalizedPageSize;
    return {
      page: normalizedPage,
      pageSize: normalizedPageSize,
      total: state.templates.length,
      totalPages,
      cards: state.templates.slice(offset, offset + normalizedPageSize),
      dex: state.dex
    };
  }

  getCatalogRotation(userId, { cursor = 0 } = {}) {
    const templates = this.getCatalogState(userId).templates;
    const normalizedCursor = Math.max(0, Number.parseInt(cursor, 10) || 0) % templates.length;
    const cards = Array.from(
      { length: Math.min(6, templates.length) },
      (_, index) => templates[(normalizedCursor + index) % templates.length]
    );
    return {
      cursor: normalizedCursor,
      nextCursor: (normalizedCursor + cards.length) % templates.length,
      cards
    };
  }

  getMonsterCard(userId, monsterId) {
    const monster = this.store.getMonster(monsterId);
    if (!monster || monster.user_id !== userId) return null;
    return {
      type: 'monster',
      size: 'large',
      placement: 'upper',
      monster,
      template: getTemplate(monster.template_id),
      mastery: this.getMastery(userId, monster.template_id),
      essence: this.getEssence(userId, monster.element)
    };
  }
}

module.exports = CollectionService;
module.exports.MISSION_DEFINITIONS = MISSION_DEFINITIONS;
