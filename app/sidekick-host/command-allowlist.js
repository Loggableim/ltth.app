'use strict';

// Fixed chat command list. Chat can only ever trigger these names.
const CHAT_COMMANDS = Object.freeze(['!quiz', '!song', '!sound', '!connect4']);

const ARG_PATTERN = /^[a-z0-9_-]{1,20}$/;
const MAX_ARGS = 3;

function isChatCommand(name) {
  return CHAT_COMMANDS.includes(name);
}

// Returns { name, args } for an allowlisted command, otherwise null.
// Anything that is not an exact allowlisted first token is ignored.
function parseChatCommand(text) {
  const tokens = String(text ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const name = tokens[0];
  if (!isChatCommand(name)) return null;
  const args = tokens.slice(1, 1 + MAX_ARGS).filter(arg => ARG_PATTERN.test(arg));
  return { name, args };
}

module.exports = { CHAT_COMMANDS, isChatCommand, parseChatCommand };
