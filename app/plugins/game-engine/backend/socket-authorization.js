const crypto = require('crypto');
const { isLoopbackAddress } = require('../../../modules/admin-auth');

class SocketAuthorization {
  constructor(logger) {
    this.logger = logger;
  }

  getSocketAddress(socket) {
    return socket?.handshake?.address || socket?.conn?.remoteAddress || socket?.request?.socket?.remoteAddress || '';
  }

  hasValidAdminToken(socket) {
    const expected = process.env.LTTH_ADMIN_TOKEN || process.env.ADMIN_TOKEN || '';
    if (!expected) return false;
    const auth = socket?.handshake?.auth || {};
    const headers = socket?.handshake?.headers || {};
    const bearerMatch = String(headers.authorization || '').match(/^Bearer\s+(.+)$/i);
    const provided = String(auth.adminToken || auth.token || headers['x-ltth-admin-token'] || (bearerMatch ? bearerMatch[1] : ''));
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const providedBuffer = Buffer.from(provided, 'utf8');
    return expectedBuffer.length === providedBuffer.length && crypto.timingSafeEqual(expectedBuffer, providedBuffer);
  }

  isAdmin(socket) {
    if (!socket?.handshake) return true;
    return socket.handshake.auth?.role === 'admin' &&
      (isLoopbackAddress(this.getSocketAddress(socket)) || this.hasValidAdminToken(socket));
  }

  isOverlay(socket) {
    if (!socket?.handshake) return true;
    if (socket.handshake.auth?.role !== 'overlay') return false;
    try {
      return new URL(String(socket.handshake.headers?.referer || '')).pathname.startsWith('/overlay/game-engine/');
    } catch (_) {
      return false;
    }
  }

  requireRole(socket, eventName, allowedRoles) {
    const allowed = new Set(Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles]);
    const authorized = (allowed.has('admin') && this.isAdmin(socket)) ||
      (allowed.has('overlay') && this.isOverlay(socket));
    if (!authorized) {
      this.logger.warn(`[GAME ENGINE] Rejected unauthorized socket event: ${eventName}`);
      socket.emit('game-engine:authorization-error', { event: eventName, error: 'Unauthorized socket action' });
    }
    return authorized;
  }
}

module.exports = SocketAuthorization;
