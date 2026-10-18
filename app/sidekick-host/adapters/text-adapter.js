'use strict';

// Plain text output. Works without any avatar software.
function createTextAdapter({ write } = {}) {
  const sink = typeof write === 'function' ? write : () => {};
  return Object.freeze({
    kind: 'text',
    async say(text) {
      sink(String(text ?? ''));
    },
    async emote() {}
  });
}

module.exports = { createTextAdapter };
