'use strict';

// Event bridge for the read-only live path.
// Subscribes to chat, gift, and follow events on an injected event source and buffers them.
// It opens no connection, uses no network, reads no credentials, and never writes to the source.
// Without env.SIDEKICK_LIVE === '1' it subscribes to nothing.
const EVENT_NAMES = ['chat', 'gift', 'follow'];

function textOf(data) {
  if (typeof data?.comment === 'string') return data.comment;
  if (typeof data?.message === 'string') return data.message;
  if (typeof data?.text === 'string') return data.text;
  return '';
}

function createEventBridgeStream({ source, env = {}, eventNames = EVENT_NAMES } = {}) {
  let buffer = [];
  let handlers = null;

  function listen() {
    handlers = eventNames.map(name => {
      const handler = data => {
        buffer.push({ type: name, text: textOf(data) });
      };
      source.on(name, handler);
      return { name, handler };
    });
  }

  return {
    async connect() {
      if (env.SIDEKICK_LIVE !== '1') return;
      if (!source || typeof source.on !== 'function') throw new Error('live-read source missing');
      if (!handlers) listen();
    },
    async read() {
      const out = buffer;
      buffer = [];
      return out;
    },
    async close() {
      if (handlers && typeof source.off === 'function') {
        handlers.forEach(({ name, handler }) => source.off(name, handler));
      }
      handlers = null;
      // The buffer is kept so events received before close can still be read.
    }
  };
}

module.exports = { createEventBridgeStream, EVENT_NAMES };
