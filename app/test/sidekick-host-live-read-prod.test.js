'use strict';

// Live-read gate. Red until app/sidekick-host/adapters/live-read-adapter.js exists
// and createLiveReadAdapter({ stream, env, log, network, readCredential, effects }) passes
// the same security contract as the fake stream. Host boundary cases construct a
// HostCore beside the adapter and expect the adapter not to call it.
// effects.sound, effects.overlay, and effects.action are the only action sinks.
// The adapter must not call them, must not call network or readCredential,
// and must not require a sound, overlay, plugin, or key module.
const fs = require('fs');
const path = require('path');
const { createFakeLiveStream } = require('../sidekick-host/testing/fake-live-stream');
const { defineLiveReadContract, defineLiveReadHostBoundary, watchEnv, SENTINEL } = require('../sidekick-host/testing/live-read-contract');

let createLiveReadAdapter = null;
try {
  ({ createLiveReadAdapter } = require('../sidekick-host/adapters/live-read-adapter'));
} catch (error) {
  createLiveReadAdapter = null;
}

function createHarness(options = {}) {
  if (typeof createLiveReadAdapter !== 'function') {
    throw new Error('Lesepfad: app/sidekick-host/adapters/live-read-adapter.js is missing');
  }
  const effects = { sound: 0, overlay: 0, action: 0 };
  let networkCalls = 0;
  let credentialReads = 0;
  const logLines = [];
  const { env, seen } = watchEnv({
    SIDEKICK_LIVE: options.live,
    OPENROUTER_API_KEY: SENTINEL
  });
  const stream = createFakeLiveStream(options.events || []);
  const adapter = createLiveReadAdapter({
    stream,
    env,
    host: options.host,
    animaze: options.animaze,
    log: entry => logLines.push(entry),
    network: () => {
      networkCalls += 1;
      if (options.networkThrows) throw new Error('network refused');
    },
    readCredential: () => {
      credentialReads += 1;
      return SENTINEL;
    },
    effects
  });
  return {
    adapter,
    stream,
    logLines: () => logLines,
    networkCalls: () => networkCalls,
    credentialReads: () => credentialReads,
    envSeen: () => seen.slice(),
    effects: () => ({ ...effects })
  };
}

describe('production live read adapter', () => {
  defineLiveReadContract(createHarness);
  defineLiveReadHostBoundary(createHarness);

  test('the module does not require sounds, overlays, plugins, or key sources', () => {
    if (typeof createLiveReadAdapter !== 'function') {
      throw new Error('Lesepfad: app/sidekick-host/adapters/live-read-adapter.js is missing');
    }
    const source = fs.readFileSync(
      path.join(__dirname, '../sidekick-host/adapters/live-read-adapter.js'),
      'utf8'
    );
    expect(source).not.toMatch(/require\([^)]*(?:music-bot|overlay|local-config|openrouter)/i);
  });
});
