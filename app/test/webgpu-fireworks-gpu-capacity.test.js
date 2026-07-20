'use strict';

const {
  createDeferred,
  createFakeGpu,
  makeRenderer,
  restoreGpuGlobals,
} = require('./helpers/webgpu-fireworks-gpu-harness');

afterEach(() => restoreGpuGlobals());

function capacityBuffers(resources) {
  return [
    resources.particleBuffer,
    resources.historyBuffer,
    resources.activeIndicesBuffer,
    resources.secondaryIndicesBuffer,
    resources.freeIndicesBuffer,
    resources.countersBuffer,
    resources.coreIndirectBuffer,
    resources.trailIndirectBuffer,
    resources.readback,
  ];
}

describe('WebGPU Fireworks live particle capacity', () => {
  test('activates the initial generation only after capacity bind groups succeed', async () => {
    const gpu = createFakeGpu();
    const requestDevice = gpu.adapter.requestDevice.bind(gpu.adapter);
    gpu.adapter.requestDevice = async descriptor => {
      const device = await requestDevice(descriptor);
      device.createBindGroup = () => {
        throw new Error('initial bind group failure');
      };
      return device;
    };
    const renderer = makeRenderer(gpu, { maxParticles: 2_048 });

    await expect(renderer.init()).resolves.toBe(false);

    expect(renderer.resourceGeneration).toBe(0);
    expect(renderer.capacityResources).toBeNull();
    expect(gpu.buffers.length).toBeGreaterThan(0);
    expect(gpu.buffers.every(buffer => buffer.destroyed === true)).toBe(true);
  });

  test.each([512, 16_384])('atomically swaps all capacity-bound resources to %i', async (capacity) => {
    const gpu = createFakeGpu();
    const renderer = makeRenderer(gpu, { maxParticles: 2_048 });
    await renderer.init();
    const oldResources = renderer._captureCapacityResources();

    const result = await renderer.reconfigureCapacity(capacity);

    expect(result).toEqual({
      changed: capacity !== 2_048,
      generation: 2,
      maxParticles: capacity,
    });
    expect(renderer.maxParticles).toBe(capacity);
    expect(renderer.capacityResources.particleBuffer.size).toBe(capacity * renderer.particleStride);
    expect(renderer.capacityResources.historyBuffer.size).toBe(
      capacity * renderer.maxTrailSamples * 16
    );
    expect(renderer.capacityResources.activeIndicesBuffer.size).toBe(
      renderer.capacityResources.activeIndexBucketStrideBytes * 3
    );
    expect(renderer.capacityResources.secondaryIndicesBuffer.size).toBe(capacity * 4);
    expect(renderer.capacityResources.freeIndicesBuffer.size).toBe(capacity * 4);
    expect(renderer.capacityResources.countersBuffer.size).toBe(32);
    expect(renderer.capacityResources.coreIndirectBuffer.size).toBe(48);
    expect(renderer.capacityResources.trailIndirectBuffer.size).toBe(48);
    expect(renderer.capacityResources.readback.size).toBe(16);
    expect(gpu.bindGroupBuffers(renderer.computeBindGroup)).toEqual(expect.arrayContaining([
      renderer.capacityResources.particleBuffer,
      renderer.capacityResources.historyBuffer,
      renderer.capacityResources.activeIndicesBuffer,
      renderer.capacityResources.secondaryIndicesBuffer,
      renderer.capacityResources.freeIndicesBuffer,
      renderer.capacityResources.countersBuffer,
      renderer.capacityResources.coreIndirectBuffer,
      renderer.capacityResources.trailIndirectBuffer,
    ]));
    expect(renderer.renderBindGroups).toHaveLength(3);
    for (const bindGroup of renderer.renderBindGroups) {
      expect(gpu.bindGroupBuffers(bindGroup)).toEqual(expect.arrayContaining([
        renderer.capacityResources.particleBuffer,
        renderer.capacityResources.activeIndicesBuffer,
        renderer.capacityResources.historyBuffer,
      ]));
    }
    expect(renderer.buffers.particles).toBe(renderer.capacityResources.particleBuffer);
    expect(renderer.buffers.activeIndices).toBe(renderer.capacityResources.activeIndicesBuffer);
    expect(renderer.buffers.coreIndirect).toBe(renderer.capacityResources.coreIndirectBuffer);
    for (const resource of capacityBuffers(oldResources)) expect(resource.destroyed).toBe(true);
  });

  test('leaves the active pool untouched when replacement creation fails', async () => {
    const gpu = createFakeGpu();
    const renderer = makeRenderer(gpu, { maxParticles: 2_048 });
    await renderer.init();
    const oldResources = renderer._captureCapacityResources();
    gpu.failNextBufferCreation('fake buffer creation failure');

    await expect(renderer.reconfigureCapacity(8_192)).rejects.toMatchObject({
      code: 'GPU_CAPACITY_REALLOCATION_FAILED',
      message: 'fake buffer creation failure',
    });

    expect(renderer.maxParticles).toBe(2_048);
    expect(renderer.resourceGeneration).toBe(1);
    expect(renderer._captureCapacityResources()).toEqual(oldResources);
    expect(oldResources.particleBuffer.destroyed).toBe(false);
  });

  test('rejects capacity outside the renderer schema without allocating', async () => {
    const gpu = createFakeGpu();
    const renderer = makeRenderer(gpu, { maxParticles: 2_048 });
    await renderer.init();
    const before = gpu.buffers.length;

    await expect(renderer.reconfigureCapacity(511)).rejects.toMatchObject({ code: 'INVALID_PARTICLE_CAPACITY' });
    await expect(renderer.reconfigureCapacity(16_385)).rejects.toMatchObject({ code: 'INVALID_PARTICLE_CAPACITY' });
    await expect(renderer.reconfigureCapacity(2_048.5)).rejects.toMatchObject({ code: 'INVALID_PARTICLE_CAPACITY' });
    expect(gpu.buffers).toHaveLength(before);
  });

  test('checks a queued no-op only after the earlier replacement completes', async () => {
    const gpu = createFakeGpu();
    const renderer = makeRenderer(gpu, { maxParticles: 2_048 });
    await renderer.init();
    const firstCreation = createDeferred();
    const originalCreate = renderer._createCapacityResources.bind(renderer);
    let creationCount = 0;
    renderer._createCapacityResources = async capacity => {
      creationCount += 1;
      if (creationCount === 1) await firstCreation.promise;
      return originalCreate(capacity);
    };

    const first = renderer.reconfigureCapacity(4_096);
    const second = renderer.reconfigureCapacity(2_048);
    await Promise.resolve();
    expect(creationCount).toBe(1);

    firstCreation.resolve();
    await expect(first).resolves.toEqual({ changed: true, generation: 2, maxParticles: 4_096 });
    await expect(second).resolves.toEqual({ changed: true, generation: 3, maxParticles: 2_048 });
    expect(renderer.maxParticles).toBe(2_048);
    expect(renderer.capacityResources.particleBuffer.destroyed).toBe(false);
  });

  test('continues serialized replacements after an allocation rejection', async () => {
    const gpu = createFakeGpu();
    const renderer = makeRenderer(gpu, { maxParticles: 2_048 });
    await renderer.init();
    gpu.failNextBufferCreation('first replacement failed');

    const rejected = renderer.reconfigureCapacity(4_096);
    const recovered = renderer.reconfigureCapacity(8_192);

    await expect(rejected).rejects.toMatchObject({ code: 'GPU_CAPACITY_REALLOCATION_FAILED' });
    await expect(recovered).resolves.toEqual({ changed: true, generation: 2, maxParticles: 8_192 });
    expect(renderer.maxParticles).toBe(8_192);
  });

  test.each(['buffer', 'write', 'bind-group'])(
    'destroys every partial replacement after a later %s failure',
    async failurePoint => {
      const gpu = createFakeGpu();
      const renderer = makeRenderer(gpu, { maxParticles: 2_048 });
      await renderer.init();
      const active = renderer._captureCapacityResources();
      const firstCandidateBuffer = gpu.buffers.length;
      const device = renderer.device;

      if (failurePoint === 'buffer') {
        const createBuffer = device.createBuffer.bind(device);
        let calls = 0;
        device.createBuffer = descriptor => {
          calls += 1;
          if (calls === 4) throw new Error('later buffer failure');
          return createBuffer(descriptor);
        };
      } else if (failurePoint === 'write') {
        const writeBuffer = device.queue.writeBuffer.bind(device.queue);
        let calls = 0;
        device.queue.writeBuffer = (...args) => {
          calls += 1;
          if (calls === 2) throw new Error('later write failure');
          return writeBuffer(...args);
        };
      } else {
        const createBindGroup = device.createBindGroup.bind(device);
        let calls = 0;
        device.createBindGroup = descriptor => {
          calls += 1;
          if (calls === 2) throw new Error('later bind group failure');
          return createBindGroup(descriptor);
        };
      }

      await expect(renderer.reconfigureCapacity(4_096)).rejects.toMatchObject({
        code: 'GPU_CAPACITY_REALLOCATION_FAILED',
      });
      expect(renderer._captureCapacityResources()).toBe(active);
      expect(renderer.resourceGeneration).toBe(1);
      expect(capacityBuffers(active).every(buffer => buffer.destroyed === false)).toBe(true);
      const candidates = gpu.buffers.slice(firstCandidateBuffer);
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates.every(buffer => buffer.destroyed === true)).toBe(true);
    }
  );

  test('does not publish a replacement after the renderer is destroyed', async () => {
    const gpu = createFakeGpu();
    const renderer = makeRenderer(gpu, { maxParticles: 2_048 });
    await renderer.init();
    const pending = createDeferred();
    const originalCreate = renderer._createCapacityResources.bind(renderer);
    renderer._createCapacityResources = async (capacity, device) => {
      await pending.promise;
      return originalCreate(capacity, device);
    };
    const firstCandidateBuffer = gpu.buffers.length;

    const replacement = renderer.reconfigureCapacity(4_096);
    await Promise.resolve();
    renderer.destroy();
    pending.resolve();

    await expect(replacement).rejects.toMatchObject({ code: 'GPU_CAPACITY_REALLOCATION_FAILED' });
    expect(renderer.capacityResources).toBeNull();
    const candidates = gpu.buffers.slice(firstCandidateBuffer);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every(buffer => buffer.destroyed === true)).toBe(true);
  });

  test('defers retiring a capacity bundle until its captured readback releases', async () => {
    const mapPending = createDeferred();
    const gpu = createFakeGpu({ mapAsync: () => mapPending.promise });
    const renderer = makeRenderer(gpu, { maxParticles: 2_048 });
    await renderer.init();
    const oldResources = renderer._captureCapacityResources();
    oldResources.readback.setMappedUint32([0, 37, 9, 0]);
    renderer.readbackPending = true;

    renderer._consumeReadback();
    await Promise.resolve();
    await renderer.reconfigureCapacity(4_096);

    expect(oldResources.readback.destroyed).toBe(false);
    expect(renderer.getMetrics()).toEqual(expect.objectContaining({
      activeParticles: 0,
      droppedParticles: 0,
    }));
    mapPending.resolve();
    await renderer.readbackPromise;
    for (const resource of capacityBuffers(oldResources)) expect(resource.destroyed).toBe(true);
    expect(renderer.capacityResources.readback.destroyed).toBe(false);
    expect(renderer.getMetrics()).toEqual(expect.objectContaining({
      activeParticles: 0,
      droppedParticles: 0,
    }));
  });

  test('releases a retired bundle lease when readback mapping rejects', async () => {
    const mapPending = createDeferred();
    const gpu = createFakeGpu({ mapAsync: () => mapPending.promise });
    const renderer = makeRenderer(gpu, { maxParticles: 2_048 });
    await renderer.init();
    const oldResources = renderer._captureCapacityResources();
    renderer._consumeReadback();
    await renderer.reconfigureCapacity(4_096);
    const readback = renderer.readbackPromise;

    mapPending.reject(new Error('map failed'));
    await readback;

    expect(oldResources.readbackLeases).toBe(0);
    for (const resource of capacityBuffers(oldResources)) expect(resource.destroyed).toBe(true);
  });
});
