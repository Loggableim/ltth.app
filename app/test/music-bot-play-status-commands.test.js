const CommandParser = require('../plugins/music-bot/lib/command-parser');
const MusicBotPlugin = require('../plugins/music-bot/main');

function createParserApi() {
  return {
    getDatabase: () => ({ prepare: () => ({ get: () => null }) }),
    log: jest.fn()
  };
}

function createParser({ permissions = { play: 'mod', status: 'viewer' }, chatCallback = null } = {}) {
  return new CommandParser(
    {
      commandPrefix: '!',
      commands: { play: 'play', status: 'status' },
      commandAliases: { play: [], status: [] },
      permissions
    },
    null,
    null,
    null,
    createParserApi(),
    null,
    chatCallback
  );
}

function createDb() {
  return {
    prepare: () => ({ run: jest.fn(), get: () => null, all: () => [] })
  };
}

function createPlugin({ state = 'idle', nowPlaying = null, queue = [] } = {}) {
  const api = {
    getSocketIO: () => ({ emit: jest.fn() }),
    getDatabase: () => createDb(),
    emit: jest.fn(),
    log: jest.fn()
  };
  const plugin = new MusicBotPlugin(api);
  plugin._emitChatResponse = jest.fn();
  plugin._emitQueue = jest.fn();
  plugin._emitPaused = jest.fn();
  plugin._emitResumed = jest.fn();
  plugin.queueManager = {
    getQueue: jest.fn(() => queue),
    reorderSong: jest.fn((index) => ({ success: true, song: queue[index] || null }))
  };
  plugin.playbackEngine = {
    getState: jest.fn(() => state),
    getNowPlaying: jest.fn(() => nowPlaying),
    isPlaying: jest.fn(() => state === 'playing'),
    resume: jest.fn(async () => true),
    skip: jest.fn(async () => true)
  };
  plugin._playNextFromQueue = jest.fn(async () => ({
    success: true,
    song: { id: 'next-track', title: 'Next track' }
  }));
  plugin._skipCurrent = jest.fn(async () => ({
    success: true,
    next: { id: 'after-skip', title: 'After skip' }
  }));
  return plugin;
}

describe('Music Bot play/status chat commands', () => {
  describe('command parser', () => {
    test('parses bare !play as a player command without queue position', async () => {
      const commands = [];
      await createParser().parse(
        { message: '!play', username: 'mod', isModerator: true },
        (command) => commands.push(command)
      );
      expect(commands).toEqual([{ type: 'play', index: null }]);
    });

    test('parses !play <position> into a zero-based queue index', async () => {
      const commands = [];
      await createParser().parse(
        { message: '!play 3', username: 'mod', isModerator: true },
        (command) => commands.push(command)
      );
      expect(commands).toEqual([{ type: 'play', index: 2 }]);
    });

    test('parses !status as a status command', async () => {
      const commands = [];
      await createParser().parse(
        { message: '!status', username: 'viewer' },
        (command) => commands.push(command)
      );
      expect(commands).toEqual([{ type: 'status' }]);
    });

    test('denies !play for viewers when the required role is mod', async () => {
      const commands = [];
      const responses = [];
      const parser = createParser({ chatCallback: (payload) => responses.push(payload) });

      await parser.parse(
        { message: '!play', username: 'viewer', isModerator: false },
        (command) => commands.push(command)
      );

      expect(commands).toEqual([]);
      expect(responses).toHaveLength(1);
      expect(responses[0].message).toContain('Keine Berechtigung');
    });

    test('allows !play for moderators', async () => {
      const commands = [];
      await createParser().parse(
        { message: '!play 1', username: 'mod', isModerator: true },
        (command) => commands.push(command)
      );
      expect(commands).toEqual([{ type: 'play', index: 0 }]);
    });
  });

  describe('plugin wiring', () => {
    test('exposes play and status as configurable commands with sane defaults', () => {
      const plugin = createPlugin();
      expect(plugin.config.commands.play).toBe('play');
      expect(plugin.config.commands.status).toBe('status');
      expect(plugin.config.permissions.play).toBe('mod');
      expect(plugin.config.permissions.status).toBe('viewer');
      expect(plugin.config.commandAliases.request).not.toContain('play');
    });

    test('!status reports the internal player state, title and queue length', async () => {
      const plugin = createPlugin({
        state: 'playing',
        nowPlaying: { id: 'track-1', title: 'Track One' },
        queue: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }]
      });

      await plugin._handleCommand({ type: 'status' }, { username: 'viewer' });

      expect(plugin._emitChatResponse).toHaveBeenCalledTimes(1);
      const [message, username] = plugin._emitChatResponse.mock.calls[0];
      expect(username).toBe('viewer');
      expect(message).toContain('Status: playing');
      expect(message).toContain('Track One');
      expect(message).toContain('Queue: 2');
    });

    test('!status surfaces the safety lock consistently', async () => {
      const plugin = createPlugin({ state: 'locked', nowPlaying: null });
      plugin.config.safety = { locked: true, lockedAt: Date.now(), reason: 'test' };

      await plugin._handleCommand({ type: 'status' }, { username: 'viewer' });

      const [message] = plugin._emitChatResponse.mock.calls[0];
      expect(message).toContain('gesperrt');
    });

    test('!play resumes a paused player instead of starting a new track', async () => {
      const plugin = createPlugin({
        state: 'paused',
        nowPlaying: { id: 'track-1', title: 'Track One' }
      });

      await plugin._handleCommand({ type: 'play', index: null }, { username: 'mod' });

      expect(plugin.playbackEngine.resume).toHaveBeenCalledTimes(1);
      expect(plugin._playNextFromQueue).not.toHaveBeenCalled();
      expect(plugin._emitChatResponse.mock.calls[0][0]).toContain('Track One');
    });

    test('!play starts the next queued track when the player is idle', async () => {
      const plugin = createPlugin({ state: 'idle', nowPlaying: null });

      await plugin._handleCommand({ type: 'play', index: null }, { username: 'mod' });

      expect(plugin._playNextFromQueue).toHaveBeenCalledWith('chat-play');
      expect(plugin._emitChatResponse.mock.calls[0][0]).toContain('Next track');
    });

    test('!play is a no-op announcement while a track is already playing', async () => {
      const plugin = createPlugin({
        state: 'playing',
        nowPlaying: { id: 'track-1', title: 'Track One' }
      });

      await plugin._handleCommand({ type: 'play', index: null }, { username: 'mod' });

      expect(plugin._playNextFromQueue).not.toHaveBeenCalled();
      expect(plugin.playbackEngine.resume).not.toHaveBeenCalled();
      expect(plugin._emitChatResponse.mock.calls[0][0]).toContain('läuft bereits');
    });

    test('!play <position> jumps to the queue position via the player', async () => {
      const plugin = createPlugin({
        state: 'playing',
        nowPlaying: { id: 'track-1', title: 'Track One' },
        queue: [
          { id: 'a', title: 'A' },
          { id: 'b', title: 'B' },
          { id: 'c', title: 'C' }
        ]
      });

      await plugin._handleCommand({ type: 'play', index: 2 }, { username: 'mod' });

      expect(plugin.queueManager.reorderSong).toHaveBeenCalledWith(2, 0);
      expect(plugin._skipCurrent).toHaveBeenCalledTimes(1);
      expect(plugin._emitQueue).toHaveBeenCalledTimes(1);
      expect(plugin._emitChatResponse.mock.calls[0][0]).toContain('After skip');
    });

    test('!play <position> rejects an out-of-range index without touching the player', async () => {
      const plugin = createPlugin({ state: 'idle', queue: [{ id: 'a', title: 'A' }] });

      await plugin._handleCommand({ type: 'play', index: 5 }, { username: 'mod' });

      expect(plugin.queueManager.reorderSong).not.toHaveBeenCalled();
      expect(plugin._skipCurrent).not.toHaveBeenCalled();
      expect(plugin._playNextFromQueue).not.toHaveBeenCalled();
      expect(plugin._emitChatResponse.mock.calls[0][0]).toContain('Position');
    });

    test('!play is blocked by the safety lock', async () => {
      const plugin = createPlugin({ state: 'idle' });
      plugin.config.safety = { locked: true, lockedAt: Date.now(), reason: 'test' };

      await plugin._handleCommand({ type: 'play', index: null }, { username: 'mod' });

      expect(plugin._playNextFromQueue).not.toHaveBeenCalled();
      expect(plugin._emitChatResponse.mock.calls[0][0]).toContain('gesperrt');
    });

    test('enforces a per-user cooldown for repeated !play commands', async () => {
      const plugin = createPlugin({ state: 'idle' });
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);

      await plugin._handleCommand({ type: 'play', index: null }, { username: 'mod' });
      expect(plugin._playNextFromQueue).toHaveBeenCalledTimes(1);

      await plugin._handleCommand({ type: 'play', index: null }, { username: 'mod' });
      expect(plugin._playNextFromQueue).toHaveBeenCalledTimes(1);
      expect(plugin._emitChatResponse.mock.calls[1][0]).toContain('Bitte warte');

      nowSpy.mockReturnValue(1_000_000 + 6000);
      await plugin._handleCommand({ type: 'play', index: null }, { username: 'mod' });
      expect(plugin._playNextFromQueue).toHaveBeenCalledTimes(2);

      nowSpy.mockRestore();
    });
  });
});
