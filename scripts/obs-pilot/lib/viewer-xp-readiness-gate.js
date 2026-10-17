'use strict';

function createViewerXpReadinessGate() {
  let ready = false;

  return Object.freeze({
    markReady({ appPidVerified, statsStatus, leaderboardStatus } = {}) {
      if (appPidVerified !== true) throw new Error('APP_PID_NOT_VERIFIED');
      if (statsStatus !== 200) throw new Error('VIEWER_XP_ROUTE_NOT_READY');
      if (leaderboardStatus !== 200) throw new Error('VIEWER_XP_PLUGIN_NOT_READY');
      ready = true;
    },
    ensure(action) {
      if (!ready) throw new Error('VIEWER_XP_READINESS_REQUIRED');
      if (typeof action !== 'function') throw new TypeError('ensure action must be a function');
      return action();
    }
  });
}

module.exports = { createViewerXpReadinessGate };
