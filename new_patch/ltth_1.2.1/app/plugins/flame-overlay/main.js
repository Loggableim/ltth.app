/**
 * TikTok Flame Overlay Plugin
 * 
 * WebGL-based flame border overlay for TikTok livestreams
 * Features configurable colors, intensity, speed, and frame thickness
 * Optimized for OBS Browser Source with transparent background
 */

const path = require('path');

class FlameOverlayPlugin {
    constructor(api) {
        this.api = api;
        this.config = null;
    }

    async init() {
        this.api.log('🔥 [FLAME OVERLAY] Initializing TikTok Flame Overlay Plugin...', 'info');

        // Load configuration
        this.loadConfig();

        // Register routes
        this.registerRoutes();

        this.api.log('✅ [FLAME OVERLAY] Plugin initialized successfully', 'info');
        this.logRoutes();
    }

    /**
     * Load plugin configuration from database or defaults
     */
    loadConfig() {
        const savedConfig = this.api.getConfig('settings');
        
        this.config = savedConfig || {
            // Effect type selection
            effectType: 'flames', // 'flames', 'particles', 'energy', 'lightning'
            
            // Resolution settings
            resolutionPreset: 'tiktok-portrait',
            customWidth: 720,
            customHeight: 1280,
            
            // Frame settings
            frameMode: 'bottom', // 'bottom', 'top', 'sides', 'all'
            frameThickness: 150, // pixels
            
            // Frame positioning (for multiple frames in preview)
            framePositions: [
                { x: 0, y: 0, width: 100, height: 100 } // Default: full screen
            ],
            
            // Flame appearance
            flameColor: '#ff6600', // Main flame color
            backgroundTint: '#000000', // Background tint color
            backgroundTintOpacity: 0.0, // 0.0 = fully transparent
            
            // Flame animation
            flameSpeed: 0.5, // Time multiplier
            flameIntensity: 1.3, // Magnitude/turbulence
            flameBrightness: 0.25, // Overall brightness multiplier
            
            // Visual effects
            enableGlow: true,
            enableAdditiveBlend: true,
            
            // Advanced
            maskOnlyEdges: true, // Only show flames on frame edges
            highDPI: true // Handle high DPI displays
        };
    }

    /**
     * Save plugin configuration to database
     */
    saveConfig() {
        this.api.setConfig('settings', this.config);
    }

    /**
     * Get resolution based on preset or custom values
     */
    getResolution() {
        const presets = {
            'tiktok-portrait': { width: 720, height: 1280 },
            'tiktok-landscape': { width: 1280, height: 720 },
            'hd-portrait': { width: 1080, height: 1920 },
            'hd-landscape': { width: 1920, height: 1080 },
            '2k-portrait': { width: 1440, height: 2560 },
            '2k-landscape': { width: 2560, height: 1440 },
            '4k-portrait': { width: 2160, height: 3840 },
            '4k-landscape': { width: 3840, height: 2160 },
            'custom': { width: this.config.customWidth, height: this.config.customHeight }
        };
        
        return presets[this.config.resolutionPreset] || presets['tiktok-portrait'];
    }

    /**
     * Register all HTTP routes
     */
    registerRoutes() {
        // Serve plugin UI (settings page)
        this.api.registerRoute('get', '/flame-overlay/ui', (req, res) => {
            const uiPath = path.join(__dirname, 'ui', 'settings.html');
            res.sendFile(uiPath);
        });

        // Serve overlay/renderer
        this.api.registerRoute('get', '/flame-overlay/overlay', (req, res) => {
            const overlayPath = path.join(__dirname, 'renderer', 'index.html');
            res.sendFile(overlayPath);
        });

        // Get configuration
        this.api.registerRoute('get', '/api/flame-overlay/config', (req, res) => {
            try {
                res.json({ success: true, config: this.config });
            } catch (error) {
                this.api.log(`❌ [FLAME OVERLAY] Error getting config: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Update configuration
        this.api.registerRoute('post', '/api/flame-overlay/config', (req, res) => {
            try {
                const updates = req.body;
                this.config = { ...this.config, ...updates };
                this.saveConfig();
                
                // Notify overlays about config change
                this.api.emit('flame-overlay:config-update', { config: this.config });
                
                res.json({ success: true, message: 'Configuration updated' });
            } catch (error) {
                this.api.log(`❌ [FLAME OVERLAY] Error updating config: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get status
        this.api.registerRoute('get', '/api/flame-overlay/status', (req, res) => {
            try {
                const resolution = this.getResolution();
                res.json({
                    success: true,
                    config: this.config,
                    resolution: resolution
                });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Serve texture files
        const express = require('express');
        const textureDir = path.join(__dirname, 'textures');
        this.api.getApp().use('/plugins/flame-overlay/textures', express.static(textureDir));
        
        // Serve renderer directory for flame.js
        const rendererDir = path.join(__dirname, 'renderer');
        this.api.getApp().use('/flame-overlay', express.static(rendererDir));
    }

    /**
     * Log registered routes
     */
    logRoutes() {
        this.api.log('📍 [FLAME OVERLAY] Routes registered:', 'info');
        this.api.log('   - GET  /flame-overlay/ui', 'info');
        this.api.log('   - GET  /flame-overlay/overlay', 'info');
        this.api.log('   - GET  /api/flame-overlay/config', 'info');
        this.api.log('   - POST /api/flame-overlay/config', 'info');
        this.api.log('   - GET  /api/flame-overlay/status', 'info');
    }

    /**
     * Cleanup on plugin destroy
     */
    async destroy() {
        this.api.log('🔥 [FLAME OVERLAY] Plugin destroyed', 'info');
    }
}

module.exports = FlameOverlayPlugin;
