import {
  AuthenticationError,
  authenticateClerkManagementRequest,
  authenticateDeviceRequest,
  authenticateOverlayAdminRequest,
  hashDeviceCredential
} from './auth.js';
import { createAuditRecorder } from './audit.js';
import {
  consumeClaimRateLimits,
  consumeRateLimit,
  RATE_LIMITS
} from './rate-limit.js';
import {
  DEVICE_ID_MAX_LENGTH,
  generateRouteKey,
  MANAGEMENT_BODY_SCHEMAS,
  normalizeTikTokUsername,
  parseAuthenticatedJsonBody,
  RequestValidationError,
  createNeutralErrorResponse
} from './validation.js';

export const MANAGEMENT_HOST = 'overlay.ltth.app';
export const MANAGEMENT_PREFIX = '/_ltth/v1';
export const DEVICE_ID_HEADER = 'x-ltth-device-id';
export const DEFAULT_MAX_ACTIVE_DEVICES = 5;

const DEVICE_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const LEASE_DURATION_MS = 120 * 1000;

class ManagementError extends Error {
  constructor(code, status) {
    super(code);
    this.name = 'ManagementError';
    this.code = code;
    this.status = status;
  }
}

function randomHex(byteLength) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(
    bytes,
    (byte) => byte.toString(16).padStart(2, '0')
  ).join('');
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'Pragma': 'no-cache',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

function emptyResponse(status = 204) {
  return new Response(null, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Pragma': 'no-cache',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

function sanitizeClaim(claim) {
  return {
    username: claim.usernameKey,
    displayUsername: claim.displayUsername,
    state: claim.state,
    claimedAt: claim.claimedAt,
    releaseRequestedAt: claim.releaseRequestedAt,
    reusableAfter: claim.reusableAfter,
    updatedAt: claim.updatedAt
  };
}

function sanitizeDevice(device) {
  return {
    deviceId: device.deviceId,
    label: device.label,
    createdAt: device.createdAt,
    lastSeenAt: device.lastSeenAt,
    revokedAt: device.revokedAt
  };
}

function sanitizeLease(lease) {
  if (!lease) {
    return { active: false };
  }
  return {
    active: true,
    deviceId: lease.deviceId,
    instanceId: lease.instanceId,
    revision: lease.revision,
    updatedAt: lease.updatedAt,
    expiresAt: lease.expiresAt
  };
}

function parseMaximumActiveDevices(value) {
  if (value === undefined || value === null || value === '') {
    return DEFAULT_MAX_ACTIVE_DEVICES;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 20
    ? parsed
    : DEFAULT_MAX_ACTIVE_DEVICES;
}

function normalizeDeviceId(value) {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > DEVICE_ID_MAX_LENGTH ||
    !DEVICE_ID_PATTERN.test(value)
  ) {
    throw new RequestValidationError('invalid_request', 400);
  }
  return value;
}

function decodePathValue(value) {
  try {
    const decoded = decodeURIComponent(value);
    if (encodeURIComponent(decoded).toLowerCase() !== value.toLowerCase()) {
      throw new Error('non-canonical encoding');
    }
    return decoded;
  } catch {
    throw new RequestValidationError('invalid_request', 400);
  }
}

function managementRelativePath(pathname) {
  if (pathname === MANAGEMENT_PREFIX) {
    return '/';
  }
  if (pathname.startsWith(`${MANAGEMENT_PREFIX}/`)) {
    return pathname.slice(MANAGEMENT_PREFIX.length);
  }
  return null;
}

function mutationTimestamp(nowMs, expectedUpdatedAt = null) {
  let timestamp = Math.trunc(nowMs);
  if (expectedUpdatedAt !== null) {
    const expected = Date.parse(expectedUpdatedAt);
    if (timestamp <= expected) {
      timestamp = expected + 1;
    }
  }
  return {
    milliseconds: timestamp,
    iso: new Date(timestamp).toISOString()
  };
}

function sourceIp(request) {
  const value = request.headers.get('cf-connecting-ip');
  return typeof value === 'string' && value.length > 0 && value.length <= 128
    ? value
    : 'unknown';
}

function domainError(code, status) {
  throw new ManagementError(code, status);
}

async function parseEmptyBody(request) {
  return parseAuthenticatedJsonBody(
    request,
    MANAGEMENT_BODY_SCHEMAS.empty
  );
}

export function isManagementPath(pathname) {
  return managementRelativePath(pathname) !== null;
}

export function createManagementHandler(options = {}) {
  const repository = options.repository;
  if (!repository) {
    throw new TypeError('A management repository is required');
  }
  const workerEnv = options.env || {};
  const clock = typeof options.now === 'function'
    ? options.now
    : Date.now;
  const authenticateClerk = options.authenticateClerk ||
    ((request) => authenticateClerkManagementRequest(
      request,
      workerEnv,
      options.clerkAuthOptions
    ));
  const authenticateAdmin = options.authenticateAdmin ||
    ((request) => authenticateOverlayAdminRequest(
      request,
      workerEnv,
      options.adminAuthOptions || options.clerkAuthOptions
    ));
  const authenticateDevice = options.authenticateDevice ||
    ((request, deviceId) => authenticateDeviceRequest(request, {
      repository,
      deviceId,
      pepper: workerEnv.OVERLAY_DEVICE_TOKEN_PEPPER || ''
    }));
  const audit = createAuditRecorder(repository, {
    eventIdFactory: options.auditEventIdFactory
  });
  const maxActiveDevices = parseMaximumActiveDevices(
    workerEnv.OVERLAY_MAX_ACTIVE_DEVICES_PER_ACCOUNT
  );

  function scheduleBackground(pending, context) {
    const safePending = pending.catch(() => undefined);
    if (typeof context.waitUntil === 'function') {
      try {
        context.waitUntil(safePending);
      } catch {
        // The foreground result remains authoritative.
      }
    }
  }

  function auditFields(
    request,
    actorClerkUserId,
    action,
    resultCode,
    targets = {},
    occurredAt = new Date(Math.trunc(clock())).toISOString()
  ) {
    return {
      request,
      occurredAt,
      actorClerkUserId,
      action,
      resultCode,
      usernameKey: targets.usernameKey || null,
      deviceId: targets.deviceId || null
    };
  }

  function record(
    request,
    context,
    actorClerkUserId,
    action,
    resultCode,
    targets = {},
    occurredAt = new Date(Math.trunc(clock())).toISOString()
  ) {
    scheduleBackground(
      audit.record(auditFields(
        request,
        actorClerkUserId,
        action,
        resultCode,
        targets,
        occurredAt
      )),
      context
    );
  }

  function atomicAudit(
    request,
    actorClerkUserId,
    action,
    resultCode,
    targets,
    occurredAt
  ) {
    return audit.create(auditFields(
      request,
      actorClerkUserId,
      action,
      resultCode,
      targets,
      occurredAt
    ));
  }

  function pruneAfterAtomicAudit(context, occurredAt) {
    scheduleBackground(audit.prune(occurredAt), context);
  }

  async function enrollDevice(request, context) {
    const auth = await authenticateClerk(request);
    const body = await parseAuthenticatedJsonBody(
      request,
      MANAGEMENT_BODY_SCHEMAS.deviceEnrollment
    );
    const timestamp = mutationTimestamp(clock());
    const rate = await consumeRateLimit(
      repository,
      RATE_LIMITS.ENROLLMENTS_PER_ACCOUNT,
      auth.clerkUserId,
      timestamp.milliseconds
    );
    if (!rate.allowed) {
      record(
        request,
        context,
        auth.clerkUserId,
        'device_enroll',
        'rate_limited',
        {},
        timestamp.iso
      );
      domainError('rate_limited', 429);
    }
    const deviceId = `d-${randomHex(16)}`;
    const credential = randomHex(32);
    const tokenHash = await hashDeviceCredential(
      credential,
      workerEnv.OVERLAY_DEVICE_TOKEN_PEPPER || ''
    );
    const auditEvent = atomicAudit(
      request,
      auth.clerkUserId,
      'device_enroll',
      'enrolled',
      { deviceId },
      timestamp.iso
    );
    const device = await repository.createDeviceWithActiveLimit({
      deviceId,
      clerkUserId: auth.clerkUserId,
      tokenHash,
      label: body.label,
      now: timestamp.iso,
      activeDeviceLimit: maxActiveDevices,
      auditEvent
    });
    if (!device) {
      record(
        request,
        context,
        auth.clerkUserId,
        'device_enroll',
        'active_device_limit_reached',
        {},
        timestamp.iso
      );
      domainError('active_device_limit_reached', 409);
    }
    pruneAfterAtomicAudit(context, timestamp.iso);
    return jsonResponse({
      device: sanitizeDevice(device),
      credential
    }, 201);
  }

  async function getAccount(request) {
    const auth = await authenticateClerk(request);
    const now = new Date(Math.trunc(clock())).toISOString();
    const [claims, devices, lease] = await Promise.all([
      repository.listClaimsByOwner(auth.clerkUserId),
      repository.listDevicesByOwner(auth.clerkUserId),
      repository.findActiveLeaseByOwner(auth.clerkUserId, now)
    ]);
    return jsonResponse({
      claims: claims.map(sanitizeClaim),
      devices: devices.map(sanitizeDevice),
      lease: sanitizeLease(lease)
    });
  }

  async function createClaim(request, context) {
    const auth = await authenticateClerk(request);
    const body = await parseAuthenticatedJsonBody(
      request,
      MANAGEMENT_BODY_SCHEMAS.claim
    );
    const timestamp = mutationTimestamp(clock());
    const limits = await consumeClaimRateLimits(
      repository,
      auth.clerkUserId,
      sourceIp(request),
      timestamp.milliseconds
    );
    if (!limits.allowed) {
      record(
        request,
        context,
        auth.clerkUserId,
        'claim_create',
        'rate_limited',
        { usernameKey: body.username },
        timestamp.iso
      );
      domainError('rate_limited', 429);
    }
    const auditEvent = atomicAudit(
      request,
      auth.clerkUserId,
      'claim_create',
      'claimed',
      { usernameKey: body.username },
      timestamp.iso
    );
    const result = await repository.claimUsername({
      usernameKey: body.username,
      displayUsername: body.username,
      clerkUserId: auth.clerkUserId,
      routeKey: generateRouteKey(),
      now: timestamp.iso,
      auditEvent
    });
    if (!result.ok) {
      record(
        request,
        context,
        auth.clerkUserId,
        'claim_create',
        'unavailable',
        { usernameKey: body.username },
        timestamp.iso
      );
      domainError('claim_unavailable', 409);
    }
    pruneAfterAtomicAudit(context, timestamp.iso);
    return jsonResponse({ claim: sanitizeClaim(result.claim) }, 201);
  }

  async function restoreClaim(
    request,
    context,
    encodedUsername
  ) {
    const auth = await authenticateClerk(request);
    const usernameKey = normalizeTikTokUsername(
      decodePathValue(encodedUsername)
    );
    await parseEmptyBody(request);
    const current = await repository.findClaimByUsername(usernameKey);
    if (
      !current ||
      current.clerkUserId !== auth.clerkUserId ||
      current.state !== 'cooldown'
    ) {
      record(
        request,
        context,
        auth.clerkUserId,
        'claim_restore',
        'unavailable',
        { usernameKey }
      );
      domainError('claim_unavailable', 409);
    }
    const timestamp = mutationTimestamp(clock(), current.updatedAt);
    const auditEvent = atomicAudit(
      request,
      auth.clerkUserId,
      'claim_restore',
      'restored',
      { usernameKey },
      timestamp.iso
    );
    const restored = await repository.restoreClaim({
      usernameKey,
      clerkUserId: auth.clerkUserId,
      displayUsername: current.displayUsername,
      expectedUpdatedAt: current.updatedAt,
      now: timestamp.iso,
      auditEvent
    });
    if (!restored) {
      record(
        request,
        context,
        auth.clerkUserId,
        'claim_restore',
        'conflict',
        { usernameKey },
        timestamp.iso
      );
      domainError('claim_conflict', 409);
    }
    pruneAfterAtomicAudit(context, timestamp.iso);
    return jsonResponse({ claim: sanitizeClaim(restored) });
  }

  async function releaseClaim(
    request,
    context,
    encodedUsername
  ) {
    const auth = await authenticateClerk(request);
    const usernameKey = normalizeTikTokUsername(
      decodePathValue(encodedUsername)
    );
    const body = await parseAuthenticatedJsonBody(
      request,
      MANAGEMENT_BODY_SCHEMAS.claimRelease
    );
    if (body.username !== usernameKey) {
      throw new RequestValidationError('invalid_request', 400);
    }
    const current = await repository.findClaimByUsername(usernameKey);
    if (
      !current ||
      current.clerkUserId !== auth.clerkUserId ||
      current.state !== 'active'
    ) {
      record(
        request,
        context,
        auth.clerkUserId,
        'claim_release',
        'unavailable',
        { usernameKey }
      );
      domainError('claim_unavailable', 409);
    }
    const timestamp = mutationTimestamp(clock(), current.updatedAt);
    const auditEvent = atomicAudit(
      request,
      auth.clerkUserId,
      'claim_release',
      'released',
      { usernameKey },
      timestamp.iso
    );
    const released = await repository.releaseClaim({
      usernameKey,
      clerkUserId: auth.clerkUserId,
      expectedUpdatedAt: current.updatedAt,
      now: timestamp.iso,
      reusableAfter: new Date(
        timestamp.milliseconds + SEVEN_DAYS_MS
      ).toISOString(),
      auditEvent
    });
    if (!released) {
      record(
        request,
        context,
        auth.clerkUserId,
        'claim_release',
        'conflict',
        { usernameKey },
        timestamp.iso
      );
      domainError('claim_conflict', 409);
    }
    pruneAfterAtomicAudit(context, timestamp.iso);
    return jsonResponse({ claim: sanitizeClaim(released) });
  }

  async function revokeDevice(
    request,
    context,
    encodedDeviceId
  ) {
    const auth = await authenticateClerk(request);
    const deviceId = normalizeDeviceId(
      decodePathValue(encodedDeviceId)
    );
    await parseEmptyBody(request);
    const timestamp = mutationTimestamp(clock());
    const auditEvent = atomicAudit(
      request,
      auth.clerkUserId,
      'device_revoke',
      'revoked',
      { deviceId },
      timestamp.iso
    );
    const revoked = await repository.revokeDevice({
      deviceId,
      clerkUserId: auth.clerkUserId,
      now: timestamp.iso,
      auditEvent
    });
    if (!revoked) {
      record(
        request,
        context,
        auth.clerkUserId,
        'device_revoke',
        'unavailable',
        { deviceId },
        timestamp.iso
      );
      domainError('device_unavailable', 404);
    }
    pruneAfterAtomicAudit(context, timestamp.iso);
    return emptyResponse();
  }

  async function updateLease(request, context) {
    const body = await parseAuthenticatedJsonBody(
      request,
      MANAGEMENT_BODY_SCHEMAS.leaseUpdate
    );
    const auth = await authenticateDevice(request, body.deviceId);
    const timestamp = mutationTimestamp(clock());
    const rate = await consumeRateLimit(
      repository,
      RATE_LIMITS.LEASE_UPDATES_PER_DEVICE,
      auth.deviceId,
      timestamp.milliseconds
    );
    if (!rate.allowed) {
      record(
        request,
        context,
        auth.clerkUserId,
        'lease_update',
        'rate_limited',
        { deviceId: auth.deviceId },
        timestamp.iso
      );
      domainError('rate_limited', 429);
    }
    const parameters = {
      clerkUserId: auth.clerkUserId,
      deviceId: auth.deviceId,
      instanceId: body.instanceId,
      tunnelOrigin: body.tunnelOrigin,
      now: timestamp.iso,
      expiresAt: new Date(
        timestamp.milliseconds + LEASE_DURATION_MS
      ).toISOString(),
      auditEvent: atomicAudit(
        request,
        auth.clerkUserId,
        'lease_update',
        'accepted',
        { deviceId: auth.deviceId },
        timestamp.iso
      )
    };
    const lease = body.expectedRevision === undefined
      ? await repository.activateLease(parameters)
      : await repository.renewLease({
        ...parameters,
        expectedRevision: body.expectedRevision
      });
    if (!lease) {
      record(
        request,
        context,
        auth.clerkUserId,
        'lease_update',
        'conflict',
        { deviceId: auth.deviceId },
        timestamp.iso
      );
      domainError('lease_conflict', 409);
    }
    pruneAfterAtomicAudit(context, timestamp.iso);
    return jsonResponse({ lease: sanitizeLease(lease) });
  }

  async function closeLease(request, context) {
    const body = await parseAuthenticatedJsonBody(
      request,
      MANAGEMENT_BODY_SCHEMAS.leaseClose
    );
    const auth = await authenticateDevice(request, body.deviceId);
    const occurredAt = new Date(Math.trunc(clock())).toISOString();
    const auditEvent = atomicAudit(
      request,
      auth.clerkUserId,
      'lease_close',
      'closed',
      { deviceId: auth.deviceId },
      occurredAt
    );
    const closed = await repository.closeLease({
      clerkUserId: auth.clerkUserId,
      deviceId: auth.deviceId,
      instanceId: body.instanceId,
      expectedRevision: body.expectedRevision,
      auditEvent
    });
    if (!closed) {
      record(
        request,
        context,
        auth.clerkUserId,
        'lease_close',
        'conflict',
        { deviceId: auth.deviceId },
        occurredAt
      );
      domainError('lease_conflict', 409);
    }
    pruneAfterAtomicAudit(context, occurredAt);
    return emptyResponse();
  }

  async function getDeviceStatus(request) {
    const deviceId = normalizeDeviceId(
      request.headers.get(DEVICE_ID_HEADER)
    );
    const auth = await authenticateDevice(request, deviceId);
    const now = new Date(Math.trunc(clock())).toISOString();
    const [device, lease] = await Promise.all([
      repository.findActiveDeviceById(auth.deviceId),
      repository.findActiveLeaseByOwner(auth.clerkUserId, now)
    ]);
    if (!device || device.clerkUserId !== auth.clerkUserId) {
      return createNeutralErrorResponse(401);
    }
    return jsonResponse({
      device: sanitizeDevice(device),
      lease: lease?.deviceId === auth.deviceId
        ? sanitizeLease(lease)
        : { active: false }
    });
  }

  async function adminRelease(
    request,
    context,
    encodedUsername
  ) {
    const auth = await authenticateAdmin(request);
    const usernameKey = normalizeTikTokUsername(
      decodePathValue(encodedUsername)
    );
    await parseEmptyBody(request);
    const timestamp = mutationTimestamp(clock());
    const auditEvent = atomicAudit(
      request,
      auth.clerkUserId,
      'admin_claim_release',
      'released',
      { usernameKey },
      timestamp.iso
    );
    const released = await repository.forceReleaseClaim(
      usernameKey,
      auditEvent
    );
    if (!released) {
      record(
        request,
        context,
        auth.clerkUserId,
        'admin_claim_release',
        'unavailable',
        { usernameKey },
        timestamp.iso
      );
      domainError('claim_unavailable', 404);
    }
    pruneAfterAtomicAudit(context, timestamp.iso);
    return emptyResponse();
  }

  return async function handleManagementRequest(
    request,
    context = {}
  ) {
    let url;
    try {
      url = new URL(request.url);
    } catch {
      return createNeutralErrorResponse(404);
    }
    const relativePath = managementRelativePath(url.pathname);
    if (relativePath === null) {
      return null;
    }
    if (url.hostname !== MANAGEMENT_HOST || url.protocol !== 'https:') {
      return createNeutralErrorResponse(404);
    }

    try {
      if (request.method === 'POST' &&
          relativePath === '/devices/enroll') {
        return await enrollDevice(request, context);
      }
      if (request.method === 'GET' && relativePath === '/account') {
        return await getAccount(request);
      }
      if (request.method === 'POST' && relativePath === '/claims') {
        return await createClaim(request, context);
      }
      if (request.method === 'PUT' && relativePath === '/lease') {
        return await updateLease(request, context);
      }
      if (request.method === 'DELETE' && relativePath === '/lease') {
        return await closeLease(request, context);
      }
      if (request.method === 'GET' &&
          relativePath === '/device/status') {
        return await getDeviceStatus(request);
      }

      let match = /^\/claims\/([^/]+)\/restore$/.exec(relativePath);
      if (request.method === 'POST' && match) {
        return await restoreClaim(
          request,
          context,
          match[1]
        );
      }
      match = /^\/claims\/([^/]+)$/.exec(relativePath);
      if (request.method === 'DELETE' && match) {
        return await releaseClaim(
          request,
          context,
          match[1]
        );
      }
      match = /^\/devices\/([^/]+)$/.exec(relativePath);
      if (request.method === 'DELETE' && match) {
        return await revokeDevice(
          request,
          context,
          match[1]
        );
      }
      match =
        /^\/admin\/claims\/([^/]+)\/release$/.exec(relativePath);
      if (request.method === 'POST' && match) {
        return await adminRelease(
          request,
          context,
          match[1]
        );
      }
      return createNeutralErrorResponse(404);
    } catch (error) {
      if (error instanceof ManagementError) {
        return jsonResponse({ error: error.code }, error.status);
      }
      if (error instanceof RequestValidationError) {
        return createNeutralErrorResponse(error.status);
      }
      if (error instanceof AuthenticationError ||
          Number.isSafeInteger(error?.status)) {
        return createNeutralErrorResponse(error.status);
      }
      return createNeutralErrorResponse(503);
    }
  };
}

export function createManagementHandlerFromEnvironment(
  env,
  repository,
  options = {}
) {
  return createManagementHandler({
    ...options,
    env,
    repository
  });
}
