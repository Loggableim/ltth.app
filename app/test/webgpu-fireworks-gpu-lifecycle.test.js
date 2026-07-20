'use strict';

const { WebGPUFireworksEngine } = require('../plugins/webgpu-fireworks/gpu/engine');
const {
  createDeferred,
  createFakeGpu,
  makeRenderer,
  restoreGpuGlobals,
  waitForRecovery,
} = require('./helpers/webgpu-fireworks-gpu-harness');

afterEach(() => restoreGpuGlobals());

function makeOwnerRuntime(kind) {
  const runtime = Object.create(WebGPUFireworksEngine.prototype);
  runtime.rendererStatus = { state: 'ready', backend: 'webgpu' };
  runtime.renderer = {
    initialized: true,
    cancelQueuedOwner: jest.fn(),
    getMetrics: jest.fn(() => ({})),
  };
  runtime.audio = {
    getTelemetry: jest.fn(() => ({})),
  };
  runtime.socket = { connected: false, emit: jest.fn() };
  runtime.timelineQueue = [];
  runtime.effectPlans = new Map();
  runtime.activeShows = new Map();
  runtime.finaleQueue = [];
  runtime.finaleIds = new Set();
  runtime.currentFinale = null;
  runtime.currentPreview = null;
  runtime.finalePhase = 'idle';
  runtime.failingFinaleIds = new Set();
  runtime.failingPreviewIds = new Set();
  runtime.transientFrameError = false;
  runtime.updateDebugPanel = jest.fn();
  runtime.emitStatus = jest.fn();
  runtime.showDiagnostic = jest.fn();
  runtime.hideDiagnostic = jest.fn();
  runtime.startNextFinaleIfReady = jest.fn();
  runtime.releaseFinaleEndCard = jest.fn();
  runtime.emitFinaleTelemetry = jest.fn();
  runtime.emitPreviewStatus = jest.fn();
  runtime.getRuntimeNow = jest.fn(() => 2_000);

  if (kind === 'finale') {
    runtime.currentFinale = {
      id: 'finale:42',
      runtimeToken: 'finale:42:g1',
      completionNotification: null,
    };
    runtime.finaleIds.add('finale:42');
    runtime.timelineQueue.push({ type: 'finale-complete', finaleId: 'finale:42' });
  } else {
    runtime.currentPreview = {
      id: 'preview:7',
      requestId: 'preview:7',
      runtimeToken: 'preview:7:g1',
      showPlan: { durationMs: 1_000 },
    };
    runtime.timelineQueue.push({
      type: 'finale-complete',
      runtimeKind: 'preview',
      previewRequestId: 'preview:7',
    });
  }
  return runtime;
}

describe('WebGPU Fireworks generation lifecycle', () => {
  test('scopes exact readback resources and permits one in-flight request per generation', async () => {
    const oldMap = createDeferred();
    const gpu = createFakeGpu({
      mapAsyncSequence: [oldMap.promise, Promise.resolve()],
    });
    const renderer = makeRenderer(gpu);
    await renderer.init();
    const oldResources = renderer.capacityResources;
    const oldCounterReadback = oldResources.readback;
    oldCounterReadback.setMappedUint32([0, 99, 88, 0]);

    const consumeOld = renderer._consumeReadback();
    const oldRequest = oldResources.readbackRequest;
    expect(oldRequest).toMatchObject({
      generation: 1,
      capacityBundle: oldResources,
      counterSource: oldResources.countersBuffer,
      counterReadback: oldCounterReadback,
      timestampSource: null,
      timestampReadback: null,
    });
    expect(oldRequest.release).toEqual(expect.any(Function));

    await renderer.reconfigureCapacity(4_096);
    const newResources = renderer.capacityResources;
    newResources.readback.setMappedUint32([0, 11, 7, 0]);
    const consumeNew = renderer._consumeReadback();

    expect(consumeNew).not.toBe(consumeOld);
    await consumeNew;
    expect(renderer.metrics).toMatchObject({ activeParticles: 11, droppedParticles: 7 });

    oldMap.resolve();
    await consumeOld;

    expect(renderer.metrics).toMatchObject({ activeParticles: 11, droppedParticles: 7 });
    expect(renderer.capacityResources.counterReadbackBuffer).not.toBe(oldCounterReadback);
    expect(oldCounterReadback.unmapCalls).toBe(1);
    expect(oldCounterReadback.destroyed).toBe(true);
    expect(oldResources.inFlightReadbacks).toBe(0);
  });

  test('treats a stale map rejection as obsolete cleanup', async () => {
    const oldMap = createDeferred();
    const gpu = createFakeGpu({ mapAsyncSequence: [oldMap.promise] });
    const states = [];
    const renderer = makeRenderer(gpu, {
      onStatus: status => states.push(status.state),
    });
    await renderer.init();
    const oldResources = renderer.capacityResources;
    const consumeOld = renderer._consumeReadback();
    await renderer.reconfigureCapacity(4_096);

    oldMap.reject(new Error('physical device-loss cleanup'));
    await consumeOld;

    expect(states.at(-1)).toBe('ready');
    expect(oldResources.inFlightReadbacks).toBe(0);
    expect(oldResources.destroyed).toBe(true);
  });

  test('does not publish a map rejection racing the physical device-loss signal', async () => {
    const mapPending = createDeferred();
    const gpu = createFakeGpu({ mapAsyncSequence: [mapPending.promise] });
    const states = [];
    const renderer = makeRenderer(gpu, {
      recoveryDelayMs: 0,
      onStatus: status => states.push(status.state),
    });
    await renderer.init();
    const readback = renderer._consumeReadback();

    mapPending.reject(new Error('device destroyed during map'));
    gpu.loseDevice(0, { reason: 'destroyed', message: 'physical destroy' });
    await readback;
    await waitForRecovery(renderer);

    expect(states).not.toContain('error');
    expect(states.at(-1)).toBe('ready');
  });

  test('does not let obsolete readback cleanup clear a newer generation alias', async () => {
    const oldMap = createDeferred();
    const newMap = createDeferred();
    const gpu = createFakeGpu({
      mapAsyncSequence: [oldMap.promise, newMap.promise],
    });
    const renderer = makeRenderer(gpu);
    await renderer.init();
    const consumeOld = renderer._consumeReadback();
    await renderer.reconfigureCapacity(4_096);
    renderer.capacityResources.readback.setMappedUint32([0, 12, 3, 0]);
    const consumeNew = renderer._consumeReadback();

    expect(renderer.readbackPromise).toBe(consumeNew);
    oldMap.reject(new Error('obsolete map failed'));
    await consumeOld;

    expect(renderer.readbackPromise).toBe(consumeNew);
    expect(renderer.capacityResources.readbackPending).toBe(true);
    newMap.resolve();
    await consumeNew;
    expect(renderer.metrics).toMatchObject({ activeParticles: 12, droppedParticles: 3 });
  });

  test('checks a stale counter generation before mapping its timestamp buffer', async () => {
    const oldCounterMap = createDeferred();
    const gpu = createFakeGpu({
      timestampQuery: true,
      mapAsyncSequence: [oldCounterMap.promise],
    });
    const renderer = makeRenderer(gpu);
    await renderer.init();
    const oldResources = renderer.capacityResources;
    oldResources.readback.setMappedUint32([0, 99, 88, 0]);
    const consumeOld = renderer._consumeReadback();
    await renderer.reconfigureCapacity(4_096);

    oldCounterMap.resolve();
    await consumeOld;

    expect(oldResources.readback.unmapCalls).toBe(1);
    expect(oldResources.timestampReadbackBuffer.mapCalls).toBe(0);
    expect(oldResources.timestampReadbackBuffer.destroyed).toBe(true);
    expect(renderer.metrics).toMatchObject({ activeParticles: 0, droppedParticles: 0 });
  });

  test('unmaps exact current counter and timestamp buffers and reports current failures', async () => {
    const gpu = createFakeGpu({
      timestampQuery: true,
      mapAsyncSequence: [Promise.resolve(), Promise.resolve(), Promise.reject(new Error('current map failed'))],
    });
    const states = [];
    const renderer = makeRenderer(gpu, {
      onStatus: status => states.push(status),
    });
    await renderer.init();
    const resources = renderer.capacityResources;
    resources.readback.setMappedUint32([0, 6, 2, 0]);
    new BigUint64Array(resources.timestampReadbackBuffer.getMappedRange()).set([0n, 2_000_000n]);

    await renderer._consumeReadback();

    expect(resources.readback.unmapCalls).toBe(1);
    expect(resources.timestampReadbackBuffer.unmapCalls).toBe(1);
    expect(renderer.metrics).toMatchObject({
      activeParticles: 6,
      droppedParticles: 2,
      gpuFrameMs: 2,
    });

    await renderer._consumeReadback();
    expect(states.at(-1)).toMatchObject({ state: 'error', reason: 'current map failed' });
    expect(resources.inFlightReadbacks).toBe(0);
    expect(resources.destroyed).toBe(false);
  });

  test('recovers two sequential current-device losses to fresh ready devices', async () => {
    const gpu = createFakeGpu();
    const states = [];
    const renderer = makeRenderer(gpu, {
      recoveryDelayMs: 0,
      onStatus: status => states.push(status.state),
    });
    await renderer.init();

    gpu.loseDevice(0, { reason: 'destroyed', message: 'first' });
    await waitForRecovery(renderer);
    gpu.loseDevice(1, { reason: 'unknown', message: 'second' });
    await waitForRecovery(renderer);

    expect(gpu.devices).toHaveLength(3);
    expect(renderer.device).toBe(gpu.devices[2]);
    expect(renderer.resourceGeneration).toBe(3);
    expect(states.filter(state => state === 'device-lost')).toHaveLength(2);
    expect(states.filter(state => state === 'ready')).toHaveLength(3);
    expect(renderer.recoveryPromise).toBeNull();
    expect(renderer.recoveringDevice).toBeNull();
  });

  test('keeps one device-loss watcher across a capacity generation swap', async () => {
    const gpu = createFakeGpu();
    const renderer = makeRenderer(gpu, {
      maxParticles: 2_048,
      recoveryDelayMs: 0,
    });
    await renderer.init();
    const firstDevice = renderer.device;

    await renderer.reconfigureCapacity(4_096);
    expect(renderer.resourceGeneration).toBe(2);
    expect(renderer.deviceLossWatches.get(firstDevice).size).toBe(1);

    gpu.loseDevice(0, { reason: 'unknown', message: 'lost after capacity swap' });
    await waitForRecovery(renderer);

    expect(gpu.devices).toHaveLength(2);
    expect(renderer.device).toBe(gpu.devices[1]);
    expect(renderer.resourceGeneration).toBe(3);
    expect(renderer.initialized).toBe(true);
  });

  test('publishes device-lost before notifying purged queue owners', async () => {
    const gpu = createFakeGpu();
    const order = [];
    const renderer = makeRenderer(gpu, {
      recoveryDelayMs: 0,
      onStatus: status => {
        if (status.state === 'device-lost') order.push('device-lost');
      },
      onOwnerInvalidated: () => order.push('owner-invalidated'),
    });
    await renderer.init();
    renderer._queueSpawn({
      shape: 2,
      count: 8,
      ownerToken: 'finale:ordered',
    });

    gpu.loseDevice(0, { reason: 'unknown', message: 'ordered loss' });
    await waitForRecovery(renderer);

    expect(order).toEqual(['device-lost', 'owner-invalidated']);
  });

  test('does not reinitialize after explicit destroy during the recovery delay', async () => {
    jest.useFakeTimers();
    try {
      const gpu = createFakeGpu();
      const states = [];
      const renderer = makeRenderer(gpu, {
        recoveryDelayMs: 50,
        onStatus: status => states.push(status.state),
      });
      await renderer.init();

      gpu.loseDevice(0, { reason: 'unknown', message: 'loss before teardown' });
      await Promise.resolve();
      const recovery = renderer.recoveryPromise;
      expect(recovery).toEqual(expect.any(Promise));
      renderer.destroy();
      await jest.advanceTimersByTimeAsync(50);
      await recovery;

      expect(gpu.devices).toHaveLength(1);
      expect(renderer.destroyed).toBe(true);
      expect(renderer.initialized).toBe(false);
      expect(states.filter(state => state === 'ready')).toHaveLength(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test('ignores uncaptured errors emitted by a replaced device', async () => {
    const gpu = createFakeGpu();
    const requestDevice = gpu.adapter.requestDevice.bind(gpu.adapter);
    gpu.adapter.requestDevice = async descriptor => {
      const device = await requestDevice(descriptor);
      device.addEventListener = (type, listener) => {
        if (type === 'uncapturederror') device.uncapturedErrorListener = listener;
      };
      return device;
    };
    const states = [];
    const renderer = makeRenderer(gpu, {
      recoveryDelayMs: 0,
      onStatus: status => states.push(status.state),
    });
    await renderer.init();
    const oldDevice = renderer.device;
    gpu.loseDevice(0, { reason: 'unknown', message: 'replace device' });
    await waitForRecovery(renderer);
    const before = states.length;

    oldDevice.uncapturedErrorListener({ error: new Error('late old-device validation') });

    expect(states).toHaveLength(before);
    expect(states.at(-1)).toBe('ready');
  });

  test('purges only the exact lost generation and cancellation never emits owner invalidation', async () => {
    const gpu = createFakeGpu();
    const onOwnerInvalidated = jest.fn();
    const renderer = makeRenderer(gpu, { onOwnerInvalidated });
    await renderer.init();
    renderer._queueSpawn({ shape: 2, count: 1, ownerToken: 'current-owner' });
    const oldEntry = {
      ...renderer.spawnQueue[0],
      ownerToken: 'old-owner',
      resourceGeneration: renderer.resourceGeneration - 1,
    };
    renderer.spawnQueue.unshift(oldEntry);

    const purged = renderer._invalidateQueuedGeneration(renderer.resourceGeneration);

    expect(purged).toEqual({ dropped: 1, owners: ['current-owner'] });
    expect(renderer.spawnQueue).toEqual([oldEntry]);
    expect(renderer.spawnTelemetry.droppedByReason.staleGeneration).toBe(1);
    expect(onOwnerInvalidated).not.toHaveBeenCalled();

    renderer._queueSpawn({ shape: 3, count: 1, ownerToken: 'cancel-owner' });
    expect(renderer.cancelQueuedOwner('cancel-owner', 'preview-completed')).toBe(1);
    expect(onOwnerInvalidated).not.toHaveBeenCalled();
  });

  test('serializes duplicate loss notifications for one device', async () => {
    const gpu = createFakeGpu();
    const renderer = makeRenderer(gpu, { recoveryDelayMs: 0 });
    await renderer.init();
    const firstDevice = renderer.device;
    const firstGeneration = renderer.resourceGeneration;

    const first = renderer._handleDeviceLost(
      { reason: 'unknown', message: 'first notification' },
      firstDevice,
      firstGeneration
    );
    const duplicate = renderer._handleDeviceLost(
      { reason: 'unknown', message: 'duplicate notification' },
      firstDevice,
      firstGeneration
    );

    expect(duplicate).toBe(first);
    await Promise.all([first, duplicate]);
    expect(gpu.devices).toHaveLength(2);
  });

  test('purges lost-generation queue entries before the first recovered upload', async () => {
    const gpu = createFakeGpu();
    const onOwnerInvalidated = jest.fn();
    const renderer = makeRenderer(gpu, {
      recoveryDelayMs: 0,
      onOwnerInvalidated,
    });
    await renderer.init();
    renderer._queueSpawn({
      shape: 2,
      count: 8,
      ownerToken: 'finale:42',
      expiresAtMs: 10_000,
    });
    renderer._queueSpawn({
      shape: 3,
      count: 4,
      ownerToken: 'finale:42',
      expiresAtMs: 10_000,
    });
    expect(renderer.spawnQueue).toHaveLength(2);

    gpu.loseDevice(0, { reason: 'unknown', message: 'lost' });
    await waitForRecovery(renderer);
    renderer._uploadSpawnCommands(2_000);

    expect(renderer.spawnQueue).toEqual([]);
    expect(renderer.spawnTelemetry.droppedByReason.staleGeneration).toBe(2);
    expect(gpu.latestQueueWriteFor('spawn')).toBeNull();
    expect(onOwnerInvalidated).toHaveBeenCalledTimes(1);
    expect(onOwnerInvalidated).toHaveBeenCalledWith('finale:42', 'device-lost');
  });

  test.each([
    ['finale', 'finale:42:g1'],
    ['preview', 'preview:7:g1'],
  ])('device loss invalidates an active %s owner and stale completion cannot succeed', (kind, ownerToken) => {
    const runtime = makeOwnerRuntime(kind);
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      expect(runtime.handleGpuOwnerInvalidated(ownerToken, 'device-lost')).toBe(true);
      expect(runtime.renderer.cancelQueuedOwner).toHaveBeenCalledWith(ownerToken, 'device-lost');
      if (kind === 'finale') {
        expect(runtime.currentFinale).toBeNull();
        expect(runtime.completeFinale('finale:42', 2_100)).toBe(false);
        expect(runtime.finishFinaleVisuals('finale:42', 2_100)).toBe(false);
      } else {
        expect(runtime.currentPreview).toBeNull();
        expect(runtime.completePreview('preview:7', 2_100)).toBe(false);
        expect(runtime.emitPreviewStatus).toHaveBeenCalledTimes(1);
        expect(runtime.emitPreviewStatus).toHaveBeenCalledWith(
          expect.objectContaining({ requestId: 'preview:7' }),
          'failed',
          expect.objectContaining({ reason: 'device-lost' })
        );
      }
    } finally {
      consoleError.mockRestore();
    }
  });
});
