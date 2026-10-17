'use strict';

const {
  isHttpAllowed,
  isIncomingSocketEventAllowed,
  isOutgoingSocketEventAllowed,
  redactPublicPayload
} = require('./public-overlay-registry');
const {
  projectPublicOverlayPayload,
  projectWeatherConfigResponse,
  projectWeatherGamificationResponse,
  projectVisualFxFrameWebGPUConfigResponse,
  projectInteractiveStoryConfigResponse,
  projectFlameOverlayConfigResponse,
  projectClaritySettingsResponse,
  projectClarityStateResponse,
  projectCoinBattleLeaderboardResponse,
  projectQuizShowStateResponse,
  projectQuizShowBrandKitResponse,
  projectQuizShowHudConfigResponse,
  projectQuizShowLayoutResponse,
  projectQuizShowLeaderboardResponse,
  projectEmojiRainUserMappingsResponse,
  projectAnimazingPalStreamAssistantStatusResponse,
  projectGCCERotatorResponse,
  projectArenaPublicState,
  projectGameEngineConfigResponse
} = require('./public-overlay-payload-projection');
const { createPublicReleaseEventGuard } = require('./public-overlay-release-event-policy');
const {
  PUBLIC_QUICK_TUNNEL_ROOM
} = require('./public-overlay-socket-adapter');
const { isPublicClarityEventAllowed } = require('./public-overlay-event-policy');

const QUICK_TUNNEL_HOST_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.trycloudflare\.com$/;
const APPROVED_QUICK_TUNNEL_PATHS = new Set([
  '/overlay/viewer-xp/leaderboard',
  '/overlay/viewer-xp/xp-bar',
  '/overlay/viewer-xp/level-up',
  '/overlay/sidekick/hud',
  '/api/sidekick/public-events',
  '/api/i18n/locales',
  '/js/i18n-client.js',
  '/socket.io/socket.io.js',
  '/plugins/viewer-leaderboard/viewer-xp-i18n.js'
]);
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

function isApprovedQuickTunnelRequest({ method, pathname }) {
  const normalizedMethod = String(method || '').toUpperCase();
  if (!['GET', 'HEAD'].includes(normalizedMethod) || typeof pathname !== 'string') return false;
  if (APPROVED_QUICK_TUNNEL_PATHS.has(pathname)) return true;
  return /^\/api\/i18n\/translations\/(?:de|en|es|fr)$/.test(pathname) ||
    /^\/plugins\/viewer-leaderboard\/locales\/(?:de|en|es|fr)\.json$/.test(pathname);
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

    let requestPath;
    try {
      requestPath = new URL(req.originalUrl || req.url, 'http://localhost').pathname;
    } catch (_) {
      requestPath = '';
    }
    if (!isApprovedQuickTunnelRequest({ method: req.method, pathname: requestPath })) {
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
        let publicPayload = payload;
        if (requestPath === '/api/weather/config' && Object.prototype.hasOwnProperty.call(payload || {}, 'config')) {
          publicPayload = projectWeatherConfigResponse(payload);
          if (publicPayload === null) throw new Error('Weather config projection rejected the payload');
        } else if (requestPath === '/api/weather/gamification' && Object.prototype.hasOwnProperty.call(payload || {}, 'gamification')) {
          publicPayload = projectWeatherGamificationResponse(payload);
          if (publicPayload === null) throw new Error('Weather gamification projection rejected the payload');
        } else if (requestPath === '/api/visual-fx-frame-webgpu/config') {
          publicPayload = projectVisualFxFrameWebGPUConfigResponse(payload);
          if (publicPayload === null) throw new Error('Visual FX Frame WebGPU config projection rejected the payload');
        } else if (requestPath === '/api/interactive-story/config') {
          publicPayload = projectInteractiveStoryConfigResponse(payload);
          if (publicPayload === null) throw new Error('Interactive Story config projection rejected the payload');
        } else if (requestPath === '/api/flame-overlay/config') {
          publicPayload = projectFlameOverlayConfigResponse(payload);
          if (publicPayload === null) throw new Error('Flame Overlay config projection rejected the payload');
        } else if (/^\/api\/clarityhud\/settings\/(chat|full|multi|stream)$/.test(requestPath)) {
          const dock = requestPath.split('/').pop();
          publicPayload = projectClaritySettingsResponse(dock, payload);
          if (publicPayload === null) throw new Error('ClarityHUD settings projection rejected the payload');
        } else if (/^\/api\/clarityhud\/state\/(chat|full)$/.test(requestPath)) {
          const dock = requestPath.split('/').pop();
          publicPayload = projectClarityStateResponse(dock, payload);
          if (publicPayload === null) throw new Error('ClarityHUD state projection rejected the payload');
        } else if (/^\/api\/plugins\/coinbattle\/leaderboard\/(lifetime|season|weekly)$/.test(requestPath)) {
          publicPayload = projectCoinBattleLeaderboardResponse(payload);
          if (publicPayload === null) throw new Error('CoinBattle leaderboard projection rejected the payload');
        } else if (requestPath === '/api/quiz-show/state') {
          publicPayload = projectQuizShowStateResponse(payload);
          if (publicPayload === null) throw new Error('Quiz Show state projection rejected the payload');
        } else if (requestPath === '/api/quiz-show/brand-kit') {
          publicPayload = projectQuizShowBrandKitResponse(payload);
          if (publicPayload === null) throw new Error('Quiz Show brand kit projection rejected the payload');
        } else if (requestPath === '/api/quiz-show/hud-config') {
          publicPayload = projectQuizShowHudConfigResponse(payload);
          if (publicPayload === null) throw new Error('Quiz Show HUD config projection rejected the payload');
        } else if (/^\/api\/quiz-show\/layouts\/[1-9][0-9]*$/.test(requestPath)) {
          publicPayload = projectQuizShowLayoutResponse(payload);
          if (publicPayload === null) throw new Error('Quiz Show layout projection rejected the payload');
        } else if (requestPath === '/api/quiz-show/leaderboard') {
          publicPayload = projectQuizShowLeaderboardResponse(payload);
          if (publicPayload === null) throw new Error('Quiz Show round leaderboard projection rejected the payload');
        } else if (requestPath === '/api/animazingpal/live-host/stream-assistant/status') {
          publicPayload = projectAnimazingPalStreamAssistantStatusResponse(payload);
          if (publicPayload === null) throw new Error('AnimazingPal Stream Assistant status projection rejected the payload');
        } else if (requestPath === '/api/emoji-rain/user-mappings') {
          publicPayload = projectEmojiRainUserMappingsResponse(payload);
          if (publicPayload === null) throw new Error('EmojiRain mapping projection rejected the payload');
        } else if (requestPath === '/api/gcce/hud/rotator') {
          publicPayload = projectGCCERotatorResponse(payload);
          if (publicPayload === null) throw new Error('GCCE rotator projection rejected the payload');
        } else if (requestPath === '/api/game-engine/arena/state') {
          publicPayload = projectArenaPublicState(payload);
          if (publicPayload === null) throw new Error('Arena state projection rejected the payload');
        } else {
          const gameConfigMatch = requestPath.match(/^\/api\/game-engine\/config\/(chess|connect4)$/);
          if (gameConfigMatch) {
            publicPayload = projectGameEngineConfigResponse(gameConfigMatch[1], payload);
            if (publicPayload === null) throw new Error('Game Engine config projection rejected the payload');
          }
        }
        if (publicPayload === null) throw new Error('Public response projection rejected the payload');
        return originalJson(redactPublicPayload(publicPayload));
      } catch (error) {
        logger.warn?.(`Public overlay response rejected: ${error.message}`);
        res.status(500);
        return originalJson({ error: 'Response unavailable' });
      }
    };
    return next();
  };
}

function isApprovedPublicIncomingPacket(packet) {
  if (!Array.isArray(packet) || packet.length !== 2) return false;
  const [eventName, payload] = packet;
  if (eventName === 'viewer-xp:public-profile:request') {
    return typeof payload === 'string' && payload.length >= 1 && payload.length <= 80;
  }
  if (eventName !== 'viewer-xp:public-leaderboard:request' ||
      !payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const keys = Object.keys(payload);
  if (keys.some(key => !['limit', 'days'].includes(key))) return false;
  const isBoundedInteger = (value, minimum, maximum) => {
    const parsed = typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
    return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum;
  };
  return (payload.limit === undefined || isBoundedInteger(payload.limit, 1, 50)) &&
    (payload.days === undefined || payload.days === null || isBoundedInteger(payload.days, 1, 365));
}

function protectPublicSocket({ socket, logger = console, pluginReleasePolicy }) {
  const hostname = normalizeHostname(socket?.handshake?.headers?.host);
  const isPublic = isQuickTunnelHost(hostname);
  socket.data = socket.data || {};
  socket.data.publicQuickTunnel = isPublic;

  if (!isPublic) {
    return socket;
  }

  socket.join(PUBLIC_QUICK_TUNNEL_ROOM);
  const releaseEventGuard = createPublicReleaseEventGuard(pluginReleasePolicy);
  socket.use((packet, next) => {
    const eventName = packet?.[0];
    if (isIncomingSocketEventAllowed(eventName) &&
        releaseEventGuard('incoming', eventName) &&
        isApprovedPublicIncomingPacket(packet)) {
      next();
      return;
    }

    logger.warn?.(
      'Blocked one disallowed incoming public Quick Tunnel Socket.IO event.'
    );
    const error = new Error('Socket.IO event is not available on the public overlay surface');
    error.data = { code: 'PUBLIC_SOCKET_EVENT_NOT_ALLOWED' };
    next(error);
  });

  const originalEmit = socket.emit.bind(socket);
  socket.emit = (eventName, ...args) => {
    if (
      typeof eventName === 'string' &&
      (!isOutgoingSocketEventAllowed(eventName) || !isPublicClarityEventAllowed(eventName) || !releaseEventGuard('outgoing', eventName))
    ) {
      logger.warn?.(
        'Blocked one disallowed outgoing public Quick Tunnel Socket.IO event.'
      );
      return false;
    }

    const projection = typeof eventName === 'string'
      ? projectPublicOverlayPayload(eventName, args[0])
      : undefined;
    if (projection === undefined || projection === null || args.length !== 1) {
      logger.warn?.('Withheld one unowned, unprojected, or malformed public overlay Socket.IO payload.');
      return false;
    }
    return originalEmit(eventName, projection);
  };
  return socket;
}

function attachPublicSocketPolicy({ io, logger = console, pluginReleasePolicy }) {
  io.use((socket, next) => {
    try {
      protectPublicSocket({ socket, logger, pluginReleasePolicy });
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
  isApprovedQuickTunnelRequest,
  isApprovedPublicIncomingPacket,
  protectPublicSocket,
  attachPublicSocketPolicy
};
