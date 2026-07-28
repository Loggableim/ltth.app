'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const pluginRoot = path.join(__dirname, '..', 'plugins', 'talking-heads');

function bootOverlay() {
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
    io: jest.fn(() => socket),
    console: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    requestAnimationFrame: callback => callback(),
    performance: { now: () => 0 },
    Float32Array
  };
  vm.runInNewContext(source, context, { filename: 'talking-heads-overlay.js' });
  return { dom, handlers, socket };
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
});
