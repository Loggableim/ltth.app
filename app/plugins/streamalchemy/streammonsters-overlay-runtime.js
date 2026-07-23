(function attachStreamMonstersOverlayRuntime(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.StreamMonstersOverlayRuntime = api;
}(typeof globalThis === 'object' ? globalThis : this, () => {
  'use strict';

  const CRITICAL_TYPES = new Set([
    'battle_started',
    'battle_round',
    'battle_completed',
    'egg_ready',
    'hatch_started',
    'egg_hatched'
  ]);
  const COALESCED_TYPES = new Set(['hype_changed', 'chat_result']);

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
      return CRITICAL_TYPES.has(type) ? 3 : 1;
    }

    function trim() {
      while (entries.length > maxSize) {
        const noncriticalIndex = entries.findIndex(entry => entry.priority < 3);
        if (noncriticalIndex < 0) break;
        entries.splice(noncriticalIndex, 1);
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
        if (next.priority < 3 && now - next.enqueuedAt > staleAfterMs) continue;
        return next;
      }
      return null;
    }

    return {
      enqueue,
      prependSnapshot,
      shift,
      snapshot: orderedEntries,
      size: () => entries.length + (snapshotEvent ? 1 : 0)
    };
  }

  return {
    createPriorityQueue,
    isCritical: type => CRITICAL_TYPES.has(type),
    normalizeVolume
  };
}));
