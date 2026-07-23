const GCCE = require('../plugins/gcce');
const CommandParser = require('../plugins/gcce/commandParser');
const CommandRegistry = require('../plugins/gcce/commandRegistry');

function createHarness() {
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  };
  const registry = new CommandRegistry(logger);
  const parser = new CommandParser(registry, {
    checkPermission: () => true,
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
});
