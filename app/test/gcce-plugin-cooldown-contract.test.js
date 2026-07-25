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
  }, logger, { commandPrefix: '!' });
  const gcce = Object.assign(Object.create(GCCE.prototype), {
    api: { log: jest.fn() },
    registry,
    parser
  });
  return { gcce, parser };
}

describe('GCCE plugin command cooldown contract', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-25T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('applies definition cooldowns and removes them with plugin commands', async () => {
    const { gcce, parser } = createHarness();
    const handler = jest.fn(() => ({ success: true }));

    gcce.registerCommandsForPlugin('streamalchemy', [{
      name: 'eggs',
      permission: 'all',
      cooldown: { user: 1000, global: 250 },
      handler
    }]);

    expect(parser.cooldownManager.getCooldownConfig('eggs')).toEqual({
      userCooldown: 1000,
      globalCooldown: 250
    });
    await expect(parser.parse('!eggs', {
      userId: 'viewer-a',
      username: 'Viewer A',
      userRole: 'all'
    })).resolves.toEqual(expect.objectContaining({ success: true }));
    await expect(parser.parse('!eggs', {
      userId: 'viewer-b',
      username: 'Viewer B',
      userRole: 'all'
    })).resolves.toEqual(expect.objectContaining({
      success: false,
      errorCode: 'COMMAND_ON_COOLDOWN'
    }));

    gcce.unregisterCommandsForPlugin('streamalchemy');
    expect(parser.cooldownManager.getCooldownConfig('eggs')).toBeNull();
  });
});
