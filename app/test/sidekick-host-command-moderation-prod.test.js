'use strict';

// AP3 gate. Red until app/sidekick-host/command-moderation.js exists and
// createCommandModeration({ config, now, ports, log, say, replyEngine }) passes
// the same cases. This file does not change HostCore.
const { defineCommandModerationContract, createModerationHarness } = require('../sidekick-host/testing/command-moderation-contract');

let createCommandModeration = null;
try {
  ({ createCommandModeration } = require('../sidekick-host/command-moderation'));
} catch (error) {
  createCommandModeration = null;
}

function createHarness(options) {
  if (typeof createCommandModeration !== 'function') {
    throw new Error('AP3: app/sidekick-host/command-moderation.js is missing');
  }
  return createModerationHarness(createCommandModeration, options);
}

describe('AP3 production command moderation', () => {
  defineCommandModerationContract(createHarness);
});
