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
    req.ip ||
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress ||
    ''
  );
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

function createAdminAuth(options = {}) {
  const token = options.token ?? process.env.LTTH_ADMIN_TOKEN ?? process.env.ADMIN_TOKEN ?? '';
  const allowLoopbackWithoutToken = options.allowLoopbackWithoutToken !== false;

  return function adminAuth(req, res, next) {
    const remoteAddress = getRequestAddress(req);
    const isLoopback = isLoopbackAddress(remoteAddress);

    if (allowLoopbackWithoutToken && isLoopback) {
      return next();
    }

    if (!token) {
      return res.status(403).json({
        success: false,
        error: 'Admin authentication required for non-local mutation requests'
      });
    }

    const providedToken = getProvidedToken(req);
    if (!providedToken) {
      return res.status(401).json({
        success: false,
        error: 'Missing admin authentication token'
      });
    }

    if (!tokensEqual(providedToken, token)) {
      return res.status(403).json({
        success: false,
        error: 'Invalid admin authentication token'
      });
    }

    return next();
  };
}

module.exports = {
  createAdminAuth,
  isLoopbackAddress,
  getRequestAddress
};
