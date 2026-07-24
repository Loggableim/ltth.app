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
    'chatResultInventory',
    'chatResultInvalidSlot',
    'chatResultSelected',
    'chatResultMonster',
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
    maxCriticalOverflow = 0
  } = {}) {
    const entries = [];
    const boundedMaxSize = Math.max(1, Number(maxSize) || 1);
    const overflowLimit = boundedMaxSize + Math.max(0, Number(maxCriticalOverflow) || 0);
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

    function removeEntry(index) {
      const [removed] = entries.splice(index, 1);
      if (removed?.groupKey === activeGroupKey && !entries.some(entry => entry.groupKey === activeGroupKey)) {
        activeGroupKey = null;
        durableTurn = true;
      }
    }

    function compactCriticalGroup(targetGroupKey) {
      const grouped = entries.filter(entry => entry.groupKey === targetGroupKey);
      if (!grouped.length) return false;
      const outsideCount = totalSize() - grouped.length;
      const available = Math.max(0, overflowLimit - outsideCount);
      if (grouped.length < 2 && available > 0) return false;
      const retained = [];
      const keyed = new Map();
      const rounds = grouped.filter(entry => entry.type === 'battle_round');
      for (const entry of grouped) {
        if (entry.type === 'battle_round') continue;
        const discriminator = entry.type === 'battle_skill_used'
          ? `${entry.type}:${entry.data?.action?.type || entry.data?.skill?.type || 'skill'}:${entry.data?.actorId || ''}`
          : (entry.type === 'stance_revealed'
            ? `${entry.type}:${entry.data?.monster?.monster_id || entry.data?.monsterId || ''}`
            : entry.type);
        if (entry.type === 'battle_started' || entry.type === 'egg_spawned') {
          if (!keyed.has(discriminator)) keyed.set(discriminator, entry);
        } else {
          keyed.set(discriminator, entry);
        }
      }
      retained.push(...keyed.values());
      if (rounds.length) {
        retained.push(rounds[0]);
        if (rounds.length > 1) retained.push(rounds.at(-1));
      }
      retained.sort((left, right) => left.sequence - right.sequence);

      let representatives = retained;
      if (retained.length > available && available > 0) {
        const terminal = retained.findLast(entry => (
          entry.type === 'battle_completed' || entry.type === 'egg_hatched'
        )) || retained.at(-1);
        representatives = retained
          .filter(entry => entry !== terminal)
          .slice(0, Math.max(0, available - 1));
        representatives.push(terminal);
      } else if (available === 0) {
        representatives = [];
      }
      if (representatives.length) {
        const summaryTarget = representatives.at(-1);
        summaryTarget.data = {
          ...summaryTarget.data,
          criticalGroupSummary: {
            count: grouped.length,
            types: [...new Set(grouped.map(entry => entry.type))],
            firstSequence: grouped[0].sequence,
            lastSequence: grouped.at(-1).sequence
          }
        };
      }
      const firstIndex = entries.findIndex(entry => entry.groupKey === targetGroupKey);
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        if (entries[index].groupKey === targetGroupKey) entries.splice(index, 1);
      }
      entries.splice(firstIndex, 0, ...representatives);
      if (!representatives.length && activeGroupKey === targetGroupKey) {
        activeGroupKey = null;
        durableTurn = true;
      }
      return representatives.length < grouped.length;
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
        if (durableIndexes.length > 1) {
          removeEntry(durableIndexes.at(-1));
          continue;
        }

        if (totalSize() <= overflowLimit) break;
        const removableCriticalGroups = [];
        for (const entry of entries) {
          if (entry.priority !== 3 || !entry.groupKey || entry.groupKey === activeGroupKey) continue;
          if (!removableCriticalGroups.includes(entry.groupKey)) removableCriticalGroups.push(entry.groupKey);
        }
        const allCriticalGroups = [...new Set(entries
          .filter(entry => entry.priority === 3 && entry.groupKey)
          .map(entry => entry.groupKey))];
        const compactableGroup = allCriticalGroups.find(group => {
          const groupedCount = entries.filter(entry => entry.groupKey === group).length;
          const available = Math.max(0, overflowLimit - (totalSize() - groupedCount));
          return groupedCount > available || groupedCount > 1;
        });
        if (compactableGroup && compactCriticalGroup(compactableGroup)) continue;
        if (allCriticalGroups.length > 1 && removableCriticalGroups.length) {
          const oldestGroup = removableCriticalGroups[0];
          for (let index = entries.length - 1; index >= 0; index -= 1) {
            if (entries[index].groupKey === oldestGroup) removeEntry(index);
          }
          continue;
        }

        const ungroupedCriticalIndex = entries.findIndex(entry => entry.priority === 3 && !entry.groupKey);
        if (ungroupedCriticalIndex >= 0) {
          removeEntry(ungroupedCriticalIndex);
          continue;
        }

        // A single critical group is deliberately indivisible. Known spawn/hatch
        // and battle groups are bounded by their event vocabularies, so this is a
        // temporary, bounded overflow in normal operation.
        break;
      }
    }

    function enqueue(type, data, enqueuedAt = Date.now()) {
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
        groupKey: groupKey(type, data)
      });
      trim();
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
    elementKey: value => enumKey(ELEMENT_KEYS, value),
    hypeMilestonePoints,
    isCritical: type => CRITICAL_TYPES.has(type),
    normalizeVolume,
    personalityKey: value => enumKey(PERSONALITY_KEYS, value),
    rectanglesOverlap,
    resolveLayoutSettings,
    safeZoneCollisions,
    variantKey: value => enumKey(VARIANT_KEYS, value)
  };
}));
