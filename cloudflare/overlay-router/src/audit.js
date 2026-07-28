const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const SAFE_IDENTIFIER = /^[A-Za-z0-9._:-]{1,128}$/;

function randomHex(byteLength) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(
    bytes,
    (byte) => byte.toString(16).padStart(2, '0')
  ).join('');
}

function safeOptionalIdentifier(value) {
  return typeof value === 'string' && SAFE_IDENTIFIER.test(value)
    ? value
    : null;
}

function requireIdentifier(value, name) {
  if (typeof value !== 'string' || !SAFE_IDENTIFIER.test(value)) {
    throw new TypeError(`${name} must be a safe identifier`);
  }
  return value;
}

function requireUtcIso(value) {
  if (typeof value !== 'string' ||
      new Date(value).toISOString() !== value) {
    throw new TypeError(
      'occurredAt must be a canonical UTC ISO-8601 timestamp'
    );
  }
  return value;
}

export function createSanitizedAuditEvent({
  request,
  occurredAt,
  actorClerkUserId,
  action,
  usernameKey = null,
  deviceId = null,
  resultCode
}, options = {}) {
  requireUtcIso(occurredAt);
  requireIdentifier(actorClerkUserId, 'actorClerkUserId');
  requireIdentifier(action, 'action');
  requireIdentifier(resultCode, 'resultCode');
  if (usernameKey !== null) {
    requireIdentifier(usernameKey, 'usernameKey');
  }
  if (deviceId !== null) {
    requireIdentifier(deviceId, 'deviceId');
  }
  const eventId = options.eventIdFactory
    ? options.eventIdFactory()
    : `a-${randomHex(16)}`;
  requireIdentifier(eventId, 'eventId');
  return {
    eventId,
    occurredAt,
    actorClerkUserId,
    action,
    usernameKey,
    deviceId,
    resultCode,
    cfRayId: safeOptionalIdentifier(
      request?.headers?.get('cf-ray')
    )
  };
}

export function createAuditRecorder(repository, options = {}) {
  if (!repository ||
      typeof repository.recordAuditEvent !== 'function' ||
      typeof repository.pruneAuditEvents !== 'function') {
    throw new TypeError('An audit-capable repository is required');
  }

  const create = (fields) => createSanitizedAuditEvent(
    fields,
    { eventIdFactory: options.eventIdFactory }
  );

  return Object.freeze({
    create,
    async prune(occurredAt) {
      const prune = repository.pruneAuditEvents(
        new Date(Date.parse(occurredAt) - RETENTION_MS).toISOString()
      );
      await prune;
    },
    async record(fields, context = {}) {
      const event = create(fields);
      await repository.recordAuditEvent(event);
      const prune = this.prune(event.occurredAt);
      if (typeof context.waitUntil === 'function') {
        context.waitUntil(prune);
      } else {
        await prune;
      }
    }
  });
}
