const { FinaleShowPlanner } = require('../plugins/webgpu-fireworks/lib/finale-show-planner');
const { AudioManager, WebGPUFireworksEngine } = require('../plugins/webgpu-fireworks/gpu/engine');

function makeRuntime(now = 10000) {
  const engine = Object.create(WebGPUFireworksEngine.prototype);
  engine.audio = new AudioManager();
  engine.audio.syncClock = jest.fn();
  engine.config = {
    crackleFrequency: 0.5,
    crackleVolume: 0.75,
    defaultColors: ['#ff0000', '#00ff00'],
    visualStyle: 'premium-hybrid',
    maxParticles: 1000,
    maxTotalParticles: 8192,
    avatarParticleChance: 0.3,
    particleSizeRange: [4, 12],
    gravity: 0.1,
    friction: 0.98,
    windStrength: 0.02,
    despawnFadeDuration: 3,
    giftPopupEnabled: true,
    giftPopupPosition: 'bottom',
    toasterMode: false
  };
  engine.baseWidth = 1920;
  engine.baseHeight = 1080;
  engine.rendererStatus = { state: 'ready', backend: 'webgpu' };
  engine.renderer = {
    initialized: true,
    spawnRocket: jest.fn(),
    spawnExplosion: jest.fn(),
    spawnCrackle: jest.fn(),
    uploadImage: jest.fn().mockResolvedValue(0),
    getMetrics: jest.fn(() => ({}))
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

function plan(style = 'classic-crescendo', length = 'short', id = `${style}-${length}`) {
  return new FinaleShowPlanner().plan({ style, length, id, seed: 144, intensity: 4 });
}

function tinyPlan(id, overrides = {}) {
  return {
    planVersion: 1,
    id,
    style: overrides.style || 'classic-crescendo',
    length: 'short',
    durationMs: overrides.durationMs || 3000,
    seed: 1,
    cues: overrides.cues || [{
      beatAtMs: 1500,
      phase: 'opening',
      formation: 'single',
      launches: [{
        id: `${id}-rocket`, seed: 1,
        position: { x: 0.5, y: 0.5 }, origin: { x: 0.5, y: 1.02 },
        shape: 'burst', colors: ['#ffd166'], powerScale: 1,
        particleScale: 1, tier: 'medium', soundRole: 'single', crackleEnabled: false
      }]
    }]
  };
}

describe('WebGPU choreographed finale runtime', () => {
  test('queues shows FIFO, deduplicates active and waiting IDs, and starts the next at the complete duration', () => {
    let now = 10000;
    const engine = makeRuntime(now);
    engine.getRuntimeNow = () => now;

    expect(engine.handleFinale({ id: 'first', showPlan: tinyPlan('first') })).toMatchObject({
      accepted: true, queued: false, id: 'first', queueLength: 0
    });
    expect(engine.handleFinale({ eventId: 'second', showPlan: tinyPlan('second') })).toMatchObject({
      accepted: true, queued: true, id: 'second', queueLength: 1
    });
    expect(engine.handleFinale({ id: 'first', showPlan: tinyPlan('first') })).toMatchObject({
      accepted: false, duplicate: true, id: 'first', queueLength: 1
    });
    expect(engine.handleFinale({ id: 'second', showPlan: tinyPlan('second') })).toMatchObject({
      accepted: false, duplicate: true, id: 'second', queueLength: 1
    });
    expect(engine.getFinaleTelemetry()).toMatchObject({
      finaleActive: true, finaleId: 'first', finaleStyle: 'classic-crescendo',
      finaleLength: 'short', finalePhase: 'opening', finaleQueueLength: 1
    });

    now = 12999;
    engine.processTimeline(now);
    expect(engine.currentFinale.id).toBe('first');
    now = 13000;
    engine.processTimeline(now);
    expect(engine.currentFinale.id).toBe('second');
    expect(engine.currentFinale.startedAt).toBe(13000);
    expect(engine.finaleIds.has('first')).toBe(false);
    expect(engine.finaleIds.has('second')).toBe(true);
  });

  test.each([
    ['symmetric-salute', 'mirrored-pair'],
    ['classic-crescendo', 'fan'],
    ['symmetric-salute', 'triple-salute'],
    ['thunder-finale', 'finale-wave-2']
  ])('synchronizes every %s %s launch to its cue explosion beat', (style, formation) => {
    const engine = makeRuntime(20000);
    const showPlan = plan(style, 'medium', style);
    engine.handleFinale({ id: style, intensity: 4, showPlan });

    const cue = showPlan.cues.find(item => item.formation === formation);
    const events = engine.timelineQueue.filter(event =>
      event.type === 'finale-launch' && event.payload.cueBeatAtMs === cue.beatAtMs
    );
    expect(events).toHaveLength(cue.launches.length);
    expect(new Set(events.map(event => event.payload.plannedExplodeAt))).toEqual(new Set([
      engine.currentFinale.startedAt + cue.beatAtMs
    ]));
    for (const event of events) {
      const targetY = event.payload.position.y * engine.baseHeight;
      const expectedFlightMs = engine.calculateFlightDuration(targetY) * 1000;
      expect(event.payload.plannedExplodeAt - event.payload.plannedLaunchAt).toBeCloseTo(expectedFlightMs, 6);
      expect(event.due).toBeCloseTo(event.payload.plannedLaunchAt, 6);
      expect(event.finaleId).toBe(style);
    }
  });

  test('uses different launch times for different target heights but one exact explodeAt', () => {
    const engine = makeRuntime(10000);
    const showPlan = tinyPlan('height-sync', {
      cues: [{
        beatAtMs: 1800, phase: 'highlight', formation: 'fan', launches: [
          { id: 'low', seed: 1, position: { x: 0.3, y: 0.6 }, origin: { x: 0.3, y: 1.02 }, shape: 'ring', colors: ['#fff'], powerScale: 1, particleScale: 1, tier: 'big', soundRole: 'accent', crackleEnabled: false },
          { id: 'high', seed: 2, position: { x: 0.7, y: 0.2 }, origin: { x: 0.7, y: 1.02 }, shape: 'ring', colors: ['#fff'], powerScale: 1, particleScale: 1, tier: 'big', soundRole: 'accent', crackleEnabled: false }
        ]
      }]
    });
    engine.handleFinale({ id: 'height-sync', showPlan });
    const launches = engine.timelineQueue.filter(event => event.type === 'finale-launch');

    expect(launches).toHaveLength(2);
    expect(launches[0].due).not.toBe(launches[1].due);
    expect(launches[0].payload.plannedExplodeAt).toBe(launches[1].payload.plannedExplodeAt);
  });

  test('reports build, highlight, breath and finale phases without adding a breath explosion', () => {
    const engine = makeRuntime(10000);
    const showPlan = plan('classic-crescendo', 'short', 'phases');
    engine.handleFinale({ id: 'phases', showPlan });
    const phaseEvents = engine.timelineQueue.filter(event => event.type === 'finale-phase');

    expect(phaseEvents.map(event => event.phase)).toEqual(['build', 'highlight', 'breath', 'finale']);
    const breath = phaseEvents.find(event => event.phase === 'breath');
    const highlightBeats = showPlan.cues.filter(cue => cue.phase === 'highlight').map(cue => cue.beatAtMs);
    const finaleBeats = showPlan.cues.filter(cue => cue.phase === 'finale').map(cue => cue.beatAtMs);
    expect(breath.due).toBeGreaterThan(engine.currentFinale.startedAt + Math.max(...highlightBeats));
    expect(breath.due).toBeLessThan(engine.currentFinale.startedAt + Math.min(...finaleBeats));
    expect(engine.timelineQueue.some(event => event.type === 'finale-launch' &&
      event.payload.plannedExplodeAt > engine.currentFinale.startedAt + Math.max(...highlightBeats) &&
      event.payload.plannedExplodeAt < engine.currentFinale.startedAt + Math.min(...finaleBeats))).toBe(false);
  });

  test('keeps legacy burst payloads playable through the same FIFO queue', () => {
    let now = 5000;
    const engine = makeRuntime(now);
    engine.getRuntimeNow = () => now;
    const first = engine.handleFinale({ id: 'legacy-a', burstCount: 3, duration: 900, seed: 4 });
    const second = engine.handleFinale({ id: 'legacy-b', burstCount: 2, duration: 600, seed: 5 });

    expect(first).toMatchObject({ accepted: true, queued: false, legacy: true, count: 3 });
    expect(second).toMatchObject({ accepted: true, queued: true, legacy: true, count: 2 });
    expect(engine.timelineQueue.filter(event => event.type === 'finale-launch')).toHaveLength(3);
    const legacyComplete = engine.timelineQueue.find(event => event.type === 'finale-complete' && event.finaleId === 'legacy-a');
    now = legacyComplete.due;
    engine.processTimeline(now);
    expect(engine.currentFinale.id).toBe('legacy-b');
    // The first queued launch is due at the hand-off timestamp and is consumed
    // in the same timeline pass; the second launch remains scheduled.
    expect(engine.timelineQueue.filter(event => event.type === 'finale-launch' && event.finaleId === 'legacy-b')).toHaveLength(1);
  });

  test('limits active-finale gifts to three rolling starts and bundles overflow by user and gift', async () => {
    let now = 0;
    const engine = makeRuntime(now);
    engine.getRuntimeNow = () => now;
    engine.currentFinale = { id: 'show', startedAt: 0, style: 'classic-crescendo', length: 'short', phase: 'opening' };
    engine.handleTrigger = jest.fn().mockResolvedValue({});

    for (let index = 0; index < 3; index++) {
      engine.handleIncomingTrigger({ reason: 'gift', userId: `u-${index}`, giftId: `g-${index}`, username: `U${index}`, coins: 1, combo: 1 });
    }
    engine.handleIncomingTrigger({ type: 'gift', userId: 'fan', giftId: 'rose', username: 'Ada', giftName: 'Rose', giftImage: '/rose.png', coins: 20, value: 20, combo: 2 });
    engine.handleIncomingTrigger({ giftId: 'rose', userId: 'fan', username: 'Ada', giftName: 'Rose', giftImage: '/rose-large.png', coins: 30, value: 30, combo: 3 });

    expect(engine.handleTrigger).toHaveBeenCalledTimes(3);
    expect(engine.giftBacklog.size).toBe(1);
    expect([...engine.giftBacklog.values()][0]).toMatchObject({
      username: 'Ada', giftId: 'rose', giftName: 'Rose', giftImage: '/rose-large.png',
      coins: 50, value: 50, combo: 5, bundleCount: 2
    });

    now = 999;
    engine.processTimeline(now);
    expect(engine.handleTrigger).toHaveBeenCalledTimes(3);
    now = 1000;
    engine.processTimeline(now);
    await Promise.resolve();
    expect(engine.handleTrigger).toHaveBeenCalledTimes(4);
    expect(engine.handleTrigger.mock.calls[3][0]).toMatchObject({
      username: 'Ada', giftImage: '/rose-large.png', coins: 50, value: 50, combo: 5, bundleCount: 2
    });
  });

  test('drains waiting gift bundles by descending coin value without touching show cues', () => {
    let now = 0;
    const engine = makeRuntime(now);
    engine.getRuntimeNow = () => now;
    engine.currentFinale = { id: 'show', startedAt: 0, style: 'classic-crescendo', length: 'short', phase: 'opening' };
    engine.handleTrigger = jest.fn().mockResolvedValue({});
    for (let index = 0; index < 3; index++) engine.handleIncomingTrigger({ reason: 'gift', userId: `seed-${index}`, giftId: 'seed', coins: 1 });
    const showEvent = { type: 'finale-launch', due: 5000, finaleId: 'show', payload: { id: 'planned' } };
    engine.scheduleTimeline(showEvent);
    engine.handleIncomingTrigger({ reason: 'gift', userId: 'low', giftId: 'rose', username: 'Low', coins: 10 });
    engine.handleIncomingTrigger({ reason: 'gift', userId: 'high', giftId: 'lion', username: 'High', coins: 200 });
    const plannedBefore = engine.timelineQueue.filter(event => event.type === 'finale-launch');

    now = 1000;
    engine.processTimeline(now);

    expect(engine.handleTrigger.mock.calls.slice(3).map(call => call[0].username)).toEqual(['High', 'Low']);
    expect(engine.timelineQueue.filter(event => event.type === 'finale-launch')).toEqual(plannedBefore);
  });

  test.each([
    ['reduced', false],
    ['minimal', true],
    ['toaster', true]
  ])('degrades %s visuals without changing planned timing or formations', (mode, disablesCrackle) => {
    const normal = makeRuntime(10000);
    const constrained = makeRuntime(10000);
    const showPlan = plan('thunder-finale', 'short', `quality-${mode}`);
    normal.handleFinale({ id: `quality-${mode}`, intensity: 4, showPlan });
    constrained.handleFinale({ id: `quality-${mode}`, intensity: 4, showPlan });
    const normalEvents = normal.timelineQueue.filter(event => event.type === 'finale-launch');
    const constrainedEvents = constrained.timelineQueue.filter(event => event.type === 'finale-launch');

    expect(constrainedEvents.map(event => [event.due, event.payload.plannedExplodeAt, event.payload.formation]))
      .toEqual(normalEvents.map(event => [event.due, event.payload.plannedExplodeAt, event.payload.formation]));
    expect(constrainedEvents).toHaveLength(normalEvents.length);
    expect(constrainedEvents.map(event => event.payload)).toEqual(normalEvents.map(event => event.payload));

    if (mode === 'toaster') constrained.config.toasterMode = true;
    else constrained.performanceMode = mode;
    const normalPayloads = normalEvents.map(event => normal.materializeFinalePayload(event.payload));
    const constrainedPayloads = constrainedEvents.map(event => constrained.materializeFinalePayload(event.payload));
    expect(constrainedPayloads[0].particleCount).toBeLessThan(normalPayloads[0].particleCount);
    expect(constrainedPayloads[0].particleSizeRange[1]).toBeLessThan(normalPayloads[0].particleSizeRange[1]);
    expect(constrainedPayloads[0].shape).toBe(normalPayloads[0].shape);
    expect(constrainedPayloads[0].colors).toEqual(normalPayloads[0].colors);
    expect(constrainedPayloads[0].soundRole).toBe(normalPayloads[0].soundRole);
    if (disablesCrackle) expect(constrainedPayloads.every(payload => payload.crackleEnabled === false)).toBe(true);
    else expect(constrainedPayloads.filter(payload => payload.crackleEnabled)).toHaveLength(
      Math.floor(normalPayloads.filter(payload => payload.crackleEnabled).length / 2)
    );
  });

  test('applies the current performance mode when a later finale cue launches', () => {
    const engine = makeRuntime(10000);
    const showPlan = plan('thunder-finale', 'short', 'dynamic-quality');
    engine.handleFinale({ id: 'dynamic-quality', intensity: 4, showPlan });
    const event = engine.timelineQueue.find(item => item.type === 'finale-launch');
    const normal = engine.materializeFinalePayload(event.payload);

    engine.performanceMode = 'minimal';
    const degraded = engine.materializeFinalePayload(event.payload);

    expect(degraded).toMatchObject({
      plannedLaunchAt: normal.plannedLaunchAt,
      plannedExplodeAt: normal.plannedExplodeAt,
      formation: normal.formation,
      crackleEnabled: false
    });
    expect(degraded.particleCount).toBeLessThan(normal.particleCount);
    expect(event.payload).not.toHaveProperty('particleCount');
  });

  test('keeps planned explodeAt through asynchronous trigger preparation', async () => {
    const engine = makeRuntime(10000);
    engine.currentFinale = { id: 'show', runtimeToken: 'show:1', phase: 'highlight' };
    engine.prepareImages = jest.fn().mockResolvedValue({ giftTexture: 0, avatarTexture: 0, avatarChance: 0.3 });
    const plan = await engine.handleTrigger({
      id: 'planned', finaleId: 'show', runtimeToken: 'show:1', forceRocket: true,
      position: { x: 0.5, y: 0.25 }, origin: { x: 0.5, y: 1.02 },
      shape: 'star', colors: ['#abcdef'], tier: 'big', soundRole: 'accent',
      intensity: 3, particleCount: 90, plannedLaunchAt: 12000, plannedExplodeAt: 13550,
      playSound: false
    });

    expect(plan).toMatchObject({ finaleId: 'show', launchAt: 12000, explodeAt: 13550, flightDuration: 1.55 });
    expect(plan.explosion).toMatchObject({ shape: 'star', colors: ['#abcdef'], soundRole: 'accent' });
    expect(engine.timelineQueue.filter(event => event.plan === plan).every(event => event.finaleId === 'show')).toBe(true);
  });

  test('caps the last planned particle lifetime at the finale tail boundary', async () => {
    const engine = makeRuntime(10000);
    engine.prepareImages = jest.fn().mockResolvedValue({ giftTexture: 0, avatarTexture: 0, avatarChance: 0.3 });
    const showPlan = tinyPlan('tail', {
      durationMs: 3000,
      cues: [{
        beatAtMs: 2500, phase: 'finale', formation: 'finale-wave', launches: [{
          id: 'tail-rocket', seed: 8, position: { x: 0.5, y: 0.5 }, origin: { x: 0.5, y: 1.02 },
          shape: 'burst', colors: ['#fff'], powerScale: 1, particleScale: 1,
          tier: 'massive', soundRole: 'wave', crackleEnabled: false
        }]
      }]
    });
    engine.handleFinale({ id: 'tail', intensity: 5, showPlan });
    const launch = engine.timelineQueue.find(event => event.type === 'finale-launch');
    expect(launch.payload.finaleEndsAt).toBe(13000);

    engine.processTimeline(launch.due);
    await Promise.resolve();
    await Promise.resolve();
    engine.processTimeline(12500);

    expect(engine.renderer.spawnExplosion).toHaveBeenCalledWith(expect.objectContaining({ duration: 0.5 }));
  });

  test('isolates a rejected show launch and immediately starts the next queued finale', async () => {
    const engine = makeRuntime(10000);
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      engine.handleFinale({ id: 'broken', showPlan: tinyPlan('broken') });
      engine.handleFinale({ id: 'next', showPlan: tinyPlan('next') });
      engine.scheduleTimeline({ type: 'gift-drain', due: 20000 });
      engine.handleTrigger = jest.fn().mockRejectedValue(new Error('renderer exploded'));

      const firstLaunch = engine.timelineQueue.find(event => event.type === 'finale-launch' && event.finaleId === 'broken');
      engine.processTimeline(firstLaunch.due);
      await Promise.resolve();
      await Promise.resolve();

      expect(engine.currentFinale.id).toBe('next');
      expect(engine.finaleIds.has('broken')).toBe(false);
      expect(engine.timelineQueue.some(event => event.finaleId === 'broken')).toBe(false);
      expect(engine.timelineQueue.some(event => event.type === 'gift-drain')).toBe(true);
      expect(engine.rendererStatus).toMatchObject({ finaleError: expect.stringContaining('renderer exploded') });
      expect(consoleError).toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  test('cancels a delayed old-show trigger after completion instead of enqueueing ghost events', async () => {
    let releaseImages;
    const delayedImages = new Promise(resolve => { releaseImages = resolve; });
    const engine = makeRuntime(10000);
    engine.prepareImages = jest.fn()
      .mockReturnValueOnce(delayedImages)
      .mockResolvedValue({ giftTexture: 0, avatarTexture: 0, avatarChance: 0.3 });
    engine.handleFinale({ id: 'old', showPlan: tinyPlan('old', { durationMs: 500 }) });
    engine.handleFinale({ id: 'new', showPlan: tinyPlan('new') });
    const oldLaunch = engine.timelineQueue.find(event => event.type === 'finale-launch' && event.finaleId === 'old');

    engine.processTimeline(oldLaunch.due);
    engine.processTimeline(10500);
    expect(engine.currentFinale.id).toBe('new');
    releaseImages({ giftTexture: 0, avatarTexture: 0, avatarChance: 0.3 });
    await Promise.resolve();
    await Promise.resolve();

    expect([...engine.effectPlans.values()].some(effect => effect.finaleId === 'old')).toBe(false);
    expect(engine.timelineQueue.some(event => event.finaleId === 'old')).toBe(false);
  });

  test('device errors fail one current show and repeated status callbacks do not kill the next', () => {
    const engine = makeRuntime(10000);
    engine.handleFinale({ id: 'device-old', showPlan: tinyPlan('device-old') });
    engine.handleFinale({ id: 'device-next', showPlan: tinyPlan('device-next') });

    engine.setStatus({ state: 'device-lost', reason: 'adapter reset' });
    expect(engine.currentFinale.id).toBe('device-next');
    engine.setStatus({ state: 'device-lost', reason: 'adapter reset' });

    expect(engine.currentFinale.id).toBe('device-next');
    expect(engine.finaleIds.has('device-old')).toBe(false);
    expect(engine.rendererStatus).toMatchObject({ state: 'device-lost', finaleError: expect.stringContaining('adapter reset') });
  });

  test('render exceptions isolate the current finale and keep scheduling frames', () => {
    const engine = makeRuntime(10000);
    engine.handleFinale({ id: 'render-old', showPlan: tinyPlan('render-old') });
    engine.handleFinale({ id: 'render-next', showPlan: tinyPlan('render-next') });
    engine.running = true;
    engine.lastFrameAt = performance.now();
    engine.fpsWindowAt = performance.now();
    engine.frameCount = 0;
    engine.fpsHistory = [];
    engine.fps = 60;
    engine.isBenchmark = true;
    engine.skippedFrame = false;
    // A synchronous frame failure is a fresh failure even when an earlier
    // device callback already left the renderer in an error state.
    engine.rendererStatus.state = 'device-lost';
    engine.renderer.render = jest.fn(() => { throw new Error('render pass failed'); });
    const originalRequestAnimationFrame = global.requestAnimationFrame;
    global.requestAnimationFrame = jest.fn(() => 99);
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      engine.render();
      expect(engine.currentFinale.id).toBe('render-next');
      expect(engine.rendererStatus).toMatchObject({ state: 'error', reason: 'render pass failed' });
      expect(global.requestAnimationFrame).toHaveBeenCalledTimes(1);
    } finally {
      global.requestAnimationFrame = originalRequestAnimationFrame;
      consoleError.mockRestore();
    }
  });

  test('rejects a finale trigger when the renderer is not ready but ignores an ordinary trigger', async () => {
    const engine = makeRuntime(10000);
    engine.rendererStatus.state = 'device-lost';

    await expect(engine.handleTrigger({ id: 'planned', finaleId: 'show' })).rejects.toThrow('renderer is not ready');
    await expect(engine.handleTrigger({ id: 'ordinary' })).resolves.toBeUndefined();
  });

  test('waits for the final legacy rocket flight and tail before starting the next entry', () => {
    let now = 10000;
    const engine = makeRuntime(now);
    engine.getRuntimeNow = () => now;
    engine.handleFinale({ id: 'legacy-tail', burstCount: 3, duration: 900, intensity: 5, seed: 8 });
    engine.handleFinale({ id: 'after-tail', showPlan: tinyPlan('after-tail') });
    const launches = engine.timelineQueue.filter(event => event.type === 'finale-launch' && event.finaleId === 'legacy-tail');
    const complete = engine.timelineQueue.find(event => event.type === 'finale-complete' && event.finaleId === 'legacy-tail');
    const latestTail = Math.max(...launches.map(event => {
      const targetY = event.payload.position.y * engine.baseHeight;
      return event.due + engine.calculateFlightDuration(targetY) * 1000 + (1.15 + 5 * 0.28) * 1000;
    }));

    expect(complete.due).toBeGreaterThanOrEqual(latestTail);
    now = complete.due - 1;
    engine.processTimeline(now);
    expect(engine.currentFinale.id).toBe('legacy-tail');
    now = complete.due;
    engine.processTimeline(now);
    expect(engine.currentFinale.id).toBe('after-tail');
  });

  test('a low gift arriving at the token boundary cannot jump an older high-value bundle', () => {
    let now = 1000;
    const engine = makeRuntime(now);
    engine.getRuntimeNow = () => now;
    engine.currentFinale = { id: 'show', runtimeToken: 'show:1', phase: 'opening' };
    engine.handleTrigger = jest.fn().mockResolvedValue({});
    engine.giftLaunchTimestamps = [0, 500, 500];
    engine.bundleGift({ reason: 'gift', userId: 'vip', giftId: 'lion', username: 'VIP', coins: 500 });

    engine.handleIncomingTrigger({ reason: 'gift', userId: 'low', giftId: 'rose', username: 'Low', coins: 1 });

    expect(engine.handleTrigger).toHaveBeenCalledTimes(1);
    expect(engine.handleTrigger).toHaveBeenCalledWith(expect.objectContaining({ username: 'VIP', coins: 500 }));
    expect([...engine.giftBacklog.values()]).toEqual([
      expect.objectContaining({ username: 'Low', coins: 1 })
    ]);
  });

  test('maps finale sound roles to deterministic curated audio families', async () => {
    const engine = makeRuntime(10000);
    engine.prepareImages = jest.fn().mockResolvedValue({ giftTexture: 0, avatarTexture: 0, avatarChance: 0.3 });
    expect(engine.audio.chooseForRole('single', 'medium', 42)).toEqual(engine.audio.chooseForRole('single', 'medium', 42));
    expect(engine.audio.chooseForRole('single', 'medium', 42)).toMatchObject({ bang: 'explosion-medium' });
    expect(engine.audio.chooseForRole('wave', 'massive', 42)).toMatchObject({ bang: 'explosion-huge' });
    expect(engine.audio.chooseForRole('wave', 'massive', 42).launch)
      .not.toBe(engine.audio.chooseForRole('single', 'medium', 42).launch);

    const wave = await engine.handleTrigger({
      id: 'wave-role', soundRole: 'wave', tier: 'massive', crackleEnabled: false,
      position: { x: 0.5, y: 0.5 }, forceRocket: true, playSound: false
    });
    expect(wave.explosion.sound).toMatchObject({ bang: 'explosion-huge' });
  });

  test('caps the final Thunder bang to the remaining 1475ms acoustic tail', async () => {
    const engine = makeRuntime(10000);
    engine.currentFinale = { id: 'thunder', runtimeToken: 'thunder:1', phase: 'finale' };
    engine.prepareImages = jest.fn().mockResolvedValue({ giftTexture: 0, avatarTexture: 0, avatarChance: 0.3 });
    engine.audio.play = jest.fn().mockResolvedValue(true);
    const effect = await engine.handleTrigger({
      id: 'thunder-tail', finaleId: 'thunder', runtimeToken: 'thunder:1',
      soundRole: 'wave', tier: 'massive', crackleEnabled: false,
      position: { x: 0.5, y: 0.5 }, forceRocket: true,
      plannedLaunchAt: 10000, plannedExplodeAt: 12000, finaleEndsAt: 13475
    });
    engine.processExplosion(effect.explosion, effect, 12000, 12000);
    const bang = engine.audio.play.mock.calls.find(call => call[0] === 'explosion-huge');

    expect(bang[3]).toMatchObject({ maxDuration: 1.475 });
  });

  test('destroy clears ephemeral finale and gift scheduling state', () => {
    const engine = makeRuntime(10000);
    engine.canvas = { removeEventListener: jest.fn() };
    engine.socket = { disconnect: jest.fn(), connected: false };
    engine.renderer = { destroy: jest.fn(), initialized: true };
    engine.audio.destroy = jest.fn();
    engine.imageCache.set('asset', Promise.resolve());
    engine.handleFinale({ id: 'one', showPlan: tinyPlan('one') });
    engine.handleFinale({ id: 'two', showPlan: tinyPlan('two') });
    engine.giftBacklog.set('gift', { coins: 10 });
    engine.giftLaunchTimestamps.push(1);
    engine.failingFinaleIds.add('one');
    engine.finaleGeneration = 7;

    engine.destroy();

    expect(engine.currentFinale).toBeNull();
    expect(engine.finaleQueue).toEqual([]);
    expect(engine.finaleIds.size).toBe(0);
    expect(engine.giftBacklog.size).toBe(0);
    expect(engine.giftLaunchTimestamps).toEqual([]);
    expect(engine.failingFinaleIds.size).toBe(0);
    expect(engine.finaleGeneration).toBe(0);
    expect(engine.timelineQueue).toEqual([]);
  });
});
