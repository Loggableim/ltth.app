const LLMService = require('../engines/llm-service');

// Mock axios before requiring it
jest.mock('axios', () => ({
  post: jest.fn()
}));

const axios = require('axios');

describe('LLMService', () => {
  let llmService;
  let mockLogger;
  let mockDebugCallback;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
    mockDebugCallback = jest.fn();
    jest.clearAllMocks();
  });

  describe('Constructor and Configuration', () => {
    test('should initialize with default timeout of 120 seconds', () => {
      llmService = new LLMService('test-api-key', mockLogger, mockDebugCallback);
      expect(llmService.timeout).toBe(120000);
      expect(llmService.maxRetries).toBe(3);
      expect(llmService.retryDelay).toBe(2000);
    });

    test('should initialize with custom timeout options', () => {
      const options = {
        timeout: 60000,
        maxRetries: 5,
        retryDelay: 1000
      };
      llmService = new LLMService('test-api-key', mockLogger, mockDebugCallback, options);
      expect(llmService.timeout).toBe(60000);
      expect(llmService.maxRetries).toBe(5);
      expect(llmService.retryDelay).toBe(1000);
    });

    test('should store API key and logger', () => {
      llmService = new LLMService('test-key-123', mockLogger, mockDebugCallback);
      expect(llmService.apiKey).toBe('test-key-123');
      expect(llmService.logger).toBe(mockLogger);
    });
  });

  describe('Retry Logic', () => {
    beforeEach(() => {
      llmService = new LLMService('test-api-key', mockLogger, mockDebugCallback, {
        timeout: 120000,
        maxRetries: 3,
        retryDelay: 100 // Shorter delay for tests
      });
    });

    test('should not retry on authentication errors (401)', () => {
      const error = {
        response: {
          status: 401,
          statusText: 'Unauthorized'
        }
      };
      expect(llmService._shouldRetry(error, 1)).toBe(false);
    });

    test('should retry on timeout errors', () => {
      const error = {
        code: 'ECONNABORTED',
        message: 'timeout of 30000ms exceeded'
      };
      expect(llmService._shouldRetry(error, 1)).toBe(true);
      expect(llmService._shouldRetry(error, 2)).toBe(true);
    });

    test('should retry on network errors (no response)', () => {
      const error = {
        request: {},
        message: 'Network error'
      };
      expect(llmService._shouldRetry(error, 1)).toBe(true);
    });

    test('should retry on rate limit errors (429)', () => {
      const error = {
        response: {
          status: 429,
          statusText: 'Too Many Requests',
          headers: { 'retry-after': '60' }
        }
      };
      expect(llmService._shouldRetry(error, 1)).toBe(true);
    });

    test('should retry on server errors (500)', () => {
      const error = {
        response: {
          status: 500,
          statusText: 'Internal Server Error'
        }
      };
      expect(llmService._shouldRetry(error, 1)).toBe(true);
    });

    test('should not retry when max retries reached', () => {
      const error = {
        code: 'ECONNABORTED',
        message: 'timeout'
      };
      expect(llmService._shouldRetry(error, 3)).toBe(false);
    });
  });

  describe('generateCompletion with Retry', () => {
    beforeEach(() => {
      llmService = new LLMService('test-api-key', mockLogger, mockDebugCallback, {
        timeout: 120000,
        maxRetries: 3,
        retryDelay: 10 // Very short delay for tests
      });
    });

    test('should succeed on first attempt', async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                content: 'Generated story content'
              }
            }
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30
          }
        }
      };

      axios.post.mockResolvedValueOnce(mockResponse);

      const result = await llmService.generateCompletion('Test prompt', 'qwen', 100, 0.7);

      expect(result).toBe('Generated story content');
      expect(axios.post).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('attempt 1/3')
      );
    });

    test('should retry and succeed on second attempt after timeout', async () => {
      const timeoutError = {
        code: 'ECONNABORTED',
        message: 'timeout of 120000ms exceeded',
        request: {}
      };

      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                content: 'Generated story content'
              }
            }
          ]
        }
      };

      axios.post
        .mockRejectedValueOnce(timeoutError)
        .mockResolvedValueOnce(mockResponse);

      const result = await llmService.generateCompletion('Test prompt', 'qwen', 100, 0.7);

      expect(result).toBe('Generated story content');
      expect(axios.post).toHaveBeenCalledTimes(2);
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Retrying in')
      );
    });

    test('should fail after max retries exceeded', async () => {
      const timeoutError = {
        code: 'ECONNABORTED',
        message: 'timeout of 120000ms exceeded',
        request: {}
      };

      axios.post.mockRejectedValue(timeoutError);

      let errorThrown = false;
      try {
        await llmService.generateCompletion('Test prompt', 'qwen', 100, 0.7);
      } catch (error) {
        errorThrown = true;
        expect(error.message).toBe('timeout of 120000ms exceeded');
      }

      expect(errorThrown).toBe(true);
      expect(axios.post).toHaveBeenCalledTimes(3);
      // Logger may be called multiple times per attempt (for different error messages)
      expect(mockLogger.error.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    test('should not retry on authentication error', async () => {
      const authError = {
        response: {
          status: 401,
          statusText: 'Unauthorized',
          headers: {},
          data: { error: 'Invalid API key' }
        }
      };

      axios.post.mockRejectedValueOnce(authError);

      let errorThrown = false;
      try {
        await llmService.generateCompletion('Test prompt', 'qwen', 100, 0.7);
      } catch (error) {
        errorThrown = true;
      }

      expect(errorThrown).toBe(true);
      expect(axios.post).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    test('should use exponential backoff for retries', async () => {
      const timeoutError = {
        code: 'ECONNABORTED',
        message: 'timeout',
        request: {}
      };

      axios.post.mockRejectedValue(timeoutError);

      const startTime = Date.now();
      
      try {
        await llmService.generateCompletion('Test prompt', 'qwen', 100, 0.7);
      } catch (error) {
        // Expected to fail
      }

      const elapsed = Date.now() - startTime;
      
      // Should have delays: 10ms, 20ms = 30ms total minimum
      // Using a loose assertion since timing isn't precise
      expect(elapsed).toBeGreaterThanOrEqual(20);
      expect(axios.post).toHaveBeenCalledTimes(3);
    });
  });

  describe('generateWithHistory with Retry', () => {
    beforeEach(() => {
      llmService = new LLMService('test-api-key', mockLogger, mockDebugCallback, {
        timeout: 120000,
        maxRetries: 3,
        retryDelay: 10
      });
    });

    test('should succeed with message history', async () => {
      const messages = [
        { role: 'system', content: 'You are a story writer' },
        { role: 'user', content: 'Write a story' }
      ];

      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                content: 'Story content'
              }
            }
          ]
        }
      };

      axios.post.mockResolvedValueOnce(mockResponse);

      const result = await llmService.generateWithHistory(messages, 'qwen', 100, 0.7);

      expect(result).toBe('Story content');
      expect(axios.post).toHaveBeenCalledTimes(1);
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/chat/completions'),
        expect.objectContaining({
          messages: messages
        }),
        expect.objectContaining({
          timeout: 120000
        })
      );
    });

    test('should retry on failure', async () => {
      const messages = [
        { role: 'user', content: 'Test' }
      ];

      const timeoutError = {
        code: 'ECONNABORTED',
        message: 'timeout',
        request: {}
      };

      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                content: 'Success on retry'
              }
            }
          ]
        }
      };

      axios.post
        .mockRejectedValueOnce(timeoutError)
        .mockResolvedValueOnce(mockResponse);

      const result = await llmService.generateWithHistory(messages, 'qwen', 100, 0.7);

      expect(result).toBe('Success on retry');
      expect(axios.post).toHaveBeenCalledTimes(2);
    });
  });

  describe('Timeout Configuration', () => {
    test('should pass timeout to axios request', async () => {
      llmService = new LLMService('test-api-key', mockLogger, mockDebugCallback, {
        timeout: 180000,
        maxRetries: 3,
        retryDelay: 1000
      });

      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                content: 'Test content'
              }
            }
          ]
        }
      };

      axios.post.mockResolvedValueOnce(mockResponse);

      await llmService.generateCompletion('Test prompt', 'qwen', 100, 0.7);

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          timeout: 180000
        })
      );
    });
  });
});
