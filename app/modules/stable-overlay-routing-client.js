'use strict';

const crypto = require('crypto');
const { URL } = require('url');

const HEARTBEAT_INTERVAL_MS = 30_000;
const RETRY_BACKOFF_MS = Object.freeze([
  2_000,
  4_000,
  8_000,
  16_000,
  30_000
]);
const MANAGEMENT_PATH = '/_ltth/v1';
const TUNNEL_ORIGIN_PATTERN =
  /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/;
const INSTANCE_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

class ClientRequestError extends Error {
  constructor(kind) {
    super(kind);
    this.name = 'ClientRequestError';
    this.kind = kind;
  }
}

function isFeatureEnabled(value) {
  return value === true || value === 'true';
}

function normalizeApiOrigin(value, allowInsecureLocalTestOrigin) {
  const raw = typeof value === 'string' && value.trim()
    ? value.trim()
    : 'https://overlay.ltth.app';
  let parsed;
  try {
    parsed = new URL(raw);
  } catch (_) {
    throw new TypeError('Stable overlay routing API origin is invalid');
  }
  const isDedicatedLocalTestOrigin =
    allowInsecureLocalTestOrigin === true &&
    parsed.protocol === 'http:' &&
    ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
  if (
    (parsed.protocol !== 'https:' && !isDedicatedLocalTestOrigin) ||
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

function normalizeTunnelOrigin(value) {
  if (typeof value !== 'string' || !TUNNEL_ORIGIN_PATTERN.test(value)) {
    throw new ClientRequestError('protocol');
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch (_) {
    throw new ClientRequestError('protocol');
  }
  if (
    parsed.origin !== value ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash ||
    parsed.port ||
    parsed.username ||
    parsed.password
  ) {
    throw new ClientRequestError('protocol');
  }
  return parsed.origin;
}

function validateInstanceId(value) {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 128 ||
    !INSTANCE_ID_PATTERN.test(value)
  ) {
    throw new TypeError('A valid process instance ID is required');
  }
  return value;
}

class StableOverlayRoutingClient {
  constructor({
    networkManager,
    fetch,
    clock,
    timers,
    credentialStore,
    config = {},
    logger,
    getPort,
    random = () => crypto.randomInt(0, 1_000_001) / 1_000_000,
    instanceIdFactory = () => crypto.randomUUID(),
    requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    abortControllerFactory = () => new AbortController()
  } = {}) {
    if (
      !networkManager ||
      typeof networkManager.ensureOverlayQuickTunnel !== 'function'
    ) {
      throw new TypeError('A network manager is required');
    }
    if (typeof fetch !== 'function') {
      throw new TypeError('A fetch implementation is required');
    }
    if (typeof clock !== 'function') {
      throw new TypeError('A clock is required');
    }
    if (
      !timers ||
      typeof timers.setTimeout !== 'function' ||
      typeof timers.clearTimeout !== 'function'
    ) {
      throw new TypeError('Timer functions are required');
    }
    if (!credentialStore || typeof credentialStore.load !== 'function') {
      throw new TypeError('A credential store is required');
    }
    if (
      !logger ||
      typeof logger.info !== 'function' ||
      typeof logger.warn !== 'function' ||
      typeof logger.error !== 'function'
    ) {
      throw new TypeError('A logger is required');
    }
    if (typeof getPort !== 'function') {
      throw new TypeError('A port getter is required');
    }
    if (typeof random !== 'function') {
      throw new TypeError('A random source is required');
    }
    if (typeof instanceIdFactory !== 'function') {
      throw new TypeError('An instance ID factory is required');
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

    this.networkManager = networkManager;
    this.fetch = fetch;
    this.clock = clock;
    this.timers = timers;
    this.credentialStore = credentialStore;
    this.config = { ...config };
    this.logger = logger;
    this.getPort = getPort;
    this.random = random;
    this.requestTimeoutMs = requestTimeoutMs;
    this.abortControllerFactory = abortControllerFactory;
    this.enabled = isFeatureEnabled(config.enabled);
    this.apiOrigin = this.enabled
      ? normalizeApiOrigin(
        config.apiOrigin,
        config.allowInsecureLocalTestOrigin
      )
      : null;
    this.instanceId = validateInstanceId(instanceIdFactory());

    this.state = this.enabled ? 'unenrolled' : 'disabled';
    this.revision = null;
    this.lastSuccessfulHeartbeat = null;
    this.credentials = null;
    this.tunnelOrigin = null;
    this.retryIndex = 0;
    this.timerId = null;
    this.startPromise = null;
    this.cyclePromise = null;
    this.stopPromise = null;
    this.stopping = false;
    this.lifecycleGeneration = 0;
    this.inflightRequestControllers = new Set();
  }

  getStatus() {
    return {
      state: this.state,
      revision: this.revision,
      lastSuccessfulHeartbeat: this.lastSuccessfulHeartbeat
    };
  }

  setNeedsAuth() {
    this._clearTimer();
    this.state = this.enabled ? 'needs_auth' : 'disabled';
    return this.getStatus();
  }

  start() {
    if (!this.enabled) {
      this.state = 'disabled';
      return Promise.resolve(this.getStatus());
    }
    if (this.startPromise) {
      return this.startPromise;
    }
    if (this.stopping && this.stopPromise) {
      return this.stopPromise.then(() => this.start());
    }
    if (this.state === 'active' && this.revision !== null) {
      return Promise.resolve(this.getStatus());
    }

    this.stopping = false;
    const generation = ++this.lifecycleGeneration;
    const starting = this._start(generation);
    this.startPromise = starting.finally(() => {
      if (this.startPromise === wrapped) {
        this.startPromise = null;
      }
    });
    const wrapped = this.startPromise;
    return wrapped;
  }

  async _start(generation) {
    let loaded;
    try {
      loaded = this.credentialStore.load();
      if (loaded && typeof loaded.then === 'function') {
        loaded = await loaded;
      }
    } catch (error) {
      if (!this._isActiveGeneration(generation)) {
        return this.getStatus();
      }
      if (error?.code === 'STABLE_OVERLAY_CREDENTIAL_INVALID') {
        this.state = 'auth_error';
        this.logger.warn(
          'Stable overlay routing cannot use the stored device credential.'
        );
        return this.getStatus();
      }
      this.state = 'error';
      this.logger.error(
        'Stable overlay routing could not read its credential store.'
      );
      return this.getStatus();
    }

    if (!this._isActiveGeneration(generation)) {
      return this.getStatus();
    }
    if (!loaded) {
      this.credentials = null;
      this.state = 'unenrolled';
      return this.getStatus();
    }
    this.credentials = loaded;
    return this._beginCycle(generation);
  }

  publishTunnelRotation() {
    if (
      !this.enabled ||
      !this.credentials ||
      this.stopping
    ) {
      return Promise.resolve(this.getStatus());
    }
    this._clearTimer();
    return this._beginCycle(this.lifecycleGeneration);
  }

  _beginCycle(generation) {
    if (!this._isActiveGeneration(generation)) {
      return Promise.resolve(this.getStatus());
    }
    if (this.cyclePromise) {
      return this.cyclePromise;
    }
    const cycling = this._runCycle(generation);
    this.cyclePromise = cycling.finally(() => {
      if (this.cyclePromise === wrapped) {
        this.cyclePromise = null;
      }
    });
    const wrapped = this.cyclePromise;
    return wrapped;
  }

  async _runCycle(generation) {
    try {
      this.state = 'starting_tunnel';
      let tunnel;
      try {
        tunnel = await this.networkManager.ensureOverlayQuickTunnel(
          this.getPort()
        );
      } catch (_) {
        throw new ClientRequestError('transient');
      }
      if (!this._isActiveGeneration(generation)) {
        throw new ClientRequestError('cancelled');
      }
      const tunnelOrigin = normalizeTunnelOrigin(tunnel?.tunnelURL);
      this.state = 'activating';
      const lease = await this._putLease(tunnelOrigin, { generation });
      this.tunnelOrigin = tunnelOrigin;
      this.revision = lease.revision;
      if (!this._isActiveGeneration(generation)) {
        throw new ClientRequestError('cancelled');
      }
      this.lastSuccessfulHeartbeat =
        new Date(Math.trunc(this.clock())).toISOString();
      this.retryIndex = 0;
      this.state = 'active';
      this._schedule(HEARTBEAT_INTERVAL_MS, generation);
    } catch (error) {
      this._handleCycleError(error, generation);
    }
    return this.getStatus();
  }

  async _putLease(
    tunnelOrigin,
    {
      generation = this.lifecycleGeneration,
      reconcileConflict = true
    } = {}
  ) {
    if (!this._isActiveGeneration(generation)) {
      throw new ClientRequestError('cancelled');
    }
    const body = {
      deviceId: this.credentials.deviceId,
      instanceId: this.instanceId,
      tunnelOrigin
    };
    const hasExpectedRevision =
      Number.isSafeInteger(this.revision) && this.revision > 0;
    if (hasExpectedRevision) {
      body.expectedRevision = this.revision;
    }
    let response;
    try {
      response = await this._fetchLease('PUT', body);
    } catch (error) {
      if (
        !(error instanceof ClientRequestError) ||
        error.kind !== 'conflict' ||
        !hasExpectedRevision ||
        !reconcileConflict
      ) {
        throw error;
      }
      if (!this._isActiveGeneration(generation)) {
        throw new ClientRequestError('cancelled');
      }
      const reconciledRevision = await this._getActiveLeaseRevision(generation);
      this.revision = reconciledRevision;
      return this._putLease(tunnelOrigin, {
        generation,
        reconcileConflict: false
      });
    }
    let payload;
    try {
      payload = await response.json();
    } catch (_) {
      throw new ClientRequestError('protocol');
    }
    const lease = payload?.lease;
    if (
      !lease ||
      lease.active !== true ||
      lease.deviceId !== this.credentials.deviceId ||
      lease.instanceId !== this.instanceId ||
      !Number.isSafeInteger(lease.revision) ||
      lease.revision < 1
    ) {
      throw new ClientRequestError('protocol');
    }
    return lease;
  }

  async _getActiveLeaseRevision(generation) {
    let response;
    try {
      response = await this._fetchWithTimeout(
        `${this.apiOrigin}${MANAGEMENT_PATH}/device/status`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.credentials.credential}`,
            'X-LTTH-Device-ID': this.credentials.deviceId
          },
          cache: 'no-store',
          credentials: 'omit',
          redirect: 'error',
          referrerPolicy: 'no-referrer'
        }
      );
    } catch (_) {
      throw new ClientRequestError('transient');
    }
    if (!this._isActiveGeneration(generation)) {
      throw new ClientRequestError('cancelled');
    }
    this._throwForResponseStatus(response);

    let payload;
    try {
      payload = await response.json();
    } catch (_) {
      throw new ClientRequestError('protocol');
    }
    const lease = payload?.lease;
    if (
      !lease ||
      lease.active !== true ||
      lease.deviceId !== this.credentials.deviceId ||
      lease.instanceId !== this.instanceId ||
      !Number.isSafeInteger(lease.revision) ||
      lease.revision < 1
    ) {
      throw new ClientRequestError('protocol');
    }
    return lease.revision;
  }

  async _fetchLease(method, body) {
    let response;
    try {
      response = await this._fetchWithTimeout(
        `${this.apiOrigin}${MANAGEMENT_PATH}/lease`,
        {
          method,
          headers: {
            Authorization: `Bearer ${this.credentials.credential}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body),
          cache: 'no-store',
          credentials: 'omit',
          redirect: 'error',
          referrerPolicy: 'no-referrer'
        }
      );
    } catch (_) {
      throw new ClientRequestError('transient');
    }

    this._throwForResponseStatus(response, { allowConflict: true });
    return response;
  }

  _throwForResponseStatus(response, { allowConflict = false } = {}) {
    if (response?.ok) {
      return;
    }
    if (response?.status === 401 || response?.status === 403) {
      throw new ClientRequestError('auth');
    }
    if (
      response?.status === 429 ||
      (response?.status >= 500 && response?.status <= 599)
    ) {
      throw new ClientRequestError('transient');
    }
    if (allowConflict && response?.status === 409) {
      throw new ClientRequestError('conflict');
    }
    throw new ClientRequestError('terminal');
  }

  async _fetchWithTimeout(url, options) {
    const controller = this.abortControllerFactory();
    if (
      !controller ||
      typeof controller.abort !== 'function' ||
      !controller.signal ||
      typeof controller.signal.addEventListener !== 'function'
    ) {
      throw new TypeError('AbortController factory returned an invalid value');
    }

    let rejectAbort;
    const aborted = new Promise((_, reject) => {
      rejectAbort = reject;
    });
    const onAbort = () => {
      rejectAbort(new ClientRequestError('transient'));
    };
    controller.signal.addEventListener('abort', onAbort, { once: true });
    if (controller.signal.aborted) {
      onAbort();
    }

    this.inflightRequestControllers.add(controller);
    const timeoutId = this.timers.setTimeout(() => {
      try {
        controller.abort();
      } catch (_) {}
    }, this.requestTimeoutMs);

    try {
      let request;
      try {
        request = Promise.resolve(this.fetch(url, {
          ...options,
          signal: controller.signal
        }));
      } catch (error) {
        request = Promise.reject(error);
      }
      return await Promise.race([
        request,
        aborted
      ]);
    } finally {
      this.timers.clearTimeout(timeoutId);
      this.inflightRequestControllers.delete(controller);
      if (typeof controller.signal.removeEventListener === 'function') {
        controller.signal.removeEventListener('abort', onAbort);
      }
    }
  }

  _abortInflightRequests() {
    for (const controller of this.inflightRequestControllers) {
      try {
        controller.abort();
      } catch (_) {}
    }
  }

  _handleCycleError(error, generation) {
    if (
      !this._isActiveGeneration(generation) ||
      (error instanceof ClientRequestError && error.kind === 'cancelled')
    ) {
      return;
    }
    if (error instanceof ClientRequestError && error.kind === 'auth') {
      this.state = 'auth_error';
      this.logger.warn(
        'Stable overlay routing device authentication was rejected.'
      );
      return;
    }
    if (error instanceof ClientRequestError && error.kind === 'transient') {
      this.state = 'offline';
      const baseDelay = RETRY_BACKOFF_MS[
        Math.min(this.retryIndex, RETRY_BACKOFF_MS.length - 1)
      ];
      this.retryIndex = Math.min(
        this.retryIndex + 1,
        RETRY_BACKOFF_MS.length - 1
      );
      const sample = Number(this.random());
      const bounded = Number.isFinite(sample)
        ? Math.max(0, Math.min(1, sample))
        : 0.5;
      const delay = Math.min(
        RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1],
        Math.round(baseDelay * (0.8 + (bounded * 0.4)))
      );
      this.logger.warn(
        'Stable overlay routing is offline and will retry.'
      );
      this._schedule(delay, generation);
      return;
    }
    this.state = 'error';
    this.logger.error(
      'Stable overlay routing encountered a terminal lifecycle error.'
    );
  }

  _schedule(delay, generation) {
    this._clearTimer();
    this.timerId = this.timers.setTimeout(() => {
      this.timerId = null;
      if (!this._isActiveGeneration(generation)) {
        return this.getStatus();
      }
      return this._beginCycle(generation);
    }, delay);
  }

  _isActiveGeneration(generation) {
    return !this.stopping && generation === this.lifecycleGeneration;
  }

  _clearTimer() {
    if (this.timerId === null) {
      return;
    }
    this.timers.clearTimeout(this.timerId);
    this.timerId = null;
  }

  stop() {
    if (this.stopPromise) {
      return this.stopPromise;
    }
    const pendingStart = this.startPromise;
    this.stopping = true;
    this.lifecycleGeneration += 1;
    this._clearTimer();
    this._abortInflightRequests();
    const stopping = this._stop(pendingStart);
    this.stopPromise = stopping.finally(() => {
      if (this.stopPromise === wrapped) {
        this.stopPromise = null;
      }
    });
    const wrapped = this.stopPromise;
    return wrapped;
  }

  async _stop(pendingStart) {
    if (pendingStart) {
      try {
        await pendingStart;
      } catch (_) {}
    }
    if (this.cyclePromise) {
      try {
        await this.cyclePromise;
      } catch (_) {}
    }
    this._clearTimer();

    if (
      this.enabled &&
      this.credentials &&
      Number.isSafeInteger(this.revision) &&
      this.revision > 0
    ) {
      try {
        await this._fetchLease('DELETE', {
          deviceId: this.credentials.deviceId,
          instanceId: this.instanceId,
          expectedRevision: this.revision
        });
      } catch (_) {
        this.logger.warn(
          'Stable overlay routing could not close its lease during shutdown.'
        );
      }
    }

    this.revision = null;
    this.tunnelOrigin = null;
    this.state = this.enabled ? 'offline' : 'disabled';
    return this.getStatus();
  }
}

module.exports = {
  StableOverlayRoutingClient,
  HEARTBEAT_INTERVAL_MS,
  RETRY_BACKOFF_MS
};
