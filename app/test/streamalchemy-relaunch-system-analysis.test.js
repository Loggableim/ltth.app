const SystemAnalyzer = require('../plugins/streamalchemy/backend/system-analyzer');
const ModelCatalog = require('../plugins/streamalchemy/backend/model-catalog');

describe('SystemAnalyzer', () => {
  test('returns local model recommendation for 12GB NVIDIA GPU', async () => {
    const catalog = new ModelCatalog();
    const analyzer = new SystemAnalyzer({
      execFileImpl: jest.fn((cmd, args, callback) => {
        callback(null, 'NVIDIA GeForce RTX 3060, 12288 MiB, 595.79\n', '');
      }),
      osImpl: {
        platform: () => 'win32',
        cpus: () => Array.from({ length: 32 }, () => ({ model: 'AMD Ryzen 9 5950X' })),
        totalmem: () => 32 * 1024 * 1024 * 1024
      },
      fetchImpl: jest.fn().mockResolvedValue({ ok: true }),
      fsImpl: {
        existsSync: jest.fn(target => target.endsWith('sdxl_lightning_4step.safetensors'))
      },
      catalog
    });

    const result = await analyzer.analyze({
      comfyUrl: 'http://127.0.0.1:8188',
      comfyRootDir: 'C:\\ComfyUI',
      selectedPresetId: 'sdxl_lightning_4step'
    });

    expect(result.gpu.name).toContain('RTX 3060');
    expect(result.gpu.vramMb).toBe(12288);
    expect(result.disk).toEqual(expect.objectContaining({
      targetRoot: 'C:\\ComfyUI'
    }));
    expect(result.comfyRoot).toEqual(expect.objectContaining({
      state: 'ready'
    }));
    expect(result.recommendation.primaryModel).toBe('sdxl_lightning_4step');
    expect(result.recommendation.backend).toBe('ComfyUI');
    expect(result.comfy.state).toBe('ready');
    expect(result.presets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'sdxl_lightning_4step',
        recommendationState: 'recommended',
        installed: true
      })
    ]));
  });

  test('falls back to Windows GPU detection when nvidia-smi is unavailable', async () => {
    const analyzer = new SystemAnalyzer({
      execFileImpl: jest.fn((cmd, args, callback) => {
        if (cmd === 'nvidia-smi') {
          callback(new Error('missing'), '', '');
          return;
        }
        callback(null, 'Name=AMD Radeon RX 6600;AdapterRAM=8589934592;DriverVersion=31.0.21000.1', '');
      }),
      osImpl: {
        platform: () => 'win32',
        cpus: () => [{ model: 'CPU' }],
        totalmem: () => 16 * 1024 * 1024 * 1024
      },
      fetchImpl: jest.fn().mockRejectedValue(new Error('offline'))
    });

    const result = await analyzer.analyze({ comfyUrl: 'http://127.0.0.1:8188' });
    expect(result.gpu).toEqual(expect.objectContaining({
      name: 'AMD Radeon RX 6600',
      vramMb: 8192,
      vendor: 'amd',
      state: 'detected'
    }));
  });

  test('recognizes an NVIDIA adapter from the Windows fallback so Stream Monsters can offer managed setup', async () => {
    const analyzer = new SystemAnalyzer({
      execFileImpl: jest.fn((cmd, args, callback) => {
        if (cmd === 'nvidia-smi') return callback(new Error('missing'), '', '');
        return callback(null, 'Name=NVIDIA GeForce RTX 4060;AdapterRAM=8589934592;DriverVersion=1', '');
      }),
      osImpl: { platform: () => 'win32', cpus: () => [{ model: 'CPU' }], totalmem: () => 16 * 1024 * 1024 * 1024 }
    });

    const result = await analyzer.analyze();

    expect(result.gpu).toEqual(expect.objectContaining({ vendor: 'nvidia', vramMb: 8192 }));
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

    const result = await analyzer.analyze({ comfyUrl: 'http://127.0.0.1:8188', comfyRootDir: 'C:\\ComfyUI' });
    expect(JSON.stringify(result)).not.toContain('sk-');
    expect(JSON.stringify(result)).not.toContain('apiKey');
  });
});
