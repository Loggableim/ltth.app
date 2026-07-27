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

describe('stable overlay management HTTP contract', () => {
  let repository;
  let nowMs;
  let handler;

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

  async function call(path, {
    method = 'GET',
    body,
    user,
    credential,
    deviceId,
    admin = false,
    ip = '203.0.113.10',
    host = 'overlay.ltth.app',
    headers = {}
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
    return handler(new Request(`https://${host}/_ltth/v1${path}`, {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body)
    }), { waitUntil() {} });
  }

  async function enroll(user = 'user-a', label = 'Desktop A') {
    const response = await call('/devices/enroll', {
      method: 'POST',
      user,
      body: { label }
    });
    expect(response.status).toBe(201);
    return response.json();
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

  it('selects management only on the exact entry host and rejects reserved paths on opaque hosts', async () => {
    expect(await handler(new Request('https://overlay.ltth.app/public-overlay')))
      .toBeNull();

    const opaque = await call('/account', {
      user: 'user-a',
      host: 'r-0123456789abcdef0123456789abcdef.ltth.app'
    });
    expect(opaque.status).toBe(404);
    expect(await opaque.text()).toBe('Not Found');

    const unknown = await call('/unknown', { user: 'user-a' });
    expect(unknown.status).toBe(404);
    expect(await unknown.text()).toBe('Not Found');
  });

  it('enrolls a random device with a one-time 256-bit credential and stores only its hash', async () => {
    const enrolled = await enroll();
    expect(enrolled).toMatchObject({
      device: {
        deviceId: expect.stringMatching(/^d-[0-9a-f]{32}$/),
        label: 'Desktop A'
      },
      credential: expect.stringMatching(/^[0-9a-f]{64}$/)
    });

    const stored = await repository.findDeviceById(enrolled.device.deviceId);
    expect(stored.tokenHash).toBe(
      await hashDeviceCredential(enrolled.credential, PEPPER)
    );
    expect(JSON.stringify(stored)).not.toContain(enrolled.credential);

    const account = await call('/account', { user: 'user-a' });
    const payload = await account.json();
    expect(JSON.stringify(payload)).not.toContain(enrolled.credential);
    expect(JSON.stringify(payload)).not.toContain(stored.tokenHash);
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
      body: { label: 'Four' }
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
        body: { label: `Device ${attempt}` }
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
      body: { label: 'Eleven' }
    });
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: 'rate_limited' });
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

  it.each([
    ['POST', '/devices/enroll', { label: 'ok', extra: true }, 'user-a'],
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
