(function attachStreamMonstersOverlayRuntime(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.StreamMonstersOverlayRuntime = api;
}(typeof globalThis === 'object' ? globalThis : this, () => {
  'use strict';

  const CRITICAL_TYPES = new Set([
    'battle_started',
    'stance_revealed',
    'battle_skill_used',
    'battle_special_charged',
    'battle_round',
    'battle_completed',
    'battle_match_found',
    'battle_choice_opened',
    'battle_choice_locked',
    'battle_choices_revealed',
    'battle_cancelled',
    'egg_spawned',
    'egg_ready',
    'hatch_started',
    'egg_hatched',
    'monster_discovered',
    'monster_evolved',
    'monster_visual_evolved'
  ]);
  const COALESCED_TYPES = new Set(['hype_changed', 'chat_result']);
  const DURABLE_TYPES = new Set([
    'hype_milestone',
    'elemental_hour',
    'win_streak',
    'upset',
    'rivalry',
    'rank_card',
    'monster_xp_awarded',
    'monster_level_up',
    'monster_stat_prompt',
    'monster_stat_chosen',
    'monster_stat_auto_assigned',
    'arena_rating_changed',
    'quest_completed',
    'achievement_unlocked'
  ]);
  const REPLAYABLE_RECENT_TYPES = new Set([
    ...CRITICAL_TYPES,
    ...DURABLE_TYPES,
    ...COALESCED_TYPES,
    'stream_started',
    'egg_boosted',
    'gift_combo',
    'elemental_hour',
    'quest_completed',
    'stat_choice_opened',
    'arena_rating_changed',
    'win_streak',
    'upset',
    'rivalry'
  ]);
  const RECENT_TYPE_ALIASES = Object.freeze({
    season_rank_changed: 'rank_card',
    battle_skill_prompt: 'battle_choice_opened',
    battle_skill_locked: 'battle_choice_locked',
    battle_action: 'battle_skill_used',
    battle_knockout: 'battle_skill_used'
  });
  const CHAT_RESULT_KEYS = new Set([
    'chatResultHelp',
    'chatResultInvalidArguments',
    'chatResultPermissionDenied',
    'chatResultRateLimited',
    'chatResultGlobalCooldown',
    'chatResultCooldown',
    'chatResultEggs',
    'chatResultHatched',
    'chatResultEggNotReady',
    'chatResultEggNotFound',
    'chatResultInventory',
    'chatResultInvalidSlot',
    'chatResultSelected',
    'chatResultMonster',
    'chatResultEvolved',
    'chatResultEvolutionLocked',
    'chatResultInvalidStance',
    'chatResultNoMonster',
    'chatResultQueued',
    'chatResultStarted',
    'chatResultLeft',
    'chatResultRank',
    'chatResultQuests',
    'chatResultCommandDisabled',
    'chatResultExecutionFailed',
    'chatResultUnknown'
  ]);

  function statPromptKey(data = {}) {
    const matchId = String(data.matchId || '').trim();
    const slot = Number(data.slot);
    const deadlineMs = Number(data.deadlineMs);
    if (!matchId || !Number.isInteger(slot) || slot < 1 || !Number.isFinite(deadlineMs)) return null;
    return `${matchId}:${slot}:${deadlineMs}`;
  }

  function normalizeRecentEventType(type) {
    const normalized = String(type || '').trim().replace(/^streammonsters:/, '');
    return RECENT_TYPE_ALIASES[normalized] || normalized;
  }

  function normalizeBattleEventType(type) {
    const normalized = String(type || '').trim().replace(/^streammonsters:/, '');
    if (!normalized.startsWith('battle_')) return normalized;
    return RECENT_TYPE_ALIASES[normalized] || normalized;
  }

  function replayableRecentEvents(snapshot = {}, {
    afterSequence = 0,
    seenEventIds = []
  } = {}) {
    const recentEvents = Array.isArray(snapshot.recentEvents) ? snapshot.recentEvents : [];
    const battleCursors = new Map(
      (Array.isArray(snapshot?.battle?.matches) ? snapshot.battle.matches : [])
        .map(match => [
          String(match?.matchId || ''),
          Math.max(0, Number(match?.cursor) || 0)
        ])
        .filter(([matchId]) => matchId)
    );
    const seenIds = new Set(
      typeof seenEventIds?.[Symbol.iterator] === 'function' ? seenEventIds : []
    );
    const replayIds = new Set();
    const replay = [];
    const cursor = Math.max(0, Number(afterSequence) || 0);

    for (const event of recentEvents) {
      if (!event || typeof event !== 'object') continue;
      const publicSequence = Math.max(0, Number(event.sequence) || 0);
      if (publicSequence && publicSequence <= cursor) continue;
      const type = normalizeRecentEventType(event.type);
      if (!REPLAYABLE_RECENT_TYPES.has(type)) continue;
      const eventId = String(event.eventId || '').trim();
      if (eventId && (seenIds.has(eventId) || replayIds.has(eventId))) continue;
      if (eventId) replayIds.add(eventId);
      const payload = event.payload && typeof event.payload === 'object'
        ? event.payload
        : {};
      const matchId = String(
        payload.matchId ||
        payload.battleId ||
        payload.action?.matchId ||
        ''
      ).trim();
      const isBattleEvent = type.startsWith('battle_') || type === 'stance_revealed';
      if (isBattleEvent) {
        if (!matchId || !battleCursors.has(matchId)) continue;
        const actionCursor = Number(
          payload.action?.eventSequence ??
          payload.eventSequence ??
          payload.cursor
        );
        if (!Number.isFinite(actionCursor) || actionCursor <= battleCursors.get(matchId)) {
          continue;
        }
      }
      replay.push({
        type,
        data: {
          ...payload,
          ...(eventId ? { eventId } : {}),
          ...(event.correlationId ? { correlationId: event.correlationId } : {})
        },
        sequence: publicSequence
      });
    }
    return replay;
  }
  const ELEMENT_KEYS = Object.freeze({
    ember: 'elementEmber',
    tide: 'elementTide',
    grove: 'elementGrove',
    gale: 'elementGale',
    volt: 'elementVolt',
    lunar: 'elementLunar'
  });
  const VARIANT_KEYS = Object.freeze({
    standard: 'variantStandard',
    charged: 'variantCharged'
  });
  const PERSONALITY_KEYS = Object.freeze({
    brave: 'personalityBrave',
    curious: 'personalityCurious',
    mischievous: 'personalityMischievous',
    gentle: 'personalityGentle',
    dramatic: 'personalityDramatic',
    loyal: 'personalityLoyal',
    dreamy: 'personalityDreamy',
    competitive: 'personalityCompetitive',
    cheerful: 'personalityCheerful',
    clever: 'personalityClever',
    shy: 'personalityShy',
    adventurous: 'personalityAdventurous'
  });
  const API_ERROR_KEYS = Object.freeze({
    STREAM_MONSTERS_GIFT_MAPPING_INVALID: 'apiErrorGiftMapping',
    STREAM_MONSTERS_GIFT_ELEMENT_INVALID: 'apiErrorGiftElement',
    STREAM_MONSTERS_GIFT_ID_REQUIRED: 'apiErrorGiftId',
    STREAM_MONSTERS_EGG_NOT_READY: 'apiErrorEggNotReady'
  });
  const ANCHORS = Object.freeze([
    'top-left', 'top-center', 'top-right',
    'middle-left', 'center', 'middle-right',
    'bottom-left', 'bottom-center', 'bottom-right'
  ]);
  const ANCHOR_SET = new Set(ANCHORS);
  const ANCHOR_PLACEMENTS = Object.freeze({
    'top-left': Object.freeze({ align: 'flex-start', justify: 'flex-start' }),
    'top-center': Object.freeze({ align: 'flex-start', justify: 'center' }),
    'top-right': Object.freeze({ align: 'flex-start', justify: 'flex-end' }),
    'middle-left': Object.freeze({ align: 'center', justify: 'flex-start' }),
    center: Object.freeze({ align: 'center', justify: 'center' }),
    'middle-right': Object.freeze({ align: 'center', justify: 'flex-end' }),
    'bottom-left': Object.freeze({ align: 'flex-end', justify: 'flex-start' }),
    'bottom-center': Object.freeze({ align: 'flex-end', justify: 'center' }),
    'bottom-right': Object.freeze({ align: 'flex-end', justify: 'flex-end' })
  });
  const EFFECT_ORIGINS = Object.freeze({
    'top-left': Object.freeze({ x: 0.18, y: 0.18 }),
    'top-center': Object.freeze({ x: 0.5, y: 0.18 }),
    'top-right': Object.freeze({ x: 0.82, y: 0.18 }),
    'middle-left': Object.freeze({ x: 0.18, y: 0.5 }),
    center: Object.freeze({ x: 0.5, y: 0.5 }),
    'middle-right': Object.freeze({ x: 0.82, y: 0.5 }),
    'bottom-left': Object.freeze({ x: 0.18, y: 0.82 }),
    'bottom-center': Object.freeze({ x: 0.5, y: 0.82 }),
    'bottom-right': Object.freeze({ x: 0.82, y: 0.82 })
  });
  const HATCH_DURATION_KEYS = new Map([
    [30_000, 'duration30Seconds'],
    [60_000, 'duration1Minute'],
    [120_000, 'duration2Minutes'],
    [300_000, 'duration5Minutes'],
    [600_000, 'duration10Minutes'],
    [1_800_000, 'duration30Minutes']
  ]);

  function normalizeVolume(storedValue) {
    const numeric = Number(storedValue);
    if (!Number.isFinite(numeric)) return 0.7;
    const ratio = numeric > 1 ? numeric / 100 : numeric;
    return Math.max(0, Math.min(1, ratio));
  }

  function overlayHeartbeatPayload({
    layout = null,
    quality = 'auto',
    renderer = {},
    audio = {}
  } = {}) {
    const allowedLayouts = new Set(['portrait', 'landscape']);
    const allowedBackends = new Set(['webgpu', 'canvas2d', 'css', 'waiting']);
    const allowedQualities = new Set(['auto', 'high', 'medium', 'low']);
    const requestedBackend = String(
      renderer.backend ?? renderer.renderer ?? renderer.mode ?? ''
    ).trim().toLowerCase();
    const backend = allowedBackends.has(requestedBackend)
      ? requestedBackend
      : 'waiting';
    const fpsValue = Number(renderer.fps);
    const fps = Number.isFinite(fpsValue)
      ? Math.max(0, Math.min(240, Math.round(fpsValue)))
      : 0;
    const rawReason = String(renderer.fallbackReason || '').trim();
    const fallbackReason = /^[a-z0-9_-]{1,48}$/i.test(rawReason)
      ? rawReason.toLowerCase()
      : null;
    const master = audio?.channels?.master || {};
    const volume = Number(audio.masterVolume ?? master.volume);
    const masterVolume = Number.isFinite(volume)
      ? Math.max(0, Math.min(1, Math.round(volume * 100) / 100))
      : 1;
    const muted = typeof audio.muted === 'boolean'
      ? audio.muted
      : master.enabled === false;
    return {
      layout: allowedLayouts.has(layout) ? layout : null,
      renderer: {
        backend,
        quality: allowedQualities.has(quality) ? quality : 'auto',
        fps,
        deviceLost: Boolean(renderer.deviceLost) ||
          fallbackReason === 'device-lost' ||
          fallbackReason === 'device_lost',
        fallbackReason
      },
      audio: {
        muted,
        masterVolume
      }
    };
  }

  function decodeAudioCue(audioContext, dataUri, decodeBase64 = globalThis.atob) {
    const match = /^data:audio\/wav;base64,([a-z0-9+/=]+)$/i.exec(String(dataUri || ''));
    if (!match || typeof decodeBase64 !== 'function' || typeof audioContext?.decodeAudioData !== 'function') {
      throw new Error('STREAM_MONSTERS_AUDIO_CUE_INVALID');
    }
    const binary = decodeBase64(match[1]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return audioContext.decodeAudioData(bytes.buffer);
  }

  function createPriorityQueue({
    maxSize = 30,
    staleAfterMs = 10000,
    criticalGroupHoldMs = 1200
  } = {}) {
    const entries = [];
    const boundedMaxSize = Math.max(1, Number(maxSize) || 1);
    const maxFingerprintCount = Math.max(64, boundedMaxSize * 4);
    const seenFingerprints = new Map();
    let snapshotEvent = null;
    let sequence = 0;
    let activeGroupKey = null;
    let activeGroupDeadlineMs = 0;
    let durableTurn = false;

    function priority(type) {
      if (type === 'state_snapshot') return 4;
      if (CRITICAL_TYPES.has(type)) return 3;
      return DURABLE_TYPES.has(type) ? 2 : 1;
    }

    function groupKey(type, data = {}) {
      if (!CRITICAL_TYPES.has(type)) return null;
      const correlationId = String(
        data.correlationId ||
        data.correlation_id ||
        data.event?.correlationId ||
        ''
      ).trim();
      if (correlationId) return `critical:${correlationId}`;
      if (type.startsWith('egg_') || type === 'hatch_started') {
        const eggId = data.egg?.egg_id || data.egg?.id || data.eggId || data.userId;
        return eggId ? `hatch:${eggId}` : null;
      }
      if (type === 'monster_evolved' || type === 'monster_visual_evolved') {
        const monsterId = data.monster?.monster_id || data.monsterId;
        return monsterId ? `evolution:${monsterId}` : null;
      }
      const battleId = data.battleId || data.matchId ||
        data.battle?.battleId || data.battle?.battle_id;
      return battleId ? `battle:${battleId}` : null;
    }

    function totalSize() {
      return entries.length + (snapshotEvent ? 1 : 0);
    }

    function eventFingerprint(type, data = {}, targetGroupKey = null) {
      const explicitId = data.eventId || data.event_id || data.event?.id ||
        data.round?.eventId || data.round?.event_id;
      const round = typeof data.round === 'object'
        ? data.round?.number
        : (data.round ?? data.roundNumber);
      if (explicitId) return `${targetGroupKey || 'event'}:${type}:id:${explicitId}`;
      if (!targetGroupKey) return null;
      if ([
        'battle_started',
        'battle_completed',
        'egg_spawned',
        'egg_ready',
        'hatch_started',
        'egg_hatched'
      ].includes(type)) {
        return `${targetGroupKey}:${type}`;
      }
      if (type === 'battle_special_charged') {
        const monsterId = data.monsterId || data.actorId || data.monster?.monster_id;
        return monsterId ? `${targetGroupKey}:${type}:${round ?? ''}:${monsterId}` : null;
      }
      if (type === 'battle_round' && round != null) {
        return `${targetGroupKey}:${type}:${round}`;
      }
      if (type === 'stance_revealed') {
        const monsterId = data.monster?.monster_id || data.monsterId;
        return monsterId ? `${targetGroupKey}:${type}:${monsterId}` : null;
      }
      if (type === 'battle_skill_used') {
        const actorId = data.actorId || data.actor?.monster_id;
        const skill = data.skill?.id || data.skill?.vfxKey || data.skill?.vfx_key || data.action?.type;
        return actorId && round != null && skill
          ? `${targetGroupKey}:${type}:${round}:${actorId}:${skill}`
          : null;
      }
      return null;
    }

    function rememberFingerprint(fingerprint) {
      if (seenFingerprints.has(fingerprint)) return false;
      seenFingerprints.set(fingerprint, sequence + 1);
      while (seenFingerprints.size > maxFingerprintCount) {
        seenFingerprints.delete(seenFingerprints.keys().next().value);
      }
      return true;
    }

    function removeEntry(index) {
      const [removed] = entries.splice(index, 1);
      return removed;
    }

    function closesCriticalGroup(type, data = {}) {
      if (data.criticalFinal === true || data.groupFinal === true) return true;
      return [
        'egg_hatched',
        'monster_discovered',
        'monster_visual_evolved',
        'battle_completed',
        'battle_cancelled'
      ].includes(type);
    }

    function activateCriticalGroup(entry, now) {
      activeGroupKey = entry.groupKey;
      activeGroupDeadlineMs = Math.max(
        Number(now) || 0,
        Number(entry.enqueuedAt) || 0
      ) + Math.max(0, Number(criticalGroupHoldMs) || 0);
    }

    function finishCriticalGroup() {
      activeGroupKey = null;
      activeGroupDeadlineMs = 0;
      durableTurn = true;
    }

    function releaseDelay(now = Date.now()) {
      if (!activeGroupKey || activeGroupDeadlineMs <= 0) return null;
      return Math.max(0, activeGroupDeadlineMs - (Number(now) || 0));
    }

    function trim() {
      while (totalSize() > boundedMaxSize) {
        const ephemeralIndex = entries.findIndex(entry => entry.priority === 1);
        if (ephemeralIndex >= 0) {
          removeEntry(ephemeralIndex);
          continue;
        }

        const durableIndexes = entries
          .map((entry, index) => entry.priority === 2 ? index : -1)
          .filter(index => index >= 0);
        if (durableIndexes.length) {
          removeEntry(durableIndexes.at(-1));
          continue;
        }

        // Snapshots and critical gameplay sequences are lossless. They may exceed
        // the soft queue limit until the renderer drains them in order.
        break;
      }
    }

    function enqueue(type, data, enqueuedAt = Date.now()) {
      const targetGroupKey = groupKey(type, data);
      const fingerprint = eventFingerprint(type, data, targetGroupKey);
      if (
        fingerprint &&
        (
          entries.some(entry => entry.fingerprint === fingerprint) ||
          !rememberFingerprint(fingerprint)
        )
      ) return false;
      if (COALESCED_TYPES.has(type)) {
        const priorIndex = entries.findIndex(entry => entry.type === type);
        if (priorIndex >= 0) entries.splice(priorIndex, 1);
      }
      entries.push({
        type,
        data,
        enqueuedAt,
        priority: priority(type),
        sequence: sequence += 1,
        groupKey: targetGroupKey,
        fingerprint
      });
      trim();
      return true;
    }

    function prependSnapshot(data, enqueuedAt = Date.now()) {
      snapshotEvent = {
        type: 'state_snapshot',
        data,
        enqueuedAt,
        priority: priority('state_snapshot'),
        sequence: sequence += 1
      };
      trim();
    }

    function orderedEntries() {
      return [
        ...(snapshotEvent ? [snapshotEvent] : []),
        ...entries
      ];
    }

    function shift(now = Date.now()) {
      if (snapshotEvent) {
        const current = snapshotEvent;
        snapshotEvent = null;
        return current;
      }

      if (activeGroupKey) {
        const groupedIndex = entries.findIndex(entry => entry.groupKey === activeGroupKey);
        if (groupedIndex >= 0) {
          const next = entries.splice(groupedIndex, 1)[0];
          activeGroupDeadlineMs = Math.max(
            activeGroupDeadlineMs,
            (Number(next.enqueuedAt) || 0) + Math.max(0, Number(criticalGroupHoldMs) || 0)
          );
          if (closesCriticalGroup(next.type, next.data)) finishCriticalGroup();
          return next;
        }
        if ((Number(now) || 0) < activeGroupDeadlineMs) return null;
        finishCriticalGroup();
      }

      if (durableTurn) {
        const durableIndex = entries.findIndex(entry => entry.priority === 2);
        durableTurn = false;
        if (durableIndex >= 0) return entries.splice(durableIndex, 1)[0];
      }

      while (entries.length) {
        const criticalIndex = entries.findIndex(entry => entry.priority === 3);
        if (criticalIndex >= 0) {
          const next = entries.splice(criticalIndex, 1)[0];
          if (next.groupKey) {
            activateCriticalGroup(next, now);
            if (closesCriticalGroup(next.type, next.data)) finishCriticalGroup();
          }
          return next;
        }
        const durableIndex = entries.findIndex(entry => entry.priority === 2);
        if (durableIndex >= 0) return entries.splice(durableIndex, 1)[0];
        const next = entries.shift();
        if (next.priority === 1 && now - next.enqueuedAt > staleAfterMs) continue;
        return next;
      }
      return null;
    }

    function beginSnapshot() {
      snapshotEvent = null;
      entries.length = 0;
      seenFingerprints.clear();
      activeGroupKey = null;
      activeGroupDeadlineMs = 0;
      durableTurn = false;
    }

    return {
      enqueue,
      beginSnapshot,
      prependSnapshot,
      releaseDelay,
      shift,
      snapshot: orderedEntries,
      size: totalSize
    };
  }

  function createBattleReplaySynchronizer({
    loadPage,
    present,
    maxPages = 8,
    pageLimit = 50,
    maxTrackedMatches = 8,
    maxSeenEventIds = 512
  } = {}) {
    if (typeof loadPage !== 'function') {
      throw new Error('STREAM_MONSTERS_BATTLE_REPLAY_LOADER_REQUIRED');
    }
    if (typeof present !== 'function') {
      throw new Error('STREAM_MONSTERS_BATTLE_REPLAY_PRESENTER_REQUIRED');
    }
    const boundedMaxPages = Math.max(1, Math.min(20, Number(maxPages) || 8));
    const boundedPageLimit = Math.max(1, Math.min(100, Number(pageLimit) || 50));
    const boundedTrackedMatches = Math.max(1, Math.min(32, Number(maxTrackedMatches) || 8));
    const boundedSeenEventIds = Math.max(16, Math.min(2048, Number(maxSeenEventIds) || 512));
    const matches = new Map();
    const seenEventIds = new Set();
    let initialized = false;
    let syncChain = Promise.resolve();

    function snapshotMatches(snapshot = {}) {
      const battle = snapshot?.battle && typeof snapshot.battle === 'object'
        ? snapshot.battle
        : snapshot;
      return (Array.isArray(battle?.matches) ? battle.matches : [])
        .map(match => ({
          matchId: String(match?.matchId || '').trim(),
          cursor: Math.max(0, Number(match?.cursor) || 0)
        }))
        .filter(match => match.matchId);
    }

    function eventMatchId(type, data = {}) {
      const normalizedType = normalizeRecentEventType(type);
      if (!normalizedType.startsWith('battle_') &&
          !normalizedType.startsWith('monster_') &&
          normalizedType !== 'arena_rating_changed' &&
          normalizedType !== 'stat_choice_opened') {
        return '';
      }
      return String(
        data.matchId ||
        data.correlationId ||
        data.action?.matchId ||
        data.battle?.matchId ||
        data.battleId ||
        ''
      ).trim();
    }

    function eventSequence(data = {}) {
      return Math.max(0, Number(
        data.sequence ??
        data.eventSequence ??
        data.action?.eventSequence ??
        data.decision?.sequence
      ) || 0);
    }

    function rememberEventId(eventId) {
      const normalized = String(eventId || '').trim();
      if (!normalized) return;
      seenEventIds.add(normalized);
      while (seenEventIds.size > boundedSeenEventIds) {
        seenEventIds.delete(seenEventIds.values().next().value);
      }
    }

    function trimMatches() {
      while (matches.size > boundedTrackedMatches) {
        const removable = [...matches.entries()].find(([, state]) => state.terminal) ||
          matches.entries().next().value;
        if (!removable) break;
        matches.delete(removable[0]);
      }
    }

    function isTerminal(type) {
      const normalized = normalizeRecentEventType(type);
      return normalized === 'battle_completed' || normalized === 'battle_cancelled';
    }

    function hasSeen(type, data = {}) {
      const eventId = String(data.eventId || '').trim();
      if (eventId && seenEventIds.has(eventId)) return true;
      const matchId = eventMatchId(type, data);
      const sequence = eventSequence(data);
      return Boolean(
        matchId &&
        sequence &&
        matches.has(matchId) &&
        sequence <= matches.get(matchId).cursor
      );
    }

    function observe(type, data = {}) {
      const matchId = eventMatchId(type, data);
      if (!matchId) return false;
      const prior = matches.get(matchId) || {
        cursor: 0,
        terminal: false,
        replayPending: false
      };
      const sequence = eventSequence(data);
      matches.set(matchId, {
        cursor: Math.max(prior.cursor, sequence),
        terminal: prior.terminal || isTerminal(type),
        replayPending: Boolean(prior.replayPending)
      });
      rememberEventId(data.eventId);
      trimMatches();
      return true;
    }

    function normalizeReplayEvent(event = {}) {
      const type = normalizeRecentEventType(event.type);
      const payload = event.payload && typeof event.payload === 'object'
        ? event.payload
        : {};
      const sequence = Math.max(0, Number(event.sequence) || 0);
      return {
        type,
        sequence,
        data: {
          ...payload,
          ...(event.eventId ? { eventId: String(event.eventId) } : {}),
          ...(event.correlationId ? { correlationId: String(event.correlationId) } : {}),
          ...(sequence ? { sequence } : {})
        }
      };
    }

    async function replayMatch(matchId, targetCursor = null) {
      let state = matches.get(matchId) || {
        cursor: 0,
        terminal: false,
        replayPending: false
      };
      let replayed = 0;
      let caughtUp = false;
      for (let pageNumber = 0; pageNumber < boundedMaxPages; pageNumber += 1) {
        if (
          targetCursor != null &&
          state.cursor >= targetCursor &&
          !state.replayPending
        ) {
          caughtUp = true;
          break;
        }
        const requestedCursor = state.cursor;
        const page = await loadPage({
          matchId,
          cursor: requestedCursor,
          limit: boundedPageLimit
        });
        if (!page || typeof page !== 'object') break;
        const events = (Array.isArray(page.events) ? page.events : [])
          .map(normalizeReplayEvent)
          .filter(event => event.sequence > requestedCursor)
          .filter(event => eventMatchId(event.type, event.data) === matchId)
          .sort((left, right) => left.sequence - right.sequence);
        for (const event of events) {
          if (event.sequence <= state.cursor) continue;
          if (!hasSeen(event.type, event.data)) {
            try {
              await present(event);
            } catch (error) {
              matches.set(matchId, {
                ...state,
                replayPending: true
              });
              throw error;
            }
            replayed += 1;
          }
          observe(event.type, event.data);
          state = matches.get(matchId) || state;
        }
        const responseCursor = Math.max(
          state.cursor,
          requestedCursor,
          Number(page.cursor) || 0
        );
        matches.set(matchId, {
          ...state,
          cursor: responseCursor,
          replayPending: false
        });
        state = matches.get(matchId);
        const reachedSnapshot = targetCursor != null && state.cursor >= targetCursor;
        if (reachedSnapshot || page.hasMore !== true) {
          caughtUp = true;
          break;
        }
        if (state.cursor <= requestedCursor) break;
      }
      return { replayed, caughtUp };
    }

    async function syncNow(snapshot = {}) {
      const currentMatches = snapshotMatches(snapshot);
      const currentById = new Map(currentMatches.map(match => [match.matchId, match]));
      if (!initialized) {
        for (const match of currentMatches) {
          matches.set(match.matchId, {
            cursor: match.cursor,
            terminal: false,
            replayPending: false
          });
        }
        initialized = true;
        trimMatches();
        return {
          baseline: true,
          replayed: 0,
          caughtUp: true
        };
      }

      const trackedBeforeSync = new Set(matches.keys());
      for (const match of currentMatches) {
        if (!matches.has(match.matchId)) {
          matches.set(match.matchId, {
            cursor: 0,
            terminal: false,
            replayPending: false
          });
        }
      }

      let replayed = 0;
      let caughtUp = true;
      const orderedMatchIds = [
        ...trackedBeforeSync,
        ...currentMatches
          .map(match => match.matchId)
          .filter(matchId => !trackedBeforeSync.has(matchId))
      ];
      for (const matchId of orderedMatchIds) {
        const state = matches.get(matchId);
        const current = currentById.get(matchId);
        if (!current && state?.terminal) {
          matches.delete(matchId);
          continue;
        }
        const result = await replayMatch(matchId, current ? current.cursor : null);
        replayed += result.replayed;
        caughtUp = caughtUp && result.caughtUp;
        const after = matches.get(matchId);
        if (!current && after?.terminal && result.caughtUp) matches.delete(matchId);
      }
      trimMatches();
      return {
        baseline: false,
        replayed,
        caughtUp
      };
    }

    function sync(snapshot) {
      const pending = syncChain.then(() => syncNow(snapshot));
      syncChain = pending.catch(() => {});
      return pending;
    }

    return {
      hasSeen,
      observe,
      sync,
      state: () => ({
        initialized,
        matches: [...matches.entries()].map(([matchId, state]) => ({
          matchId,
          cursor: state.cursor,
          terminal: state.terminal
        })),
        seenEventIds: [...seenEventIds]
      })
    };
  }

  function createReconnectController({ queue, loadSnapshot, fallbackSnapshot = null }) {
    let generation = 0;
    let controller = null;
    let snapshotReady = false;

    async function reconnect() {
      generation += 1;
      const requestGeneration = generation;
      snapshotReady = false;
      queue.beginSnapshot();
      controller?.abort();
      controller = new AbortController();
      try {
        const payload = await loadSnapshot(controller.signal, requestGeneration);
        if (requestGeneration !== generation || controller.signal.aborted) return false;
        queue.prependSnapshot(payload, Date.now());
      } catch (error) {
        if (requestGeneration !== generation || controller.signal.aborted || error?.name === 'AbortError') {
          return false;
        }
        queue.prependSnapshot(
          fallbackSnapshot ? fallbackSnapshot(error) : {},
          Date.now()
        );
      }
      if (requestGeneration !== generation) return false;
      snapshotReady = true;
      return true;
    }

    return {
      reconnect,
      isSnapshotReady: () => snapshotReady,
      generation: () => generation
    };
  }

  function chatMessageKey(result = {}) {
    return CHAT_RESULT_KEYS.has(result.messageKey) ? result.messageKey : 'chatResultUnknown';
  }

  function localizedPayloadField(payload = {}, field, translate = () => '', defaultFallback = '') {
    const normalizedField = String(field || '').trim();
    const fallback = String(payload?.[normalizedField] ?? defaultFallback ?? '');
    if (!normalizedField) return fallback;
    const key = String(payload?.[`${normalizedField}Key`] || '').trim();
    if (!key) return fallback;
    const fieldParams = payload?.[`${normalizedField}Params`];
    const params = fieldParams && typeof fieldParams === 'object' && !Array.isArray(fieldParams)
      ? fieldParams
      : (
          payload?.params && typeof payload.params === 'object' && !Array.isArray(payload.params)
            ? payload.params
            : {}
        );
    const translated = String(translate(key, params) || '').trim();
    if (!translated || translated === key || translated.endsWith(`.${key}`)) return fallback;
    return translated;
  }

  function enumKey(mapping, value) {
    return mapping[String(value || '').trim().toLowerCase()] || 'unknown';
  }

  function apiErrorKey(error) {
    const code = String(error?.code || error?.message || error || '').trim();
    if (API_ERROR_KEYS[code]) return API_ERROR_KEYS[code];
    if (/^STREAM_MONSTERS_GIFT_/.test(code)) return 'apiErrorGiftMapping';
    if (/^STREAM_MONSTERS_EGG_/.test(code)) return 'apiErrorEggNotReady';
    if (/^STREAM_MONSTERS_(?:USER|PRESTIGE|PROGRESS|INVALID)_/.test(code)) return 'apiErrorInvalidRequest';
    return 'apiErrorUnknown';
  }

  function hypeMilestonePoints(data = {}) {
    return Math.max(
      0,
      Number(data.milestone ?? data.points ?? data.hype?.points) || 0
    );
  }

  function validScale(value, fallback = 100) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 70 && numeric <= 130 ? numeric : fallback;
  }

  function anchorPlacement(anchor) {
    return ANCHOR_PLACEMENTS[anchor] || ANCHOR_PLACEMENTS.center;
  }

  function effectPlacement(anchor, scale = 100) {
    return {
      origin: EFFECT_ORIGINS[anchor] || EFFECT_ORIGINS.center,
      scale: validScale(scale, 100) / 100
    };
  }

  function hatchDurationSpec(durationMs) {
    const milliseconds = Math.max(0, Number(durationMs) || 0);
    const presetKey = HATCH_DURATION_KEYS.get(milliseconds);
    if (presetKey) {
      return {
        key: presetKey,
        params: milliseconds < 60_000
          ? { seconds: milliseconds / 1000 }
          : { minutes: milliseconds / 60_000 }
      };
    }
    if (milliseconds < 60_000 || milliseconds % 60_000 !== 0) {
      return {
        key: 'durationSeconds',
        params: { seconds: Math.round(milliseconds / 1000) }
      };
    }
    return {
      key: 'durationMinutes',
      params: { minutes: milliseconds / 60_000 }
    };
  }

  function resolveLayoutSettings({
    width = 0,
    height = 0,
    search = '',
    config = {}
  } = {}) {
    const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
    const requestedLayout = params.get('layout');
    const automaticLayout = Number(width) >= Number(height) ? 'landscape' : 'portrait';
    const layout = ['landscape', 'portrait'].includes(requestedLayout)
      ? requestedLayout
      : automaticLayout;
    const defaultAnchor = layout === 'landscape' ? 'bottom-center' : 'center';
    const anchorKey = `${layout}Anchor`;
    const scaleKey = `${layout}Scale`;
    const configuredAnchor = ANCHOR_SET.has(config[anchorKey]) ? config[anchorKey] : defaultAnchor;
    const configuredScale = validScale(config[scaleKey], 100);
    const urlAnchor = params.get(anchorKey);
    const urlScale = params.get(scaleKey);
    return {
      layout,
      anchor: ANCHOR_SET.has(urlAnchor) ? urlAnchor : configuredAnchor,
      scale: validScale(urlScale, configuredScale),
      source: ['landscape', 'portrait'].includes(requestedLayout) ? 'override' : 'auto'
    };
  }

  function createLayoutController({
    window: windowLike,
    stage,
    battle = null,
    config = {}
  } = {}) {
    const hostWindow = windowLike || (typeof window === 'object' ? window : null);
    function apply() {
      const resolved = resolveLayoutSettings({
        width: hostWindow?.innerWidth,
        height: hostWindow?.innerHeight,
        search: hostWindow?.location?.search,
        config
      });
      if (stage?.dataset) {
        stage.dataset.layout = resolved.layout;
        stage.dataset.anchor = resolved.anchor;
        stage.dataset.scale = String(resolved.scale);
      }
      const placement = anchorPlacement(resolved.anchor);
      stage?.style?.setProperty?.('--reveal-align', placement.align);
      stage?.style?.setProperty?.('--reveal-justify', placement.justify);
      stage?.style?.setProperty?.('--reveal-scale', String(resolved.scale / 100));
      if (battle?.dataset) battle.dataset.layoutIndependent = 'true';
      return resolved;
    }
    let current = null;
    const applyAndRemember = () => {
      current = apply();
      return current;
    };
    const onResize = () => applyAndRemember();
    hostWindow?.addEventListener?.('resize', onResize);
    hostWindow?.addEventListener?.('orientationchange', onResize);
    applyAndRemember();
    return {
      apply: applyAndRemember,
      current: () => current,
      destroy() {
        hostWindow?.removeEventListener?.('resize', onResize);
        hostWindow?.removeEventListener?.('orientationchange', onResize);
      }
    };
  }

  function rectanglesOverlap(first = {}, second = {}) {
    const a = {
      x: Number(first.x) || 0,
      y: Number(first.y) || 0,
      width: Math.max(0, Number(first.width) || 0),
      height: Math.max(0, Number(first.height) || 0)
    };
    const b = {
      x: Number(second.x) || 0,
      y: Number(second.y) || 0,
      width: Math.max(0, Number(second.width) || 0),
      height: Math.max(0, Number(second.height) || 0)
    };
    return a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y;
  }

  function safeZoneCollisions({ reveal, reserved = {} } = {}) {
    return Object.entries(reserved)
      .filter(([, rectangle]) => rectanglesOverlap(reveal, rectangle))
      .map(([name]) => name);
  }

  return {
    ANCHORS,
    apiErrorKey,
    anchorPlacement,
    createBattleReplaySynchronizer,
    createLayoutController,
    createPriorityQueue,
    createReconnectController,
    chatMessageKey,
    decodeAudioCue,
    effectPlacement,
    elementKey: value => enumKey(ELEMENT_KEYS, value),
    hypeMilestonePoints,
    hatchDurationSpec,
    isCritical: type => CRITICAL_TYPES.has(type),
    localizedPayloadField,
    normalizeVolume,
    normalizeBattleEventType,
    overlayHeartbeatPayload,
    personalityKey: value => enumKey(PERSONALITY_KEYS, value),
    replayableRecentEvents,
    rectanglesOverlap,
    resolveLayoutSettings,
    safeZoneCollisions,
    statPromptKey,
    variantKey: value => enumKey(VARIANT_KEYS, value)
  };
}));
