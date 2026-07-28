const { createHash } = require('crypto');

const CRITICAL_EVENT_TYPES = new Set([
  'streammonsters:egg_spawned',
  'streammonsters:egg_landed',
  'streammonsters:egg_ready',
  'streammonsters:free_egg_public',
  'streammonsters:free_egg_claimed',
  'streammonsters:egg_stage_removed',
  'streammonsters:hatch_started',
  'streammonsters:egg_hatched',
  'streammonsters:monster_discovered',
  'streammonsters:monster_evolved',
  'streammonsters:mastery_unlocked',
  'streammonsters:stream_mission_completed',
  'streammonsters:achievement_unlocked',
  'streammonsters:season_rank_changed'
]);

const PRIVATE_KEYS = new Set([
  'userid',
  'user_id',
  'viewerid',
  'viewer_id',
  'canonicaluserid',
  'canonical_user_id',
  'platformuserid',
  'platform_user_id',
  'current_unique_id',
  'seed',
  'giftid',
  'gift_id',
  'monsterid',
  'monster_id',
  'eggid',
  'egg_id',
  'visualkey',
  'visual_key',
  'visualsource',
  'visual_source',
  'poolkey',
  'pool_key',
  'participantid',
  'participant_id',
  'lockedmonsterid',
  'locked_monster_id',
  'queuedmonsterid',
  'queued_monster_id',
  'providereventid',
  'provider_event_id',
  'requestedchoice',
  'requested_choice',
  'chargeatchoice',
  'charge_at_choice',
  'streamkey',
  'stream_key'
]);

const PRIVATE_KEY_SUFFIXES = Object.freeze([
  'userid',
  'viewerid',
  'uniqueid',
  'giftid',
  'monsterid',
  'eggid',
  'participantid',
  'seed',
  'visualkey',
  'visualsource',
  'poolkey',
  'providereventid',
  'requestedchoice',
  'chargeatchoice',
  'streamkey'
]);

function normalizedKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isPrivateKey(key) {
  const lowerKey = String(key || '').toLowerCase();
  if (PRIVATE_KEYS.has(lowerKey)) return true;
  const normalized = normalizedKey(key);
  return PRIVATE_KEY_SUFFIXES.some(suffix => normalized.endsWith(suffix));
}

function boundedText(value, maximum = 96) {
  if (value === null || value === undefined) return null;
  const normalized = String(value)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
  return normalized ? normalized.slice(0, maximum) : null;
}

function finiteNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeImageUrl(value) {
  const url = boundedText(value, 512);
  if (!url) return null;
  return (
    url.startsWith('/plugins/streamalchemy/assets/') ||
    /^\/api\/streammonsters\/art\/kenney-[a-f0-9]{16}\.svg$/i.test(url) ||
    /^\/api\/streammonsters\/avatar\/[a-z0-9_-]{16,1024}$/i.test(url)
  ) ? url : null;
}

function projectStats(stats = {}) {
  return Object.fromEntries(
    ['vitality', 'might', 'guard', 'agility']
      .map(key => [key, finiteNumber(stats?.[key], 0)])
  );
}

function projectMonster(monster = null) {
  if (!monster || typeof monster !== 'object') return null;
  return {
    name: boundedText(monster.name, 64) || 'Monster',
    element: boundedText(monster.element, 24),
    rarity: boundedText(monster.rarity, 32),
    level: Math.max(1, finiteNumber(monster.level, 1)),
    xp: Math.max(0, finiteNumber(monster.xp, 0)),
    personality: boundedText(monster.personality, 48),
    templateId: boundedText(monster.templateId ?? monster.template_id, 48),
    evolutionStage: Math.max(
      1,
      finiteNumber(monster.evolutionStage ?? monster.evolution_stage, 1)
    ),
    unspentStatPoints: Math.max(
      0,
      finiteNumber(
        monster.unspentStatPoints ?? monster.unspent_stat_points,
        0
      )
    ),
    imageUrl: safeImageUrl(monster.imageUrl ?? monster.image_url),
    stats: projectStats(monster.stats)
  };
}

function projectEgg(egg = null) {
  if (!egg || typeof egg !== 'object') return null;
  return {
    element: boundedText(egg.element, 24),
    eggColor: boundedText(egg.eggColor ?? egg.egg_color, 24),
    state: boundedText(egg.state, 24),
    variant: boundedText(egg.variant, 24),
    hatchDurationMs: Math.max(
      0,
      finiteNumber(egg.hatchDurationMs ?? egg.hatch_duration_ms, 0)
    ),
    readyAtMs: finiteNumber(egg.readyAtMs ?? egg.ready_at_ms),
    expiresAtMs: finiteNumber(egg.expiresAtMs ?? egg.expires_at_ms),
    queuePosition: Math.max(
      0,
      finiteNumber(egg.queuePosition ?? egg.queue_position, 0)
    ),
    imageUrl: safeImageUrl(egg.imageUrl ?? egg.image_url)
  };
}

function projectGift(gift = null) {
  if (!gift || typeof gift !== 'object') return null;
  return {
    giftName: boundedText(gift.giftName ?? gift.gift_name, 96),
    element: boundedText(gift.element, 24),
    effect: boundedText(gift.effect, 24),
    imageUrl: safeImageUrl(gift.imageUrl ?? gift.image_url)
  };
}

function projectBattleSkill(skill = null) {
  if (!skill || typeof skill !== 'object') return null;
  const choice = ['A', 'B', 'C'].includes(skill.choice) ? skill.choice : null;
  const icon = boundedText(skill.icon, 16);
  const nameKey = boundedText(skill.nameKey, 96);
  const shortTextKey = boundedText(skill.shortTextKey ?? skill.effectKey, 96);
  if (!choice || !icon || !nameKey || !shortTextKey) return null;
  const projected = {
    choice,
    icon,
    name: boundedText(skill.name, 96) || 'Skill',
    nameKey,
    shortText: boundedText(skill.shortText, 240),
    shortTextKey,
    available: skill.available !== false
  };
  if (choice === 'C') {
    projected.chargeRequired = Math.max(1, finiteNumber(skill.chargeRequired, 100));
    const readyAtMs = finiteNumber(skill.readyAtMs);
    if (readyAtMs !== null) projected.readyAtMs = Math.max(0, readyAtMs);
  }
  return projected;
}

function projectEvolutionSkill(skill = null) {
  const projected = projectBattleSkill(
    skill && typeof skill === 'object'
      ? { ...skill, available: true }
      : null
  );
  if (!projected) return null;
  return {
    choice: projected.choice,
    icon: projected.icon,
    name: projected.name,
    nameKey: projected.nameKey,
    shortText: projected.shortText,
    shortTextKey: projected.shortTextKey,
    evolutionStage: Math.max(
      1,
      Math.min(3, finiteNumber(skill.evolutionStage, 1))
    ),
    ...(projected.choice === 'C'
      ? { chargeRequired: projected.chargeRequired }
      : {})
  };
}

function projectBattleFighter(fighter = null) {
  if (!fighter || typeof fighter !== 'object') return null;
  const imageUrl = safeImageUrl(fighter.imageUrl ?? fighter.image_url);
  const projected = {
    slot: Math.max(0, finiteNumber(fighter.slot, 0)),
    locked: Boolean(fighter.locked)
  };
  if (!imageUrl) return projected;
  const skills = Array.isArray(fighter.skills)
    ? fighter.skills.map(projectBattleSkill).filter(Boolean)
    : [];
  return {
    ...projected,
    name: boundedText(fighter.name, 80) || 'Monster',
    element: boundedText(fighter.element, 24),
    templateId: boundedText(fighter.templateId ?? fighter.template_id, 48),
    evolutionStage: Math.max(
      1,
      Math.min(3, finiteNumber(fighter.evolutionStage ?? fighter.evolution_stage, 1))
    ),
    imageUrl,
    level: Math.max(1, Math.min(20, finiteNumber(fighter.level, 1))),
    hp: Math.max(0, finiteNumber(fighter.hp, 0)),
    maxHp: Math.max(1, finiteNumber(fighter.maxHp, 1)),
    shield: Math.max(0, finiteNumber(fighter.shield, 0)),
    charge: Math.max(0, Math.min(100, finiteNumber(fighter.charge, 0))),
    ...(skills.length ? { skills } : {})
  };
}

function projectBattleChargeWindow(chargeWindow = null) {
  if (!chargeWindow || typeof chargeWindow !== 'object') return null;
  const openedAtMs = finiteNumber(chargeWindow.openedAtMs);
  const deadlineMs = finiteNumber(chargeWindow.deadlineMs);
  const passivePerSecond = finiteNumber(chargeWindow.passivePerSecond);
  if (
    openedAtMs === null ||
    deadlineMs === null ||
    passivePerSecond === null ||
    deadlineMs < openedAtMs ||
    passivePerSecond < 0
  ) {
    return null;
  }
  return {
    openedAtMs: Math.max(0, openedAtMs),
    deadlineMs: Math.max(0, deadlineMs),
    passivePerSecond
  };
}

function projectBattleChoices(choices = null) {
  if (!Array.isArray(choices) || choices.length !== 2) return [];
  const projected = choices.map(entry => {
    const slot = finiteNumber(entry?.slot);
    if (![1, 2].includes(slot) || !['A', 'B', 'C'].includes(entry?.choice)) {
      return null;
    }
    return {
      slot,
      choice: entry.choice,
      source: entry?.source === 'timeout' ? 'timeout' : 'viewer'
    };
  });
  if (projected.some(entry => !entry)) return [];
  if (new Set(projected.map(entry => entry.slot)).size !== 2) return [];
  return projected.sort((left, right) => left.slot - right.slot);
}

function projectWait(wait = null) {
  if (!wait || typeof wait !== 'object') return null;
  return {
    slot: Math.max(1, finiteNumber(wait.slot, 1)),
    state: boundedText(wait.state, 24),
    readyAtMs: finiteNumber(wait.readyAtMs ?? wait.ready_at_ms),
    remainingMs: Math.max(
      0,
      finiteNumber(wait.remainingMs ?? wait.remaining_ms, 0)
    ),
    queuePosition: Math.max(
      0,
      finiteNumber(wait.queuePosition ?? wait.queue_position, 0)
    )
  };
}

function projectMastery(mastery = null) {
  if (!mastery || typeof mastery !== 'object') return null;
  return {
    templateId: boundedText(mastery.templateId ?? mastery.template_id, 48),
    points: Math.max(0, finiteNumber(mastery.points, 0)),
    unlocks: Array.isArray(mastery.unlocks)
      ? mastery.unlocks.map(value => boundedText(value, 64)).filter(Boolean)
      : []
  };
}

function projectEssence(essence = null) {
  if (!essence || typeof essence !== 'object') return null;
  return {
    element: boundedText(essence.element, 24),
    amount: Math.max(0, finiteNumber(essence.amount, 0)),
    spent: Math.max(0, finiteNumber(essence.spent, 0)),
    unlocks: Array.isArray(essence.unlocks)
      ? essence.unlocks.map(value => boundedText(value, 64)).filter(Boolean)
      : []
  };
}

function projectCard(card = null) {
  if (!card || typeof card !== 'object') return null;
  const type = boundedText(card.type, 32);
  if (type === 'egg_wait') {
    return {
      type,
      size: 'compact',
      placement: 'upper-third',
      ...projectWait(card)
    };
  }
  if (type === 'monster') {
    return {
      type,
      size: 'large',
      placement: 'upper',
      monster: projectMonster(card.monster),
      mastery: projectMastery(card.mastery),
      essence: projectEssence(card.essence)
    };
  }
  return null;
}

function projectChatResult(result = {}) {
  const wait = projectWait(result.wait);
  const monsters = Array.isArray(result.monsters)
    ? result.monsters.map(projectMonster).filter(Boolean)
    : [];
  const eggs = Array.isArray(result.eggs)
    ? result.eggs.map(projectEgg).filter(Boolean)
    : [];
  const page = result.page && typeof result.page === 'object'
    ? {
      page: Math.max(1, finiteNumber(result.page.page, 1)),
      pageSize: Math.max(1, finiteNumber(result.page.pageSize, 6)),
      total: Math.max(0, finiteNumber(result.page.total, monsters.length)),
      totalPages: Math.max(1, finiteNumber(result.page.totalPages, 1))
    }
    : null;
  const rotation = result.rotation && typeof result.rotation === 'object'
    ? {
      cursor: Math.max(0, finiteNumber(result.rotation.cursor, 0)),
      nextCursor: Math.max(0, finiteNumber(result.rotation.nextCursor, 0))
    }
    : null;
  const arena = result.arena && typeof result.arena === 'object'
    ? {
      rating: Math.max(0, finiteNumber(result.arena.rating, 900)),
      battlesRated: Math.max(0, finiteNumber(result.arena.battlesRated, 0)),
      tier: boundedText(result.arena.tier, 32) || 'Bronze'
    }
    : null;
  const collector = result.collector && typeof result.collector === 'object'
    ? {
      points: Math.max(0, finiteNumber(result.collector.points, 0)),
      rank: boundedText(result.collector.rank, 32) || 'Bronze'
    }
    : null;
  return {
    success: Boolean(result.success),
    status: boundedText(result.status, 48) || 'unknown',
    messageKey: boundedText(result.messageKey, 96) || 'chatResultUnknown',
    hint: boundedText(result.hint, 160),
    ...(wait ? { wait } : {}),
    ...(result.card ? { card: projectCard(result.card) } : {}),
    ...(monsters.length ? { monsters } : {}),
    ...(eggs.length ? { eggs } : {}),
    ...(result.monster ? { monster: projectMonster(result.monster) } : {}),
    ...(result.selected ? { selected: projectMonster(result.selected) } : {}),
    ...(result.evolution?.monster
      ? {
        evolution: {
          evolutionStage: Math.max(
            1,
            finiteNumber(result.evolution.evolutionStage, 1)
          ),
          spentEssence: Math.max(
            0,
            finiteNumber(result.evolution.spentEssence, 0)
          ),
          monster: projectMonster(result.evolution.monster)
        }
      }
      : {}),
    ...(page ? { page } : {}),
    ...(rotation ? { rotation } : {}),
    ...(arena ? { arena } : {}),
    ...(collector ? { collector } : {})
  };
}

function deepProject(value, key = '') {
  if (value === null || value === undefined) return value;
  if (isPrivateKey(key)) return undefined;
  if (Array.isArray(value)) {
    return value.map(entry => deepProject(entry)).filter(entry => entry !== undefined);
  }
  if (typeof value !== 'object') {
    return typeof value === 'string' ? boundedText(value, 512) : value;
  }
  const result = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    const projected = deepProject(childValue, childKey);
    if (projected !== undefined) result[childKey] = projected;
  }
  return result;
}

class StreamMonstersPublicEventProjector {
  constructor({ store = null } = {}) {
    this.store = store;
  }

  displayName(payload = {}) {
    const candidates = [
      payload.displayName,
      payload.username,
      payload.nickname,
      payload.egg?.displayName,
      payload.egg?.display_name
    ].map(value => boundedText(value, 64)).filter(Boolean);
    const direct = candidates.find(value => !/^\d{8,}$/.test(value));
    if (direct) return direct;
    const userId = payload.userId ?? payload.user_id;
    return boundedText(this.store?.getViewerDisplayName?.(userId), 64) || 'Viewer';
  }

  owner(payload = {}) {
    const rawName = this.displayName(payload).replace(/^@+/, '');
    const displayName = rawName === 'Viewer' ? rawName : `@${rawName}`;
    const avatarUrl = safeImageUrl(
      payload.avatarRef ??
      payload.avatar_ref ??
      payload.egg?.avatarRef ??
      payload.egg?.avatar_ref
    );
    const initials = rawName
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0])
      .join('')
      .toUpperCase() || '?';
    return {
      displayName,
      avatarUrl,
      initials
    };
  }

  project(eventType, payload = {}) {
    if (eventType === 'streammonsters:egg_hatched') {
      const owner = this.owner(payload);
      return {
        displayName: owner.displayName,
        owner,
        egg: projectEgg(payload.egg),
        monster: projectMonster(payload.monster)
      };
    }
    if (eventType === 'streammonsters:monster_discovered') {
      return {
        displayName: this.displayName(payload),
        monster: projectMonster(payload.monster)
      };
    }
    if (eventType === 'streammonsters:monster_evolved') {
      const unlockedSkill = projectEvolutionSkill(payload.unlockedSkill);
      return {
        ...(payload.userId || payload.user_id || payload.username || payload.nickname
          ? { displayName: this.displayName(payload) }
          : {}),
        evolutionStage: Math.max(
          1,
          Math.min(3, finiteNumber(
            payload.evolutionStage ??
            payload.monster?.evolutionStage ??
            payload.monster?.evolution_stage,
            1
          ))
        ),
        statsBefore: projectStats(payload.statsBefore),
        statsAfter: projectStats(payload.statsAfter),
        statChanges: projectStats(payload.statChanges),
        ...(unlockedSkill ? { unlockedSkill } : {}),
        monster: projectMonster(payload.monster)
      };
    }
    if (eventType === 'streammonsters:battle_choice_opened') {
      const chargeWindow = projectBattleChargeWindow(payload.chargeWindow);
      return {
        matchId: boundedText(payload.matchId, 160),
        round: Math.max(0, finiteNumber(payload.round, 0)),
        deadlineMs: Math.max(0, finiteNumber(payload.deadlineMs, 0)),
        choices: ['A', 'B', 'C'],
        ...(chargeWindow ? { chargeWindow } : {}),
        fighters: Array.isArray(payload.fighters)
          ? payload.fighters.map(projectBattleFighter).filter(Boolean)
          : []
      };
    }
    if (eventType === 'streammonsters:battle_choice_locked') {
      const decision = payload.decision || {};
      return {
        matchId: boundedText(payload.matchId, 160),
        decision: {
          slot: Math.max(0, finiteNumber(decision.slot, 0)),
          locked: decision.locked !== false,
          source: decision.source === 'timeout' ? 'timeout' : 'viewer',
          round: Math.max(0, finiteNumber(decision.round, 0)),
          deadlineMs: Math.max(0, finiteNumber(decision.deadlineMs, 0))
        }
      };
    }
    if (eventType === 'streammonsters:battle_choices_revealed') {
      return {
        matchId: boundedText(payload.matchId, 160),
        round: Math.max(0, finiteNumber(payload.round, 0)),
        choices: projectBattleChoices(payload.choices)
      };
    }
    if (eventType === 'streammonsters:chat_result') {
      return {
        displayName: this.displayName(payload),
        command: boundedText(payload.command, 48),
        transport: boundedText(payload.transport, 24),
        result: projectChatResult(payload.result || {})
      };
    }
    const projected = deepProject(payload) || {};
    if (payload.userId || payload.user_id || payload.username || payload.nickname) {
      projected.displayName = this.displayName(payload);
    }
    if (payload.egg) projected.egg = projectEgg(payload.egg);
    if (payload.monster) projected.monster = projectMonster(payload.monster);
    if (payload.winner) projected.winner = projectMonster(payload.winner);
    if (payload.loser) projected.loser = projectMonster(payload.loser);
    if (payload.left) projected.left = projectMonster(payload.left);
    if (payload.right) projected.right = projectMonster(payload.right);
    if (payload.gift) projected.gift = projectGift(payload.gift);
    return projected;
  }

  identifiers(eventType, payload = {}) {
    const explicitEventId = boundedText(payload.eventId, 160);
    const explicitCorrelationId = boundedText(payload.correlationId, 160);
    if (explicitEventId && explicitCorrelationId) {
      return {
        eventId: explicitEventId,
        correlationId: explicitCorrelationId,
        stable: true
      };
    }
    const eggId = payload.egg?.egg_id ?? payload.egg?.eggId;
    const monsterId = payload.monster?.monster_id ?? payload.monster?.monsterId;
    const achievementKey = payload.achievement?.achievement_key ??
      payload.achievement?.achievementKey;
    const missionKey = payload.mission?.mission_key ?? payload.mission?.missionKey;
    const stage = payload.evolutionStage ?? payload.monster?.evolution_stage ??
      payload.monster?.evolutionStage;
    const userId = payload.userId ?? payload.user_id;
    const templateId = payload.templateId ?? payload.template_id ??
      payload.mastery?.templateId ?? payload.mastery?.template_id;
    const unlock = payload.unlock ?? payload.unlockKey ?? payload.unlock_key;
    const seasonId = payload.seasonId ?? payload.season_id ??
      payload.score?.seasonId ?? payload.score?.season_id;
    const resultingRank = payload.after ?? payload.rank ?? payload.score?.rank;
    let domainIdentity = null;
    let correlationIdentity = null;
    if (
      eventType === 'streammonsters:mastery_unlocked' &&
      userId && templateId && unlock
    ) {
      domainIdentity = `mastery:${userId}:${templateId}:${unlock}`;
      correlationIdentity = `mastery:${userId}:${templateId}`;
    } else if (
      eventType === 'streammonsters:season_rank_changed' &&
      seasonId && userId && resultingRank
    ) {
      domainIdentity = `season-rank:${seasonId}:${userId}:${resultingRank}`;
      correlationIdentity = `season-rank:${seasonId}:${userId}`;
    } else {
      domainIdentity = eggId
        ? `egg:${eggId}`
        : monsterId
          ? `monster:${monsterId}`
          : achievementKey
            ? `achievement:${userId}:${achievementKey}`
            : missionKey
              ? `mission:${payload.streamKey || 'offline'}:${missionKey}`
              : null;
    }
    if (!domainIdentity) {
      return {
        eventId: explicitEventId,
        correlationId: explicitCorrelationId,
        stable: false
      };
    }
    const opaque = value => createHash('sha256')
      .update(String(value))
      .digest('hex')
      .slice(0, 32);
    return {
      eventId: explicitEventId || `sm-${opaque(`${eventType}:${domainIdentity}:${stage || ''}`)}`,
      correlationId: explicitCorrelationId ||
        `sm-${opaque(correlationIdentity || domainIdentity)}`,
      stable: true
    };
  }

  isCritical(eventType) {
    return CRITICAL_EVENT_TYPES.has(eventType);
  }
}

module.exports = StreamMonstersPublicEventProjector;
module.exports.CRITICAL_EVENT_TYPES = CRITICAL_EVENT_TYPES;
module.exports.projectMonster = projectMonster;
module.exports.projectEgg = projectEgg;
module.exports.projectChatResult = projectChatResult;
module.exports.projectBattleSkill = projectBattleSkill;
module.exports.projectEvolutionSkill = projectEvolutionSkill;
module.exports.projectBattleFighter = projectBattleFighter;
module.exports.projectBattleChargeWindow = projectBattleChargeWindow;
module.exports.projectBattleChoices = projectBattleChoices;
