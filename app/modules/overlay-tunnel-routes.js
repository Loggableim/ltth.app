'use strict';

const {
  PublicOverlayUrlError,
  validateRequestedOverlayURL,
  buildPublicOverlayURL
} = require('./public-overlay-url');

const RETRYABLE_TUNNEL_CODES = new Set([
  'OVERLAY_TUNNEL_INSTALL_FAILED',
  'OVERLAY_TUNNEL_START_FAILED',
  'OVERLAY_TUNNEL_START_TIMEOUT'
]);

function requestOrigin(req) {
  return `${req.protocol}://${req.get('host')}`;
}

function registerOverlayTunnelRoutes({
  app,
  networkManager,
  getPort,
  apiLimiter,
  logger = console
}) {
  app.post(
    '/api/network/overlay-tunnel/ensure',
    apiLimiter,
    async (req, res) => {
      let validatedOverlayURL;
      try {
        validatedOverlayURL = validateRequestedOverlayURL({
          overlayURL: req.body?.overlayURL,
          requestOrigin: requestOrigin(req)
        });
      } catch (error) {
        if (error instanceof PublicOverlayUrlError) {
          return res.status(400).json({
            success: false,
            code: error.code,
            error: error.message
          });
        }
        logger.error?.('Overlay URL validation failed');
        return res.status(400).json({
          success: false,
          code: 'OVERLAY_URL_INVALID',
          error: 'Overlay URL is invalid'
        });
      }

      try {
        const { tunnelURL, reused } =
          await networkManager.ensureOverlayQuickTunnel(getPort());
        const publicURL = buildPublicOverlayURL({
          tunnelURL,
          validatedOverlayURL
        });
        return res.json({
          success: true,
          tunnelURL,
          publicURL,
          reused
        });
      } catch (error) {
        const code = RETRYABLE_TUNNEL_CODES.has(error?.code)
          ? error.code
          : 'OVERLAY_TUNNEL_START_FAILED';
        logger.warn?.(`Overlay Quick Tunnel ensure failed (${code})`);
        return res.status(503).json({
          success: false,
          code,
          error: 'Quick Tunnel could not be prepared. Retry the copy action.'
        });
      }
    }
  );

  app.post(
    '/api/network/overlay-tunnel/stop',
    apiLimiter,
    async (_req, res) => {
      try {
        await networkManager.stopOverlayQuickTunnel();
        return res.json({ success: true });
      } catch (_) {
        logger.warn?.('Overlay Quick Tunnel stop failed');
        return res.status(500).json({
          success: false,
          code: 'OVERLAY_TUNNEL_STOP_FAILED',
          error: 'Quick Tunnel could not be stopped.'
        });
      }
    }
  );
}

module.exports = {
  registerOverlayTunnelRoutes
};
