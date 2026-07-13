'use strict';

const net = require('net');

const ALLOWED_HOST_SUFFIXES = [
  'tiktokcdn.com',
  'tiktokcdn-us.com',
  'tiktokcdn-eu.com',
  'bytegoofy.com',
  'tiktok.com',
  'muscdn.com',
  'tiktokv.com'
];
const BLOCKED_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '::ffff:127.0.0.1']);
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 5000;
const MAX_BYTES = 2 * 1024 * 1024;

function createHttpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function isPrivateIpAddress(hostname) {
  const normalized = String(hostname || '').toLowerCase();
  const version = net.isIP(normalized);
  if (version === 4) {
    const [first, second] = normalized.split('.').map(Number);
    return first === 10
      || first === 127
      || first === 0
      || (first === 169 && second === 254)
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && second === 168);
  }
  if (version === 6) {
    return normalized === '::1'
      || normalized === '::ffff:127.0.0.1'
      || normalized.startsWith('fc')
      || normalized.startsWith('fd')
      || normalized.startsWith('fe80');
  }
  return false;
}

function assertAllowedAvatarUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch (_) {
    throw createHttpError('Invalid avatar URL', 400);
  }

  if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.username || parsed.password) {
    throw createHttpError('Invalid avatar URL', 400);
  }

  const hostname = parsed.hostname.toLowerCase();
  const isAllowedHost = ALLOWED_HOST_SUFFIXES.some(suffix => hostname === suffix || hostname.endsWith(`.${suffix}`));
  if (!hostname || BLOCKED_HOSTS.has(hostname) || isPrivateIpAddress(hostname) || !isAllowedHost) {
    throw createHttpError('Avatar host is not allowed', 403);
  }
  return parsed;
}

async function fetchAllowedAvatar(rawUrl, options = {}) {
  const fetchImpl = options.fetchImpl || global.fetch;
  if (typeof fetchImpl !== 'function') throw createHttpError('Avatar fetch is unavailable', 503);

  let currentUrl = assertAllowedAvatarUrl(rawUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || TIMEOUT_MS);

  try {
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      currentUrl = assertAllowedAvatarUrl(currentUrl.toString());
      const upstream = await fetchImpl(currentUrl.toString(), {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': 'LTTH-WebGPUEmojiRain/3 AvatarProxy' }
      });
      if (upstream.status < 300 || upstream.status >= 400) return upstream;

      const location = upstream.headers.get('location');
      if (!location) throw createHttpError('Avatar redirect is missing a location', 502);
      currentUrl = new URL(location, currentUrl);
    }
    throw createHttpError('Avatar redirect limit exceeded', 502);
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  MAX_BYTES,
  assertAllowedAvatarUrl,
  fetchAllowedAvatar
};
