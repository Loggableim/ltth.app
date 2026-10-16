'use strict';

// Read-only path from the existing live connection into the sidekick host.
// - Starts only when env.SIDEKICK_LIVE === '1'. Nothing else from env is read.
// - Reads through the injected stream only. No network, no credentials here.
// - Exposes start and stop only. No send, reply, or action method.
// - Strips identity (username, uniqueId, userId, nickname) from events and logs.
// - Never calls effects (sound, overlay, action) and never calls HostCore or Animaze.
const KNOWN_TYPES = new Set(['chat', 'gift', 'follow']);

function publicEvent(event) {
  const type = event && KNOWN_TYPES.has(event.type) ? event.type : 'other';
  const text = event && typeof event.text === 'string' ? event.text : '';
  return { type, text };
}

function createLiveReadAdapter({ stream, env = {}, log = () => {} } = {}) {
  let started = false;

  async function start() {
    if (env.SIDEKICK_LIVE !== '1') {
      return { started: false, events: [] };
    }
    if (!stream || typeof stream.connect !== 'function' || typeof stream.read !== 'function') {
      log({ kind: 'live-read', status: 'no-stream' });
      return { started: false, events: [] };
    }
    await stream.connect();
    const raw = await stream.read();
    const events = (Array.isArray(raw) ? raw : []).map(publicEvent);
    started = true;
    log({ kind: 'live-read', count: events.length });
    events.forEach(event => log({ kind: 'live-event', type: event.type }));
    return { started: true, events };
  }

  async function poll() {
    if (!started || !stream || typeof stream.read !== 'function') return [];
    const raw = await stream.read();
    const events = (Array.isArray(raw) ? raw : []).map(publicEvent);
    if (events.length > 0) log({ kind: 'live-read', count: events.length });
    return events;
  }

  async function stop() {
    if (!started) return;
    started = false;
    if (stream && typeof stream.close === 'function') await stream.close();
  }

  return Object.freeze({ start, poll, stop });
}

module.exports = { createLiveReadAdapter };
