'use strict';

const WebGPUParticleEngine = require('../plugins/webgpu-fireworks/gpu/webgpu-particle-engine');

const makeEngine = () => {
  const uploads = [];
  const engine = new WebGPUParticleEngine({ width: 1920, height: 1080 }, {});
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
  effectId = `effect:${seed}`
}) => engine._queueSpawn({
  origin: { x: seed, y: 0 },
  target: { x: seed, y: 1 },
  count: 1,
  shape: 'sparkle',
  seed,
  effectId,
  lane,
  priority,
  required,
  beatId
});

const uploadedSeeds = raw => {
  const words = new Uint32Array(raw);
  return Array.from({ length: raw.byteLength / 112 }, (_, index) => words[index * 28 + 15]);
};

describe('WebGPU Fireworks spawn command lane admission', () => {
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
