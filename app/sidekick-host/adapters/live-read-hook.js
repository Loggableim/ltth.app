'use strict';

// Hook for the read-only live path, attached inside the running app.
// Only active when the switch value is exactly '1'. Without it, attachLiveReadHook returns null
// and no listener and no extra code path is created.
// It receives only the switch value and a log function. It sees no credentials, no config, and no keys.
// A reader drains the bridge every interval. It keeps counts per type only and drops the text.
// Logs carry counts only, never usernames or messages.
const { createEventBridgeStream } = require('./live-read-stream');

const TYPES = ['chat', 'gift', 'follow'];

function attachLiveReadHook(adapter, switchValue, log = () => {}, intervalMs = 5000) {
  if (switchValue !== '1') return null;
  if (!adapter || typeof adapter.setEmitterListener !== 'function') return null;

  const stream = createEventBridgeStream({ source: null, env: { SIDEKICK_LIVE: '1' } });
  stream.connect();
  adapter.setEmitterListener(emitter => stream.setSource(emitter));

  const counts = Object.fromEntries(TYPES.map(type => [type, 0]));

  async function drain() {
    const events = await stream.read();
    for (const event of events) {
      if (Object.prototype.hasOwnProperty.call(counts, event.type)) counts[event.type] += 1;
    }
    return events.length;
  }

  const timer = setInterval(() => {
    drain().then(received => {
      if (received > 0) log(`[live-read] counts ${JSON.stringify(counts)}`);
    });
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();

  return {
    stream,
    getCounts: () => ({ ...counts }),
    drain,
    dispose() {
      clearInterval(timer);
      adapter.setEmitterListener(null);
      // Detach synchronously first, then drain what is still buffered and log the final counts.
      const closing = stream.close();
      return closing.then(() => drain()).then(() => {
        log(`[live-read] final counts ${JSON.stringify(counts)}`);
      });
    }
  };
}

module.exports = { attachLiveReadHook };
