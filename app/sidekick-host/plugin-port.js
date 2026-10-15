'use strict';

const { CHAT_COMMANDS } = require('./command-allowlist');

// A plugin port exposes an id, the subset of CHAT_COMMANDS it handles and a handler.
// The handler only returns text. It never receives raw chat, only allowlisted commands.
function createPluginPort(plugin) {
  if (!plugin || typeof plugin.id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(plugin.id)) {
    throw new Error('plugin port: invalid id');
  }
  if (!Array.isArray(plugin.commands) || plugin.commands.length === 0) {
    throw new Error(`plugin port ${plugin.id}: commands required`);
  }
  for (const command of plugin.commands) {
    if (!CHAT_COMMANDS.includes(command)) {
      throw new Error(`plugin port ${plugin.id}: command ${command} is not in the fixed list`);
    }
  }
  if (typeof plugin.handle !== 'function') {
    throw new Error(`plugin port ${plugin.id}: handle required`);
  }
  return Object.freeze({
    id: plugin.id,
    commands: Object.freeze([...plugin.commands]),
    handle: async (command, args) => {
      if (!plugin.commands.includes(command)) {
        throw new Error(`plugin port ${plugin.id}: command ${command} not handled`);
      }
      const result = await plugin.handle(command, args);
      return { text: typeof result?.text === 'string' ? result.text : '' };
    }
  });
}

module.exports = { createPluginPort };
