/**
 * Brain Engine for AnimazingPal
 * 
 * The central intelligence system that connects:
 * - Memory Database (Nervous System) - stores all experiences
 * - Vector Memory (Synapses) - links related memories semantically
 * - GPT Brain (Cerebral Cortex) - processes and generates responses
 * - Animaze (Body/Voice) - expresses through avatar
 * 
 * This creates an AI streamer that:
 * - Remembers viewers and their interactions
 * - Maintains personality consistency
 * - Generates contextual, intelligent responses
 * - Archives and recalls long-term memories
 */

const MemoryDatabase = require('./memory-database');
const VectorMemory = require('./vector-memory');
const GPTBrainService = require('./gpt-brain-service');

class BrainEngine {
  constructor(api, options = {}) {
    this.api = api;
    this.logger = {
      info: (msg) => api.log(msg, 'info'),
      debug: (msg) => api.log(msg, 'debug'),
      warn: (msg) => api.log(msg, 'warn'),
      error: (msg) => api.log(msg, 'error')
    };
    
    // Get database from plugin API
    const db = api.getDatabase();
    
    // Initialize components
    this.memoryDb = new MemoryDatabase(db, this.logger);
    this.vectorMemory = new VectorMemory(this.logger);
    this.gptBrain = null; // Initialized when API key is set
    
    // Current streamer ID (for per-streamer memory)
    this.streamerId = null;
    
    // Configuration
    this.config = {
      enabled: false,
      openaiApiKey: null,
      model: 'gpt-4o-mini',
      activePersonality: null,
      
      // Memory settings
      memoryImportanceThreshold: 0.3,
      maxContextMemories: 10,
      archiveAfterDays: 7,
      pruneAfterDays: 30,
      
      // Response settings - more human-like defaults
      autoRespond: {
        chat: false,
        gifts: true,
        follows: true,
        shares: true,
        likes: false,      // Only react to significant like counts
        subscribe: true
      },
      
      // Human-like decision making
      speakThreshold: 0.5,       // Importance threshold to decide if to speak
      emotionalMemory: true,    // Remember emotional context
      contextAwareness: true,   // Consider stream context
      
      // Rate limiting
      maxResponsesPerMinute: 10,
      chatResponseProbability: 0.3, // Only respond to 30% of chats when enabled
      
      ...options
    };
    
    // Runtime state
    this.currentSession = null;
    this.responseCount = 0;
    this.responseCountResetTime = Date.now();
    
    // Personality cache
    this.currentPersonality = null;
    
    // Event processing queue for human-like timing
    this.eventQueue = [];
    this.processingEvent = false;
    
    // Stream context - what's happening right now
    this.streamContext = {
      isLive: false,
      viewerCount: 0,
      recentEvents: [],
      mood: 'neutral',
      lastSpoke: 0,
      speakCooldown: 3000  // Minimum 3s between spoken responses
    };
  }

  /**
   * Set the streamer ID for per-streamer memory
   */
  setStreamerId(streamerId) {
    this.streamerId = streamerId;
    this.memoryDb.setStreamerId(streamerId);
    
    // Reload memories for this streamer
    this.vectorMemory.clear();
    const memories = this.memoryDb.getRecentMemories(500);
    this.vectorMemory.loadFromMemories(memories);
    
    this.logger.info(`Brain Engine: Switched to streamer "${streamerId}"`);
  }

  /**
   * Get the current streamer ID
   */
  getStreamerId() {
    return this.streamerId || this.memoryDb.getStreamerId();
  }

  /**
   * Initialize the brain engine
   */
  async initialize() {
    try {
      // Initialize database tables
      this.memoryDb.initialize();
      
      // Load existing memories into vector store
      const memories = this.memoryDb.getRecentMemories(500);
      this.vectorMemory.loadFromMemories(memories);
      
      // Load active personality
      await this.loadActivePersonality();
      
      // Generate session ID
      this.currentSession = `session_${Date.now()}`;
      
      this.logger.info('Brain Engine initialized successfully');
      return true;
    } catch (error) {
      this.logger.error(`Failed to initialize Brain Engine: ${error.message}`);
      return false;
    }
  }

  /**
   * Configure the brain engine
   */
  configure(newConfig) {
    this.config = { ...this.config, ...newConfig };
    
    // Update GPT service if API key changed
    if (newConfig.openaiApiKey) {
      this.gptBrain = new GPTBrainService(newConfig.openaiApiKey, this.logger, {
        model: this.config.model,
        timeout: 30000,
        maxRetries: 2
      });
    }
    
    // Update active personality if changed
    if (newConfig.activePersonality) {
      this.setActivePersonality(newConfig.activePersonality);
    }
  }

  /**
   * Load the active personality
   */
  async loadActivePersonality() {
    const personality = this.memoryDb.getActivePersonality();
    if (personality) {
      this.currentPersonality = this._parsePersonality(personality);
      this.config.activePersonality = personality.name;
      this.logger.info(`Loaded personality: ${personality.display_name}`);
    }
    return this.currentPersonality;
  }

  /**
   * Set active personality by name
   */
  async setActivePersonality(name) {
    this.memoryDb.setActivePersonality(name);
    await this.loadActivePersonality();
  }

  /**
   * Get all available personalities
   */
  getPersonalities() {
    return this.memoryDb.getPersonalities().map(p => this._parsePersonality(p));
  }

  /**
   * Create a custom personality
   */
  createPersonality(data) {
    return this.memoryDb.createPersonality(data);
  }

  getPersonality(name) {
    const personality = this.memoryDb.getPersonality(name);
    return personality ? this._parsePersonality(personality) : undefined;
  }

  updatePersonality(name, updates) {
    this.memoryDb.updatePersonality(name, updates);
    if (this.currentPersonality?.name === name) {
      const personality = this.memoryDb.getPersonality(name);
      this.currentPersonality = personality ? this._parsePersonality(personality) : null;
    }
  }

  deletePersonality(name) {
    const deleted = this.memoryDb.deletePersonality(name);
    if (deleted && this.currentPersonality?.name === name) {
      this.currentPersonality = null;
    }
    return deleted;
  }

  _parseJsonField(value, fallback) {
    if (value && typeof value === 'object') {
      return value;
    }

    try {
      return JSON.parse(value || JSON.stringify(fallback));
    } catch (_) {
      return fallback;
    }
  }

  _parsePersonality(personality) {
    return {
      ...personality,
      emotion_tendencies: this._parseJsonField(personality.emotion_tendencies, {}),
      catchphrases: this._parseJsonField(personality.catchphrases, []),
      topics_of_interest: this._parseJsonField(personality.topics_of_interest, []),
      tone_settings: this._parseJsonField(personality.tone_settings, {
        temperature: 0.7,
        presencePenalty: 0.3,
        frequencyPenalty: 0.2
      }),
      emote_config: this._parseJsonField(personality.emote_config, {
        defaultEmote: 'neutral',
        highEnergyEmote: 'excited',
        lowEnergyEmote: 'calm'
      }),
      memory_behavior: this._parseJsonField(personality.memory_behavior, {
        importanceThreshold: 0.5,
        maxContextMemories: 10
      })
    };
  }

  /**
   * Check rate limiting
   */
  _checkRateLimit() {
    const now = Date.now();
    
    // Reset counter every minute
    if (now - this.responseCountResetTime > 60000) {
      this.responseCount = 0;
      this.responseCountResetTime = now;
    }
    
    if (this.responseCount >= this.config.maxResponsesPerMinute) {
      return false;
    }
    
    this.responseCount++;
    return true;
  }

  /**
   * Get relevant memories for context
   */
  _getContextMemories(query, username = null) {
    const memories = [];
    
    // Get semantically similar memories
    const similar = this.vectorMemory.findSimilar(query, 5, 0.2);
    for (const { memoryId } of similar) {
      const memory = this.memoryDb.getRecentMemories(100).find(m => m.id === memoryId);
      if (memory) {
        memories.push(memory.content);
      }
    }
    
    // Get user-specific memories if username provided
    if (username) {
      const userMemories = this.memoryDb.getUserMemories(username, 5);
      for (const memory of userMemories) {
        if (!memories.includes(memory.content)) {
          memories.push(memory.content);
        }
      }
    }
    
    // Get important memories using configured threshold
    const importanceThreshold = this.config.memoryImportanceThreshold || 0.3;
    const important = this.memoryDb.getImportantMemories(importanceThreshold, 3);
    for (const memory of important) {
      if (!memories.includes(memory.content)) {
        memories.push(memory.content);
      }
    }
    
    return memories.slice(0, this.config.maxContextMemories);
  }

  /**
   * Store a new memory
   */
  storeMemory(content, options = {}) {
    const memoryId = this.memoryDb.storeMemory({
      type: options.type || 'interaction',
      content,
      context: options.context,
      importance: options.importance || 0.5,
      tags: options.tags,
      user: options.user,
      event: options.event
    });
    
    // Also store in vector memory
    const embedding = this.vectorMemory.storeVector(memoryId, content);
    
    // Update embedding in database
    this.memoryDb.db.prepare(`
      UPDATE animazingpal_memories SET embedding = ? WHERE id = ?
    `).run(JSON.stringify(embedding), memoryId);
    
    return memoryId;
  }

  /**
   * Process a chat message and optionally generate response
   */
  async processChat(username, message, options = {}) {
    if (!this.config.enabled || !this.gptBrain || !this.currentPersonality) {
      return null;
    }
    
    // Get or create user profile
    const userProfile = this.memoryDb.getOrCreateUserProfile(username, options.nickname);
    
    // Add to interaction history
    this.memoryDb.addInteractionToHistory(username, 'chat', message, {
      sessionId: this.currentSession
    });
    
    // Store the chat as a memory
    this.storeMemory(`${username} sagte: "${message}"`, {
      type: 'chat',
      user: username,
      event: 'chat',
      importance: 0.4
    });
    
    // Store in conversation history
    this.memoryDb.storeConversation(this.currentSession, 'user', message, username);
    
    // Check if we should respond
    if (!this.config.autoRespond.chat && !options.forceRespond) {
      return null;
    }
    
    // Probabilistic response (don't respond to every chat)
    if (!options.forceRespond && Math.random() > this.config.chatResponseProbability) {
      return null;
    }
    
    // Check rate limit
    if (!this._checkRateLimit()) {
      this.logger.debug('Rate limit reached, skipping chat response');
      return null;
    }
    
    try {
      // Get context - include user memories and interaction history
      const contextMemories = this._getContextMemories(message, username);
      const conversationHistory = this.memoryDb.getConversationHistory(this.currentSession, 10);
      const interactionHistory = this.memoryDb.getInteractionHistory(username, 5);
      
      // Build enhanced user info with interaction context
      const enhancedUserInfo = {
        ...userProfile,
        interaction_history: interactionHistory,
        recent_interactions: interactionHistory.length,
        last_topic: userProfile.last_topic || 'unknown'
      };
      
      // Generate response with enriched context
      const result = await this.gptBrain.generateChatResponse(
        username,
        message,
        this.currentPersonality.system_prompt,
        {
          memories: contextMemories,
          userInfo: enhancedUserInfo,
          conversationHistory: conversationHistory.map(c => ({
            role: c.role,
            content: c.content
          }))
        }
      );
      
      // Store response in conversation history
      this.memoryDb.storeConversation(this.currentSession, 'assistant', result.content, null, this._selectEmotion());
      
      // Add response to interaction history
      this.memoryDb.addInteractionToHistory(username, 'response', result.content, {
        sessionId: this.currentSession
      });
      
      // Store response as memory
      this.storeMemory(`Ich antwortete ${username}: "${result.content}"`, {
        type: 'response',
        event: 'chat_response',
        importance: 0.3
      });
      
      // Extract and store last topic if possible
      this._extractAndUpdateTopic(username, message, result.content);
      
      return {
        text: result.content,
        emotion: this._selectEmotion(),
        cached: result.cached
      };
    } catch (error) {
      this.logger.error(`Failed to generate chat response: ${error.message}`);
      return null;
    }
  }

  /**
   * Process a gift event and generate thank you
   */
  async processGift(username, giftName, giftValue, options = {}) {
    if (!this.config.enabled || !this.gptBrain || !this.currentPersonality) {
      return null;
    }
    
    // Get user profile and record gift
    const userProfile = this.memoryDb.getOrCreateUserProfile(username, options.nickname);
    this.memoryDb.recordGift(username, giftValue);
    
    // Add to interaction history
    this.memoryDb.addInteractionToHistory(username, 'gift', giftName, {
      diamonds: giftValue,
      sessionId: this.currentSession
    });
    
    // Store as important memory
    const importance = Math.min(0.5 + (giftValue / 500), 1.0); // Higher value = more important
    this.storeMemory(`${username} schenkte mir "${giftName}" (${giftValue} Diamonds)!`, {
      type: 'gift',
      user: username,
      event: 'gift',
      importance,
      tags: ['gift', giftName]
    });
    
    // Check if we should respond
    if (!this.config.autoRespond.gifts && !options.forceRespond) {
      return null;
    }
    
    // Check rate limit
    if (!this._checkRateLimit()) {
      return null;
    }
    
    try {
      // Get interaction history for personalized response
      const interactionHistory = this.memoryDb.getInteractionHistory(username, 5);
      const enhancedUserInfo = {
        ...userProfile,
        interaction_history: interactionHistory,
        recent_gifts: interactionHistory.filter(i => i.type === 'gift').length
      };
      
      // Generate response
      const result = await this.gptBrain.generateGiftResponse(
        username,
        giftName,
        giftValue,
        this.currentPersonality.system_prompt,
        enhancedUserInfo
      );
      
      // Store response
      this.memoryDb.storeConversation(this.currentSession, 'assistant', result.content, null, 'grateful');
      
      // Add response to interaction history
      this.memoryDb.addInteractionToHistory(username, 'response', result.content, {
        type: 'gift_thanks',
        sessionId: this.currentSession
      });
      
      return {
        text: result.content,
        emotion: 'happy',
        cached: result.cached
      };
    } catch (error) {
      this.logger.error(`Failed to generate gift response: ${error.message}`);
      return null;
    }
  }

  /**
   * Process a follow event
   */
  async processFollow(username, options = {}) {
    if (!this.config.enabled || !this.gptBrain || !this.currentPersonality) {
      return null;
    }
    
    // Check if returning follower
    const userProfile = this.memoryDb.getOrCreateUserProfile(username, options.nickname);
    const isReturning = userProfile.interaction_count > 1;
    
    // Add to interaction history
    this.memoryDb.addInteractionToHistory(username, 'follow', '', {
      isReturning,
      sessionId: this.currentSession
    });
    
    // Store as memory
    this.storeMemory(`${username} folgt mir jetzt${isReturning ? ' wieder' : ''}!`, {
      type: 'follow',
      user: username,
      event: 'follow',
      importance: isReturning ? 0.6 : 0.4
    });
    
    // Check if we should respond
    if (!this.config.autoRespond.follows && !options.forceRespond) {
      return null;
    }
    
    // Check rate limit
    if (!this._checkRateLimit()) {
      return null;
    }
    
    try {
      const result = await this.gptBrain.generateFollowResponse(
        username,
        this.currentPersonality.system_prompt,
        isReturning
      );
      
      // Add response to interaction history
      this.memoryDb.addInteractionToHistory(username, 'response', result.content, {
        type: 'follow_welcome',
        sessionId: this.currentSession
      });
      
      return {
        text: result.content,
        emotion: 'happy',
        cached: result.cached
      };
    } catch (error) {
      this.logger.error(`Failed to generate follow response: ${error.message}`);
      return null;
    }
  }

  /**
   * Process a share event
   */
  async processShare(username, options = {}) {
    if (!this.config.enabled || !this.gptBrain || !this.currentPersonality) {
      return null;
    }
    
    // Store as memory
    this.storeMemory(`${username} hat den Stream geteilt!`, {
      type: 'share',
      user: username,
      event: 'share',
      importance: 0.5
    });
    
    if (!this.config.autoRespond.shares && !options.forceRespond) {
      return null;
    }
    
    if (!this._checkRateLimit()) {
      return null;
    }
    
    try {
      const result = await this.gptBrain.generateQuickReaction(
        `${username} hat deinen Stream geteilt!`,
        this.currentPersonality.system_prompt,
        'grateful'
      );
      
      return {
        text: result.content,
        emotion: 'happy',
        cached: result.cached
      };
    } catch (error) {
      this.logger.error(`Failed to generate share response: ${error.message}`);
      return null;
    }
  }

  /**
   * Select emotion based on personality tendencies
   */
  _selectEmotion() {
    if (!this.currentPersonality || !this.currentPersonality.emotion_tendencies) {
      return 'neutral';
    }
    
    const tendencies = this.currentPersonality.emotion_tendencies;
    const emotions = Object.keys(tendencies);
    if (emotions.length === 0) return 'neutral';
    
    // Weighted random selection
    const totalWeight = Object.values(tendencies).reduce((sum, w) => sum + w, 0);
    let random = Math.random() * totalWeight;
    
    for (const [emotion, weight] of Object.entries(tendencies)) {
      random -= weight;
      if (random <= 0) return emotion;
    }
    
    return emotions[0];
  }

  /**
   * Archive old memories
   */
  async archiveOldMemories() {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.archiveAfterDays);
    
    // Get old memories
    const oldMemories = this.memoryDb.db.prepare(`
      SELECT * FROM animazingpal_memories 
      WHERE created_at < ? AND importance >= ?
      ORDER BY created_at ASC
      LIMIT 100
    `).all(cutoffDate.toISOString(), this.config.memoryImportanceThreshold);
    
    if (oldMemories.length === 0) return;
    
    try {
      // Generate summary using GPT
      const summary = await this.gptBrain.summarizeMemories(
        oldMemories,
        this.currentPersonality?.system_prompt || ''
      );
      
      // Extract key information
      const keyUsers = [...new Set(oldMemories.filter(m => m.source_user).map(m => m.source_user))];
      const keywords = this.vectorMemory.extractKeywords(
        oldMemories.map(m => m.content).join(' '),
        10
      );
      
      // Create archive
      this.memoryDb.createArchive(
        summary.content,
        oldMemories.map(m => m.id),
        keywords,
        keyUsers,
        {
          start: oldMemories[0].created_at,
          end: oldMemories[oldMemories.length - 1].created_at
        }
      );
      
      this.logger.info(`Archived ${oldMemories.length} memories`);
    } catch (error) {
      this.logger.error(`Failed to archive memories: ${error.message}`);
    }
  }

  /**
   * Get brain statistics
   */
  getStatistics() {
    const memoryStats = this.memoryDb.getStatistics();
    const vectorStats = this.vectorMemory.getStatistics();
    const gptStats = this.gptBrain?.getStatistics() || {};
    
    return {
      ...memoryStats,
      ...vectorStats,
      ...gptStats,
      currentSession: this.currentSession,
      currentPersonality: this.currentPersonality?.display_name,
      enabled: this.config.enabled,
      apiKeyConfigured: !!this.config.openaiApiKey
    };
  }

  /**
   * Test GPT connection
   */
  async testConnection() {
    if (!this.gptBrain) {
      return { success: false, message: 'GPT Brain not initialized. Set API key first.' };
    }
    
    return this.gptBrain.testConnection();
  }

  /**
   * Get user profile with memories
   */
  getUserProfile(username) {
    const profile = this.memoryDb.getOrCreateUserProfile(username);
    const memories = this.memoryDb.getUserMemories(username, 20);
    
    return {
      ...profile,
      memories: memories.map(m => ({
        content: m.content,
        type: m.memory_type,
        created_at: m.created_at
      }))
    };
  }

  /**
   * Search memories
   */
  searchMemories(query) {
    // Try both text and vector search
    const textResults = this.memoryDb.searchMemories(query, 10);
    const vectorResults = this.vectorMemory.findSimilar(query, 10, 0.15);
    
    // Combine and deduplicate
    const resultMap = new Map();
    
    for (const memory of textResults) {
      resultMap.set(memory.id, { ...memory, searchType: 'text' });
    }
    
    for (const { memoryId, similarity } of vectorResults) {
      if (!resultMap.has(memoryId)) {
        const memory = this.memoryDb.getRecentMemories(500).find(m => m.id === memoryId);
        if (memory) {
          resultMap.set(memoryId, { ...memory, similarity, searchType: 'vector' });
        }
      } else {
        resultMap.get(memoryId).similarity = similarity;
      }
    }
    
    return Array.from(resultMap.values()).sort((a, b) => {
      // Sort by similarity if available, otherwise by recency
      if (a.similarity && b.similarity) return b.similarity - a.similarity;
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }

  /**
   * Extract and update the last discussed topic
   */
  _extractAndUpdateTopic(username, userMessage, botResponse) {
    try {
      // Simple keyword extraction from the conversation
      const combined = `${userMessage} ${botResponse}`.toLowerCase();
      
      // Topic keywords configuration - could be moved to a config file for multi-language support
      // TODO: Consider making this configurable per personality or language
      const topicKeywords = {
        gaming: ['spiel', 'game', 'gaming', 'zocken', 'spielen'],
        anime: ['anime', 'manga', 'waifu', 'otaku'],
        music: ['musik', 'song', 'lied', 'singen'],
        stream: ['stream', 'live', 'broadcast'],
        food: ['essen', 'food', 'hunger', 'kochen'],
        weather: ['wetter', 'weather', 'regen', 'sonne'],
        movies: ['film', 'movie', 'serie', 'show'],
        art: ['kunst', 'art', 'zeichnen', 'malen']
      };
      
      for (const [topic, keywords] of Object.entries(topicKeywords)) {
        for (const keyword of keywords) {
          if (combined.includes(keyword)) {
            this.memoryDb.updateLastTopic(username, topic);
            return topic;
          }
        }
      }
      
      // If no specific topic found, use generic
      if (userMessage.includes('?')) {
        this.memoryDb.updateLastTopic(username, 'questions');
      }
    } catch (error) {
      this.logger.debug(`Could not extract topic: ${error.message}`);
    }
    
    return null;
  }

  /**
   * Clean up and shutdown
   */
  async shutdown() {
    // Clear caches
    this.gptBrain?.clearCache();
    this.vectorMemory.clear();
    
    // Clear old conversations
    this.memoryDb.clearOldConversations(7);
    
    // Prune low-importance memories
    const pruned = this.memoryDb.pruneOldMemories(
      this.config.pruneAfterDays,
      this.config.memoryImportanceThreshold
    );
    
    this.logger.info(`Brain Engine shutdown. Pruned ${pruned} old memories.`);
  }

  // ==================== Human-like Decision Making ====================

  /**
   * Decide if the brain should speak based on event importance
   * This makes the AI behave more like a human - not responding to everything
   */
  shouldSpeak(eventType, eventData, importance) {
    // Check cooldown
    const now = Date.now();
    if (now - this.streamContext.lastSpoke < this.streamContext.speakCooldown) {
      this.logger.debug('Brain: Skipping response due to cooldown');
      return false;
    }
    
    // Check importance threshold
    if (importance < this.config.speakThreshold) {
      this.logger.debug(`Brain: Event importance ${importance} below threshold ${this.config.speakThreshold}`);
      return false;
    }
    
    // Check rate limit
    if (!this._checkRateLimit()) {
      return false;
    }
    
    // Human-like random variation (don't always respond even if allowed)
    const responseChance = Math.min(0.9, importance + 0.2);
    if (Math.random() > responseChance) {
      this.logger.debug('Brain: Randomly skipping to be more human-like');
      return false;
    }
    
    return true;
  }

  /**
   * Calculate event importance for decision making
   */
  calculateEventImportance(eventType, eventData) {
    let importance = 0.3; // Base importance
    
    switch (eventType) {
      case 'gift':
        // Gift importance based on value
        const giftValue = eventData.diamondCount || 1;
        importance = Math.min(0.3 + (giftValue / 200), 1.0);
        break;
        
      case 'subscribe':
        importance = 0.9; // Subscriptions are always important
        break;
        
      case 'follow':
        // Check if returning viewer
        const profile = this.memoryDb.getOrCreateUserProfile(eventData.uniqueId || 'unknown');
        importance = profile.interaction_count > 3 ? 0.7 : 0.5;
        break;
        
      case 'share':
        importance = 0.6; // Shares are moderately important
        break;
        
      case 'chat':
        // Chat importance based on content
        const message = eventData.comment || '';
        // Direct mentions or questions are more important
        if (message.includes('?') || message.includes('@')) {
          importance = 0.7;
        }
        // Longer messages might be more thoughtful
        else if (message.length > 50) {
          importance = 0.5;
        }
        // Check if from known supporter
        const chatProfile = this.memoryDb.getOrCreateUserProfile(eventData.uniqueId || 'unknown');
        if (chatProfile.total_diamonds > 100) {
          importance += 0.2;
        }
        break;
        
      case 'like':
        // Only significant like bursts
        const likeCount = eventData.likeCount || 1;
        importance = likeCount >= 100 ? 0.4 : 0.1;
        break;
        
      default:
        importance = 0.3;
    }
    
    return Math.min(importance, 1.0);
  }

  /**
   * Process any stream event through the brain
   * The brain decides if and how to respond
   */
  async processEvent(eventType, eventData, options = {}) {
    if (!this.config.enabled) {
      return null;
    }
    
    // Calculate importance
    const importance = this.calculateEventImportance(eventType, eventData);
    
    // Store memory regardless of response
    const username = eventData.uniqueId || eventData.username || 'anonymous';
    this.storeEventMemory(eventType, eventData, importance);
    
    // Update stream context
    this.updateStreamContext(eventType, eventData);
    
    // Decide if we should respond
    if (!options.forceRespond && !this.shouldSpeak(eventType, eventData, importance)) {
      return null;
    }
    
    // Generate appropriate response
    let response = null;
    try {
      switch (eventType) {
        case 'chat':
          response = await this.processChat(username, eventData.comment, options);
          break;
        case 'gift':
          response = await this.processGift(username, eventData.giftName, eventData.diamondCount || 1, options);
          break;
        case 'follow':
          response = await this.processFollow(username, options);
          break;
        case 'share':
          response = await this.processShare(username, options);
          break;
        case 'subscribe':
          response = await this.processSubscribe(username, options);
          break;
        case 'like':
          response = await this.processLike(username, eventData.likeCount || 1, options);
          break;
      }
      
      if (response) {
        this.streamContext.lastSpoke = Date.now();
      }
    } catch (error) {
      this.logger.error(`Brain: Error processing ${eventType}: ${error.message}`);
    }
    
    return response;
  }

  /**
   * Store an event as a memory
   */
  storeEventMemory(eventType, eventData, importance) {
    const username = eventData.uniqueId || 'anonymous';
    let content = '';
    
    switch (eventType) {
      case 'chat':
        content = `${username} sagte: "${eventData.comment}"`;
        break;
      case 'gift':
        content = `${username} schenkte "${eventData.giftName}" (${eventData.diamondCount || 1} Diamonds)`;
        break;
      case 'follow':
        content = `${username} folgt mir jetzt`;
        break;
      case 'share':
        content = `${username} hat den Stream geteilt`;
        break;
      case 'subscribe':
        content = `${username} hat abonniert!`;
        break;
      case 'like':
        content = `${username} hat ${eventData.likeCount || 1} Likes gegeben`;
        break;
      default:
        content = `Event: ${eventType} von ${username}`;
    }
    
    this.storeMemory(content, {
      type: eventType,
      user: username,
      event: eventType,
      importance
    });
  }

  /**
   * Update stream context
   */
  updateStreamContext(eventType, eventData) {
    // Add to recent events
    this.streamContext.recentEvents.push({
      type: eventType,
      data: eventData,
      time: Date.now()
    });
    
    // Keep only last 50 events
    if (this.streamContext.recentEvents.length > 50) {
      this.streamContext.recentEvents = this.streamContext.recentEvents.slice(-50);
    }
    
    // Update mood based on events
    if (eventType === 'gift' || eventType === 'subscribe') {
      this.streamContext.mood = 'excited';
    } else if (this.streamContext.recentEvents.filter(e => e.type === 'follow').length > 5) {
      this.streamContext.mood = 'happy';
    }
  }

  /**
   * Process a subscribe event
   */
  async processSubscribe(username, options = {}) {
    if (!this.config.enabled || !this.gptBrain || !this.currentPersonality) {
      return null;
    }
    
    const userProfile = this.memoryDb.getOrCreateUserProfile(username, options.nickname);
    
    this.storeMemory(`${username} hat abonniert! Wichtiger Moment!`, {
      type: 'subscribe',
      user: username,
      event: 'subscribe',
      importance: 0.9
    });
    
    if (!this.config.autoRespond.subscribe && !options.forceRespond) {
      return null;
    }
    
    try {
      const result = await this.gptBrain.generateQuickReaction(
        `${username} hat gerade abonniert! Das ist ein besonderer Moment.`,
        this.currentPersonality.system_prompt,
        'excited'
      );
      
      return {
        text: result.content,
        emotion: 'excited',
        cached: result.cached
      };
    } catch (error) {
      this.logger.error(`Failed to generate subscribe response: ${error.message}`);
      return null;
    }
  }

  /**
   * Process a like event (only for significant amounts)
   */
  async processLike(username, likeCount, options = {}) {
    if (!this.config.enabled || !this.gptBrain || !this.currentPersonality) {
      return null;
    }
    
    // Only respond to significant like bursts
    if (likeCount < 50 && !options.forceRespond) {
      return null;
    }
    
    if (!this.config.autoRespond.likes && !options.forceRespond) {
      return null;
    }
    
    try {
      const result = await this.gptBrain.generateQuickReaction(
        `Wow, ${likeCount} Likes von ${username}!`,
        this.currentPersonality.system_prompt,
        'happy'
      );
      
      return {
        text: result.content,
        emotion: 'happy',
        cached: result.cached
      };
    } catch (error) {
      this.logger.error(`Failed to generate like response: ${error.message}`);
      return null;
    }
  }

  /**
   * Get available streamer profiles
   */
  getStreamerProfiles() {
    return this.memoryDb.getStreamerProfiles();
  }
}

module.exports = BrainEngine;
