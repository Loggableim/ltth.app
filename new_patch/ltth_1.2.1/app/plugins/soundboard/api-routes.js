/**
 * Soundboard API Routes
 * 
 * Provides the preview endpoint with authentication, validation, and WebSocket broadcasting.
 * This module does NOT handle audio playback - it only validates and broadcasts preview events.
 */

const path = require('path');

class SoundboardApiRoutes {
    constructor(app, apiLimiter, fetcher, transport, logger, soundsDir) {
        this.app = app;
        this.apiLimiter = apiLimiter;
        this.fetcher = fetcher;
        this.transport = transport;
        this.logger = logger;
        this.soundsDir = soundsDir;
        
        // Get API key from environment
        this.apiKey = process.env.SOUNDBOARD_KEY || null;
        
        if (!this.apiKey) {
            console.warn('[SoundboardAPI] WARNING: SOUNDBOARD_KEY not set in environment. Preview endpoint will be unauthenticated!');
        }
        
        console.log('[SoundboardAPI] API routes initialized');
        this.registerRoutes();
    }

    /**
     * Middleware to check authentication
     */
    authenticate(req, res, next) {
        // If no API key is configured, allow all requests (dev mode)
        if (!this.apiKey) {
            return next();
        }

        const providedKey = req.headers['x-sb-key'];
        
        if (!providedKey) {
            return res.status(401).json({
                success: false,
                error: 'Missing authentication header: x-sb-key'
            });
        }

        if (providedKey !== this.apiKey) {
            this.logger?.warn?.(`Invalid API key attempt: ${providedKey.substring(0, 8)}...`);
            return res.status(403).json({
                success: false,
                error: 'Invalid API key'
            });
        }

        next();
    }

    /**
     * Register all API routes
     */
    registerRoutes() {
        /**
         * POST /api/soundboard/preview
         * 
         * Trigger a preview of a sound. Does NOT send audio data back.
         * Instead, broadcasts a WebSocket message to dashboard clients.
         * 
         * Request body:
         * {
         *   sourceType: "local" | "url",
         *   filename?: string,  // for sourceType "local"
         *   url?: string        // for sourceType "url"
         * }
         * 
         * Response:
         * {
         *   success: true,
         *   message: "Preview broadcast sent",
         *   clientsNotified: number
         * }
         */
        this.app.post(
            '/api/soundboard/preview',
            this.apiLimiter,
            this.authenticate.bind(this),
            async (req, res) => {
                try {
                    const { sourceType, filename, url } = req.body;

                    // Validate sourceType
                    if (!sourceType || (sourceType !== 'local' && sourceType !== 'url')) {
                        return res.status(400).json({
                            success: false,
                            error: 'Invalid or missing sourceType. Must be "local" or "url"'
                        });
                    }

                    let payload;

                    // Validate based on sourceType
                    if (sourceType === 'local') {
                        if (!filename) {
                            return res.status(400).json({
                                success: false,
                                error: 'filename is required for sourceType "local"'
                            });
                        }

                        // Validate path security
                        const validation = this.fetcher.validateLocalPath(filename, this.soundsDir);
                        if (!validation.valid) {
                            this.logger?.warn?.(`Path validation failed: ${filename} - ${validation.error}`);
                            return res.status(400).json({
                                success: false,
                                error: validation.error
                            });
                        }

                        payload = {
                            sourceType: 'local',
                            filename: validation.filename
                        };

                        this.logger?.info?.(`Preview request: local file ${filename}`);
                    } else if (sourceType === 'url') {
                        if (!url) {
                            return res.status(400).json({
                                success: false,
                                error: 'url is required for sourceType "url"'
                            });
                        }

                        // Validate URL against whitelist
                        const validation = this.fetcher.validateExternalUrl(url);
                        if (!validation.valid) {
                            this.logger?.warn?.(`URL validation failed: ${url} - ${validation.error}`);
                            return res.status(400).json({
                                success: false,
                                error: validation.error
                            });
                        }

                        payload = {
                            sourceType: 'url',
                            url: validation.url
                        };

                        this.logger?.info?.(`Preview request: external URL ${url}`);
                    }

                    // Broadcast to dashboard clients via WebSocket
                    this.transport.broadcastPreview(payload);

                    const clientCount = this.transport.getDashboardClientCount();

                    res.json({
                        success: true,
                        message: clientCount > 0 
                            ? 'Preview broadcast sent to dashboard clients'
                            : 'Preview broadcast sent (no dashboard clients connected)',
                        clientsNotified: clientCount,
                        payload: payload
                    });

                } catch (error) {
                    this.logger?.error?.('Preview endpoint error:', error);
                    res.status(500).json({
                        success: false,
                        error: 'Internal server error'
                    });
                }
            }
        );

        /**
         * GET /api/soundboard/preview/status
         * 
         * Get status of the preview system
         */
        this.app.get(
            '/api/soundboard/preview/status',
            this.apiLimiter,
            (req, res) => {
                res.json({
                    success: true,
                    authenticated: !!this.apiKey,
                    dashboardClients: this.transport.getDashboardClientCount(),
                    allowedHosts: this.fetcher.getAllowedHosts(),
                    soundsDirectory: this.soundsDir
                });
            }
        );

        console.log('[SoundboardAPI] Routes registered: POST /api/soundboard/preview, GET /api/soundboard/preview/status');
    }
}

module.exports = SoundboardApiRoutes;
