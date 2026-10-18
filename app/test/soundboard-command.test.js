'use strict';

/**
 * Tests fuer den Chat-Befehl `!sound <name>` (Bead lt-6rm, Epic lt-mx7 T2).
 *
 * Deckt den Soundboard-Command-Client, die Fehlerpfade des Handlers und die
 * GCCE-Registrierung/-Ausfuehrung gegen ein gemocktes Soundboard-Backend ab.
 * Es laeuft keine echte Audio-Wiedergabe und kein echter Netzwerkzugriff.
 */

const {
  SoundboardCommandClient,
  ERROR_CODES,
  RESOLUTION_SOURCES,
  normalizeSoundName,
  soundKey,
  makeResolvedSound
} = require('../plugins/soundboard/command-client');
const { SoundboardCommandHandler } = require('../plugins/soundboard/command-handler');
const SoundboardPlugin = require('../plugins/soundboard/main');
const GCCE = require('../plugins/gcce');
const CommandParser = require('../plugins/gcce/commandParser');
const CommandRegistry = require('../plugins/gcce/commandRegistry');

const GIFT_SOUNDS = [
  { giftId: 123, label: 'Airhorn', mp3Url: 'https://cdn.example/airhorn.mp3', volume: 0.8 },
  { giftId: 456, label: 'Boom', mp3Url: 'https://cdn.example/boom.mp3', volume: 1.0 }
];

function createLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

function createFakeSoundboard(overrides = {}) {
  const sounds = GIFT_SOUNDS.map(sound => ({ ...sound }));
  return {
    playSound: jest.fn().mockResolvedValue(undefined),
    destroy: jest.fn(),
    getAllGiftSounds: jest.fn(() => sounds.map(sound => ({ ...sound }))),
    getGiftSound: jest.fn((giftId) => {
      const found = sounds.find(sound => Number(sound.giftId) === Number(giftId));
      return found ? { ...found } : null;
    }),
    ...overrides
  };
}

function createFakeDb(settings = {}, catalog = []) {
  return {
    getSetting: jest.fn((key) => (key in settings ? settings[key] : null)),
    db: {
      prepare: jest.fn((sql) => ({
        get: jest.fn((value) => {
          if (!/gift_catalog/i.test(sql)) return undefined;
          const match = catalog.find(row => String(row.name).toLowerCase() === String(value).toLowerCase());
          return match ? { id: match.id } : undefined;
        })
      }))
    }
  };
}

function createClient(overrides = {}) {
  return new SoundboardCommandClient({
    soundboard: createFakeSoundboard(),
    db: createFakeDb({ soundboard_enabled: 'true', soundboard_audio_target: 'both' }),
    logger: createLogger(),
    soundsDir: '/sounds',
    fs: { readdirSync: jest.fn(() => ['Boing.wav', 'note.mp3']) },
    myinstants: {
      search: jest.fn().mockResolvedValue([{ name: 'Wow', url: 'https://cdn.example/wow.mp3' }]),
      resolvePageUrl: jest.fn().mockResolvedValue('https://cdn.example/page.mp3'),
      isValidMyInstantsUrl: jest.fn().mockReturnValue(false)
    },
    fetcher: { validateExternalUrl: jest.fn((url) => ({ valid: true, url })) },
    ...overrides
  });
}

describe('soundboard command-client helpers', () => {
  test('normalizeSoundName trims, collapses whitespace and rejects invalid input', () => {
    expect(normalizeSoundName('  Air   Horn  ')).toBe('Air Horn');
    expect(normalizeSoundName('Air\u0000Horn')).toBe('');
    expect(normalizeSoundName('')).toBe('');
    expect(normalizeSoundName('   ')).toBe('');
    expect(normalizeSoundName(null)).toBe('');
    expect(normalizeSoundName('x'.repeat(101))).toBe('');
    expect(normalizeSoundName('x'.repeat(100))).toHaveLength(100);
  });

  test('soundKey lowercases the normalized name', () => {
    expect(soundKey('  Boom  ')).toBe('boom');
    expect(soundKey(undefined)).toBe('');
  });

  test('makeResolvedSound validates and freezes the result', () => {
    const sound = makeResolvedSound({ name: 'Boom', url: 'https://x/b.mp3', source: RESOLUTION_SOURCES.url });
    expect(sound).toEqual({
      name: 'Boom',
      url: 'https://x/b.mp3',
      volume: 1,
      label: 'Boom',
      source: 'url',
      giftId: null
    });
    expect(Object.isFrozen(sound)).toBe(true);
    expect(makeResolvedSound({ name: 'Boom', url: '', source: 'url' })).toBeNull();
    expect(makeResolvedSound({ name: 'Boom', url: 'https://x', source: 'nope' })).toBeNull();
  });
});

describe('SoundboardCommandClient.resolve', () => {
  test('resolves a gift sound by label (case-insensitive)', async () => {
    const client = createClient();
    const sound = await client.resolve('airhorn');
    expect(sound).toMatchObject({ source: 'gift', name: 'Airhorn', url: 'https://cdn.example/airhorn.mp3', giftId: 123 });
  });

  test('resolves a gift sound via the gift catalog name', async () => {
    const client = createClient({
      db: createFakeDb({}, [{ id: 456, name: 'Big Boom' }]),
      soundboard: createFakeSoundboard(),
      fs: { readdirSync: jest.fn(() => []) },
      myinstants: null
    });
    const sound = await client.resolve('big boom');
    expect(sound).toMatchObject({ source: 'gift', url: 'https://cdn.example/boom.mp3', giftId: 456 });
  });

  test('resolves a local file when no gift matches', async () => {
    const client = createClient();
    const sound = await client.resolve('boing');
    expect(sound).toMatchObject({ source: 'local', url: '/sounds/Boing.wav', label: 'Boing' });
  });

  test('resolves an external URL when it is whitelisted', async () => {
    const client = createClient();
    const sound = await client.resolve('https://cdn.example/custom.mp3');
    expect(sound).toMatchObject({ source: 'url', url: 'https://cdn.example/custom.mp3' });
  });

  test('rejects a non-whitelisted external URL', async () => {
    const client = createClient({
      fetcher: { validateExternalUrl: jest.fn(() => ({ valid: false, error: 'host not allowed' })) }
    });
    await expect(client.resolve('https://evil.example/x.mp3')).resolves.toBeNull();
  });

  test('falls back to a MyInstants search result', async () => {
    const client = createClient();
    const sound = await client.resolve('wow');
    expect(sound).toMatchObject({ source: 'myinstants', url: 'https://cdn.example/wow.mp3', label: 'Wow' });
  });

  test('resolves a MyInstants page URL via resolvePageUrl', async () => {
    const myinstants = {
      search: jest.fn(),
      resolvePageUrl: jest.fn().mockResolvedValue('https://cdn.example/page.mp3'),
      isValidMyInstantsUrl: jest.fn().mockReturnValue(true)
    };
    const client = createClient({ myinstants });
    const sound = await client.resolve('https://www.myinstants.com/en/instant/wow/');
    expect(sound).toMatchObject({ source: 'myinstants', url: 'https://cdn.example/page.mp3' });
  });

  test('returns null for an unknown sound and for empty input', async () => {
    const client = createClient({
      soundboard: createFakeSoundboard({ getAllGiftSounds: () => [], getGiftSound: () => null }),
      fs: { readdirSync: jest.fn(() => []) },
      myinstants: { search: jest.fn().mockResolvedValue([]), isValidMyInstantsUrl: jest.fn(() => false) }
    });
    await expect(client.resolve('does-not-exist')).resolves.toBeNull();
    await expect(client.resolve('')).resolves.toBeNull();
  });

  test('propagates backend failures so the handler can report them', async () => {
    const client = createClient({
      soundboard: createFakeSoundboard({ getAllGiftSounds: () => { throw new Error('db down'); } }),
      db: createFakeDb()
    });
    await expect(client.resolve('airhorn')).rejects.toThrow('db down');
  });
});

describe('SoundboardCommandClient.play', () => {
  test('plays through playSound with command event type and audit info', async () => {
    const soundboard = createFakeSoundboard();
    const client = createClient({ soundboard, db: createFakeDb({ soundboard_audio_target: 'obs_overlay' }) });
    const sound = await client.resolve('airhorn');

    const result = await client.play(sound, { requestedBy: 'viewer-7' });

    expect(soundboard.playSound).toHaveBeenCalledWith(
      'https://cdn.example/airhorn.mp3',
      0.8,
      'Airhorn',
      { eventType: 'command', giftId: 123, requestedBy: 'viewer-7' }
    );
    expect(result).toMatchObject({ success: true, audioTarget: 'obs_overlay' });
  });

  test('reports SOUNDBOARD_DISABLED without calling the backend', async () => {
    const soundboard = createFakeSoundboard();
    const client = createClient({ soundboard, db: createFakeDb({ soundboard_enabled: 'false' }) });
    const sound = makeResolvedSound({ name: 'Boom', url: 'https://x/b.mp3', source: 'url' });

    const result = await client.play(sound, { requestedBy: 'u' });

    expect(result).toMatchObject({ success: false, errorCode: ERROR_CODES.SOUNDBOARD_DISABLED });
    expect(soundboard.playSound).not.toHaveBeenCalled();
  });

  test('normalizes unknown audio targets to the default', () => {
    const client = createClient({ db: createFakeDb({ soundboard_audio_target: 'bogus' }) });
    expect(client.getAudioTarget()).toBe('both');
  });

  test('throws for malformed sound objects', async () => {
    const client = createClient();
    await expect(client.play({ name: 'x', url: '', source: 'url' })).rejects.toThrow(TypeError);
  });
});

describe('SoundboardCommandHandler', () => {
  function createHandler(clientOverrides = {}) {
    const client = {
      isEnabled: jest.fn(() => true),
      resolve: jest.fn(),
      play: jest.fn(),
      ...clientOverrides
    };
    const logger = createLogger();
    return { handler: new SoundboardCommandHandler({ client, logger }), client, logger };
  }

  test('reports an empty name', async () => {
    const { handler, client } = createHandler();
    const result = await handler.handle([], {});
    expect(result).toMatchObject({ success: false, errorCode: ERROR_CODES.EMPTY_NAME, displayOverlay: true });
    expect(client.resolve).not.toHaveBeenCalled();
  });

  test('rejects invalid names before resolving', async () => {
    const { handler, client } = createHandler();
    const result = await handler.handle(['bad\u0000name'], {});
    expect(result.errorCode).toBe(ERROR_CODES.INVALID_NAME);
    expect(client.resolve).not.toHaveBeenCalled();
  });

  test('reports a disabled soundboard', async () => {
    const { handler, client } = createHandler({ isEnabled: jest.fn(() => false) });
    const result = await handler.handle(['airhorn'], {});
    expect(result.errorCode).toBe(ERROR_CODES.SOUNDBOARD_DISABLED);
    expect(client.resolve).not.toHaveBeenCalled();
  });

  test('reports an unknown sound with the requested name', async () => {
    const { handler } = createHandler({ resolve: jest.fn().mockResolvedValue(null) });
    const result = await handler.handle(['nope'], { userId: 'u1' });
    expect(result).toMatchObject({ success: false, errorCode: ERROR_CODES.SOUND_NOT_FOUND });
    expect(result.error).toContain('nope');
  });

  test('reports resolve failures', async () => {
    const { handler } = createHandler({ resolve: jest.fn().mockRejectedValue(new Error('backend down')) });
    const result = await handler.handle(['airhorn'], {});
    expect(result.errorCode).toBe(ERROR_CODES.RESOLVE_FAILED);
  });

  test('reports playback failures thrown by the backend', async () => {
    const sound = makeResolvedSound({ name: 'Airhorn', url: 'https://x/a.mp3', source: 'gift' });
    const { handler } = createHandler({
      resolve: jest.fn().mockResolvedValue(sound),
      play: jest.fn().mockRejectedValue(new Error('socket gone'))
    });
    const result = await handler.handle(['airhorn'], {});
    expect(result.errorCode).toBe(ERROR_CODES.PLAYBACK_FAILED);
  });

  test('maps a failed playback result to its error code and params', async () => {
    const sound = makeResolvedSound({ name: 'Airhorn', url: 'https://x/a.mp3', source: 'gift' });
    const { handler } = createHandler({
      resolve: jest.fn().mockResolvedValue(sound),
      play: jest.fn().mockResolvedValue({ success: false, errorCode: ERROR_CODES.SOUND_NOT_FOUND, params: { name: 'airhorn' } })
    });
    const result = await handler.handle(['airhorn'], {});
    expect(result.errorCode).toBe(ERROR_CODES.SOUND_NOT_FOUND);
  });

  test('reports success and joins multi-word names', async () => {
    const sound = makeResolvedSound({ name: 'Air Horn', url: 'https://x/a.mp3', source: 'gift' });
    const play = jest.fn().mockResolvedValue({
      success: true,
      sound,
      audioTarget: 'both'
    });
    const { handler, client } = createHandler({
      resolve: jest.fn().mockResolvedValue(sound),
      play
    });

    const result = await handler.handle(['air', 'horn'], { userId: 'viewer-1' });

    expect(client.resolve).toHaveBeenCalledWith('air horn');
    expect(play).toHaveBeenCalledWith(sound, { requestedBy: 'viewer-1' });
    expect(result).toMatchObject({ success: true, message: 'Playing "Air Horn"' });
  });
});

describe('SoundboardPlugin GCCE integration', () => {
  function createGcceHarness() {
    const logger = createLogger();
    const registry = new CommandRegistry(logger);
    const parser = new CommandParser(registry, {
      checkPermission: () => true,
      getPermissionName: (permission) => permission
    }, logger, { commandPrefix: '/' });
    const gcce = Object.assign(Object.create(GCCE.prototype), {
      api: { log: jest.fn() },
      registry,
      parser
    });
    return { gcce, registry, parser };
  }

  function createPlugin(gcceInstance) {
    const api = {
      log: jest.fn(),
      on: jest.fn(() => true),
      removeListener: jest.fn(),
      getDatabase: jest.fn(() => createFakeDb({ soundboard_enabled: 'true', soundboard_audio_target: 'both' })),
      getPlugin: jest.fn(() => gcceInstance),
      pluginLoader: { loadedPlugins: new Map([['gcce', { instance: gcceInstance }]]) }
    };
    const plugin = new SoundboardPlugin(api);
    plugin.soundboard = createFakeSoundboard();
    plugin.myinstantsAPI = {
      search: jest.fn().mockResolvedValue([{ name: 'Wow', url: 'https://cdn.example/wow.mp3' }]),
      isValidMyInstantsUrl: jest.fn(() => false)
    };
    plugin.fetcher = { validateExternalUrl: jest.fn((url) => ({ valid: true, url })) };
    return { plugin, api };
  }

  test('initSoundCommand wires a contract-shaped client', () => {
    const { gcce } = createGcceHarness();
    const { plugin } = createPlugin(gcce);
    plugin.initSoundCommand();

    expect(plugin.commandClient).toBeInstanceOf(SoundboardCommandClient);
    expect(typeof plugin.commandHandler.handle).toBe('function');
    expect(plugin.api.getDatabase).toHaveBeenCalled();
  });

  test('registers !sound and plays a known sound end to end', async () => {
    const { gcce, parser } = createGcceHarness();
    const { plugin } = createPlugin(gcce);
    plugin.initSoundCommand();
    plugin.registerGCCECommands();

    expect(plugin.gcceCommandsRegistered).toBe(true);
    expect(parser.registry.getCommand('sound')).toMatchObject({
      pluginId: 'soundboard',
      permission: 'all',
      cooldown: { user: 5000, global: 2000 }
    });

    const result = await parser.parse('/sound airhorn', { userId: 'viewer-1', username: 'viewer', userRole: 'all' });
    expect(result).toMatchObject({ success: true, commandName: 'sound' });
    expect(plugin.soundboard.playSound).toHaveBeenCalledWith(
      'https://cdn.example/airhorn.mp3',
      0.8,
      'Airhorn',
      expect.objectContaining({ eventType: 'command', requestedBy: 'viewer-1' })
    );
  });

  test('returns a clear chat error for an unknown sound', async () => {
    const { gcce, parser } = createGcceHarness();
    const { plugin } = createPlugin(gcce);
    plugin.soundboard.getAllGiftSounds = jest.fn(() => []);
    plugin.soundboard.getGiftSound = jest.fn(() => null);
    plugin.initSoundCommand();
    plugin.commandClient.soundsDir = null;
    plugin.commandClient.myinstants = { search: jest.fn().mockResolvedValue([]), isValidMyInstantsUrl: jest.fn(() => false) };
    plugin.registerGCCECommands();

    const result = await parser.parse('/sound does-not-exist', { userId: 'u', username: 'u', userRole: 'all' });
    expect(result).toMatchObject({ success: false, errorCode: ERROR_CODES.SOUND_NOT_FOUND });
    expect(result.error).toContain('does-not-exist');
  });

  test('enforces the command cooldown (anti-abuse)', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-18T12:00:00.000Z'));
    try {
      const { gcce, parser } = createGcceHarness();
      const { plugin } = createPlugin(gcce);
      plugin.initSoundCommand();
      plugin.registerGCCECommands();

      const context = { userId: 'viewer-1', username: 'viewer', userRole: 'all' };
      await expect(parser.parse('/sound airhorn', context)).resolves.toMatchObject({ success: true });
      await expect(parser.parse('/sound boom', context)).resolves.toMatchObject({
        success: false,
        errorCode: 'COMMAND_ON_COOLDOWN'
      });
    } finally {
      jest.useRealTimers();
    }
  });

  test('unregisters its command and listeners on destroy', async () => {
    const { gcce, registry } = createGcceHarness();
    const { plugin } = createPlugin(gcce);
    plugin.initSoundCommand();
    plugin.registerGCCECommands();
    expect(registry.getCommand('sound')).toBeTruthy();

    await plugin.destroy();

    expect(registry.getCommand('sound')).toBeFalsy();
    expect(plugin.api.removeListener).toBeDefined();
  });
});
