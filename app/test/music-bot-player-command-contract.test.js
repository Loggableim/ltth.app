const contract = require('../plugins/music-bot/lib/player-command-contract');

describe('Music Bot player command contract (lt-j9s T1)', () => {
  test('exposes the canonical command types', () => {
    expect(contract.PLAYER_COMMAND_TYPES).toEqual(['play', 'skip', 'status']);
  });

  test('default names, aliases and permissions are consistent with T2', () => {
    expect(contract.PLAYER_COMMAND_NAMES).toEqual({ play: 'play', skip: 'skip', status: 'status' });
    expect(contract.PLAYER_COMMAND_ALIASES).toEqual({ play: ['resumeplay'], skip: [], status: ['state'] });
    expect(contract.PLAYER_COMMAND_PERMISSIONS).toEqual({ play: 'mod', skip: 'viewer', status: 'viewer' });
    expect(contract.DEFAULT_CHAT_PLAYER_COMMAND_COOLDOWN_MS).toBe(5000);
  });

  describe('normalizeCommandKey', () => {
    test('trims, lowercases and strips the prefix', () => {
      expect(contract.normalizeCommandKey('  !PLAY ')).toBe('play');
    });

    test('keeps keys without prefix intact', () => {
      expect(contract.normalizeCommandKey('ResumePlay')).toBe('resumeplay');
    });

    test('handles nullish input', () => {
      expect(contract.normalizeCommandKey(null)).toBe('');
      expect(contract.normalizeCommandKey(undefined)).toBe('');
    });
  });

  describe('resolvePlayerCommandType', () => {
    test.each(['play', 'PLAY', '!play'])('resolves %s to play', (key) => {
      expect(contract.resolvePlayerCommandType(key)).toBe('play');
    });

    test('resolves aliases', () => {
      expect(contract.resolvePlayerCommandType('resumeplay')).toBe('play');
      expect(contract.resolvePlayerCommandType('!state')).toBe('status');
    });

    test('honours configured command names', () => {
      expect(contract.resolvePlayerCommandType('weiter', { commands: { play: 'weiter' } })).toBe('play');
    });

    test('returns null for unknown keys', () => {
      expect(contract.resolvePlayerCommandType('song')).toBeNull();
      expect(contract.resolvePlayerCommandType('')).toBeNull();
    });
  });

  describe('buildPlayerCommandPayload', () => {
    test('play without argument means resume/start', () => {
      expect(contract.buildPlayerCommandPayload('play', [])).toEqual({ type: 'play', index: null });
    });

    test('play converts a 1-based queue position to 0-based', () => {
      expect(contract.buildPlayerCommandPayload('play', ['1'])).toEqual({ type: 'play', index: 0 });
      expect(contract.buildPlayerCommandPayload('play', ['3'])).toEqual({ type: 'play', index: 2 });
    });

    test('play floors decimal positions', () => {
      expect(contract.buildPlayerCommandPayload('play', ['2.9'])).toEqual({ type: 'play', index: 1 });
    });

    test('play falls back to resume for invalid positions', () => {
      expect(contract.buildPlayerCommandPayload('play', ['0'])).toEqual({ type: 'play', index: null });
      expect(contract.buildPlayerCommandPayload('play', ['-2'])).toEqual({ type: 'play', index: null });
      expect(contract.buildPlayerCommandPayload('play', ['abc'])).toEqual({ type: 'play', index: null });
    });

    test('skip is forced for roles above viewer', () => {
      expect(contract.buildPlayerCommandPayload('skip', [], 'viewer')).toEqual({ type: 'skip', force: false });
      expect(contract.buildPlayerCommandPayload('skip', [], 'mod')).toEqual({ type: 'skip', force: true });
      expect(contract.buildPlayerCommandPayload('skip', [], 'streamer')).toEqual({ type: 'skip', force: true });
    });

    test('status has no arguments', () => {
      expect(contract.buildPlayerCommandPayload('status', ['ignored'])).toEqual({ type: 'status' });
    });

    test('returns null for non player command types', () => {
      expect(contract.buildPlayerCommandPayload('request', ['song'])).toBeNull();
    });
  });

  describe('parsePlayerCommand', () => {
    test('parses a bare play message', () => {
      expect(contract.parsePlayerCommand('!play', { permission: 'mod' })).toEqual({ type: 'play', index: null });
    });

    test('parses play with a position', () => {
      expect(contract.parsePlayerCommand('!play 4', { permission: 'mod' })).toEqual({ type: 'play', index: 3 });
    });

    test('parses the status alias with a configured prefix', () => {
      expect(contract.parsePlayerCommand('#state', { prefix: '#' })).toEqual({ type: 'status' });
    });

    test('parses a skip message with the effective permission', () => {
      expect(contract.parsePlayerCommand('!skip', { permission: 'mod' })).toEqual({ type: 'skip', force: true });
      expect(contract.parsePlayerCommand('!skip')).toEqual({ type: 'skip', force: false });
    });

    test('ignores messages without prefix or unknown commands', () => {
      expect(contract.parsePlayerCommand('play')).toBeNull();
      expect(contract.parsePlayerCommand('!song foo')).toBeNull();
      expect(contract.parsePlayerCommand('!')).toBeNull();
      expect(contract.parsePlayerCommand('')).toBeNull();
      expect(contract.parsePlayerCommand(null)).toBeNull();
      expect(contract.parsePlayerCommand(42)).toBeNull();
    });

    test('is case insensitive and tolerates extra whitespace', () => {
      expect(contract.parsePlayerCommand('  !PLAY   2  ', { permission: 'mod' })).toEqual({ type: 'play', index: 1 });
    });
  });

  describe('isValidPlayerCommandPayload', () => {
    test('accepts canonical payloads', () => {
      expect(contract.isValidPlayerCommandPayload({ type: 'play', index: null })).toBe(true);
      expect(contract.isValidPlayerCommandPayload({ type: 'play', index: 0 })).toBe(true);
      expect(contract.isValidPlayerCommandPayload({ type: 'skip', force: true })).toBe(true);
      expect(contract.isValidPlayerCommandPayload({ type: 'status' })).toBe(true);
    });

    test('rejects malformed payloads', () => {
      expect(contract.isValidPlayerCommandPayload(null)).toBe(false);
      expect(contract.isValidPlayerCommandPayload({ type: 'request' })).toBe(false);
      expect(contract.isValidPlayerCommandPayload({ type: 'play', index: -1 })).toBe(false);
      expect(contract.isValidPlayerCommandPayload({ type: 'play', index: 1.5 })).toBe(false);
      expect(contract.isValidPlayerCommandPayload({ type: 'skip' })).toBe(false);
    });
  });

  test('createCooldownKey scopes the cooldown per command and user', () => {
    expect(contract.createCooldownKey('play', 'Alice')).toBe('play:alice');
    expect(contract.createCooldownKey('play')).toBe('play:viewer');
  });

  describe('status output', () => {
    test('returns defaults for an empty state', () => {
      expect(contract.buildPlayerStatusSnapshot()).toEqual({
        safetyLocked: false,
        state: 'idle',
        nowPlayingTitle: null,
        queueLength: 0
      });
    });

    test('normalizes the queue length', () => {
      expect(contract.buildPlayerStatusSnapshot({ queueLength: -3 }).queueLength).toBe(0);
      expect(contract.buildPlayerStatusSnapshot({ queueLength: 2.8 }).queueLength).toBe(2);
      expect(contract.buildPlayerStatusSnapshot({ queueLength: 'nope' }).queueLength).toBe(0);
    });

    test('reports the safety lock', () => {
      expect(contract.formatPlayerStatusMessage({ safetyLocked: true, queueLength: 2 }))
        .toBe('Status: gesperrt (Safety-Lock) | Queue: 2');
    });

    test('reports the running track', () => {
      expect(contract.formatPlayerStatusMessage({
        state: 'playing',
        nowPlaying: { title: 'Hero' },
        queueLength: 1
      })).toBe('Status: playing | Jetzt läuft: Hero | Queue: 1');
    });

    test('reports an idle player without track', () => {
      expect(contract.formatPlayerStatusMessage({ state: 'idle' }))
        .toBe('Status: idle | Nichts läuft | Queue: 0');
    });
  });
});
