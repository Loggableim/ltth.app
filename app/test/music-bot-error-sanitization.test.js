'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const MusicBotPlugin = require('../plugins/music-bot/main');

const CANARY = 'C:\\Users\\private\\Music Bot\\secret-token=CANARY-DO-NOT-DISPLAY';

function createFixture() {
  const routes = new Map();
  const emitted = [];
  const api = {
    getSocketIO: () => ({ emit: jest.fn() }),
    getDatabase: () => ({}),
    registerRoute: (method, route, ...handlers) => routes.set(`${method}:${route}`, handlers),
    setConfig: jest.fn(async () => true),
    emit: jest.fn((event, payload) => emitted.push({ event, payload })),
    log: jest.fn()
  };
  const plugin = new MusicBotPlugin(api);
  plugin._registerRoutes();
  return { api, emitted, plugin, routes };
}

function responseMock() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
}

async function invoke(fixture, key, body = {}) {
  const response = responseMock();
  const handlers = fixture.routes.get(key);
  if (!handlers) throw new Error(`Missing synthetic route fixture ${key}`);
  await handlers[handlers.length - 1]({ body }, response);
  return response;
}

function assertNoCanary(value) {
  expect(JSON.stringify(value)).not.toContain(CANARY);
  expect(JSON.stringify(value)).not.toContain('CANARY-DO-NOT-DISPLAY');
}

describe('Music Bot route error sanitization', () => {
  test('MPV install route and normalized install state discard path, stderr, and arbitrary params', async () => {
    const fixture = createFixture();
    fixture.plugin._isSameOriginMpvInstallRequest = () => true;
    fixture.plugin._installMpv = jest.fn(async () => { throw new Error(CANARY); });
    fixture.plugin._getSetupIssues = () => [];

    const response = await invoke(fixture, 'post:/api/plugins/music-bot/install/mpv');
    expect(response.statusCode).toBe(500);
    expect(response.payload).toMatchObject({ success: false, code: 'MUSIC_BOT_MPV_INSTALL_START_FAILED' });
    expect(response.payload.error).toBeUndefined();
    expect(response.payload.installStatus).toMatchObject({
      state: 'failed', messageKey: 'mpvInstallStartFailed', params: {}, command: null
    });
    assertNoCanary(response.payload);

    const lock = fixture.plugin._summarizeMpvInstallFailure(
      `Unable to obtain lock file access on '${CANARY}'; stderr ${CANARY}`,
      1
    );
    expect(lock).toEqual({ messageKey: 'mpvInstallChocolateyLock', params: {} });
    const exited = fixture.plugin._summarizeMpvInstallFailure(`stderr ${CANARY}`, 9);
    expect(exited).toEqual({ messageKey: 'mpvInstallExited', params: { code: 9 } });

    const normalized = fixture.plugin._normalizeMpvInstallStatus({
      state: CANARY,
      messageKey: 'mpvInstallChocolateyLock',
      params: { path: CANARY, detail: CANARY, error: CANARY },
      command: CANARY,
      message: CANARY
    });
    expect(normalized).toMatchObject({ state: 'failed', messageKey: 'mpvInstallChocolateyLock', params: {}, command: null });
    assertNoCanary({ lock, exited, normalized });
  });

  test('MPV failure locale messages do not interpolate paths, stderr, or exception text', () => {
    const pluginDir = path.join(__dirname, '../plugins/music-bot');
    for (const locale of ['de', 'en', 'es', 'fr']) {
      const translations = JSON.parse(fs.readFileSync(path.join(pluginDir, 'locales', `${locale}.json`), 'utf8'));
      const messages = translations.plugins['music-bot'].music_bot.ui.shell;
      expect(messages.mpvInstallStartFailed).not.toContain('{error}');
      expect(messages.mpvInstallChocolateyLock).not.toContain('{path}');
    }
  });
  test('MPV-unavailable playback result and socket error contain only stable display text and code', () => {
    const fixture = createFixture();
    fixture.plugin.config.playback.mpvPath = CANARY;
    fixture.plugin.queueManager = { returnToFront: jest.fn() };
    fixture.plugin._emitSetupStatus = jest.fn();
    fixture.plugin._emitQueue = jest.fn();

    const result = fixture.plugin._handlePlaybackUnavailable(null, Object.assign(new Error(CANARY), { code: 'ENOENT' }));
    expect(result).toEqual({
      success: false,
      error: 'mpv ist nicht verfügbar. Prüfe die Installation und den Pfad in den Music-Bot-Einstellungen.',
      code: 'MUSIC_BOT_MPV_UNAVAILABLE'
    });
    expect(fixture.emitted).toContainEqual({
      event: 'musicbot:error',
      payload: { message: result.error, code: 'MUSIC_BOT_MPV_UNAVAILABLE' }
    });
    assertNoCanary({ result, emitted: fixture.emitted });
  });

  test.each([
    ['volume', 'post:/api/plugins/music-bot/volume', { volume: 50 }, 'MUSIC_BOT_VOLUME_SAVE_FAILED', 'Volume could not be saved.'],
    ['onboarding', 'post:/api/plugins/music-bot/onboarding/complete', {}, 'MUSIC_BOT_ONBOARDING_SAVE_FAILED', 'Onboarding could not be saved.']
  ])('%s persistence failure returns a stable route error', async (_name, route, body, code, message) => {
    const fixture = createFixture();
    fixture.api.setConfig.mockRejectedValue(new Error(CANARY));
    fixture.plugin._distributeLiveConfig = jest.fn();
    fixture.plugin._applyAudioVolume = jest.fn(async () => 50);
    const response = await invoke(fixture, route, body);
    expect(response.statusCode).toBe(500);
    expect(response.payload).toEqual({ success: false, code, error: message });
    assertNoCanary(response.payload);
  });

  test('config POST sanitizes persistence rejection and retains lifecycle status semantics', async () => {
    const fixture = createFixture();
    const plugin = fixture.plugin;
    plugin._runSerializedConfigUpdate = (operation) => operation();
    plugin._prepareLiveConfigUpdate = () => ({ valid: true, config: plugin.config });
    fixture.api.setConfig.mockRejectedValue(new Error(CANARY));
    plugin._distributeLiveConfig = jest.fn();
    plugin._assertConfigUpdateActive = jest.fn();

    const response = await invoke(fixture, 'post:/api/plugins/music-bot/config', { audio: { masterVolume: 50 } });
    expect(response.statusCode).toBe(500);
    expect(response.payload).toEqual({
      success: false,
      code: 'MUSIC_BOT_CONFIG_SAVE_FAILED',
      error: 'Music Bot settings could not be persisted.'
    });
    assertNoCanary(response.payload);

    const stopping = plugin._safeConfigUpdateFailure(plugin._configLifecycleError(), 'unused', 'unused');
    expect(stopping).toEqual({ code: 'MUSIC_BOT_PLUGIN_STOPPING', error: 'Music Bot is stopping. Please try again.' });
    const validation = plugin._safeConfigUpdateFailure(
      Object.assign(new Error('Queue maximum must be a positive number.'), { code: 'CONFIG_VALIDATION_FAILED' }),
      'unused', 'unused'
    );
    expect(validation).toEqual({ code: 'MUSIC_BOT_CONFIG_INVALID', error: 'Music Bot settings are invalid.' });
    const aliasValidation = plugin._safeConfigUpdateFailure(
      Object.assign(new Error(`Alias "${CANARY}" conflicts with another command`), { code: 'CONFIG_VALIDATION_FAILED' }),
      'unused', 'unused'
    );
    expect(aliasValidation).toEqual({ code: 'MUSIC_BOT_CONFIG_INVALID', error: 'Command alias conflicts with another command.' });
    assertNoCanary(aliasValidation);
  });

  test('safety-lock preserves the stable MPV-running domain error but hides persistence details', async () => {
    const fixture = createFixture();
    fixture.api.setConfig.mockRejectedValue(new Error(CANARY));
    fixture.plugin._isSafetyLocked = () => true;
    fixture.plugin._recordTransition = jest.fn();
    fixture.plugin.playbackEngine = { emergencyStop: jest.fn(async () => {}) };
    fixture.plugin.queueManager = { markPlaying: jest.fn() };
    fixture.plugin._stopPlaybackSync = jest.fn();
    fixture.plugin._clearCrossfadeTimer = jest.fn();
    fixture.plugin._invalidateRadioPrefetch = jest.fn();
    fixture.plugin._emitPlaybackStopped = jest.fn();
    fixture.plugin._emitNowPlaying = jest.fn();
    fixture.plugin._emitSafetyState = jest.fn();
    const response = await invoke(fixture, 'post:/api/plugins/music-bot/safety-lock', { locked: true });
    expect(response.statusCode).toBe(500);
    expect(response.payload).toEqual({
      success: false,
      locked: true,
      code: 'MUSIC_BOT_SAFETY_LOCK_FAILED',
      error: 'Safety Lock could not be updated.'
    });
    assertNoCanary(response.payload);

    fixture.plugin._releaseSafetyLock = async () => {
      throw Object.assign(new Error(CANARY), { code: 'SOUNDBOT_MPV_REMAINS' });
    };
    const remains = await invoke(fixture, 'post:/api/plugins/music-bot/safety-lock', { locked: false });
    expect(remains.statusCode).toBe(409);
    expect(remains.payload).toMatchObject({
      code: 'MUSIC_BOT_MPV_PROCESS_STILL_RUNNING',
      error: 'Safety Lock cannot be released while MPV is still running.'
    });
    assertNoCanary(remains.payload);
  });

  test.each([
    ['reset', 'post:/api/plugins/music-bot/player/reset', { resetPlayer: jest.fn(async () => { throw new Error(CANARY); }) }, 'MUSIC_BOT_PLAYER_RESET_FAILED', 'Player could not be reset.'],
    ['test tone', 'post:/api/plugins/music-bot/player/test-tone', {
      getNowPlaying: () => null,
      isPlaying: () => false,
      testTone: jest.fn(async () => { throw new Error(CANARY); })
    }, 'MUSIC_BOT_TEST_TONE_FAILED', 'Test tone could not be played.']
  ])('player %s failure is sanitized', async (_name, route, engine, code, message) => {
    const fixture = createFixture();
    fixture.plugin.playbackEngine = engine;
    fixture.plugin._isSafetyLocked = () => false;
    fixture.plugin._stopPlaybackSync = jest.fn();
    fixture.plugin._clearCrossfadeTimer = jest.fn();
    const response = await invoke(fixture, route);
    expect(response.statusCode).toBe(500);
    expect(response.payload).toEqual({ success: false, code, error: message });
    assertNoCanary(response.payload);
  });

  test('actual Music Bot UI displays the sanitized playback event without canary details', async () => {
    const fixture = createFixture();
    fixture.plugin.config.playback.mpvPath = CANARY;
    fixture.plugin.queueManager = { returnToFront: jest.fn() };
    fixture.plugin._emitSetupStatus = jest.fn();
    fixture.plugin._emitQueue = jest.fn();
    fixture.plugin._handlePlaybackUnavailable(null, Object.assign(new Error(CANARY), { code: 'ENOENT' }));
    const socketPayload = fixture.emitted.find(({ event }) => event === 'musicbot:error').payload;

    const pluginDir = path.join(__dirname, '../plugins/music-bot');
    const html = fs.readFileSync(path.join(pluginDir, 'ui.html'), 'utf8');
    const js = fs.readFileSync(path.join(pluginDir, 'assets/ui.js'), 'utf8');
    const handlers = {};
    const dom = new JSDOM(html, {
      url: 'http://localhost:3000/plugins/music-bot/ui',
      runScripts: 'dangerously',
      beforeParse(window) {
        window.io = () => ({
          on: (event, handler) => { handlers[event] = handler; },
          emit: () => {}
        });
        window.fetch = async () => ({ json: async () => ({ success: true }) });
        window.i18n = { ready: new Promise(() => {}), t: (key) => key };
      }
    });
    try {
      dom.window.eval(js);
      handlers['musicbot:error'](socketPayload);
      const toast = dom.window.document.querySelector('.musicbot-toast-message');
      expect(toast?.textContent).toBe('mpv ist nicht verfügbar. Prüfe die Installation und den Pfad in den Music-Bot-Einstellungen.');
      expect(toast?.textContent).not.toContain('CANARY');
      expect(toast?.textContent).not.toContain('Users\\private');
    } finally {
      dom.window.close();
    }
  });
});
