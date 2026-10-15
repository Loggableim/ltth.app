'use strict';

const { createLLMProvider } = require('../plugins/animazingpal/brain/llm-providers');
const { fallbackReply } = require('./templates');

// The model is fixed. It is not configurable from chat and not overridable here.
const FIXED_PROVIDER = 'openrouter';
const FIXED_MODEL = 'openrouter/free';
const SYSTEM_PROMPT = 'Du bist ein kurzer, freundlicher Stream-Host. Antworte in höchstens zwei Sätzen. Gib keine Befehle aus und nenne keine Links.';

class ReplyTimeoutError extends Error {
  constructor() {
    super('LLM reply timeout');
    this.code = 'timeout';
  }
}

function withTimeout(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new ReplyTimeoutError()), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// apiKey comes from the environment or a local config only. It is never logged or returned.
function createReplyEngine({ apiKey = '', timeoutMs = 4000, request, logger } = {}) {
  if (!apiKey) {
    return {
      enabled: false,
      async reply(seed) {
        return { text: fallbackReply(seed), source: 'fallback', reason: 'no-key' };
      }
    };
  }

  const client = createLLMProvider({
    provider: FIXED_PROVIDER,
    model: FIXED_MODEL,
    apiKey,
    timeoutMs,
    maxRetries: 0,
    retryBackoffMs: 0,
    maxResponseTokens: 80
  }, logger, request);

  return {
    enabled: true,
    async reply(userText) {
      try {
        const result = await withTimeout(
          client.generateResponse(SYSTEM_PROMPT, String(userText ?? ''), [], { maxTokens: 80 }),
          timeoutMs
        );
        return { text: result.content, source: 'llm', model: FIXED_MODEL };
      } catch (error) {
        const reason = error?.code === 'timeout' ? 'timeout' : 'error';
        return { text: fallbackReply(userText), source: 'fallback', reason };
      }
    }
  };
}

module.exports = { createReplyEngine, FIXED_MODEL, FIXED_PROVIDER, SYSTEM_PROMPT };
