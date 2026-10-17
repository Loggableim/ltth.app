'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');
const TalkingHeadsPlugin = require('../plugins/talking-heads/main.js');

const pluginRoot = path.join(__dirname, '..', 'plugins', 'talking-heads');

function createPluginHarness(savedConfig = {}) {
  const io = { emit: jest.fn(), on: jest.fn() };
  let currentSaved = { enabled: true, assetPack: 'boba', ...savedConfig };
  const api = {
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    getSocketIO: jest.fn(() => io),
    getDatabase: jest.fn(() => ({
      prepare: jest.fn(() => ({ run: jest.fn(), get: jest.fn(), all: jest.fn(() => []) }))
    })),
    getConfig: jest.fn(() => currentSaved),
    setConfig: jest.fn((key, val) => { currentSaved = val; }),
    getPluginDataDir: jest.fn(() => '/tmp/th-challenger-m3'),
    ensurePluginDataDir: jest.fn(),
    registerRoute: jest.fn(),
    registerSocket: jest.fn(),
    registerTikTokEvent: jest.fn(),
    pluginLoader: { on: jest.fn(), removeListener: jest.fn() }
  };
  const plugin = new TalkingHeadsPlugin(api);
  plugin.assetSpriteLibrary = {
    getCatalog: jest.fn(() => ({ packs: [{ id: 'boba', name: 'Boba Animals', characters: ['Fox'] }] })),
    getRandomSelection: jest.fn(() => ({ packId: 'boba', characterId: 'Fox', options: {} })),
    getLotteryCandidates: jest.fn(() => []),
    normalizeSelection: jest.fn((sel) => ({
      packId: sel?.packId || 'boba',
      characterId: sel?.characterId || 'Fox',
      options: sel?.options || {}
    })),
    getSpriteSet: jest.fn(async (sel) => ({
      ...sel,
      sprites: { idle_neutral: `/sprites/${sel.characterId}.png` }
    }))
  };
  plugin.avatarLotteryManager = {
    assign: jest.fn(),
    getAssignment: jest.fn(() => null)
  };
  plugin._registerRoutes();
  return { plugin, api, io };
}

function bootOverlayDom() {
  const html = fs.readFileSync(path.join(pluginRoot, 'overlay.html'), 'utf8');
  const source = fs.readFileSync(path.join(pluginRoot, 'assets', 'overlay.js'), 'utf8');
  const dom = new JSDOM(html, {
    url: 'http://127.0.0.1:3000/overlay/talking-heads',
    pretendToBeVisual: true
  });
  const handlers = new Map();
  const socket = {
    id: 'overlay-socket-challenger',
    on: jest.fn((eventName, handler) => handlers.set(eventName, handler)),
    emit: jest.fn()
  };
  dom.window.HTMLCanvasElement.prototype.getContext = jest.fn(() => null);
  const context = {
    window: dom.window,
    document: dom.window.document,
    console: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    fetch: jest.fn(async () => ({
      ok: true,
      json: async () => ({})
    })),
    localStorage: dom.window.localStorage,
    URL: dom.window.URL,
    URLSearchParams: dom.window.URLSearchParams,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    requestAnimationFrame: cb => cb(),
    performance: { now: () => 0 },
    Float32Array
  };
  context.io = jest.fn(() => socket);
  vm.runInNewContext(source, context, { filename: 'overlay.js' });
  return { dom, handlers, socket };
}

describe('Challenger M3: Streamer-Configurable Username & Animation System Empirical Stress Tests', () => {

  describe('1. Config Sanitization & Extreme Boundary Clamping', () => {
    let plugin;

    beforeEach(() => {
      const harness = createPluginHarness();
      plugin = harness.plugin;
    });

    test('out-of-range and hostile fontSize values clamp cleanly to [10, 48]', () => {
      const cases = [
        { input: -10, expected: 10 },
        { input: -1, expected: 10 },
        { input: 0, expected: 10 },
        { input: 5, expected: 10 },
        { input: 9.9, expected: 10 },
        { input: 10, expected: 10 },
        { input: 24, expected: 24 },
        { input: 48, expected: 48 },
        { input: 49, expected: 48 },
        { input: 1000, expected: 48 },
        { input: 999999, expected: 48 },
        { input: NaN, expected: 14 },
        { input: null, expected: 10 }, // Number(null) === 0, clamped to 10
        { input: 'large', expected: 14 },
        { input: '42px', expected: 14 }, // Number('42px') is NaN
        { input: undefined, expected: 14 },
        { input: Infinity, expected: 14 },
        { input: -Infinity, expected: 14 },
        { input: '  18  ', expected: 18 },
        { input: 22.7, expected: 23 } // rounds to nearest integer
      ];

      for (const { input, expected } of cases) {
        const res = plugin._normalizeAvatarConfig({ nameplateFontSize: input });
        expect(res.nameplateFontSize).toBe(expected);
      }
    });

    test('out-of-range and hostile backgroundOpacity values clamp cleanly to [0, 1]', () => {
      const cases = [
        { input: -1, expected: 0 },
        { input: -0.01, expected: 0 },
        { input: -100, expected: 0 },
        { input: 0, expected: 0 },
        { input: 0.25, expected: 0.25 },
        { input: 0.333333, expected: 0.33 },
        { input: 0.75, expected: 0.75 },
        { input: 1, expected: 1 },
        { input: 1.05, expected: 1 },
        { input: 2.5, expected: 1 },
        { input: 100, expected: 1 },
        { input: NaN, expected: 0.75 },
        { input: 'opaque', expected: 0.75 },
        { input: null, expected: 0 }, // Number(null) === 0, clamped to 0
        { input: undefined, expected: 0.75 },
        { input: Infinity, expected: 0.75 },
        { input: -Infinity, expected: 0.75 },
        { input: '  0.85  ', expected: 0.85 }
      ];

      for (const { input, expected } of cases) {
        const res = plugin._normalizeAvatarConfig({ nameplateBackgroundOpacity: input });
        expect(res.nameplateBackgroundOpacity).toBe(expected);
      }
    });

    test('invalid position enums fall back strictly to "below"', () => {
      const invalidPositions = [
        'floating', 'middle', 'top', 'bottom', 'center', 'left', 'right',
        123, 0, false, true, null, undefined, '', '   ', {}, []
      ];

      for (const invalid of invalidPositions) {
        const res = plugin._normalizeAvatarConfig({ nameplatePosition: invalid });
        expect(res.nameplatePosition).toBe('below');
      }

      // Valid positions must be preserved
      expect(plugin._normalizeAvatarConfig({ nameplatePosition: 'above' }).nameplatePosition).toBe('above');
      expect(plugin._normalizeAvatarConfig({ nameplatePosition: 'below' }).nameplatePosition).toBe('below');
      expect(plugin._normalizeAvatarConfig({ nameplatePosition: 'hidden' }).nameplatePosition).toBe('hidden');
    });

    test('invalid animation enums fall back cleanly to defaults without crashing', () => {
      const invalidAnimations = [
        'explode', 'spin', 'fly', 'zoom', 'shake', 'none',
        null, undefined, 123, false, true, '', {}, []
      ];

      for (const invalid of invalidAnimations) {
        const res = plugin._normalizeAvatarConfig({
          headEntranceAnimation: invalid,
          headExitAnimation: invalid,
          nameplateEntranceAnimation: invalid,
          nameplateExitAnimation: invalid
        });
        expect(res.headEntranceAnimation).toBe('slide-up');
        expect(res.headExitAnimation).toBe('fade');
        expect(res.nameplateEntranceAnimation).toBe('fade');
        expect(res.nameplateExitAnimation).toBe('fade');
      }

      // Valid animations must be preserved
      const validAnims = ['bounce', 'pop', 'slide-up', 'slide-down', 'fade'];
      for (const anim of validAnims) {
        const res = plugin._normalizeAvatarConfig({
          headEntranceAnimation: anim,
          headExitAnimation: anim,
          nameplateEntranceAnimation: anim,
          nameplateExitAnimation: anim
        });
        expect(res.headEntranceAnimation).toBe(anim);
        expect(res.headExitAnimation).toBe(anim);
        expect(res.nameplateEntranceAnimation).toBe(anim);
        expect(res.nameplateExitAnimation).toBe(anim);
      }
    });

    test('malformed hex colors fall back cleanly to standard hex defaults', () => {
      const hostileColors = [
        'red', 'blue', 'transparent',
        'rgb(0,0,0)', 'rgba(0,0,0,0.5)', 'hsl(0,0%,0%)',
        '#zzzzzz', '#12', '#1234567890', '#ffff',
        '#fff; background: red;', '#000"><script>alert(1)</script>',
        12345, null, undefined, false, true, '', '   ', {}, []
      ];

      for (const bad of hostileColors) {
        const res = plugin._normalizeAvatarConfig({
          nameplateFontColor: bad,
          nameplateBackgroundColor: bad
        });
        // Note: #ffff is 4 hex digits (valid short hex with alpha in CSS hex syntax #RGBA)
        if (bad === '#ffff') {
          expect(res.nameplateFontColor).toBe('#ffff');
          expect(res.nameplateBackgroundColor).toBe('#ffff');
        } else {
          expect(res.nameplateFontColor).toBe('#ffffff');
          expect(res.nameplateBackgroundColor).toBe('#060c1c');
        }
      }

      // Valid hex strings (3, 6, 8 chars) are accepted and trimmed
      const validColors = ['#fff', '#ffffff', '#060c1c', '#FF0055', '#12345678', '  #00ff00  '];
      for (const good of validColors) {
        const res = plugin._normalizeAvatarConfig({
          nameplateFontColor: good,
          nameplateBackgroundColor: good
        });
        expect(res.nameplateFontColor).toBe(good.trim());
        expect(res.nameplateBackgroundColor).toBe(good.trim());
      }
    });

    test('text shadow and stroke enums fall back cleanly', () => {
      const resInvalid = plugin._normalizeAvatarConfig({
        nameplateTextShadow: 'massive-shadow',
        nameplateTextStroke: '10px neon'
      });
      expect(resInvalid.nameplateTextShadow).toBe('subtle');
      expect(resInvalid.nameplateTextStroke).toBe('none');

      // Valid options
      for (const shadow of ['none', 'subtle', 'medium', 'glow']) {
        expect(plugin._normalizeAvatarConfig({ nameplateTextShadow: shadow }).nameplateTextShadow).toBe(shadow);
      }
      for (const stroke of ['none', '1px black', '2px black', '1px white']) {
        expect(plugin._normalizeAvatarConfig({ nameplateTextStroke: stroke }).nameplateTextStroke).toBe(stroke);
      }
    });

    test('font family protects against overflow and non-string inputs', () => {
      const longFont = 'A'.repeat(500);
      const resLong = plugin._normalizeAvatarConfig({ nameplateFontFamily: longFont });
      expect(resLong.nameplateFontFamily.length).toBe(120);

      const resBad = plugin._normalizeAvatarConfig({ nameplateFontFamily: '   ' });
      expect(resBad.nameplateFontFamily).toBe('Inter, ui-sans-serif, system-ui, sans-serif');

      const resNull = plugin._normalizeAvatarConfig({ nameplateFontFamily: null });
      expect(resNull.nameplateFontFamily).toBe('Inter, ui-sans-serif, system-ui, sans-serif');
    });
  });

  describe('2. POST /api/talkingheads/config Route & Live Socket Broadcast', () => {
    test('broadcasts talkingheads:config:update live with sanitized payload and persists to SQLite', () => {
      const { plugin, api, io } = createPluginHarness();
      const routeCall = api.registerRoute.mock.calls.find(
        ([m, p]) => m === 'post' && p === '/api/talkingheads/config'
      );
      expect(routeCall).toBeDefined();
      const routeHandler = routeCall[2];

      const resRecorder = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      const hostileBody = {
        nameplatePosition: 'middle', // invalid -> falls back to 'below'
        nameplateFontSize: 150,     // exceeds 48 -> clamps to 48
        nameplateFontColor: 'neon-green', // invalid -> falls back to '#ffffff'
        nameplateBackgroundColor: '#ff00aa',
        nameplateBackgroundOpacity: -5,   // below 0 -> clamps to 0
        headEntranceAnimation: 'explode', // invalid -> 'slide-up'
        headExitAnimation: 'vanish',      // invalid -> 'fade'
        nameplateEntranceAnimation: 'pop',
        nameplateExitAnimation: 'bounce'
      };

      routeHandler({ body: hostileBody }, resRecorder);

      // Verify response
      expect(resRecorder.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        config: expect.objectContaining({
          nameplatePosition: 'below',
          nameplateFontSize: 48,
          nameplateFontColor: '#ffffff',
          nameplateBackgroundColor: '#ff00aa',
          nameplateBackgroundOpacity: 0,
          headEntranceAnimation: 'slide-up',
          headExitAnimation: 'fade',
          nameplateEntranceAnimation: 'pop',
          nameplateExitAnimation: 'bounce'
        })
      }));

      // Verify persisted to SQLite
      expect(api.setConfig).toHaveBeenCalledWith('talking_heads_config', expect.objectContaining({
        nameplatePosition: 'below',
        nameplateFontSize: 48,
        nameplateFontColor: '#ffffff',
        nameplateBackgroundColor: '#ff00aa',
        nameplateBackgroundOpacity: 0,
        headEntranceAnimation: 'slide-up',
        headExitAnimation: 'fade',
        nameplateEntranceAnimation: 'pop',
        nameplateExitAnimation: 'bounce'
      }));

      // Verify Socket.IO live broadcast
      expect(io.emit).toHaveBeenCalledWith('talkingheads:config:update', {
        config: expect.objectContaining({
          nameplatePosition: 'below',
          nameplateFontSize: 48,
          nameplateFontColor: '#ffffff',
          nameplateBackgroundColor: '#ff00aa',
          nameplateBackgroundOpacity: 0
        })
      });
    });
  });

  describe('3. Overlay Dynamic Behavior Without Page Reload', () => {
    test('overlay updates CSS custom variables and existing avatar flex classes on the fly', () => {
      const { dom, handlers } = bootOverlayDom();
      const stage = dom.window.document.getElementById('speakerStage');
      expect(stage).not.toBeNull();

      const configUpdateHandler = handlers.get('talkingheads:config:update');
      const startHandler = handlers.get('talkingheads:animation:start');
      const endHandler = handlers.get('talkingheads:animation:end');
      expect(configUpdateHandler).toBeDefined();
      expect(startHandler).toBeDefined();
      expect(endHandler).toBeDefined();

      // Spawn an active avatar while overlay is on stage
      startHandler({
        playbackId: 'speech-play-1',
        userId: 'viewer-42',
        username: 'GamerOne',
        sprites: {
          idle_neutral: '/sprites/Fox.png',
          speak_open: '/sprites/Fox_open.png',
          speak_closed: '/sprites/Fox_closed.png'
        }
      });

      const avatarElem = dom.window.document.querySelector('#speakerStage .avatar');
      expect(avatarElem).not.toBeNull();
      const headImg = avatarElem.querySelector('img');
      const nameSpan = avatarElem.querySelector('.avatar-name');
      expect(headImg).not.toBeNull();
      expect(nameSpan).not.toBeNull();

      // Default state: below, slide-up head, fade name
      expect(avatarElem.classList.contains('nameplate-below')).toBe(true);
      expect(headImg.classList.contains('th-enter-slide-up')).toBe(true);
      expect(nameSpan.classList.contains('th-enter-fade')).toBe(true);

      // LIVE UPDATE 1: Reposition to 'above' with custom colors and fonts without reloading
      configUpdateHandler({
        config: {
          nameplatePosition: 'above',
          nameplateFontFamily: 'Montserrat, sans-serif',
          nameplateFontSize: 28,
          nameplateFontColor: '#ffbb00',
          nameplateBackgroundColor: '#201040',
          nameplateBackgroundOpacity: 0.6,
          nameplateTextShadow: 'glow',
          nameplateTextStroke: '2px black',
          headExitAnimation: 'bounce',
          nameplateExitAnimation: 'pop'
        }
      });

      // Node identity must be preserved (not remounted or destroyed)
      expect(dom.window.document.querySelector('#speakerStage .avatar')).toBe(avatarElem);

      // Class list updated
      expect(avatarElem.classList.contains('nameplate-above')).toBe(true);
      expect(avatarElem.classList.contains('nameplate-below')).toBe(false);

      // CSS custom properties on stage updated
      expect(stage.style.getPropertyValue('--th-name-font')).toBe('Montserrat, sans-serif');
      expect(stage.style.getPropertyValue('--th-name-size')).toBe('28px');
      expect(stage.style.getPropertyValue('--th-name-color')).toBe('#ffbb00');
      expect(stage.style.getPropertyValue('--th-name-bg')).toBe('rgba(32, 16, 64, 0.6)');
      expect(stage.style.getPropertyValue('--th-name-shadow')).toContain('rgba(101, 225, 255');
      expect(stage.style.getPropertyValue('--th-name-stroke')).toBe('2px #000000');

      // LIVE UPDATE 2: Reposition to 'hidden'
      configUpdateHandler({
        config: {
          nameplatePosition: 'hidden'
        }
      });
      expect(avatarElem.classList.contains('nameplate-hidden')).toBe(true);
      expect(avatarElem.classList.contains('nameplate-above')).toBe(false);

      // LIVE UPDATE 3: Exit animations dynamically honored on speech completion
      endHandler({
        playbackId: 'speech-play-1',
        userId: 'viewer-42',
        fadeOutDuration: 350
      });

      // Exit classes should reflect the updated configuration ('bounce' head, 'pop' name)
      expect(headImg.classList.contains('th-exit-bounce')).toBe(true);
      expect(nameSpan.classList.contains('th-exit-pop')).toBe(true);
      expect(avatarElem.style.getPropertyValue('--th-exit-duration')).toBe('350ms');
    });

    test('overlay survives malformed, null, or empty socket update payloads without throwing', () => {
      const { handlers } = bootOverlayDom();
      const configUpdate = handlers.get('talkingheads:config:update');

      expect(() => configUpdate(null)).not.toThrow();
      expect(() => configUpdate(undefined)).not.toThrow();
      expect(() => configUpdate({})).not.toThrow();
      expect(() => configUpdate({ config: null })).not.toThrow();
      expect(() => configUpdate({ config: 'bad' })).not.toThrow();
      expect(() => configUpdate({ config: {} })).not.toThrow();
    });
  });

  describe('4. XSS and Injection Resistance', () => {
    test('username with script tags and HTML injection is rendered purely as textContent', () => {
      const { dom, handlers } = bootOverlayDom();
      const startHandler = handlers.get('talkingheads:animation:start');

      const hostileName = '<script>window.__pwned = true;</script><img src="x" onerror="window.__pwned2 = true;">';

      startHandler({
        playbackId: 'xss-test-1',
        userId: 'hostile-user',
        username: hostileName,
        sprites: { idle_neutral: '/sprites/Fox.png' }
      });

      const nameSpan = dom.window.document.querySelector('#speakerStage .avatar-name');
      expect(nameSpan).not.toBeNull();
      // Must be rendered as textContent, NOT executable DOM nodes
      expect(nameSpan.textContent).toBe(hostileName);
      expect(nameSpan.querySelector('script')).toBeNull();
      expect(nameSpan.querySelector('img')).toBeNull();
      expect(dom.window.__pwned).toBeUndefined();
      expect(dom.window.__pwned2).toBeUndefined();
    });
  });

  describe('5. 4-Locale i18n Completeness & Parity', () => {
    const LOCALES = ['en', 'de', 'es', 'fr'];
    const requiredNameplateKeys = [
      'kickers.nameplate_style',
      'sections.nameplate_style',
      'labels.nameplate_position',
      'options.position_below',
      'options.position_above',
      'options.position_hidden',
      'labels.nameplate_font_family',
      'fonts.inter',
      'fonts.roboto',
      'fonts.montserrat',
      'fonts.poppins',
      'fonts.impact',
      'fonts.arial',
      'fonts.comic_sans',
      'fonts.press_start_2p',
      'labels.nameplate_font_size',
      'labels.nameplate_font_color',
      'labels.nameplate_background_color',
      'labels.nameplate_background_opacity',
      'labels.nameplate_text_shadow',
      'options.shadow_subtle',
      'options.shadow_none',
      'options.shadow_medium',
      'options.shadow_glow',
      'labels.nameplate_text_stroke',
      'options.stroke_none',
      'options.stroke_1px_black',
      'options.stroke_2px_black',
      'options.stroke_1px_white',
      'labels.head_entrance_animation',
      'options.anim_slide_up',
      'options.anim_slide_down',
      'options.anim_pop',
      'options.anim_bounce',
      'options.anim_fade',
      'labels.head_exit_animation',
      'labels.nameplate_entrance_animation',
      'labels.nameplate_exit_animation',
      'labels.nameplate_preview',
      'preview_speaker',
      'labels.preview_head'
    ];

    function getLeafValue(obj, dotPath) {
      const parts = dotPath.split('.');
      let curr = obj;
      for (const part of parts) {
        if (!curr || typeof curr !== 'object') return undefined;
        curr = curr[part];
      }
      return typeof curr === 'string' ? curr : undefined;
    }

    test.each(LOCALES)('all 41 nameplate keys exist with non-empty strings in %s.json', (locale) => {
      const filePath = path.join(pluginRoot, 'locales', `${locale}.json`);
      expect(fs.existsSync(filePath)).toBe(true);
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const directorTree = content?.plugins?.['talking-heads']?.talking_heads_ui?.stream_director;
      expect(directorTree).toBeDefined();

      const missing = [];
      const empty = [];
      const malformedUtf8 = [];
      const mojibakeRegex = /\uFFFD|\u00C3(?:[\u0080-\u00BF]|\u0192)|\u00C2[\u0080-\u00BF]/;

      for (const key of requiredNameplateKeys) {
        const val = getLeafValue(directorTree, key);
        if (val === undefined) {
          missing.push(key);
        } else if (!val.trim()) {
          empty.push(key);
        } else if (mojibakeRegex.test(val)) {
          malformedUtf8.push({ key, val });
        }
      }

      expect(missing).toEqual([]);
      expect(empty).toEqual([]);
      expect(malformedUtf8).toEqual([]);
    });

    test('all 4 locales have exact structural key parity for nameplate controls', () => {
      const localeTrees = LOCALES.map(loc => {
        const filePath = path.join(pluginRoot, 'locales', `${loc}.json`);
        return JSON.parse(fs.readFileSync(filePath, 'utf8'))?.plugins?.['talking-heads']?.talking_heads_ui?.stream_director;
      });

      for (let i = 1; i < localeTrees.length; i++) {
        for (const key of requiredNameplateKeys) {
          const baseVal = getLeafValue(localeTrees[0], key);
          const compVal = getLeafValue(localeTrees[i], key);
          expect(Boolean(baseVal)).toBe(true);
          expect(Boolean(compVal)).toBe(true);
        }
      }
    });
  });
});
