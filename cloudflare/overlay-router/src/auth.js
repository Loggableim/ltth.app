const SUPPORTED_CLERK_ALGORITHM = 'RS256';
const JWKS_CACHE_TTL_MS = 10 * 60 * 1000;
const CLOCK_TOLERANCE_SECONDS = 5;
const BEARER_PATTERN =
  /^Bearer[ \t]+([A-Za-z0-9\-._~+/]+=*)$/i;
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;
const EMPTY_SHA256_HEX = '0'.repeat(64);
const SHARED_JWKS_CACHE = new Map();

export const AUTH_ERROR_CODES = Object.freeze({
  CLERK_UNAUTHORIZED: 'clerk_unauthorized',
  DEVICE_UNAUTHORIZED: 'device_unauthorized',
  ADMIN_FORBIDDEN: 'admin_forbidden',
  AUTH_UNAVAILABLE: 'auth_unavailable'
});

const ERROR_DETAILS = Object.freeze({
  [AUTH_ERROR_CODES.CLERK_UNAUTHORIZED]: {
    message: 'Unauthorized',
    status: 401
  },
  [AUTH_ERROR_CODES.DEVICE_UNAUTHORIZED]: {
    message: 'Unauthorized',
    status: 401
  },
  [AUTH_ERROR_CODES.ADMIN_FORBIDDEN]: {
    message: 'Forbidden',
    status: 403
  },
  [AUTH_ERROR_CODES.AUTH_UNAVAILABLE]: {
    message: 'Authentication unavailable',
    status: 503
  }
});

export class AuthenticationError extends Error {
  constructor(code) {
    const detail = ERROR_DETAILS[code] ||
      ERROR_DETAILS[AUTH_ERROR_CODES.CLERK_UNAUTHORIZED];
    super(detail.message);
    this.name = 'AuthenticationError';
    this.code = ERROR_DETAILS[code]
      ? code
      : AUTH_ERROR_CODES.CLERK_UNAUTHORIZED;
    this.status = detail.status;
  }
}

function fail(code) {
  throw new AuthenticationError(code);
}

function requireConfiguredString(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail(AUTH_ERROR_CODES.AUTH_UNAVAILABLE);
  }
  return value.trim();
}

function normalizeList(value) {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  return Array.from(new Set(
    values
      .filter((entry) => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean)
  ));
}

function parseBearer(request, failureCode) {
  if (!request || !request.headers ||
      typeof request.headers.get !== 'function') {
    fail(failureCode);
  }
  const value = request.headers.get('authorization');
  const match = typeof value === 'string'
    ? value.match(BEARER_PATTERN)
    : null;
  if (!match) {
    fail(failureCode);
  }
  return match[1];
}

function decodeBase64Url(value) {
  if (typeof value !== 'string' || value.length === 0 ||
      !/^[A-Za-z0-9_-]+$/u.test(value)) {
    fail(AUTH_ERROR_CODES.CLERK_UNAUTHORIZED);
  }
  const paddingLength = (4 - (value.length % 4)) % 4;
  const encoded = value
    .replace(/-/g, '+')
    .replace(/_/g, '/') + '='.repeat(paddingLength);
  let binary;
  try {
    binary = atob(encoded);
  } catch {
    fail(AUTH_ERROR_CODES.CLERK_UNAUTHORIZED);
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeJsonSegment(value) {
  let decoded;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true })
      .decode(decodeBase64Url(value));
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    fail(AUTH_ERROR_CODES.CLERK_UNAUTHORIZED);
  }

  let parsed;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    fail(AUTH_ERROR_CODES.CLERK_UNAUTHORIZED);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    fail(AUTH_ERROR_CODES.CLERK_UNAUTHORIZED);
  }
  return parsed;
}

function parseJwt(token) {
  if (typeof token !== 'string') {
    fail(AUTH_ERROR_CODES.CLERK_UNAUTHORIZED);
  }
  const segments = token.split('.');
  if (segments.length !== 3) {
    fail(AUTH_ERROR_CODES.CLERK_UNAUTHORIZED);
  }
  const header = decodeJsonSegment(segments[0]);
  const payload = decodeJsonSegment(segments[1]);
  const signature = decodeBase64Url(segments[2]);
  return {
    header,
    payload,
    signature,
    signingInput: new TextEncoder().encode(
      `${segments[0]}.${segments[1]}`
    )
  };
}

function validateJwksUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(AUTH_ERROR_CODES.AUTH_UNAVAILABLE);
  }
  if (url.protocol !== 'https:' || url.username || url.password ||
      url.search || url.hash) {
    fail(AUTH_ERROR_CODES.AUTH_UNAVAILABLE);
  }
  return url.toString();
}

function deriveJwksUrl(issuer) {
  return `${issuer.replace(/\/+$/u, '')}/.well-known/jwks.json`;
}

function isUsableJwk(key, kid) {
  return key &&
    typeof key === 'object' &&
    key.kid === kid &&
    key.kty === 'RSA' &&
    (!key.alg || key.alg === SUPPORTED_CLERK_ALGORITHM) &&
    (!key.use || key.use === 'sig') &&
    (!Array.isArray(key.key_ops) || key.key_ops.includes('verify'));
}

function validateNumericDate(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateClaims(
  payload,
  issuer,
  authorizedParties,
  nowSeconds,
  clockToleranceSeconds
) {
  if (payload.iss !== issuer ||
      !validateNumericDate(payload.exp) ||
      nowSeconds >= payload.exp + clockToleranceSeconds ||
      (payload.nbf !== undefined &&
        (!validateNumericDate(payload.nbf) ||
          nowSeconds + clockToleranceSeconds < payload.nbf))) {
    fail(AUTH_ERROR_CODES.CLERK_UNAUTHORIZED);
  }

  const subject = typeof payload.sub === 'string'
    ? payload.sub.trim()
    : '';
  if (!subject) {
    fail(AUTH_ERROR_CODES.CLERK_UNAUTHORIZED);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'azp')) {
    if (typeof payload.azp !== 'string' ||
        !authorizedParties.includes(payload.azp)) {
      fail(AUTH_ERROR_CODES.CLERK_UNAUTHORIZED);
    }
  } else {
    const audience = Array.isArray(payload.aud)
      ? payload.aud
      : typeof payload.aud === 'string'
        ? [payload.aud]
        : [];
    if (!audience.some((entry) =>
      typeof entry === 'string' &&
      authorizedParties.includes(entry)
    )) {
      fail(AUTH_ERROR_CODES.CLERK_UNAUTHORIZED);
    }
  }

  return subject;
}

async function importVerificationKey(jwk) {
  try {
    return await crypto.subtle.importKey(
      'jwk',
      jwk,
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: 'SHA-256'
      },
      false,
      ['verify']
    );
  } catch {
    fail(AUTH_ERROR_CODES.AUTH_UNAVAILABLE);
  }
}

export function createClerkJwtVerifier(options = {}) {
  const issuer = requireConfiguredString(options.issuer);
  const authorizedParties = normalizeList(options.authorizedParties);
  if (authorizedParties.length === 0) {
    fail(AUTH_ERROR_CODES.AUTH_UNAVAILABLE);
  }
  const jwksUrl = validateJwksUrl(
    typeof options.jwksUrl === 'string' && options.jwksUrl.trim()
      ? options.jwksUrl.trim()
      : deriveJwksUrl(issuer)
  );
  const fetchImpl = options.fetch || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    fail(AUTH_ERROR_CODES.AUTH_UNAVAILABLE);
  }
  const now = typeof options.now === 'function'
    ? options.now
    : Date.now;
  const cacheTtlMs = Number.isFinite(options.cacheTtlMs) &&
    options.cacheTtlMs > 0
    ? options.cacheTtlMs
    : JWKS_CACHE_TTL_MS;
  const clockToleranceSeconds =
    Number.isFinite(options.clockToleranceSeconds) &&
    options.clockToleranceSeconds >= 0
      ? options.clockToleranceSeconds
      : CLOCK_TOLERANCE_SECONDS;
  const jwksCache = options.jwksCache instanceof Map
    ? options.jwksCache
    : new Map();

  function normalizeCacheEntry(entry) {
    if (!(entry.unknownKids instanceof Set)) {
      entry.unknownKids = new Set();
    }
    if (typeof entry.refreshUsed !== 'boolean') {
      entry.refreshUsed = false;
    }
    return entry;
  }

  async function fetchKeys(forceRefresh = false, previousEntry = null) {
    const currentTime = now();
    const cached = jwksCache.get(jwksUrl);
    if (!forceRefresh && cached && cached.expiresAt > currentTime) {
      return {
        entry: normalizeCacheEntry(cached),
        fetched: false
      };
    }

    let response;
    try {
      response = await fetchImpl(jwksUrl, {
        headers: { accept: 'application/json' }
      });
    } catch {
      fail(AUTH_ERROR_CODES.AUTH_UNAVAILABLE);
    }
    if (!response || !response.ok) {
      fail(AUTH_ERROR_CODES.AUTH_UNAVAILABLE);
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      fail(AUTH_ERROR_CODES.AUTH_UNAVAILABLE);
    }
    if (!payload || !Array.isArray(payload.keys) ||
        payload.keys.length === 0) {
      fail(AUTH_ERROR_CODES.AUTH_UNAVAILABLE);
    }

    const keys = payload.keys.filter((key) =>
      key && typeof key === 'object'
    );
    if (keys.length === 0) {
      fail(AUTH_ERROR_CODES.AUTH_UNAVAILABLE);
    }
    const entry = {
      keys,
      expiresAt: forceRefresh &&
        previousEntry?.expiresAt > currentTime
        ? previousEntry.expiresAt
        : currentTime + cacheTtlMs,
      refreshUsed: forceRefresh,
      refreshPromise: null,
      unknownKids: new Set()
    };
    jwksCache.set(jwksUrl, entry);
    return { entry, fetched: true };
  }

  async function resolveKey(kid) {
    const loaded = await fetchKeys();
    let entry = loaded.entry;
    let jwk = entry.keys.find((key) => isUsableJwk(key, kid));
    if (jwk) {
      return importVerificationKey(jwk);
    }

    if (entry.unknownKids.has(kid)) {
      fail(AUTH_ERROR_CODES.CLERK_UNAUTHORIZED);
    }
    if (loaded.fetched) {
      entry.unknownKids.add(kid);
      fail(AUTH_ERROR_CODES.CLERK_UNAUTHORIZED);
    }

    if (!entry.refreshUsed && !entry.refreshPromise) {
      entry.refreshUsed = true;
      entry.refreshPromise = fetchKeys(true, entry)
        .then((result) => result.entry);
    }
    if (entry.refreshPromise) {
      entry = await entry.refreshPromise;
      jwk = entry.keys.find((key) => isUsableJwk(key, kid));
      if (jwk) {
        return importVerificationKey(jwk);
      }
    }

    entry.unknownKids.add(kid);
    fail(AUTH_ERROR_CODES.CLERK_UNAUTHORIZED);
  }

  return Object.freeze({
    async verifyToken(token) {
      const parsed = parseJwt(token);
      if (parsed.header.alg !== SUPPORTED_CLERK_ALGORITHM ||
          typeof parsed.header.kid !== 'string' ||
          parsed.header.kid.trim().length === 0) {
        fail(AUTH_ERROR_CODES.CLERK_UNAUTHORIZED);
      }

      const key = await resolveKey(parsed.header.kid);
      let verified;
      try {
        verified = await crypto.subtle.verify(
          'RSASSA-PKCS1-v1_5',
          key,
          parsed.signature,
          parsed.signingInput
        );
      } catch {
        fail(AUTH_ERROR_CODES.CLERK_UNAUTHORIZED);
      }
      if (!verified) {
        fail(AUTH_ERROR_CODES.CLERK_UNAUTHORIZED);
      }

      validateClaims(
        parsed.payload,
        issuer,
        authorizedParties,
        now() / 1000,
        clockToleranceSeconds
      );
      return parsed.payload;
    }
  });
}

function buildClerkVerifier(env, options) {
  if (options.verifier) {
    if (typeof options.verifier.verifyToken !== 'function') {
      fail(AUTH_ERROR_CODES.AUTH_UNAVAILABLE);
    }
    return options.verifier;
  }
  const issuer = requireConfiguredString(env?.CLERK_ISSUER);
  return createClerkJwtVerifier({
    issuer,
    jwksUrl: env?.CLERK_JWKS_URL || deriveJwksUrl(issuer),
    authorizedParties: env?.CLERK_AUTHORIZED_PARTIES,
    fetch: options.fetch,
    now: options.now,
    cacheTtlMs: options.cacheTtlMs,
    clockToleranceSeconds: options.clockToleranceSeconds,
    jwksCache: options.jwksCache || SHARED_JWKS_CACHE
  });
}

export async function verifyClerkSessionToken(
  token,
  env,
  options = {}
) {
  const verifier = buildClerkVerifier(env, options);
  return verifier.verifyToken(token);
}

export async function authenticateClerkManagementRequest(
  request,
  env,
  options = {}
) {
  const token = parseBearer(
    request,
    AUTH_ERROR_CODES.CLERK_UNAUTHORIZED
  );
  const claims = await verifyClerkSessionToken(token, env, options);
  const clerkUserId = typeof claims.sub === 'string'
    ? claims.sub.trim()
    : '';
  if (!clerkUserId) {
    fail(AUTH_ERROR_CODES.CLERK_UNAUTHORIZED);
  }
  return { clerkUserId, claims };
}

function bytesToHex(bytes) {
  return Array.from(
    bytes,
    (byte) => byte.toString(16).padStart(2, '0')
  ).join('');
}

export async function hashDeviceCredential(credential, pepper = '') {
  if (typeof credential !== 'string' || credential.length === 0 ||
      typeof pepper !== 'string') {
    throw new TypeError(
      'Device credential and pepper must be strings'
    );
  }
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${credential}${pepper}`)
  );
  return bytesToHex(new Uint8Array(digest));
}

function constantTimeHexEqual(left, right) {
  const safeLeft = SHA256_HEX_PATTERN.test(left)
    ? left
    : EMPTY_SHA256_HEX;
  const safeRight = SHA256_HEX_PATTERN.test(right)
    ? right
    : EMPTY_SHA256_HEX;
  let difference = 0;
  for (let index = 0; index < 64; index += 1) {
    difference |= safeLeft.charCodeAt(index) ^
      safeRight.charCodeAt(index);
  }
  return difference === 0 &&
    SHA256_HEX_PATTERN.test(left) &&
    SHA256_HEX_PATTERN.test(right);
}

export async function authenticateDeviceRequest(request, options = {}) {
  const credential = parseBearer(
    request,
    AUTH_ERROR_CODES.DEVICE_UNAUTHORIZED
  );
  if (!options.repository ||
      typeof options.repository.findDeviceById !== 'function') {
    fail(AUTH_ERROR_CODES.AUTH_UNAVAILABLE);
  }
  if (typeof options.deviceId !== 'string' ||
      options.deviceId.length === 0) {
    fail(AUTH_ERROR_CODES.DEVICE_UNAUTHORIZED);
  }
  const pepper = options.pepper === undefined ? '' : options.pepper;
  if (typeof pepper !== 'string') {
    fail(AUTH_ERROR_CODES.AUTH_UNAVAILABLE);
  }

  const candidateHash = await hashDeviceCredential(
    credential,
    pepper
  );
  let device;
  try {
    device = await options.repository.findDeviceById(
      options.deviceId
    );
  } catch {
    fail(AUTH_ERROR_CODES.AUTH_UNAVAILABLE);
  }

  const storedHash = typeof device?.tokenHash === 'string'
    ? device.tokenHash
    : EMPTY_SHA256_HEX;
  const hashMatches = constantTimeHexEqual(
    candidateHash,
    storedHash
  );
  const expectedOwnerMatches =
    options.expectedClerkUserId === undefined ||
    (typeof options.expectedClerkUserId === 'string' &&
      options.expectedClerkUserId.length > 0 &&
      device?.clerkUserId === options.expectedClerkUserId);
  const identityMatches = device?.deviceId === options.deviceId &&
    typeof device?.clerkUserId === 'string' &&
    device.clerkUserId.length > 0;

  if (!device || device.revokedAt !== null || !identityMatches ||
      !expectedOwnerMatches || !hashMatches) {
    fail(AUTH_ERROR_CODES.DEVICE_UNAUTHORIZED);
  }
  return {
    clerkUserId: device.clerkUserId,
    deviceId: device.deviceId
  };
}

export async function authenticateOverlayAdminRequest(
  request,
  env,
  options = {}
) {
  const auth = await authenticateClerkManagementRequest(
    request,
    env,
    options
  );
  const adminUserIds = normalizeList(
    env?.OVERLAY_ADMIN_CLERK_USER_IDS
  );
  if (!adminUserIds.includes(auth.clerkUserId)) {
    fail(AUTH_ERROR_CODES.ADMIN_FORBIDDEN);
  }
  return auth;
}
