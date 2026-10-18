'use strict';

const {
  CONTRACT_VERSION,
  COMMAND_NAME,
  RESOLUTION_SOURCES,
  SOURCE_ORDER,
  EVENT_TYPES,
  COMMAND_EVENT_TYPE,
  AUDIO_TARGETS,
  DEFAULT_AUDIO_TARGET,
  DEFAULT_VOLUME,
  MAX_NAME_LENGTH,
  ERROR_CODES,
  MESSAGE_KEYS,
  DEFAULT_MESSAGES,
  REQUIRED_CLIENT_METHODS,
  SUCCESS_MESSAGE_KEY,
  normalizeSoundName,
  assertSoundRequest,
  isSoundRequest,
  assertResolvedSound,
  createPlaybackError,
  createPlaybackSuccess,
  toCommandResult,
  isSoundboardClient,
  assertSoundboardClient,
  createInMemorySoundboardClient
} = require('../modules/soundboard-contract');

const AIRHORN = { name: 'airhorn', url: 'https://cdn.example/airhorn.mp3', source: RESOLUTION_SOURCES.myinstants };

describe('soundboard-contract constants', () => {
  test('exposes a version and the documented constants', () => {
    expect(typeof CONTRACT_VERSION).toBe('string');
    expect(CONTRACT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(COMMAND_NAME).toBe('sound');
    expect(RESOLUTION_SOURCES).toEqual({
      gift: 'gift',
      local: 'local',
      url: 'url',
      myinstants: 'myinstants'
    });
    expect(SOURCE_ORDER).toEqual(['gift', 'local', 'url', 'myinstants']);
    expect(COMMAND_EVENT_TYPE).toBe('command');
    expect(EVENT_TYPES).toContain(COMMAND_EVENT_TYPE);
    expect(AUDIO_TARGETS).toEqual(['dashboard', 'obs_overlay', 'both']);
    expect(DEFAULT_AUDIO_TARGET).toBe('both');
    expect(DEFAULT_VOLUME).toBe(1.0);
    expect(MAX_NAME_LENGTH).toBe(100);
  });

  test('freezes every exported constant', () => {
    for (const value of [RESOLUTION_SOURCES, SOURCE_ORDER, EVENT_TYPES, AUDIO_TARGETS, ERROR_CODES, MESSAGE_KEYS, DEFAULT_MESSAGES]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
  });

  test('documents an i18n key and a fallback message for every error code', () => {
    for (const code of Object.values(ERROR_CODES)) {
      expect(typeof MESSAGE_KEYS[code]).toBe('string');
      expect(MESSAGE_KEYS[code]).toMatch(/^soundboard\./);
      expect(typeof DEFAULT_MESSAGES[code]).toBe('string');
    }
  });

  test('REQUIRED_CLIENT_METHODS matches the documented interface', () => {
    expect(REQUIRED_CLIENT_METHODS).toEqual(['isEnabled', 'resolve', 'play']);
    expect(SUCCESS_MESSAGE_KEY).toBe('soundboard.command.success.playing');
  });
});

describe('soundboard-contract normalizeSoundName', () => {
  test('trims and collapses whitespace', () => {
    expect(normalizeSoundName('  air  horn ')).toBe('air horn');
    expect(normalizeSoundName('Airhorn')).toBe('Airhorn');
  });

  test('rejects unusable names', () => {
    for (const value of ['', '   ', 'bad\u0000name', 'x'.repeat(MAX_NAME_LENGTH + 1), null, undefined, 42, {}]) {
      expect(normalizeSoundName(value)).toBe('');
    }
  });

  test('accepts a name at the length limit', () => {
    const name = 'x'.repeat(MAX_NAME_LENGTH);
    expect(normalizeSoundName(name)).toBe(name);
  });
});

describe('soundboard-contract assertSoundRequest', () => {
  test('normalizes a valid request and defaults volume/timestamp', () => {
    const request = assertSoundRequest({ name: '  air horn  ', requestedBy: 'user-1' });
    expect(request.name).toBe('air horn');
    expect(request.requestedBy).toBe('user-1');
    expect(request.volume).toBe(DEFAULT_VOLUME);
    expect(request.source).toBeNull();
    expect(typeof request.timestamp).toBe('number');
    expect(Object.isFrozen(request)).toBe(true);
  });

  test('accepts explicit volume and source', () => {
    const request = assertSoundRequest({ name: 'x', volume: 0.5, source: RESOLUTION_SOURCES.gift, timestamp: 1760000000000 });
    expect(request.volume).toBe(0.5);
    expect(request.source).toBe('gift');
    expect(request.timestamp).toBe(1760000000000);
  });

  test('tags empty and invalid names with the right error code', () => {
    expect(() => assertSoundRequest({})).toThrow(/empty name/);

    let emptyCode;
    try {
      assertSoundRequest({});
    } catch (error) {
      emptyCode = error.code;
    }
    expect(emptyCode).toBe(ERROR_CODES.EMPTY_NAME);

    let invalidCode;
    try {
      assertSoundRequest({ name: 'bad\u0000name' });
    } catch (error) {
      invalidCode = error.code;
    }
    expect(invalidCode).toBe(ERROR_CODES.INVALID_NAME);
  });

  test('rejects invalid volume and unknown source', () => {
    expect(() => assertSoundRequest({ name: 'x', volume: 1.5 })).toThrow(/volume/);
    expect(() => assertSoundRequest({ name: 'x', volume: 'loud' })).toThrow(/volume/);
    expect(() => assertSoundRequest({ name: 'x', source: 'telepathy' })).toThrow(/source/);
    expect(() => assertSoundRequest(null)).toThrow(/must be an object/);
    expect(() => assertSoundRequest([])).toThrow(/must be an object/);
  });

  test('isSoundRequest is the boolean variant', () => {
    expect(isSoundRequest({ name: 'x' })).toBe(true);
    expect(isSoundRequest({ name: '' })).toBe(false);
    expect(isSoundRequest(undefined)).toBe(false);
  });
});

describe('soundboard-contract assertResolvedSound', () => {
  test('fills defaults and freezes the sound', () => {
    const sound = assertResolvedSound(AIRHORN);
    expect(sound).toEqual({
      name: 'airhorn',
      url: 'https://cdn.example/airhorn.mp3',
      volume: DEFAULT_VOLUME,
      label: 'airhorn',
      source: 'myinstants',
      giftId: null
    });
    expect(Object.isFrozen(sound)).toBe(true);
  });

  test('keeps explicit volume, label and giftId', () => {
    const sound = assertResolvedSound({ name: 'pop', url: 'http://x/p', volume: 0.25, label: 'Pop', source: 'gift', giftId: '5655' });
    expect(sound.volume).toBe(0.25);
    expect(sound.label).toBe('Pop');
    expect(sound.giftId).toBe(5655);
  });

  test('rejects contract violations', () => {
    expect(() => assertResolvedSound(null)).toThrow(/must be an object/);
    expect(() => assertResolvedSound({ url: 'http://x' })).toThrow(/name/);
    expect(() => assertResolvedSound({ name: 'x' })).toThrow(/url/);
    expect(() => assertResolvedSound({ name: 'x', url: 'http://x', source: 'nope' })).toThrow(/source/);
    expect(() => assertResolvedSound({ name: 'x', url: 'http://x', source: 'local', volume: 2 })).toThrow(/volume/);
    expect(() => assertResolvedSound({ name: 'x', url: 'http://x', source: 'gift', giftId: -1 })).toThrow(/giftId/);
  });
});

describe('soundboard-contract playback results', () => {
  test('createPlaybackSuccess validates the sound and target', () => {
    const result = createPlaybackSuccess(AIRHORN, { audioTarget: 'dashboard' });
    expect(result.success).toBe(true);
    expect(result.audioTarget).toBe('dashboard');
    expect(result.sound.name).toBe('airhorn');
    expect(result.errorCode).toBeNull();
    expect(Object.isFrozen(result)).toBe(true);
  });

  test('createPlaybackSuccess uses the default target and rejects unknown ones', () => {
    expect(createPlaybackSuccess(AIRHORN).audioTarget).toBe(DEFAULT_AUDIO_TARGET);
    expect(() => createPlaybackSuccess(AIRHORN, { audioTarget: 'tv' })).toThrow(/audio target/);
  });

  test('createPlaybackError interpolates params and rejects unknown codes', () => {
    const result = createPlaybackError(ERROR_CODES.SOUND_NOT_FOUND, { name: 'goose' });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('SOUND_NOT_FOUND');
    expect(result.message).toBe('Unknown sound "goose".');
    expect(result.params).toEqual({ name: 'goose' });
    expect(Object.isFrozen(result)).toBe(true);
    expect(() => createPlaybackError('NOPE')).toThrow(/unknown playback error code/);
  });

  test('leaves unknown placeholders untouched', () => {
    const result = createPlaybackError(ERROR_CODES.SOUND_NOT_FOUND, {});
    expect(result.message).toBe('Unknown sound "{name}".');
  });

  test('toCommandResult maps success and failure onto the GCCE shape', () => {
    const ok = toCommandResult(createPlaybackSuccess(AIRHORN));
    expect(ok).toEqual({
      success: true,
      message: 'Playing "airhorn"',
      messageKey: SUCCESS_MESSAGE_KEY,
      params: { name: 'airhorn' }
    });

    const fail = toCommandResult(createPlaybackError(ERROR_CODES.SOUND_NOT_FOUND, { name: 'goose' }));
    expect(fail).toEqual({
      success: false,
      error: 'Unknown sound "goose".',
      errorCode: 'SOUND_NOT_FOUND',
      messageKey: MESSAGE_KEYS[ERROR_CODES.SOUND_NOT_FOUND],
      params: { name: 'goose' },
      displayOverlay: true
    });
    expect(() => toCommandResult(null)).toThrow(/must be an object/);
  });

  test('toCommandResult exposes a localizable messageKey for every error code', () => {
    for (const code of Object.values(ERROR_CODES)) {
      const result = toCommandResult(createPlaybackError(code, { name: 'x', remaining: 3 }));
      expect(result.messageKey).toBe(MESSAGE_KEYS[code]);
    }
  });
});

describe('soundboard-contract client validation', () => {
  const validClient = {
    isEnabled: () => true,
    resolve: async () => null,
    play: async () => createPlaybackSuccess(AIRHORN)
  };

  test('isSoundboardClient accepts a structurally valid client', () => {
    expect(isSoundboardClient(validClient)).toBe(true);
    expect(isSoundboardClient(createInMemorySoundboardClient().client)).toBe(true);
  });

  test('isSoundboardClient rejects missing or malformed clients', () => {
    expect(isSoundboardClient(null)).toBe(false);
    expect(isSoundboardClient('client')).toBe(false);
    expect(isSoundboardClient({})).toBe(false);
    expect(isSoundboardClient({ isEnabled: true, resolve() {}, play() {} })).toBe(false);
  });

  test('assertSoundboardClient returns the client and lists missing methods', () => {
    expect(assertSoundboardClient(validClient)).toBe(validClient);
    expect(() => assertSoundboardClient(null)).toThrow(/must be an object/);
    expect(() => assertSoundboardClient({ resolve() {}, play() {} })).toThrow(/isEnabled/);
  });
});

describe('soundboard-contract createInMemorySoundboardClient', () => {
  test('seeds sounds from an array, object and map', async () => {
    const fromArray = createInMemorySoundboardClient({ sounds: [AIRHORN] });
    expect((await fromArray.client.resolve('airhorn')).url).toBe(AIRHORN.url);

    const fromObject = createInMemorySoundboardClient({ sounds: { beep: 'https://cdn.example/beep.mp3' } });
    expect((await fromObject.client.resolve('beep')).source).toBe(RESOLUTION_SOURCES.url);

    const fromMap = createInMemorySoundboardClient({ sounds: new Map([['boop', 'https://cdn.example/boop.mp3']]) });
    expect((await fromMap.client.resolve('boop')).name).toBe('boop');
  });

  test('resolve normalizes the lookup, returns null and records calls', async () => {
    const h = createInMemorySoundboardClient({ sounds: [AIRHORN] });
    expect(await h.client.resolve('  AIRHORN ')).not.toBeNull();
    expect(await h.client.resolve('missing')).toBeNull();
    expect(await h.client.resolve('   ')).toBeNull();
    expect(h.resolveCalls).toEqual(['airhorn', 'missing', '']);
  });

  test('play returns a frozen success and records the request', async () => {
    const h = createInMemorySoundboardClient({ sounds: [AIRHORN], audioTarget: 'obs_overlay' });
    const sound = await h.client.resolve('airhorn');
    const result = await h.client.play(sound, { requestedBy: 'user-7' });
    expect(result.success).toBe(true);
    expect(result.audioTarget).toBe('obs_overlay');
    expect(h.playCalls).toEqual([{ name: 'airhorn', requestedBy: 'user-7' }]);
  });

  test('play fails with SOUNDBOARD_DISABLED when disabled', async () => {
    const h = createInMemorySoundboardClient({ enabled: false, sounds: [AIRHORN] });
    const result = await h.client.play(AIRHORN);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ERROR_CODES.SOUNDBOARD_DISABLED);
  });

  test('failResolveFor / failPlayFor simulate backend failures', async () => {
    const h = createInMemorySoundboardClient({ sounds: [AIRHORN], failResolveFor: ['airhorn'], failPlayFor: ['airhorn'] });
    await expect(h.client.resolve('airhorn')).rejects.toThrow(/resolve failed/);
    await expect(h.client.play(AIRHORN)).rejects.toThrow(/play failed/);
    expect(h.playCalls).toEqual([{ name: 'airhorn', requestedBy: null }]);
  });

  test('helpers support arrangement', async () => {
    const h = createInMemorySoundboardClient();
    expect(h.client.isEnabled()).toBe(true);
    h.setEnabled(false);
    expect(h.client.isEnabled()).toBe(false);
    expect(h.enabled).toBe(false);

    h.setAudioTarget('dashboard');
    expect(h.client.getAudioTarget()).toBe('dashboard');
    expect(() => h.setAudioTarget('tv')).toThrow(/audio target/);

    h.addSound(AIRHORN);
    expect(await h.client.resolve('airhorn')).not.toBeNull();
    h.removeSound('airhorn');
    expect(await h.client.resolve('airhorn')).toBeNull();

    h.reset();
    expect(h.resolveCalls).toHaveLength(0);
    expect(h.playCalls).toHaveLength(0);
  });

  test('rejects an unknown audio target up front', () => {
    expect(() => createInMemorySoundboardClient({ audioTarget: 'tv' })).toThrow(/audio target/);
  });

  test('the returned client satisfies the contract', () => {
    const { client } = createInMemorySoundboardClient();
    expect(assertSoundboardClient(client)).toBe(client);
  });
});
