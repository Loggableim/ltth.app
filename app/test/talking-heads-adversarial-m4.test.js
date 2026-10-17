'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');
const Database = require('better-sqlite3');

const TalkingHeadsPlugin = require('../plugins/talking-heads/main.js');
const AssetSpriteLibrary = require('../plugins/talking-heads/engines/asset-sprite-library.js');
const AvatarLotteryManager = require('../plugins/talking-heads/utils/avatar-lottery-manager.js');
const AnimationController = require('../plugins/talking-heads/engines/animation-controller.js');
const { DashboardTTSRenderer } = require('../public/js/tts-renderer-lifecycle.js');

const pluginRoot = path.join(__dirname, '..', 'plugins', 'talking-heads');

const BOBA_ANIMALS = [
  'Axolotl', 'Bear', 'Bunny', 'Dog', 'Fox', 'Frog', 'Giraffe', 'Goat',
  'Monkey', 'Octopus', 'Otter', 'Pinguin', 'Raccoon', 'Seal', 'Snake', 'Spider'
];
const BOBA_EXPRESSIONS = ['Default', 'Angry', 'Annoyed', 'Cry', 'Happy', 'Scared'];

function bootOverlayDom(initialConfig = {}) {
  const html = fs.readFileSync(path.join(pluginRoot, 'overlay.html'), 'utf8');
  const source = fs.readFileSync(path.join(pluginRoot, 'assets', 'overlay.js'), 'utf8');
  const dom = new JSDOM(html, {
    url: 'http://127.0.0.1:3000/overlay/talking-heads',
    pretendToBeVisual: true
  });
  const handlers = new Map();
  const socket = {
    id: 'overlay-socket-m4',
    on: jest.fn((eventName, handler) => handlers.set(eventName, handler)),
    emit: jest.fn()
  };
  dom.window.HTMLCanvasElement.prototype.getContext = jest.fn(() => null);
  const context = {
    window: dom.window,
    document: dom.window.document,
    console: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    fetch: jest.fn(async (url) => {
      if (url === '/api/talkingheads/config') {
        return {
          ok: true,
          json: async () => ({ success: true, config: initialConfig })
        };
      }
      return { ok: false, statusText: 'Not Found', json: async () => ({}) };
    }),
    localStorage: dom.window.localStorage,
    URL: dom.window.URL,
    URLSearchParams: dom.window.URLSearchParams,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    requestAnimationFrame: (cb) => cb(),
    performance: { now: () => 0 },
    Float32Array
  };
  context.io = jest.fn(() => socket);
  vm.runInNewContext(source, context, { filename: 'talking-heads-overlay.js' });
  return { dom, handlers, socket };
}

describe('Talking Heads Milestone 4: Final Test Suite Integrity & Hardening (Empirical Challenger)', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-challenger-m4-'));
  });

  afterAll(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // =========================================================================
  // SUITE 1: Cross-Milestone End-to-End Integration
  // =========================================================================
  describe('Suite 1: Cross-Milestone End-to-End Integration', () => {
    let db;
    let plugin;
    let io;
    let api;
    let savedConfig;

    beforeEach(() => {
      db = new Database(':memory:');
      io = { emit: jest.fn(), on: jest.fn() };
      savedConfig = {
        enabled: true,
        assetPack: 'boba',
        assetCharacter: 'Fox',
        nameplatePosition: 'above',
        nameplateFontFamily: 'Roboto, sans-serif',
        nameplateFontSize: 18,
        nameplateFontColor: '#00ffcc',
        nameplateBackgroundColor: '#112233',
        nameplateBackgroundOpacity: 0.8,
        nameplateTextShadow: 'glow',
        nameplateTextStroke: '1px black',
        headEntranceAnimation: 'bounce',
        headExitAnimation: 'fade',
        nameplateEntranceAnimation: 'pop',
        nameplateExitAnimation: 'slide-down'
      };

      api = {
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        getSocketIO: jest.fn(() => io),
        getDatabase: jest.fn(() => db),
        getConfig: jest.fn(() => savedConfig),
        setConfig: jest.fn((k, v) => { savedConfig = v; }),
        getPluginDataDir: jest.fn(() => tmpDir),
        ensurePluginDataDir: jest.fn(async () => {}),
        registerRoute: jest.fn(),
        registerSocket: jest.fn(),
        registerTikTokEvent: jest.fn(),
        pluginLoader: { on: jest.fn(), removeListener: jest.fn() }
      };

      plugin = new TalkingHeadsPlugin(api);
      plugin.avatarLotteryManager = new AvatarLotteryManager(db, api.logger);
      plugin.avatarLotteryManager.init();
      plugin.assetSpriteLibrary = new AssetSpriteLibrary({
        dataDir: tmpDir,
        logger: api.logger
      });
      plugin.animationController = new AnimationController(io, api.logger, plugin.config, null);
      plugin._registerRoutes();
    });

    afterEach(() => {
      if (db && db.open) db.close();
    });

    test('full end-to-end flow: legacy Kenney viewer speech triggers Boba auto-migration, metering, hysteresis, deduplication, live config update, and clean exit', async () => {
      // 1. Seed legacy 'kenney' assignment in SQLite database
      const legacyViewerId = 'viewer-legacy-101';
      const legacyUsername = 'RetroGamer';
      plugin.avatarLotteryManager.assign(legacyViewerId, legacyUsername, {
        packId: 'kenney',
        characterId: 'darkA',
        options: { body: 'darkA', eyes: 'cute_dark' }
      });

      // Verify legacy assignment exists in SQLite
      const preSpeechRecord = plugin.avatarLotteryManager.getAssignment(legacyViewerId);
      expect(preSpeechRecord.selection.packId).toBe('kenney');

      // 2. Trigger prepareAvatarAssignment - MUST auto-migrate to Boba Animals
      const prepResult = plugin.prepareAvatarAssignment({
        userId: legacyViewerId,
        username: legacyUsername,
        hasAssignedVoice: true
      });

      expect(prepResult.reason).toBe('migrated');
      expect(prepResult.selection.packId).toBe('boba');
      expect(BOBA_ANIMALS).toContain(prepResult.selection.characterId);
      expect(BOBA_EXPRESSIONS).toContain(prepResult.selection.options.expression);

      // Verify SQLite is updated to Boba
      const postSpeechRecord = plugin.avatarLotteryManager.getAssignment(legacyViewerId);
      expect(postSpeechRecord.selection.packId).toBe('boba');
      expect(postSpeechRecord.selection.characterId).toBe(prepResult.selection.characterId);

      // 3. Generate sprite set for the migrated character - verify distinct apertures
      const spriteSet = await plugin.assetSpriteLibrary.getSpriteSet(prepResult.selection);
      expect(spriteSet.sprites).toBeDefined();
      const closedSvg = fs.readFileSync(path.join(tmpDir, 'avatars', path.basename(spriteSet.sprites.speak_closed)), 'utf8');
      const midSvg = fs.readFileSync(path.join(tmpDir, 'avatars', path.basename(spriteSet.sprites.speak_mid)), 'utf8');
      const openSvg = fs.readFileSync(path.join(tmpDir, 'avatars', path.basename(spriteSet.sprites.speak_open)), 'utf8');
      expect(closedSvg).not.toBe(midSvg);
      expect(midSvg).not.toBe(openSvg);
      expect(closedSvg).not.toBe(openSvg);

      // 4. Mount on Live Overlay DOM
      const { dom, handlers } = bootOverlayDom(savedConfig);
      const startHandler = handlers.get('talkingheads:animation:start');
      const frameHandler = handlers.get('talkingheads:animation:frame');
      const endHandler = handlers.get('talkingheads:animation:end');
      const configUpdateHandler = handlers.get('talkingheads:config:update');

      configUpdateHandler({ config: savedConfig });

      startHandler({
        playbackId: 'pb-e2e-1',
        userId: legacyViewerId,
        username: legacyUsername,
        sprites: spriteSet.sprites
      });

      const avatarElem = dom.window.document.querySelector('#speakerStage .avatar');
      expect(avatarElem).not.toBeNull();
      expect(avatarElem.classList.contains('nameplate-above')).toBe(true);
      const headImg = avatarElem.querySelector('img');
      const nameSpan = avatarElem.querySelector('.avatar-name');
      expect(headImg.classList.contains('th-enter-bounce')).toBe(true);
      expect(nameSpan.classList.contains('th-enter-pop')).toBe(true);

      // 5. Test Animation Controller Voice Intensity & Deduplication
      await plugin.animationController.startAnimation(
        legacyViewerId,
        legacyUsername,
        spriteSet.sprites,
        5000,
        { playbackId: 'pb-e2e-1', externalLifecycle: true }
      );
      io.emit.mockClear();

      // Audio volume rises to peak: 0.8
      plugin.animationController.setMouthIntensity(legacyViewerId, 'pb-e2e-1', 0.8);
      expect(io.emit).toHaveBeenCalledWith('talkingheads:animation:frame', {
        userId: legacyViewerId,
        playbackId: 'pb-e2e-1',
        frame: 'speak_open'
      });
      io.emit.mockClear();

      // Sustained volume: 0.75 - should be deduplicated (NO socket emit)
      plugin.animationController.setMouthIntensity(legacyViewerId, 'pb-e2e-1', 0.75);
      expect(io.emit).not.toHaveBeenCalled();

      // Falling into hysteresis hold: 0.45 - remains speak_open!
      plugin.animationController.setMouthIntensity(legacyViewerId, 'pb-e2e-1', 0.45);
      expect(io.emit).not.toHaveBeenCalled();

      // Drops below 0.38 to 0.30 - transitions to speak_mid
      plugin.animationController.setMouthIntensity(legacyViewerId, 'pb-e2e-1', 0.30);
      expect(io.emit).toHaveBeenCalledWith('talkingheads:animation:frame', {
        userId: legacyViewerId,
        playbackId: 'pb-e2e-1',
        frame: 'speak_mid'
      });
      io.emit.mockClear();

      // Drops to silence: 0.0 - transitions to speak_closed
      plugin.animationController.setMouthIntensity(legacyViewerId, 'pb-e2e-1', 0.0);
      expect(io.emit).toHaveBeenCalledWith('talkingheads:animation:frame', {
        userId: legacyViewerId,
        playbackId: 'pb-e2e-1',
        frame: 'speak_closed'
      });

      // 6. Live Streamer Config Update via POST /api/talkingheads/config without reload
      const postConfigRoute = api.registerRoute.mock.calls.find(
        ([m, p]) => m === 'post' && p === '/api/talkingheads/config'
      )[2];
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      postConfigRoute({
        body: {
          nameplatePosition: 'below',
          nameplateFontSize: 24,
          nameplateFontColor: '#ff0055',
          headExitAnimation: 'pop',
          nameplateExitAnimation: 'bounce'
        }
      }, res);

      // Verify broadcast
      expect(io.emit).toHaveBeenCalledWith('talkingheads:config:update', {
        config: expect.objectContaining({
          nameplatePosition: 'below',
          nameplateFontSize: 24,
          nameplateFontColor: '#ff0055'
        })
      });

      // Apply to overlay
      configUpdateHandler({
        config: {
          nameplatePosition: 'below',
          nameplateFontSize: 24,
          nameplateFontColor: '#ff0055',
          headExitAnimation: 'pop',
          nameplateExitAnimation: 'bounce'
        }
      });

      // Assert live DOM mutation without remounting
      expect(avatarElem.classList.contains('nameplate-below')).toBe(true);
      expect(avatarElem.classList.contains('nameplate-above')).toBe(false);
      expect(dom.window.document.getElementById('speakerStage').style.getPropertyValue('--th-name-size')).toBe('24px');
      expect(dom.window.document.getElementById('speakerStage').style.getPropertyValue('--th-name-color')).toBe('#ff0055');

      // 7. Complete playback and trigger exit
      endHandler({
        playbackId: 'pb-e2e-1',
        userId: legacyViewerId,
        fadeOutDuration: 250
      });

      expect(headImg.classList.contains('th-exit-pop')).toBe(true);
      expect(nameSpan.classList.contains('th-exit-bounce')).toBe(true);
      expect(avatarElem.style.getPropertyValue('--th-exit-duration')).toBe('250ms');
    });
  });

  // =========================================================================
  // SUITE 2: Boba Animals Aperture Distinction & Normalization Hardening (M1)
  // =========================================================================
  describe('Suite 2: Boba Animals Aperture Distinction & Normalization Hardening', () => {
    let spriteLibrary;

    beforeEach(() => {
      spriteLibrary = new AssetSpriteLibrary({ dataDir: tmpDir });
    });

    test('all 16 Boba Animals across all 6 expressions (96 combinations) produce distinct speak_closed !== speak_mid !== speak_open', async () => {
      const catalogChars = spriteLibrary.getCatalog().packs[0].characters;
      expect(catalogChars).toHaveLength(16);
      expect(catalogChars).toEqual(BOBA_ANIMALS);

      let totalTested = 0;
      let identicalApertureCollisions = 0;

      for (const char of catalogChars) {
        for (const expr of BOBA_EXPRESSIONS) {
          totalTested++;
          const res = await spriteLibrary.getSpriteSet({
            packId: 'boba',
            characterId: char,
            options: { expression: expr }
          });

          const closedFile = path.join(tmpDir, 'avatars', path.basename(res.sprites.speak_closed));
          const midFile = path.join(tmpDir, 'avatars', path.basename(res.sprites.speak_mid));
          const openFile = path.join(tmpDir, 'avatars', path.basename(res.sprites.speak_open));

          const closedSvg = fs.readFileSync(closedFile, 'utf8');
          const midSvg = fs.readFileSync(midFile, 'utf8');
          const openSvg = fs.readFileSync(openFile, 'utf8');

          if (closedSvg === midSvg || midSvg === openSvg || closedSvg === openSvg) {
            identicalApertureCollisions++;
          }
        }
      }

      expect(totalTested).toBe(96);
      expect(identicalApertureCollisions).toBe(0);
    });

    test('adversarial inputs to normalizeSelection gracefully yield default Boba Fox without throwing', () => {
      const hostileInputs = [
        null,
        undefined,
        {},
        [],
        [1, 2, 3],
        'Fox',
        123,
        NaN,
        Infinity,
        -Infinity,
        true,
        false,
        Symbol('hostile'),
        () => {},
        { packId: null, characterId: undefined, options: null },
        { packId: 'kenney', characterId: 'alien', options: { body: 'weird' } },
        { packId: 'rgs', characterId: 'hero', options: { hair: 'long' } },
        { packId: 'boba', characterId: 'Bull' }, // Bull retired -> Fox
        { packId: 'boba', characterId: 'Duck' }, // Duck retired -> Fox
        { packId: 'boba', characterId: 'Parrot' }, // Parrot retired -> Fox
        { packId: 'boba', characterId: 'Pig' }, // Pig retired -> Fox
        { packId: 'boba', characterId: 'UNKNOWN_BEAST' },
        { __proto__: { admin: true } },
        Object.create(null)
      ];

      for (const input of hostileInputs) {
        expect(() => {
          const res = spriteLibrary.normalizeSelection(input);
          expect(res.packId).toBe('boba');
          expect(BOBA_ANIMALS).toContain(res.characterId);
          expect(BOBA_EXPRESSIONS).toContain(res.options.expression);
        }).not.toThrow();
      }
    });

    test('lottery selection pools and draws contain strictly zero non-Boba candidates', () => {
      const pools = spriteLibrary.getLotterySelectionPools();
      expect(Object.keys(pools)).toEqual(['boba']);
      expect(pools.boba.length).toBeGreaterThan(0);

      // Verify candidate drawing over 200 iterations
      for (let i = 0; i < 200; i++) {
        const candidate = spriteLibrary.getRandomSelection();
        expect(candidate.packId).toBe('boba');
        expect(BOBA_ANIMALS).toContain(candidate.characterId);
      }
    });
  });

  // =========================================================================
  // SUITE 3: Real-Time Metering, Calibrated Hysteresis & Zero Audio Doubling (M2)
  // =========================================================================
  describe('Suite 3: Real-Time Metering, Calibrated Hysteresis & Zero Audio Doubling', () => {
    class FakeAudio {
      constructor() {
        this.listeners = new Map();
        this.currentTime = 0;
        this.sinkId = 'default';
        this.play = jest.fn(() => Promise.resolve());
      }
      addEventListener(evt, fn) {
        if (!this.listeners.has(evt)) this.listeners.set(evt, []);
        this.listeners.get(evt).push(fn);
      }
      removeEventListener(evt, fn) {
        const list = this.listeners.get(evt) || [];
        const idx = list.indexOf(fn);
        if (idx !== -1) list.splice(idx, 1);
      }
      dispatch(evt) {
        for (const fn of (this.listeners.get(evt) || []).slice()) fn({ type: evt });
      }
    }

    test('ticker interval is <= 50ms and runs autonomously during active playback', async () => {
      jest.useFakeTimers();
      const audio = new FakeAudio();
      const socket = { emit: jest.fn() };
      let now = 0;

      const renderer = new DashboardTTSRenderer({
        audio,
        socket,
        now: () => now,
        progressIntervalMs: 40
      });

      await renderer.play({ playbackId: 'ticker-test-1', source: 'chat' });
      audio.dispatch('playing');

      for (let i = 1; i <= 5; i++) {
        now += 40;
        audio.currentTime = now / 1000;
        jest.advanceTimersByTime(40);
      }

      const calls = socket.emit.mock.calls.filter(([evt]) => evt === 'tts:renderer:progress');
      expect(calls.length).toBe(5);
      expect(calls[0][1].currentTimeMs).toBe(40);
      expect(calls[4][1].currentTimeMs).toBe(200);

      renderer.dispose();
      jest.useRealTimers();
    });

    test('zero audio doubling: captureStream is connected strictly to analyser and NEVER to audioContext.destination', () => {
      const destinationNode = { id: 'destination-node' };
      const connectMock = jest.fn();
      const analyserMock = {
        fftSize: 512,
        smoothingTimeConstant: 0.8,
        frequencyBinCount: 256,
        getByteFrequencyData: jest.fn(),
        connect: connectMock
      };
      const mediaSourceMock = {
        connect: jest.fn()
      };
      const audioContextMock = {
        state: 'running',
        destination: destinationNode,
        createAnalyser: jest.fn(() => analyserMock),
        createMediaStreamSource: jest.fn(() => mediaSourceMock)
      };

      const audio = new FakeAudio();
      const streamMock = { id: 'stream-1' };
      audio.captureStream = jest.fn(() => streamMock);

      const AudioContextMock = jest.fn(function () {
        return audioContextMock;
      });

      const renderer = new DashboardTTSRenderer({
        audio,
        AudioContext: AudioContextMock
      });

      renderer._ensureAnalyser();

      expect(audio.captureStream).toHaveBeenCalled();
      expect(audioContextMock.createMediaStreamSource).toHaveBeenCalledWith(streamMock);
      expect(mediaSourceMock.connect).toHaveBeenCalledWith(analyserMock);

      // CRITICAL ASSERTION: analyser node MUST NOT connect to destination
      expect(connectMock).not.toHaveBeenCalledWith(destinationNode);
      expect(connectMock).not.toHaveBeenCalled();

      renderer.dispose();
    });

    test('adversarial intensity inputs to AnimationController do not crash and handle boundary conditions', async () => {
      const io = { emit: jest.fn() };
      const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
      const controller = new AnimationController(io, logger, {}, null);
      await controller.startAnimation('user-adv-1', 'User', { idle_neutral: 'fake.svg' }, 5000, {
        playbackId: 'pb-adv-1',
        externalLifecycle: true
      });

      const hostileLevels = [
        NaN, Infinity, -Infinity, null, undefined, 'loud', -5, 999
      ];

      for (const level of hostileLevels) {
        expect(() => {
          controller.setMouthIntensity('user-adv-1', 'pb-adv-1', level);
        }).not.toThrow();
      }

      // Negative values result in silence: dropping from 999 (peak) through 2-stage decay
      // Tick 1: drops to speak_mid
      controller.setMouthIntensity('user-adv-1', 'pb-adv-1', -10);
      expect(controller.activeAnimations.get('user-adv-1').mouthFrame).toBe('speak_mid');

      // Tick 2: drops to speak_closed
      controller.setMouthIntensity('user-adv-1', 'pb-adv-1', -10);
      expect(controller.activeAnimations.get('user-adv-1').mouthFrame).toBe('speak_closed');

      // Super high values result in open
      controller.setMouthIntensity('user-adv-1', 'pb-adv-1', 999);
      expect(controller.activeAnimations.get('user-adv-1').mouthFrame).toBe('speak_open');
    });

    test('two-stage 80ms decay cleanly drops open -> mid -> closed when falling abruptly to 0', async () => {
      const io = { emit: jest.fn() };
      const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
      const controller = new AnimationController(io, logger, {}, null);
      await controller.startAnimation('user-decay', 'User', { idle_neutral: 'fake.svg' }, 5000, {
        playbackId: 'pb-decay',
        externalLifecycle: true
      });

      // Tick 0: Strong vowel peak
      controller.setMouthIntensity('user-decay', 'pb-decay', 0.85);
      expect(controller.activeAnimations.get('user-decay').mouthFrame).toBe('speak_open');

      // Tick 1 (40ms): Volume suddenly drops to 0.0 -> drops to speak_mid (first stage)
      controller.setMouthIntensity('user-decay', 'pb-decay', 0.0);
      expect(controller.activeAnimations.get('user-decay').mouthFrame).toBe('speak_mid');

      // Tick 2 (80ms): Volume remains at 0.0 -> drops to speak_closed (second stage)
      controller.setMouthIntensity('user-decay', 'pb-decay', 0.0);
      expect(controller.activeAnimations.get('user-decay').mouthFrame).toBe('speak_closed');
    });
  });

  // =========================================================================
  // SUITE 4: Streamer Configuration, Persistence & Live Overlay CSS (M3)
  // =========================================================================
  describe('Suite 4: Streamer Configuration, Persistence & Live Overlay CSS', () => {
    test('main.js _normalizeAvatarConfig sanitizes all 12 properties against hostile inputs', () => {
      const api = {
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        getSocketIO: jest.fn(() => ({ emit: jest.fn(), on: jest.fn() })),
        getDatabase: jest.fn(() => ({ prepare: jest.fn() })),
        getConfig: jest.fn(() => ({})),
        setConfig: jest.fn(),
        getPluginDataDir: jest.fn(() => tmpDir),
        ensurePluginDataDir: jest.fn(async () => {}),
        registerRoute: jest.fn(),
        registerSocket: jest.fn(),
        registerTikTokEvent: jest.fn(),
        pluginLoader: { on: jest.fn(), removeListener: jest.fn() }
      };

      const plugin = new TalkingHeadsPlugin(api);

      const hostile = {
        nameplatePosition: 'DIAGONAL',
        nameplateFontFamily: '   ',
        nameplateFontSize: 1000,
        nameplateFontColor: 'not-a-color',
        nameplateBackgroundColor: '#xyz',
        nameplateBackgroundOpacity: -10,
        nameplateTextShadow: 'ultra-glow',
        nameplateTextStroke: '50px border',
        headEntranceAnimation: 'explode',
        headExitAnimation: 'implode',
        nameplateEntranceAnimation: 'teleport',
        nameplateExitAnimation: 'vanish'
      };

      const normalized = plugin._normalizeAvatarConfig(hostile);

      expect(normalized.nameplatePosition).toBe('below');
      expect(normalized.nameplateFontFamily).toBe('Inter, ui-sans-serif, system-ui, sans-serif');
      expect(normalized.nameplateFontSize).toBe(48);
      expect(normalized.nameplateFontColor).toBe('#ffffff');
      expect(normalized.nameplateBackgroundColor).toBe('#060c1c');
      expect(normalized.nameplateBackgroundOpacity).toBe(0);
      expect(normalized.nameplateTextShadow).toBe('subtle');
      expect(normalized.nameplateTextStroke).toBe('none');
      expect(normalized.headEntranceAnimation).toBe('slide-up');
      expect(normalized.headExitAnimation).toBe('fade');
      expect(normalized.nameplateEntranceAnimation).toBe('fade');
      expect(normalized.nameplateExitAnimation).toBe('fade');
    });

    test('flexbox order and visibility CSS rules in overlay.css match specifications', () => {
      const cssContent = fs.readFileSync(path.join(pluginRoot, 'assets', 'overlay.css'), 'utf8');

      expect(cssContent).toMatch(/\.avatar\.nameplate-above\s+\.avatar-name\s*\{\s*order:\s*-1/);
      expect(cssContent).toMatch(/\.avatar\.nameplate-below\s+\.avatar-name\s*\{\s*order:\s*1/);
      expect(cssContent).toMatch(/\.avatar\.nameplate-hidden\s+\.avatar-name\s*\{\s*display:\s*none\s*!important/);

      const animations = ['bounce', 'pop', 'slide-up', 'slide-down', 'fade'];
      for (const anim of animations) {
        expect(cssContent).toContain(`th-enter-${anim}`);
        expect(cssContent).toContain(`th-exit-${anim}`);
      }
    });
  });

  // =========================================================================
  // SUITE 5: 4-Locale Translation Symmetry & Key Integrity (M3/M4)
  // =========================================================================
  describe('Suite 5: 4-Locale Translation Symmetry & Key Integrity', () => {
    const LOCALES = ['en', 'de', 'es', 'fr'];

    function flattenKeys(obj, prefix = '') {
      let keys = [];
      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          keys = keys.concat(flattenKeys(value, fullKey));
        } else {
          keys.push(fullKey);
        }
      }
      return keys;
    }

    function getValueByPath(obj, pathStr) {
      return pathStr.split('.').reduce((curr, p) => (curr ? curr[p] : undefined), obj);
    }

    test('all 4 locales (en, de, es, fr) have 100% key symmetry and identical structure', () => {
      const localeData = {};
      const localeKeySets = {};

      for (const loc of LOCALES) {
        const filePath = path.join(pluginRoot, 'locales', `${loc}.json`);
        expect(fs.existsSync(filePath)).toBe(true);
        const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        localeData[loc] = json;
        localeKeySets[loc] = new Set(flattenKeys(json));
      }

      const enKeys = localeKeySets['en'];

      // Compare each locale against English
      for (const loc of ['de', 'es', 'fr']) {
        const currentKeys = localeKeySets[loc];

        // Missing keys in current locale compared to en
        const missingInCurrent = [...enKeys].filter(k => !currentKeys.has(k));
        expect(missingInCurrent).toEqual([]);

        // Extra keys in current locale not in en
        const extraInCurrent = [...currentKeys].filter(k => !enKeys.has(k));
        expect(extraInCurrent).toEqual([]);
      }
    });

    test('zero empty strings, undefined values, or mojibake corruption across all 4 locales', () => {
      const mojibakeRegex = /\uFFFD|\u00C3(?:[\u0080-\u00BF]|\u0192)|\u00C2[\u0080-\u00BF]/;

      for (const loc of LOCALES) {
        const filePath = path.join(pluginRoot, 'locales', `${loc}.json`);
        const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const allKeys = flattenKeys(json);

        const corruptedKeys = [];
        const emptyKeys = [];

        for (const key of allKeys) {
          const val = getValueByPath(json, key);
          if (typeof val !== 'string' || !val.trim()) {
            emptyKeys.push({ key, val });
          } else if (mojibakeRegex.test(val)) {
            corruptedKeys.push({ key, val });
          }
        }

        expect(emptyKeys).toEqual([]);
        expect(corruptedKeys).toEqual([]);
      }
    });
  });
});
