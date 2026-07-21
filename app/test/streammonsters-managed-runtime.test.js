const ManagedRuntimeInstaller = require('../plugins/streamalchemy/backend/streammonsters/managed-runtime-installer');

describe('Stream Monsters managed local runtime', () => {
  test('recommends a fast four-step Windows NVIDIA profile from detected VRAM', () => {
    const installer = new ManagedRuntimeInstaller({ platform: () => 'win32' });

    expect(installer.recommend({ vendor: 'nvidia', vramMb: 6144 })).toEqual(expect.objectContaining({
      supported: true, width: 512, height: 512, steps: 4, presetId: 'sdxl_lightning_4step'
    }));
    expect(installer.recommend({ vendor: 'nvidia', vramMb: 12288 })).toEqual(expect.objectContaining({
      supported: true, width: 1024, height: 1024, steps: 4
    }));
    expect(installer.recommend({ vendor: 'amd', vramMb: 16000 })).toEqual(expect.objectContaining({ supported: false, mode: 'expert_or_remote' }));
  });

  test('installs only a trusted manifest, verifies its hash and health-checks the managed runtime', async () => {
    const calls = [];
    const installer = new ManagedRuntimeInstaller({
      platform: () => 'win32',
      dataDir: 'C:\\LTTH\\streammonsters',
      downloadArchive: async input => { calls.push(['download', input]); return 'C:\\LTTH\\runtime.zip'; },
      verifyArchive: async input => { calls.push(['verify', input]); return true; },
      extractArchive: async input => { calls.push(['extract', input]); },
      startRuntime: async input => { calls.push(['start', input]); return { pid: 42 }; },
      healthCheck: async () => true
    });
    const manifest = {
      version: 'test-1', archiveUrl: 'https://downloads.example/runtime.zip',
      sha256: 'a'.repeat(64), modelSha256: 'b'.repeat(64), archiveType: 'zip', executableRelativePath: 'ComfyUI/run_nvidia_gpu.bat'
    };

    const result = await installer.install({ vendor: 'nvidia', vramMb: 8192 }, manifest);

    expect(result).toEqual(expect.objectContaining({ state: 'ready', pid: 42, recommendation: expect.objectContaining({ width: 768 }) }));
    expect(calls.map(([name]) => name)).toEqual(['download', 'verify', 'extract', 'start']);
  });

  test('rejects unpinned runtime manifests before downloading anything', async () => {
    const downloadArchive = jest.fn();
    const installer = new ManagedRuntimeInstaller({ platform: () => 'win32', downloadArchive });

    await expect(installer.install({ vendor: 'nvidia', vramMb: 8192 }, { archiveUrl: 'https://example.test/runtime.zip' }))
      .rejects.toThrow('STREAM_MONSTERS_RUNTIME_MANIFEST_INVALID');
    expect(downloadArchive).not.toHaveBeenCalled();
  });

  test('honours an aborted setup before it can download or extract anything', async () => {
    const downloadArchive = jest.fn();
    const installer = new ManagedRuntimeInstaller({ platform: () => 'win32', dataDir: 'C:\\LTTH\\streammonsters', downloadArchive });
    const controller = new AbortController();
    controller.abort();
    const manifest = {
      version: 'test-1', archiveUrl: 'https://downloads.example/runtime.zip', sha256: 'a'.repeat(64),
      modelSha256: 'b'.repeat(64), archiveType: 'zip', executableRelativePath: 'ComfyUI/run_nvidia_gpu.bat'
    };

    await expect(installer.install({ vendor: 'nvidia', vramMb: 8192 }, manifest, { signal: controller.signal }))
      .rejects.toThrow('STREAM_MONSTERS_RUNTIME_ABORTED');
    expect(downloadArchive).not.toHaveBeenCalled();
  });
});
