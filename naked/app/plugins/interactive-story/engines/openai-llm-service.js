const OpenAI = require('openai');

/**
 * OpenAI LLM Service for Chat Completions API
 * Supports GPT-5 family and previous models
 */
class OpenAILLMService {
  constructor(apiKey, logger, debugCallback = null, options = {}) {
    this.apiKey = apiKey;
    this.logger = logger;
    this.debugCallback = debugCallback;
    this.client = new OpenAI({ apiKey });
    
    this.models = {
      'gpt-5.2': 'gpt-5.2',
      'gpt-5.2-pro': 'gpt-5.2-pro',
      'gpt-5.2-chat-latest': 'gpt-5.2-chat-latest',
      'gpt-5.1': 'gpt-5.1',
      'gpt-5.1-codex-max': 'gpt-5.1-codex-max',
      'gpt-5-mini': 'gpt-5-mini',
      'gpt-5-nano': 'gpt-5-nano',
      'o1': 'o1',
      'o1-mini': 'o1-mini',
      'gpt-4o': 'gpt-4o',
      'gpt-4o-mini': 'gpt-4o-mini',
      'gpt-4-turbo': 'gpt-4-turbo',
      'gpt-3.5-turbo': 'gpt-3.5-turbo'
    };
    
    // Configurable options
    this.timeout = options.timeout || 120000; // Default 120 seconds
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
   * Generate chat completion using OpenAI API
   * @param {string} prompt - The prompt to send to the LLM
   * @param {string} model - Model to use (gpt-4o, gpt-4o-mini, gpt-3.5-turbo)
   * @param {number} maxTokens - Maximum tokens in response
   * @param {number} temperature - Temperature for randomness (0.0-1.0)
   * @returns {Promise<string>} - Generated text
   */
  async generateCompletion(prompt, model = 'gpt-4o-mini', maxTokens = 1000, temperature = 0.7) {
    let lastError = null;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const modelName = this.models[model] || this.models['gpt-4o-mini'];
        
        // Log detailed request info for debugging
        this.logger.info(`🔄 OpenAI LLM Request (attempt ${attempt}/${this.maxRetries}): Model=${modelName}, Tokens=${maxTokens}, Temp=${temperature}`);
        this._debugLog('info', `🔄 OpenAI LLM API Request`, {
          attempt,
          maxRetries: this.maxRetries,
          model: modelName,
          maxTokens,
          temperature,
          promptLength: prompt.length,
          timeout: this.timeout
        });
        
        const response = await this.client.chat.completions.create({
          model: modelName,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: maxTokens,
          temperature: temperature
        });
        
        if (!response.choices || response.choices.length === 0) {
          throw new Error('No completion choices returned from OpenAI API');
        }
        
        const completion = response.choices[0].message.content;
        
        this.logger.info(`✅ OpenAI LLM Response received: ${completion.length} characters`);
        this._debugLog('info', `✅ OpenAI LLM Response`, {
          length: completion.length,
          model: modelName,
          usage: response.usage
        });
        
        return completion;
        
      } catch (error) {
        lastError = error;
        this.logger.error(`❌ OpenAI LLM Request failed (attempt ${attempt}/${this.maxRetries}): ${error.message}`);
        this._debugLog('error', `❌ OpenAI LLM Error`, {
          attempt,
          error: error.message,
          type: error.constructor.name
        });
        
        // Don't retry on certain errors
        if (error.status === 401 || error.status === 403) {
          this.logger.error('Authentication failed - invalid API key');
          throw error;
        }
        
        // Retry with exponential backoff
        if (attempt < this.maxRetries) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1);
          this.logger.info(`Retrying in ${delay}ms...`);
          await this._sleep(delay);
        }
      }
    }
    
    // All retries failed
    this.logger.error(`All ${this.maxRetries} attempts failed`);
    throw lastError || new Error('OpenAI LLM generation failed after all retries');
  }

  /**
   * Test API key validity
   * @returns {Promise<Object>} Test result with status and message
   */
  async testConnection() {
    try {
      this.logger.info('Testing OpenAI API connection...');
      
      const response = await this.client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 10
      });
      
      return {
        success: true,
        message: 'OpenAI API connection successful',
        model: 'gpt-3.5-turbo',
        usage: response.usage
      };
    } catch (error) {
      this.logger.error(`OpenAI API test failed: ${error.message}`);
      return {
        success: false,
        message: error.message,
        error: error
      };
    }
  }
}

module.exports = OpenAILLMService;
