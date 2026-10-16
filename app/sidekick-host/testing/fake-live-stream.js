'use strict';

// In-memory stand-in for the existing read connection. No socket, no key.
function createFakeLiveStream(events = []) {
  const calls = { connect: 0, read: 0, close: 0 };
  return {
    calls,
    async connect() {
      calls.connect += 1;
    },
    async read() {
      calls.read += 1;
      return events.map(event => ({ ...event }));
    },
    async close() {
      calls.close += 1;
    }
  };
}

module.exports = { createFakeLiveStream };
