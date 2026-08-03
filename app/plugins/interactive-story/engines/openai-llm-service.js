const OpenAI = require('openai');

/**
 * OpenAI-compatible LLM Service for Chat Completions API
 * Supports OpenAI, OpenRouter, Ollama, and other compatible backends.
 */
class OpenAILLMService {
  constructor(apiKey, logger, debugCallback = null, options = {}) {
    this.apiKey = apiKey || options.fallbackApiKey || 'ollama';
    this.provider = options.provider || 'openai';
    this.logger = logger;
    this.debugCallback = debugCallback;
    this.baseURL = options.baseURL || 'https://api.openai.com/v1';
    this.defaultModel = options.defaultModel || 'gpt-4o-mini';
    this.allowCustomModels = options.allowCustomModels === true;
    this.defaultHeaders = options.defaultHeaders || undefined;

    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseURL,
      defaultHeaders: this.defaultHeaders
    });

    this.models = {
      'gpt-5.2': 'gpt-5.2',
      'gpt-5.2-pro': 'gpt-5.2-pro',
      'gpt-5.2-chat-latest': 'gpt-5.2-chat-latest',
      'gpt-5.1': 'gpt-5.1',
      'gpt-5.1-codex-max': 'gpt-5.1-codex-max',
      'gpt-5-mini': 'gpt-5-mini',
      'gpt-5-nano': 'gpt-5-nano',
      o1: 'o1',
      'o1-mini': 'o1-mini',
      'gpt-4o': 'gpt-4o',
      'gpt-4o-mini': 'gpt-4o-mini',
      'gpt-4-turbo': 'gpt-4-turbo',
      'gpt-3.5-turbo': 'gpt-3.5-turbo'
    };

    if (options.models && typeof options.models === 'object') {
      this.models = { ...this.models, ...options.models };
    }

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
   * Resolve a model key to an actual model name.
   * OpenRouter and Ollama can accept custom model IDs directly.
   * @param {string} model - Requested model key or ID
   * @returns {string} - Resolved model name
   */
  _resolveModel(model) {
    const fallback = this.defaultModel || this.models['gpt-4o-mini'] || 'gpt-4o-mini';

    if (!model) {
      return fallback;
    }

    if (this.models[model]) {
      return this.models[model];
    }

    if (this.allowCustomModels) {
      return model;
    }

    return fallback;
  }

  /**
   * Generate chat completion using an OpenAI-compatible API
   * @param {string} prompt - The prompt to send to the LLM
   * @param {string} model - Model to use
   * @param {number} maxTokens - Maximum tokens in response
   * @param {number} temperature - Temperature for randomness (0.0-1.0)
   * @returns {Promise<string>} - Generated text
   */
  async generateCompletion(prompt, model = 'gpt-4o-mini', maxTokens = 1000, temperature = 0.7) {
    let lastError = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const modelName = this._resolveModel(model);

        // Log detailed request info for debugging
        this.logger.info(`🔄 OpenAI-compatible LLM Request (attempt ${attempt}/${this.maxRetries}): Model=${modelName}, Tokens=${maxTokens}, Temp=${temperature}, BaseURL=${this.baseURL}`);
        this._debugLog('info', `🔄 OpenAI-compatible LLM API Request`, {
          attempt,
          maxRetries: this.maxRetries,
          model: modelName,
          maxTokens,
          temperature,
          promptLength: prompt.length,
          timeout: this.timeout,
          baseURL: this.baseURL
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
          throw new Error('No completion choices returned from OpenAI-compatible API');
        }

        const completion = response.choices[0].message.content;

        this.logger.info(`✅ OpenAI-compatible LLM Response received: ${completion.length} characters`);
        this._debugLog('info', `✅ OpenAI-compatible LLM Response`, {
          length: completion.length,
          model: modelName,
          usage: response.usage
        });

        return completion;
      } catch (error) {
        lastError = error;
        this.logger.error(`❌ OpenAI-compatible LLM Request failed (attempt ${attempt}/${this.maxRetries}): ${error.message}`);
        this._debugLog('error', `❌ OpenAI-compatible LLM Error`, {
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
    throw lastError || new Error('OpenAI-compatible LLM generation failed after all retries');
  }

  /**
   * Test API key / endpoint validity
   * @returns {Promise<Object>} Test result with status and message
   */
  async testConnection() {
    try {
      this.logger.info('Testing OpenAI-compatible API connection...');

      const response = await this.client.chat.completions.create({
        model: this.defaultModel || 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 10
      });

      return {
        success: true,
        message: 'OpenAI-compatible API connection successful',
        model: this.defaultModel || 'gpt-3.5-turbo',
        usage: response.usage
      };
    } catch (error) {
      const message = this.provider === 'ollama' ? 'Ollama API test failed' : error.message;
      this.logger.error(this.provider === 'ollama' ? message : `OpenAI-compatible API test failed: ${message}`);
      return {
        success: false,
        message,
        error: error
      };
    }
  }
}

module.exports = OpenAILLMService;
