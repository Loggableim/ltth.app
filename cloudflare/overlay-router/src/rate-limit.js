const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const RATE_LIMITS = Object.freeze({
  CLAIMS_PER_ACCOUNT: Object.freeze({
    scope: 'account',
    action: 'claim',
    limit: 5,
    windowMs: HOUR_MS
  }),
  CLAIMS_PER_IP: Object.freeze({
    scope: 'ip',
    action: 'claim',
    limit: 20,
    windowMs: HOUR_MS
  }),
  ENROLLMENTS_PER_ACCOUNT: Object.freeze({
    scope: 'account',
    action: 'enroll',
    limit: 10,
    windowMs: DAY_MS
  }),
  LEASE_UPDATES_PER_DEVICE: Object.freeze({
    scope: 'device',
    action: 'lease_update',
    limit: 1,
    windowMs: 10 * 1000
  })
});

function toHex(bytes) {
  return Array.from(
    bytes,
    (byte) => byte.toString(16).padStart(2, '0')
  ).join('');
}

async function opaqueBucketKey(policy, identity) {
  if (typeof identity !== 'string' || identity.length === 0) {
    throw new TypeError('A rate-limit identity is required');
  }
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(identity)
  );
  return `${policy.action}:${policy.scope}:${toHex(new Uint8Array(digest))}`;
}

function requireTimestamp(nowMs) {
  if (!Number.isFinite(nowMs)) {
    throw new TypeError('A finite rate-limit clock value is required');
  }
  return Math.trunc(nowMs);
}

export async function consumeRateLimit(
  repository,
  policy,
  identity,
  nowMs
) {
  if (!repository ||
      typeof repository.consumeRateLimit !== 'function' ||
      !policy ||
      !Number.isSafeInteger(policy.limit) ||
      !Number.isSafeInteger(policy.windowMs)) {
    throw new TypeError('A repository and rate-limit policy are required');
  }
  const timestamp = requireTimestamp(nowMs);
  return repository.consumeRateLimit({
    bucketKey: await opaqueBucketKey(policy, identity),
    scope: policy.scope,
    action: policy.action,
    now: new Date(timestamp).toISOString(),
    expiresAt: new Date(timestamp + policy.windowMs).toISOString(),
    limit: policy.limit
  });
}

export async function consumeClaimRateLimits(
  repository,
  clerkUserId,
  sourceIp,
  nowMs
) {
  const account = await consumeRateLimit(
    repository,
    RATE_LIMITS.CLAIMS_PER_ACCOUNT,
    clerkUserId,
    nowMs
  );
  const ip = await consumeRateLimit(
    repository,
    RATE_LIMITS.CLAIMS_PER_IP,
    sourceIp,
    nowMs
  );
  return {
    allowed: account.allowed && ip.allowed,
    account,
    ip
  };
}
