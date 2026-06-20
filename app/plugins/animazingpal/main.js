/**
 * AnimazingPal Plugin
 * Integration with Animaze API for VTuber avatar control via TikTok LIVE events
 * 
 * Based on the official Animaze API documentation.
 * WebSocket connection to ws://localhost:9000 (default)
 * 
 * Architecture:
 * - Memory Database (Nervous System) - stores all experiences & memories per streamer
 * - Vector Memory (Synapses) - links related memories semantically  
 * - GPT Brain (Cerebral Cortex) - intelligent response generation with personality
 * - Animaze (Body/Voice) - avatar expression output
 * 
 * The brain behaves like a digital human:
 * - Decides autonomously when to speak
 * - Processes all stream events and determines relevance
 * - Maintains long-term memories per streamer profile
 * - Supports multiple languages for personalities
 */

const WebSocket = require('ws');
const path = require('path');
const BrainEngine = require('./brain/brain-engine');
const {
  buildLiveHostDefaults,
  normalizeLiveHostConfig,
  sanitizeLiveHostConfig,
  mergeLiveHostSecrets,
  applyLiveHostPreset
} = require('./brain/live-host-config');
const {
  createPlatformAdapter,
  getPlatformDefinition,
  listPlatformDefinitions
} = require('./platforms');
const { listAudioOutputDevices } = require('./brain/audio-devices');
const EventDeduper = require('./brain/event-deduper');
const SpeechState = require('./brain/speech-state');

class AnimazingPalPlugin {
  constructor(api) {
    this.api = api;
    this.io = api.getSocketIO();
    this.db = api.getDatabase();
    
    // WebSocket connection to Animaze
    this.ws = null;
    this.isConnected = false;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    
    // Brain Engine - AI Intelligence System
    this.brainEngine = null;
    this.liveHostEventDeduper = new EventDeduper({ ttl: 120, maxSize: 5000 });
    this.liveHostResponseTimes = [];
    this.liveHostDiagnostics = {
      dedupedEvents: 0,
      rateLimitedResponses: 0,
      lastDedupedSignature: null,
      lastRateLimitedAt: null,
      lastMovementTest: null,
      lastIdleMotion: null,
      lastTtsProbe: null,
      lastSourceEventAt: null,
      lastSourceEventType: null,
      lastEventResult: null,
      processedEvents: 0,
      respondedEvents: 0,
      skippedEvents: 0,
      idleMotionSkipped: 0
    };
    this.liveHostIdleMotionTimer = null;
    this.liveHostLastAvatarActionAt = 0;
    this.liveHostIdleMotionSequence = 0;
    this.liveHostBrowserHeartbeat = null;
    this.liveHostSourceWatchdogTimer = null;
    this.liveHostSourceReconnectInFlight = false;
    this.liveHostSourceStatus = {
      lastCheckedAt: null,
      lastReconnectAt: null,
      lastReconnectError: null,
      reconnectAttempts: 0
    };
    this.speechState = new SpeechState();

    // Avatar platform registry
    this.platformAdapter = null;
    
    // Configuration
    this.config = null;
    
    // Animaze data cache (populated after connection)
    this.animazeData = {
      avatars: [],
      scenes: [],
      emotes: [],
      specialActions: [],
      poses: [],
      idleAnims: [],
      currentAvatar: null,
      currentScene: null
    };
    
    // Pending request callbacks for async responses
    this.pendingRequests = new Map();
    this.requestIdCounter = 0;
    
    // Available override behaviors
    this.overrideBehaviors = [
      'Follow Mouse Cursor',
      'Mouse Keyboard Behavior',
      'Tracked Blinking',
      'Auto Blink',
      'Look At Camera',
      'Look At Camera Head',
      'Cross Eyes',
      'Pupil Behavior',
      'Forced Symmetry Eyebrows',
      'Forced Symmetry Eyelids',
      'Forced Symmetry Mouth',
      'Enhanced Body Movement 2D',
      'Enhanced Body Movement 3D',
      'Extreme Head Angles Attenuation',
      'Sound to Mouth Open',
      'Alternate lipsync Retargeting',
      'Idle Intensity',
      'Inferred Body Yaw Movement',
      'Breathing Behavior'
    ];
    
    // Rate limiting for event triggers
    this.lastEventTimes = new Map();
    this.eventCooldowns = this.getDefaultEventCooldowns();

    // Viewerbase sync state
    this.viewerbaseSyncTimer = null;
    this.viewerbaseSyncPending = null;
    this.viewerbaseSyncInFlight = false;
    this.viewerbaseSyncState = {
      lastSyncAt: null,
      lastStatus: 'idle',
      lastError: null,
      lastReason: null,
      queueLength: 0
    };
  }

  async init() {
    this.api.log('Initializing AnimazingPal Plugin...', 'info');
    
    // Load configuration
    this.config = this.normalizeConfig(this.api.getConfig('config') || this.getDefaultConfig());
    this.maxReconnectAttempts = this.config.maxReconnectAttempts;
    this.refreshEventCooldowns();
    this.platformAdapter = this.getActivePlatformAdapter();
    
    // Initialize Brain Engine with robust error handling
    try {
      this.brainEngine = new BrainEngine(this.api);
      await this.brainEngine.initialize();
      
      // Configure brain with saved settings
      if (this.config.brain) {
        this.brainEngine.configure(this.config.brain);
      }
      
      this.api.log('Brain Engine initialized successfully', 'info');
    } catch (error) {
      this.api.log(`Brain Engine initialization failed: ${error.message}`, 'error');
      this.api.log('Plugin will continue without Brain Engine functionality', 'warn');
      this.brainEngine = null;
    }
    
    // Register API routes
    this.registerRoutes();
    
    // Register Socket.IO events
    this.registerSocketEvents();
    
    // Register TikTok event handlers
    this.registerTikTokEvents();

    const source = this.config.brain?.liveHost?.source;
    if (this.config.brain?.liveHost?.enabled && source?.autoConnect && source.username && this.api.tiktok?.connect) {
      this.liveHostSourceTimer = setTimeout(() => {
        this.api.tiktok.connect(source.username).catch(error => this.api.log(`Read-only LIVE source auto-connect failed: ${error.message}`, 'warn'));
      }, 10000);
    }
    this.startLiveHostSourceWatchdog();
    
    // Auto-connect if enabled
    const activePlatformProfile = this.getPlatformProfile();
    if (this.config.enabled && activePlatformProfile.autoConnect) {
      const connected = await this.connect();
      if (!connected) {
        this.api.log('Auto-connect failed, will retry on manual connect', 'warn');
      }
      this.safeEmitStatus();
    }

    this.startLiveHostIdleMotion();
    
    this.api.log('AnimazingPal Plugin initialized', 'info');
  }

  getDefaultConfig() {
    return {
      enabled: false,
      platform: {
        active: 'animaze',
        profiles: {
          animaze: {
            host: '127.0.0.1',
            port: 8008,
            autoConnect: true,
            reconnectOnDisconnect: true,
            reconnectDelay: 5000,
            maxReconnectAttempts: 10,
            connectionTimeoutMs: 10000,
            autoRefreshData: true,
            verboseLogging: false
          },
          'vtube-studio': {
            host: '127.0.0.1',
            port: 8001,
            autoConnect: true,
            reconnectOnDisconnect: true,
            reconnectDelay: 5000,
            pluginName: 'AnimazingPal',
            pluginDeveloper: 'LTTH',
            authToken: ''
          },
          vseeface: {
            host: '127.0.0.1',
            port: 39539,
            autoConnect: true,
            reconnectOnDisconnect: true,
            reconnectDelay: 5000
          }
        }
      },
      autoConnect: true,
      host: '127.0.0.1',
      port: 8008,
      reconnectOnDisconnect: true,
      reconnectDelay: 5000,
      maxReconnectAttempts: 10,
      connectionTimeoutMs: 10000,
      // Auto-refresh Animaze data on connect
      autoRefreshData: true,
      // Gift mappings - map TikTok gifts to Animaze actions
      giftMappings: [],
      // Chat settings - send TikTok chat to ChatPal
      chatToAvatar: {
        enabled: false,
        useEcho: true,  // Use -echo prefix for TTS only (no AI response)
        prefix: '',
        maxLength: 200
      },
      // VRChat OSC bridge integration
      vrchatIntegration: {
        enabled: false,
        targetPluginId: 'osc-bridge',
        targetLabel: 'OSC-Bridge',
        forwardChatToChatbox: true,
        forwardBrainResponses: true,
        forwardStandaloneResponses: true,
        sendTypingIndicator: true,
        eventMappings: {
          chat: {
            enabled: true,
            kind: 'chatbox',
            messageTemplate: '{username}: {comment}'
          },
          gift: {
            enabled: true,
            kind: 'gesture',
            gesture: 'celebrate',
            duration: 3000,
            messageTemplate: 'Danke {username} fuer {giftName}!'
          },
          follow: {
            enabled: true,
            kind: 'gesture',
            gesture: 'wave',
            duration: 2000,
            messageTemplate: 'Willkommen {username}!'
          },
          share: {
            enabled: true,
            kind: 'gesture',
            gesture: 'dance',
            duration: 4000,
            messageTemplate: '{username} hat den Stream geteilt!'
          },
          like: {
            enabled: true,
            kind: 'gesture',
            gesture: 'hearts',
            duration: 1500,
            messageTemplate: 'Danke fuer die Likes, {username}!'
          },
          subscribe: {
            enabled: true,
            kind: 'emote',
            slot: 0,
            duration: 2000,
            messageTemplate: 'Danke {username} fuer das Abo!'
          },
          brainResponse: {
            enabled: true,
            kind: 'chatbox',
            messageTemplate: '{message}'
          },
          standaloneResponse: {
            enabled: true,
            kind: 'chatbox',
            messageTemplate: '{message}'
          }
        }
      },
      // Default actions for TikTok events
      eventActions: {
        follow: {
          enabled: true,
          actionType: 'specialAction', // 'emote', 'specialAction', 'pose', 'idle', 'chatMessage'
          actionValue: 0,          // itemName for emote, index for others
          chatMessage: null,
          useEcho: null            // Per-event echo override (null = use global, true/false = override)
        },
        share: {
          enabled: true,
          actionType: 'specialAction',
          actionValue: 6,
          chatMessage: null,
          useEcho: null
        },
        subscribe: {
          enabled: true,
          actionType: 'emote',
          actionValue: 'Emote_Confetti_Template',
          chatMessage: null,
          useEcho: null
        },
        like: {
          enabled: true,
          actionType: 'emote',
          actionValue: 'Emote_Hearts',
          chatMessage: null,
          useEcho: null,
          threshold: 15           // Only trigger after this many likes
        },
        gift: {
          enabled: true,
          actionType: 'emote',        // Default: Emote triggern
          actionValue: null,          // User wählt selbst
          chatMessage: 'Wow, danke {username} für {giftName}!',
          useEcho: null
        },
        chat: {
          enabled: true,
          actionType: 'idle',
          actionValue: 18,
          chatMessage: null,
          useEcho: null
        }
      },
      // Override behavior settings
      overrides: {
        // e.g. 'Breathing Behavior': { enabled: true, amplitude: 0.5, frequency: 1.0 }
      },
      // Reaction cooldowns in milliseconds per event type
      eventCooldowns: this.getDefaultEventCooldowns(),
      // Brain/AI settings
      brain: {
        enabled: false,
        standaloneMode: false,        // Standalone mode: TTS-only, no GPT calls
        forceTtsOnlyOnActions: false, // Force TTS-only (echo) for all automated actions
        openaiApiKey: null,
        model: 'gpt-4o-mini',      // Use efficient model by default
        activePersonality: null,
        // Persona storage
        personaStoragePath: null,  // Will use plugin data directory
        // Memory settings
        longTermMemory: true,      // Enable long-term user memory across streams
        memoryImportanceThreshold: 0.3,
        maxContextMemories: 10,
        archiveAfterDays: 7,
        pruneAfterDays: 30,
        memoryDecayHalfLife: 7,    // Days for memory importance to decay by half
        // Auto-response settings
        autoRespond: {
          chat: false,              // Respond to chat messages
          gifts: true,              // Thank for gifts
          follows: true,            // Welcome new followers
          shares: false,            // Thank for shares
          subscribe: true,          // Thank for subscriptions
          like: false               // React to likes
        },
        // Rate limiting
        maxResponsesPerMinute: 10,
        chatResponseProbability: 0.3,  // Respond to 30% of chats
        liveHost: buildLiveHostDefaults()
      },
      // Logic Matrix for event-driven actions
      logicMatrix: {
        enabled: true,
        rules: [
          // Example rule structure:
          // {
          //   id: 'unique-id',
          //   name: 'Rule name',
          //   priority: 10,
          //   stopOnMatch: true,
          //   conditions: {
          //     eventType: 'gift',
          //     giftValueTier: 'high', // low/medium/high
          //     userIsNew: false,
          //     mentions: ['keyword'],
          //     energyLevel: 'high',   // low/medium/high
          //     personaTag: 'excited'
          //   },
          //   actions: {
          //     emote: 'Happy',
          //     specialAction: 0,
          //     pose: null,
          //     idle: null,
          //     chatMessage: 'Wow, thank you so much {username}!'
          //   }
          // }
        ]
      },
      // Viewerbase summary and optional outbound sync
      viewerbase: {
        enabled: true,
        showInUI: true,
        recentLimit: 12,
        supporterLimit: 10,
        chatterLimit: 10,
        syncOnEvents: ['chat', 'gift', 'follow', 'share', 'like', 'subscribe', 'connected', 'disconnected'],
        externalSync: {
          enabled: false,
          endpointUrl: '',
          authToken: '',
          timeoutMs: 5000,
          retryLimit: 3,
          includeRecentMemories: true,
          includeTopSupporters: true,
          includeFrequentChatters: true
        }
      },
      // Advanced settings
      verboseLogging: false
    };
  }

  getDefaultEventCooldowns() {
    return {
      gift: 500,      // 500ms between gift triggers
      chat: 1000,     // 1s between chat messages
      follow: 2000,   // 2s between follow triggers
      like: 100,      // 100ms between like triggers
      share: 2000,    // 2s between share triggers
      subscribe: 3000 // 3s between subscribe triggers
    };
  }

  getPresetDefinitions() {
    return {
      'stream-ready': {
        key: 'stream-ready',
        label: 'Stream Ready',
        description: 'Faster reactions, stronger AI chat presence, and more entertaining defaults for live streams.',
        patch: {
          enabled: true,
          autoConnect: true,
          autoRefreshData: true,
          chatToAvatar: {
            enabled: true,
            useEcho: false,
            prefix: '[Live]',
            maxLength: 180
          },
          eventActions: {
            follow: {
              enabled: true,
              actionType: 'emote',
              actionValue: null,
              chatMessage: 'Welcome {username}! Glad you are here.',
              useEcho: null
            },
            share: {
              enabled: true,
              actionType: 'specialAction',
              actionValue: null,
              chatMessage: '{username} shared the stream - awesome!',
              useEcho: null
            },
            subscribe: {
              enabled: true,
              actionType: 'pose',
              actionValue: null,
              chatMessage: 'Huge thanks for subscribing, {username}!',
              useEcho: null
            },
            like: {
              enabled: true,
              actionType: 'idle',
              actionValue: null,
              chatMessage: null,
              useEcho: null,
              threshold: 25
            },
            gift: {
              enabled: true,
              actionType: 'emote',
              actionValue: null,
              chatMessage: 'Thank you {username} for the {giftName}!',
              useEcho: null
            },
            chat: {
              enabled: true,
              actionType: null,
              actionValue: null,
              chatMessage: null,
              useEcho: null
            }
          },
          eventCooldowns: {
            gift: 350,
            chat: 750,
            follow: 1200,
            like: 75,
            share: 1500,
            subscribe: 2200
          },
          brain: {
            enabled: true,
            standaloneMode: false,
            forceTtsOnlyOnActions: false,
            openaiApiKey: null,
            model: 'gpt-4o-mini',
            activePersonality: null,
            longTermMemory: true,
            memoryImportanceThreshold: 0.25,
            maxContextMemories: 14,
            archiveAfterDays: 7,
            pruneAfterDays: 30,
            memoryDecayHalfLife: 7,
            autoRespond: {
              chat: true,
              gifts: true,
              follows: true,
              shares: true,
              subscribe: true,
              like: false
            },
            maxResponsesPerMinute: 18,
            chatResponseProbability: 0.45
          }
        }
      }
    };
  }

  getPresetDefinition(presetKey) {
    return this.getPresetDefinitions()[presetKey] || null;
  }

  refreshEventCooldowns() {
    this.eventCooldowns = {
      ...this.getDefaultEventCooldowns(),
      ...(this.config?.eventCooldowns || {})
    };
  }

  applyPreset(presetKey) {
    const preset = this.getPresetDefinition(presetKey);
    if (!preset) {
      throw new Error(`Unknown preset: ${presetKey}`);
    }

    const currentConfig = this.normalizeConfig(this.config || this.getDefaultConfig());
    const mergedConfig = this.normalizeConfig(this.mergeConfigPatch(currentConfig, preset.patch));
    this.config = mergedConfig;
    this.refreshEventCooldowns();

    if (this.platformAdapter && typeof this.platformAdapter.setConfig === 'function') {
      this.platformAdapter.setConfig(this.getPlatformProfile());
    }

    if (typeof this.api.setConfig === 'function') {
      this.api.setConfig('config', this.config);
    }

    this.safeEmitStatus();
    return mergedConfig;
  }

  getSupportedPlatforms() {
    return listPlatformDefinitions();
  }

  getActivePlatformKey() {
    const platform = this.config?.platform?.active;
    return platform || 'animaze';
  }

  getPlatformProfile(platformKey = this.getActivePlatformKey()) {
    if (!this.config) {
      return this.getDefaultConfig().platform.profiles[platformKey] || {};
    }

    const defaults = this.getDefaultConfig().platform.profiles[platformKey] || {};
    const profiles = this.config.platform?.profiles || {};
    const profile = profiles[platformKey] || {};

    return {
      ...defaults,
      ...profile
    };
  }

  getActivePlatformDefinition() {
    return getPlatformDefinition(this.getActivePlatformKey());
  }

  getActivePlatformAdapter() {
    const platformKey = this.getActivePlatformKey();
    if (platformKey === 'animaze') {
      return null;
    }

    const profile = this.getPlatformProfile(platformKey);
    if (!this.platformAdapter || this.platformAdapter.getKey?.() !== platformKey) {
      this.platformAdapter = createPlatformAdapter(platformKey, this.api, profile);
    } else if (this.platformAdapter.setConfig) {
      this.platformAdapter.setConfig(profile);
    }

    return this.platformAdapter;
  }

  getPlatformState() {
    const platformKey = this.getActivePlatformKey();
    if (platformKey === 'animaze') {
      return {
        key: platformKey,
        definition: this.getActivePlatformDefinition(),
        adapter: null,
        data: this.animazeData,
        connected: this.isConnected
      };
    }

    const adapter = this.getActivePlatformAdapter();
    return {
      key: platformKey,
      definition: this.getActivePlatformDefinition(),
      adapter,
      data: adapter ? adapter.getData() : {},
      connected: adapter ? !!adapter.isConnected : false
    };
  }

  getActivePlatformData() {
    return this.getPlatformState().data || {};
  }

  getPlatformActionTypes(platformKey = this.getActivePlatformKey()) {
    const definition = getPlatformDefinition(platformKey);
    return Array.isArray(definition.actions) ? definition.actions : [];
  }

  getViewerbaseConfig() {
    const defaults = this.getDefaultConfig().viewerbase || {};
    const viewerbase = this.config?.viewerbase || {};
    return {
      ...defaults,
      ...viewerbase,
      externalSync: {
        ...defaults.externalSync,
        ...(viewerbase.externalSync || {})
      }
    };
  }

  getViewerbaseSyncConfig() {
    return this.getViewerbaseConfig().externalSync || {};
  }

  _safeParseJson(value, fallback = null) {
    if (value === null || value === undefined || value === '') {
      return fallback;
    }

    if (typeof value === 'object') {
      return value;
    }

    try {
      return JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  }

  serializeUserProfile(profile) {
    if (!profile) {
      return null;
    }

    return {
      ...profile,
      displayName: profile.nickname || profile.username,
      personality_notes: this._safeParseJson(profile.personality_notes, profile.personality_notes),
      favorite_topics: this._safeParseJson(profile.favorite_topics, []),
      custom_tags: this._safeParseJson(profile.custom_tags, []),
      interaction_history: this._safeParseJson(profile.interaction_history, []),
      relationship_level: profile.relationship_level || 'stranger'
    };
  }

  serializeMemoryEntry(memory) {
    if (!memory) {
      return null;
    }

    return {
      ...memory,
      tags: this._safeParseJson(memory.tags, []),
      context: this._safeParseJson(memory.context, memory.context)
    };
  }

  buildViewerbaseSnapshot(options = {}) {
    const viewerbaseConfig = this.getViewerbaseConfig();
    const memoryDb = this.brainEngine?.memoryDb || null;
    const statistics = memoryDb ? memoryDb.getStatistics() : null;
    const streamerId = statistics?.streamerId || memoryDb?.getStreamerId?.() || 'default';
    const resolveLimit = (value, fallback) => {
      if (value === 0) return 0;
      const parsed = parseInt(value, 10);
      return Number.isNaN(parsed) ? fallback : Math.max(1, parsed);
    };
    const supporterLimit = resolveLimit(options.supporterLimit ?? viewerbaseConfig.supporterLimit, 10);
    const chatterLimit = resolveLimit(options.chatterLimit ?? viewerbaseConfig.chatterLimit, 10);
    const recentLimit = resolveLimit(options.recentLimit ?? viewerbaseConfig.recentLimit, 12);

    const topSupporters = memoryDb && supporterLimit > 0 ? memoryDb.getTopSupporters(supporterLimit).map((profile) => this.serializeUserProfile(profile)) : [];
    const frequentChatters = memoryDb && chatterLimit > 0 ? memoryDb.getFrequentChatters(chatterLimit).map((profile) => this.serializeUserProfile(profile)) : [];
    const recentMemories = memoryDb && recentLimit > 0 ? memoryDb.getRecentMemories(recentLimit).map((memory) => this.serializeMemoryEntry(memory)) : [];
    const streamerProfiles = memoryDb ? memoryDb.getStreamerProfiles() : [];

    return {
      streamerId,
      generatedAt: new Date().toISOString(),
      enabled: !!viewerbaseConfig.enabled,
      showInUI: viewerbaseConfig.showInUI !== false,
      statistics,
      topSupporters,
      frequentChatters,
      recentMemories,
      streamerProfiles,
      viewerCounts: {
        totalUsers: statistics?.totalUsers || 0,
        totalMemories: statistics?.totalMemories || 0,
        totalConversations: statistics?.totalConversations || 0,
        totalArchives: statistics?.totalArchives || 0
      },
      syncState: this.getViewerbaseSyncState()
    };
  }

  getViewerbaseSyncState() {
    return {
      ...this.viewerbaseSyncState,
      queueLength: this.viewerbaseSyncPending ? 1 : 0
    };
  }

  getViewerbaseStatus() {
    const viewerbaseConfig = this.getViewerbaseConfig();
    return {
      enabled: !!viewerbaseConfig.enabled,
      showInUI: viewerbaseConfig.showInUI !== false,
      config: {
        recentLimit: viewerbaseConfig.recentLimit,
        supporterLimit: viewerbaseConfig.supporterLimit,
        chatterLimit: viewerbaseConfig.chatterLimit,
        syncOnEvents: viewerbaseConfig.syncOnEvents || []
      },
      externalSync: {
        ...this.getViewerbaseSyncConfig(),
        authToken: '',
        authTokenConfigured: !!this.getViewerbaseSyncConfig().authToken
      },
      summary: this.buildViewerbaseSnapshot(),
      syncState: this.getViewerbaseSyncState()
    };
  }

  recordViewerbaseActivity(eventType, context = {}) {
    const viewerbaseConfig = this.getViewerbaseConfig();
    if (!viewerbaseConfig.enabled) {
      return false;
    }

    const syncConfig = viewerbaseConfig.externalSync || {};
    const shouldSync = Array.isArray(viewerbaseConfig.syncOnEvents)
      ? viewerbaseConfig.syncOnEvents.includes(eventType)
      : false;

    if (!shouldSync || !syncConfig.enabled || !syncConfig.endpointUrl) {
      return false;
    }

    return this.scheduleViewerbaseSync(eventType, context);
  }

  scheduleViewerbaseSync(reason = 'manual', options = {}) {
    const viewerbaseConfig = this.getViewerbaseConfig();
    const syncConfig = viewerbaseConfig.externalSync || {};
    if (!viewerbaseConfig.enabled || !syncConfig.enabled || !syncConfig.endpointUrl) {
      return false;
    }

    this.viewerbaseSyncPending = {
      reason,
      options: {
        recentLimit: options.recentLimit,
        supporterLimit: options.supporterLimit,
        chatterLimit: options.chatterLimit
      },
      queuedAt: Date.now(),
      retryCount: 0
    };
    this.viewerbaseSyncState.lastReason = reason;
    this.viewerbaseSyncState.queueLength = 1;

    if (options.immediate) {
      if (this.viewerbaseSyncTimer) {
        clearTimeout(this.viewerbaseSyncTimer);
        this.viewerbaseSyncTimer = null;
      }
      return true;
    }

    if (this.viewerbaseSyncTimer) {
      return true;
    }

    const debounceMs = Math.max(0, parseInt(options.delayMs, 10) || 15000);
    this.viewerbaseSyncTimer = setTimeout(() => {
      this.viewerbaseSyncTimer = null;
      this.flushViewerbaseSyncQueue().catch((error) => {
        this.api.log(`Viewerbase sync flush failed: ${error.message}`, 'warn');
      });
    }, debounceMs);

    return true;
  }

  async flushViewerbaseSyncQueue() {
    if (this.viewerbaseSyncInFlight) {
      return false;
    }

    const pending = this.viewerbaseSyncPending;
    if (!pending) {
      return false;
    }

    const viewerbaseConfig = this.getViewerbaseConfig();
    const syncConfig = viewerbaseConfig.externalSync || {};
    if (!viewerbaseConfig.enabled || !syncConfig.enabled || !syncConfig.endpointUrl) {
      this.viewerbaseSyncPending = null;
      this.viewerbaseSyncState.lastStatus = 'idle';
      this.viewerbaseSyncState.queueLength = 0;
      return false;
    }

    this.viewerbaseSyncInFlight = true;
    this.viewerbaseSyncState.lastStatus = 'syncing';
    this.viewerbaseSyncState.lastError = null;

    let timeoutHandle = null;

    try {
      const snapshot = this.buildViewerbaseSnapshot({
        recentLimit: syncConfig.includeRecentMemories === false ? 0 : viewerbaseConfig.recentLimit,
        supporterLimit: syncConfig.includeTopSupporters === false ? 0 : viewerbaseConfig.supporterLimit,
        chatterLimit: syncConfig.includeFrequentChatters === false ? 0 : viewerbaseConfig.chatterLimit
      });

      const payload = {
        schema: 'animazingpal.viewerbase.snapshot.v1',
        source: 'animazingpal',
        generatedAt: snapshot.generatedAt,
        streamerId: snapshot.streamerId,
        reason: pending.reason,
        snapshot
      };

      const headers = {
        'Content-Type': 'application/json'
      };

      if (syncConfig.authToken) {
        headers.Authorization = `Bearer ${syncConfig.authToken}`;
      }

      const fetchOptions = {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      };

      const timeoutMs = Math.max(1000, parseInt(syncConfig.timeoutMs, 10) || 5000);
      if (typeof AbortController !== 'undefined') {
        const controller = new AbortController();
        fetchOptions.signal = controller.signal;
        timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
      }

      if (typeof fetch !== 'function') {
        throw new Error('Global fetch is not available in this runtime');
      }

      const response = await fetch(syncConfig.endpointUrl, fetchOptions);
      if (!response.ok) {
        throw new Error(`Viewerbase sync failed with status ${response.status}`);
      }

      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }

      if (this.viewerbaseSyncPending === pending) {
        this.viewerbaseSyncPending = null;
      }
      this.viewerbaseSyncState.lastSyncAt = new Date().toISOString();
      this.viewerbaseSyncState.lastStatus = 'success';
      this.viewerbaseSyncState.lastError = null;
      this.viewerbaseSyncState.lastReason = pending.reason;
      this.viewerbaseSyncState.queueLength = this.viewerbaseSyncPending ? 1 : 0;
      this.safeEmitStatus();
      return true;
    } catch (error) {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      const retryLimit = Math.max(0, parseInt(syncConfig.retryLimit, 10) || 0);
      this.viewerbaseSyncState.lastStatus = 'error';
      this.viewerbaseSyncState.lastError = error.message;
      this.viewerbaseSyncState.lastReason = pending.reason;
      const currentPending = this.viewerbaseSyncPending;
      if (currentPending === pending) {
        pending.retryCount = (pending.retryCount || 0) + 1;
        this.viewerbaseSyncState.queueLength = 1;

        if (pending.retryCount <= retryLimit) {
          this.viewerbaseSyncPending = pending;
          const retryDelay = Math.max(1000, Math.min(30000, (parseInt(syncConfig.timeoutMs, 10) || 5000) * pending.retryCount));
          this.viewerbaseSyncTimer = setTimeout(() => {
            this.viewerbaseSyncTimer = null;
            this.flushViewerbaseSyncQueue().catch((retryError) => {
              this.api.log(`Viewerbase sync retry failed: ${retryError.message}`, 'warn');
            });
          }, retryDelay);
        } else {
          this.viewerbaseSyncPending = null;
          this.viewerbaseSyncState.queueLength = 0;
        }
      } else {
        this.viewerbaseSyncState.queueLength = currentPending ? 1 : 0;
      }

      this.safeEmitStatus();
      throw error;
    } finally {
      this.viewerbaseSyncInFlight = false;
    }
  }

  mergeConfigPatch(target, patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      return patch;
    }

    const output = { ...(target || {}) };

    for (const [key, value] of Object.entries(patch)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        output[key] = this.mergeConfigPatch(output[key], value);
      } else {
        output[key] = value;
      }
    }

    return output;
  }

  normalizeConfig(config = {}) {
    const defaults = this.getDefaultConfig();
    const normalized = this.mergeConfigPatch(defaults, config);
    normalized.brain.liveHost = normalizeLiveHostConfig(
      normalized.brain.liveHost || {},
      normalized.brain
    );

    // Preserve legacy top-level Animaze settings while introducing
    // the platform profile structure for new targets.
    normalized.platform = normalized.platform || defaults.platform;
    normalized.platform.profiles = normalized.platform.profiles || defaults.platform.profiles;

    if (!normalized.platform.profiles.animaze) {
      normalized.platform.profiles.animaze = { ...defaults.platform.profiles.animaze };
    }

    if (!normalized.platform.profiles['vtube-studio']) {
      normalized.platform.profiles['vtube-studio'] = { ...defaults.platform.profiles['vtube-studio'] };
    }

    if (!normalized.platform.profiles.vseeface) {
      normalized.platform.profiles.vseeface = { ...defaults.platform.profiles.vseeface };
    }

    // If legacy top-level host/port values were stored before the profile
    // structure existed, copy them into the active Animaze profile.
    if (config.host || config.port || config.autoRefreshData !== undefined) {
      normalized.platform.profiles.animaze = {
        ...normalized.platform.profiles.animaze,
        host: config.host || normalized.platform.profiles.animaze.host,
        port: config.port || normalized.platform.profiles.animaze.port,
        autoConnect: config.autoConnect !== undefined ? config.autoConnect : normalized.platform.profiles.animaze.autoConnect,
        reconnectOnDisconnect: config.reconnectOnDisconnect !== undefined ? config.reconnectOnDisconnect : normalized.platform.profiles.animaze.reconnectOnDisconnect,
        reconnectDelay: config.reconnectDelay !== undefined ? config.reconnectDelay : normalized.platform.profiles.animaze.reconnectDelay,
        maxReconnectAttempts: config.maxReconnectAttempts !== undefined ? config.maxReconnectAttempts : normalized.platform.profiles.animaze.maxReconnectAttempts,
        connectionTimeoutMs: config.connectionTimeoutMs !== undefined ? config.connectionTimeoutMs : normalized.platform.profiles.animaze.connectionTimeoutMs,
        autoRefreshData: config.autoRefreshData !== undefined ? config.autoRefreshData : normalized.platform.profiles.animaze.autoRefreshData,
        verboseLogging: config.verboseLogging !== undefined ? config.verboseLogging : normalized.platform.profiles.animaze.verboseLogging
      };
    }

    if (normalized.platform.active === 'animaze') {
      normalized.host = normalized.platform.profiles.animaze.host;
      normalized.port = normalized.platform.profiles.animaze.port;
      normalized.autoConnect = normalized.platform.profiles.animaze.autoConnect;
      normalized.reconnectOnDisconnect = normalized.platform.profiles.animaze.reconnectOnDisconnect;
      normalized.reconnectDelay = normalized.platform.profiles.animaze.reconnectDelay;
      const maxReconnectAttempts = parseInt(normalized.platform.profiles.animaze.maxReconnectAttempts, 10);
      normalized.maxReconnectAttempts = Math.max(0, Math.min(100, Number.isFinite(maxReconnectAttempts) ? maxReconnectAttempts : 10));
      normalized.connectionTimeoutMs = Math.max(1000, Math.min(120000, parseInt(normalized.platform.profiles.animaze.connectionTimeoutMs, 10) || 10000));
      normalized.autoRefreshData = normalized.platform.profiles.animaze.autoRefreshData;
      normalized.verboseLogging = normalized.platform.profiles.animaze.verboseLogging;
    }

    normalized.eventActions = this.normalizeStandaloneEventActions(normalized.eventActions, defaults.eventActions);

    return normalized;
  }

  normalizeStandaloneEventActions(eventActions = {}, defaults = {}) {
    const standaloneDefaults = {
      follow: { enabled: true, actionType: 'specialAction', actionValue: 0, chatMessage: null, useEcho: null },
      share: { enabled: true, actionType: 'specialAction', actionValue: 6, chatMessage: null, useEcho: null },
      subscribe: { enabled: true, actionType: 'emote', actionValue: 'Emote_Confetti_Template', chatMessage: null, useEcho: null },
      like: { enabled: true, actionType: 'emote', actionValue: 'Emote_Hearts', chatMessage: null, useEcho: null, threshold: 15 },
      gift: { enabled: true, actionType: 'emote', actionValue: 'Emote_Hearts', chatMessage: null, useEcho: null },
      chat: { enabled: true, actionType: 'idle', actionValue: 18, chatMessage: null, useEcho: null }
    };
    const legacyDefaults = {
      follow: { actionType: 'emote', actionValue: null, chatMessage: null },
      share: { actionType: 'emote', actionValue: null, chatMessage: null },
      subscribe: { actionType: 'specialAction', actionValue: null, chatMessage: 'Thank you {username} for subscribing!' },
      like: { enabled: false, actionType: null, actionValue: null, chatMessage: null, threshold: 10 },
      gift: { actionType: 'emote', actionValue: null, chatMessage: 'Wow, danke {username} für {giftName}!' },
      chat: { enabled: false, actionType: null, actionValue: null, chatMessage: null }
    };
    const normalized = { ...(eventActions || {}) };
    for (const [eventType, defaultAction] of Object.entries(defaults || {})) {
      const fallback = standaloneDefaults[eventType] || defaultAction;
      const current = normalized[eventType] || {};
      const legacy = legacyDefaults[eventType] || {};
      const hasActionValue = current.actionValue !== null && current.actionValue !== undefined && current.actionValue !== '';
      const message = String(current.chatMessage || '');
      const isKnownLegacyMessage = message === legacy.chatMessage
        || /^Wow,\s*danke\s+\{username\}.*\{giftName\}!$/i.test(message)
        || /^Thank you\s+\{username\}\s+for subscribing!$/i.test(message);
      const hasCustomMessage = current.chatMessage
        && !isKnownLegacyMessage
        && !message.toLocaleLowerCase().includes('chatpal');
      const legacyShape = current.actionType === legacy.actionType
        && !hasActionValue
        && !hasCustomMessage
        && (legacy.enabled === undefined || current.enabled === legacy.enabled);
      normalized[eventType] = legacyShape || !normalized[eventType]
        ? { ...fallback }
        : { ...fallback, ...current };
    }
    return normalized;
  }

  registerRoutes() {
    // Serve the UI page
    this.api.registerRoute('get', '/animazingpal/ui', (req, res) => {
      const uiPath = path.join(__dirname, 'ui.html');
      res.sendFile(uiPath);
    });

    this.api.registerRoute('get', '/api/animazingpal/platforms', (req, res) => {
      res.json({
        success: true,
        platforms: this.getSupportedPlatforms()
      });
    });

    this.api.registerRoute('get', '/api/animazingpal/presets', (req, res) => {
      res.json({
        success: true,
        presets: this.getPresetDefinitions()
      });
    });

    // Get plugin status
    this.api.registerRoute('get', '/api/animazingpal/status', (req, res) => {
      const platformState = this.getPlatformState();
      res.json({
        success: true,
        isConnected: this.isConnected,
        config: this.getSafeConfig(),
        reconnectAttempts: this.reconnectAttempts,
        animazeData: this.animazeData,
        platformState: {
          key: platformState.key,
          definition: platformState.definition,
          data: platformState.data,
          connected: platformState.connected
        },
        platformData: platformState.data,
        platformDefinition: platformState.definition,
        activePlatform: platformState.key,
        supportedPlatforms: this.getSupportedPlatforms(),
        overrideBehaviors: this.overrideBehaviors,
        liveHostRuntime: this.getLiveHostRuntimeStatus()
      });
    });

    // Get configuration
    this.api.registerRoute('get', '/api/animazingpal/config', (req, res) => {
      res.json({
        success: true,
        config: this.getSafeConfig()
      });
    });

    // Update configuration
    this.api.registerRoute('post', '/api/animazingpal/config', async (req, res) => {
      try {
        const newConfig = req.body;
        const previousPlatformKey = this.getActivePlatformKey();
        const mergedConfig = this.normalizeConfig(this.mergeConfigPatch(this.config, newConfig));
        const nextPlatformKey = mergedConfig.platform?.active || previousPlatformKey;
        const platformChanged = nextPlatformKey !== previousPlatformKey;

        if (platformChanged && this.isConnected) {
          this.disconnect();
        }

        this.config = mergedConfig;
        this.maxReconnectAttempts = mergedConfig.maxReconnectAttempts;
        this.refreshEventCooldowns();
        this.platformAdapter = this.getActivePlatformAdapter();
        this.api.setConfig('config', this.config);

        this.api.log('AnimazingPal config updated', 'info');
        this.safeEmitStatus();
        
        res.json({ success: true, config: this.getSafeConfig() });
      } catch (error) {
        this.api.log(`Config update error: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.api.registerRoute('get', '/api/animazingpal/live-host/config', (req, res) => {
      res.json({
        success: true,
        config: sanitizeLiveHostConfig(this.config.brain.liveHost),
        presets: ['safe-live']
      });
    });

    this.api.registerRoute('get', '/api/animazingpal/live-host/audio-devices', async (req, res) => {
      try {
        res.json({ success: true, devices: await listAudioOutputDevices() });
      } catch (error) {
        this.api.log(`Audio device discovery failed: ${error.message}`, 'warn');
        res.json({ success: true, devices: [] });
      }
    });

    this.api.registerRoute('post', '/api/animazingpal/live-host/preflight', (req, res) => {
      try {
        res.json({ success: true, preflight: this.evaluateLiveHostPreflight(req.body || {}) });
      } catch (error) {
        this.api.log(`Live host preflight failed: ${error.message}`, 'warn');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.api.registerRoute('post', '/api/animazingpal/live-host/browser-heartbeat', (req, res) => {
      const heartbeat = this.recordLiveHostBrowserHeartbeat(req.body || {});
      res.json({ success: true, heartbeat });
    });

    this.api.registerRoute('post', '/api/animazingpal/live-host/config', async (req, res) => {
      try {
        this.config.brain.liveHost = mergeLiveHostSecrets(this.config.brain.liveHost, req.body || {});
        this.api.setConfig('config', this.config);
        this.brainEngine?.configure({ ...this.config.brain, liveHost: this.config.brain.liveHost });
        this.startLiveHostIdleMotion();
        this.startLiveHostSourceWatchdog();
        this.safeEmitStatus();
        res.json({ success: true, config: sanitizeLiveHostConfig(this.config.brain.liveHost) });
      } catch (error) {
        this.api.log(`Live host config update failed: ${error.message}`, 'error');
        res.status(400).json({ success: false, error: error.message });
      }
    });

    this.api.registerRoute('post', '/api/animazingpal/live-host/preset', async (req, res) => {
      try {
        this.config.brain.liveHost = applyLiveHostPreset(this.config.brain.liveHost, req.body?.preset || 'safe-live');
        this.api.setConfig('config', this.config);
        this.brainEngine?.configure({ ...this.config.brain, liveHost: this.config.brain.liveHost });
        this.startLiveHostIdleMotion();
        this.startLiveHostSourceWatchdog();
        res.json({ success: true, config: sanitizeLiveHostConfig(this.config.brain.liveHost) });
      } catch (error) {
        res.status(400).json({ success: false, error: error.message });
      }
    });

    this.api.registerRoute('post', '/api/animazingpal/live-host/reset', async (req, res) => {
      try {
        const section = req.body?.section || 'all';
        const defaults = buildLiveHostDefaults();
        const current = this.config.brain.liveHost;
        if (section === 'all') {
          if (req.body?.clearSecrets) {
            this.config.brain.liveHost = defaults;
          } else {
            const providerKeys = Object.fromEntries(Object.entries(current.providers || {}).map(([name, provider]) => [name, {
              apiKey: provider.apiKey || ''
            }]));
            this.config.brain.liveHost = mergeLiveHostSecrets(defaults, { providers: providerKeys });
          }
        } else if (Object.prototype.hasOwnProperty.call(defaults, section)) {
          const patch = { [section]: defaults[section] };
          this.config.brain.liveHost = section === 'providers'
            ? mergeLiveHostSecrets(current, patch)
            : normalizeLiveHostConfig(this.mergeConfigPatch(current, patch));
        } else {
          return res.status(400).json({ success: false, error: `Unknown settings section: ${section}` });
        }
        this.api.setConfig('config', this.config);
        this.brainEngine?.configure({ ...this.config.brain, liveHost: this.config.brain.liveHost });
        this.startLiveHostIdleMotion();
        this.startLiveHostSourceWatchdog();
        res.json({ success: true, config: sanitizeLiveHostConfig(this.config.brain.liveHost) });
      } catch (error) {
        res.status(400).json({ success: false, error: error.message });
      }
    });

    this.api.registerRoute('post', '/api/animazingpal/live-host/speak-test', async (req, res) => {
      const result = await this.runLiveHostTtsProbe({
        text: req.body?.text || 'AnimazingPal Sprachtest erfolgreich.',
        speak: true
      });
      res.status(result?.success === false ? 400 : 200).json(result);
    });

    this.api.registerRoute('post', '/api/animazingpal/live-host/tts-probe', async (req, res) => {
      const result = await this.runLiveHostTtsProbe(req.body || {});
      res.status(result?.success === false ? 400 : 200).json(result);
    });

    this.api.registerRoute('post', '/api/animazingpal/live-host/avatar/activate', async (req, res) => {
      const result = await this.activateAvatarBundle(req.body?.bundleId, { reason: 'manual-ui' });
      res.status(result.success ? 200 : 400).json(result);
    });

    this.api.registerRoute('post', '/api/animazingpal/live-host/movement-test', async (req, res) => {
      const result = await this.runLiveHostMovementTest(req.body || {});
      res.status(result.success ? 200 : 400).json(result);
    });

    this.api.registerRoute('post', '/api/animazingpal/live-host/source/connect', async (req, res) => {
      try {
        const username = String(req.body?.username || this.config.brain.liveHost.source?.username || '').trim().replace(/^@/, '');
        if (!/^[a-zA-Z0-9._-]{1,100}$/.test(username)) {
          return res.status(400).json({ success: false, error: 'Invalid TikTok username' });
        }
        if (!this.api.tiktok?.connect) {
          return res.status(503).json({ success: false, error: 'TikTok event source unavailable' });
        }
        await this.api.tiktok.connect(username);
        this.config.brain.liveHost.source = { username, readOnly: true, autoConnect: this.config.brain.liveHost.source?.autoConnect === true };
        this.config.brain.liveHost.viewerMemory.streamerId = username;
        this.brainEngine?.setStreamerId(username);
        this.api.setConfig('config', this.config);
        this.startLiveHostSourceWatchdog();
        res.json({ success: true, username, readOnly: true });
      } catch (error) {
        res.status(400).json({ success: false, error: error.message });
      }
    });

    this.api.registerRoute('get', '/api/animazingpal/viewerbase', (req, res) => {
      res.json({
        success: true,
        viewerbase: this.getViewerbaseStatus()
      });
    });

    this.api.registerRoute('post', '/api/animazingpal/viewerbase/config', async (req, res) => {
      try {
        const patch = req.body || {};
        const mergedConfig = this.normalizeConfig(this.mergeConfigPatch(this.config, {
          viewerbase: patch.viewerbase || patch
        }));

        this.config = mergedConfig;
        this.api.setConfig('config', this.config);
        this.safeEmitStatus();

        res.json({
          success: true,
          viewerbase: this.getViewerbaseStatus(),
          config: this.getSafeConfig()
        });
      } catch (error) {
        this.api.log(`Viewerbase config update error: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.api.registerRoute('post', '/api/animazingpal/viewerbase/sync', async (req, res) => {
      try {
        const immediate = req.body?.immediate !== false;
        const scheduled = this.scheduleViewerbaseSync(req.body?.reason || 'manual', {
          immediate,
          delayMs: req.body?.delayMs
        });

        if (!scheduled) {
          return res.status(400).json({
            success: false,
            error: 'Viewerbase sync is disabled or not configured'
          });
        }

        if (immediate) {
          await this.flushViewerbaseSyncQueue();
        }

        res.json({
          success: true,
          viewerbase: this.getViewerbaseStatus()
        });
      } catch (error) {
        this.api.log(`Viewerbase sync error: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.api.registerRoute('post', '/api/animazingpal/presets/apply', async (req, res) => {
      try {
        const presetKey = req.body?.preset || req.body?.presetKey;
        if (!presetKey) {
          return res.status(400).json({ success: false, error: 'preset is required' });
        }

        const preset = this.getPresetDefinition(presetKey);
        if (!preset) {
          return res.status(404).json({ success: false, error: `Unknown preset: ${presetKey}` });
        }

        this.applyPreset(presetKey);
        this.api.log(`Applied AnimazingPal preset: ${preset.label}`, 'info');

        res.json({
          success: true,
          preset,
          config: this.getSafeConfig(),
          platformState: {
            key: this.getActivePlatformKey(),
            definition: this.getActivePlatformDefinition(),
            data: this.getActivePlatformData(),
            connected: this.isConnected
          }
        });
      } catch (error) {
        this.api.log(`Preset apply error: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Connect to Animaze
    this.api.registerRoute('post', '/api/animazingpal/connect', async (req, res) => {
      try {
        const connected = await this.connect();
        res.json({ success: connected, isConnected: this.isConnected });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Disconnect from Animaze
    this.api.registerRoute('post', '/api/animazingpal/disconnect', (req, res) => {
      this.disconnect();
      res.json({ success: true, isConnected: this.isConnected });
    });

    // Refresh Animaze data (avatars, emotes, etc.)
    this.api.registerRoute('post', '/api/animazingpal/refresh', async (req, res) => {
      try {
        await this.refreshAnimazeData();
        res.json({ success: true, animazeData: this.animazeData });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get available avatars
    this.api.registerRoute('get', '/api/animazingpal/avatars', (req, res) => {
      res.json({ success: true, avatars: this.animazeData.avatars });
    });

    // Load avatar
    this.api.registerRoute('post', '/api/animazingpal/avatar/load', async (req, res) => {
      const { name } = req.body;
      if (!name) {
        return res.status(400).json({ success: false, error: 'Avatar name is required' });
      }
      
      const success = await this.loadAvatar(name);
      res.json({ success, avatar: name });
    });

    // Get available scenes
    this.api.registerRoute('get', '/api/animazingpal/scenes', (req, res) => {
      res.json({ success: true, scenes: this.animazeData.scenes });
    });

    // Load scene
    this.api.registerRoute('post', '/api/animazingpal/scene/load', async (req, res) => {
      const { name } = req.body;
      if (!name) {
        return res.status(400).json({ success: false, error: 'Scene name is required' });
      }
      
      const success = await this.loadScene(name);
      res.json({ success, scene: name });
    });

    // Get available emotes
    this.api.registerRoute('get', '/api/animazingpal/emotes', (req, res) => {
      res.json({ success: true, emotes: this.animazeData.emotes });
    });

    // Trigger emote
    this.api.registerRoute('post', '/api/animazingpal/emote', async (req, res) => {
      const { itemName } = req.body;
      if (!itemName) {
        return res.status(400).json({ success: false, error: 'Emote itemName is required' });
      }
      
      const success = await this.triggerEmote(itemName);
      res.json({ success, emote: itemName });
    });

    // Get special actions
    this.api.registerRoute('get', '/api/animazingpal/special-actions', (req, res) => {
      res.json({ success: true, specialActions: this.animazeData.specialActions });
    });

    // Trigger special action
    this.api.registerRoute('post', '/api/animazingpal/special-action', async (req, res) => {
      const { index } = req.body;
      if (index === undefined) {
        return res.status(400).json({ success: false, error: 'Action index is required' });
      }
      
      const success = await this.triggerSpecialAction(index);
      res.json({ success, index });
    });

    // Get poses
    this.api.registerRoute('get', '/api/animazingpal/poses', (req, res) => {
      res.json({ success: true, poses: this.animazeData.poses });
    });

    // Trigger pose
    this.api.registerRoute('post', '/api/animazingpal/pose', async (req, res) => {
      const { index } = req.body;
      if (index === undefined) {
        return res.status(400).json({ success: false, error: 'Pose index is required' });
      }
      
      const success = await this.triggerPose(index);
      res.json({ success, index });
    });

    // Get idle animations
    this.api.registerRoute('get', '/api/animazingpal/idles', (req, res) => {
      res.json({ success: true, idleAnims: this.animazeData.idleAnims });
    });

    // Trigger idle animation
    this.api.registerRoute('post', '/api/animazingpal/idle', async (req, res) => {
      const { index } = req.body;
      if (index === undefined) {
        return res.status(400).json({ success: false, error: 'Idle index is required' });
      }
      
      const success = await this.triggerIdle(index);
      res.json({ success, index });
    });

    // Send message to ChatPal
    this.api.registerRoute('post', '/api/animazingpal/chatpal', async (req, res) => {
      const { message, useEcho } = req.body;
      if (!message) {
        return res.status(400).json({ success: false, error: 'Message is required' });
      }
      
      const success = await this.sendChatMessage(message, useEcho);
      res.json({ success, message });
    });

    // Set override behavior
    this.api.registerRoute('post', '/api/animazingpal/override', async (req, res) => {
      const { behavior, value, ...params } = req.body;
      if (!behavior) {
        return res.status(400).json({ success: false, error: 'Behavior name is required' });
      }
      
      const success = await this.setOverride(behavior, value, params);
      res.json({ success, behavior, value });
    });

    // Get override behavior status
    this.api.registerRoute('post', '/api/animazingpal/override/get', async (req, res) => {
      const { behavior } = req.body;
      if (!behavior) {
        return res.status(400).json({ success: false, error: 'Behavior name is required' });
      }
      
      const result = await this.getOverride(behavior);
      res.json({ success: true, ...result });
    });

    // Calibrate tracker
    this.api.registerRoute('post', '/api/animazingpal/calibrate', async (req, res) => {
      const success = await this.calibrateTracker();
      res.json({ success });
    });

    // Toggle broadcast (virtual camera)
    this.api.registerRoute('post', '/api/animazingpal/broadcast', async (req, res) => {
      const { toggle } = req.body;
      if (toggle === undefined) {
        return res.status(400).json({ success: false, error: 'Toggle value is required' });
      }
      
      const success = await this.setBroadcast(toggle);
      res.json({ success, broadcast: toggle });
    });

    // Test connection
    this.api.registerRoute('post', '/api/animazingpal/test', async (req, res) => {
      try {
        const wasConnected = this.isConnected;
        
        if (!wasConnected) {
          await this.connect();
        }
        
        // Refresh data and return status
        if (this.isConnected) {
          await this.refreshAnimazeData();
        }
        
        res.json({ 
          success: this.isConnected, 
          message: this.isConnected 
            ? `Connected! Found ${this.animazeData.avatars.length} avatars and ${this.animazeData.emotes.length} emotes.`
            : 'Could not connect to Animaze. Make sure the Animaze API is enabled in Settings > Animaze API.',
          isConnected: this.isConnected,
          animazeData: this.animazeData
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Gift mappings management
    this.api.registerRoute('get', '/api/animazingpal/gift-mappings', (req, res) => {
      res.json({
        success: true,
        mappings: this.config.giftMappings || []
      });
    });

    this.api.registerRoute('post', '/api/animazingpal/gift-mappings', async (req, res) => {
      const { mappings } = req.body;
      
      if (!Array.isArray(mappings)) {
        return res.status(400).json({ success: false, error: 'Mappings must be an array' });
      }
      
      // Validate mapping structure
      const validMapping = (m) => {
        return (m.giftId || m.giftName) && 
               (m.actionType && ['emote', 'specialAction', 'pose', 'idle', 'chatMessage'].includes(m.actionType));
      };

      if (!mappings.every(validMapping)) {
        return res.status(400).json({ success: false, error: 'Invalid mapping structure' });
      }
      
      this.config.giftMappings = mappings;
      this.api.setConfig('config', this.config);
      
      this.api.log(`Updated ${mappings.length} gift mappings`, 'info');
      res.json({ success: true, mappings });
    });

    // ==================== Brain/AI Routes ====================

    // Get brain status and statistics
    this.api.registerRoute('get', '/api/animazingpal/brain/status', (req, res) => {
      if (!this.brainEngine) {
        return res.json({ success: false, error: 'Brain Engine not initialized' });
      }
      
      res.json({
        success: true,
        statistics: this.brainEngine.getStatistics(),
        personalities: this.brainEngine.getPersonalities(),
        currentPersonality: this.brainEngine.currentPersonality
      });
    });

    // Configure brain settings
    this.api.registerRoute('post', '/api/animazingpal/brain/config', async (req, res) => {
      try {
        const brainConfig = { ...(req.body || {}) };
        if (brainConfig.liveHost) {
          brainConfig.liveHost = mergeLiveHostSecrets(this.config.brain.liveHost, brainConfig.liveHost);
        }
        if (!brainConfig.openaiApiKey) delete brainConfig.openaiApiKey;
        this.config.brain = this.mergeConfigPatch(this.config.brain, brainConfig);
        this.api.setConfig('config', this.config);
        
        // Apply to brain engine
        if (this.brainEngine) {
          this.brainEngine.configure(brainConfig);
        }
        
        this.api.log('Brain config updated', 'info');
        res.json({ success: true, config: this.getSafeConfig().brain });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Test GPT connection
    this.api.registerRoute('post', '/api/animazingpal/brain/test', async (req, res) => {
      if (!this.brainEngine) {
        return res.json({ success: false, error: 'Brain Engine not initialized' });
      }
      
      const result = await this.brainEngine.testConnection();
      res.json(result);
    });

    // Get all personalities
    this.api.registerRoute('get', '/api/animazingpal/brain/personalities', (req, res) => {
      if (!this.brainEngine) {
        return res.json({ success: false, personalities: [] });
      }
      
      res.json({
        success: true,
        personalities: this.brainEngine.getPersonalities()
      });
    });

    // Set active personality
    this.api.registerRoute('post', '/api/animazingpal/brain/personality/set', async (req, res) => {
      const { name } = req.body;
      if (!name) {
        return res.status(400).json({ success: false, error: 'Personality name required' });
      }
      
      if (!this.brainEngine) {
        return res.json({ success: false, error: 'Brain Engine not initialized' });
      }
      
      await this.brainEngine.setActivePersonality(name);
      res.json({
        success: true,
        personality: this.brainEngine.currentPersonality
      });
    });

    // Create custom personality
    this.api.registerRoute('post', '/api/animazingpal/brain/personality/create', async (req, res) => {
      const personalityData = req.body;
      
      if (!personalityData.name || !personalityData.system_prompt) {
        return res.status(400).json({ success: false, error: 'Name and system_prompt required' });
      }
      
      if (!this.brainEngine) {
        return res.json({ success: false, error: 'Brain Engine not initialized' });
      }
      
      const id = this.brainEngine.createPersonality(personalityData);
      res.json({ success: true, id });
    });

    // Search memories
    this.api.registerRoute('get', '/api/animazingpal/brain/memories/search', (req, res) => {
      const { query, username, minImportance, limit } = req.query;
      
      if (!this.brainEngine) {
        return res.json({ success: false, memories: [] });
      }
      
      try {
        let memories = [];
        
        // If username filter is provided, get user-specific memories
        if (username) {
          memories = this.brainEngine.memoryDb.getUserMemories(username, parseInt(limit) || 100);
        } 
        // If query is provided, search by content
        else if (query && query.trim() !== '') {
          memories = this.brainEngine.memoryDb.searchMemories(query, parseInt(limit) || 100);
        }
        // Otherwise get recent memories
        else {
          memories = this.brainEngine.memoryDb.getRecentMemories(parseInt(limit) || 100);
        }
        
        // Apply importance filter if provided
        if (minImportance) {
          const threshold = parseFloat(minImportance);
          memories = memories.filter(m => m.importance >= threshold);
        }
        
        res.json({ success: true, memories });
      } catch (error) {
        this.api.log(`Memory search error: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get user profile
    this.api.registerRoute('get', '/api/animazingpal/brain/user/:username', (req, res) => {
      const { username } = req.params;
      
      if (!this.brainEngine) {
        return res.json({ success: false, error: 'Brain Engine not initialized' });
      }
      
      const profile = this.brainEngine.getUserProfile(username);
      res.json({ success: true, profile });
    });

    // Manual chat response (for testing)
    this.api.registerRoute('post', '/api/animazingpal/brain/chat', async (req, res) => {
      const { username, message } = req.body;
      
      if (!username || !message) {
        return res.status(400).json({ success: false, error: 'Username and message required' });
      }
      
      if (!this.brainEngine) {
        return res.json({ success: false, error: 'Brain Engine not initialized' });
      }
      
      try {
        const response = await this.brainEngine.processChat(username, message, { forceRespond: true });
        
        // Send to Animaze if connected and response generated
        if (response && this.isConnected) {
          await this.sendChatMessage(response.text, false);
        }
        
        res.json({ success: true, response });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Archive old memories
    this.api.registerRoute('post', '/api/animazingpal/brain/archive', async (req, res) => {
      if (!this.brainEngine) {
        return res.json({ success: false, error: 'Brain Engine not initialized' });
      }
      
      try {
        await this.brainEngine.archiveOldMemories();
        res.json({ success: true, message: 'Memories archived' });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get user interaction history
    this.api.registerRoute('get', '/api/animazingpal/brain/user/:username/history', (req, res) => {
      const { username } = req.params;
      const { limit } = req.query;
      
      if (!this.brainEngine) {
        return res.json({ success: false, error: 'Brain Engine not initialized' });
      }
      
      try {
        const history = this.brainEngine.memoryDb.getInteractionHistory(
          username, 
          parseInt(limit) || 20
        );
        res.json({ success: true, username, history });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get top supporters with interaction data
    this.api.registerRoute('get', '/api/animazingpal/brain/supporters', (req, res) => {
      const { limit } = req.query;
      
      if (!this.brainEngine) {
        return res.json({ success: false, error: 'Brain Engine not initialized' });
      }
      
      try {
        const supporters = this.brainEngine.memoryDb.getTopSupporters(parseInt(limit) || 10);
        res.json({ success: true, supporters });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get frequent chatters with interaction data
    this.api.registerRoute('get', '/api/animazingpal/brain/chatters', (req, res) => {
      const { limit } = req.query;
      
      if (!this.brainEngine) {
        return res.json({ success: false, error: 'Brain Engine not initialized' });
      }
      
      try {
        const chatters = this.brainEngine.memoryDb.getFrequentChatters(parseInt(limit) || 10);
        res.json({ success: true, chatters });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Update user profile notes
    this.api.registerRoute('post', '/api/animazingpal/brain/user/:username/update', (req, res) => {
      const { username } = req.params;
      const updates = req.body;
      
      if (!this.brainEngine) {
        return res.json({ success: false, error: 'Brain Engine not initialized' });
      }
      
      try {
        this.brainEngine.memoryDb.updateUserProfile(username, updates);
        const profile = this.brainEngine.memoryDb.getOrCreateUserProfile(username);
        res.json({ success: true, profile });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get single persona
    this.api.registerRoute('get', '/api/animazingpal/persona/:name', (req, res) => {
      const { name } = req.params;
      
      if (!this.brainEngine) {
        return res.status(400).json({ success: false, error: 'Brain Engine not initialized' });
      }
      
      try {
        const persona = this.brainEngine.getPersonalities().find(p => p.name === name);
        if (!persona) {
          return res.status(404).json({ success: false, error: 'Persona not found' });
        }
        res.json({ success: true, persona });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Update persona
    this.api.registerRoute('put', '/api/animazingpal/persona/:name', async (req, res) => {
      const { name } = req.params;
      const personaData = req.body;
      
      if (!this.brainEngine) {
        return res.status(400).json({ success: false, error: 'Brain Engine not initialized' });
      }
      
      try {
        // Validate required fields
        if (!personaData.display_name || !personaData.system_prompt) {
          return res.status(400).json({ success: false, error: 'Missing required fields' });
        }
        
        // Update persona
        this.brainEngine.memoryDb.updatePersonality(name, personaData);
        const updated = this.brainEngine.getPersonalities().find(p => p.name === name);
        
        // Hot-reload if this is the active persona
        if (this.config.brain.activePersonality === name) {
          await this.brainEngine.loadActivePersonality();
          this.api.log(`Hot-reloaded active persona: ${name}`, 'info');
        }
        
        res.json({ success: true, persona: updated });
      } catch (error) {
        this.api.log(`Persona update error: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Delete persona
    this.api.registerRoute('delete', '/api/animazingpal/persona/:name', (req, res) => {
      const { name } = req.params;
      
      if (!this.brainEngine) {
        return res.status(400).json({ success: false, error: 'Brain Engine not initialized' });
      }
      
      // Prevent deletion of active persona
      if (this.config.brain.activePersonality === name) {
        return res.status(400).json({ success: false, error: 'Cannot delete active persona' });
      }
      
      try {
        this.brainEngine.memoryDb.deletePersonality(name);
        res.json({ success: true, message: 'Persona deleted' });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Test logic matrix evaluation
    this.api.registerRoute('post', '/api/animazingpal/logic-matrix/test', (req, res) => {
      try {
        const { eventType, eventData } = req.body;
        
        if (!eventType) {
          return res.status(400).json({ success: false, error: 'eventType is required' });
        }
        
        const result = this.evaluateLogicMatrix(eventType, eventData || {});
        
        res.json({
          success: true,
          matched: !!result,
          action: result,
          eventType,
          eventData: eventData || {}
        });
      } catch (error) {
        this.api.log(`Logic matrix test error: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Update logic matrix rules
    this.api.registerRoute('post', '/api/animazingpal/logic-matrix/rules', (req, res) => {
      try {
        const { rules } = req.body;
        
        if (!Array.isArray(rules)) {
          return res.status(400).json({ success: false, error: 'rules must be an array' });
        }
        
        // Validate rules structure
        for (const rule of rules) {
          if (!rule.conditions || !rule.actions) {
            return res.status(400).json({ success: false, error: 'Each rule must have conditions and actions' });
          }
        }
        
        this.config.logicMatrix.rules = rules;
        this.api.setConfig('config', this.config);
        
        res.json({ success: true, rules: this.config.logicMatrix.rules });
      } catch (error) {
        this.api.log(`Logic matrix update error: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get logic matrix rules
    this.api.registerRoute('get', '/api/animazingpal/logic-matrix/rules', (req, res) => {
      try {
        const rules = this.config.logicMatrix?.rules || [];
        res.json({ success: true, rules });
      } catch (error) {
        this.api.log(`Logic matrix get error: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Delete logic matrix rule
    this.api.registerRoute('delete', '/api/animazingpal/logic-matrix/rules/:id', (req, res) => {
      try {
        const { id } = req.params;
        
        if (!this.config.logicMatrix?.rules) {
          return res.status(404).json({ success: false, error: 'No rules found' });
        }
        
        const initialLength = this.config.logicMatrix.rules.length;
        this.config.logicMatrix.rules = this.config.logicMatrix.rules.filter(rule => rule.id !== id);
        
        if (this.config.logicMatrix.rules.length === initialLength) {
          return res.status(404).json({ success: false, error: 'Rule not found' });
        }
        
        this.api.setConfig('config', this.config);
        
        res.json({ success: true, rules: this.config.logicMatrix.rules });
      } catch (error) {
        this.api.log(`Logic matrix delete error: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Save brain settings (standalone mode, forceTtsOnly)
    this.api.registerRoute('post', '/api/animazingpal/brain/settings', (req, res) => {
      try {
        const { standaloneMode, forceTtsOnlyOnActions } = req.body;
        
        if (!this.config.brain) {
          this.config.brain = this.getDefaultConfig().brain;
        }
        
        if (standaloneMode !== undefined) {
          this.config.brain.standaloneMode = standaloneMode;
        }
        
        if (forceTtsOnlyOnActions !== undefined) {
          this.config.brain.forceTtsOnlyOnActions = forceTtsOnlyOnActions;
        }
        
        this.api.setConfig('config', this.config);
        this.api.log('Brain settings updated', 'info');
        
        res.json({ success: true, brain: this.getSafeConfig().brain });
      } catch (error) {
        this.api.log(`Brain settings update error: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });
  }

  registerSocketEvents() {
    // Client requests status
    this.api.registerSocket('animazingpal:get-status', () => {
      this.safeEmitStatus();
    });

    // Client requests connection
    this.api.registerSocket('animazingpal:connect', async () => {
      await this.connect();
    });

    // Client requests disconnection
    this.api.registerSocket('animazingpal:disconnect', () => {
      this.disconnect();
    });

    // Client requests data refresh
    this.api.registerSocket('animazingpal:refresh', async () => {
      try {
        await this.refreshAnimazeData();
        this.safeEmitStatus();
      } catch (error) {
        this.api.log(`Error during data refresh: ${error.message}`, 'error');
        this.safeEmitStatus();
      }
    });

    // Client triggers emote
    this.api.registerSocket('animazingpal:emote', async (data) => {
      if (data && data.itemName) {
        await this.triggerEmote(data.itemName);
      }
    });

    // Client triggers special action
    this.api.registerSocket('animazingpal:special-action', async (data) => {
      if (data && data.index !== undefined) {
        await this.triggerSpecialAction(data.index);
      }
    });

    // Client triggers pose
    this.api.registerSocket('animazingpal:pose', async (data) => {
      if (data && data.index !== undefined) {
        await this.triggerPose(data.index);
      }
    });

    // Client triggers idle
    this.api.registerSocket('animazingpal:idle', async (data) => {
      if (data && data.index !== undefined) {
        await this.triggerIdle(data.index);
      }
    });

    // Client sends ChatPal message
    this.api.registerSocket('animazingpal:chatpal', async (data) => {
      if (data && data.message) {
        await this.sendChatMessage(data.message, data.useEcho);
      }
    });

    // Client loads avatar
    this.api.registerSocket('animazingpal:load-avatar', async (data) => {
      if (data && data.name) {
        await this.loadAvatar(data.name);
      }
    });

    // Client loads scene
    this.api.registerSocket('animazingpal:load-scene', async (data) => {
      if (data && data.name) {
        await this.loadScene(data.name);
      }
    });
  }

  registerTikTokEvents() {
    // TikTok connected event - set streamer ID for per-streamer memory
    this.api.registerTikTokEvent('connected', (data) => {
      if (data && data.roomId) {
        const streamerId = data.uniqueId || data.roomId || 'default';
        this.api.log(`TikTok connected to streamer: ${streamerId}`, 'info');
        
        // Set streamer ID in brain engine for per-streamer memory
        if (this.brainEngine) {
          this.brainEngine.setStreamerId(streamerId);
          
          // Mark new stream session for all known users
          if (this.config.brain?.enabled) {
            this._incrementStreamCountsForKnownUsers();
          }
        }
        
        // Store connection as memory
        if (this.brainEngine && this.config.brain?.enabled) {
          this.brainEngine.storeMemory(`Stream gestartet für ${streamerId}`, {
            type: 'stream_start',
            event: 'connected',
            importance: 0.6
          });
        }

        this.recordViewerbaseActivity('connected', {
          streamerId
        });
      }
    });

    // TikTok disconnected event
    this.api.registerTikTokEvent('disconnected', (data) => {
      this.api.log('TikTok disconnected', 'info');
      
      if (this.brainEngine && this.config.brain?.enabled) {
        this.brainEngine.storeMemory('Stream beendet', {
          type: 'stream_end',
          event: 'disconnected',
          importance: 0.4
        });
      }

      this.recordViewerbaseActivity('disconnected', {});
    });

    // Gift events
    this.api.registerTikTokEvent('gift', (data) => {
      this.handleGiftEvent(data);
    });

    // Chat events
    this.api.registerTikTokEvent('chat', (data) => {
      this.handleChatEvent(data);
    });

    // Follow events
    this.api.registerTikTokEvent('follow', (data) => {
      this.handleFollowEvent(data);
    });

    // Share events
    this.api.registerTikTokEvent('share', (data) => {
      this.handleShareEvent(data);
    });

    // Like events
    this.api.registerTikTokEvent('like', (data) => {
      this.handleLikeEvent(data);
    });

    // Subscribe events
    this.api.registerTikTokEvent('subscribe', (data) => {
      this.handleSubscribeEvent(data);
    });

    this.api.registerTikTokEvent('join', (data) => {
      this.processLiveHostEvent('join', data).catch(error => this.api.log(`Live host join error: ${error.message}`, 'warn'));
      this.recordViewerbaseActivity('join', {
        username: data.uniqueId || 'Someone',
        nickname: data.nickname || data.uniqueId || 'Someone'
      });
    });

    this.api.log('TikTok event handlers registered for AnimazingPal', 'info');
  }

  // ==================== Connection Management ====================

  async connect() {
    const platformKey = this.getActivePlatformKey();
    if (platformKey !== 'animaze') {
      const adapter = this.getActivePlatformAdapter();
      if (!adapter) {
        this.api.log(`Platform ${platformKey} is not supported`, 'error');
        this.safeEmitStatus();
        return false;
      }

      if (adapter.isConnected) {
        this.isConnected = true;
        this.safeEmitStatus();
        return true;
      }

      const connected = await adapter.connect();
      this.isConnected = !!adapter.isConnected;
      if (connected && this.isConnected) {
        try {
          const profile = this.getPlatformProfile(platformKey);
          if (profile.autoRefreshData !== false && typeof adapter.refreshData === 'function') {
            await adapter.refreshData();
          }
        } catch (refreshError) {
          this.api.log(`Initial data refresh failed for ${adapter.getLabel ? adapter.getLabel() : platformKey}: ${refreshError.message}`, 'warn');
        }
        const platformData = adapter.getData ? adapter.getData() : {};
        this.animazeData = platformData;
        this.api.emit('animazingpal:data-refreshed', platformData);
      }

      this.safeEmitStatus();
      return connected;
    }

    if (this.isConnected) {
      this.api.log('Already connected to Animaze', 'warn');
      return true;
    }

    // Validate configuration before attempting connection
    if (!this.config || !this.config.host || !this.config.port) {
      const errorMsg = 'Invalid configuration: host and port are required';
      this.api.log(errorMsg, 'error');
      this.safeEmitStatus();
      return false;
    }

    // Validate host and port values
    if (typeof this.config.host !== 'string' || this.config.host.trim() === '') {
      const errorMsg = `Invalid host: ${this.config.host}`;
      this.api.log(errorMsg, 'error');
      this.safeEmitStatus();
      return false;
    }

    const port = parseInt(this.config.port);
    if (isNaN(port) || port < 1 || port > 65535) {
      const errorMsg = `Invalid port: ${this.config.port}`;
      this.api.log(errorMsg, 'error');
      this.safeEmitStatus();
      return false;
    }

    // Close any existing WebSocket connection before creating a new one
    if (this.ws) {
      try {
        this.ws.close();
      } catch (error) {
        // Ignore errors when closing old connection
        if (this.config && this.config.verboseLogging) {
          this.api.log(`Error closing old connection: ${error.message}`, 'debug');
        }
      }
      this.ws = null;
    }

    const wsUrl = `ws://${this.config.host}:${this.config.port}`;
    this.api.log(`Connecting to Animaze at ${wsUrl}...`, 'info');

    if (this.config && this.config.verboseLogging) {
      this.api.log(`Connection attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts}`, 'debug');
    }

    return new Promise((resolve) => {
      let resolved = false; // Guard to prevent multiple resolve calls
      const safeResolve = (value) => {
        if (!resolved) {
          resolved = true;
          resolve(value);
        }
      };

      try {
        // WebSocket initialization wrapped in try-catch
        this.ws = new WebSocket(wsUrl);

        if (this.config && this.config.verboseLogging) {
          this.api.log('WebSocket instance created, setting up event handlers...', 'debug');
        }

        this.ws.on('open', async () => {
          this.isConnected = true;
          this.reconnectTimer = null;
          this.reconnectAttempts = 0;
          this.api.log('Connected to Animaze successfully', 'info');
          
          // Auto-refresh Animaze data
          if (this.config.autoRefreshData) {
            try {
              await this.refreshAnimazeData();
              if (this.config && this.config.verboseLogging) {
                this.api.log('Animaze data refreshed successfully', 'debug');
              }
            } catch (refreshError) {
              this.api.log(`Failed to refresh Animaze data: ${refreshError.message}`, 'warn');
              // Don't fail connection if data refresh fails
            }
          }
          
          this.safeEmitStatus();
          safeResolve(true);
        });

        this.ws.on('message', (data) => {
          try {
            this.handleAnimazeMessage(data);
          } catch (msgError) {
            this.api.log(`Error handling Animaze message: ${msgError.message}`, 'error');
            if (this.config && this.config.verboseLogging) {
              this.api.log(`Message handling error stack: ${msgError.stack}`, 'debug');
            }
          }
        });

        this.ws.on('close', (code, reason) => {
          const wasConnected = this.isConnected;
          this.isConnected = false;
          
          if (this.config && this.config.verboseLogging) {
            this.api.log(`WebSocket closed with code ${code}, reason: ${reason}`, 'debug');
          }
          
          this.api.log('Disconnected from Animaze', 'info');
          this.safeEmitStatus();
          
          if (this.shouldReconnectAfterAnimazeClose(wasConnected)) {
            this.scheduleReconnect();
          }
        });

        this.ws.on('error', (error) => {
          const errorMsg = error.message || 'Unknown WebSocket error';
          const errorCode = error.code || 'N/A';
          
          this.api.log(`Animaze WebSocket error: ${errorMsg} (code: ${errorCode})`, 'error');
          
          if (this.config && this.config.verboseLogging) {
            this.api.log(`WebSocket error details: ${JSON.stringify({
              message: errorMsg,
              code: errorCode,
              errno: error.errno,
              syscall: error.syscall,
              address: error.address,
              port: error.port
            })}`, 'debug');
          }
          
          this.isConnected = false;
          this.safeEmitStatus();
          safeResolve(false);
        });

        // Connection timeout
        setTimeout(() => {
          if (!this.isConnected && !resolved) {
            this.api.log('Connection to Animaze timed out', 'warn');
            if (this.ws) {
              try {
                this.ws.close();
              } catch (closeError) {
                // Ignore errors when closing timed out connection
                if (this.config && this.config.verboseLogging) {
                  this.api.log(`Error closing timed out connection: ${closeError.message}`, 'debug');
                }
              }
            }
            safeResolve(false);
          }
        }, this.config.connectionTimeoutMs || 10000);

      } catch (error) {
        const errorMsg = error.message || 'Unknown error during WebSocket initialization';
        this.api.log(`Failed to connect to Animaze: ${errorMsg}`, 'error');
        
        if (this.config && this.config.verboseLogging) {
          this.api.log(`Connection error stack: ${error.stack}`, 'debug');
        }
        
        this.isConnected = false;
        this.safeEmitStatus();
        safeResolve(false);
      }
    });
  }

  disconnect() {
    const platformKey = this.getActivePlatformKey();
    if (platformKey !== 'animaze') {
      const adapter = this.getActivePlatformAdapter();

      if (adapter && typeof adapter.disconnect === 'function') {
        try {
          adapter.disconnect();
        } catch (error) {
          this.api.log(`Error disconnecting ${adapter.getLabel ? adapter.getLabel() : platformKey}: ${error.message}`, 'warn');
        }
      }

      if (this.ws) {
        try {
          this.ws.close();
        } catch (error) {
          if (this.config && this.config.verboseLogging) {
            this.api.log(`Error closing legacy Animaze socket during adapter disconnect: ${error.message}`, 'debug');
          }
        }
        this.ws = null;
      }

      this.isConnected = false;
      this.reconnectAttempts = 0;
      this.safeEmitStatus();
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    // Clear pending requests to prevent memory leak
    this.pendingRequests.forEach(({ resolve }) => resolve(null));
    this.pendingRequests.clear();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.api.log('Disconnected from Animaze', 'info');
    this.safeEmitStatus();
  }

  scheduleReconnect() {
    if (this.reconnectTimer) {
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.api.log(`Max reconnect attempts (${this.maxReconnectAttempts}) reached. Please reconnect manually.`, 'warn');
      this.safeEmitStatus();
      return;
    }

    this.reconnectAttempts++;
    
    // Linear backoff: base delay * attempt number
    const delay = this.config.reconnectDelay * this.reconnectAttempts;
    
    this.api.log(`Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms...`, 'info');
    
    if (this.config && this.config.verboseLogging) {
      this.api.log(`Reconnect delay calculated: ${this.config.reconnectDelay}ms * ${this.reconnectAttempts} = ${delay}ms`, 'debug');
    }
    
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        this.api.log(`Attempting reconnection (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`, 'info');
        await this.connect();
      } catch (error) {
        this.api.log(`Reconnect attempt ${this.reconnectAttempts} failed: ${error.message}`, 'error');
        if (this.config && this.config.verboseLogging) {
          this.api.log(`Reconnect error stack: ${error.stack}`, 'debug');
        }
      }
    }, delay);
  }

  shouldReconnectAfterAnimazeClose(wasConnected) {
    return Boolean(
      wasConnected
      && this.config
      && this.config.enabled
      && this.config.reconnectOnDisconnect
    );
  }

  handleAnimazeMessage(data) {
    try {
      const message = JSON.parse(data.toString());
      
      if (this.config && this.config.verboseLogging) {
        this.api.log(`Animaze message: ${JSON.stringify(message)}`, 'debug');
      }

      // Handle response with ID (for pending requests)
      if (message.id && this.pendingRequests.has(message.id)) {
        const { resolve } = this.pendingRequests.get(message.id);
        this.pendingRequests.delete(message.id);
        resolve(message);
        return;
      }

      // Handle events/triggers from Animaze
      if (message.event) {
        switch (message.event) {
          case 'ChatbotSpeechStarted':
            this.api.log('ChatPal started speaking', 'debug');
            this.api.emit('animazingpal:speech-start', message);
            break;
          case 'ChatbotSpeechEnded':
            this.api.log('ChatPal finished speaking', 'debug');
            this.api.emit('animazingpal:speech-end', message);
            break;
          case 'AvatarChanged':
            this.api.log(`Avatar changed to: ${message.new_avatar}`, 'info');
            this.animazeData.currentAvatar = message.new_avatar;
            this.api.emit('animazingpal:avatar-changed', message);
            // Refresh avatar-specific data
            this.refreshAvatarData();
            break;
          default:
            this.api.emit('animazingpal:event', message);
        }
        return;
      }

      // Handle action responses (without ID)
      if (message.action) {
        this.handleActionResponse(message);
      }

      // Handle errors
      if (message.error) {
        this.api.log(`Animaze error: ${message.error}`, 'error');
        this.api.emit('animazingpal:error', message);
      }

    } catch (error) {
      if (this.config && this.config.verboseLogging) {
        this.api.log(`Failed to parse Animaze message: ${error.message}`, 'warn');
      }
    }
  }

  handleActionResponse(message) {
    // Update local data cache based on response type
    switch (message.action) {
      case 'GetAvatars':
        if (message.avatars) {
          this.animazeData.avatars = message.avatars;
        }
        break;
      case 'GetScenes':
        if (message.scenes) {
          this.animazeData.scenes = message.scenes;
        }
        break;
      case 'GetEmotes':
        if (message.emotes) {
          this.animazeData.emotes = message.emotes;
        }
        break;
      case 'GetSpecialActions':
        if (message.specialActions) {
          this.animazeData.specialActions = message.specialActions;
        }
        break;
      case 'GetPoses':
        if (message.poseList) {
          this.animazeData.poses = message.poseList;
        }
        break;
      case 'GetIdleAnims':
        if (message.idleList) {
          this.animazeData.idleAnims = message.idleList;
        }
        break;
      case 'GetCurrentAvatarInfo':
        if (message.avatars && message.avatars.length > 0) {
          this.animazeData.currentAvatar = message.avatars[0];
        }
        break;
      case 'GetCurrentSceneInfo':
        this.animazeData.currentScene = message;
        break;
      case 'ChatbotSendMessage':
        if (message.response) {
          this.api.log(`ChatPal response: ${message.response}`, 'info');
          this.api.emit('animazingpal:chatpal-response', { response: message.response });
        }
        break;
    }
  }

  // ==================== Animaze API Commands ====================

  /**
   * Generate a unique request ID
   */
  generateRequestId() {
    return `ltth_${++this.requestIdCounter}_${Date.now()}`;
  }

  /**
   * Send command to Animaze and optionally wait for response
   */
  sendCommand(command, waitForResponse = false) {
    if (!this.isConnected || !this.ws) {
      this.api.log('Cannot send command: Not connected to Animaze', 'warn');
      return waitForResponse ? Promise.resolve(null) : false;
    }

    try {
      // Add request ID if waiting for response
      if (waitForResponse) {
        command.id = this.generateRequestId();
      }

      const message = JSON.stringify(command);
      this.ws.send(message);
      
      if (this.config && this.config.verboseLogging) {
        this.api.log(`Sent to Animaze: ${message}`, 'debug');
      }

      if (waitForResponse) {
        return new Promise((resolve) => {
          this.pendingRequests.set(command.id, { resolve });
          
          // Timeout after 10 seconds
          setTimeout(() => {
            if (this.pendingRequests.has(command.id)) {
              this.pendingRequests.delete(command.id);
              resolve(null);
            }
          }, 10000);
        });
      }
      
      return true;
    } catch (error) {
      this.api.log(`Failed to send command to Animaze: ${error.message}`, 'error');
      return waitForResponse ? Promise.resolve(null) : false;
    }
  }

  /**
   * Refresh all Animaze data (avatars, scenes, emotes, etc.)
   */
  async refreshAnimazeData() {
    const platformKey = this.getActivePlatformKey();
    if (platformKey !== 'animaze') {
      const adapter = this.getActivePlatformAdapter();
      if (!adapter) {
        throw new Error(`Platform ${platformKey} is not available`);
      }

      const data = await adapter.refreshData();
      const platformData = data || adapter.getData?.() || {};
      this.animazeData = platformData;
      this.api.emit('animazingpal:data-refreshed', platformData);
      return platformData;
    }

    if (!this.isConnected) {
      const errorMsg = 'Cannot refresh data: Not connected to Animaze';
      this.api.log(errorMsg, 'warn');
      throw new Error(errorMsg);
    }

    try {
      this.api.log('Refreshing Animaze data...', 'info');

      if (this.config && this.config.verboseLogging) {
        this.api.log('Requesting avatars list...', 'debug');
      }

      // Get avatars
      const avatarsResp = await this.sendCommand({ action: 'GetAvatars' }, true);
      if (avatarsResp && avatarsResp.avatars) {
        this.animazeData.avatars = avatarsResp.avatars;
        if (this.config && this.config.verboseLogging) {
          this.api.log(`Received ${avatarsResp.avatars.length} avatars`, 'debug');
        }
      }

      // Get scenes
      const scenesResp = await this.sendCommand({ action: 'GetScenes' }, true);
      if (scenesResp && scenesResp.scenes) {
        this.animazeData.scenes = scenesResp.scenes;
        if (this.config && this.config.verboseLogging) {
          this.api.log(`Received ${scenesResp.scenes.length} scenes`, 'debug');
        }
      }

      // Get emotes
      const emotesResp = await this.sendCommand({ action: 'GetEmotes' }, true);
      if (emotesResp && emotesResp.emotes) {
        this.animazeData.emotes = emotesResp.emotes;
        if (this.config && this.config.verboseLogging) {
          this.api.log(`Received ${emotesResp.emotes.length} emotes`, 'debug');
        }
      }

      // Get avatar-specific data
      await this.refreshAvatarData();

      // Get current avatar info
      const currentAvatarResp = await this.sendCommand({ action: 'GetCurrentAvatarInfo' }, true);
      if (currentAvatarResp && currentAvatarResp.avatars && currentAvatarResp.avatars.length > 0) {
        this.animazeData.currentAvatar = currentAvatarResp.avatars[0];
        if (this.config && this.config.verboseLogging) {
          this.api.log(`Current avatar: ${currentAvatarResp.avatars[0].name || 'Unknown'}`, 'debug');
        }
      }

      // Get current scene info
      const currentSceneResp = await this.sendCommand({ action: 'GetCurrentSceneInfo' }, true);
      if (currentSceneResp) {
        this.animazeData.currentScene = currentSceneResp;
      }

      this.api.log(`Refreshed Animaze data: ${this.animazeData.avatars.length} avatars, ${this.animazeData.emotes.length} emotes`, 'info');
      this.api.emit('animazingpal:data-refreshed', this.animazeData);
    } catch (error) {
      const errorMsg = `Error refreshing Animaze data: ${error.message}`;
      this.api.log(errorMsg, 'error');
      if (this.config && this.config.verboseLogging) {
        this.api.log(`Data refresh error stack: ${error.stack}`, 'debug');
      }
      throw error;
    }
  }

  /**
   * Refresh avatar-specific data (special actions, poses, idles)
   */
  async refreshAvatarData() {
    if (this.getActivePlatformKey() !== 'animaze') {
      return this.refreshAnimazeData();
    }

    try {
      if (this.config && this.config.verboseLogging) {
        this.api.log('Refreshing avatar-specific data...', 'debug');
      }

      // Get special actions for current avatar
      const specialActionsResp = await this.sendCommand({ action: 'GetSpecialActions' }, true);
      if (specialActionsResp && specialActionsResp.specialActions) {
        this.animazeData.specialActions = specialActionsResp.specialActions;
        if (this.config && this.config.verboseLogging) {
          this.api.log(`Received ${specialActionsResp.specialActions.length} special actions`, 'debug');
        }
      }

      // Get poses for current avatar
      const posesResp = await this.sendCommand({ action: 'GetPoses' }, true);
      if (posesResp && posesResp.poseList) {
        this.animazeData.poses = posesResp.poseList;
        if (this.config && this.config.verboseLogging) {
          this.api.log(`Received ${posesResp.poseList.length} poses`, 'debug');
        }
      }

      // Get idle animations for current avatar
      const idlesResp = await this.sendCommand({ action: 'GetIdleAnims' }, true);
      if (idlesResp && idlesResp.idleList) {
        this.animazeData.idleAnims = idlesResp.idleList;
        if (this.config && this.config.verboseLogging) {
          this.api.log(`Received ${idlesResp.idleList.length} idle animations`, 'debug');
        }
      }
    } catch (error) {
      this.api.log(`Error refreshing avatar data: ${error.message}`, 'error');
      if (this.config && this.config.verboseLogging) {
        this.api.log(`Avatar data refresh error stack: ${error.stack}`, 'debug');
      }
      // Don't re-throw, allow partial data refresh
    }
  }

  /**
   * Load an avatar by name
   */
  async loadAvatar(name) {
    const platformKey = this.getActivePlatformKey();
    if (platformKey !== 'animaze') {
      const adapter = this.getActivePlatformAdapter();
      if (!adapter || typeof adapter.loadAvatar !== 'function') {
        return false;
      }

      const success = await adapter.loadAvatar(name);
      if (success) {
        this.api.log(`Loaded avatar/model on ${adapter.getLabel ? adapter.getLabel() : platformKey}: ${name}`, 'info');
        this.api.emit('animazingpal:avatar-loading', { name, platform: platformKey });
      }
      return success;
    }

    const command = {
      action: 'LoadAvatar',
      name: name
    };
    
    const success = this.sendCommand(command);
    
    if (success) {
      this.api.log(`Loading avatar: ${name}`, 'info');
      this.api.emit('animazingpal:avatar-loading', { name });
    }
    
    return success;
  }

  /**
   * Load a scene by name
   */
  async loadScene(name) {
    const platformKey = this.getActivePlatformKey();
    if (platformKey !== 'animaze') {
      const adapter = this.getActivePlatformAdapter();
      if (!adapter || typeof adapter.loadScene !== 'function') {
        return false;
      }

      return adapter.loadScene(name);
    }

    const command = {
      action: 'LoadScene',
      name: name
    };
    
    const success = this.sendCommand(command);
    
    if (success) {
      this.api.log(`Loading scene: ${name}`, 'info');
      this.api.emit('animazingpal:scene-loading', { name });
    }
    
    return success;
  }

  /**
   * Trigger an emote by itemName
   */
  async triggerEmote(itemName) {
    const platformKey = this.getActivePlatformKey();
    if (platformKey !== 'animaze') {
      const adapter = this.getActivePlatformAdapter();
      if (!adapter || typeof adapter.executeAction !== 'function') {
        return false;
      }

      let success = false;
      if (platformKey === 'vtube-studio') {
        success = await adapter.executeAction('hotkey', itemName);
      } else if (platformKey === 'vseeface') {
        success = await adapter.executeAction('expression', itemName);
      } else {
        success = await adapter.executeAction('emote', itemName);
      }

      if (success) {
        this.api.log(`Triggered platform action for emote: ${itemName}`, 'info');
        this.api.emit('animazingpal:emote-triggered', { itemName, platform: platformKey });
      }

      return success;
    }

    const command = {
      action: 'TriggerEmote',
      itemName: itemName
    };
    
    const success = this.sendCommand(command);
    
    if (success) {
      this.api.log(`Triggered emote: ${itemName}`, 'info');
      this.api.emit('animazingpal:emote-triggered', { itemName });
    }
    
    return success;
  }

  /**
   * Trigger a special action by index
   */
  async triggerSpecialAction(index) {
    const platformKey = this.getActivePlatformKey();
    if (platformKey !== 'animaze') {
      const adapter = this.getActivePlatformAdapter();
      if (!adapter || typeof adapter.executeAction !== 'function') {
        return false;
      }

      let success = false;
      if (platformKey === 'vtube-studio') {
        success = await adapter.executeAction('hotkey', index);
      } else if (platformKey === 'vseeface') {
        success = await adapter.executeAction('motion', index);
      } else {
        success = await adapter.executeAction('specialAction', index);
      }

      if (success) {
        this.api.log(`Triggered platform action for special action: ${index}`, 'info');
        this.api.emit('animazingpal:special-action-triggered', { index, platform: platformKey });
      }

      return success;
    }

    const command = {
      action: 'TriggerSpecialAction',
      index: parseInt(index)
    };
    
    const success = this.sendCommand(command);
    
    if (success) {
      const actionName = this.animazeData.specialActions.find(a => a.index === index)?.animName || index;
      this.api.log(`Triggered special action: ${actionName}`, 'info');
      this.api.emit('animazingpal:special-action-triggered', { index, name: actionName });
    }
    
    return success;
  }

  /**
   * Trigger a pose by index
   */
  async triggerPose(index) {
    const platformKey = this.getActivePlatformKey();
    if (platformKey !== 'animaze') {
      const adapter = this.getActivePlatformAdapter();
      if (!adapter || typeof adapter.executeAction !== 'function') {
        return false;
      }

      let success = false;
      if (platformKey === 'vtube-studio') {
        success = await adapter.executeAction('hotkey', index);
      } else if (platformKey === 'vseeface') {
        success = await adapter.executeAction('motion', index);
      } else {
        success = await adapter.executeAction('pose', index);
      }

      if (success) {
        this.api.log(`Triggered platform pose/motion: ${index}`, 'info');
        this.api.emit('animazingpal:pose-triggered', { index, platform: platformKey });
      }

      return success;
    }

    const command = {
      action: 'TriggerPose',
      index: parseInt(index)
    };
    
    const success = this.sendCommand(command);
    
    if (success) {
      const poseName = this.animazeData.poses.find(p => p.index === index)?.animName || index;
      this.api.log(`Triggered pose: ${poseName}`, 'info');
      this.api.emit('animazingpal:pose-triggered', { index, name: poseName });
    }
    
    return success;
  }

  /**
   * Trigger an idle animation by index
   */
  async triggerIdle(index) {
    const platformKey = this.getActivePlatformKey();
    if (platformKey !== 'animaze') {
      const adapter = this.getActivePlatformAdapter();
      if (!adapter || typeof adapter.executeAction !== 'function') {
        return false;
      }

      let success = false;
      if (platformKey === 'vtube-studio') {
        success = await adapter.executeAction('hotkey', index);
      } else if (platformKey === 'vseeface') {
        success = await adapter.executeAction('reset', index);
      } else {
        success = await adapter.executeAction('idle', index);
      }

      if (success) {
        this.api.log(`Triggered platform idle/reset: ${index}`, 'info');
        this.api.emit('animazingpal:idle-triggered', { index, platform: platformKey });
      }

      return success;
    }

    const command = {
      action: 'TriggerIdle',
      index: parseInt(index)
    };
    
    const success = this.sendCommand(command);
    
    if (success) {
      const idleName = this.animazeData.idleAnims.find(i => i.index === index)?.animName || index;
      this.api.log(`Triggered idle: ${idleName}`, 'info');
      this.api.emit('animazingpal:idle-triggered', { index, name: idleName });
    }
    
    return success;
  }

  /**
   * Send a message to ChatPal
   * @param {string} message - The message to send
   * @param {boolean} useEcho - If true, use -echo prefix for TTS only (no AI response)
   */
  async sendChatMessage(message, useEcho = false) {
    if (this.getActivePlatformKey() !== 'animaze') {
      const adapter = this.getActivePlatformAdapter();
      if (!adapter || typeof adapter.sendChatMessage !== 'function') {
        return false;
      }

      const success = await adapter.sendChatMessage(message, useEcho);
      if (success) {
        this.api.emit('animazingpal:chatpal-message-sent', { message, useEcho, platform: this.getActivePlatformKey() });
      }
      return success;
    }

    // Ensure -echo prefix is added when echo path is chosen
    // Use a specific check to avoid issues if message naturally starts with '-echo'
    let finalMessage = message;
    const ECHO_PREFIX = '-echo ';
    
    if (useEcho && !message.startsWith(ECHO_PREFIX)) {
      finalMessage = `${ECHO_PREFIX}${message}`;
    }
    
    const command = {
      action: 'ChatbotSendMessage',
      message: finalMessage
    };
    
    const success = this.sendCommand(command);
    
    if (success) {
      this.api.log(`Sent to ChatPal: ${finalMessage}`, 'info');
      this.api.emit('animazingpal:chatpal-message-sent', { message: finalMessage, useEcho });
    }
    
    return success;
  }

  /**
   * Helper method to resolve echo setting based on priority:
   * 1. Per-event override
   * 2. forceTtsOnlyOnActions
   * 3. Global chatToAvatar.useEcho setting
   * 
   * @param {string} eventType - The event type (gift, follow, etc.)
   * @returns {boolean} Whether to use echo
   */
  resolveEchoSetting(eventType) {
    const eventAction = this.config.eventActions?.[eventType];
    
    // Priority 1: Per-event override
    if (eventAction && eventAction.useEcho !== null && eventAction.useEcho !== undefined) {
      return eventAction.useEcho;
    }
    
    // Priority 2: forceTtsOnlyOnActions
    if (this.config.brain?.forceTtsOnlyOnActions) {
      return true;
    }
    
    // Priority 3: Global setting
    return this.config.chatToAvatar?.useEcho || false;
  }

  /**
   * Set an override behavior
   */
  async setOverride(behavior, value, params = {}) {
    if (this.getActivePlatformKey() !== 'animaze') {
      const adapter = this.getActivePlatformAdapter();
      if (!adapter || typeof adapter.setOverride !== 'function') {
        return false;
      }

      return adapter.setOverride(behavior, value, params);
    }

    const command = {
      action: 'SetOverride',
      behavior: behavior,
      value: !!value,
      ...params
    };
    
    const success = this.sendCommand(command);
    
    if (success) {
      this.api.log(`Set override ${behavior}: ${value}`, 'info');
    }
    
    return success;
  }

  /**
   * Get an override behavior status
   */
  async getOverride(behavior) {
    if (this.getActivePlatformKey() !== 'animaze') {
      const adapter = this.getActivePlatformAdapter();
      if (!adapter || typeof adapter.getOverride !== 'function') {
        return null;
      }

      return adapter.getOverride(behavior);
    }

    const command = {
      action: 'GetOverride',
      behavior: behavior
    };
    
    const response = await this.sendCommand(command, true);
    return response || { behavior, value: false };
  }

  /**
   * Calibrate the tracker
   */
  async calibrateTracker() {
    if (this.getActivePlatformKey() !== 'animaze') {
      const adapter = this.getActivePlatformAdapter();
      if (!adapter || typeof adapter.calibrateTracker !== 'function') {
        return false;
      }

      return adapter.calibrateTracker();
    }

    const command = { action: 'CalibrateTracker' };
    
    const success = this.sendCommand(command);
    
    if (success) {
      this.api.log('Calibrating tracker...', 'info');
    }
    
    return success;
  }

  /**
   * Enable/disable virtual camera broadcast
   */
  async setBroadcast(toggle) {
    if (this.getActivePlatformKey() !== 'animaze') {
      const adapter = this.getActivePlatformAdapter();
      if (!adapter || typeof adapter.setBroadcast !== 'function') {
        return false;
      }

      return adapter.setBroadcast(toggle);
    }

    const command = {
      action: 'Broadcast',
      toggle: !!toggle
    };
    
    const success = this.sendCommand(command);
    
    if (success) {
      this.api.log(`Broadcast ${toggle ? 'enabled' : 'disabled'}`, 'info');
    }
    
    return success;
  }

  // ==================== TikTok Event Handlers ====================

  /**
   * Build a standalone response without GPT
   * Uses persona catchphrases and templates
   */
  buildStandaloneResponse(eventType, data = {}) {
    const personality = this.brainEngine?.currentPersonality;
    const catchphrases = personality?.catchphrases || [];
    
    // Default templates if no persona is active
    const defaultTemplates = {
      gift: [
        'Thank you {username} for the {giftName}!',
        'Wow, {username}! Thanks for {giftName}!',
        'Amazing! Thanks {username} for {giftName}!'
      ],
      follow: [
        'Welcome {username}!',
        'Hey {username}, thanks for following!',
        'Great to see you {username}!'
      ],
      subscribe: [
        'Thank you {username} for subscribing!',
        'Wow! Thanks for the sub {username}!',
        '{username} subscribed! Amazing!'
      ],
      share: [
        'Thanks for sharing {username}!',
        '{username} shared the stream! Thank you!',
        'Appreciate the share, {username}!'
      ],
      chat: [
        '{username} says: {message}',
        'Hey {username}: {message}'
      ]
    };
    
    // Try to use persona catchphrases first, otherwise use default templates
    let templates = defaultTemplates[eventType] || [];
    
    if (catchphrases.length > 0) {
      // Filter catchphrases by event type if they have tags
      const filtered = catchphrases.filter(phrase => {
        if (typeof phrase === 'object' && phrase.tags) {
          return phrase.tags.includes(eventType);
        }
        return true;
      });
      
      if (filtered.length > 0) {
        templates = filtered.map(p => typeof p === 'string' ? p : p.text);
      }
    }
    
    if (templates.length === 0) {
      return null;
    }
    
    // Pick a random template
    const template = templates[Math.floor(Math.random() * templates.length)];
    
    // Replace placeholders
    let message = template;
    for (const [key, value] of Object.entries(data)) {
      message = message.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    
    return message;
  }

  isVrchatIntegrationEnabled() {
    return !!this.config?.vrchatIntegration?.enabled;
  }

  getVrchatIntegrationConfig() {
    const defaults = this.getDefaultConfig().vrchatIntegration || {};
    const config = this.config?.vrchatIntegration || {};
    return {
      ...defaults,
      ...config,
      eventMappings: {
        ...(defaults.eventMappings || {}),
        ...(config.eventMappings || {})
      }
    };
  }

  getVrchatEventMapping(eventType) {
    const integration = this.getVrchatIntegrationConfig();
    const defaults = this.getDefaultConfig().vrchatIntegration?.eventMappings || {};
    const eventDefaults = defaults[eventType] || {};
    const eventConfig = integration.eventMappings?.[eventType] || {};
    return {
      ...eventDefaults,
      ...eventConfig
    };
  }

  formatTemplate(template, data = {}) {
    if (!template || typeof template !== 'string') {
      return '';
    }

    let message = template;
    for (const [key, value] of Object.entries(data)) {
      const replacement = value === null || value === undefined ? '' : String(value);
      message = message.replace(new RegExp(`\\{${key}\\}`, 'g'), replacement);
    }

    return message;
  }

  buildVrchatIntent(eventType, payload = {}) {
    const integration = this.getVrchatIntegrationConfig();
    const mapping = this.getVrchatEventMapping(eventType);
    const kind = payload.kind || mapping.kind || 'chatbox';
    const messageTemplate = payload.messageTemplate || mapping.messageTemplate || '';
    const message = payload.message !== undefined
      ? payload.message
      : this.formatTemplate(messageTemplate, payload);

    return {
      source: 'animazingpal',
      targetPluginId: payload.targetPluginId || integration.targetPluginId || 'osc-bridge',
      targetLabel: payload.targetLabel || integration.targetLabel || 'OSC-Bridge',
      eventType,
      kind,
      username: payload.username || null,
      message: message || null,
      gesture: payload.gesture !== undefined ? payload.gesture : mapping.gesture,
      slot: payload.slot !== undefined ? payload.slot : mapping.slot,
      duration: payload.duration !== undefined ? payload.duration : mapping.duration,
      showTyping: payload.showTyping !== undefined ? payload.showTyping : integration.sendTypingIndicator,
      parameters: payload.parameters || mapping.parameters || null,
      metadata: {
        ...(payload.metadata || {}),
        mapping,
        integrationEnabled: true
      },
      timestamp: new Date().toISOString()
    };
  }

  emitVrchatIntent(eventType, payload = {}) {
    if (!this.isVrchatIntegrationEnabled()) {
      return false;
    }

    const mapping = this.getVrchatEventMapping(eventType);
    if (mapping.enabled === false) {
      return false;
    }

    const intent = this.buildVrchatIntent(eventType, payload);
    this.api.emit('animazingpal:vrchat-intent', intent);
    return intent;
  }

  async speakHostResponse(message, options = {}) {
    this.ensureLiveHostRuntime();
    const liveHost = normalizeLiveHostConfig(this.config?.brain?.liveHost || {}, this.config?.brain || {});
    if (!liveHost.enabled || !liveHost.tts.enabled || !message) {
      return { success: false, blocked: true, reason: 'host_tts_disabled' };
    }

    const ttsPlugin = this.api.getPluginInstance?.('tts') || this.api.getPlugin?.('tts');
    if (!ttsPlugin || typeof ttsPlugin.speak !== 'function') {
      this.api.log('AnimazingPal host speech skipped: TTS plugin unavailable', 'warn');
      return { success: false, blocked: true, reason: 'tts_plugin_unavailable' };
    }

    const eventConfig = liveHost.events[options.eventType] || {};
    const activeBundle = liveHost.avatarBundles.find(bundle => bundle.id === liveHost.activeAvatarBundleId) || {};
    const pick = (eventValue, bundleValue, globalValue) => {
      if (eventValue !== null && eventValue !== undefined && eventValue !== '') return eventValue;
      if (bundleValue !== null && bundleValue !== undefined && bundleValue !== '') return bundleValue;
      return globalValue;
    };
    const request = {
      text: String(message).slice(0, liveHost.response.maxCharacters),
      userId: options.userId || 'animazingpal-host',
      username: options.username || 'AnimazingPal',
      voiceId: pick(eventConfig.voiceId, activeBundle.voiceId, liveHost.tts.voiceId) || null,
      engine: 'fishaudio',
      source: 'animazingpal',
      teamLevel: 99,
      priority: pick(eventConfig.priority, activeBundle.priority, liveHost.tts.priority),
      emotion: pick(eventConfig.emotion, activeBundle.emotion, liveHost.tts.emotion),
      pitch: pick(eventConfig.pitch, activeBundle.pitch, liveHost.tts.pitch),
      volume: pick(eventConfig.volume, activeBundle.volume, liveHost.tts.volume),
      speed: pick(eventConfig.speed, activeBundle.speed, liveHost.tts.speed),
      streaming: liveHost.tts.streaming,
      duckOtherAudio: liveHost.tts.duckOtherAudio
    };

    try {
      this.speechState.markStarted();
      const result = await ttsPlugin.speak(request);
      this.api.emit('animazingpal:host-speech', {
        eventType: options.eventType || 'manual',
        username: request.username,
        success: result?.success !== false,
        id: result?.id || null
      });
      return result;
    } catch (error) {
      this.api.log(`AnimazingPal host speech failed: ${error.message}`, 'error');
      return { success: false, error: error.message };
    } finally {
      this.speechState.markEnded();
    }
  }

  async runLiveHostTtsProbe(options = {}) {
    this.ensureLiveHostRuntime();
    const liveHost = normalizeLiveHostConfig(this.config?.brain?.liveHost || {}, this.config?.brain || {});
    const ttsPlugin = this.api.getPluginInstance?.('tts') || this.api.getPlugin?.('tts');
    const queueInfo = ttsPlugin?.queueManager?.getInfo?.() || null;
    const result = {
      success: false,
      checkedAt: new Date().toISOString(),
      speak: options.speak === true,
      engine: ttsPlugin?.config?.defaultEngine || liveHost.tts.engine || 'fishaudio',
      enabled: liveHost.enabled && liveHost.tts.enabled,
      pluginAvailable: Boolean(ttsPlugin && (ttsPlugin.isInitialized !== false) && (ttsPlugin.initialized !== false)),
      queue: queueInfo,
      error: null,
      ttsResult: null
    };

    if (!result.enabled) {
      result.error = 'LiveHost TTS is disabled';
    } else if (!result.pluginAvailable || typeof ttsPlugin?.speak !== 'function') {
      result.error = 'TTS plugin unavailable';
    } else if (!result.speak) {
      result.success = true;
    } else {
      const speech = await this.speakHostResponse(options.text || 'AnimazingPal Sprachtest erfolgreich.', {
        username: 'AnimazingPal',
        eventType: 'manual',
        userId: 'animazingpal-tts-probe'
      });
      result.ttsResult = speech;
      result.success = speech?.success !== false;
      if (!result.success) {
        result.error = speech?.error || speech?.reason || 'TTS speech failed';
      }
    }

    this.liveHostDiagnostics.lastTtsProbe = result;
    this.safeEmitStatus();
    return result;
  }

  ensureLiveHostRuntime() {
    if (!this.liveHostEventDeduper) {
      this.liveHostEventDeduper = new EventDeduper({ ttl: 120, maxSize: 5000 });
    }
    if (!Array.isArray(this.liveHostResponseTimes)) {
      this.liveHostResponseTimes = [];
    }
    if (!this.liveHostDiagnostics) {
      this.liveHostDiagnostics = {
        dedupedEvents: 0,
        rateLimitedResponses: 0,
        lastDedupedSignature: null,
        lastRateLimitedAt: null,
        lastMovementTest: null,
        lastIdleMotion: null,
        lastTtsProbe: null,
        lastSourceEventAt: null,
        lastSourceEventType: null,
        lastEventResult: null,
        processedEvents: 0,
        respondedEvents: 0,
        skippedEvents: 0,
        idleMotionSkipped: 0
      };
    } else if (!Object.prototype.hasOwnProperty.call(this.liveHostDiagnostics, 'lastMovementTest')) {
      this.liveHostDiagnostics.lastMovementTest = null;
    }
    if (!Object.prototype.hasOwnProperty.call(this.liveHostDiagnostics, 'lastIdleMotion')) {
      this.liveHostDiagnostics.lastIdleMotion = null;
    }
    if (!Object.prototype.hasOwnProperty.call(this.liveHostDiagnostics, 'lastTtsProbe')) {
      this.liveHostDiagnostics.lastTtsProbe = null;
    }
    if (!Object.prototype.hasOwnProperty.call(this.liveHostDiagnostics, 'lastSourceEventAt')) {
      this.liveHostDiagnostics.lastSourceEventAt = null;
    }
    if (!Object.prototype.hasOwnProperty.call(this.liveHostDiagnostics, 'lastSourceEventType')) {
      this.liveHostDiagnostics.lastSourceEventType = null;
    }
    if (!Object.prototype.hasOwnProperty.call(this.liveHostDiagnostics, 'lastEventResult')) {
      this.liveHostDiagnostics.lastEventResult = null;
    }
    if (!Object.prototype.hasOwnProperty.call(this.liveHostDiagnostics, 'processedEvents')) {
      this.liveHostDiagnostics.processedEvents = 0;
    }
    if (!Object.prototype.hasOwnProperty.call(this.liveHostDiagnostics, 'respondedEvents')) {
      this.liveHostDiagnostics.respondedEvents = 0;
    }
    if (!Object.prototype.hasOwnProperty.call(this.liveHostDiagnostics, 'skippedEvents')) {
      this.liveHostDiagnostics.skippedEvents = 0;
    }
    if (!Object.prototype.hasOwnProperty.call(this.liveHostDiagnostics, 'idleMotionSkipped')) {
      this.liveHostDiagnostics.idleMotionSkipped = 0;
    }
    if (!this.speechState) {
      this.speechState = new SpeechState();
    }
    if (!this.liveHostSourceStatus) {
      this.liveHostSourceStatus = {
        lastCheckedAt: null,
        lastReconnectAt: null,
        lastReconnectError: null,
        reconnectAttempts: 0
      };
    }
  }

  getLiveHostEventSignature(eventType, data = {}) {
    const user = data.userId || data.uniqueId || data.username || data.nickname || 'anonymous';
    if (data.msgId || data.messageId || data.eventId || data.id) {
      return this.liveHostEventDeduper.generateSignature(eventType, {
        id: data.msgId || data.messageId || data.eventId || data.id,
        user
      });
    }
    const base = { user };
    if (eventType === 'chat') base.comment = String(data.comment || '').trim().slice(0, 500);
    if (eventType === 'gift') {
      base.giftId = data.giftId || '';
      base.giftName = data.giftName || '';
      base.repeatCount = data.repeatCount || 1;
      base.diamondCount = data.diamondCount || 0;
    }
    if (eventType === 'like') base.likeCount = data.likeCount || 0;
    if (eventType === 'share' || eventType === 'follow' || eventType === 'subscribe' || eventType === 'join') {
      base.type = eventType;
    }
    return this.liveHostEventDeduper.generateSignature(eventType, base);
  }

  isDuplicateLiveHostEvent(eventType, data = {}) {
    this.ensureLiveHostRuntime();
    const signature = this.getLiveHostEventSignature(eventType, data);
    const duplicate = this.liveHostEventDeduper.hasSeen(signature);
    if (duplicate) {
      this.liveHostDiagnostics.dedupedEvents += 1;
      this.liveHostDiagnostics.lastDedupedSignature = signature;
    }
    return { duplicate, signature };
  }

  canUseLiveHostResponseSlot(liveHost = buildLiveHostDefaults()) {
    this.ensureLiveHostRuntime();
    const now = Date.now();
    const limit = Math.max(1, Number(liveHost.response?.maxResponsesPerMinute) || 10);
    this.liveHostResponseTimes = this.liveHostResponseTimes.filter(timestamp => now - timestamp < 60000);
    if (this.liveHostResponseTimes.length >= limit) {
      this.liveHostDiagnostics.rateLimitedResponses += 1;
      this.liveHostDiagnostics.lastRateLimitedAt = new Date(now).toISOString();
      return false;
    }
    return true;
  }

  recordLiveHostResponseSlot() {
    this.ensureLiveHostRuntime();
    this.liveHostResponseTimes.push(Date.now());
  }

  recordLiveHostSourceEvent(eventType) {
    this.ensureLiveHostRuntime();
    this.liveHostDiagnostics.lastSourceEventAt = new Date().toISOString();
    this.liveHostDiagnostics.lastSourceEventType = eventType || 'unknown';
  }

  recordLiveHostEventOutcome(eventType, result = {}) {
    this.ensureLiveHostRuntime();
    const responded = result.responded === true;
    const decisionReasons = result.decision?.respond === false
      ? (Array.isArray(result.decision.reasons) && result.decision.reasons.length > 0 ? result.decision.reasons : ['low_signal'])
      : [];
    const reason = result.reason
      || (result.duplicate ? 'duplicate' : null)
      || (result.rateLimited ? 'rate-limited' : null)
      || (result.decision?.respond === false ? `decision:${decisionReasons.join(',')}` : null)
      || (responded ? 'responded' : 'skipped');
    const outcome = {
      eventType: eventType || 'unknown',
      handled: result.handled !== false,
      responded,
      reason,
      checkedAt: new Date().toISOString(),
      decision: result.decision || null
    };
    this.liveHostDiagnostics.processedEvents = (this.liveHostDiagnostics.processedEvents || 0) + 1;
    if (responded) {
      this.liveHostDiagnostics.respondedEvents = (this.liveHostDiagnostics.respondedEvents || 0) + 1;
    } else {
      this.liveHostDiagnostics.skippedEvents = (this.liveHostDiagnostics.skippedEvents || 0) + 1;
    }
    this.liveHostDiagnostics.lastEventResult = outcome;
    return outcome;
  }

  getLiveHostSourceEventStatus(liveHost = normalizeLiveHostConfig(this.config?.brain?.liveHost || {}, this.config?.brain || {})) {
    this.ensureLiveHostRuntime();
    const thresholdMs = Math.max(30000, Number(liveHost.source?.eventStaleMs) || 300000);
    const lastSourceEventAt = this.liveHostDiagnostics.lastSourceEventAt || null;
    const timestamp = lastSourceEventAt ? Date.parse(lastSourceEventAt) : NaN;
    const ageMs = Number.isFinite(timestamp) ? Date.now() - timestamp : null;
    return {
      seen: Boolean(lastSourceEventAt && Number.isFinite(timestamp)),
      lastEventAt: Number.isFinite(timestamp) ? lastSourceEventAt : null,
      eventType: this.liveHostDiagnostics.lastSourceEventType || null,
      ageMs,
      thresholdMs,
      stale: Number.isFinite(ageMs) ? ageMs > thresholdMs : false
    };
  }

  getLiveHostRuntimeStatus() {
    this.ensureLiveHostRuntime();
    const browserHeartbeat = this.getLiveHostBrowserHeartbeatStatus();
    const sourceStatus = this.getLiveHostSourceStatus();
    const liveHost = normalizeLiveHostConfig(this.config?.brain?.liveHost || {}, this.config?.brain || {});
    const sourceEventStatus = this.getLiveHostSourceEventStatus(liveHost);
    return {
      speaking: this.speechState.isSpeaking(),
      speechDurationMs: this.speechState.getSpeechDuration(),
      dedupeCacheSize: this.liveHostEventDeduper.size(),
      responseSlotsUsedLastMinute: this.liveHostResponseTimes.filter(timestamp => Date.now() - timestamp < 60000).length,
      animazeConnected: this.isConnected,
      animazeReconnectScheduled: Boolean(this.reconnectTimer),
      animazeReconnectAttempts: this.reconnectAttempts,
      browserHeartbeat,
      sourceStatus,
      sourceEventStatus,
      diagnostics: { ...this.liveHostDiagnostics }
    };
  }

  getLiveHostSourceStatus() {
    this.ensureLiveHostRuntime();
    const liveHost = normalizeLiveHostConfig(this.config?.brain?.liveHost || {}, this.config?.brain || {});
    const source = liveHost.source || {};
    const tiktok = this.api.tiktok || {};
    const active = typeof tiktok.isActive === 'function'
      ? tiktok.isActive()
      : (typeof tiktok.isConnected === 'function' ? tiktok.isConnected() : !!tiktok.connected);
    const currentUsername = String(tiktok.currentUsername || tiktok.username || '').replace(/^@/, '');
    const desiredUsername = String(source.username || '').replace(/^@/, '');
    const connectedToSource = Boolean(active && desiredUsername && (!currentUsername || currentUsername.toLowerCase() === desiredUsername.toLowerCase()));
    return {
      configured: Boolean(desiredUsername),
      username: desiredUsername,
      currentUsername,
      connected: Boolean(active),
      connectedToSource,
      autoConnect: source.autoConnect === true,
      readOnly: source.readOnly !== false,
      reconnectInFlight: this.liveHostSourceReconnectInFlight === true,
      ...this.liveHostSourceStatus
    };
  }

  stopLiveHostSourceWatchdog() {
    if (this.liveHostSourceWatchdogTimer) {
      clearTimeout(this.liveHostSourceWatchdogTimer);
      this.liveHostSourceWatchdogTimer = null;
    }
  }

  startLiveHostSourceWatchdog() {
    this.stopLiveHostSourceWatchdog();
    const liveHost = normalizeLiveHostConfig(this.config?.brain?.liveHost || {}, this.config?.brain || {});
    if (!liveHost.enabled || !liveHost.source?.autoConnect || !liveHost.source?.username || !this.api.tiktok?.connect) {
      return false;
    }
    this.liveHostSourceWatchdogTimer = setTimeout(() => {
      this.liveHostSourceWatchdogTimer = null;
      this.runLiveHostSourceWatchdog().finally(() => this.startLiveHostSourceWatchdog());
    }, 30000);
    return true;
  }

  async runLiveHostSourceWatchdog() {
    const status = this.getLiveHostSourceStatus();
    const liveHost = normalizeLiveHostConfig(this.config?.brain?.liveHost || {}, this.config?.brain || {});
    const eventStatus = this.getLiveHostSourceEventStatus(liveHost);
    const staleConnectedSource = status.connectedToSource && eventStatus.stale && liveHost.source?.reconnectOnEventStale;
    this.liveHostSourceStatus.lastCheckedAt = new Date().toISOString();
    if (!status.configured || !status.autoConnect || (!staleConnectedSource && status.connectedToSource) || this.liveHostSourceReconnectInFlight || !this.api.tiktok?.connect) {
      return { reconnected: false, status: this.getLiveHostSourceStatus() };
    }

    this.liveHostSourceReconnectInFlight = true;
    this.liveHostSourceStatus.reconnectAttempts = (this.liveHostSourceStatus.reconnectAttempts || 0) + 1;
    try {
      await this.api.tiktok.connect(status.username);
      this.liveHostSourceStatus.lastReconnectAt = new Date().toISOString();
      this.liveHostSourceStatus.lastReconnectError = null;
      this.api.log(`Live host source reconnected read-only to @${status.username}${staleConnectedSource ? ' after stale events' : ''}`, 'info');
      return { reconnected: true, reason: staleConnectedSource ? 'stale-events' : 'disconnected', status: this.getLiveHostSourceStatus() };
    } catch (error) {
      this.liveHostSourceStatus.lastReconnectError = error.message;
      this.api.log(`Live host source reconnect failed for @${status.username}: ${error.message}`, 'warn');
      return { reconnected: false, error: error.message, status: this.getLiveHostSourceStatus() };
    } finally {
      this.liveHostSourceReconnectInFlight = false;
      this.safeEmitStatus();
    }
  }

  recordLiveHostBrowserHeartbeat(payload = {}) {
    const browser = payload.browser || payload || {};
    const playback = browser.playback || {};
    const routing = playback.lastRouting || {};
    const now = Date.now();
    this.liveHostBrowserHeartbeat = {
      receivedAt: new Date(now).toISOString(),
      receivedAtMs: now,
      sinkSupported: browser.sinkSupported !== false,
      audioUnlocked: browser.audioUnlocked === true,
      configuredOutputDeviceAvailable: browser.configuredOutputDeviceAvailable !== false,
      selectedOutputDeviceId: String(browser.selectedOutputDeviceId || '').slice(0, 500),
      playback: {
        status: String(playback.status || 'unknown').slice(0, 80),
        lastError: playback.lastError ? String(playback.lastError).slice(0, 500) : '',
        lastRouting: {
          routed: routing.routed === undefined ? null : routing.routed === true,
          reason: routing.reason ? String(routing.reason).slice(0, 500) : ''
        }
      }
    };
    return this.getLiveHostBrowserHeartbeatStatus(now);
  }

  getLiveHostBrowserHeartbeatStatus(now = Date.now()) {
    if (!this.liveHostBrowserHeartbeat) {
      return {
        present: false,
        stale: true,
        ageMs: null,
        receivedAt: null
      };
    }
    const ageMs = Math.max(0, now - Number(this.liveHostBrowserHeartbeat.receivedAtMs || 0));
    return {
      ...this.liveHostBrowserHeartbeat,
      present: true,
      stale: ageMs > 30000,
      ageMs
    };
  }

  async runLiveHostMovementTest(options = {}) {
    this.ensureLiveHostRuntime();
    const requestedIndex = options.index !== undefined ? Number(options.index) : null;
    const specialActions = Array.isArray(this.animazeData?.specialActions) ? this.animazeData.specialActions : [];
    const candidate = Number.isFinite(requestedIndex)
      ? specialActions.find(action => Number(action.index) === requestedIndex)
      : specialActions.find(action => /hello|wave|dance|shrug/i.test(action.animName || action.friendlyName || '')) || specialActions[0];

    const result = {
      success: false,
      checkedAt: new Date().toISOString(),
      platform: this.getActivePlatformKey(),
      actionType: 'specialAction',
      index: candidate?.index ?? requestedIndex,
      name: candidate?.animName || candidate?.friendlyName || null,
      error: null
    };

    if (!this.isConnected) {
      result.error = 'Animaze is not connected';
      this.liveHostDiagnostics.lastMovementTest = result;
      return result;
    }

    if (result.index === undefined || result.index === null || Number.isNaN(Number(result.index))) {
      result.error = 'No Animaze special action is available for movement testing';
      this.liveHostDiagnostics.lastMovementTest = result;
      return result;
    }

    try {
      result.success = await this.triggerSpecialAction(result.index);
      if (!result.success) {
        result.error = 'Animaze command was not accepted by the socket layer';
      }
    } catch (error) {
      result.error = error.message;
    }

    this.liveHostDiagnostics.lastMovementTest = result;
    if (result.success) {
      this.liveHostLastAvatarActionAt = Date.now();
    }
    return result;
  }

  stopLiveHostIdleMotion() {
    if (this.liveHostIdleMotionTimer) {
      clearTimeout(this.liveHostIdleMotionTimer);
      this.liveHostIdleMotionTimer = null;
    }
  }

  startLiveHostIdleMotion() {
    this.stopLiveHostIdleMotion();
    const liveHost = normalizeLiveHostConfig(this.config?.brain?.liveHost || {}, this.config?.brain || {});
    if (!this.config?.enabled || !liveHost.enabled || !liveHost.idleMotion?.enabled) {
      return false;
    }
    this.scheduleLiveHostIdleMotion(liveHost);
    return true;
  }

  scheduleLiveHostIdleMotion(liveHost = normalizeLiveHostConfig(this.config?.brain?.liveHost || {}, this.config?.brain || {})) {
    if (this.liveHostIdleMotionTimer || !liveHost.enabled || !liveHost.idleMotion?.enabled) {
      return;
    }
    const idleMotion = liveHost.idleMotion;
    const interval = Math.max(3000, Number(idleMotion.intervalMs) || 15000);
    const jitter = Math.max(0, Number(idleMotion.jitterMs) || 0);
    const delay = interval + (jitter ? Math.round(Math.random() * jitter) : 0);
    this.liveHostIdleMotionTimer = setTimeout(async () => {
      this.liveHostIdleMotionTimer = null;
      try {
        await this.runLiveHostIdleMotionTick();
      } catch (error) {
        this.api.log(`Live host idle motion failed: ${error.message}`, 'warn');
      } finally {
        this.startLiveHostIdleMotion();
      }
    }, delay);
  }

  selectLiveHostIdleMotionAction(idleMotion = {}, options = {}) {
    const preferred = Array.isArray(idleMotion.preferNames) ? idleMotion.preferNames : [];
    const avoided = Array.isArray(idleMotion.avoidNames) ? idleMotion.avoidNames : [];
    const matches = (item, needles) => {
      const label = String(item.animName || item.friendlyName || item.itemName || item.name || '').toLocaleLowerCase();
      return needles.some(needle => label.includes(String(needle).toLocaleLowerCase()));
    };
    const pickFrom = (items, actionType) => {
      const usable = (Array.isArray(items) ? items : []).filter(item => !matches(item, avoided));
      const item = usable.find(candidate => matches(candidate, preferred)) || usable[0];
      if (!item) return null;
      return {
        actionType,
        actionValue: actionType === 'emote' ? (item.itemName || item.friendlyName) : item.index,
        name: item.animName || item.friendlyName || item.itemName || item.name || String(item.index)
      };
    };

    const preferredType = options.preferredType || idleMotion.actionType;
    const pickEmote = () => idleMotion.includeEmotes ? pickFrom(this.animazeData.emotes, 'emote') : null;

    if (preferredType === 'emote') {
      return pickEmote()
        || (idleMotion.fallbackToSpecialAction ? pickFrom(this.animazeData.specialActions, 'specialAction') : null)
        || pickFrom(this.animazeData.idleAnims, 'idle');
    }

    if (preferredType === 'specialAction') {
      return pickFrom(this.animazeData.specialActions, 'specialAction')
        || pickEmote()
        || (idleMotion.fallbackToSpecialAction ? pickFrom(this.animazeData.idleAnims, 'idle') : null);
    }

    return pickFrom(this.animazeData.idleAnims, 'idle')
      || (idleMotion.fallbackToSpecialAction ? pickFrom(this.animazeData.specialActions, 'specialAction') : null)
      || pickEmote();
  }

  async runLiveHostIdleMotionTick(now = Date.now()) {
    this.ensureLiveHostRuntime();
    const liveHost = normalizeLiveHostConfig(this.config?.brain?.liveHost || {}, this.config?.brain || {});
    const idleMotion = liveHost.idleMotion || {};
    const result = {
      success: false,
      triggered: false,
      checkedAt: new Date(now).toISOString(),
      reason: null,
      actionType: null,
      actionValue: null,
      name: null
    };

    if (!this.config?.enabled || !liveHost.enabled || !idleMotion.enabled) {
      result.reason = 'disabled';
    } else if (!this.isConnected) {
      result.reason = 'animaze-disconnected';
    } else if (idleMotion.pauseWhileSpeaking && this.speechState?.isSpeaking()) {
      result.reason = 'speaking';
    } else if (now - (this.liveHostLastAvatarActionAt || 0) < idleMotion.cooldownAfterActionMs) {
      result.reason = 'cooldown';
    } else {
      this.liveHostIdleMotionSequence = (this.liveHostIdleMotionSequence || 0) + 1;
      let preferredType = idleMotion.actionType;
      if (idleMotion.alternateActionTypes && idleMotion.fallbackToSpecialAction) {
        const rotation = idleMotion.includeEmotes ? ['idle', 'specialAction', 'emote'] : ['idle', 'specialAction'];
        const start = Math.max(0, rotation.indexOf(idleMotion.actionType));
        preferredType = rotation[(start + this.liveHostIdleMotionSequence - 1) % rotation.length];
      }
      const action = this.selectLiveHostIdleMotionAction(idleMotion, { preferredType });
      if (!action) {
        result.reason = 'no-action';
      } else {
        result.actionType = action.actionType;
        result.actionValue = action.actionValue;
        result.name = action.name;
        if (action.actionType === 'idle') {
          result.success = await this.triggerIdle(action.actionValue);
        } else if (action.actionType === 'specialAction') {
          result.success = await this.triggerSpecialAction(action.actionValue);
        } else if (action.actionType === 'emote') {
          result.success = await this.triggerEmote(action.actionValue);
        }
        result.triggered = result.success;
        result.reason = result.success ? 'triggered' : 'send-failed';
        if (result.success) {
          this.liveHostLastAvatarActionAt = now;
        }
      }
    }

    if (!result.success) {
      this.liveHostDiagnostics.idleMotionSkipped = (this.liveHostDiagnostics.idleMotionSkipped || 0) + 1;
    }
    this.liveHostDiagnostics.lastIdleMotion = result;
    this.safeEmitStatus();
    return result;
  }

  evaluateLiveHostPreflight(options = {}) {
    this.ensureLiveHostRuntime();
    const liveHost = normalizeLiveHostConfig(this.config?.brain?.liveHost || {}, this.config?.brain || {});
    const heartbeatStatus = this.getLiveHostBrowserHeartbeatStatus();
    const hasInlineBrowserState = !!options.browser;
    const browser = options.browser || (heartbeatStatus.present ? heartbeatStatus : {});
    const checks = [];
    const add = (id, status, label, detail, action = null) => {
      checks.push({ id, status, label, detail, ...(action ? { action } : {}) });
    };

    add(
      'liveHost.enabled',
      liveHost.enabled ? 'ok' : 'error',
      'Live Host',
      liveHost.enabled ? 'Live Host ist aktiviert.' : 'Live Host ist deaktiviert.',
      liveHost.enabled ? null : 'Live Host im Standalone-Tab aktivieren.'
    );

    const provider = liveHost.providers?.[liveHost.provider] || {};
    const providerNeedsKey = liveHost.provider !== 'ollama' || /ollama\.com/i.test(provider.baseUrl || '') || !/^https?:\/\/(127\.0\.0\.1|localhost)/i.test(provider.baseUrl || '');
    const providerHasKey = Boolean(provider.apiKey);
    add(
      'provider.credentials',
      providerNeedsKey && !providerHasKey ? 'error' : 'ok',
      'Brain Provider',
      providerNeedsKey && !providerHasKey
        ? `${liveHost.provider} braucht einen gespeicherten API-Key.`
        : `${liveHost.provider} ist konfiguriert.`,
      providerNeedsKey && !providerHasKey ? 'API-Key im Brain-Provider-Bereich speichern oder lokalen Ollama-Endpunkt setzen.' : null
    );

    const ttsPlugin = this.api.getPluginInstance?.('tts')
      || this.api.getPlugin?.('tts')
      || this.api.pluginLoader?.getPluginInstance?.('tts');
    const ttsInitialized = Boolean(ttsPlugin && (ttsPlugin.isInitialized !== false) && (ttsPlugin.initialized !== false));
    const ttsEngine = ttsPlugin?.config?.defaultEngine || liveHost.tts.engine || 'fishaudio';
    const lastTtsProbe = this.liveHostDiagnostics.lastTtsProbe;
    add(
      'tts.plugin',
      liveHost.tts.enabled && ttsInitialized ? 'ok' : 'error',
      'Fish.audio / TTS',
      liveHost.tts.enabled
        ? (ttsInitialized ? `TTS-Plugin ist bereit (${ttsEngine}).` : 'TTS-Plugin ist nicht verfügbar oder nicht initialisiert.')
        : 'LiveHost-TTS ist deaktiviert.',
      liveHost.tts.enabled && ttsInitialized ? null : 'TTS-Plugin aktivieren und Fish.audio konfigurieren.'
    );
    add(
      'tts.probe',
      lastTtsProbe?.success ? 'ok' : (lastTtsProbe ? 'error' : 'warn'),
      'TTS Pipeline-Probe',
      lastTtsProbe
        ? (lastTtsProbe.success
          ? `Letzte TTS-Probe ok (${lastTtsProbe.engine}, ${lastTtsProbe.checkedAt}).`
          : `Letzte TTS-Probe fehlgeschlagen: ${lastTtsProbe.error || 'unbekannt'}.`)
        : 'Noch keine TTS-Probe in dieser Laufzeit ausgefuehrt.',
      lastTtsProbe?.success ? null : 'Im Fish.audio-Bereich Sprachtest oder TTS-Probe ausfuehren.'
    );

    const queueInfo = ttsPlugin?.queueManager?.getInfo?.() || null;
    if (queueInfo && Number(queueInfo.size || 0) > Number(queueInfo.maxSize || 100)) {
      add('tts.queue', 'warn', 'TTS Queue', `Queue wirkt überfüllt: ${queueInfo.size}/${queueInfo.maxSize}.`, 'Queue leeren oder Antwortlimit senken.');
    } else {
      add('tts.queue', 'ok', 'TTS Queue', queueInfo ? `Queue: ${queueInfo.size || 0}/${queueInfo.maxSize || 100}.` : 'Queue-Status nicht verfügbar, TTS-Plugin antwortet aber.');
    }

    const hasOutputDevice = Boolean(liveHost.audio.outputDeviceId);
    const sinkSupported = browser.sinkSupported !== false;
    const audioUnlocked = browser.audioUnlocked === true;
    const outputDeviceAvailable = browser.configuredOutputDeviceAvailable !== false;
    const playback = browser.playback || {};
    const playbackRouting = playback.lastRouting || {};
    const playbackHasError = Boolean(playback.lastError || playback.status === 'error' || playbackRouting.routed === false);
    add(
      'browser.heartbeat',
      hasInlineBrowserState || (heartbeatStatus.present && !heartbeatStatus.stale) ? 'ok' : 'error',
      'Browser Host-Tab',
      hasInlineBrowserState
        ? 'Aktueller Browserzustand wurde mit dem Preflight gesendet.'
        : (heartbeatStatus.present
          ? `Letzter Browser-Heartbeat ist stale (${heartbeatStatus.ageMs}ms).`
          : 'Kein Browser-Heartbeat empfangen; der Standalone-Host-Tab ist nicht nachweisbar aktiv.'),
      hasInlineBrowserState || (heartbeatStatus.present && !heartbeatStatus.stale)
        ? null
        : 'AnimazingPal Standalone-UI im Browser offen lassen und neu laden.'
    );
    add(
      'audio.output',
      hasOutputDevice ? 'ok' : 'warn',
      'Audio-Ausgabe',
      hasOutputDevice
        ? `Ausgabe gesetzt: ${liveHost.audio.outputDeviceLabel || liveHost.audio.outputDeviceId}.`
        : 'Kein explizites Ausgabegerät gesetzt; Browser/Windows-Default wird genutzt.',
      hasOutputDevice ? null : 'CABLE Input im Audio-Routing auswählen.'
    );
    if (hasOutputDevice) {
      add(
        'audio.device',
        outputDeviceAvailable ? 'ok' : 'error',
        'Audio-Device',
        outputDeviceAvailable
          ? 'Das konfigurierte Ausgabe-Device ist im Browser verfuegbar.'
          : `Das gespeicherte Ausgabe-Device ist im Browser nicht verfuegbar (${liveHost.audio.outputDeviceLabel || liveHost.audio.outputDeviceId}). Audio wuerde auf Standardausgabe fallen und Animaze nicht erreichen.`,
        outputDeviceAvailable ? null : 'In der Standalone-UI Audiogeraet auswaehlen und CABLE Input erneut freigeben.'
      );
    }
    add(
      'audio.browser',
      hasOutputDevice && (!sinkSupported || !outputDeviceAvailable) ? 'error' : (audioUnlocked ? 'ok' : 'warn'),
      'Browser-Audio',
      hasOutputDevice && !sinkSupported
        ? 'Browser kann das konfigurierte Ausgabegerät nicht direkt ansteuern.'
        : (audioUnlocked ? 'Audio ist freigeschaltet.' : 'Audio ist noch nicht per User-Klick freigeschaltet.'),
      hasOutputDevice && !sinkSupported
        ? 'Windows-Standardausgabe auf CABLE Input setzen oder Browser mit setSinkId verwenden.'
        : (audioUnlocked ? null : 'In der Standalone-UI auf „Audio aktivieren“ klicken.')
    );
    add(
      'audio.playback',
      playbackHasError ? 'error' : 'ok',
      'Browser-TTS Playback',
      playbackHasError
        ? `Browser-TTS meldet einen Playback/Routing-Fehler: ${playback.lastError || playbackRouting.reason || playback.status || 'unbekannt'}.`
        : `Browser-TTS Playback: ${playback.status || 'noch kein Testlauf gemeldet'}.`,
      playbackHasError ? 'Audiogeraet erneut freigeben, Sprachtest ausfuehren und Preflight wiederholen.' : null
    );

    add(
      'animaze.connection',
      this.isConnected ? 'ok' : 'error',
      'Animaze',
      this.isConnected
        ? 'Animaze ist verbunden.'
        : (this.reconnectTimer ? `Animaze ist getrennt; Reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts} ist geplant.` : 'Animaze ist nicht verbunden.'),
      this.isConnected
        ? null
        : (this.reconnectTimer ? 'Kurz warten oder manuell verbinden, falls Animaze nicht laeuft.' : 'Animaze starten und AnimazingPal auf Port 9000 verbinden.')
    );

    const lastMovementTest = this.liveHostDiagnostics.lastMovementTest;
    add(
      'animaze.movementProbe',
      lastMovementTest?.success ? 'ok' : (lastMovementTest ? 'error' : 'warn'),
      'Animaze Bewegungstest',
      lastMovementTest
        ? (lastMovementTest.success
          ? `Letzter Motion-Befehl gesendet: ${lastMovementTest.name || lastMovementTest.index} (${lastMovementTest.checkedAt}).`
          : `Letzter Motion-Test fehlgeschlagen: ${lastMovementTest.error || 'unbekannt'}.`)
        : 'Noch kein Animaze-Bewegungstest in dieser Laufzeit ausgefuehrt.',
      lastMovementTest?.success ? null : 'Im Diagnosebereich "Animaze Bewegung testen" ausfuehren und Avatar sichtbar pruefen.'
    );

    add(
      'animaze.idleMotion',
      liveHost.idleMotion?.enabled ? 'ok' : 'warn',
      'Automatische Idle-Motion',
      liveHost.idleMotion?.enabled
        ? `Aktiv: alle ca. ${liveHost.idleMotion.intervalMs}ms (${liveHost.idleMotion.actionType}).`
        : 'Automatische Idle-Motion ist deaktiviert; der Avatar kann ohne Events statisch wirken.',
      liveHost.idleMotion?.enabled ? null : 'Idle-Motion aktivieren oder Event-Aktionen häufiger triggern.'
    );

    const sourceUsername = String(liveHost.source?.username || '').trim();
    const sourceStatus = this.getLiveHostSourceStatus();
    add(
      'source.username',
      sourceUsername ? 'ok' : 'error',
      'TikTok Quelle',
      sourceUsername ? `Read-only Quelle: @${sourceUsername}.` : 'Kein öffentlicher TikTok-LIVE-Kanal konfiguriert.',
      sourceUsername ? null : 'Öffentlichen LIVE-Kanal eintragen und lesend verbinden.'
    );
    add(
      'source.readOnly',
      liveHost.source?.readOnly !== false ? 'ok' : 'error',
      'Read-only Schutz',
      liveHost.source?.readOnly !== false ? 'Quelle ist read-only; es werden keine Aktionen an TikTok gesendet.' : 'Read-only Schutz ist nicht aktiv.',
      liveHost.source?.readOnly !== false ? null : 'Read-only für fremde TikTok-LIVEs aktivieren.'
    );

    add(
      'source.connection',
      !sourceUsername ? 'error' : (sourceStatus.connectedToSource ? 'ok' : (sourceStatus.autoConnect ? 'warn' : 'error')),
      'TikTok Quellenverbindung',
      sourceStatus.connectedToSource
        ? `Read-only Quelle @${sourceStatus.username} ist verbunden.`
        : (sourceStatus.connected
          ? `TikTok ist verbunden, aber nicht eindeutig mit @${sourceStatus.username || sourceUsername}.`
          : `Read-only Quelle @${sourceStatus.username || sourceUsername || '?'} ist nicht verbunden.`),
      sourceStatus.connectedToSource
        ? null
        : (sourceStatus.autoConnect ? 'Watchdog reconnectet automatisch; Status beobachten.' : 'Quelle lesend verbinden oder Auto-Connect aktivieren.')
    );
    const sourceEventStatus = this.getLiveHostSourceEventStatus(liveHost);
    add(
      'source.events',
      !sourceStatus.connectedToSource ? 'warn' : (!sourceEventStatus.seen || sourceEventStatus.stale ? 'warn' : 'ok'),
      'TikTok Event-Fluss',
      !sourceStatus.connectedToSource
        ? 'Event-Fluss kann erst nach Quellenverbindung bewertet werden.'
        : (!sourceEventStatus.seen
          ? 'Seit Prozessstart wurde noch kein TikTok-Event vom Live Host verarbeitet.'
          : (sourceEventStatus.stale
            ? `Letztes TikTok-Event ist stale (${sourceEventStatus.ageMs}ms > ${sourceEventStatus.thresholdMs}ms).`
            : `Letztes TikTok-Event: ${sourceEventStatus.eventType} vor ${sourceEventStatus.ageMs}ms.`)),
      sourceStatus.connectedToSource && sourceEventStatus.stale && liveHost.source?.reconnectOnEventStale
        ? 'Watchdog reconnectet die Quelle automatisch bei stale Events.'
        : (sourceStatus.connectedToSource && (sourceEventStatus.stale || !sourceEventStatus.seen)
          ? 'Chat/Gift-Testevent abwarten oder Event-Stale-Reconnect aktivieren.'
          : null)
    );

    const runtime = this.getLiveHostRuntimeStatus();
    add(
      'runtime.rateLimit',
      runtime.responseSlotsUsedLastMinute < Math.max(1, Number(liveHost.response?.maxResponsesPerMinute) || 10) ? 'ok' : 'warn',
      'Antwortlimit',
      `${runtime.responseSlotsUsedLastMinute}/${liveHost.response?.maxResponsesPerMinute || 10} Antwortslots in der letzten Minute genutzt.`,
      runtime.responseSlotsUsedLastMinute < Math.max(1, Number(liveHost.response?.maxResponsesPerMinute) || 10) ? null : 'Kurz warten oder Antworten/Minute erhöhen.'
    );

    const processedEvents = Number(runtime.diagnostics?.processedEvents) || 0;
    const respondedEvents = Number(runtime.diagnostics?.respondedEvents) || 0;
    const skippedEvents = Number(runtime.diagnostics?.skippedEvents) || 0;
    const silenceWarnAfterEvents = Math.max(1, Number(liveHost.response?.silenceWarnAfterEvents) || 5);
    const responseStarved = processedEvents >= silenceWarnAfterEvents && respondedEvents === 0;
    add(
      'runtime.responseFlow',
      responseStarved ? 'warn' : 'ok',
      'Host Antwortfluss',
      responseStarved
        ? `Host hat ${processedEvents} Events verarbeitet, aber noch keine Antwort gesprochen. Letzter Grund: ${runtime.diagnostics?.lastEventResult?.reason || 'unbekannt'}.`
        : `Antwortfluss: ${respondedEvents} gesprochen, ${skippedEvents} übersprungen, ${processedEvents} verarbeitet.`,
      responseStarved
        ? 'Decision-Schwelle, Event-Aktivierung, Templates, Brain-Kanal und Rate-Limits prüfen.'
        : null
    );

    const summary = checks.reduce((acc, check) => {
      acc[check.status === 'error' ? 'errors' : check.status === 'warn' ? 'warnings' : 'ok'] += 1;
      return acc;
    }, { ok: 0, warnings: 0, errors: 0 });

    return {
      ready: summary.errors === 0,
      checkedAt: new Date().toISOString(),
      summary,
      checks
    };
  }

  _formatLiveHostMessage(message) {
    const liveHost = this.config?.brain?.liveHost || buildLiveHostDefaults();
    const sentences = String(message || '').match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
    return sentences.slice(0, liveHost.response.maxSentences).join(' ').trim().slice(0, liveHost.response.maxCharacters);
  }

  _renderLiveHostTemplate(template, data = {}) {
    const values = {
      username: data.uniqueId || data.username || 'Viewer',
      nickname: data.nickname || data.uniqueId || data.username || 'Viewer',
      comment: data.comment || '',
      giftName: data.giftName || '',
      count: data.repeatCount || data.likeCount || 1,
      coins: (data.diamondCount || 0) * (data.repeatCount || 1)
    };
    return Object.entries(values).reduce((text, [key, value]) => text.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value)), String(template || ''));
  }

  decideLiveHostResponse(eventType, data = {}, event = {}, liveHost = buildLiveHostDefaults()) {
    const response = liveHost.response || {};
    const mode = ['auto', 'probability', 'always', 'off'].includes(response.decisionMode)
      ? response.decisionMode
      : 'auto';
    const reasons = [];
    const hasResponseChannel = !!event.templateEnabled || !!event.brainEnabled;

    if (!hasResponseChannel) return { mode, respond: false, score: 0, threshold: response.minDecisionScore ?? 0.55, reasons: ['no_response_channel'] };
    if (mode === 'off') return { mode, respond: false, score: 0, threshold: response.minDecisionScore ?? 0.55, reasons: ['off'] };
    if (mode === 'always') return { mode, respond: true, score: 1, threshold: response.minDecisionScore ?? 0.55, reasons: ['always'] };
    if (mode === 'probability') {
      const probability = Number.isFinite(Number(event.probability)) ? Number(event.probability) : 1;
      return { mode, respond: Math.random() <= probability, score: probability, threshold: probability, reasons: ['probability'] };
    }

    let score = 0;
    const coins = (Number(data.diamondCount) || 0) * (Number(data.repeatCount) || 1);
    const likes = Number(data.likeCount) || 0;
    if (event.templateEnabled && event.template) {
      score += 0.4;
      reasons.push('explicit_template');
    }

    if (eventType === 'chat') {
      const comment = String(data.comment || '').trim();
      const lowered = comment.toLocaleLowerCase();
      if (!comment || /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s!?.]+$/u.test(comment)) {
        reasons.push('low_signal');
      }
      if (/[?？]/.test(comment) || /\b(was|wie|warum|wieso|wann|wo|wer|welche|kannst|kann|why|how|what|when|where|who)\b/i.test(comment)) {
        score += 0.35;
        reasons.push('question');
      }
      if (/@(?:host|animazingpal)\b/i.test(comment) || /\b(host|avatar|animazingpal)\b/i.test(lowered)) {
        score += 0.25;
        reasons.push('mention');
      }
      if (Number(data.teamMemberLevel) >= 10 || data.isSubscriber || data.isModerator) {
        score += 0.2;
        reasons.push('supporter');
      }
      if (comment.length >= 25) {
        score += 0.1;
        reasons.push('substantive');
      }
      if (/\b(danke|thanks|hilfe|help|erklär|erklaer|explain|meinung|opinion)\b/i.test(lowered)) {
        score += 0.15;
        reasons.push('intent');
      }
    } else if (eventType === 'gift') {
      score = 0.75;
      reasons.push('gift');
      if (coins >= 10) {
        score += 0.1;
        reasons.push('valuable_gift');
      }
      if ((Number(data.repeatCount) || 1) > 1) {
        score += 0.1;
        reasons.push('repeat_gift');
      }
    } else if (['follow', 'share', 'subscribe'].includes(eventType)) {
      score = 0.8;
      reasons.push(eventType);
    } else if (eventType === 'like') {
      score = likes >= Math.max(10, Number(event.minLikes) || 0) ? 0.6 : 0.35;
      reasons.push(likes >= Math.max(10, Number(event.minLikes) || 0) ? 'like_burst' : 'like');
    } else if (eventType === 'join') {
      score += 0.2;
      reasons.push('join');
    }

    const threshold = Number.isFinite(Number(response.minDecisionScore)) ? Number(response.minDecisionScore) : 0.55;
    return { mode, respond: score >= threshold, score: Math.min(1, score), threshold, reasons };
  }

  findAnimazeItem(collectionName, candidates) {
    const data = this.animazeData || this.platformData || {};
    const collection = Array.isArray(data[collectionName]) ? data[collectionName] : [];
    const names = candidates.map(name => String(name).toLocaleLowerCase());
    return collection.find(item => {
      const label = String(item.friendlyName || item.animName || item.itemName || item.name || '').toLocaleLowerCase();
      return names.some(candidate => label.includes(candidate));
    }) || null;
  }

  selectSituationalAvatarAction(eventType, data = {}) {
    const coins = (Number(data.diamondCount) || 0) * (Number(data.repeatCount) || 1);
    if (eventType === 'gift') {
      const giftName = String(data.giftName || '').toLocaleLowerCase();
      const highValue = coins >= 100;
      const emote = highValue
        ? this.findAnimazeItem('emotes', ['money', 'firework', 'confetti'])
        : giftName.includes('rose') || giftName.includes('heart')
          ? this.findAnimazeItem('emotes', ['love', 'heart', 'hearts'])
          : this.findAnimazeItem('emotes', ['confetti', 'love', 'heart']);
      return emote ? { actionType: 'emote', actionValue: emote.itemName || emote.friendlyName } : null;
    }
    if (eventType === 'follow') {
      const action = this.findAnimazeItem('specialActions', ['short hello', 'hello']);
      return action ? { actionType: 'specialAction', actionValue: action.index } : null;
    }
    if (eventType === 'share' || eventType === 'subscribe') {
      const action = this.findAnimazeItem('specialActions', ['dance', 'macarena', 'robot']);
      if (action) return { actionType: 'specialAction', actionValue: action.index };
      const emote = this.findAnimazeItem('emotes', ['confetti', 'firework']);
      return emote ? { actionType: 'emote', actionValue: emote.itemName || emote.friendlyName } : null;
    }
    if (eventType === 'chat') {
      const idle = this.findAnimazeItem('idleAnims', ['explaining', 'simple idle']);
      return idle ? { actionType: 'idle', actionValue: idle.index } : null;
    }
    if (eventType === 'like' && (Number(data.likeCount) || 0) >= 10) {
      const emote = this.findAnimazeItem('emotes', ['love', 'heart']);
      return emote ? { actionType: 'emote', actionValue: emote.itemName || emote.friendlyName } : null;
    }
    return null;
  }

  async processLiveHostEvent(eventType, data = {}) {
    this.ensureLiveHostRuntime();
    const liveHost = this.config?.brain?.liveHost;
    const event = liveHost?.events?.[eventType];
    if (!liveHost?.enabled) return { handled: false };
    this.recordLiveHostSourceEvent(eventType);
    const complete = result => {
      this.recordLiveHostEventOutcome(eventType, result);
      return result;
    };
    if (!event?.enabled) return complete({ handled: false, responded: false, reason: 'event-disabled' });

    const dedupe = this.isDuplicateLiveHostEvent(eventType, data);
    if (dedupe.duplicate) {
      return complete({ handled: true, responded: false, duplicate: true, reason: 'duplicate' });
    }

    const coins = (Number(data.diamondCount) || 0) * (Number(data.repeatCount) || 1);
    const likes = Number(data.likeCount) || 0;
    const quantity = Number(data.repeatCount) || 1;
    if (coins < event.minCoins || likes < event.minLikes || quantity < event.minQuantity) {
      return complete({ handled: true, responded: false, reason: 'minimum-filter' });
    }
    const decision = this.decideLiveHostResponse(eventType, data, event, liveHost);

    this.liveHostEventCooldowns ||= new Map();
    const now = Date.now();
    if (now - (this.liveHostEventCooldowns.get(eventType) || 0) < event.cooldownMs) {
      return complete({ handled: true, responded: false, reason: 'cooldown' });
    }
    this.liveHostEventCooldowns.set(eventType, now);

    if (event.avatarActionEnabled && this.isConnected) {
      const action = this.selectSituationalAvatarAction(eventType, data);
      if (action) {
        await this.executeAction(action, {
          username: data.uniqueId || data.username || 'Viewer',
          nickname: data.nickname || data.uniqueId || data.username || 'Viewer',
          giftName: data.giftName || '',
          count: data.repeatCount || data.likeCount || 1
        });
        this.liveHostLastAvatarActionAt = Date.now();
      }
    }

    if (!decision.respond) return complete({ handled: true, responded: false, decision });
    if (!this.canUseLiveHostResponseSlot(liveHost)) {
      return complete({ handled: true, responded: false, decision, rateLimited: true, reason: 'rate-limited' });
    }

    const username = data.uniqueId || data.username || 'Viewer';
    let responded = false;
    if (event.templateEnabled && event.template) {
      const message = this._formatLiveHostMessage(this._renderLiveHostTemplate(event.template, data));
      if (message) {
        await this.speakHostResponse(message, { eventType, username, userId: username });
        responded = true;
        this.recordLiveHostResponseSlot();
      }
    }

    if (event.brainEnabled && this.brainEngine && eventType !== 'join') {
      const method = {
        chat: () => this.brainEngine.processChat(username, data.comment || '', { nickname: data.nickname, forceRespond: true, systemPromptOverride: event.prompt, decision }),
        gift: () => this.brainEngine.processGift(username, data.giftName || 'gift', coins || 1, { nickname: data.nickname, forceRespond: true, systemPromptOverride: event.prompt, decision }),
        follow: () => this.brainEngine.processFollow(username, { nickname: data.nickname, forceRespond: true, systemPromptOverride: event.prompt, decision }),
        share: () => this.brainEngine.processShare(username, { nickname: data.nickname, forceRespond: true, systemPromptOverride: event.prompt, decision }),
        like: () => this.brainEngine.processLike(username, likes || 1, { nickname: data.nickname, forceRespond: true, systemPromptOverride: event.prompt, decision }),
        subscribe: () => this.brainEngine.processSubscribe(username, { nickname: data.nickname, forceRespond: true, systemPromptOverride: event.prompt, decision })
      }[eventType];
      const response = method ? await method() : null;
      if (response?.text) {
        await this.speakHostResponse(this._formatLiveHostMessage(response.text), { eventType, username, userId: username });
        responded = true;
        this.recordLiveHostResponseSlot();
      }
    }
    return complete({ handled: true, responded });
  }

  resolveAvatarBundleForGift(gift = {}) {
    const liveHost = this.config?.brain?.liveHost || buildLiveHostDefaults();
    if (!liveHost.avatarSwitch?.enabled) return null;
    const bundles = Array.isArray(liveHost.avatarBundles) ? liveHost.avatarBundles : [];
    const giftId = gift.giftId === null || gift.giftId === undefined ? '' : String(gift.giftId).trim();
    const giftName = String(gift.giftName || '').trim().toLocaleLowerCase();
    const byId = giftId
      ? bundles.find(bundle => (bundle.giftIds || []).some(id => String(id).trim() === giftId))
      : null;
    if (byId) return byId;
    if (!liveHost.avatarSwitch.matchGiftNameFallback || !giftName) return null;
    return bundles.find(bundle => (bundle.giftNames || []).some(name => String(name).trim().toLocaleLowerCase() === giftName)) || null;
  }

  async activateAvatarBundle(bundleId, options = {}) {
    const liveHost = this.config?.brain?.liveHost;
    const bundle = liveHost?.avatarBundles?.find(item => item.id === bundleId);
    if (!bundle) return { success: false, error: 'Avatar bundle not found' };

    const previousBundleId = liveHost.activeAvatarBundleId || '';
    if (bundle.avatarName) {
      const loaded = await this.loadAvatar(bundle.avatarName);
      if (!loaded) return { success: false, error: `Avatar could not be loaded: ${bundle.avatarName}` };
    }
    if (bundle.personalityId && this.brainEngine) {
      await this.brainEngine.setActivePersonality(bundle.personalityId);
      this.config.brain.activePersonality = bundle.personalityId;
    }

    liveHost.activeAvatarBundleId = bundle.id;
    this.api.setConfig?.('config', this.config);
    this.api.emit('animazingpal:avatar-bundle-activated', {
      bundleId: bundle.id,
      avatarName: bundle.avatarName || null,
      personalityId: bundle.personalityId || null,
      reason: options.reason || 'manual'
    });

    if (this.avatarRevertTimer) clearTimeout(this.avatarRevertTimer);
    if (!liveHost.avatarSwitch.persistUntilNextSwitch && liveHost.avatarSwitch.revertAfterMs > 0 && previousBundleId) {
      this.avatarRevertTimer = setTimeout(() => {
        this.activateAvatarBundle(previousBundleId, { reason: 'automatic-revert' }).catch(error => {
          this.api.log(`Avatar bundle revert failed: ${error.message}`, 'warn');
        });
      }, liveHost.avatarSwitch.revertAfterMs);
    }

    return { success: true, bundle };
  }

  relayChatMessage(message, options = {}) {
    const useEcho = options.useEcho ?? false;
    const liveHost = this.config?.brain?.liveHost;
    const sourceEvent = options.metadata?.sourceEvent || options.eventType || 'manual';
    const hostSpeechEvents = new Set(['brainResponse', 'standaloneResponse', 'gift', 'follow', 'share', 'like', 'subscribe', 'join']);
    const useFishHost = !!liveHost?.enabled && !!liveHost?.tts?.enabled && hostSpeechEvents.has(options.eventType);

    if (useFishHost) {
      this.speakHostResponse(message, {
        username: options.username,
        eventType: sourceEvent,
        userId: options.metadata?.userId
      }).catch(error => {
        this.api.log(`Failed to relay host response to Fish.audio: ${error.message}`, 'warn');
      });
    }

    if (this.isConnected && !useFishHost) {
      try {
        const result = this.sendChatMessage(message, useEcho);
        if (result && typeof result.catch === 'function') {
          result.catch((error) => {
            this.api.log(`Failed to relay chat message to local platform: ${error.message}`, 'warn');
          });
        }
      } catch (error) {
        this.api.log(`Failed to relay chat message to local platform: ${error.message}`, 'warn');
      }
    }

    const integration = this.getVrchatIntegrationConfig();
    const shouldForwardToVrchat = (() => {
      switch (options.eventType) {
        case 'chat':
          return integration.forwardChatToChatbox !== false;
        case 'brainResponse':
          return integration.forwardBrainResponses !== false;
        case 'standaloneResponse':
          return integration.forwardStandaloneResponses !== false;
        default:
          return true;
      }
    })();

    if (this.isVrchatIntegrationEnabled() && shouldForwardToVrchat) {
      this.emitVrchatIntent(options.eventType || 'chatbox', {
        kind: options.kind || 'chatbox',
        username: options.username || null,
        message,
        messageTemplate: options.messageTemplate || null,
        showTyping: options.showTyping,
        gesture: options.gesture,
        slot: options.slot,
        duration: options.duration,
        parameters: options.parameters,
        targetPluginId: options.targetPluginId,
        targetLabel: options.targetLabel,
        metadata: options.metadata || {}
      });
    }

    return true;
  }

  /**
   * Evaluate logic matrix rules for an event
   * Returns the matched rule's actions or null
   */
  evaluateLogicMatrix(eventType, eventData = {}) {
    if (!this.config.logicMatrix?.enabled || !this.config.logicMatrix.rules) {
      return null;
    }
    
    const rules = this.config.logicMatrix.rules
      .filter(r => r.conditions && r.actions)
      .sort((a, b) => (b.priority || 0) - (a.priority || 0)); // Sort by priority descending
    
    for (const rule of rules) {
      const conditions = rule.conditions;
      let matches = true;
      
      // Check eventType
      if (conditions.eventType && conditions.eventType !== eventType) {
        matches = false;
      }
      
      // Check giftValueTier
      if (matches && conditions.giftValueTier && eventData.giftValue) {
        const tier = eventData.giftValue < 10 ? 'low' : eventData.giftValue < 100 ? 'medium' : 'high';
        if (tier !== conditions.giftValueTier) {
          matches = false;
        }
      }
      
      // Check userIsNew
      if (matches && conditions.userIsNew !== undefined) {
        const isNew = eventData.isNewUser || false;
        if (isNew !== conditions.userIsNew) {
          matches = false;
        }
      }
      
      // Check mentions (keywords in message)
      if (matches && conditions.mentions && conditions.mentions.length > 0 && eventData.message) {
        const message = eventData.message.toLowerCase();
        const hasMention = conditions.mentions.some(keyword => 
          message.includes(keyword.toLowerCase())
        );
        if (!hasMention) {
          matches = false;
        }
      }
      
      // Check energyLevel (placeholder for now)
      if (matches && conditions.energyLevel) {
        // This could be calculated based on recent event frequency
        // For now, we'll skip this check
      }
      
      // Check personaTag
      if (matches && conditions.personaTag) {
        const personality = this.brainEngine?.currentPersonality;
        if (!personality || !personality.tags || !personality.tags.includes(conditions.personaTag)) {
          matches = false;
        }
      }
      
      if (matches) {
        this.api.log(`Logic matrix rule matched: ${rule.name || rule.id}`, 'info');
        return {
          ...rule.actions,
          stopOnMatch: rule.stopOnMatch || false
        };
      }
    }
    
    return null;
  }

  canTriggerEvent(eventType, userId = 'global') {
    const key = `${eventType}:${userId}`;
    const now = Date.now();
    const lastTime = this.lastEventTimes.get(key) || 0;
    const cooldown = this.eventCooldowns[eventType] || 1000;
    
    if (now - lastTime < cooldown) {
      return false;
    }
    
    this.lastEventTimes.set(key, now);
    return true;
  }

  /**
   * Execute an action based on configuration
   */
  async executeAction(actionConfig, placeholders = {}) {
    if (!actionConfig || !actionConfig.actionType) return;

    const { actionType, actionValue, chatMessage, useEcho } = actionConfig;
    const platformKey = this.getActivePlatformKey();
    const adapter = platformKey === 'animaze' ? null : this.getActivePlatformAdapter();

    // Execute the main action
    switch (actionType) {
      case 'emote':
        if (actionValue) {
          await this.triggerEmote(actionValue);
        }
        break;
      case 'specialAction':
        if (actionValue !== null && actionValue !== undefined) {
          await this.triggerSpecialAction(actionValue);
        }
        break;
      case 'pose':
        if (actionValue !== null && actionValue !== undefined) {
          await this.triggerPose(actionValue);
        }
        break;
      case 'idle':
        if (actionValue !== null && actionValue !== undefined) {
          await this.triggerIdle(actionValue);
        }
        break;
      case 'chatMessage':
        // Only send chat message, no animation
        break;
      case 'hotkey':
        if (adapter) {
          await adapter.executeAction('hotkey', actionValue);
        }
        break;
      case 'expression':
        if (adapter) {
          await adapter.executeAction('expression', actionValue);
        }
        break;
      case 'motion':
        if (adapter) {
          await adapter.executeAction('motion', actionValue);
        }
        break;
      case 'reset':
        if (adapter) {
          await adapter.executeAction('reset', actionValue);
        }
        break;
      case 'loadAvatar':
        if (actionValue !== null && actionValue !== undefined) {
          await this.loadAvatar(actionValue);
        }
        break;
    }

    // Send chat message if configured
    if (chatMessage) {
      let message = chatMessage;
      // Replace placeholders
      for (const [key, value] of Object.entries(placeholders)) {
        message = message.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
      }
      
      // Determine if we should use echo
      // Priority: per-event override > forceTtsOnlyOnActions > global setting
      let shouldUseEcho = this.config.chatToAvatar?.useEcho || false;
      
      if (this.config.brain?.forceTtsOnlyOnActions) {
        shouldUseEcho = true;
      }
      
      if (useEcho !== null && useEcho !== undefined) {
        shouldUseEcho = useEcho;
      }
      
      await this.sendChatMessage(message, shouldUseEcho);
    }
  }

  handleGiftEvent(data) {
    if (!this.config.enabled || (!this.isConnected && !this.isVrchatIntegrationEnabled())) return;
    const username = data.uniqueId || 'Someone';
    if (!this.canTriggerEvent('gift', username)) return;

    const giftId = data.giftId;
    const giftName = data.giftName;
    const giftValue = data.diamondCount || 1;
    const liveHost = this.config.brain?.liveHost;
    const avatarBundle = this.resolveAvatarBundleForGift({ giftId, giftName });
    const giftSequenceComplete = data.repeatEnd !== false;
    let avatarReady = Promise.resolve();
    if (avatarBundle && liveHost?.events?.gift?.avatarActionEnabled && (!liveHost?.avatarSwitch?.waitForRepeatEnd || giftSequenceComplete)) {
      avatarReady = this.activateAvatarBundle(avatarBundle.id, { reason: `gift:${giftId || giftName}` }).catch(error => {
        this.api.log(`Gift avatar bundle activation failed: ${error.message}`, 'error');
      });
    }
    avatarReady.then(() => this.processLiveHostEvent('gift', data)).catch(error => this.api.log(`Live host gift error: ${error.message}`, 'warn'));

    // Evaluate logic matrix first
    const logicMatrixAction = this.evaluateLogicMatrix('gift', {
      giftValue,
      giftName,
      username,
      isNewUser: data.isNewUser
    });

    // Find matching gift mapping
    const mapping = this.config.giftMappings?.find(m => 
      (m.giftId && m.giftId === giftId) || 
      (m.giftName && m.giftName === giftName)
    );

    const placeholders = {
      username,
      nickname: data.nickname || username,
      giftName: giftName || 'a gift',
      count: data.repeatCount || 1
    };

    this.emitVrchatIntent('gift', {
      username,
      giftId,
      giftName,
      giftValue,
      messageTemplate: this.getVrchatEventMapping('gift').messageTemplate,
      metadata: {
        giftId,
        giftName,
        giftValue,
        repeatCount: data.repeatCount || 1
      }
    });

    // Execute logic matrix action if matched
    if (logicMatrixAction && this.isConnected) {
      if (logicMatrixAction.emote) {
        this.triggerEmote(logicMatrixAction.emote);
      }
      if (logicMatrixAction.specialAction !== null && logicMatrixAction.specialAction !== undefined) {
        this.triggerSpecialAction(logicMatrixAction.specialAction);
      }
      if (logicMatrixAction.pose !== null && logicMatrixAction.pose !== undefined) {
        this.triggerPose(logicMatrixAction.pose);
      }
      if (logicMatrixAction.idle !== null && logicMatrixAction.idle !== undefined) {
        this.triggerIdle(logicMatrixAction.idle);
      }
      if (logicMatrixAction.chatMessage) {
        let message = logicMatrixAction.chatMessage;
        for (const [key, value] of Object.entries(placeholders)) {
          message = message.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
        }
        
        const useEcho = this.resolveEchoSetting('gift');
        
        this.relayChatMessage(message, {
          eventType: 'gift',
          kind: 'chatbox',
          username,
          useEcho,
          metadata: {
            giftId,
            giftName,
            giftValue,
            source: 'logicMatrix'
          }
        });
      }
      
      if (logicMatrixAction.stopOnMatch) {
        this.api.emit('animazingpal:gift-handled', { giftId, giftName, username, logicMatrixAction });
        return;
      }
    }

    // Execute gift mapping if exists
    if (mapping && this.isConnected) {
      this.api.log(`Gift mapping triggered: ${giftName} (${giftId})`, 'info');
      this.executeAction(mapping, placeholders);
    }

    // Always log memory even in standalone mode (for future GPT use)
    if (this.brainEngine) {
      this.brainEngine.storeMemory(`${username} sent gift: ${giftName}`, {
        type: 'gift',
        user: username,
        event: 'gift',
        importance: 0.6,
        context: { giftName, giftValue }
      });
    }

    // Handle response based on standalone mode
    if (this.brainEngine && this.config.brain?.enabled && !this.config.brain?.liveHost?.enabled) {
      if (this.config.brain.standaloneMode) {
        // Standalone mode: use template-based response
        const message = this.buildStandaloneResponse('gift', placeholders);
        if (message) {
          const useEcho = this.resolveEchoSetting('gift');
          
          this.relayChatMessage(message, {
            eventType: 'standaloneResponse',
            kind: 'chatbox',
            username,
            useEcho,
            metadata: {
              sourceEvent: 'gift',
              giftId,
              giftName,
              giftValue
            }
          });
          this.api.emit('animazingpal:standalone-response', {
            type: 'gift',
            username,
            response: message
          });
        }
      } else {
        // GPT mode: intelligent response
        this.brainEngine.processGift(username, giftName, giftValue, {
          nickname: data.nickname
        }).then(response => {
          if (response) {
            // Send AI-generated thank you message to Animaze
            this.relayChatMessage(response.text, {
              eventType: 'brainResponse',
              kind: 'chatbox',
              username,
              useEcho: false,
              metadata: {
                sourceEvent: 'gift',
                giftId,
                giftName,
                giftValue,
                emotion: response.emotion
              }
            });
            this.api.emit('animazingpal:brain-response', {
              type: 'gift',
              username,
              response: response.text,
              emotion: response.emotion
            });
          }
        }).catch(err => {
          this.api.log(`Brain gift response error: ${err.message}`, 'error');
        });
      }
    }

    this.recordViewerbaseActivity('gift', {
      username,
      nickname: data.nickname || username,
      giftName,
      giftValue
    });

    this.api.emit('animazingpal:gift-handled', {
      giftId,
      giftName,
      username,
      mapping,
      logicMatrixAction
    });
  }

  handleChatEvent(data) {
    if (!this.config.enabled || (!this.isConnected && !this.isVrchatIntegrationEnabled())) return;
    const username = data.uniqueId || 'Someone';
    if (!this.canTriggerEvent('chat', username)) return;

    const comment = data.comment;

    if (!comment) return;
    this.processLiveHostEvent('chat', data).catch(error => this.api.log(`Live host chat error: ${error.message}`, 'warn'));

    const placeholders = {
      username,
      nickname: data.nickname || username,
      comment
    };

    if (this.getVrchatIntegrationConfig().forwardChatToChatbox !== false) {
      this.emitVrchatIntent('chat', {
        username,
        comment,
        messageTemplate: this.getVrchatEventMapping('chat').messageTemplate,
        metadata: {
          comment,
          nickname: data.nickname || username,
          sourceEvent: 'chat'
        }
      });
    }

    // Evaluate logic matrix first
    const logicMatrixAction = this.evaluateLogicMatrix('chat', {
      username,
      comment,
      isNewUser: data.isNewUser
    });

    // Execute logic matrix action if matched
    if (logicMatrixAction && this.isConnected) {
      if (logicMatrixAction.emote) {
        this.triggerEmote(logicMatrixAction.emote);
      }
      if (logicMatrixAction.specialAction !== null && logicMatrixAction.specialAction !== undefined) {
        this.triggerSpecialAction(logicMatrixAction.specialAction);
      }
      if (logicMatrixAction.pose !== null && logicMatrixAction.pose !== undefined) {
        this.triggerPose(logicMatrixAction.pose);
      }
      if (logicMatrixAction.idle !== null && logicMatrixAction.idle !== undefined) {
        this.triggerIdle(logicMatrixAction.idle);
      }
      if (logicMatrixAction.chatMessage) {
        let message = logicMatrixAction.chatMessage;
        for (const [key, value] of Object.entries(placeholders)) {
          message = message.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
        }
        
        const useEcho = this.resolveEchoSetting('chat');
        
        this.relayChatMessage(message, {
          eventType: 'chat',
          kind: 'chatbox',
          username,
          useEcho,
          metadata: {
            comment,
            source: 'logicMatrix'
          }
        });
      }
      
      if (logicMatrixAction.stopOnMatch) {
        this.api.emit('animazingpal:chat-handled', { username, comment, logicMatrixAction });
        return;
      }
    }

    // Execute configured action
    if (this.isConnected && this.config.eventActions?.chat?.enabled) {
      this.executeAction(this.config.eventActions.chat, placeholders);
    }

    // Legacy: Forward to ChatPal directly if enabled (without AI)
    if (this.config.chatToAvatar?.enabled) {
      const prefix = this.config.chatToAvatar.prefix || '';
      let message = prefix ? `${prefix} ${username}: ${comment}` : `${username}: ${comment}`;

      const maxLength = this.config.chatToAvatar.maxLength || 200;
      if (message.length > maxLength) {
        message = message.substring(0, maxLength - 3) + '...';
      }

      this.relayChatMessage(message, {
        eventType: 'chat',
        kind: 'chatbox',
        username,
        useEcho: this.config.chatToAvatar.useEcho,
        metadata: {
          comment,
          source: 'chatToAvatar'
        }
      });

      this.api.emit('animazingpal:chat-forwarded', {
        username,
        comment,
        message
      });
    }

    // Always log memory even in standalone mode
    if (this.brainEngine) {
      this.brainEngine.storeMemory(`${username}: ${comment}`, {
        type: 'chat',
        user: username,
        event: 'chat',
        importance: 0.3,
        context: { comment }
      });
    }

    // Handle response based on standalone mode
    if (this.brainEngine && this.config.brain?.enabled && !this.config.brain?.liveHost?.enabled && this.config.brain?.autoRespond?.chat) {
      if (this.config.brain.standaloneMode) {
        // Standalone mode: use template-based response
        const message = this.buildStandaloneResponse('chat', placeholders);
        if (message) {
          const useEcho = this.resolveEchoSetting('chat');
          
          this.relayChatMessage(message, {
            eventType: 'standaloneResponse',
            kind: 'chatbox',
            username,
            useEcho,
            metadata: {
              sourceEvent: 'chat',
              comment
            }
          });
          this.api.emit('animazingpal:standalone-response', {
            type: 'chat',
            username,
            userMessage: comment,
            response: message
          });
        }
      } else {
        // GPT mode: intelligent response
        this.brainEngine.processChat(username, comment, {
          nickname: data.nickname
        }).then(response => {
          if (response) {
            this.relayChatMessage(response.text, {
              eventType: 'brainResponse',
              kind: 'chatbox',
              username,
              useEcho: false,
              metadata: {
                sourceEvent: 'chat',
                comment,
                emotion: response.emotion
              }
            });
            this.api.emit('animazingpal:brain-response', {
              type: 'chat',
              username,
              userMessage: comment,
              response: response.text,
              emotion: response.emotion
            });
          }
        }).catch(err => {
          this.api.log(`Brain chat response error: ${err.message}`, 'error');
        });
      }
    }

    this.recordViewerbaseActivity('chat', {
      username,
      nickname: data.nickname || username
    });

    this.api.emit('animazingpal:chat-handled', { username, comment, logicMatrixAction });
  }

  handleFollowEvent(data) {
    if (!this.config.enabled || (!this.isConnected && !this.isVrchatIntegrationEnabled())) return;
    const username = data.uniqueId || 'Someone';
    if (!this.canTriggerEvent('follow', username)) return;

    this.api.log(`Follow event from ${username}`, 'info');

    const placeholders = { username, nickname: data.nickname || username };
    this.processLiveHostEvent('follow', data).catch(error => this.api.log(`Live host follow error: ${error.message}`, 'warn'));

    this.emitVrchatIntent('follow', {
      username,
      messageTemplate: this.getVrchatEventMapping('follow').messageTemplate,
      metadata: {
        nickname: data.nickname || username,
        sourceEvent: 'follow'
      }
    });

    // Evaluate logic matrix
    const logicMatrixAction = this.evaluateLogicMatrix('follow', {
      username,
      isNewUser: data.isNewUser
    });

    // Execute logic matrix action if matched
    if (logicMatrixAction && this.isConnected) {
      if (logicMatrixAction.emote) {
        this.triggerEmote(logicMatrixAction.emote);
      }
      if (logicMatrixAction.specialAction !== null && logicMatrixAction.specialAction !== undefined) {
        this.triggerSpecialAction(logicMatrixAction.specialAction);
      }
      if (logicMatrixAction.chatMessage) {
        let message = logicMatrixAction.chatMessage;
        for (const [key, value] of Object.entries(placeholders)) {
          message = message.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
        }
        
        const useEcho = this.resolveEchoSetting('follow');
        
        this.relayChatMessage(message, {
          eventType: 'follow',
          kind: 'chatbox',
          username,
          useEcho,
          metadata: {
            source: 'logicMatrix'
          }
        });
      }
      
      if (logicMatrixAction.stopOnMatch) {
        this.api.emit('animazingpal:follow-handled', { username, logicMatrixAction });
        return;
      }
    }

    // Execute configured action
    if (this.isConnected && this.config.eventActions?.follow?.enabled) {
      this.executeAction(this.config.eventActions.follow, placeholders);
    }

    // Always log memory even in standalone mode
    if (this.brainEngine) {
      this.brainEngine.storeMemory(`${username} followed the channel`, {
        type: 'follow',
        user: username,
        event: 'follow',
        importance: 0.5
      });
    }

    // Handle response based on standalone mode
    if (this.brainEngine && this.config.brain?.enabled && !this.config.brain?.liveHost?.enabled && this.config.brain?.autoRespond?.follows) {
      if (this.config.brain.standaloneMode) {
        // Standalone mode: use template-based response
        const message = this.buildStandaloneResponse('follow', placeholders);
        if (message) {
          const useEcho = this.resolveEchoSetting('follow');
          
          this.relayChatMessage(message, {
            eventType: 'standaloneResponse',
            kind: 'chatbox',
            username,
            useEcho,
            metadata: {
              sourceEvent: 'follow'
            }
          });
          this.api.emit('animazingpal:standalone-response', {
            type: 'follow',
            username,
            response: message
          });
        }
      } else {
        // GPT mode: intelligent response
        this.brainEngine.processFollow(username, {
          nickname: data.nickname
        }).then(response => {
          if (response) {
            this.relayChatMessage(response.text, {
              eventType: 'brainResponse',
              kind: 'chatbox',
              username,
              useEcho: false,
              metadata: {
                sourceEvent: 'follow',
                emotion: response.emotion
              }
            });
            this.api.emit('animazingpal:brain-response', {
              type: 'follow',
              username,
              response: response.text,
              emotion: response.emotion
            });
          }
        }).catch(err => {
          this.api.log(`Brain follow response error: ${err.message}`, 'error');
        });
      }
    }

    this.recordViewerbaseActivity('follow', {
      username,
      nickname: data.nickname || username
    });

    this.api.emit('animazingpal:follow-handled', { username, logicMatrixAction });
  }

  handleShareEvent(data) {
    if (!this.config.enabled || (!this.isConnected && !this.isVrchatIntegrationEnabled())) return;
    const username = data.uniqueId || 'Someone';
    if (!this.canTriggerEvent('share', username)) return;

    this.api.log(`Share event from ${username}`, 'info');

    const placeholders = { username, nickname: data.nickname || username };
    this.processLiveHostEvent('share', data).catch(error => this.api.log(`Live host share error: ${error.message}`, 'warn'));

    this.emitVrchatIntent('share', {
      username,
      messageTemplate: this.getVrchatEventMapping('share').messageTemplate,
      metadata: {
        nickname: data.nickname || username,
        sourceEvent: 'share'
      }
    });

    // Evaluate logic matrix first
    const logicMatrixAction = this.evaluateLogicMatrix('share', {
      username,
      isNewUser: data.isNewUser
    });

    // Execute logic matrix action if matched
    if (logicMatrixAction && this.isConnected) {
      if (logicMatrixAction.emote) {
        this.triggerEmote(logicMatrixAction.emote);
      }
      if (logicMatrixAction.specialAction !== null && logicMatrixAction.specialAction !== undefined) {
        this.triggerSpecialAction(logicMatrixAction.specialAction);
      }
      if (logicMatrixAction.pose !== null && logicMatrixAction.pose !== undefined) {
        this.triggerPose(logicMatrixAction.pose);
      }
      if (logicMatrixAction.idle !== null && logicMatrixAction.idle !== undefined) {
        this.triggerIdle(logicMatrixAction.idle);
      }
      if (logicMatrixAction.chatMessage) {
        let message = logicMatrixAction.chatMessage;
        for (const [key, value] of Object.entries(placeholders)) {
          message = message.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
        }
        
        const useEcho = this.resolveEchoSetting('share');
        
        this.relayChatMessage(message, {
          eventType: 'share',
          kind: 'chatbox',
          username,
          useEcho,
          metadata: {
            source: 'logicMatrix'
          }
        });
      }
      
      if (logicMatrixAction.stopOnMatch) {
        this.api.emit('animazingpal:share-handled', { username, logicMatrixAction });
        return;
      }
    }

    // Execute configured action
    if (this.isConnected && this.config.eventActions?.share?.enabled) {
      this.executeAction(this.config.eventActions.share, placeholders);
    }

    // Always log memory even in standalone mode
    if (this.brainEngine) {
      this.brainEngine.storeMemory(`${username} shared the stream`, {
        type: 'share',
        user: username,
        event: 'share',
        importance: 0.5
      });
    }

    // Handle response based on standalone mode
    if (this.brainEngine && this.config.brain?.enabled && !this.config.brain?.liveHost?.enabled && this.config.brain?.autoRespond?.shares) {
      if (this.config.brain.standaloneMode) {
        // Standalone mode: use template-based response
        const message = this.buildStandaloneResponse('share', placeholders);
        if (message) {
          const useEcho = this.resolveEchoSetting('share');
          
          this.relayChatMessage(message, {
            eventType: 'standaloneResponse',
            kind: 'chatbox',
            username,
            useEcho,
            metadata: {
              sourceEvent: 'share'
            }
          });
          this.api.emit('animazingpal:standalone-response', {
            type: 'share',
            username,
            response: message
          });
        }
      } else {
        // GPT mode: intelligent response
        this.brainEngine.processShare(username, {
          nickname: data.nickname
        }).then(response => {
          if (response) {
            this.relayChatMessage(response.text, {
              eventType: 'brainResponse',
              kind: 'chatbox',
              username,
              useEcho: false,
              metadata: {
                sourceEvent: 'share',
                emotion: response.emotion
              }
            });
            this.api.emit('animazingpal:brain-response', {
              type: 'share',
              username,
              response: response.text,
              emotion: response.emotion
            });
          }
        }).catch(err => {
          this.api.log(`Brain share response error: ${err.message}`, 'error');
        });
      }
    }

    this.recordViewerbaseActivity('share', {
      username,
      nickname: data.nickname || username
    });

    this.api.emit('animazingpal:share-handled', { username, logicMatrixAction });
  }

  handleLikeEvent(data) {
    if (!this.config.enabled || (!this.isConnected && !this.isVrchatIntegrationEnabled())) return;
    const username = data.uniqueId || 'Someone';
    if (!this.canTriggerEvent('like', username)) return;

    const likeCount = data.likeCount || 1;
    this.processLiveHostEvent('like', data).catch(error => this.api.log(`Live host like error: ${error.message}`, 'warn'));
    const action = this.config.eventActions?.like;
    const threshold = action?.threshold || 10;

    // Only trigger after threshold likes
    if (likeCount < threshold) return;

    const placeholders = {
      username,
      nickname: data.nickname || username,
      likeCount
    };

    this.emitVrchatIntent('like', {
      username,
      likeCount,
      messageTemplate: this.getVrchatEventMapping('like').messageTemplate,
      metadata: {
        nickname: data.nickname || username,
        sourceEvent: 'like'
      }
    });

    // Evaluate logic matrix first
    const logicMatrixAction = this.evaluateLogicMatrix('like', {
      username,
      likeCount,
      isNewUser: data.isNewUser
    });

    // Execute logic matrix action if matched
    if (logicMatrixAction && this.isConnected) {
      if (logicMatrixAction.emote) {
        this.triggerEmote(logicMatrixAction.emote);
      }
      if (logicMatrixAction.specialAction !== null && logicMatrixAction.specialAction !== undefined) {
        this.triggerSpecialAction(logicMatrixAction.specialAction);
      }
      if (logicMatrixAction.pose !== null && logicMatrixAction.pose !== undefined) {
        this.triggerPose(logicMatrixAction.pose);
      }
      if (logicMatrixAction.idle !== null && logicMatrixAction.idle !== undefined) {
        this.triggerIdle(logicMatrixAction.idle);
      }
      if (logicMatrixAction.chatMessage) {
        let message = logicMatrixAction.chatMessage;
        for (const [key, value] of Object.entries(placeholders)) {
          message = message.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
        }
        
        const useEcho = this.resolveEchoSetting('like');
        
        this.relayChatMessage(message, {
          eventType: 'like',
          kind: 'chatbox',
          username,
          useEcho,
          metadata: {
            source: 'logicMatrix'
          }
        });
      }
      
      if (logicMatrixAction.stopOnMatch) {
        this.api.emit('animazingpal:like-handled', { username, likeCount, logicMatrixAction });
        return;
      }
    }

    // Execute configured action
    if (this.isConnected && action?.enabled) {
      this.executeAction(action, placeholders);
    }

    // Always log memory even in standalone mode
    if (this.brainEngine) {
      this.brainEngine.storeMemory(`${username} sent ${likeCount} likes`, {
        type: 'like',
        user: username,
        event: 'like',
        importance: 0.2,
        context: { likeCount }
      });
    }

    // Handle response based on standalone mode
    if (this.brainEngine && this.config.brain?.enabled && !this.config.brain?.liveHost?.enabled && this.config.brain?.autoRespond?.like) {
      if (this.config.brain.standaloneMode) {
        // Standalone mode: use template-based response
        const message = this.buildStandaloneResponse('like', placeholders);
        if (message) {
          const useEcho = this.resolveEchoSetting('like');
          
          this.relayChatMessage(message, {
            eventType: 'standaloneResponse',
            kind: 'chatbox',
            username,
            useEcho,
            metadata: {
              sourceEvent: 'like',
              likeCount
            }
          });
          this.api.emit('animazingpal:standalone-response', {
            type: 'like',
            username,
            likeCount,
            response: message
          });
        }
      } else {
        // GPT mode: intelligent response
        this.brainEngine.processLike(username, likeCount, {
          nickname: data.nickname
        }).then(response => {
          if (response) {
            this.relayChatMessage(response.text, {
              eventType: 'brainResponse',
              kind: 'chatbox',
              username,
              useEcho: false,
              metadata: {
                sourceEvent: 'like',
                likeCount,
                emotion: response.emotion
              }
            });
            this.api.emit('animazingpal:brain-response', {
              type: 'like',
              username,
              likeCount,
              response: response.text,
              emotion: response.emotion
            });
          }
        }).catch(err => {
          this.api.log(`Brain like response error: ${err.message}`, 'error');
        });
      }
    }

    this.recordViewerbaseActivity('like', {
      username,
      nickname: data.nickname || username,
      likeCount
    });

    this.api.emit('animazingpal:like-handled', { username, likeCount, logicMatrixAction });
  }

  handleSubscribeEvent(data) {
    if (!this.config.enabled || (!this.isConnected && !this.isVrchatIntegrationEnabled())) return;
    const username = data.uniqueId || 'Someone';
    if (!this.canTriggerEvent('subscribe', username)) return;

    this.api.log(`Subscribe event from ${username}`, 'info');

    const placeholders = { username, nickname: data.nickname || username };
    this.processLiveHostEvent('subscribe', data).catch(error => this.api.log(`Live host subscribe error: ${error.message}`, 'warn'));

    this.emitVrchatIntent('subscribe', {
      username,
      messageTemplate: this.getVrchatEventMapping('subscribe').messageTemplate,
      metadata: {
        nickname: data.nickname || username,
        sourceEvent: 'subscribe'
      }
    });

    // Evaluate logic matrix first
    const logicMatrixAction = this.evaluateLogicMatrix('subscribe', {
      username,
      isNewUser: data.isNewUser
    });

    // Execute logic matrix action if matched
    if (logicMatrixAction && this.isConnected) {
      if (logicMatrixAction.emote) {
        this.triggerEmote(logicMatrixAction.emote);
      }
      if (logicMatrixAction.specialAction !== null && logicMatrixAction.specialAction !== undefined) {
        this.triggerSpecialAction(logicMatrixAction.specialAction);
      }
      if (logicMatrixAction.pose !== null && logicMatrixAction.pose !== undefined) {
        this.triggerPose(logicMatrixAction.pose);
      }
      if (logicMatrixAction.idle !== null && logicMatrixAction.idle !== undefined) {
        this.triggerIdle(logicMatrixAction.idle);
      }
      if (logicMatrixAction.chatMessage) {
        let message = logicMatrixAction.chatMessage;
        for (const [key, value] of Object.entries(placeholders)) {
          message = message.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
        }
        
        const useEcho = this.resolveEchoSetting('subscribe');
        
        this.relayChatMessage(message, {
          eventType: 'subscribe',
          kind: 'chatbox',
          username,
          useEcho,
          metadata: {
            source: 'logicMatrix'
          }
        });
      }
      
      if (logicMatrixAction.stopOnMatch) {
        this.api.emit('animazingpal:subscribe-handled', { username, logicMatrixAction });
        return;
      }
    }

    // Execute configured action
    if (this.isConnected && this.config.eventActions?.subscribe?.enabled) {
      this.executeAction(this.config.eventActions.subscribe, placeholders);
    }

    // Always log memory even in standalone mode
    if (this.brainEngine) {
      this.brainEngine.storeMemory(`${username} subscribed`, {
        type: 'subscribe',
        user: username,
        event: 'subscribe',
        importance: 0.7
      });
    }

    // Handle response based on standalone mode
    if (this.brainEngine && this.config.brain?.enabled && !this.config.brain?.liveHost?.enabled && this.config.brain?.autoRespond?.subscribe) {
      if (this.config.brain.standaloneMode) {
        // Standalone mode: use template-based response
        const message = this.buildStandaloneResponse('subscribe', placeholders);
        if (message) {
          const useEcho = this.resolveEchoSetting('subscribe');
          
          this.relayChatMessage(message, {
            eventType: 'standaloneResponse',
            kind: 'chatbox',
            username,
            useEcho,
            metadata: {
              sourceEvent: 'subscribe'
            }
          });
          this.api.emit('animazingpal:standalone-response', {
            type: 'subscribe',
            username,
            response: message
          });
        }
      } else {
        // GPT mode: intelligent response
        this.brainEngine.processSubscribe(username, {
          nickname: data.nickname
        }).then(response => {
          if (response) {
            this.relayChatMessage(response.text, {
              eventType: 'brainResponse',
              kind: 'chatbox',
              username,
              useEcho: false,
              metadata: {
                sourceEvent: 'subscribe',
                emotion: response.emotion
              }
            });
            this.api.emit('animazingpal:brain-response', {
              type: 'subscribe',
              username,
              response: response.text,
              emotion: response.emotion
            });
          }
        }).catch(err => {
          this.api.log(`Brain subscribe response error: ${err.message}`, 'error');
        });
      }
    }

    this.recordViewerbaseActivity('subscribe', {
      username,
      nickname: data.nickname || username
    });

    this.api.emit('animazingpal:subscribe-handled', { username, logicMatrixAction });
  }

  // ==================== Utility Methods ====================

  getSafeConfig() {
    // Return config without sensitive data (no API key)
    const activePlatformKey = this.getActivePlatformKey();
    const activeProfile = this.getPlatformProfile(activePlatformKey);
    const sanitizeProfile = (profile = {}) => {
      const safeProfile = { ...profile };
      if (Object.prototype.hasOwnProperty.call(safeProfile, 'authToken')) {
        safeProfile.authToken = '';
        safeProfile.authTokenConfigured = !!profile.authToken;
      }
      return safeProfile;
    };

    const platformProfiles = {};
    for (const [key, profile] of Object.entries(this.config.platform?.profiles || {})) {
      platformProfiles[key] = sanitizeProfile(profile);
    }

    const brainConfig = this.config.brain ? {
      enabled: this.config.brain.enabled,
      standaloneMode: this.config.brain.standaloneMode,
      forceTtsOnlyOnActions: this.config.brain.forceTtsOnlyOnActions,
      model: this.config.brain.model,
      activePersonality: this.config.brain.activePersonality,
      longTermMemory: this.config.brain.longTermMemory,
      memoryImportanceThreshold: this.config.brain.memoryImportanceThreshold,
      maxContextMemories: this.config.brain.maxContextMemories,
      archiveAfterDays: this.config.brain.archiveAfterDays,
      pruneAfterDays: this.config.brain.pruneAfterDays,
      memoryDecayHalfLife: this.config.brain.memoryDecayHalfLife,
      autoRespond: this.config.brain.autoRespond,
      maxResponsesPerMinute: this.config.brain.maxResponsesPerMinute,
      chatResponseProbability: this.config.brain.chatResponseProbability,
      apiKeyConfigured: !!this.config.brain.openaiApiKey,
      liveHost: sanitizeLiveHostConfig(this.config.brain.liveHost || buildLiveHostDefaults())
    } : null;

    const viewerbaseConfig = this.config.viewerbase ? {
      enabled: this.config.viewerbase.enabled,
      showInUI: this.config.viewerbase.showInUI,
      recentLimit: this.config.viewerbase.recentLimit,
      supporterLimit: this.config.viewerbase.supporterLimit,
      chatterLimit: this.config.viewerbase.chatterLimit,
      syncOnEvents: this.config.viewerbase.syncOnEvents,
      externalSync: {
        enabled: this.config.viewerbase.externalSync?.enabled,
        endpointUrl: this.config.viewerbase.externalSync?.endpointUrl || '',
        authToken: '',
        authTokenConfigured: !!this.config.viewerbase.externalSync?.authToken,
        timeoutMs: this.config.viewerbase.externalSync?.timeoutMs,
        retryLimit: this.config.viewerbase.externalSync?.retryLimit,
        includeRecentMemories: this.config.viewerbase.externalSync?.includeRecentMemories,
        includeTopSupporters: this.config.viewerbase.externalSync?.includeTopSupporters,
        includeFrequentChatters: this.config.viewerbase.externalSync?.includeFrequentChatters
      }
    } : null;

    return {
      enabled: this.config.enabled,
      platform: {
        active: activePlatformKey,
        definition: this.getActivePlatformDefinition(),
        profile: sanitizeProfile(activeProfile),
        profiles: platformProfiles,
        supported: this.getSupportedPlatforms()
      },
      autoConnect: activeProfile.autoConnect,
      host: activeProfile.host,
      port: activeProfile.port,
      reconnectOnDisconnect: activeProfile.reconnectOnDisconnect,
      reconnectDelay: activeProfile.reconnectDelay,
      autoRefreshData: activeProfile.autoRefreshData,
      giftMappings: this.config.giftMappings,
      chatToAvatar: this.config.chatToAvatar,
      vrchatIntegration: this.config.vrchatIntegration ? {
        enabled: this.config.vrchatIntegration.enabled,
        targetPluginId: this.config.vrchatIntegration.targetPluginId,
        targetLabel: this.config.vrchatIntegration.targetLabel,
        forwardChatToChatbox: this.config.vrchatIntegration.forwardChatToChatbox,
        forwardBrainResponses: this.config.vrchatIntegration.forwardBrainResponses,
        forwardStandaloneResponses: this.config.vrchatIntegration.forwardStandaloneResponses,
        sendTypingIndicator: this.config.vrchatIntegration.sendTypingIndicator,
        eventMappings: this.config.vrchatIntegration.eventMappings
      } : null,
      eventActions: this.config.eventActions,
      overrides: this.config.overrides,
      eventCooldowns: this.config.eventCooldowns,
      brain: brainConfig,
      logicMatrix: this.config.logicMatrix,
      viewerbase: viewerbaseConfig,
      verboseLogging: activeProfile.verboseLogging
    };
  }

  /**
   * Safely emit status with error handling to prevent cascading failures
   */
  safeEmitStatus() {
    try {
      this.emitStatus();
    } catch (error) {
      this.api.log(`Failed to emit status: ${error.message}`, 'warn');
      if (this.config && this.config.verboseLogging) {
        this.api.log(`Status emit error stack: ${error.stack}`, 'debug');
      }
    }
  }

  emitStatus() {
    const brainStats = this.brainEngine ? this.brainEngine.getStatistics() : null;
    const platformState = this.getPlatformState();
    
    this.api.emit('animazingpal:status', {
      isConnected: this.isConnected,
      config: this.getSafeConfig(),
      reconnectAttempts: this.reconnectAttempts,
      animazeData: this.animazeData,
      platformState: {
        key: platformState.key,
        definition: platformState.definition,
        data: platformState.data,
        connected: platformState.connected
      },
      platformData: platformState.data,
      platformDefinition: platformState.definition,
      activePlatform: platformState.key,
      supportedPlatforms: this.getSupportedPlatforms(),
      overrideBehaviors: this.overrideBehaviors,
      brainStatistics: brainStats,
      liveHostRuntime: this.getLiveHostRuntimeStatus(),
      viewerbase: this.getViewerbaseStatus()
    });
  }

  /**
   * Helper method to increment stream counts for returning viewers
   * This is called when a new stream starts
   * Note: The actual stream count increment happens when users first interact
   * in the new stream session via getOrCreateUserProfile
   */
  _incrementStreamCountsForKnownUsers() {
    // This is a placeholder for future enhancement where we might want to
    // automatically increment stream counts for all known users when a stream starts
    // Currently, stream counts are updated on first interaction per stream
    this.api.log('New stream session started, stream counts will update on user interactions', 'debug');
  }

  async destroy() {
    this.api.log('Destroying AnimazingPal Plugin...', 'info');
    
    // Shutdown brain engine
    if (this.brainEngine) {
      try {
        await this.brainEngine.shutdown();
      } catch (error) {
        this.api.log(`Error shutting down Brain Engine: ${error.message}`, 'warn');
        if (this.config && this.config.verboseLogging) {
          this.api.log(`Brain shutdown error stack: ${error.stack}`, 'debug');
        }
      }
    }
    
    try {
      this.disconnect();
    } catch (error) {
      this.api.log(`Error during disconnect: ${error.message}`, 'warn');
      if (this.config && this.config.verboseLogging) {
        this.api.log(`Disconnect error stack: ${error.stack}`, 'debug');
      }
    }

    this.stopLiveHostIdleMotion();
    
    this.lastEventTimes.clear();
    this.pendingRequests.clear();
    if (this.viewerbaseSyncTimer) {
      clearTimeout(this.viewerbaseSyncTimer);
      this.viewerbaseSyncTimer = null;
    }
    if (this.liveHostSourceTimer) {
      clearTimeout(this.liveHostSourceTimer);
      this.liveHostSourceTimer = null;
    }
    this.stopLiveHostSourceWatchdog();
    if (this.liveHostEventDeduper && typeof this.liveHostEventDeduper.destroy === 'function') {
      this.liveHostEventDeduper.destroy();
      this.liveHostEventDeduper = null;
    }
    this.viewerbaseSyncPending = null;
    this.viewerbaseSyncInFlight = false;
    
    this.api.log('AnimazingPal Plugin destroyed', 'info');
  }
}

module.exports = AnimazingPalPlugin;
