'use strict';

const { verifyAdminCredential } = require('./admin-auth');

function getSocketAddress(socket) {
  return socket?.handshake?.address ||
    socket?.conn?.remoteAddress ||
    socket?.request?.socket?.remoteAddress ||
    '';
}

function getSocketHeaders(socket) {
  return socket?.handshake?.headers || {};
}

function getSocketAdminToken(socket) {
  const auth = socket?.handshake?.auth || {};
  if (typeof auth.adminToken === 'string' && auth.adminToken) return auth.adminToken;
  if (typeof auth.token === 'string' && auth.token) return auth.token;

  const headers = getSocketHeaders(socket);
  const headerToken = headers['x-ltth-admin-token'];
  if (typeof headerToken === 'string' && headerToken) return headerToken;

  const authorization = headers.authorization;
  const bearer = typeof authorization === 'string'
    ? authorization.match(/^Bearer\s+(.+)$/i)
    : null;
  return bearer ? bearer[1] : '';
}

function createAdminSocketAuthorization({ token, logger = console } = {}) {
  const expectedToken = token ?? process.env.LTTH_ADMIN_TOKEN ?? process.env.ADMIN_TOKEN ?? '';

  return (socket, next) => {
    // Quick Tunnel sockets have their own stricter event and payload contract,
    // installed earlier by attachPublicSocketPolicy(). Leave that path intact.
    if (socket?.data?.publicQuickTunnel === true) {
      socket.data.ltthSocketAccess = 'public-overlay';
      return next();
    }

    const authorization = verifyAdminCredential({
      remoteAddress: getSocketAddress(socket),
      headers: getSocketHeaders(socket),
      providedToken: getSocketAdminToken(socket),
      token: expectedToken,
      allowLoopbackWithoutToken: true
    });

    if (authorization.reason === 'loopback') {
      socket.data = socket.data || {};
      socket.data.ltthSocketAccess = 'loopback-admin';
      return next();
    }

    if (authorization.reason === 'token') {
      socket.data = socket.data || {};
      socket.data.ltthSocketAccess = 'admin';
      return next();
    }

    const error = new Error('Admin authentication required for this Socket.IO namespace');
    error.data = { code: 'SOCKET_ADMIN_AUTH_REQUIRED' };
    logger.warn?.('Rejected unauthenticated remote Socket.IO connection');
    return next(error);
  };
}

module.exports = {
  createAdminSocketAuthorization,
  getSocketAddress,
  getSocketAdminToken
};
