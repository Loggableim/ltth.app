/**
 * GPT Brain Service for AnimazingPal
 * Connects to OpenAI API (GPT-5 Nano optimized) for intelligent responses
 * 
 * Architecture metaphor:
 * - Memory Database = Nervous System (stores experiences)
 * - Vector Memory = Synaptic Connections (links related concepts)
 * - GPT Brain = Cerebral Cortex (reasoning and generation)
 * - Animaze = Motor Cortex + Vocal System (expression)
 */

const https = require('https');
const { createLLMProvider } = require('./llm-providers');

class GPTBrainService {
  constructor(apiKeyOrConfig, logger, options = {}) {
    const legacyConfig = typeof apiKeyOrConfig === 'string'
      ? {
          provider: 'openai',
          apiKey: apiKeyOrConfig,
          baseUrl: 'https://api.openai.com/v1',
          model: options.model || 'gpt-4o-mini',
          timeoutMs: options.timeout || 30000,
          maxRetries: options.maxRetries ?? 2,
          retryBackoffMs: options.retryDelay || 1000,
          maxResponseTokens: options.maxResponseTokens || 300
        }
      : { ...(apiKeyOrConfig || {}) };

    this.providerConfig = legacyConfig;
    this.apiKey = legacyConfig.apiKey;
    this.logger = logger;
    this.provider = options.providerClient || createLLMProvider(legacyConfig, logger);
    
    // Default to GPT-5 Nano for cost efficiency
    this.defaultModel = legacyConfig.model || options.model || 'gpt-4o-mini';
    
    // API configuration
    this.apiHost = 'api.openai.com';
    this.apiPath = '/v1/chat/completions';
    
    // Request configuration
    this.timeout = legacyConfig.timeoutMs || options.timeout || 30000;
    this.maxRetries = legacyConfig.maxRetries ?? options.maxRetries ?? 2;
    this.retryDelay = legacyConfig.retryBackoffMs || options.retryDelay || 1000;
    
    // Token limits for efficiency
    this.maxContextTokens = options.maxContextTokens || 2000;
    this.maxResponseTokens = legacyConfig.maxResponseTokens || options.maxResponseTokens || 300;
    
    // Response caching for repeated queries
    this.responseCache = new Map();
    this.cacheMaxSize = 100;
    this.cacheTTL = legacyConfig.cacheTtlMs ?? 300000;
    
    // Rate limiting
    this.lastRequestTime = 0;
    this.minRequestInterval = options.minRequestInterval ?? 500;
    
    // Available models
    this.models = {
      'gpt-5-nano': 'gpt-5-nano',
      'gpt-5-mini': 'gpt-5-mini',
      'gpt-4o-mini': 'gpt-4o-mini',
      'gpt-4o': 'gpt-4o',
      'gpt-3.5-turbo': 'gpt-3.5-turbo'
    };
  }

  /**
   * Sleep for specified milliseconds
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Make HTTP request to OpenAI API
   */
  async _makeRequest(data) {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(data);
      
      const options = {
        hostname: this.apiHost,
        port: 443,
        path: this.apiPath,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(options, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          try {
            const parsed = JSON.parse(responseData);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else {
              reject(new Error(parsed.error?.message || `HTTP ${res.statusCode}`));
            }
          } catch (e) {
            reject(new Error(`Invalid JSON response: ${responseData.substring(0, 100)}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.setTimeout(this.timeout, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * Generate a cache key for a request
   */
  _getCacheKey(systemPrompt, userMessage) {
    return `${systemPrompt.substring(0, 50)}:${userMessage.substring(0, 100)}`;
  }

  /**
   * Check and return cached response if valid
   */
  _getCachedResponse(cacheKey) {
    const cached = this.responseCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.response;
    }
    return null;
  }

  /**
   * Store response in cache
   */
  _cacheResponse(cacheKey, response) {
    // Clean old entries if cache is full
    if (this.responseCache.size >= this.cacheMaxSize) {
      const oldestKey = this.responseCache.keys().next().value;
      this.responseCache.delete(oldestKey);
    }
    
    this.responseCache.set(cacheKey, {
      response,
      timestamp: Date.now()
    });
  }

  _shortenPromptText(value, maxLength = 280) {
    if (value === null || value === undefined) return '';
    const text = String(value).trim().replace(/\s+/g, ' ');
    if (!text) return '';
    return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 1))}…` : text;
  }

  _formatConversationState(conversationState = null) {
    if (!conversationState) return '';
    if (typeof conversationState === 'string') {
      return this._shortenPromptText(conversationState, 420);
    }
    if (typeof conversationState !== 'object') return '';

    const parts = [];
    if (conversationState.summary) {
      const summary = this._shortenPromptText(conversationState.summary, 240);
      if (summary) parts.push(summary);
    }
    if (conversationState.hostName) {
      parts.push(`Host=${this._shortenPromptText(conversationState.hostName, 40)}`);
    }
    if (conversationState.active !== undefined && conversationState.active !== null) {
      parts.push(conversationState.active ? 'aktiv' : 'inaktiv');
    }
    if (Number.isFinite(Number(conversationState.turnCount))) {
      parts.push(`Turns=${Math.round(Number(conversationState.turnCount))}`);
    }
    if (conversationState.lastSpeaker) {
      parts.push(`Last=${this._shortenPromptText(conversationState.lastSpeaker, 20)}`);
    }
    if (Array.isArray(conversationState.recentTurns)) {
      const recent = conversationState.recentTurns
        .slice(-3)
        .map((turn) => {
          const speaker = this._shortenPromptText(turn?.speaker, 20) || 'turn';
          const text = this._shortenPromptText(turn?.text, 100);
          return text ? `[${speaker}] ${text}` : null;
        })
        .filter(Boolean)
        .join(' | ');
      if (recent) parts.push(`Recent=${recent}`);
    }

    return this._shortenPromptText(parts.join(' | '), 420);
  }

  _appendSidekickPromptContext(systemPrompt, context = {}, username = null) {
    const userInfo = context?.userInfo || {};
    const sidekickContext = context?.sidekickContext || {};
    const lines = [];

    const conversationSummary = userInfo.sidekickConversationSummary || sidekickContext.conversationSummary;
    let conversationText = '';
    if (typeof conversationSummary === 'string') {
      conversationText = this._shortenPromptText(conversationSummary, 360);
    } else if (conversationSummary && typeof conversationSummary === 'object') {
      conversationText = this._shortenPromptText(conversationSummary.summary, 360);
      if (!conversationText) {
        const recent = Array.isArray(conversationSummary.recentMessages)
          ? conversationSummary.recentMessages
              .slice(0, 3)
              .map((item) => this._shortenPromptText(item?.text, 120))
              .filter(Boolean)
              .join(' | ')
          : '';
        const parts = [];
        if (conversationSummary.nickname) {
          parts.push(`Name=${this._shortenPromptText(conversationSummary.nickname, 40)}`);
        }
        if (conversationSummary.messageCount !== undefined && conversationSummary.messageCount !== null) {
          const count = Number(conversationSummary.messageCount);
          if (Number.isFinite(count)) parts.push(`Messages=${Math.round(count)}`);
        }
        if (recent) {
          parts.push(`Recent=${recent}`);
        }
        conversationText = this._shortenPromptText(parts.join(' | '), 360);
      }
    } else {
      conversationText = this._shortenPromptText(conversationSummary, 360);
    }
    if (conversationText) {
      lines.push(`Stream-Assistant-Kontext${username ? ` für ${username}` : ''}: ${conversationText}`);
    }

    const userContextSummary = userInfo.sidekickUserContextSummary || sidekickContext.userContext;
    let userContextText = '';
    if (typeof userContextSummary === 'string') {
      userContextText = this._shortenPromptText(userContextSummary, 360);
    } else if (userContextSummary && typeof userContextSummary === 'object') {
      userContextText = this._shortenPromptText(userContextSummary.summary, 360);
      if (!userContextText) {
        const parts = [];
        if (userContextSummary.nickname) {
          parts.push(`Name=${this._shortenPromptText(userContextSummary.nickname, 40)}`);
        }
        const countFields = ['messages', 'likes', 'gifts', 'follows', 'subs', 'shares', 'joins', 'messageCount'];
        for (const field of countFields) {
          if (userContextSummary[field] !== undefined && userContextSummary[field] !== null) {
            const count = Number(userContextSummary[field]);
            if (Number.isFinite(count)) {
              const label = field === 'messageCount' ? 'Messages' : field.replace(/^./, (char) => char.toUpperCase());
              parts.push(`${label}=${Math.round(count)}`);
            }
          }
        }
        const roleFlags = [];
        if (userContextSummary.isFollower) roleFlags.push('Follower');
        if (userContextSummary.isSubscriber) roleFlags.push('Subscriber');
        if (userContextSummary.isModerator) roleFlags.push('Moderator');
        if (roleFlags.length > 0) parts.push(roleFlags.join('/'));
        userContextText = this._shortenPromptText(parts.join(', '), 360);
      }
    } else {
      userContextText = this._shortenPromptText(userContextSummary, 360);
    }
    if (userContextText) {
      lines.push(`Viewer-Kontext: ${userContextText}`);
    }

    const roleSummary = userInfo.sidekickRoleSummary || sidekickContext.roleFlags;
    let roleText = '';
    if (typeof roleSummary === 'string') {
      roleText = this._shortenPromptText(roleSummary, 120);
    } else if (roleSummary && typeof roleSummary === 'object') {
      roleText = Object.entries(roleSummary)
        .filter(([, value]) => !!value)
        .map(([key]) => key.replace(/^is/, '').replace(/^./, (char) => char.toUpperCase()))
        .join('/');
    }
    if (roleText) {
      lines.push(`Viewer-Rollen: ${this._shortenPromptText(roleText, 120)}`);
    }

    const conversationStateText = this._formatConversationState(
      userInfo.sidekickConversationState || sidekickContext.conversationState
    );
    if (conversationStateText) {
      lines.push(`Dialogstatus: ${conversationStateText}`);
    }

    const decisionReason = userInfo.sidekickDecisionReason || sidekickContext.decision?.reason;
    const decisionText = this._shortenPromptText(decisionReason, 120);
    if (decisionText) {
      lines.push(`Stream-Assistant-Entscheidung: ${decisionText}`);
    }

    return lines.length > 0 ? `${systemPrompt}\n\n${lines.join('\n')}` : systemPrompt;
  }

  /**
   * Generate a response using GPT
   * @param {string} systemPrompt - System context (personality, rules)
   * @param {string} userMessage - User input to respond to
   * @param {Array} conversationHistory - Previous messages for context
   * @param {Object} options - Additional options
   */
  async generateResponse(systemPrompt, userMessage, conversationHistory = [], options = {}) {
    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestInterval) {
      await this._sleep(this.minRequestInterval - timeSinceLastRequest);
    }
    this.lastRequestTime = Date.now();
    
    // Check cache for simple queries
    if (!options.skipCache && conversationHistory.length === 0) {
      const cacheKey = this._getCacheKey(systemPrompt, userMessage);
      const cached = this._getCachedResponse(cacheKey);
      if (cached) {
        this.logger.debug('GPT Brain: Using cached response');
        return { content: cached, cached: true };
      }
    }
    
    const result = await this.provider.generateResponse(systemPrompt, userMessage, conversationHistory, {
      ...options,
      model: options.model || this.defaultModel,
      maxTokens: options.maxTokens || this.maxResponseTokens
    });
    const content = result.content;
    this.logger.info(`GPT Brain: Response received (${content.length} chars)`);

    if (!options.skipCache && conversationHistory.length === 0) {
      const cacheKey = this._getCacheKey(systemPrompt, userMessage);
      this._cacheResponse(cacheKey, content);
    }

    return { ...result, content, cached: false };
  }

  /**
   * Generate a quick reaction (optimized for speed)
   */
  async generateQuickReaction(situation, personality, emotion = 'neutral', context = {}) {
    const systemPrompt = `Du bist ein Livestreamer mit folgender Persönlichkeit: ${personality}
Reagiere KURZ und SPONTAN auf die Situation. Maximal 1-2 Sätze.
Aktuelle Emotion: ${emotion}`;
    let contextualPrompt = systemPrompt;
    if (context.userInfo) {
      const ui = context.userInfo;
      contextualPrompt += `\n\nInfo über ${context.username || 'den Zuschauer'}:`;
      if (ui.relationship_level) contextualPrompt += ` Beziehung: ${ui.relationship_level}.`;
      if (ui.interaction_count > 10) contextualPrompt += ` Häufiger Chatter (${ui.interaction_count} Interaktionen).`;
      if (ui.personality_notes) contextualPrompt += ` Notizen: ${ui.personality_notes}`;
    }
    const promptWithSidekickContext = this._appendSidekickPromptContext(contextualPrompt, context, context.username || null);

    return this.generateResponse(promptWithSidekickContext, situation, [], {
      maxTokens: 100,
      temperature: 0.9
    });
  }

  /**
   * Generate a thank you message for a gift
   */
  async generateGiftResponse(username, giftName, giftValue, personality, userInfo = null) {
    let userContext = '';
    if (userInfo) {
      if (userInfo.relationship_level && userInfo.relationship_level !== 'stranger') {
        userContext = `\n${username} ist ein ${userInfo.relationship_level}. `;
      }
      if (userInfo.total_diamonds > 1000) {
        userContext += `${username} ist ein treuer Supporter mit insgesamt ${userInfo.total_diamonds} Diamonds. `;
      }
    }
    
    const systemPrompt = `Du bist ein Livestreamer mit folgender Persönlichkeit: ${personality}
Bedanke dich AUTHENTISCH und PERSÖNLICH für ein Geschenk. Maximal 2-3 Sätze.${userContext}`;
    const promptWithSidekickContext = this._appendSidekickPromptContext(systemPrompt, { userInfo }, username);
    
    const situation = `${username} hat dir "${giftName}" geschenkt (Wert: ${giftValue} Diamonds)`;
    
    return this.generateResponse(promptWithSidekickContext, situation, [], {
      maxTokens: 150,
      temperature: 0.8
    });
  }

  /**
   * Generate a welcome message for a new follower
   */
  async generateFollowResponse(username, personality, isReturning = false, context = {}) {
    const systemPrompt = `Du bist ein Livestreamer mit folgender Persönlichkeit: ${personality}
Begrüße ${isReturning ? 'einen zurückkehrenden Zuschauer' : 'einen neuen Follower'} HERZLICH. Maximal 2 Sätze.`;
    let contextualPrompt = systemPrompt;
    if (context.userInfo) {
      const ui = context.userInfo;
      contextualPrompt += `\n\nInfo über ${username}:`;
      if (ui.relationship_level) contextualPrompt += ` Beziehung: ${ui.relationship_level}.`;
      if (ui.interaction_count > 10) contextualPrompt += ` Häufiger Viewer (${ui.interaction_count} Interaktionen).`;
      if (ui.personality_notes) contextualPrompt += ` Notizen: ${ui.personality_notes}`;
    }
    const promptWithSidekickContext = this._appendSidekickPromptContext(contextualPrompt, context, username);
    
    const situation = `${username} folgt dir jetzt${isReturning ? ' wieder' : ''}!`;
    
    return this.generateResponse(promptWithSidekickContext, situation, [], {
      maxTokens: 100,
      temperature: 0.8
    });
  }

  /**
   * Generate a chat response
   */
  async generateChatResponse(username, message, personality, context = {}) {
    let systemPrompt = `Du bist ein Livestreamer mit folgender Persönlichkeit: ${personality}

Antworte auf Chat-Nachrichten NATÜRLICH und AUTHENTISCH.
- Halte dich kurz (1-3 Sätze)
- Sei freundlich aber nicht übertrieben
- Behalte deinen Charakter bei
- Wenn der Dialogkontext aktiv ist, knüpfe an den letzten Sprecherwechsel an statt ein neues Thema zu beginnen`;

    if (context.memories && context.memories.length > 0) {
      systemPrompt += `\n\nRelevante Erinnerungen:\n${context.memories.map(m => `- ${m}`).join('\n')}`;
    }
    
    if (context.userInfo) {
      const ui = context.userInfo;
      systemPrompt += `\n\nInfo über ${username}:`;
      if (ui.relationship_level) systemPrompt += ` Beziehung: ${ui.relationship_level}.`;
      if (ui.interaction_count > 10) systemPrompt += ` Häufiger Chatter (${ui.interaction_count} Interaktionen).`;
      if (ui.personality_notes) systemPrompt += ` Notizen: ${ui.personality_notes}`;
    }
    systemPrompt = this._appendSidekickPromptContext(systemPrompt, context, username);
    
    const situation = `${username} schreibt: "${message}"`;
    
    return this.generateResponse(systemPrompt, situation, context.conversationHistory || [], {
      maxTokens: 200,
      temperature: 0.85,
      skipCache: true
    });
  }

  /**
   * Generate a co-host response to the streamer/host.
   */
  async generateHostSpeechResponse(hostName, message, personality, context = {}) {
    let systemPrompt = `Du bist der KI-Stream-Assistant und Co-Host eines Livestreams mit folgender Persoenlichkeit: ${personality}

Antworte direkt auf den Streamer/Host, nicht wie auf normalen Zuschauerchat.
- Halte die Antwort kurz, natuerlich und TTS-tauglich (1-2 Saetze)
- Sei ein hilfreicher Co-Host mit Live-Stream-Bewusstsein
- Erfinde keine Zuschauerprofile und speichere den Host nicht als Viewer
- Führe ein laufendes Gespräch mit Host und Chat fort, statt isoliert auf jeden Satz zu reagieren
- Wenn der Dialog bereits aktiv ist, greife die letzten Sprecherwechsel auf und knüpfe direkt daran an
- Wenn Live-Events relevant sind, beziehe sie locker ein`;

    const liveContext = context.liveContext || {};
    const recentEvents = Array.isArray(liveContext.recentEvents) ? liveContext.recentEvents.slice(0, 5) : [];
    const conversationTurns = Array.isArray(liveContext.conversationHistory) ? liveContext.conversationHistory.slice(-4) : [];
    const viewerCount = Number(liveContext.viewerCount);
    const conversationStateText = this._formatConversationState(liveContext.conversationState);
    if (Number.isFinite(viewerCount) && viewerCount > 0) {
      systemPrompt += `\nAktuelle Zuschauerzahl: ${viewerCount}.`;
    }
    if (recentEvents.length > 0) {
      const eventText = recentEvents
        .map(event => `${event.type || event.eventType || 'event'} von ${event.username || event.uniqueId || event.nickname || 'jemandem'}`)
        .join(', ');
      systemPrompt += `\nKuerzliche Live-Events: ${eventText}.`;
    }
    if (conversationStateText) {
      systemPrompt += `\nAktueller Dialog: ${conversationStateText}`;
    }
    if (conversationTurns.length > 0) {
      const turnText = conversationTurns
        .map((turn) => {
          const speaker = this._shortenPromptText(turn?.speaker || turn?.role || 'turn', 20);
          const text = this._shortenPromptText(turn?.text || turn?.content, 100);
          return text ? `[${speaker}] ${text}` : null;
        })
        .filter(Boolean)
        .join(' | ');
      if (turnText) {
        systemPrompt += `\nLetzte Dialog-Turns: ${turnText}.`;
      }
    }
    if (liveContext.activeConversation) {
      systemPrompt += '\nDer Dialog ist aktiv. Antworte wie in einem laufenden Gespräch und halte den Faden.';
    }

    const situation = `${hostName || 'Host'} sagt zum Stream Assistant: "${message}"`;

    return this.generateResponse(systemPrompt, situation, context.conversationHistory || [], {
      maxTokens: 120,
      temperature: 0.8,
      skipCache: true
    });
  }

  /**
   * Summarize memories for archival
   */
  async summarizeMemories(memories, personality) {
    const systemPrompt = `Du bist ein Assistent der Erinnerungen zusammenfasst.
Erstelle eine KURZE Zusammenfassung (max 3-4 Sätze) der folgenden Ereignisse.
Behalte wichtige Namen, Themen und emotionale Höhepunkte.`;
    
    const memoriesText = memories.map(m => `- ${m.content}`).join('\n');
    
    return this.generateResponse(systemPrompt, `Fasse zusammen:\n${memoriesText}`, [], {
      maxTokens: 200,
      temperature: 0.5
    });
  }

  /**
   * Analyze a user's interaction pattern
   */
  async analyzeUser(username, interactions, personality) {
    const systemPrompt = `Du bist ein Assistent der Zuschauer-Interaktionen analysiert.
Erstelle eine KURZE Charakterisierung (2-3 Sätze) basierend auf den Interaktionen.
Fokussiere auf: Persönlichkeit, Interessen, Beziehung zum Streamer.`;
    
    const interactionsText = interactions.slice(0, 20).map(i => `- ${i.content}`).join('\n');
    
    return this.generateResponse(systemPrompt, `Analysiere ${username}:\n${interactionsText}`, [], {
      maxTokens: 150,
      temperature: 0.6
    });
  }

  /**
   * Test API connection
   */
  async testConnection() {
    try {
      return await this.provider.testConnection();
    } catch (error) {
      return {
        success: false,
        message: error.message,
        error
      };
    }
  }

  /**
   * Clear response cache
   */
  clearCache() {
    this.responseCache.clear();
  }

  /**
   * Get service statistics
   */
  getStatistics() {
    return {
      cacheSize: this.responseCache.size,
      cacheMaxSize: this.cacheMaxSize,
      defaultModel: this.defaultModel
    };
  }
}

module.exports = GPTBrainService;
