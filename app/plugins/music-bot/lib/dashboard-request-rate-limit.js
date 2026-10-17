'use strict';

const { isIP } = require('node:net');
const { performance } = require('node:perf_hooks');
const { ipKeyGenerator } = require('express-rate-limit');

const WINDOW_MS = 60 * 1000;
const MAX_KEYS_PER_ROUTE = 10_000;
const LOOPBACK_KEY = 'loopback-peer';
const LIMITS = Object.freeze({
  resolve: 30,
  request: 10
});

function createIpRateLimiter({ limit, windowMs = WINDOW_MS, maxKeys = MAX_KEYS_PER_ROUTE, now = () => performance.now() } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new TypeError('limit must be a positive safe integer');
  }
  if (!Number.isSafeInteger(windowMs) || windowMs < 1) {
    throw new TypeError('windowMs must be a positive safe integer');
  }
  if (!Number.isSafeInteger(maxKeys) || maxKeys < 1) {
    throw new TypeError('maxKeys must be a positive safe integer');
  }
  if (typeof now !== 'function') {
    throw new TypeError('now must be a function');
  }

  const buckets = new Map();

  function getPeerKey(ip) {
    if (isIP(ip) === 4 && ip.startsWith('127.')) return LOOPBACK_KEY;

    const key = ipKeyGenerator(ip);
    if (isIP(key) === 4 && key.startsWith('127.')) return LOOPBACK_KEY;
    if (isIP(ip) === 6 && new URL(`http://[${ip}]/`).hostname === '[::1]') return LOOPBACK_KEY;
    return key;
  }

  function removeExpired(nowMs) {
    // Buckets are inserted in monotonic-time order and their expiry never moves.
    // Expired entries therefore form a prefix and can be removed without scanning
    // the active set on every request.
    for (const [key, bucket] of buckets) {
      if (bucket.expiresAt > nowMs) break;
      buckets.delete(key);
    }
  }

  return function ipRateLimit(req, res, next) {
    const ip = req?.socket?.remoteAddress;
    if (typeof ip !== 'string' || isIP(ip) === 0) {
      return res.status(503).json({
        success: false,
        code: 'MUSIC_BOT_RATE_LIMIT_IP_UNAVAILABLE',
        error: 'Request could not be rate limited safely.'
      });
    }

    let key;
    try {
      // Use the direct socket peer so a globally trusted X-Forwarded-For value
      // cannot let a direct client rotate its identity. Clients behind the same
      // proxy intentionally share its peer key. Normalize IPv6 and coalesce all
      // IPv4/IPv6 loopback spellings to one local peer bucket.
      key = getPeerKey(ip);
    } catch (_error) {
      return res.status(503).json({
        success: false,
        code: 'MUSIC_BOT_RATE_LIMIT_IP_UNAVAILABLE',
        error: 'Request could not be rate limited safely.'
      });
    }

    const nowMs = now();
    removeExpired(nowMs);

    let bucket = buckets.get(key);
    if (!bucket) {
      if (buckets.size >= maxKeys) {
        // Do not evict active clients to admit new identities. This keeps memory
        // bounded and prevents address churn from resetting another client's cap.
        return res.status(429).json({
          success: false,
          code: 'MUSIC_BOT_RATE_LIMIT_CAPACITY',
          error: 'Too many requests. Please try again later.'
        });
      }
      bucket = { hits: 0, expiresAt: nowMs + windowMs };
      buckets.set(key, bucket);
    }

    bucket.hits += 1;
    const remaining = Math.max(0, limit - bucket.hits);
    res.setHeader?.('RateLimit-Policy', `${limit};w=${Math.ceil(windowMs / 1000)}`);
    res.setHeader?.('RateLimit', `limit=${limit}, remaining=${remaining}, reset=${Math.max(0, Math.ceil((bucket.expiresAt - nowMs) / 1000))}`);

    if (bucket.hits > limit) {
      res.setHeader?.('Retry-After', String(Math.max(1, Math.ceil((bucket.expiresAt - nowMs) / 1000))));
      return res.status(429).json({
        success: false,
        code: 'MUSIC_BOT_RATE_LIMITED',
        error: 'Too many requests. Please try again after a minute.'
      });
    }

    return next();
  };
}

function createDashboardRequestLimiters(options = {}) {
  const sharedOptions = {
    maxKeys: options.maxKeys,
    now: options.now,
    windowMs: WINDOW_MS
  };
  return Object.freeze({
    resolve: createIpRateLimiter({ ...sharedOptions, limit: LIMITS.resolve }),
    request: createIpRateLimiter({ ...sharedOptions, limit: LIMITS.request })
  });
}

module.exports = {
  LIMITS,
  MAX_KEYS_PER_ROUTE,
  WINDOW_MS,
  createDashboardRequestLimiters,
  createIpRateLimiter
};
