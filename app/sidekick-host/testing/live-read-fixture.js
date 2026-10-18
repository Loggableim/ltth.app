'use strict';

// Loader for the read-only live-chat fixture (lt-6qo T1).
// Reads a JSON-Lines file of raw events and hands it to a fixture stream. No key is
// read and no network is opened; the file only contains synthetic viewers.

const fs = require('fs');
const path = require('path');

const { createFixtureStream } = require('../adapters/live-read-stream');

const FIXTURE_PATH = path.join(__dirname, '..', 'demo', 'live-read-fixture.jsonl');

function readFixture(file = FIXTURE_PATH) {
  return fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter(line => line.trim())
    .map(line => JSON.parse(line));
}

function createFixtureStreamFromFile({ file = FIXTURE_PATH, batchSize = 0 } = {}) {
  return createFixtureStream({ events: readFixture(file), batchSize });
}

module.exports = { FIXTURE_PATH, readFixture, createFixtureStreamFromFile };
