const crypto = require('crypto');

const LOOPBACKS = new Set(['127.0.0.1', '::1', 'localhost']);

function normalizeAddress(address) {
  return String(address || '')
    .trim()
    .replace(/^::ffff:/, '')
    .replace(/^\[|\]$/g, '');
}

function isLoopbackAddress(address) {
  const normalized = normalizeAddress(address);
  return LOOPBACKS.has(normalized) || /^127\.\d+\.\d+\.\d+$/.test(normalized);
}

function getRequestAddress(req) {
  return normalizeAddress(
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress ||
    ''
  );
}

function hasForwardingHeaders(req) {
  return Object.keys(req.headers || {}).some(header => {
    const normalized = String(header).toLowerCase();
    return normalized === 'forwarded' || normalized.startsWith('x-forwarded-');
  });
}

function getProvidedToken(req) {
  const headerToken = req.get?.('x-ltth-admin-token') || req.headers?.['x-ltth-admin-token'];
  if (headerToken) {
    return String(headerToken);
  }

  const authorization = req.get?.('authorization') || req.headers?.authorization || '';
  const match = String(authorization).match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : '';
}

function tokensEqual(provided, expected) {
  const providedBuffer = Buffer.from(String(provided || ''), 'utf8');
  const expectedBuffer = Buffer.from(String(expected || ''), 'utf8');

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

function verifyAdminCredential({
  remoteAddress,
  headers = {},
  providedToken = '',
  token = process.env.LTTH_ADMIN_TOKEN ?? process.env.ADMIN_TOKEN ?? '',
  allowLoopbackWithoutToken = true
} = {}) {
  const directLoopback = isLoopbackAddress(remoteAddress) && !hasForwardingHeaders({ headers });
  if (allowLoopbackWithoutToken && directLoopback) {
    return { authorized: true, reason: 'loopback' };
  }

  if (!token) return { authorized: false, reason: 'token-not-configured' };
  if (!providedToken) return { authorized: false, reason: 'token-missing' };
  if (!tokensEqual(providedToken, token)) return { authorized: false, reason: 'token-invalid' };
  return { authorized: true, reason: 'token' };
}

function createAdminAuth(options = {}) {
  const token = options.token ?? process.env.LTTH_ADMIN_TOKEN ?? process.env.ADMIN_TOKEN ?? '';
  const allowLoopbackWithoutToken = options.allowLoopbackWithoutToken !== false;

  return function adminAuth(req, res, next) {
    const remoteAddress = getRequestAddress(req);
    const result = verifyAdminCredential({
      remoteAddress,
      headers: req.headers,
      providedToken: getProvidedToken(req),
      token,
      allowLoopbackWithoutToken
    });

    if (result.authorized) return next();
    if (result.reason === 'token-not-configured') {
      return res.status(403).json({
        success: false,
        error: 'Admin authentication required for non-local mutation requests'
      });
    }

    if (result.reason === 'token-missing') {
      return res.status(401).json({
        success: false,
        error: 'Missing admin authentication token'
      });
    }

    return res.status(403).json({
      success: false,
      error: 'Invalid admin authentication token'
    });
  };
}

module.exports = {
  createAdminAuth,
  verifyAdminCredential,
  isLoopbackAddress,
  getRequestAddress,
  hasForwardingHeaders
};
