const path = require('path');
const GCCE = require('../plugins/gcce');
const StreamAlchemyPlugin = require('../plugins/stream-monsters');
const StreamMonstersChatCommands = require(
  '../plugins/stream-monsters/backend/streammonsters/chat-commands'
);

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
  test('builds live definitions from enabled aliases and keeps legacy eggs disabled', () => {
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
    expect(definitions.map(definition => definition.name)).toEqual(expect.arrayContaining([
      'adopt', 'adoptieren'
    ]));
    expect(definitions.find(definition => definition.name === 'eier').handler)
      .toEqual(expect.any(Function));
    expect(definitions.find(definition => definition.commandName === 'battle'))
      .toEqual(expect.objectContaining({
        syntax: '!battle',
        description: expect.stringContaining('A/B/C')
      }));
  });

  test('publishes effective cooldown and honest TikTok filter diagnostics', () => {
    const plugin = new StreamAlchemyPlugin({ pluginDir: '', log: jest.fn() });
    plugin.streamMonstersCommandPrefix = '!';
    plugin.streamMonstersGCCERegistrationState = 'active';
    plugin.streamMonstersGCCERegisteredCommands = ['eier', 'battle'];
    plugin.streamMonstersGCCERegistrationConflicts = [];
    plugin.streamMonstersGCCEUnavailableCommands = [];
    plugin.config = {
      enabled: true,
      streamMonsters: {
        enabled: true,
        commandAliases: plugin.normalizeCommandAliases({
          eggs: { enabled: ['eier'], disabled: ['eggs'] },
          battle: { enabled: ['battle'], disabled: ['kampf'] }
        })
      }
    };

    const state = plugin.getStreamMonstersGCCEState();

    expect(state.commandPolicies).toEqual(expect.objectContaining({
      eggs: {
        enabledAliases: ['eier'],
        registeredAliases: ['eier'],
        userCooldownMs: 1000,
        globalCooldownMs: 250
      },
      battle: {
        enabledAliases: ['battle'],
        registeredAliases: ['battle'],
        userCooldownMs: 2000,
        globalCooldownMs: 0
      }
    }));
    expect(state.tiktokFilter).toEqual({
      status: 'not_probeable',
      probeable: false,
      recommendation: 'use_custom_aliases'
    });
  });

  test('does not invent a ChatCommands reference for a fully disabled action', () => {
    const commands = new StreamMonstersChatCommands({
      store: {},
      engine: { markReadyEggs: jest.fn() },
      battleService: {},
      getCommandReference: command => command === 'battle' ? '!kampf' : ''
    });

    expect(commands.commandReference('eggs')).toBe('');
    const help = commands.execute({ userId: 'viewer-a' }, 'monstershelp');
    expect(help.message).toContain('!kampf');
    expect(help.message).not.toMatch(/!eggs|!eier|!hatch|!monsters/);
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
      pluginId: 'stream-monsters',
      registered: true,
      replaced: false
    });
    expect(gcce.registerRawResponseHandlerForPlugin('streamalchemy', replacement)).toEqual({
      pluginId: 'stream-monsters',
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

  test('dispatches text-only raw input exactly once while unrelated chat falls through', async () => {
    const api = createGCCEApi();
    const gcce = new GCCE(api);
    await gcce.init();
    const handler = jest.fn(message => (
      message.trim().toUpperCase() === 'A'
        ? { handled: true }
        : { handled: false }
    ));
    gcce.registerRawResponseHandlerForPlugin('streamalchemy', handler);

    await expect(gcce.handleChatMessage({
      text: ' a ',
      eventId: 'text-choice',
      uniqueId: 'viewer-a'
    })).resolves.toEqual(expect.objectContaining({
      handled: true,
      pluginId: 'stream-monsters'
    }));
    await expect(gcce.handleChatMessage({
      text: 'hello stream',
      eventId: 'text-chat',
      uniqueId: 'viewer-a'
    })).resolves.toEqual({ handled: false });

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenNthCalledWith(1, ' a ', expect.objectContaining({
      rawData: expect.objectContaining({ text: ' a ' })
    }));
    expect(api.emitted.filter(entry => (
      entry.event === 'gcce:chat_consumed' &&
      entry.data.correlationId === 'tiktok:text-choice'
    ))).toHaveLength(1);
    await gcce.destroy();
  });

  test('claims only authorized durable A/B/C and 1-4 windows and lets every other message fall through', () => {
    const plugin = new StreamAlchemyPlugin({ pluginDir: '', log: jest.fn() });
    plugin.resolveStreamMonstersViewerId = jest.fn(({ platformUserId, legacyUserId }) => (
      platformUserId || legacyUserId
    ));
    plugin.streamMonstersBattleMatchService = {
      submitChoice: jest.fn(({ userId, choice, eventId }) => (
        userId === 'viewer-a' && /^[ABC]$/.test(choice)
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
    for (const raw of ['a...', ' B! ', 'c?', 'A.', 'a…', 'A!!', 'A…!', 'C??']) {
      expect(plugin.handleStreamMonstersRawResponse(raw, {
        userId: 'viewer-a',
        rawData: { eventId: `punctuation-${raw}` }
      })).toEqual(expect.objectContaining({ handled: true }));
    }
    for (const raw of ['ABC', 'A text', 'A,']) {
      expect(plugin.handleStreamMonstersRawResponse(raw, {
        userId: 'viewer-a'
      })).toEqual({ handled: false });
    }
    expect(plugin.streamMonstersBattleMatchService.submitChoice).toHaveBeenCalledTimes(10);
    expect(plugin.streamMonstersBattleMatchService.submitStatChoice).toHaveBeenCalledTimes(1);
  });

  test('logs normalized raw outcomes without viewer identity or sealed choice', () => {
    const api = { pluginDir: '', log: jest.fn() };
    const plugin = new StreamAlchemyPlugin(api);
    plugin.resolveStreamMonstersViewerId = jest.fn(() => 'private-viewer-a');
    plugin.streamMonstersBattleMatchService = {
      getRawResponseWindowKey: jest.fn(() => 'match-public:action:1'),
      submitChoice: jest.fn(() => ({
        handled:true,
        waiting:true,
        match:{ matchId:'match-public' }
      }))
    };

    expect(plugin.handleStreamMonstersRawResponse(' A... ', {
      userId:'private-viewer-a',
      source:'gcce_raw_handler',
      rawData:{ eventId:'private-provider-event' }
    })).toEqual(expect.objectContaining({ handled:true, waiting:true }));

    const record = api.log.mock.calls
      .map(([line]) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .find(entry => entry?.event === 'raw_response_processed');
    expect(record).toEqual(expect.objectContaining({
      component:'streammonsters',
      status:'sealed',
      source:'gcce_raw_handler',
      matchId:'match-public',
      viewerRef:expect.stringMatching(/^viewer:[a-f0-9]{16}$/)
    }));
    expect(JSON.stringify(record))
      .not.toMatch(/private-viewer-a|private-provider-event|"choice"|A\.\.\./);
  });

  test('deduplicates a missing-provider-id retry within one window without colliding with the next round', () => {
    const plugin = new StreamAlchemyPlugin({ pluginDir: '', log: jest.fn() });
    plugin.resolveStreamMonstersViewerId = jest.fn(() => 'viewer-window');
    const keys = ['match-a:round:1', 'match-a:round:1', 'match-a:round:2'];
    plugin.streamMonstersBattleMatchService = {
      getRawResponseWindowKey: jest.fn(() => keys.shift()),
      submitChoice: jest.fn(({ eventId }) => ({ handled: true, eventId })),
      submitStatChoice: jest.fn()
    };

    const first = plugin.handleStreamMonstersRawResponse('A', {
      userId: 'viewer-window',
      rawData: {}
    });
    const retry = plugin.handleStreamMonstersRawResponse('A', {
      userId: 'viewer-window',
      rawData: {}
    });
    const nextRound = plugin.handleStreamMonstersRawResponse('A', {
      userId: 'viewer-window',
      rawData: {}
    });

    expect(retry.eventId).toBe(first.eventId);
    expect(nextRound.eventId).not.toBe(first.eventId);
    expect(plugin.streamMonstersBattleMatchService.submitChoice)
      .toHaveBeenCalledTimes(3);
  });

  test('scopes missing-provider-id raw choice dedupe to each battle participant', () => {
    const plugin = new StreamAlchemyPlugin({ pluginDir: '', log: jest.fn() });
    plugin.resolveStreamMonstersViewerId = jest.fn(({
      platformUserId,
      legacyUserId
    }) => legacyUserId || platformUserId);
    const acceptedEventIds = new Set();
    plugin.streamMonstersBattleMatchService = {
      getRawResponseWindowKey: jest.fn(() => 'match-a:action:1'),
      submitChoice: jest.fn(({ userId, eventId }) => {
        if (acceptedEventIds.has(eventId)) {
          return { handled: false, reason: 'duplicate_event', userId, eventId };
        }
        acceptedEventIds.add(eventId);
        return { handled: true, userId, eventId };
      }),
      submitStatChoice: jest.fn()
    };

    const first = plugin.handleStreamMonstersRawResponse('A', {
      userId: 'viewer-a',
      rawData: {}
    });
    const retry = plugin.handleStreamMonstersRawResponse('A', {
      userId: 'viewer-a',
      rawData: {}
    });
    const secondParticipant = plugin.handleStreamMonstersRawResponse('A', {
      userId: 'viewer-b',
      rawData: {}
    });

    expect([first.handled, retry.handled, secondParticipant.handled])
      .toEqual([true, false, true]);
    expect(retry.eventId).toBe(first.eventId);
    expect(secondParticipant.eventId).not.toBe(first.eventId);
    expect(acceptedEventIds.size).toBe(2);
    expect(JSON.stringify([...acceptedEventIds])).not.toMatch(/viewer-a|viewer-b/);
  });

  test('offers normalized raw choices to the battle window in fallback mode only', async () => {
    const plugin = new StreamAlchemyPlugin({ pluginDir: '', log: jest.fn() });
    plugin.streamMonstersGCCERegistrationState = 'fallback';
    plugin.resolveStreamMonstersViewerId = jest.fn(({ platformUserId, legacyUserId }) => (
      legacyUserId || platformUserId
    ));
    plugin.streamMonstersBattleMatchService = {
      submitChoice: jest.fn(({ userId, choice }) => (
        userId === 'viewer-a' && choice === 'A'
          ? { handled: true, matchId: 'match-a' }
          : { handled: false, reason: 'no_active_window' }
      )),
      submitStatChoice: jest.fn(({ userId, choice }) => (
        userId === 'viewer-b' && choice === '2'
          ? { handled: true, stat: 'might' }
          : { handled: false, reason: 'no_stat_window' }
      ))
    };
    plugin.streamMonstersCommandIngress = {
      handleFallback: jest.fn(async () => ({ handled: false, status: 'ignored' }))
    };

    await expect(plugin.handleStreamMonstersChat({
      userId: 'platform-a',
      uniqueId: 'viewer-a',
      comment: 'A...',
      eventId: 'fallback-a'
    })).resolves.toEqual(expect.objectContaining({ handled: true, matchId: 'match-a' }));
    await expect(plugin.handleStreamMonstersChat({
      userId: 'platform-b',
      uniqueId: 'viewer-b',
      comment: '2',
      eventId: 'fallback-stat'
    })).resolves.toEqual(expect.objectContaining({ handled: true, stat: 'might' }));
    expect(plugin.streamMonstersCommandIngress.handleFallback).not.toHaveBeenCalled();

    await plugin.handleStreamMonstersChat({
      userId: 'platform-x',
      uniqueId: 'bystander',
      comment: 'A',
      eventId: 'fallback-bystander'
    });
    expect(plugin.streamMonstersCommandIngress.handleFallback).toHaveBeenCalledTimes(1);

    plugin.streamMonstersGCCERegistrationState = 'active';
    await expect(plugin.handleStreamMonstersChat({
      userId: 'platform-a',
      uniqueId: 'viewer-a',
      comment: 'A...',
      eventId: 'gcce-owned'
    })).resolves.toEqual(expect.objectContaining({ status: 'gcce_active' }));
    expect(plugin.streamMonstersBattleMatchService.submitChoice).toHaveBeenCalledTimes(2);
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
