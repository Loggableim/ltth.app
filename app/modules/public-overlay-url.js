'use strict';

const {
  isRegisteredEntrypoint
} = require('./public-overlay-registry');
const {
  isQuickTunnelHost
} = require('./public-overlay-access');

class PublicOverlayUrlError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PublicOverlayUrlError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new PublicOverlayUrlError(code, message);
}

function parseHttpUrl(value, code) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch (_) {
    fail(code, 'Overlay URL is invalid');
  }
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password
  ) {
    fail(code, 'Overlay URL is invalid');
  }
  return parsed;
}

const SIDEKICK_POSITIONS = new Set([
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right'
]);

function validateOverlayQuery(parsed) {
  const entries = [...parsed.searchParams.entries()];
  if (entries.length === 0) return;

  const allowedKeys = parsed.pathname === '/overlay/viewer-xp/xp-bar'
    ? new Set(['username'])
    : parsed.pathname === '/overlay/sidekick/hud'
      ? new Set(['position', 'minimal', 'events', 'maxEvents'])
      : new Set();
  const seen = new Set();

  for (const [key, value] of entries) {
    if (!allowedKeys.has(key) || seen.has(key)) {
      fail('OVERLAY_URL_QUERY_INVALID', 'Overlay URL query parameters are invalid');
    }
    seen.add(key);

    let valid = false;
    if (parsed.pathname === '/overlay/viewer-xp/xp-bar' && key === 'username') {
      valid = value.length >= 1 && value.length <= 80 && value.trim() === value &&
        !/[\u0000-\u001f\u007f]/.test(value);
    } else if (key === 'position') {
      valid = SIDEKICK_POSITIONS.has(value);
    } else if (key === 'minimal' || key === 'events') {
      valid = value === 'true' || value === 'false';
    } else if (key === 'maxEvents') {
      valid = /^(?:[1-9]|10)$/.test(value);
    }

    if (!valid) {
      fail('OVERLAY_URL_QUERY_INVALID', 'Overlay URL query parameters are invalid');
    }
  }
}

function loopbackAliases(origin) {
  const allowed = new Set([origin.origin]);
  if (!['localhost', '127.0.0.1', '::1'].includes(origin.hostname)) {
    return allowed;
  }

  const port = origin.port ? `:${origin.port}` : '';
  allowed.add(`${origin.protocol}//localhost${port}`);
  allowed.add(`${origin.protocol}//127.0.0.1${port}`);
  allowed.add(`${origin.protocol}//[::1]${port}`);
  return allowed;
}

function validateRequestedOverlayURL({ overlayURL, requestOrigin }) {
  if (typeof overlayURL !== 'string' || !overlayURL.trim()) {
    fail('OVERLAY_URL_REQUIRED', 'Overlay URL is required');
  }

  const origin = parseHttpUrl(requestOrigin, 'OVERLAY_URL_INVALID');
  const parsed = parseHttpUrl(overlayURL.trim(), 'OVERLAY_URL_INVALID');
  if (parsed.hash) {
    fail('OVERLAY_URL_INVALID', 'Overlay URL must not contain a fragment');
  }
  if (!loopbackAliases(origin).has(parsed.origin)) {
    fail(
      'OVERLAY_URL_ORIGIN_NOT_ALLOWED',
      'Overlay URL must use the current LTTH origin'
    );
  }
  if (!isRegisteredEntrypoint(parsed.pathname)) {
    fail(
      'OVERLAY_URL_NOT_REGISTERED',
      'Overlay URL is not registered for public access'
    );
  }
  validateOverlayQuery(parsed);
  return parsed;
}

function buildPublicOverlayURL({ tunnelURL, validatedOverlayURL }) {
  const tunnel = parseHttpUrl(tunnelURL, 'OVERLAY_TUNNEL_URL_INVALID');
  if (!(validatedOverlayURL instanceof URL) ||
      typeof validatedOverlayURL.pathname !== 'string' ||
      !isRegisteredEntrypoint(validatedOverlayURL.pathname)) {
    fail('OVERLAY_URL_NOT_REGISTERED', 'Overlay URL is not registered for public access');
  }
  if (validatedOverlayURL.hash) {
    fail('OVERLAY_URL_INVALID', 'Overlay URL must not contain a fragment');
  }
  validateOverlayQuery(validatedOverlayURL);
  if (
    tunnel.protocol !== 'https:' ||
    !isQuickTunnelHost(tunnel.hostname) ||
    tunnel.pathname !== '/' ||
    tunnel.search ||
    tunnel.hash
  ) {
    fail('OVERLAY_TUNNEL_URL_INVALID', 'Quick Tunnel URL is invalid');
  }

  const publicURL = new URL(
    `${validatedOverlayURL.pathname}${validatedOverlayURL.search}`,
    tunnel.origin
  );
  return publicURL.href;
}

module.exports = {
  PublicOverlayUrlError,
  validateRequestedOverlayURL,
  buildPublicOverlayURL
};
