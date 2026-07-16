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
    uploadImage: jest.fn().mockResolvedValue(0)
  };
  engine.socket = { connected: false, emit: jest.fn() };
  engine.timelineQueue = [];
  engine.effectPlans = new Map();
  engine.activeShows = new Map();
  engine.imageCache = new Map();
  engine.crackleSequence = { eligible: 0, ordinal: 0, lastCrackleOrdinal: -100 };
  engine.performanceMode = 'normal';
  engine.getRuntimeNow = () => now;
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
    now = 5900;
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
    if (mode === 'toaster') constrained.config.toasterMode = true;
    else constrained.performanceMode = mode;
    const showPlan = plan('thunder-finale', 'short', `quality-${mode}`);
    normal.handleFinale({ id: `quality-${mode}`, intensity: 4, showPlan });
    constrained.handleFinale({ id: `quality-${mode}`, intensity: 4, showPlan });
    const normalEvents = normal.timelineQueue.filter(event => event.type === 'finale-launch');
    const constrainedEvents = constrained.timelineQueue.filter(event => event.type === 'finale-launch');

    expect(constrainedEvents.map(event => [event.due, event.payload.plannedExplodeAt, event.payload.formation]))
      .toEqual(normalEvents.map(event => [event.due, event.payload.plannedExplodeAt, event.payload.formation]));
    expect(constrainedEvents).toHaveLength(normalEvents.length);
    expect(constrainedEvents[0].payload.particleCount).toBeLessThan(normalEvents[0].payload.particleCount);
    expect(constrainedEvents[0].payload.shape).toBe(normalEvents[0].payload.shape);
    expect(constrainedEvents[0].payload.colors).toEqual(normalEvents[0].payload.colors);
    expect(constrainedEvents[0].payload.soundRole).toBe(normalEvents[0].payload.soundRole);
    if (disablesCrackle) expect(constrainedEvents.every(event => event.payload.crackleEnabled === false)).toBe(true);
    else expect(constrainedEvents.filter(event => event.payload.crackleEnabled)).toHaveLength(
      Math.floor(normalEvents.filter(event => event.payload.crackleEnabled).length / 2)
    );
  });

  test('keeps planned explodeAt through asynchronous trigger preparation', async () => {
    const engine = makeRuntime(10000);
    engine.prepareImages = jest.fn().mockResolvedValue({ giftTexture: 0, avatarTexture: 0, avatarChance: 0.3 });
    const plan = await engine.handleTrigger({
      id: 'planned', finaleId: 'show', forceRocket: true,
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

    engine.destroy();

    expect(engine.currentFinale).toBeNull();
    expect(engine.finaleQueue).toEqual([]);
    expect(engine.finaleIds.size).toBe(0);
    expect(engine.giftBacklog.size).toBe(0);
    expect(engine.giftLaunchTimestamps).toEqual([]);
    expect(engine.timelineQueue).toEqual([]);
  });
});
