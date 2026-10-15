'use strict';

const { parseChatCommand } = require('./command-allowlist');
const { applyReplyFilter } = require('./reply-filter');

// HostCore reads chat messages and decides what may happen. It knows only the planner,
// the output adapter, the reply engine and the rate limiter. It does not know Animaze.
class HostCore {
  constructor({ planner, output, replyEngine, rateLimiter, log = () => {} }) {
    this.planner = planner;
    this.output = output;
    this.replyEngine = replyEngine;
    this.rateLimiter = rateLimiter;
    this.log = log;
  }

  // Only chat-originated text goes through rate limit and filter before it is spoken or shown.
  async emitChatText(text) {
    if (!this.rateLimiter.allow()) {
      return { emitted: false, reason: 'rate-limited' };
    }
    const safe = applyReplyFilter(text);
    if (!safe) {
      return { emitted: false, reason: 'filtered' };
    }
    await this.output.say(safe);
    return { emitted: true, text: safe };
  }

  // Handles one chat message. Returns a result object for logs and tests.
  async handleChat(message) {
    const user = String(message?.user ?? 'unknown');
    const text = String(message?.text ?? '');
    const command = parseChatCommand(text);

    if (command) {
      const port = this.planner.active();
      if (!this.planner.allowedCommands().includes(command.name)) {
        this.log({ kind: 'ignored', reason: 'not-in-active-plugin', command: command.name, plugin: port.id, user });
        return { type: 'ignored', reason: 'not-in-active-plugin' };
      }
      const outcome = await port.handle(command.name, command.args);
      const emitted = await this.emitChatText(outcome.text);
      this.log({ kind: 'command', command: command.name, plugin: port.id, user, emitted: emitted.emitted, reason: emitted.reason });
      return { type: 'command', command: command.name, plugin: port.id, ...emitted };
    }

    // Free chat is not an action. It can only produce text through the reply engine.
    const reply = await this.replyEngine.reply(text);
    const emitted = await this.emitChatText(reply.text);
    this.log({ kind: 'chat-reply', source: reply.source, reason: reply.reason || null, user, emitted: emitted.emitted, outcome: emitted.reason || 'emitted' });
    return { type: 'chat-reply', source: reply.source, ...emitted };
  }
}

module.exports = { HostCore };
