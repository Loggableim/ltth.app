'use strict';

// Deterministic clock. Nothing in the schedule may call Date.now().
function createFakeClock(start = 0) {
  let nowMs = start;
  return {
    now() {
      return nowMs;
    },
    set(ms) {
      nowMs = ms;
    }
  };
}

module.exports = { createFakeClock };
