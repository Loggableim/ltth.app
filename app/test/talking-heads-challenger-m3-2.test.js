'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');
const TalkingHeadsPlugin = require('../plugins/talking-heads/main.js');

const pluginRoot = path.join(__dirname, '..', 'plugins', 'talking-heads');

function bootOverlay({ i18n, initialConfig } = {}) {
  const html = fs.readFileSync(path.join(pluginRoot, 'overlay.html'), 'utf8');
  const source = fs.readFileSync(path.join(pluginRoot, 'assets', 'overlay.js'), 'utf8');
  const dom = new JSDOM(html, {
    url: 'http://127.0.0.1:3000/overlay/talking-heads',
    pretendToBeVisual: true
  });
  const handlers = new Map();
  const socket = {
    id: 'overlay-socket',
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
          json: async () => ({ success: true, config: initialConfig || {} })
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
  if (i18n) dom.window.i18n = i18n;
  context.io = jest.fn(() => socket);
  vm.runInNewContext(source, context, { filename: 'talking-heads-overlay.js' });
  return {
    dom,
    fetchImpl: context.fetch,
    handlers,
    socket
  };
}

function bootDirectorUI(savedConfig = {}) {
  const html = fs.readFileSync(path.join(pluginRoot, 'ui.html'), 'utf8');
  const source = fs.readFileSync(path.join(pluginRoot, 'assets', 'ui.js'), 'utf8');
  const dom = new JSDOM(html, {
    url: 'http://127.0.0.1:3000/plugins/talking-heads/ui.html',
    pretendToBeVisual: true
  });

  let postedConfig = null;
  const fetchImpl = jest.fn(async (url, options = {}) => {
    if (url === '/api/talkingheads/config') {
      if (options.method === 'POST') {
        postedConfig = JSON.parse(options.body || '{}');
        return {
          ok: true,
          json: async () => ({ success: true, config: postedConfig })
        };
      }
      return {
        ok: true,
        json: async () => ({
          success: true,
          config: {
            enabled: true,
            assetPack: 'boba',
            assetCharacter: 'Fox',
            nameplatePosition: 'below',
            nameplateFontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
            nameplateFontSize: 14,
            nameplateFontColor: '#ffffff',
            nameplateBackgroundColor: '#060c1c',
            nameplateBackgroundOpacity: 0.75,
            nameplateTextShadow: 'subtle',
            nameplateTextStroke: 'none',
            headEntranceAnimation: 'slide-up',
            headExitAnimation: 'fade',
            nameplateEntranceAnimation: 'fade',
            nameplateExitAnimation: 'fade',
            ...savedConfig
          },
          assetCatalog: {
            packs: [{ id: 'boba', name: 'Boba Animals', characters: ['Fox'] }]
          }
        })
      };
    }
    if (url === '/api/talkingheads/status') {
      return {
        ok: true,
        json: async () => ({ success: true, status: { enabled: true, rendererBridge: { available: true } } })
      };
    }
    return { ok: true, json: async () => ({ success: true }) };
  });

  const context = {
    window: dom.window,
    document: dom.window.document,
    fetch: fetchImpl,
    console: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    URL: dom.window.URL
  };
  dom.window.i18n = { t: jest.fn((k) => k) };
  vm.runInNewContext(source, context, { filename: 'talking-heads-ui.js' });

  return { dom, fetchImpl, getPostedConfig: () => postedConfig };
}

describe('Talking Heads Challenger M3.2: Adversarial Stress & Verification Suite', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('Adversarial Objective 1: Overlay DOM Entrance & Exit Animations Matrix (All 5 Options)', () => {
    const ANIMATIONS = ['bounce', 'pop', 'slide-up', 'slide-down', 'fade'];

    test.each(ANIMATIONS)('avatar head entrance mounts with exact class th-enter-%s', (anim) => {
      const { dom, handlers } = bootOverlay();
      const start = handlers.get('talkingheads:animation:start');
      const configUpdate = handlers.get('talkingheads:config:update');

      configUpdate({ config: { headEntranceAnimation: anim } });
      start({
        playbackId: `enter-head-${anim}`,
        userId: `user-head-${anim}`,
        username: `Speaker ${anim}`,
        sprites: { idle_neutral: `/sprites/${anim}.png` }
      });

      const img = dom.window.document.querySelector('#speakerStage .avatar img');
      expect(img).not.toBeNull();
      expect(img.classList.contains(`th-enter-${anim}`)).toBe(true);
    });

    test.each(ANIMATIONS)('nameplate entrance mounts with exact class th-enter-%s', (anim) => {
      const { dom, handlers } = bootOverlay();
      const start = handlers.get('talkingheads:animation:start');
      const configUpdate = handlers.get('talkingheads:config:update');

      configUpdate({ config: { nameplateEntranceAnimation: anim } });
      start({
        playbackId: `enter-name-${anim}`,
        userId: `user-name-${anim}`,
        username: `Plate ${anim}`,
        sprites: { idle_neutral: `/sprites/${anim}.png` }
      });

      const name = dom.window.document.querySelector('#speakerStage .avatar .avatar-name');
      expect(name).not.toBeNull();
      expect(name.classList.contains(`th-enter-${anim}`)).toBe(true);
    });

    test.each(ANIMATIONS)('avatar head exit transitions to exact class th-exit-%s and removes enter class', (anim) => {
      const { dom, handlers } = bootOverlay();
      const start = handlers.get('talkingheads:animation:start');
      const end = handlers.get('talkingheads:animation:end');
      const configUpdate = handlers.get('talkingheads:config:update');

      configUpdate({ config: { headEntranceAnimation: 'pop', headExitAnimation: anim } });
      start({
        playbackId: `exit-head-${anim}`,
        userId: `user-head-exit-${anim}`,
        username: `Speaker Exit ${anim}`,
        sprites: { idle_neutral: `/sprites/${anim}.png` }
      });

      const img = dom.window.document.querySelector('#speakerStage .avatar img');
      expect(img.classList.contains('th-enter-pop')).toBe(true);

      end({
        playbackId: `exit-head-${anim}`,
        userId: `user-head-exit-${anim}`,
        fadeOutDuration: 300
      });

      expect(img.classList.contains('th-enter-pop')).toBe(false);
      expect(img.classList.contains(`th-exit-${anim}`)).toBe(true);
    });

    test.each(ANIMATIONS)('nameplate exit transitions to exact class th-exit-%s and removes enter class', (anim) => {
      const { dom, handlers } = bootOverlay();
      const start = handlers.get('talkingheads:animation:start');
      const end = handlers.get('talkingheads:animation:end');
      const configUpdate = handlers.get('talkingheads:config:update');

      configUpdate({ config: { nameplateEntranceAnimation: 'bounce', nameplateExitAnimation: anim } });
      start({
        playbackId: `exit-name-${anim}`,
        userId: `user-name-exit-${anim}`,
        username: `Plate Exit ${anim}`,
        sprites: { idle_neutral: `/sprites/${anim}.png` }
      });

      const name = dom.window.document.querySelector('#speakerStage .avatar .avatar-name');
      expect(name.classList.contains('th-enter-bounce')).toBe(true);

      end({
        playbackId: `exit-name-${anim}`,
        userId: `user-name-exit-${anim}`,
        fadeOutDuration: 300
      });

      expect(name.classList.contains('th-enter-bounce')).toBe(false);
      expect(name.classList.contains(`th-exit-${anim}`)).toBe(true);
    });

    test('overlay.css stylesheet contains complete @keyframes and selectors for all 5 entrance and exit animations', () => {
      const cssPath = path.join(pluginRoot, 'assets', 'overlay.css');
      const cssContent = fs.readFileSync(cssPath, 'utf8');

      ANIMATIONS.forEach((anim) => {
        expect(cssContent).toMatch(new RegExp(`@keyframes\\s+th-enter-${anim}\\b`));
        expect(cssContent).toMatch(new RegExp(`\\.th-enter-${anim}\\b`));
        expect(cssContent).toMatch(new RegExp(`@keyframes\\s+th-exit-${anim}\\b`));
        expect(cssContent).toMatch(new RegExp(`\\.th-exit-${anim}\\b`));
      });
    });
  });

  describe('Adversarial Objective 2: Timing, Exit Duration & Rapid Sequential Lifecycle', () => {
    test('accurately sets --th-exit-duration and delays unmount until transition finishes', () => {
      const { dom, handlers } = bootOverlay();
      const start = handlers.get('talkingheads:animation:start');
      const end = handlers.get('talkingheads:animation:end');

      start({
        playbackId: 'pb-duration-test',
        userId: 'user-duration',
        username: 'Duration Tester',
        sprites: { idle_neutral: '/sprites/Fox.png' }
      });

      const avatarElem = dom.window.document.querySelector('#speakerStage .avatar');
      expect(avatarElem).not.toBeNull();

      // Trigger exit with custom 750ms duration
      end({
        playbackId: 'pb-duration-test',
        userId: 'user-duration',
        fadeOutDuration: 750
      });

      expect(avatarElem.style.getPropertyValue('--th-exit-duration')).toBe('750ms');
      expect(avatarElem.classList.contains('is-leaving')).toBe(true);
      expect(avatarElem.classList.contains('is-visible')).toBe(false);

      // Advance time to 749ms - element must STILL be present
      jest.advanceTimersByTime(749);
      expect(dom.window.document.querySelector('#speakerStage .avatar')).toBe(avatarElem);

      // Advance by 1ms to 750ms - element must now be removed
      jest.advanceTimersByTime(1);
      expect(dom.window.document.querySelector('#speakerStage .avatar')).toBeNull();
    });

    test('immediate zero-duration exit removes element with 0ms delay without dangling nodes', () => {
      const { dom, handlers } = bootOverlay();
      const start = handlers.get('talkingheads:animation:start');
      const end = handlers.get('talkingheads:animation:end');

      start({
        playbackId: 'pb-zero-duration',
        userId: 'user-zero',
        username: 'Zero Duration',
        sprites: { idle_neutral: '/sprites/Fox.png' }
      });

      const avatarElem = dom.window.document.querySelector('#speakerStage .avatar');
      expect(avatarElem).not.toBeNull();

      end({
        playbackId: 'pb-zero-duration',
        userId: 'user-zero',
        fadeOutDuration: 0
      });

      expect(avatarElem.style.getPropertyValue('--th-exit-duration')).toBe('0ms');
      jest.advanceTimersByTime(0);
      expect(dom.window.document.querySelector('#speakerStage .avatar')).toBeNull();
    });

    test('rapid sequential animation:end calls do not cause null pointer exceptions or leave dangling DOM nodes', () => {
      const { dom, handlers } = bootOverlay();
      const start = handlers.get('talkingheads:animation:start');
      const end = handlers.get('talkingheads:animation:end');

      start({
        playbackId: 'pb-rapid-end',
        userId: 'user-rapid',
        username: 'Rapid End Tester',
        sprites: { idle_neutral: '/sprites/Fox.png' }
      });

      // Call end repeatedly in the same tick and slightly delayed
      expect(() => {
        end({ playbackId: 'pb-rapid-end', userId: 'user-rapid', fadeOutDuration: 200 });
        end({ playbackId: 'pb-rapid-end', userId: 'user-rapid', fadeOutDuration: 200 });
        jest.advanceTimersByTime(50);
        end({ playbackId: 'pb-rapid-end', userId: 'user-rapid', fadeOutDuration: 200 });
      }).not.toThrow();

      jest.advanceTimersByTime(250);
      expect(dom.window.document.querySelectorAll('#speakerStage .avatar').length).toBe(0);
    });

    test('immediate animation:stop during active exit removes avatar at once without post-timer errors', () => {
      const { dom, handlers } = bootOverlay();
      const start = handlers.get('talkingheads:animation:start');
      const end = handlers.get('talkingheads:animation:end');
      const stop = handlers.get('talkingheads:animation:stop');

      start({
        playbackId: 'pb-stop-during-exit',
        userId: 'user-abort',
        username: 'Abort Tester',
        sprites: { idle_neutral: '/sprites/Fox.png' }
      });

      end({ playbackId: 'pb-stop-during-exit', userId: 'user-abort', fadeOutDuration: 500 });
      expect(dom.window.document.querySelector('#speakerStage .avatar')).not.toBeNull();

      // Immediate hard stop while exit animation is pending
      stop({ playbackId: 'pb-stop-during-exit', userId: 'user-abort' });
      expect(dom.window.document.querySelector('#speakerStage .avatar')).toBeNull();

      // When the original 500ms timeout triggers, it should execute cleanly without error
      expect(() => {
        jest.advanceTimersByTime(600);
      }).not.toThrow();
      expect(dom.window.document.querySelector('#speakerStage .avatar')).toBeNull();
    });

    test('rapid turn-around: new playback for same user replaces exiting avatar and surviving avatar is not deleted', () => {
      const { dom, handlers } = bootOverlay();
      const start = handlers.get('talkingheads:animation:start');
      const end = handlers.get('talkingheads:animation:end');

      // 1. Initial speech starts
      start({
        playbackId: 'first-speech',
        userId: 'speaker-repeat',
        username: 'Speaker 1st',
        sprites: { idle_neutral: '/sprites/Fox.png' }
      });

      // 2. Initial speech starts exiting with 400ms duration
      end({
        playbackId: 'first-speech',
        userId: 'speaker-repeat',
        fadeOutDuration: 400
      });

      // 3. User immediately starts speaking again with second playback at 100ms
      jest.advanceTimersByTime(100);
      start({
        playbackId: 'second-speech',
        userId: 'speaker-repeat',
        username: 'Speaker 2nd',
        sprites: { idle_neutral: '/sprites/Bear.png' }
      });

      const currentAvatar = dom.window.document.querySelector('#speakerStage .avatar');
      expect(currentAvatar).not.toBeNull();
      expect(currentAvatar.querySelector('img').getAttribute('src')).toBe('/sprites/Bear.png');

      // 4. Advance time past the original 400ms exit timer (total 500ms)
      jest.advanceTimersByTime(400);

      // The new active avatar must NOT have been removed by the stale first timer!
      const activeAvatar = dom.window.document.querySelector('#speakerStage .avatar');
      expect(activeAvatar).not.toBeNull();
      expect(activeAvatar.querySelector('img').getAttribute('src')).toBe('/sprites/Bear.png');
    });

    test('staggered interleaving of 10 concurrent avatars handles all lifecycles cleanly', () => {
      const { dom, handlers } = bootOverlay();
      const start = handlers.get('talkingheads:animation:start');
      const end = handlers.get('talkingheads:animation:end');
      const stage = dom.window.document.getElementById('speakerStage');

      // Spawn 10 concurrent speakers
      for (let i = 0; i < 10; i++) {
        start({
          playbackId: `concurrent-pb-${i}`,
          userId: `concurrent-user-${i}`,
          username: `Speaker ${i}`,
          sprites: { idle_neutral: `/sprites/Animal_${i}.png` }
        });
      }

      expect(dom.window.document.querySelectorAll('#speakerStage .avatar').length).toBe(10);
      expect(stage.classList.contains('is-speaking')).toBe(true);

      // Interleave exits
      for (let i = 0; i < 10; i++) {
        end({
          playbackId: `concurrent-pb-${i}`,
          userId: `concurrent-user-${i}`,
          fadeOutDuration: 100 + i * 20
        });
      }

      // Check halfway (at 180ms)
      jest.advanceTimersByTime(180);
      const remainingCount = dom.window.document.querySelectorAll('#speakerStage .avatar').length;
      expect(remainingCount).toBeLessThan(10);
      expect(remainingCount).toBeGreaterThan(0);
      expect(stage.classList.contains('is-speaking')).toBe(true);

      // Advance through all exit durations (100 + 9*20 = 280ms)
      jest.advanceTimersByTime(200);
      expect(dom.window.document.querySelectorAll('#speakerStage .avatar').length).toBe(0);
      expect(stage.classList.contains('is-speaking')).toBe(false);
    });
  });

  describe('Adversarial Objective 3: Nameplate Positioning, Flexbox Ordering & CSS Variables', () => {
    test('flexbox order and visibility rules: nameplate-above, nameplate-below, and nameplate-hidden', () => {
      const { dom, handlers } = bootOverlay();
      const start = handlers.get('talkingheads:animation:start');
      const configUpdate = handlers.get('talkingheads:config:update');

      const cssContent = fs.readFileSync(path.join(pluginRoot, 'assets', 'overlay.css'), 'utf8');

      // Verify stylesheet rules
      expect(cssContent).toMatch(/\.avatar\.nameplate-above\s+\.avatar-name\s*\{\s*order:\s*-1/);
      expect(cssContent).toMatch(/\.avatar\.nameplate-below\s+\.avatar-name\s*\{\s*order:\s*1/);
      expect(cssContent).toMatch(/\.avatar\.nameplate-hidden\s+\.avatar-name\s*\{\s*display:\s*none\s*!important/);

      // Verify DOM class attachment for "above"
      configUpdate({ config: { nameplatePosition: 'above' } });
      start({
        playbackId: 'pb-above',
        userId: 'user-pos',
        username: 'Above Guy',
        sprites: { idle_neutral: '/sprites/Fox.png' }
      });
      let avatar = dom.window.document.querySelector('#speakerStage .avatar');
      expect(avatar.classList.contains('nameplate-above')).toBe(true);
      expect(avatar.classList.contains('nameplate-below')).toBe(false);
      expect(avatar.classList.contains('nameplate-hidden')).toBe(false);

      // Dynamic switch to "below"
      configUpdate({ config: { nameplatePosition: 'below' } });
      expect(avatar.classList.contains('nameplate-below')).toBe(true);
      expect(avatar.classList.contains('nameplate-above')).toBe(false);

      // Dynamic switch to "hidden"
      configUpdate({ config: { nameplatePosition: 'hidden' } });
      expect(avatar.classList.contains('nameplate-hidden')).toBe(true);
      expect(avatar.classList.contains('nameplate-below')).toBe(false);
    });

    test('all 6 CSS variables accurately propagate to #speakerStage with proper fallbacks', () => {
      const { dom, handlers } = bootOverlay();
      const configUpdate = handlers.get('talkingheads:config:update');
      const stage = dom.window.document.getElementById('speakerStage');

      configUpdate({
        config: {
          nameplateFontFamily: '"Press Start 2P", monospace',
          nameplateFontSize: 32,
          nameplateFontColor: '#12abef',
          nameplateBackgroundColor: '#ff8800',
          nameplateBackgroundOpacity: 0.45,
          nameplateTextShadow: 'glow',
          nameplateTextStroke: '2px black'
        }
      });

      expect(stage.style.getPropertyValue('--th-name-font')).toBe('"Press Start 2P", monospace');
      expect(stage.style.getPropertyValue('--th-name-size')).toBe('32px');
      expect(stage.style.getPropertyValue('--th-name-color')).toBe('#12abef');
      expect(stage.style.getPropertyValue('--th-name-bg')).toBe('rgba(255, 136, 0, 0.45)');
      expect(stage.style.getPropertyValue('--th-name-shadow')).toBe('0 0 8px rgba(101, 225, 255, 0.8), 0 0 14px rgba(101, 225, 255, 0.5)');
      expect(stage.style.getPropertyValue('--th-name-stroke')).toBe('2px #000000');
    });

    test.each([
      ['none', 'none'],
      ['subtle', '0 1px 3px rgba(0, 0, 0, 0.8)'],
      ['medium', '0 2px 8px rgba(0, 0, 0, 0.9)'],
      ['glow', '0 0 8px rgba(101, 225, 255, 0.8), 0 0 14px rgba(101, 225, 255, 0.5)']
    ])('maps text shadow enum %s to exact CSS shadow definition', (shadowKey, expectedValue) => {
      const { dom, handlers } = bootOverlay();
      const configUpdate = handlers.get('talkingheads:config:update');
      const stage = dom.window.document.getElementById('speakerStage');

      configUpdate({ config: { nameplateTextShadow: shadowKey } });
      expect(stage.style.getPropertyValue('--th-name-shadow')).toBe(expectedValue);
    });

    test.each([
      ['none', '0 transparent'],
      ['1px black', '1px #000000'],
      ['2px black', '2px #000000'],
      ['1px white', '1px #ffffff']
    ])('maps text stroke enum %s to exact CSS stroke definition', (strokeKey, expectedValue) => {
      const { dom, handlers } = bootOverlay();
      const configUpdate = handlers.get('talkingheads:config:update');
      const stage = dom.window.document.getElementById('speakerStage');

      configUpdate({ config: { nameplateTextStroke: strokeKey } });
      expect(stage.style.getPropertyValue('--th-name-stroke')).toBe(expectedValue);
    });

    test('hexToRgba correctly parses 3-character hex, 6-character hex, and clamps opacity', () => {
      const { dom, handlers } = bootOverlay();
      const configUpdate = handlers.get('talkingheads:config:update');
      const stage = dom.window.document.getElementById('speakerStage');

      // 3-digit hex #abc with opacity 0.8
      configUpdate({ config: { nameplateBackgroundColor: '#abc', nameplateBackgroundOpacity: 0.8 } });
      expect(stage.style.getPropertyValue('--th-name-bg')).toBe('rgba(170, 187, 204, 0.8)');

      // 6-digit hex #ffffff with opacity 0
      configUpdate({ config: { nameplateBackgroundColor: '#ffffff', nameplateBackgroundOpacity: 0 } });
      expect(stage.style.getPropertyValue('--th-name-bg')).toBe('rgba(255, 255, 255, 0)');

      // Out of bounds opacity > 1 clamped to 1
      configUpdate({ config: { nameplateBackgroundColor: '#000000', nameplateBackgroundOpacity: 2.5 } });
      expect(stage.style.getPropertyValue('--th-name-bg')).toBe('rgba(0, 0, 0, 1)');

      // Malformed hex string fallbacks gracefully
      configUpdate({ config: { nameplateBackgroundColor: 'not-hex', nameplateBackgroundOpacity: 0.5 } });
      expect(stage.style.getPropertyValue('--th-name-bg')).toBe('rgba(6, 12, 28, 0.5)');
    });
  });

  describe('Adversarial Objective 4: Stream Director UI & Mock Submission', () => {
    test('all 12 input controls in ui.html exist, are correctly typed, and have data-i18n attributes', () => {
      const html = fs.readFileSync(path.join(pluginRoot, 'ui.html'), 'utf8');
      const doc = new JSDOM(html).window.document;

      const controls = [
        { id: 'nameplatePosition', tag: 'SELECT' },
        { id: 'nameplateFontFamily', tag: 'SELECT' },
        { id: 'nameplateFontSize', tag: 'INPUT', type: 'number' },
        { id: 'nameplateFontColor', tag: 'INPUT', type: 'color' },
        { id: 'nameplateBackgroundColor', tag: 'INPUT', type: 'color' },
        { id: 'nameplateBackgroundOpacity', tag: 'INPUT', type: 'range' },
        { id: 'nameplateTextShadow', tag: 'SELECT' },
        { id: 'nameplateTextStroke', tag: 'SELECT' },
        { id: 'headEntranceAnimation', tag: 'SELECT' },
        { id: 'headExitAnimation', tag: 'SELECT' },
        { id: 'nameplateEntranceAnimation', tag: 'SELECT' },
        { id: 'nameplateExitAnimation', tag: 'SELECT' }
      ];

      controls.forEach(({ id, tag, type }) => {
        const elem = doc.getElementById(id);
        expect(elem).not.toBeNull();
        expect(elem.tagName).toBe(tag);
        if (type) expect(elem.type).toBe(type);

        const label = elem.closest('label');
        expect(label).not.toBeNull();
        const i18nSpan = label.querySelector('[data-i18n]');
        expect(i18nSpan).not.toBeNull();
      });

      // Verify mini-preview elements exist
      expect(doc.getElementById('nameplatePreviewBox')).not.toBeNull();
      expect(doc.getElementById('nameplatePreviewAvatar')).not.toBeNull();
      expect(doc.getElementById('nameplatePreviewHead')).not.toBeNull();
      expect(doc.getElementById('nameplatePreviewName')).not.toBeNull();
      expect(doc.getElementById('saveNameplateSettingsBtn')).not.toBeNull();
    });

    test('mutating input controls immediately updates live mini-preview styles and opacity badge', async () => {
      const { dom } = bootDirectorUI();
      dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
      await Promise.resolve();
      await Promise.resolve();

      const doc = dom.window.document;
      const previewAvatar = doc.getElementById('nameplatePreviewAvatar');
      const previewName = doc.getElementById('nameplatePreviewName');
      const opacityBadge = doc.getElementById('opacityValue');

      // Change position to above
      const posSelect = doc.getElementById('nameplatePosition');
      posSelect.value = 'above';
      posSelect.dispatchEvent(new dom.window.Event('change'));
      expect(previewAvatar.className).toBe('avatar nameplate-above');

      // Change font family
      const fontSelect = doc.getElementById('nameplateFontFamily');
      fontSelect.value = 'Arial, sans-serif';
      fontSelect.dispatchEvent(new dom.window.Event('change'));
      expect(previewName.style.fontFamily).toBe('Arial, sans-serif');

      // Change font size
      const sizeInput = doc.getElementById('nameplateFontSize');
      sizeInput.value = '28';
      sizeInput.dispatchEvent(new dom.window.Event('input'));
      expect(previewName.style.fontSize).toBe('28px');

      // Change font color
      const colorInput = doc.getElementById('nameplateFontColor');
      colorInput.value = '#ff00aa';
      colorInput.dispatchEvent(new dom.window.Event('input'));
      expect(previewName.style.color).toBe('rgb(255, 0, 170)');

      // Change opacity
      const opacityInput = doc.getElementById('nameplateBackgroundOpacity');
      opacityInput.value = '0.9';
      opacityInput.dispatchEvent(new dom.window.Event('input'));
      expect(opacityBadge.textContent).toBe('90%');

      // Change text shadow
      const shadowSelect = doc.getElementById('nameplateTextShadow');
      shadowSelect.value = 'glow';
      shadowSelect.dispatchEvent(new dom.window.Event('change'));
      expect(previewName.style.textShadow).toContain('rgba(101, 225, 255');
    });

    test('clicking saveNameplateSettingsBtn serializes all 12 fields and sends POST request', async () => {
      const { dom, fetchImpl, getPostedConfig } = bootDirectorUI();
      dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
      await Promise.resolve();
      await Promise.resolve();

      const doc = dom.window.document;
      doc.getElementById('nameplatePosition').value = 'above';
      doc.getElementById('nameplateFontFamily').value = 'Montserrat, sans-serif';
      doc.getElementById('nameplateFontSize').value = '22';
      doc.getElementById('nameplateFontColor').value = '#112233';
      doc.getElementById('nameplateBackgroundColor').value = '#445566';
      doc.getElementById('nameplateBackgroundOpacity').value = '0.65';
      doc.getElementById('nameplateTextShadow').value = 'medium';
      doc.getElementById('nameplateTextStroke').value = '2px black';
      doc.getElementById('headEntranceAnimation').value = 'bounce';
      doc.getElementById('headExitAnimation').value = 'pop';
      doc.getElementById('nameplateEntranceAnimation').value = 'slide-up';
      doc.getElementById('nameplateExitAnimation').value = 'slide-down';

      const saveBtn = doc.getElementById('saveNameplateSettingsBtn');
      expect(saveBtn).not.toBeNull();
      saveBtn.click();
      await Promise.resolve();
      await Promise.resolve();

      expect(fetchImpl).toHaveBeenCalledWith('/api/talkingheads/config', expect.objectContaining({
        method: 'POST'
      }));

      const posted = getPostedConfig();
      expect(posted).toMatchObject({
        nameplatePosition: 'above',
        nameplateFontFamily: 'Montserrat, sans-serif',
        nameplateFontSize: 22,
        nameplateFontColor: '#112233',
        nameplateBackgroundColor: '#445566',
        nameplateBackgroundOpacity: 0.65,
        nameplateTextShadow: 'medium',
        nameplateTextStroke: '2px black',
        headEntranceAnimation: 'bounce',
        headExitAnimation: 'pop',
        nameplateEntranceAnimation: 'slide-up',
        nameplateExitAnimation: 'slide-down'
      });
    });
  });

  describe('Adversarial Objective 5: Backend Normalization, Clamping & End-to-End Live Sync', () => {
    function createMockPlugin() {
      const io = { emit: jest.fn(), on: jest.fn() };
      let storedConfig = {};
      const api = {
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        getSocketIO: jest.fn(() => io),
        getDatabase: jest.fn(() => ({
          prepare: jest.fn(() => ({ run: jest.fn(), get: jest.fn(), all: jest.fn(() => []) }))
        })),
        getConfig: jest.fn(() => storedConfig),
        setConfig: jest.fn((key, val) => { storedConfig = val; }),
        getPluginDataDir: jest.fn(() => '/tmp/talking-heads'),
        ensurePluginDataDir: jest.fn(),
        registerRoute: jest.fn(),
        registerSocket: jest.fn(),
        registerTikTokEvent: jest.fn(),
        pluginLoader: { on: jest.fn(), removeListener: jest.fn() }
      };
      const plugin = new TalkingHeadsPlugin(api);
      plugin.assetSpriteLibrary = {
        getCatalog: jest.fn(() => ({ packs: [{ id: 'boba', name: 'Boba Animals', characters: ['Fox'] }] })),
        normalizeSelection: jest.fn((s) => s)
      };
      plugin.avatarLotteryManager = {
        assign: jest.fn(),
        getAssignment: jest.fn(() => null)
      };
      return { plugin, api, io };
    }

    test('_normalizeAvatarConfig clamps out-of-range numbers, sanitizes colors, and validates enums', () => {
      const { plugin } = createMockPlugin();

      const hostilePayload = {
        nameplatePosition: 'INVALID_POSITION',
        nameplateFontFamily: '   <script>alert(1)</script>   ',
        nameplateFontSize: 9999, // Should clamp to 48
        nameplateFontColor: 'not-hex', // Should fallback to #ffffff
        nameplateBackgroundColor: '#1234567890', // Exceeds hex regex length -> fallback #060c1c
        nameplateBackgroundOpacity: -10, // Should clamp to 0
        nameplateTextShadow: 'INVALID_SHADOW', // Should fallback to subtle
        nameplateTextStroke: 'INVALID_STROKE', // Should fallback to none
        headEntranceAnimation: 'INVALID_ANIM', // Should fallback to slide-up
        headExitAnimation: 'INVALID_ANIM', // Should fallback to fade
        nameplateEntranceAnimation: 'INVALID_ANIM', // Should fallback to fade
        nameplateExitAnimation: 'INVALID_ANIM' // Should fallback to fade
      };

      const normalized = plugin._normalizeAvatarConfig(hostilePayload);
      expect(normalized).toMatchObject({
        nameplatePosition: 'below',
        nameplateFontFamily: '<script>alert(1)</script>',
        nameplateFontSize: 48,
        nameplateFontColor: '#ffffff',
        nameplateBackgroundColor: '#060c1c',
        nameplateBackgroundOpacity: 0,
        nameplateTextShadow: 'subtle',
        nameplateTextStroke: 'none',
        headEntranceAnimation: 'slide-up',
        headExitAnimation: 'fade',
        nameplateEntranceAnimation: 'fade',
        nameplateExitAnimation: 'fade'
      });

      // Also check lower bounds
      const lowerTest = plugin._normalizeAvatarConfig({
        nameplateFontSize: 2,
        nameplateBackgroundOpacity: 10
      });
      expect(lowerTest.nameplateFontSize).toBe(10);
      expect(lowerTest.nameplateBackgroundOpacity).toBe(1);
    });

    test('end-to-end sync: Director UI submission -> backend broadcast -> overlay live update without reload', () => {
      const { plugin, io, api } = createMockPlugin();
      plugin._registerRoutes();

      // Find POST /api/talkingheads/config route handler
      const postConfigEntry = api.registerRoute.mock.calls.find(
        ([method, url]) => method === 'post' && url === '/api/talkingheads/config'
      );
      expect(postConfigEntry).toBeDefined();
      const postConfigHandler = postConfigEntry[2];

      // Boot overlay
      const { dom, handlers } = bootOverlay();
      const stage = dom.window.document.getElementById('speakerStage');
      const start = handlers.get('talkingheads:animation:start');

      // Start an avatar on overlay
      start({
        playbackId: 'roundtrip-pb',
        userId: 'roundtrip-user',
        username: 'Live Roundtrip User',
        sprites: { idle_neutral: '/sprites/Fox.png' }
      });

      let avatar = dom.window.document.querySelector('#speakerStage .avatar');
      expect(avatar.classList.contains('nameplate-below')).toBe(true);

      // Simulate Director UI posting new settings to backend
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };

      postConfigHandler({
        body: {
          nameplatePosition: 'above',
          nameplateFontSize: 26,
          nameplateFontColor: '#00ffee',
          nameplateBackgroundColor: '#223344',
          nameplateBackgroundOpacity: 0.8,
          headEntranceAnimation: 'pop',
          headExitAnimation: 'bounce'
        }
      }, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
      expect(io.emit).toHaveBeenCalledWith('talkingheads:config:update', expect.objectContaining({
        config: expect.objectContaining({
          nameplatePosition: 'above',
          nameplateFontSize: 26,
          nameplateFontColor: '#00ffee'
        })
      }));

      // Broadcast received by overlay
      const broadcastPayload = io.emit.mock.calls.find(([event]) => event === 'talkingheads:config:update')[1];
      const overlayConfigUpdate = handlers.get('talkingheads:config:update');
      overlayConfigUpdate(broadcastPayload);

      // Verify overlay stage variables updated live
      expect(stage.style.getPropertyValue('--th-name-size')).toBe('26px');
      expect(stage.style.getPropertyValue('--th-name-color')).toBe('#00ffee');
      expect(stage.style.getPropertyValue('--th-name-bg')).toBe('rgba(34, 51, 68, 0.8)');

      // Verify active avatar element updated position without recreation
      avatar = dom.window.document.querySelector('#speakerStage .avatar');
      expect(avatar.classList.contains('nameplate-above')).toBe(true);
      expect(avatar.classList.contains('nameplate-below')).toBe(false);
    });
  });
});
