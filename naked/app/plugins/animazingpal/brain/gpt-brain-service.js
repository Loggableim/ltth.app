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

class GPTBrainService {
  constructor(apiKey, logger, options = {}) {
    this.apiKey = apiKey;
    this.logger = logger;
    
    // Default to GPT-5 Nano for cost efficiency
    this.defaultModel = options.model || 'gpt-4o-mini';
    
    // API configuration
    this.apiHost = 'api.openai.com';
    this.apiPath = '/v1/chat/completions';
    
    // Request configuration
    this.timeout = options.timeout || 30000;
    this.maxRetries = options.maxRetries || 2;
    this.retryDelay = options.retryDelay || 1000;
    
    // Token limits for efficiency
    this.maxContextTokens = options.maxContextTokens || 2000;
    this.maxResponseTokens = options.maxResponseTokens || 300;
    
    // Response caching for repeated queries
    this.responseCache = new Map();
    this.cacheMaxSize = 100;
    this.cacheTTL = 300000; // 5 minutes
    
    // Rate limiting
    this.lastRequestTime = 0;
    this.minRequestInterval = 500; // Minimum 500ms between requests
    
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
    
    // Build messages array
    const messages = [
      { role: 'system', content: systemPrompt }
    ];
    
    // Add conversation history (limited for token efficiency)
    const historyLimit = 10;
    const recentHistory = conversationHistory.slice(-historyLimit);
    for (const msg of recentHistory) {
      messages.push({
        role: msg.role,
        content: msg.content
      });
    }
    
    // Add current user message
    messages.push({ role: 'user', content: userMessage });
    
    // Select model
    const model = this.models[options.model || this.defaultModel] || this.defaultModel;
    
    // Prepare request
    const requestData = {
      model,
      messages,
      max_tokens: options.maxTokens || this.maxResponseTokens,
      temperature: options.temperature || 0.8,
      presence_penalty: options.presencePenalty || 0.3,
      frequency_penalty: options.frequencyPenalty || 0.3
    };
    
    // Make request with retries
    let lastError = null;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        this.logger.debug(`GPT Brain: Request attempt ${attempt}/${this.maxRetries}`);
        
        const response = await this._makeRequest(requestData);
        
        if (!response.choices || response.choices.length === 0) {
          throw new Error('No response choices returned');
        }
        
        const content = response.choices[0].message.content;
        
        this.logger.info(`GPT Brain: Response received (${content.length} chars)`);
        
        // Cache the response
        if (!options.skipCache && conversationHistory.length === 0) {
          const cacheKey = this._getCacheKey(systemPrompt, userMessage);
          this._cacheResponse(cacheKey, content);
        }
        
        return {
          content,
          model,
          usage: response.usage,
          cached: false
        };
        
      } catch (error) {
        lastError = error;
        this.logger.error(`GPT Brain: Request failed (attempt ${attempt}): ${error.message}`);
        
        // Don't retry on auth errors
        if (error.message.includes('401') || error.message.includes('403')) {
          throw error;
        }
        
        if (attempt < this.maxRetries) {
          await this._sleep(this.retryDelay * attempt);
        }
      }
    }
    
    throw lastError || new Error('GPT request failed after all retries');
  }

  /**
   * Generate a quick reaction (optimized for speed)
   */
  async generateQuickReaction(situation, personality, emotion = 'neutral') {
    const systemPrompt = `Du bist ein Livestreamer mit folgender Persönlichkeit: ${personality}
Reagiere KURZ und SPONTAN auf die Situation. Maximal 1-2 Sätze.
Aktuelle Emotion: ${emotion}`;
    
    return this.generateResponse(systemPrompt, situation, [], {
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
    
    const situation = `${username} hat dir "${giftName}" geschenkt (Wert: ${giftValue} Diamonds)`;
    
    return this.generateResponse(systemPrompt, situation, [], {
      maxTokens: 150,
      temperature: 0.8
    });
  }

  /**
   * Generate a welcome message for a new follower
   */
  async generateFollowResponse(username, personality, isReturning = false) {
    const systemPrompt = `Du bist ein Livestreamer mit folgender Persönlichkeit: ${personality}
Begrüße ${isReturning ? 'einen zurückkehrenden Zuschauer' : 'einen neuen Follower'} HERZLICH. Maximal 2 Sätze.`;
    
    const situation = `${username} folgt dir jetzt${isReturning ? ' wieder' : ''}!`;
    
    return this.generateResponse(systemPrompt, situation, [], {
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
- Behalte deinen Charakter bei`;

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
    
    const situation = `${username} schreibt: "${message}"`;
    
    return this.generateResponse(systemPrompt, situation, context.conversationHistory || [], {
      maxTokens: 200,
      temperature: 0.85,
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
      const response = await this._makeRequest({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Sag Hallo' }],
        max_tokens: 10
      });
      
      return {
        success: true,
        message: 'GPT API connection successful',
        model: response.model,
        response: response.choices[0]?.message?.content
      };
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
