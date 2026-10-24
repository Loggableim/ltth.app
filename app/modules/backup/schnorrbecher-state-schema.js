'use strict';

// Shared by backup core and Schnorrbecher so public distributions need no
// dependency on the closed-beta plugin source.
const DEFAULT_STATE = Object.freeze({
  sessionId: null,
  totalCoinValue: 0,
  visualCoinCount: 0,
  recentGifts: [],
  lastProcessedEventIds: [],
  updatedAt: 0
});

module.exports = { DEFAULT_STATE };
