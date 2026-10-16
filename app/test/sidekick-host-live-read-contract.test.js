'use strict';

const { createFakeLiveStream } = require('../sidekick-host/testing/fake-live-stream');
const { createContractLiveRead } = require('../sidekick-host/testing/contract-live-read');
const { defineLiveReadContract, defineLiveReadHostBoundary, watchEnv, SENTINEL } = require('../sidekick-host/testing/live-read-contract');

function createHarness(options = {}) {
  const effects = { sound: 0, overlay: 0, action: 0 };
  let networkCalls = 0;
  let credentialReads = 0;
  const logLines = [];
  const { env, seen } = watchEnv({
    SIDEKICK_LIVE: options.live,
    OPENROUTER_API_KEY: SENTINEL
  });
  const stream = createFakeLiveStream(options.events || []);
  const adapter = createContractLiveRead({
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

describe('live read contract against the fake stream', () => {
  defineLiveReadContract(createHarness);
});

describe('host core stays closed to the live read path', () => {
  defineLiveReadHostBoundary(createHarness);
});
