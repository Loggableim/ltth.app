'use strict';

const { URL } = require('url');
const {
  isRegisteredEntrypoint
} = require('./public-overlay-registry');

const STABLE_OVERLAY_ORIGIN = 'https://overlay.ltth.app';
const USERNAME_PATTERN = /^[a-z0-9_.]+$/;

class StableOverlayUrlError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'StableOverlayUrlError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new StableOverlayUrlError(code, message);
}

function normalizeStableOverlayUsername(value) {
  if (typeof value !== 'string') {
    fail('STABLE_OVERLAY_USERNAME_INVALID', 'TikTok username is invalid');
  }
  let normalized = value.trim();
  if (normalized.startsWith('@')) {
    normalized = normalized.slice(1);
  }
  normalized = normalized.normalize('NFKC').toLowerCase();
  if (
    normalized.length < 2 ||
    normalized.length > 24 ||
    !USERNAME_PATTERN.test(normalized) ||
    normalized.split('.').some(segment => segment.length === 0)
  ) {
    fail('STABLE_OVERLAY_USERNAME_INVALID', 'TikTok username is invalid');
  }
  return normalized;
}

function isLocalHostname(hostname) {
  const normalized = String(hostname || '').toLowerCase();
  if (
    normalized === 'localhost' ||
    normalized === '::1' ||
    normalized === '[::1]' ||
    /^127\.\d+\.\d+\.\d+$/.test(normalized) ||
    /^10\.\d+\.\d+\.\d+$/.test(normalized) ||
    /^192\.168\.\d+\.\d+$/.test(normalized)
  ) {
    return true;
  }
  const match = normalized.match(/^172\.(\d+)\.\d+\.\d+$/);
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}

function localOriginAliases(origin) {
  const allowed = new Set([origin.origin]);
  if (
    !['localhost', '127.0.0.1', '::1', '[::1]'].includes(origin.hostname)
  ) {
    return allowed;
  }
  const port = origin.port ? `:${origin.port}` : '';
  allowed.add(`${origin.protocol}//localhost${port}`);
  allowed.add(`${origin.protocol}//127.0.0.1${port}`);
  allowed.add(`${origin.protocol}//[::1]${port}`);
  return allowed;
}

function parseUrl(rawUrl, locationHref) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    fail('STABLE_OVERLAY_URL_INVALID', 'Overlay URL is invalid');
  }
  const trimmed = rawUrl.trim();
  if (!/^(?:[A-Za-z][A-Za-z0-9+.-]*:|\/)/.test(trimmed)) {
    fail('STABLE_OVERLAY_URL_INVALID', 'Overlay URL is invalid');
  }

  let parsed;
  let current;
  try {
    current = new URL(locationHref || 'http://127.0.0.1/');
    parsed = new URL(trimmed, current);
  } catch (_) {
    fail('STABLE_OVERLAY_URL_INVALID', 'Overlay URL is invalid');
  }
  if (parsed.username || parsed.password) {
    fail('STABLE_OVERLAY_URL_INVALID', 'Overlay URL is invalid');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    fail('STABLE_OVERLAY_URL_INVALID', 'Overlay URL is invalid');
  }
  if (
    !isLocalHostname(current.hostname) ||
    !localOriginAliases(current).has(parsed.origin)
  ) {
    fail('STABLE_OVERLAY_AUTHORITY_INVALID', 'Overlay URL is not local');
  }
  return parsed;
}

function buildStableOverlayUrl(rawUrl, username, options = {}) {
  const canonicalUsername = normalizeStableOverlayUsername(username);
  const parsed = parseUrl(rawUrl, options.locationHref);
  if (!isRegisteredEntrypoint(parsed.pathname)) {
    fail(
      'STABLE_OVERLAY_ENTRYPOINT_UNREGISTERED',
      'Overlay entrypoint is not registered'
    );
  }
  return (
    `${STABLE_OVERLAY_ORIGIN}/${encodeURIComponent(canonicalUsername)}` +
    `${parsed.pathname}${parsed.search}${parsed.hash}`
  );
}

function activeClaimUsernames(claims) {
  if (!Array.isArray(claims)) {
    return new Set();
  }
  const active = new Set();
  for (const claim of claims) {
    if (!claim || claim.state !== 'active') continue;
    try {
      active.add(normalizeStableOverlayUsername(claim.username));
    } catch (_) {
      // Ignore malformed account data rather than selecting it.
    }
  }
  return active;
}

function selectStableOverlayUsername({
  connectedUsername,
  defaultUsername,
  claims
} = {}) {
  const active = activeClaimUsernames(claims);
  for (const candidate of [connectedUsername, defaultUsername]) {
    try {
      const normalized = normalizeStableOverlayUsername(candidate);
      if (active.has(normalized)) {
        return normalized;
      }
    } catch (_) {
      // Try the next explicit candidate.
    }
  }
  return null;
}

module.exports = {
  STABLE_OVERLAY_ORIGIN,
  StableOverlayUrlError,
  buildStableOverlayUrl,
  isLocalHostname,
  normalizeStableOverlayUsername,
  selectStableOverlayUsername
};
