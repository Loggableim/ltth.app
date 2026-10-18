'use strict';

// Offline playback of the read-only Eulerstream source against the T1 fixture (lt-6qo T2).
// Reads no key, opens no network and uses no real viewer. It replays demo/live-read-fixture.jsonl
// through an in-memory source so the bridge, the adapter and the fixture can be compared offline.

const { createLiveReadAdapter } = require('./adapters/live-read-adapter');
const { createLiveReadSource } = require('./adapters/live-read-source');
const { FIXTURE_PATH, readFixture } = require('./testing/live-read-fixture');
const { createFakeLiveSource } = require('./testing/fake-live-source');

// Fixture type -> replay on the fake source. Types the read-only path does not carry are skipped.
function replay(source, event) {
  if (event.type === 'chat') {
    source.chat(typeof event.text === 'string' ? event.text : '');
    return true;
  }
  if (event.type === 'gift') {
    source.gift({ giftName: event.gift });
    return true;
  }
  if (event.type === 'follow') {
    source.follow();
    return true;
  }
  return false;
}

async function playEulerstreamFixture({ file = FIXTURE_PATH, log = null } = {}) {
  const fixture = readFixture(file);
  const source = createFakeLiveSource();
  const stream = createLiveReadSource({ source });
  const logLines = [];
  const adapter = createLiveReadAdapter({ stream, log: log || (entry => logLines.push(entry)) });

  // Attach the read-only bridge first, then replay the fixture through the source, so no
  // buffered event is lost and the adapter drains exactly what the fixture provided.
  await stream.connect();
  let replayed = 0;
  for (const event of fixture) {
    if (replay(source, event)) replayed += 1;
  }

  const { events } = await adapter.start();
  for (let batch = await adapter.poll(); batch.length > 0; batch = await adapter.poll()) {
    events.push(...batch);
  }
  await adapter.stop();

  const byType = {};
  for (const event of events) byType[event.type] = (byType[event.type] || 0) + 1;

  return {
    fixture: fixture.length,
    replayed,
    skipped: fixture.length - replayed,
    normalized: events.length,
    events,
    byType,
    sourceStats: stream.getStats(),
    logLines
  };
}

function formatSummary(result) {
  const types = Object.keys(result.byType).sort()
    .map(type => `${type}=${result.byType[type]}`)
    .join(',');
  return `[live-read-eulerstream] fixture=${result.fixture} replayed=${result.replayed} `
    + `skipped=${result.skipped} normalized=${result.normalized} types=${types}`;
}

if (require.main === module) {
  playEulerstreamFixture().then(result => {
    process.stdout.write(`${formatSummary(result)}\n`);
    process.exitCode = 0;
  }).catch(error => {
    process.stderr.write(`[live-read-eulerstream] failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { playEulerstreamFixture, formatSummary, replay };
