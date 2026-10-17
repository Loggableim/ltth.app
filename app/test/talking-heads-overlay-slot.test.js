'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const pluginRoot = path.join(__dirname, '..', 'plugins', 'talking-heads');

function bootOverlay({ i18n, productionTranslations } = {}) {
  const html = fs.readFileSync(path.join(pluginRoot, 'overlay.html'), 'utf8');
  const source = fs.readFileSync(path.join(pluginRoot, 'assets', 'overlay.js'), 'utf8');
  const i18nSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'i18n-client.js'), 'utf8');
  const dom = new JSDOM(html, {
    url: productionTranslations
      ? 'http://127.0.0.1:3000/overlay/talking-heads?lang=de'
      : 'http://127.0.0.1:3000/overlay/talking-heads',
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
    fetch: jest.fn(async url => ({
      ok: url === '/api/talkingheads/overlay/translations/de',
      statusText: 'Not Found',
      json: async () => productionTranslations || {}
    })),
    localStorage: dom.window.localStorage,
    URL: dom.window.URL,
    URLSearchParams: dom.window.URLSearchParams,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    requestAnimationFrame: callback => callback(),
    performance: { now: () => 0 },
    Float32Array
  };
  if (productionTranslations) {
    vm.runInNewContext(i18nSource, context, { filename: 'i18n-client.js' });
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
  } else if (i18n) {
    dom.window.i18n = i18n;
  }
  context.io = jest.fn(() => socket);
  vm.runInNewContext(source, context, { filename: 'talking-heads-overlay.js' });
  return {
    dom,
    fetchImpl: context.fetch,
    handlers,
    socket,
    i18nReady: dom.window.i18n?.ready || Promise.resolve()
  };
}

function spinPayload(overrides = {}) {
  return {
    playbackId: 'playback-slot-1',
    userId: 'viewer-slot-1',
    username: 'Slot Viewer',
    spinId: 'opaque-spin-1',
    duration: 240,
    candidates: [
      { spriteUrl: '/api/talkingheads/sprite/Fox.png', selection: { characterId: 'Fox' } },
      { spriteUrl: '/api/talkingheads/sprite/Bear.png', selection: { characterId: 'Bear' } },
      { spriteUrl: '/api/talkingheads/sprite/Frog.png', selection: { characterId: 'Frog' } }
    ],
    winner: {
      selection: { packId: 'boba', characterId: 'Otter' },
      sprites: { idle_neutral: '/api/talkingheads/sprite/Otter.png' }
    },
    ...overrides
  };
}

describe('Talking Heads speaker-stage slot overlay', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('runs three staggered reels and acknowledges the exact opaque spin once at reveal', () => {
    const { dom, handlers, socket } = bootOverlay();
    const startSpin = handlers.get('talkingheads:avatar:spin:start');

    expect(startSpin).toEqual(expect.any(Function));
    if (!startSpin) return;
    startSpin(spinPayload());

    const root = dom.window.document.getElementById('avatarSpinOverlay');
    expect(root).not.toBeNull();
    expect(root.querySelectorAll('[data-slot-reel]').length).toBe(3);
    expect(root.hidden).toBe(false);
    expect(root.classList.contains('is-spinning')).toBe(true);

    jest.advanceTimersByTime(240);

    expect(root.classList.contains('is-revealed')).toBe(true);
    expect(dom.window.document.getElementById('slotWinnerAvatar').getAttribute('src'))
      .toBe('/api/talkingheads/sprite/Otter.png');
    expect(socket.emit).toHaveBeenCalledTimes(1);
    expect(socket.emit).toHaveBeenCalledWith('talkingheads:avatar:spin:complete', {
      playbackId: 'playback-slot-1',
      userId: 'viewer-slot-1',
      spinId: 'opaque-spin-1'
    });
  });

  test.each([
    [
      'Boba Fox',
      { packId: 'boba', characterId: 'Fox', options: { expression: 'Happy' } },
      '/api/talkingheads/sprite/boba-Fox.png',
      'Fox · Happy'
    ],
    [
      'Boba Bear',
      { packId: 'boba', characterId: 'Bear', options: { expression: 'Angry' } },
      '/api/talkingheads/sprite/boba-Bear.png',
      'Bear · Angry'
    ],
    [
      'Boba Bunny',
      { packId: 'boba', characterId: 'Bunny', options: { expression: 'Scared' } },
      '/api/talkingheads/sprite/boba-Bunny.png',
      'Bunny · Scared'
    ]
  ])('labels a %s reel winner with its full pack options', (_packName, selection, spriteUrl, expectedLabel) => {
    const { dom, handlers } = bootOverlay();
    const startSpin = handlers.get('talkingheads:avatar:spin:start');
    startSpin(spinPayload({
      winner: {
        selection,
        sprites: { idle_neutral: spriteUrl }
      }
    }));
    jest.advanceTimersByTime(240);
    expect(dom.window.document.getElementById('slotWinnerName').textContent)
      .toBe(expectedLabel);
  });

  test('queues a preview behind a real spin so the real acknowledgement still arrives once', () => {
    const { handlers, socket } = bootOverlay();
    const startSpin = handlers.get('talkingheads:avatar:spin:start');

    expect(startSpin).toEqual(expect.any(Function));
    if (!startSpin) return;

    startSpin(spinPayload({ duration: 240 }));
    startSpin(spinPayload({
      preview: true,
      playbackId: 'preview-spin-1',
      userId: 'talking-heads-preview',
      spinId: 'preview-opaque-id',
      duration: 80
    }));

    jest.advanceTimersByTime(240);

    expect(socket.emit).toHaveBeenCalledTimes(1);
    expect(socket.emit).toHaveBeenCalledWith('talkingheads:avatar:spin:complete', {
      playbackId: 'playback-slot-1',
      userId: 'viewer-slot-1',
      spinId: 'opaque-spin-1'
    });
  });

  test('uses human-readable fallback copy when the public overlay has no i18n runtime', () => {
    const { dom, handlers } = bootOverlay();
    const startSpin = handlers.get('talkingheads:avatar:spin:start');

    expect(startSpin).toEqual(expect.any(Function));
    if (!startSpin) return;
    startSpin(spinPayload({
      username: '',
      winner: {
        selection: {},
        sprites: { idle_neutral: '/api/talkingheads/sprite/Otter.png' }
      }
    }));

    const document = dom.window.document;
    expect(document.getElementById('slotTitle').textContent).toBe('Assigning a new avatar');
    expect(document.getElementById('slotUsername').textContent).toBe('New voice');
    expect(document.getElementById('slotWinnerName').textContent).toBe('Reels are spinning');

    jest.advanceTimersByTime(240);

    expect(document.getElementById('slotWinnerName').textContent).toBe('Avatar');
  });

  test('boots the supported i18n client from each real overlay entrypoint before dynamic slot copy', async () => {
    const translations = {
      plugins: {
        'talking-heads': {
          talking_heads_ui: {
            stream_director: {
              overlay: {
                assigning: 'Neuer Avatar wird zugewiesen',
                new_voice: 'Neue Stimme',
                reels_spinning: 'Rollen drehen sich',
                avatar: 'Avatar'
              }
            }
          }
        }
      }
    };
    for (const entrypoint of ['overlay.html', 'obs-hud.html']) {
      const html = fs.readFileSync(path.join(pluginRoot, entrypoint), 'utf8');
      const entrypointDocument = new JSDOM(html).window.document;
      const scripts = [...entrypointDocument.querySelectorAll('script[src]')]
        .map(script => script.getAttribute('src'));
      expect(entrypointDocument.querySelector('meta[name="ltth-i18n-base"]')?.getAttribute('content'))
        .toBe('/api/talkingheads/overlay/translations');
      expect(scripts.indexOf('/js/i18n-client.js')).toBeGreaterThanOrEqual(0);
      expect(scripts.indexOf('/js/i18n-client.js'))
        .toBeLessThan(scripts.indexOf('/overlay/talking-heads/assets/overlay.js'));
    }

    const { dom, fetchImpl, handlers, i18nReady } = bootOverlay({
      productionTranslations: translations
    });
    await i18nReady;
    expect(fetchImpl).toHaveBeenCalledWith('/api/talkingheads/overlay/translations/de');
    expect(fetchImpl).not.toHaveBeenCalledWith('/api/i18n/translations/de');
    const startSpin = handlers.get('talkingheads:avatar:spin:start');

    expect(startSpin).toEqual(expect.any(Function));
    if (!startSpin) return;
    startSpin(spinPayload({
      username: '',
      winner: {
        selection: {},
        sprites: { idle_neutral: '/api/talkingheads/sprite/Otter.png' }
      }
    }));

    const document = dom.window.document;
    expect(document.getElementById('slotTitle').textContent).toBe('Neuer Avatar wird zugewiesen');
    expect(document.getElementById('slotUsername').textContent).toBe('Neue Stimme');
    expect(document.getElementById('slotWinnerName').textContent).toBe('Rollen drehen sich');

    jest.advanceTimersByTime(240);

    expect(document.getElementById('slotWinnerName').textContent).toBe('Avatar');
  });

  test('does not let a stale playback end remove a newer speaker stage for the same viewer', () => {
    const { dom, handlers } = bootOverlay();
    const start = handlers.get('talkingheads:animation:start');
    const end = handlers.get('talkingheads:animation:end');

    expect(start).toEqual(expect.any(Function));
    expect(end).toEqual(expect.any(Function));
    if (!start || !end) return;
    start({
      playbackId: 'first-playback',
      userId: 'same-viewer',
      username: 'Same Viewer',
      sprites: { idle_neutral: '/api/talkingheads/sprite/Fox.png' },
      fadeInDuration: 0
    });
    start({
      playbackId: 'second-playback',
      userId: 'same-viewer',
      username: 'Same Viewer',
      sprites: { idle_neutral: '/api/talkingheads/sprite/Bear.png' },
      fadeInDuration: 0
    });

    end({ userId: 'same-viewer', playbackId: 'first-playback', fadeOutDuration: 0 });
    jest.advanceTimersByTime(1);

    const stageAvatar = dom.window.document.querySelector('#speakerStage .avatar img');
    expect(stageAvatar).not.toBeNull();
    expect(stageAvatar.getAttribute('src')).toBe('/api/talkingheads/sprite/Bear.png');
  });

  test('applies nameplate CSS variables on speakerStage and updates live upon talkingheads:config:update', () => {
    const { dom, handlers } = bootOverlay();
    const stage = dom.window.document.getElementById('speakerStage');
    expect(stage).not.toBeNull();

    // Verify initial default properties are set
    expect(stage.style.getPropertyValue('--th-name-font')).toBe('Inter, ui-sans-serif, system-ui, sans-serif');
    expect(stage.style.getPropertyValue('--th-name-size')).toBe('14px');
    expect(stage.style.getPropertyValue('--th-name-color')).toBe('#ffffff');
    expect(stage.style.getPropertyValue('--th-name-bg')).toBe('rgba(6, 12, 28, 0.75)');

    // Trigger live config update
    const configUpdate = handlers.get('talkingheads:config:update');
    expect(configUpdate).toEqual(expect.any(Function));

    configUpdate({
      config: {
        nameplateFontFamily: 'Roboto, sans-serif',
        nameplateFontSize: 22,
        nameplateFontColor: '#ff00aa',
        nameplateBackgroundColor: '#102030',
        nameplateBackgroundOpacity: 0.5,
        nameplateTextShadow: 'glow',
        nameplateTextStroke: '2px black'
      }
    });

    expect(stage.style.getPropertyValue('--th-name-font')).toBe('Roboto, sans-serif');
    expect(stage.style.getPropertyValue('--th-name-size')).toBe('22px');
    expect(stage.style.getPropertyValue('--th-name-color')).toBe('#ff00aa');
    expect(stage.style.getPropertyValue('--th-name-bg')).toBe('rgba(16, 32, 48, 0.5)');
    expect(stage.style.getPropertyValue('--th-name-shadow')).toContain('rgba(101, 225, 255');
    expect(stage.style.getPropertyValue('--th-name-stroke')).toBe('2px #000000');
  });

  test('renders nameplate position class, dynamic updates, and entrance/exit animation classes on avatar instance', () => {
    const { dom, handlers } = bootOverlay();
    const start = handlers.get('talkingheads:animation:start');
    const configUpdate = handlers.get('talkingheads:config:update');
    const end = handlers.get('talkingheads:animation:end');

    expect(start).toEqual(expect.any(Function));
    expect(configUpdate).toEqual(expect.any(Function));
    expect(end).toEqual(expect.any(Function));

    // Configure entrance/exit animations
    configUpdate({
      config: {
        nameplatePosition: 'below',
        headEntranceAnimation: 'bounce',
        headExitAnimation: 'slide-down',
        nameplateEntranceAnimation: 'pop',
        nameplateExitAnimation: 'slide-up'
      }
    });

    start({
      playbackId: 'test-playback-1',
      userId: 'streamer-1',
      username: 'CoolStreamer',
      sprites: { idle_neutral: '/api/talkingheads/sprite/Fox.png' }
    });

    const avatarElem = dom.window.document.querySelector('#speakerStage .avatar');
    expect(avatarElem).not.toBeNull();
    expect(avatarElem.classList.contains('nameplate-below')).toBe(true);

    const headImg = avatarElem.querySelector('img');
    const nameSpan = avatarElem.querySelector('.avatar-name');
    expect(headImg).not.toBeNull();
    expect(nameSpan).not.toBeNull();
    expect(nameSpan.textContent).toBe('CoolStreamer');
    expect(headImg.classList.contains('th-enter-bounce')).toBe(true);
    expect(nameSpan.classList.contains('th-enter-pop')).toBe(true);

    // Live update position to above without reload
    configUpdate({
      config: {
        nameplatePosition: 'above'
      }
    });
    expect(avatarElem.classList.contains('nameplate-above')).toBe(true);
    expect(avatarElem.classList.contains('nameplate-below')).toBe(false);

    // Live update position to hidden
    configUpdate({
      config: {
        nameplatePosition: 'hidden'
      }
    });
    expect(avatarElem.classList.contains('nameplate-hidden')).toBe(true);

    // End animation with exit transition
    end({
      playbackId: 'test-playback-1',
      userId: 'streamer-1',
      fadeOutDuration: 400
    });

    expect(headImg.classList.contains('th-exit-slide-down')).toBe(true);
    expect(nameSpan.classList.contains('th-exit-slide-up')).toBe(true);
    expect(avatarElem.style.getPropertyValue('--th-exit-duration')).toBe('400ms');

    // After animation duration finishes, avatar should be cleaned up
    jest.advanceTimersByTime(400);
    expect(dom.window.document.querySelector('#speakerStage .avatar')).toBeNull();
  });
});
