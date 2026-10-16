'use strict';

// Event bridge for the read-only live path.
// Subscribes to chat, gift, and follow events on an injected event source and buffers them.
// It opens no connection, uses no network, reads no credentials, and never writes to the source.
// Without env.SIDEKICK_LIVE === '1' it subscribes to nothing.
// setSource() re-attaches to a new emitter after the live connection resets it, without duplicate listeners.
const EVENT_NAMES = ['chat', 'gift', 'follow'];

function textOf(data) {
  if (typeof data?.comment === 'string') return data.comment;
  if (typeof data?.message === 'string') return data.message;
  if (typeof data?.text === 'string') return data.text;
  return '';
}

function createEventBridgeStream({ source = null, env = {}, eventNames = EVENT_NAMES } = {}) {
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
    handlers = eventNames.map(name => {
      const handler = data => {
        buffer.push({ type: name, text: textOf(data) });
      };
      current.on(name, handler);
      return { name, handler };
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

module.exports = { createEventBridgeStream, EVENT_NAMES };
