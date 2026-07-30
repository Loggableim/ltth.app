const { randomUUID } = require('crypto');
const {
  TEMPLATE_CATALOG,
  FURRY_ASSET_VERSION,
  getTemplate,
  getTemplatesForElement,
  getEvolutionAssetPath,
  hashNumber,
  resolveStageSkill
} = require('./catalog');
const { effectiveCombatPower } = require('./evolution-rules');

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
const MISSION_TARGETS = Object.freeze({
  solo: Object.freeze({
    six_hatches: 2,
    four_elements: 2,
    three_battles: 1
  }),
  party: Object.freeze({
    six_hatches: 4,
    four_elements: 3,
    three_battles: 2,
    heart_chain_five: 3
  }),
  rally: Object.freeze({
    six_hatches: 6,
    four_elements: 4,
    three_battles: 3,
    heart_chain_five: 5
  })
});

class CollectionService {
  constructor({
    store,
    progression = null,
    assetRegistry = null,
    emit = () => {},
    now = () => Date.now(),
    getActiveViewerCount = () => 1,
    hasQualifyingHeartGift = () => false
  }) {
    this.store = store;
    this.progression = progression;
    this.assetRegistry = assetRegistry;
    this.emit = emit;
    this.now = now;
    this.getActiveViewerCount = getActiveViewerCount;
    this.hasQualifyingHeartGift = hasQualifyingHeartGift;
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
      // Apply any zero-progress population growth before this batch records
      // the mission's first progress and freezes its target.
      this.getStreamMission(streamKey);
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
      newUnlocks.forEach(unlock => this.progression?.awardCollectorPoints?.(
        userId,
        10,
        `mastery:${templateId}:${unlock}`
      ));
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
      const available = Math.max(0, Number(previous.amount) || 0);
      const spent = Math.max(0, Number(previous.spent) || 0);
      const earned = Math.max(0, Number(amount) || 0);
      const total = available + earned;
      const lifetimeTotal = available + spent + earned;
      const unlocks = [...previous.unlocks];
      ESSENCE_UNLOCKS.forEach(([threshold, key]) => {
        if (lifetimeTotal >= threshold && !unlocks.includes(key)) unlocks.push(key);
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

  compareFusionStrength(left, right) {
    const powerDifference = effectiveCombatPower(right) -
      effectiveCombatPower(left);
    if (powerDifference) return powerDifference;
    const ageDifference = (Number(left.created_at_ms) || 0) -
      (Number(right.created_at_ms) || 0);
    if (ageDifference) return ageDifference;
    return String(left.monster_id).localeCompare(String(right.monster_id));
  }

  prestigeCosmetics(level) {
    const normalized = Math.max(0, Math.min(3, Number(level) || 0));
    if (!normalized) return null;
    return {
      level: normalized,
      stars: '\u2605'.repeat(normalized),
      aura: `fusion-crystal-${normalized}`,
      frame: `prestige-${normalized}`,
      title: ['Fusion Star', 'Fusion Nova', 'Fusion Crown'][normalized - 1]
    };
  }

  selectFusionPair(candidates, preferredMonsterId = null) {
    const preferred = preferredMonsterId
      ? candidates.find(monster => monster.monster_id === preferredMonsterId)
      : null;
    if (preferredMonsterId && !preferred) return null;
    const stages = preferred
      ? [Number(preferred.evolution_stage)]
      : [3, 2, 1];
    for (const stage of stages) {
      const stageCandidates = candidates.filter(monster => (
        Number(monster.evolution_stage) === stage
      ));
      if (stage < 3) {
        if (stageCandidates.length < 2) continue;
        if (preferred) {
          const counterpart = stageCandidates
            .filter(monster => monster.monster_id !== preferred.monster_id)
            .sort((left, right) => this.compareFusionStrength(left, right))[0];
          if (!counterpart) continue;
          return [preferred, counterpart]
            .sort((left, right) => this.compareFusionStrength(left, right));
        }
        return stageCandidates
          .sort((left, right) => this.compareFusionStrength(left, right))
          .slice(0, 2);
      }

      const donors = stageCandidates
        .filter(monster => Number(monster.prestige_level) === 0)
        .sort((left, right) => this.compareFusionStrength(left, right));
      const prestigeSurvivors = stageCandidates
        .filter(monster => (Number(monster.prestige_level) || 0) > 0)
        .sort((left, right) => (
          (Number(right.prestige_level) || 0) -
            (Number(left.prestige_level) || 0) ||
          this.compareFusionStrength(left, right)
        ));
      if (prestigeSurvivors.length) {
        const survivor = prestigeSurvivors[0];
        if ((Number(survivor.prestige_level) || 0) >= 3) continue;
        const donor = preferred && (Number(preferred.prestige_level) || 0) === 0
          ? preferred
          : donors[0];
        if (donor) return [survivor, donor];
        continue;
      }
      if (preferred) {
        if ((Number(preferred.prestige_level) || 0) > 0) continue;
        const counterpart = donors.find(monster => (
          monster.monster_id !== preferred.monster_id
        ));
        if (counterpart) {
          return [preferred, counterpart]
            .sort((left, right) => this.compareFusionStrength(left, right));
        }
        continue;
      }
      if (donors.length >= 2) return donors.slice(0, 2);
    }
    return null;
  }

  fuseDuplicates({
    userId,
    templateId,
    triggerType,
    triggerId,
    preferredMonsterId = null
  } = {}) {
    const template = getTemplate(templateId);
    const normalizedUserId = String(userId || '');
    const normalizedTriggerType = String(triggerType || '');
    const normalizedTriggerId = String(triggerId || '');
    if (
      !normalizedUserId ||
      !template ||
      !normalizedTriggerType ||
      !normalizedTriggerId
    ) {
      return { status: 'invalid' };
    }
    const processed = this.store.getFusionByTrigger(
      normalizedTriggerType,
      normalizedTriggerId
    );
    if (processed) {
      return {
        status: 'already_processed',
        survivor: processed.survivor,
        donor: processed.donor,
        fromStage: processed.from_stage,
        toStage: processed.to_stage,
        prestigeBefore: processed.prestige_before,
        prestigeAfter: processed.prestige_after
      };
    }
    const pair = this.selectFusionPair(
      this.store.getFusionCandidates(normalizedUserId, template.templateId),
      preferredMonsterId
    );
    if (!pair) return { status: 'no_pair' };
    const [survivor, donor] = pair;
    const blocker = this.store.getFusionBlocker(survivor.monster_id) ||
      this.store.getFusionBlocker(donor.monster_id);
    if (blocker) return { status: 'blocked', reason: blocker };

    const fromStage = Number(survivor.evolution_stage);
    const toStage = Math.min(3, fromStage + 1);
    const prestigeBefore = fromStage === 3
      ? Math.max(0, Number(survivor.prestige_level) || 0)
      : 0;
    const prestigeAfter = fromStage === 3
      ? Math.min(3, prestigeBefore + 1)
      : 0;
    const visual = fromStage < 3
      ? this.assetRegistry?.resolveVisual?.({
        templateId: template.templateId,
        stage: toStage,
        element: survivor.element
      })
      : null;
    if (fromStage < 3 && (!visual?.imageUrl || visual.fallback === true)) {
      return {
        status: 'blocked',
        reason: 'asset_unavailable',
        fromStage,
        toStage
      };
    }

    const stored = this.store.commitFusion({
      fusionId: randomUUID(),
      userId: normalizedUserId,
      templateId: template.templateId,
      survivorMonsterId: survivor.monster_id,
      donorMonsterId: donor.monster_id,
      fromStage,
      toStage,
      prestigeBefore,
      prestigeAfter,
      triggerType: normalizedTriggerType,
      triggerId: normalizedTriggerId,
      visual,
      createdAtMs: this.now()
    });
    if (stored.status === 'already_processed') {
      return {
        status: 'already_processed',
        survivor: stored.survivor,
        donor: stored.donor,
        fromStage: stored.from_stage,
        toStage: stored.to_stage,
        prestigeBefore: stored.prestige_before,
        prestigeAfter: stored.prestige_after
      };
    }
    const unlockedChoice = fromStage < 3
      ? (toStage >= 3
        ? 'C'
        : (['striker', 'trickster'].includes(template.role) ? 'A' : 'B'))
      : null;
    const result = {
      status: 'fused',
      fromStage,
      toStage,
      prestigeBefore,
      prestigeAfter,
      statsBefore: stored.stats_before,
      statsAfter: stored.stats_after,
      statChanges: stored.stat_changes,
      unlockedSkill: unlockedChoice
        ? resolveStageSkill(template.templateId, unlockedChoice, toStage, 7)
        : null,
      prestige: this.prestigeCosmetics(prestigeAfter),
      survivor: stored.survivor,
      donor: stored.donor
    };
    if (fromStage < 3) {
      this.store.afterCommit(() => this.progression?.awardCollectorPoints?.(
        normalizedUserId,
        toStage === 2 ? 25 : 50,
        `evolution:${stored.survivor.monster_id}:${toStage}`
      ));
    }
    this.emitAfterCommit('streammonsters:monster_evolved', {
      userId: normalizedUserId,
      evolutionStage: toStage,
      prestigeLevel: prestigeAfter,
      prestige: result.prestige,
      statsBefore: result.statsBefore,
      statsAfter: result.statsAfter,
      statChanges: result.statChanges,
      ...(result.unlockedSkill
        ? { unlockedSkill: result.unlockedSkill }
        : {}),
      fusion: {
        kind: fromStage === 3 ? 'prestige' : 'stage',
        fromStage,
        toStage,
        prestigeBefore,
        prestigeAfter
      },
      monster: result.survivor
    });
    return result;
  }

  reconcileLegacyContact(userId, contactId) {
    const normalizedUserId = String(userId || '').trim();
    const normalizedContactId = String(contactId || '').trim();
    if (!normalizedUserId || !normalizedContactId) {
      return { status: 'invalid_contact' };
    }
    return this.store.runInImmediateTransaction(() => {
      if (!this.store.claimFusionContact(
        normalizedUserId,
        normalizedContactId,
        this.now()
      )) {
        return { status: 'contact_already_processed' };
      }
      let result = { status: 'no_pair' };
      for (const templateId of this.store.getFusionCandidateTemplates(
        normalizedUserId
      )) {
        if (!getTemplate(templateId)) continue;
        result = this.fuseDuplicates({
          userId: normalizedUserId,
          templateId,
          triggerType: 'contact',
          triggerId: normalizedContactId
        });
        if (result.status !== 'no_pair') break;
      }
      this.store.setFusionContactResult(
        normalizedContactId,
        result.status,
        result.status === 'fused'
          ? this.store.getFusionByTrigger(
            'contact',
            normalizedContactId
          )?.fusion_id || null
          : null
      );
      return result;
    });
  }

  evolveMonster(userId, monsterId) {
    return this.store.runInImmediateTransaction(() => {
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
      const egg = this.store.getEgg(monster.egg_id);
      const evolutionVisual = this.assetRegistry
        ? this.assetRegistry.resolveVisual({
          templateId: monster.template_id,
          stage: nextStage,
          seed: `${egg?.seed || monster.monster_id}:evolution:${nextStage}`,
          element: monster.element
        })
        : {
          imageUrl: getEvolutionAssetPath(monster.template_id, nextStage),
          visualSource: 'furry',
          visualKey: `furry:${monster.template_id}:stage-${nextStage}`,
          assetVersion: FURRY_ASSET_VERSION
        };
      if (!evolutionVisual?.imageUrl) {
        throw new Error('STREAM_MONSTERS_EVOLUTION_ASSET_UNAVAILABLE');
      }
      const afterSpend = this.store.spendElementEssence(userId, monster.element, spendNow);
      if (!afterSpend) throw new Error('STREAM_MONSTERS_EVOLUTION_ESSENCE_REQUIRED');
      this.store.setMonsterEvolutionStage(
        monsterId,
        nextStage,
        spentRequired,
        evolutionVisual.imageUrl,
        evolutionVisual.visualKey,
        evolutionVisual.visualSource,
        evolutionVisual.assetVersion
      );
      const grant = this.store.applyEvolutionGrant(
        monsterId,
        nextStage,
        this.now()
      );
      const template = getTemplate(monster.template_id);
      const unlockedChoice = nextStage >= 3
        ? 'C'
        : (['striker', 'trickster'].includes(template.role) ? 'A' : 'B');
      const result = {
        evolutionStage: nextStage,
        spentEssence: spentRequired,
        statsBefore: grant.statsBefore,
        statsAfter: grant.statsAfter,
        statChanges: grant.statChanges,
        unlockedSkill: resolveStageSkill(
          monster.template_id,
          unlockedChoice,
          nextStage,
          7
        ),
        monster: grant.monster
      };
      this.emitAfterCommit('streammonsters:monster_evolved', {
        userId,
        ...result
      });
      this.progression?.awardCollectorPoints?.(
        userId,
        nextStage === 2 ? 25 : 50,
        `evolution:${monsterId}:${nextStage}`
      );
      return result;
    });
  }

  peekStreamMission(streamKey) {
    return this.store.getStreamMission(streamKey || 'offline');
  }

  getStreamMission(streamKey) {
    const key = streamKey || 'offline';
    const population = Math.max(0, Math.round(
      Number(this.getActiveViewerCount(key)) || 0
    ));
    const populationBand = this.populationBand(population);
    const definitions = MISSION_DEFINITIONS.filter(definition => (
      definition.key !== 'heart_chain_five' ||
      (
        populationBand !== 'solo' &&
        this.hasQualifyingHeartGift(key)
      )
    ));
    const definition = definitions[hashNumber(key) % definitions.length];
    let mission = this.store.getOrCreateStreamMission(key, {
      ...definition,
      target: this.missionTarget(definition.key, populationBand),
      populationBand,
      populationPeak: population
    });
    if (!mission.population_band) return mission;
    const populationPeak = Math.max(
      population,
      Number(mission.population_peak) || 0
    );
    const effectiveBand = this.populationBand(populationPeak);
    const target = this.missionTarget(mission.mission_key, effectiveBand);
    mission = this.store.updateStreamMissionPopulation(key, {
      populationBand: effectiveBand,
      populationPeak,
      target
    });
    return mission;
  }

  populationBand(activeViewers) {
    const population = Math.max(0, Number(activeViewers) || 0);
    if (population >= 15) return 'rally';
    if (population >= 5) return 'party';
    return 'solo';
  }

  missionTarget(missionKey, populationBand) {
    return MISSION_TARGETS[populationBand]?.[missionKey] ||
      MISSION_DEFINITIONS.find(definition => definition.key === missionKey)?.target ||
      1;
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
      this.progression?.awardCollectorPoints?.(
        participant.user_id,
        20,
        `stream-mission:${streamKey}`
      );
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
      } else {
        length = 1;
        lastGiftAtMs = atMs;
        awarded = [];
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
      return {
        imageUrl: template.assetPath,
        visualSource: 'furry',
        visualKey: `furry:${template.templateId}`,
        assetVersion: this.assetRegistry?.getAsset(template.templateId, 1)?.assetVersion ||
          FURRY_ASSET_VERSION
      };
    }
    const fallback = kenneyBuilder?.build?.({ seed: egg.seed, element: egg.element }) || null;
    return fallback ? {
      imageUrl: fallback.publicUrl,
      visualSource: fallback.visualSource,
      visualKey: fallback.visualKey,
      assetVersion: 'kenney-cc0-v1'
    } : {
      imageUrl: template.assetPath,
      visualSource: 'furry',
      visualKey: `furry:${template.templateId}`,
      assetVersion: FURRY_ASSET_VERSION
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
module.exports.MISSION_TARGETS = MISSION_TARGETS;
module.exports.MISSION_DEFINITIONS = MISSION_DEFINITIONS;
