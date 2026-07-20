const {
  createDeferred,
  createFakeGpu,
  makeRenderer,
  restoreGpuGlobals,
} = require('./helpers/webgpu-fireworks-gpu-harness');

afterEach(() => restoreGpuGlobals());

describe('WebGPU Fireworks GPU harness', () => {
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
    buffer.destroy();
    expect(buffer.destroyed).toBe(true);
  });

  test('restores the exact navigator.gpu property installed by makeRenderer', () => {
    const previousNavigator = globalThis.navigator;
    const hadGpu = Boolean(previousNavigator) && Object.prototype.hasOwnProperty.call(previousNavigator, 'gpu');
    const previousGpu = previousNavigator?.gpu;
    const gpu = createFakeGpu();
    makeRenderer(gpu);

    expect(globalThis.navigator.gpu).toBe(gpu);
    restoreGpuGlobals();

    expect(globalThis.navigator).toBe(previousNavigator);
    if (previousNavigator) {
      expect(Object.prototype.hasOwnProperty.call(previousNavigator, 'gpu')).toBe(hadGpu);
      expect(previousNavigator.gpu).toBe(previousGpu);
    }
  });
});
