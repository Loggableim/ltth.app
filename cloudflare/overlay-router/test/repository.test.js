import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import schema from './migrations/0001_initial_schema.sql?raw';
import { createOverlayRepository } from './src/repository.js';

const T0 = '2026-07-27T10:00:00.000Z';
const T1 = '2026-07-27T10:01:00.000Z';
const T2 = '2026-07-27T10:02:00.000Z';
const T3 = '2026-07-27T10:03:00.000Z';
const T4 = '2026-07-27T10:04:00.000Z';
const DAY_7 = '2026-08-03T10:01:00.000Z';
const DAY_8 = '2026-08-04T10:01:00.000Z';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

describe('overlay routing repository', () => {
  let repository;

  beforeAll(async () => {
    const migrationStatements = schema
      .split(';')
      .map((statement) => statement.trim())
      .filter(Boolean)
      .map((statement) => env.OVERLAY_ROUTING_DB.prepare(statement));
    await env.OVERLAY_ROUTING_DB.batch(migrationStatements);
    repository = createOverlayRepository(env.OVERLAY_ROUTING_DB);
  });

  it('keeps username ownership unique and removes cooldown claims from active lookup', async () => {
    const claimed = await repository.claimUsername({
      usernameKey: 'unique_owner',
      displayUsername: 'Unique_Owner',
      clerkUserId: 'user-owner-a',
      routeKey: 'route-unique-a',
      now: T0
    });
    expect(claimed.ok).toBe(true);
    expect(claimed.claim.clerkUserId).toBe('user-owner-a');

    const conflict = await repository.claimUsername({
      usernameKey: 'unique_owner',
      displayUsername: 'Unique_Owner',
      clerkUserId: 'user-owner-b',
      routeKey: 'route-unique-b',
      now: T1
    });
    expect(conflict).toEqual({ ok: false, reason: 'unavailable' });

    expect((await repository.findActiveClaimByUsername('unique_owner')).routeKey)
      .toBe('route-unique-a');

    const released = await repository.releaseClaim({
      usernameKey: 'unique_owner',
      clerkUserId: 'user-owner-a',
      expectedUpdatedAt: T0,
      now: T1,
      reusableAfter: DAY_7
    });
    expect(released.state).toBe('cooldown');
    expect(await repository.findActiveClaimByUsername('unique_owner')).toBeNull();
    expect((await repository.findClaimByUsername('unique_owner')).reusableAfter)
      .toBe(DAY_7);
  });

  it('restores a cooldown claim only for its owner before it becomes reusable', async () => {
    await repository.claimUsername({
      usernameKey: 'restore_me',
      displayUsername: 'Restore_Me',
      clerkUserId: 'user-restore',
      routeKey: 'route-restore',
      now: T0
    });
    await repository.releaseClaim({
      usernameKey: 'restore_me',
      clerkUserId: 'user-restore',
      expectedUpdatedAt: T0,
      now: T1,
      reusableAfter: DAY_7
    });

    expect(await repository.restoreClaim({
      usernameKey: 'restore_me',
      clerkUserId: 'another-user',
      displayUsername: 'Restore_Me',
      expectedUpdatedAt: T1,
      now: T2
    })).toBeNull();

    const restored = await repository.restoreClaim({
      usernameKey: 'restore_me',
      clerkUserId: 'user-restore',
      displayUsername: 'Restore_Me',
      expectedUpdatedAt: T1,
      now: T2
    });
    expect(restored.state).toBe('active');
    expect(restored.routeKey).toBe('route-restore');
    expect(restored.releaseRequestedAt).toBeNull();
    expect(restored.reusableAfter).toBeNull();
  });

  it('rejects a delayed release retry after the claim was restored', async () => {
    await repository.claimUsername({
      usernameKey: 'release_retry',
      displayUsername: 'Release_Retry',
      clerkUserId: 'user-release-retry',
      routeKey: 'route-release-retry',
      now: T0
    });
    await repository.releaseClaim({
      usernameKey: 'release_retry',
      clerkUserId: 'user-release-retry',
      expectedUpdatedAt: T0,
      now: T1,
      reusableAfter: DAY_7
    });
    await repository.restoreClaim({
      usernameKey: 'release_retry',
      clerkUserId: 'user-release-retry',
      displayUsername: 'Release_Retry',
      expectedUpdatedAt: T1,
      now: T2
    });

    expect(await repository.releaseClaim({
      usernameKey: 'release_retry',
      clerkUserId: 'user-release-retry',
      expectedUpdatedAt: T0,
      now: T3,
      reusableAfter: DAY_8
    })).toBeNull();
    expect(await repository.findClaimByUsername('release_retry')).toMatchObject({
      state: 'active',
      updatedAt: T2
    });
  });

  it('rejects a delayed restore retry after a newer release', async () => {
    await repository.claimUsername({
      usernameKey: 'restore_retry',
      displayUsername: 'Restore_Retry',
      clerkUserId: 'user-restore-retry',
      routeKey: 'route-restore-retry',
      now: T0
    });
    await repository.releaseClaim({
      usernameKey: 'restore_retry',
      clerkUserId: 'user-restore-retry',
      expectedUpdatedAt: T0,
      now: T1,
      reusableAfter: DAY_7
    });
    await repository.restoreClaim({
      usernameKey: 'restore_retry',
      clerkUserId: 'user-restore-retry',
      displayUsername: 'Restore_Retry',
      expectedUpdatedAt: T1,
      now: T2
    });
    await repository.releaseClaim({
      usernameKey: 'restore_retry',
      clerkUserId: 'user-restore-retry',
      expectedUpdatedAt: T2,
      now: T3,
      reusableAfter: DAY_8
    });

    expect(await repository.restoreClaim({
      usernameKey: 'restore_retry',
      clerkUserId: 'user-restore-retry',
      displayUsername: 'Restore_Retry',
      expectedUpdatedAt: T1,
      now: T4
    })).toBeNull();
    expect(await repository.findClaimByUsername('restore_retry')).toMatchObject({
      state: 'cooldown',
      releaseRequestedAt: T3,
      updatedAt: T3
    });
  });

  it('atomically transfers an expired cooldown claim with a new route key', async () => {
    await repository.claimUsername({
      usernameKey: 'takeover_me',
      displayUsername: 'Takeover_Me',
      clerkUserId: 'user-former',
      routeKey: 'route-former',
      now: T0
    });
    await repository.releaseClaim({
      usernameKey: 'takeover_me',
      clerkUserId: 'user-former',
      expectedUpdatedAt: T0,
      now: T1,
      reusableAfter: DAY_7
    });

    const takeover = await repository.claimUsername({
      usernameKey: 'takeover_me',
      displayUsername: 'Takeover_Me',
      clerkUserId: 'user-next',
      routeKey: 'route-next',
      now: DAY_8
    });
    expect(takeover.ok).toBe(true);
    expect(takeover.claim.clerkUserId).toBe('user-next');
    expect(takeover.claim.routeKey).toBe('route-next');
    expect(await repository.findActiveClaimByRouteKey('route-former')).toBeNull();
    expect((await repository.findActiveClaimByRouteKey('route-next')).usernameKey)
      .toBe('takeover_me');
  });

  it('lets an administrator release a disputed claim without preserving its route key', async () => {
    await repository.claimUsername({
      usernameKey: 'disputed_name',
      displayUsername: 'Disputed_Name',
      clerkUserId: 'user-disputed',
      routeKey: 'route-disputed-old',
      now: T0
    });

    expect((await repository.forceReleaseClaim('disputed_name')).routeKey)
      .toBe('route-disputed-old');
    expect(await repository.findClaimByUsername('disputed_name')).toBeNull();

    const reclaimed = await repository.claimUsername({
      usernameKey: 'disputed_name',
      displayUsername: 'Disputed_Name',
      clerkUserId: 'user-correct-owner',
      routeKey: 'route-disputed-new',
      now: T1
    });
    expect(reclaimed.claim.routeKey).toBe('route-disputed-new');
  });

  it('keeps token hashes internal while listing safe device metadata by owner', async () => {
    await repository.createDevice({
      deviceId: 'device-hash-only',
      clerkUserId: 'user-devices',
      tokenHash: HASH_A,
      label: 'Streaming PC',
      now: T0
    });

    const devices = await repository.listDevicesByOwner('user-devices');
    expect(devices).toEqual([{
      deviceId: 'device-hash-only',
      clerkUserId: 'user-devices',
      label: 'Streaming PC',
      createdAt: T0,
      lastSeenAt: T0,
      revokedAt: null
    }]);
    expect((await repository.findActiveDeviceById('device-hash-only')).tokenHash)
      .toBe(HASH_A);
    expect(devices[0]).not.toHaveProperty('token');
    expect(devices[0]).not.toHaveProperty('tokenHash');
    expect(devices[0]).not.toHaveProperty('credential');
    expect(await repository.countActiveDevicesByOwner('user-devices')).toBe(1);
  });

  it('lets a newly activated valid device replace the account lease', async () => {
    await repository.createDevice({
      deviceId: 'device-active-a',
      clerkUserId: 'user-active-device',
      tokenHash: HASH_A,
      label: 'PC A',
      now: T0
    });
    await repository.createDevice({
      deviceId: 'device-active-b',
      clerkUserId: 'user-active-device',
      tokenHash: HASH_B,
      label: 'PC B',
      now: T0
    });

    const first = await repository.activateLease({
      clerkUserId: 'user-active-device',
      deviceId: 'device-active-a',
      instanceId: 'instance-a',
      tunnelOrigin: 'https://one.trycloudflare.com',
      now: T1,
      expiresAt: T3
    });
    const replacement = await repository.activateLease({
      clerkUserId: 'user-active-device',
      deviceId: 'device-active-b',
      instanceId: 'instance-b',
      tunnelOrigin: 'https://two.trycloudflare.com',
      now: T2,
      expiresAt: DAY_7
    });

    expect(first.revision).toBe(1);
    expect(replacement.revision).toBe(2);
    expect((await repository.findActiveLeaseByOwner('user-active-device', T3)))
      .toMatchObject({ deviceId: 'device-active-b', instanceId: 'instance-b', revision: 2 });
  });

  it('orders lease renewal by instance and expected revision', async () => {
    await repository.createDevice({
      deviceId: 'device-revision',
      clerkUserId: 'user-revision',
      tokenHash: HASH_A,
      label: 'Revision PC',
      now: T0
    });
    await repository.activateLease({
      clerkUserId: 'user-revision',
      deviceId: 'device-revision',
      instanceId: 'instance-revision',
      tunnelOrigin: 'https://before.trycloudflare.com',
      now: T1,
      expiresAt: T3
    });

    expect(await repository.renewLease({
      clerkUserId: 'user-revision',
      deviceId: 'device-revision',
      instanceId: 'wrong-instance',
      expectedRevision: 1,
      tunnelOrigin: 'https://wrong.trycloudflare.com',
      now: T2,
      expiresAt: DAY_7
    })).toBeNull();

    const changed = await repository.renewLease({
      clerkUserId: 'user-revision',
      deviceId: 'device-revision',
      instanceId: 'instance-revision',
      expectedRevision: 1,
      tunnelOrigin: 'https://after.trycloudflare.com',
      now: T2,
      expiresAt: DAY_7
    });
    expect(changed.revision).toBe(2);

    expect(await repository.renewLease({
      clerkUserId: 'user-revision',
      deviceId: 'device-revision',
      instanceId: 'instance-revision',
      expectedRevision: 1,
      tunnelOrigin: 'https://stale.trycloudflare.com',
      now: T3,
      expiresAt: DAY_8
    })).toBeNull();

    const unchanged = await repository.renewLease({
      clerkUserId: 'user-revision',
      deviceId: 'device-revision',
      instanceId: 'instance-revision',
      expectedRevision: 2,
      tunnelOrigin: 'https://after.trycloudflare.com',
      now: T3,
      expiresAt: DAY_8
    });
    expect(unchanged.revision).toBe(2);

    expect(await repository.closeLease({
      clerkUserId: 'user-revision',
      deviceId: 'device-revision',
      instanceId: 'instance-revision',
      expectedRevision: 1
    })).toBe(false);
    expect(await repository.closeLease({
      clerkUserId: 'user-revision',
      deviceId: 'device-revision',
      instanceId: 'instance-revision',
      expectedRevision: 2
    })).toBe(true);
  });

  it('rejects an older same-origin heartbeat after a newer one was accepted', async () => {
    await repository.createDevice({
      deviceId: 'device-reverse-heartbeat',
      clerkUserId: 'user-reverse-heartbeat',
      tokenHash: HASH_A,
      label: 'Reverse Heartbeat PC',
      now: T0
    });
    await repository.activateLease({
      clerkUserId: 'user-reverse-heartbeat',
      deviceId: 'device-reverse-heartbeat',
      instanceId: 'instance-reverse-heartbeat',
      tunnelOrigin: 'https://same.trycloudflare.com',
      now: T1,
      expiresAt: T3
    });

    const newer = await repository.renewLease({
      clerkUserId: 'user-reverse-heartbeat',
      deviceId: 'device-reverse-heartbeat',
      instanceId: 'instance-reverse-heartbeat',
      expectedRevision: 1,
      tunnelOrigin: 'https://same.trycloudflare.com',
      now: T3,
      expiresAt: DAY_8
    });
    expect(newer).toMatchObject({
      revision: 1,
      updatedAt: T3,
      expiresAt: DAY_8
    });

    expect(await repository.renewLease({
      clerkUserId: 'user-reverse-heartbeat',
      deviceId: 'device-reverse-heartbeat',
      instanceId: 'instance-reverse-heartbeat',
      expectedRevision: 1,
      tunnelOrigin: 'https://same.trycloudflare.com',
      now: T2,
      expiresAt: DAY_7
    })).toBeNull();
    expect(await repository.findActiveLeaseByOwner('user-reverse-heartbeat', T3))
      .toMatchObject({ updatedAt: T3, expiresAt: DAY_8 });
  });

  it('does not return an expired or revoked-device lease', async () => {
    await repository.claimUsername({
      usernameKey: 'leased_route',
      displayUsername: 'Leased_Route',
      clerkUserId: 'user-expiry',
      routeKey: 'route-expiry',
      now: T0
    });
    await repository.createDevice({
      deviceId: 'device-expiry',
      clerkUserId: 'user-expiry',
      tokenHash: HASH_A,
      label: 'Expiry PC',
      now: T0
    });
    await repository.activateLease({
      clerkUserId: 'user-expiry',
      deviceId: 'device-expiry',
      instanceId: 'instance-expiry',
      tunnelOrigin: 'https://expiry.trycloudflare.com',
      now: T1,
      expiresAt: T3
    });

    expect(await repository.findActiveLeaseByOwner('user-expiry', T2)).not.toBeNull();
    expect((await repository.findActiveLeaseByRouteKey('route-expiry', T2)).deviceId)
      .toBe('device-expiry');
    expect(await repository.findActiveLeaseByOwner('user-expiry', T3)).toBeNull();
    expect(await repository.findActiveLeaseByRouteKey('route-expiry', T3)).toBeNull();

    await repository.activateLease({
      clerkUserId: 'user-expiry',
      deviceId: 'device-expiry',
      instanceId: 'instance-expiry-2',
      tunnelOrigin: 'https://expiry-two.trycloudflare.com',
      now: T3,
      expiresAt: DAY_7
    });
    expect(await repository.revokeDevice({
      deviceId: 'device-expiry',
      clerkUserId: 'user-expiry',
      now: DAY_8
    })).toBe(true);
    expect(await repository.findActiveLeaseByOwner('user-expiry', T3)).toBeNull();
  });

  it('prunes audit events older than the retention boundary', async () => {
    await repository.recordAuditEvent({
      eventId: 'audit-old',
      occurredAt: T0,
      actorClerkUserId: 'user-auditor',
      action: 'claim.create',
      usernameKey: 'audit_name',
      deviceId: null,
      resultCode: 'accepted',
      cfRayId: 'ray-old'
    });
    await repository.recordAuditEvent({
      eventId: 'audit-new',
      occurredAt: DAY_8,
      actorClerkUserId: 'user-auditor',
      action: 'claim.restore',
      usernameKey: 'audit_name',
      deviceId: null,
      resultCode: 'accepted',
      cfRayId: 'ray-new'
    });

    expect(await repository.pruneAuditEvents(T1)).toBe(1);
    expect(await repository.listAuditEvents()).toEqual([{
      eventId: 'audit-new',
      occurredAt: DAY_8,
      actorClerkUserId: 'user-auditor',
      action: 'claim.restore',
      usernameKey: 'audit_name',
      deviceId: null,
      resultCode: 'accepted',
      cfRayId: 'ray-new'
    }]);
  });

  it('atomically limits a rate bucket until its expiry', async () => {
    expect((await repository.consumeRateLimit({
      bucketKey: 'account:opaque-a',
      scope: 'account',
      action: 'claim.create',
      now: T0,
      expiresAt: T3,
      limit: 2
    })).allowed).toBe(true);
    expect((await repository.consumeRateLimit({
      bucketKey: 'account:opaque-a',
      scope: 'account',
      action: 'claim.create',
      now: T1,
      expiresAt: T3,
      limit: 2
    })).count).toBe(2);
    expect(await repository.consumeRateLimit({
      bucketKey: 'account:opaque-a',
      scope: 'account',
      action: 'claim.create',
      now: T2,
      expiresAt: T3,
      limit: 2
    })).toEqual({ allowed: false });
    expect((await repository.consumeRateLimit({
      bucketKey: 'account:opaque-a',
      scope: 'account',
      action: 'claim.create',
      now: DAY_7,
      expiresAt: DAY_8,
      limit: 2
    })).count).toBe(1);
  });
});
