const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const TalkingHeadsPlugin = require('../plugins/talking-heads/main');
const AnimationController = require('../plugins/talking-heads/engines/animation-controller');
const CacheManager = require('../plugins/talking-heads/utils/cache-manager');

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

  test('persists an assigned-voice avatar before emitting and only completes its spin at reveal', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
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
      spinId: expect.any(String),
      winner: expect.objectContaining({ selection: expect.objectContaining({ characterId: 'Fox' }) })
    }));
    expect(plugin.avatarLotteryManager.assign.mock.invocationCallOrder[0])
      .toBeLessThan(io.emit.mock.invocationCallOrder[0]);

    const spin = io.emit.mock.calls.find(([event]) => event === 'talkingheads:avatar:spin:start')[1];
    expect(plugin._completeAvatarSpin({
      playbackId: 'playback-spin',
      userId: 'viewer-spin'
    })).toBe(false);
    expect(plugin._completeAvatarSpin({
      playbackId: 'playback-spin',
      userId: 'viewer-spin',
      spinId: 'untrusted-spin-id'
    })).toBe(false);
    expect(plugin._completeAvatarSpin({
      playbackId: 'playback-spin',
      userId: 'viewer-spin',
      spinId: spin.spinId
    })).toBe(false);
    await jest.advanceTimersByTimeAsync(9);
    expect(plugin._completeAvatarSpin({
      playbackId: 'playback-spin',
      userId: 'viewer-spin',
      spinId: spin.spinId
    })).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(plugin._completeAvatarSpin({
      playbackId: 'playback-spin',
      userId: 'viewer-spin',
      spinId: spin.spinId
    })).toBe(true);
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

  test('keeps renderer sprites through fade and delivery grace before releasing only the ended playback owner', async () => {
    const { plugin, api, io } = createTalkingHeads();
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'talking-heads-lifecycle-'));
    const db = new Database(':memory:');
    const cacheManager = new CacheManager(dataDir, db, api.logger, {
      cacheEnabled: true,
      cacheDuration: 60 * 60 * 1000
    });
    await cacheManager.init();
    const avatarsDir = path.join(dataDir, 'avatars');
    const endedOnlySprite = path.join(avatarsDir, 'asset_boba_111111111111_idle_neutral.svg');
    const sharedSprite = path.join(avatarsDir, 'asset_boba_222222222222_idle_neutral.svg');

    try {
      await cacheManager.materializeGeneratedAssets(
        'playback:short-audio',
        [endedOnlySprite, sharedSprite],
        Date.now() + 60 * 60 * 1000,
        async () => {
          await fs.mkdir(avatarsDir, { recursive: true });
          await Promise.all([
            fs.writeFile(endedOnlySprite, '<svg></svg>'),
            fs.writeFile(sharedSprite, '<svg></svg>')
          ]);
        }
      );
      await cacheManager.registerGeneratedAssets(
        'playback:newer-audio',
        [sharedSprite],
        Date.now() + 60 * 60 * 1000
      );

      jest.useFakeTimers();
      plugin.config.fadeOutDuration = 300;
      plugin.config.obsEnabled = false;
      plugin.cacheManager = cacheManager;
      plugin.animationController = new AnimationController(io, api.logger, plugin.config, null);
      plugin.animationController.startAnimation(
        'same-user',
        'Viewer',
        { idle_neutral: '/api/talkingheads/sprite/asset_boba_111111111111_idle_neutral.svg' },
        5000,
        { playbackId: 'short-audio', externalLifecycle: true }
      );
      plugin.activePlaybackByUser.set('same-user', 'short-audio');
      plugin.activePlaybackByUser.set('newer-user', 'newer-audio');

      plugin._registerPlaybackBridge();
      const handlers = new Map(api.pluginLoader.on.mock.calls);
      handlers.get('tts:renderer:ended')({
        playbackId: 'short-audio',
        userId: 'same-user'
      });
      await cacheManager.generatedAssetLock;
      await cacheManager.clearAllCache(plugin._getActiveGeneratedAssetOwnerIds());

      expect(plugin.activePlaybackByUser.has('same-user')).toBe(false);
      expect(plugin.animationController.activeAnimations.get('same-user').state).toBe('fading_out');
      await expect(fs.access(endedOnlySprite)).resolves.toBeUndefined();
      expect(db.prepare(
        'SELECT owner_id FROM talking_heads_generated_assets WHERE asset_path = ? ORDER BY owner_id'
      ).all(endedOnlySprite)).toEqual([{ owner_id: 'playback:short-audio' }]);

      await jest.advanceTimersByTimeAsync(1499);
      expect(io.emit).toHaveBeenCalledWith('talkingheads:animation:end', expect.objectContaining({
        playbackId: 'short-audio',
        fadeOutDuration: 300
      }));
      await expect(fs.access(endedOnlySprite)).resolves.toBeUndefined();

      await jest.advanceTimersByTimeAsync(1);
      await cacheManager.generatedAssetLock;
      await expect(fs.access(endedOnlySprite)).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(fs.access(sharedSprite)).resolves.toBeUndefined();
      expect(db.prepare(
        'SELECT owner_id FROM talking_heads_generated_assets WHERE asset_path = ? ORDER BY owner_id'
      ).all(sharedSprite)).toEqual([{ owner_id: 'playback:newer-audio' }]);

      await cacheManager.releaseGeneratedAssetOwner('playback:newer-audio');
      await expect(fs.access(sharedSprite)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await plugin.destroy();
      db.close();
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  });

  test('destroy drains a pending renderer sprite release instead of orphaning its owner', async () => {
    const { plugin, api } = createTalkingHeads();
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'talking-heads-destroy-'));
    const db = new Database(':memory:');
    const cacheManager = new CacheManager(dataDir, db, api.logger, {
      cacheEnabled: true,
      cacheDuration: 60 * 60 * 1000
    });
    await cacheManager.init();
    const spritePath = path.join(
      dataDir,
      'avatars',
      'asset_boba_333333333333_idle_neutral.svg'
    );

    try {
      await cacheManager.materializeGeneratedAssets(
        'playback:reload-audio',
        [spritePath],
        Date.now() + 60 * 60 * 1000,
        async () => {
          await fs.mkdir(path.dirname(spritePath), { recursive: true });
          await fs.writeFile(spritePath, '<svg></svg>');
        }
      );

      jest.useFakeTimers();
      plugin.cacheManager = cacheManager;
      plugin.animationController = {
        endExternalAnimation: jest.fn(),
        stopAllAnimations: jest.fn(),
        clearAllTimeouts: jest.fn()
      };
      plugin.activePlaybackByUser.set('reload-user', 'reload-audio');
      plugin._registerPlaybackBridge();
      const handlers = new Map(api.pluginLoader.on.mock.calls);
      handlers.get('tts:renderer:ended')({
        playbackId: 'reload-audio',
        userId: 'reload-user'
      });

      await plugin.destroy();
      await cacheManager.generatedAssetLock;

      await expect(fs.access(spritePath)).rejects.toMatchObject({ code: 'ENOENT' });
      expect(db.prepare(
        'SELECT owner_id FROM talking_heads_generated_assets WHERE asset_path = ?'
      ).all(spritePath)).toEqual([]);
    } finally {
      db.close();
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  });

  test('ignores renderer-authoritative legacy aliases so the avatar starts only once', async () => {
    const { plugin, api } = createTalkingHeads();
    plugin._handleTTSEvent = jest.fn().mockResolvedValue();
    plugin.animationController = {
      endExternalAnimation: jest.fn(),
      setMouthIntensity: jest.fn(),
      stopAnimation: jest.fn()
    };

    plugin._registerPlaybackBridge();
    const handlers = new Map(api.pluginLoader.on.mock.calls);
    await handlers.get('tts:renderer:started')({
      playbackId: 'renderer-authoritative',
      userId: 'viewer-once',
      username: 'Viewer Once',
      source: 'chat'
    });
    await handlers.get('tts:playback:started')({
      playbackId: 'renderer-authoritative',
      userId: 'viewer-once',
      username: 'Viewer Once',
      rendererAuthoritative: true,
      rendererPhase: 'started'
    });
    handlers.get('tts:playback:ended')({
      playbackId: 'renderer-authoritative',
      userId: 'viewer-once',
      rendererAuthoritative: true,
      rendererPhase: 'ended',
      rendererOutcome: 'ended'
    });

    expect(plugin._handleTTSEvent).toHaveBeenCalledTimes(1);
    expect(plugin.animationController.stopAnimation).not.toHaveBeenCalled();
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
      frame: 'speak_open',
      playbackId: 'renderer-one'
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
