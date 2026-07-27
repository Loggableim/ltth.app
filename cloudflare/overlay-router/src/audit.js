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

export function createAuditRecorder(repository) {
  if (!repository ||
      typeof repository.recordAuditEvent !== 'function' ||
      typeof repository.pruneAuditEvents !== 'function') {
    throw new TypeError('An audit-capable repository is required');
  }

  return Object.freeze({
    async record({
      request,
      occurredAt,
      actorClerkUserId,
      action,
      usernameKey = null,
      deviceId = null,
      resultCode
    }, context = {}) {
      requireIdentifier(actorClerkUserId, 'actorClerkUserId');
      requireIdentifier(action, 'action');
      requireIdentifier(resultCode, 'resultCode');
      if (usernameKey !== null) {
        requireIdentifier(usernameKey, 'usernameKey');
      }
      if (deviceId !== null) {
        requireIdentifier(deviceId, 'deviceId');
      }

      await repository.recordAuditEvent({
        eventId: `a-${randomHex(16)}`,
        occurredAt,
        actorClerkUserId,
        action,
        usernameKey,
        deviceId,
        resultCode,
        cfRayId: safeOptionalIdentifier(
          request?.headers?.get('cf-ray')
        )
      });

      const prune = repository.pruneAuditEvents(
        new Date(Date.parse(occurredAt) - RETENTION_MS).toISOString()
      );
      if (typeof context.waitUntil === 'function') {
        context.waitUntil(prune);
      } else {
        await prune;
      }
    }
  });
}
