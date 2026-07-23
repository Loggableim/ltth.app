const GCCE = require('../plugins/gcce');
const CommandParser = require('../plugins/gcce/commandParser');
const CommandRegistry = require('../plugins/gcce/commandRegistry');

function createHarness({ checkPermission = () => true } = {}) {
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  };
  const registry = new CommandRegistry(logger);
  const parser = new CommandParser(registry, {
    checkPermission,
    getPermissionName: permission => permission
  }, logger, { commandPrefix: '/' });
  const gcce = Object.assign(Object.create(GCCE.prototype), {
    api: { log: jest.fn() },
    registry,
    parser
  });
  return { gcce, parser };
}

function context(userId) {
  return { userId, username: userId, userRole: 'all' };
}

describe('GCCE plugin command cooldown contract', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-23T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('enforces definition global and user cooldowns and removes them on unregister', async () => {
    const { gcce, parser } = createHarness();
    const handler = jest.fn(() => ({ success: true, message: 'pong' }));

    expect(gcce.registerCommandsForPlugin('cooldown-test', [{
      name: 'ping',
      permission: 'all',
      cooldown: { user: 1_000, global: 250 },
      handler
    }])).toEqual(expect.objectContaining({ registered: ['ping'], failed: [] }));
    expect(parser.cooldownManager.getCooldownConfig('ping')).toEqual({
      userCooldown: 1_000,
      globalCooldown: 250
    });

    await expect(parser.parse('/ping', context('viewer-a'))).resolves.toEqual(expect.objectContaining({ success: true }));
    await expect(parser.parse('/ping', context('viewer-b'))).resolves.toEqual(expect.objectContaining({
      success: false,
      errorCode: 'COMMAND_ON_COOLDOWN',
      commandName: 'ping',
      pluginId: 'cooldown-test',
      cooldownType: 'global'
    }));

    jest.advanceTimersByTime(251);
    await expect(parser.parse('/ping', context('viewer-a'))).resolves.toEqual(expect.objectContaining({
      success: false,
      errorCode: 'COMMAND_ON_COOLDOWN'
    }));

    jest.advanceTimersByTime(750);
    await expect(parser.parse('/ping', context('viewer-a'))).resolves.toEqual(expect.objectContaining({ success: true }));
    expect(handler).toHaveBeenCalledTimes(2);

    gcce.unregisterCommandsForPlugin('cooldown-test');
    expect(parser.cooldownManager.getCooldownConfig('ping')).toBeNull();
    expect(parser.cooldownManager.getStats()).toEqual({
      commandsWithCooldowns: 0,
      activeUserCooldowns: 0,
      activeGlobalCooldowns: 0
    });
  });

  test('keeps definitions without cooldown backward compatible and clears a replaced cooldown', async () => {
    const { gcce, parser } = createHarness();
    const handler = jest.fn(() => ({ success: true }));

    gcce.registerCommandsForPlugin('legacy-test', [{
      name: 'legacy',
      permission: 'all',
      cooldown: { user: 5_000, global: 0 },
      handler
    }]);
    gcce.registerCommandsForPlugin('legacy-test', [{
      name: 'legacy',
      permission: 'all',
      handler
    }]);

    expect(parser.cooldownManager.getCooldownConfig('legacy')).toBeNull();
    await parser.parse('/legacy', context('viewer-a'));
    await parser.parse('/legacy', context('viewer-a'));
    expect(handler).toHaveBeenCalledTimes(2);
  });

  test('unregistering bar keeps the exact other:bar user cooldown owned by another plugin', () => {
    const { gcce, parser } = createHarness();
    const handler = () => ({ success: true });
    gcce.registerCommandsForPlugin('plugin-a', [{
      name: 'bar',
      permission: 'all',
      cooldown: { user: 5_000, global: 0 },
      handler
    }]);
    gcce.registerCommandsForPlugin('plugin-b', [{
      name: 'other:bar',
      permission: 'all',
      cooldown: { user: 5_000, global: 0 },
      handler
    }]);
    parser.cooldownManager.recordUsage('bar', 'viewer-a');
    parser.cooldownManager.recordUsage('other:bar', 'viewer-a');

    gcce.unregisterCommandsForPlugin('plugin-a');

    expect(parser.cooldownManager.getCooldownConfig('bar')).toBeNull();
    expect(parser.cooldownManager.getCooldownConfig('other:bar')).toEqual({
      userCooldown: 5_000,
      globalCooldown: 0
    });
    expect(parser.cooldownManager.checkCooldown('other:bar', 'viewer-a')).toEqual(expect.objectContaining({
      onCooldown: true,
      type: 'user'
    }));
    expect(parser.cooldownManager.getStats().activeUserCooldowns).toBe(1);
  });

  test('preserves command ownership metadata when required arguments are missing', async () => {
    const { gcce, parser } = createHarness();
    gcce.registerCommandsForPlugin('owned-plugin', [{
      name: 'needsarg',
      permission: 'all',
      minArgs: 1,
      maxArgs: 1,
      handler: () => ({ success: true })
    }]);

    await expect(parser.parse('/needsarg', context('viewer-a'))).resolves.toEqual(expect.objectContaining({
      success: false,
      errorCode: 'VALIDATION_ERROR',
      commandName: 'needsarg',
      pluginId: 'owned-plugin'
    }));
  });

  test('preserves command ownership metadata on permission rejection', async () => {
    const { gcce, parser } = createHarness({ checkPermission: () => false });
    gcce.registerCommandsForPlugin('owned-plugin', [{
      name: 'secured',
      permission: 'moderator',
      handler: () => ({ success: true })
    }]);

    await expect(parser.parse('/secured', context('viewer-a'))).resolves.toEqual(expect.objectContaining({
      success: false,
      errorCode: 'PERMISSION_DENIED',
      commandName: 'secured',
      pluginId: 'owned-plugin'
    }));
  });

  test('looks up recognized command ownership before a rate-limit rejection', async () => {
    const { gcce, parser } = createHarness();
    gcce.registerCommandsForPlugin('owned-plugin', [{
      name: 'limited',
      permission: 'all',
      handler: () => ({ success: true })
    }]);
    parser.rateLimiter.tryConsume = () => ({
      allowed: false,
      reason: 'user_limit',
      retryAfter: 1
    });

    await expect(parser.parse('/limited', context('viewer-a'))).resolves.toEqual(expect.objectContaining({
      success: false,
      errorCode: 'RATE_LIMIT_USER',
      commandName: 'limited',
      pluginId: 'owned-plugin'
    }));
  });
});
