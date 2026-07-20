'use strict';

const { AudioManager, WebGPUFireworksEngine } = require('../plugins/webgpu-fireworks/gpu/engine');
const WebGPUParticleEngine = require('../plugins/webgpu-fireworks/gpu/webgpu-particle-engine');

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

function scheduleSingleV2Layer(engine, id) {
  engine.handleFinale({ id, showPlan: v2Plan(id), playSound: false });
  return engine.timelineQueue.find(event => event.type === 'finale-v2-layer');
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
        admissionBatchId: 11000,
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

  test('skips a fully expired late V2 layer with explicit timeline telemetry', () => {
    const engine = makeRuntime();
    const event = scheduleSingleV2Layer(engine, 'expired-layer');

    expect(engine.processV2Layer(event, event.due, event.due + event.layer.lifetimeMs)).toBe(false);

    expect(engine.renderer.spawnLayer).not.toHaveBeenCalled();
    expect(engine.currentFinale.layersSubmitted).toBe(0);
    expect(engine.audio.timelineEvents.at(-1)).toMatchObject({
      effectId: event.layer.id,
      type: 'v2-layer-visual',
      state: 'skipped-layer-expired'
    });
  });

  test('shortens a partially late V2 layer by its wall-clock lateness', () => {
    const engine = makeRuntime();
    const event = scheduleSingleV2Layer(engine, 'partially-late-layer');

    expect(engine.processV2Layer(event, event.due, event.due + 250)).toBe(true);

    expect(engine.renderer.spawnLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: event.layer.id, lifetimeMs: 350 }),
      expect.objectContaining({ degradationPolicy: expect.objectContaining({ tier: 0 }) })
    );
    expect(engine.currentFinale.layersSubmitted).toBe(1);
    expect(engine.audio.timelineEvents.at(-1)).toMatchObject({ state: 'rendered' });
  });

  test.each([
    ['early', -75],
    ['on-time', 0]
  ])('keeps the natural lifetime for an %s V2 layer', (_timing, offsetMs) => {
    const engine = makeRuntime();
    const event = scheduleSingleV2Layer(engine, `natural-lifetime-${offsetMs}`);

    engine.processV2Layer(event, event.due, event.due + offsetMs);

    expect(engine.renderer.spawnLayer).toHaveBeenCalledWith(
      expect.objectContaining({ lifetimeMs: event.layer.lifetimeMs }),
      expect.any(Object)
    );
  });

  test('keeps the scheduled V2 event immutable while deriving a late layer', () => {
    const engine = makeRuntime();
    const event = scheduleSingleV2Layer(engine, 'immutable-late-layer');
    const snapshot = JSON.parse(JSON.stringify(event));

    engine.processV2Layer(event, event.due, event.due + 125);

    expect(event).toEqual(snapshot);
    expect(engine.renderer.spawnLayer).toHaveBeenCalledWith(
      expect.objectContaining({ lifetimeMs: 475 }),
      expect.any(Object)
    );
  });

  test('keeps the finale tail as the upper bound for a late V2 layer', () => {
    const engine = makeRuntime();
    const scheduledEvent = scheduleSingleV2Layer(engine, 'finale-tail-layer');
    const event = { ...scheduledEvent, finaleEndsAt: scheduledEvent.due + 300 };

    engine.processV2Layer(event, event.due, event.due + 100);

    expect(engine.renderer.spawnLayer).toHaveBeenCalledWith(
      expect.objectContaining({ lifetimeMs: 200 }),
      expect.any(Object)
    );
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
    expect(engine.renderer.spawnRocket).toHaveBeenCalledWith(expect.objectContaining({
      duration: 0.6,
      admissionBatchId: 10000
    }));
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

  test('dispatches the deterministic seeded palette color for V2 rockets', () => {
    let now = 10000;
    const engine = makeRuntime(now);
    engine.getRuntimeNow = () => now;
    const palette = ['#E40303', '#FF8C00', '#FFED00', '#008026', '#24408E', '#732982'];
    const showPlan = v2Plan('seeded-color', {
      style: 'furry-celebration',
      durationMs: 5000,
      cues: [{
        id: 'seeded-color:opening', beatAtMs: 3000, timeMs: 3000,
        phase: 'opening', formation: 'single', importance: 'standard',
        shells: [v2Shell('seeded-color:rocket', 'rocket', {
          seed: 14, palette, colors: [...palette]
        })]
      }]
    });
    engine.handleFinale({ id: 'seeded-color', showPlan, playSound: false });

    const rocketEvent = engine.timelineQueue.find(event => event.type === 'finale-v2-rocket');
    now = rocketEvent.due;
    engine.processTimeline(now);

    expect(engine.renderer.spawnRocket).toHaveBeenCalledWith(expect.objectContaining({
      color: palette[14 % palette.length]
    }));
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

  test('retains normalized origin and target intent on every scheduled GPU event', () => {
    const engine = makeRuntime();
    engine.baseWidth = 1080;
    engine.baseHeight = 1920;
    const plan = v2Plan('normalized-events');
    plan.cues[0].shells = [v2Shell('normalized-shell', 'rocket', {
      origin: { x: 0.25, y: 0.8 },
      target: { x: 0.75, y: 0.2 },
    })];
    engine.handleFinale({ id: 'normalized-events', showPlan: plan, playSound: false });
    const rocket = engine.timelineQueue.find(event => event.type === 'finale-v2-rocket');
    const layerEvent = engine.timelineQueue.find(event => event.type === 'finale-v2-layer');
    expect(rocket.normalizedOrigin).toEqual({ x: 0.25, y: 0.8 });
    expect(rocket.normalizedTarget).toEqual({ x: 0.75, y: 0.2 });
    expect(layerEvent.context.normalizedOrigin).toEqual({ x: 0.75, y: 0.2 });
    expect(layerEvent.context.normalizedTarget).toEqual({ x: 0.75, y: 0.2 });
  });

  test('rematerializes cue manifest geometry for the current clamped viewport after resize', () => {
    const engine = makeRuntime();
    engine.baseWidth = 1920;
    engine.baseHeight = 1080;
    const plan = v2Plan('resize-manifest');
    plan.cues[0].shells = [v2Shell('resize-shell', 'rocket', {
      renderHints: {
        depthEnabled: true,
        launchDepth: -1,
        burstDepth: 1,
        glyphScale: 1.2,
        glyphExtent: 0.34,
      },
      layers: [v2Layer('resize-glyph', {
        primitive: 'glyph',
        glyph: 'star',
        size: 1.4,
        gravity: 0.6,
      })],
    })];
    engine.handleFinale({ id: 'resize-manifest', showPlan: plan, playSound: false });
    const rocket = engine.timelineQueue.find(event => event.type === 'finale-v2-rocket');
    const layerEvent = engine.timelineQueue.find(event => event.type === 'finale-v2-layer');
    const renderer = new WebGPUParticleEngine({ width: 540, height: 960 }, { now: () => 1000 });
    renderer.initialized = true;

    renderer.spawnRocket({
      effectId: rocket.shellId,
      correlationId: rocket.correlationId,
      envelopeCommandIds: rocket.envelopeCommandIds,
      correlationManifest: rocket.correlationManifest,
      origin: rocket.origin,
      target: rocket.target,
      normalizedOrigin: rocket.normalizedOrigin,
      normalizedTarget: rocket.normalizedTarget,
      renderHints: rocket.renderHints,
      duration: rocket.flightDurationMs / 1000,
      color: '#ffffff',
      seed: rocket.seed,
      style: 'premium-realistic',
      curve: 48,
    });
    renderer.spawnLayer(layerEvent.layer, layerEvent.context);

    expect(renderer.spawnQueue).toHaveLength(3);
    for (const entry of renderer.spawnQueue) {
      const manifestMember = entry.correlationManifest.commands.find(command => (
        command.envelopeCommandId === entry.envelopeCommandId
      ));
      const actual = renderer._materializeCommandForAdmission(entry, 1000, {
        preserveFullLife: true,
      }).command;
      const fitted = renderer._materializeCommandForAdmission(manifestMember, 1000, {
        preserveFullLife: true,
      }).command;
      expect(fitted.size).toBeCloseTo(actual.size, 7);
      if (entry.kind === 2) {
        expect(fitted.intensity).toBeCloseTo(actual.intensity, 7);
        expect(fitted.gravity).toBeCloseTo(actual.gravity, 7);
      }
    }
  });

  test('keeps all shell and layer members in one cue-level formation correlation group', () => {
    const engine = makeRuntime();
    const plan = v2Plan('correlated-cue');
    plan.cues[0].shells = [
      v2Shell('left-shell', 'rocket', { target: { x: 0.15, y: 0.2 } }),
      v2Shell('right-shell', 'rocket', { target: { x: 0.85, y: 0.2 } }),
    ];
    engine.handleFinale({ id: 'correlated-cue', showPlan: plan, playSound: false });
    const commands = engine.timelineQueue.filter(event => (
      event.type === 'finale-v2-rocket' || event.type === 'finale-v2-layer'
    ));
    const ids = commands.map(event => event.type === 'finale-v2-layer'
      ? event.context.correlationId
      : event.correlationId);
    const manifests = commands.map(event => event.type === 'finale-v2-layer'
      ? event.context.correlationManifest
      : event.correlationManifest);
    expect(new Set(ids).size).toBe(1);
    expect(manifests.every(manifest => manifest === manifests[0])).toBe(true);
    expect(Object.isFrozen(manifests[0])).toBe(true);
    expect(manifests[0].commands.map(command => command.shellId))
      .toEqual(expect.arrayContaining(['left-shell', 'right-shell']));
  });

  test('does not share a cue fit when authored cue ids repeat in one owner', () => {
    const engine = makeRuntime();
    const plan = v2Plan('duplicate-cues');
    const template = plan.cues[0];
    plan.cues = [
      { ...template, id: 'duplicate', beatAtMs: 800, shells: [v2Shell('first-shell')] },
      { ...template, id: 'duplicate', beatAtMs: 1600, phase: 'build', shells: [v2Shell('second-shell')] },
    ];
    engine.handleFinale({ id: 'duplicate-cues', showPlan: plan, playSound: false });
    const layers = engine.timelineQueue.filter(event => event.type === 'finale-v2-layer');
    expect(new Set(layers.map(event => event.context.correlationId)).size).toBe(2);
    expect(layers[0].context.correlationManifest).not.toBe(layers[1].context.correlationManifest);
  });

  test('keeps envelope members unique when authored shell and layer ids repeat', () => {
    const engine = makeRuntime();
    const plan = v2Plan('duplicate-members');
    plan.cues[0].shells = [
      v2Shell('duplicate-shell', 'rocket', {
        layers: [v2Layer('duplicate-layer'), v2Layer('duplicate-layer', { delayMs: 50 })],
      }),
      v2Shell('duplicate-shell', 'rocket', {
        layers: [v2Layer('duplicate-layer')],
      }),
    ];
    engine.handleFinale({ id: 'duplicate-members', showPlan: plan, playSound: false });
    const gpuEvents = engine.timelineQueue.filter(event => (
      event.type === 'finale-v2-rocket' || event.type === 'finale-v2-layer'
    ));
    const manifest = gpuEvents[0].type === 'finale-v2-rocket'
      ? gpuEvents[0].correlationManifest
      : gpuEvents[0].context.correlationManifest;
    const manifestIds = manifest.commands.map(command => command.envelopeCommandId);
    const queuedIds = gpuEvents.flatMap(event => event.type === 'finale-v2-rocket'
      ? event.envelopeCommandIds
      : [event.context.envelopeCommandId]);

    expect(new Set(manifestIds).size).toBe(manifestIds.length);
    expect(new Set(queuedIds).size).toBe(queuedIds.length);
    expect(queuedIds).toEqual(expect.arrayContaining(manifestIds));
  });

  test('deactivates a standalone GPU owner after required envelope invalidation', () => {
    const engine = makeRuntime();
    engine.renderer.cancelQueuedOwner = jest.fn();
    engine.registerGpuOwner('standalone:required-envelope');

    expect(engine.handleGpuOwnerInvalidated(
      'standalone:required-envelope',
      'unregisteredEnvelope'
    )).toBe(true);
    expect(engine.isGpuOwnerActive('standalone:required-envelope')).toBe(false);
    expect(engine.renderer.cancelQueuedOwner).toHaveBeenCalledWith(
      'standalone:required-envelope',
      'unregisteredEnvelope'
    );
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
