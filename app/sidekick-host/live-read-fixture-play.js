'use strict';

// Offline playback of the read-only live-chat fixture (lt-6qo T1).
// Reads no key and opens no network. It only counts what the adapter normalized,
// so the fixture can be compared without a real live connection.

const { createLiveReadAdapter } = require('./adapters/live-read-adapter');
const { FIXTURE_PATH, readFixture, createFixtureStreamFromFile } = require('./testing/live-read-fixture');

async function playLiveReadFixture({ file = FIXTURE_PATH, batchSize = 0, log = null } = {}) {
  const stream = createFixtureStreamFromFile({ file, batchSize });
  const logLines = [];
  const adapter = createLiveReadAdapter({
    stream,
    log: log || (entry => logLines.push(entry))
  });

  const { events } = await adapter.start();
  for (let batch = await adapter.poll(); batch.length > 0; batch = await adapter.poll()) {
    events.push(...batch);
  }
  await adapter.stop();

  const byType = {};
  for (const event of events) byType[event.type] = (byType[event.type] || 0) + 1;

  return { total: readFixture(file).length, events, byType, logLines };
}

function formatSummary(result) {
  const types = Object.keys(result.byType).sort()
    .map(type => `${type}=${result.byType[type]}`)
    .join(',');
  return `[live-read-fixture] total=${result.total} normalized=${result.events.length} types=${types}`;
}

if (require.main === module) {
  playLiveReadFixture().then(result => {
    process.stdout.write(`${formatSummary(result)}\n`);
    process.exitCode = 0;
  }).catch(error => {
    process.stderr.write(`[live-read-fixture] failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { playLiveReadFixture, formatSummary };
