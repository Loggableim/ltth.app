'use strict';

const { WebGPUFireworksEngine } = require('../plugins/webgpu-fireworks/gpu/engine');
const { createDeferred } = require('./helpers/webgpu-fireworks-gpu-harness');

const FIRST_SESSION = '11111111-1111-4111-8111-111111111111';
const SECOND_SESSION = '22222222-2222-4222-8222-222222222222';

function createClient(search = '') {
  const previous = {
    document: global.document,
    io: global.io,
    requestAnimationFrame: global.requestAnimationFrame,
    window: global.window
  };
  const handlers = new Map();
  const socket = {
    connected: true,
    emit: jest.fn(),
    on: jest.fn((event, handler) => handlers.set(event, handler)),
    disconnect: jest.fn()
  };
  const canvas = {
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    getBoundingClientRect: jest.fn(() => ({ left: 0, top: 0, width: 1000, height: 500 }))
  };

  global.window = {
    location: { search },
    addEventListener: jest.fn(),
    removeEventListener: jest.fn()
  };
  global.document = {
    visibilityState: 'visible',
    getElementById: jest.fn(id => id === 'fireworks-canvas' ? canvas : null)
  };
  global.io = jest.fn(() => socket);
  global.requestAnimationFrame = jest.fn(() => 1);

  const engine = new WebGPUFireworksEngine('fireworks-canvas');
  engine.audio.ensureContext = jest.fn().mockResolvedValue(false);
  engine.audio.setEnabled = jest.fn();
  engine.audio.setVolume = jest.fn();
  engine.audio.setCrackleVolume = jest.fn();
  engine.audio.useUrl = jest.fn();
  engine.startNextFinaleIfReady = jest.fn();
  engine.handleIncomingTrigger = jest.fn();
  engine.handleFinaleSocketEvent = jest.fn();
  engine.handlePreviewSocketEvent = jest.fn();
  engine.showFollowerAnimation = jest.fn();
  engine.resetAdaptivePerformanceState = jest.fn();
  engine.resize = jest.fn();
  engine.applyQuality = jest.fn();
  engine.applyInteractiveMode = jest.fn();
  engine.updateDebugPanel = jest.fn();
  engine.connectSocket();

  return {
    canvas,
    engine,
    socket,
    connect() {
      handlers.get('connect')();
    },
    receive(event, payload, acknowledge) {
      const handler = handlers.get(event);
      expect(handler).toBeDefined();
      return handler(payload, acknowledge);
    },
    restore() {
      for (const [name, value] of Object.entries(previous)) {
        if (value === undefined) delete global[name];
        else global[name] = value;
      }
    }
  };
}

describe('WebGPU Fireworks benchmark overlay client isolation', () => {
  test('acknowledges maxTotalParticles only after the renderer uses that capacity', async () => {
    const pending = createDeferred();
    const renderer = {
      initialized: true,
      maxParticles: 2_048,
      reconfigureCapacity: jest.fn(() => pending.promise),
    };
    const client = createClient('');
    try {
      client.engine.renderer = renderer;
      client.engine.config.maxTotalParticles = 2_048;
      const acknowledge = jest.fn();

      const invocation = client.receive('webgpu-fireworks:config-update', {
        config: { maxTotalParticles: 8_192 },
      }, acknowledge);
      await Promise.resolve();
      expect(acknowledge).not.toHaveBeenCalled();
      expect(client.engine.config.maxTotalParticles).toBe(2_048);
      expect(renderer.reconfigureCapacity).toHaveBeenCalledWith(8_192);

      renderer.maxParticles = 8_192;
      pending.resolve({ changed: true, generation: 2, maxParticles: 8_192 });
      await invocation;

      expect(client.engine.config.maxTotalParticles).toBe(8_192);
      expect(acknowledge).toHaveBeenCalledWith({
        accepted: true,
        benchmarkSessionId: null,
        applied: true,
      });
    } finally {
      client.restore();
    }
  });

  test('returns a stable error and preserves config when capacity replacement fails', async () => {
    const renderer = {
      initialized: true,
      maxParticles: 2_048,
      reconfigureCapacity: jest.fn().mockRejectedValue(Object.assign(new Error('allocation failed'), {
        code: 'GPU_CAPACITY_REALLOCATION_FAILED',
      })),
    };
    const client = createClient('');
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      client.engine.renderer = renderer;
      client.engine.config.maxTotalParticles = 2_048;
      const acknowledge = jest.fn();

      await client.receive('webgpu-fireworks:config-update', {
        config: { maxTotalParticles: 8_192 },
      }, acknowledge);

      expect(client.engine.config.maxTotalParticles).toBe(2_048);
      expect(acknowledge).toHaveBeenCalledWith({
        accepted: false,
        benchmarkSessionId: null,
        reason: 'gpu-capacity-reallocation-failed',
      });
      expect(consoleError).toHaveBeenCalledTimes(1);
      expect(consoleError).toHaveBeenCalledWith(
        '[WebGPU Fireworks] Config apply failed:',
        expect.objectContaining({ code: 'GPU_CAPACITY_REALLOCATION_FAILED' })
      );
    } finally {
      consoleError.mockRestore();
      client.restore();
    }
  });

  test('serializes complete config applies without stale merges after a pending resize', async () => {
    const pending = createDeferred();
    const renderer = {
      initialized: true,
      maxParticles: 2_048,
      reconfigureCapacity: jest.fn(() => pending.promise),
    };
    const client = createClient('');
    try {
      client.engine.renderer = renderer;
      client.engine.config.maxTotalParticles = 2_048;
      const firstAck = jest.fn();
      const secondAck = jest.fn();

      const first = client.receive('webgpu-fireworks:config-update', {
        config: { maxTotalParticles: 4_096, audioVolume: 0.25 },
      }, firstAck);
      await Promise.resolve();
      const second = client.receive('webgpu-fireworks:config-update', {
        config: { targetFps: 30 },
      }, secondAck);
      await Promise.resolve();

      expect(firstAck).not.toHaveBeenCalled();
      expect(secondAck).not.toHaveBeenCalled();
      expect(client.engine.config.maxTotalParticles).toBe(2_048);

      renderer.maxParticles = 4_096;
      pending.resolve({ changed: true, generation: 2, maxParticles: 4_096 });
      await Promise.all([first, second]);

      expect(renderer.reconfigureCapacity).toHaveBeenCalledTimes(1);
      expect(client.engine.config).toEqual(expect.objectContaining({
        maxTotalParticles: 4_096,
        audioVolume: 0.25,
        targetFps: 30,
      }));
      expect(firstAck).toHaveBeenCalledWith({
        accepted: true,
        benchmarkSessionId: null,
        applied: true,
      });
      expect(secondAck).toHaveBeenCalledWith({
        accepted: true,
        benchmarkSessionId: null,
        applied: true,
      });
    } finally {
      client.restore();
    }
  });

  test('waits for renderer startup before applying or acknowledging an explicit capacity', async () => {
    const ready = createDeferred();
    const renderer = {
      initialized: false,
      maxParticles: 2_048,
      reconfigureCapacity: jest.fn(async capacity => {
        renderer.maxParticles = capacity;
        return { changed: true, generation: 2, maxParticles: capacity };
      }),
    };
    const client = createClient('');
    try {
      client.engine.renderer = renderer;
      client.engine.rendererReadyPromise = ready.promise;
      client.engine.config.maxTotalParticles = 2_048;
      const acknowledge = jest.fn();

      const invocation = client.receive('webgpu-fireworks:config-update', {
        config: { maxTotalParticles: 4_096 },
      }, acknowledge);
      await Promise.resolve();

      expect(renderer.reconfigureCapacity).not.toHaveBeenCalled();
      expect(client.engine.config.maxTotalParticles).toBe(2_048);
      expect(acknowledge).not.toHaveBeenCalled();

      renderer.initialized = true;
      ready.resolve(true);
      await invocation;

      expect(renderer.reconfigureCapacity).toHaveBeenCalledWith(4_096);
      expect(client.engine.config.maxTotalParticles).toBe(4_096);
      expect(acknowledge).toHaveBeenCalledWith({
        accepted: true,
        benchmarkSessionId: null,
        applied: true,
      });
    } finally {
      client.restore();
    }
  });

  test('reads a session only in benchmark mode and publishes it with registration, status, and FPS', () => {
    const benchmark = createClient(`?benchmark=true&benchmarkSessionId=${FIRST_SESSION}`);
    try {
      benchmark.connect();

      expect(benchmark.engine.isBenchmark).toBe(true);
      expect(benchmark.engine.benchmarkSessionId).toBe(FIRST_SESSION);
      expect(benchmark.socket.emit).toHaveBeenCalledWith(
        'webgpu-fireworks:register-overlay',
        expect.objectContaining({ benchmark: true, benchmarkSessionId: FIRST_SESSION })
      );
      expect(benchmark.socket.emit).toHaveBeenCalledWith(
        'webgpu-fireworks:renderer-status',
        expect.objectContaining({ benchmark: true, benchmarkSessionId: FIRST_SESSION })
      );

      const now = jest.spyOn(performance, 'now').mockReturnValue(1000);
      benchmark.engine.running = true;
      benchmark.engine.renderer = { render: jest.fn() };
      benchmark.engine.processTimeline = jest.fn();
      benchmark.engine.shouldSkipCurrentFrame = jest.fn(() => false);
      benchmark.engine.lastFrameAt = 0;
      benchmark.engine.fpsWindowAt = 0;
      benchmark.engine.frameCount = 59;
      benchmark.socket.emit.mockClear();
      benchmark.engine.render();
      now.mockRestore();

      expect(benchmark.socket.emit).toHaveBeenCalledWith(
        'webgpu-fireworks:fps-update',
        expect.objectContaining({ benchmark: true, benchmarkSessionId: FIRST_SESSION })
      );
    } finally {
      benchmark.restore();
    }

    const live = createClient(`?benchmarkSessionId=${SECOND_SESSION}`);
    try {
      expect(live.engine.isBenchmark).toBe(false);
      expect(live.engine.benchmarkSessionId).toBeNull();
    } finally {
      live.restore();
    }
  });

  test('benchmark clients accept only their own trigger and config and ignore every global celebration surface', async () => {
    const client = createClient(`?benchmark=true&benchmarkSessionId=${FIRST_SESSION}`);
    try {
      client.connect();
      client.engine.handleIncomingTrigger.mockClear();

      client.receive('webgpu-fireworks:trigger', { shape: 'heart' });
      client.receive('webgpu-fireworks:trigger', { shape: 'star', benchmarkSessionId: SECOND_SESSION });
      client.receive('webgpu-fireworks:trigger', { shape: 'burst', benchmarkSessionId: FIRST_SESSION });
      expect(client.engine.handleIncomingTrigger).toHaveBeenCalledTimes(1);
      expect(client.engine.handleIncomingTrigger).toHaveBeenCalledWith(
        expect.objectContaining({ shape: 'burst', benchmarkSessionId: FIRST_SESSION })
      );

      await client.receive('webgpu-fireworks:config-update', {
        config: { targetFps: 30 }, benchmarkSessionId: FIRST_SESSION
      });
      await client.receive('webgpu-fireworks:config-update', {
        config: { targetFps: 20 }, benchmarkSessionId: SECOND_SESSION
      });
      await client.receive('webgpu-fireworks:config-update', { config: { targetFps: 10 } });
      expect(client.engine.config.targetFps).toBe(30);

      for (const event of [
        'webgpu-fireworks:finale',
        'webgpu-fireworks:preview',
        'webgpu-fireworks:follower-animation'
      ]) {
        client.receive(event, { benchmarkSessionId: FIRST_SESSION });
        client.receive(event, {});
      }
      expect(client.engine.handleFinaleSocketEvent).not.toHaveBeenCalled();
      expect(client.engine.handlePreviewSocketEvent).not.toHaveBeenCalled();
      expect(client.engine.showFollowerAnimation).not.toHaveBeenCalled();

      client.engine.config.interactiveEnabled = true;
      client.engine.config.clickTriggerEnabled = true;
      client.socket.emit.mockClear();
      client.engine.clickHandler({ clientX: 500, clientY: 250 });
      await Promise.resolve();
      expect(client.socket.emit).not.toHaveBeenCalledWith(
        'webgpu-fireworks:interactive-trigger', expect.anything()
      );
    } finally {
      client.restore();
    }
  });

  test('live clients accept global events and reject every session-marked benchmark event', async () => {
    const client = createClient('');
    try {
      client.connect();
      client.engine.handleIncomingTrigger.mockClear();

      client.receive('webgpu-fireworks:trigger', { shape: 'heart' });
      client.receive('webgpu-fireworks:trigger', { shape: 'burst', benchmarkSessionId: FIRST_SESSION });
      expect(client.engine.handleIncomingTrigger).toHaveBeenCalledTimes(1);
      expect(client.engine.handleIncomingTrigger).toHaveBeenCalledWith({ shape: 'heart' });

      await client.receive('webgpu-fireworks:config-update', { config: { targetFps: 48 } });
      await client.receive('webgpu-fireworks:config-update', {
        config: { targetFps: 12 }, benchmarkSessionId: FIRST_SESSION
      });
      expect(client.engine.config.targetFps).toBe(48);

      const surfaces = [
        ['webgpu-fireworks:finale', client.engine.handleFinaleSocketEvent],
        ['webgpu-fireworks:preview', client.engine.handlePreviewSocketEvent],
        ['webgpu-fireworks:follower-animation', client.engine.showFollowerAnimation]
      ];
      for (const [event, handler] of surfaces) {
        client.receive(event, { id: 'live' });
        client.receive(event, { id: 'benchmark', benchmarkSessionId: FIRST_SESSION });
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith({ id: 'live' });
      }
    } finally {
      client.restore();
    }
  });

  test('two benchmark clients route only the exact session assigned to each instance', () => {
    const first = createClient(`?benchmark=true&benchmarkSessionId=${FIRST_SESSION}`);
    const second = createClient(`?benchmark=true&benchmarkSessionId=${SECOND_SESSION}`);
    try {
      first.connect();
      second.connect();
      first.engine.handleIncomingTrigger.mockClear();
      second.engine.handleIncomingTrigger.mockClear();

      first.receive('webgpu-fireworks:trigger', { benchmarkSessionId: SECOND_SESSION });
      first.receive('webgpu-fireworks:trigger', { benchmarkSessionId: FIRST_SESSION });
      second.receive('webgpu-fireworks:trigger', { benchmarkSessionId: FIRST_SESSION });
      second.receive('webgpu-fireworks:trigger', { benchmarkSessionId: SECOND_SESSION });

      expect(first.engine.handleIncomingTrigger).toHaveBeenCalledTimes(1);
      expect(first.engine.handleIncomingTrigger).toHaveBeenCalledWith({ benchmarkSessionId: FIRST_SESSION });
      expect(second.engine.handleIncomingTrigger).toHaveBeenCalledTimes(1);
      expect(second.engine.handleIncomingTrigger).toHaveBeenCalledWith({ benchmarkSessionId: SECOND_SESSION });
    } finally {
      second.restore();
      first.restore();
    }
  });

  test('acknowledges scoped config only after apply and scoped triggers only after renderer admission', async () => {
    const client = createClient(`?benchmark=true&benchmarkSessionId=${FIRST_SESSION}`);
    try {
      client.connect();
      client.engine.handleIncomingTrigger.mockResolvedValue({ id: 'accepted-plan' });
      const configAck = jest.fn();
      const triggerAck = jest.fn();

      await client.receive('webgpu-fireworks:config-update', {
        config: { targetFps: 30 },
        benchmarkSessionId: FIRST_SESSION
      }, configAck);
      expect(client.engine.config.targetFps).toBe(30);
      expect(configAck).toHaveBeenCalledWith({
        accepted: true,
        benchmarkSessionId: FIRST_SESSION,
        applied: true
      });

      await client.receive('webgpu-fireworks:trigger', {
        shape: 'burst',
        benchmarkSessionId: FIRST_SESSION
      }, triggerAck);
      expect(triggerAck).toHaveBeenCalledWith({
        accepted: true,
        benchmarkSessionId: FIRST_SESSION,
        admitted: true
      });

      const rejectedAck = jest.fn();
      client.engine.handleIncomingTrigger.mockResolvedValue(null);
      await client.receive('webgpu-fireworks:trigger', {
        shape: 'burst',
        benchmarkSessionId: FIRST_SESSION
      }, rejectedAck);
      expect(rejectedAck).toHaveBeenCalledWith(expect.objectContaining({
        accepted: false,
        benchmarkSessionId: FIRST_SESSION,
        reason: 'renderer-rejected'
      }));
    } finally {
      client.restore();
    }
  });

  test('rejects an expired benchmark admission before invoking the renderer', async () => {
    const client = createClient(`?benchmark=true&benchmarkSessionId=${FIRST_SESSION}`);
    try {
      client.connect();
      client.engine.handleIncomingTrigger.mockClear();
      const acknowledge = jest.fn();

      await client.receive('webgpu-fireworks:trigger', {
        shape: 'burst',
        benchmarkSessionId: FIRST_SESSION,
        benchmarkAdmissionDeadline: Date.now() - 1
      }, acknowledge);

      expect(client.engine.handleIncomingTrigger).not.toHaveBeenCalled();
      expect(acknowledge).toHaveBeenCalledWith({
        accepted: false,
        benchmarkSessionId: FIRST_SESSION,
        reason: 'admission-expired'
      });
    } finally {
      client.restore();
    }
  });
});
