'use strict';

const SUPERFAN_HISTORY_TTL_MS = 10 * 60 * 1000;

function retainRecentSuperFanEvents(events, now = Date.now()) {
  if (!Array.isArray(events)) return [];
  return events.filter(event => event && Number.isFinite(event.timestamp) &&
    now - event.timestamp <= SUPERFAN_HISTORY_TTL_MS);
}

module.exports = { SUPERFAN_HISTORY_TTL_MS, retainRecentSuperFanEvents };
