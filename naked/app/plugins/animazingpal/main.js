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
    this.eventCooldowns = {
      gift: 500,      // 500ms between gift triggers
      chat: 1000,     // 1s between chat messages
      follow: 2000,   // 2s between follow triggers
      like: 100,      // 100ms between like triggers
      share: 2000,    // 2s between share triggers
      subscribe: 3000 // 3s between subscribe triggers
    };
  }

  async init() {
    this.api.log('Initializing AnimazingPal Plugin...', 'info');
    
    // Load configuration
    this.config = this.api.getConfig('config') || this.getDefaultConfig();
    
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
    
    // Auto-connect if enabled
    if (this.config.enabled && this.config.autoConnect) {
      const connected = await this.connect();
      if (!connected) {
        this.api.log('Auto-connect failed, will retry on manual connect', 'warn');
      }
      this.safeEmitStatus();
    }
    
    this.api.log('AnimazingPal Plugin initialized', 'info');
  }

  getDefaultConfig() {
    return {
      enabled: false,
      autoConnect: true,
      host: '127.0.0.1',
      port: 8008,
      reconnectOnDisconnect: true,
      reconnectDelay: 5000,
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
      // Default actions for TikTok events
      eventActions: {
        follow: {
          enabled: true,
          actionType: 'emote',     // 'emote', 'specialAction', 'pose', 'idle', 'chatMessage'
          actionValue: null,       // itemName for emote, index for others
          chatMessage: null,       // Optional message to send to ChatPal
          useEcho: null            // Per-event echo override (null = use global, true/false = override)
        },
        share: {
          enabled: true,
          actionType: 'emote',
          actionValue: null,
          chatMessage: null,
          useEcho: null
        },
        subscribe: {
          enabled: true,
          actionType: 'specialAction',
          actionValue: null,
          chatMessage: 'Thank you {username} for subscribing!',
          useEcho: null
        },
        like: {
          enabled: false,
          actionType: null,
          actionValue: null,
          chatMessage: null,
          useEcho: null,
          threshold: 10           // Only trigger after this many likes
        },
        gift: {
          enabled: true,
          actionType: 'emote',        // Default: Emote triggern
          actionValue: null,          // User wählt selbst
          chatMessage: 'Wow, danke {username} für {giftName}!',
          useEcho: null
        },
        chat: {
          enabled: false,
          actionType: null,
          actionValue: null,
          chatMessage: null,
          useEcho: null
        }
      },
      // Override behavior settings
      overrides: {
        // e.g. 'Breathing Behavior': { enabled: true, amplitude: 0.5, frequency: 1.0 }
      },
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
        chatResponseProbability: 0.3  // Respond to 30% of chats
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
      // Advanced settings
      verboseLogging: false
    };
  }

  registerRoutes() {
    // Serve the UI page
    this.api.registerRoute('get', '/animazingpal/ui', (req, res) => {
      const uiPath = path.join(__dirname, 'ui.html');
      res.sendFile(uiPath);
    });

    // Get plugin status
    this.api.registerRoute('get', '/api/animazingpal/status', (req, res) => {
      res.json({
        success: true,
        isConnected: this.isConnected,
        config: this.getSafeConfig(),
        reconnectAttempts: this.reconnectAttempts,
        animazeData: this.animazeData,
        overrideBehaviors: this.overrideBehaviors
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
        this.config = { ...this.config, ...newConfig };
        this.api.setConfig('config', this.config);
        
        this.api.log('AnimazingPal config updated', 'info');
        this.safeEmitStatus();
        
        res.json({ success: true, config: this.getSafeConfig() });
      } catch (error) {
        this.api.log(`Config update error: ${error.message}`, 'error');
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
        const brainConfig = req.body;
        
        // Update config
        this.config.brain = { ...this.config.brain, ...brainConfig };
        this.api.setConfig('config', this.config);
        
        // Apply to brain engine
        if (this.brainEngine) {
          this.brainEngine.configure(brainConfig);
        }
        
        this.api.log('Brain config updated', 'info');
        res.json({ success: true, config: this.config.brain });
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

    this.api.log('TikTok event handlers registered for AnimazingPal', 'info');
  }

  // ==================== Connection Management ====================

  async connect() {
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
      const isInitialConnection = this.reconnectAttempts === 0; // Track if this is initial connection

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
          
          // Only trigger reconnect if this is not the initial connection AND we were previously connected
          // This prevents reconnect loops during plugin initialization
          if (!isInitialConnection && wasConnected && this.config.reconnectOnDisconnect && this.config.enabled) {
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
        }, 10000);

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
    if (!this.config.enabled || !this.isConnected) return;
    const username = data.uniqueId || 'Someone';
    if (!this.canTriggerEvent('gift', username)) return;

    const giftId = data.giftId;
    const giftName = data.giftName;
    const giftValue = data.diamondCount || 1;

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

    // Execute logic matrix action if matched
    if (logicMatrixAction) {
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
        
        this.sendChatMessage(message, useEcho);
      }
      
      if (logicMatrixAction.stopOnMatch) {
        this.api.emit('animazingpal:gift-handled', { giftId, giftName, username, logicMatrixAction });
        return;
      }
    }

    // Execute gift mapping if exists
    if (mapping) {
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
    if (this.brainEngine && this.config.brain?.enabled) {
      if (this.config.brain.standaloneMode) {
        // Standalone mode: use template-based response
        const message = this.buildStandaloneResponse('gift', placeholders);
        if (message) {
          const useEcho = this.resolveEchoSetting('gift');
          
          this.sendChatMessage(message, useEcho);
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
          if (response && this.isConnected) {
            // Send AI-generated thank you message to Animaze
            this.sendChatMessage(response.text, false);
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

    this.api.emit('animazingpal:gift-handled', {
      giftId,
      giftName,
      username,
      mapping,
      logicMatrixAction
    });
  }

  handleChatEvent(data) {
    if (!this.config.enabled || !this.isConnected) return;
    const username = data.uniqueId || 'Someone';
    if (!this.canTriggerEvent('chat', username)) return;

    const comment = data.comment;

    if (!comment) return;

    const placeholders = {
      username,
      nickname: data.nickname || username,
      comment
    };

    // Evaluate logic matrix first
    const logicMatrixAction = this.evaluateLogicMatrix('chat', {
      username,
      comment,
      isNewUser: data.isNewUser
    });

    // Execute logic matrix action if matched
    if (logicMatrixAction) {
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
        
        this.sendChatMessage(message, useEcho);
      }
      
      if (logicMatrixAction.stopOnMatch) {
        this.api.emit('animazingpal:chat-handled', { username, comment, logicMatrixAction });
        return;
      }
    }

    // Execute configured action
    if (this.config.eventActions?.chat?.enabled) {
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

      this.sendChatMessage(message, this.config.chatToAvatar.useEcho);

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
    if (this.brainEngine && this.config.brain?.enabled && this.config.brain?.autoRespond?.chat) {
      if (this.config.brain.standaloneMode) {
        // Standalone mode: use template-based response
        const message = this.buildStandaloneResponse('chat', placeholders);
        if (message) {
          const useEcho = this.resolveEchoSetting('chat');
          
          this.sendChatMessage(message, useEcho);
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
          if (response && this.isConnected) {
            this.sendChatMessage(response.text, false);
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

    this.api.emit('animazingpal:chat-handled', { username, comment, logicMatrixAction });
  }

  handleFollowEvent(data) {
    if (!this.config.enabled || !this.isConnected) return;
    const username = data.uniqueId || 'Someone';
    if (!this.canTriggerEvent('follow', username)) return;

    this.api.log(`Follow event from ${username}`, 'info');

    const placeholders = { username, nickname: data.nickname || username };

    // Evaluate logic matrix
    const logicMatrixAction = this.evaluateLogicMatrix('follow', {
      username,
      isNewUser: data.isNewUser
    });

    // Execute logic matrix action if matched
    if (logicMatrixAction) {
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
        
        this.sendChatMessage(message, useEcho);
      }
      
      if (logicMatrixAction.stopOnMatch) {
        this.api.emit('animazingpal:follow-handled', { username, logicMatrixAction });
        return;
      }
    }

    // Execute configured action
    if (this.config.eventActions?.follow?.enabled) {
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
    if (this.brainEngine && this.config.brain?.enabled && this.config.brain?.autoRespond?.follows) {
      if (this.config.brain.standaloneMode) {
        // Standalone mode: use template-based response
        const message = this.buildStandaloneResponse('follow', placeholders);
        if (message) {
          const useEcho = this.resolveEchoSetting('follow');
          
          this.sendChatMessage(message, useEcho);
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
          if (response && this.isConnected) {
            this.sendChatMessage(response.text, false);
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

    this.api.emit('animazingpal:follow-handled', { username, logicMatrixAction });
  }

  handleShareEvent(data) {
    if (!this.config.enabled || !this.isConnected) return;
    const username = data.uniqueId || 'Someone';
    if (!this.canTriggerEvent('share', username)) return;

    this.api.log(`Share event from ${username}`, 'info');

    const placeholders = { username, nickname: data.nickname || username };

    // Evaluate logic matrix first
    const logicMatrixAction = this.evaluateLogicMatrix('share', {
      username,
      isNewUser: data.isNewUser
    });

    // Execute logic matrix action if matched
    if (logicMatrixAction) {
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
        
        this.sendChatMessage(message, useEcho);
      }
      
      if (logicMatrixAction.stopOnMatch) {
        this.api.emit('animazingpal:share-handled', { username, logicMatrixAction });
        return;
      }
    }

    // Execute configured action
    if (this.config.eventActions?.share?.enabled) {
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
    if (this.brainEngine && this.config.brain?.enabled && this.config.brain?.autoRespond?.shares) {
      if (this.config.brain.standaloneMode) {
        // Standalone mode: use template-based response
        const message = this.buildStandaloneResponse('share', placeholders);
        if (message) {
          const useEcho = this.resolveEchoSetting('share');
          
          this.sendChatMessage(message, useEcho);
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
          if (response && this.isConnected) {
            this.sendChatMessage(response.text, false);
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

    this.api.emit('animazingpal:share-handled', { username, logicMatrixAction });
  }

  handleLikeEvent(data) {
    if (!this.config.enabled || !this.isConnected) return;
    const username = data.uniqueId || 'Someone';
    if (!this.canTriggerEvent('like', username)) return;

    const likeCount = data.likeCount || 1;
    const action = this.config.eventActions?.like;
    const threshold = action?.threshold || 10;

    // Only trigger after threshold likes
    if (likeCount < threshold) return;

    const placeholders = {
      username,
      nickname: data.nickname || username,
      likeCount
    };

    // Evaluate logic matrix first
    const logicMatrixAction = this.evaluateLogicMatrix('like', {
      username,
      likeCount,
      isNewUser: data.isNewUser
    });

    // Execute logic matrix action if matched
    if (logicMatrixAction) {
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
        
        this.sendChatMessage(message, useEcho);
      }
      
      if (logicMatrixAction.stopOnMatch) {
        this.api.emit('animazingpal:like-handled', { username, likeCount, logicMatrixAction });
        return;
      }
    }

    // Execute configured action
    if (action?.enabled) {
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
    if (this.brainEngine && this.config.brain?.enabled && this.config.brain?.autoRespond?.like) {
      if (this.config.brain.standaloneMode) {
        // Standalone mode: use template-based response
        const message = this.buildStandaloneResponse('like', placeholders);
        if (message) {
          const useEcho = this.resolveEchoSetting('like');
          
          this.sendChatMessage(message, useEcho);
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
          if (response && this.isConnected) {
            this.sendChatMessage(response.text, false);
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

    this.api.emit('animazingpal:like-handled', { username, likeCount, logicMatrixAction });
  }

  handleSubscribeEvent(data) {
    if (!this.config.enabled || !this.isConnected) return;
    const username = data.uniqueId || 'Someone';
    if (!this.canTriggerEvent('subscribe', username)) return;

    this.api.log(`Subscribe event from ${username}`, 'info');

    const placeholders = { username, nickname: data.nickname || username };

    // Evaluate logic matrix first
    const logicMatrixAction = this.evaluateLogicMatrix('subscribe', {
      username,
      isNewUser: data.isNewUser
    });

    // Execute logic matrix action if matched
    if (logicMatrixAction) {
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
        
        this.sendChatMessage(message, useEcho);
      }
      
      if (logicMatrixAction.stopOnMatch) {
        this.api.emit('animazingpal:subscribe-handled', { username, logicMatrixAction });
        return;
      }
    }

    // Execute configured action
    if (this.config.eventActions?.subscribe?.enabled) {
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
    if (this.brainEngine && this.config.brain?.enabled && this.config.brain?.autoRespond?.subscribe) {
      if (this.config.brain.standaloneMode) {
        // Standalone mode: use template-based response
        const message = this.buildStandaloneResponse('subscribe', placeholders);
        if (message) {
          const useEcho = this.resolveEchoSetting('subscribe');
          
          this.sendChatMessage(message, useEcho);
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
          if (response && this.isConnected) {
            this.sendChatMessage(response.text, false);
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

    this.api.emit('animazingpal:subscribe-handled', { username, logicMatrixAction });
  }

  // ==================== Utility Methods ====================

  getSafeConfig() {
    // Return config without sensitive data (no API key)
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
      apiKeyConfigured: !!this.config.brain.openaiApiKey
    } : null;

    return {
      enabled: this.config.enabled,
      autoConnect: this.config.autoConnect,
      host: this.config.host,
      port: this.config.port,
      reconnectOnDisconnect: this.config.reconnectOnDisconnect,
      reconnectDelay: this.config.reconnectDelay,
      autoRefreshData: this.config.autoRefreshData,
      giftMappings: this.config.giftMappings,
      chatToAvatar: this.config.chatToAvatar,
      eventActions: this.config.eventActions,
      overrides: this.config.overrides,
      brain: brainConfig,
      logicMatrix: this.config.logicMatrix,
      verboseLogging: this.config.verboseLogging
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
    
    this.api.emit('animazingpal:status', {
      isConnected: this.isConnected,
      config: this.getSafeConfig(),
      reconnectAttempts: this.reconnectAttempts,
      animazeData: this.animazeData,
      overrideBehaviors: this.overrideBehaviors,
      brainStatistics: brainStats
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
    
    this.lastEventTimes.clear();
    this.pendingRequests.clear();
    
    this.api.log('AnimazingPal Plugin destroyed', 'info');
  }
}

module.exports = AnimazingPalPlugin;
