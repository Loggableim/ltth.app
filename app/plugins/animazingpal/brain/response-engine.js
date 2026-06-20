class ResponseEngine {
  constructor(config = {}, logger = console) {
    this.config = config;
    this.logger = logger;
    this.cache = new Map();
    this.cacheMaxSize = Number(config.cacheMaxSize || 100);
  }

  isReady() {
    return Boolean(this.config.apiKey || this.config.openaiApiKey);
  }

  quickAcknowledgment(username, type = 'default') {
    const name = username || 'there';
    const templates = {
      greeting: `Hey ${name}, schön dich zu sehen!`,
      thanks: `Danke dir, ${name}!`,
      gift: `Vielen Dank für das Geschenk, ${name}!`,
      follow: `Willkommen, ${name}!`,
      default: `Danke, ${name}!`
    };
    return templates[type] || templates.default;
  }

  clearCache() {
    this.cache.clear();
  }

  _cacheResponse(userId, prompt, response) {
    const key = this._cacheKey(userId, prompt);
    this.cache.set(key, response);
    while (this.cache.size > this.cacheMaxSize) {
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
    }
  }

  _getCachedResponse(userId, prompt) {
    const key = this._cacheKey(userId, prompt);
    return this.cache.has(key) ? this.cache.get(key) : null;
  }

  _cacheKey(userId, prompt) {
    return `${userId || 'anonymous'}:${String(prompt || '').trim().toLowerCase()}`;
  }
}

module.exports = ResponseEngine;
