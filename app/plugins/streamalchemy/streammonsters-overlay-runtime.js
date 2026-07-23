(function attachStreamMonstersOverlayRuntime(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.StreamMonstersOverlayRuntime = api;
}(typeof globalThis === 'object' ? globalThis : this, () => {
  'use strict';

  const CRITICAL_TYPES = new Set([
    'battle_started',
    'stance_revealed',
    'battle_round',
    'battle_completed',
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

  function normalizeVolume(storedValue) {
    const numeric = Number(storedValue);
    if (!Number.isFinite(numeric)) return 0.7;
    const ratio = numeric > 1 ? numeric / 100 : numeric;
    return Math.max(0, Math.min(1, ratio));
  }

  function createPriorityQueue({ maxSize = 30, staleAfterMs = 10000 } = {}) {
    const entries = [];
    let snapshotEvent = null;
    let sequence = 0;

    function priority(type) {
      if (type === 'state_snapshot') return 4;
      if (CRITICAL_TYPES.has(type)) return 3;
      return DURABLE_TYPES.has(type) ? 2 : 1;
    }

    function trim() {
      while (entries.length > maxSize) {
        const ephemeralIndex = entries.findIndex(entry => entry.priority === 1);
        if (ephemeralIndex < 0) break;
        entries.splice(ephemeralIndex, 1);
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
        sequence: sequence += 1
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
      while (entries.length) {
        const highestPriority = Math.max(...entries.map(entry => entry.priority));
        const nextIndex = entries.findIndex(entry => entry.priority === highestPriority);
        const next = entries.splice(nextIndex, 1)[0];
        if (next.priority === 1 && now - next.enqueuedAt > staleAfterMs) continue;
        return next;
      }
      return null;
    }

    function beginSnapshot() {
      snapshotEvent = null;
      entries.length = 0;
    }

    return {
      enqueue,
      beginSnapshot,
      prependSnapshot,
      shift,
      snapshot: orderedEntries,
      size: () => entries.length + (snapshotEvent ? 1 : 0)
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

  return {
    createPriorityQueue,
    createReconnectController,
    chatMessageKey,
    isCritical: type => CRITICAL_TYPES.has(type),
    normalizeVolume
  };
}));
