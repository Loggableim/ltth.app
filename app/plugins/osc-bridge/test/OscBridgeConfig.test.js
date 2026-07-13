const {
  DEFAULT_OSC_BRIDGE_CONFIG,
  normalizeConfig,
  validateConfig
} = require('../modules/OscBridgeConfig');
const manifest = require('../plugin.json');

describe('OscBridgeConfig', () => {
  test('manifest loads the plugin but keeps runtime bridge disabled', () => {
    expect(manifest.enabled).toBe(false);
    expect(manifest.devStatus).toBe('stable');
    expect(manifest.settings).toEqual(expect.objectContaining({
      enabled: false,
      sendHost: '127.0.0.1',
      sendPort: 9000,
      receivePort: 9001,
      autoRetryOnError: false
    }));
    expect(manifest.settings).not.toHaveProperty('allowedIPs');
  });

  test('deep-merges legacy partial config while preserving nested defaults', () => {
    const config = normalizeConfig({
      enabled: true,
      oscQuery: {
        enabled: true
      },
      chatCommands: {
        avatarSwitch: {
          enabled: true
        }
      },
      autoRetryOnError: true
    });

    expect(config.enabled).toBe(true);
    expect(config.sendHost).toBe(DEFAULT_OSC_BRIDGE_CONFIG.sendHost);
    expect(config.sendPort).toBe(9000);
    expect(config.receivePort).toBe(9001);
    expect(config.autoRetryOnError).toBe(false);
    expect(config.oscQuery).toEqual(expect.objectContaining({
      enabled: true,
      host: '127.0.0.1',
      port: 9001,
      autoSubscribe: true
    }));
    expect(config.chatCommands.avatarSwitch).toEqual(expect.objectContaining({
      enabled: true,
      cooldownType: 'global',
      cooldownSeconds: 60,
      permission: 'subscriber'
    }));
    expect(config.messageBatching).toEqual(expect.objectContaining({
      enabled: true,
      batchWindow: 10
    }));
    expect(config).not.toHaveProperty('allowedIPs');
  });

  test('accepts arbitrary OSC target hosts without an allowlist setting', () => {
    const config = normalizeConfig({
      sendHost: 'vrchat-bridge.local',
      allowedIPs: ['127.0.0.1']
    });

    expect(validateConfig(config)).toEqual({ valid: true, errors: [] });
    expect(config).not.toHaveProperty('allowedIPs');
  });

  test('reports invalid ports and unsafe host values', () => {
    const result = validateConfig(normalizeConfig({
      sendHost: '',
      sendPort: 70000,
      receivePort: 0,
      oscQuery: {
        enabled: true,
        port: 'bad'
      }
    }));

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      'sendHost must be a non-empty string',
      'sendPort must be an integer between 1 and 65535',
      'receivePort must be an integer between 1 and 65535',
      'oscQuery.port must be an integer between 1 and 65535'
    ]));
  });
});
