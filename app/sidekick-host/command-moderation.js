'use strict';

const { CHAT_COMMANDS } = require('./command-allowlist');
const { applyReplyFilter } = require('./reply-filter');

const ARG_PATTERN = /^[a-z0-9_-]{1,20}$/;
const MAX_ARGS = 3;

// Chat command and moderation gate.
// The clock is injected. Durations and thresholds come only from config.
// Internal maps may key by user. Log entries never include the user or the raw text.
// replyEngine is accepted so the host can pass it through. This gate never calls it.
function createCommandModeration({ config, now, ports, log = () => {}, say = async () => {}, replyEngine }) {
  if (typeof now !== 'function') throw new Error('AP3: fake clock required');
  void replyEngine;
  let lastGlobal = null;
  const lastUser = new Map();
  const repeats = new Map();
  const bursts = new Map();

  function note(entry) {
    log(entry);
  }

  function reject(code, command) {
    const entry = { kind: 'rejected', code };
    if (command) entry.command = command;
    note(entry);
    return { accepted: false, code, command: command || null, args: [], text: null };
  }

  function normalize(text) {
    return String(text ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  async function handle({ user, text }) {
    const at = now();
    const raw = String(text ?? '');
    const tokens = normalize(raw).split(' ').filter(Boolean);
    if (tokens.length === 0) return reject('empty');
    if (applyReplyFilter(raw) === null) return reject('filtered');

    const name = tokens[0];
    const known = CHAT_COMMANDS.includes(name);
    const embeddedCommand = !name.startsWith('!') && /(^|\s)![a-z0-9_]+\b/i.test(raw);
    const configuredInjection = (config.injectionPatterns || []).some(pattern => pattern.test(raw));
    if (!known && (embeddedCommand || configuredInjection)) return reject('injection');
    if (name.startsWith('!') && !known) {
      note({ kind: 'ignored', code: 'unknown-command' });
      return { accepted: false, code: 'unknown-command', command: null, args: [], text: null };
    }

    const repeatKey = `${user}\u0000${normalize(raw)}`;
    const seen = repeats.get(repeatKey) || 0;
    if (seen >= config.spam.maxRepeats) return reject('spam-repeat', known ? name : null);
    const recent = (bursts.get(user) || []).filter(stamp => at - stamp < config.spam.burstMs);
    if (recent.length >= config.spam.burstLimit) return reject('spam-burst', known ? name : null);

    if (!known) {
      repeats.set(repeatKey, seen + 1);
      recent.push(at);
      bursts.set(user, recent);
      note({ kind: 'accepted', code: 'chat' });
      return { accepted: true, code: 'chat', command: null, args: [], text: null };
    }

    const rest = tokens.slice(1);
    if (rest.length > MAX_ARGS || rest.some(arg => !ARG_PATTERN.test(arg))) return reject('bad-argument', name);
    if (lastGlobal !== null && at - lastGlobal < config.cooldowns.globalMs) return reject('cooldown-global', name);
    if (lastUser.has(user) && at - lastUser.get(user) < config.cooldowns.perUserMs) return reject('cooldown-user', name);

    const port = ports.find(item => item.commands.includes(name));
    if (!port) return reject('unknown-command', name);
    const outcome = await port.handle(name, rest);
    const safe = applyReplyFilter(outcome && outcome.text);
    if (!safe) return reject('filtered', name);

    repeats.set(repeatKey, seen + 1);
    recent.push(at);
    bursts.set(user, recent);
    lastGlobal = at;
    lastUser.set(user, at);
    await say(safe);
    note({ kind: 'accepted', code: 'command', command: name });
    return { accepted: true, code: 'command', command: name, args: rest, text: safe };
  }

  return Object.freeze({ handle });
}

module.exports = { createCommandModeration };
