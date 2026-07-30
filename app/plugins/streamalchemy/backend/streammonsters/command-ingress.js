const { createHash } = require('crypto');

const CHAT_RESULT_MESSAGE_KEYS = Object.freeze({
  help: 'chatResultHelp',
  invalid_arguments: 'chatResultInvalidArguments',
  permission_denied: 'chatResultPermissionDenied',
  rate_limited: 'chatResultRateLimited',
  global_cooldown: 'chatResultGlobalCooldown',
  cooldown: 'chatResultCooldown',
  eggs: 'chatResultEggs',
  hatched: 'chatResultHatched',
  egg_not_ready: 'chatResultEggNotReady',
  egg_not_found: 'chatResultEggNotFound',
  inventory: 'chatResultInventory',
  invalid_slot: 'chatResultInvalidSlot',
  selected: 'chatResultSelected',
  monster: 'chatResultMonster',
  fused: 'chatResultEvolved',
  fusion_pending: 'chatResultEvolutionLocked',
  evolved: 'chatResultEvolved',
  evolution_locked: 'chatResultEvolutionLocked',
  invalid_stance: 'chatResultInvalidStance',
  no_monster: 'chatResultNoMonster',
  queued: 'chatResultQueued',
  reserved: 'chatResultReserved',
  active: 'chatResultActive',
  roster_locked: 'chatResultRosterLocked',
  match_locked: 'chatResultMatchLocked',
  match_cancelled: 'chatResultMatchCancelled',
  started: 'chatResultStarted',
  left: 'chatResultLeft',
  rank: 'chatResultRank',
  quests: 'chatResultQuests',
  command_disabled: 'chatResultCommandDisabled',
  execution_failed: 'chatResultExecutionFailed'
});

function formatCooldownHint(remainingMs) {
  const totalSeconds = Math.max(1, Math.ceil(Number(remainingMs) / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const clock = hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `⏳ ${clock}`;
}

class StreamMonstersCommandIngress {
  constructor({
    execute,
    emit = () => {},
    now = () => Date.now(),
    commandPrefix = '!',
    resolveUserId = data => data.userId || data.uniqueId || data.username,
    claimEvent = null,
    eventTtlMs = 21_600_000,
    eventMaxRows = 50_000,
    onResolved = () => {},
    onError = () => {}
  }) {
    this.execute = execute;
    this.emit = emit;
    this.now = now;
    this.commandPrefix = commandPrefix;
    this.resolveUserId = resolveUserId;
    this.claimEvent = typeof claimEvent === 'function' ? claimEvent : null;
    this.eventTtlMs = Math.max(1_000, Number(eventTtlMs) || 21_600_000);
    this.eventMaxRows = Math.max(1, Number(eventMaxRows) || 50_000);
    this.onResolved = onResolved;
    this.onError = onError;
    this.commands = new Map();
    this.cooldownConfigs = new Map();
    this.userCooldowns = new Map();
    this.globalCooldowns = new Map();
  }

  setCommands(definitions = [], commandPrefix = this.commandPrefix) {
    this.commandPrefix = commandPrefix;
    this.cooldownConfigs = new Map();
    this.commands = new Map(definitions.map(definition => [
      String(definition.name).toLowerCase(),
      {
        user: Math.max(0, Number(definition.cooldown?.user) || 0),
        global: Math.max(0, Number(definition.cooldown?.global) || 0),
        minArgs: Math.max(0, Number(definition.minArgs) || 0),
        maxArgs: definition.maxArgs === undefined ? Infinity : Math.max(0, Number(definition.maxArgs) || 0),
        syntax: definition.syntax || `${commandPrefix}${definition.name}`,
        commandName: String(definition.commandName || definition.name).toLowerCase()
      }
    ]));
    for (const command of this.commands.values()) {
      const existing = this.cooldownConfigs.get(command.commandName);
      this.cooldownConfigs.set(command.commandName, {
        user: Math.max(existing?.user || 0, command.user),
        global: Math.max(existing?.global || 0, command.global)
      });
    }
  }

  async handleFallback(data = {}) {
    const rawMessage = String(data.comment || data.message || data.text || '').trim();
    if (!rawMessage.startsWith(this.commandPrefix)) return { success: false, status: 'ignored' };

    const [rawCommand, ...args] = rawMessage.split(/\s+/);
    const commandName = rawCommand.slice(this.commandPrefix.length).toLowerCase();
    if (!this.commands.has(commandName)) return { success: false, status: 'ignored' };

    const context = {
      userId: this.resolveUserId(data),
      uniqueId: data.uniqueId || data.userId,
      username: data.nickname || data.username || data.uniqueId || data.userId,
      nickname: data.nickname || data.username || data.uniqueId || data.userId,
      rawData: data
    };
    if (!context.userId) return { success: false, status: 'ignored' };

    const command = this.commands.get(commandName);
    this.onResolved({
      alias: commandName,
      commandName: command.commandName,
      transport: 'fallback',
      userId: context.userId
    });
    if (args.length < command.minArgs || args.length > command.maxArgs) {
      const result = {
        success: false,
        status: 'invalid_arguments',
        errorCode: 'VALIDATION_ERROR',
        message: `Invalid arguments. Usage: ${command.syntax}`
      };
      this.emitResult(commandName, context, result, 'fallback');
      return result;
    }

    const eventClaim = await this.claimProviderEvent(
      command.commandName,
      context,
      'fallback'
    );
    if (eventClaim && !eventClaim.claimed) {
      return {
        success: true,
        handled: true,
        status: 'duplicate_event',
        duplicate: true,
        suppressed: true
      };
    }

    const cooldown = this.checkCooldown(command.commandName, context.userId);
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

    return this.executeCommand(
      command.commandName,
      args,
      context,
      'fallback',
      commandName,
      eventClaim
    );
  }

  async executeCommand(
    commandName,
    args,
    context,
    transport,
    responseCommandName = commandName,
    eventClaim = undefined
  ) {
    if (transport === 'gcce') {
      this.onResolved({
        alias: responseCommandName,
        commandName,
        transport,
        userId: context.userId
      });
    }
    const resolvedEventClaim = eventClaim === undefined
      ? await this.claimProviderEvent(commandName, context, transport)
      : eventClaim;
    if (resolvedEventClaim && !resolvedEventClaim.claimed) {
      return {
        success: true,
        handled: true,
        status: 'duplicate_event',
        duplicate: true,
        suppressed: true
      };
    }
    if (transport === 'gcce') {
      try {
        const result = await this.execute(context, commandName, args);
        this.emitResult(responseCommandName, context, result, transport);
        return result;
      } catch (error) {
        this.onError({
          commandName,
          alias: responseCommandName,
          transport,
          userId: context.userId,
          error
        });
        throw error;
      }
    }

    let result;
    try {
      result = await this.execute(context, commandName, args);
    } catch (error) {
      this.onError({
        commandName,
        alias: responseCommandName,
        transport,
        userId: context.userId,
        error
      });
      result = {
        success: false,
        status: 'execution_failed',
        errorCode: 'EXECUTION_FAILED',
        message: 'Command execution failed.'
      };
    }
    if (result?.success) this.recordUsage(commandName, context.userId);
    this.emitResult(responseCommandName, context, result, transport);
    return result;
  }

  async claimProviderEvent(commandName, context = {}, transport = 'fallback') {
    if (!this.claimEvent) return null;
    const rawData = context.rawData || {};
    const providerEventId = (
      rawData.eventId ??
      rawData.event_id ??
      rawData.msgId ??
      rawData.msg_id ??
      rawData.logId ??
      rawData.log_id
    );
    if (providerEventId === undefined || providerEventId === null || providerEventId === '') {
      return null;
    }
    const provider = String(rawData.provider || rawData.source || context.provider || 'tiktok');
    const eventId = `command:${createHash('sha256')
      .update(`${provider}\0${String(providerEventId)}`)
      .digest('hex')}`;
    return this.claimEvent({
      eventId,
      commandName,
      userId: context.userId || context.uniqueId || context.username,
      transport,
      createdAtMs: this.now(),
      ttlMs: this.eventTtlMs,
      maxRows: this.eventMaxRows
    });
  }

  emitResult(commandName, context, result, transport) {
    const cooldownRemainingMs = Number(result?.remainingMs);
    const isAdoptCooldown = (
      result?.status === 'cooldown' &&
      result?.cooldownKind === 'free_egg' &&
      Number.isFinite(cooldownRemainingMs) &&
      cooldownRemainingMs > 0
    );
    const publicResult = {
      ...result,
      messageKey: isAdoptCooldown
        ? 'chatResultAdoptCooldown'
        : CHAT_RESULT_MESSAGE_KEYS[result?.status] || 'chatResultUnknown',
      ...(isAdoptCooldown
        ? {
          wait: {
            state: 'adopt_cooldown',
            remainingMs: cooldownRemainingMs
          },
          hint: formatCooldownHint(cooldownRemainingMs)
        }
        : {})
    };
    this.emit('streammonsters:chat_result', {
      userId: context.userId || context.uniqueId || context.username,
      username: context.username || context.nickname || context.userId || context.uniqueId,
      command: commandName,
      transport,
      result: publicResult
    });
  }

  checkCooldown(commandName, userId) {
    const config = this.cooldownConfigs.get(commandName);
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
    const config = this.cooldownConfigs.get(commandName);
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
