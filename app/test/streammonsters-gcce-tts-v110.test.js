'use strict';

const { EventEmitter } = require('events');
const path = require('path');
const GCCE = require('../plugins/gcce');
const TTSPlugin = require('../plugins/tts/main');

function createGCCEApi() {
  const configStore = {};
  const pluginLoader = new EventEmitter();
  pluginLoader.loadedPlugins = new Map();
  return {
    pluginDir: path.join(process.cwd(), 'plugins', 'gcce'),
    pluginLoader,
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
      pluginLoader.emit(event, data);
    },
    on: pluginLoader.on.bind(pluginLoader),
    getDatabase: () => ({ prepare: () => ({ get: () => null }) }),
    getSocketIO() {
      return { emit: (event, data) => this.emitted.push({ event, data }) };
    },
    getPluginDataDir: () => path.join(process.cwd(), 'tmp', 'gcce-tts-v110'),
    ensurePluginDataDir: () => path.join(process.cwd(), 'tmp', 'gcce-tts-v110')
  };
}

function createTtsSubject(gcce) {
  let chatHandler;
  const plugin = Object.create(TTSPlugin.prototype);
  plugin.api = {
    pluginLoader: {
      loadedPlugins: new Map([['gcce', { instance: gcce }]])
    },
    registerTikTokEvent: jest.fn((event, handler) => {
      if (event === 'chat') chatHandler = handler;
    })
  };
  plugin.config = { enabledForChat: true };
  plugin.startupTimestamp = '2026-01-01T00:00:00.000Z';
  plugin._logDebug = jest.fn();
  plugin.logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };
  plugin._hasCallableChatTtsPath = jest.fn(() => true);
  plugin._logChatTtsUnavailable = jest.fn();
  plugin.speak = jest.fn().mockResolvedValue({ success: true });
  plugin._registerTikTokEvents();
  return { plugin, chatHandler };
}

describe('Stream Monsters 1.10 GCCE to TTS consumption contract', () => {
  let gcce;

  afterEach(async () => {
    await gcce?.destroy?.();
  });

  test('suppresses a successfully handled Stream Monsters command when TTS listens first', async () => {
    const api = createGCCEApi();
    gcce = new GCCE(api);
    await gcce.init();
    api.pluginLoader.loadedPlugins.set('gcce', { instance: gcce });
    gcce.registerCommandsForPlugin('streamalchemy', [{
      name: 'hatch',
      handler: async () => ({ success: true, status: 'hatched' })
    }]);
    const { plugin, chatHandler } = createTtsSubject(gcce);
    const data = {
      eventId: 'evt-success',
      timestamp: '2026-01-01T00:00:01.000Z',
      comment: '/hatch',
      uniqueId: 'viewer_one'
    };

    const ttsFirst = chatHandler(data);
    await Promise.resolve();
    await gcce.handleChatMessage(data);
    await ttsFirst;

    expect(plugin.speak).not.toHaveBeenCalled();
    expect(api.emitted).toContainEqual({
      event: 'gcce:chat_consumed',
      data: expect.objectContaining({
        schemaVersion: 1,
        correlationId: 'tiktok:evt-success',
        pluginId: 'streamalchemy',
        success: true,
        consumed: true
      })
    });
  });

  test('suppresses handled Stream Monsters domain failures while leaving other chat audible', async () => {
    const api = createGCCEApi();
    gcce = new GCCE(api);
    await gcce.init();
    gcce.registerCommandsForPlugin('streamalchemy', [{
      name: 'hatch',
      handler: async () => ({ success: false, status: 'egg_not_ready' })
    }]);
    const { plugin, chatHandler } = createTtsSubject(gcce);
    const failed = {
      eventId: 'evt-failed',
      timestamp: '2026-01-01T00:00:01.000Z',
      comment: '/hatch',
      uniqueId: 'viewer_one'
    };

    const failedTtsFirst = chatHandler(failed);
    await Promise.resolve();
    await gcce.handleChatMessage(failed);
    await failedTtsFirst;
    const normalChat = {
      eventId: 'evt-chat',
      timestamp: '2026-01-01T00:00:02.000Z',
      comment: 'hello stream',
      uniqueId: 'viewer_one'
    };
    await chatHandler(normalChat);
    await gcce.handleChatMessage(normalChat);
    const unknownCommand = {
      eventId: 'evt-unknown',
      timestamp: '2026-01-01T00:00:03.000Z',
      comment: '/unknown',
      uniqueId: 'viewer_one'
    };
    const unknownTtsFirst = chatHandler(unknownCommand);
    await Promise.resolve();
    await gcce.handleChatMessage(unknownCommand);
    await unknownTtsFirst;
    const unhandledRaw = {
      eventId: 'evt-raw',
      timestamp: '2026-01-01T00:00:04.000Z',
      comment: 'A',
      uniqueId: 'viewer_one'
    };
    const rawTtsFirst = chatHandler(unhandledRaw);
    await Promise.resolve();
    await gcce.handleChatMessage(unhandledRaw);
    await rawTtsFirst;

    expect(plugin.speak).toHaveBeenNthCalledWith(1, expect.objectContaining({
      text: 'hello stream',
      source: 'chat'
    }));
    expect(plugin.speak).toHaveBeenNthCalledWith(2, expect.objectContaining({
      text: '/unknown',
      source: 'chat'
    }));
    expect(plugin.speak).toHaveBeenNthCalledWith(3, expect.objectContaining({
      text: 'A',
      source: 'chat'
    }));
    expect(api.emitted).toContainEqual({
      event: 'gcce:chat_consumed',
      data: expect.objectContaining({
        correlationId: 'tiktok:evt-failed',
        pluginId: 'streamalchemy',
        success: false,
        consumed: true
      })
    });
    expect(api.emitted).not.toContainEqual({
      event: 'gcce:chat_consumed',
      data: expect.objectContaining({ correlationId: 'tiktok:evt-chat' })
    });
  });

  test.each([
    {
      rejection: 'rate-limit',
      command: {},
      arrange: gcceInstance => {
        gcceInstance.parser.rateLimiter.tryConsume = jest.fn(() => ({
          allowed: false,
          reason: 'user_limit',
          retryAfter: 1
        }));
      }
    },
    {
      rejection: 'permission',
      command: { permission: 'moderator' },
      arrange: gcceInstance => {
        gcceInstance.permissionChecker.checkPermission = jest.fn(() => false);
      }
    },
    {
      rejection: 'validation',
      command: { minArgs: 1, maxArgs: 1 },
      arrange: () => {}
    }
  ])('keeps a Stream Monsters $rejection rejection audible before handler invocation', async ({
    rejection,
    command,
    arrange
  }) => {
    const api = createGCCEApi();
    gcce = new GCCE(api);
    await gcce.init();
    const handler = jest.fn(async () => ({ success: true, status: 'hatched' }));
    gcce.registerCommandsForPlugin('streamalchemy', [{
      name: 'hatch',
      handler,
      ...command
    }]);
    arrange(gcce);
    const { plugin, chatHandler } = createTtsSubject(gcce);
    const data = {
      eventId: `evt-${rejection}`,
      timestamp: '2026-01-01T00:00:01.000Z',
      comment: '/hatch',
      uniqueId: 'viewer_one'
    };

    const ttsFirst = chatHandler(data);
    await Promise.resolve();
    await gcce.handleChatMessage(data);
    await ttsFirst;

    expect(handler).not.toHaveBeenCalled();
    expect(plugin.speak).toHaveBeenCalledWith(expect.objectContaining({
      text: '/hatch',
      source: 'chat'
    }));
    expect(api.emitted).toContainEqual({
      event: 'gcce:chat_consumed',
      data: expect.objectContaining({
        correlationId: `tiktok:evt-${rejection}`,
        pluginId: 'streamalchemy',
        success: false,
        consumed: false
      })
    });
  });

  test('uses a completed GCCE decision when GCCE listens before TTS', async () => {
    const api = createGCCEApi();
    gcce = new GCCE(api);
    await gcce.init();
    gcce.registerCommandsForPlugin('streamalchemy', [{
      name: 'hatch',
      handler: async () => ({ success: true, status: 'hatched' })
    }]);
    const { plugin, chatHandler } = createTtsSubject(gcce);
    const data = {
      eventId: 'evt-cached',
      timestamp: '2026-01-01T00:00:01.000Z',
      comment: '/hatch',
      uniqueId: 'viewer_one'
    };

    await gcce.handleChatMessage(data);
    await chatHandler(data);

    expect(plugin.speak).not.toHaveBeenCalled();
  });

  test.each(['A...', ' a… ', 'B!', 'C?', '1.', 'A!!', 'A…!', 'C??'])(
    'suppresses handled normalized raw response %p exactly once',
    async raw => {
      const api = createGCCEApi();
      gcce = new GCCE(api);
      await gcce.init();
      gcce.registerRawResponseHandlerForPlugin('streamalchemy', message => (
        /^[ABC1-4][.!?…]*$/i.test(message.trim())
          ? { handled: true, reason: 'sealed' }
          : { handled: false }
      ));
      const { plugin, chatHandler } = createTtsSubject(gcce);
      const data = {
        eventId: `evt-normalized-${Buffer.from(raw).toString('hex')}`,
        timestamp: '2026-01-01T00:00:05.000Z',
        text: raw,
        uniqueId: 'viewer_one'
      };

      const ttsFirst = chatHandler(data);
      await Promise.resolve();
      await gcce.handleChatMessage(data);
      await ttsFirst;

      expect(plugin.speak).not.toHaveBeenCalled();
      expect(api.emitted.filter(entry => (
        entry.event === 'gcce:chat_consumed' &&
        entry.data.correlationId === `tiktok:${data.eventId}`
      ))).toHaveLength(1);
    }
  );

  test.each(['ABC', 'A text'])('keeps rejected compound raw input %p audible', async raw => {
    const api = createGCCEApi();
    gcce = new GCCE(api);
    await gcce.init();
    gcce.registerRawResponseHandlerForPlugin('streamalchemy', () => ({ handled: false }));
    const { plugin, chatHandler } = createTtsSubject(gcce);
    const data = {
      eventId: `evt-rejected-${raw.replace(/\s+/g, '-')}`,
      timestamp: '2026-01-01T00:00:06.000Z',
      ...(raw === 'A text' ? { text: raw } : { comment: raw }),
      uniqueId: 'viewer_one'
    };

    await chatHandler(data);
    await gcce.handleChatMessage(data);

    expect(plugin.speak).toHaveBeenCalledWith(expect.objectContaining({
      text: raw,
      source: 'chat'
    }));
  });

  test.each([
    {
      label: 'eligible comment over unrelated message and text',
      data: {
        comment: 'A...',
        message: 'unrelated message',
        text: 'unrelated text'
      },
      expected: 'A...'
    },
    {
      label: 'unrelated comment over eligible message and text',
      data: {
        comment: 'hello stream',
        message: 'B!',
        text: 'C?'
      },
      expected: 'hello stream'
    }
  ])('uses comment || message || text precedence for $label', async ({
    data,
    expected
  }) => {
    const api = createGCCEApi();
    gcce = new GCCE(api);
    await gcce.init();
    gcce.registerRawResponseHandlerForPlugin('streamalchemy', () => ({
      handled: false
    }));
    const { plugin, chatHandler } = createTtsSubject(gcce);
    const event = {
      eventId: `evt-precedence-${expected.replace(/\W+/g, '-')}`,
      timestamp: '2026-01-01T00:00:07.000Z',
      uniqueId: 'viewer_one',
      ...data
    };

    const ttsFirst = chatHandler(event);
    await Promise.resolve();
    await gcce.handleChatMessage(event);
    await ttsFirst;

    expect(plugin.speak).toHaveBeenCalledWith(expect.objectContaining({
      text: expected,
      source: 'chat'
    }));
  });
});
