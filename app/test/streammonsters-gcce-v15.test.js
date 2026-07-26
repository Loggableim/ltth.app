const path = require('path');
const GCCE = require('../plugins/gcce');
const StreamAlchemyPlugin = require('../plugins/streamalchemy');

function createGCCEApi() {
  const configStore = {};
  return {
    pluginDir: path.join(process.cwd(), 'plugins', 'gcce'),
    emitted: [],
    log: jest.fn(),
    getConfig: key => configStore[key] || null,
    setConfig: (key, value) => { configStore[key] = value; },
    registerTikTokEvent: jest.fn(),
    registerRoute: jest.fn(),
    registerSocket: jest.fn(),
    registerFlowAction: jest.fn(),
    registerIFTTTAction: jest.fn(),
    emit(event, data) {
      this.emitted.push({ event, data });
    },
    on: jest.fn().mockReturnValue(true),
    getDatabase: () => ({ prepare: () => ({ get: () => null }) }),
    getSocketIO() {
      return { emit: (event, data) => this.emitted.push({ event, data }) };
    },
    getPluginDataDir: () => path.join(process.cwd(), 'tmp', 'gcce-v15'),
    ensurePluginDataDir: () => path.join(process.cwd(), 'tmp', 'gcce-v15'),
    pluginLoader: { loadedPlugins: new Map() }
  };
}

describe('Stream Monsters 1.5 GCCE contracts', () => {
  test('builds live definitions from enabled aliases and leaves eggs disabled', () => {
    const plugin = new StreamAlchemyPlugin({ pluginDir: '', log: jest.fn() });
    plugin.streamMonstersCommandPrefix = '!';
    plugin.config = {
      enabled: true,
      streamMonsters: {
        enabled: true,
        commandAliases: plugin.normalizeCommandAliases()
      }
    };
    plugin.streamMonstersCommandIngress = { executeCommand: jest.fn() };
    plugin.resolveStreamMonstersViewerId = jest.fn().mockReturnValue('viewer-a');

    const definitions = plugin.buildStreamMonstersCommandDefinitions('!');
    expect(definitions.map(definition => definition.name)).toEqual(expect.arrayContaining([
      'eier', 'eierliste', 'meineeier', 'hatch', 'inventory', 'monsters'
    ]));
    expect(definitions.map(definition => definition.name)).not.toContain('eggs');
    expect(definitions.map(definition => definition.name)).not.toContain('adopt');
    expect(definitions.find(definition => definition.name === 'eier').handler)
      .toEqual(expect.any(Function));
  });

  test('rejects normalized alias conflicts before config persistence or registration', () => {
    const plugin = new StreamAlchemyPlugin({ pluginDir: '', log: jest.fn() });

    expect(() => plugin.normalizeCommandAliases({
      eggs: { enabled: ['EIER'], disabled: ['eggs'] },
      hatch: { enabled: ['eier'], disabled: [] }
    })).toThrow('STREAM_MONSTERS_ALIAS_CONFLICT:eier');
  });

  test('registers, replaces, dispatches and unregisters raw response handlers by plugin', async () => {
    const api = createGCCEApi();
    const gcce = new GCCE(api);
    await gcce.init();
    const first = jest.fn().mockReturnValue({ handled: true });
    const replacement = jest.fn().mockReturnValue({ handled: true });

    expect(gcce.registerRawResponseHandlerForPlugin('streamalchemy', first)).toEqual({
      pluginId: 'streamalchemy',
      registered: true,
      replaced: false
    });
    expect(gcce.registerRawResponseHandlerForPlugin('streamalchemy', replacement)).toEqual({
      pluginId: 'streamalchemy',
      registered: true,
      replaced: true
    });

    await gcce.handleChatMessage({ comment: 'A', uniqueId: 'viewer-a', nickname: 'Viewer A' });
    expect(first).not.toHaveBeenCalled();
    expect(replacement).toHaveBeenCalledWith('A', expect.objectContaining({
      userId: 'viewer-a',
      rawData: expect.objectContaining({ comment: 'A' })
    }));

    expect(gcce.unregisterRawResponseHandlerForPlugin('streamalchemy')).toBe(true);
    await gcce.handleChatMessage({ comment: 'B', uniqueId: 'viewer-a' });
    expect(replacement).toHaveBeenCalledTimes(1);
    await gcce.destroy();
  });

  test('claims only authorized durable A/B/C and 1-4 windows and lets every other message fall through', () => {
    const plugin = new StreamAlchemyPlugin({ pluginDir: '', log: jest.fn() });
    plugin.resolveStreamMonstersViewerId = jest.fn(({ platformUserId, legacyUserId }) => (
      platformUserId || legacyUserId
    ));
    plugin.streamMonstersBattleMatchService = {
      submitChoice: jest.fn(({ userId, choice, eventId }) => (
        userId === 'viewer-a' && choice === 'A'
          ? { handled: true, matchId: 'match-a', eventId }
          : { handled: false, reason: 'no_active_window' }
      )),
      submitStatChoice: jest.fn(({ userId, choice }) => (
        userId === 'viewer-b' && choice === '2'
          ? { handled: true, stat: 'might' }
          : { handled: false, reason: 'no_stat_window' }
      ))
    };

    expect(plugin.handleStreamMonstersRawResponse(' A ', {
      userId: 'viewer-a',
      rawData: { eventId: 'raw-a' }
    })).toEqual(expect.objectContaining({ handled: true, matchId: 'match-a' }));
    expect(plugin.handleStreamMonstersRawResponse('2', {
      userId: 'viewer-b',
      rawData: { msgId: 'raw-stat' }
    })).toEqual(expect.objectContaining({ handled: true, stat: 'might' }));
    expect(plugin.handleStreamMonstersRawResponse('A', {
      userId: 'bystander',
      rawData: { eventId: 'foreign' }
    })).toEqual({ handled: false, reason: 'no_active_window' });
    expect(plugin.handleStreamMonstersRawResponse('hello', {
      userId: 'viewer-a'
    })).toEqual({ handled: false });
    expect(plugin.handleStreamMonstersRawResponse('!battle', {
      userId: 'viewer-a'
    })).toEqual({ handled: false });
    expect(plugin.streamMonstersBattleMatchService.submitChoice).toHaveBeenCalledTimes(2);
    expect(plugin.streamMonstersBattleMatchService.submitStatChoice).toHaveBeenCalledTimes(1);
  });

  test('removes both the raw handler and persistent-match sweep on plugin destroy', async () => {
    const plugin = new StreamAlchemyPlugin({
      pluginDir: '',
      log: jest.fn()
    });
    plugin.api.removeListener = jest.fn();
    plugin.streamMonstersReadyTimer = setInterval(() => {}, 60_000);
    plugin.streamMonstersBattleMatchService = { destroy: jest.fn() };
    plugin.streamMonstersCommandIngress = { clear: jest.fn() };
    plugin.streamMonstersEngine = { recentGifts: new Map() };
    plugin.streamMonstersChatCommands = { queue: [] };
    plugin.streamMonstersGCCE = {
      unregisterCommandsForPlugin: jest.fn(),
      unregisterRawResponseHandlerForPlugin: jest.fn()
    };

    await plugin.destroy();

    expect(plugin.streamMonstersBattleMatchService.destroy).toHaveBeenCalledTimes(1);
    expect(plugin.streamMonstersGCCE).toBeNull();
    expect(plugin.streamMonstersReadyTimer).toBeNull();
  });
});
