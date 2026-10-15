'use strict';

// Animaze is only an adapter. HostCore never references it directly.
// The transport is injected (for example a local websocket or HTTP client to Animaze).
// This module does not open any connection by itself.
function createAnimazeAdapter({ transport } = {}) {
  if (!transport || typeof transport.send !== 'function') {
    throw new Error('animaze adapter: transport.send is required');
  }
  return Object.freeze({
    kind: 'animaze',
    async say(text) {
      await transport.send({ type: 'say', text: String(text ?? '') });
    },
    async emote(name) {
      await transport.send({ type: 'emote', name: String(name ?? '') });
    }
  });
}

module.exports = { createAnimazeAdapter };
