'use strict';

const { URL } = require('url');

const LOCAL_PREFIX = '/api/stable-overlay-routing';
const MANAGEMENT_PREFIX = '/_ltth/v1';
const DEFAULT_API_ORIGIN = 'https://overlay.ltth.app';
const MAX_UPSTREAM_RESPONSE_BYTES = 64 * 1024;
const MAX_UPSTREAM_RESPONSE_CHUNKS = 1024;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9._:-]+$/;
const JSON_CONTENT_TYPE_PATTERN = /^application\/json(?:\s*;.*)?$/i;
const DOMAIN_ERROR_CODES = new Set([
  'claim_unavailable',
  'claim_conflict',
  'device_unavailable',
  'active_device_limit_reached',
  'lease_conflict',
  'rate_limited'
]);
const cancellationTargets = new WeakSet();

class LocalRouteError extends Error {
  constructor(status, code, message) {
    super(code);
    this.name = 'LocalRouteError';
    this.status = status;
    this.code = code;
    this.publicMessage = message;
  }
}

function isFeatureEnabled(value) {
  return value === true || value === 'true';
}

function normalizeApiOrigin(value, allowInsecureLocalTestOrigin) {
  const raw = typeof value === 'string' && value.trim()
    ? value.trim()
    : DEFAULT_API_ORIGIN;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch (_) {
    throw new TypeError('Stable overlay routing API origin is invalid');
  }
  const localTestOrigin =
    allowInsecureLocalTestOrigin === true &&
    parsed.protocol === 'http:' &&
    ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
  if (
    (parsed.protocol !== 'https:' && !localTestOrigin) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname !== '/' && parsed.pathname !== '') ||
    parsed.origin === 'null'
  ) {
    throw new TypeError('Stable overlay routing API origin is invalid');
  }
  return parsed.origin;
}

function invalidRequest() {
  throw new LocalRouteError(
    400,
    'INVALID_REQUEST',
    'Invalid stable overlay routing request.'
  );
}

function normalizeUsername(value) {
  if (typeof value !== 'string') {
    invalidRequest();
  }
  let normalized = value.trim();
  if (normalized.startsWith('@')) {
    normalized = normalized.slice(1);
  }
  normalized = normalized.normalize('NFKC').toLowerCase();
  if (
    normalized.length < 2 ||
    normalized.length > 24 ||
    normalized.split('.').some(segment => segment.length === 0) ||
    !/^[a-z0-9_.]+$/.test(normalized)
  ) {
    invalidRequest();
  }
  return normalized;
}

function normalizeLabel(value) {
  if (typeof value !== 'string') {
    invalidRequest();
  }
  const normalized = value.trim().normalize('NFKC');
  if (
    normalized.length < 1 ||
    Array.from(normalized).length > 64 ||
    /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(normalized)
  ) {
    invalidRequest();
  }
  return normalized;
}

function normalizeIdentifier(value) {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 128 ||
    !IDENTIFIER_PATTERN.test(value)
  ) {
    invalidRequest();
  }
  return value;
}

function requireExactBody(req, expectedKeys) {
  if (
    !JSON_CONTENT_TYPE_PATTERN.test(String(req.get?.('content-type') || '')) ||
    !req.body ||
    typeof req.body !== 'object' ||
    Array.isArray(req.body)
  ) {
    invalidRequest();
  }
  const actualKeys = Object.keys(req.body).sort();
  const wantedKeys = [...expectedKeys].sort();
  if (
    actualKeys.length !== wantedKeys.length ||
    actualKeys.some((key, index) => key !== wantedKeys[index])
  ) {
    invalidRequest();
  }
  return req.body;
}

function rejectQuery(req) {
  if (Object.keys(req.query || {}).length > 0) {
    invalidRequest();
  }
}

function safeDate(value, { nullable = true } = {}) {
  if (value === null && nullable) {
    return null;
  }
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new LocalRouteError(
      503,
      'STABLE_ROUTING_UNAVAILABLE',
      'Stable overlay routing is temporarily unavailable.'
    );
  }
  return new Date(value).toISOString();
}

function safeText(value, maxLength) {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    Array.from(value).length > maxLength ||
    /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(value)
  ) {
    throw new LocalRouteError(
      503,
      'STABLE_ROUTING_UNAVAILABLE',
      'Stable overlay routing is temporarily unavailable.'
    );
  }
  return value;
}

function sanitizeClaim(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new LocalRouteError(
      503,
      'STABLE_ROUTING_UNAVAILABLE',
      'Stable overlay routing is temporarily unavailable.'
    );
  }
  let username;
  try {
    username = normalizeUsername(value.username);
  } catch (_) {
    throw new LocalRouteError(
      503,
      'STABLE_ROUTING_UNAVAILABLE',
      'Stable overlay routing is temporarily unavailable.'
    );
  }
  if (!['active', 'cooldown'].includes(value.state)) {
    throw new LocalRouteError(
      503,
      'STABLE_ROUTING_UNAVAILABLE',
      'Stable overlay routing is temporarily unavailable.'
    );
  }
  return {
    username,
    displayUsername: safeText(value.displayUsername, 64),
    state: value.state,
    claimedAt: safeDate(value.claimedAt),
    releaseRequestedAt: safeDate(value.releaseRequestedAt),
    reusableAfter: safeDate(value.reusableAfter),
    updatedAt: safeDate(value.updatedAt, { nullable: false })
  };
}

function sanitizeDevice(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new LocalRouteError(
      503,
      'STABLE_ROUTING_UNAVAILABLE',
      'Stable overlay routing is temporarily unavailable.'
    );
  }
  let deviceId;
  try {
    deviceId = normalizeIdentifier(value.deviceId);
  } catch (_) {
    throw new LocalRouteError(
      503,
      'STABLE_ROUTING_UNAVAILABLE',
      'Stable overlay routing is temporarily unavailable.'
    );
  }
  return {
    deviceId,
    label: safeText(value.label, 64),
    createdAt: safeDate(value.createdAt, { nullable: false }),
    lastSeenAt: safeDate(value.lastSeenAt),
    revokedAt: safeDate(value.revokedAt)
  };
}

function sanitizeLease(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new LocalRouteError(
      503,
      'STABLE_ROUTING_UNAVAILABLE',
      'Stable overlay routing is temporarily unavailable.'
    );
  }
  if (value.active === false) {
    return { active: false };
  }
  if (
    value.active !== true ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1
  ) {
    throw new LocalRouteError(
      503,
      'STABLE_ROUTING_UNAVAILABLE',
      'Stable overlay routing is temporarily unavailable.'
    );
  }
  let deviceId;
  let instanceId;
  try {
    deviceId = normalizeIdentifier(value.deviceId);
    instanceId = normalizeIdentifier(value.instanceId);
  } catch (_) {
    throw new LocalRouteError(
      503,
      'STABLE_ROUTING_UNAVAILABLE',
      'Stable overlay routing is temporarily unavailable.'
    );
  }
  return {
    active: true,
    deviceId,
    instanceId,
    revision: value.revision,
    updatedAt: safeDate(value.updatedAt, { nullable: false }),
    expiresAt: safeDate(value.expiresAt, { nullable: false })
  };
}

function sanitizeAccount(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !Array.isArray(value.claims) ||
    !Array.isArray(value.devices) ||
    value.claims.length > 100 ||
    value.devices.length > 100
  ) {
    throw new LocalRouteError(
      503,
      'STABLE_ROUTING_UNAVAILABLE',
      'Stable overlay routing is temporarily unavailable.'
    );
  }
  return {
    claims: value.claims.map(sanitizeClaim),
    devices: value.devices.map(sanitizeDevice),
    lease: sanitizeLease(value.lease)
  };
}

function upstreamUnavailable() {
  return new LocalRouteError(
    503,
    'STABLE_ROUTING_UNAVAILABLE',
    'Stable overlay routing is temporarily unavailable.'
  );
}

function shuttingDown() {
  return new LocalRouteError(
    503,
    'STABLE_ROUTING_SHUTTING_DOWN',
    'Stable overlay routing is shutting down.'
  );
}

function initiateCancellation(target) {
  if (!target || typeof target.cancel !== 'function') {
    return;
  }
  if (
    (typeof target === 'object' || typeof target === 'function') &&
    cancellationTargets.has(target)
  ) {
    return;
  }
  if (typeof target === 'object' || typeof target === 'function') {
    cancellationTargets.add(target);
  }
  try {
    const cancellation = target.cancel();
    if (cancellation && typeof cancellation.catch === 'function') {
      cancellation.catch(() => {});
    }
  } catch (_) {}
}

function validateAbortController(controller) {
  if (
    !controller ||
    typeof controller.abort !== 'function' ||
    !controller.signal ||
    typeof controller.signal.addEventListener !== 'function'
  ) {
    throw new TypeError('AbortController factory returned an invalid value');
  }
  return controller;
}

function createRequestDeadline({
  timers,
  timeoutMs,
  abortControllerFactory
}) {
  const controller = validateAbortController(abortControllerFactory());
  let expired = false;
  let rejectDeadline;
  const deadline = new Promise((_, reject) => {
    rejectDeadline = reject;
  });
  const timeoutId = timers.setTimeout(() => {
    expired = true;
    try {
      controller.abort();
    } catch (_) {}
    rejectDeadline(upstreamUnavailable());
  }, timeoutMs);

  return {
    signal: controller.signal,
    race(value) {
      return Promise.race([Promise.resolve(value), deadline]);
    },
    assertActive() {
      if (expired || controller.signal.aborted) {
        throw upstreamUnavailable();
      }
    },
    dispose() {
      timers.clearTimeout(timeoutId);
      try {
        controller.abort();
      } catch (_) {}
    }
  };
}

function validateUpstreamJsonMetadata(response) {
  const contentType = response?.headers?.get?.('content-type');
  if (
    typeof contentType !== 'string' ||
    !JSON_CONTENT_TYPE_PATTERN.test(contentType)
  ) {
    throw upstreamUnavailable();
  }
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) {
      throw upstreamUnavailable();
    }
    const declaredBytes = Number(contentLength);
    if (
      !Number.isSafeInteger(declaredBytes) ||
      declaredBytes < 1 ||
      declaredBytes > MAX_UPSTREAM_RESPONSE_BYTES
    ) {
      throw upstreamUnavailable();
    }
  }
}

async function readBoundedJson(response, deadline) {
  try {
    validateUpstreamJsonMetadata(response);
  } catch (error) {
    initiateCancellation(response?.body);
    throw error;
  }
  if (!response.body || typeof response.body.getReader !== 'function') {
    initiateCancellation(response?.body);
    throw upstreamUnavailable();
  }
  let reader;
  try {
    reader = response.body.getReader();
  } catch (_) {
    initiateCancellation(response.body);
    throw upstreamUnavailable();
  }
  if (
    !reader ||
    typeof reader.read !== 'function' ||
    typeof reader.cancel !== 'function'
  ) {
    initiateCancellation(reader);
    initiateCancellation(response.body);
    throw upstreamUnavailable();
  }

  const chunks = [];
  let totalBytes = 0;
  let completed = false;
  try {
    while (true) {
      deadline.assertActive();
      const item = await deadline.race(reader.read());
      deadline.assertActive();
      if (!item || typeof item.done !== 'boolean') {
        throw upstreamUnavailable();
      }
      if (item.done) {
        completed = true;
        break;
      }
      if (
        !(item.value instanceof Uint8Array) ||
        item.value.byteLength < 1
      ) {
        throw upstreamUnavailable();
      }
      totalBytes += item.value.byteLength;
      if (
        totalBytes > MAX_UPSTREAM_RESPONSE_BYTES ||
        chunks.length >= MAX_UPSTREAM_RESPONSE_CHUNKS
      ) {
        throw upstreamUnavailable();
      }
      chunks.push(Buffer.from(
        item.value.buffer,
        item.value.byteOffset,
        item.value.byteLength
      ));
    }
  } catch (error) {
    initiateCancellation(reader);
    throw error instanceof LocalRouteError ? error : upstreamUnavailable();
  } finally {
    if (completed && typeof reader.releaseLock === 'function') {
      try {
        reader.releaseLock();
      } catch (_) {}
    }
  }
  if (totalBytes < 1) {
    throw upstreamUnavailable();
  }

  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(
      Buffer.concat(chunks, totalBytes)
    );
    return JSON.parse(text);
  } catch (_) {
    throw upstreamUnavailable();
  }
}

async function mapUpstreamFailure(response, deadline) {
  if (response.status === 401 || response.status === 403) {
    initiateCancellation(response.body);
    throw new LocalRouteError(
      401,
      'AUTH_REQUIRED',
      'Sign in again to manage stable overlay routing.'
    );
  }
  if ([404, 409, 429].includes(response.status)) {
    let body = null;
    try {
      body = await readBoundedJson(response, deadline);
    } catch (_) {}
    const code = DOMAIN_ERROR_CODES.has(body?.error)
      ? body.error
      : response.status === 429
        ? 'rate_limited'
        : null;
    if (code) {
      throw new LocalRouteError(
        response.status,
        code,
        'The stable overlay routing request could not be completed.'
      );
    }
  }
  initiateCancellation(response.body);
  throw new LocalRouteError(
    503,
    'STABLE_ROUTING_UNAVAILABLE',
    'Stable overlay routing is temporarily unavailable.'
  );
}

function createStableOverlayRoutingLifecycle({
  client,
  networkManager,
  enabled,
  logger = console
} = {}) {
  if (!client || typeof client.start !== 'function' ||
      typeof client.stop !== 'function') {
    throw new TypeError('A stable overlay routing client is required');
  }
  if (!networkManager || typeof networkManager.shutdown !== 'function') {
    throw new TypeError('A network manager is required');
  }

  let startPromise = null;
  let shutdownPromise = null;
  let mutationGeneration = 0;
  let shutdownStarted = false;

  return {
    captureMutationGeneration() {
      return mutationGeneration;
    },

    isMutationGenerationActive(generation) {
      return !shutdownStarted && generation === mutationGeneration;
    },

    afterServerListening() {
      if (!isFeatureEnabled(enabled) || shutdownStarted) {
        return Promise.resolve();
      }
      if (!startPromise) {
        const generation = mutationGeneration;
        startPromise = Promise.resolve()
          .then(() => {
            if (
              shutdownStarted ||
              generation !== mutationGeneration
            ) {
              return undefined;
            }
            return client.start();
          })
          .then(() => undefined)
          .catch(() => {
            logger.warn?.(
              'Stable overlay routing could not start after the server began listening.'
            );
          });
      }
      return startPromise;
    },

    shutdown() {
      if (!shutdownPromise) {
        shutdownStarted = true;
        mutationGeneration += 1;
        shutdownPromise = (async () => {
          try {
            await client.stop();
          } catch (_) {
            logger.error?.('Stable overlay routing could not stop cleanly.');
          }
          try {
            await networkManager.shutdown();
          } catch (_) {
            logger.error?.('Error shutting down network manager.');
          }
        })();
      }
      return shutdownPromise;
    }
  };
}

function registerStableOverlayRoutingRoutes({
  app,
  apiLimiter,
  fetch,
  verifyClerkSessionToken,
  credentialStore,
  client,
  config = {},
  logger = console,
  now = Date.now,
  timers = {
    setTimeout,
    clearTimeout
  },
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  abortControllerFactory = () => new AbortController(),
  getAuthorizedParties,
  lifecycle
} = {}) {
  if (!app || typeof app.get !== 'function' || typeof app.post !== 'function') {
    throw new TypeError('An Express app is required');
  }
  if (typeof apiLimiter !== 'function') {
    throw new TypeError('An API limiter is required');
  }
  if (typeof fetch !== 'function') {
    throw new TypeError('A fetch implementation is required');
  }
  if (typeof verifyClerkSessionToken !== 'function') {
    throw new TypeError('A Clerk session verifier is required');
  }
  if (
    !timers ||
    typeof timers.setTimeout !== 'function' ||
    typeof timers.clearTimeout !== 'function'
  ) {
    throw new TypeError('Timer functions are required');
  }
  if (
    !Number.isSafeInteger(requestTimeoutMs) ||
    requestTimeoutMs < 1
  ) {
    throw new TypeError('A positive request timeout is required');
  }
  if (typeof abortControllerFactory !== 'function') {
    throw new TypeError('An AbortController factory is required');
  }
  if (typeof getAuthorizedParties !== 'function') {
    throw new TypeError('A local authorized-party resolver is required');
  }
  if (
    !lifecycle ||
    typeof lifecycle.captureMutationGeneration !== 'function' ||
    typeof lifecycle.isMutationGenerationActive !== 'function'
  ) {
    throw new TypeError('A stable overlay routing lifecycle is required');
  }
  if (
    !credentialStore ||
    typeof credentialStore.load !== 'function' ||
    typeof credentialStore.save !== 'function' ||
    typeof credentialStore.setDefaultUsername !== 'function' ||
    typeof credentialStore.remove !== 'function'
  ) {
    throw new TypeError('A stable overlay credential store is required');
  }
  if (
    !client ||
    typeof client.getStatus !== 'function' ||
    typeof client.start !== 'function' ||
    typeof client.stop !== 'function'
  ) {
    throw new TypeError('A stable overlay routing client is required');
  }

  const enabled = isFeatureEnabled(config.enabled);
  const apiOrigin = enabled
    ? normalizeApiOrigin(
      config.apiOrigin,
      config.allowInsecureLocalTestOrigin
    )
    : null;
  let enrollmentInProgress = false;
  let localMutationTail = Promise.resolve();

  function send(res, status, body) {
    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');
    return res.status(status).json(body);
  }

  function sendError(res, error) {
    if (error instanceof LocalRouteError) {
      return send(res, error.status, {
        success: false,
        code: error.code,
        error: error.publicMessage
      });
    }
    logger.error?.('Stable overlay routing local request failed.');
    return send(res, 503, {
      success: false,
      code: 'STABLE_ROUTING_UNAVAILABLE',
      error: 'Stable overlay routing is temporarily unavailable.'
    });
  }

  async function authorize(req) {
    const authorization = String(req.get?.('authorization') || '');
    const match = /^Bearer ([^\s]+)$/.exec(authorization);
    if (!match) {
      throw new LocalRouteError(
        401,
        'AUTH_REQUIRED',
        'Sign in again to manage stable overlay routing.'
      );
    }
    const token = match[1];
    let authorizedParties;
    try {
      const candidates = getAuthorizedParties(req);
      authorizedParties = [...new Set(
        (Array.isArray(candidates) ? candidates : [])
          .map(value => {
            const parsed = new URL(String(value || ''));
            if (
              !['http:', 'https:'].includes(parsed.protocol) ||
              parsed.username ||
              parsed.password ||
              parsed.pathname !== '/' ||
              parsed.search ||
              parsed.hash
            ) {
              throw new Error('invalid authorized party');
            }
            return parsed.origin.toLowerCase();
          })
      )];
    } catch (_) {
      throw upstreamUnavailable();
    }
    if (authorizedParties.length < 1) {
      throw upstreamUnavailable();
    }
    let claims;
    try {
      claims = await verifyClerkSessionToken(token, {
        req,
        logger,
        authorizedParties,
        includeRequestAuthorizedParties: false,
        requireAuthorizedParty: true
      });
    } catch (_) {
      logger.warn?.('Stable overlay routing rejected a local Clerk session.');
      throw new LocalRouteError(
        401,
        'AUTH_REQUIRED',
        'Sign in again to manage stable overlay routing.'
      );
    }
    if (
      !claims ||
      typeof claims !== 'object' ||
      typeof (claims.sub || claims.userId) !== 'string' ||
      !(claims.sub || claims.userId).trim()
    ) {
      throw new LocalRouteError(
        401,
        'AUTH_REQUIRED',
        'Sign in again to manage stable overlay routing.'
      );
    }
    return token;
  }

  async function forward(
    token,
    workerPath,
    method,
    body,
    expectedStatus,
    deadline,
    mutationFence = null
  ) {
    const headers = {
      Authorization: `Bearer ${token}`
    };
    const options = {
      method,
      headers,
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: deadline.signal
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }

    let response;
    try {
      const request = Promise.resolve(fetch(
        `${apiOrigin}${MANAGEMENT_PREFIX}${workerPath}`,
        options
      ));
      request.then(
        lateResponse => {
          if (deadline.signal.aborted) {
            initiateCancellation(lateResponse?.body);
          }
        },
        () => {}
      );
      response = await deadline.race(request);
      deadline.assertActive();
      mutationFence?.assert();
    } catch (error) {
      initiateCancellation(response?.body);
      if (error instanceof LocalRouteError) {
        throw error;
      }
      throw new LocalRouteError(
        503,
        'STABLE_ROUTING_UNAVAILABLE',
        'Stable overlay routing is temporarily unavailable.'
      );
    }
    if (!response || typeof response.status !== 'number') {
      initiateCancellation(response?.body);
      throw new LocalRouteError(
        503,
        'STABLE_ROUTING_UNAVAILABLE',
        'Stable overlay routing is temporarily unavailable.'
      );
    }
    if (!response.ok) {
      await mapUpstreamFailure(response, deadline);
    }
    if (response.status !== expectedStatus) {
      initiateCancellation(response.body);
      throw new LocalRouteError(
        503,
        'STABLE_ROUTING_UNAVAILABLE',
        'Stable overlay routing is temporarily unavailable.'
      );
    }
    if (expectedStatus === 204) {
      initiateCancellation(response.body);
    }
    return response;
  }

  function assertEnabled() {
    if (!enabled) {
      throw new LocalRouteError(
        503,
        'STABLE_ROUTING_DISABLED',
        'Stable overlay routing is disabled.'
      );
    }
  }

  function createMutationFence(deadline) {
    const generation = lifecycle.captureMutationGeneration();
    return {
      assert() {
        deadline.assertActive();
        if (!lifecycle.isMutationGenerationActive(generation)) {
          throw shuttingDown();
        }
      }
    };
  }

  async function withLocalMutationGate(deadline, mutationFence, operation) {
    const predecessor = localMutationTail;
    let release;
    const ticket = new Promise(resolve => {
      release = resolve;
    });
    localMutationTail = predecessor
      .catch(() => {})
      .then(() => ticket);

    try {
      await deadline.race(predecessor);
      mutationFence.assert();
      return await operation();
    } finally {
      release();
    }
  }

  function handler(operation, { stateChanging = false } = {}) {
    return async (req, res) => {
      const deadline = createRequestDeadline({
        timers,
        timeoutMs: requestTimeoutMs,
        abortControllerFactory
      });
      const mutationFence = stateChanging
        ? createMutationFence(deadline)
        : null;
      try {
        return await deadline.race((async () => {
          assertEnabled();
          mutationFence?.assert();
          const token = await authorize(req);
          deadline.assertActive();
          mutationFence?.assert();
          rejectQuery(req);
          return operation(
            req,
            res,
            token,
            deadline,
            mutationFence
          );
        })());
      } catch (error) {
        return sendError(res, error);
      } finally {
        deadline.dispose();
      }
    };
  }

  async function accountForToken(token, deadline, mutationFence = null) {
    const response = await forward(
      token,
      '/account',
      'GET',
      undefined,
      200,
      deadline,
      mutationFence
    );
    const account = sanitizeAccount(
      await readBoundedJson(response, deadline)
    );
    mutationFence?.assert();
    return account;
  }

  app.get(
    `${LOCAL_PREFIX}/status`,
    apiLimiter,
    (_req, res) => send(res, 200, {
      success: true,
      status: client.getStatus()
    })
  );

  app.get(
    `${LOCAL_PREFIX}/account`,
    apiLimiter,
    handler(async (_req, res, token, deadline) => {
      const account = await accountForToken(token, deadline);
      let stored;
      try {
        stored = credentialStore.load();
      } catch (_) {
        throw new LocalRouteError(
          503,
          'STABLE_ROUTING_UNAVAILABLE',
          'Stable overlay routing is temporarily unavailable.'
        );
      }
      return send(res, 200, {
        success: true,
        account,
        defaultUsername: stored?.defaultUsername || null
      });
    })
  );

  app.post(
    `${LOCAL_PREFIX}/devices/enroll`,
    apiLimiter,
    handler(async (req, res, token, deadline, mutationFence) => {
      if (enrollmentInProgress) {
        throw new LocalRouteError(
          409,
          'ENROLLMENT_IN_PROGRESS',
          'A stable overlay routing enrollment is already in progress.'
        );
      }
      enrollmentInProgress = true;
      try {
        const body = requireExactBody(req, ['label']);
        const label = normalizeLabel(body.label);
        const response = await forward(
          token,
          '/devices/enroll',
          'POST',
          { label },
          201,
          deadline,
          mutationFence
        );
        const payload = await readBoundedJson(response, deadline);
        mutationFence.assert();
        const device = sanitizeDevice(payload?.device);
        if (
          typeof payload?.credential !== 'string' ||
          !/^[a-f0-9]{64}$/.test(payload.credential)
        ) {
          throw upstreamUnavailable();
        }
        return withLocalMutationGate(
          deadline,
          mutationFence,
          async () => {
            await deadline.race(client.stop());
            mutationFence.assert();
            credentialStore.save({
              deviceId: device.deviceId,
              credential: payload.credential,
              enrolledAt: device.createdAt ||
                new Date(Math.trunc(now())).toISOString(),
              label: device.label,
              defaultUsername: null
            });
            mutationFence.assert();
            await deadline.race(client.start());
            mutationFence.assert();
            return send(res, 201, {
              success: true,
              device,
              status: client.getStatus()
            });
          }
        );
      } finally {
        enrollmentInProgress = false;
      }
    }, { stateChanging: true })
  );

  app.post(
    `${LOCAL_PREFIX}/claims`,
    apiLimiter,
    handler(async (req, res, token, deadline, mutationFence) => {
      const body = requireExactBody(req, ['username']);
      const username = normalizeUsername(body.username);
      const response = await forward(
        token,
        '/claims',
        'POST',
        { username },
        201,
        deadline,
        mutationFence
      );
      const payload = await readBoundedJson(response, deadline);
      mutationFence.assert();
      return send(res, 201, {
        success: true,
        claim: sanitizeClaim(payload?.claim)
      });
    }, { stateChanging: true })
  );

  app.post(
    `${LOCAL_PREFIX}/claims/:username/restore`,
    apiLimiter,
    handler(async (req, res, token, deadline, mutationFence) => {
      requireExactBody(req, []);
      const username = normalizeUsername(req.params.username);
      const response = await forward(
        token,
        `/claims/${encodeURIComponent(username)}/restore`,
        'POST',
        {},
        200,
        deadline,
        mutationFence
      );
      const payload = await readBoundedJson(response, deadline);
      mutationFence.assert();
      return send(res, 200, {
        success: true,
        claim: sanitizeClaim(payload?.claim)
      });
    }, { stateChanging: true })
  );

  app.delete(
    `${LOCAL_PREFIX}/claims/:username`,
    apiLimiter,
    handler(async (req, res, token, deadline, mutationFence) => {
      const body = requireExactBody(req, ['username']);
      const pathUsername = normalizeUsername(req.params.username);
      const bodyUsername = normalizeUsername(body.username);
      if (pathUsername !== bodyUsername) {
        invalidRequest();
      }
      const response = await forward(
        token,
        `/claims/${encodeURIComponent(pathUsername)}`,
        'DELETE',
        { username: pathUsername },
        200,
        deadline,
        mutationFence
      );
      const payload = await readBoundedJson(response, deadline);
      mutationFence.assert();
      return send(res, 200, {
        success: true,
        claim: sanitizeClaim(payload?.claim)
      });
    }, { stateChanging: true })
  );

  app.delete(
    `${LOCAL_PREFIX}/devices/:deviceId`,
    apiLimiter,
    handler(async (req, res, token, deadline, mutationFence) => {
      requireExactBody(req, []);
      const deviceId = normalizeIdentifier(req.params.deviceId);
      await forward(
        token,
        `/devices/${encodeURIComponent(deviceId)}`,
        'DELETE',
        {},
        204,
        deadline,
        mutationFence
      );
      mutationFence.assert();

      await withLocalMutationGate(
        deadline,
        mutationFence,
        async () => {
          mutationFence.assert();
          let stored = null;
          try {
            stored = credentialStore.load();
          } catch (_) {}
          if (stored?.deviceId === deviceId) {
            try {
              await deadline.race(client.stop());
            } catch (_) {
              mutationFence.assert();
              logger.warn?.(
                'Stable overlay routing could not stop after device revocation.'
              );
            }
            mutationFence.assert();
            credentialStore.remove();
          }
        }
      );
      mutationFence.assert();
      return send(res, 200, { success: true });
    }, { stateChanging: true })
  );

  app.put(
    `${LOCAL_PREFIX}/default-username`,
    apiLimiter,
    handler(async (req, res, token, deadline, mutationFence) => {
      const body = requireExactBody(req, ['username']);
      const username = normalizeUsername(body.username);
      const account = await accountForToken(
        token,
        deadline,
        mutationFence
      );
      if (!account.claims.some(
        claim => claim.username === username && claim.state === 'active'
      )) {
        throw new LocalRouteError(
          409,
          'CLAIM_NOT_ACTIVE',
          'Choose an active username claim from this account.'
        );
      }
      await withLocalMutationGate(
        deadline,
        mutationFence,
        async () => {
          mutationFence.assert();
          credentialStore.setDefaultUsername(username);
        }
      );
      mutationFence.assert();
      return send(res, 200, {
        success: true,
        defaultUsername: username
      });
    }, { stateChanging: true })
  );

  app.use(
    LOCAL_PREFIX,
    apiLimiter,
    (_req, res) => send(res, 404, {
      success: false,
      code: 'NOT_FOUND',
      error: 'Not found.'
    })
  );
}

module.exports = {
  createStableOverlayRoutingLifecycle,
  isFeatureEnabled,
  registerStableOverlayRoutingRoutes
};
