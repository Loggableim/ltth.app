'use strict';

// Event bridge for the read-only live path.
// Subscribes to chat, gift and follow events on an injected event source and buffers them.
// The live connection emits follows as 'social' (WebcastSocialMessage); a social event is a
// follow when action is 1 or the displayType names a follow. Shares are not buffered.
// It opens no connection, uses no network, reads no credentials, and never writes to the source.
// Without env.SIDEKICK_LIVE === '1' it subscribes to nothing.
// setSource() re-attaches to a new emitter after the live connection resets it, without duplicate listeners.

function textOf(data) {
  if (typeof data?.comment === 'string') return data.comment;
  if (typeof data?.message === 'string') return data.message;
  if (typeof data?.text === 'string') return data.text;
  return '';
}

function isFollowSocial(data) {
  const actionValue = parseInt(data?.action, 10);
  const displayType = data?.displayType || data?.common?.displayText?.displayType || '';
  const followByType = typeof displayType === 'string' && displayType.length > 0 && (
    displayType === 'pm_main_follow_message_viewer_2' ||
    displayType === 'pm_mt_guidance_viewer_follow' ||
    displayType.includes('_follow') ||
    displayType.includes('follow_message') ||
    displayType.includes('follow_viewer')
  );
  return actionValue === 1 || followByType;
}

// Source event name -> bridge type. An optional filter decides whether the event is buffered.
const SPECS = [
  { source: 'chat', type: 'chat' },
  { source: 'gift', type: 'gift' },
  { source: 'follow', type: 'follow' },
  { source: 'social', type: 'follow', filter: isFollowSocial }
];

function createEventBridgeStream({ source = null, env = {}, specs = SPECS } = {}) {
  let buffer = [];
  let current = null;
  let handlers = null;
  let connected = false;

  function detach() {
    if (current && handlers && typeof current.off === 'function') {
      handlers.forEach(({ name, handler }) => current.off(name, handler));
    }
    handlers = null;
  }

  function attach() {
    detach();
    if (!connected || !current || typeof current.on !== 'function') return;
    handlers = specs.map(spec => {
      const handler = data => {
        if (spec.filter && !spec.filter(data)) return;
        buffer.push({ type: spec.type, text: textOf(data) });
      };
      current.on(spec.source, handler);
      return { name: spec.source, handler };
    });
  }

  current = source;

  return {
    async connect() {
      if (env.SIDEKICK_LIVE !== '1') return;
      connected = true;
      attach();
    },
    setSource(next) {
      detach();
      current = next || null;
      attach();
    },
    async read() {
      const out = buffer;
      buffer = [];
      return out;
    },
    async close() {
      detach();
      connected = false;
      // The buffer is kept so events received before close can still be read.
    }
  };
}

module.exports = { createEventBridgeStream, isFollowSocial, SPECS };
