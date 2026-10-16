'use strict';

// AP1 gate. Red until app/sidekick-host/adapters/music-bot-adapter.js exists
// and createMusicBotAdapter({ transport }) passes the same contract as the fake.
const { createFakeMusicBot } = require('../sidekick-host/testing/fake-music-bot');
const { defineMusicAdapterContract } = require('../sidekick-host/testing/music-adapter-contract');

let createMusicBotAdapter = null;
try {
  ({ createMusicBotAdapter } = require('../sidekick-host/adapters/music-bot-adapter'));
} catch (error) {
  createMusicBotAdapter = null;
}

function missingBot() {
  return {
    events: [],
    playCalls: () => 0,
    resolveCalls: () => 0,
    queueLength: () => 0,
    hold() {},
    setLocked() {},
    setMpvAvailable() {}
  };
}

function missingAdapter() {
  const missing = async () => {
    throw new Error('AP1: app/sidekick-host/adapters/music-bot-adapter.js is missing');
  };
  return { queue: missing, enqueue: missing, play: missing, skip: missing, status: missing };
}

describe('AP1 production music adapter', () => {
  defineMusicAdapterContract((options = {}) => {
    if (!createMusicBotAdapter) {
      return { adapter: missingAdapter(), bot: missingBot() };
    }
    if (options.transport) {
      return { adapter: createMusicBotAdapter({ transport: options.transport }), bot: missingBot() };
    }
    const bot = createFakeMusicBot(options);
    return { adapter: createMusicBotAdapter({ transport: bot.request }), bot };
  });
});
