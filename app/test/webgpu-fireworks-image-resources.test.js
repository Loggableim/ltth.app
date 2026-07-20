'use strict';

const {
  createDeferred,
  createFakeGpu,
  makeRenderer,
  restoreGpuGlobals,
} = require('./helpers/webgpu-fireworks-gpu-harness');
const { WebGPUFireworksEngine } = require('../plugins/webgpu-fireworks/gpu/engine');

afterEach(() => restoreGpuGlobals());

describe('WebGPU Fireworks image resource lifecycle', () => {
  test('reuses an expired least-recently-used external slot after 63 live keys', async () => {
    let nowMs = 1_000;
    const gpu = createFakeGpu();
    const renderer = makeRenderer(gpu, { now: () => nowMs });
    await renderer.init();

    const first = await renderer.uploadImage('image-0', { key: 'image-0' });
    for (let index = 1; index < 63; index += 1) {
      await renderer.uploadImage(`image-${index}`, { key: `image-${index}` });
    }
    renderer._markAtlasTextureUsed(first, { nowMs, visibleUntilMs: nowMs + 10 });
    nowMs += 11;

    const reused = await renderer.uploadImage('image-63', { key: 'image-63' });

    expect(first).toBeGreaterThan(1);
    expect(reused).toBe(first);
    expect(renderer.atlasEntries.size).toBe(63);
    expect(renderer.atlasEntries.has('image-0')).toBe(false);
    expect(renderer.atlasEntries.has('image-63')).toBe(true);
  });

  test('does not evict a slot while its last submitted effect can still sample it', async () => {
    let nowMs = 5_000;
    const renderer = makeRenderer(createFakeGpu(), { now: () => nowMs });
    await renderer.init();
    const pinned = await renderer.uploadImage('pinned', { key: 'pinned' });
    renderer._markAtlasTextureUsed(pinned, { nowMs, visibleUntilMs: 9_000 });
    for (let index = 0; index < 62; index += 1) {
      const textureIndex = await renderer.uploadImage(`other-${index}`, { key: `other-${index}` });
      renderer._markAtlasTextureUsed(textureIndex, { nowMs, visibleUntilMs: 9_000 });
    }

    const fallback = await renderer.uploadImage('overflow', { key: 'overflow' });

    expect(fallback).toBe(0);
    expect(renderer.atlasEntries.get('pinned').textureIndex).toBe(pinned);
  });

  test('removes a rejected image promise so the same URL can retry', async () => {
    const attempts = [];
    const engine = Object.create(WebGPUFireworksEngine.prototype);
    engine.imageCache = new Map();
    engine.imageCacheLimit = 64;
    engine.imageLoadTimeoutMs = 20;
    engine._fetchImageSource = (url) => {
      attempts.push(url);
      return attempts.length === 1
        ? Promise.reject(new Error('decode failed'))
        : Promise.resolve({ url });
    };
    engine._decodeImageSource = async (source) => ({ source, close: jest.fn() });

    await expect(engine.loadImage('/same.png')).rejects.toThrow('decode failed');
    await expect(engine.loadImage('/same.png')).resolves.toBeDefined();

    expect(attempts).toEqual(['/same.png', '/same.png']);
    expect(engine.imageCache.size).toBe(1);
  });

  test('removes a timed-out source promise so the same URL can retry', async () => {
    jest.useFakeTimers();
    try {
      let attempts = 0;
      const engine = Object.create(WebGPUFireworksEngine.prototype);
      engine.imageCache = new Map();
      engine.imageCacheLimit = 64;
      engine.imageLoadTimeoutMs = 20;
      engine._fetchImageSource = (url) => {
        attempts += 1;
        return attempts === 1 ? new Promise(() => {}) : Promise.resolve({ url });
      };

      const first = engine.loadImage('/slow.png');
      const timedOut = expect(first).rejects.toThrow(/timed out/i);
      await jest.advanceTimersByTimeAsync(21);
      await timedOut;
      await expect(engine.loadImage('/slow.png')).resolves.toEqual({ url: '/slow.png' });

      expect(attempts).toBe(2);
      expect(engine.imageCache.size).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test('bounds successful image promises and closes decoded images after upload', async () => {
    const renderer = { uploadImage: jest.fn().mockResolvedValue(2) };
    const engine = Object.create(WebGPUFireworksEngine.prototype);
    engine.renderer = renderer;
    engine.config = {};
    engine.imageCache = new Map();
    engine.imageCacheLimit = 64;
    engine.imageLoadTimeoutMs = 100;
    engine._fetchImageSource = async (url) => ({ url });
    engine._decodeImageSource = async (source) => ({ source, close: jest.fn() });

    for (let index = 0; index < 100; index += 1) {
      await engine.prepareImages({ giftImage: `/asset-${index}.png` });
    }

    expect(engine.imageCache.size).toBeLessThanOrEqual(64);
    for (const [, image] of renderer.uploadImage.mock.calls) {
      expect(image.close).toHaveBeenCalledTimes(1);
    }
  });

  test('keeps the cache bounded when all 64 existing source requests are pending', async () => {
    jest.useFakeTimers();
    try {
      const engine = Object.create(WebGPUFireworksEngine.prototype);
      engine.imageCache = new Map();
      engine.imageCacheLimit = 64;
      engine.imageLoadTimeoutMs = 100_000;
      engine._fetchImageSource = jest.fn((url) => (
        url === '/overflow.png' ? Promise.resolve({ url }) : new Promise(() => {})
      ));

      for (let index = 0; index < 64; index += 1) {
        void engine.loadImage(`/pending-${index}.png`);
      }
      await expect(engine.loadImage('/overflow.png')).resolves.toEqual({ url: '/overflow.png' });

      expect(engine.imageCache.size).toBe(64);
      expect(engine.imageCache.has('/overflow.png')).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  test('uses a single atlas mip and explicit level-zero sampling', async () => {
    const gpu = createFakeGpu();
    const renderer = makeRenderer(gpu);
    await renderer.init();

    expect(gpu.textureDescriptor('fireworks-atlas').mipLevelCount).toBe(1);
    const particleShader = gpu.shaderCode('fireworks-particle-wgsl');
    expect(particleShader).toContain('textureSampleLevel(atlasTexture, atlasSampler, atlasUv, 0.0)');
    expect(particleShader).not.toContain('textureSampleGrad(atlasTexture');
  });

  test('does not roll back a successful upload when an earlier upload fails late', async () => {
    const renderer = makeRenderer(createFakeGpu());
    await renderer.init();
    const firstCopy = createDeferred();
    renderer._writeAtlasImage = jest.fn((slot, key) => (
      key === 'first' ? firstCopy.promise : Promise.resolve()
    ));

    const firstUpload = renderer.uploadImage('first', { key: 'first' });
    await Promise.resolve();
    const secondIndex = await renderer.uploadImage('second', { key: 'second' });
    const firstRejected = expect(firstUpload).rejects.toThrow('first copy failed');
    firstCopy.reject(new Error('first copy failed'));
    await firstRejected;

    expect(renderer.atlasEntries.get('second').textureIndex).toBe(secondIndex);
    expect(renderer.atlasSlotOwners[secondIndex - 1]).toBe('second');
  });

  test('shares a pending same-key upload without exposing its index before the copy completes', async () => {
    const renderer = makeRenderer(createFakeGpu());
    await renderer.init();
    const copy = createDeferred();
    renderer._writeAtlasImage = jest.fn(() => copy.promise);

    const first = renderer.uploadImage('shared', { key: 'shared-a' });
    await Promise.resolve();
    let secondSettled = false;
    const second = renderer.uploadImage('shared', { key: 'shared-b' })
      .then(value => {
        secondSettled = true;
        return value;
      });
    await Promise.resolve();

    expect(secondSettled).toBe(false);
    expect(renderer._writeAtlasImage).toHaveBeenCalledTimes(1);

    copy.resolve();
    await expect(second).resolves.toBe(await first);
  });

  test('ignores an old upload completion after atlas recovery resets ownership', async () => {
    const renderer = makeRenderer(createFakeGpu());
    await renderer.init();
    const copy = createDeferred();
    renderer._writeAtlasImage = jest.fn(() => copy.promise);

    const oldUpload = renderer.uploadImage('old', { key: 'old' });
    await Promise.resolve();
    await renderer._initializeAtlas();
    copy.resolve();

    await expect(oldUpload).resolves.toBe(0);
    expect(renderer.atlasEntries.size).toBe(0);
    expect(renderer.atlasSlotOwners.slice(1).every(owner => owner === null)).toBe(true);
  });

  test('keeps never-used uploaded slots pinned under later atlas pressure', async () => {
    let nowMs = 1_000;
    const renderer = makeRenderer(createFakeGpu(), { now: () => nowMs });
    await renderer.init();
    const first = await renderer.uploadImage('never-used-0', { key: 'never-used-0' });
    for (let index = 1; index < 63; index += 1) {
      await renderer.uploadImage(`never-used-${index}`, { key: `never-used-${index}` });
    }
    nowMs += 60_000;

    const overflow = await renderer.uploadImage('pressure', { key: 'pressure' });

    expect(overflow).toBe(0);
    expect(renderer.atlasEntries.get('never-used-0').textureIndex).toBe(first);
    expect(renderer.atlasEntries.has('pressure')).toBe(false);
  });

  test('recycles an awaiting slot only after first use is marked and its deadline expires', async () => {
    let nowMs = 1_000;
    const renderer = makeRenderer(createFakeGpu(), { now: () => nowMs });
    await renderer.init();
    const first = await renderer.uploadImage('released-0', { key: 'released-0' });
    for (let index = 1; index < 63; index += 1) {
      await renderer.uploadImage(`awaiting-${index}`, { key: `awaiting-${index}` });
    }
    nowMs += 60_000;
    renderer._markAtlasTextureUsed(first, { nowMs, visibleUntilMs: nowMs + 10 });
    nowMs += 11;

    const reused = await renderer.uploadImage('after-first-use', { key: 'after-first-use' });

    expect(reused).toBe(first);
    expect(renderer.atlasEntries.has('released-0')).toBe(false);
    expect(renderer.atlasEntries.has('after-first-use')).toBe(true);
  });

  test('decodes a fresh owned drawable for each cached source use', async () => {
    const source = { width: 8, height: 8, close: jest.fn() };
    const drawables = [
      { id: 'drawable-1', close: jest.fn() },
      { id: 'drawable-2', close: jest.fn() }
    ];
    const engine = Object.create(WebGPUFireworksEngine.prototype);
    engine.renderer = { uploadImage: jest.fn().mockResolvedValue(2) };
    engine.config = {};
    engine.imageCache = new Map();
    engine.imageCacheLimit = 64;
    engine.imageLoadTimeoutMs = 100;
    engine._fetchImageSource = jest.fn().mockResolvedValue(source);
    engine._decodeImageSource = jest.fn()
      .mockResolvedValueOnce(drawables[0])
      .mockResolvedValueOnce(drawables[1]);

    await engine.prepareImages({ giftImage: '/cached-source.png' });
    await engine.prepareImages({ giftImage: '/cached-source.png' });

    expect(engine._fetchImageSource).toHaveBeenCalledTimes(1);
    expect(engine._decodeImageSource).toHaveBeenNthCalledWith(1, source);
    expect(engine._decodeImageSource).toHaveBeenNthCalledWith(2, source);
    expect(engine.renderer.uploadImage.mock.calls.map(([, image]) => image)).toEqual(drawables);
    expect(drawables[0].close).toHaveBeenCalledTimes(1);
    expect(drawables[1].close).toHaveBeenCalledTimes(1);
    expect(source.close).not.toHaveBeenCalled();
  });

  test('aborts an async replacement when its reserved owner is re-pinned before publication', async () => {
    let nowMs = 1_000;
    const renderer = makeRenderer(createFakeGpu(), { now: () => nowMs });
    await renderer.init();
    const textureIndices = [];
    for (let index = 0; index < 63; index += 1) {
      const textureIndex = await renderer.uploadImage(`used-${index}`, { key: `used-${index}` });
      textureIndices.push(textureIndex);
      renderer._markAtlasTextureUsed(textureIndex, { nowMs, visibleUntilMs: nowMs + 10 });
    }
    nowMs += 11;
    const copy = createDeferred();
    renderer._writeAtlasImage = jest.fn(() => copy.promise);

    const replacement = renderer.uploadImage('replacement', { key: 'replacement' });
    await Promise.resolve();
    const reservedTextureIndex = textureIndices[0];
    renderer._markAtlasTextureUsed(reservedTextureIndex, {
      nowMs,
      visibleUntilMs: nowMs + 10_000
    });
    copy.resolve();

    await expect(replacement).resolves.toBe(0);
    expect(renderer.atlasEntries.get('used-0').textureIndex).toBe(reservedTextureIndex);
    expect(renderer.atlasSlotOwners[reservedTextureIndex - 1]).toBe('used-0');
    expect(renderer.atlasEntries.has('replacement')).toBe(false);
  });
});
