'use strict';

const DEFAULT_ACTIVE_WINDOW_MS = 5 * 60 * 1000;
const POPULATION_WINDOW_MS = 5 * 60 * 1000;
const ACTIVE_SOURCES = new Set(['chat', 'gift']);

function normalizedText(value) {
  const text = String(value || '').trim();
  return text || null;
}

class StreamMonstersViewerActivityTracker {
  constructor({ now = () => Date.now(), activeWindowMs = DEFAULT_ACTIVE_WINDOW_MS } = {}) {
    this.now = now;
    this.activeByViewer = new Map();
    this.setActiveWindowMs(activeWindowMs);
  }

  setActiveWindowMs(value) {
    const milliseconds = Number(value);
    this.activeWindowMs = Number.isFinite(milliseconds) && milliseconds >= 1_000
      ? Math.round(milliseconds)
      : DEFAULT_ACTIVE_WINDOW_MS;
    return this.activeWindowMs;
  }

  observe({ userId, streamKey, source } = {}) {
    const viewerId = normalizedText(userId);
    const activeStreamKey = normalizedText(streamKey);
    const activitySource = normalizedText(source)?.toLowerCase();
    if (
      !viewerId ||
      !activeStreamKey ||
      activeStreamKey === 'offline' ||
      !ACTIVE_SOURCES.has(activitySource)
    ) {
      return false;
    }
    this.activeByViewer.set(viewerId, {
      streamKey: activeStreamKey,
      lastSeenAtMs: Number(this.now()) || Date.now()
    });
    return true;
  }

  isActive({ userId, streamKey, nowMs = this.now() } = {}) {
    const viewerId = normalizedText(userId);
    const activeStreamKey = normalizedText(streamKey);
    const entry = viewerId ? this.activeByViewer.get(viewerId) : null;
    if (!entry || !activeStreamKey || entry.streamKey !== activeStreamKey) return false;
    const elapsedMs = Number(nowMs) - entry.lastSeenAtMs;
    return Number.isFinite(elapsedMs) && elapsedMs >= 0 && elapsedMs <= this.activeWindowMs;
  }

  countActiveViewers({
    streamKey,
    nowMs = this.now(),
    windowMs = POPULATION_WINDOW_MS
  } = {}) {
    const activeStreamKey = normalizedText(streamKey);
    const currentMs = Number(nowMs);
    const populationWindowMs = Number(windowMs);
    if (
      !activeStreamKey ||
      !Number.isFinite(currentMs) ||
      !Number.isFinite(populationWindowMs) ||
      populationWindowMs < 1
    ) {
      return 0;
    }
    let count = 0;
    for (const entry of this.activeByViewer.values()) {
      const elapsedMs = currentMs - entry.lastSeenAtMs;
      if (
        entry.streamKey === activeStreamKey &&
        Number.isFinite(elapsedMs) &&
        elapsedMs >= 0 &&
        elapsedMs <= populationWindowMs
      ) {
        count += 1;
      }
    }
    return count;
  }

  clear(streamKey = null) {
    const activeStreamKey = normalizedText(streamKey);
    if (!activeStreamKey) {
      this.activeByViewer.clear();
      return;
    }
    for (const [viewerId, entry] of this.activeByViewer.entries()) {
      if (entry.streamKey === activeStreamKey) this.activeByViewer.delete(viewerId);
    }
  }

  destroy() {
    this.activeByViewer.clear();
  }
}

module.exports = StreamMonstersViewerActivityTracker;
module.exports.DEFAULT_ACTIVE_WINDOW_MS = DEFAULT_ACTIVE_WINDOW_MS;
module.exports.POPULATION_WINDOW_MS = POPULATION_WINDOW_MS;
