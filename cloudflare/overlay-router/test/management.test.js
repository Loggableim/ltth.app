import { env } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import schema from './migrations/0001_initial_schema.sql?raw';
import { hashDeviceCredential } from './src/auth.js';
import { createManagementHandler } from './src/management.js';
import { createOverlayRepository } from './src/repository.js';

const BASE = 'https://overlay.ltth.app/_ltth/v1';
const PEPPER = 'test-pepper';
const START = Date.parse('2026-07-27T10:00:00.000Z');

function jsonHeaders(extra = {}) {
  return {
    'content-type': 'application/json',
    ...extra
  };
}

function clerkAuthenticator(request) {
  const clerkUserId = request.headers.get('x-test-clerk-user');
  if (!clerkUserId) {
    const error = new Error('Unauthorized');
    error.status = 401;
    throw error;
  }
  return { clerkUserId, claims: { sub: clerkUserId } };
}

function adminAuthenticator(request) {
  const auth = clerkAuthenticator(request);
  if (request.headers.get('x-test-admin') !== 'yes') {
    const error = new Error('Forbidden');
    error.status = 403;
    throw error;
  }
  return auth;
}

function proxyRepository(repository, overrides) {
  return new Proxy(repository, {
    get(target, property) {
      if (Object.hasOwn(overrides, property)) {
        return overrides[property];
      }
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}

describe('stable overlay management HTTP contract', () => {
  let repository;
  let nowMs;
  let handler;
  let enrollmentSequence;

  beforeAll(async () => {
    await env.OVERLAY_ROUTING_DB.batch(
      schema
        .split(';')
        .map((statement) => statement.trim())
        .filter(Boolean)
        .map((statement) => env.OVERLAY_ROUTING_DB.prepare(statement))
    );
    repository = createOverlayRepository(env.OVERLAY_ROUTING_DB);
  });

  beforeEach(async () => {
    await env.OVERLAY_ROUTING_DB.batch([
      env.OVERLAY_ROUTING_DB.prepare('DELETE FROM account_leases'),
      env.OVERLAY_ROUTING_DB.prepare('DELETE FROM devices'),
      env.OVERLAY_ROUTING_DB.prepare('DELETE FROM claims'),
      env.OVERLAY_ROUTING_DB.prepare('DELETE FROM audit_events'),
      env.OVERLAY_ROUTING_DB.prepare('DELETE FROM rate_limit_buckets')
    ]);
    nowMs = START;
    enrollmentSequence = 0;
    handler = createManagementHandler({
      repository,
      env: {
        OVERLAY_DEVICE_TOKEN_PEPPER: PEPPER,
        OVERLAY_MAX_ACTIVE_DEVICES_PER_ACCOUNT: '3'
      },
      now: () => nowMs,
      authenticateClerk: clerkAuthenticator,
      authenticateAdmin: adminAuthenticator
    });
  });

  function advance(milliseconds) {
    nowMs += milliseconds;
  }

  function enrollmentBody(label = 'Desktop A') {
    enrollmentSequence += 1;
    const suffix = enrollmentSequence.toString(16);
    return {
      deviceId: `d-${suffix.padStart(32, '0')}`,
      credential: suffix.padStart(64, '0'),
      label
    };
  }

  async function call(path, {
    method = 'GET',
    body,
    user,
    credential,
    deviceId,
    admin = false,
    ip = '203.0.113.10',
    host = 'overlay.ltth.app',
    headers = {},
    context
  } = {}) {
    const requestHeaders = {
      ...(body === undefined ? {} : jsonHeaders()),
      ...(user ? { 'x-test-clerk-user': user } : {}),
      ...(credential ? { authorization: `Bearer ${credential}` } : {}),
      ...(deviceId ? { 'x-ltth-device-id': deviceId } : {}),
      ...(admin ? { 'x-test-admin': 'yes' } : {}),
      ...(ip ? { 'cf-connecting-ip': ip } : {}),
      ...headers
    };
    const background = [];
    const executionContext = context || {
      waitUntil(promise) {
        background.push(promise);
      }
    };
    const response = await handler(new Request(`https://${host}/_ltth/v1${path}`, {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body)
    }), executionContext);
    if (!context) {
      await Promise.all(background);
    }
    return response;
  }

  async function enroll(
    user = 'user-a',
    label = 'Desktop A',
    enrollment = enrollmentBody(label)
  ) {
    const response = await call('/devices/enroll', {
      method: 'POST',
      user,
      body: enrollment
    });
    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload).not.toHaveProperty('credential');
    return {
      ...payload,
      credential: enrollment.credential
    };
  }

  async function putLease(device, body = {}) {
    return call('/lease', {
      method: 'PUT',
      credential: device.credential,
      body: {
        deviceId: device.device.deviceId,
        instanceId: 'instance-a',
        tunnelOrigin: 'https://strict-name.trycloudflare.com',
        ...body
      }
    });
  }

  async function installAtomicAuditFailureHandler() {
    await repository.recordAuditEvent({
      eventId: 'a-controlled-duplicate',
      occurredAt: new Date(START - 1).toISOString(),
      actorClerkUserId: 'audit-fixture',
      action: 'audit_fixture',
      resultCode: 'seeded'
    });
    handler = createManagementHandler({
      repository,
      env: { OVERLAY_DEVICE_TOKEN_PEPPER: PEPPER },
      now: () => nowMs,
      authenticateClerk: clerkAuthenticator,
      authenticateAdmin: adminAuthenticator,
      auditEventIdFactory: () => 'a-controlled-duplicate'
    });
  }

  it('selects management only on the exact entry host and rejects reserved paths on opaque hosts', async () => {
    expect(await handler(new Request('https://overlay.ltth.app/public-overlay')))
      .toBeNull();

    const opaque = await call('/account', {
      user: 'user-a',
      host: 'r-0123456789abcdef0123456789abcdef.ltth.app'
    });
    expect(opaque.status).toBe(404);
    expect(await opaque.text()).toBe('Not Found');

    const alternatePort = await call('/account', {
      user: 'user-a',
      host: 'overlay.ltth.app:8443'
    });
    expect(alternatePort.status).toBe(404);
    expect(await alternatePort.text()).toBe('Not Found');

    const unknown = await call('/unknown', { user: 'user-a' });
    expect(unknown.status).toBe(404);
    expect(await unknown.text()).toBe('Not Found');
  });

  it('accepts desktop-generated identity and credential material but returns metadata only', async () => {
    const material = enrollmentBody();
    const enrolled = await enroll('user-a', 'Desktop A', material);
    expect(enrolled).toMatchObject({
      device: {
        deviceId: material.deviceId,
        label: 'Desktop A'
      }
    });

    const stored = await repository.findDeviceById(enrolled.device.deviceId);
    expect(stored.tokenHash).toBe(
      await hashDeviceCredential(material.credential, PEPPER)
    );
    expect(JSON.stringify(stored)).not.toContain(material.credential);

    const account = await call('/account', { user: 'user-a' });
    const payload = await account.json();
    expect(JSON.stringify(payload)).not.toContain(material.credential);
    expect(JSON.stringify(payload)).not.toContain(stored.tokenHash);
  });

  it('replays a committed enrollment beyond device and rate limits without allocating another device', async () => {
    handler = createManagementHandler({
      repository,
      env: {
        OVERLAY_DEVICE_TOKEN_PEPPER: PEPPER,
        OVERLAY_MAX_ACTIVE_DEVICES_PER_ACCOUNT: '1'
      },
      now: () => nowMs,
      authenticateClerk: clerkAuthenticator,
      authenticateAdmin: adminAuthenticator
    });
    const material = enrollmentBody('Retry PC');
    const first = await call('/devices/enroll', {
      method: 'POST',
      user: 'retry-owner',
      body: material
    });
    expect(first.status).toBe(201);

    let replay;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      replay = await call('/devices/enroll', {
        method: 'POST',
        user: 'retry-owner',
        body: material
      });
      expect(replay.status).toBe(201);
    }
    const replayPayload = await replay.json();
    expect(replayPayload).toEqual({
      device: expect.objectContaining({
        deviceId: material.deviceId,
        label: material.label
      })
    });
    expect(JSON.stringify(replayPayload)).not.toContain(material.credential);
    expect(await repository.countActiveDevicesByOwner('retry-owner')).toBe(1);
    expect(await env.OVERLAY_ROUTING_DB.prepare(`
      SELECT counter
      FROM rate_limit_buckets
      WHERE scope = 'account'
        AND action = 'enroll'
    `).first()).toEqual({ counter: 1 });

    const wrongCredential = await call('/devices/enroll', {
      method: 'POST',
      user: 'retry-owner',
      body: {
        ...material,
        credential: 'f'.repeat(64)
      }
    });
    expect(wrongCredential.status).toBe(409);
    expect(await wrongCredential.json()).toEqual({
      error: 'device_enrollment_conflict'
    });

    const wrongOwner = await call('/devices/enroll', {
      method: 'POST',
      user: 'another-owner',
      body: material
    });
    expect(wrongOwner.status).toBe(409);
    expect(await wrongOwner.json()).toEqual({
      error: 'device_enrollment_conflict'
    });
  });

  it('returns a conflict when revocation commits before enrollment replay', async () => {
    const material = enrollmentBody('Revocation race PC');
    const first = await call('/devices/enroll', {
      method: 'POST',
      user: 'replay-revocation-owner',
      body: material
    });
    expect(first.status).toBe(201);
    advance(1);

    let revocationCommitted = false;
    const racingRepository = proxyRepository(repository, {
      async findDeviceById(deviceId) {
        const device = await repository.findDeviceById(deviceId);
        if (!revocationCommitted && deviceId === material.deviceId) {
          revocationCommitted = await repository.revokeDevice({
            deviceId,
            clerkUserId: 'replay-revocation-owner',
            now: new Date(nowMs).toISOString()
          });
        }
        return device;
      },
      async replayDeviceEnrollment(parameters) {
        if (!revocationCommitted) {
          revocationCommitted = await repository.revokeDevice({
            deviceId: parameters.deviceId,
            clerkUserId: parameters.clerkUserId,
            now: new Date(nowMs).toISOString()
          });
        }
        return repository.replayDeviceEnrollment(parameters);
      }
    });
    handler = createManagementHandler({
      repository: racingRepository,
      env: {
        OVERLAY_DEVICE_TOKEN_PEPPER: PEPPER,
        OVERLAY_MAX_ACTIVE_DEVICES_PER_ACCOUNT: '1'
      },
      now: () => nowMs,
      authenticateClerk: clerkAuthenticator,
      authenticateAdmin: adminAuthenticator
    });

    const replay = await call('/devices/enroll', {
      method: 'POST',
      user: 'replay-revocation-owner',
      body: material
    });

    expect(replay.status).toBe(409);
    expect(await replay.json()).toEqual({
      error: 'device_enrollment_conflict'
    });
    const persisted = await repository.findDeviceById(material.deviceId);
    expect(persisted).toMatchObject({
      deviceId: material.deviceId,
      clerkUserId: 'replay-revocation-owner',
      label: material.label,
      revokedAt: new Date(nowMs).toISOString()
    });
    expect(await repository.countActiveDevicesByOwner(
      'replay-revocation-owner'
    )).toBe(0);
  });

  it('bounds active devices and limits enrollment to ten attempts per account per day', async () => {
    await enroll('bounded-user', 'One');
    advance(1);
    await enroll('bounded-user', 'Two');
    advance(1);
    await enroll('bounded-user', 'Three');
    advance(1);
    const bounded = await call('/devices/enroll', {
      method: 'POST',
      user: 'bounded-user',
      body: enrollmentBody('Four')
    });
    expect(bounded.status).toBe(409);
    expect(await bounded.json()).toEqual({
      error: 'active_device_limit_reached'
    });

    for (let attempt = 0; attempt < 10; attempt += 1) {
      advance(1);
      const response = await call('/devices/enroll', {
        method: 'POST',
        user: 'daily-user',
        body: enrollmentBody(`Device ${attempt}`)
      });
      if (attempt < 3) {
        expect(response.status).toBe(201);
        const { device } = await response.json();
        advance(1);
        expect((await call(`/devices/${device.deviceId}`, {
          method: 'DELETE',
          user: 'daily-user',
          body: {}
        })).status).toBe(204);
      } else {
        expect(response.status).toBe(201);
        const { device } = await response.json();
        advance(1);
        await call(`/devices/${device.deviceId}`, {
          method: 'DELETE',
          user: 'daily-user',
          body: {}
        });
      }
    }
    advance(1);
    const limited = await call('/devices/enroll', {
      method: 'POST',
      user: 'daily-user',
      body: enrollmentBody('Eleven')
    });
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: 'rate_limited' });
  });

  it('atomically admits only one of two controlled concurrent enrollments at the active-device limit', async () => {
    let countCalls = 0;
    let releaseCounts;
    const countsReady = new Promise((resolve) => {
      releaseCounts = resolve;
    });
    const controlledRepository = proxyRepository(repository, {
      async countActiveDevicesByOwner(clerkUserId) {
        const count = await repository.countActiveDevicesByOwner(
          clerkUserId
        );
        countCalls += 1;
        if (countCalls === 2) {
          releaseCounts();
        } else {
          await countsReady;
        }
        return count;
      }
    });
    handler = createManagementHandler({
      repository: controlledRepository,
      env: {
        OVERLAY_DEVICE_TOKEN_PEPPER: PEPPER,
        OVERLAY_MAX_ACTIVE_DEVICES_PER_ACCOUNT: '1'
      },
      now: () => nowMs,
      authenticateClerk: clerkAuthenticator,
      authenticateAdmin: adminAuthenticator
    });

    const responses = await Promise.all([
      call('/devices/enroll', {
        method: 'POST',
        user: 'atomic-enrollment',
        body: enrollmentBody('Concurrent A')
      }),
      call('/devices/enroll', {
        method: 'POST',
        user: 'atomic-enrollment',
        body: enrollmentBody('Concurrent B')
      })
    ]);

    expect(responses.map((response) => response.status).sort())
      .toEqual([201, 409]);
    expect(await repository.countActiveDevicesByOwner('atomic-enrollment'))
      .toBe(1);
  });

  it('enforces first claimant ownership plus account and source-IP claim limits', async () => {
    const first = await call('/claims', {
      method: 'POST',
      user: 'owner-a',
      body: { username: 'First.Owner' }
    });
    expect(first.status).toBe(201);
    const firstClaim = (await first.json()).claim;

    advance(1);
    const conflict = await call('/claims', {
      method: 'POST',
      user: 'owner-b',
      body: { username: 'first.owner' }
    });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({ error: 'claim_unavailable' });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      advance(1);
      await call('/claims', {
        method: 'POST',
        user: 'account-limit',
        ip: `198.51.100.${attempt}`,
        body: { username: `account_${attempt}` }
      });
    }
    advance(1);
    expect((await call('/claims', {
      method: 'POST',
      user: 'account-limit',
      ip: '198.51.100.99',
      body: { username: 'account_6' }
    })).status).toBe(429);

    for (let attempt = 0; attempt < 20; attempt += 1) {
      advance(1);
      await call('/claims', {
        method: 'POST',
        user: `ip-user-${attempt}`,
        ip: '192.0.2.44',
        body: { username: `ip_${attempt}` }
      });
    }
    advance(1);
    expect((await call('/claims', {
      method: 'POST',
      user: 'ip-user-final',
      ip: '192.0.2.44',
      body: { username: 'ip_final' }
    })).status).toBe(429);

    expect(firstClaim).not.toHaveProperty('clerkUserId');
    expect(firstClaim).not.toHaveProperty('routeKey');
  });

  it('requires exact release confirmation, propagates expectedUpdatedAt, and restores only the owner during cooldown', async () => {
    const created = await call('/claims', {
      method: 'POST',
      user: 'release-owner',
      body: { username: 'Release.Me' }
    });
    expect(created.status).toBe(201);
    advance(1);

    const mismatch = await call('/claims/release.me', {
      method: 'DELETE',
      user: 'release-owner',
      body: { username: 'different.name' }
    });
    expect(mismatch.status).toBe(400);

    advance(1);
    const released = await call('/claims/release.me', {
      method: 'DELETE',
      user: 'release-owner',
      body: { username: '@RELEASE.ME' }
    });
    expect(released.status).toBe(200);
    const releasedClaim = (await released.json()).claim;
    expect(releasedClaim.state).toBe('cooldown');
    expect(Date.parse(releasedClaim.reusableAfter) - nowMs)
      .toBe(7 * 24 * 60 * 60 * 1000);
    expect(await repository.findActiveClaimByUsername('release.me')).toBeNull();

    advance(1);
    const isolated = await call('/claims/release.me/restore', {
      method: 'POST',
      user: 'other-owner',
      body: {}
    });
    expect(isolated.status).toBe(409);

    advance(1);
    const restored = await call('/claims/release.me/restore', {
      method: 'POST',
      user: 'release-owner',
      body: {}
    });
    expect(restored.status).toBe(200);
    expect((await restored.json()).claim.state).toBe('active');
  });

  it('rejects release and restore when real D1 state changes between the read and compare-and-swap write', async () => {
    await call('/claims', {
      method: 'POST',
      user: 'cas-owner',
      body: { username: 'cas.release' }
    });
    advance(10);

    let releaseInterleaved = false;
    handler = createManagementHandler({
      repository: proxyRepository(repository, {
        async findClaimByUsername(usernameKey) {
          const current = await repository.findClaimByUsername(usernameKey);
          if (!releaseInterleaved && usernameKey === 'cas.release') {
            releaseInterleaved = true;
            await repository.releaseClaim({
              usernameKey,
              clerkUserId: 'cas-owner',
              expectedUpdatedAt: current.updatedAt,
              now: new Date(START + 5).toISOString(),
              reusableAfter: new Date(
                START + 5 + 7 * 24 * 60 * 60 * 1000
              ).toISOString()
            });
          }
          return current;
        }
      }),
      env: { OVERLAY_DEVICE_TOKEN_PEPPER: PEPPER },
      now: () => nowMs,
      authenticateClerk: clerkAuthenticator,
      authenticateAdmin: adminAuthenticator
    });

    const staleRelease = await call('/claims/cas.release', {
      method: 'DELETE',
      user: 'cas-owner',
      body: { username: 'cas.release' }
    });
    expect(staleRelease.status).toBe(409);
    expect(await staleRelease.json()).toEqual({
      error: 'claim_conflict'
    });
    expect((await repository.findClaimByUsername('cas.release')).state)
      .toBe('cooldown');

    await call('/claims', {
      method: 'POST',
      user: 'restore-owner',
      body: { username: 'cas.restore' }
    });
    advance(10);
    await call('/claims/cas.restore', {
      method: 'DELETE',
      user: 'restore-owner',
      body: { username: 'cas.restore' }
    });
    const cooldown = await repository.findClaimByUsername('cas.restore');
    advance(10);

    let restoreInterleaved = false;
    handler = createManagementHandler({
      repository: proxyRepository(repository, {
        async findClaimByUsername(usernameKey) {
          const current = await repository.findClaimByUsername(usernameKey);
          if (!restoreInterleaved && usernameKey === 'cas.restore') {
            restoreInterleaved = true;
            const restored = await repository.restoreClaim({
              usernameKey,
              clerkUserId: 'restore-owner',
              displayUsername: current.displayUsername,
              expectedUpdatedAt: current.updatedAt,
              now: new Date(Date.parse(current.updatedAt) + 1).toISOString()
            });
            await repository.releaseClaim({
              usernameKey,
              clerkUserId: 'restore-owner',
              expectedUpdatedAt: restored.updatedAt,
              now: new Date(Date.parse(restored.updatedAt) + 1).toISOString(),
              reusableAfter: new Date(
                Date.parse(restored.updatedAt) + 1 +
                7 * 24 * 60 * 60 * 1000
              ).toISOString()
            });
          }
          return current;
        }
      }),
      env: { OVERLAY_DEVICE_TOKEN_PEPPER: PEPPER },
      now: () => nowMs,
      authenticateClerk: clerkAuthenticator,
      authenticateAdmin: adminAuthenticator
    });

    const staleRestore = await call('/claims/cas.restore/restore', {
      method: 'POST',
      user: 'restore-owner',
      body: {}
    });
    expect(staleRestore.status).toBe(409);
    expect(await staleRestore.json()).toEqual({
      error: 'claim_conflict'
    });
    const afterRace = await repository.findClaimByUsername('cas.restore');
    expect(afterRace.state).toBe('cooldown');
    expect(afterRace.updatedAt).not.toBe(cooldown.updatedAt);
  });

  it('atomically transfers an expired cooldown with a new opaque key', async () => {
    await call('/claims', {
      method: 'POST',
      user: 'old-owner',
      body: { username: 'take.over' }
    });
    const oldInternal = await repository.findClaimByUsername('take.over');
    advance(1);
    await call('/claims/take.over', {
      method: 'DELETE',
      user: 'old-owner',
      body: { username: 'take.over' }
    });

    advance(7 * 24 * 60 * 60 * 1000 + 1);
    const takeover = await call('/claims', {
      method: 'POST',
      user: 'new-owner',
      body: { username: 'take.over' }
    });
    expect(takeover.status).toBe(201);
    const current = await repository.findClaimByUsername('take.over');
    expect(current.clerkUserId).toBe('new-owner');
    expect(current.routeKey).not.toBe(oldInternal.routeKey);
  });

  it('activates, rate-limits, revises, closes, and reports only the authenticated device lease', async () => {
    const device = await enroll('lease-owner');
    advance(1);
    const activated = await putLease(device);
    expect(activated.status).toBe(200);
    const activeLease = (await activated.json()).lease;
    expect(activeLease).toMatchObject({
      active: true,
      deviceId: device.device.deviceId,
      revision: 1
    });
    expect(activeLease).not.toHaveProperty('tunnelOrigin');
    expect(Date.parse(activeLease.expiresAt) - nowMs).toBe(120000);

    advance(9000);
    const tooFast = await putLease(device, { expectedRevision: 1 });
    expect(tooFast.status).toBe(429);

    advance(1001);
    const renewed = await putLease(device, {
      expectedRevision: 1,
      tunnelOrigin: 'https://rotated-name.trycloudflare.com'
    });
    expect(renewed.status).toBe(200);
    expect((await renewed.json()).lease.revision).toBe(2);

    advance(10001);
    const stale = await putLease(device, { expectedRevision: 1 });
    expect(stale.status).toBe(409);

    const status = await call('/device/status', {
      credential: device.credential,
      deviceId: device.device.deviceId
    });
    expect(status.status).toBe(200);
    const statusPayload = await status.json();
    expect(statusPayload.device.deviceId).toBe(device.device.deviceId);
    expect(statusPayload.lease.revision).toBe(2);
    expect(JSON.stringify(statusPayload)).not.toContain('trycloudflare');
    expect(JSON.stringify(statusPayload)).not.toContain(device.credential);

    advance(1);
    const closed = await call('/lease', {
      method: 'DELETE',
      credential: device.credential,
      body: {
        deviceId: device.device.deviceId,
        instanceId: 'instance-a',
        expectedRevision: 2
      }
    });
    expect(closed.status).toBe(204);
    expect(await repository.findActiveLeaseByOwner(
      'lease-owner',
      new Date(nowMs).toISOString()
    )).toBeNull();
  });

  it('lets the newest accepted enrolled device own the lease and revocation invalidates it immediately', async () => {
    const first = await enroll('multi-device', 'First');
    advance(10001);
    const second = await enroll('multi-device', 'Second');
    advance(10001);
    expect((await putLease(first)).status).toBe(200);
    advance(10001);
    expect((await putLease(second, {
      instanceId: 'instance-b'
    })).status).toBe(200);

    const active = await repository.findActiveLeaseByOwner(
      'multi-device',
      new Date(nowMs).toISOString()
    );
    expect(active.deviceId).toBe(second.device.deviceId);
    expect(active.revision).toBe(2);

    advance(1);
    const revoked = await call(`/devices/${second.device.deviceId}`, {
      method: 'DELETE',
      user: 'multi-device',
      body: {}
    });
    expect(revoked.status).toBe(204);
    expect(await repository.findActiveLeaseByOwner(
      'multi-device',
      new Date(nowMs).toISOString()
    )).toBeNull();

    const rejected = await call('/device/status', {
      credential: second.credential,
      deviceId: second.device.deviceId
    });
    expect(rejected.status).toBe(401);
  });

  it('fails a lease update when real D1 revocation wins after device authentication', async () => {
    const device = await enroll('revoke-race');
    advance(10001);
    let revoked = false;
    const racingRepository = proxyRepository(repository, {
      async activateLease(parameters) {
        if (!revoked) {
          revoked = true;
          await repository.revokeDevice({
            deviceId: parameters.deviceId,
            clerkUserId: parameters.clerkUserId,
            now: parameters.now
          });
        }
        return repository.activateLease(parameters);
      }
    });
    handler = createManagementHandler({
      repository: racingRepository,
      env: { OVERLAY_DEVICE_TOKEN_PEPPER: PEPPER },
      now: () => nowMs,
      authenticateClerk: clerkAuthenticator,
      authenticateAdmin: adminAuthenticator
    });

    const response = await putLease(device);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'lease_conflict' });
    expect(await repository.findActiveLeaseByOwner(
      'revoke-race',
      new Date(nowMs).toISOString()
    )).toBeNull();
    expect((await repository.findDeviceById(device.device.deviceId)).revokedAt)
      .not.toBeNull();
  });

  it('orders controlled competing activations by the last real D1 acceptance', async () => {
    const first = await enroll('activation-race', 'First');
    advance(1);
    const second = await enroll('activation-race', 'Second');
    advance(10001);

    let firstEntered;
    let releaseFirst;
    const firstIsWaiting = new Promise((resolve) => {
      firstEntered = resolve;
    });
    const secondCommitted = new Promise((resolve) => {
      releaseFirst = resolve;
    });
    const controlledRepository = proxyRepository(repository, {
      async activateLease(parameters) {
        if (parameters.deviceId === first.device.deviceId) {
          firstEntered();
          await secondCommitted;
          return repository.activateLease(parameters);
        }
        await firstIsWaiting;
        const lease = await repository.activateLease(parameters);
        releaseFirst();
        return lease;
      }
    });
    handler = createManagementHandler({
      repository: controlledRepository,
      env: { OVERLAY_DEVICE_TOKEN_PEPPER: PEPPER },
      now: () => nowMs,
      authenticateClerk: clerkAuthenticator,
      authenticateAdmin: adminAuthenticator
    });

    const [firstResponse, secondResponse] = await Promise.all([
      putLease(first, { instanceId: 'instance-first' }),
      putLease(second, { instanceId: 'instance-second' })
    ]);
    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect((await firstResponse.json()).lease.revision).toBe(2);
    expect((await secondResponse.json()).lease.revision).toBe(1);
    const active = await repository.findActiveLeaseByOwner(
      'activation-race',
      new Date(nowMs).toISOString()
    );
    expect(active.deviceId).toBe(first.device.deviceId);
    expect(active.instanceId).toBe('instance-first');
    expect(active.revision).toBe(2);
  });

  it('isolates account output and strips owner, route, tunnel, hash, and credential fields', async () => {
    const deviceA = await enroll('account-a', 'A');
    advance(1);
    await enroll('account-b', 'B');
    advance(1);
    await call('/claims', {
      method: 'POST',
      user: 'account-a',
      body: { username: 'alpha.name' }
    });
    advance(1);
    await call('/claims', {
      method: 'POST',
      user: 'account-b',
      body: { username: 'beta.name' }
    });
    advance(10001);
    await putLease(deviceA);

    const response = await call('/account', { user: 'account-a' });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.claims.map((claim) => claim.username))
      .toEqual(['alpha.name']);
    expect(payload.devices.map((device) => device.label)).toEqual(['A']);
    const serialized = JSON.stringify(payload);
    for (const forbidden of [
      'account-a',
      'account-b',
      'beta.name',
      'routeKey',
      'tokenHash',
      'tunnelOrigin',
      'trycloudflare',
      deviceA.credential
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('allows only an explicit Clerk admin guard to force release and audits sanitized fields', async () => {
    await call('/claims', {
      method: 'POST',
      user: 'claim-owner',
      body: { username: 'disputed.name' }
    });
    advance(1);

    const forbidden = await call('/admin/claims/disputed.name/release', {
      method: 'POST',
      user: 'not-admin',
      body: {}
    });
    expect(forbidden.status).toBe(403);

    advance(1);
    const released = await call('/admin/claims/disputed.name/release', {
      method: 'POST',
      user: 'admin-user',
      admin: true,
      body: {},
      headers: { 'cf-ray': 'safe-ray-123' }
    });
    expect(released.status).toBe(204);
    expect(await repository.findClaimByUsername('disputed.name')).toBeNull();

    const events = await repository.listAuditEvents();
    const adminEvent = events.find((event) =>
      event.action === 'admin_claim_release');
    expect(adminEvent).toMatchObject({
      actorClerkUserId: 'admin-user',
      usernameKey: 'disputed.name',
      resultCode: 'released',
      cfRayId: 'safe-ray-123'
    });
    expect(JSON.stringify(events)).not.toContain('trycloudflare');
  });

  it('rolls back enrollment and withholds the credential when its atomic audit insert fails', async () => {
    await installAtomicAuditFailureHandler();
    const response = await call('/devices/enroll', {
      method: 'POST',
      user: 'audit-outage',
      body: enrollmentBody('Must roll back')
    });
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('Service Unavailable');
    expect(await repository.listDevicesByOwner('audit-outage')).toEqual([]);
    expect((await repository.listAuditEvents()).filter(
      (event) => event.action === 'device_enroll'
    )).toEqual([]);
  });

  it('rolls back claim creation when its atomic audit insert fails', async () => {
    await installAtomicAuditFailureHandler();
    const response = await call('/claims', {
      method: 'POST',
      user: 'audit-outage',
      body: { username: 'audit.claim' }
    });
    expect(response.status).toBe(503);
    expect(await repository.findClaimByUsername('audit.claim')).toBeNull();
    expect((await repository.listAuditEvents()).filter(
      (event) => event.action === 'claim_create'
    )).toEqual([]);
  });

  it('rolls back lease activation when its atomic audit insert fails', async () => {
    const enrollment = await enroll('audit-lease-owner');
    advance(10001);
    await installAtomicAuditFailureHandler();
    const response = await putLease(enrollment);
    expect(response.status).toBe(503);
    expect(await repository.findActiveLeaseByOwner(
      'audit-lease-owner',
      new Date(nowMs).toISOString()
    )).toBeNull();
    expect((await repository.listAuditEvents()).filter(
      (event) => event.action === 'lease_update'
    )).toEqual([]);
  });

  it('rolls back administrative release when its atomic audit insert fails', async () => {
    await call('/claims', {
      method: 'POST',
      user: 'audit-admin-owner',
      body: { username: 'audit.admin' }
    });
    advance(1);
    await installAtomicAuditFailureHandler();
    const response = await call('/admin/claims/audit.admin/release', {
      method: 'POST',
      user: 'admin-user',
      admin: true,
      body: {}
    });
    expect(response.status).toBe(503);
    expect(await repository.findClaimByUsername('audit.admin'))
      .not.toBeNull();
    expect((await repository.listAuditEvents()).filter(
      (event) => event.action === 'admin_claim_release'
    )).toEqual([]);
  });

  it.each([
    ['POST', '/claims/%/restore', {}],
    ['DELETE', '/claims/%', { username: 'valid.name' }],
    ['DELETE', '/devices/%', {}],
    ['POST', '/admin/claims/%/release', {}]
  ])('authenticates malformed dynamic endpoint %s %s before path validation', async (
    method,
    path,
    body
  ) => {
    const malformed = await call(path, { method, body });
    expect(malformed.status).toBe(401);
  });

  it.each([
    ['POST', '/claims/valid.name/restore', {}],
    ['DELETE', '/claims/valid.name', { username: 'valid.name' }],
    ['DELETE', '/devices/d-valid', {}],
    ['POST', '/admin/claims/valid.name/release', {}]
  ])('keeps the same authentication boundary for valid dynamic endpoint %s %s', async (
    method,
    path,
    body
  ) => {
    const valid = await call(path, { method, body });
    expect(valid.status).toBe(401);
  });

  it.each([
    [
      'POST',
      '/devices/enroll',
      {
        deviceId: 'd-0123456789abcdef0123456789abcdef',
        credential: 'a'.repeat(64),
        label: 'ok',
        extra: true
      },
      'user-a'
    ],
    ['POST', '/claims', { username: 'valid.name', extra: true }, 'user-a'],
    ['POST', '/claims/valid.name/restore', { extra: true }, 'user-a'],
    ['DELETE', '/claims/valid.name', { username: 'valid.name', extra: true }, 'user-a'],
    ['DELETE', '/devices/d-0123456789abcdef0123456789abcdef', { extra: true }, 'user-a'],
    ['POST', '/admin/claims/valid.name/release', { extra: true }, 'admin-user']
  ])('rejects unknown schema fields for %s %s', async (
    method,
    path,
    body,
    user
  ) => {
    const response = await call(path, {
      method,
      user,
      admin: path.startsWith('/admin/'),
      body
    });
    expect(response.status).toBe(400);
  });

  it('rejects malformed lease/status inputs and oversized authenticated bodies', async () => {
    const device = await enroll();
    advance(1);
    expect((await putLease(device, {
      tunnelOrigin: 'https://evil.example.com'
    })).status).toBe(400);

    const missingDevice = await call('/device/status', {
      credential: device.credential
    });
    expect(missingDevice.status).toBe(400);

    const oversized = await handler(new Request(`${BASE}/claims`, {
      method: 'POST',
      headers: jsonHeaders({
        'x-test-clerk-user': 'user-a'
      }),
      body: JSON.stringify({
        username: 'valid.name',
        padding: 'x'.repeat(1000)
      })
    }), { waitUntil() {} });
    expect(oversized.status).toBe(413);
  });
});
