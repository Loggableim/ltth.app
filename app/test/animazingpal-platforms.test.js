const assert = require('assert');
const AnimazingPalPlugin = require('../plugins/animazingpal/main');
const {
  createPlatformAdapter,
  listPlatformDefinitions
} = require('../plugins/animazingpal/platforms');

function createApiStub() {
  return {
    getSocketIO() {
      return { emit() {} };
    },
    getDatabase() {
      return {};
    },
    log() {},
    registerRoute() {},
    emit() {},
    setConfig() {},
    getConfig() {
      return null;
    }
  };
}

describe('AnimazingPal Platform Abstraction', function() {
  it('exposes Animaze, VTube Studio, and VSeeFace platform definitions', function() {
    const keys = listPlatformDefinitions().map((platform) => platform.key).sort();
    assert.deepStrictEqual(keys, ['animaze', 'vseeface', 'vtube-studio']);
  });

  it('creates adapters for the new platforms', function() {
    const api = createApiStub();

    assert.ok(createPlatformAdapter('vtube-studio', api, {}), 'VTube Studio adapter should be created');
    assert.ok(createPlatformAdapter('vseeface', api, {}), 'VSeeFace adapter should be created');
    assert.strictEqual(createPlatformAdapter('animaze', api, {}), null, 'Animaze keeps the legacy direct path');
  });

  it('normalizes legacy Animaze config into the platform profile structure', function() {
    const plugin = new AnimazingPalPlugin(createApiStub());
    const normalized = plugin.normalizeConfig({
      host: '127.0.0.1',
      port: 8008,
      autoConnect: true,
      reconnectOnDisconnect: true,
      verboseLogging: false
    });

    assert.strictEqual(normalized.platform.active, 'animaze');
    assert.strictEqual(normalized.platform.profiles.animaze.host, '127.0.0.1');
    assert.strictEqual(normalized.platform.profiles.animaze.port, 8008);
  });

  it('sanitizes sensitive platform config in safe config output', function() {
    const plugin = new AnimazingPalPlugin(createApiStub());
    plugin.config = plugin.normalizeConfig({
      platform: {
        active: 'vtube-studio',
        profiles: {
          'vtube-studio': {
            host: '127.0.0.1',
            port: 8001,
            authToken: 'secret-token'
          }
        }
      }
    });

    const safeConfig = plugin.getSafeConfig();

    assert.strictEqual(safeConfig.platform.active, 'vtube-studio');
    assert.strictEqual(safeConfig.platform.profile.authToken, '');
    assert.strictEqual(safeConfig.platform.profile.authTokenConfigured, true);
  });

  it('applies the stream-ready preset with faster reaction defaults', function() {
    const plugin = new AnimazingPalPlugin(createApiStub());
    plugin.config = plugin.normalizeConfig(plugin.getDefaultConfig());

    const applied = plugin.applyPreset('stream-ready');

    assert.strictEqual(applied.enabled, true);
    assert.strictEqual(applied.chatToAvatar.enabled, false);
    assert.strictEqual(applied.brain.enabled, true);
    assert.strictEqual(applied.brain.autoRespond.chat, true);
    assert.strictEqual(applied.eventCooldowns.gift, 350);
    assert.strictEqual(applied.eventCooldowns.follow, 1200);
    assert.strictEqual(applied.eventActions.follow.actionType, 'emote');
    assert.strictEqual(applied.eventActions.subscribe.actionType, 'pose');
    assert.strictEqual(applied.eventActions.like.threshold, 25);
  });
});
