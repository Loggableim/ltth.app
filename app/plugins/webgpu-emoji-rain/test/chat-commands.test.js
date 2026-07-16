/**
 * Tests for WebGPU Emoji Rain chat command eligibility and plain-rain payloads.
 */

class MockAPI {
  constructor(config = {}) {
    this.emissions = [];
    this.commands = [];
    this.config = {
      enabled: true,
      emoji_set: ['💙'],
      max_count_per_event: 100,
      max_intensity: 3,
      ...config
    };
    this.db = { getEmojiRainConfig: () => this.config };
    this.pluginLoader = {
      loadedPlugins: new Map([['gcce', {
        instance: {
          registerCommandsForPlugin: (_pluginId, commands) => {
            this.commands = commands;
            return { registered: commands.map(command => command.name), failed: [] };
          }
        }
      }]])
    };
  }

  log() {}

  emit(event, data) {
    this.emissions.push({ event, data });
  }

  getSocketIO() {
    return { emit: this.emit.bind(this) };
  }

  getDatabase() {
    return this.db;
  }

  getPluginDataDir() {
    return '/tmp/webgpu-emoji-rain-chat-command-test';
  }

  ensurePluginDataDir() {}

  getConfigPathManager() {
    return {
      getUserConfigsDir: () => '/tmp/webgpu-emoji-rain-chat-command-config'
    };
  }

  registerRoute() {}
  registerTikTokEvent() {}
  registerFlowAction() {}
}

const commandCases = [
  ['beans', '🐾', '/beans', 'subscriber', 30000, 5000],
  ['miau', '🐱', '/miau', 'all', 60000, 15000],
  ['rawr', '🦖', '/rawr', 'all', 60000, 15000],
  ['woof', '🐶', '/woof', 'all', 60000, 15000],
  ['wuff', '🐶', '/wuff', 'all', 60000, 15000]
];

describe('WebGPU Emoji Rain chat commands', () => {
  let WebGPUEmojiRainPlugin;

  beforeEach(() => {
    jest.resetModules();
    WebGPUEmojiRainPlugin = require('../main.js');
  });

  test.each(commandCases)('%s registers and emits the expected plain rain for a SuperFan', async (
    name, emoji, source, permission, userCooldown, globalCooldown
  ) => {
    const api = new MockAPI();
    const plugin = new WebGPUEmojiRainPlugin(api);
    await plugin.integrateWithGCCE();

    const command = api.commands.find(candidate => candidate.name === name);
    expect(command).toMatchObject({
      name,
      permission,
      enabled: true,
      minArgs: 0,
      maxArgs: 0,
      cooldown: { user: userCooldown, global: globalCooldown }
    });

    const response = await command.handler([], {
      username: 'superfan-one',
      userData: { teamMemberLevel: 1 }
    });

    expect(response).toEqual(expect.objectContaining({ success: true, displayOverlay: true }));
    expect(api.emissions).toEqual([expect.objectContaining({
      event: 'webgpu-emoji-rain:spawn',
      data: expect.objectContaining({
        emoji,
        source,
        username: 'superfan-one',
        count: 30,
        intensity: 1.5,
        burst: false,
        reason: 'command'
      })
    })]);
  });

  test('miau rejects regular viewers when animal commands are restricted to SuperFans', async () => {
    const api = new MockAPI();
    const plugin = new WebGPUEmojiRainPlugin(api);
    await plugin.integrateWithGCCE();

    const miau = api.commands.find(command => command.name === 'miau');
    const response = await miau.handler([], {
      username: 'viewer-one',
      userData: { teamMemberLevel: 0 }
    });

    expect(response).toEqual(expect.objectContaining({ success: false }));
    expect(api.emissions).toEqual([]);
  });

  test('beans is restricted to SuperFans and describes plain emoji rain', async () => {
    const api = new MockAPI();
    const plugin = new WebGPUEmojiRainPlugin(api);
    await plugin.integrateWithGCCE();

    const beans = api.commands.find(command => command.name === 'beans');
    const response = await beans.handler([], {
      username: 'viewer-one',
      userData: { teamMemberLevel: 0 }
    });

    expect(response).toEqual(expect.objectContaining({ success: false }));
    expect(api.emissions).toEqual([]);
    expect(beans).toMatchObject({ description: 'SuperFan emoji rain effect' });
  });

  test('miau allows regular viewers when the SuperFan restriction is disabled', async () => {
    const api = new MockAPI({ animal_commands_superfans_only: false });
    const plugin = new WebGPUEmojiRainPlugin(api);
    await plugin.integrateWithGCCE();

    const miau = api.commands.find(command => command.name === 'miau');
    const response = await miau.handler([], {
      username: 'viewer-one',
      userData: { teamMemberLevel: 0 }
    });

    expect(response).toEqual(expect.objectContaining({ success: true, displayOverlay: true }));
    expect(api.emissions[0].data).toEqual(expect.objectContaining({ burst: false }));
  });

  test('miau does not emit while WebGPU Emoji Rain is disabled', async () => {
    const api = new MockAPI({ enabled: false });
    const plugin = new WebGPUEmojiRainPlugin(api);
    await plugin.integrateWithGCCE();

    const miau = api.commands.find(command => command.name === 'miau');
    const response = await miau.handler([], { username: 'viewer-one' });

    expect(response).toEqual(expect.objectContaining({ success: false }));
    expect(api.emissions).toEqual([]);
  });
});
