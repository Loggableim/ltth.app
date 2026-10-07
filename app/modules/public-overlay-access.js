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
    let requestPath;
    try {
      requestPath = new URL(req.originalUrl || req.url, 'http://localhost').pathname;
    } catch (_) {
      requestPath = '';
    }
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
      !isOutgoingSocketEventAllowed(eventName)
    ) {
      logger.warn?.(
        'Blocked one disallowed outgoing public Quick Tunnel Socket.IO event.'
      );
      return false;
    }

    const projection = typeof eventName === 'string'
      ? projectPublicOverlayPayload(eventName, args[0])
      : undefined;
    if (projection === null || (projection !== undefined && args.length !== 1)) {
      logger.warn?.('Withheld one malformed public overlay Socket.IO payload.');
      return false;
    }
    if (projection !== undefined) {
      return originalEmit(eventName, projection);
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
