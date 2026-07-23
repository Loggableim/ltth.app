const SystemAnalyzer = require('../plugins/streamalchemy/backend/system-analyzer');
const ModelCatalog = require('../plugins/streamalchemy/backend/model-catalog');

describe('SystemAnalyzer', () => {
  test('discovers every physical Windows adapter from structured CIM JSON and restores 64-bit registry VRAM', async () => {
    const commands = [];
    const analyzer = new SystemAnalyzer({
      osImpl: {
        platform: () => 'win32',
        totalmem: () => 32 * 1024 ** 3,
        cpus: () => [{ model: 'Test CPU' }]
      },
      execFileImpl: (file, args, callback) => {
        commands.push([file, args]);
        callback(null, JSON.stringify({
          adapters: [
            {
              Name: 'Intel(R) Arc(TM) A770 Graphics',
              AdapterRAM: 4293918720,
              DriverVersion: '32.0.101.5972',
              PNPDeviceID: 'PCI\\VEN_8086&DEV_56A0\\1'
            },
            {
              Name: 'NVIDIA GeForce RTX 4090',
              AdapterRAM: 4293918720,
              DriverVersion: '32.0.15.6094',
              PNPDeviceID: 'PCI\\VEN_10DE&DEV_2684\\2'
            },
            {
              Name: 'Microsoft Remote Display Adapter',
              AdapterRAM: 0,
              DriverVersion: '1',
              PNPDeviceID: 'ROOT\\RDPIDD\\0000'
            }
          ],
          registry: [
            {
              DriverDesc: 'Intel(R) Arc(TM) A770 Graphics',
              MatchingDeviceId: 'pci\\ven_8086&dev_56a0',
              MemorySize: '17179869184'
            },
            {
              DriverDesc: 'NVIDIA GeForce RTX 4090',
              MatchingDeviceId: 'pci\\ven_10de&dev_2684',
              MemorySize: '25769803776'
            }
          ]
        }), '');
      },
      fetchImpl: jest.fn()
    });

    const result = await analyzer.analyze();

    expect(commands).toHaveLength(1);
    expect(commands[0][0].toLowerCase()).toContain('powershell');
    expect(commands[0][1].join(' ')).toContain('ConvertTo-Json');
    expect(commands[0][1].join(' ')).not.toContain('Format-List');
    expect(result.adapters).toHaveLength(2);
    expect(result.adapters).toEqual([
      expect.objectContaining({
        id: expect.stringMatching(/^gpu-[a-f0-9]{16}$/),
        name: 'Intel(R) Arc(TM) A770 Graphics',
        vendor: 'intel',
        architecture: 'arc_a770',
        vramMb: 16384,
        memoryState: 'known'
      }),
      expect.objectContaining({
        id: expect.stringMatching(/^gpu-[a-f0-9]{16}$/),
        name: 'NVIDIA GeForce RTX 4090',
        vendor: 'nvidia',
        architecture: 'rtx_20_plus',
        vramMb: 24576,
        memoryState: 'known'
      })
    ]);
    expect(new Set(result.adapters.map(adapter => adapter.id)).size).toBe(2);
    expect(result.gpu.id).toBe(result.adapters[1].id);
  });

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
