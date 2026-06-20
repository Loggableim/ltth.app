'use strict';

const http = require('http');
const https = require('https');
const { buildLiveHostDefaults } = require('./live-host-config');

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function defaultJsonRequest({ url, method = 'POST', headers = {}, body, timeoutMs = 30000 }) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const transport = target.protocol === 'http:' ? http : https;
    const payload = body === undefined ? '' : JSON.stringify(body);
    const request = transport.request(target, {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...headers
      }
    }, response => {
      let raw = '';
      response.on('data', chunk => { raw += chunk; });
      response.on('end', () => {
        let parsed;
        try {
          parsed = raw ? JSON.parse(raw) : {};
        } catch (error) {
          return reject(new Error(`Invalid JSON response (HTTP ${response.statusCode})`));
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          return reject(new Error(parsed.error?.message || parsed.message || `HTTP ${response.statusCode}`));
        }
        resolve(parsed);
      });
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error('Request timeout')));
    request.on('error', reject);
    if (payload) request.write(payload);
    request.end();
  });
}

class BaseProvider {
  constructor(config, logger, request = defaultJsonRequest) {
    this.config = config;
    this.logger = logger || { debug() {}, info() {}, warn() {}, error() {} };
    this.request = request;
  }

  buildMessages(systemPrompt, userMessage, history = []) {
    return [
      { role: 'system', content: systemPrompt },
      ...history.slice(-(this.config.contextMessages || 10)).map(item => ({ role: item.role, content: item.content })),
      { role: 'user', content: userMessage }
    ];
  }

  async execute(requestOptions) {
    let lastError;
    const attempts = (this.config.maxRetries || 0) + 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        return await this.request({ ...requestOptions, timeoutMs: this.config.timeoutMs });
      } catch (error) {
        lastError = error;
        if (attempt + 1 < attempts) await wait((this.config.retryBackoffMs || 0) * (attempt + 1));
      }
    }
    throw lastError;
  }

  async testConnection() {
    const result = await this.generateResponse('Antworte kurz.', 'Sag Hallo.', [], { maxTokens: 16 });
    return { success: true, provider: this.config.provider, model: result.model, response: result.content };
  }
}

class OpenAICompatibleProvider extends BaseProvider {
  async generateResponse(systemPrompt, userMessage, history = [], options = {}) {
    const headers = { Authorization: `Bearer ${this.config.apiKey}` };
    if (this.config.provider === 'openrouter') {
      headers['HTTP-Referer'] = 'https://github.com/Loggableim/ltth_desktop2';
      headers['X-Title'] = 'LTTH AnimazingPal';
    }
    const response = await this.execute({
      url: `${this.config.baseUrl}/chat/completions`,
      headers,
      body: {
        model: options.model || this.config.model,
        messages: this.buildMessages(systemPrompt, userMessage, history),
        max_tokens: options.maxTokens || this.config.maxResponseTokens,
        temperature: options.temperature ?? this.config.temperature,
        presence_penalty: options.presencePenalty ?? this.config.presencePenalty,
        frequency_penalty: options.frequencyPenalty ?? this.config.frequencyPenalty
      }
    });
    const content = response.choices?.[0]?.message?.content;
    if (!content) throw new Error('Provider returned no response content');
    return { content, model: response.model || this.config.model, usage: response.usage || null };
  }
}

class GeminiProvider extends BaseProvider {
  async generateResponse(systemPrompt, userMessage, history = [], options = {}) {
    const contents = history.slice(-(this.config.contextMessages || 10)).map(item => ({
      role: item.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: item.content }]
    }));
    contents.push({ role: 'user', parts: [{ text: userMessage }] });
    const response = await this.execute({
      url: `${this.config.baseUrl}/models/${encodeURIComponent(options.model || this.config.model)}:generateContent`,
      headers: { 'x-goog-api-key': this.config.apiKey },
      body: {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: {
          temperature: options.temperature ?? this.config.temperature,
          maxOutputTokens: options.maxTokens || this.config.maxResponseTokens
        }
      }
    });
    const content = response.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim();
    if (!content) throw new Error('Gemini returned no response content');
    return { content, model: this.config.model, usage: response.usageMetadata || null };
  }
}

class OllamaProvider extends BaseProvider {
  async testConnection() {
    const result = await this.generateResponse('Antworte kurz.', 'Sag Hallo.', [], {
      maxTokens: 32,
      thinking: false
    });
    return { success: true, provider: this.config.provider, model: result.model, response: result.content };
  }

  async generateResponse(systemPrompt, userMessage, history = [], options = {}) {
    const headers = this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {};
    const response = await this.execute({
      url: `${this.config.baseUrl}/api/chat`,
      headers,
      body: {
        model: options.model || this.config.model,
        messages: this.buildMessages(systemPrompt, userMessage, history),
        stream: false,
        think: options.thinking ?? this.config.thinking,
        options: {
          temperature: options.temperature ?? this.config.temperature,
          num_predict: options.maxTokens || this.config.maxResponseTokens,
          presence_penalty: options.presencePenalty ?? this.config.presencePenalty,
          frequency_penalty: options.frequencyPenalty ?? this.config.frequencyPenalty
        }
      }
    });
    const content = response.message?.content?.trim();
    if (!content) throw new Error('Ollama returned no response content');
    return {
      content,
      model: response.model || this.config.model,
      usage: { prompt_tokens: response.prompt_eval_count, completion_tokens: response.eval_count }
    };
  }
}

function createLLMProvider(config, logger, request) {
  if (!config || !config.provider) throw new Error('LLM provider is required');
  const defaults = buildLiveHostDefaults().providers[config.provider];
  const normalized = { ...defaults, ...config };
  if (config.provider === 'gemini') return new GeminiProvider(normalized, logger, request);
  if (config.provider === 'ollama') return new OllamaProvider(normalized, logger, request);
  if (config.provider === 'openai' || config.provider === 'openrouter') {
    return new OpenAICompatibleProvider(normalized, logger, request);
  }
  throw new Error(`Unsupported LLM provider: ${config.provider}`);
}

module.exports = {
  createLLMProvider,
  defaultJsonRequest,
  OpenAICompatibleProvider,
  GeminiProvider,
  OllamaProvider
};
