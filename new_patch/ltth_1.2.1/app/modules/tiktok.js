const { WebcastEventEmitter, createWebSocketUrl, ClientCloseCode, deserializeWebSocketMessage, SchemaVersion } = require('@eulerstream/euler-websocket-sdk');
const EventEmitter = require('events');
const WebSocket = require('ws');
const axios = require('axios');

// Public fallback API key for users who don't have their own
// SECURITY: Prefer overriding via environment variables (EULER_FALLBACK_API_KEY). The backup key (EULER_BACKUP_API_KEY) is handled separately for warnings.
// NOTE: This fallback key is rate-limited and intended only as a temporary helper—users should configure their own API key for production.
const PUBLIC_FALLBACK_API_KEY = 'MDU2MGU5ZmI5YmNiNjhhODA4ZTgyYjZjYjc3NzA2OWE2NDhiZWVmZTdhNWEyNmNiY2Q1MmVh';
const FALLBACK_API_KEY = process.env.EULER_FALLBACK_API_KEY || PUBLIC_FALLBACK_API_KEY;

// Euler backup key - requires special warning before connection
const EULER_BACKUP_KEY = process.env.EULER_BACKUP_API_KEY || null;

/**
 * TikTok Live Connector - Eulerstream WebSocket API
 * 
 * This module uses EXCLUSIVELY the Eulerstream WebSocket SDK
 * from https://www.eulerstream.com/docs
 * 
 * The module handles all connection logic via Eulerstream's WebSocket API:
 * - Room ID resolution (automatic via Eulerstream)
 * - WebSocket connection management
 * - Event handling (chat, gifts, likes, etc.)
 * - Retry logic and error handling
 * 
 * STREAM TIME FIX: This module properly extracts and persists the actual
 * TikTok stream start time from event metadata, preventing the
 * timer from showing software start time instead of real stream duration.
 */
class TikTokConnector extends EventEmitter {
    constructor(io, db, logger = console) {
        super();
        this.io = io;
        this.db = db;
        this.logger = logger;
        this.ws = null;
        this.isConnected = false;
        this.currentUsername = null;

        // Increase max listeners to avoid warnings when multiple plugins listen to the same events
        this.setMaxListeners(20);

        // Auto-Reconnect configuration
        this.autoReconnectCount = 0;
        this.maxAutoReconnects = 5;
        this.autoReconnectResetTimeout = null;

        // Stats tracking
        this.stats = {
            viewers: 0,
            likes: 0,
            totalCoins: 0,
            followers: 0,
            shares: 0,
            gifts: 0
        };

        // Stream duration tracking
        this.streamStartTime = null;
        this.durationInterval = null;
        this._earliestEventTime = null; // Track earliest event to estimate stream start
        this._persistedStreamStart = null; // Persisted value across reconnects
        
        // Connection attempt tracking for diagnostics
        this.connectionAttempts = [];
        this.maxAttempts = 10;

        // Event deduplication tracking
        this.processedEvents = new Map();
        this.maxProcessedEvents = 1000;
        this.eventExpirationMs = 60000;

        // Gift catalog tracking - gifts seen in current stream session
        this.sessionGifts = new Map(); // Map<giftId, giftData>

        // Eulerstream WebSocket event emitter
        this.eventEmitter = null;
        
        // Room ID for API calls
        this.roomId = null;
        
        // TikTok Webcast API configuration
        this.webcastApiConfig = {
            baseUrl: 'https://webcast.tiktok.com/webcast',
            params: {
                aid: '1988',
                app_language: 'en-US',
                app_name: 'tiktok_web',
                browser_language: 'en',
                browser_name: 'Mozilla',
                browser_online: 'true',
                browser_platform: 'Win32',
                browser_version: '5.0',
                cookie_enabled: 'true',
                device_platform: 'web',
                focus_state: 'true',
                from_page: 'user',
                history_len: '2',
                is_fullscreen: 'false',
                is_page_visible: 'true',
                os: 'windows',
                priority_region: '',
                referer: 'https://www.tiktok.com/',
                root_referer: 'https://www.tiktok.com/',
                screen_height: '1080',
                screen_width: '1920',
                tz_name: 'Europe/Berlin',
                webcast_language: 'en'
            }
        };
    }

    /**
     * Connect to TikTok Live stream using Eulerstream WebSocket API
     * @param {string} username - TikTok username (without @)
     * @param {object} options - Connection options
     */
    async connect(username, options = {}) {
        // Store previous username before disconnect to detect streamer changes
        const previousUsername = this.currentUsername;
        
        if (this.isConnected) {
            await this.disconnect();
        }

        // Clear persisted stream start time if connecting to a different streamer
        if (previousUsername && previousUsername !== username) {
            this.streamStartTime = null;
            this._persistedStreamStart = null;
            this._earliestEventTime = null;
            this.resetStats();
            this.sessionGifts.clear();
            this.logger.info(`🔄 Switching from @${previousUsername} to @${username} - clearing old stream start time and stats`);
        }

        try {
            this.currentUsername = username;

            // Read Eulerstream WebSocket authentication key from configuration
            // Priority: Database setting > Environment variables > Fallback key
            // NOTE: This can be either the Webhook Secret OR the euler_ API key
            // Try Webhook Secret first if euler_ key doesn't work
            let apiKey = this.db.getSetting('tiktok_euler_api_key') || process.env.EULER_API_KEY || process.env.SIGN_API_KEY;
            let usingFallback = false;
            
            if (!apiKey) {
                // Use fallback key if no user key is configured and fallback is available
                if (FALLBACK_API_KEY) {
                    apiKey = FALLBACK_API_KEY;
                    usingFallback = true;
                    this.logger.warn('⚠️  No personal API key configured - using fallback key');
                    this.logger.warn('⚠️  This is a temporary solution. Please get your own free API key at https://www.eulerstream.com');
                    
                    // Emit event to show warning overlay to user
                    if (this.io) {
                        this.io.emit('fallback-key-warning', {
                            message: 'Fallback API Key wird verwendet',
                            duration: 10000 // 10 seconds
                        });
                    }
                } else {
                    const errorMsg = 'No API key configured. Please set your Eulerstream API key either:\n' +
                        '1. In the Dashboard Settings UI, or\n' +
                        '2. Via EULER_API_KEY environment variable.\n' +
                        'Get your free API key at https://www.eulerstream.com';
                    this.logger.error('❌ ' + errorMsg);
                    throw new Error(errorMsg);
                }
            }
            
            // Validate key format
            if (typeof apiKey !== 'string' || apiKey.trim().length < 32) {
                const errorMsg = 'Invalid key format. The key should be at least 32 characters long.';
                this.logger.error('❌ ' + errorMsg);
                throw new Error(errorMsg);
            }

            this.logger.info(`🔄 Verbinde mit TikTok LIVE: @${username}...`);
            this.logger.info(`⚙️  Connection Mode: Eulerstream WebSocket API`);
            this.logger.info(`🔑 Authentication Key configured (${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)})`);
            
            // Log key type for debugging
            if (apiKey.startsWith('euler_')) {
                this.logger.info(`   Key Type: REST API Key (starts with "euler_")`);
                this.logger.warn(`   ⚠️  If connection fails: Try using Webhook Secret instead!`);
            } else if (/^[a-fA-F0-9]{64}$/.test(apiKey)) {
                this.logger.info(`   Key Type: Webhook Secret (64-char hexadecimal)`);
            } else {
                this.logger.warn(`   Key Type: Unknown format - connection may fail`);
            }

            // Check if user is using the Euler backup key
            // Show non-dismissible warning and delay connection by 10 seconds
            if (EULER_BACKUP_KEY && apiKey === EULER_BACKUP_KEY) {
                this.logger.warn('⚠️  EULER BACKUP KEY DETECTED - Connection will be delayed by 10 seconds');
                this.logger.warn('⚠️  Please get your own free API key at https://www.eulerstream.com');
                
                // Emit event to show blocking warning overlay to user
                if (this.io) {
                    this.io.emit('euler-backup-key-warning', {
                        message: 'Euler Backup Key wird verwendet',
                        duration: 10000 // 10 seconds
                    });
                }
                
                // Wait 10 seconds before proceeding with connection
                this.logger.info('⏳ Waiting 10 seconds before establishing connection...');
                await new Promise(resolve => setTimeout(resolve, 10000));
                this.logger.info('✅ Delay complete, proceeding with connection');
            }

            // Create WebSocket URL using Eulerstream SDK
            // Note: useEnterpriseApi requires Enterprise plan upgrade
            // Community plan users should NOT enable this feature
            const wsUrl = createWebSocketUrl({
                uniqueId: username,
                apiKey: apiKey
                // features: {
                //     useEnterpriseApi: true  // Only for Enterprise plan subscribers
                // }
            });

            this.logger.info(`🔧 Connecting to Eulerstream WebSocket...`);

            // Create WebSocket connection
            this.ws = new WebSocket(wsUrl);

            // Create event emitter for processing messages
            this.eventEmitter = new WebcastEventEmitter(this.ws);

            // Setup WebSocket event handlers
            await this._setupWebSocketHandlers();

            // Wait for connection to open
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Connection timeout after 60s'));
                }, 60000);

                this.ws.once('open', () => {
                    clearTimeout(timeout);
                    resolve();
                });

                this.ws.once('error', (err) => {
                    clearTimeout(timeout);
                    reject(err);
                });
            });

            this.isConnected = true;

            // Initialize stream start time
            if (this._persistedStreamStart && this.currentUsername === username) {
                this.streamStartTime = this._persistedStreamStart;
                this.logger.info(`♻️  Restored persisted stream start time: ${new Date(this.streamStartTime).toISOString()}`);
            } else {
                // Don't set streamStartTime to connection time immediately
                // Wait for roomInfo or first event to get actual stream start time
                this.streamStartTime = null;
                this._streamTimeDetectionMethod = 'Waiting for stream data...';
                this.logger.info(`⏳ Waiting for roomInfo or first event to determine stream start time`);
            }

            // Start duration tracking interval
            if (this.durationInterval) {
                clearInterval(this.durationInterval);
            }
            this.durationInterval = setInterval(() => {
                this.broadcastStats();
            }, 1000);

            // Broadcast stream time info (only if we have a valid time)
            if (this.streamStartTime) {
                this.io.emit('tiktok:streamTimeInfo', {
                    streamStartTime: this.streamStartTime,
                    streamStartISO: new Date(this.streamStartTime).toISOString(),
                    detectionMethod: this._streamTimeDetectionMethod || 'Unknown',
                    currentDuration: Math.floor((Date.now() - this.streamStartTime) / 1000)
                });
            }

            // Reset auto-reconnect counter after 5 minutes of stable connection
            if (this.autoReconnectResetTimeout) {
                clearTimeout(this.autoReconnectResetTimeout);
            }
            this.autoReconnectResetTimeout = setTimeout(() => {
                this.autoReconnectCount = 0;
                this.logger.info('✅ Auto-reconnect counter reset');
            }, 5 * 60 * 1000);

            // Broadcast success
            this.broadcastStatus('connected', {
                username,
                method: 'Eulerstream WebSocket'
            });
            
            // Emit streamChanged event if connecting to a different streamer
            if (previousUsername && previousUsername !== username) {
                this.emit('streamChanged', {
                    previousUsername,
                    newUsername: username,
                    timestamp: new Date().toISOString()
                });
                this.logger.info(`🔄 Stream changed from @${previousUsername} to @${username}`);
            }
            
            // Emit connected event for IFTTT engine
            this.emit('connected', {
                username,
                timestamp: new Date().toISOString()
            });

            // Save last connected username
            this.db.setSetting('last_connected_username', username);

            this.logger.info(`✅ Connected to TikTok LIVE: @${username} via Eulerstream`);
            
            // Fetch room info and update gift catalog from TikTok API
            setTimeout(async () => {
                try {
                    await this.fetchRoomInfo();
                } catch (error) {
                    this.logger.warn('Could not fetch room info from TikTok API:', error.message);
                }
                
                // Update gift catalog after connection
                try {
                    const catalogResult = await this.updateGiftCatalog();
                    this.logger.info(`🎁 ${catalogResult.message}`);
                } catch (error) {
                    this.logger.warn('Could not update gift catalog:', error.message);
                }
            }, 2000); // Wait 2 seconds after connection to fetch room info and update gift catalog
            
            // Log success
            this._logConnectionAttempt(username, true, null, null);

        } catch (error) {
            this.isConnected = false;

            // Analyze and format error
            const errorInfo = this._analyzeError(error);

            this.logger.error(`❌ Connection error:`, errorInfo.message);
            
            if (errorInfo.suggestion) {
                this.logger.info(`💡 Suggestion:`, errorInfo.suggestion);
            }

            // Log failure
            this._logConnectionAttempt(username, false, errorInfo.type, errorInfo.message);

            // Broadcast error
            this.broadcastStatus('error', {
                error: errorInfo.message,
                type: errorInfo.type,
                suggestion: errorInfo.suggestion
            });

            throw error;
        }
    }

    /**
     * Map EulerStream event types to internal event names
     * EulerStream uses names like "WebcastChatMessage", we need "chat"
     * @private
     */
    _mapEulerStreamEventType(eulerType) {
        const mapping = {
            'WebcastChatMessage': 'chat',
            'WebcastGiftMessage': 'gift',
            'WebcastSocialMessage': 'social',
            'WebcastLikeMessage': 'like',
            'WebcastMemberMessage': 'member',
            'WebcastRoomUserSeqMessage': 'roomUser',
            'WebcastSubscribeMessage': 'subscribe',
            'WebcastShareMessage': 'share',
            'WebcastQuestionNewMessage': 'question',
            'WebcastLinkMicBattle': 'linkMicBattle',
            'WebcastLinkMicArmies': 'linkMicArmies',
            'WebcastEmoteChatMessage': 'emote'
        };
        
        return mapping[eulerType] || null;
    }

    /**
     * Setup WebSocket event handlers
     * @private
     */
    async _setupWebSocketHandlers() {
        if (!this.ws || !this.eventEmitter) return;

        // Remove any existing listeners to prevent duplicates
        this.ws.removeAllListeners();
        this.eventEmitter.removeAllListeners();

        // WebSocket connection events
        this.ws.on('open', () => {
            this.logger.info('🟢 Eulerstream WebSocket connected');
        });

        this.ws.on('close', (code, reason) => {
            const reasonText = Buffer.isBuffer(reason) ? reason.toString('utf-8') : (reason || '');
            this.logger.info(`🔴 Eulerstream WebSocket disconnected: ${code} - ${ClientCloseCode[code] || reasonText}`);
            
            // Special handling for authentication errors
            if (code === 4401) {
                this.logger.error('❌ Authentication Error: The provided Eulerstream API key is invalid.');
                this.logger.error('💡 Please check your API key configuration:');
                this.logger.error('   1. Verify the API key in Dashboard Settings (tiktok_euler_api_key)');
                this.logger.error('   2. Or check environment variable EULER_API_KEY');
                this.logger.error('   3. Get a valid key from: https://www.eulerstream.com');
                this.logger.error(`   4. Key format should be a long alphanumeric string (64+ characters)`);
                if (reasonText) {
                    this.logger.error(`   Server message: ${reasonText}`);
                }
            } else if (code === 4400) {
                this.logger.error('❌ Invalid Options: The connection parameters are incorrect.');
                this.logger.error('💡 Please check the username and API key are correct.');
            } else if (code === 4404) {
                this.logger.warn('⚠️  User Not Live: The requested TikTok user is not currently streaming.');
            }
            
            this.isConnected = false;
            this.broadcastStatus('disconnected');
            
            // Emit disconnected event for IFTTT engine
            this.emit('disconnected', {
                username: this.currentUsername,
                timestamp: new Date().toISOString(),
                reason: reasonText || ClientCloseCode[code] || 'Connection closed',
                code: code
            });

            // Don't auto-reconnect on authentication errors
            if (code === 4401 || code === 4400) {
                this.logger.warn('⚠️  Auto-reconnect disabled due to authentication/configuration error. Please fix the issue and manually reconnect.');
                this.broadcastStatus('auth_error', {
                    code: code,
                    message: 'Authentication failed - manual reconnect required',
                    suggestion: 'Please check your Eulerstream API key configuration'
                });
                return;
            }
            
            // Auto-Reconnect with limit (for non-auth errors)
            if (this.currentUsername && this.autoReconnectCount < this.maxAutoReconnects) {
                this.autoReconnectCount++;
                const delay = 5000;

                this.logger.info(`🔄 Attempting auto-reconnect ${this.autoReconnectCount}/${this.maxAutoReconnects} in ${delay/1000}s...`);

                setTimeout(() => {
                    this.connect(this.currentUsername).catch(err => {
                        this.logger.error(`Auto-reconnect ${this.autoReconnectCount}/${this.maxAutoReconnects} failed:`, err.message);
                    });
                }, delay);

                // Reset Counter after 5 minutes successful connection
                if (this.autoReconnectResetTimeout) {
                    clearTimeout(this.autoReconnectResetTimeout);
                }
            } else if (this.autoReconnectCount >= this.maxAutoReconnects) {
                this.logger.warn(`⚠️ Max auto-reconnect attempts (${this.maxAutoReconnects}) reached. Manual reconnect required.`);
                this.broadcastStatus('max_reconnects_reached', {
                    maxReconnects: this.maxAutoReconnects,
                    message: 'Bitte manuell neu verbinden'
                });
            }
        });

        this.ws.on('error', (err) => {
            this.logger.error('❌ WebSocket error:', err);
            
            // Emit error event for IFTTT engine
            this.emit('error', {
                error: err.message || String(err),
                module: 'eulerstream-websocket',
                timestamp: new Date().toISOString()
            });
        });

        // Handle incoming WebSocket messages
        this.ws.on('message', (data) => {
            try {
                // Log that we received a message (using info level for visibility)
                this.logger.info(`📨 Received WebSocket message: ${typeof data}, length: ${data ? data.length : 0}`);
                
                // First, try to parse as JSON (EulerStream default format)
                let parsedData;
                
                if (typeof data === 'string') {
                    // Text message - parse as JSON
                    this.logger.info('Parsing as text/JSON...');
                    parsedData = JSON.parse(data);
                } else {
                    // Binary message - try JSON first, then protobuf
                    const textData = data.toString('utf-8');
                    try {
                        this.logger.info('Trying JSON parse on binary data...');
                        parsedData = JSON.parse(textData);
                    } catch (jsonError) {
                        // If JSON parsing fails, try protobuf deserialization
                        this.logger.info('JSON failed, trying protobuf...');
                        const frame = deserializeWebSocketMessage(
                            new Uint8Array(data),
                            SchemaVersion.V2
                        );
                        parsedData = frame;
                    }
                }

                this.logger.info(`Parsed data keys: ${JSON.stringify(Object.keys(parsedData || {}))}`);

                // Process messages
                if (parsedData && parsedData.messages && Array.isArray(parsedData.messages)) {
                    this.logger.info(`🎉 Processing ${parsedData.messages.length} messages from WebSocket`);
                    for (const message of parsedData.messages) {
                        if (message.type && message.data) {
                            // Special handling for roomInfo event to extract stream start time
                            if (message.type === 'roomInfo') {
                                this.logger.info('📋 Received roomInfo event - extracting stream start time and stats');
                                this.logger.info(`📋 roomInfo keys: ${JSON.stringify(Object.keys(message.data || {}))}`);
                                
                                // Extract stream start time
                                const extractedTime = this._extractStreamStartTime(message.data);
                                
                                // Update stream start time if not already set or if extracted time is earlier
                                if (!this.streamStartTime || extractedTime < this.streamStartTime) {
                                    this.streamStartTime = extractedTime;
                                    this._persistedStreamStart = extractedTime;
                                    this._streamTimeDetectionMethod = 'roomInfo (from TikTok)';
                                    
                                    this.logger.info(`✅ Stream start time set from roomInfo: ${new Date(this.streamStartTime).toISOString()}`);
                                    
                                    // Broadcast updated stream time info
                                    this.io.emit('tiktok:streamTimeInfo', {
                                        streamStartTime: this.streamStartTime,
                                        streamStartISO: new Date(this.streamStartTime).toISOString(),
                                        detectionMethod: this._streamTimeDetectionMethod,
                                        currentDuration: Math.floor((Date.now() - this.streamStartTime) / 1000)
                                    });
                                }
                                
                                // Extract initial statistics (likes, followers, viewers, etc.)
                                this._extractStatsFromRoomInfo(message.data);
                                
                                // Don't emit roomInfo as a regular event, just process it
                                continue;
                            }
                            
                            // Map EulerStream event types to our internal event names
                            // EulerStream uses names like "WebcastChatMessage", we need "chat"
                            const eventType = this._mapEulerStreamEventType(message.type);
                            
                            if (eventType) {
                                this.logger.info(`✅ Emitting event: ${eventType} (from ${message.type})`);
                                // Emit the parsed event to our event emitter
                                this.eventEmitter.emit(eventType, message.data);
                            } else {
                                this.logger.warn(`⚠️ Unknown event type: ${message.type} - skipping`);
                            }
                        } else {
                            this.logger.warn(`Message missing type or data: ${JSON.stringify(message).substring(0, 100)}`);
                        }
                    }
                } else {
                    this.logger.warn(`⚠️ Parsed data does not contain messages array. Keys: ${JSON.stringify(Object.keys(parsedData || {}))}`);
                    this.logger.warn(`Data preview: ${JSON.stringify(parsedData).substring(0, 200)}`);
                }
            } catch (error) {
                // Log comprehensive error information in a single message
                const errorDetails = {
                    message: error.message || 'Unknown error',
                    name: error.name || 'Error',
                    stack: error.stack ? error.stack.split('\n').slice(0, 3).join(' | ') : 'No stack trace',
                    dataLength: data ? data.length : 0,
                    dataType: typeof data,
                    dataPreview: data ? (typeof data === 'string' ? data.substring(0, 100) : Buffer.from(data).toString('utf-8', 0, 100)) : 'No data'
                };
                this.logger.error(`WebSocket message processing failed: ${JSON.stringify(errorDetails)}`);
            }
        });

        // Setup Eulerstream event handlers
        this._registerEulerstreamEvents();
    }

    /**
     * Register Eulerstream event listeners
     * @private
     */
    _registerEulerstreamEvents() {
        if (!this.eventEmitter) return;

        // Helper function to track earliest event time
        const trackEarliestEventTime = (data) => {
            if (data && data.createTime) {
                let timestamp = typeof data.createTime === 'string' ? parseInt(data.createTime, 10) : data.createTime;
                
                // Convert to milliseconds if needed
                if (timestamp < 4000000000) {
                    timestamp = timestamp * 1000;
                }
                
                // Update earliest time if this is earlier and reasonable
                const now = Date.now();
                const minTime = new Date('2020-01-01').getTime();
                
                if (timestamp > minTime && timestamp <= now) {
                    if (!this._earliestEventTime || timestamp < this._earliestEventTime) {
                        this._earliestEventTime = timestamp;
                        this.logger.info(`🕐 Updated earliest event time: ${new Date(timestamp).toISOString()}`);
                        
                        // If we don't have a stream start time yet, use earliest event
                        if (!this.streamStartTime) {
                            this.streamStartTime = this._earliestEventTime;
                            this._persistedStreamStart = this.streamStartTime;
                            this._streamTimeDetectionMethod = 'First Event Timestamp';
                            this.logger.info(`📅 Set stream start time from earliest event: ${new Date(this.streamStartTime).toISOString()}`);
                            
                            // Broadcast updated stream time info
                            this.io.emit('tiktok:streamTimeInfo', {
                                streamStartTime: this.streamStartTime,
                                streamStartISO: new Date(this.streamStartTime).toISOString(),
                                detectionMethod: this._streamTimeDetectionMethod,
                                currentDuration: Math.floor((Date.now() - this.streamStartTime) / 1000)
                            });
                        }
                    }
                }
            }
        };

        // ========== CHAT ==========
        this.eventEmitter.on('chat', (data) => {
            trackEarliestEventTime(data);
            
            const userData = this.extractUserData(data);

            const eventData = {
                username: userData.username,
                nickname: userData.nickname,
                message: data.comment || data.message,
                userId: userData.userId,
                profilePictureUrl: userData.profilePictureUrl,
                teamMemberLevel: userData.teamMemberLevel,
                isModerator: userData.isModerator,
                isSubscriber: userData.isSubscriber,
                timestamp: new Date().toISOString()
            };

            this.handleEvent('chat', eventData);
            this.db.logEvent('chat', eventData.username, eventData);
        });

        // ========== GIFT ==========
        this.eventEmitter.on('gift', (data) => {
            trackEarliestEventTime(data);
            
            // Extract gift data
            const giftData = this.extractGiftData(data);

            // Auto-update gift catalog with received gift data
            if (giftData.giftId && giftData.giftName) {
                // Track this gift in session
                if (!this.sessionGifts.has(giftData.giftId)) {
                    this.sessionGifts.set(giftData.giftId, {
                        id: giftData.giftId,
                        name: giftData.giftName,
                        image_url: giftData.giftPictureUrl,
                        diamond_count: giftData.diamondCount
                    });
                    
                    // Save to database immediately
                    try {
                        this.db.updateGiftCatalog([{
                            id: giftData.giftId,
                            name: giftData.giftName,
                            image_url: giftData.giftPictureUrl,
                            diamond_count: giftData.diamondCount
                        }]);
                        this.logger.info(`✅ [GIFT CATALOG] Added gift to catalog: ${giftData.giftName} (ID: ${giftData.giftId})`);
                    } catch (error) {
                        this.logger.error('Error saving gift to catalog:', error);
                    }
                }
            }

            // If no gift name, try to load from catalog
            if (!giftData.giftName && giftData.giftId) {
                const catalogGift = this.db.getGift(giftData.giftId);
                if (catalogGift) {
                    giftData.giftName = catalogGift.name;
                    if (!giftData.diamondCount && catalogGift.diamond_count) {
                        giftData.diamondCount = catalogGift.diamond_count;
                    }
                }
            }

            // Calculate coins: diamond_count * repeat_count
            const repeatCount = giftData.repeatCount;
            const diamondCount = giftData.diamondCount;
            let coins = 0;

            if (diamondCount > 0) {
                coins = diamondCount * repeatCount;
            }

            this.logger.info(`🎁 [GIFT] ${giftData.giftName}: diamondCount=${diamondCount}, repeatCount=${repeatCount}, coins=${coins}, giftType=${giftData.giftType}, repeatEnd=${giftData.repeatEnd}`);

            // Check if streak ended
            const isStreakEnd = giftData.repeatEnd;
            const isStreakable = giftData.giftType === 1;
            
            // Determine if this gift event should be emitted
            // Non-streakable gifts (giftType !== 1) are always emitted
            // Streakable gifts (giftType === 1) are only emitted when the streak ends
            const shouldEmitGift = !isStreakable || (isStreakable && isStreakEnd);

            // Log gift processing decision for debugging duplicate detection
            this.logger.debug(`[GIFT FILTER] ${giftData.giftName}: streakable=${isStreakable}, streakEnd=${isStreakEnd}, willEmit=${shouldEmitGift}`);

            // Only count if not streakable OR streakable and streak ended
            if (shouldEmitGift) {
                this.stats.totalCoins += coins;
                this.stats.gifts++;

                const userData = this.extractUserData(data);
                const eventData = {
                    uniqueId: userData.username,
                    username: userData.username,
                    nickname: userData.nickname,
                    userId: userData.userId,
                    giftName: giftData.giftName,
                    giftId: giftData.giftId,
                    giftPictureUrl: giftData.giftPictureUrl,
                    repeatCount: repeatCount,
                    diamondCount: diamondCount,
                    coins: coins,
                    totalCoins: this.stats.totalCoins,
                    isStreakEnd: isStreakEnd,
                    giftType: giftData.giftType,
                    teamMemberLevel: userData.teamMemberLevel,
                    isModerator: userData.isModerator,
                    isSubscriber: userData.isSubscriber,
                    timestamp: new Date().toISOString()
                };

                this.logger.info(`✅ [GIFT COUNTED] Total coins now: ${this.stats.totalCoins}`);

                this.handleEvent('gift', eventData);
                this.db.logEvent('gift', eventData.username, eventData);
                this.broadcastStats();
            } else {
                this.logger.info(`⏳ [STREAK RUNNING] ${giftData.giftName || 'Unknown Gift'} x${repeatCount} (${coins} coins, not counted yet)`);
            }
        });

        // ========== FOLLOW (via WebcastSocialMessage) ==========
        this.eventEmitter.on('social', (data) => {
            trackEarliestEventTime(data);
            
            // Social events can be follow (action=1) or share (action=2)
            // The EulerStream SDK returns action as a string ("1", "2"), not a number
            // We need to handle both string and number comparisons for robustness
            
            // Normalize action value to handle both string and number types
            const actionValue = parseInt(data.action, 10);
            
            // displayType can be at top level (legacy) or nested in common.displayText.displayType
            const displayType = data.displayType || data.common?.displayText?.displayType || '';
            
            // Check displayType patterns for follow detection
            const hasFollowDisplayType = displayType && typeof displayType === 'string' && (
                displayType === 'pm_main_follow_message_viewer_2' ||
                displayType === 'pm_mt_guidance_viewer_follow' ||
                displayType.includes('_follow') ||
                displayType.includes('follow_message') ||
                displayType.includes('follow_viewer')
            );
            
            // Detect follow events:
            // - action === 1 (primary detection method)
            // - displayType patterns as fallback
            // Note: Using Boolean() to ensure proper boolean result since hasFollowDisplayType
            // can be an empty string when displayType is empty (JavaScript short-circuit)
            const isFollow = actionValue === 1 || Boolean(hasFollowDisplayType);
            
            // Detect share events from social message (action === 2)
            // Note: Shares can also come from WebcastShareMessage (separate event handler)
            const isShare = actionValue === 2;
            
            if (isFollow) {
                this.stats.followers++;

                const userData = this.extractUserData(data);
                const eventData = {
                    username: userData.username,
                    nickname: userData.nickname,
                    userId: userData.userId,
                    profilePictureUrl: userData.profilePictureUrl,
                    teamMemberLevel: userData.teamMemberLevel,
                    isModerator: userData.isModerator,
                    isSubscriber: userData.isSubscriber,
                    timestamp: new Date().toISOString()
                };

                this.logger.info(`👤 [FOLLOW] New follower: ${eventData.username || eventData.nickname}`);
                this.handleEvent('follow', eventData);
                this.db.logEvent('follow', eventData.username, eventData);
                this.broadcastStats();
            } else if (isShare) {
                // Handle share events from WebcastSocialMessage (action === 2)
                this.stats.shares++;

                const userData = this.extractUserData(data);
                const eventData = {
                    username: userData.username,
                    nickname: userData.nickname,
                    userId: userData.userId,
                    profilePictureUrl: userData.profilePictureUrl,
                    teamMemberLevel: userData.teamMemberLevel,
                    isModerator: userData.isModerator,
                    isSubscriber: userData.isSubscriber,
                    timestamp: new Date().toISOString()
                };

                this.logger.info(`📢 [SHARE] User shared stream: ${eventData.username || eventData.nickname}`);
                this.handleEvent('share', eventData);
                this.db.logEvent('share', eventData.username, eventData);
                this.broadcastStats();
            } else {
                // Log unrecognized social event types for debugging
                this.logger.debug(`Unrecognized social event type: displayType="${displayType}", action=${data.action} (parsed: ${actionValue})`);
            }
        });

        // ========== SHARE ==========
        this.eventEmitter.on('share', (data) => {
            trackEarliestEventTime(data);
            this.stats.shares++;

            const userData = this.extractUserData(data);
            const eventData = {
                username: userData.username,
                nickname: userData.nickname,
                userId: userData.userId,
                profilePictureUrl: userData.profilePictureUrl,
                teamMemberLevel: userData.teamMemberLevel,
                isModerator: userData.isModerator,
                isSubscriber: userData.isSubscriber,
                timestamp: new Date().toISOString()
            };

            this.handleEvent('share', eventData);
            this.db.logEvent('share', eventData.username, eventData);
            this.broadcastStats();
        });

        // ========== LIKE ==========
        this.eventEmitter.on('like', (data) => {
            trackEarliestEventTime(data);
            
            // Extract like count
            let totalLikes = null;
            const possibleTotalProps = [
                'totalLikes',
                'total_like_count',
                'totalLikeCount',
                'total',
                'total_likes'
            ];

            for (const prop of possibleTotalProps) {
                const value = data[prop];
                if (typeof value === 'number' && value >= 0) {
                    totalLikes = value;
                    break;
                }
            }

            const likeCount = data.likeCount || data.count || data.like_count || 1;

            this.logger.info(`💗 [LIKE EVENT] likeCount=${likeCount}, totalLikes=${totalLikes}`);

            // If totalLikes found, use it directly (Eulerstream API provides actual total like count)
            if (totalLikes !== null) {
                this.stats.likes = totalLikes;
                this.logger.info(`💗 [LIKE EVENT] Set totalLikes: ${this.stats.likes}`);
            } else {
                // Fallback: increment based on likeCount (individual event count, not in tens)
                // Note: likeCount represents individual likes in this event (typically 1), not cumulative
                this.stats.likes += likeCount;
            }

            const userData = this.extractUserData(data);
            const eventData = {
                username: userData.username,
                nickname: userData.nickname,
                userId: userData.userId,
                profilePictureUrl: userData.profilePictureUrl,
                likeCount: likeCount,
                totalLikes: this.stats.likes,
                teamMemberLevel: userData.teamMemberLevel,
                isModerator: userData.isModerator,
                isSubscriber: userData.isSubscriber,
                timestamp: new Date().toISOString()
            };

            this.handleEvent('like', eventData);
            this.db.logEvent('like', eventData.username, eventData);
            this.broadcastStats();
        });

        // ========== VIEWER COUNT ==========
        this.eventEmitter.on('roomUser', (data) => {
            trackEarliestEventTime(data);
            this.stats.viewers = data.viewerCount || 0;
            this.broadcastStats();
            
            // Emit viewerChange event for IFTTT engine
            this.emit('viewerChange', {
                viewerCount: data.viewerCount || 0,
                timestamp: new Date().toISOString()
            });
        });

        // ========== SUBSCRIBE ==========
        this.eventEmitter.on('subscribe', (data) => {
            trackEarliestEventTime(data);
            
            const userData = this.extractUserData(data);
            const eventData = {
                username: userData.username,
                nickname: userData.nickname,
                userId: userData.userId,
                profilePictureUrl: userData.profilePictureUrl,
                teamMemberLevel: userData.teamMemberLevel,
                isModerator: userData.isModerator,
                isSubscriber: userData.isSubscriber,
                timestamp: new Date().toISOString()
            };

            this.handleEvent('subscribe', eventData);
            this.db.logEvent('subscribe', eventData.username, eventData);
        });

        // ========== MEMBER (JOIN) ==========
        this.eventEmitter.on('member', (data) => {
            trackEarliestEventTime(data);
            
            const userData = this.extractUserData(data);
            const eventData = {
                uniqueId: userData.username,
                username: userData.username,
                nickname: userData.nickname,
                userId: userData.userId,
                profilePictureUrl: userData.profilePictureUrl,
                teamMemberLevel: userData.teamMemberLevel,
                isModerator: userData.isModerator,
                isSubscriber: userData.isSubscriber,
                timestamp: new Date().toISOString()
            };

            this.logger.info(`👋 User joined: ${userData.username || userData.nickname}`);
            
            this.handleEvent('join', eventData);
            this.db.logEvent('join', eventData.username, eventData);
        });
    }

    /**
     * Extract profile picture URL from TikTok user object
     * TikTok can provide profile pictures in different formats:
     * - As a string URL (legacy)
     * - As an object with url array field (current format from Eulerstream)
     * @private
     */
    extractProfilePictureUrl(user) {
        if (!user) return '';

        // Try various fields that might contain the profile picture
        const pictureData = user.profilePictureUrl || user.profilePicture || user.avatarThumb || user.avatarLarger || user.avatarUrl;
        
        if (!pictureData) return '';

        // If it's already a string URL, return it
        if (typeof pictureData === 'string') {
            return pictureData;
        }

        // If it's an object with url array (Eulerstream format), extract the first URL
        if (pictureData.url && Array.isArray(pictureData.url) && pictureData.url.length > 0) {
            return pictureData.url[0];
        }

        // If it's an object with urlList array (alternative format)
        if (pictureData.urlList && Array.isArray(pictureData.urlList) && pictureData.urlList.length > 0) {
            return pictureData.urlList[0];
        }

        return '';
    }

    /**
     * Extract user data from event
     * @private
     */
    extractUserData(data) {
        const user = data.user || data;

        // Extract team member level from various sources
        let teamMemberLevel = 0;
        
        // Check if user is moderator (highest priority - level 10)
        if (data.userIdentity?.isModeratorOfAnchor) {
            teamMemberLevel = 10;
        }
        // Check direct teamMemberLevel on data (from pre-processed events)
        else if (data.teamMemberLevel !== undefined && data.teamMemberLevel > 0) {
            teamMemberLevel = data.teamMemberLevel;
        }
        // Check user object teamMemberLevel
        else if (user.teamMemberLevel !== undefined && user.teamMemberLevel > 0) {
            teamMemberLevel = user.teamMemberLevel;
        }
        // Check fans club level (multiple possible paths)
        else if (user.fansClub?.data?.level) {
            teamMemberLevel = user.fansClub.data.level;
        }
        else if (user.fansClub?.level) {
            teamMemberLevel = user.fansClub.level;
        }
        else if (data.fansClub?.data?.level) {
            teamMemberLevel = data.fansClub.data.level;
        }
        else if (data.fansClub?.level) {
            teamMemberLevel = data.fansClub.level;
        }
        // Check if subscriber (minimum level 1)
        else if (data.userIdentity?.isSubscriberOfAnchor) {
            teamMemberLevel = 1;
        }

        const extractedData = {
            username: user.uniqueId || user.username || null,
            nickname: user.nickname || user.displayName || null,
            userId: user.userId || user.id || null,
            profilePictureUrl: this.extractProfilePictureUrl(user),
            teamMemberLevel: teamMemberLevel,
            isModerator: data.userIdentity?.isModeratorOfAnchor || false,
            isSubscriber: data.userIdentity?.isSubscriberOfAnchor || false
        };

        if (!extractedData.username && !extractedData.nickname) {
            this.logger.warn('⚠️ No user data found in event. Event structure:', {
                hasUser: !!data.user,
                hasUniqueId: !!data.uniqueId,
                hasUsername: !!data.username,
                hasNickname: !!data.nickname,
                keys: Object.keys(data).slice(0, 10)
            });
        }

        return extractedData;
    }

    /**
     * Extract gift data from event
     * @private
     */
    extractGiftData(data) {
        const gift = data.gift || data;

        const extractedData = {
            giftName: gift.name || gift.giftName || gift.gift_name || null,
            giftId: gift.id || gift.giftId || gift.gift_id || null,
            giftPictureUrl: gift.image?.url_list?.[0] || gift.image?.url || gift.giftPictureUrl || gift.picture_url || null,
            diamondCount: gift.diamond_count || gift.diamondCount || gift.diamonds || 0,
            repeatCount: data.repeatCount || data.repeat_count || 1,
            giftType: data.giftType || data.gift_type || 0,
            repeatEnd: data.repeatEnd || data.repeat_end || false
        };

        if (!extractedData.giftName && !extractedData.giftId) {
            this.logger.warn('⚠️ No gift data found in event. Event structure:', {
                hasGift: !!data.gift,
                hasGiftName: !!(data.giftName || data.name),
                hasGiftId: !!(data.giftId || data.id),
                hasDiamondCount: !!(data.diamondCount || data.diamond_count),
                keys: Object.keys(data).slice(0, 15)
            });
        }

        return extractedData;
    }

    /**
     * Extract stream start time from roomInfo data
     * Tries multiple possible field names and handles different timestamp formats
     * @private
     * @param {object} roomInfo - Room information data from TikTok
     * @returns {number} Stream start time in milliseconds
     */
    _extractStreamStartTime(roomInfo) {
        if (!roomInfo) {
            // If we have an earliest event time, use that
            if (this._earliestEventTime) {
                return this._earliestEventTime;
            }
            // Otherwise use current time as fallback
            return Date.now();
        }

        let timestamp = null;
        let detectionMethod = '';
        
        // Strategy 1: Try to find timestamp in various direct fields
        // Priority order: start_time > createTime > startTime > create_time > finish_time
        if (roomInfo.start_time !== undefined) {
            timestamp = roomInfo.start_time;
            detectionMethod = 'start_time';
        } else if (roomInfo.createTime !== undefined) {
            timestamp = roomInfo.createTime;
            detectionMethod = 'createTime';
        } else if (roomInfo.startTime !== undefined) {
            timestamp = roomInfo.startTime;
            detectionMethod = 'startTime';
        } else if (roomInfo.create_time !== undefined) {
            timestamp = roomInfo.create_time;
            detectionMethod = 'create_time';
        } else if (roomInfo.finish_time !== undefined) {
            // If we only have finish_time, we can't use it reliably
            timestamp = null;
        }
        
        // Strategy 2: Try nested room object (some Eulerstream responses nest data)
        if ((timestamp === null || timestamp === undefined) && roomInfo.room) {
            if (roomInfo.room.start_time !== undefined) {
                timestamp = roomInfo.room.start_time;
                detectionMethod = 'room.start_time';
            } else if (roomInfo.room.createTime !== undefined) {
                timestamp = roomInfo.room.createTime;
                detectionMethod = 'room.createTime';
            } else if (roomInfo.room.startTime !== undefined) {
                timestamp = roomInfo.room.startTime;
                detectionMethod = 'room.startTime';
            } else if (roomInfo.room.create_time !== undefined) {
                timestamp = roomInfo.room.create_time;
                detectionMethod = 'room.create_time';
            }
        }
        
        // Strategy 3: Calculate from duration field (duration in seconds since stream started)
        if ((timestamp === null || timestamp === undefined) && roomInfo.duration !== undefined) {
            const duration = typeof roomInfo.duration === 'string' ? parseInt(roomInfo.duration, 10) : roomInfo.duration;
            if (!isNaN(duration) && duration > 0) {
                timestamp = Date.now() - (duration * 1000);
                detectionMethod = 'duration (calculated)';
                this.logger.info(`📊 Calculated stream start from duration: ${duration}s ago`);
            }
        }
        
        // Strategy 4: Try streamStartTime or stream_start_time (explicit field)
        if ((timestamp === null || timestamp === undefined) && roomInfo.streamStartTime !== undefined) {
            timestamp = roomInfo.streamStartTime;
            detectionMethod = 'streamStartTime';
        } else if ((timestamp === null || timestamp === undefined) && roomInfo.stream_start_time !== undefined) {
            timestamp = roomInfo.stream_start_time;
            detectionMethod = 'stream_start_time';
        }

        // If no timestamp found, try earliest event time or fallback to now
        if (timestamp === null || timestamp === undefined) {
            this.logger.warn(`⚠️ No stream start time found in roomInfo. Available keys: ${JSON.stringify(Object.keys(roomInfo))}`);
            if (this._earliestEventTime) {
                this.logger.info(`📅 Using earliest event time as fallback: ${new Date(this._earliestEventTime).toISOString()}`);
                return this._earliestEventTime;
            }
            this.logger.warn(`⚠️ No earliest event time available. Using current time as fallback.`);
            return Date.now();
        }

        // Parse timestamp if it's a string
        if (typeof timestamp === 'string') {
            timestamp = parseInt(timestamp, 10);
        }

        // Validate timestamp is a number
        if (isNaN(timestamp) || timestamp <= 0) {
            this.logger.warn(`⚠️ Invalid timestamp value: ${timestamp} (from ${detectionMethod})`);
            if (this._earliestEventTime) {
                return this._earliestEventTime;
            }
            return Date.now();
        }

        // Convert to milliseconds if timestamp is in seconds
        // Unix timestamps in seconds are less than 10 billion (year ~2286)
        // Unix timestamps in milliseconds are greater than that
        if (timestamp < 4000000000) {
            timestamp = timestamp * 1000;
        }

        // Validate timestamp is reasonable (not in the future, not before 2020)
        const now = Date.now();
        const minTime = new Date('2020-01-01').getTime();
        
        if (timestamp > now || timestamp < minTime) {
            this.logger.warn(`⚠️ Invalid timestamp detected: ${timestamp} (${new Date(timestamp).toISOString()}) from ${detectionMethod}. Using fallback.`);
            if (this._earliestEventTime) {
                return this._earliestEventTime;
            }
            return Date.now();
        }

        this.logger.info(`✅ Extracted stream start time from ${detectionMethod}: ${new Date(timestamp).toISOString()}`);
        return timestamp;
    }

    /**
     * Extract initial statistics from roomInfo data
     * Updates stats with current counts (likes, followers, etc.) when available
     * @private
     * @param {object} roomInfo - Room information data from TikTok
     */
    _extractStatsFromRoomInfo(roomInfo) {
        if (!roomInfo) return;

        let statsUpdated = false;

        // Try to extract viewer count
        const viewerFields = ['viewerCount', 'viewer_count', 'userCount', 'user_count'];
        for (const field of viewerFields) {
            const value = roomInfo[field] || roomInfo.room?.[field] || roomInfo.stats?.[field];
            if (typeof value === 'number' && value >= 0) {
                this.stats.viewers = value;
                this.logger.info(`📊 Extracted viewer count from roomInfo.${field}: ${value}`);
                statsUpdated = true;
                break;
            }
        }

        // Try to extract like count
        const likeFields = ['likeCount', 'like_count', 'totalLikeCount', 'total_like_count', 'likes'];
        for (const field of likeFields) {
            const value = roomInfo[field] || roomInfo.room?.[field] || roomInfo.stats?.[field];
            if (typeof value === 'number' && value >= 0) {
                // Use actual like count directly (Eulerstream API provides actual total)
                this.stats.likes = value;
                this.logger.info(`📊 Extracted like count from roomInfo.${field}: ${value}`);
                statsUpdated = true;
                break;
            }
        }

        // Try to extract follower count
        const followerFields = ['followerCount', 'follower_count', 'totalFollowerCount', 'total_follower_count', 'followers'];
        for (const field of followerFields) {
            const value = roomInfo[field] || roomInfo.owner?.[field] || roomInfo.room?.owner?.[field] || roomInfo.stats?.[field];
            if (typeof value === 'number' && value >= 0) {
                this.stats.followers = value;
                this.logger.info(`📊 Extracted follower count from roomInfo.${field}: ${value}`);
                statsUpdated = true;
                break;
            }
        }

        // Try to extract total coins/gifts count
        const coinFields = ['totalCoins', 'total_coins', 'coins', 'giftCoins', 'gift_coins'];
        for (const field of coinFields) {
            const value = roomInfo[field] || roomInfo.room?.[field] || roomInfo.stats?.[field];
            if (typeof value === 'number' && value >= 0) {
                this.stats.totalCoins = value;
                this.logger.info(`📊 Extracted coin count from roomInfo.${field}: ${value}`);
                statsUpdated = true;
                break;
            }
        }

        // Try to extract gift count
        const giftFields = ['giftCount', 'gift_count', 'totalGifts', 'total_gifts', 'gifts'];
        for (const field of giftFields) {
            const value = roomInfo[field] || roomInfo.room?.[field] || roomInfo.stats?.[field];
            if (typeof value === 'number' && value >= 0) {
                this.stats.gifts = value;
                this.logger.info(`📊 Extracted gift count from roomInfo.${field}: ${value}`);
                statsUpdated = true;
                break;
            }
        }

        // Log roomInfo structure for debugging if no stats were found
        if (!statsUpdated) {
            this.logger.info(`📊 No initial stats found in roomInfo. Available top-level keys: ${JSON.stringify(Object.keys(roomInfo))}`);
            if (roomInfo.room) {
                this.logger.info(`📊 Available room keys: ${JSON.stringify(Object.keys(roomInfo.room))}`);
            }
            if (roomInfo.stats) {
                this.logger.info(`📊 Available stats keys: ${JSON.stringify(Object.keys(roomInfo.stats))}`);
            }
        } else {
            // Broadcast updated stats
            this.broadcastStats();
        }
    }

    /**
     * Analyze connection error and provide user-friendly message
     * @private
     */
    _analyzeError(error) {
        const errorMessage = error.message || error.toString();

        // SIGI_STATE / TikTok blocking errors
        if (errorMessage.includes('SIGI_STATE') || 
            errorMessage.includes('blocked by TikTok')) {
            return {
                type: 'BLOCKED_BY_TIKTOK',
                message: 'Möglicherweise von TikTok blockiert. SIGI_STATE konnte nicht extrahiert werden.',
                suggestion: 'NICHT SOFORT ERNEUT VERSUCHEN - Warte mindestens 30-60 Minuten bevor du es erneut versuchst.',
                retryable: false
            };
        }

        // Sign API 401 errors (invalid API key)
        if (errorMessage.includes('401') && 
            (errorMessage.includes('Sign Error') || errorMessage.includes('API Key is invalid'))) {
            return {
                type: 'SIGN_API_INVALID_KEY',
                message: 'Sign API Fehler 401 - Der API-Schlüssel ist ungültig',
                suggestion: 'Prüfe deinen Eulerstream API-Schlüssel auf https://www.eulerstream.com',
                retryable: false
            };
        }

        // Sign API 504 Gateway Timeout
        if (errorMessage.includes('504')) {
            return {
                type: 'SIGN_API_GATEWAY_TIMEOUT',
                message: '504 Gateway Timeout - Eulerstream Sign API ist überlastet oder nicht erreichbar',
                suggestion: 'Warte 2-5 Minuten und versuche es dann erneut',
                retryable: true
            };
        }

        // Sign API 500 errors
        if (errorMessage.includes('500') && errorMessage.includes('Sign Error')) {
            return {
                type: 'SIGN_API_ERROR',
                message: '500 Internal Server Error - Eulerstream Sign API Problem',
                suggestion: 'Warte 1-2 Minuten und versuche es dann erneut',
                retryable: true
            };
        }

        // Room ID / User not live errors
        if (errorMessage.includes('Failed to retrieve Room ID')) {
            return {
                type: 'ROOM_NOT_FOUND',
                message: 'Raum-ID konnte nicht abgerufen werden - Benutzer existiert nicht oder ist nicht live',
                suggestion: 'Prüfe ob der Benutzername korrekt ist und der Benutzer gerade live ist',
                retryable: false
            };
        }

        // User not live or room not found (Eulerstream errors)
        if (errorMessage.includes('LIVE_NOT_FOUND') || 
            errorMessage.includes('not live') ||
            errorMessage.includes('room id') ||
            errorMessage.includes('Room ID')) {
            return {
                type: 'NOT_LIVE',
                message: 'User is not currently live or username is incorrect',
                suggestion: 'Verify the username is correct and the user is streaming on TikTok',
                retryable: false
            };
        }

        // Timeout errors
        if (errorMessage.includes('Verbindungs-Timeout') || 
            errorMessage.includes('Connection timeout') ||
            errorMessage.includes('timeout') || 
            errorMessage.includes('TIMEOUT') ||
            errorMessage.includes('ECONNABORTED') ||
            errorMessage.includes('ETIMEDOUT')) {
            return {
                type: 'CONNECTION_TIMEOUT',
                message: 'Verbindungs-Timeout - Server hat nicht rechtzeitig geantwortet',
                suggestion: 'Prüfe deine Internetverbindung. Falls das Problem weiterhin besteht, könnte der Eulerstream-Server langsam oder nicht erreichbar sein',
                retryable: true
            };
        }

        // WebSocket close codes
        if (errorMessage.includes('WebSocket')) {
            return {
                type: 'WEBSOCKET_ERROR',
                message: errorMessage,
                suggestion: 'Check Eulerstream API key and connection settings',
                retryable: true
            };
        }

        // API key errors (general)
        if (errorMessage.includes('API key') || 
            errorMessage.includes('403')) {
            return {
                type: 'API_KEY_ERROR',
                message: 'Invalid or missing Eulerstream API key',
                suggestion: 'Check your Eulerstream API key at https://www.eulerstream.com or set tiktok_euler_api_key in settings',
                retryable: false
            };
        }

        // Network connection errors
        if (errorMessage.includes('ECONNREFUSED') || 
            errorMessage.includes('ENOTFOUND') ||
            errorMessage.includes('network')) {
            return {
                type: 'NETWORK_ERROR',
                message: 'Network error - cannot reach Eulerstream servers',
                suggestion: 'Check your internet connection and firewall settings',
                retryable: true
            };
        }

        // Generic error
        return {
            type: 'UNKNOWN_ERROR',
            message: errorMessage,
            suggestion: 'Check the console logs for more details. If the problem persists, report this error',
            retryable: true
        };
    }

    /**
     * Public method for analyzing connection errors (for testing)
     * @param {Error} error - The error to analyze
     * @returns {Object} Error analysis result
     */
    analyzeConnectionError(error) {
        return this._analyzeError(error);
    }

    /**
     * Log connection attempt for diagnostics
     * @private
     */
    _logConnectionAttempt(username, success, errorType, errorMessage) {
        const attempt = {
            timestamp: new Date().toISOString(),
            username,
            success,
            errorType,
            errorMessage
        };

        this.connectionAttempts.unshift(attempt);
        
        if (this.connectionAttempts.length > this.maxAttempts) {
            this.connectionAttempts = this.connectionAttempts.slice(0, this.maxAttempts);
        }
    }

    disconnect() {
        if (this.ws) {
            this.ws.removeAllListeners();
            if (typeof this.ws.close === 'function') {
                this.ws.close();
            }
            this.ws = null;
        }
        if (this.eventEmitter) {
            this.eventEmitter.removeAllListeners();
            this.eventEmitter = null;
        }
        this.isConnected = false;
        
        const previousUsername = this.currentUsername;
        this.currentUsername = null;

        // Clear duration tracking interval but preserve stream start time
        if (this.durationInterval) {
            clearInterval(this.durationInterval);
            this.durationInterval = null;
        }
        
        if (previousUsername) {
            this.logger.info(`🔄 Disconnected but preserving stream start time for potential reconnection to @${previousUsername}`);
        } else {
            this.streamStartTime = null;
            this._persistedStreamStart = null;
            this._earliestEventTime = null;
        }

        // Clear event deduplication cache on disconnect
        this.processedEvents.clear();
        this.logger.info('🧹 Event deduplication cache cleared');

        this.resetStats();
        this.broadcastStatus('disconnected');
        this.logger.info('⚫ Disconnected from TikTok LIVE');
    }

    /**
     * Generate unique event hash for deduplication
     * @private
     */
    _generateEventHash(eventType, data) {
        const components = [eventType];
        
        if (data.userId) components.push(data.userId);
        if (data.uniqueId) components.push(data.uniqueId);
        if (data.username) components.push(data.username);
        
        switch (eventType) {
            case 'chat':
                if (data.message) components.push(data.message);
                if (data.comment) components.push(data.comment);
                if (data.timestamp) {
                    const roundedTime = Math.floor(new Date(data.timestamp).getTime() / 1000);
                    components.push(roundedTime.toString());
                }
                break;
            case 'gift':
                if (data.giftId) components.push(data.giftId.toString());
                if (data.giftName) components.push(data.giftName);
                // For gift events, use coins instead of repeatCount to better handle streak updates
                // Coins = diamondCount * repeatCount, so it's more unique
                if (data.coins) components.push(data.coins.toString());
                // Also include repeatCount as fallback if coins is not available
                else if (data.repeatCount) components.push(data.repeatCount.toString());
                // Include timestamp rounded to nearest second to catch near-duplicate events
                // but allow legitimate streak updates
                if (data.timestamp) {
                    try {
                        const roundedTime = Math.floor(new Date(data.timestamp).getTime() / 1000);
                        if (!isNaN(roundedTime)) {
                            components.push(roundedTime.toString());
                        }
                    } catch (error) {
                        // Ignore invalid timestamps - hash will work without timestamp component
                        this.logger.debug(`[HASH] Invalid timestamp in gift event: ${data.timestamp}`);
                    }
                }
                break;
            case 'like':
                // Include likeCount and totalLikes to prevent incorrect deduplication
                // Each like event should be unique based on the like count values
                if (data.likeCount) components.push(data.likeCount.toString());
                if (data.totalLikes) components.push(data.totalLikes.toString());
                if (data.timestamp) {
                    const roundedTime = Math.floor(new Date(data.timestamp).getTime() / 1000);
                    components.push(roundedTime.toString());
                }
                break;
            case 'follow':
            case 'share':
            case 'subscribe':
            case 'join':
                if (data.timestamp) {
                    const roundedTime = Math.floor(new Date(data.timestamp).getTime() / 1000);
                    components.push(roundedTime.toString());
                }
                break;
        }
        
        return components.join('|');
    }

    /**
     * Check if event has already been processed
     * @private
     */
    _isDuplicateEvent(eventType, data) {
        const eventHash = this._generateEventHash(eventType, data);
        const now = Date.now();
        
        // Clean up expired events
        for (const [hash, timestamp] of this.processedEvents.entries()) {
            if (now - timestamp > this.eventExpirationMs) {
                this.processedEvents.delete(hash);
            }
        }
        
        if (this.processedEvents.has(eventHash)) {
            this.logger.info(`🔄 [DUPLICATE BLOCKED] ${eventType} event already processed: ${eventHash}`);
            return true;
        }
        
        this.processedEvents.set(eventHash, now);
        
        if (this.processedEvents.size > this.maxProcessedEvents) {
            const firstKey = this.processedEvents.keys().next().value;
            this.processedEvents.delete(firstKey);
        }
        
        return false;
    }

    handleEvent(eventType, data) {
        // Check for duplicate events
        if (this._isDuplicateEvent(eventType, data)) {
            this.logger.info(`⚠️  Duplicate ${eventType} event ignored`);
            return;
        }

        // Forward event to server modules
        this.emit(eventType, data);

        // Broadcast event to frontend
        this.io.emit('tiktok:event', {
            type: eventType,
            data: data
        });
    }

    broadcastStatus(status, data = {}) {
        this.io.emit('tiktok:status', {
            status,
            username: this.currentUsername,
            ...data
        });
    }

    broadcastStats() {
        const streamDuration = this.streamStartTime 
            ? Math.floor((Date.now() - this.streamStartTime) / 1000)
            : 0;

        this.io.emit('tiktok:stats', {
            ...this.stats,
            streamDuration: streamDuration
        });
    }

    resetStats() {
        this.stats = {
            viewers: 0,
            likes: 0,
            totalCoins: 0,
            followers: 0,
            shares: 0,
            gifts: 0
        };
        this.broadcastStats();
    }

    getStats() {
        return {
            ...this.stats,
            deduplicationCacheSize: this.processedEvents.size
        };
    }

    getDeduplicationStats() {
        return {
            cacheSize: this.processedEvents.size,
            maxCacheSize: this.maxProcessedEvents,
            expirationMs: this.eventExpirationMs
        };
    }

    clearDeduplicationCache() {
        this.processedEvents.clear();
        this.logger.info('🧹 Event deduplication cache manually cleared');
    }

    /**
     * Fetch Room ID from TikTok's HTML page
     * This is required to make API calls to TikTok's Webcast API
     */
    async fetchRoomId(username) {
        const targetUsername = username || this.currentUsername;
        if (!targetUsername) {
            throw new Error('Username is required to fetch room ID');
        }
        
        try {
            this.logger.info(`📡 Fetching room ID for @${targetUsername}...`);
            
            const response = await axios.get(`https://www.tiktok.com/@${targetUsername}/live`, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9'
                }
            });
            
            const html = response.data;
            
            // Try to extract room_id from SIGI_STATE or other embedded data
            const roomIdMatch = html.match(/"roomId":"(\d+)"/);
            if (roomIdMatch && roomIdMatch[1]) {
                this.roomId = roomIdMatch[1];
                this.logger.info(`✅ Found room ID: ${this.roomId}`);
                return this.roomId;
            }
            
            // Alternative pattern
            const altMatch = html.match(/room_id=(\d+)/);
            if (altMatch && altMatch[1]) {
                this.roomId = altMatch[1];
                this.logger.info(`✅ Found room ID: ${this.roomId}`);
                return this.roomId;
            }
            
            this.logger.warn('⚠️  Could not extract room ID from page - user may not be live');
            return null;
            
        } catch (error) {
            this.logger.error('Error fetching room ID:', error.message);
            return null;
        }
    }

    /**
     * Fetch room info from TikTok's Webcast API
     * This includes stream start time, viewer count, and other metadata
     */
    async fetchRoomInfo() {
        if (!this.roomId) {
            this.logger.warn('⚠️  Room ID not available, attempting to fetch...');
            await this.fetchRoomId();
            if (!this.roomId) {
                return null;
            }
        }
        
        try {
            this.logger.info('📋 Fetching room info from TikTok Webcast API...');
            
            const params = new URLSearchParams({
                ...this.webcastApiConfig.params,
                room_id: this.roomId
            });
            
            const url = `${this.webcastApiConfig.baseUrl}/room/info/?${params}`;
            
            const response = await axios.get(url, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://www.tiktok.com/',
                    'Origin': 'https://www.tiktok.com'
                }
            });
            
            if (response.data && response.data.data) {
                const roomData = response.data.data;
                this.logger.info('✅ Room info fetched successfully');
                
                // Extract and set stream start time
                if (roomData.create_time || roomData.start_time) {
                    const timestamp = (roomData.start_time || roomData.create_time) * 1000; // Convert to milliseconds
                    
                    if (!this.streamStartTime || timestamp < this.streamStartTime) {
                        this.streamStartTime = timestamp;
                        this._persistedStreamStart = timestamp;
                        this._streamTimeDetectionMethod = 'TikTok Webcast API (room/info)';
                        
                        this.logger.info(`✅ Stream start time from API: ${new Date(this.streamStartTime).toISOString()}`);
                        
                        // Broadcast updated stream time info
                        if (this.io) {
                            this.io.emit('tiktok:streamTimeInfo', {
                                streamStartTime: this.streamStartTime,
                                streamStartISO: new Date(this.streamStartTime).toISOString(),
                                detectionMethod: this._streamTimeDetectionMethod,
                                currentDuration: Math.floor((Date.now() - this.streamStartTime) / 1000)
                            });
                        }
                    }
                }
                
                return roomData;
            }
            
            return null;
            
        } catch (error) {
            this.logger.error('Error fetching room info:', error.message);
            return null;
        }
    }

    isActive() {
        return this.isConnected;
    }

    async updateGiftCatalog(options = {}) {
        // Fetch gift catalog from TikTok's Webcast API
        // This is the same API that TikTok-Live-Connector uses
        
        // Try to get room ID if we don't have it
        if (!this.roomId && this.currentUsername) {
            await this.fetchRoomId(this.currentUsername);
        }
        
        if (!this.roomId) {
            this.logger.info('ℹ️  Room ID not available. Gift catalog will be built from stream events.');
            
            const catalog = this.db.getGiftCatalog();
            return {
                success: true,
                message: catalog.length > 0 
                    ? `Using existing catalog with ${catalog.length} gifts (automatically updated from stream)`
                    : 'Gift catalog will be built automatically as gifts are received from the stream',
                count: catalog.length,
                catalog: catalog
            };
        }
        
        try {
            this.logger.info('🎁 Fetching gift catalog from TikTok Webcast API...');
            
            const params = new URLSearchParams({
                ...this.webcastApiConfig.params,
                room_id: this.roomId
            });
            
            const url = `${this.webcastApiConfig.baseUrl}/gift/list/?${params}`;
            
            const response = await axios.get(url, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://www.tiktok.com/',
                    'Origin': 'https://www.tiktok.com'
                }
            });
            
            if (response.data && response.data.data && response.data.data.gifts) {
                const gifts = response.data.data.gifts;
                
                // Transform gifts to database format
                const giftsToSave = gifts.map(gift => ({
                    id: gift.id,
                    name: gift.name || `Gift ${gift.id}`,
                    image_url: gift.image?.url_list?.[0] || gift.icon?.url_list?.[0] || null,
                    diamond_count: gift.diamond_count || 0
                }));
                
                // Save to database
                const savedCount = this.db.updateGiftCatalog(giftsToSave);
                
                this.logger.info(`✅ Gift catalog updated with ${savedCount} gifts from TikTok API`);
                
                return {
                    success: true,
                    message: `Gift catalog updated with ${savedCount} gifts from TikTok Webcast API`,
                    count: savedCount,
                    catalog: this.db.getGiftCatalog()
                };
            } else {
                this.logger.warn('⚠️  No gifts data in API response, using existing catalog');
                
                const catalog = this.db.getGiftCatalog();
                return {
                    success: catalog.length > 0,
                    message: catalog.length > 0 
                        ? `Using existing catalog with ${catalog.length} gifts`
                        : 'No gifts available. Gifts will be added automatically from stream.',
                    count: catalog.length,
                    catalog: catalog
                };
            }
            
        } catch (error) {
            this.logger.error('Error fetching gift catalog from TikTok API:', error.message);
            
            // Fallback to current catalog
            const catalog = this.db.getGiftCatalog();
            return {
                success: catalog.length > 0,
                message: catalog.length > 0 
                    ? `API fetch failed. Using existing catalog with ${catalog.length} gifts`
                    : `API fetch failed: ${error.message}. Gifts will be added automatically from stream.`,
                count: catalog.length,
                catalog: catalog
            };
        }
    }

    getGiftCatalog() {
        return this.db.getGiftCatalog();
    }
    
    /**
     * Get Euler API key configuration information
     * @returns {Object} Object with activeKey, activeSource, and configured flag
     */
    getEulerApiKeyInfo() {
        let activeKey = null;
        let activeSource = null;
        
        // Check database setting first
        const dbKey = this.db.getSetting('tiktok_euler_api_key');
        if (dbKey) {
            activeKey = dbKey;
            activeSource = 'Database Setting';
        } else if (process.env.EULER_API_KEY) {
            activeKey = process.env.EULER_API_KEY;
            activeSource = 'Environment Variable (EULER_API_KEY)';
        } else if (process.env.SIGN_API_KEY) {
            activeKey = process.env.SIGN_API_KEY;
            activeSource = 'Environment Variable (SIGN_API_KEY)';
        } else if (FALLBACK_API_KEY) {
            activeKey = FALLBACK_API_KEY;
            activeSource = 'Fallback Key';
        }
        
        // Mask the key for security - only show first 8 and last 4 chars
        let maskedKey = null;
        if (activeKey) {
            if (activeKey.length >= 12) {
                maskedKey = `${activeKey.substring(0, 8)}...${activeKey.substring(activeKey.length - 4)}`;
            } else if (activeKey.length >= 8) {
                maskedKey = `${activeKey.substring(0, 4)}...${activeKey.substring(activeKey.length - 2)}`;
            } else {
                maskedKey = '***'; // Key too short, just show asterisks
            }
        }
        
        return {
            activeKey: maskedKey,
            activeSource: activeSource,
            configured: !!activeKey
        };
    }
    
    async runDiagnostics(username) {
        const testUsername = username || this.currentUsername || 'tiktok';
        const keyInfo = this.getEulerApiKeyInfo();
        
        // Test TikTok API reachability
        let tiktokApiTest = { success: false, error: null, responseTime: null };
        try {
            const startTime = Date.now();
            const response = await axios.get('https://www.tiktok.com', { 
                timeout: 5000,
                validateStatus: () => true // Accept any status code
            });
            // Success means the site is reachable and responding
            // 200-399: Normal responses, 400-499: Client errors (site is up, we just don't have valid credentials/path)
            // Only 500+ indicates potential server issues
            tiktokApiTest.success = response.status >= 200 && response.status < 500;
            tiktokApiTest.responseTime = Date.now() - startTime;
        } catch (error) {
            tiktokApiTest.error = error.message;
        }
        
        // Test Euler API connectivity (basic health check)
        let eulerWebSocketTest = { success: false, error: null, responseTime: null };
        if (keyInfo.configured) {
            try {
                const startTime = Date.now();
                // Test the main Eulerstream website to verify basic connectivity
                // Note: This doesn't test WebSocket functionality, just if the service is reachable
                const response = await axios.get('https://eulerstream.com', { 
                    timeout: 5000,
                    validateStatus: () => true
                });
                // Success means the service is reachable and responding
                // 200-399: Normal responses, 400-499: Client errors (service is up)
                // Only 500+ indicates potential server issues
                eulerWebSocketTest.success = response.status >= 200 && response.status < 500;
                eulerWebSocketTest.responseTime = Date.now() - startTime;
            } catch (error) {
                eulerWebSocketTest.error = error.message;
            }
        } else {
            eulerWebSocketTest.error = 'No API key configured';
        }
        
        // Get connection configuration
        const connectionConfig = {
            enableEulerFallbacks: !!FALLBACK_API_KEY,
            connectWithUniqueId: this.db.getSetting('tiktok_connect_with_unique_id') !== false,
            connectionTimeout: 30000
        };
        
        return {
            timestamp: new Date().toISOString(),
            eulerApiKey: keyInfo,
            tiktokApi: tiktokApiTest,
            eulerWebSocket: eulerWebSocketTest,
            connectionConfig: connectionConfig,
            connection: {
                isConnected: this.isConnected,
                currentUsername: this.currentUsername,
                autoReconnectCount: this.autoReconnectCount,
                maxAutoReconnects: this.maxAutoReconnects,
                method: 'Eulerstream WebSocket API'
            },
            configuration: {
                apiKeyConfigured: keyInfo.configured
            },
            recentAttempts: this.connectionAttempts.slice(0, 5),
            stats: this.stats
        };
    }
    
    async getConnectionHealth() {
        const recentFailures = this.connectionAttempts.filter(a => !a.success).length;
        const keyInfo = this.getEulerApiKeyInfo();
        
        let status = 'healthy';
        let message = 'Connection ready';
        
        if (!this.isConnected && this.currentUsername) {
            status = 'disconnected';
            message = 'Not connected';
        } else if (recentFailures >= 3) {
            status = 'degraded';
            message = `${recentFailures} recent failures`;
        } else if (recentFailures >= 5) {
            status = 'critical';
            message = 'Repeated connection errors';
        }
        
        return {
            status,
            message,
            isConnected: this.isConnected,
            currentUsername: this.currentUsername,
            recentAttempts: this.connectionAttempts.slice(0, 5),
            autoReconnectCount: this.autoReconnectCount,
            eulerKeyConfigured: keyInfo.configured,
            eulerKeySource: keyInfo.activeSource || 'Not configured'
        };
    }
}

module.exports = TikTokConnector;
