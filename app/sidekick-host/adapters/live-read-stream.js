'use strict';

// Fixture-backed stream for the read-only live path (lt-6qo T1).
//
// Implements the { connect, read, close } shape the live-read adapter consumes, but
// replays a fixed list of raw events instead of opening a connection. It reads no
// key, opens no network and never writes to its input. `batchSize` splits the replay
// into chunks so poll() can be exercised; the default returns everything at once.
//
// The events are raw (identity fields allowed). Stripping happens in the adapter, so
// tests can prove that names never survive normalization.

function createFixtureStream({ events = [], batchSize = 0 } = {}) {
  const queue = Array.isArray(events) ? events.slice() : [];
  let connected = false;
  let closed = false;
  let cursor = 0;

  const size = Number.isInteger(batchSize) && batchSize > 0 ? batchSize : queue.length;

  return {
    async connect() {
      connected = true;
      closed = false;
    },
    async read() {
      if (!connected || closed) return [];
      const end = size === 0 ? cursor : Math.min(cursor + size, queue.length);
      const batch = queue.slice(cursor, end);
      cursor = end;
      return batch;
    },
    async close() {
      closed = true;
      connected = false;
      // The queue is kept so poll() can still drain what was read before stop().
    },
    get consumed() {
      return cursor;
    },
    get pending() {
      return queue.length - cursor;
    }
  };
}

module.exports = { createFixtureStream };
