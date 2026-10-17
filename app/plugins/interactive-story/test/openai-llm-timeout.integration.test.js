const http = require('http');
const OpenAILLMService = require('../engines/openai-llm-service');

describe('OpenAI-compatible LLM request timeout', () => {
  test('aborts a stalled local HTTP request at the configured timeout', async () => {
    let responseClosed = false;
    let requestReceived;
    const received = new Promise(resolve => { requestReceived = resolve; });
    const server = http.createServer((req, res) => {
      requestReceived({ method: req.method, url: req.url });
      res.on('close', () => { responseClosed = true; });
      setTimeout(() => {
        if (!res.destroyed) {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ choices: [{ message: { content: 'late response' } }] }));
        }
      }, 300);
    });

    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const service = new OpenAILLMService('fixture-key', logger, null, {
      baseURL: `http://127.0.0.1:${port}/v1`,
      defaultModel: 'fixture-model',
      allowCustomModels: true,
      timeout: 60,
      maxRetries: 1,
      retryDelay: 0
    });

    try {
      const startedAt = Date.now();
      const result = service.generateCompletion('fixture prompt', 'fixture-model', 20, 0.2);
      await expect(result).rejects.toThrow();
      const elapsedMs = Date.now() - startedAt;
      expect(elapsedMs).toBeLessThan(250);
      await expect(received).resolves.toEqual({ method: 'POST', url: '/v1/chat/completions' });
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(responseClosed).toBe(true);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });
});
