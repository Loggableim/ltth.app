'use strict';

const { AudioManager, WebGPUFireworksEngine } = require('../plugins/webgpu-fireworks/gpu/engine');

function v2Layer(id, overrides = {}) {
  return {
    id,
    primitive: 'radial', delayMs: 0, density: 80, size: 1, lifetimeMs: 600,
    gravity: 0.8, drag: 0.04, trail: false, split: false, strobe: false,
    colors: ['#ffd166'], priority: 'core', core: true,
    ...overrides
  };
}

function v2Shell(id, launchMode = 'airburst', overrides = {}) {
  return {
    id,
    origin: { x: 0.2, y: 1.02 }, target: { x: 0.6, y: 0.3 }, position: { x: 0.6, y: 0.3 },
    launchMode, tier: 'big', palette: ['#ffd166'], colors: ['#ffd166'], seed: 55,
    powerScale: 1, particleScale: 1, soundRole: 'peony', crackleEnabled: false,
    layers: [v2Layer(`${id}:layer:1`)],
    ...overrides
  };
}

function v2Plan(id = 'v2-show', overrides = {}) {
  return {
    planVersion: 2,
    id,
    style: 'nishiki-kamuro',
    length: 'short',
    durationMs: 3000,
    seed: 77,
    materialProfile: 'premium-realistic',
    cues: [{
      id: `${id}:opening`, beatAtMs: 1000, timeMs: 1000, phase: 'opening', formation: 'peony', importance: 'standard',
      shells: [v2Shell(`${id}:shell`)]
    }],
    ...overrides
  };
}

function v1Plan(id = 'v1-show') {
  return {
    planVersion: 1,
    id,
    style: 'classic-crescendo',
    length: 'short',
    durationMs: 3000,
    seed: 1,
    cues: [{
      beatAtMs: 1500, phase: 'opening', formation: 'single',
      launches: [{
        id: `${id}:rocket`, seed: 1, position: { x: 0.5, y: 0.5 }, origin: { x: 0.5, y: 1.02 },
        shape: 'burst', colors: ['#ffd166'], powerScale: 1, particleScale: 1,
        tier: 'medium', soundRole: 'single', crackleEnabled: false
      }]
    }]
  };
}

function makeRuntime(now = 10000) {
  const engine = Object.create(WebGPUFireworksEngine.prototype);
  engine.audio = new AudioManager();
  engine.audio.syncClock = jest.fn();
  engine.audio.play = jest.fn().mockResolvedValue(true);
  engine.config = {
    audioEnabled: true, audioVolume: 0.7, crackleVolume: 0.75, crackleFrequency: 0.5,
    defaultColors: ['#ff0000'], visualStyle: 'stylized-neon', maxParticles: 1000,
    maxTotalParticles: 8192, particleSizeRange: [4, 12], toasterMode: false
  };
  engine.baseWidth = 2000;
  engine.baseHeight = 1000;
  engine.rendererStatus = { state: 'ready', backend: 'webgpu' };
  engine.renderer = {
    initialized: true,
    maxParticles: 8192,
    spawnRocket: jest.fn(),
    spawnLayer: jest.fn(() => true),
    getMetrics: jest.fn(() => ({ activeParticles: 0 }))
  };
  engine.socket = { connected: false, emit: jest.fn() };
  engine.timelineQueue = [];
  engine.effectPlans = new Map();
  engine.activeShows = new Map();
  engine.imageCache = new Map();
  engine.crackleSequence = { eligible: 0, ordinal: 0, lastCrackleOrdinal: -100 };
  engine.performanceMode = 'normal';
  engine.getRuntimeNow = () => now;
  engine.updateDebugPanel = jest.fn();
  engine.showDiagnostic = jest.fn();
  engine.hideDiagnostic = jest.fn();
  engine.ensureFinaleRuntimeState();
  return engine;
}

describe('ShowPlanV2 overlay dispatch', () => {
  test('dispatches V2 shells directly while preserving the V1 planned path and legacy path', () => {
    const v2 = makeRuntime();
    expect(v2.handleFinale({ id: 'v2', showPlan: v2Plan('v2') })).toMatchObject({ accepted: true, legacy: false, planVersion: 2 });
    expect(v2.timelineQueue.some(event => event.type === 'finale-v2-layer')).toBe(true);
    expect(v2.timelineQueue.some(event => event.type === 'finale-launch')).toBe(false);

    const v1 = makeRuntime();
    expect(v1.handleFinale({ id: 'v1', showPlan: v1Plan('v1') })).toMatchObject({ accepted: true, legacy: false, planVersion: 1 });
    expect(v1.timelineQueue.some(event => event.type === 'finale-launch')).toBe(true);
    expect(v1.timelineQueue.some(event => event.type.startsWith('finale-v2-'))).toBe(false);

    const legacy = makeRuntime();
    expect(legacy.handleFinale({ id: 'legacy', duration: 1000, burstCount: 1 })).toMatchObject({ accepted: true, legacy: true, planVersion: null });
    expect(legacy.timelineQueue.some(event => event.type === 'finale-launch')).toBe(true);
  });

  test('rejects unsupported or malformed plan versions without turning them into legacy finales', () => {
    const engine = makeRuntime();
    expect(() => engine.handleFinale({ id: 'future', showPlan: { planVersion: 3, durationMs: 1000, cues: [] } }))
      .toThrow(/unsupported ShowPlan version 3/i);
    expect(engine.finaleIds.has('future')).toBe(false);

    expect(() => engine.handleFinale({ id: 'bad-v2', showPlan: { planVersion: 2, durationMs: 1000, materialProfile: 'classic', cues: [] } }))
      .toThrow(/cues/i);
    expect(engine.finaleIds.has('bad-v2')).toBe(false);

    const lateLayerPlan = v2Plan('late-layer');
    lateLayerPlan.cues[0].shells[0].layers[0].delayMs = 2000;
    expect(() => engine.handleFinale({ id: 'late-layer', showPlan: lateLayerPlan }))
      .toThrow(/complete duration/i);
    expect(engine.finaleIds.has('late-layer')).toBe(false);
    expect(engine.currentFinale).toBeNull();
  });

  test('submits layers on their exact beats with premium material and visual-before-bang ordering', () => {
    let now = 10000;
    const engine = makeRuntime(now);
    engine.getRuntimeNow = () => now;
    const order = [];
    engine.renderer.spawnLayer.mockImplementation((layer, context) => {
      order.push(`visual:${layer.id}`);
      return Boolean(context);
    });
    engine.audio.play.mockImplementation(name => {
      order.push(`audio:${name}`);
      return Promise.resolve(true);
    });

    engine.handleFinale({ id: 'ordered', showPlan: v2Plan('ordered') });
    now = 10999;
    engine.processTimeline(now);
    expect(engine.renderer.spawnLayer).not.toHaveBeenCalled();
    now = 11000;
    engine.processTimeline(now);

    expect(engine.renderer.spawnLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ordered:shell:layer:1', lifetimeMs: 600 }),
      expect.objectContaining({
        origin: { x: 1200, y: 300 }, target: { x: 1200, y: 300 },
        materialProfile: 'premium-realistic', lane: 'show', required: true,
        degradationPolicy: expect.objectContaining({ tier: 0 })
      })
    );
    expect(order[0]).toBe('visual:ordered:shell:layer:1');
    expect(order[1]).toMatch(/^audio:explosion-/);
    expect(engine.getFinaleTelemetry()).toMatchObject({
      finalePlanVersion: 2,
      finaleLayerCount: 1,
      finaleLayersSubmitted: 1,
      finaleCommandCount: 1,
      finaleAudioGroups: { launch: 0, bang: 1, crackle: 0 },
      finaleAudioGroupsPlayed: { launch: 0, bang: 1, crackle: 0 }
    });
  });

  test('waits for a delayed core layer before playing the cue bang with mixed layers', () => {
    let now = 10000;
    const engine = makeRuntime(now);
    engine.getRuntimeNow = () => now;
    const order = [];
    engine.renderer.spawnLayer.mockImplementation(layer => {
      order.push(`visual:${layer.id}`);
      return true;
    });
    engine.audio.play.mockImplementation((name, volume, priority, options) => {
      if (options.bus === 'bang') order.push(`bang:${name}`);
      return Promise.resolve(true);
    });
    const showPlan = v2Plan('delayed-bang', {
      cues: [{
        id: 'delayed-bang:cue', beatAtMs: 1000, timeMs: 1000, phase: 'highlight', formation: 'mixed', importance: 'essential',
        shells: [v2Shell('delayed-bang:shell', 'airburst', {
          layers: [
            v2Layer('delayed-bang:decorative', { delayMs: 200, priority: 'decorative', core: false }),
            v2Layer('delayed-bang:core', { delayMs: 400 })
          ]
        })]
      }]
    });

    engine.handleFinale({ id: 'delayed-bang', showPlan });
    now = 11200;
    engine.processTimeline(now);
    expect(order).toEqual(['visual:delayed-bang:decorative']);
    now = 11400;
    engine.processTimeline(now);

    expect(order).toEqual([
      'visual:delayed-bang:decorative',
      'visual:delayed-bang:core',
      expect.stringMatching(/^bang:explosion-/)
    ]);
    expect(engine.getFinaleTelemetry().finaleAudioGroupsPlayed.bang).toBe(1);
  });

  test('shortens late rocket and launch audio pre-roll and drops both at the burst beat', () => {
    let now = 10000;
    const engine = makeRuntime(now);
    engine.getRuntimeNow = () => now;
    const showPlan = v2Plan('late-preroll', {
      cues: [{
        id: 'late-preroll:cue', beatAtMs: 1000, timeMs: 1000, phase: 'opening', formation: 'single', importance: 'standard',
        shells: [v2Shell('late-preroll:rocket', 'rocket')]
      }]
    });
    engine.handleFinale({ id: 'late-preroll', showPlan });

    now = 10400;
    engine.processTimeline(now);
    expect(engine.renderer.spawnRocket).toHaveBeenCalledWith(expect.objectContaining({ duration: 0.6 }));
    expect(engine.audio.play).toHaveBeenCalledWith(expect.any(String), 0.82, 1, expect.objectContaining({
      bus: 'launch',
      maxLatenessMs: 1000,
      maxDuration: 0.6
    }));

    const skipped = makeRuntime(10000);
    skipped.handleFinale({ id: 'skipped-preroll', showPlan: v2Plan('skipped-preroll', {
      cues: [{
        id: 'skipped-preroll:cue', beatAtMs: 1000, timeMs: 1000, phase: 'opening', formation: 'single', importance: 'standard',
        shells: [v2Shell('skipped-preroll:rocket', 'rocket')]
      }]
    }) });
    skipped.processTimeline(11000);

    expect(skipped.renderer.spawnRocket).not.toHaveBeenCalled();
    expect(skipped.audio.play.mock.calls.some(call => call[3]?.bus === 'launch')).toBe(false);
  });

  test.each([
    'nishiki-kamuro',
    'aurora-cathedral',
    'royal-brocade',
    'phoenix-ascension',
    'furry-celebration'
  ])('renders a manipulated %s snapshot with premium-realistic material', style => {
    let now = 10000;
    const engine = makeRuntime(now);
    engine.getRuntimeNow = () => now;
    engine.handleFinale({
      id: `premium-${style}`,
      showPlan: v2Plan(`premium-${style}`, { style, materialProfile: 'classic' }),
      playSound: false
    });
    now = 11000;
    engine.processTimeline(now);

    expect(engine.renderer.spawnLayer).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ materialProfile: 'premium-realistic' })
    );
  });

  test('keeps rocket, airburst and ground launch semantics distinct', () => {
    let now = 10000;
    const engine = makeRuntime(now);
    engine.getRuntimeNow = () => now;
    const showPlan = v2Plan('modes', {
      cues: [{
        id: 'modes:opening', beatAtMs: 400, timeMs: 400, phase: 'opening', formation: 'fan', importance: 'standard',
        shells: [
          v2Shell('rocket', 'rocket'),
          v2Shell('airburst', 'airburst'),
          v2Shell('ground', 'ground')
        ]
      }]
    });
    engine.handleFinale({ id: 'modes', showPlan, playSound: false });

    engine.processTimeline(10000);
    expect(engine.renderer.spawnRocket).toHaveBeenCalledTimes(1);
    expect(engine.renderer.spawnRocket).toHaveBeenCalledWith(expect.objectContaining({
      effectId: 'rocket', origin: { x: 400, y: 1020 }, target: { x: 1200, y: 300 }, duration: 0.4
    }));
    now = 10400;
    engine.processTimeline(now);
    const contexts = engine.renderer.spawnLayer.mock.calls.map(call => call[1]);
    expect(contexts).toHaveLength(3);
    expect(contexts.filter(context => context.launchMode === 'airburst')[0].origin).toEqual({ x: 1200, y: 300 });
    expect(contexts.filter(context => context.launchMode === 'ground')[0]).toMatchObject({
      origin: { x: 400, y: 1020 }, target: { x: 1200, y: 300 }
    });
  });

  test('forwards controlled depth hints to both the rocket flight and burst layer', () => {
    let now = 10000;
    const engine = makeRuntime(now);
    engine.getRuntimeNow = () => now;
    const renderHints = { depthEnabled: true, launchDepth: -0.6, burstDepth: 0.7, glyphScale: 1.4 };
    const showPlan = v2Plan('depth-dispatch', {
      durationMs: 5000,
      cues: [{
        id: 'depth-dispatch:opening', beatAtMs: 3000, timeMs: 3000,
        phase: 'opening', formation: 'single', importance: 'standard',
        shells: [v2Shell('depth-dispatch:rocket', 'rocket', { renderHints })]
      }]
    });
    engine.handleFinale({ id: 'depth-dispatch', showPlan, playSound: false });

    const rocketEvent = engine.timelineQueue.find(event => event.type === 'finale-v2-rocket');
    now = rocketEvent.due;
    engine.processTimeline(now);
    expect(engine.renderer.spawnRocket).toHaveBeenCalledWith(expect.objectContaining({ renderHints }));

    now = 13000;
    engine.processTimeline(now);
    expect(engine.renderer.spawnLayer).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ renderHints })
    );
  });

  test('uses quality degradation only at submission time without changing the planned choreography', () => {
    let now = 10000;
    const engine = makeRuntime(now);
    engine.getRuntimeNow = () => now;
    const showPlan = v2Plan('quality', {
      cues: [{
        id: 'quality:opening', beatAtMs: 1000, timeMs: 1000, phase: 'opening', formation: 'single', importance: 'standard',
        shells: [v2Shell('quality:shell', 'airburst', {
          layers: [
            v2Layer('quality:core'),
            v2Layer('quality:decorative', { priority: 'decorative', core: false, strobe: true })
          ]
        })]
      }]
    });
    engine.handleFinale({ id: 'quality', showPlan });
    const planned = engine.timelineQueue.filter(event => event.type === 'finale-v2-layer')
      .map(event => ({ due: event.due, layer: { ...event.layer } }));
    engine.performanceMode = 'minimal';
    now = 11000;
    engine.processTimeline(now);

    expect(engine.timelineQueue.filter(event => event.type === 'finale-v2-layer')).toEqual([]);
    expect(planned).toHaveLength(2);
    expect(planned.map(item => item.due)).toEqual([11000, 11000]);
    expect(engine.renderer.spawnLayer.mock.calls.map(call => call[1].degradationPolicy.tier)).toEqual([5, 5]);
  });

  test('keeps V2 cue events immutable while gift spam uses the reserved live path', () => {
    const engine = makeRuntime(10000);
    engine.handleFinale({ id: 'gift-safe-v2', showPlan: v2Plan('gift-safe-v2') });
    const plannedBefore = engine.timelineQueue
      .filter(event => event.type.startsWith('finale-v2-'))
      .map(event => JSON.parse(JSON.stringify(event)));
    engine.handleTrigger = jest.fn(data => {
      if (data.trackGiftLaunch) engine.giftLaunchTimestamps.push(engine.getRuntimeNow());
      return Promise.resolve({});
    });

    for (let index = 0; index < 4; index++) {
      engine.handleIncomingTrigger({
        id: `gift-${index}`, reason: 'gift', userId: `user-${index}`, giftId: 'rose',
        username: `User ${index}`, giftImage: '/rose.png', coins: 10 + index, combo: 1
      });
    }

    expect(engine.handleTrigger).toHaveBeenCalledTimes(3);
    expect(engine.giftBacklog.size).toBe(1);
    expect(engine.timelineQueue.filter(event => event.type.startsWith('finale-v2-')))
      .toEqual(plannedBefore);
  });

  test('a V2 renderer error aborts only the current show and starts the next FIFO entry', () => {
    let now = 10000;
    const engine = makeRuntime(now);
    engine.getRuntimeNow = () => now;
    engine.renderer.spawnLayer.mockImplementationOnce(() => { throw new Error('layer upload failed'); });
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      engine.handleFinale({ id: 'broken', showPlan: v2Plan('broken') });
      engine.handleFinale({ id: 'next', showPlan: v2Plan('next') });
      now = 11000;
      engine.processTimeline(now);
      expect(engine.currentFinale).toMatchObject({ id: 'next', startedAt: 11000 });
      expect(engine.finaleIds.has('broken')).toBe(false);
      expect(engine.finaleIds.has('next')).toBe(true);
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe('ShowPlanV2 curated audio roles', () => {
  test.each([
    ['peony', 'explosion-medium'],
    ['chrysanthemum', 'explosion-big'],
    ['willow', 'explosion-big'],
    ['cathedral', 'explosion-huge'],
    ['brocade', 'explosion-huge'],
    ['mine', 'explosion-big'],
    ['wings', 'explosion-big'],
    ['dragon', 'explosion-huge'],
    ['rainbow', 'explosion-huge']
  ])('maps %s deterministically to %s', (role, bang) => {
    const audio = new AudioManager();
    expect(audio.chooseForRole(role, 'massive', 2026)).toEqual(audio.chooseForRole(role, 'massive', 2026));
    expect(audio.chooseForRole(role, 'massive', 2026).bang).toBe(bang);
  });
});
