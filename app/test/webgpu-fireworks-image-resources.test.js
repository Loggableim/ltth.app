'use strict';

const {
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
});
