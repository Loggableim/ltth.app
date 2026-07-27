'use strict';

const {
  StableOverlayRoutingClient
} = require('../modules/stable-overlay-routing-client');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

class ManualTimers {
  constructor(start = Date.parse('2026-07-27T10:00:00.000Z')) {
    this.now = start;
    this.nextId = 1;
    this.tasks = new Map();
  }

  setTimeout = (callback, delay) => {
    const id = this.nextId++;
    this.tasks.set(id, {
      callback,
      delay,
      dueAt: this.now + delay
    });
    return id;
  };

  clearTimeout = (id) => {
    this.tasks.delete(id);
  };

  pendingDelays() {
    return [...this.tasks.values()]
      .map(task => task.dueAt - this.now)
      .sort((a, b) => a - b);
  }

  async advance(milliseconds) {
    const target = this.now + milliseconds;
    while (true) {
      const due = [...this.tasks.entries()]
        .filter(([, task]) => task.dueAt <= target)
        .sort((first, second) => first[1].dueAt - second[1].dueAt)[0];
      if (!due) {
        break;
      }
      const [id, task] = due;
      this.tasks.delete(id);
      this.now = task.dueAt;
      await task.callback();
      await Promise.resolve();
    }
    this.now = target;
    await Promise.resolve();
  }
}

function response(status, payload = null) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  };
}

function enrollment() {
  return {
    deviceId: 'device-123',
    credential: 'a'.repeat(64),
    enrolledAt: '2026-07-27T09:00:00.000Z',
    label: 'Streaming desktop',
    defaultUsername: 'creator.name'
  };
}

function createHarness(overrides = {}) {
  const timers = overrides.timers || new ManualTimers();
  const requests = [];
  const tunnelCalls = [];
  const logs = [];
  const stored = overrides.stored === undefined ? enrollment() : overrides.stored;
  const credentialStore = overrides.credentialStore || {
    load: () => stored
  };
  const tunnelResults = overrides.tunnelResults || [
    {
      tunnelURL: 'https://first-tunnel.trycloudflare.com',
      reused: true
    }
  ];
  let tunnelIndex = 0;
  const networkManager = overrides.networkManager || {
    ensureOverlayQuickTunnel: async (port) => {
      tunnelCalls.push(port);
      return tunnelResults[Math.min(tunnelIndex++, tunnelResults.length - 1)];
    }
  };
  const fetchImpl = overrides.fetchImpl || (async (url, options) => {
    requests.push({ url, options });
    const revision = requests.filter(
      request => request.options.method === 'PUT'
    ).length;
    return response(200, {
      lease: {
        active: true,
        deviceId: 'device-123',
        instanceId: 'process-instance',
        revision
      }
    });
  });
  const client = new StableOverlayRoutingClient({
    networkManager,
    fetch: fetchImpl,
    clock: () => timers.now,
    timers,
    credentialStore,
    config: {
      enabled: true,
      apiOrigin: 'https://overlay.ltth.app',
      ...(overrides.config || {})
    },
    logger: {
      info: message => logs.push(['info', message]),
      warn: message => logs.push(['warn', message]),
      error: message => logs.push(['error', message])
    },
    getPort: () => 3180,
    random: overrides.random || (() => 0.5),
    instanceIdFactory: overrides.instanceIdFactory ||
      (() => 'process-instance'),
    requestTimeoutMs: overrides.requestTimeoutMs || 5_000,
    abortControllerFactory: overrides.abortControllerFactory
  });
  return {
    client,
    credentialStore,
    fetchImpl,
    logs,
    networkManager,
    requests,
    timers,
    tunnelCalls
  };
}

function requestBody(request) {
  return JSON.parse(request.options.body);
}

describe('StableOverlayRoutingClient', () => {
  test.each([
    undefined,
    false,
    'false',
    'TRUE',
    '1'
  ])('stays disabled without the exact true feature flag (%p)', async (enabled) => {
    const harness = createHarness({
      config: { enabled },
      credentialStore: {
        load: () => {
          throw new Error('disabled client must not read credentials');
        }
      },
      networkManager: {
        ensureOverlayQuickTunnel: () => {
          throw new Error('disabled client must not start a tunnel');
        }
      },
      fetchImpl: () => {
        throw new Error('disabled client must not call the Worker');
      }
    });

    await expect(harness.client.start()).resolves.toEqual({
      state: 'disabled',
      revision: null,
      lastSuccessfulHeartbeat: null
    });
  });

  test('reports unenrolled and needs-auth without exposing enrollment details', async () => {
    const { client } = createHarness({ stored: null });

    await expect(client.start()).resolves.toEqual({
      state: 'unenrolled',
      revision: null,
      lastSuccessfulHeartbeat: null
    });
    expect(client.setNeedsAuth()).toEqual({
      state: 'needs_auth',
      revision: null,
      lastSuccessfulHeartbeat: null
    });
  });

  test('single-flights startup, reuses the overlay tunnel, and activates a new process instance', async () => {
    const tunnel = deferred();
    const activation = deferred();
    const tunnelCalls = [];
    const requests = [];
    const { client } = createHarness({
      networkManager: {
        ensureOverlayQuickTunnel: port => {
          tunnelCalls.push(port);
          return tunnel.promise;
        }
      },
      fetchImpl: (url, options) => {
        requests.push({ url, options });
        return activation.promise;
      }
    });

    const firstStart = client.start();
    const secondStart = client.start();
    expect(secondStart).toBe(firstStart);
    expect(client.getStatus()).toEqual({
      state: 'starting_tunnel',
      revision: null,
      lastSuccessfulHeartbeat: null
    });
    expect(tunnelCalls).toEqual([3180]);

    tunnel.resolve({
      tunnelURL: 'https://first-tunnel.trycloudflare.com',
      reused: true
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(client.getStatus().state).toBe('activating');

    activation.resolve(response(200, {
      lease: {
        active: true,
        deviceId: 'device-123',
        instanceId: 'process-instance',
        revision: 7
      }
    }));
    await expect(firstStart).resolves.toEqual({
      state: 'active',
      revision: 7,
      lastSuccessfulHeartbeat: '2026-07-27T10:00:00.000Z'
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(
      'https://overlay.ltth.app/_ltth/v1/lease'
    );
    expect(requests[0].options).toMatchObject({
      method: 'PUT',
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      headers: {
        Authorization: `Bearer ${'a'.repeat(64)}`,
        'Content-Type': 'application/json'
      }
    });
    expect(requestBody(requests[0])).toEqual({
      deviceId: 'device-123',
      instanceId: 'process-instance',
      tunnelOrigin: 'https://first-tunnel.trycloudflare.com'
    });
  });

  test('stop awaits thenable credential startup and prevents its continuation from activating', async () => {
    const credentialLoad = deferred();
    let loadCount = 0;
    const harness = createHarness({
      credentialStore: {
        load: () => {
          loadCount += 1;
          return loadCount === 1 ? credentialLoad.promise : enrollment();
        }
      }
    });

    const starting = harness.client.start();
    let stopSettled = false;
    const stopping = harness.client.stop().then(status => {
      stopSettled = true;
      return status;
    });
    await Promise.resolve();

    expect(stopSettled).toBe(false);
    credentialLoad.resolve(enrollment());
    await expect(stopping).resolves.toMatchObject({
      state: 'offline',
      revision: null
    });
    await starting;

    expect(harness.tunnelCalls).toEqual([]);
    expect(harness.requests).toEqual([]);
    expect(harness.timers.pendingDelays()).toEqual([]);

    await expect(harness.client.start()).resolves.toMatchObject({
      state: 'active',
      revision: 1
    });
    expect(harness.tunnelCalls).toEqual([3180]);
    expect(harness.requests).toHaveLength(1);
  });

  test('bounds a stalled activation request with an abort timeout', async () => {
    let activationOptions;
    const harness = createHarness({
      requestTimeoutMs: 1_000,
      fetchImpl: async (url, options) => {
        activationOptions = options;
        return new Promise(() => {});
      }
    });

    const starting = harness.client.start();
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.timers.pendingDelays()).toEqual([1_000]);
    await harness.timers.advance(1_000);
    await expect(starting).resolves.toMatchObject({
      state: 'offline',
      revision: null
    });
    expect(activationOptions.signal.aborted).toBe(true);
    expect(harness.timers.pendingDelays()).toEqual([2_000]);
  });

  test('stop aborts and awaits a stalled activation request', async () => {
    const activation = deferred();
    let activationOptions;
    const harness = createHarness({
      requestTimeoutMs: 1_000,
      fetchImpl: async (url, options) => {
        activationOptions = options;
        return activation.promise;
      }
    });

    const starting = harness.client.start();
    await Promise.resolve();
    await Promise.resolve();
    let stopSettled = false;
    const stopping = harness.client.stop().then(status => {
      stopSettled = true;
      return status;
    });
    await Promise.resolve();
    await Promise.resolve();

    if (!stopSettled) {
      activation.resolve(response(503));
    }
    await starting;
    await stopping;

    expect(stopSettled).toBe(true);
    expect(activationOptions.signal.aborted).toBe(true);
    expect(harness.timers.pendingDelays()).toEqual([]);
  });

  test('heartbeats at 30 seconds with the accepted revision and resets cadence after success', async () => {
    const harness = createHarness();
    await harness.client.start();
    expect(harness.requests).toHaveLength(1);
    expect(harness.timers.pendingDelays()).toEqual([30_000]);

    await harness.timers.advance(29_999);
    expect(harness.requests).toHaveLength(1);
    await harness.timers.advance(1);

    expect(harness.requests).toHaveLength(2);
    expect(requestBody(harness.requests[1])).toEqual({
      deviceId: 'device-123',
      instanceId: 'process-instance',
      tunnelOrigin: 'https://first-tunnel.trycloudflare.com',
      expectedRevision: 1
    });
    expect(harness.client.getStatus()).toEqual({
      state: 'active',
      revision: 2,
      lastSuccessfulHeartbeat: '2026-07-27T10:00:30.000Z'
    });
    expect(harness.timers.pendingDelays()).toEqual([30_000]);
  });

  test('publishes tunnel rotation immediately as a revisioned lease update', async () => {
    const harness = createHarness({
      tunnelResults: [
        {
          tunnelURL: 'https://first-tunnel.trycloudflare.com',
          reused: true
        },
        {
          tunnelURL: 'https://rotated-tunnel.trycloudflare.com',
          reused: false
        }
      ]
    });
    await harness.client.start();

    await expect(harness.client.publishTunnelRotation()).resolves.toEqual({
      state: 'active',
      revision: 2,
      lastSuccessfulHeartbeat: '2026-07-27T10:00:00.000Z'
    });
    expect(requestBody(harness.requests[1])).toEqual({
      deviceId: 'device-123',
      instanceId: 'process-instance',
      tunnelOrigin: 'https://rotated-tunnel.trycloudflare.com',
      expectedRevision: 1
    });
    expect(harness.timers.pendingDelays()).toEqual([30_000]);
  });

  test('reconciles a lost rotation response through device status and retries the current tunnel once', async () => {
    const requests = [];
    let putCount = 0;
    const harness = createHarness({
      tunnelResults: [
        {
          tunnelURL: 'https://first-tunnel.trycloudflare.com',
          reused: true
        },
        {
          tunnelURL: 'https://rotated-tunnel.trycloudflare.com',
          reused: false
        }
      ],
      fetchImpl: async (url, options) => {
        requests.push({ url, options });
        if (options.method === 'GET') {
          return response(200, {
            device: {
              deviceId: 'device-123'
            },
            lease: {
              active: true,
              deviceId: 'device-123',
              instanceId: 'process-instance',
              revision: 2
            }
          });
        }

        putCount += 1;
        if (putCount === 1) {
          return response(200, {
            lease: {
              active: true,
              deviceId: 'device-123',
              instanceId: 'process-instance',
              revision: 1
            }
          });
        }
        if (putCount === 2) {
          throw new TypeError('response lost after commit');
        }
        if (putCount === 3) {
          return response(409, { error: 'lease_conflict' });
        }
        return response(200, {
          lease: {
            active: true,
            deviceId: 'device-123',
            instanceId: 'process-instance',
            revision: 3
          }
        });
      }
    });
    await harness.client.start();

    await expect(harness.client.publishTunnelRotation()).resolves.toMatchObject({
      state: 'offline',
      revision: 1
    });
    await harness.timers.advance(2_000);

    expect(harness.client.getStatus()).toEqual({
      state: 'active',
      revision: 3,
      lastSuccessfulHeartbeat: '2026-07-27T10:00:02.000Z'
    });
    expect(requests.map(request => [
      request.options.method,
      new URL(request.url).pathname
    ])).toEqual([
      ['PUT', '/_ltth/v1/lease'],
      ['PUT', '/_ltth/v1/lease'],
      ['PUT', '/_ltth/v1/lease'],
      ['GET', '/_ltth/v1/device/status'],
      ['PUT', '/_ltth/v1/lease']
    ]);
    const statusRequest = requests[3];
    expect(statusRequest.options.headers).toEqual({
      Authorization: `Bearer ${'a'.repeat(64)}`,
      'X-LTTH-Device-ID': 'device-123'
    });
    expect(statusRequest.options.body).toBeUndefined();
    expect(requestBody(requests[4])).toEqual({
      deviceId: 'device-123',
      instanceId: 'process-instance',
      tunnelOrigin: 'https://rotated-tunnel.trycloudflare.com',
      expectedRevision: 2
    });
  });

  test('rejects conflict reconciliation for a lease owned by another instance', async () => {
    const requests = [];
    const harness = createHarness({
      tunnelResults: [
        {
          tunnelURL: 'https://first-tunnel.trycloudflare.com',
          reused: true
        },
        {
          tunnelURL: 'https://rotated-tunnel.trycloudflare.com',
          reused: false
        }
      ],
      fetchImpl: async (url, options) => {
        requests.push({ url, options });
        if (options.method === 'GET') {
          return response(200, {
            device: {
              deviceId: 'device-123'
            },
            lease: {
              active: true,
              deviceId: 'device-123',
              instanceId: 'another-process',
              revision: 2
            }
          });
        }
        if (requests.filter(request => request.options.method === 'PUT').length === 1) {
          return response(200, {
            lease: {
              active: true,
              deviceId: 'device-123',
              instanceId: 'process-instance',
              revision: 1
            }
          });
        }
        return response(409, { error: 'lease_conflict' });
      }
    });
    await harness.client.start();

    await expect(harness.client.publishTunnelRotation()).resolves.toMatchObject({
      state: 'error',
      revision: 1
    });

    expect(requests.map(request => request.options.method)).toEqual([
      'PUT',
      'PUT',
      'GET'
    ]);
    expect(harness.timers.pendingDelays()).toEqual([]);
  });

  test('bounds a stalled conflict status request with an abort timeout', async () => {
    let putCount = 0;
    let statusOptions;
    const harness = createHarness({
      requestTimeoutMs: 1_000,
      tunnelResults: [
        {
          tunnelURL: 'https://first-tunnel.trycloudflare.com',
          reused: true
        },
        {
          tunnelURL: 'https://rotated-tunnel.trycloudflare.com',
          reused: false
        }
      ],
      fetchImpl: async (url, options) => {
        if (options.method === 'GET') {
          statusOptions = options;
          return new Promise(() => {});
        }
        putCount += 1;
        return putCount === 1
          ? response(200, {
            lease: {
              active: true,
              deviceId: 'device-123',
              instanceId: 'process-instance',
              revision: 1
            }
          })
          : response(409, { error: 'lease_conflict' });
      }
    });
    await harness.client.start();

    const rotating = harness.client.publishTunnelRotation();
    for (let index = 0; index < 10 && !statusOptions; index += 1) {
      await Promise.resolve();
    }
    expect(statusOptions).toBeDefined();
    expect(harness.timers.pendingDelays()).toEqual([1_000]);

    await harness.timers.advance(1_000);
    await expect(rotating).resolves.toMatchObject({
      state: 'offline',
      revision: 1
    });
    expect(statusOptions.signal.aborted).toBe(true);
    expect(harness.timers.pendingDelays()).toEqual([2_000]);
  });

  test('retries transient failures with jittered 2/4/8/16/30-second backoff and resets after success', async () => {
    const outcomes = [
      new TypeError('offline'),
      new TypeError('offline'),
      new TypeError('offline'),
      new TypeError('offline'),
      new TypeError('offline'),
      new TypeError('offline'),
      response(200, {
        lease: {
          active: true,
          deviceId: 'device-123',
          instanceId: 'process-instance',
          revision: 1
        }
      })
    ];
    const requests = [];
    const harness = createHarness({
      fetchImpl: async (url, options) => {
        requests.push({ url, options });
        const outcome = outcomes.shift();
        if (outcome instanceof Error) {
          throw outcome;
        }
        return outcome;
      }
    });

    await expect(harness.client.start()).resolves.toEqual({
      state: 'offline',
      revision: null,
      lastSuccessfulHeartbeat: null
    });

    for (const expectedDelay of [2_000, 4_000, 8_000, 16_000, 30_000, 30_000]) {
      expect(harness.timers.pendingDelays()).toEqual([expectedDelay]);
      await harness.timers.advance(expectedDelay);
    }

    expect(harness.client.getStatus().state).toBe('active');
    expect(requests).toHaveLength(7);
    expect(harness.timers.pendingDelays()).toEqual([30_000]);

    outcomes.push(new TypeError('offline again'));
    await harness.timers.advance(30_000);
    expect(harness.client.getStatus().state).toBe('offline');
    expect(harness.timers.pendingDelays()).toEqual([2_000]);
  });

  test('applies jitter without moving a retry outside the documented backoff step', async () => {
    const harness = createHarness({
      random: () => 0,
      fetchImpl: async () => {
        throw new TypeError('offline');
      }
    });

    await harness.client.start();

    expect(harness.timers.pendingDelays()).toEqual([1_600]);
  });

  test('caps positive jitter at the 30-second maximum backoff', async () => {
    const harness = createHarness({
      random: () => 1,
      fetchImpl: async () => {
        throw new TypeError('offline');
      }
    });
    await harness.client.start();

    for (const expectedDelay of [2_400, 4_800, 9_600, 19_200]) {
      expect(harness.timers.pendingDelays()).toEqual([expectedDelay]);
      await harness.timers.advance(expectedDelay);
    }
    expect(harness.timers.pendingDelays()).toEqual([30_000]);
    await harness.timers.advance(30_000);
    expect(harness.timers.pendingDelays()).toEqual([30_000]);
  });

  test('retries a transient Quick Tunnel startup failure without discarding enrollment', async () => {
    const stored = enrollment();
    let attempts = 0;
    const harness = createHarness({
      credentialStore: { load: () => stored },
      networkManager: {
        ensureOverlayQuickTunnel: async () => {
          attempts += 1;
          if (attempts === 1) {
            throw Object.assign(new Error('tunnel unavailable'), {
              code: 'OVERLAY_TUNNEL_START_FAILED'
            });
          }
          return {
            tunnelURL: 'https://first-tunnel.trycloudflare.com',
            reused: false
          };
        }
      }
    });

    await expect(harness.client.start()).resolves.toEqual({
      state: 'offline',
      revision: null,
      lastSuccessfulHeartbeat: null
    });
    expect(harness.timers.pendingDelays()).toEqual([2_000]);
    expect(harness.credentialStore.load()).toBe(stored);

    await harness.timers.advance(2_000);
    expect(harness.client.getStatus().state).toBe('active');
  });

  test.each([401, 403])('stops retrying after device authentication failure %i', async (status) => {
    const stored = enrollment();
    const harness = createHarness({
      credentialStore: { load: () => stored },
      fetchImpl: async () => response(status)
    });

    await expect(harness.client.start()).resolves.toEqual({
      state: 'auth_error',
      revision: null,
      lastSuccessfulHeartbeat: null
    });
    expect(harness.timers.pendingDelays()).toEqual([]);
    expect(harness.credentialStore.load()).toBe(stored);
    expect(JSON.stringify(harness.client.getStatus())).not.toContain(stored.credential);
    expect(JSON.stringify(harness.logs)).not.toContain(stored.credential);
  });

  test('stops without retry when the credential store rejects persisted material', async () => {
    const error = Object.assign(new Error('invalid credential'), {
      code: 'STABLE_OVERLAY_CREDENTIAL_INVALID'
    });
    const harness = createHarness({
      credentialStore: {
        load: () => {
          throw error;
        }
      }
    });

    await expect(harness.client.start()).resolves.toEqual({
      state: 'auth_error',
      revision: null,
      lastSuccessfulHeartbeat: null
    });
    expect(harness.timers.pendingDelays()).toEqual([]);
  });

  test('treats revision conflicts as terminal errors instead of restarting activation', async () => {
    const harness = createHarness({
      fetchImpl: async () => response(409, { error: 'lease_conflict' })
    });

    await expect(harness.client.start()).resolves.toEqual({
      state: 'error',
      revision: null,
      lastSuccessfulHeartbeat: null
    });
    expect(harness.timers.pendingDelays()).toEqual([]);
  });

  test('clears timers and awaits best-effort lease close before network shutdown while retaining credentials', async () => {
    const events = [];
    const close = deferred();
    const stored = enrollment();
    const harness = createHarness({
      credentialStore: { load: () => stored },
      fetchImpl: async (url, options) => {
        if (options.method === 'DELETE') {
          events.push('delete-start');
          return close.promise;
        }
        return response(200, {
          lease: {
            active: true,
            deviceId: 'device-123',
            instanceId: 'process-instance',
            revision: 4
          }
        });
      }
    });
    await harness.client.start();
    expect(harness.timers.pendingDelays()).toEqual([30_000]);

    const stopping = harness.client.stop();
    expect(events).toEqual(['delete-start']);
    expect(harness.timers.pendingDelays()).toEqual([5_000]);

    close.resolve(response(204));
    await stopping;
    events.push('network-shutdown');

    expect(events).toEqual(['delete-start', 'network-shutdown']);
    const closeRequest = await (async () => {
      const captured = [];
      const replay = createHarness({
        credentialStore: { load: () => stored },
        fetchImpl: async (url, options) => {
          captured.push({ url, options });
          return options.method === 'PUT'
            ? response(200, {
              lease: {
                active: true,
                deviceId: 'device-123',
                instanceId: 'process-instance',
                revision: 4
              }
            })
            : response(204);
        }
      });
      await replay.client.start();
      await replay.client.stop();
      return captured[1];
    })();
    expect(closeRequest.url).toBe(
      'https://overlay.ltth.app/_ltth/v1/lease'
    );
    expect(closeRequest.options.method).toBe('DELETE');
    expect(requestBody(closeRequest)).toEqual({
      deviceId: 'device-123',
      instanceId: 'process-instance',
      expectedRevision: 4
    });
    expect(harness.credentialStore.load()).toBe(stored);
  });

  test('completes shutdown when best-effort lease close is offline', async () => {
    const harness = createHarness({
      fetchImpl: async (url, options) => {
        if (options.method === 'DELETE') {
          throw new TypeError('offline');
        }
        return response(200, {
          lease: {
            active: true,
            deviceId: 'device-123',
            instanceId: 'process-instance',
            revision: 1
          }
        });
      }
    });
    await harness.client.start();

    await expect(harness.client.stop()).resolves.toEqual({
      state: 'offline',
      revision: null,
      lastSuccessfulHeartbeat: '2026-07-27T10:00:00.000Z'
    });
    expect(harness.timers.pendingDelays()).toEqual([]);
  });

  test('bounds a stalled best-effort lease close during shutdown', async () => {
    let closeOptions;
    const harness = createHarness({
      requestTimeoutMs: 1_000,
      fetchImpl: async (url, options) => {
        if (options.method === 'DELETE') {
          closeOptions = options;
          return new Promise(() => {});
        }
        return response(200, {
          lease: {
            active: true,
            deviceId: 'device-123',
            instanceId: 'process-instance',
            revision: 1
          }
        });
      }
    });
    await harness.client.start();

    const stopping = harness.client.stop();
    expect(harness.timers.pendingDelays()).toEqual([1_000]);
    await harness.timers.advance(1_000);

    await expect(stopping).resolves.toMatchObject({
      state: 'offline',
      revision: null
    });
    expect(closeOptions.signal.aborted).toBe(true);
    expect(harness.timers.pendingDelays()).toEqual([]);
  });
});
