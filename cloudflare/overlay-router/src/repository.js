function requireString(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}

function requireUtcIso(value, name) {
  requireString(value, name);
  if (new Date(value).toISOString() !== value) {
    throw new TypeError(`${name} must be a canonical UTC ISO-8601 timestamp`);
  }
  return value;
}

function requireLaterTimestamp(value, name, earlier) {
  requireUtcIso(value, name);
  if (value <= earlier) {
    throw new RangeError(`${name} must be later than the operation timestamp`);
  }
  return value;
}

function requireTokenHash(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new TypeError('tokenHash must be a lowercase SHA-256 hex digest');
  }
  return value;
}

function requireRevision(value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError('expectedRevision must be a positive safe integer');
  }
  return value;
}

function mapClaim(row) {
  if (!row) {
    return null;
  }
  return {
    usernameKey: row.username_key,
    displayUsername: row.display_username,
    clerkUserId: row.clerk_user_id,
    routeKey: row.route_key,
    state: row.state,
    claimedAt: row.claimed_at,
    releaseRequestedAt: row.release_requested_at,
    reusableAfter: row.reusable_after,
    updatedAt: row.updated_at
  };
}

function mapDevice(row) {
  if (!row) {
    return null;
  }
  return {
    deviceId: row.device_id,
    clerkUserId: row.clerk_user_id,
    tokenHash: row.token_hash,
    label: row.label,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    revokedAt: row.revoked_at
  };
}

function mapDeviceMetadata(row) {
  if (!row) {
    return null;
  }
  return {
    deviceId: row.device_id,
    clerkUserId: row.clerk_user_id,
    label: row.label,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    revokedAt: row.revoked_at
  };
}

function mapLease(row) {
  if (!row) {
    return null;
  }
  return {
    clerkUserId: row.clerk_user_id,
    deviceId: row.device_id,
    instanceId: row.instance_id,
    tunnelOrigin: row.tunnel_origin,
    revision: row.revision,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at
  };
}

function mapAuditEvent(row) {
  return {
    eventId: row.event_id,
    occurredAt: row.occurred_at,
    actorClerkUserId: row.actor_clerk_user_id,
    action: row.action,
    usernameKey: row.username_key,
    deviceId: row.device_id,
    resultCode: row.result_code,
    cfRayId: row.cf_ray_id
  };
}

export class OverlayRepository {
  constructor(database) {
    if (!database || typeof database.prepare !== 'function'
      || typeof database.batch !== 'function') {
      throw new TypeError('A D1 database binding is required');
    }
    this.database = database;
  }

  async claimUsername({
    usernameKey,
    displayUsername,
    clerkUserId,
    routeKey,
    now
  }) {
    requireString(usernameKey, 'usernameKey');
    requireString(displayUsername, 'displayUsername');
    requireString(clerkUserId, 'clerkUserId');
    requireString(routeKey, 'routeKey');
    requireUtcIso(now, 'now');

    const row = await this.database.prepare(`
      INSERT INTO claims (
        username_key,
        display_username,
        clerk_user_id,
        route_key,
        state,
        claimed_at,
        release_requested_at,
        reusable_after,
        updated_at
      )
      VALUES (?, ?, ?, ?, 'active', ?, NULL, NULL, ?)
      ON CONFLICT(username_key) DO UPDATE SET
        display_username = excluded.display_username,
        clerk_user_id = excluded.clerk_user_id,
        route_key = excluded.route_key,
        state = 'active',
        claimed_at = excluded.claimed_at,
        release_requested_at = NULL,
        reusable_after = NULL,
        updated_at = excluded.updated_at
      WHERE claims.state = 'cooldown'
        AND claims.reusable_after <= excluded.claimed_at
      RETURNING *
    `).bind(
      usernameKey,
      displayUsername,
      clerkUserId,
      routeKey,
      now,
      now
    ).first();

    if (!row) {
      return { ok: false, reason: 'unavailable' };
    }
    return { ok: true, claim: mapClaim(row) };
  }

  async findClaimByUsername(usernameKey) {
    requireString(usernameKey, 'usernameKey');
    const row = await this.database.prepare(`
      SELECT *
      FROM claims
      WHERE username_key = ?
    `).bind(usernameKey).first();
    return mapClaim(row);
  }

  async findActiveClaimByUsername(usernameKey) {
    requireString(usernameKey, 'usernameKey');
    const row = await this.database.prepare(`
      SELECT *
      FROM claims
      WHERE username_key = ?
        AND state = 'active'
    `).bind(usernameKey).first();
    return mapClaim(row);
  }

  async findActiveClaimByRouteKey(routeKey) {
    requireString(routeKey, 'routeKey');
    const row = await this.database.prepare(`
      SELECT *
      FROM claims
      WHERE route_key = ?
        AND state = 'active'
    `).bind(routeKey).first();
    return mapClaim(row);
  }

  async listClaimsByOwner(clerkUserId) {
    requireString(clerkUserId, 'clerkUserId');
    const result = await this.database.prepare(`
      SELECT *
      FROM claims
      WHERE clerk_user_id = ?
      ORDER BY username_key ASC
    `).bind(clerkUserId).all();
    return result.results.map(mapClaim);
  }

  async releaseClaim({
    usernameKey,
    clerkUserId,
    expectedUpdatedAt,
    now,
    reusableAfter
  }) {
    requireString(usernameKey, 'usernameKey');
    requireString(clerkUserId, 'clerkUserId');
    requireUtcIso(expectedUpdatedAt, 'expectedUpdatedAt');
    requireLaterTimestamp(now, 'now', expectedUpdatedAt);
    requireLaterTimestamp(reusableAfter, 'reusableAfter', now);

    const row = await this.database.prepare(`
      UPDATE claims
      SET state = 'cooldown',
        release_requested_at = ?,
        reusable_after = ?,
        updated_at = ?
      WHERE username_key = ?
        AND clerk_user_id = ?
        AND state = 'active'
        AND updated_at = ?
      RETURNING *
    `).bind(
      now,
      reusableAfter,
      now,
      usernameKey,
      clerkUserId,
      expectedUpdatedAt
    ).first();
    return mapClaim(row);
  }

  async restoreClaim({
    usernameKey,
    clerkUserId,
    displayUsername,
    expectedUpdatedAt,
    now
  }) {
    requireString(usernameKey, 'usernameKey');
    requireString(clerkUserId, 'clerkUserId');
    requireString(displayUsername, 'displayUsername');
    requireUtcIso(expectedUpdatedAt, 'expectedUpdatedAt');
    requireLaterTimestamp(now, 'now', expectedUpdatedAt);

    const row = await this.database.prepare(`
      UPDATE claims
      SET display_username = ?,
        state = 'active',
        release_requested_at = NULL,
        reusable_after = NULL,
        updated_at = ?
      WHERE username_key = ?
        AND clerk_user_id = ?
        AND state = 'cooldown'
        AND reusable_after > ?
        AND updated_at = ?
      RETURNING *
    `).bind(
      displayUsername,
      now,
      usernameKey,
      clerkUserId,
      now,
      expectedUpdatedAt
    ).first();
    return mapClaim(row);
  }

  async forceReleaseClaim(usernameKey) {
    requireString(usernameKey, 'usernameKey');
    const row = await this.database.prepare(`
      DELETE FROM claims
      WHERE username_key = ?
      RETURNING *
    `).bind(usernameKey).first();
    return mapClaim(row);
  }

  async createDevice({
    deviceId,
    clerkUserId,
    tokenHash,
    label,
    now
  }) {
    requireString(deviceId, 'deviceId');
    requireString(clerkUserId, 'clerkUserId');
    requireTokenHash(tokenHash);
    requireString(label, 'label');
    requireUtcIso(now, 'now');

    const row = await this.database.prepare(`
      INSERT INTO devices (
        device_id,
        clerk_user_id,
        token_hash,
        label,
        created_at,
        last_seen_at,
        revoked_at
      )
      VALUES (?, ?, ?, ?, ?, ?, NULL)
      RETURNING *
    `).bind(
      deviceId,
      clerkUserId,
      tokenHash,
      label,
      now,
      now
    ).first();
    return mapDevice(row);
  }

  async findDeviceById(deviceId) {
    requireString(deviceId, 'deviceId');
    const row = await this.database.prepare(`
      SELECT *
      FROM devices
      WHERE device_id = ?
    `).bind(deviceId).first();
    return mapDevice(row);
  }

  async findActiveDeviceById(deviceId) {
    requireString(deviceId, 'deviceId');
    const row = await this.database.prepare(`
      SELECT *
      FROM devices
      WHERE device_id = ?
        AND revoked_at IS NULL
    `).bind(deviceId).first();
    return mapDevice(row);
  }

  async listDevicesByOwner(clerkUserId) {
    requireString(clerkUserId, 'clerkUserId');
    const result = await this.database.prepare(`
      SELECT
        device_id,
        clerk_user_id,
        label,
        created_at,
        last_seen_at,
        revoked_at
      FROM devices
      WHERE clerk_user_id = ?
      ORDER BY created_at ASC, device_id ASC
    `).bind(clerkUserId).all();
    return result.results.map(mapDeviceMetadata);
  }

  async countActiveDevicesByOwner(clerkUserId) {
    requireString(clerkUserId, 'clerkUserId');
    const row = await this.database.prepare(`
      SELECT COUNT(*) AS count
      FROM devices
      WHERE clerk_user_id = ?
        AND revoked_at IS NULL
    `).bind(clerkUserId).first();
    return row.count;
  }

  async touchDevice({
    deviceId,
    clerkUserId,
    now
  }) {
    requireString(deviceId, 'deviceId');
    requireString(clerkUserId, 'clerkUserId');
    requireUtcIso(now, 'now');

    const row = await this.database.prepare(`
      UPDATE devices
      SET last_seen_at = ?
      WHERE device_id = ?
        AND clerk_user_id = ?
        AND revoked_at IS NULL
      RETURNING *
    `).bind(now, deviceId, clerkUserId).first();
    return mapDevice(row);
  }

  async revokeDevice({
    deviceId,
    clerkUserId,
    now
  }) {
    requireString(deviceId, 'deviceId');
    requireString(clerkUserId, 'clerkUserId');
    requireUtcIso(now, 'now');

    const [revocation] = await this.database.batch([
      this.database.prepare(`
        UPDATE devices
        SET revoked_at = ?,
          last_seen_at = ?
        WHERE device_id = ?
          AND clerk_user_id = ?
          AND revoked_at IS NULL
      `).bind(now, now, deviceId, clerkUserId),
      this.database.prepare(`
        DELETE FROM account_leases
        WHERE clerk_user_id = ?
          AND device_id = ?
      `).bind(clerkUserId, deviceId)
    ]);
    return revocation.meta.changes === 1;
  }

  async activateLease({
    clerkUserId,
    deviceId,
    instanceId,
    tunnelOrigin,
    now,
    expiresAt
  }) {
    requireString(clerkUserId, 'clerkUserId');
    requireString(deviceId, 'deviceId');
    requireString(instanceId, 'instanceId');
    requireString(tunnelOrigin, 'tunnelOrigin');
    requireUtcIso(now, 'now');
    requireLaterTimestamp(expiresAt, 'expiresAt', now);

    const row = await this.database.prepare(`
      INSERT INTO account_leases (
        clerk_user_id,
        device_id,
        instance_id,
        tunnel_origin,
        revision,
        updated_at,
        expires_at
      )
      SELECT clerk_user_id, device_id, ?, ?, 1, ?, ?
      FROM devices
      WHERE device_id = ?
        AND clerk_user_id = ?
        AND revoked_at IS NULL
      ON CONFLICT(clerk_user_id) DO UPDATE SET
        device_id = excluded.device_id,
        instance_id = excluded.instance_id,
        tunnel_origin = excluded.tunnel_origin,
        revision = account_leases.revision + 1,
        updated_at = excluded.updated_at,
        expires_at = excluded.expires_at
      RETURNING *
    `).bind(
      instanceId,
      tunnelOrigin,
      now,
      expiresAt,
      deviceId,
      clerkUserId
    ).first();
    return mapLease(row);
  }

  async renewLease({
    clerkUserId,
    deviceId,
    instanceId,
    expectedRevision,
    tunnelOrigin,
    now,
    expiresAt
  }) {
    requireString(clerkUserId, 'clerkUserId');
    requireString(deviceId, 'deviceId');
    requireString(instanceId, 'instanceId');
    requireRevision(expectedRevision);
    requireString(tunnelOrigin, 'tunnelOrigin');
    requireUtcIso(now, 'now');
    requireLaterTimestamp(expiresAt, 'expiresAt', now);

    const row = await this.database.prepare(`
      UPDATE account_leases
      SET tunnel_origin = ?,
        revision = CASE
          WHEN tunnel_origin = ? THEN revision
          ELSE revision + 1
        END,
        updated_at = ?,
        expires_at = ?
      WHERE clerk_user_id = ?
        AND device_id = ?
        AND instance_id = ?
        AND revision = ?
        AND updated_at < ?
        AND expires_at < ?
        AND EXISTS (
          SELECT 1
          FROM devices
          WHERE devices.device_id = account_leases.device_id
            AND devices.clerk_user_id = account_leases.clerk_user_id
            AND devices.revoked_at IS NULL
        )
      RETURNING *
    `).bind(
      tunnelOrigin,
      tunnelOrigin,
      now,
      expiresAt,
      clerkUserId,
      deviceId,
      instanceId,
      expectedRevision,
      now,
      expiresAt
    ).first();
    return mapLease(row);
  }

  async findActiveLeaseByOwner(clerkUserId, now) {
    requireString(clerkUserId, 'clerkUserId');
    requireUtcIso(now, 'now');
    const row = await this.database.prepare(`
      SELECT account_leases.*
      FROM account_leases
      INNER JOIN devices
        ON devices.device_id = account_leases.device_id
        AND devices.clerk_user_id = account_leases.clerk_user_id
      WHERE account_leases.clerk_user_id = ?
        AND account_leases.expires_at > ?
        AND devices.revoked_at IS NULL
    `).bind(clerkUserId, now).first();
    return mapLease(row);
  }

  async findActiveLeaseByRouteKey(routeKey, now) {
    requireString(routeKey, 'routeKey');
    requireUtcIso(now, 'now');
    const row = await this.database.prepare(`
      SELECT account_leases.*
      FROM claims
      INNER JOIN account_leases
        ON account_leases.clerk_user_id = claims.clerk_user_id
      INNER JOIN devices
        ON devices.device_id = account_leases.device_id
        AND devices.clerk_user_id = account_leases.clerk_user_id
      WHERE claims.route_key = ?
        AND claims.state = 'active'
        AND account_leases.expires_at > ?
        AND devices.revoked_at IS NULL
    `).bind(routeKey, now).first();
    return mapLease(row);
  }

  async closeLease({
    clerkUserId,
    deviceId,
    instanceId,
    expectedRevision
  }) {
    requireString(clerkUserId, 'clerkUserId');
    requireString(deviceId, 'deviceId');
    requireString(instanceId, 'instanceId');
    requireRevision(expectedRevision);

    const result = await this.database.prepare(`
      DELETE FROM account_leases
      WHERE clerk_user_id = ?
        AND device_id = ?
        AND instance_id = ?
        AND revision = ?
    `).bind(
      clerkUserId,
      deviceId,
      instanceId,
      expectedRevision
    ).run();
    return result.meta.changes === 1;
  }

  async recordAuditEvent({
    eventId,
    occurredAt,
    actorClerkUserId,
    action,
    usernameKey = null,
    deviceId = null,
    resultCode,
    cfRayId = null
  }) {
    requireString(eventId, 'eventId');
    requireUtcIso(occurredAt, 'occurredAt');
    requireString(actorClerkUserId, 'actorClerkUserId');
    requireString(action, 'action');
    requireString(resultCode, 'resultCode');
    if (usernameKey !== null) {
      requireString(usernameKey, 'usernameKey');
    }
    if (deviceId !== null) {
      requireString(deviceId, 'deviceId');
    }
    if (cfRayId !== null) {
      requireString(cfRayId, 'cfRayId');
    }

    await this.database.prepare(`
      INSERT INTO audit_events (
        event_id,
        occurred_at,
        actor_clerk_user_id,
        action,
        username_key,
        device_id,
        result_code,
        cf_ray_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      eventId,
      occurredAt,
      actorClerkUserId,
      action,
      usernameKey,
      deviceId,
      resultCode,
      cfRayId
    ).run();
  }

  async listAuditEvents() {
    const result = await this.database.prepare(`
      SELECT *
      FROM audit_events
      ORDER BY occurred_at ASC, event_id ASC
    `).all();
    return result.results.map(mapAuditEvent);
  }

  async pruneAuditEvents(before) {
    requireUtcIso(before, 'before');
    const result = await this.database.prepare(`
      DELETE FROM audit_events
      WHERE occurred_at < ?
    `).bind(before).run();
    return result.meta.changes;
  }

  async consumeRateLimit({
    bucketKey,
    scope,
    action,
    now,
    expiresAt,
    limit
  }) {
    requireString(bucketKey, 'bucketKey');
    requireString(scope, 'scope');
    requireString(action, 'action');
    requireUtcIso(now, 'now');
    requireLaterTimestamp(expiresAt, 'expiresAt', now);
    if (!Number.isSafeInteger(limit) || limit < 1) {
      throw new TypeError('limit must be a positive safe integer');
    }

    const row = await this.database.prepare(`
      INSERT INTO rate_limit_buckets (
        bucket_key,
        scope,
        action,
        counter,
        window_started_at,
        expires_at
      )
      VALUES (?, ?, ?, 1, ?, ?)
      ON CONFLICT(bucket_key) DO UPDATE SET
        scope = CASE
          WHEN rate_limit_buckets.expires_at <= excluded.window_started_at
            THEN excluded.scope
          ELSE rate_limit_buckets.scope
        END,
        action = CASE
          WHEN rate_limit_buckets.expires_at <= excluded.window_started_at
            THEN excluded.action
          ELSE rate_limit_buckets.action
        END,
        counter = CASE
          WHEN rate_limit_buckets.expires_at <= excluded.window_started_at
            THEN 1
          ELSE rate_limit_buckets.counter + 1
        END,
        window_started_at = CASE
          WHEN rate_limit_buckets.expires_at <= excluded.window_started_at
            THEN excluded.window_started_at
          ELSE rate_limit_buckets.window_started_at
        END,
        expires_at = CASE
          WHEN rate_limit_buckets.expires_at <= excluded.window_started_at
            THEN excluded.expires_at
          ELSE rate_limit_buckets.expires_at
        END
      WHERE rate_limit_buckets.expires_at <= excluded.window_started_at
        OR (
          rate_limit_buckets.scope = excluded.scope
          AND rate_limit_buckets.action = excluded.action
          AND rate_limit_buckets.counter < ?
        )
      RETURNING counter, expires_at
    `).bind(
      bucketKey,
      scope,
      action,
      now,
      expiresAt,
      limit
    ).first();

    if (!row) {
      return { allowed: false };
    }
    return {
      allowed: true,
      count: row.counter,
      expiresAt: row.expires_at
    };
  }
}

export function createOverlayRepository(database) {
  return new OverlayRepository(database);
}
