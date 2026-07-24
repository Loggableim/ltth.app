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
    const now = this.now();
    const action = `hatch:${monster.monster_id}`;
    if (!this.store.claimCollectionAction(action, now)) return this.getMastery(monster.user_id, monster.template_id);
    const copies = this.store.countOwnedTemplate(monster.user_id, monster.template_id);
    if (copies === 1) {
      this.emit('streammonsters:monster_discovered', { userId: monster.user_id, monster, template: getTemplate(monster.template_id) });
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
  }

  recordBattle(monster, { battleId, won = false, streamKey = null } = {}) {
    if (!monster?.template_id || !battleId) return null;
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
  }

  recordMissionCompletion(monster, streamKey) {
    if (!monster?.template_id) return null;
    return this.addMastery(monster.user_id, monster.template_id, 3, `mission:${streamKey}:${monster.monster_id}`);
  }

  addMastery(userId, templateId, points, actionKey) {
    if (!userId || !templateId) return null;
    const now = this.now();
    if (actionKey && !this.store.claimCollectionAction(`mastery:${actionKey}`, now)) return this.getMastery(userId, templateId);
    const previous = this.store.getTemplateMastery(userId, templateId);
    const total = previous.points + Math.max(0, Number(points) || 0);
    const unlocks = [...previous.unlocks];
    const newUnlocks = MASTERY_UNLOCKS
      .filter(([threshold, key]) => previous.points < threshold && total >= threshold && !unlocks.includes(key))
      .map(([, key]) => key);
    unlocks.push(...newUnlocks);
    const mastery = this.store.setTemplateMastery(userId, templateId, total, unlocks);
    newUnlocks.forEach(unlock => this.emit('streammonsters:mastery_unlocked', {
      userId, templateId, unlock, mastery
    }));
    return mastery;
  }

  addEssence(userId, element, amount, actionKey) {
    const now = this.now();
    if (actionKey && !this.store.claimCollectionAction(`essence:${actionKey}`, now)) return this.getEssence(userId, element);
    const previous = this.store.getElementEssence(userId, element);
    const total = previous.amount + Math.max(0, Number(amount) || 0);
    const unlocks = [...previous.unlocks];
    ESSENCE_UNLOCKS.forEach(([threshold, key]) => {
      if (previous.amount < threshold && total >= threshold && !unlocks.includes(key)) unlocks.push(key);
    });
    return this.store.setElementEssence(userId, element, total, unlocks);
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

  getStreamMission(streamKey) {
    const mission = MISSION_DEFINITIONS[hashNumber(streamKey || 'offline') % MISSION_DEFINITIONS.length];
    return this.store.getOrCreateStreamMission(streamKey || 'offline', mission);
  }

  recordMissionProgress(streamKey, event, { userId = null, monster = null, value = null, actionKey = null } = {}) {
    const mission = this.getStreamMission(streamKey);
    if (userId) this.store.addMissionParticipant(streamKey, userId, monster?.monster_id || null);
    if (mission.completed_at_ms) return mission;
    if (actionKey && !this.store.claimCollectionAction(`mission:${streamKey}:${actionKey}`, this.now())) return mission;
    let progress = mission.progress;
    if (mission.mission_key === 'six_hatches' && event === 'hatch') progress += 1;
    if (mission.mission_key === 'three_battles' && event === 'battle') progress += 1;
    if (mission.mission_key === 'heart_chain_five' && event === 'heart_chain') progress = Math.max(progress, Number(value) || 0);
    if (mission.mission_key === 'four_elements' && event === 'hatch' && monster?.element) {
      progress = this.store.recordMissionElement(streamKey, monster.element);
    }
    const updated = this.store.setStreamMissionProgress(streamKey, Math.min(mission.target, progress), progress >= mission.target ? this.now() : null);
    this.emit('streammonsters:stream_mission_progress', { streamKey, mission: updated });
    if (updated.completed_at_ms && !mission.completed_at_ms) this.completeMission(streamKey, true);
    return updated;
  }

  completeMission(streamKey, completedDuringProgressUpdate = false) {
    const mission = this.getStreamMission(streamKey);
    const completed = mission.completed_at_ms
      ? mission
      : this.store.setStreamMissionProgress(streamKey, mission.target, this.now());
    const newlyCompleted = completedDuringProgressUpdate || !mission.completed_at_ms;
    this.store.getMissionParticipants(streamKey).forEach(participant => {
      if (!this.store.claimMissionParticipantReward(streamKey, participant.user_id, this.now())) return;
      this.store.unlockCollectionCosmetic(participant.user_id, `season_badge:${streamKey}`, this.now());
      const target = participant.selected_monster_id
        ? this.store.getMonster(participant.selected_monster_id)
        : (this.store.getSelectedMonster(participant.user_id) || this.store.getViewerMonsters(participant.user_id).at(-1));
      if (target) this.recordMissionCompletion(target, streamKey);
    });
    if (newlyCompleted) this.emit('streammonsters:stream_mission_completed', { streamKey, mission: completed });
    return completed;
  }

  getMissionParticipant(streamKey, userId) {
    return this.store.getMissionParticipant(streamKey, userId);
  }

  recordHeartMe({ streamKey, userId, atMs = this.now() }) {
    const chain = this.store.getHeartChain(streamKey);
    let length = chain.chain_length;
    let lastUserId = chain.last_user_id;
    let lastGiftAtMs = chain.last_gift_at_ms;
    if (!lastUserId || atMs - lastGiftAtMs > 8_000) {
      length = 1;
      lastUserId = userId;
      lastGiftAtMs = atMs;
    } else if (lastUserId !== userId) {
      length += 1;
      lastUserId = userId;
      lastGiftAtMs = atMs;
    }
    const awarded = [...chain.awarded];
    const milestone = [[3, 5], [5, 10], [10, 20]].find(([threshold]) => length >= threshold && !awarded.includes(threshold));
    const hypeAward = milestone ? milestone[1] : 0;
    if (milestone) awarded.push(milestone[0]);
    const updated = this.store.setHeartChain(streamKey, { lastUserId, lastGiftAtMs, length, awarded });
    this.recordMissionProgress(streamKey, 'heart_chain', { userId, value: length });
    const result = { streamKey, length, hypeAward, awarded: updated.awarded };
    this.emit('streammonsters:heart_chain_changed', result);
    return result;
  }

  getHeartChain(streamKey) {
    return this.store.getHeartChain(streamKey);
  }

  selectVisual({ template, egg, visualPack = 'furry', artPool = null, kenneyBuilder = null, hasBundledAsset = () => true }) {
    const pack = ['furry', 'art_lab', 'kenney'].includes(visualPack) ? visualPack : 'furry';
    const kenney = () => kenneyBuilder?.build?.({ seed: egg.seed, element: egg.element }) || null;
    if (pack === 'art_lab') {
      const templateArt = artPool?.consumeForTemplate?.(egg.element, egg.variant, template.templateId) || null;
      if (templateArt) return { imageUrl: templateArt.image_url, visualSource: 'ai', visualKey: templateArt.visual_key };
      const legacyArt = artPool?.consumeForTemplate?.(egg.element, egg.variant, null) || artPool?.consume?.(egg.element, egg.variant) || null;
      if (legacyArt) return { imageUrl: legacyArt.image_url, visualSource: 'ai', visualKey: legacyArt.visual_key };
    }
    if (pack !== 'kenney' && hasBundledAsset(template)) {
      return { imageUrl: template.assetPath, visualSource: 'furry', visualKey: `furry:${template.templateId}` };
    }
    const fallback = kenney();
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
}

module.exports = CollectionService;
module.exports.MISSION_DEFINITIONS = MISSION_DEFINITIONS;
