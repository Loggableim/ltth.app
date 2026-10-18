'use strict';

// Read-only interface from a live chat source into the sidekick host (lt-6qo T1).
//
// Contract:
// - Consumes only an injected stream ({ connect, read, close }). No network call, no
//   credential read and no config lookup happen in this module.
// - Exposes start(), poll() and stop() only. There is no send, reply, post or
//   moderation method, so chat can never trigger an outbound action from here.
// - Normalizes raw events to { type, text }. Known types are 'chat', 'gift' and
//   'follow'; every other type becomes { type: 'other', text: '' }.
// - Strips identity (username, uniqueId, userId, nickname). Names never appear in
//   the normalized events, so they can not leak into logs or effects.

const KNOWN_TYPES = Object.freeze(['chat', 'gift', 'follow']);
const KNOWN = new Set(KNOWN_TYPES);

function publicEvent(event) {
  const type = KNOWN.has(event?.type) ? event.type : 'other';
  const text = KNOWN.has(type) && typeof event?.text === 'string' ? event.text : '';
  return { type, text };
}

function normalize(raw) {
  return (Array.isArray(raw) ? raw : []).map(publicEvent);
}

function createLiveReadAdapter({ stream, log = () => {} } = {}) {
  let started = false;
  const buffered = [];

  const can = name => Boolean(stream && typeof stream[name] === 'function');

  async function start() {
    if (!can('connect') || !can('read')) {
      log({ kind: 'live-read', status: 'no-stream' });
      return { started: false, events: [] };
    }
    if (started) return { started: true, events: buffered.splice(0) };
    await stream.connect();
    started = true;
    const events = normalize(await stream.read());
    if (events.length > 0) log({ kind: 'live-read', count: events.length });
    return { started: true, events };
  }

  async function poll() {
    if (started && can('read')) buffered.push(...normalize(await stream.read()));
    const events = buffered.splice(0);
    if (events.length > 0) log({ kind: 'live-read', count: events.length });
    return events;
  }

  async function stop() {
    if (!started) return;
    if (can('read')) buffered.push(...normalize(await stream.read()));
    started = false;
    if (can('close')) await stream.close();
  }

  return Object.freeze({ start, poll, stop });
}

module.exports = { createLiveReadAdapter, publicEvent, KNOWN_TYPES };
