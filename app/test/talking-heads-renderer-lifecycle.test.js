const TalkingHeadsPlugin = require('../plugins/talking-heads/main');
const AnimationController = require('../plugins/talking-heads/engines/animation-controller');

function createTalkingHeads() {
  const io = { emit: jest.fn() };
  const api = {
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    getSocketIO: jest.fn(() => io),
    getDatabase: jest.fn(() => ({ prepare: jest.fn() })),
    getConfig: jest.fn(() => ({ enabled: true, lotteryAnimationDuration: 10 })),
    getPluginDataDir: jest.fn(() => '/tmp/talking-heads-lifecycle'),
    registerSocket: jest.fn(),
    pluginLoader: { on: jest.fn(), removeListener: jest.fn() }
  };
  const plugin = new TalkingHeadsPlugin(api);
  plugin.config = {
    ...plugin.config,
    enabled: true,
    lotteryAnimationDuration: 10,
    fadeInDuration: 0,
    fadeOutDuration: 0,
    blinkInterval: 1000
  };
  plugin._log = jest.fn();
  plugin.avatarLotteryManager = {
    getAssignment: jest.fn(() => null),
    assign: jest.fn((userId, username, selection) => ({ userId, username, selection, state: 'kept' }))
  };
  plugin.assetSpriteLibrary = {
    getRandomSelection: jest.fn(() => ({ packId: 'boba', characterId: 'Fox', options: { expression: 'Happy' } })),
    getLotteryCandidates: jest.fn(() => [
      { packId: 'boba', characterId: 'Bear', options: { expression: 'Default' } },
      { packId: 'boba', characterId: 'Dog', options: { expression: 'Happy' } },
      { packId: 'boba', characterId: 'Frog', options: { expression: 'Angry' } }
    ]),
    getSpriteSet: jest.fn(async (selection) => ({
      sprites: { idle_neutral: `/sprites/${selection.characterId}.png` }
    }))
  };
  return { plugin, api, io };
}

describe('Talking Heads renderer lifecycle', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('persists an assigned-voice avatar before emitting and awaiting its spin', async () => {
    const { plugin, io } = createTalkingHeads();

    const preparation = plugin.prepareAvatarForPlayback({
      playbackId: 'playback-spin',
      userId: 'viewer-spin',
      username: 'Viewer Spin',
      hasAssignedVoice: true
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(plugin.avatarLotteryManager.assign).toHaveBeenCalledTimes(1);
    expect(io.emit).toHaveBeenCalledWith('talkingheads:avatar:spin:start', expect.objectContaining({
      playbackId: 'playback-spin',
      userId: 'viewer-spin',
      duration: 10,
      winner: expect.objectContaining({ selection: expect.objectContaining({ characterId: 'Fox' }) })
    }));
    expect(plugin.avatarLotteryManager.assign.mock.invocationCallOrder[0])
      .toBeLessThan(io.emit.mock.invocationCallOrder[0]);

    expect(plugin._completeAvatarSpin({ playbackId: 'playback-spin', userId: 'viewer-spin' })).toBe(true);
    await expect(preparation).resolves.toEqual(expect.objectContaining({
      created: true,
      spinStatus: 'complete'
    }));
  });

  test('does not assign or spin a user without an assigned voice', async () => {
    const { plugin, io } = createTalkingHeads();

    await expect(plugin.prepareAvatarForPlayback({
      playbackId: 'no-voice',
      userId: 'viewer-no-voice',
      username: 'Viewer No Voice',
      hasAssignedVoice: false
    })).resolves.toEqual(expect.objectContaining({
      created: false,
      reason: 'voice-not-assigned'
    }));
    expect(plugin.avatarLotteryManager.assign).not.toHaveBeenCalled();
    expect(io.emit).not.toHaveBeenCalled();
  });

  test('falls through after the bounded spin timeout when no overlay is connected', async () => {
    jest.useFakeTimers();
    const { plugin } = createTalkingHeads();
    const preparation = plugin.prepareAvatarForPlayback({
      playbackId: 'spin-timeout',
      userId: 'viewer-timeout',
      username: 'Viewer Timeout',
      hasAssignedVoice: true
    });

    await jest.advanceTimersByTimeAsync(511);
    await expect(preparation).resolves.toEqual(expect.objectContaining({
      created: true,
      spinStatus: 'timeout'
    }));
  });

  test('uses playback ids to ignore a stale terminal event for a newer speaker state', async () => {
    const { plugin, api } = createTalkingHeads();
    const activePlaybackByUser = new Map();
    plugin._handleTTSEvent = jest.fn(async (payload) => {
      activePlaybackByUser.set(payload.userId, payload.playbackId);
    });
    plugin.animationController = {
      setMouthIntensity: jest.fn(),
      endExternalAnimation: jest.fn()
    };
    plugin.activePlaybackByUser = activePlaybackByUser;

    plugin._registerPlaybackBridge();
    const handlers = new Map(api.pluginLoader.on.mock.calls);
    await handlers.get('tts:renderer:started')({
      playbackId: 'first', userId: 'same-user', username: 'Viewer', source: 'chat'
    });
    await handlers.get('tts:renderer:started')({
      playbackId: 'second', userId: 'same-user', username: 'Viewer', source: 'chat'
    });

    handlers.get('tts:renderer:progress')({
      playbackId: 'second', userId: 'same-user', level: 0.8
    });
    handlers.get('tts:renderer:ended')({ playbackId: 'first', userId: 'same-user' });

    expect(plugin.animationController.setMouthIntensity).toHaveBeenCalledWith('same-user', 'second', 0.8);
    expect(plugin.animationController.endExternalAnimation).not.toHaveBeenCalled();
  });

  test('keeps external mouth motion alive only until a matching renderer terminal event', async () => {
    const io = { emit: jest.fn() };
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const controller = new AnimationController(io, logger, {
      fadeInDuration: 0,
      fadeOutDuration: 0,
      blinkInterval: 1000,
      obsEnabled: false
    });
    const sprites = {
      idle_neutral: '/sprites/idle.png',
      speak_closed: '/sprites/closed.png',
      speak_mid: '/sprites/mid.png',
      speak_open: '/sprites/open.png'
    };

    await controller.startAnimation('viewer', 'Viewer', sprites, 10, {
      externalLifecycle: true,
      playbackId: 'renderer-one'
    });
    controller.setMouthIntensity('viewer', 'renderer-one', 0.9);
    expect(io.emit).toHaveBeenCalledWith('talkingheads:animation:frame', {
      userId: 'viewer',
      frame: 'speak_open'
    });

    expect(controller.endExternalAnimation('viewer', 'stale')).toBe(false);
    expect(controller.getActiveCount()).toBe(1);
    expect(controller.endExternalAnimation('viewer', 'renderer-one')).toBe(true);
    controller.stopAllAnimations();
    controller.clearAllTimeouts();
  });

  test('replaces a fading external playback when the same viewer starts a new native audio item', async () => {
    const io = { emit: jest.fn() };
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const controller = new AnimationController(io, logger, {
      fadeInDuration: 0,
      fadeOutDuration: 0,
      blinkInterval: 1000,
      obsEnabled: false
    });
    const sprites = {
      idle_neutral: '/sprites/idle.png',
      speak_closed: '/sprites/closed.png',
      speak_mid: '/sprites/mid.png',
      speak_open: '/sprites/open.png'
    };

    try {
      await controller.startAnimation('viewer', 'Viewer', sprites, 10, {
        externalLifecycle: true,
        playbackId: 'first'
      });
      controller.endExternalAnimation('viewer', 'first');
      await controller.startAnimation('viewer', 'Viewer', sprites, 10, {
        externalLifecycle: true,
        playbackId: 'second'
      });

      expect(controller.setMouthIntensity('viewer', 'second', 0.9)).toBe(true);
      expect(controller.getActiveAnimations()).toEqual(expect.arrayContaining([
        expect.objectContaining({ userId: 'viewer', playbackId: 'second' })
      ]));
    } finally {
      controller.stopAllAnimations();
      controller.clearAllTimeouts();
    }
  });
});
