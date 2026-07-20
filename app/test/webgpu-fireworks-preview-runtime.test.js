'use strict';

const { AudioManager, WebGPUFireworksEngine } = require('../plugins/webgpu-fireworks/gpu/engine');

function layer(id, overrides = {}) {
  return {
    id,
    primitive: 'radial',
    delayMs: 100,
    density: 40,
    size: 1,
    lifetimeMs: 900,
    gravity: 0.8,
    drag: 0.04,
    trail: true,
    split: false,
    strobe: false,
    colors: ['#ffd166'],
    priority: 'core',
    core: true,
    ...overrides
  };
}

function plan(id = 'preview:one') {
  return {
    planVersion: 2,
    id,
    style: 'nishiki-kamuro',
    length: 'short',
    durationMs: 3000,
    seed: 17,
    materialProfile: 'premium-realistic',
    cues: [{
      id: `${id}:cue`,
      beatAtMs: 1000,
      timeMs: 1000,
      phase: 'opening',
      formation: 'peony',
      importance: 'essential',
      shells: [{
        id: `${id}:shell`,
        origin: { x: 0.2, y: 1.02 },
        target: { x: 0.6, y: 0.3 },
        launchMode: 'airburst',
        tier: 'big',
        palette: ['#ffd166'],
        colors: ['#ffd166'],
        seed: 18,
        powerScale: 1,
        particleScale: 1,
        soundRole: 'peony',
        crackleEnabled: false,
        layers: [layer(`${id}:layer`)]
      }]
    }]
  };
}

function payload(id = 'preview:one', overrides = {}) {
  return {
    id,
    eventId: id,
    requestId: id,
    rendererId: 'renderer-1',
    type: 'preview',
    scope: 'cue',
    cueIndex: 0,
    phase: null,
    preview: {
      scope: 'cue',
      cueIndex: 0,
      phase: null,
      sourceId: 'nishiki-kamuro',
      sourceRevision: 0,
      builtIn: true,
      metadata: { name: 'Nishiki Kamuro' }
    },
    length: 'short',
    intensity: 4,
    playSound: true,
    showPlan: plan(id),
    ...overrides
  };
}

function makeRuntime(initialNow = 10000) {
  let now = initialNow;
  const engine = Object.create(WebGPUFireworksEngine.prototype);
  engine.audio = new AudioManager();
  engine.audio.syncClock = jest.fn();
  engine.audio.play = jest.fn().mockResolvedValue(true);
  engine.config = {
    audioEnabled: true,
    audioVolume: 0.7,
    crackleVolume: 0.75,
    crackleFrequency: 0.5,
    defaultColors: ['#ff0000'],
    visualStyle: 'stylized-neon',
    maxParticles: 1000,
    maxTotalParticles: 8192,
    particleSizeRange: [4, 12],
    toasterMode: false
  };
  engine.baseWidth = 2000;
  engine.baseHeight = 1000;
  engine.rendererStatus = { state: 'ready', backend: 'webgpu' };
  engine.renderer = {
    initialized: true,
    maxParticles: 8192,
    spawnRocket: jest.fn(),
    spawnLayer: jest.fn(() => true),
    getMetrics: jest.fn(() => ({ activeParticles: 0 })),
    destroy: jest.fn()
  };
  engine.socket = {
    id: 'renderer-1',
    connected: true,
    emit: jest.fn(),
    disconnect: jest.fn()
  };
  engine.timelineQueue = [];
  engine.effectPlans = new Map();
  engine.activeShows = new Map();
  engine.imageCache = new Map();
  engine.crackleSequence = { eligible: 0, ordinal: 0, lastCrackleOrdinal: -100 };
  engine.performanceMode = 'normal';
  engine.isBenchmark = false;
  engine.running = false;
  engine.animationFrame = null;
  engine.followerAnimationTimer = null;
  engine.notificationTimers = new Set();
  engine.giftLaunchTimestamps = [];
  engine.giftBacklog = new Map();
  engine.failingFinaleIds = new Set();
  engine.getRuntimeNow = () => now;
  engine.setNow = value => { now = value; };
  engine.updateDebugPanel = jest.fn();
  engine.emitStatus = jest.fn();
  engine.showDiagnostic = jest.fn();
  engine.hideDiagnostic = jest.fn();
  engine.clearFollowerAnimation = jest.fn();
  engine.releaseFinaleEndCard = jest.fn();
  engine.applyInteractiveMode = jest.fn();
  engine.ensureFinaleRuntimeState();
  return engine;
}

function previewEvents(engine, event) {
  return engine.socket.emit.mock.calls.filter(([name, body]) => name === event && body.requestId);
}

function attachSocketLifecycle(engine) {
  const previousIo = global.io;
  const previousDocument = global.document;
  const handlers = new Map();
  const socket = {
    id: 'renderer-1',
    connected: true,
    emit: jest.fn(),
    on: jest.fn((event, handler) => handlers.set(event, handler)),
    disconnect: jest.fn()
  };
  global.io = jest.fn(() => socket);
  global.document = { visibilityState: 'visible' };
  engine.audio.ensureContext = jest.fn().mockResolvedValue(true);
  engine.connectSocket();
  return {
    socket,
    receive(event) {
      const handler = handlers.get(event);
      expect(handler).toBeDefined();
      return handler();
    },
    restore() {
      if (previousIo === undefined) delete global.io;
      else global.io = previousIo;
      if (previousDocument === undefined) delete global.document;
      else global.document = previousDocument;
    }
  };
}

describe('WebGPU non-queued preview runtime', () => {
  test('atomically reserves a ready renderer, ACKs it, and executes the supplied V2 timing and tail', () => {
    const engine = makeRuntime();
    const beforeIds = new Set(engine.finaleIds);

    const accepted = engine.handlePreviewSocketEvent(payload());

    expect(accepted).toMatchObject({ accepted: true, requestId: 'preview:one', rendererId: 'renderer-1' });
    expect(engine.currentPreview).toMatchObject({ requestId: 'preview:one', scope: 'cue' });
    expect(engine.socket.emit).toHaveBeenCalledWith('webgpu-fireworks:preview-ack', {
      requestId: 'preview:one', rendererId: 'renderer-1', accepted: true
    });
    expect(engine.finaleIds).toEqual(beforeIds);
    expect(engine.finaleQueue).toEqual([]);
    expect(engine.timelineQueue.find(event => event.type === 'finale-v2-layer')).toMatchObject({
      due: 11100,
      runtimeKind: 'preview',
      previewRequestId: 'preview:one'
    });
    expect(engine.timelineQueue.find(event => event.type === 'finale-complete')).toMatchObject({
      due: 13000,
      runtimeKind: 'preview'
    });

    engine.setNow(13000);
    engine.processTimeline(13000);
    expect(engine.currentPreview).toBeNull();
    expect(previewEvents(engine, 'webgpu-fireworks:preview-status').at(-1)?.[1]).toMatchObject({
      requestId: 'preview:one', rendererId: 'renderer-1', state: 'completed'
    });
  });

  test.each([
    ['renderer not ready', engine => { engine.rendererStatus.state = 'initializing'; }, 'RENDERER_NOT_READY'],
    ['benchmark renderer', engine => { engine.isBenchmark = true; }, 'RENDERER_NOT_READY'],
    ['active finale', engine => { engine.currentFinale = { id: 'real-finale' }; }, 'FINALE_BUSY'],
    ['active preview', engine => { engine.currentPreview = { requestId: 'preview:existing' }; }, 'FINALE_BUSY'],
    ['queued finale', engine => { engine.finaleQueue.push({ id: 'queued' }); }, 'FINALE_BUSY']
  ])('rejects %s synchronously without enqueueing or deduping', (_label, prepare, reason) => {
    const engine = makeRuntime();
    prepare(engine);
    const queueBefore = [...engine.finaleQueue];
    const idsBefore = new Set(engine.finaleIds);

    expect(engine.handlePreviewSocketEvent(payload())).toMatchObject({ accepted: false, reason });
    expect(engine.socket.emit).toHaveBeenCalledWith('webgpu-fireworks:preview-ack', {
      requestId: 'preview:one', rendererId: 'renderer-1', accepted: false, reason
    });
    expect(engine.finaleQueue).toEqual(queueBefore);
    expect(engine.finaleIds).toEqual(idsBefore);
  });

  test('silently ignores a preview addressed to another renderer without sending an ACK', () => {
    const engine = makeRuntime();

    expect(engine.handlePreviewSocketEvent(payload('preview:other', {
      rendererId: 'renderer-other'
    }))).toMatchObject({ accepted: false, ignored: true, reason: 'wrong-renderer' });
    expect(engine.socket.emit).not.toHaveBeenCalledWith(
      'webgpu-fireworks:preview-ack',
      expect.anything()
    );
    expect(engine.currentPreview).toBeNull();
  });

  test.each([
    ['missing identity', { requestId: '', id: '', eventId: '' }],
    ['mismatched scope', { scope: 'show' }],
    ['ShowPlanV1', { showPlan: { planVersion: 1, durationMs: 1000, cues: [] } }]
  ])('rejects invalid preview metadata: %s', (_label, invalid) => {
    const engine = makeRuntime();

    expect(engine.handlePreviewSocketEvent(payload('preview:one', invalid))).toMatchObject({
      accepted: false,
      reason: 'INVALID_PREVIEW'
    });
    expect(engine.currentPreview).toBeNull();
    expect(engine.finaleQueue).toEqual([]);
    expect(engine.finaleIds.size).toBe(0);
  });

  test('allows only one concurrent preview owner and queues a later real finale normally', () => {
    const engine = makeRuntime();

    expect(engine.handlePreviewSocketEvent(payload('preview:first'))).toMatchObject({ accepted: true });
    expect(engine.handlePreviewSocketEvent(payload('preview:second'))).toMatchObject({
      accepted: false,
      reason: 'FINALE_BUSY'
    });
    expect(engine.handleFinale({ id: 'real-next', showPlan: plan('real-next') })).toMatchObject({
      accepted: true,
      queued: true
    });
    expect(engine.finaleQueue.map(entry => entry.id)).toEqual(['real-next']);
    expect(engine.finaleIds).toEqual(new Set(['real-next']));
  });

  test('preview disconnect preserves FIFO and reconnect starts the oldest queued finale first', () => {
    const engine = makeRuntime();
    const lifecycle = attachSocketLifecycle(engine);
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      lifecycle.receive('connect');
      engine.handlePreviewSocketEvent(payload('preview:disconnect'));
      engine.handleFinale({ id: 'real-first', showPlan: plan('real-first') });

      lifecycle.socket.connected = false;
      lifecycle.receive('disconnect');
      expect(engine.currentPreview).toBeNull();
      expect(engine.currentFinale).toBeNull();
      expect(engine.finaleQueue.map(entry => entry.id)).toEqual(['real-first']);

      expect(engine.handleFinale({ id: 'real-later', showPlan: plan('real-later') }))
        .toMatchObject({ accepted: true, queued: true });
      expect(engine.currentFinale).toBeNull();
      expect(engine.finaleQueue.map(entry => entry.id)).toEqual(['real-first', 'real-later']);

      lifecycle.socket.connected = true;
      lifecycle.receive('connect');
      expect(engine.currentFinale).toMatchObject({ id: 'real-first' });
      expect(engine.finaleQueue.map(entry => entry.id)).toEqual(['real-later']);
    } finally {
      lifecycle.restore();
      consoleError.mockRestore();
    }
  });

  test('a preview exception reports failed, cleans only preview state, and starts the next real finale', () => {
    const engine = makeRuntime();
    engine.renderer.spawnLayer.mockImplementationOnce(() => { throw new Error('preview layer failed'); });
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      engine.handlePreviewSocketEvent(payload('preview:broken'));
      engine.handleFinale({ id: 'real-next', showPlan: plan('real-next') });
      engine.setNow(11100);

      engine.processTimeline(11100);

      expect(engine.currentPreview).toBeNull();
      expect(engine.currentFinale).toMatchObject({ id: 'real-next', startedAt: 11100 });
      expect(engine.finaleIds).toEqual(new Set(['real-next']));
      expect(previewEvents(engine, 'webgpu-fireworks:preview-status').at(-1)?.[1]).toMatchObject({
        requestId: 'preview:broken', state: 'failed', reason: 'renderer-error'
      });
    } finally {
      consoleError.mockRestore();
    }
  });

  test('destroy cancels an active preview without adding a finale identity', () => {
    const engine = makeRuntime();
    engine.handlePreviewSocketEvent(payload('preview:destroy'));
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      engine.destroy();
    } finally {
      consoleError.mockRestore();
    }

    expect(engine.currentPreview).toBeNull();
    expect(engine.finaleIds.size).toBe(0);
    expect(engine.timelineQueue).toEqual([]);
    expect(previewEvents(engine, 'webgpu-fireworks:preview-status').at(-1)?.[1]).toMatchObject({
      requestId: 'preview:destroy', state: 'failed', reason: 'renderer-destroyed'
    });
  });
});
