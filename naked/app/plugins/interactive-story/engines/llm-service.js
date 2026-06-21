const axios = require('axios');

/**
 * LLM Service for SiliconFlow Chat Completions API
 * Supports multiple models: DeepSeek, Qwen, Meta-Llama
 */
class LLMService {
  constructor(apiKey, logger, debugCallback = null, options = {}) {
    this.apiKey = apiKey;
    this.logger = logger;
    this.debugCallback = debugCallback;
    this.baseURL = 'https://api.siliconflow.com/v1';  // Fixed: Use .com instead of .cn
    this.models = {
      deepseek: 'deepseek-ai/DeepSeek-V3',
      qwen: 'Qwen/Qwen2.5-7B-Instruct',
      llama: 'meta-llama/Meta-Llama-3.1-8B-Instruct'
    };
    // Configurable options
    this.timeout = options.timeout || 120000; // Default 120 seconds (increased from 30)
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 2000; // Initial retry delay in ms
  }
  
  /**
   * Log debug information
   */
  _debugLog(level, message, data) {
    if (this.debugCallback) {
      this.debugCallback(level, message, data);
    }
  }

  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate chat completion using SiliconFlow API
   * @param {string} prompt - The prompt to send to the LLM
   * @param {string} model - Model to use (deepseek, qwen, llama)
   * @param {number} maxTokens - Maximum tokens in response
   * @param {number} temperature - Temperature for randomness (0.0-1.0)
   * @returns {Promise<string>} - Generated text
   */
  async generateCompletion(prompt, model = 'deepseek', maxTokens = 1000, temperature = 0.7) {
    let lastError = null;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const modelName = this.models[model] || this.models.deepseek;
        
        // Log detailed request info for debugging
        this.logger.info(`🔄 LLM Request (attempt ${attempt}/${this.maxRetries}): Model=${modelName}, Tokens=${maxTokens}, Temp=${temperature}, Timeout=${this.timeout}ms`);
        this._debugLog('info', `🔄 LLM API Request`, {
          attempt,
          maxRetries: this.maxRetries,
          model: modelName,
          maxTokens,
          temperature,
          promptLength: prompt.length,
          timeout: this.timeout
        });
        
        this.logger.debug(`🔑 API Key configured: ${this.apiKey ? 'Yes (length=' + this.apiKey.length + ')' : 'No'}`);
        this._debugLog('debug', `🔑 API Key Status`, { 
          configured: !!this.apiKey,
          length: this.apiKey ? this.apiKey.length : 0,
          prefix: this.apiKey ? this.apiKey.substring(0, 6) + '...' : 'N/A'
        });
        
        this.logger.debug(`📝 Prompt length: ${prompt.length} characters`);
        
        const requestBody = {
          model: modelName,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: maxTokens,
          temperature: temperature,
          stream: false
        };
        
        const requestHeaders = {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        };
        
        this.logger.debug(`📤 Request URL: ${this.baseURL}/chat/completions`);
        this._debugLog('debug', `📤 API Request Details`, {
          url: `${this.baseURL}/chat/completions`,
          method: 'POST',
          bodyKeys: Object.keys(requestBody)
        });
        
        this.logger.debug(`📤 Request body: ${JSON.stringify({ model: modelName, max_tokens: maxTokens, temperature })}`);
        
        const response = await axios.post(
          `${this.baseURL}/chat/completions`,
          requestBody,
          {
            headers: requestHeaders,
            timeout: this.timeout
          }
        );

        if (response.data && response.data.choices && response.data.choices.length > 0) {
          const content = response.data.choices[0].message.content;
          this.logger.info(`✅ LLM Response: Generated ${content.length} characters using ${modelName} (attempt ${attempt})`);
          this._debugLog('info', `✅ LLM API Success`, {
            model: modelName,
            generatedLength: content.length,
            usage: response.data.usage,
            attempt
          });
          this.logger.debug(`📊 Usage: ${JSON.stringify(response.data.usage || 'N/A')}`);
          return content;
        }

        throw new Error('Invalid response from LLM API');
      } catch (error) {
        lastError = error;
        
        // Check if we should retry
        const shouldRetry = this._shouldRetry(error, attempt);
        
        this.logger.error(`❌ LLM Service Error (attempt ${attempt}/${this.maxRetries}): ${error.message}`);
        this._debugLog('error', `❌ LLM API Error: ${error.message}`, {
          message: error.message,
          status: error.response?.status,
          statusText: error.response?.statusText,
          attempt,
          willRetry: shouldRetry
        });
        
        if (error.response) {
          this.logger.error(`📛 HTTP Status: ${error.response.status} ${error.response.statusText}`);
          this.logger.error(`📛 Response Headers: ${JSON.stringify(error.response.headers)}`);
          this.logger.error(`📛 Response Data: ${JSON.stringify(error.response.data)}`);
          
          this._debugLog('error', `📛 HTTP Error Response`, {
            status: error.response.status,
            statusText: error.response.statusText,
            data: error.response.data,
            headers: error.response.headers
          });
          
          if (error.response.status === 401) {
            this.logger.error('🔐 Authentication failed! Check:');
            this.logger.error('   1. API key is correct and active');
            this.logger.error('   2. API key is saved in Settings → TTS API Keys → Fish Speech 1.5');
            this.logger.error('   3. No extra spaces in API key');
            this.logger.error('   4. API key format starts with "sk-"');
            
            this._debugLog('error', '🔐 401 Unauthorized - Authentication Failed', {
              apiKeyLength: this.apiKey ? this.apiKey.length : 0,
              apiKeyPrefix: this.apiKey ? this.apiKey.substring(0, 6) : 'N/A',
              hasWhitespace: this.apiKey ? (this.apiKey !== this.apiKey.trim()) : false,
              troubleshoot: [
                'Check API key is correct and active on SiliconFlow dashboard',
                'Verify API key in Settings → TTS API Keys → Fish Speech 1.5',
                'Ensure no extra spaces before/after API key',
                'Confirm API key starts with "sk-"',
                'Check API key quota/credits on SiliconFlow'
              ]
            });
            // Don't retry auth errors
            throw error;
          } else if (error.response.status === 429) {
            this.logger.error('⏱️ Rate limit exceeded. Wait before trying again.');
            this._debugLog('warn', '⏱️ 429 Rate Limit Exceeded', {
              retryAfter: error.response.headers['retry-after'],
              message: 'Too many requests. Wait before trying again.'
            });
            // Will retry with backoff
          } else if (error.response.status === 500) {
            this.logger.error('🔥 Server error on SiliconFlow side. Try again later.');
            this._debugLog('error', '🔥 500 Server Error', {
              message: 'SiliconFlow server error. Try again later.'
            });
            // Will retry
          } else if (error.response.status === 504) {
            this.logger.error('⏱️ Gateway Timeout (504): SiliconFlow API is taking too long to respond.');
            this.logger.error('   💡 Suggestions:');
            this.logger.error('      • Try again in a few minutes (API may be overloaded)');
            this.logger.error('      • Reduce max_tokens in configuration for faster responses');
            this.logger.error('      • Consider using a different LLM model (e.g., qwen-turbo)');
            this._debugLog('error', '⏱️ 504 Gateway Timeout', {
              message: 'API request timed out at gateway (Cloudflare/proxy)',
              suggestions: [
                'API may be temporarily overloaded - wait a few minutes',
                'Try reducing max_tokens for faster generation',
                'Consider switching to a faster model (qwen-turbo)',
                'Check SiliconFlow status page for service issues'
              ]
            });
            // Will retry
          }
        } else if (error.request) {
          this.logger.error('📡 No response from server. Check internet connection.');
          this._debugLog('error', '📡 No Response from Server', {
            message: 'No response received. Check internet connection.'
          });
          // Will retry
        } else {
          this.logger.error(`⚙️ Request setup error: ${error.message}`);
          this._debugLog('error', `⚙️ Request Setup Error`, {
            message: error.message
          });
        }
        
        // Retry with exponential backoff
        if (shouldRetry && attempt < this.maxRetries) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1);
          this.logger.info(`⏳ Retrying in ${delay}ms...`);
          this._debugLog('info', `⏳ Retrying after delay`, { delayMs: delay, nextAttempt: attempt + 1 });
          await this._sleep(delay);
        } else {
          // No more retries
          throw lastError;
        }
      }
    }
    
    // Should not reach here, but throw last error if we do
    throw lastError;
  }
  
  /**
   * Determine if request should be retried
   * @param {Error} error - The error that occurred
   * @param {number} attempt - Current attempt number
   * @returns {boolean} - Whether to retry
   */
  _shouldRetry(error, attempt) {
    // Don't retry if max retries reached
    if (attempt >= this.maxRetries) {
      return false;
    }
    
    // Don't retry authentication errors
    if (error.response?.status === 401) {
      return false;
    }
    
    // Retry on timeout, network errors, 5xx errors, and rate limits
    if (error.code === 'ECONNABORTED' || // Timeout
        error.code === 'ETIMEDOUT' ||
        !error.response || // Network error
        error.response.status === 429 || // Rate limit
        error.response.status >= 500) { // Server error
      return true;
    }
    
    return false;
  }

  /**
   * Generate chat completion with conversation history
   * @param {Array} messages - Array of message objects with role and content
   * @param {string} model - Model to use
   * @param {number} maxTokens - Maximum tokens
   * @param {number} temperature - Temperature
   * @returns {Promise<string>} - Generated text
   */
  async generateWithHistory(messages, model = 'deepseek', maxTokens = 1000, temperature = 0.7) {
    let lastError = null;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const modelName = this.models[model] || this.models.deepseek;
        
        this.logger.info(`🔄 LLM Request with history (attempt ${attempt}/${this.maxRetries}): Model=${modelName}, Messages=${messages.length}`);
        
        const response = await axios.post(
          `${this.baseURL}/chat/completions`,
          {
            model: modelName,
            messages: messages,
            max_tokens: maxTokens,
            temperature: temperature,
            stream: false
          },
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: this.timeout
          }
        );

        if (response.data && response.data.choices && response.data.choices.length > 0) {
          this.logger.info(`✅ LLM Response with history: Generated ${response.data.choices[0].message.content.length} characters (attempt ${attempt})`);
          return response.data.choices[0].message.content;
        }

        throw new Error('Invalid response from LLM API');
      } catch (error) {
        lastError = error;
        const shouldRetry = this._shouldRetry(error, attempt);
        
        this.logger.error(`LLM Service Error (with history, attempt ${attempt}/${this.maxRetries}): ${error.message}`);
        
        if (shouldRetry && attempt < this.maxRetries) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1);
          this.logger.info(`⏳ Retrying in ${delay}ms...`);
          await this._sleep(delay);
        } else {
          throw lastError;
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Check if API key is valid
   * @returns {Promise<boolean>}
   */
  async validateAPIKey() {
    try {
      await this.generateCompletion('Hello', 'qwen', 10, 0.5);
      return true;
    } catch (error) {
      this.logger.error(`API Key validation failed: ${error.message}`);
      return false;
    }
  }
}

module.exports = LLMService;
