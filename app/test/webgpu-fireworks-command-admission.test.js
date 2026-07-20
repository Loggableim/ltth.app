'use strict';

const WebGPUParticleEngine = require('../plugins/webgpu-fireworks/gpu/webgpu-particle-engine');

const makeEngine = ({ width = 1920, height = 1080, nowMs = 1000, isOwnerActive = () => true } = {}) => {
  const uploads = [];
  const engine = new WebGPUParticleEngine({ width, height }, { now: () => nowMs, isOwnerActive });
  engine.initialized = true;
  engine.device = {
    queue: {
      writeBuffer: jest.fn((buffer, offset, raw) => uploads.push(raw))
    }
  };
  engine.buffers = { commands: {} };
  return { engine, uploads };
};

const enableComputeRender = engine => {
  const pass = {
    setBindGroup: jest.fn(),
    setPipeline: jest.fn(),
    dispatchWorkgroups: jest.fn(),
    end: jest.fn()
  };
  const encoder = {
    beginComputePass: jest.fn(() => pass),
    finish: jest.fn(() => ({ kind: 'compute' }))
  };
  engine.device.createCommandEncoder = jest.fn(() => encoder);
  engine.device.queue.submit = jest.fn();
  engine.buffers.uniforms = {};
  engine.computeBindGroup = {};
  engine.pipelines = {
    reset: {},
    spawn: {},
    update: {},
    secondary: {}
  };
  return { pass, encoder };
};

const queueCommand = (engine, {
  seed,
  lane = 'show',
  priority = 'decorative',
  required = false,
  beatId = 'beat:0',
  admissionBatchId = null,
  effectId = `effect:${seed}`,
  emissionDelay,
  emissionSpread,
  particleDuration,
  ownerToken,
  expiresAtMs,
  normalizedOrigin,
  normalizedTarget,
  origin,
  target,
}) => engine._queueSpawn({
  origin: origin || { x: seed, y: 0 },
  target: target || { x: seed, y: 1 },
  normalizedOrigin,
  normalizedTarget,
  count: 1,
  shape: 'sparkle',
  seed,
  effectId,
  lane,
  priority,
  required,
  beatId,
  admissionBatchId,
  emissionDelay,
  emissionSpread,
  particleDuration,
  ownerToken,
  expiresAtMs,
});

const uploadedSeeds = raw => {
  const words = new Uint32Array(raw);
  return Array.from({ length: raw.byteLength / 112 }, (_, index) => words[index * 28 + 15]);
};

describe('WebGPU Fireworks spawn command lane admission', () => {
  test('re-ages deferred delay and visible life from immutable queue timing', () => {
    const { engine, uploads } = makeEngine({ nowMs: 1000 });
    queueCommand(engine, { seed: 700, admissionBatchId: 700, emissionDelay: 0, particleDuration: 1 });
    queueCommand(engine, {
      seed: 701,
      admissionBatchId: 701,
      emissionDelay: 0.5,
      particleDuration: 2,
      ownerToken: 'finale:1',
      expiresAtMs: 4000,
    });

    engine._uploadSpawnCommands(1300);
    expect(engine.spawnQueue[0].emissionDelay).toBe(0.5);
    engine._uploadSpawnCommands(1700);

    const uploaded = new Float32Array(uploads[1]);
    expect(uploaded[22]).toBe(0);
    expect(uploaded[13]).toBeCloseTo(1.8, 5);
  });

  test('retains future spread emissions after baseline particle life is exhausted', () => {
    const { engine, uploads } = makeEngine({ nowMs: 1000 });
    queueCommand(engine, {
      seed: 702,
      emissionDelay: 0,
      emissionSpread: 1,
      particleDuration: 0.2,
    });

    expect(engine._uploadSpawnCommands(1500)).toEqual({ count: 1, maxParticles: 1 });
    const uploaded = new Float32Array(uploads[0]);
    expect(uploaded[13]).toBeCloseTo(0.2, 5);
    expect(uploaded[23]).toBeCloseTo(0.5, 5);
  });

  test('drops only after particle life and the full emission spread are exhausted', () => {
    const { engine, uploads } = makeEngine({ nowMs: 1000 });
    queueCommand(engine, {
      seed: 703,
      emissionDelay: 0,
      emissionSpread: 1,
      particleDuration: 0.2,
    });

    expect(engine._uploadSpawnCommands(2200)).toEqual({ count: 0, maxParticles: 0 });
    expect(uploads).toEqual([]);
    expect(engine.spawnTelemetry.droppedByReason.lifeExhausted).toBe(1);
  });

  test.each([
    { nowMs: 1600, expiresAtMs: 1500, isOwnerActive: () => true, reason: 'expired' },
    { nowMs: 1200, expiresAtMs: 1500, isOwnerActive: () => false, reason: 'inactiveOwner' },
  ])('drops a deferred command when $reason', ({ nowMs, expiresAtMs, isOwnerActive, reason }) => {
    const { engine, uploads } = makeEngine({ nowMs: 1000, isOwnerActive });
    queueCommand(engine, { seed: 1, ownerToken: 'preview:gone', expiresAtMs });
    engine._uploadSpawnCommands(nowMs);
    expect(uploads).toEqual([]);
    expect(engine.spawnTelemetry.droppedByReason[reason]).toBe(1);
  });

  test('resolves normalized V2 points against the viewport active at admission', () => {
    const { engine, uploads } = makeEngine({ width: 1080, height: 1920 });
    queueCommand(engine, {
      seed: 1,
      normalizedOrigin: { x: 0.5, y: 0.12 },
      normalizedTarget: { x: 0.75, y: 0.25 },
      origin: { x: 540, y: 230.4 },
      target: { x: 810, y: 480 },
    });
    engine.setLogicalSize(1920, 1080);
    const materialized = engine._materializeCommandForAdmission(engine.spawnQueue[0], 1000).command;
    expect(materialized.origin).toEqual({ x: 960, y: 129.6 });
    expect(materialized.target).toEqual({ x: 1440, y: 270 });
    engine._uploadSpawnCommands(1000);
    const uploaded = new Float32Array(uploads[0]);
    expect(uploaded[0]).toBeCloseTo(960, 5);
    expect(uploaded[1]).toBeGreaterThanOrEqual(0);
    expect(uploaded[2] - uploaded[0]).toBeCloseTo(480, 5);
    expect(uploaded[3] - uploaded[1]).toBeCloseTo(140.4, 4);
  });

  test('caches cue fit by generation, owner, correlation, and viewport revision', () => {
    const { engine } = makeEngine({ width: 1080, height: 1920 });
    const makeCommand = (envelopeCommandId, x) => Object.freeze({
      envelopeCommandId,
      kind: 2,
      shape: 3,
      flags: 0,
      textureIndex: 0,
      normalizedOrigin: Object.freeze({ x, y: 0.1 }),
      normalizedTarget: Object.freeze({ x, y: 0.1 }),
      origin: Object.freeze({ x: x * 1080, y: 192 }),
      target: Object.freeze({ x: x * 1080, y: 192 }),
      size: 28,
      intensity: 1,
      particleDuration: 1.2,
      emissionDelay: 0,
      gravity: 90,
      drag: 0.985,
      burstDepth: 1,
    });
    const manifest = Object.freeze({
      correlationId: 'cue:1',
      commands: Object.freeze([makeCommand('left', 0.08), makeCommand('right', 0.92)]),
    });
    const entry = {
      resourceGeneration: engine.resourceGeneration,
      ownerToken: 'finale:11',
      correlationId: 'cue:1',
      envelopeCommandId: 'left',
      correlationManifest: manifest,
    };
    const first = engine._getOrCreateCorrelationFit(entry, 1000);
    expect(engine._getOrCreateCorrelationFit({ ...entry }, 1200)).toBe(first);
    let mismatch;
    try {
      engine._getOrCreateCorrelationFit({ ...entry, envelopeCommandId: 'missing' }, 1200);
    } catch (error) {
      mismatch = error;
    }
    expect(mismatch).toMatchObject({ code: 'CORRELATION_MANIFEST_MISMATCH' });
    engine.setLogicalSize(1920, 1080);
    const resized = engine._getOrCreateCorrelationFit({ ...entry }, 1300);
    expect(resized).not.toBe(first);
    const otherOwner = engine._getOrCreateCorrelationFit({ ...entry, ownerToken: 'preview:11' }, 1300);
    expect(otherOwner).not.toBe(resized);
    engine.resourceGeneration += 1;
    const nextGeneration = engine._getOrCreateCorrelationFit({
      ...entry,
      resourceGeneration: engine.resourceGeneration,
    }, 1400);
    expect(nextGeneration).not.toBe(resized);
  });

  test.each([
    ['standard', 0, 8],
    ['star', 3, 20],
    ['ring', 4, 18],
  ])('keeps a visible top guard for representative %s rockets', (name, shape, size) => {
    const width = 1920;
    const height = 1080;
    const { engine } = makeEngine({ width, height });
    const envelopeCommandId = `top-guard:${name}`;
    const command = Object.freeze({
      envelopeCommandId,
      kind: 2,
      shape,
      flags: 0,
      textureIndex: 0,
      origin: Object.freeze({ x: width / 2, y: height * 0.16 }),
      target: Object.freeze({ x: width / 2, y: height * 0.16 }),
      size,
      intensity: 1.5,
      particleDuration: 1.57,
      emissionDelay: 0,
      gravity: 153,
      drag: 0.985,
      burstDepth: 0,
    });
    const manifest = Object.freeze({
      correlationId: `top-guard:${name}`,
      commands: Object.freeze([command]),
    });
    const fit = engine._getOrCreateCorrelationFit({
      resourceGeneration: engine.resourceGeneration,
      ownerToken: `standalone:top-guard:${name}`,
      correlationId: manifest.correlationId,
      envelopeCommandId,
      correlationManifest: manifest,
    }, 1000);
    const expectedGuard = Math.min(48, Math.max(12, Math.min(width, height) * 0.025));

    expect(fit.bounds.top).toBeGreaterThanOrEqual(expectedGuard - 1e-5);
    expect(fit.bounds.bottom).toBeLessThanOrEqual(height - expectedGuard + 1e-5);
  });

  test('keeps tuple cache identity when owners and correlations contain separators', () => {
    const { engine } = makeEngine({ width: 1080, height: 1920 });
    const makeEntry = (ownerToken, correlationId) => {
      const envelopeCommandId = `${correlationId}:member`;
      const command = Object.freeze({
        envelopeCommandId,
        kind: 2,
        shape: 3,
        flags: 0,
        textureIndex: 0,
        origin: Object.freeze({ x: 540, y: 192 }),
        target: Object.freeze({ x: 540, y: 192 }),
        size: 28,
        intensity: 1,
        particleDuration: 1.2,
        emissionDelay: 0,
        gravity: 90,
        drag: 0.985,
        burstDepth: 1,
      });
      const correlationManifest = Object.freeze({
        correlationId,
        commands: Object.freeze([command]),
      });
      return {
        resourceGeneration: engine.resourceGeneration,
        ownerToken,
        correlationId,
        envelopeCommandId,
        correlationManifest,
      };
    };
    const separatorOwner = makeEntry('owner|a', 'cue');
    const separatorCorrelation = makeEntry('owner', 'a|cue');

    const ownerFit = engine._getOrCreateCorrelationFit(separatorOwner, 1000);
    const correlationFit = engine._getOrCreateCorrelationFit(separatorCorrelation, 1000);
    expect(correlationFit).not.toBe(ownerFit);
    expect(engine.correlationFitCache.size).toBe(2);

    engine.cancelQueuedOwner('owner|a');
    expect(engine.correlationFitCache.size).toBe(1);
    expect(engine._getOrCreateCorrelationFit(separatorCorrelation, 1200)).toBe(correlationFit);
  });

  test('bounds inactive owner tombstones during long standalone sessions', () => {
    const { engine } = makeEngine();
    for (let index = 0; index <= 4096; index++) {
      engine.cancelQueuedOwner(`standalone:${index}`);
    }

    expect(engine.inactiveSpawnOwners.size).toBe(4096);
    expect(engine.inactiveSpawnOwners.has('standalone:4096')).toBe(true);
  });

  test('fails a required owner when one tuple receives distinct manifest identities', () => {
    const { engine, uploads } = makeEngine();
    engine.onOwnerInvalidated = jest.fn();
    const makeManifestCommand = (envelopeCommandId, x) => Object.freeze({
      envelopeCommandId,
      kind: 2,
      shape: 3,
      flags: 0,
      textureIndex: 0,
      origin: Object.freeze({ x, y: 120 }),
      target: Object.freeze({ x, y: 120 }),
      size: 8,
      intensity: 0.1,
      particleDuration: 0.2,
      emissionDelay: 0,
      gravity: 10,
      drag: 0.985,
      burstDepth: 0,
    });
    const queueMember = (envelopeCommandId, x) => {
      const command = makeManifestCommand(envelopeCommandId, x);
      const correlationManifest = Object.freeze({
        correlationId: 'shared-correlation',
        commands: Object.freeze([command]),
      });
      engine._queueSpawn({
        ...command,
        ownerToken: 'standalone:manifest-mismatch',
        correlationId: 'shared-correlation',
        correlationManifest,
        required: true,
      });
    };
    engine._queueSpawn({
      kind: 2,
      shape: 3,
      count: 1,
      origin: { x: 960, y: 240 },
      target: { x: 960, y: 240 },
      ownerToken: 'standalone:manifest-mismatch',
      effectId: 'valid-before-required-mismatch',
    });
    queueMember('member:a', 800);
    queueMember('member:b', 1120);

    expect(engine._uploadSpawnCommands(1000)).toEqual({ count: 0, maxParticles: 0 });
    expect(uploads).toEqual([]);
    expect(engine.spawnTelemetry.droppedByReason.unregisteredEnvelope).toBe(2);
    expect(engine.inactiveSpawnOwners.has('standalone:manifest-mismatch')).toBe(true);
    expect(engine.onOwnerInvalidated).toHaveBeenCalledWith(
      'standalone:manifest-mismatch',
      'unregisteredEnvelope'
    );
  });

  test('assigns distinct automatic correlations to rocket and explosion phases', () => {
    const { engine } = makeEngine();
    engine.spawnRocket({
      effectId: 'plan:1',
      ownerToken: 'standalone:plan:1',
      origin: { x: 960, y: 1100 },
      target: { x: 960, y: 180 },
      duration: 0.6,
    });
    const rocketCorrelation = engine.spawnQueue[0].envelopeCorrelationId;
    expect(engine.spawnQueue[0].correlationId).toBe('plan:1');
    expect(engine._uploadSpawnCommands(1000).count).toBeGreaterThan(0);

    engine.spawnExplosion({
      effectId: 'plan:1',
      ownerToken: 'standalone:plan:1',
      origin: { x: 960, y: 180 },
      target: { x: 960, y: 180 },
      shape: 'star',
      count: 12,
      duration: 0.6,
    });
    const explosionCorrelation = engine.spawnQueue[0].envelopeCorrelationId;
    expect(engine.spawnQueue[0].correlationId).toBe('plan:1');
    expect(explosionCorrelation).not.toBe(rocketCorrelation);
    expect(engine._uploadSpawnCommands(1000).count).toBeGreaterThan(0);
  });

  test('creates a deeply frozen singleton manifest for direct queue commands', () => {
    const { engine } = makeEngine();
    queueCommand(engine, { seed: 900, effectId: 'standalone:900' });
    const [entry] = engine.spawnQueue;
    expect(Object.isFrozen(entry.correlationManifest)).toBe(true);
    expect(Object.isFrozen(entry.correlationManifest.commands)).toBe(true);
    expect(entry.correlationManifest.commands.every(command => Object.isFrozen(command))).toBe(true);
    expect(entry.correlationManifest.correlationId).toBe(entry.envelopeCorrelationId);
    expect(entry.correlationManifest.commands.map(command => command.envelopeCommandId))
      .toContain(entry.envelopeCommandId);
  });
  test('treats a null owner expiry as unbounded for ordinary live effects', () => {
    const { engine, uploads } = makeEngine();
    expect(engine._queueSpawn({
      shape: 'sparkle',
      count: 1,
      seed: 77,
      effectId: 'live:null-expiry',
      expiresAtMs: null,
    })).toBe(true);

    expect(engine._uploadSpawnCommands(1_000)).toEqual({ count: 1, maxParticles: 1 });
    expect(uploadedSeeds(uploads[0])).toEqual([77]);
    expect(engine.spawnTelemetry.droppedByReason.expired).toBe(0);
  });

  test('drops a stale-generation entry before admitting an otherwise current command', () => {
    const { engine, uploads } = makeEngine();
    queueCommand(engine, { seed: 1, admissionBatchId: 100 });
    queueCommand(engine, { seed: 2, admissionBatchId: 200 });
    engine.spawnQueue[0].resourceGeneration = engine.resourceGeneration - 1;

    expect(engine._uploadSpawnCommands(1_000)).toEqual({ count: 1, maxParticles: 1 });
    expect(uploadedSeeds(uploads[0])).toEqual([2]);
    expect(engine.spawnTelemetry.droppedByReason.staleGeneration).toBe(1);
  });

  test('uploads exactly 28 show commands plus four reserved gift commands', () => {
    const { engine, uploads } = makeEngine();
    for (let seed = 1; seed <= 28; seed++) queueCommand(engine, { seed });
    for (let seed = 101; seed <= 104; seed++) {
      queueCommand(engine, { seed, lane: 'gift', priority: 'core', required: true });
    }

    expect(engine._uploadSpawnCommands()).toEqual({ count: 32, maxParticles: 1 });
    expect(uploadedSeeds(uploads[0]).sort((left, right) => left - right)).toEqual([
      ...Array.from({ length: 28 }, (_, index) => index + 1),
      101, 102, 103, 104
    ]);
    expect(engine.getMetrics().commandAdmission.current).toMatchObject({
      selectedShowCommands: 28,
      droppedShowCommands: 0,
      selectedGiftCommands: 4,
      droppedGiftCommands: 0,
      requiredCoreFailures: 0
    });
  });

  test('drops the 29th decorative show command while preserving all four gift slots', () => {
    const { engine, uploads } = makeEngine();
    for (let seed = 1; seed <= 29; seed++) queueCommand(engine, { seed });
    for (let seed = 101; seed <= 104; seed++) {
      queueCommand(engine, { seed, lane: 'gift', priority: 'core', required: true });
    }

    expect(engine._uploadSpawnCommands()).toEqual({ count: 32, maxParticles: 1 });
    expect(uploadedSeeds(uploads[0]).sort((left, right) => left - right)).toEqual([
      ...Array.from({ length: 28 }, (_, index) => index + 1),
      101, 102, 103, 104
    ]);
    expect(engine.getMetrics().commandAdmission.current).toMatchObject({
      selectedShowCommands: 28,
      droppedShowCommands: 1,
      selectedGiftCommands: 4,
      droppedGiftCommands: 0
    });
    expect(engine.spawnQueue).toHaveLength(0);
  });

  test('allows a later required core command to displace earlier decoration, never vice versa', () => {
    const { engine, uploads } = makeEngine();
    for (let seed = 1; seed <= 28; seed++) queueCommand(engine, { seed });
    queueCommand(engine, {
      seed: 90,
      priority: 'core',
      required: true,
      beatId: 'beat:later-core'
    });
    for (let seed = 101; seed <= 104; seed++) {
      queueCommand(engine, { seed, lane: 'gift', priority: 'core', required: true });
    }

    engine._uploadSpawnCommands();
    const selected = uploadedSeeds(uploads[0]);
    expect(selected).toContain(90);
    expect(selected).not.toContain(28);
    expect(selected).toEqual(expect.arrayContaining([101, 102, 103, 104]));

    const reverse = makeEngine();
    for (let seed = 1; seed <= 28; seed++) {
      queueCommand(reverse.engine, { seed, priority: 'core', required: true });
    }
    queueCommand(reverse.engine, { seed: 90, priority: 'decorative' });
    reverse.engine._uploadSpawnCommands();
    expect(uploadedSeeds(reverse.uploads[0])).toEqual(
      Array.from({ length: 28 }, (_, index) => index + 1)
    );
  });

  test('admits required accent before optional core when the show lane is saturated', () => {
    const { engine, uploads } = makeEngine();
    for (let seed = 1; seed <= 28; seed++) {
      queueCommand(engine, { seed, priority: 'core', required: false });
    }
    queueCommand(engine, {
      seed: 90,
      priority: 'accent',
      required: true,
      beatId: 'beat:required-accent'
    });

    expect(engine._uploadSpawnCommands()).toEqual({ count: 28, maxParticles: 1 });
    expect(uploadedSeeds(uploads[0])).toContain(90);
    expect(uploadedSeeds(uploads[0])).not.toContain(28);
    expect(engine.getMetrics().commandAdmission.current).toMatchObject({
      selectedShowCommands: 28,
      droppedShowCommands: 1,
      requiredCoreFailures: 0
    });
  });

  test('splits exact 700ms and 701ms show batches after a stalled frame without loss or overflow', () => {
    const { engine, uploads } = makeEngine();
    for (let seed = 1; seed <= 28; seed++) {
      queueCommand(engine, {
        seed,
        priority: 'core',
        required: true,
        beatId: 'beat:700',
        admissionBatchId: 700
      });
    }
    for (let seed = 29; seed <= 56; seed++) {
      queueCommand(engine, {
        seed,
        priority: 'core',
        required: true,
        beatId: 'beat:701',
        admissionBatchId: 701
      });
    }
    for (let seed = 101; seed <= 104; seed++) {
      queueCommand(engine, { seed, lane: 'gift', priority: 'core', required: true });
    }

    expect(engine._uploadSpawnCommands()).toEqual({ count: 32, maxParticles: 1 });
    expect(uploadedSeeds(uploads[0])).toEqual(expect.arrayContaining([
      ...Array.from({ length: 28 }, (_, index) => index + 1),
      101, 102, 103, 104
    ]));
    expect(engine.spawnQueue).toHaveLength(28);
    expect(engine.spawnQueue.every(command => command.admissionBatchId === 701)).toBe(true);
    expect(engine.getMetrics().commandAdmission.current).toMatchObject({
      selectedShowCommands: 28,
      droppedShowCommands: 0,
      selectedGiftCommands: 4,
      requiredCoreFailures: 0
    });

    expect(engine._uploadSpawnCommands()).toEqual({ count: 28, maxParticles: 1 });
    expect(uploadedSeeds(uploads[1]).sort((left, right) => left - right)).toEqual(
      Array.from({ length: 28 }, (_, index) => index + 29)
    );
    expect(engine.spawnQueue).toHaveLength(0);
    expect(engine.getMetrics().commandAdmission).toMatchObject({
      current: {
        selectedShowCommands: 28,
        droppedShowCommands: 0,
        requiredCoreFailures: 0
      },
      cumulative: {
        selectedShowCommands: 56,
        droppedShowCommands: 0,
        selectedGiftCommands: 4,
        requiredCoreFailures: 0
      }
    });
  });

  test('clears a deferred managed show batch and its telemetry on renderer destroy', () => {
    const { engine } = makeEngine();
    queueCommand(engine, { seed: 1, required: true, admissionBatchId: 700 });
    queueCommand(engine, { seed: 2, required: true, admissionBatchId: 701 });

    expect(engine._uploadSpawnCommands()).toEqual({ count: 1, maxParticles: 1 });
    expect(engine.spawnQueue).toHaveLength(1);
    expect(engine.getMetrics().commandAdmission.cumulative.selectedShowCommands).toBe(1);

    engine.destroy();

    expect(engine.spawnQueue).toHaveLength(0);
    expect(engine.getMetrics().commandAdmission).toEqual({
      current: expect.objectContaining({
        selectedShowCommands: 0,
        droppedShowCommands: 0,
        requiredCoreFailures: 0
      }),
      cumulative: expect.objectContaining({
        selectedShowCommands: 0,
        droppedShowCommands: 0,
        requiredCoreFailures: 0
      })
    });
  });

  test('uploads reserved realtime fallback and returns a correlated error on required show overflow', () => {
    const { engine, uploads } = makeEngine();
    for (let seed = 1; seed <= 29; seed++) {
      queueCommand(engine, {
        seed,
        priority: 'core',
        required: true,
        beatId: `beat:${seed}`,
        effectId: `show:correlated:layer:${seed}`
      });
    }
    for (let seed = 101; seed <= 105; seed++) {
      queueCommand(engine, { seed, lane: 'gift', priority: 'core' });
    }
    for (let seed = 201; seed <= 202; seed++) {
      queueCommand(engine, { seed, lane: 'live', priority: 'core' });
    }

    const spawn = engine._uploadSpawnCommands();
    expect(spawn).toMatchObject({
      count: 4,
      maxParticles: 1,
      admissionError: {
        name: 'RequiredCoreAdmissionError',
        code: 'REQUIRED_CORE_COMMAND_OVERFLOW',
        lane: 'show',
        beatId: 'beat:29',
        correlationId: 'show:correlated:layer:29'
      }
    });
    expect(uploadedSeeds(uploads[0])).toEqual([101, 102, 103, 104]);
    expect(engine.spawnQueue).toHaveLength(0);
    expect(engine.getMetrics().commandAdmission.current).toMatchObject({
      selectedShowCommands: 0,
      droppedShowCommands: 29,
      selectedGiftCommands: 4,
      droppedGiftCommands: 1,
      selectedLiveCommands: 0,
      droppedLiveCommands: 2,
      requiredCoreFailures: 1
    });

    expect(engine._uploadSpawnCommands()).toEqual({ count: 0, maxParticles: 0 });
    expect(uploads).toHaveLength(1);
    expect(engine.getMetrics().commandAdmission).toMatchObject({
      current: {
        selectedShowCommands: 0,
        droppedShowCommands: 0,
        selectedGiftCommands: 0,
        droppedGiftCommands: 0,
        selectedLiveCommands: 0,
        droppedLiveCommands: 0,
        requiredCoreFailures: 0
      },
      cumulative: {
        selectedShowCommands: 0,
        droppedShowCommands: 29,
        selectedGiftCommands: 4,
        droppedGiftCommands: 1,
        selectedLiveCommands: 0,
        droppedLiveCommands: 2,
        requiredCoreFailures: 1
      }
    });
  });

  test('submits gift fallback compute work before throwing required-show overflow from render', () => {
    const { engine, uploads } = makeEngine();
    const { encoder } = enableComputeRender(engine);
    for (let seed = 1; seed <= 29; seed++) {
      queueCommand(engine, {
        seed,
        priority: 'core',
        required: true,
        beatId: `beat:${seed}`,
        effectId: `show:render:layer:${seed}`
      });
    }
    for (let seed = 101; seed <= 104; seed++) {
      queueCommand(engine, { seed, lane: 'gift', priority: 'core', required: true });
    }

    let failure;
    try {
      engine.render(1 / 60, 1, { present: false });
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({
      name: 'RequiredCoreAdmissionError',
      code: 'REQUIRED_CORE_COMMAND_OVERFLOW',
      beatId: 'beat:29',
      correlationId: 'show:render:layer:29'
    });
    expect(uploadedSeeds(uploads[0])).toEqual([101, 102, 103, 104]);
    expect(engine.device.queue.submit).toHaveBeenCalledWith([{ kind: 'compute' }]);
    expect(engine.device.createCommandEncoder).toHaveBeenCalledTimes(1);
    expect(engine.device.createCommandEncoder).toHaveBeenCalledWith({ label: 'fireworks-compute-frame' });
    expect(encoder.finish).toHaveBeenCalledTimes(1);
    expect(engine.spawnQueue).toHaveLength(0);
  });

  test('preserves source correlation through multi-command show helpers', () => {
    const { engine } = makeEngine();
    const colors = Array.from({ length: 10 }, (_, index) => `#${String(index + 1).padStart(6, '0')}`);
    for (let shell = 1; shell <= 3; shell++) {
      engine.spawnExplosion({
        lane: 'show',
        priority: 'core',
        required: true,
        beatId: 'cue:wall',
        effectId: `show:wall:shell:${shell}`,
        shape: 'image',
        count: 50,
        colors
      });
    }

    const spawn = engine._uploadSpawnCommands();
    expect(spawn.admissionError).toMatchObject({
      code: 'REQUIRED_CORE_COMMAND_OVERFLOW',
      beatId: 'cue:wall',
      correlationId: 'show:wall:shell:3'
    });
  });

  test('shares the show budget across nearby beats and resets it for the next render window', () => {
    const { engine } = makeEngine();
    for (let seed = 1; seed <= 14; seed++) queueCommand(engine, { seed, beatId: 'beat:100' });
    for (let seed = 15; seed <= 29; seed++) queueCommand(engine, { seed, beatId: 'beat:101' });

    expect(engine._uploadSpawnCommands()).toEqual({ count: 28, maxParticles: 1 });
    expect(engine.getMetrics().commandAdmission.current).toMatchObject({
      selectedShowCommands: 28,
      droppedShowCommands: 1
    });

    for (let seed = 201; seed <= 228; seed++) queueCommand(engine, { seed, beatId: 'beat:500' });
    expect(engine._uploadSpawnCommands()).toEqual({ count: 28, maxParticles: 1 });
    expect(engine.getMetrics().commandAdmission).toMatchObject({
      current: {
        selectedShowCommands: 28,
        droppedShowCommands: 0
      },
      cumulative: {
        selectedShowCommands: 56,
        droppedShowCommands: 1
      }
    });

    engine._uploadSpawnCommands();
    expect(engine.getMetrics().commandAdmission).toMatchObject({
      current: {
        selectedShowCommands: 0,
        droppedShowCommands: 0
      },
      cumulative: {
        selectedShowCommands: 56,
        droppedShowCommands: 1
      }
    });
  });

  test('keeps legacy FIFO admission and safe metadata defaults unchanged', () => {
    const { engine, uploads } = makeEngine();
    const accepted = [];
    for (let seed = 1; seed <= 33; seed++) {
      accepted.push(engine._queueSpawn({ count: 1, shape: 'sparkle', seed, effectId: `legacy:${seed}` }));
    }

    expect(accepted).toEqual([...Array(32).fill(true), false]);
    expect(engine.spawnQueue).toHaveLength(32);
    expect(engine.spawnQueue[0]).toMatchObject({
      lane: 'live',
      priority: 'core',
      required: false,
      beatId: null,
      admissionManaged: false
    });
    expect(engine._uploadSpawnCommands()).toEqual({ count: 32, maxParticles: 1 });
    expect(uploadedSeeds(uploads[0])).toEqual(Array.from({ length: 32 }, (_, index) => index + 1));
  });

  test('keeps gift core and image commands under show saturation and drops gift decoration first', () => {
    const { engine, uploads } = makeEngine();
    for (let seed = 1; seed <= 28; seed++) queueCommand(engine, { seed });

    engine.spawnExplosion({
      lane: 'gift',
      effectId: 'gift:burst',
      seed: 500,
      shape: 'burst',
      count: 60,
      colors: ['#ff0000'],
      style: 'realistic'
    });
    engine.spawnExplosion({
      lane: 'gift',
      priority: 'core',
      required: true,
      effectId: 'gift:image',
      seed: 600,
      shape: 'image',
      count: 8,
      colors: ['#ffffff'],
      textureIndex: 4,
      nativeColor: true
    });

    const giftCommands = engine.spawnQueue.filter(command => command.lane === 'gift');
    const image = giftCommands.find(command => command.shape === 6);
    const core = giftCommands.find(command => ((command.flags >> 8) & 15) === 3);
    const accent = giftCommands.find(command => ((command.flags >> 8) & 15) === 5);
    const flash = giftCommands.find(command => ((command.flags >> 8) & 15) === 2);
    const smoke = giftCommands.find(command => ((command.flags >> 8) & 15) === 7);
    expect(image).toMatchObject({ priority: 'core', required: true });
    expect(core).toMatchObject({ priority: 'core' });
    expect(accent).toMatchObject({ priority: 'accent', required: false });
    expect(flash).toMatchObject({ priority: 'decorative', required: false });
    expect(smoke).toMatchObject({ priority: 'decorative', required: false });

    engine._uploadSpawnCommands();
    const selected = uploadedSeeds(uploads[0]);
    expect(selected).toEqual(expect.arrayContaining([image.seed, core.seed, accent.seed, flash.seed]));
    expect(selected).not.toContain(smoke.seed);
    expect(engine.getMetrics().commandAdmission.current).toMatchObject({
      selectedShowCommands: 28,
      selectedGiftCommands: 4,
      droppedGiftCommands: 1
    });
  });

  test('lets a later gift outrank generic live work while preserving unmanaged mixed-queue metadata', () => {
    const { engine, uploads } = makeEngine();
    for (let seed = 201; seed <= 204; seed++) {
      engine._queueSpawn({ count: 1, shape: 'sparkle', seed, effectId: `legacy-live:${seed}` });
    }
    expect(engine.spawnQueue).toHaveLength(4);
    expect(engine.spawnQueue.every(command => command.lane === 'live' && command.admissionManaged === false)).toBe(true);

    for (let seed = 1; seed <= 28; seed++) {
      queueCommand(engine, { seed, priority: 'core', required: true });
    }
    queueCommand(engine, {
      seed: 300,
      lane: 'gift',
      priority: 'core',
      required: false,
      effectId: 'gift:late'
    });

    expect(engine._uploadSpawnCommands()).toEqual({ count: 32, maxParticles: 1 });
    const selected = uploadedSeeds(uploads[0]);
    expect(selected).toContain(300);
    expect(selected).toEqual(expect.arrayContaining([201, 202, 203]));
    expect(selected).not.toContain(204);
    expect(engine.getMetrics().commandAdmission.current).toMatchObject({
      selectedGiftCommands: 1,
      droppedGiftCommands: 0,
      selectedLiveCommands: 3,
      droppedLiveCommands: 1
    });
  });
});
