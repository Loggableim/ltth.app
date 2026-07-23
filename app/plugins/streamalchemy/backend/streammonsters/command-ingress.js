class StreamMonstersCommandIngress {
  constructor({ execute, emit = () => {}, now = () => Date.now(), commandPrefix = '!' }) {
    this.execute = execute;
    this.emit = emit;
    this.now = now;
    this.commandPrefix = commandPrefix;
    this.commands = new Map();
    this.userCooldowns = new Map();
    this.globalCooldowns = new Map();
  }

  setCommands(definitions = [], commandPrefix = this.commandPrefix) {
    this.commandPrefix = commandPrefix;
    this.commands = new Map(definitions.map(definition => [
      String(definition.name).toLowerCase(),
      {
        user: Math.max(0, Number(definition.cooldown?.user) || 0),
        global: Math.max(0, Number(definition.cooldown?.global) || 0)
      }
    ]));
  }

  async handleFallback(data = {}) {
    const rawMessage = String(data.comment || data.message || data.text || '').trim();
    if (!rawMessage.startsWith(this.commandPrefix)) return { success: false, status: 'ignored' };

    const [rawCommand, ...args] = rawMessage.split(/\s+/);
    const commandName = rawCommand.slice(this.commandPrefix.length).toLowerCase();
    if (!this.commands.has(commandName)) return { success: false, status: 'ignored' };

    const context = {
      userId: data.uniqueId || data.userId || data.username,
      uniqueId: data.uniqueId || data.userId,
      username: data.nickname || data.username || data.uniqueId || data.userId,
      nickname: data.nickname || data.username || data.uniqueId || data.userId,
      rawData: data
    };
    if (!context.userId) return { success: false, status: 'ignored' };

    const cooldown = this.checkCooldown(commandName, context.userId);
    if (cooldown) {
      const result = {
        success: false,
        status: cooldown.type === 'global' ? 'global_cooldown' : 'cooldown',
        message: cooldown.type === 'global'
          ? 'The Stream Monsters chat is busy. Please try again in a moment.'
          : 'Please wait before using that command again.'
      };
      this.emitResult(commandName, context, result, 'fallback');
      return result;
    }

    this.recordUsage(commandName, context.userId);
    return this.executeCommand(commandName, args, context, 'fallback');
  }

  async executeCommand(commandName, args, context, transport) {
    const result = await this.execute(context, commandName, args);
    this.emitResult(commandName, context, result, transport);
    return result;
  }

  emitResult(commandName, context, result, transport) {
    this.emit('streammonsters:chat_result', {
      userId: context.userId || context.uniqueId || context.username,
      username: context.username || context.nickname || context.userId || context.uniqueId,
      command: commandName,
      transport,
      result
    });
  }

  checkCooldown(commandName, userId) {
    const config = this.commands.get(commandName);
    if (!config) return null;
    const current = this.now();
    const lastGlobal = this.globalCooldowns.get(commandName);
    if (config.global > 0 && lastGlobal !== undefined && current - lastGlobal < config.global) {
      return { type: 'global', remainingMs: config.global - (current - lastGlobal) };
    }
    const userKey = `${userId}:${commandName}`;
    const lastUser = this.userCooldowns.get(userKey);
    if (config.user > 0 && lastUser !== undefined && current - lastUser < config.user) {
      return { type: 'user', remainingMs: config.user - (current - lastUser) };
    }
    return null;
  }

  recordUsage(commandName, userId) {
    const config = this.commands.get(commandName);
    if (!config) return;
    const current = this.now();
    if (config.global > 0) this.globalCooldowns.set(commandName, current);
    if (config.user > 0) this.userCooldowns.set(`${userId}:${commandName}`, current);
  }

  clear() {
    this.userCooldowns.clear();
    this.globalCooldowns.clear();
  }
}

module.exports = StreamMonstersCommandIngress;
