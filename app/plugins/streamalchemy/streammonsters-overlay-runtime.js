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
    'egg_spawned',
    'egg_ready',
    'hatch_started',
    'egg_hatched'
  ]);
  const COALESCED_TYPES = new Set(['hype_changed', 'chat_result']);
  const DURABLE_TYPES = new Set([
    'starter_revealed',
    'hype_milestone',
    'elemental_hour',
    'win_streak',
    'upset',
    'rivalry',
    'rank_card',
    'quest_completed',
    'achievement_unlocked'
  ]);
  const CHAT_RESULT_KEYS = new Set([
    'chatResultHelp',
    'chatResultInvalidArguments',
    'chatResultGlobalCooldown',
    'chatResultCooldown',
    'chatResultStarterAlreadyClaimed',
    'chatResultStarterClaimed',
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
    STREAM_MONSTERS_POOL_ALREADY_RUNNING: 'apiErrorPoolBusy',
    STREAM_MONSTERS_EGG_NOT_READY: 'apiErrorEggNotReady',
    STREAM_MONSTERS_MODEL_LICENSE_REQUIRED: 'runtimeErrorLicenseRequired',
    STREAM_MONSTERS_RUNTIME_INSTALL_IN_PROGRESS: 'runtimeErrorInstallInProgress',
    STREAM_MONSTERS_RUNTIME_ADAPTER_NOT_FOUND: 'runtimeErrorAdapterNotFound',
    STREAM_MONSTERS_RUNTIME_UNSUPPORTED_GPU: 'runtimeErrorUnsupportedGpu',
    STREAM_MONSTERS_RUNTIME_PROFILE_INVALID: 'runtimeErrorProfileInvalid',
    STREAM_MONSTERS_RUNTIME_INSTALL_REQUEST_INVALID: 'runtimeErrorInstallRequest',
    STREAM_MONSTERS_RUNTIME_INSTALL_COMMITTING: 'runtimeErrorCommitting',
    STREAM_MONSTERS_RUNTIME_DISK_SPACE_INSUFFICIENT: 'runtimeErrorDiskSpace',
    STREAM_MONSTERS_RUNTIME_CHECKSUM_MISMATCH: 'runtimeErrorChecksum',
    STREAM_MONSTERS_RUNTIME_SMOKE_TEST_FAILED: 'runtimeErrorSmokeTest',
    STREAM_MONSTERS_RUNTIME_NOT_INSTALLED: 'runtimeErrorNotInstalled',
    STREAM_MONSTERS_RUNTIME_VERIFY_ADAPTER_MISMATCH: 'runtimeErrorVerifyAdapterMismatch',
    STREAM_MONSTERS_RUNTIME_VERIFY_PROFILE_MISMATCH: 'runtimeErrorVerifyProfileMismatch',
    STREAM_MONSTERS_RUNTIME_JOB_NOT_FOUND: 'runtimeErrorJobNotFound',
    STREAM_MONSTERS_RUNTIME_ABORTED: 'runtimeErrorAborted'
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
    maxCriticalOverflow = 0,
    tombstoneAfterMs = 60_000
  } = {}) {
    const entries = [];
    const boundedMaxSize = Math.max(1, Number(maxSize) || 1);
    const overflowLimit = boundedMaxSize + Math.max(0, Number(maxCriticalOverflow) || 0);
    const maxFingerprintCount = Math.max(64, overflowLimit * 4);
    const boundedTombstoneAfterMs = Math.max(1, Number(tombstoneAfterMs) || 60_000);
    const seenFingerprints = new Map();
    const droppedGroups = new Map();
    let snapshotEvent = null;
    let sequence = 0;
    let activeGroupKey = null;
    let durableTurn = false;

    function priority(type) {
      if (type === 'state_snapshot') return 4;
      if (CRITICAL_TYPES.has(type)) return 3;
      return DURABLE_TYPES.has(type) ? 2 : 1;
    }

    function groupKey(type, data = {}) {
      if (!CRITICAL_TYPES.has(type)) return null;
      if (type.startsWith('egg_') || type === 'hatch_started') {
        const eggId = data.egg?.egg_id || data.egg?.id || data.eggId || data.userId;
        return eggId ? `hatch:${eggId}` : null;
      }
      const battleId = data.battleId || data.battle?.battleId || data.battle?.battle_id;
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

    function terminalType(type) {
      return type === 'battle_completed' || type === 'egg_hatched';
    }

    function expireDroppedGroups(at = Date.now()) {
      const currentTime = Number(at) || Date.now();
      for (const [targetGroupKey, droppedAt] of droppedGroups) {
        if (currentTime - droppedAt <= boundedTombstoneAfterMs) continue;
        droppedGroups.delete(targetGroupKey);
        for (const fingerprint of seenFingerprints.keys()) {
          if (fingerprint.startsWith(`${targetGroupKey}:`)) seenFingerprints.delete(fingerprint);
        }
      }
    }

    function rememberDroppedGroup(targetGroupKey, droppedAt) {
      droppedGroups.set(targetGroupKey, Number(droppedAt) || Date.now());
      while (droppedGroups.size > maxFingerprintCount) {
        droppedGroups.delete(droppedGroups.keys().next().value);
      }
    }

    function removeEntry(index) {
      const [removed] = entries.splice(index, 1);
      if (removed?.groupKey === activeGroupKey && !entries.some(entry => entry.groupKey === activeGroupKey)) {
        activeGroupKey = null;
        durableTurn = true;
      }
    }

    function dropCriticalGroup(targetGroupKey, droppedAt) {
      const grouped = entries.filter(entry => entry.groupKey === targetGroupKey);
      if (!grouped.length || targetGroupKey === activeGroupKey) return false;
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        if (entries[index].groupKey === targetGroupKey) entries.splice(index, 1);
      }
      rememberDroppedGroup(targetGroupKey, droppedAt);
      return true;
    }

    function trim(trimmedAt = Date.now()) {
      while (totalSize() > boundedMaxSize) {
        const ephemeralIndex = entries.findIndex(entry => entry.priority === 1);
        if (ephemeralIndex >= 0) {
          removeEntry(ephemeralIndex);
          continue;
        }

        const durableIndexes = entries
          .map((entry, index) => entry.priority === 2 ? index : -1)
          .filter(index => index >= 0);
        if (durableIndexes.length > 1) {
          removeEntry(durableIndexes.at(-1));
          continue;
        }

        if (totalSize() <= overflowLimit) break;
        if (snapshotEvent && durableIndexes.length) {
          removeEntry(durableIndexes.at(-1));
          continue;
        }
        const removableCriticalGroups = [...new Set(entries
          .filter(entry => entry.priority === 3 && entry.groupKey && entry.groupKey !== activeGroupKey)
          .map(entry => entry.groupKey))];
        if (removableCriticalGroups.length && dropCriticalGroup(removableCriticalGroups[0], trimmedAt)) {
          continue;
        }

        const ungroupedCriticalIndex = entries.findIndex(entry => entry.priority === 3 && !entry.groupKey);
        if (ungroupedCriticalIndex >= 0) {
          removeEntry(ungroupedCriticalIndex);
          continue;
        }

        // An actively displayed group cannot be truncated. It drains in order and
        // is the only allowed temporary overflow beyond the configured hard limit.
        break;
      }
    }

    function enqueue(type, data, enqueuedAt = Date.now()) {
      expireDroppedGroups(enqueuedAt);
      const targetGroupKey = groupKey(type, data);
      if (targetGroupKey && droppedGroups.has(targetGroupKey)) {
        return false;
      }
      const fingerprint = eventFingerprint(type, data, targetGroupKey);
      if (fingerprint && !rememberFingerprint(fingerprint)) return false;
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
      trim(enqueuedAt);
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
      trim(enqueuedAt);
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
          const terminal = next.type === 'battle_completed' || next.type === 'egg_hatched';
          if (terminal || !entries.some(entry => entry.groupKey === activeGroupKey)) {
            activeGroupKey = null;
            durableTurn = true;
          }
          return next;
        }
        activeGroupKey = null;
        durableTurn = true;
      }

      if (durableTurn) {
        const durableIndex = entries.findIndex(entry => entry.priority === 2);
        durableTurn = false;
        if (durableIndex >= 0) return entries.splice(durableIndex, 1)[0];
      }

      while (entries.length) {
        const criticalIndex = entries.findIndex(entry => entry.priority === 3);
        if (criticalIndex >= 0) {
          activeGroupKey = entries[criticalIndex].groupKey;
          const next = entries.splice(criticalIndex, 1)[0];
          const terminal = next.type === 'battle_completed' || next.type === 'egg_hatched';
          if (terminal || !entries.some(entry => entry.groupKey === activeGroupKey)) {
            activeGroupKey = null;
            durableTurn = true;
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
      droppedGroups.clear();
      activeGroupKey = null;
      durableTurn = false;
    }

    return {
      enqueue,
      beginSnapshot,
      prependSnapshot,
      shift,
      snapshot: orderedEntries,
      size: totalSize
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

  function enumKey(mapping, value) {
    return mapping[String(value || '').trim().toLowerCase()] || 'unknown';
  }

  function apiErrorKey(error) {
    const code = String(error?.code || error?.message || error || '').trim();
    if (API_ERROR_KEYS[code]) return API_ERROR_KEYS[code];
    if (/^STREAM_MONSTERS_RUNTIME_DOWNLOAD_HTTP_/.test(code)) return 'runtimeErrorDownloadHttp';
    if (code === 'STREAM_MONSTERS_RUNTIME_DOWNLOAD_SIZE_MISMATCH') return 'runtimeErrorDownloadSize';
    if (/^STREAM_MONSTERS_RUNTIME_(?:ARCHIVE|REDIRECT)/.test(code)) return 'runtimeErrorArchive';
    if (/^STREAM_MONSTERS_RUNTIME_(?:HEALTH|BACKEND|DEVICE|CHILD)/.test(code)) return 'runtimeErrorHealthcheck';
    if (/^STREAM_MONSTERS_RUNTIME_(?:PATH|DATA_DIR|BASE_DIR|STAGING|INSTALL_UNSAFE|EXECUTABLE)/.test(code)) {
      return 'runtimeErrorPath';
    }
    if (/^STREAM_MONSTERS_RUNTIME_MANIFEST/.test(code)) return 'runtimeErrorManifest';
    if (/^STREAM_MONSTERS_RUNTIME_(?:ADAPTER_MAPPING|ADAPTER_MISMATCH)/.test(code)) return 'runtimeErrorAdapterMapping';
    if (/^STREAM_MONSTERS_RUNTIME_/.test(code)) return 'runtimeErrorUnknown';
    if (/^STREAM_MONSTERS_(?:AI|ART|KENNEY)_/.test(code)) return 'apiErrorArtUnavailable';
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
    normalizeVolume,
    personalityKey: value => enumKey(PERSONALITY_KEYS, value),
    rectanglesOverlap,
    resolveLayoutSettings,
    safeZoneCollisions,
    variantKey: value => enumKey(VARIANT_KEYS, value)
  };
}));
