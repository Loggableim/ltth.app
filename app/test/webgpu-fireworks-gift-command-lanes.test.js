'use strict';

const { AudioManager, WebGPUFireworksEngine } = require('../plugins/webgpu-fireworks/gpu/engine');
const WebGPUParticleEngine = require('../plugins/webgpu-fireworks/gpu/webgpu-particle-engine');

const makeRuntime = () => {
  const runtime = Object.create(WebGPUFireworksEngine.prototype);
  runtime.audio = new AudioManager();
  runtime.config = {
    crackleFrequency: 0.5,
    defaultColors: ['#ff0000'],
    visualStyle: 'premium-hybrid',
    maxParticles: 1000,
    maxTotalParticles: 8192,
    avatarParticleChance: 0.3,
    particleSizeRange: [4, 12],
    gravity: 0.1,
    friction: 0.98,
    windStrength: 0.02,
    despawnFadeDuration: 3,
    giftPopupEnabled: false,
    toasterMode: false
  };
  runtime.baseWidth = 1920;
  runtime.baseHeight = 1080;
  runtime.rendererStatus = { state: 'ready', backend: 'webgpu' };
  runtime.renderer = {
    initialized: true,
    spawnRocket: jest.fn(),
    spawnExplosion: jest.fn(),
    spawnCrackle: jest.fn(),
    getMetrics: jest.fn(() => ({ activeParticles: 0 }))
  };
  runtime.timelineQueue = [];
  runtime.effectPlans = new Map();
  runtime.activeShows = new Map();
  runtime.imageCache = new Map();
  runtime.crackleSequence = { eligible: 0, ordinal: 0, lastCrackleOrdinal: -100 };
  runtime.performanceMode = 'normal';
  runtime.getRuntimeNow = () => 10000;
  runtime.prepareImages = jest.fn().mockResolvedValue({
    giftTexture: 2,
    avatarTexture: 1,
    avatarChance: 0.3
  });
  runtime.ensureFinaleRuntimeState();
  return runtime;
};

describe('WebGPU Fireworks gift command lanes', () => {
  test('tags direct and bundled gift launches after the metadata spread', async () => {
    const runtime = Object.create(WebGPUFireworksEngine.prototype);
    runtime.handleTrigger = jest.fn().mockResolvedValue({});
    runtime.setStatus = jest.fn();
    const gift = {
      id: 'gift-bundle',
      reason: 'gift',
      username: 'Ada',
      userId: 'user-1',
      giftId: 'lion',
      giftName: 'Lion',
      giftImage: '/lion.png',
      coins: 500,
      value: 500,
      combo: 3,
      bundleCount: 2,
      giftBundleKey: 'user-1::lion'
    };

    expect(runtime.launchGiftNow(gift, 10000)).toMatchObject({
      accepted: true,
      queued: false,
      bundled: true
    });
    await Promise.resolve();

    expect(runtime.handleTrigger).toHaveBeenCalledWith(expect.objectContaining({
      ...gift,
      lane: 'gift',
      deferAssets: true,
      trackGiftLaunch: true,
      forceRocket: true
    }));
  });

  test('carries gift lane and user/gift metadata through plan, rocket, core, images and crackle', async () => {
    const runtime = makeRuntime();
    const plan = await runtime.handleTrigger({
      id: 'gift-direct',
      reason: 'gift',
      lane: 'gift',
      username: 'Ada',
      userId: 'user-1',
      uniqueId: 'ada-live',
      giftId: 'lion',
      giftName: 'Lion',
      giftImage: '/lion.png',
      coins: 500,
      value: 500,
      combo: 3,
      bundleCount: 2,
      giftBundleKey: 'user-1::lion',
      forceRocket: true,
      playSound: false,
      particleCount: 60,
      position: { x: 0.5, y: 0.4 },
      origin: { x: 0.5, y: 1.02 }
    });

    expect(plan.explosion).toMatchObject({
      lane: 'gift',
      priority: 'core',
      required: true,
      beatId: null,
      username: 'Ada',
      userId: 'user-1',
      uniqueId: 'ada-live',
      giftId: 'lion',
      giftName: 'Lion',
      giftImage: '/lion.png',
      coins: 500,
      value: 500,
      combo: 3,
      bundleCount: 2,
      giftBundleKey: 'user-1::lion'
    });

    runtime.processLaunch(plan, plan.launchAt, plan.launchAt);
    expect(runtime.renderer.spawnRocket).toHaveBeenCalledWith(expect.objectContaining({
      lane: 'gift',
      priority: 'core',
      required: true,
      beatId: null,
      effectId: 'gift-direct',
      username: 'Ada',
      userId: 'user-1',
      giftId: 'lion',
      coins: 500,
      bundleCount: 2,
      giftBundleKey: 'user-1::lion'
    }));

    runtime.processExplosion(plan.explosion, plan, plan.explodeAt, plan.explodeAt);
    expect(runtime.renderer.spawnExplosion.mock.calls[0][0]).toMatchObject({
      lane: 'gift',
      priority: 'core',
      required: true,
      beatId: null,
      effectId: 'gift-direct',
      username: 'Ada',
      userId: 'user-1',
      giftId: 'lion',
      coins: 500,
      bundleCount: 2,
      giftBundleKey: 'user-1::lion'
    });
    const imageCalls = runtime.renderer.spawnExplosion.mock.calls
      .map(call => call[0])
      .filter(command => command.shape === 'image');
    expect(imageCalls).toHaveLength(2);
    expect(imageCalls).toEqual(expect.arrayContaining([
      expect.objectContaining({ lane: 'gift', priority: 'core', required: true, textureIndex: 1 }),
      expect.objectContaining({ lane: 'gift', priority: 'core', required: true, textureIndex: 2 })
    ]));

    plan.explosion.sound.crackle = 'crackling';
    plan.crackleProfile = 'short';
    plan.crackleDuration = 0.65;
    plan.cracklePulseCount = 4;
    runtime.processCrackle(plan, plan.explodeAt + 180, plan.explodeAt + 180);
    expect(runtime.renderer.spawnCrackle).toHaveBeenCalledWith(expect.objectContaining({
      lane: 'gift',
      priority: 'accent',
      required: false,
      beatId: null,
      effectId: 'gift-direct'
    }));
  });

  test('retains gift identity and bundle metadata in the CPU-side spawn queue without changing the GPU ABI', () => {
    const renderer = new WebGPUParticleEngine({ width: 1920, height: 1080 }, {});
    renderer.initialized = true;
    renderer.spawnExplosion({
      lane: 'gift',
      priority: 'core',
      required: true,
      effectId: 'gift:metadata',
      shape: 'image',
      colors: ['#ffffff'],
      count: 8,
      username: 'Ada',
      userId: 'user-1',
      uniqueId: 'ada-live',
      giftId: 'lion',
      giftName: 'Lion',
      giftImage: '/lion.png',
      coins: 500,
      value: 500,
      combo: 3,
      bundleCount: 2,
      giftBundleKey: 'user-1::lion'
    });

    expect(renderer.spawnQueue[0]).toMatchObject({
      lane: 'gift',
      correlationId: 'gift:metadata',
      username: 'Ada',
      userId: 'user-1',
      uniqueId: 'ada-live',
      giftId: 'lion',
      giftName: 'Lion',
      giftImage: '/lion.png',
      coins: 500,
      value: 500,
      combo: 3,
      bundleCount: 2,
      giftBundleKey: 'user-1::lion'
    });
  });
});
