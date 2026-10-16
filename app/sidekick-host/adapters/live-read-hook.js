'use strict';

// Hook for the read-only live path, attached inside the running app.
// Only active when the switch value is exactly '1'. Without it, attachLiveReadHook returns null
// and no listener and no extra code path is created.
// It receives only the switch value. It sees no credentials, no config, and no keys.
const { createEventBridgeStream } = require('./live-read-stream');

function attachLiveReadHook(adapter, switchValue) {
  if (switchValue !== '1') return null;
  if (!adapter || typeof adapter.setEmitterListener !== 'function') return null;

  const stream = createEventBridgeStream({ source: null, env: { SIDEKICK_LIVE: '1' } });
  stream.connect();
  adapter.setEmitterListener(emitter => stream.setSource(emitter));

  return {
    stream,
    dispose() {
      adapter.setEmitterListener(null);
      stream.close();
    }
  };
}

module.exports = { attachLiveReadHook };
