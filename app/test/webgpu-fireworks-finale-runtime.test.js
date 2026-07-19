const { FinaleShowPlanner } = require('../plugins/webgpu-fireworks/lib/finale-show-planner');
const { AudioManager, WebGPUFireworksEngine } = require('../plugins/webgpu-fireworks/gpu/engine');
const SpawnCommandPolicy = require('../plugins/webgpu-fireworks/gpu/spawn-command-policy');

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

function completionNotification(overrides = {}) {
  return {
    username: 'Alpha',
    usernameText: 'Thank you for being a Superfan, Alpha!',
    thankYouText: 'This firework was for you!',
    profilePictureUrl: 'https://example.test/alpha.png',
    duration: 3000,
    position: 'center',
    size: 'medium',
    scale: 1,
    style: 'gradient-purple',
    entrance: 'scale',
    ...overrides
  };
}

function mockGiftLaunches(engine) {
  engine.handleTrigger = jest.fn(data => {
    if (data.trackGiftLaunch) engine.giftLaunchTimestamps.push(engine.getRuntimeNow());
    return Promise.resolve({});
  });
}

function installFollowerAnimationDom() {
  const originalDocument = global.document;
  const classes = new Set();
  const classList = {
    add: jest.fn((...names) => names.forEach(name => classes.add(name))),
    remove: jest.fn((...names) => names.forEach(name => classes.delete(name))),
    contains: name => classes.has(name)
  };
  const root = {
    classList,
    style: { setProperty: jest.fn() },
    querySelector: jest.fn(() => ({ style: {} }))
  };
  Object.defineProperty(root, 'className', {
    get: () => [...classes].join(' '),
    set: value => {
      classes.clear();
      String(value).split(/\s+/).filter(Boolean).forEach(name => classes.add(name));
    }
  });
  const elements = {
    'follower-animation': root,
    'follower-username': { textContent: '' },
    'thank-you-text': { textContent: '' },
    'follower-avatar': { src: '', classList: { add: jest.fn(), remove: jest.fn() } }
  };
  global.document = { getElementById: jest.fn(id => elements[id] || null) };
  return {
    elements,
    root,
    restore: () => { global.document = originalDocument; }
  };
}

describe('WebGPU choreographed finale runtime', () => {
  test('ACKs only after the real finale handler accepts the queue entry', () => {
    const engine = makeRuntime(10000);

    const result = engine.handleFinaleSocketEvent({
      id: 'superfan-accepted',
      eventId: 'superfan-accepted',
      ackRequested: true,
      requiresRendererReady: true,
      showPlan: tinyPlan('superfan-accepted')
    });

    expect(result).toMatchObject({ accepted: true, id: 'superfan-accepted' });
    expect(engine.finaleIds.has('superfan-accepted')).toBe(true);
    expect(engine.socket.emit).toHaveBeenCalledWith('webgpu-fireworks:finale-ack', expect.objectContaining({
      eventId: 'superfan-accepted',
      accepted: true
    }));
  });

  test.each([
    ['not-ready', engine => { engine.rendererStatus.state = 'device-lost'; }, 'renderer-not-ready'],
    ['duplicate', engine => { engine.finaleIds.add('superfan-rejected'); }, 'duplicate']
  ])('sends a negative ACK when the queue rejects a %s finale', (label, prepare, reason) => {
    const engine = makeRuntime(10000);
    prepare(engine);

    const result = engine.handleFinaleSocketEvent({
      id: 'superfan-rejected',
      eventId: 'superfan-rejected',
      ackRequested: true,
      requiresRendererReady: true,
      showPlan: tinyPlan('superfan-rejected')
    });

    expect(result).toMatchObject({ accepted: false });
    expect(engine.socket.emit).toHaveBeenCalledWith('webgpu-fireworks:finale-ack', {
      eventId: 'superfan-rejected',
      accepted: false,
      reason
    });
  });

  test('converts a renderer exception into a negative correlated ACK', () => {
    const engine = makeRuntime(10000);
    jest.spyOn(engine, 'handleFinale').mockImplementation(() => { throw new Error('queue exploded'); });
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      expect(engine.handleFinaleSocketEvent({ eventId: 'superfan-error', ackRequested: true }))
        .toMatchObject({ accepted: false, reason: 'renderer-error' });
      expect(engine.socket.emit).toHaveBeenCalledWith('webgpu-fireworks:finale-ack', {
        eventId: 'superfan-error',
        accepted: false,
        reason: 'renderer-error'
      });
    } finally {
      consoleError.mockRestore();
    }
  });

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

  test('shows a Superfan end card after the true tail and holds the FIFO queue for its duration', () => {
    let now = 10000;
    const engine = makeRuntime(now);
    engine.getRuntimeNow = () => now;
    engine.showFollowerAnimation = jest.fn();

    engine.handleFinale({
      id: 'superfan-first',
      showPlan: tinyPlan('superfan-first'),
      completionNotification: completionNotification()
    });
    engine.handleFinale({ id: 'second', showPlan: tinyPlan('second') });

    now = 12999;
    engine.processTimeline(now);
    expect(engine.showFollowerAnimation).not.toHaveBeenCalled();
    expect(engine.currentFinale.id).toBe('superfan-first');

    now = 13000;
    engine.processTimeline(now);
    expect(engine.showFollowerAnimation).toHaveBeenCalledTimes(1);
    expect(engine.showFollowerAnimation).toHaveBeenCalledWith(
      completionNotification(),
      { endCard: true, finaleId: 'superfan-first' }
    );
    expect(engine.currentFinale).toMatchObject({ id: 'superfan-first', phase: 'end-card' });
    expect(engine.finaleQueue.map(entry => entry.id)).toEqual(['second']);
    expect(engine.timelineQueue).toContainEqual(expect.objectContaining({
      type: 'finale-end-card-complete',
      finaleId: 'superfan-first',
      due: 16000
    }));

    now = 15999;
    engine.processTimeline(now);
    expect(engine.currentFinale.id).toBe('superfan-first');
    now = 16000;
    engine.processTimeline(now);
    expect(engine.currentFinale).toMatchObject({ id: 'second', startedAt: 16000 });
    expect(engine.finaleIds.has('superfan-first')).toBe(false);
  });

  test('shows a completion notification at most once for duplicate tail events', () => {
    const engine = makeRuntime(10000);
    engine.showFollowerAnimation = jest.fn();
    engine.handleFinale({
      id: 'duplicate-tail',
      showPlan: tinyPlan('duplicate-tail'),
      completionNotification: completionNotification()
    });
    engine.scheduleTimeline({ type: 'finale-complete', due: 13000, order: 101, finaleId: 'duplicate-tail' });

    engine.processTimeline(13000);

    expect(engine.showFollowerAnimation).toHaveBeenCalledTimes(1);
    expect(engine.timelineQueue.filter(event =>
      event.type === 'finale-end-card-complete' && event.finaleId === 'duplicate-tail'
    )).toHaveLength(1);
  });

  test('failure clears a pending completion card without displaying it', () => {
    const engine = makeRuntime(10000);
    engine.showFollowerAnimation = jest.fn();
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    engine.handleFinale({
      id: 'failed-superfan',
      showPlan: tinyPlan('failed-superfan'),
      completionNotification: completionNotification()
    });

    try {
      engine.failFinale('failed-superfan', new Error('device lost'), 11000);
      engine.processTimeline(20000);

      expect(engine.showFollowerAnimation).not.toHaveBeenCalled();
      expect(engine.currentFinale).toBeNull();
      expect(engine.timelineQueue.some(event => event.finaleId === 'failed-superfan')).toBe(false);
    } finally {
      consoleError.mockRestore();
    }
  });

  test('discards non-object completion descriptors when queueing a finale', () => {
    const engine = makeRuntime(10000);

    engine.handleFinale({
      id: 'invalid-card',
      showPlan: tinyPlan('invalid-card'),
      completionNotification: 'not-an-object'
    });

    expect(engine.currentFinale).toMatchObject({
      id: 'invalid-card',
      completionNotification: null
    });
  });

  test('renders a closing username line while preserving ordinary opening usernames', () => {
    jest.useFakeTimers();
    const originalDocument = global.document;
    const classList = { add: jest.fn(), remove: jest.fn() };
    const elements = {
      'follower-animation': {
        className: '',
        classList,
        style: { setProperty: jest.fn() },
        querySelector: jest.fn(() => ({ style: {} }))
      },
      'follower-username': { textContent: '' },
      'thank-you-text': { textContent: '' },
      'follower-avatar': { src: '', classList: { add: jest.fn(), remove: jest.fn() } }
    };
    global.document = { getElementById: jest.fn(id => elements[id] || null) };
    try {
      const engine = makeRuntime(10000);
      engine.showFollowerAnimation(completionNotification());
      expect(elements['follower-username'].textContent).toBe('Thank you for being a Superfan, Alpha!');
      expect(elements['thank-you-text'].textContent).toBe('This firework was for you!');

      engine.showFollowerAnimation({ username: 'NewFollower', thankYouText: 'Thanks for the follow!' });
      expect(elements['follower-username'].textContent).toBe('NewFollower');
      expect(elements['thank-you-text'].textContent).toBe('Thanks for the follow!');
    } finally {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
      global.document = originalDocument;
    }
  });

  test('a superseded opening timer cannot hide a newer end card early', () => {
    jest.useFakeTimers();
    const followerDom = installFollowerAnimationDom();
    try {
      const engine = makeRuntime(10000);
      engine.showFollowerAnimation({ username: 'Opening', duration: 1000 });
      jest.advanceTimersByTime(500);
      engine.showFollowerAnimation(completionNotification(), { endCard: true, finaleId: 'superfan-show' });
      jest.advanceTimersByTime(500);

      expect(followerDom.root.classList.contains('show')).toBe(true);
      expect(followerDom.elements['follower-username'].textContent)
        .toBe('Thank you for being a Superfan, Alpha!');
    } finally {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
      followerDom.restore();
    }
  });

  test('defers an ordinary notification until the owned end card is released', () => {
    jest.useFakeTimers();
    const followerDom = installFollowerAnimationDom();
    try {
      const engine = makeRuntime(10000);
      engine.showFollowerAnimation(completionNotification(), { endCard: true, finaleId: 'superfan-show' });
      engine.showFollowerAnimation({ username: 'LaterFollower', thankYouText: 'Thanks!', duration: 1000 });

      expect(followerDom.elements['follower-username'].textContent)
        .toBe('Thank you for being a Superfan, Alpha!');
      expect(engine.releaseFinaleEndCard('superfan-show', { flushDeferred: true })).toBe(true);
      expect(followerDom.elements['follower-username'].textContent).toBe('LaterFollower');
      expect(followerDom.root.classList.contains('show')).toBe(true);
    } finally {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
      followerDom.restore();
    }
  });

  test('a late asynchronous launch failure immediately removes an owned end card', async () => {
    jest.useFakeTimers();
    const followerDom = installFollowerAnimationDom();
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const engine = makeRuntime(10000);
      engine.handleTrigger = jest.fn().mockRejectedValue(new Error('late renderer failure'));
      engine.handleFinale({
        id: 'late-failure',
        showPlan: tinyPlan('late-failure'),
        completionNotification: completionNotification()
      });

      engine.processTimeline(13000);
      expect(followerDom.root.classList.contains('show')).toBe(true);
      await Promise.resolve();
      await Promise.resolve();

      expect(followerDom.root.classList.contains('show')).toBe(false);
      expect(engine.currentFinale).toBeNull();
      expect(engine.followerAnimationTimer).toBeNull();
    } finally {
      consoleError.mockRestore();
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
      followerDom.restore();
    }
  });

  test('destroy cancels notification ownership and hides an active end card', () => {
    jest.useFakeTimers();
    const followerDom = installFollowerAnimationDom();
    try {
      const engine = makeRuntime(10000);
      engine.running = false;
      engine.audio.destroy = jest.fn();
      engine.renderer.destroy = jest.fn();
      engine.socket.disconnect = jest.fn();
      engine.showFollowerAnimation(completionNotification(), { endCard: true, finaleId: 'destroyed-show' });

      engine.destroy();

      expect(followerDom.root.classList.contains('show')).toBe(false);
      expect(engine.followerAnimationTimer).toBeNull();
      expect(engine.endCardOwnerId).toBeNull();
    } finally {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
      followerDom.restore();
    }
  });

  test.each([
    ['symmetric-salute', 'mirrored-pair'],
    ['classic-crescendo', 'fan'],
    ['symmetric-salute', 'triple-salute'],
    ['thunder-finale', 'finale-wave-2']
  ])('synchronizes every %s %s V2 shell to its cue explosion beat', (style, formation) => {
    const engine = makeRuntime(20000);
    const showPlan = plan(style, 'medium', style);
    engine.handleFinale({ id: style, intensity: 4, showPlan });

    const cue = showPlan.cues.find(item => item.formation === formation);
    const layerEvents = engine.timelineQueue.filter(event =>
      event.type === 'finale-v2-layer' && event.cueId === cue.id
    );
    const coreBeatEvents = layerEvents.filter(event => event.layer.delayMs === 0);
    expect(new Set(coreBeatEvents.map(event => event.shellId)).size).toBe(cue.shells.length);
    expect(new Set(coreBeatEvents.map(event => event.due))).toEqual(new Set([
      engine.currentFinale.startedAt + cue.beatAtMs
    ]));
    const rockets = engine.timelineQueue.filter(event =>
      event.type === 'finale-v2-rocket' && event.cueId === cue.id
    );
    expect(rockets).toHaveLength(cue.shells.filter(shell => shell.launchMode === 'rocket').length);
    for (const event of rockets) {
      const targetY = event.shell.target.y * engine.baseHeight;
      const expectedFlightMs = engine.calculateFlightDuration(targetY) * 1000;
      expect(event.flightDurationMs).toBe(Math.round(expectedFlightMs));
      expect(event.due + event.flightDurationMs).toBeCloseTo(engine.currentFinale.startedAt + cue.beatAtMs, 6);
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

  test('reports the actual V2 phase sequence without a synthetic breath', () => {
    const engine = makeRuntime(10000);
    const showPlan = plan('classic-crescendo', 'short', 'phases');
    engine.handleFinale({ id: 'phases', showPlan });
    const phaseEvents = engine.timelineQueue.filter(event => event.type === 'finale-v2-phase');

    expect(phaseEvents.map(event => event.phase)).toEqual(['opening', 'build', 'highlight', 'finale']);
    expect(phaseEvents.some(event => event.phase === 'breath')).toBe(false);
  });

  test('keeps the synthetic midpoint breath on the V1 path only', () => {
    const engine = makeRuntime(10000);
    const showPlan = tinyPlan('v1-phases', {
      durationMs: 5000,
      cues: [
        { beatAtMs: 1000, phase: 'opening', formation: 'single', launches: [] },
        { beatAtMs: 2000, phase: 'highlight', formation: 'accent', launches: [] },
        { beatAtMs: 4000, phase: 'finale', formation: 'wave', launches: [] }
      ]
    });
    engine.handleFinale({ id: 'v1-phases', showPlan });
    const phaseEvents = engine.timelineQueue.filter(event => event.type === 'finale-phase');

    expect(phaseEvents.map(event => event.phase)).toEqual(['highlight', 'breath', 'finale']);
    expect(phaseEvents.find(event => event.phase === 'breath').due).toBe(13000);
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
    mockGiftLaunches(engine);

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
    mockGiftLaunches(engine);
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
    ['reduced', 2],
    ['minimal', 5],
    ['toaster', 6]
  ])('degrades %s V2 layers without changing planned timing or formations', (mode, expectedTier) => {
    const normal = makeRuntime(10000);
    const constrained = makeRuntime(10000);
    const showPlan = plan('thunder-finale', 'short', `quality-${mode}`);
    normal.handleFinale({ id: `quality-${mode}`, intensity: 4, showPlan });
    constrained.handleFinale({ id: `quality-${mode}`, intensity: 4, showPlan });
    const normalEvents = normal.timelineQueue.filter(event => event.type === 'finale-v2-layer');
    const constrainedEvents = constrained.timelineQueue.filter(event => event.type === 'finale-v2-layer');

    expect(constrainedEvents.map(event => [event.due, event.cueId, event.shellId, event.context.origin, event.context.target]))
      .toEqual(normalEvents.map(event => [event.due, event.cueId, event.shellId, event.context.origin, event.context.target]));
    expect(constrainedEvents).toHaveLength(normalEvents.length);
    expect(constrainedEvents.map(event => event.layer)).toEqual(normalEvents.map(event => event.layer));

    if (mode === 'toaster') constrained.config.toasterMode = true;
    else constrained.performanceMode = mode;
    const normalPolicy = normal.getAdaptiveLayerPolicy(normalEvents[0].context.activeLayerLoad);
    const constrainedPolicy = constrained.getAdaptiveLayerPolicy(constrainedEvents[0].context.activeLayerLoad);
    expect(normalPolicy.tier).toBe(0);
    expect(constrainedPolicy.tier).toBe(expectedTier);
    const source = constrainedEvents.find(event => event.layer.priority === 'decorative') || constrainedEvents[0];
    const degraded = SpawnCommandPolicy.degradeLayerForPolicy(source.layer, constrainedPolicy);
    if (source.layer.priority === 'decorative' && expectedTier >= 5) expect(degraded.layer).toBeNull();
    else expect(degraded.layer?.density || 0).toBeLessThanOrEqual(source.layer.density);
  });

  test('applies the current performance mode when a later V2 layer submits', () => {
    const engine = makeRuntime(10000);
    const showPlan = plan('thunder-finale', 'short', 'dynamic-quality');
    engine.handleFinale({ id: 'dynamic-quality', intensity: 4, showPlan });
    const event = engine.timelineQueue.find(item => item.type === 'finale-v2-layer');
    const eventSnapshot = JSON.parse(JSON.stringify(event));
    const normal = engine.getAdaptiveLayerPolicy(event.context.activeLayerLoad);

    engine.performanceMode = 'minimal';
    const degraded = engine.getAdaptiveLayerPolicy(event.context.activeLayerLoad);

    expect(normal.tier).toBe(0);
    expect(degraded.tier).toBe(5);
    expect(event).toEqual(eventSnapshot);
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

  test('holds queued finales through device recovery and resumes exactly one when ready', () => {
    let now = 10000;
    const engine = makeRuntime(now);
    engine.getRuntimeNow = () => now;
    engine.handleFinale({ id: 'device-a', showPlan: tinyPlan('device-a') });
    engine.handleFinale({ id: 'device-b', showPlan: tinyPlan('device-b') });
    engine.handleFinale({ id: 'device-c', showPlan: tinyPlan('device-c') });
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      engine.setStatus({ state: 'device-lost', reason: 'adapter reset' });
      expect(engine.currentFinale).toBeNull();
      expect(engine.finaleQueue.map(entry => entry.id)).toEqual(['device-b', 'device-c']);
      expect(engine.finaleIds.has('device-a')).toBe(false);

      now = 11001;
      engine.setStatus({ state: 'device-lost', reason: 'adapter reset' });
      expect(engine.currentFinale).toBeNull();
      expect(engine.finaleQueue.map(entry => entry.id)).toEqual(['device-b', 'device-c']);

      engine.setStatus({ state: 'ready' });
      expect(engine.currentFinale).toMatchObject({ id: 'device-b', startedAt: 11001 });
      expect(engine.finaleQueue.map(entry => entry.id)).toEqual(['device-c']);
      const runtimeToken = engine.currentFinale.runtimeToken;

      engine.setStatus({ state: 'ready' });
      expect(engine.currentFinale).toMatchObject({ id: 'device-b', runtimeToken });
      expect(engine.finaleQueue.map(entry => entry.id)).toEqual(['device-c']);
    } finally {
      consoleError.mockRestore();
    }
  });

  test('queues a new finale that arrives while the renderer is recovering', () => {
    const engine = makeRuntime(10000);
    engine.rendererStatus.state = 'device-lost';

    expect(engine.handleFinale({ id: 'during-recovery', showPlan: tinyPlan('during-recovery') }))
      .toMatchObject({ accepted: true, queued: true, queueLength: 1 });
    expect(engine.currentFinale).toBeNull();
    expect(engine.timelineQueue).toEqual([]);

    engine.setStatus({ state: 'ready' });
    expect(engine.currentFinale.id).toBe('during-recovery');
    expect(engine.finaleQueue).toEqual([]);
  });

  test('a successful frame clears only its transient render error and resumes one queued finale', () => {
    const engine = makeRuntime(performance.now());
    engine.handleFinale({ id: 'render-old', showPlan: tinyPlan('render-old') });
    engine.handleFinale({ id: 'render-next', showPlan: tinyPlan('render-next') });
    const startFinaleEntry = jest.spyOn(engine, 'startFinaleEntry');
    engine.running = true;
    engine.lastFrameAt = performance.now();
    engine.fpsWindowAt = performance.now();
    engine.frameCount = 0;
    engine.fpsHistory = [];
    engine.fps = 60;
    engine.isBenchmark = true;
    engine.skippedFrame = false;
    engine.renderer.render = jest.fn()
      .mockImplementationOnce(() => { throw new Error('render pass failed'); })
      .mockImplementation(() => {});
    const originalRequestAnimationFrame = global.requestAnimationFrame;
    global.requestAnimationFrame = jest.fn(() => 99);
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      engine.render();
      expect(engine.currentFinale).toBeNull();
      expect(engine.finaleQueue.map(entry => entry.id)).toEqual(['render-next']);
      expect(engine.rendererStatus).toMatchObject({ state: 'error', reason: 'render pass failed' });
      expect(global.requestAnimationFrame).toHaveBeenCalledTimes(1);

      engine.render();
      expect(engine.rendererStatus).toMatchObject({ state: 'ready' });
      expect(engine.currentFinale.id).toBe('render-next');
      expect(engine.finaleQueue).toEqual([]);
      expect(startFinaleEntry).toHaveBeenCalledTimes(1);
      expect(global.requestAnimationFrame).toHaveBeenCalledTimes(2);

      const runtimeToken = engine.currentFinale.runtimeToken;
      engine.render();
      expect(engine.currentFinale).toMatchObject({ id: 'render-next', runtimeToken });
      expect(startFinaleEntry).toHaveBeenCalledTimes(1);
    } finally {
      global.requestAnimationFrame = originalRequestAnimationFrame;
      consoleError.mockRestore();
    }
  });

  test('a successful frame does not clear a genuine device-lost state', () => {
    const engine = makeRuntime(10000);
    engine.handleFinale({ id: 'lost-old', showPlan: tinyPlan('lost-old') });
    engine.handleFinale({ id: 'lost-next', showPlan: tinyPlan('lost-next') });
    engine.running = true;
    engine.lastFrameAt = performance.now();
    engine.fpsWindowAt = performance.now();
    engine.frameCount = 0;
    engine.fpsHistory = [];
    engine.fps = 60;
    engine.isBenchmark = true;
    engine.skippedFrame = false;
    engine.renderer.render = jest.fn();
    const originalRequestAnimationFrame = global.requestAnimationFrame;
    global.requestAnimationFrame = jest.fn(() => 99);
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      engine.setStatus({ state: 'device-lost', reason: 'adapter reset' });
      engine.render();
      expect(engine.rendererStatus).toMatchObject({ state: 'device-lost', reason: 'adapter reset' });
      expect(engine.currentFinale).toBeNull();
      expect(engine.finaleQueue.map(entry => entry.id)).toEqual(['lost-next']);
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

  test('uses each seeded legacy launch intensity once and completes at its true maximum tail', () => {
    let now = 10000;
    const engine = makeRuntime(now);
    engine.getRuntimeNow = () => now;
    engine.handleFinale({ id: 'legacy-tail', burstCount: 6, duration: 900, intensity: 4, seed: 8 });
    engine.handleFinale({ id: 'after-tail', showPlan: tinyPlan('after-tail') });
    const launches = engine.timelineQueue.filter(event => event.type === 'finale-launch' && event.finaleId === 'legacy-tail');
    const complete = engine.timelineQueue.find(event => event.type === 'finale-complete' && event.finaleId === 'legacy-tail');
    const latestTail = Math.max(...launches.map(event => {
      const targetY = event.payload.position.y * engine.baseHeight;
      const actualIntensity = Math.max(0.1, Math.min(5, event.payload.intensity));
      const visualTail = 1.15 + actualIntensity * 0.28;
      const bangTail = { small: 0.7, medium: 0.9, big: 1.2, massive: 1.5 }[event.payload.tier];
      const crackleTail = event.payload.crackleEnabled
        ? (event.payload.tier === 'massive' ? 1.22 : 0.83)
        : 0;
      return event.due + engine.calculateFlightDuration(targetY) * 1000 + Math.max(visualTail, bangTail, crackleTail) * 1000;
    }));

    expect(complete.due).toBeCloseTo(latestTail, 8);
    const replay = makeRuntime(10000);
    replay.handleFinale({ id: 'legacy-tail', burstCount: 6, duration: 900, intensity: 4, seed: 8 });
    expect(replay.timelineQueue
      .filter(event => event.type === 'finale-launch')
      .map(event => event.payload.intensity))
      .toEqual(launches.map(event => event.payload.intensity));
    now = complete.due - 1;
    engine.processTimeline(now);
    expect(engine.currentFinale.id).toBe('legacy-tail');
    now = complete.due;
    engine.processTimeline(now);
    expect(engine.currentFinale.id).toBe('after-tail');
  });

  test('caps late launch, explosion and crackle work from actual frame time and skips work at the end', async () => {
    const engine = makeRuntime(10000);
    engine.currentFinale = { id: 'late-show', runtimeToken: 'late-show:1', phase: 'finale' };
    engine.prepareImages = jest.fn().mockResolvedValue({ giftTexture: 0, avatarTexture: 0, avatarChance: 0.3 });
    engine.audio.play = jest.fn().mockResolvedValue(true);
    const effect = await engine.handleTrigger({
      id: 'late-effect', finaleId: 'late-show', runtimeToken: 'late-show:1',
      soundRole: 'wave', tier: 'massive', crackleEnabled: true,
      position: { x: 0.5, y: 0.5 }, forceRocket: true,
      plannedLaunchAt: 10000, plannedExplodeAt: 12000, finaleEndsAt: 13000
    });

    engine.processLaunch(effect, 10000, 12950);
    expect(engine.renderer.spawnRocket).toHaveBeenLastCalledWith(expect.objectContaining({ duration: 0.05 }));
    expect(engine.audio.play.mock.calls.at(-1)[3]).toMatchObject({ maxDuration: 0.05 });

    engine.processExplosion(effect.explosion, effect, 12000, 12900);
    expect(engine.renderer.spawnExplosion).toHaveBeenLastCalledWith(expect.objectContaining({ duration: 0.1 }));
    expect(engine.audio.play.mock.calls.at(-1)[3]).toMatchObject({ maxDuration: 0.1 });

    engine.processCrackle(effect, effect.crackleAt, 12900);
    expect(engine.renderer.spawnCrackle).toHaveBeenLastCalledWith(expect.objectContaining({ duration: 0.1 }));
    expect(engine.audio.play.mock.calls.at(-1)[3]).toMatchObject({ maxDuration: 0.1 });

    engine.renderer.spawnRocket.mockClear();
    engine.renderer.spawnExplosion.mockClear();
    engine.renderer.spawnCrackle.mockClear();
    engine.audio.play.mockClear();
    engine.processLaunch(effect, 10000, 13000);
    engine.processExplosion(effect.explosion, effect, 12000, 13000);
    engine.processCrackle(effect, effect.crackleAt, 13000);
    expect(engine.renderer.spawnRocket).not.toHaveBeenCalled();
    expect(engine.renderer.spawnExplosion).not.toHaveBeenCalled();
    expect(engine.renderer.spawnCrackle).not.toHaveBeenCalled();
    expect(engine.audio.play).not.toHaveBeenCalled();
    expect(engine.audio.timelineEvents.filter(event => event.effectId === 'late-effect').slice(-3))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'launch-visual', state: 'skipped-finale-ended' }),
        expect.objectContaining({ type: 'explosion-visual', state: 'skipped-finale-ended' }),
        expect.objectContaining({ type: 'crackle-visual', state: 'skipped-finale-ended' })
      ]));
  });

  test('starts three gift rockets before image assets resolve and bundles the fourth', async () => {
    const engine = makeRuntime(10000);
    engine.currentFinale = { id: 'gift-show', runtimeToken: 'gift-show:1', phase: 'build' };
    let resolveImage;
    const pendingImage = new Promise(resolve => { resolveImage = resolve; });
    engine.loadImage = jest.fn(() => pendingImage);
    engine.renderer.uploadImage = jest.fn().mockResolvedValue(17);

    for (let index = 0; index < 3; index++) {
      engine.handleIncomingTrigger({
        id: `gift-${index}`, reason: 'gift', userId: `user-${index}`, giftId: 'rose',
        username: `User ${index}`, giftImage: '/rose.png', coins: 10, combo: 1
      });
    }
    const fourth = engine.handleIncomingTrigger({
      id: 'gift-3', reason: 'gift', userId: 'user-3', giftId: 'rose',
      username: 'User 3', giftImage: '/rose.png', coins: 10, combo: 1
    });

    expect([...engine.effectPlans.keys()]).toEqual(['gift-0', 'gift-1', 'gift-2']);
    expect(engine.giftLaunchTimestamps).toEqual([10000, 10000, 10000]);
    expect(fourth).toMatchObject({ accepted: true, queued: true, bundled: true });
    expect(engine.giftBacklog.size).toBe(1);
    expect([...engine.effectPlans.values()].map(effect => effect.explosion.assets.giftTexture)).toEqual([0, 0, 0]);

    resolveImage({ width: 32, height: 32 });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect([...engine.effectPlans.values()].map(effect => effect.explosion.assets.giftTexture)).toEqual([17, 17, 17]);
  });

  test('keeps high-combo gifts as visible rockets during an active finale', () => {
    const engine = makeRuntime(10000);
    engine.currentFinale = { id: 'gift-show', runtimeToken: 'gift-show:1', phase: 'highlight' };

    engine.handleIncomingTrigger({
      id: 'high-combo-gift', reason: 'gift', userId: 'superfan', giftId: 'lion',
      username: 'Superfan', coins: 1000, combo: 12, crackleEnabled: false
    });

    const plan = engine.effectPlans.get('high-combo-gift');
    expect(plan).toBeDefined();
    expect(plan.launch.skipRocket).toBe(false);
    expect(engine.timelineQueue).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'launch', plan })
    ]));
  });

  test('a low gift arriving at the token boundary cannot jump an older high-value bundle', () => {
    let now = 1000;
    const engine = makeRuntime(now);
    engine.getRuntimeNow = () => now;
    engine.currentFinale = { id: 'show', runtimeToken: 'show:1', phase: 'opening' };
    mockGiftLaunches(engine);
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
