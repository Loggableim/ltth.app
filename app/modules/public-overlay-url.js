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
  return parsed;
}

function buildPublicOverlayURL({ tunnelURL, validatedOverlayURL }) {
  const tunnel = parseHttpUrl(tunnelURL, 'OVERLAY_TUNNEL_URL_INVALID');
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
