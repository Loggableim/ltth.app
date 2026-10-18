'use strict';

// Real read-only Eulerstream/TikTok source for the live-chat adapter (lt-6qo T2).
//
// Bridges an existing live event source into the { connect, read, close } stream shape that
// adapters/live-read-adapter.js consumes. The live source is injected, so this module opens
// no network and reads no key by itself: adapters/live-read-keys.js supplies the key from
// outside the repo and the caller passes the already-configured source (for example
// modules/adapters/EulerstreamAdapter.js, which emits 'chat', 'gift' and 'social').
//
// Read-only guarantees:
// - Only subscribes with on()/off(). There is no send, reply, post, write or moderation call.
// - Raw events are reduced to { type, text }: 'chat', 'gift' and 'follow'. Eulerstream emits
//   follows as 'social'; a social event is a follow when action === 1 or the display type names
//   a follow (shares use action === 2 and are dropped).
// - Identity is never copied. Follow detection reads only the numeric action and display type,
//   never username, uniqueId, userId or nickname.
//
// Reconnect:
// - When the source emits 'disconnected' and reconnect is enabled, connect() is retried on a
//   fixed delay ladder, at most `maxAttempts` times. The scheduler is injectable, so tests use a
//   fake clock and never wait. EulerstreamAdapter already reconnects internally, so the bridge
//   ladder is off by default and is meant for plain injected sources.

const DEFAULT_RECONNECT_DELAYS = Object.freeze([5000, 15000, 30000, 60000, 120000]);

// TikTok event name -> normalized type. Follows arrive as 'social' (WebcastSocialMessage).
const EVENT_SOURCES = Object.freeze(['chat', 'gift', 'social', 'follow']);

function textOf(data) {
  if (typeof data?.comment === 'string') return data.comment;
  if (typeof data?.message === 'string') return data.message;
  if (typeof data?.text === 'string') return data.text;
  return '';
}

function isFollowSocial(data) {
  const action = parseInt(data?.action, 10);
  const displayType = data?.displayType || data?.common?.displayText?.displayType || '';
  const followByType = typeof displayType === 'string' && (
    displayType === 'pm_main_follow_message_viewer_2' ||
    displayType === 'pm_mt_guidance_viewer_follow' ||
    displayType.includes('_follow') ||
    displayType.includes('follow_message') ||
    displayType.includes('follow_viewer')
  );
  return action === 1 || followByType;
}

function toRawEvent(name, data) {
  if (name === 'chat') return { type: 'chat', text: textOf(data) };
  if (name === 'gift') return { type: 'gift', text: '' };
  if (name === 'social') return isFollowSocial(data) ? { type: 'follow', text: '' } : null;
  if (name === 'follow') return { type: 'follow', text: '' };
  return null;
}

function defaultSchedule(run, delayMs) {
  const timer = setTimeout(run, delayMs);
  if (timer && typeof timer.unref === 'function') timer.unref();
  return timer;
}

function createLiveReadSource({ source = null, username = '', reconnect = {}, log = () => {} } = {}) {
  const delays = Array.isArray(reconnect.delays) && reconnect.delays.length > 0
    ? reconnect.delays.slice()
    : DEFAULT_RECONNECT_DELAYS.slice();
  const enabled = reconnect.enabled === true;
  const maxAttempts = Number.isInteger(reconnect.maxAttempts) ? reconnect.maxAttempts : delays.length;
  const schedule = typeof reconnect.schedule === 'function' ? reconnect.schedule : defaultSchedule;
  const cancel = typeof reconnect.cancel === 'function' ? reconnect.cancel : clearTimeout;

  let buffer = [];
  let handlers = null;
  let connected = false;
  let closed = false;
  let attempt = 0;
  let timer = null;
  const stats = { connects: 0, reconnects: 0, events: 0, lastError: null };

  const canAttach = Boolean(source) && typeof source.on === 'function';

  function detach() {
    if (handlers && typeof source.off === 'function') {
      handlers.forEach(({ name, handler }) => source.off(name, handler));
    } else if (handlers && typeof source.removeListener === 'function') {
      handlers.forEach(({ name, handler }) => source.removeListener(name, handler));
    }
    handlers = null;
  }

  function push(name, data) {
    const event = toRawEvent(name, data);
    if (!event) return;
    buffer.push(event);
    stats.events += 1;
  }

  function attach() {
    if (!canAttach || handlers) return;
    handlers = EVENT_SOURCES.map(name => {
      const handler = data => push(name, data);
      source.on(name, handler);
      return { name, handler };
    });
    const onDisconnected = () => {
      connected = false;
      scheduleReconnect();
    };
    const onError = error => {
      stats.lastError = (error && error.message) || 'source-error';
    };
    source.on('disconnected', onDisconnected);
    source.on('error', onError);
    handlers.push({ name: 'disconnected', handler: onDisconnected });
    handlers.push({ name: 'error', handler: onError });
  }

  function cancelTimer() {
    if (timer) cancel(timer);
    timer = null;
  }

  function scheduleReconnect() {
    if (!enabled || closed || attempt >= maxAttempts) return;
    const delay = delays[Math.min(attempt, delays.length - 1)];
    attempt += 1;
    stats.reconnects += 1;
    timer = schedule(async () => {
      timer = null;
      if (closed) return;
      try {
        await open();
        attempt = 0;
        log({ kind: 'live-read-source', status: 'reconnected' });
      } catch (error) {
        stats.lastError = (error && error.message) || 'reconnect-failed';
        scheduleReconnect();
      }
    }, delay);
  }

  async function open() {
    if (closed || connected) return;
    attach();
    if (source && typeof source.connect === 'function') await source.connect(username);
    connected = true;
    stats.connects += 1;
  }

  async function connect() {
    await open();
  }

  async function read() {
    const out = buffer;
    buffer = [];
    return out;
  }

  async function close() {
    if (closed) return;
    closed = true;
    cancelTimer();
    detach();
    connected = false;
    if (source && typeof source.disconnect === 'function') await source.disconnect();
    // The buffer is kept so a final read() can still drain what arrived before close().
  }

  return Object.freeze({
    connect,
    read,
    close,
    isConnected: () => connected,
    getStats: () => ({ ...stats, attempt })
  });
}

module.exports = {
  createLiveReadSource,
  toRawEvent,
  isFollowSocial,
  textOf,
  DEFAULT_RECONNECT_DELAYS,
  EVENT_SOURCES
};
