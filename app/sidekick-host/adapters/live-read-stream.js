'use strict';

// Event bridge for the read-only live path.
// Subscribes to chat, gift, and follow events on an injected event source
// (for example the existing live connection's event emitter) and buffers them
// for a single read. It opens no connection, uses no network, reads no credentials,
// and never writes to the source.
const EVENT_NAMES = ['chat', 'gift', 'follow'];

function createEventBridgeStream({ source, eventNames = EVENT_NAMES } = {}) {
  let buffer = [];
  let handlers = null;

  function listen() {
    handlers = eventNames.map(name => {
      const handler = data => {
        buffer.push({ type: name, text: typeof data?.comment === 'string' ? data.comment : (typeof data?.text === 'string' ? data.text : '') });
      };
      source.on(name, handler);
      return { name, handler };
    });
  }

  return {
    async connect() {
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
      buffer = [];
    }
  };
}

module.exports = { createEventBridgeStream, EVENT_NAMES };
