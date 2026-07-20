const harness = require('./helpers/webgpu-fireworks-gpu-harness');

const {
  createDeferred,
  createFakeGpu,
  makeRenderer,
  restoreGpuGlobals,
  waitForRecovery,
} = harness;

const OWNED_GLOBALS = [
  'GPUBufferUsage',
  'GPUTextureUsage',
  'GPUShaderStage',
  'GPUMapMode',
  'OffscreenCanvas',
];

function restoreDescriptor(target, name, descriptor) {
  if (descriptor) Object.defineProperty(target, name, descriptor);
  else delete target[name];
}

afterEach(() => {
  restoreGpuGlobals();
  jest.useRealTimers();
});

describe('WebGPU Fireworks GPU harness', () => {
  test('exports exactly the reusable five-function contract', () => {
    expect(Object.keys(harness).sort()).toEqual([
      'createDeferred',
      'createFakeGpu',
      'makeRenderer',
      'restoreGpuGlobals',
      'waitForRecovery',
    ]);
    for (const value of Object.values(harness)) expect(typeof value).toBe('function');
  });

  test('records resources, submissions, destruction, and deferred maps', async () => {
    const deferred = createDeferred();
    const gpu = createFakeGpu({ mapAsync: () => deferred.promise });
    const renderer = makeRenderer(gpu, { maxParticles: 512 });

    await renderer.init();
    gpu.submissions.length = 0;
    const probeSubmission = { kind: 'probe' };
    gpu.devices[0].queue.submit([probeSubmission]);
    const buffer = gpu.buffers[0];
    const mapPromise = buffer.mapAsync(GPUMapMode.READ);
    deferred.resolve();
    await mapPromise;

    expect(renderer.maxParticles).toBe(512);
    expect(gpu.devices).toHaveLength(1);
    expect(gpu.submissions).toEqual([[probeSubmission]]);
    expect(buffer.mapCalls).toBe(1);
    buffer.setMappedUint32([13, 21]);
    expect(Array.from(new Uint32Array(buffer.getMappedRange()).slice(0, 2))).toEqual([13, 21]);
    buffer.unmap();
    expect(buffer.unmapCalls).toBe(1);
    buffer.destroy();
    expect(buffer.destroyed).toBe(true);
  });

  test('restores exact owned-global and navigator.gpu descriptors idempotently', () => {
    const globalDescriptors = new Map(OWNED_GLOBALS.map(name => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ]));
    const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    const previousNavigator = globalThis.navigator;
    const previousGpuDescriptor = Object.getOwnPropertyDescriptor(previousNavigator, 'gpu');
    const sentinelGetter = () => undefined;

    try {
      Object.defineProperty(globalThis, 'GPUBufferUsage', {
        configurable: true,
        enumerable: false,
        writable: false,
        value: undefined,
      });
      delete globalThis.GPUTextureUsage;
      Object.defineProperty(previousNavigator, 'gpu', {
        configurable: true,
        enumerable: false,
        get: sentinelGetter,
      });
      const expectedBufferDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'GPUBufferUsage');
      const expectedGpuDescriptor = Object.getOwnPropertyDescriptor(previousNavigator, 'gpu');
      const gpu = createFakeGpu();

      makeRenderer(gpu);
      expect(globalThis.navigator).toBe(previousNavigator);
      expect(globalThis.navigator.gpu).toBe(gpu);
      restoreGpuGlobals();
      restoreGpuGlobals();

      expect(globalThis.navigator).toBe(previousNavigator);
      expect(Object.getOwnPropertyDescriptor(globalThis, 'navigator')).toEqual(navigatorDescriptor);
      expect(Object.getOwnPropertyDescriptor(previousNavigator, 'gpu')).toEqual(expectedGpuDescriptor);
      expect(Object.getOwnPropertyDescriptor(globalThis, 'GPUBufferUsage')).toEqual(expectedBufferDescriptor);
      expect(Object.prototype.hasOwnProperty.call(globalThis, 'GPUTextureUsage')).toBe(false);
    } finally {
      restoreGpuGlobals();
      for (const [name, descriptor] of globalDescriptors) restoreDescriptor(globalThis, name, descriptor);
      restoreDescriptor(previousNavigator, 'gpu', previousGpuDescriptor);
      restoreDescriptor(globalThis, 'navigator', navigatorDescriptor);
    }
  });

  test('removes the temporary navigator created when navigator was absent', () => {
    const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    const previousNavigator = globalThis.navigator;

    try {
      delete globalThis.navigator;
      expect(Object.prototype.hasOwnProperty.call(globalThis, 'navigator')).toBe(false);
      const gpu = createFakeGpu();
      makeRenderer(gpu);
      expect(globalThis.navigator).not.toBe(previousNavigator);
      expect(globalThis.navigator.gpu).toBe(gpu);

      restoreGpuGlobals();
      restoreGpuGlobals();
      expect(Object.prototype.hasOwnProperty.call(globalThis, 'navigator')).toBe(false);
    } finally {
      restoreGpuGlobals();
      restoreDescriptor(globalThis, 'navigator', navigatorDescriptor);
    }
  });

  test('does not monkey-patch global timers', () => {
    const timerNames = ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'];
    const timerDescriptors = new Map(timerNames.map(name => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ]));
    const timerValues = new Map(timerNames.map(name => [name, globalThis[name]]));

    try {
      makeRenderer(createFakeGpu());
      for (const name of timerNames) {
        expect(globalThis[name]).toBe(timerValues.get(name));
        expect(Object.getOwnPropertyDescriptor(globalThis, name)).toEqual(timerDescriptors.get(name));
      }
    } finally {
      restoreGpuGlobals();
      for (const [name, descriptor] of timerDescriptors) restoreDescriptor(globalThis, name, descriptor);
    }
  });

  test.each([
    [{ unsupported: true }, /unsupported fake GPU option: unsupported/],
    [{ mapAsync: true }, /mapAsync must be a function/],
    [{ mapAsyncSequence: {} }, /mapAsyncSequence must be an array/],
    [{ timestampQuery: 'yes' }, /timestampQuery must be a boolean/],
  ])('rejects unsupported or mistyped options %#', (options, message) => {
    expect(() => createFakeGpu(options)).toThrow(message);
  });

  test('rejects simultaneous map controls', () => {
    expect(() => createFakeGpu({
      mapAsync: () => Promise.resolve(),
      mapAsyncSequence: [],
    })).toThrow('mapAsync and mapAsyncSequence are mutually exclusive');
  });

  test('passes the exact buffer and map arguments to the map callback', async () => {
    const expectedPromise = Promise.resolve('mapped');
    const mapAsync = jest.fn(() => expectedPromise);
    const gpu = createFakeGpu({ mapAsync });
    const device = await gpu.adapter.requestDevice();
    const buffer = device.createBuffer({ label: 'map-callback', size: 16, usage: 1 });

    const actualPromise = buffer.mapAsync(1, 4, 8);

    expect(actualPromise).toBe(expectedPromise);
    expect(mapAsync).toHaveBeenCalledWith(buffer, 1, 4, 8);
    await actualPromise;
  });

  test('returns FIFO map promises unchanged and rejects deterministic exhaustion', async () => {
    const first = Promise.resolve('first');
    const second = Promise.resolve('second');
    const gpu = createFakeGpu({ mapAsyncSequence: [first, second] });
    const device = await gpu.adapter.requestDevice();
    const firstBuffer = device.createBuffer({ label: 'first-map', size: 4, usage: 1 });
    const secondBuffer = device.createBuffer({ label: 'second-map', size: 4, usage: 1 });

    expect(firstBuffer.mapAsync(1)).toBe(first);
    expect(secondBuffer.mapAsync(1)).toBe(second);
    await expect(firstBuffer.mapAsync(1)).rejects.toThrow('fake mapAsync sequence exhausted');
  });

  test.each([true, false])('exposes timestamp-query features only when enabled=%s', async enabled => {
    const gpu = createFakeGpu({ timestampQuery: enabled });
    const device = await gpu.adapter.requestDevice();

    expect(gpu.adapter.features.has('timestamp-query')).toBe(enabled);
    expect(device.features.has('timestamp-query')).toBe(enabled);
  });

  test('loses only the selected device and fails buffer creation once', async () => {
    const gpu = createFakeGpu();
    const firstDevice = await gpu.adapter.requestDevice();
    const secondDevice = await gpu.adapter.requestDevice();
    const lossInfo = { reason: 'destroyed', message: 'second device lost' };
    let firstLost = false;
    firstDevice.lost.then(() => { firstLost = true; });

    gpu.loseDevice(1, lossInfo);
    await expect(secondDevice.lost).resolves.toBe(lossInfo);
    await Promise.resolve();
    expect(firstLost).toBe(false);
    expect(() => gpu.loseDevice(2)).toThrow('fake device 2 does not exist');

    gpu.failNextBufferCreation('one-shot buffer failure');
    expect(() => firstDevice.createBuffer({ size: 4, usage: 1 })).toThrow('one-shot buffer failure');
    expect(firstDevice.createBuffer({ label: 'after-failure', size: 4, usage: 1 })).toMatchObject({
      label: 'after-failure',
      destroyed: false,
    });
  });

  test('inspects queue writes, resources, shaders, bind groups, and sync pipelines', async () => {
    const gpu = createFakeGpu();
    const device = await gpu.adapter.requestDevice();
    const spawnBuffer = device.createBuffer({ label: 'fireworks-spawn-buffer', size: 16, usage: 1 });
    const otherBuffer = device.createBuffer({ label: 'other-buffer', size: 16, usage: 1 });
    const bindGroup = device.createBindGroup({
      entries: [
        { binding: 0, resource: { buffer: spawnBuffer } },
        { binding: 1, resource: { buffer: otherBuffer } },
        { binding: 2, resource: { sampler: true } },
      ],
    });
    const upload = new Uint32Array([3, 5, 8]);
    device.queue.writeBuffer(spawnBuffer, 0, upload);
    device.queue.writeTexture({ texture: 'atlas' }, upload, { bytesPerRow: 256 }, [1, 1, 1]);
    const textureDescriptor = { label: 'fireworks-bloom-a', size: [8, 8, 1], format: 'rgba16float' };
    device.createTexture(textureDescriptor);
    device.createTexture({ label: 'fireworks-scene', size: [8, 8, 1] });
    device.createShaderModule({ label: 'fireworks-test-wgsl', code: '@compute fn main() {}' });
    const syncPipeline = device.createRenderPipeline({ label: 'fireworks-sync-pipeline' });
    await device.createComputePipelineAsync({ compute: { entryPoint: 'computeMain' } });
    await device.createRenderPipelineAsync({
      vertex: { entryPoint: 'vertexMain' },
      fragment: { entryPoint: 'fragmentMain' },
    });

    expect(gpu.bindGroupBuffers(bindGroup)).toEqual([spawnBuffer, otherBuffer]);
    expect(gpu.latestQueueWriteFor('spawn')).toMatchObject({ buffer: spawnBuffer, bufferOffset: 0 });
    expect(gpu.latestQueueWriteFor('missing')).toBeNull();
    expect(gpu.queueWrites.find(write => write.kind === 'writeTexture')).toMatchObject({
      destination: { texture: 'atlas' },
      dataLayout: { bytesPerRow: 256 },
      size: [1, 1, 1],
    });
    expect(gpu.texturesNamed('bloom')).toHaveLength(1);
    expect(gpu.textureDescriptor('fireworks-bloom-a')).toBe(textureDescriptor);
    expect(gpu.shaderCode('fireworks-test-wgsl')).toBe('@compute fn main() {}');
    expect(syncPipeline).toMatchObject({ type: 'render', descriptor: { label: 'fireworks-sync-pipeline' } });
    expect(gpu.pipelineLabels()).toEqual([
      'fireworks-sync-pipeline',
      'computeMain',
      'vertexMain',
      'fragmentMain',
    ]);
  });

  test('isolates semantic inspection to the most recently closed render window', async () => {
    const gpu = createFakeGpu({ timestampQuery: true });
    const renderer = makeRenderer(gpu, { maxParticles: 512 });
    await renderer.init();
    const queue = gpu.devices[0].queue;
    queue.submit([{ kind: 'before-first-render' }]);
    renderer.lastReadbackAt = -Infinity;

    renderer.render(1 / 60);

    expect(gpu.framePassNames()).toEqual([
      'compute',
      'scene',
      'bloom-down',
      'bloom-up',
      'composite',
    ]);
    expect(gpu.firstTimestamp()).toMatchObject({ queryIndex: 0, position: 'before-first-compute' });
    expect(gpu.lastTimestamp()).toMatchObject({ queryIndex: 1 });
    expect(gpu.resolveQueryCalls()).toEqual([{ firstQuery: 0, queryCount: 2 }]);

    await Promise.resolve();
    await Promise.resolve();
    queue.submit([{ kind: 'between-renders' }]);
    renderer.bloomEnabled = false;
    renderer.render(1 / 60);

    expect(gpu.framePassNames()).toEqual(['compute', 'scene', 'composite']);
    expect(gpu.firstTimestamp()).toMatchObject({ queryIndex: 0 });
    expect(gpu.lastTimestamp()).toMatchObject({ queryIndex: 1 });
  });

  test('initializes its atlas with the minimal OffscreenCanvas API and no document', async () => {
    const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');

    try {
      delete globalThis.document;
      const renderer = makeRenderer(createFakeGpu(), { maxParticles: 512 });
      const atlasCanvas = new globalThis.OffscreenCanvas(32, 32);
      const context = atlasCanvas.getContext('2d');
      for (const method of [
        'clearRect', 'beginPath', 'ellipse', 'arc', 'fill', 'drawImage',
        'save', 'rect', 'clip', 'restore',
      ]) {
        expect(typeof context[method]).toBe('function');
      }
      context.fillStyle = '#ffffff';
      expect(context.fillStyle).toBe('#ffffff');

      await expect(renderer.init()).resolves.toBe(true);
      expect(Object.prototype.hasOwnProperty.call(globalThis, 'document')).toBe(false);
    } finally {
      restoreGpuGlobals();
      restoreDescriptor(globalThis, 'document', documentDescriptor);
    }
  });

  test('waitForRecovery yields, reads once, and awaits the exact recovery promise', async () => {
    const deferred = createDeferred();
    let reads = 0;
    const renderer = {};
    Object.defineProperty(renderer, 'recoveryPromise', {
      configurable: true,
      get() {
        reads += 1;
        return deferred.promise;
      },
    });

    const waiting = waitForRecovery(renderer);
    expect(reads).toBe(0);
    await Promise.resolve();
    expect(reads).toBe(1);
    deferred.resolve('recovered');
    await expect(waiting).resolves.toBeUndefined();
    expect(reads).toBe(1);
  });

  test('waitForRecovery rejects when no recovery promise exists', async () => {
    await expect(waitForRecovery({})).rejects.toThrow('renderer.recoveryPromise is required');
  });
});
