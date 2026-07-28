'use strict';

const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const os = require('os');
const path = require('path');
const request = require('supertest');
const {
  buildStableOverlayClerkAuthorizedParties,
  buildStoreAuthConfig,
  verifyClerkSessionToken: verifyRealClerkSessionToken
} = require('../modules/clerk-store-auth');
const {
  createStableOverlayRoutingLifecycle,
  registerStableOverlayRoutingRoutes
} = require('../modules/stable-overlay-routing-routes');
const {
  StableOverlayRoutingCredentials
} = require('../modules/stable-overlay-routing-credentials');

const API_ORIGIN = 'http://127.0.0.1:8787';
const WORKER_PREFIX = `${API_ORIGIN}/_ltth/v1`;
const TOKEN = 'fresh-clerk-session-token';
const OTHER_TOKEN = 'another-fresh-clerk-session-token';

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
  constructor() {
    this.nextId = 1;
    this.tasks = new Map();
  }

  setTimeout = (callback, delay) => {
    const id = this.nextId++;
    this.tasks.set(id, { callback, delay });
    return id;
  };

  clearTimeout = id => {
    this.tasks.delete(id);
  };

  async advance(delay) {
    const due = [...this.tasks.entries()]
      .filter(([, task]) => task.delay <= delay);
    for (const [id, task] of due) {
      this.tasks.delete(id);
      await task.callback();
      await Promise.resolve();
    }
  }
}

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  });
}

function endlessResponse({
  status,
  contentType = 'application/json',
  cancel = jest.fn(() => new Promise(() => {}))
}) {
  const headers = new Headers();
  if (contentType !== null) {
    headers.set('Content-Type', contentType);
  }
  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    body: {
      cancel,
      getReader: jest.fn(() => ({
        read: jest.fn(() => new Promise(() => {})),
        cancel
      }))
    }
  };
}

function activeClaim(username = 'pup.cid') {
  return {
    username,
    displayUsername: username,
    state: 'active',
    claimedAt: '2026-07-27T10:00:00.000Z',
    releaseRequestedAt: null,
    reusableAfter: null,
    updatedAt: '2026-07-27T10:00:00.000Z'
  };
}

function enrolledDevice() {
  return {
    deviceId: 'd-0123456789abcdef0123456789abcdef',
    label: 'Studio PC',
    createdAt: '2026-07-27T10:00:00.000Z',
    lastSeenAt: null,
    revokedAt: null
  };
}

function createHarness(overrides = {}) {
  const fetch = overrides.fetch || jest.fn().mockImplementation(async () =>
    jsonResponse({
      claims: [activeClaim()],
      devices: [enrolledDevice()],
      lease: { active: false }
    })
  );
  const verifyClerkSessionToken = overrides.verifyClerkSessionToken ||
    jest.fn().mockResolvedValue({
      sub: 'user_123',
      sid: 'session_123',
      exp: 1785148800
    });
  const defaultCredentialStore = {
    load: jest.fn().mockReturnValue({
      deviceId: 'd-0123456789abcdef',
      credential: 'a'.repeat(64),
      enrolledAt: '2026-07-27T10:00:00.000Z',
      label: 'Studio PC',
      defaultUsername: null
    }),
    loadPendingEnrollment: jest.fn().mockReturnValue(null),
    stageEnrollment: jest.fn(),
    commitPendingEnrollment: jest.fn(),
    save: jest.fn(value => value),
    setDefaultUsername: jest.fn(username => ({
      defaultUsername: username
    })),
    remove: jest.fn().mockReturnValue(true),
    ...overrides.credentialStore
  };
  const credentialStore =
    overrides.credentialStore instanceof StableOverlayRoutingCredentials
      ? overrides.credentialStore
      : defaultCredentialStore;
  const client = {
    getStatus: jest.fn().mockReturnValue({
      state: 'active',
      revision: 3,
      lastSuccessfulHeartbeat: '2026-07-27T10:00:30.000Z'
    }),
    start: jest.fn().mockResolvedValue({
      state: 'active',
      revision: 1,
      lastSuccessfulHeartbeat: '2026-07-27T10:00:00.000Z'
    }),
    stop: jest.fn().mockResolvedValue({
      state: 'offline',
      revision: null,
      lastSuccessfulHeartbeat: '2026-07-27T10:00:30.000Z'
    }),
    ...overrides.client
  };
  const apiLimiter = overrides.apiLimiter ||
    jest.fn((_req, _res, next) => next());
  const logger = overrides.logger || {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };
  const lifecycle = overrides.lifecycle || {
    captureMutationGeneration: jest.fn(() => 0),
    isMutationGenerationActive: jest.fn(generation => generation === 0)
  };
  const app = express();
  app.use(express.json());
  registerStableOverlayRoutingRoutes({
    app,
    apiLimiter,
    fetch,
    verifyClerkSessionToken,
    credentialStore,
    client,
    config: {
      enabled: Object.prototype.hasOwnProperty.call(overrides, 'enabled')
        ? overrides.enabled
        : true,
      apiOrigin: API_ORIGIN,
      allowInsecureLocalTestOrigin: true
    },
    logger,
    now: () => Date.parse('2026-07-27T10:01:00.000Z'),
    timers: overrides.timers,
    requestTimeoutMs: overrides.requestTimeoutMs,
    abortControllerFactory: overrides.abortControllerFactory,
    getClerkAuthorizedParties: overrides.getClerkAuthorizedParties ||
      (() => ['http://127.0.0.1:3000']),
    lifecycle
  });

  return {
    app,
    apiLimiter,
    client,
    credentialStore,
    fetch,
    logger,
    lifecycle,
    timers: overrides.timers,
    verifyClerkSessionToken
  };
}

function authorized(agent, token = TOKEN) {
  return agent.set('Authorization', `Bearer ${token}`);
}

function flushTurn() {
  return new Promise(resolve => setImmediate(resolve));
}

describe('stable overlay routing local routes', () => {
  test('keeps the feature disabled by default without authenticating or forwarding', async () => {
    const harness = createHarness({ enabled: undefined });

    const status = await request(harness.app)
      .get('/api/stable-overlay-routing/status');
    const account = await authorized(
      request(harness.app).get('/api/stable-overlay-routing/account')
    );

    expect(status.status).toBe(200);
    expect(status.body).toEqual({
      success: true,
      status: {
        state: 'active',
        revision: 3,
        lastSuccessfulHeartbeat: '2026-07-27T10:00:30.000Z'
      }
    });
    expect(account.status).toBe(503);
    expect(account.body).toEqual({
      success: false,
      code: 'STABLE_ROUTING_DISABLED',
      error: 'Stable overlay routing is disabled.'
    });
    expect(harness.verifyClerkSessionToken).not.toHaveBeenCalled();
    expect(harness.fetch).not.toHaveBeenCalled();
  });

  test('requires a fresh bearer token and verifies every management request locally', async () => {
    const harness = createHarness();

    const missing = await request(harness.app)
      .get('/api/stable-overlay-routing/account');
    const malformed = await request(harness.app)
      .get('/api/stable-overlay-routing/account')
      .set('Authorization', TOKEN);
    const first = await authorized(
      request(harness.app).get('/api/stable-overlay-routing/account'),
      TOKEN
    );
    const second = await authorized(
      request(harness.app).get('/api/stable-overlay-routing/account'),
      OTHER_TOKEN
    );

    expect(missing.status).toBe(401);
    expect(malformed.status).toBe(401);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(harness.verifyClerkSessionToken).toHaveBeenCalledTimes(2);
    expect(harness.verifyClerkSessionToken.mock.calls.map(call => call[0]))
      .toEqual([TOKEN, OTHER_TOKEN]);
    for (const [, options] of harness.verifyClerkSessionToken.mock.calls) {
      expect(options).toMatchObject({
        requireAuthorizedParty: true,
        includeRequestAuthorizedParties: false
      });
      expect(options.authorizedParties).toEqual([
        'http://127.0.0.1:3000'
      ]);
    }
    expect(harness.fetch).toHaveBeenCalledTimes(2);
    expect(harness.fetch.mock.calls.map(call => call[1].headers))
      .toEqual([
        { Authorization: `Bearer ${TOKEN}` },
        { Authorization: `Bearer ${OTHER_TOKEN}` }
      ]);
    expect(JSON.stringify(harness.credentialStore.save.mock.calls))
      .not.toContain(TOKEN);
    expect(JSON.stringify(harness.credentialStore.save.mock.calls))
      .not.toContain(OTHER_TOKEN);
  });

  test('fences persisted pending enrollment after restart until account reconciliation succeeds', async () => {
    const configDir = fs.mkdtempSync(path.join(
      os.tmpdir(),
      'ltth-stable-routing-restart-'
    ));
    const pluginsDir = path.join(configDir, 'plugins');
    fs.mkdirSync(pluginsDir);
    const configPathManager = {
      getDefaultConfigDir: () => configDir,
      getPluginsDir: () => pluginsDir
    };
    const profileId = 'restart-profile';
    const sourceRoot = path.join(configDir, 'source');
    const active = {
      deviceId: 'd-active-device',
      credential: 'a'.repeat(64),
      enrolledAt: '2026-07-27T09:00:00.000Z',
      label: 'Active PC',
      defaultUsername: 'active.creator'
    };
    const pending = {
      deviceId: 'd-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      credential: 'b'.repeat(64),
      enrolledAt: '2026-07-27T10:00:00.000Z',
      label: 'Pending PC',
      defaultUsername: null
    };

    try {
      const initialStore = new StableOverlayRoutingCredentials({
        configPathManager,
        profileId,
        sourceRoot
      });
      initialStore.save(active);
      initialStore.stageEnrollment(pending);
      const restartedStore = new StableOverlayRoutingCredentials({
        configPathManager,
        profileId,
        sourceRoot
      });
      const fetch = jest.fn((url) => {
        if (url.endsWith('/account')) {
          return Promise.resolve(jsonResponse({
            claims: [],
            devices: [],
            lease: { active: false }
          }));
        }
        return Promise.resolve(jsonResponse({
          claim: activeClaim('after.refresh')
        }, 201));
      });
      const harness = createHarness({
        credentialStore: restartedStore,
        fetch
      });

      const fenced = await authorized(
        request(harness.app)
          .post('/api/stable-overlay-routing/claims')
          .send({ username: 'before.refresh' })
      );

      expect(fenced.status).toBe(409);
      expect(fenced.body).toEqual({
        success: false,
        code: 'STABLE_ROUTING_RECONCILIATION_REQUIRED',
        error: 'Refresh stable overlay routing account state before making another change.'
      });
      expect(harness.verifyClerkSessionToken).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
      expect(restartedStore.load()).toEqual(active);
      expect(restartedStore.loadPendingEnrollment()).toEqual(pending);

      const account = await authorized(
        request(harness.app)
          .get('/api/stable-overlay-routing/account')
      );
      const permitted = await authorized(
        request(harness.app)
          .post('/api/stable-overlay-routing/claims')
          .send({ username: 'after.refresh' })
      );

      expect(account.status).toBe(200);
      expect(permitted.status).toBe(201);
      expect(restartedStore.load()).toEqual(active);
      expect(restartedStore.loadPendingEnrollment()).toEqual(pending);
      expect(harness.verifyClerkSessionToken).toHaveBeenCalledTimes(2);
      expect(fetch).toHaveBeenCalledTimes(2);
      const browserVisible = JSON.stringify([
        fenced.body,
        account.body,
        permitted.body
      ]);
      expect(browserVisible).not.toContain(active.credential);
      expect(browserVisible).not.toContain(pending.credential);
      expect(browserVisible).not.toContain(TOKEN);
      expect(JSON.stringify(harness.logger)).not.toContain(
        pending.credential
      );
    } finally {
      fs.rmSync(configDir, { recursive: true, force: true });
    }
  });

  test('rejects a locally invalid Clerk token without forwarding it', async () => {
    const verifyClerkSessionToken = jest.fn().mockRejectedValue(
      Object.assign(new Error('JWT expired with sensitive detail'), {
        code: 'CLERK_TOKEN_INVALID'
      })
    );
    const harness = createHarness({ verifyClerkSessionToken });

    const response = await authorized(
      request(harness.app).post('/api/stable-overlay-routing/claims')
        .send({ username: 'pup.cid' })
    );

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      success: false,
      code: 'AUTH_REQUIRED',
      error: 'Sign in again to manage stable overlay routing.'
    });
    expect(JSON.stringify(response.body)).not.toContain('sensitive');
    expect(harness.fetch).not.toHaveBeenCalled();
  });

  test('accepts a real hosted-bridge token and rejects an arbitrary CORS origin token', async () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048
    });
    const publicPem = publicKey.export({ type: 'spki', format: 'pem' });
    const privatePem = privateKey.export({
      type: 'pkcs8',
      format: 'pem'
    });
    const env = {
      CLERK_JWT_KEY: publicPem,
      CLERK_ISSUER: 'https://clerk.ltth.app',
      LTTH_AUTH_BRIDGE_URL: 'https://ltth.app/auth/',
      LTTH_ACCOUNT_PORTAL_URL: 'https://ltth.app/auth/'
    };
    const sign = azp => jwt.sign({
      sub: 'user_123',
      sid: 'session_123',
      iss: env.CLERK_ISSUER,
      azp
    }, privatePem, {
      algorithm: 'RS256',
      expiresIn: '1h'
    });
    const harness = createHarness({
      verifyClerkSessionToken: (token, options) =>
        verifyRealClerkSessionToken(token, {
          ...options,
          env
        }),
      getClerkAuthorizedParties: () =>
        buildStableOverlayClerkAuthorizedParties(
          buildStoreAuthConfig(env)
        )
    });

    const hosted = await authorized(
      request(harness.app)
        .get('/api/stable-overlay-routing/account'),
      sign('https://ltth.app')
    );
    const corsExtra = await authorized(
      request(harness.app)
        .get('/api/stable-overlay-routing/account'),
      sign('https://user-cors.example')
    );

    expect(hosted.status).toBe(200);
    expect(corsExtra.status).toBe(401);
    expect(harness.fetch).toHaveBeenCalledTimes(1);
  });

  test('authenticates before revealing request-schema decisions', async () => {
    const harness = createHarness();

    const response = await request(harness.app)
      .post('/api/stable-overlay-routing/claims')
      .send({
        username: '../admin',
        endpoint: 'https://evil.example'
      });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('AUTH_REQUIRED');
    expect(harness.verifyClerkSessionToken).not.toHaveBeenCalled();
    expect(harness.fetch).not.toHaveBeenCalled();
  });

  test.each([
    ['POST', '/api/stable-overlay-routing/devices/enroll', { label: 'PC', tunnelOrigin: 'https://evil.example' }],
    ['POST', '/api/stable-overlay-routing/devices/enroll', { label: '' }],
    ['POST', '/api/stable-overlay-routing/claims', { username: 'pup.cid', endpoint: 'https://evil.example' }],
    ['POST', '/api/stable-overlay-routing/claims', { username: '../admin' }],
    ['POST', '/api/stable-overlay-routing/claims/pup.cid/restore', { deviceId: 'd-hostile' }],
    ['DELETE', '/api/stable-overlay-routing/claims/pup.cid', { username: 'other.user' }],
    ['DELETE', '/api/stable-overlay-routing/devices/d-safe', { tunnelOrigin: 'https://evil.example' }],
    ['PUT', '/api/stable-overlay-routing/default-username', { username: 'pup.cid', credential: 'secret' }]
  ])('rejects strict %s %s schemas after local auth and before forwarding', async (method, pathname, body) => {
    const harness = createHarness();
    const pending = request(harness.app)[method.toLowerCase()](pathname)
      .set('Authorization', `Bearer ${TOKEN}`)
      .set('Content-Type', 'application/json')
      .send(body);
    const response = await pending;

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      code: 'INVALID_REQUEST',
      error: 'Invalid stable overlay routing request.'
    });
    expect(harness.verifyClerkSessionToken).toHaveBeenCalledTimes(1);
    expect(harness.fetch).not.toHaveBeenCalled();
  });

  test.each([
    ['put', '/api/stable-overlay-routing/lease'],
    ['delete', '/api/stable-overlay-routing/lease'],
    ['get', '/api/stable-overlay-routing/device/status'],
    ['post', '/api/stable-overlay-routing/admin/claims/pup.cid/release'],
    ['post', '/api/stable-overlay-routing/tunnel']
  ])('does not expose browser-controlled device or infrastructure operation %s %s', async (method, pathname) => {
    const harness = createHarness();

    const response = await authorized(
      request(harness.app)[method](pathname).send({
        deviceId: 'd-hostile',
        credential: 'b'.repeat(64),
        tunnelOrigin: 'https://evil.trycloudflare.com',
        endpoint: 'https://evil.example'
      })
    );

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      code: 'NOT_FOUND',
      error: 'Not found.'
    });
    expect(harness.verifyClerkSessionToken).not.toHaveBeenCalled();
    expect(harness.fetch).not.toHaveBeenCalled();
  });

  test('forwards only the exact account endpoint and sanitizes account state', async () => {
    const fetch = jest.fn().mockResolvedValue(jsonResponse({
      claims: [{
        ...activeClaim(),
        routeKey: 'do-not-leak',
        clerkUserId: 'user_123'
      }],
      devices: [{
        ...enrolledDevice(),
        tokenHash: 'do-not-leak',
        credential: 'do-not-leak'
      }],
      lease: {
        active: true,
        deviceId: 'd-0123456789abcdef',
        instanceId: 'instance-1',
        revision: 3,
        updatedAt: '2026-07-27T10:00:30.000Z',
        expiresAt: '2026-07-27T10:02:30.000Z',
        tunnelOrigin: 'https://private.trycloudflare.com'
      },
      secret: 'hostile top-level field'
    }));
    const harness = createHarness({ fetch });

    const response = await authorized(
      request(harness.app).get('/api/stable-overlay-routing/account')
    );

    expect(fetch).toHaveBeenCalledWith(
      `${WORKER_PREFIX}/account`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${TOKEN}` },
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: expect.any(AbortSignal)
      }
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      account: {
        claims: [activeClaim()],
        devices: [enrolledDevice()],
        lease: {
          active: true,
          deviceId: 'd-0123456789abcdef',
          instanceId: 'instance-1',
          revision: 3,
          updatedAt: '2026-07-27T10:00:30.000Z',
          expiresAt: '2026-07-27T10:02:30.000Z'
        }
      },
      defaultUsername: null
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /credential|tokenHash|routeKey|clerkUserId|tunnelOrigin|hostile/
    );
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  test('stages desktop-generated enrollment material before dispatch and returns metadata only', async () => {
    const fetch = jest.fn().mockImplementation((_url, options) => {
      const enrollment = JSON.parse(options.body);
      return Promise.resolve(jsonResponse({
        device: {
          ...enrolledDevice(),
          deviceId: enrollment.deviceId,
          label: enrollment.label
        }
      }, 201, {
        'Set-Cookie': 'worker-secret=bad',
        'X-Upstream-Secret': 'bad'
      }));
    });
    const harness = createHarness({
      fetch,
      credentialStore: {
        load: jest.fn().mockReturnValue(null),
        loadPendingEnrollment: jest.fn().mockReturnValue(null)
      }
    });

    const response = await authorized(
      request(harness.app)
        .post('/api/stable-overlay-routing/devices/enroll')
        .send({ label: '  Studio PC  ' })
    );

    const staged = harness.credentialStore.stageEnrollment.mock.calls[0][0];
    expect(staged).toEqual({
      deviceId: expect.stringMatching(/^d-[a-f0-9]{32}$/),
      credential: expect.stringMatching(/^[a-f0-9]{64}$/),
      enrolledAt: '2026-07-27T10:01:00.000Z',
      label: 'Studio PC',
      defaultUsername: null
    });
    expect(
      harness.credentialStore.stageEnrollment.mock.invocationCallOrder[0]
    ).toBeLessThan(fetch.mock.invocationCallOrder[0]);
    expect(fetch).toHaveBeenCalledWith(
      `${WORKER_PREFIX}/devices/enroll`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          deviceId: staged.deviceId,
          credential: staged.credential,
          label: staged.label
        })
      })
    );
    expect(harness.credentialStore.commitPendingEnrollment)
      .toHaveBeenCalledWith(expect.objectContaining({
        deviceId: staged.deviceId,
        label: staged.label
      }));
    expect(harness.credentialStore.save).not.toHaveBeenCalled();
    expect(harness.client.start).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      success: true,
      device: {
        ...enrolledDevice(),
        deviceId: staged.deviceId
      },
      status: {
        state: 'active',
        revision: 3,
        lastSuccessfulHeartbeat: '2026-07-27T10:00:30.000Z'
      }
    });
    expect(JSON.stringify(response.body)).not.toContain(staged.credential);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.headers['x-upstream-secret']).toBeUndefined();
    expect(JSON.stringify(harness.logger)).not.toContain(staged.credential);
  });

  test('reuses pending enrollment material after account reconciliation shows no committed device', async () => {
    let pending = null;
    const requestBodies = [];
    const credentialStore = {
      load: jest.fn().mockReturnValue(null),
      loadPendingEnrollment: jest.fn(() => pending),
      stageEnrollment: jest.fn(value => {
        pending = value;
      }),
      commitPendingEnrollment: jest.fn(() => {
        pending = null;
      }),
      save: jest.fn(),
      setDefaultUsername: jest.fn(),
      remove: jest.fn()
    };
    const fetch = jest.fn((url, options) => {
      if (url.endsWith('/devices/enroll')) {
        const body = JSON.parse(options.body);
        requestBodies.push(body);
        if (requestBodies.length === 1) {
          return Promise.reject(new Error('response lost'));
        }
        return Promise.resolve(jsonResponse({
          device: {
            ...enrolledDevice(),
            deviceId: body.deviceId,
            label: body.label
          }
        }, 201));
      }
      return Promise.resolve(jsonResponse({
        claims: [],
        devices: [],
        lease: { active: false }
      }));
    });
    const harness = createHarness({ credentialStore, fetch });

    const first = await authorized(
      request(harness.app)
        .post('/api/stable-overlay-routing/devices/enroll')
        .send({ label: 'Retry PC' })
    );
    expect(first.status).toBe(503);
    expect(first.body.code).toBe(
      'STABLE_ROUTING_RECONCILIATION_REQUIRED'
    );
    expect(pending).not.toBeNull();

    const fenced = await authorized(
      request(harness.app)
        .post('/api/stable-overlay-routing/claims')
        .send({ username: 'blocked.claim' })
    );
    expect(fenced.status).toBe(409);
    expect(fenced.body.code).toBe(
      'STABLE_ROUTING_RECONCILIATION_REQUIRED'
    );

    const account = await authorized(
      request(harness.app)
        .get('/api/stable-overlay-routing/account')
    );
    expect(account.status).toBe(200);
    expect(pending).not.toBeNull();

    const retry = await authorized(
      request(harness.app)
        .post('/api/stable-overlay-routing/devices/enroll')
        .send({ label: 'Changed label is ignored' })
    );
    expect(retry.status).toBe(201);
    expect(requestBodies).toHaveLength(2);
    expect(requestBodies[1]).toEqual(requestBodies[0]);
    expect(credentialStore.stageEnrollment).toHaveBeenCalledTimes(1);
    expect(credentialStore.commitPendingEnrollment)
      .toHaveBeenCalledTimes(1);
    expect(pending).toBeNull();
  });

  test('promotes a pending enrollment when account reconciliation finds its committed device', async () => {
    const pending = {
      deviceId: 'd-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      credential: 'b'.repeat(64),
      enrolledAt: '2026-07-27T10:00:00.000Z',
      label: 'Recovered PC',
      defaultUsername: null
    };
    const credentialStore = {
      load: jest.fn().mockReturnValue(null),
      loadPendingEnrollment: jest.fn().mockReturnValue(pending),
      stageEnrollment: jest.fn(),
      commitPendingEnrollment: jest.fn(),
      save: jest.fn(),
      setDefaultUsername: jest.fn(),
      remove: jest.fn()
    };
    const fetch = jest.fn().mockResolvedValue(jsonResponse({
      claims: [],
      devices: [{
        ...enrolledDevice(),
        deviceId: pending.deviceId,
        label: pending.label
      }],
      lease: { active: false }
    }));
    const harness = createHarness({ credentialStore, fetch });

    const response = await authorized(
      request(harness.app)
        .get('/api/stable-overlay-routing/account')
    );

    expect(response.status).toBe(200);
    expect(harness.client.stop).toHaveBeenCalledTimes(1);
    expect(credentialStore.commitPendingEnrollment).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceId: pending.deviceId,
        label: pending.label
      })
    );
    expect(harness.client.start).toHaveBeenCalledTimes(1);
  });

  test.each([
    [{}, 'missing'],
    [{ 'Content-Type': 'text/html' }, 'non-JSON'],
    [{
      'Content-Type': 'application/json',
      'Content-Length': String((64 * 1024) + 1)
    }, 'oversized']
  ])('rejects %s upstream response metadata before consuming credentials', async (headers) => {
    const credential = 'c'.repeat(64);
    const response = new Response(JSON.stringify({
      device: enrolledDevice(),
      credential
    }), {
      status: 201,
      headers
    });
    const text = jest.spyOn(response, 'text');
    const harness = createHarness({
      fetch: jest.fn().mockResolvedValue(response)
    });

    const result = await authorized(
      request(harness.app)
        .post('/api/stable-overlay-routing/devices/enroll')
        .send({ label: 'Studio PC' })
    );

    expect(result.status).toBe(503);
    expect(harness.credentialStore.save).not.toHaveBeenCalled();
    expect(text).not.toHaveBeenCalled();
  });

  test.each([
    ['invalid metadata', 201, null, 503],
    ['authentication rejection', 401, 'application/json', 401],
    ['unexpected success status', 200, 'application/json', 503],
    ['upstream error mapping', 500, 'application/json', 503]
  ])('releases an endless upstream body promptly on %s', async (
    _name,
    status,
    contentType,
    expectedStatus
  ) => {
    const cancel = jest.fn(() => new Promise(() => {}));
    const upstream = endlessResponse({ status, contentType, cancel });
    let upstreamSignal;
    const harness = createHarness({
      fetch: jest.fn((_url, options) => {
        upstreamSignal = options.signal;
        return Promise.resolve(upstream);
      })
    });

    const pending = authorized(
      request(harness.app)
        .post('/api/stable-overlay-routing/devices/enroll')
        .send({ label: 'Studio PC' })
    ).then(response => response);
    const result = await pending;

    expect(result.status).toBe(expectedStatus);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(upstreamSignal.aborted).toBe(true);
    expect(harness.credentialStore.save).not.toHaveBeenCalled();
  });

  test('releases a body attached to an expected no-content response', async () => {
    const cancel = jest.fn(() => new Promise(() => {}));
    const upstream = endlessResponse({
      status: 204,
      contentType: null,
      cancel
    });
    let upstreamSignal;
    const harness = createHarness({
      fetch: jest.fn((_url, options) => {
        upstreamSignal = options.signal;
        return Promise.resolve(upstream);
      }),
      credentialStore: {
        load: jest.fn().mockReturnValue({
          deviceId: 'd-other',
          credential: 'a'.repeat(64),
          enrolledAt: '2026-07-27T10:00:00.000Z',
          label: 'Other PC',
          defaultUsername: null
        })
      }
    });

    const result = await authorized(
      request(harness.app)
        .delete('/api/stable-overlay-routing/devices/d-old')
        .send({})
    );

    expect(result.status).toBe(200);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(upstreamSignal.aborted).toBe(true);
  });

  test('caps streaming upstream bodies before reading an oversized tail', async () => {
    const firstChunk = new Uint8Array(64 * 1024);
    let reads = 0;
    const response = {
      ok: true,
      status: 201,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      body: {
        getReader: () => ({
          read: jest.fn(async () => {
            reads += 1;
            if (reads === 1) {
              return { done: false, value: firstChunk };
            }
            return {
              done: false,
              value: new TextEncoder().encode('hostile-tail')
            };
          }),
          cancel: jest.fn()
        })
      },
      text: jest.fn(() => {
        throw new Error('must not buffer the body with response.text()');
      })
    };
    const harness = createHarness({
      fetch: jest.fn().mockResolvedValue(response)
    });

    const result = await authorized(
      request(harness.app)
        .post('/api/stable-overlay-routing/devices/enroll')
        .send({ label: 'Studio PC' })
    );

    expect(result.status).toBe(503);
    expect(reads).toBe(2);
    expect(response.text).not.toHaveBeenCalled();
    expect(harness.credentialStore.save).not.toHaveBeenCalled();
  });

  test('times out a stalled enrollment fetch and fences its late credential', async () => {
    const timers = new ManualTimers();
    const pendingFetch = deferred();
    const lateCancel = jest.fn(() => new Promise(() => {}));
    const fetch = jest.fn(() => pendingFetch.promise);
    const harness = createHarness({
      fetch,
      timers,
      requestTimeoutMs: 1_000
    });

    const pendingResponse = authorized(
      request(harness.app)
        .post('/api/stable-overlay-routing/devices/enroll')
        .send({ label: 'Studio PC' })
    ).then(response => response);
    for (let index = 0; index < 20 && fetch.mock.calls.length === 0; index += 1) {
      await flushTurn();
    }

    await timers.advance(1_000);
    let settled = false;
    pendingResponse.then(() => {
      settled = true;
    });
    await flushTurn();
    const settledAtDeadline = settled;

    pendingFetch.resolve(endlessResponse({
      status: 201,
      cancel: lateCancel
    }));
    const response = await pendingResponse;
    await flushTurn();

    expect(settledAtDeadline).toBe(true);
    expect(response.status).toBe(503);
    expect(response.body.code).toBe(
      'STABLE_ROUTING_RECONCILIATION_REQUIRED'
    );
    expect(harness.credentialStore.stageEnrollment)
      .toHaveBeenCalledTimes(1);
    expect(harness.credentialStore.commitPendingEnrollment)
      .not.toHaveBeenCalled();
    expect(harness.credentialStore.save).not.toHaveBeenCalled();
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(lateCancel).toHaveBeenCalledTimes(1);
  });

  test('times out stalled body consumption and fences its late credential', async () => {
    const timers = new ManualTimers();
    const body = deferred();
    let bodyStarted = false;
    const response = {
      ok: true,
      status: 201,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      body: {
        getReader: () => ({
          read: () => {
            bodyStarted = true;
            return body.promise;
          },
          cancel: jest.fn()
        })
      },
      text: () => {
        bodyStarted = true;
        return body.promise.then(result =>
          new TextDecoder().decode(result.value)
        );
      }
    };
    const fetch = jest.fn().mockResolvedValue(response);
    const harness = createHarness({
      fetch,
      timers,
      requestTimeoutMs: 1_000
    });

    const pendingResponse = authorized(
      request(harness.app)
        .post('/api/stable-overlay-routing/devices/enroll')
        .send({ label: 'Studio PC' })
    ).then(result => result);
    for (let index = 0; index < 20 && !bodyStarted; index += 1) {
      await flushTurn();
    }
    expect(bodyStarted).toBe(true);

    await timers.advance(1_000);
    let settled = false;
    pendingResponse.then(() => {
      settled = true;
    });
    await flushTurn();
    const settledAtDeadline = settled;

    body.resolve({
      done: false,
      value: new TextEncoder().encode(JSON.stringify({
        device: enrolledDevice(),
        credential: 'e'.repeat(64)
      }))
    });
    const result = await pendingResponse;

    expect(settledAtDeadline).toBe(true);
    expect(result.status).toBe(503);
    expect(result.body.code).toBe(
      'STABLE_ROUTING_RECONCILIATION_REQUIRED'
    );
    expect(harness.credentialStore.stageEnrollment)
      .toHaveBeenCalledTimes(1);
    expect(harness.credentialStore.commitPendingEnrollment)
      .not.toHaveBeenCalled();
    expect(harness.credentialStore.save).not.toHaveBeenCalled();
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  });

  test('quiesces the old client before replacing and activating enrollment', async () => {
    const oldRecord = {
      deviceId: 'd-old',
      credential: 'a'.repeat(64),
      enrolledAt: '2026-07-27T09:00:00.000Z',
      label: 'Old PC',
      defaultUsername: 'pup.cid'
    };
    let stored = oldRecord;
    let pending = null;
    let activeDeviceId = oldRecord.deviceId;
    const events = [];
    const credentialStore = {
      load: jest.fn(() => stored),
      loadPendingEnrollment: jest.fn(() => pending),
      stageEnrollment: jest.fn(record => {
        pending = record;
      }),
      commitPendingEnrollment: jest.fn(device => {
        stored = {
          ...pending,
          enrolledAt: device.createdAt,
          label: device.label
        };
        pending = null;
        events.push(`commit:${stored.deviceId}`);
      }),
      save: jest.fn(),
      setDefaultUsername: jest.fn(),
      remove: jest.fn()
    };
    const client = {
      getStatus: jest.fn(() => ({
        state: 'active',
        revision: 1,
        lastSuccessfulHeartbeat: null
      })),
      stop: jest.fn(async () => {
        events.push(`stop:${activeDeviceId}`);
        activeDeviceId = null;
      }),
      start: jest.fn(async () => {
        activeDeviceId = credentialStore.load().deviceId;
        events.push(`start:${activeDeviceId}`);
      })
    };
    const harness = createHarness({
      credentialStore,
      client,
      fetch: jest.fn().mockImplementation((_url, options) => {
        const enrollment = JSON.parse(options.body);
        return Promise.resolve(jsonResponse({
          device: {
            ...enrolledDevice(),
            deviceId: enrollment.deviceId,
            label: enrollment.label
          }
        }, 201));
      })
    });

    const response = await authorized(
      request(harness.app)
        .post('/api/stable-overlay-routing/devices/enroll')
        .send({ label: 'New PC' })
    );

    expect(response.status).toBe(201);
    expect(events).toEqual([
      'stop:d-old',
      `commit:${stored.deviceId}`,
      `start:${stored.deviceId}`
    ]);
    expect(stored.deviceId).toMatch(/^d-[a-f0-9]{32}$/);
    expect(activeDeviceId).toBe(stored.deviceId);
  });

  test('rejects a concurrent enrollment before creating a second Worker device', async () => {
    const firstUpstream = deferred();
    let firstEnrollment;
    const fetch = jest.fn()
      .mockImplementationOnce((_url, options) => {
        firstEnrollment = JSON.parse(options.body);
        return firstUpstream.promise;
      });
    const harness = createHarness({ fetch });

    const first = authorized(
      request(harness.app)
        .post('/api/stable-overlay-routing/devices/enroll')
        .send({ label: 'First PC' })
    ).then(response => response);
    for (let index = 0; index < 20 && fetch.mock.calls.length === 0; index += 1) {
      await flushTurn();
    }
    const second = authorized(
      request(harness.app)
        .post('/api/stable-overlay-routing/devices/enroll')
        .send({ label: 'Second PC' })
    ).then(response => response);
    for (let index = 0; index < 20 && fetch.mock.calls.length < 2; index += 1) {
      await flushTurn();
    }

    firstUpstream.resolve(jsonResponse({
      device: {
        ...enrolledDevice(),
        deviceId: firstEnrollment.deviceId,
        label: firstEnrollment.label
      }
    }, 201));
    const responses = await Promise.all([first, second]);

    expect(responses.map(response => response.status).sort()).toEqual([
      201,
      409
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(harness.credentialStore.commitPendingEnrollment)
      .toHaveBeenCalledTimes(1);
    expect(JSON.stringify(responses)).not.toMatch(/"credential"/);
  });

  test('fences an enrollment that resumes after lifecycle shutdown', async () => {
    const upstream = deferred();
    const cancel = jest.fn(() => new Promise(() => {}));
    let upstreamSignal;
    const client = {
      getStatus: jest.fn().mockReturnValue({
        state: 'offline',
        revision: null,
        lastSuccessfulHeartbeat: null
      }),
      start: jest.fn(),
      stop: jest.fn().mockResolvedValue({ state: 'offline' })
    };
    const networkManager = { shutdown: jest.fn() };
    const lifecycle = createStableOverlayRoutingLifecycle({
      client,
      networkManager,
      enabled: true,
      logger: { warn: jest.fn(), error: jest.fn() }
    });
    const harness = createHarness({
      client,
      lifecycle,
      fetch: jest.fn((_url, options) => {
        upstreamSignal = options.signal;
        return upstream.promise;
      })
    });

    const enrolling = authorized(
      request(harness.app)
        .post('/api/stable-overlay-routing/devices/enroll')
        .send({ label: 'New PC' })
    ).then(response => response);
    for (
      let index = 0;
      index < 20 && harness.fetch.mock.calls.length === 0;
      index += 1
    ) {
      await flushTurn();
    }

    await lifecycle.shutdown();
    upstream.resolve(endlessResponse({
      status: 201,
      cancel
    }));
    const response = await enrolling;

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      success: false,
      code: 'STABLE_ROUTING_SHUTTING_DOWN',
      error: 'Stable overlay routing is shutting down.'
    });
    expect(client.stop).toHaveBeenCalledTimes(1);
    expect(client.start).not.toHaveBeenCalled();
    expect(harness.credentialStore.save).not.toHaveBeenCalled();
    expect(networkManager.shutdown).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(upstreamSignal.aborted).toBe(true);
  });

  test.each([
    ['post', '/api/stable-overlay-routing/devices/enroll', { label: 'PC' }],
    ['post', '/api/stable-overlay-routing/claims', { username: 'pup.cid' }],
    ['post', '/api/stable-overlay-routing/claims/pup.cid/restore', {}],
    ['delete', '/api/stable-overlay-routing/claims/pup.cid', { username: 'pup.cid' }],
    ['delete', '/api/stable-overlay-routing/devices/d-old', {}],
    ['put', '/api/stable-overlay-routing/default-username', { username: 'pup.cid' }]
  ])('rejects state-changing %s %s after shutdown begins', async (
    method,
    pathname,
    body
  ) => {
    const client = {
      getStatus: jest.fn().mockReturnValue({ state: 'offline' }),
      start: jest.fn(),
      stop: jest.fn().mockResolvedValue({ state: 'offline' })
    };
    const lifecycle = createStableOverlayRoutingLifecycle({
      client,
      networkManager: { shutdown: jest.fn() },
      enabled: true,
      logger: { warn: jest.fn(), error: jest.fn() }
    });
    const harness = createHarness({ client, lifecycle });
    await lifecycle.shutdown();

    const response = await authorized(
      request(harness.app)[method](pathname).send(body)
    );

    expect(response.status).toBe(503);
    expect(response.body.code).toBe('STABLE_ROUTING_SHUTTING_DOWN');
    expect(harness.fetch).not.toHaveBeenCalled();
    expect(harness.credentialStore.save).not.toHaveBeenCalled();
    expect(harness.credentialStore.remove).not.toHaveBeenCalled();
    expect(harness.credentialStore.setDefaultUsername).not.toHaveBeenCalled();
    expect(client.start).not.toHaveBeenCalled();
  });

  test('serializes enroll-new against revoke-old without removing the new identity', async () => {
    const stopOld = deferred();
    let stored = {
      deviceId: 'd-old',
      credential: 'a'.repeat(64),
      enrolledAt: '2026-07-27T09:00:00.000Z',
      label: 'Old PC',
      defaultUsername: null
    };
    let pending = null;
    let activeDeviceId = stored.deviceId;
    const events = [];
    const credentialStore = {
      load: jest.fn(() => stored),
      loadPendingEnrollment: jest.fn(() => pending),
      stageEnrollment: jest.fn(record => {
        pending = record;
      }),
      commitPendingEnrollment: jest.fn(device => {
        stored = {
          ...pending,
          enrolledAt: device.createdAt,
          label: device.label
        };
        pending = null;
        events.push(`commit:${stored.deviceId}`);
      }),
      save: jest.fn(),
      setDefaultUsername: jest.fn(),
      remove: jest.fn(() => {
        events.push(`remove:${stored?.deviceId}`);
        stored = null;
      })
    };
    const client = {
      getStatus: jest.fn(() => ({
        state: 'active',
        revision: 1,
        lastSuccessfulHeartbeat: null
      })),
      stop: jest.fn(async () => {
        events.push(`stop:${activeDeviceId}`);
        await stopOld.promise;
        activeDeviceId = null;
      }),
      start: jest.fn(async () => {
        activeDeviceId = credentialStore.load().deviceId;
        events.push(`start:${activeDeviceId}`);
      })
    };
    const fetch = jest.fn((url, options) => {
      if (url.endsWith('/devices/enroll')) {
        const enrollment = JSON.parse(options.body);
        return Promise.resolve(jsonResponse({
          device: {
            ...enrolledDevice(),
            deviceId: enrollment.deviceId,
            label: enrollment.label
          }
        }, 201));
      }
      return Promise.resolve(new Response(null, { status: 204 }));
    });
    const harness = createHarness({ credentialStore, client, fetch });

    const enrolling = authorized(
      request(harness.app)
        .post('/api/stable-overlay-routing/devices/enroll')
        .send({ label: 'New PC' })
    ).then(response => response);
    for (let index = 0; index < 20 && client.stop.mock.calls.length === 0; index += 1) {
      await flushTurn();
    }
    const revoking = authorized(
      request(harness.app)
        .delete('/api/stable-overlay-routing/devices/d-old')
        .send({})
    ).then(response => response);
    for (let index = 0; index < 20 && fetch.mock.calls.length < 2; index += 1) {
      await flushTurn();
    }

    stopOld.resolve();
    const [enrollResponse, revokeResponse] = await Promise.all([
      enrolling,
      revoking
    ]);

    expect([enrollResponse.status, revokeResponse.status]).toEqual([201, 200]);
    expect(stored.deviceId).toMatch(/^d-[a-f0-9]{32}$/);
    expect(activeDeviceId).toBe(stored.deviceId);
    expect(events).toEqual([
      'stop:d-old',
      `commit:${stored.deviceId}`,
      `start:${stored.deviceId}`
    ]);
    expect(credentialStore.remove).not.toHaveBeenCalled();
    expect(events).not.toContain('start:d-old');
    expect(JSON.stringify(enrollResponse.body)).not.toContain('credential');
  });

  test('does not mutate when a queued revoke outlives its request deadline', async () => {
    const timers = new ManualTimers();
    const stopOld = deferred();
    const client = {
      getStatus: jest.fn().mockReturnValue({ state: 'active', revision: 1 }),
      stop: jest.fn(() => stopOld.promise),
      start: jest.fn()
    };
    const fetch = jest.fn((url, options) => {
      if (url.endsWith('/devices/enroll')) {
        const enrollment = JSON.parse(options.body);
        return Promise.resolve(jsonResponse({
          device: {
            ...enrolledDevice(),
            deviceId: enrollment.deviceId,
            label: enrollment.label
          }
        }, 201));
      }
      return Promise.resolve(new Response(null, { status: 204 }));
    });
    const harness = createHarness({
      client,
      fetch,
      timers,
      requestTimeoutMs: 1_000
    });

    const enrolling = authorized(
      request(harness.app)
        .post('/api/stable-overlay-routing/devices/enroll')
        .send({ label: 'New PC' })
    ).then(response => response);
    for (let index = 0; index < 20 && client.stop.mock.calls.length === 0; index += 1) {
      await flushTurn();
    }
    const revoking = authorized(
      request(harness.app)
        .delete('/api/stable-overlay-routing/devices/d-0123456789abcdef')
        .send({})
    ).then(response => response);
    for (let index = 0; index < 20 && fetch.mock.calls.length < 2; index += 1) {
      await flushTurn();
    }

    await timers.advance(1_000);
    const [enrollResponse, revokeResponse] = await Promise.all([
      enrolling,
      revoking
    ]);
    stopOld.resolve();
    await flushTurn();

    expect([enrollResponse.status, revokeResponse.status]).toEqual([503, 503]);
    expect(harness.credentialStore.save).not.toHaveBeenCalled();
    expect(harness.credentialStore.remove).not.toHaveBeenCalled();
    expect(client.start).not.toHaveBeenCalled();
  });

  test('forwards normalized claim, restore, release, and revoke contracts exactly', async () => {
    const fetch = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ claim: activeClaim() }, 201))
      .mockResolvedValueOnce(jsonResponse({ claim: activeClaim() }))
      .mockResolvedValueOnce(jsonResponse({
        claim: {
          ...activeClaim(),
          state: 'cooldown',
          releaseRequestedAt: '2026-07-27T10:02:00.000Z',
          reusableAfter: '2026-08-03T10:02:00.000Z',
          updatedAt: '2026-07-27T10:02:00.000Z'
        }
      }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const harness = createHarness({
      fetch,
      credentialStore: {
        load: jest.fn().mockReturnValue({
          deviceId: 'd-other',
          credential: 'a'.repeat(64),
          enrolledAt: '2026-07-27T10:00:00.000Z',
          label: 'Other PC',
          defaultUsername: null
        })
      }
    });

    const claim = await authorized(
      request(harness.app)
        .post('/api/stable-overlay-routing/claims')
        .send({ username: '  @Pup.Cid  ' })
    );
    const restore = await authorized(
      request(harness.app)
        .post('/api/stable-overlay-routing/claims/PUP.CID/restore')
        .send({})
    );
    const release = await authorized(
      request(harness.app)
        .delete('/api/stable-overlay-routing/claims/PUP.CID')
        .send({ username: '@pup.cid' })
    );
    const revoke = await authorized(
      request(harness.app)
        .delete('/api/stable-overlay-routing/devices/d-safe')
        .send({})
    );

    expect([claim.status, restore.status, release.status, revoke.status])
      .toEqual([201, 200, 200, 200]);
    expect(fetch.mock.calls.map(([url, options]) => ({
      url,
      method: options.method,
      body: options.body
    }))).toEqual([
      {
        url: `${WORKER_PREFIX}/claims`,
        method: 'POST',
        body: JSON.stringify({ username: 'pup.cid' })
      },
      {
        url: `${WORKER_PREFIX}/claims/pup.cid/restore`,
        method: 'POST',
        body: '{}'
      },
      {
        url: `${WORKER_PREFIX}/claims/pup.cid`,
        method: 'DELETE',
        body: JSON.stringify({ username: 'pup.cid' })
      },
      {
        url: `${WORKER_PREFIX}/devices/d-safe`,
        method: 'DELETE',
        body: '{}'
      }
    ]);
    expect(harness.credentialStore.remove).not.toHaveBeenCalled();
    expect(harness.client.stop).not.toHaveBeenCalled();
  });

  test('removes only the confirmed locally enrolled device after stopping its client', async () => {
    const fetch = jest.fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(jsonResponse(
        { error: 'device_unavailable', private: 'do-not-leak' },
        404
      ));
    const harness = createHarness({ fetch });

    const confirmed = await authorized(
      request(harness.app)
        .delete('/api/stable-overlay-routing/devices/d-0123456789abcdef')
        .send({})
    );
    const failed = await authorized(
      request(harness.app)
        .delete('/api/stable-overlay-routing/devices/d-0123456789abcdef')
        .send({})
    );

    expect(confirmed.status).toBe(200);
    expect(harness.client.stop).toHaveBeenCalledTimes(1);
    expect(harness.credentialStore.remove).toHaveBeenCalledTimes(1);
    expect(failed.status).toBe(404);
    expect(failed.body).toEqual({
      success: false,
      code: 'device_unavailable',
      error: 'The stable overlay routing request could not be completed.'
    });
    expect(JSON.stringify(failed.body)).not.toContain('private');
  });

  test('removes a confirmed revoked credential even when client stop fails', async () => {
    const harness = createHarness({
      fetch: jest.fn().mockResolvedValue(new Response(null, { status: 204 })),
      client: {
        stop: jest.fn().mockRejectedValue(new Error('device credential detail'))
      }
    });

    const response = await authorized(
      request(harness.app)
        .delete('/api/stable-overlay-routing/devices/d-0123456789abcdef')
        .send({})
    );

    expect(response.status).toBe(200);
    expect(harness.credentialStore.remove).toHaveBeenCalledTimes(1);
    expect(harness.logger.warn).toHaveBeenCalledWith(
      'Stable overlay routing could not stop after device revocation.'
    );
    expect(JSON.stringify(harness.logger)).not.toContain(
      'device credential detail'
    );
  });

  test('checks the normalized default username against current active account claims', async () => {
    const fetch = jest.fn()
      .mockResolvedValueOnce(jsonResponse({
        claims: [
          activeClaim('pup.cid'),
          { ...activeClaim('old.name'), state: 'cooldown' }
        ],
        devices: [],
        lease: { active: false }
      }))
      .mockResolvedValueOnce(jsonResponse({
        claims: [
          activeClaim('pup.cid'),
          { ...activeClaim('old.name'), state: 'cooldown' }
        ],
        devices: [],
        lease: { active: false }
      }));
    const harness = createHarness({ fetch });

    const accepted = await authorized(
      request(harness.app)
        .put('/api/stable-overlay-routing/default-username')
        .send({ username: ' @Pup.Cid ' })
    );
    const rejected = await authorized(
      request(harness.app)
        .put('/api/stable-overlay-routing/default-username')
        .send({ username: 'old.name' })
    );

    expect(accepted.status).toBe(200);
    expect(accepted.body).toEqual({
      success: true,
      defaultUsername: 'pup.cid'
    });
    expect(harness.credentialStore.setDefaultUsername)
      .toHaveBeenCalledWith('pup.cid');
    expect(rejected.status).toBe(409);
    expect(rejected.body).toEqual({
      success: false,
      code: 'CLAIM_NOT_ACTIVE',
      error: 'Choose an active username claim from this account.'
    });
    expect(harness.credentialStore.setDefaultUsername).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls.every(([url]) => url === `${WORKER_PREFIX}/account`))
      .toBe(true);
  });

  test('maps hostile upstream failures to bounded no-store local errors', async () => {
    const fetch = jest.fn()
      .mockResolvedValueOnce(jsonResponse({
        error: 'not_a_real_code',
        credential: 'worker-secret',
        stack: 'C:\\private\\worker.js'
      }, 500, {
        'Set-Cookie': 'credential=worker-secret',
        'WWW-Authenticate': 'Bearer private-worker-realm',
        'X-Worker-Debug': 'private'
      }))
      .mockResolvedValueOnce(jsonResponse({
        claims: 'not-an-array',
        devices: [],
        lease: { active: false },
        credential: 'worker-secret'
      }));
    const harness = createHarness({ fetch });

    const upstreamFailure = await authorized(
      request(harness.app).get('/api/stable-overlay-routing/account')
    );
    const protocolFailure = await authorized(
      request(harness.app).get('/api/stable-overlay-routing/account')
    );

    for (const response of [upstreamFailure, protocolFailure]) {
      expect(response.status).toBe(503);
      expect(response.body).toEqual({
        success: false,
        code: 'STABLE_ROUTING_UNAVAILABLE',
        error: 'Stable overlay routing is temporarily unavailable.'
      });
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(response.headers['www-authenticate']).toBeUndefined();
      expect(response.headers['x-worker-debug']).toBeUndefined();
      expect(JSON.stringify(response.body)).not.toMatch(/worker-secret|private/);
    }
  });

  test('rejects a successful response with the wrong endpoint status', async () => {
    const harness = createHarness({
      fetch: jest.fn().mockResolvedValue(jsonResponse({
        claim: activeClaim()
      }, 200))
    });

    const response = await authorized(
      request(harness.app)
        .post('/api/stable-overlay-routing/claims')
        .send({ username: 'pup.cid' })
    );

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      success: false,
      code: 'STABLE_ROUTING_UNAVAILABLE',
      error: 'Stable overlay routing is temporarily unavailable.'
    });
  });
});

describe('stable overlay routing server lifecycle', () => {
  test('starts only after the listening hook and only when explicitly enabled', async () => {
    const client = {
      start: jest.fn().mockResolvedValue({ state: 'active' }),
      stop: jest.fn().mockResolvedValue({ state: 'offline' })
    };
    const networkManager = { shutdown: jest.fn() };
    const disabled = createStableOverlayRoutingLifecycle({
      client,
      networkManager,
      enabled: undefined,
      logger: { warn: jest.fn(), error: jest.fn() }
    });

    expect(client.start).not.toHaveBeenCalled();
    await disabled.afterServerListening();
    expect(client.start).not.toHaveBeenCalled();

    const enabled = createStableOverlayRoutingLifecycle({
      client,
      networkManager,
      enabled: 'true',
      logger: { warn: jest.fn(), error: jest.fn() }
    });
    expect(client.start).not.toHaveBeenCalled();
    await enabled.afterServerListening();
    expect(client.start).toHaveBeenCalledTimes(1);
  });

  test('awaits client stop before NetworkManager shutdown and is idempotent', async () => {
    const events = [];
    let finishStop;
    const client = {
      start: jest.fn(),
      stop: jest.fn(() => new Promise(resolve => {
        events.push('client-stop-start');
        finishStop = () => {
          events.push('client-stop-end');
          resolve();
        };
      }))
    };
    const networkManager = {
      shutdown: jest.fn(() => events.push('network-shutdown'))
    };
    const lifecycle = createStableOverlayRoutingLifecycle({
      client,
      networkManager,
      enabled: true,
      logger: { warn: jest.fn(), error: jest.fn() }
    });

    const first = lifecycle.shutdown();
    const second = lifecycle.shutdown();
    expect(first).toBe(second);
    expect(events).toEqual(['client-stop-start']);

    finishStop();
    await first;

    expect(events).toEqual([
      'client-stop-start',
      'client-stop-end',
      'network-shutdown'
    ]);
    expect(client.stop).toHaveBeenCalledTimes(1);
    expect(networkManager.shutdown).toHaveBeenCalledTimes(1);
  });

  test('never starts a deferred listening hook after shutdown begins', async () => {
    const client = {
      start: jest.fn().mockResolvedValue({ state: 'active' }),
      stop: jest.fn().mockResolvedValue({ state: 'offline' })
    };
    const lifecycle = createStableOverlayRoutingLifecycle({
      client,
      networkManager: { shutdown: jest.fn() },
      enabled: true,
      logger: { warn: jest.fn(), error: jest.fn() }
    });

    const starting = lifecycle.afterServerListening();
    const stopping = lifecycle.shutdown();
    await Promise.all([starting, stopping]);

    expect(client.start).not.toHaveBeenCalled();
    expect(client.stop).toHaveBeenCalledTimes(1);
    const generation = lifecycle.captureMutationGeneration();
    expect(lifecycle.isMutationGenerationActive(generation)).toBe(false);
  });

  test('contains start/stop failures and still shuts NetworkManager down once', async () => {
    const logger = { warn: jest.fn(), error: jest.fn() };
    const client = {
      start: jest.fn().mockRejectedValue(new Error('credential-secret')),
      stop: jest.fn().mockRejectedValue(new Error('device-secret'))
    };
    const networkManager = {
      shutdown: jest.fn(() => {
        throw new Error('network-private-detail');
      })
    };
    const lifecycle = createStableOverlayRoutingLifecycle({
      client,
      networkManager,
      enabled: true,
      logger
    });

    await expect(lifecycle.afterServerListening()).resolves.toBeUndefined();
    await expect(lifecycle.afterServerListening()).resolves.toBeUndefined();
    await expect(lifecycle.shutdown()).resolves.toBeUndefined();
    await expect(lifecycle.shutdown()).resolves.toBeUndefined();

    expect(client.start).toHaveBeenCalledTimes(1);
    expect(client.stop).toHaveBeenCalledTimes(1);
    expect(networkManager.shutdown).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      'Stable overlay routing could not start after the server began listening.'
    );
    expect(logger.error).toHaveBeenCalledWith(
      'Stable overlay routing could not stop cleanly.'
    );
    expect(logger.error).toHaveBeenCalledWith(
      'Error shutting down network manager.'
    );
    expect(JSON.stringify(logger)).not.toMatch(
      /credential-secret|device-secret|network-private-detail/
    );
  });
});
