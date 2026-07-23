const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { PassThrough, Readable } = require('stream');
const { archiveFolder } = require('zip-lib');
const ManagedRuntimeInstaller = require('../plugins/streamalchemy/backend/streammonsters/managed-runtime-installer');

const ADAPTER = Object.freeze({
  id: 'gpu-rtx4090',
  name: 'NVIDIA GeForce RTX 4090',
  vendor: 'nvidia',
  architecture: 'rtx_20_plus',
  backendIndex: 1,
  backendSelectionState: 'verified',
  pciBusId: '0000:65:00.0',
  backendIdentity: {
    source: 'nvidia-smi',
    index: 1,
    uuid: 'GPU-4090',
    pciBusId: '0000:65:00.0',
    name: 'NVIDIA GeForce RTX 4090'
  },
  vramMb: 24576,
  memoryState: 'known'
});

async function createPortableRuntimeArchive(dataDir) {
  const sourceRoot = path.join(dataDir, 'runtime-source');
  const portableRoot = path.join(sourceRoot, 'ComfyUI_windows_portable');
  fs.mkdirSync(path.join(portableRoot, 'python_embeded'), { recursive: true });
  fs.mkdirSync(path.join(portableRoot, 'ComfyUI'), { recursive: true });
  fs.writeFileSync(path.join(portableRoot, 'python_embeded', 'python.exe'), 'fixture-python');
  fs.writeFileSync(path.join(portableRoot, 'ComfyUI', 'main.py'), 'fixture-main');
  const archivePath = path.join(dataDir, 'runtime.zip');
  await archiveFolder(sourceRoot, archivePath);
  const bytes = fs.readFileSync(archivePath);
  return {
    bytes,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex')
  };
}

function createManagedChild(pid) {
  const child = new EventEmitter();
  child.pid = pid;
  child.exitCode = null;
  child.kill = jest.fn(() => {
    child.exitCode = 0;
    child.emit('exit', 0);
    return true;
  });
  return child;
}

describe('Stream Monsters 1.3 runtime jobs and lifecycle', () => {
  test('loads only an existing verified installation record inside the versioned plugin-data root', () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-active-'));
    const installRoot = path.join(
      dataDir,
      'managed-runtimes-v2',
      'installs',
      'nvidia-standard-0.28.0-797183fe6165b96a'
    );
    fs.mkdirSync(installRoot, { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'managed-runtimes-v2', 'active.json'), JSON.stringify({
      state: 'ready',
      verified: true,
      runtimeRoot: installRoot,
      profileId: 'nvidia-standard',
      adapterId: ADAPTER.id
    }));

    try {
      const installer = new ManagedRuntimeInstaller({ dataDir });
      expect(installer.installation).toEqual(expect.objectContaining({
        state: 'ready',
        verified: true,
        runtimeRoot: fs.realpathSync(installRoot),
        profileId: 'nvidia-standard'
      }));
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test('creates an asynchronous server-pinned install job from the narrow accepted request', async () => {
    let scheduled;
    const progress = [];
    const performInstall = jest.fn(async input => {
      input.onProgress({ phase: 'model', completedBytes: 7, totalBytes: 10 });
      return { state: 'ready', runtimeRoot: 'C:\\LTTH\\runtime', verified: true };
    });
    const installer = new ManagedRuntimeInstaller({
      platform: () => 'win32',
      windowsRelease: () => '10.0.22631',
      performInstall,
      scheduleJob: callback => { scheduled = callback; },
      onState: event => progress.push(event)
    });

    expect(() => installer.createInstallJob({
      adapterId: ADAPTER.id,
      profileId: 'nvidia-standard',
      acceptModelLicense: true,
      archiveUrl: 'https://attacker.example/runtime.7z'
    }, [ADAPTER])).toThrow('STREAM_MONSTERS_RUNTIME_INSTALL_REQUEST_INVALID');
    expect(() => installer.createInstallJob({
      adapterId: ADAPTER.id,
      profileId: 'nvidia-standard',
      acceptModelLicense: false
    }, [ADAPTER])).toThrow('STREAM_MONSTERS_MODEL_LICENSE_REQUIRED');

    const accepted = installer.createInstallJob({
      adapterId: ADAPTER.id,
      profileId: 'nvidia-standard',
      acceptModelLicense: true
    }, [ADAPTER]);

    expect(accepted).toEqual({ jobId: expect.stringMatching(/^runtime-job-/), state: 'queued' });
    expect(performInstall).not.toHaveBeenCalled();
    await scheduled();
    expect(installer.getInstallJob(accepted.jobId)).toEqual(expect.objectContaining({
      jobId: accepted.jobId,
      state: 'ready',
      progress: expect.objectContaining({ phase: 'complete' })
    }));
    expect(JSON.stringify(installer.getInstallJob(accepted.jobId))).not.toContain('archiveUrl');
    expect(JSON.stringify(installer.getInstallJob(accepted.jobId))).not.toContain('sha256');
    expect(JSON.stringify(installer.getInstallJob(accepted.jobId))).not.toContain('runtimeRoot');
    expect(progress.map(event => event.state)).toEqual(expect.arrayContaining(['running', 'ready']));
  });

  test('rejects cancellation after a job enters its non-cancellable commit phase', async () => {
    let releaseCommit;
    let markCommitting;
    const committing = new Promise(resolve => { markCommitting = resolve; });
    const commitGate = new Promise(resolve => { releaseCommit = resolve; });
    const performInstall = jest.fn(async input => {
      if (typeof input.beginCommit !== 'function') {
        markCommitting();
        throw new Error('beginCommit missing');
      }
      input.beginCommit();
      markCommitting();
      await commitGate;
      return {
        state: 'ready',
        runtimeRoot: 'C:\\LTTH\\runtime',
        adapterId: input.adapter.id,
        profileId: input.profile.id,
        verified: true
      };
    });
    const installer = new ManagedRuntimeInstaller({
      platform: () => 'win32',
      windowsRelease: () => '10.0.22631',
      performInstall
    });
    const accepted = installer.createInstallJob({
      adapterId: ADAPTER.id,
      profileId: 'nvidia-standard',
      acceptModelLicense: true
    }, [ADAPTER]);

    await committing;

    expect(installer.getInstallJob(accepted.jobId)).toEqual(expect.objectContaining({
      state: 'committing',
      progress: expect.objectContaining({ phase: 'committing' })
    }));
    await expect(installer.cancelInstallJob(accepted.jobId))
      .rejects.toThrow('STREAM_MONSTERS_RUNTIME_INSTALL_COMMITTING');
    expect(performInstall.mock.calls[0][0].signal.aborted).toBe(false);

    releaseCommit();
    await expect(installer.jobs.get(accepted.jobId).promise)
      .resolves.toEqual(expect.objectContaining({ state: 'ready' }));
    expect(installer.installation).toEqual(expect.objectContaining({
      adapterId: ADAPTER.id,
      profileId: 'nvidia-standard',
      verified: true
    }));
  });

  test('preflights remaining downloads plus extracted runtime, a full model copy, and safety margin', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-disk-plan-'));
    const runtimeBytes = Buffer.alloc(100, 1);
    const modelBytes = Buffer.alloc(200, 2);
    const runtimeSha256 = crypto.createHash('sha256').update(runtimeBytes).digest('hex');
    const modelSha256 = crypto.createHash('sha256').update(modelBytes).digest('hex');
    const installer = new ManagedRuntimeInstaller({
      dataDir,
      diskSafetyMarginBytes: 50
    });
    const runtimePath = installer.resolveArtifactPath(runtimeSha256, 'runtime.zip');
    const modelPath = installer.resolveArtifactPath(modelSha256, 'fixture.safetensors');
    fs.mkdirSync(path.dirname(runtimePath), { recursive: true });
    fs.mkdirSync(path.dirname(modelPath), { recursive: true });
    fs.writeFileSync(`${runtimePath}.part`, runtimeBytes.subarray(0, 25));
    fs.writeFileSync(modelPath, modelBytes);

    try {
      await expect(installer.calculateCatalogRequiredBytes({
        sha256: runtimeSha256,
        archiveType: 'zip',
        downloadSizeBytes: runtimeBytes.length,
        installedSizeBytes: 400
      }, {
        sha256: modelSha256,
        fileName: 'fixture.safetensors',
        sizeBytes: modelBytes.length
      })).resolves.toBe(
        75 +
        0 +
        400 +
        modelBytes.length +
        50
      );
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test('cancels a queued install job without starting any download', async () => {
    let scheduled;
    const performInstall = jest.fn();
    const installer = new ManagedRuntimeInstaller({
      platform: () => 'win32',
      windowsRelease: () => '10.0.22631',
      performInstall,
      scheduleJob: callback => { scheduled = callback; }
    });
    const accepted = installer.createInstallJob({
      adapterId: ADAPTER.id,
      acceptModelLicense: true
    }, [ADAPTER]);

    await expect(installer.cancelInstallJob(accepted.jobId))
      .resolves.toEqual(expect.objectContaining({ state: 'cancelled' }));
    expect(performInstall).not.toHaveBeenCalled();
    expect(scheduled).toEqual(expect.any(Function));
  });

  test('serializes installs and waits for running job settlement during cancellation and destroy', async () => {
    let installStarted;
    let settled = false;
    const performInstall = jest.fn(({ signal }) => new Promise((resolve, reject) => {
      installStarted = true;
      signal.addEventListener('abort', () => {
        setImmediate(() => {
          settled = true;
          reject(new Error('STREAM_MONSTERS_RUNTIME_ABORTED'));
        });
      }, { once: true });
    }));
    const installer = new ManagedRuntimeInstaller({
      platform: () => 'win32',
      windowsRelease: () => '10.0.22631',
      performInstall
    });
    const accepted = installer.createInstallJob({
      adapterId: ADAPTER.id,
      acceptModelLicense: true
    }, [ADAPTER]);

    expect(() => installer.createInstallJob({
      adapterId: ADAPTER.id,
      acceptModelLicense: true
    }, [ADAPTER])).toThrow('STREAM_MONSTERS_RUNTIME_INSTALL_IN_PROGRESS');
    await new Promise(resolve => setImmediate(resolve));
    expect(installStarted).toBe(true);

    await expect(installer.cancelInstallJob(accepted.jobId))
      .resolves.toEqual(expect.objectContaining({ state: 'cancelled' }));
    expect(settled).toBe(true);

    const replacement = installer.createInstallJob({
      adapterId: ADAPTER.id,
      acceptModelLicense: true
    }, [ADAPTER]);
    await new Promise(resolve => setImmediate(resolve));
    await installer.destroy();

    expect(settled).toBe(true);
    expect(installer.getInstallJob(replacement.jobId)).toEqual(expect.objectContaining({
      state: 'cancelled'
    }));
    expect(() => installer.createInstallJob({
      adapterId: ADAPTER.id,
      acceptModelLicense: true
    }, [ADAPTER])).toThrow('STREAM_MONSTERS_RUNTIME_DISPOSED');
  });

  test('resumes a part download, verifies SHA-256, and atomically completes the artifact', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-resume-'));
    const targetPath = path.join(dataDir, 'runtime.7z');
    fs.writeFileSync(`${targetPath}.part`, 'hello ');
    const bytes = Buffer.from('world');
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      status: 206,
      headers: { get: name => String(name).toLowerCase() === 'content-length' ? String(bytes.length) : null },
      body: Readable.from([bytes])
    }));
    const installer = new ManagedRuntimeInstaller({ fetchImpl });

    try {
      await expect(installer.downloadArtifact({
        url: 'https://github.com/Loggableim/ltth.app/releases/download/test/runtime.7z',
        targetPath,
        expectedSize: 11,
        sha256: crypto.createHash('sha256').update('hello world').digest('hex')
      })).resolves.toBe(targetPath);
      expect(fetchImpl).toHaveBeenCalledWith(
        expect.stringContaining('runtime.7z'),
        expect.objectContaining({ redirect: 'manual', headers: { Range: 'bytes=6-' } })
      );
      expect(fs.readFileSync(targetPath, 'utf8')).toBe('hello world');
      expect(fs.existsSync(`${targetPath}.part`)).toBe(false);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test('finishes an already complete verified part without another network request', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-complete-part-'));
    const targetPath = path.join(dataDir, 'runtime.7z');
    const content = Buffer.from('complete artifact');
    fs.writeFileSync(`${targetPath}.part`, content);
    const fetchImpl = jest.fn(async () => { throw new Error('network should not be used'); });
    const installer = new ManagedRuntimeInstaller({ fetchImpl });

    try {
      await expect(installer.downloadArtifact({
        url: 'https://github.com/Comfy-Org/ComfyUI/releases/download/v0.28.0/runtime.7z',
        targetPath,
        expectedSize: content.length,
        sha256: crypto.createHash('sha256').update(content).digest('hex')
      })).resolves.toBe(targetPath);
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(fs.readFileSync(targetPath)).toEqual(content);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test('propagates cancellation through artifact hashing', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-hash-cancel-'));
    const artifactPath = path.join(dataDir, 'artifact.bin');
    fs.writeFileSync(artifactPath, 'artifact');
    const controller = new AbortController();
    controller.abort();
    const installer = new ManagedRuntimeInstaller();

    try {
      await expect(installer.verify({
        archivePath: artifactPath,
        sha256: crypto.createHash('sha256').update('artifact').digest('hex'),
        signal: controller.signal
      })).rejects.toThrow('STREAM_MONSTERS_RUNTIME_ABORTED');
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test('uses tar.exe without a shell and rejects links before 7z extraction', async () => {
    const calls = [];
    const execFileImpl = jest.fn((file, args, options, callback) => {
      calls.push([file, args, options]);
      callback(null, '-rw-r--r-- 0 0 123 Jan 01 00:00 ComfyUI/main.py\n', '');
    });
    const installer = new ManagedRuntimeInstaller({ execFileImpl });

    await installer.inspectSevenZip({ archivePath: 'C:\\staging\\runtime.7z', runtimeRoot: 'C:\\staging\\runtime' });
    await installer.extractSevenZip({ archivePath: 'C:\\staging\\runtime.7z', runtimeRoot: 'C:\\staging\\runtime' });

    expect(calls).toEqual([
      ['tar.exe', ['-tvf', 'C:\\staging\\runtime.7z'], expect.objectContaining({ shell: false, windowsHide: true })],
      ['tar.exe', ['-xf', 'C:\\staging\\runtime.7z', '-C', 'C:\\staging\\runtime'], expect.objectContaining({ shell: false, windowsHide: true })]
    ]);

    const unsafe = new ManagedRuntimeInstaller({
      execFileImpl: (file, args, options, callback) => callback(
        null,
        'lrwxrwxrwx 0 0 0 Jan 01 00:00 ComfyUI/python.exe -> C:/Windows/System32/cmd.exe\n',
        ''
      )
    });
    await expect(unsafe.inspectSevenZip({
      archivePath: 'C:\\staging\\runtime.7z',
      runtimeRoot: 'C:\\staging\\runtime'
    })).rejects.toThrow('STREAM_MONSTERS_RUNTIME_ARCHIVE_ENTRY_UNSAFE');
  });

  test.each([
    ['absolute path', '-rw-r--r-- 0 0 1 Jan 01 00:00 C:/Windows/system.ini\n'],
    ['traversal', '-rw-r--r-- 0 0 1 Jan 01 00:00 ../outside.py\n'],
    ['device path', '-rw-r--r-- 0 0 1 Jan 01 00:00 ComfyUI/NUL\n']
  ])('rejects a 7z %s before extraction', async (label, listing) => {
    const installer = new ManagedRuntimeInstaller({
      execFileImpl: (file, args, options, callback) => callback(null, listing, '')
    });
    await expect(installer.inspectSevenZip({
      archivePath: 'C:\\staging\\runtime.7z',
      runtimeRoot: 'C:\\staging\\runtime'
    })).rejects.toThrow('STREAM_MONSTERS_RUNTIME_ARCHIVE_ENTRY_UNSAFE');
  });

  test('rejects excessive 7z entry counts and uncompressed sizes before extraction', async () => {
    const listing = [
      '-rw-r--r-- 0 0 60 Jan 01 00:00 ComfyUI/a.py',
      '-rw-r--r-- 0 0 60 Jan 01 00:00 ComfyUI/b.py'
    ].join('\n');
    const tooMany = new ManagedRuntimeInstaller({
      maxArchiveEntries: 1,
      execFileImpl: (file, args, options, callback) => callback(null, listing, '')
    });
    const tooLarge = new ManagedRuntimeInstaller({
      maxArchiveUncompressedBytes: 100,
      execFileImpl: (file, args, options, callback) => callback(null, listing, '')
    });
    await expect(tooMany.inspectSevenZip({
      archivePath: 'C:\\staging\\runtime.7z',
      runtimeRoot: 'C:\\staging\\runtime'
    })).rejects.toThrow('STREAM_MONSTERS_RUNTIME_ARCHIVE_ENTRY_UNSAFE');
    await expect(tooLarge.inspectSevenZip({
      archivePath: 'C:\\staging\\runtime.7z',
      runtimeRoot: 'C:\\staging\\runtime'
    })).rejects.toThrow('STREAM_MONSTERS_RUNTIME_ARCHIVE_ENTRY_UNSAFE');

    const catalogBound = new ManagedRuntimeInstaller({
      maxArchiveUncompressedBytes: 1000,
      execFileImpl: (file, args, options, callback) => callback(null, listing, '')
    });
    await expect(catalogBound.inspectSevenZip({
      archivePath: 'C:\\staging\\runtime.7z',
      runtimeRoot: 'C:\\staging\\runtime',
      maxUncompressedBytes: 100
    })).rejects.toThrow('STREAM_MONSTERS_RUNTIME_ARCHIVE_ENTRY_UNSAFE');
  });

  test('spawns embedded Python directly, verifies adapter/backend plus 256 smoke output, and owns idle shutdown', async () => {
    const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-process-'));
    const pythonPath = path.join(runtimeRoot, 'python_embeded', 'python.exe');
    const mainPath = path.join(runtimeRoot, 'ComfyUI', 'main.py');
    fs.mkdirSync(path.dirname(pythonPath), { recursive: true });
    fs.mkdirSync(path.dirname(mainPath), { recursive: true });
    fs.writeFileSync(pythonPath, 'python');
    fs.writeFileSync(mainPath, 'main');
    const child = createManagedChild(4242);
    const spawnImpl = jest.fn(() => child);
    const smokeTest = jest.fn(async () => ({ ok: true, width: 256, height: 256 }));
    let idleCallback;
    const setTimeoutImpl = jest.fn((callback, delay) => {
      idleCallback = callback;
      return { unref: jest.fn() };
    });
    const installer = new ManagedRuntimeInstaller({
      spawnImpl,
      fetchImpl: jest.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          devices: [{
            name: 'NVIDIA GeForce RTX 4090',
            type: 'cuda',
            index: 0,
            uuid: 'GPU-4090',
            pci_bus_id: '0000:65:00.0'
          }]
        })
      })),
      findFreePort: jest.fn(async () => 8299),
      smokeTest,
      setTimeoutImpl,
      clearTimeoutImpl: jest.fn()
    });
    installer.installation = {
      state: 'ready',
      verified: true,
      runtimeRoot,
      profileId: 'nvidia-standard',
      adapterId: ADAPTER.id
    };

    try {
      const state = await installer.startManagedRuntime({ adapter: ADAPTER });

      expect(state).toEqual(expect.objectContaining({
        state: 'running',
        pid: 4242,
        port: 8299,
        backendIndex: ADAPTER.backendIndex,
        runtimeDeviceIndex: 0
      }));
      expect(spawnImpl).toHaveBeenCalledWith(
        fs.realpathSync(pythonPath),
        [
          '-s',
          fs.realpathSync(mainPath),
          '--listen',
          '127.0.0.1',
          '--port',
          '8299',
          '--disable-auto-launch',
          '--cuda-device',
          '1'
        ],
        expect.objectContaining({ cwd: fs.realpathSync(runtimeRoot), shell: false, windowsHide: true })
      );
      expect(smokeTest).toHaveBeenCalledWith(expect.objectContaining({
        width: 256,
        height: 256,
        baseUrl: 'http://127.0.0.1:8299'
      }));
      expect(setTimeoutImpl).toHaveBeenCalledWith(expect.any(Function), 5 * 60 * 1000);

      const releaseActivity = installer.acquireActivityLease();
      await idleCallback();
      expect(child.kill).not.toHaveBeenCalled();
      releaseActivity();
      await idleCallback();
      expect(child.kill).toHaveBeenCalledTimes(1);
      expect(installer.getProcessState()).toEqual(expect.objectContaining({ state: 'stopped' }));
    } finally {
      fs.rmSync(runtimeRoot, { recursive: true, force: true });
    }
  });

  test('keeps checking child liveness while the loopback health endpoint starts', async () => {
    const child = { exitCode: null };
    const fetchImpl = jest.fn()
      .mockRejectedValueOnce(new Error('not listening yet'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          devices: [{
            name: ADAPTER.name,
            type: 'cuda',
            index: 0,
            uuid: ADAPTER.backendIdentity.uuid
          }]
        })
      });
    const installer = new ManagedRuntimeInstaller({
      fetchImpl,
      smokeTest: async () => ({ ok: true, width: 256, height: 256 }),
      healthAttempts: 2,
      healthRetryDelayMs: 0
    });

    await expect(installer.verifyManagedRuntime({
      adapter: ADAPTER,
      profile: installer.getProfile('nvidia-standard'),
      baseUrl: 'http://127.0.0.1:8299',
      child
    })).resolves.toEqual(expect.objectContaining({ state: 'passed' }));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test('requires exactly one active device record matching the selected adapter and backend', async () => {
    const child = { exitCode: null };
    const installer = new ManagedRuntimeInstaller({
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          devices: [
            { name: ADAPTER.name, type: 'cuda', index: 0 },
            { name: ADAPTER.name, type: 'cuda', index: 0 }
          ]
        })
      }),
      smokeTest: async () => ({ ok: true, width: 256, height: 256 }),
      healthAttempts: 1
    });

    await expect(installer.verifyManagedRuntime({
      adapter: ADAPTER,
      profile: installer.getProfile('nvidia-standard'),
      baseUrl: 'http://127.0.0.1:8299',
      child
    })).rejects.toThrow('STREAM_MONSTERS_RUNTIME_DEVICE_AMBIGUOUS');
  });

  test('requires the active device record to match both backend index and adapter identity', async () => {
    const installer = new ManagedRuntimeInstaller({
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          devices: [
            {
              name: ADAPTER.name,
              type: 'cuda',
              index: ADAPTER.backendIndex,
              uuid: ADAPTER.backendIdentity.uuid,
              pci_bus_id: ADAPTER.pciBusId
            },
            {
              name: 'NVIDIA GeForce RTX 4080',
              type: 'cuda',
              index: 0,
              uuid: 'GPU-4080',
              pci_bus_id: '0000:17:00.0'
            }
          ]
        })
      }),
      smokeTest: async () => ({ ok: true, width: 256, height: 256 }),
      healthAttempts: 1
    });

    await expect(installer.verifyManagedRuntime({
      adapter: ADAPTER,
      profile: installer.getProfile('nvidia-standard'),
      baseUrl: 'http://127.0.0.1:8299',
      child: { exitCode: null }
    })).rejects.toThrow('STREAM_MONSTERS_RUNTIME_DEVICE_MISMATCH');
  });

  test('recognizes the ROCm package backend when PyTorch exposes its selected AMD device as cuda', async () => {
    const amdAdapter = {
      id: 'gpu-rx7900xtx',
      name: 'AMD Radeon RX 7900 XTX',
      vendor: 'amd',
      architecture: 'amd_radeon',
      backendIndex: 0,
      backendSelectionState: 'verified',
      pciBusId: '0000:03:00.0',
      backendIdentity: {
        source: 'rocm-smi',
        index: 0,
        uuid: 'AMD-7900-XTX',
        pciBusId: '0000:03:00.0',
        name: 'AMD Radeon RX 7900 XTX'
      },
      vramMb: 24576,
      memoryState: 'known'
    };
    const installer = new ManagedRuntimeInstaller({
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          system: { pytorch_version: '2.9.1+rocm6.4' },
          devices: [{ name: amdAdapter.name, type: 'cuda', index: 0 }]
        })
      }),
      smokeTest: async () => ({ ok: true, width: 256, height: 256 }),
      healthAttempts: 1
    });

    await expect(installer.verifyManagedRuntime({
      adapter: amdAdapter,
      profile: installer.getProfile('amd-experimental'),
      baseUrl: 'http://127.0.0.1:8299',
      child: { exitCode: null }
    })).resolves.toEqual(expect.objectContaining({ state: 'passed' }));
  });

  test('uses official backend selectors for supported NVIDIA, AMD, and Intel runtimes', () => {
    const installer = new ManagedRuntimeInstaller();

    expect(installer.buildDeviceSelectorArgs(
      installer.getProfile('nvidia-standard'),
      { ...ADAPTER, backendIndex: 2 }
    )).toEqual(['--cuda-device', '2']);
    expect(installer.buildDeviceSelectorArgs(
      installer.getProfile('amd-experimental'),
      { ...ADAPTER, vendor: 'amd', backendIndex: 1 }
    )).toEqual(['--cuda-device', '1']);
    expect(installer.buildDeviceSelectorArgs(
      installer.getProfile('intel-arc'),
      { ...ADAPTER, vendor: 'intel', backendIndex: 3 }
    )).toEqual(['--oneapi-device-selector', 'level_zero:3']);
    expect(() => installer.buildDeviceSelectorArgs(
      installer.getProfile('nvidia-standard'),
      { ...ADAPTER, backendIndex: null, backendSelectionState: 'ambiguous' }
    )).toThrow('STREAM_MONSTERS_RUNTIME_ADAPTER_MAPPING_AMBIGUOUS');
  });

  test('stops only the managed child when device verification fails during startup', async () => {
    const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-failed-start-'));
    const pythonPath = path.join(runtimeRoot, 'python_embeded', 'python.exe');
    const mainPath = path.join(runtimeRoot, 'ComfyUI', 'main.py');
    fs.mkdirSync(path.dirname(pythonPath), { recursive: true });
    fs.mkdirSync(path.dirname(mainPath), { recursive: true });
    fs.writeFileSync(pythonPath, 'python');
    fs.writeFileSync(mainPath, 'main');
    const child = new EventEmitter();
    child.pid = 8188;
    child.exitCode = null;
    child.kill = jest.fn(() => { child.exitCode = 1; return true; });
    const installer = new ManagedRuntimeInstaller({
      spawnImpl: () => child,
      findFreePort: async () => 8188,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          devices: [{ name: 'Different GPU', type: 'cuda', index: 0 }]
        })
      }),
      healthAttempts: 1
    });
    installer.installation = {
      state: 'ready',
      verified: true,
      runtimeRoot,
      profileId: 'nvidia-standard',
      adapterId: ADAPTER.id
    };

    try {
      await expect(installer.startManagedRuntime({ adapter: ADAPTER }))
        .rejects.toThrow('STREAM_MONSTERS_RUNTIME_DEVICE_MISMATCH');
      expect(child.kill).toHaveBeenCalledTimes(1);
      expect(installer.managedChild).toBeNull();
      expect(installer.getProcessState()).toEqual(expect.objectContaining({ state: 'stopped', pid: null }));
    } finally {
      fs.rmSync(runtimeRoot, { recursive: true, force: true });
    }
  });

  test('keeps promotion durable across cleanup failure and persists fresh metadata when reusing a pinned install', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-catalog-install-'));
    const runtimeArtifact = await createPortableRuntimeArchive(dataDir);
    const modelBytes = Buffer.from('fixture-model');
    const modelSha256 = crypto.createHash('sha256').update(modelBytes).digest('hex');
    const artifactRequests = [];
    const ports = [8299, 8300, 8301, 8302];
    const children = [];
    let failSmoke = true;
    let diskChecks = 0;
    let activeAdapter = ADAPTER;
    const fetchImpl = jest.fn(async url => {
      const value = String(url);
      if (value.endsWith('/system_stats')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            devices: [{
              name: activeAdapter.name,
              type: 'cuda',
              index: 0,
              uuid: activeAdapter.backendIdentity.uuid,
              pci_bus_id: activeAdapter.pciBusId
            }]
          })
        };
      }
      artifactRequests.push(value);
      const bytes = value.includes('runtime.zip') ? runtimeArtifact.bytes : modelBytes;
      return {
        ok: true,
        status: 200,
        body: Readable.from([bytes])
      };
    });
    const installer = new ManagedRuntimeInstaller({
      dataDir,
      fetchImpl,
      diskSafetyMarginBytes: 128,
      diskFreeBytes: async () => {
        diskChecks += 1;
        return diskChecks === 1 ? Number.MAX_SAFE_INTEGER : 1024 + modelBytes.length + 128 + 1;
      },
      findFreePort: async () => ports.shift(),
      spawnImpl: () => {
        const child = createManagedChild(9000 + children.length);
        children.push(child);
        return child;
      },
      smokeTest: async () => failSmoke
        ? { ok: false, width: 256, height: 256 }
        : { ok: true, width: 256, height: 256 },
      healthAttempts: 1
    });
    const profile = {
      ...installer.getProfile('nvidia-standard'),
      archiveUrl: 'https://github.com/Comfy-Org/ComfyUI/releases/download/v0.28.0/runtime.zip',
      archiveType: 'zip',
      downloadSizeBytes: runtimeArtifact.bytes.length,
      installedSizeBytes: 1024,
      installedSizeBasis: 'conservative_fixture',
      sha256: runtimeArtifact.sha256
    };
    const model = {
      id: 'fixture-model',
      fileName: 'fixture.safetensors',
      downloadUrl: 'https://huggingface.co/ByteDance/SDXL-Lightning/resolve/main/fixture.safetensors',
      sizeBytes: modelBytes.length,
      sha256: modelSha256,
      license: 'OpenRAIL++'
    };
    const installDir = path.join(
      dataDir,
      'managed-runtimes-v2',
      'installs',
      `nvidia-standard-0.28.0-${runtimeArtifact.sha256.slice(0, 16)}`
    );

    try {
      await expect(installer.performCatalogInstall({
        jobId: 'runtime-job-failure',
        adapter: ADAPTER,
        profile,
        model,
        signal: new AbortController().signal,
        onProgress: jest.fn()
      })).rejects.toThrow('STREAM_MONSTERS_RUNTIME_SMOKE_TEST_FAILED');

      expect(fs.existsSync(installDir)).toBe(false);
      expect(fs.existsSync(path.join(dataDir, 'managed-runtimes-v2', 'active.json'))).toBe(false);
      expect(artifactRequests).toHaveLength(2);
      expect(fs.readdirSync(path.join(dataDir, 'managed-runtimes-v2', 'artifacts'))).toEqual(
        expect.arrayContaining([runtimeArtifact.sha256, modelSha256])
      );

      failSmoke = false;
      installer.cleanupValidatedStaging = jest.fn(async () => {
        throw new Error('fixture staging cleanup failed');
      });
      const installation = await installer.performCatalogInstall({
        jobId: 'runtime-job-retry',
        adapter: ADAPTER,
        profile,
        model,
        signal: new AbortController().signal,
        onProgress: jest.fn()
      });

      expect(artifactRequests).toHaveLength(2);
      expect(installation).toEqual(expect.objectContaining({
        state: 'ready',
        verified: true,
        runtimeRoot: fs.realpathSync(installDir)
      }));
      expect(installer.getProcessState()).toEqual(expect.objectContaining({ state: 'stopped' }));
      expect(JSON.parse(fs.readFileSync(
        path.join(dataDir, 'managed-runtimes-v2', 'active.json'),
        'utf8'
      ))).toEqual(expect.objectContaining({ runtimeRoot: fs.realpathSync(installDir), verified: true }));
      expect(installer.installation).toEqual(installation);
      expect(installer.cleanupValidatedStaging).toHaveBeenCalled();

      const secondAdapter = {
        ...ADAPTER,
        id: 'gpu-rtx4090-second',
        backendIndex: 0,
        pnpDeviceId: 'PCI\\VEN_10DE&DEV_2684\\SECOND',
        pciBusId: '0000:17:00.0',
        backendIdentity: {
          ...ADAPTER.backendIdentity,
          index: 0,
          uuid: 'GPU-4090-SECOND',
          pciBusId: '0000:17:00.0'
        }
      };
      activeAdapter = secondAdapter;
      const reused = await installer.performCatalogInstall({
        jobId: 'runtime-job-reuse',
        adapter: secondAdapter,
        profile,
        model,
        signal: new AbortController().signal,
        onProgress: jest.fn()
      });
      const activeRecord = JSON.parse(fs.readFileSync(
        path.join(dataDir, 'managed-runtimes-v2', 'active.json'),
        'utf8'
      ));

      expect(reused).toEqual(expect.objectContaining({
        state: 'ready',
        verified: true,
        runtimeRoot: fs.realpathSync(installDir),
        adapterId: secondAdapter.id,
        profileId: profile.id,
        model: expect.objectContaining({
          id: model.id,
          fileName: model.fileName,
          sizeBytes: model.sizeBytes,
          verified: true
        }),
        smokeTest: expect.objectContaining({ state: 'passed' })
      }));
      expect(activeRecord).toEqual(expect.objectContaining({
        adapterId: secondAdapter.id,
        profileId: profile.id,
        model: expect.objectContaining({ id: model.id, verified: true }),
        smokeTest: expect.objectContaining({ state: 'passed' })
      }));
      expect(installer.installation).toEqual(reused);

      const restarted = await installer.startManagedRuntime({ adapter: secondAdapter });
      expect(restarted).toEqual(expect.objectContaining({
        state: 'running',
        baseUrl: 'http://127.0.0.1:8302'
      }));
    } finally {
      await installer.destroy();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test('aborts a real catalog install while preserving its reusable artifact part', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-catalog-cancel-'));
    const controller = new AbortController();
    const body = new PassThrough();
    const bytes = Buffer.from('partial-runtime');
    const sha256 = crypto.createHash('sha256').update(Buffer.concat([bytes, Buffer.from('rest')])).digest('hex');
    let markFetchStarted;
    const fetchStarted = new Promise(resolve => { markFetchStarted = resolve; });
    let markProgress;
    const progressStarted = new Promise(resolve => { markProgress = resolve; });
    const installer = new ManagedRuntimeInstaller({
      dataDir,
      diskFreeBytes: async () => Number.MAX_SAFE_INTEGER,
      fetchImpl: async () => {
        markFetchStarted();
        return {
          ok: true,
          status: 200,
          body
        };
      }
    });
    const installPromise = installer.performCatalogInstall({
      jobId: 'runtime-job-cancel',
      adapter: ADAPTER,
      profile: {
        ...installer.getProfile('nvidia-standard'),
        archiveUrl: 'https://github.com/Comfy-Org/ComfyUI/releases/download/v0.28.0/runtime.zip',
        archiveType: 'zip',
        downloadSizeBytes: bytes.length + 4,
        sha256
      },
      model: {
        id: 'fixture-model',
        fileName: 'fixture.safetensors',
        downloadUrl: 'https://huggingface.co/ByteDance/SDXL-Lightning/resolve/main/fixture.safetensors',
        sizeBytes: 1,
        sha256: crypto.createHash('sha256').update('x').digest('hex'),
        license: 'OpenRAIL++'
      },
      signal: controller.signal,
      onProgress: progress => {
        if (progress.completedBytes >= bytes.length) markProgress();
      }
    });

    try {
      body.write(bytes);
      await fetchStarted;
      await progressStarted;
      const expectedPartPath = path.join(
        dataDir,
        'managed-runtimes-v2',
        'artifacts',
        sha256,
        'runtime.zip.part'
      );
      for (let attempt = 0; attempt < 20; attempt += 1) {
        if (fs.existsSync(expectedPartPath) && fs.statSync(expectedPartPath).size >= bytes.length) break;
        await new Promise(resolve => setImmediate(resolve));
      }
      controller.abort();
      await expect(installPromise).rejects.toThrow('STREAM_MONSTERS_RUNTIME_ABORTED');

      const partPath = expectedPartPath;
      expect(fs.existsSync(partPath)).toBe(true);
      expect(fs.readFileSync(partPath)).toEqual(bytes);
      expect(fs.readdirSync(path.join(dataDir, 'managed-runtimes-v2', 'staging'))).toEqual([]);
    } finally {
      body.destroy();
      await installer.destroy();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
