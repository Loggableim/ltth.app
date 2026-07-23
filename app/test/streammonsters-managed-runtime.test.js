const ManagedRuntimeInstaller = require('../plugins/streamalchemy/backend/streammonsters/managed-runtime-installer');
const fs = require('fs');
const os = require('os');
const path = require('path');
const yazl = require('yazl');

const TRUSTED_MANIFEST = Object.freeze({
  version: 'runtime-1',
  archiveUrl: 'https://github.com/Loggableim/ltth.app/releases/download/runtime-1/runtime.zip',
  sha256: 'a'.repeat(64),
  modelSha256: 'b'.repeat(64),
  archiveType: 'zip',
  executableRelativePath: 'ComfyUI/runtime.exe',
  executableArgs: ['--listen', '127.0.0.1'],
  comfyRootRelativePath: 'ComfyUI',
  healthBaseUrl: 'http://127.0.0.1:8188',
  healthUrl: 'http://127.0.0.1:8188/system_stats'
});

async function writeSymlinkArchive(archivePath) {
  const zip = new yazl.ZipFile();
  zip.addBuffer(Buffer.from('../outside-runtime.exe'), 'ComfyUI/runtime.exe', { mode: 0o120777 });
  const output = fs.createWriteStream(archivePath);
  const finished = new Promise((resolve, reject) => {
    output.once('close', resolve);
    output.once('error', reject);
    zip.outputStream.once('error', reject);
  });
  zip.outputStream.pipe(output);
  zip.end();
  await finished;
}

describe('Stream Monsters managed local runtime', () => {
  test('pins ComfyUI 0.28.0 packages and the licensed SDXL Lightning model server-side', () => {
    const installer = new ManagedRuntimeInstaller({
      platform: () => 'win32',
      windowsRelease: () => '10.0.22631'
    });

    const catalog = installer.getCatalog();

    expect(catalog.version).toBe('0.28.0');
    expect(catalog.profiles.map(profile => [profile.id, profile.sha256])).toEqual([
      ['nvidia-standard', '797183fe6165b96a1800793cdc2110e4c62c45e8775647a7166fe8c6290e2fd9'],
      ['nvidia-cuda126-legacy', '6af1b60b6a1fad780b07871e4ff356ac04a1807755ee13c6050e3ec3a4157cc0'],
      ['intel-arc', 'cc662b0d71c06419e92511ba40d7bef681c2b3cdb1be9f725f8da197bb68ce94'],
      ['amd-experimental', '824f70126a8733ce25cc5713d20dba91ddd9f27efd6ac04a6d4a57dbf09ecd3c']
    ]);
    expect(catalog.profiles.map(profile => [profile.id, profile.downloadSizeBytes, profile.archiveUrl])).toEqual([
      ['nvidia-standard', 2092156323, 'https://github.com/Comfy-Org/ComfyUI/releases/download/v0.28.0/ComfyUI_windows_portable_nvidia.7z'],
      ['nvidia-cuda126-legacy', 2034160963, 'https://github.com/Comfy-Org/ComfyUI/releases/download/v0.28.0/ComfyUI_windows_portable_nvidia_cu126.7z'],
      ['intel-arc', 1680009614, 'https://github.com/Comfy-Org/ComfyUI/releases/download/v0.28.0/ComfyUI_windows_portable_intel.7z'],
      ['amd-experimental', 1762815561, 'https://github.com/Comfy-Org/ComfyUI/releases/download/v0.28.0/ComfyUI_windows_portable_amd.7z']
    ]);
    expect(catalog.profiles.map(profile => [
      profile.id,
      profile.installedSizeBytes,
      profile.installedSizeBasis
    ])).toEqual([
      ['nvidia-standard', 8368625292, 'conservative_4x_archive'],
      ['nvidia-cuda126-legacy', 8136643852, 'conservative_4x_archive'],
      ['intel-arc', 6720038456, 'conservative_4x_archive'],
      ['amd-experimental', 7051262244, 'conservative_4x_archive']
    ]);
    expect(catalog.model).toEqual(expect.objectContaining({
      fileName: 'sdxl_lightning_4step.safetensors',
      sizeBytes: 6938040682,
      sha256: 'e0d996ee0013e79d9d3561f50fcafb9a17e3ff07b780358e3b66d67932c4d490',
      license: 'OpenRAIL++'
    }));
    expect(installer.recommend({
      name: 'Intel(R) Arc(TM) A770 Graphics', vendor: 'intel', architecture: 'arc_a770', vramMb: 16384
    })).toEqual(expect.objectContaining({ supported: true, profileId: 'intel-arc', width: 1024 }));
    expect(installer.recommend({
      name: 'NVIDIA GeForce RTX 2080 Ti', vendor: 'nvidia', architecture: 'rtx_20_plus', vramMb: 11264
    })).toEqual(expect.objectContaining({ supported: true, profileId: 'nvidia-standard', width: 768 }));
    expect(installer.recommend({
      name: 'NVIDIA GeForce GTX 1080', vendor: 'nvidia', architecture: 'gtx_10_legacy', vramMb: 8192
    })).toEqual(expect.objectContaining({ supported: true, profileId: 'nvidia-cuda126-legacy', width: 768 }));
    expect(installer.recommend({
      name: 'AMD Radeon RX 7900 XTX', vendor: 'amd', architecture: 'amd_radeon', vramMb: 24576
    })).toEqual(expect.objectContaining({
      supported: true, profileId: 'amd-experimental', experimental: true, smokeTestRequired: true
    }));
    expect(installer.recommend({
      name: 'AMD Radeon RX 6600', vendor: 'amd', architecture: 'amd_radeon', vramMb: 8192
    })).toEqual(expect.objectContaining({ supported: false, reasonCode: 'unsupported_amd_hardware' }));
    expect(installer.recommend({
      name: 'NVIDIA GeForce RTX 4080', vendor: 'nvidia', architecture: 'rtx_20_plus', vramMb: 0, memoryState: 'unknown'
    })).toEqual(expect.objectContaining({ supported: false, reasonCode: 'unknown_memory' }));
    expect(installer.recommend({
      name: 'NVIDIA GeForce RTX 4090',
      vendor: 'nvidia',
      architecture: 'rtx_20_plus',
      vramMb: 24576,
      memoryState: 'known',
      backendSelectionState: 'ambiguous'
    })).toEqual(expect.objectContaining({
      supported: false,
      reasonCode: 'backend_mapping_ambiguous'
    }));
  });

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
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-install-'));
    const staleFile = path.join(dataDir, 'managed-runtime', 'ComfyUI', 'custom_nodes', 'attacker.py');
    fs.mkdirSync(path.dirname(staleFile), { recursive: true });
    fs.writeFileSync(staleFile, 'stale attacker code');
    const installer = new ManagedRuntimeInstaller({
      platform: () => 'win32',
      dataDir,
      trustedManifest: TRUSTED_MANIFEST,
      downloadArchive: async input => { calls.push(['download', input]); return 'C:\\LTTH\\runtime.zip'; },
      verifyArchive: async input => { calls.push(['verify', input]); return true; },
      inspectArchive: async input => { calls.push(['inspect', input]); },
      extractArchive: async input => {
        calls.push(['extract', input]);
        const comfyRoot = path.join(input.runtimeRoot, 'ComfyUI');
        await fs.promises.mkdir(comfyRoot, { recursive: true });
        await fs.promises.writeFile(path.join(comfyRoot, 'runtime.exe'), 'test executable placeholder');
      },
      startRuntime: async input => { calls.push(['start', input]); return { pid: 42 }; },
      healthCheck: async () => true
    });

    try {
      const result = await installer.install({ vendor: 'nvidia', vramMb: 8192 });

      expect(result).toEqual(expect.objectContaining({ state: 'ready', pid: 42, recommendation: expect.objectContaining({ width: 768 }) }));
      expect(path.basename(path.dirname(result.runtimeRoot))).toMatch(/^runtime-1-a{16}-/);
      expect(result.runtimeRoot).not.toBe(path.join(dataDir, 'managed-runtime'));
      expect(fs.existsSync(path.join(result.runtimeRoot, 'ComfyUI', 'custom_nodes', 'attacker.py'))).toBe(false);
      expect(fs.existsSync(staleFile)).toBe(true);
      expect(calls.map(([name]) => name)).toEqual(['download', 'verify', 'inspect', 'extract', 'start']);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
  });

  test('rejects unpinned runtime manifests before downloading anything', async () => {
    const downloadArchive = jest.fn();
    const startRuntime = jest.fn();
    const installer = new ManagedRuntimeInstaller({
      platform: () => 'win32',
      dataDir: 'C:\\LTTH\\streammonsters',
      trustedManifest: TRUSTED_MANIFEST,
      downloadArchive,
      startRuntime
    });
    const attackerManifest = {
      ...TRUSTED_MANIFEST,
      archiveUrl: 'https://attacker.example/runtime.zip',
      sha256: 'c'.repeat(64)
    };

    await expect(installer.install({ vendor: 'nvidia', vramMb: 8192 }, attackerManifest))
      .rejects.toThrow('STREAM_MONSTERS_RUNTIME_MANIFEST_UNTRUSTED');
    expect(downloadArchive).not.toHaveBeenCalled();
    expect(startRuntime).not.toHaveBeenCalled();
  });

  test('rejects symlink archive entries before extraction or runtime start', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-symlink-'));
    const archivePath = path.join(dataDir, 'symlink-runtime.zip');
    await writeSymlinkArchive(archivePath);
    const extractArchive = jest.fn();
    const startRuntime = jest.fn();
    const installer = new ManagedRuntimeInstaller({
      platform: () => 'win32',
      dataDir,
      trustedManifest: TRUSTED_MANIFEST,
      downloadArchive: jest.fn(async () => archivePath),
      verifyArchive: jest.fn(async () => true),
      extractArchive,
      startRuntime
    });

    try {
      await expect(installer.install({ vendor: 'nvidia', vramMb: 8192 }))
        .rejects.toThrow('STREAM_MONSTERS_RUNTIME_ARCHIVE_ENTRY_UNSAFE');
      expect(extractArchive).not.toHaveBeenCalled();
      expect(startRuntime).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
  });

  test('never requests an unapproved archive redirect target', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-redirect-'));
    const cancel = jest.fn(async () => {});
    const fetchImpl = jest.fn(async () => ({
      ok: false,
      status: 302,
      headers: { get: name => String(name).toLowerCase() === 'location' ? 'https://attacker.example/payload.zip' : null },
      body: { cancel }
    }));
    const installer = new ManagedRuntimeInstaller({ fetchImpl });

    try {
      await expect(installer.download({
        manifest: TRUSTED_MANIFEST,
        archivePath: path.join(dataDir, 'runtime.zip')
      })).rejects.toThrow('STREAM_MONSTERS_RUNTIME_ARCHIVE_URL_UNAPPROVED');
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(fetchImpl).toHaveBeenCalledWith(TRUSTED_MANIFEST.archiveUrl, { redirect: 'manual' });
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(fetchImpl.mock.calls.flat().join(' ')).not.toContain('attacker.example');
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test('rejects health redirects without following their target', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      status: 302,
      headers: { get: name => String(name).toLowerCase() === 'location' ? 'http://attacker.example/health' : null }
    }));
    const installer = new ManagedRuntimeInstaller({
      fetchImpl,
      healthAttempts: 1,
      healthRetryDelayMs: 0
    });

    await expect(installer.checkHealth({ manifest: TRUSTED_MANIFEST })).resolves.toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(TRUSTED_MANIFEST.healthUrl, { redirect: 'manual' });
    expect(fetchImpl.mock.calls.flat().join(' ')).not.toContain('attacker.example');
  });

  test('rejects an unapproved server-side archive origin and private health endpoint before spawning', async () => {
    const downloadArchive = jest.fn();
    const startRuntime = jest.fn();
    const installer = new ManagedRuntimeInstaller({
      platform: () => 'win32',
      dataDir: 'C:\\LTTH\\streammonsters',
      trustedManifest: {
        ...TRUSTED_MANIFEST,
        archiveUrl: 'https://attacker.example/runtime.zip',
        healthUrl: 'http://169.254.169.254/latest/meta-data'
      },
      downloadArchive,
      startRuntime
    });

    await expect(installer.install({ vendor: 'nvidia', vramMb: 8192 }))
      .rejects.toThrow('STREAM_MONSTERS_RUNTIME_ARCHIVE_URL_UNAPPROVED');
    expect(downloadArchive).not.toHaveBeenCalled();
    expect(startRuntime).not.toHaveBeenCalled();
  });

  test('rejects a non-loopback health endpoint even for an approved archive', async () => {
    const downloadArchive = jest.fn();
    const startRuntime = jest.fn();
    const installer = new ManagedRuntimeInstaller({
      platform: () => 'win32',
      dataDir: 'C:\\LTTH\\streammonsters',
      trustedManifest: { ...TRUSTED_MANIFEST, healthUrl: 'http://169.254.169.254/latest/meta-data' },
      downloadArchive,
      startRuntime
    });

    await expect(installer.install({ vendor: 'nvidia', vramMb: 8192 }))
      .rejects.toThrow('STREAM_MONSTERS_RUNTIME_HEALTH_URL_INVALID');
    expect(downloadArchive).not.toHaveBeenCalled();
    expect(startRuntime).not.toHaveBeenCalled();
  });

  test('rejects an escaping executable path before downloading or spawning', async () => {
    const downloadArchive = jest.fn();
    const startRuntime = jest.fn();
    const installer = new ManagedRuntimeInstaller({
      platform: () => 'win32',
      dataDir: 'C:\\LTTH\\streammonsters',
      trustedManifest: { ...TRUSTED_MANIFEST, executableRelativePath: '..\\outside.exe' },
      downloadArchive,
      startRuntime
    });

    await expect(installer.install({ vendor: 'nvidia', vramMb: 8192 }))
      .rejects.toThrow('STREAM_MONSTERS_RUNTIME_PATH_INVALID');
    expect(downloadArchive).not.toHaveBeenCalled();
    expect(startRuntime).not.toHaveBeenCalled();
  });

  test('starts the resolved executable directly without a command shell', async () => {
    const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-runtime-'));
    const executablePath = path.join(runtimeRoot, 'runtime.exe');
    fs.writeFileSync(executablePath, 'test executable placeholder');
    const spawnImpl = jest.fn(() => ({ pid: 42 }));
    const installer = new ManagedRuntimeInstaller({ spawnImpl });

    try {
      await expect(installer.start({ executablePath, runtimeRoot, manifest: TRUSTED_MANIFEST }))
        .resolves.toEqual({ pid: 42 });
      expect(spawnImpl).toHaveBeenCalledWith(
        fs.realpathSync(executablePath),
        TRUSTED_MANIFEST.executableArgs,
        expect.objectContaining({ cwd: fs.realpathSync(runtimeRoot), shell: false, windowsHide: true })
      );
      expect(spawnImpl.mock.calls[0][0]).not.toBe('cmd.exe');
    } finally {
      fs.rmSync(runtimeRoot, { recursive: true, force: true });
    }
  });

  test('rejects a resolved executable that escapes through a link', async () => {
    const runtimeRoot = path.resolve('managed-runtime-test');
    const executablePath = path.join(runtimeRoot, 'runtime.exe');
    const outsideExecutable = path.resolve('outside-runtime-test', 'runtime.exe');
    const spawnImpl = jest.fn();
    const existsSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    const realpathSpy = jest.spyOn(fs, 'realpathSync').mockImplementation(target => (
      target === executablePath ? outsideExecutable : runtimeRoot
    ));
    const installer = new ManagedRuntimeInstaller({ spawnImpl });

    try {
      await expect(installer.start({ executablePath, runtimeRoot, manifest: TRUSTED_MANIFEST }))
        .rejects.toThrow('STREAM_MONSTERS_RUNTIME_PATH_INVALID');
      expect(spawnImpl).not.toHaveBeenCalled();
    } finally {
      existsSpy.mockRestore();
      realpathSpy.mockRestore();
    }
  });

  test('honours an aborted setup before it can download or extract anything', async () => {
    const downloadArchive = jest.fn();
    const installer = new ManagedRuntimeInstaller({
      platform: () => 'win32',
      dataDir: 'C:\\LTTH\\streammonsters',
      trustedManifest: TRUSTED_MANIFEST,
      downloadArchive
    });
    const controller = new AbortController();
    controller.abort();
    await expect(installer.install({ vendor: 'nvidia', vramMb: 8192 }, undefined, { signal: controller.signal }))
      .rejects.toThrow('STREAM_MONSTERS_RUNTIME_ABORTED');
    expect(downloadArchive).not.toHaveBeenCalled();
  });
});
