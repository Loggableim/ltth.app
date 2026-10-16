'use strict';

// Reference oracle for the live read path. Not the production adapter.
// Only env.SIDEKICK_LIVE is read. The injected stream is the only connection.
const KNOWN_TYPES = new Set(['chat', 'gift', 'follow']);

function publicEvent(event) {
  const type = KNOWN_TYPES.has(event?.type) ? event.type : 'other';
  const text = typeof event?.text === 'string' ? event.text : '';
  return { type, text };
}

function createContractLiveRead({ stream, env = {}, log = () => {} } = {}) {
  let started = false;

  async function start() {
    if (env.SIDEKICK_LIVE !== '1') {
      return { started: false, events: [] };
    }
    if (stream && typeof stream.connect === 'function') await stream.connect();
    const raw = stream && typeof stream.read === 'function' ? await stream.read() : [];
    const events = (Array.isArray(raw) ? raw : []).map(publicEvent);
    started = true;
    log({ kind: 'live-read', count: events.length });
    events.forEach(event => log({ kind: 'live-event', type: event.type }));
    return { started: true, events };
  }

  async function stop() {
    if (!started) return;
    started = false;
    if (stream && typeof stream.close === 'function') await stream.close();
  }

  return Object.freeze({ start, stop });
}

module.exports = { createContractLiveRead };
