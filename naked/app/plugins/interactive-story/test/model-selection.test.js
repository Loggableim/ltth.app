/**
 * Test for model selection based on LLM provider
 * Ensures that the correct model is used when OpenAI or SiliconFlow is selected
 */

const OpenAILLMService = require('../engines/openai-llm-service');
const LLMService = require('../engines/llm-service');

// Mock OpenAI SDK
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn()
      }
    }
  }));
});

// Mock axios for SiliconFlow
jest.mock('axios', () => ({
  post: jest.fn()
}));

const axios = require('axios');
const OpenAI = require('openai');

describe('Model Selection Based on Provider', () => {
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

  describe('OpenAI Provider', () => {
    test('should use OpenAI models when provider is openai', async () => {
      const service = new OpenAILLMService('test-api-key', mockLogger, mockDebugCallback);
      
      // Mock successful response
      const mockCreate = jest.fn().mockResolvedValue({
        choices: [{
          message: {
            content: 'Test response'
          }
        }],
        usage: { total_tokens: 100 }
      });
      
      service.client.chat.completions.create = mockCreate;
      
      // Test with OpenAI model
      await service.generateCompletion('Test prompt', 'gpt-5.2', 100, 0.7);
      
      expect(mockCreate).toHaveBeenCalledWith({
        model: 'gpt-5.2',
        messages: [{ role: 'user', content: 'Test prompt' }],
        max_tokens: 100,
        temperature: 0.7
      });
    });

    test('should map OpenAI model names correctly', async () => {
      const service = new OpenAILLMService('test-api-key', mockLogger, mockDebugCallback);
      
      const mockCreate = jest.fn().mockResolvedValue({
        choices: [{
          message: {
            content: 'Test response'
          }
        }],
        usage: { total_tokens: 100 }
      });
      
      service.client.chat.completions.create = mockCreate;
      
      // Test different OpenAI models
      const testModels = ['gpt-5.2', 'gpt-4o', 'gpt-5-mini', 'o1'];
      
      for (const model of testModels) {
        mockCreate.mockClear();
        await service.generateCompletion('Test', model, 100, 0.7);
        
        expect(mockCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            model: service.models[model]
          })
        );
      }
    });

    test('should fall back to default OpenAI model for unknown model names', async () => {
      const service = new OpenAILLMService('test-api-key', mockLogger, mockDebugCallback);
      
      const mockCreate = jest.fn().mockResolvedValue({
        choices: [{
          message: {
            content: 'Test response'
          }
        }],
        usage: { total_tokens: 100 }
      });
      
      service.client.chat.completions.create = mockCreate;
      
      // Test with unknown model (should fall back to gpt-4o-mini)
      await service.generateCompletion('Test', 'unknown-model', 100, 0.7);
      
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4o-mini'
        })
      );
    });
  });

  describe('SiliconFlow Provider', () => {
    test('should use SiliconFlow models when provider is siliconflow', async () => {
      const service = new LLMService('test-api-key', mockLogger, mockDebugCallback);
      
      // Mock successful response
      axios.post.mockResolvedValue({
        data: {
          choices: [{
            message: {
              content: 'Test response'
            }
          }],
          usage: { total_tokens: 100 }
        }
      });
      
      // Test with SiliconFlow model
      await service.generateCompletion('Test prompt', 'deepseek', 100, 0.7);
      
      expect(axios.post).toHaveBeenCalledWith(
        'https://api.siliconflow.com/v1/chat/completions',
        expect.objectContaining({
          model: 'deepseek-ai/DeepSeek-V3'
        }),
        expect.any(Object)
      );
    });

    test('should map SiliconFlow model names correctly', async () => {
      const service = new LLMService('test-api-key', mockLogger, mockDebugCallback);
      
      axios.post.mockResolvedValue({
        data: {
          choices: [{
            message: {
              content: 'Test response'
            }
          }],
          usage: { total_tokens: 100 }
        }
      });
      
      // Test different SiliconFlow models
      const testModels = {
        'deepseek': 'deepseek-ai/DeepSeek-V3',
        'qwen': 'Qwen/Qwen2.5-7B-Instruct',
        'llama': 'meta-llama/Meta-Llama-3.1-8B-Instruct'
      };
      
      for (const [modelKey, expectedModelName] of Object.entries(testModels)) {
        axios.post.mockClear();
        await service.generateCompletion('Test', modelKey, 100, 0.7);
        
        expect(axios.post).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            model: expectedModelName
          }),
          expect.any(Object)
        );
      }
    });

    test('should fall back to default SiliconFlow model for unknown model names', async () => {
      const service = new LLMService('test-api-key', mockLogger, mockDebugCallback);
      
      axios.post.mockResolvedValue({
        data: {
          choices: [{
            message: {
              content: 'Test response'
            }
          }],
          usage: { total_tokens: 100 }
        }
      });
      
      // Test with unknown model (should fall back to deepseek)
      await service.generateCompletion('Test', 'unknown-model', 100, 0.7);
      
      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          model: 'deepseek-ai/DeepSeek-V3'
        }),
        expect.any(Object)
      );
    });
  });

  describe('Model Compatibility', () => {
    test('OpenAI service should NOT accept SiliconFlow model names', async () => {
      const service = new OpenAILLMService('test-api-key', mockLogger, mockDebugCallback);
      
      const mockCreate = jest.fn().mockResolvedValue({
        choices: [{
          message: {
            content: 'Test response'
          }
        }],
        usage: { total_tokens: 100 }
      });
      
      service.client.chat.completions.create = mockCreate;
      
      // Try to use SiliconFlow model name with OpenAI service
      // Should fall back to OpenAI default
      await service.generateCompletion('Test', 'deepseek', 100, 0.7);
      
      // Should use fallback OpenAI model, not the SiliconFlow model name
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4o-mini' // Falls back to default
        })
      );
    });

    test('SiliconFlow service should NOT accept OpenAI model names', async () => {
      const service = new LLMService('test-api-key', mockLogger, mockDebugCallback);
      
      axios.post.mockResolvedValue({
        data: {
          choices: [{
            message: {
              content: 'Test response'
            }
          }],
          usage: { total_tokens: 100 }
        }
      });
      
      // Try to use OpenAI model name with SiliconFlow service
      // Should fall back to SiliconFlow default
      await service.generateCompletion('Test', 'gpt-5.2', 100, 0.7);
      
      // Should use fallback SiliconFlow model, not the OpenAI model name
      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          model: 'deepseek-ai/DeepSeek-V3' // Falls back to default
        }),
        expect.any(Object)
      );
    });
  });
});
