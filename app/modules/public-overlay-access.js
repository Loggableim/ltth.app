'use strict';

const {
  isHttpAllowed,
  isIncomingSocketEventAllowed,
  isOutgoingSocketEventAllowed,
  redactPublicPayload
} = require('./public-overlay-registry');
const {
  PUBLIC_QUICK_TUNNEL_ROOM
} = require('./public-overlay-socket-adapter');

const QUICK_TUNNEL_HOST_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.trycloudflare\.com$/;
const METHOD_OVERRIDE_HEADERS = [
  'x-http-method-override',
  'x-method-override',
  'x-original-method'
];

function normalizeHostname(hostHeader) {
  if (typeof hostHeader !== 'string') return '';
  const value = hostHeader.trim();
  if (!value || /[\s/@\\]/.test(value)) return '';

  try {
    return new URL(`http://${value}`).hostname
      .replace(/^\[|\]$/g, '')
      .toLowerCase();
  } catch (_) {
    return '';
  }
}

function isQuickTunnelHost(hostname) {
  if (typeof hostname !== 'string') return false;
  return QUICK_TUNNEL_HOST_PATTERN.test(hostname.toLowerCase());
}

function isQuickTunnelRequest(req) {
  return isQuickTunnelHost(normalizeHostname(req?.headers?.host));
}

function sendNeutralNotFound(res) {
  return res.status(404).json({ error: 'Not found' });
}

function createPublicOverlayMiddleware({ logger = console } = {}) {
  return (req, res, next) => {
    if (!isQuickTunnelRequest(req)) {
      return next();
    }

    if (METHOD_OVERRIDE_HEADERS.some(header => req.headers[header] !== undefined)) {
      return sendNeutralNotFound(res);
    }

    if (!isHttpAllowed({
      method: req.method,
      pathname: req.originalUrl || req.url
    })) {
      return sendNeutralNotFound(res);
    }

    const originalJson = res.json.bind(res);
    res.json = payload => {
      try {
        return originalJson(redactPublicPayload(payload));
      } catch (error) {
        logger.warn?.(`Public overlay response rejected: ${error.message}`);
        res.status(500);
        return originalJson({ error: 'Response unavailable' });
      }
    };
    return next();
  };
}

function protectPublicSocket({ socket, logger = console }) {
  const hostname = normalizeHostname(socket?.handshake?.headers?.host);
  const isPublic = isQuickTunnelHost(hostname);
  socket.data = socket.data || {};
  socket.data.publicQuickTunnel = isPublic;

  if (!isPublic) {
    return socket;
  }

  socket.join(PUBLIC_QUICK_TUNNEL_ROOM);
  socket.use(([eventName], next) => {
    if (isIncomingSocketEventAllowed(eventName)) {
      next();
      return;
    }

    logger.warn?.(
      `Blocked public Quick Tunnel Socket.IO event "${String(eventName)}" from ${hostname}`
    );
    const error = new Error('Socket.IO event is not available on the public overlay surface');
    error.data = { code: 'PUBLIC_SOCKET_EVENT_NOT_ALLOWED' };
    next(error);
  });

  const originalEmit = socket.emit.bind(socket);
  socket.emit = (eventName, ...args) => {
    if (
      typeof eventName === 'string' &&
      !isOutgoingSocketEventAllowed(eventName)
    ) {
      logger.warn?.(
        `Blocked direct public Quick Tunnel Socket.IO event "${eventName}" to ${hostname}`
      );
      return false;
    }
    return originalEmit(eventName, ...args);
  };
  return socket;
}

function attachPublicSocketPolicy({ io, logger = console }) {
  io.use((socket, next) => {
    try {
      protectPublicSocket({ socket, logger });
      next();
    } catch (error) {
      next(error);
    }
  });
}

module.exports = {
  normalizeHostname,
  isQuickTunnelHost,
  isQuickTunnelRequest,
  createPublicOverlayMiddleware,
  protectPublicSocket,
  attachPublicSocketPolicy
};
