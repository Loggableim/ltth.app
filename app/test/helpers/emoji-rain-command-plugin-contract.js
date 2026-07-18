const { AnimalCommandCooldowns } = require('../../modules/emoji-rain-animal-commands');

class MockGCCE {
  constructor() {
    this.commands = new Map();
    this.failNames = new Set();
    this.registry = {
      getCommand: name => this.commands.get(String(name).toLowerCase()) || null,
      getPluginCommands: pluginId => Array.from(this.commands.values())
        .filter(command => command.pluginId === pluginId)
    };
  }

  addForeignCommand(name, pluginId = 'other-plugin') {
    this.commands.set(name, { name, pluginId, enabled: true });
  }

  registerCommandsForPlugin(pluginId, definitions) {
    const result = { pluginId, registered: [], failed: [] };
    definitions.forEach(definition => {
      const existing = this.commands.get(definition.name);
      if (this.failNames.has(definition.name) || (existing && existing.pluginId !== pluginId)) {
        result.failed.push(definition.name);
        return;
      }
      this.commands.set(definition.name, { ...definition, pluginId });
      result.registered.push(definition.name);
    });
    return result;
  }

  unregisterCommandsForPlugin(pluginId) {
    for (const [name, command] of this.commands) {
      if (command.pluginId === pluginId) this.commands.delete(name);
    }
  }
}

class MockAPI {
  constructor({ config = {}, gcceAvailable = true } = {}) {
    this.emissions = [];
    this.routes = new Map();
    this.persistCalls = [];
    this.failPersistence = false;
    this.config = {
      enabled: true,
      emoji_set: ['💙'],
      max_count_per_event: 100,
      max_intensity: 3,
      ...config
    };
    this.gcce = gcceAvailable ? new MockGCCE() : null;
    this.pluginLoader = {
      loadedPlugins: new Map(this.gcce ? [['gcce', { instance: this.gcce }]] : [])
    };
    this.db = {
      getEmojiRainConfig: () => ({ ...this.config }),
      updateEmojiRainConfig: jest.fn((next, enabled = null) => {
        if (this.failPersistence) throw new Error('persistence failed');
        this.config = {
          ...this.config,
          ...next,
          ...(enabled === null ? {} : { enabled: Boolean(enabled) })
        };
        this.persistCalls.push({ ...this.config });
        return { ...this.config };
      })
    };
  }

  log() {}
  emit(event, data) { this.emissions.push({ event, data }); }
  getSocketIO() { return { emit: this.emit.bind(this) }; }
  getDatabase() { return this.db; }
  getPluginDataDir() { return 'C:/tmp/emoji-rain-command-contract'; }
  ensurePluginDataDir() {}
  getConfigPathManager() {
    return {
      getUserConfigsDir: () => 'C:/tmp/emoji-rain-command-config',
      getPluginDataDir: () => 'C:/tmp/emoji-rain-command-legacy'
    };
  }
  getConfig() { return { ...this.config }; }
  setConfig(_key, next) {
    if (this.failPersistence) throw new Error('persistence failed');
    this.config = { ...next };
    this.persistCalls.push({ ...this.config });
  }
  registerRoute(method, path, handler) {
    this.routes.set(`${String(method).toLowerCase()} ${path}`, handler);
  }
  registerMiddleware() {}
  registerTikTokEvent() {}
  registerFlowAction() {}
  registerSocket() {}
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

function animalCommand(command, assetType = 'emoji', assetValue = '🐾', enabled = true) {
  return {
    command,
    enabled,
    asset_type: assetType,
    asset_value: assetValue
  };
}

function registerEmojiRainCommandContract({
  label,
  Plugin,
  pluginId,
  eventName,
  configRoute,
  imagePath
}) {
  describe(`${label} dynamic animal commands`, () => {
    test('migrates and registers the five defaults with dedicated plugin cooldowns', async () => {
      const api = new MockAPI();
      const plugin = new Plugin(api);
      await plugin.integrateWithGCCE();

      const names = api.gcce.registry.getPluginCommands(pluginId).map(command => command.name);
      expect(names).toEqual(expect.arrayContaining([
        'rain', 'emoji', 'storm', 'herzballons', 'rainstop',
        'beans', 'miau', 'rawr', 'woof', 'wuff'
      ]));
      expect(api.gcce.registry.getCommand('beans')).toMatchObject({
        permission: 'all',
        cooldown: { user: 0, global: 0 }
      });

      const response = await api.gcce.registry.getCommand('miau').handler([], {
        username: 'team-member',
        rawData: {},
        userData: { teamMemberLevel: 3, isSubscriber: true }
      });

      expect(response).toMatchObject({ success: true });
      expect(api.emissions).toEqual([expect.objectContaining({
        event: eventName,
        data: expect.objectContaining({
          emoji: '🐱',
          count: 3,
          intensity: 1.5,
          burst: false,
          source: '/miau'
        })
      })]);
    });

    test('registers arbitrary enabled emoji and image commands and omits disabled rows', async () => {
      const api = new MockAPI({
        config: {
          animal_commands: [
            animalCommand('party-cat', 'emoji', '😸'),
            animalCommand('sticker', 'image', imagePath),
            animalCommand('remote', 'image', 'https://cdn.example.test/dog.webp'),
            animalCommand('disabled', 'emoji', '🐶', false)
          ]
        }
      });
      const plugin = new Plugin(api);
      await plugin.integrateWithGCCE();

      expect(api.gcce.registry.getCommand('party-cat')).not.toBeNull();
      expect(api.gcce.registry.getCommand('sticker')).not.toBeNull();
      expect(api.gcce.registry.getCommand('remote')).not.toBeNull();
      expect(api.gcce.registry.getCommand('disabled')).toBeNull();

      const response = await api.gcce.registry.getCommand('sticker').handler([], {
        username: 'paid-member',
        rawData: { isSubscriber: true },
        userData: { teamMemberLevel: 4 }
      });
      expect(response).toMatchObject({ success: true });
      expect(api.emissions[0].data).toMatchObject({ emoji: imagePath, count: 4, burst: false });

      plugin.checkAntiSpam = jest.fn(() => true);
      const remoteResponse = await api.gcce.registry.getCommand('remote').handler([], {
        username: 'paid-remote',
        rawData: { isSubscriber: true },
        userData: { teamMemberLevel: 1 }
      });
      expect(remoteResponse).toMatchObject({ success: true });
      expect(api.emissions[1].data.emoji).toBe('https://cdn.example.test/dog.webp');
    });

    test('keeps an explicitly empty command list disabled', async () => {
      const api = new MockAPI({ config: { animal_commands: [] } });
      const plugin = new Plugin(api);
      await plugin.integrateWithGCCE();

      expect(api.gcce.registry.getCommand('rain')).not.toBeNull();
      expect(api.gcce.registry.getCommand('beans')).toBeNull();
      expect(plugin.getCommandRegistrationInfo()).toEqual({ status: 'active', registered: [] });
    });

    test('uses raw subscription fields, always admits paid subscribers, and never admits normal viewers', async () => {
      const api = new MockAPI({ config: { animal_commands_allow_team_members: false } });
      const plugin = new Plugin(api);
      await plugin.integrateWithGCCE();
      const beans = api.gcce.registry.getCommand('beans');

      const enrichedOnly = await beans.handler([], {
        username: 'not-paid',
        rawData: {},
        userData: { isSubscriber: true, teamMemberLevel: 9 }
      });
      expect(enrichedOnly).toMatchObject({ success: false });

      const viewer = await beans.handler([], {
        username: 'viewer',
        rawData: {},
        userData: { teamMemberLevel: 0 }
      });
      expect(viewer).toMatchObject({ success: false });

      const paid = await beans.handler([], {
        username: 'paid',
        rawData: { userIdentity: { isSubscriberOfAnchor: true } },
        userData: { teamMemberLevel: 0 }
      });
      expect(paid).toMatchObject({ success: true });
      expect(api.emissions).toHaveLength(1);
      expect(api.emissions[0].data).toMatchObject({ emoji: '🐾', count: 1 });
    });

    test('applies paid, Teamlevel, global, and per-command cooldowns only after success', async () => {
      let now = 1000;
      const api = new MockAPI();
      const plugin = new Plugin(api);
      plugin.animalCommandCooldowns = new AnimalCommandCooldowns({ now: () => now });
      plugin.checkAntiSpam = jest.fn(() => true);
      await plugin.integrateWithGCCE();

      const paidContext = {
        username: 'paid',
        rawData: { isSubscriber: true },
        userData: { teamMemberLevel: 0 }
      };
      expect(await api.gcce.registry.getCommand('beans').handler([], paidContext)).toMatchObject({ success: true });
      expect(await api.gcce.registry.getCommand('beans').handler([], paidContext)).toMatchObject({ success: false });
      expect(await api.gcce.registry.getCommand('miau').handler([], paidContext)).toMatchObject({ success: true });
      expect(await api.gcce.registry.getCommand('beans').handler([], {
        ...paidContext,
        username: 'second-paid'
      })).toMatchObject({ success: false });

      now += 15000;
      expect(await api.gcce.registry.getCommand('beans').handler([], paidContext)).toMatchObject({ success: true });

      const memberContext = {
        username: 'member',
        rawData: {},
        userData: { teamMemberLevel: 2 }
      };
      expect(await api.gcce.registry.getCommand('rawr').handler([], memberContext)).toMatchObject({ success: true });
      now += 15000;
      expect(await api.gcce.registry.getCommand('rawr').handler([], memberContext)).toMatchObject({ success: false });
      now += 45000;
      expect(await api.gcce.registry.getCommand('rawr').handler([], memberContext)).toMatchObject({ success: true });
    });

    test('does not record the dedicated cooldown when spawning fails', async () => {
      const api = new MockAPI();
      const plugin = new Plugin(api);
      plugin.checkAntiSpam = jest.fn(() => true);
      await plugin.integrateWithGCCE();
      const originalTrigger = plugin.triggerEmojiRain.bind(plugin);
      plugin.triggerEmojiRain = jest.fn(() => undefined);
      const context = {
        username: 'paid',
        rawData: { isSubscriber: true },
        userData: { teamMemberLevel: 0 }
      };

      expect(await api.gcce.registry.getCommand('beans').handler([], context)).toMatchObject({ success: false });
      plugin.triggerEmojiRain = originalTrigger;
      expect(await api.gcce.registry.getCommand('beans').handler([], context)).toMatchObject({ success: true });
    });

    test('atomically replaces registration on config save and reports active names', async () => {
      const api = new MockAPI();
      const plugin = new Plugin(api);
      await plugin.integrateWithGCCE();
      plugin.registerRoutes();
      const handler = api.routes.get(`post ${configRoute}`);
      const response = createResponse();

      await handler({
        body: {
          config: {
            animal_commands: [animalCommand('custom', 'emoji', '🦊')]
          }
        }
      }, response);

      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        commandRegistration: { status: 'active', registered: ['custom'] }
      });
      expect(api.gcce.registry.getCommand('custom')).not.toBeNull();
      expect(api.gcce.registry.getCommand('beans')).toBeNull();
      expect(api.config.animal_commands).toEqual([animalCommand('custom', 'emoji', '🦊')]);
    });

    test('returns 409 for foreign GCCE conflicts and keeps old config and commands active', async () => {
      const api = new MockAPI();
      const plugin = new Plugin(api);
      await plugin.integrateWithGCCE();
      api.gcce.addForeignCommand('taken');
      plugin.registerRoutes();
      const handler = api.routes.get(`post ${configRoute}`);
      const response = createResponse();

      await handler({
        body: { config: { animal_commands: [animalCommand('taken', 'emoji', '🦊')] } }
      }, response);

      expect(response.statusCode).toBe(409);
      expect(response.body).toMatchObject({
        success: false,
        error: 'COMMAND_CONFLICT',
        commands: ['taken']
      });
      expect(api.gcce.registry.getCommand('beans')).not.toBeNull();
      expect(api.persistCalls).toEqual([]);
    });

    test('rejects an invalid target with HTTP 400 and preserves active registration', async () => {
      const api = new MockAPI();
      const plugin = new Plugin(api);
      await plugin.integrateWithGCCE();
      plugin.registerRoutes();
      const response = createResponse();

      await api.routes.get(`post ${configRoute}`)({
        body: { config: { animal_commands: [animalCommand('unsafe', 'image', 'http://example.test/x.png')] } }
      }, response);

      expect(response.statusCode).toBe(400);
      expect(response.body).toMatchObject({ success: false, error: 'INVALID_ANIMAL_COMMANDS' });
      expect(api.gcce.registry.getCommand('beans')).not.toBeNull();
      expect(api.persistCalls).toEqual([]);
    });

    test('rolls back when GCCE rejects a replacement definition', async () => {
      const api = new MockAPI();
      const plugin = new Plugin(api);
      await plugin.integrateWithGCCE();
      plugin.registerRoutes();
      api.gcce.failNames.add('broken');
      const response = createResponse();

      await api.routes.get(`post ${configRoute}`)({
        body: { config: { animal_commands: [animalCommand('broken', 'emoji', '🦊')] } }
      }, response);

      expect(response.statusCode).toBe(500);
      expect(api.gcce.registry.getCommand('beans')).not.toBeNull();
      expect(api.gcce.registry.getCommand('broken')).toBeNull();
      expect(api.persistCalls).toEqual([]);
    });

    test('rolls registration back when persistence fails', async () => {
      const api = new MockAPI();
      const plugin = new Plugin(api);
      await plugin.integrateWithGCCE();
      plugin.registerRoutes();
      api.failPersistence = true;
      const response = createResponse();

      await api.routes.get(`post ${configRoute}`)({
        body: { config: { animal_commands: [animalCommand('replacement', 'emoji', '🦊')] } }
      }, response);

      expect(response.statusCode).toBe(500);
      expect(api.gcce.registry.getCommand('beans')).not.toBeNull();
      expect(api.gcce.registry.getCommand('replacement')).toBeNull();
    });

    test('persists valid config as pending while GCCE is unavailable', async () => {
      const api = new MockAPI({ gcceAvailable: false });
      const plugin = new Plugin(api);
      plugin.registerRoutes();
      const response = createResponse();

      await api.routes.get(`post ${configRoute}`)({
        body: { config: { animal_commands: [animalCommand('later', 'emoji', '🦊')] } }
      }, response);

      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        commandRegistration: { status: 'pending', registered: [] }
      });
      expect(api.config.animal_commands).toEqual([animalCommand('later', 'emoji', '🦊')]);
    });
  });
}

module.exports = {
  MockAPI,
  registerEmojiRainCommandContract
};
