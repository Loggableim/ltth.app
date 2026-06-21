const SystemAnalyzer = require('../plugins/streamalchemy/backend/system-analyzer');

describe('SystemAnalyzer', () => {
  test('returns local model recommendation for 12GB NVIDIA GPU', async () => {
    const analyzer = new SystemAnalyzer({
      execFileImpl: jest.fn((cmd, args, callback) => {
        callback(null, 'NVIDIA GeForce RTX 3060, 12288 MiB, 595.79\n', '');
      }),
      osImpl: {
        platform: () => 'win32',
        cpus: () => Array.from({ length: 32 }, () => ({ model: 'AMD Ryzen 9 5950X' })),
        totalmem: () => 32 * 1024 * 1024 * 1024
      },
      fetchImpl: jest.fn().mockResolvedValue({ ok: true })
    });

    const result = await analyzer.analyze({
      comfyUrl: 'http://127.0.0.1:8188'
    });

    expect(result.gpu.name).toContain('RTX 3060');
    expect(result.gpu.vramMb).toBe(12288);
    expect(result.recommendation.primaryModel).toBe('black-forest-labs/FLUX.1-schnell');
    expect(result.recommendation.backend).toBe('ComfyUI');
    expect(result.comfy.state).toBe('ready');
  });

  test('does not include API keys or environment secrets', async () => {
    const analyzer = new SystemAnalyzer({
      execFileImpl: jest.fn((cmd, args, callback) => callback(new Error('missing'), '', '')),
      osImpl: {
        platform: () => 'win32',
        cpus: () => [{ model: 'CPU' }],
        totalmem: () => 8 * 1024 * 1024 * 1024
      },
      fetchImpl: jest.fn().mockRejectedValue(new Error('offline'))
    });

    const result = await analyzer.analyze({ comfyUrl: 'http://127.0.0.1:8188' });
    expect(JSON.stringify(result)).not.toContain('sk-');
    expect(JSON.stringify(result)).not.toContain('apiKey');
  });
});
