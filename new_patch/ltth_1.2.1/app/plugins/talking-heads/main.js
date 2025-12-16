/**
 * Talking Heads Plugin
 * 
 * AI-generated animated avatars for TikTok users with TTS-synchronized mouth animation.
 * 
 * Features:
 * - Generate AI avatars based on TikTok username/profile
 * - Two versions: mouth closed (idle) and mouth open (speaking)
 * - Sync with TTS playback events for mouth animation
 * - Cache generated avatars to avoid redundant API calls
 * - OBS overlay support for displaying talking heads
 * 
 * Image Generation:
 * - Uses SiliconFlow FLUX.1 API for image generation
 * - Generates base avatar, then uses Flux1 Context model to create open-mouth variant
 * - Supports multiple avatar styles (furry, tech, medieval, etc.)
 */

const path = require('path');
const fs = require('fs');
const axios = require('axios');

class TalkingHeadsPlugin {
    constructor(api) {
        this.api = api;
        this.pluginId = 'talking-heads';
        this.logger = api.logger;
        
        // Cache directory for generated avatars
        this.cacheDir = path.join(__dirname, 'cache');
        
        // Ensure cache directory exists
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
        
        // Active animations (currently speaking users)
        this.activeAnimations = new Map(); // uniqueId -> { userId, username, profilePictureUrl, ttsStartTime, avatarData }
        
        // Avatar cache (in-memory + filesystem)
        this.avatarCache = new Map(); // uniqueId -> { closedMouth, openMouth, style, generatedAt }
        
        // Default configuration
        this.defaultConfig = {
            enabled: true,
            debugLogging: false,
            // Image provider: 'auto', 'openai', 'siliconflow'
            imageProvider: 'auto',
            // Avatar style
            style: 'cartoon',
            // Permission settings
            permissionMode: 'all', // 'all', 'team', 'subscriber', 'custom_voice', 'moderator', 'top_gifter'
            minTeamLevel: 0,
            // Animation settings
            fadeInDuration: 300,
            fadeOutDuration: 300,
            blinkInterval: 3000,
            // OBS integration
            obsEnabled: true,
            // Cache settings
            cacheEnabled: true,
            cacheDurationDays: 7
        };
        
        // Load configuration
        this.config = this._loadConfig();
        
        // Avatar style prompts
        this.stylePrompts = {
            furry: 'cute furry anthropomorphic character portrait, soft fur texture, expressive eyes, vibrant colors, digital art style',
            tech: 'cyberpunk futuristic avatar portrait, neon glow, metallic accents, holographic elements, sci-fi digital art',
            medieval: 'fantasy medieval portrait, knight armor, ornate details, dramatic lighting, renaissance painting style',
            noble: 'elegant aristocratic portrait, regal attire, sophisticated pose, classical painting style, rich colors',
            cartoon: 'cartoon character portrait, bold outlines, bright colors, expressive features, animated style',
            whimsical: 'whimsical fairytale character portrait, magical elements, dreamy atmosphere, enchanted forest vibe',
            realistic: 'realistic portrait photograph, professional headshot, soft lighting, high detail, photorealistic'
        };
        
        // SiliconFlow API configuration
        this.siliconflowApiUrl = 'https://api.siliconflow.com/v1/images/generations';
        this.fluxModel = 'black-forest-labs/FLUX.1-schnell'; // Fast model for avatar generation
    }

    /**
     * Initialize plugin
     */
    async init() {
        this.logger.info('Talking Heads plugin loading...');
        
        // Load cached avatars from filesystem
        await this._loadCachedAvatars();
        
        // Register API routes
        this._registerRoutes();
        
        // Register Socket.IO events
        this._registerSocketEvents();
        
        // Listen for TTS playback events
        this._registerTTSEventListeners();
        
        // Listen for TikTok events to collect user profile pictures
        this._registerTikTokEventListeners();
        
        this.logger.info('Talking Heads plugin loaded successfully');
    }

    /**
     * Register TikTok event listeners to collect user profile pictures
     * This uses the actual TikTok profile picture from the TikTok API, not local images
     */
    _registerTikTokEventListeners() {
        // Listen for chat events to collect profile pictures
        this.api.registerTikTokEvent('chat', (data) => {
            this._handleUserEvent(data);
        });
        
        // Listen for gift events
        this.api.registerTikTokEvent('gift', (data) => {
            this._handleUserEvent(data);
        });
        
        // Listen for follow events
        this.api.registerTikTokEvent('follow', (data) => {
            this._handleUserEvent(data);
        });
        
        this.logger.info('Talking Heads: TikTok event listeners registered');
    }

    /**
     * Handle user event to collect profile picture URL from TikTok
     */
    _handleUserEvent(data) {
        if (!this.config.enabled) return;
        
        const uniqueId = data.uniqueId || data.username;
        const username = data.nickname || data.uniqueId || data.username;
        // Get profile picture URL from TikTok data - this is the actual TikTok avatar
        const profilePictureUrl = data.profilePictureUrl || 
                                  data.profilePicture || 
                                  data.avatarUrl || 
                                  data.avatarThumb ||
                                  data.avatarLarger ||
                                  (data.user && (data.user.profilePictureUrl || data.user.avatarUrl));
        
        if (!uniqueId) return;
        
        // Store profile picture URL for later use (don't generate avatar yet)
        // This avoids the /images/default-avatar.png error by using TikTok's actual profile pictures
        if (profilePictureUrl) {
            // Initialize Map if not exists
            if (!this.userProfilePictures) {
                this.userProfilePictures = new Map();
            }
            
            this.userProfilePictures.set(uniqueId, {
                username,
                profilePictureUrl,
                lastSeen: Date.now()
            });
            
            this._debug('Stored user profile picture from TikTok', { 
                uniqueId, 
                username, 
                profilePictureUrl: profilePictureUrl.substring(0, 50) + '...' 
            });
        }
    }

    /**
     * Load configuration from database
     */
    _loadConfig() {
        const saved = this.api.getConfig('config');
        return saved ? { ...this.defaultConfig, ...saved } : { ...this.defaultConfig };
    }

    /**
     * Save configuration to database
     */
    _saveConfig() {
        this.api.setConfig('config', this.config);
    }

    /**
     * Log debug message if debug logging is enabled
     */
    _debug(message, data = {}) {
        if (this.config.debugLogging) {
            this.logger.info(`[TalkingHeads:DEBUG] ${message}`, data);
            // Emit debug event for UI
            this.api.emit('talking-heads:debug', { timestamp: Date.now(), message, data });
        }
    }

    /**
     * Load cached avatars from filesystem on startup
     */
    async _loadCachedAvatars() {
        try {
            const cacheIndexPath = path.join(this.cacheDir, 'index.json');
            if (fs.existsSync(cacheIndexPath)) {
                const cacheIndex = JSON.parse(fs.readFileSync(cacheIndexPath, 'utf-8'));
                const now = Date.now();
                const maxAge = this.config.cacheDurationDays * 24 * 60 * 60 * 1000;
                const realCacheDir = path.resolve(this.cacheDir);
                
                for (const [uniqueId, entry] of Object.entries(cacheIndex)) {
                    // Check if cache entry is still valid
                    if (now - entry.generatedAt < maxAge) {
                        // Sanitize uniqueId to prevent path traversal
                        const sanitizedId = uniqueId.replace(/[^a-zA-Z0-9_]/g, '_');
                        
                        // Load images from disk
                        const closedPath = path.join(this.cacheDir, `${sanitizedId}_closed.png`);
                        const openPath = path.join(this.cacheDir, `${sanitizedId}_open.png`);
                        
                        // Verify paths are within cache directory (platform-independent)
                        const realClosedPath = path.resolve(closedPath);
                        const realOpenPath = path.resolve(openPath);
                        
                        const isValidPath = (p) => {
                            return p.startsWith(realCacheDir) && 
                                   (p === realCacheDir || p.startsWith(realCacheDir + path.sep) || p.startsWith(realCacheDir + '/'));
                        };
                        
                        if (!isValidPath(realClosedPath) || !isValidPath(realOpenPath)) {
                            this.logger.warn(`Skipping cache entry with invalid path: ${uniqueId}`);
                            continue;
                        }
                        
                        if (fs.existsSync(closedPath) && fs.existsSync(openPath)) {
                            this.avatarCache.set(uniqueId, {
                                closedMouth: fs.readFileSync(closedPath, 'base64'),
                                openMouth: fs.readFileSync(openPath, 'base64'),
                                style: entry.style,
                                generatedAt: entry.generatedAt
                            });
                        }
                    }
                }
                
                this.logger.info(`Loaded ${this.avatarCache.size} cached avatars`);
            }
        } catch (error) {
            this.logger.warn(`Failed to load cached avatars: ${error.message}`);
        }
    }

    /**
     * Save avatar to cache (memory and filesystem)
     */
    async _saveToCache(uniqueId, avatarData) {
        try {
            if (!this.config.cacheEnabled) return;
            
            // Sanitize uniqueId to prevent path traversal - only allow alphanumeric and underscore
            const sanitizedId = uniqueId.replace(/[^a-zA-Z0-9_]/g, '_');
            
            // Save to memory
            this.avatarCache.set(uniqueId, avatarData);
            
            // Save images to disk
            const closedPath = path.join(this.cacheDir, `${sanitizedId}_closed.png`);
            const openPath = path.join(this.cacheDir, `${sanitizedId}_open.png`);
            
            // Verify paths are within cache directory (platform-independent)
            const realCacheDir = path.resolve(this.cacheDir);
            const realClosedPath = path.resolve(closedPath);
            const realOpenPath = path.resolve(openPath);
            
            const isValidPath = (p) => {
                return p.startsWith(realCacheDir) && 
                       (p === realCacheDir || p.startsWith(realCacheDir + path.sep) || p.startsWith(realCacheDir + '/'));
            };
            
            if (!isValidPath(realClosedPath) || !isValidPath(realOpenPath)) {
                throw new Error('Invalid cache path');
            }
            
            fs.writeFileSync(closedPath, avatarData.closedMouth, 'base64');
            fs.writeFileSync(openPath, avatarData.openMouth, 'base64');
            
            // Update cache index
            const cacheIndexPath = path.join(this.cacheDir, 'index.json');
            let cacheIndex = {};
            
            if (fs.existsSync(cacheIndexPath)) {
                cacheIndex = JSON.parse(fs.readFileSync(cacheIndexPath, 'utf-8'));
            }
            
            cacheIndex[uniqueId] = {
                style: avatarData.style,
                generatedAt: avatarData.generatedAt
            };
            
            fs.writeFileSync(cacheIndexPath, JSON.stringify(cacheIndex, null, 2));
            
            this._debug('Avatar saved to cache', { uniqueId, style: avatarData.style });
        } catch (error) {
            this.logger.error(`Failed to save avatar to cache: ${error.message}`);
        }
    }

    /**
     * Get API key for image generation
     */
    _getApiKey(provider) {
        const db = this.api.getDatabase();
        
        if (provider === 'openai') {
            return db.getSetting('openai_api_key');
        } else if (provider === 'siliconflow') {
            // SiliconFlow API key (shared with TTS Fish Speech)
            return db.getSetting('siliconflow_api_key') || 
                   db.getSetting('tts_fishspeech_api_key') || 
                   db.getSetting('streamalchemy_siliconflow_api_key');
        }
        return null;
    }

    /**
     * Determine which image provider to use
     */
    _resolveImageProvider() {
        if (this.config.imageProvider !== 'auto') {
            return this.config.imageProvider;
        }
        
        // Auto mode: prefer OpenAI if available, fallback to SiliconFlow
        if (this._getApiKey('openai')) {
            return 'openai';
        } else if (this._getApiKey('siliconflow')) {
            return 'siliconflow';
        }
        
        return null;
    }

    /**
     * Generate avatar image using SiliconFlow FLUX.1 API
     */
    async _generateWithSiliconFlow(prompt, apiKey) {
        try {
            const response = await axios.post(this.siliconflowApiUrl, {
                model: this.fluxModel,
                prompt: prompt,
                image_size: '512x512',
                num_inference_steps: 20,
                guidance_scale: 7.5
            }, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 60000 // 60 second timeout
            });
            
            if (response.data && response.data.images && response.data.images[0]) {
                // SiliconFlow returns base64 or URL depending on configuration
                const imageData = response.data.images[0];
                
                if (imageData.url) {
                    // Download image from URL
                    const imgResponse = await axios.get(imageData.url, {
                        responseType: 'arraybuffer',
                        timeout: 30000
                    });
                    return Buffer.from(imgResponse.data).toString('base64');
                } else if (imageData.b64_json) {
                    return imageData.b64_json;
                }
            }
            
            throw new Error('No image data in response');
        } catch (error) {
            this.logger.error(`SiliconFlow image generation failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Generate avatar image using OpenAI DALL-E API
     */
    async _generateWithOpenAI(prompt, apiKey) {
        try {
            const response = await axios.post('https://api.openai.com/v1/images/generations', {
                model: 'dall-e-3',
                prompt: prompt,
                n: 1,
                size: '1024x1024',
                response_format: 'b64_json'
            }, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 90000 // 90 second timeout for DALL-E 3
            });
            
            if (response.data && response.data.data && response.data.data[0]) {
                return response.data.data[0].b64_json;
            }
            
            throw new Error('No image data in response');
        } catch (error) {
            this.logger.error(`OpenAI image generation failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Generate talking head avatar for a user
     * Creates both closed mouth (idle) and open mouth (speaking) versions
     */
    async generateAvatar(uniqueId, username, profilePictureUrl = null) {
        this._debug('Generating avatar', { uniqueId, username, profilePictureUrl });
        
        // Check cache first
        if (this.config.cacheEnabled && this.avatarCache.has(uniqueId)) {
            const cached = this.avatarCache.get(uniqueId);
            // Check if style matches
            if (cached.style === this.config.style) {
                this._debug('Using cached avatar', { uniqueId });
                return cached;
            }
        }
        
        // Determine image provider
        const provider = this._resolveImageProvider();
        if (!provider) {
            throw new Error('No image generation API key configured. Please configure OpenAI or SiliconFlow API key in Settings.');
        }
        
        const apiKey = this._getApiKey(provider);
        if (!apiKey) {
            throw new Error(`${provider} API key not found`);
        }
        
        // Get style prompt
        const stylePrompt = this.stylePrompts[this.config.style] || this.stylePrompts.cartoon;
        
        // Generate base prompt incorporating username for personalization
        // Using TikTok profile picture URL for reference in prompt
        let basePrompt = `Portrait avatar of a character representing TikTok user "${username}", ${stylePrompt}`;
        
        if (profilePictureUrl) {
            basePrompt += `. Character inspired by profile picture style.`;
        }
        
        // Generate closed mouth (idle) version
        const closedMouthPrompt = `${basePrompt}, neutral expression with closed mouth, looking directly at viewer, clean background`;
        
        // Generate open mouth (speaking) version
        const openMouthPrompt = `${basePrompt}, speaking expression with mouth open mid-word, looking directly at viewer, clean background`;
        
        this._debug('Generating images', { provider, style: this.config.style });
        
        let closedMouthImage, openMouthImage;
        
        try {
            if (provider === 'siliconflow') {
                // Generate both images with SiliconFlow
                closedMouthImage = await this._generateWithSiliconFlow(closedMouthPrompt, apiKey);
                openMouthImage = await this._generateWithSiliconFlow(openMouthPrompt, apiKey);
            } else if (provider === 'openai') {
                // Generate both images with OpenAI
                closedMouthImage = await this._generateWithOpenAI(closedMouthPrompt, apiKey);
                openMouthImage = await this._generateWithOpenAI(openMouthPrompt, apiKey);
            }
        } catch (error) {
            this.logger.error(`Avatar generation failed: ${error.message}`);
            throw error;
        }
        
        const avatarData = {
            closedMouth: closedMouthImage,
            openMouth: openMouthImage,
            style: this.config.style,
            generatedAt: Date.now()
        };
        
        // Save to cache
        await this._saveToCache(uniqueId, avatarData);
        
        this._debug('Avatar generated successfully', { uniqueId, style: this.config.style });
        
        return avatarData;
    }

    /**
     * Check if user has permission to get a talking head
     */
    _checkPermission(userData) {
        const { permissionMode, minTeamLevel } = this.config;
        
        switch (permissionMode) {
            case 'all':
                return true;
            case 'team':
                return (userData.teamMemberLevel || 0) >= minTeamLevel;
            case 'subscriber':
                return userData.isSubscriber || userData.isSuperFan;
            case 'custom_voice':
                // Check if user has a custom TTS voice assigned
                const db = this.api.getDatabase();
                const ttsSettings = db.get(`tts_user_settings:${userData.uniqueId}`);
                return ttsSettings && ttsSettings.assigned_voice_id;
            case 'moderator':
                return userData.isModerator;
            case 'top_gifter':
                return userData.isTopGifter;
            default:
                return true;
        }
    }

    /**
     * Register HTTP API routes
     */
    _registerRoutes() {
        // Serve plugin UI
        this.api.registerRoute('GET', '/plugins/talking-heads/ui.html', (req, res) => {
            res.sendFile(path.join(__dirname, 'ui.html'));
        });
        
        this.api.registerRoute('GET', '/plugins/talking-heads/ui.js', (req, res) => {
            res.sendFile(path.join(__dirname, 'ui.js'));
        });
        
        this.api.registerRoute('GET', '/plugins/talking-heads/ui.css', (req, res) => {
            res.sendFile(path.join(__dirname, 'ui.css'));
        });
        
        // Serve overlay
        this.api.registerRoute('GET', '/plugins/talking-heads/overlay.html', (req, res) => {
            res.sendFile(path.join(__dirname, 'overlays', 'overlay.html'));
        });
        
        this.api.registerRoute('GET', '/plugins/talking-heads/overlay.js', (req, res) => {
            res.sendFile(path.join(__dirname, 'overlays', 'overlay.js'));
        });
        
        this.api.registerRoute('GET', '/plugins/talking-heads/overlay.css', (req, res) => {
            res.sendFile(path.join(__dirname, 'overlays', 'overlay.css'));
        });
        
        // Get configuration
        this.api.registerRoute('GET', '/api/talking-heads/config', (req, res) => {
            // Hide API keys in response
            res.json({
                success: true,
                config: {
                    ...this.config,
                    hasOpenAIKey: !!this._getApiKey('openai'),
                    hasSiliconFlowKey: !!this._getApiKey('siliconflow')
                }
            });
        });
        
        // Update configuration
        this.api.registerRoute('POST', '/api/talking-heads/config', (req, res) => {
            try {
                const updates = req.body;
                
                // Update config with allowed fields only
                const allowedFields = [
                    'enabled', 'debugLogging', 'imageProvider', 'style',
                    'permissionMode', 'minTeamLevel', 'fadeInDuration', 'fadeOutDuration',
                    'blinkInterval', 'obsEnabled', 'cacheEnabled', 'cacheDurationDays'
                ];
                
                for (const field of allowedFields) {
                    if (updates[field] !== undefined) {
                        this.config[field] = updates[field];
                    }
                }
                
                this._saveConfig();
                
                // Broadcast config update
                this.api.emit('talking-heads:config-updated', this.config);
                
                res.json({ success: true, config: this.config });
            } catch (error) {
                this.logger.error(`Failed to update config: ${error.message}`);
                res.status(500).json({ success: false, error: error.message });
            }
        });
        
        // Test API connection
        this.api.registerRoute('POST', '/api/talking-heads/test-api', async (req, res) => {
            try {
                const provider = this._resolveImageProvider();
                if (!provider) {
                    return res.json({
                        success: false,
                        error: 'No API key configured'
                    });
                }
                
                const apiKey = this._getApiKey(provider);
                
                // Simple test - just check if API key format is valid
                // Note: OpenAI API keys currently start with 'sk-' (as of 2024)
                // This may change in the future - consider updating if OpenAI changes their format
                if (provider === 'openai' && apiKey && !apiKey.startsWith('sk-')) {
                    return res.json({
                        success: false,
                        error: 'Invalid OpenAI API key format (expected sk-... prefix)'
                    });
                }
                
                res.json({
                    success: true,
                    provider: provider,
                    message: `${provider} API key is configured`
                });
            } catch (error) {
                res.json({ success: false, error: error.message });
            }
        });
        
        // Generate test avatar
        this.api.registerRoute('POST', '/api/talking-heads/test-generate', async (req, res) => {
            try {
                const testUniqueId = 'test_user_' + Date.now();
                const testUsername = req.body.username || 'TestUser';
                
                this.logger.info(`Generating test avatar for ${testUsername}...`);
                
                const avatarData = await this.generateAvatar(testUniqueId, testUsername);
                
                res.json({
                    success: true,
                    sprites: 2, // closed and open mouth
                    avatarData: {
                        closedMouth: avatarData.closedMouth.substring(0, 100) + '...', // Truncate for response
                        openMouth: avatarData.openMouth.substring(0, 100) + '...',
                        style: avatarData.style
                    }
                });
            } catch (error) {
                this.logger.error(`Test generation failed: ${error.message}`);
                res.status(500).json({ success: false, error: error.message });
            }
        });
        
        // Generate avatar for a specific user (with TikTok profile picture)
        this.api.registerRoute('POST', '/api/talking-heads/generate/:uniqueId', async (req, res) => {
            try {
                const { uniqueId } = req.params;
                const { username, profilePictureUrl } = req.body;
                
                // Try to get profile picture from stored data if not provided
                let finalProfilePictureUrl = profilePictureUrl;
                let finalUsername = username;
                
                if (!finalProfilePictureUrl && this.userProfilePictures) {
                    const storedProfile = this.userProfilePictures.get(uniqueId);
                    if (storedProfile) {
                        finalProfilePictureUrl = storedProfile.profilePictureUrl;
                        finalUsername = finalUsername || storedProfile.username;
                    }
                }
                
                if (!finalUsername) {
                    finalUsername = uniqueId;
                }
                
                this.logger.info(`Generating avatar for ${finalUsername} (${uniqueId})...`);
                
                const avatarData = await this.generateAvatar(uniqueId, finalUsername, finalProfilePictureUrl);
                
                res.json({
                    success: true,
                    uniqueId,
                    username: finalUsername,
                    sprites: 2,
                    style: avatarData.style
                });
            } catch (error) {
                this.logger.error(`Avatar generation failed: ${error.message}`);
                res.status(500).json({ success: false, error: error.message });
            }
        });
        
        // Get avatar for user
        this.api.registerRoute('GET', '/api/talking-heads/avatar/:uniqueId', async (req, res) => {
            try {
                const { uniqueId } = req.params;
                
                if (this.avatarCache.has(uniqueId)) {
                    const avatarData = this.avatarCache.get(uniqueId);
                    res.json({
                        success: true,
                        avatar: {
                            closedMouth: avatarData.closedMouth,
                            openMouth: avatarData.openMouth,
                            style: avatarData.style
                        }
                    });
                } else {
                    res.json({ success: false, error: 'Avatar not found' });
                }
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });
        
        // Get cache statistics
        this.api.registerRoute('GET', '/api/talking-heads/cache/stats', (req, res) => {
            res.json({
                success: true,
                cachedAvatars: this.avatarCache.size,
                activeAnimations: this.activeAnimations.size
            });
        });
        
        // Clear cache
        this.api.registerRoute('POST', '/api/talking-heads/cache/clear', async (req, res) => {
            try {
                const count = this.avatarCache.size;
                
                // Clear memory cache
                this.avatarCache.clear();
                
                // Clear filesystem cache
                const files = fs.readdirSync(this.cacheDir);
                for (const file of files) {
                    // Validate file path is within cache directory to prevent path traversal
                    const filePath = path.join(this.cacheDir, file);
                    const realPath = path.resolve(filePath);
                    const realCacheDir = path.resolve(this.cacheDir);
                    
                    // Ensure path is within cache directory (handles edge cases on all platforms)
                    if (!realPath.startsWith(realCacheDir) || 
                        (realPath !== realCacheDir && !realPath.startsWith(realCacheDir + path.sep) && !realPath.startsWith(realCacheDir + '/'))) {
                        this.logger.warn(`Skipping file outside cache directory: ${file}`);
                        continue;
                    }
                    
                    // Only delete expected file types
                    if (file.endsWith('.png') || file.endsWith('.json')) {
                        fs.unlinkSync(filePath);
                    }
                }
                
                res.json({ success: true, cleared: count });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });
        
        // Get active animations
        this.api.registerRoute('GET', '/api/talking-heads/active', (req, res) => {
            const active = Array.from(this.activeAnimations.entries()).map(([uniqueId, data]) => ({
                uniqueId,
                username: data.username,
                startTime: data.ttsStartTime
            }));
            
            res.json({ success: true, active });
        });
        
        this.logger.info('Talking Heads: HTTP routes registered');
    }

    /**
     * Register Socket.IO events
     */
    _registerSocketEvents() {
        // Client requests avatar generation
        this.api.registerSocket('talking-heads:generate', async (socket, data) => {
            try {
                const { uniqueId, username, profilePictureUrl } = data;
                
                const avatarData = await this.generateAvatar(uniqueId, username, profilePictureUrl);
                
                socket.emit('talking-heads:generated', {
                    success: true,
                    uniqueId,
                    avatar: {
                        closedMouth: avatarData.closedMouth,
                        openMouth: avatarData.openMouth,
                        style: avatarData.style
                    }
                });
            } catch (error) {
                socket.emit('talking-heads:error', { error: error.message });
            }
        });
        
        // Client requests current speaking status
        this.api.registerSocket('talking-heads:status', (socket) => {
            const active = Array.from(this.activeAnimations.entries()).map(([uniqueId, data]) => ({
                uniqueId,
                username: data.username,
                isSpeaking: true
            }));
            
            socket.emit('talking-heads:status', { active });
        });
        
        this.logger.info('Talking Heads: Socket.IO events registered');
    }

    /**
     * Register TTS event listeners for mouth sync
     */
    _registerTTSEventListeners() {
        // Listen for TTS playback events via plugin loader
        // The TTS plugin emits these events when audio starts/ends playing
        if (this.api.pluginLoader) {
            this.api.pluginLoader.on('tts:playback:started', async (data) => {
                this._debug('Received tts:playback:started event', data);
                await this._handleTTSStart(data);
            });
            
            this.api.pluginLoader.on('tts:playback:ended', (data) => {
                this._debug('Received tts:playback:ended event', data);
                this._handleTTSEnd(data);
            });
            
            this.logger.info('Talking Heads: TTS event listeners registered via pluginLoader');
        } else {
            this.logger.warn('Talking Heads: pluginLoader not available, TTS sync may not work');
        }
    }

    /**
     * Handle TTS playback start - animate mouth
     */
    async _handleTTSStart(data) {
        if (!this.config.enabled || !this.config.obsEnabled) return;
        
        const { userId, username, id: ttsId, hasAssignedVoice } = data;
        const uniqueId = userId || username;
        
        this._debug('TTS playback started', { uniqueId, username, ttsId, hasAssignedVoice });
        
        // Check if user has a cached avatar
        let avatarData = this.avatarCache.get(uniqueId);
        
        if (!avatarData) {
            // Try to auto-generate avatar if user has profile picture from TikTok
            // This uses the TikTok profile picture URL, not local files
            const userProfile = this.userProfilePictures?.get(uniqueId);
            
            if (userProfile && userProfile.profilePictureUrl) {
                this._debug('Auto-generating avatar for speaking user', { 
                    uniqueId, 
                    username: userProfile.username,
                    profilePictureUrl: userProfile.profilePictureUrl.substring(0, 50) + '...'
                });
                
                try {
                    // Generate avatar asynchronously - don't block TTS
                    this.generateAvatar(uniqueId, userProfile.username, userProfile.profilePictureUrl)
                        .then(avatar => {
                            // Avatar will be ready for next TTS message
                            this._debug('Avatar generated for user', { uniqueId });
                        })
                        .catch(err => {
                            this._debug('Avatar generation failed', { uniqueId, error: err.message });
                        });
                } catch (error) {
                    this._debug('Failed to start avatar generation', { error: error.message });
                }
            } else {
                this._debug('No avatar cached or profile picture available for user', { uniqueId });
            }
            return;
        }
        
        // Store active animation
        this.activeAnimations.set(uniqueId, {
            userId,
            username,
            ttsStartTime: Date.now(),
            avatarData
        });
        
        // Emit mouth open event to overlay
        this.api.emit('talking-heads:mouth-open', {
            uniqueId,
            username,
            avatar: {
                openMouth: avatarData.openMouth,
                closedMouth: avatarData.closedMouth
            }
        });
        
        this._debug('Mouth animation started', { uniqueId, username });
    }

    /**
     * Handle TTS playback end - close mouth
     */
    _handleTTSEnd(data) {
        if (!this.config.enabled) return;
        
        const { userId, username, id: ttsId } = data;
        const uniqueId = userId || username;
        
        this._debug('TTS playback ended', { uniqueId, username, ttsId });
        
        // Remove from active animations
        const animation = this.activeAnimations.get(uniqueId);
        if (animation) {
            this.activeAnimations.delete(uniqueId);
            
            // Emit mouth close event to overlay
            this.api.emit('talking-heads:mouth-close', {
                uniqueId,
                username,
                avatar: {
                    closedMouth: animation.avatarData.closedMouth
                }
            });
            
            this._debug('Mouth animation stopped', { uniqueId, username });
        }
    }

    /**
     * Plugin cleanup
     */
    async destroy() {
        try {
            // Clear active animations
            this.activeAnimations.clear();
            
            this.logger.info('Talking Heads plugin destroyed');
        } catch (error) {
            this.logger.error(`Talking Heads destroy error: ${error.message}`);
        }
    }
}

module.exports = TalkingHeadsPlugin;
