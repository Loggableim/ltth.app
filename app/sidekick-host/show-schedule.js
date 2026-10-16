'use strict';

const { parseChatCommand } = require('./command-allowlist');

// Show schedule. Time comes only from the injected clock. Durations come only from config.
// replyEngine is accepted so the host can pass it through. This schedule never calls it.
function createShowSchedule({ config, now, ports, replyEngine }) {
  if (typeof now !== 'function') throw new Error('AP2: fake clock required');
  if (!config || !Array.isArray(config.plugins) || config.plugins.length < 2) {
    throw new Error('AP2: config.plugins');
  }
  void replyEngine;

  const exceptions = new Set(config.priority && config.priority.exceptions || []);
  let index = 0;
  let blockStartedAt = 0;
  let nextIdleAt = 0;
  let idleCursor = 0;
  let lastGlobal = null;
  const lastCommand = new Map();
  const lastUser = new Map();

  function pluginAt(pluginIndex) {
    return config.plugins[pluginIndex];
  }

  function current() {
    return pluginAt(index);
  }

  function nextIndex(from) {
    const currentPlugin = pluginAt(from);
    for (let step = 1; step <= config.plugins.length; step++) {
      const candidateIndex = (from + step) % config.plugins.length;
      const candidate = pluginAt(candidateIndex);
      if (candidate.id !== currentPlugin.id && candidate.focus !== currentPlugin.focus) return candidateIndex;
    }
    return -1;
  }

  function assertRotation() {
    for (let i = 0; i < config.plugins.length; i++) {
      if (nextIndex(i) < 0) {
        const error = new Error('no-alternating-focus');
        error.code = 'no-alternating-focus';
        throw error;
      }
    }
  }

  function snapshot(extra) {
    return {
      pluginId: current().id,
      focus: current().focus,
      ...extra
    };
  }

  function touchChat(at) {
    nextIdleAt = at + config.idleMs;
  }

  function start() {
    assertRotation();
    const at = now();
    blockStartedAt = at;
    touchChat(at);
    return snapshot({ blockEndsAt: at + config.blockMs });
  }

  function tick() {
    const at = now();
    let switched = false;
    while (at >= blockStartedAt + config.blockMs) {
      index = nextIndex(index);
      blockStartedAt += config.blockMs;
      switched = true;
    }
    let idle = null;
    if (at >= nextIdleAt) {
      const templates = config.idleTemplates;
      idle = { text: templates[idleCursor % templates.length] };
      idleCursor += 1;
      nextIdleAt += config.idleMs;
    }
    return snapshot({ switched, idle });
  }

  function reject(code) {
    return snapshot({ accepted: false, code, interrupted: false, text: null });
  }

  async function command({ user, text }) {
    const at = now();
    touchChat(at);
    const parsed = parseChatCommand(text);
    if (!parsed) return reject('not-a-command');
    const name = parsed.name;
    if (lastGlobal !== null && at - lastGlobal < config.cooldowns.globalMs) return reject('cooldown-global');
    const commandMs = config.cooldowns.commands[name];
    if (lastCommand.has(name) && at - lastCommand.get(name) < commandMs) return reject('cooldown-command');
    if (lastUser.has(user) && at - lastUser.get(user) < config.cooldowns.perUserMs) return reject('cooldown-user');

    const target = ports.find(port => port.commands.includes(name));
    const targetPlugin = target && config.plugins.find(item => item.id === target.id);
    if (!targetPlugin) return reject('unknown-command');

    let interrupted = false;
    if (targetPlugin.id !== current().id) {
      if (exceptions.has(name)) return reject('not-in-active-plugin');
      if (targetPlugin.focus === current().focus) return reject('same-focus');
      index = config.plugins.findIndex(item => item.id === targetPlugin.id);
      blockStartedAt = at;
      interrupted = true;
    }

    const outcome = await target.handle(name, parsed.args);
    lastGlobal = at;
    lastCommand.set(name, at);
    lastUser.set(user, at);
    return snapshot({ accepted: true, code: null, interrupted, text: outcome.text });
  }

  function chat() {
    touchChat(now());
    return snapshot({ interrupted: false });
  }

  function active() {
    return snapshot();
  }

  return Object.freeze({ start, tick, command, chat, active });
}

module.exports = { createShowSchedule };
