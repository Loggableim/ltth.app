const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { Readable } = require('stream');
const ManagedRuntimeInstaller = require('../plugins/streamalchemy/backend/streammonsters/managed-runtime-installer');

const ADAPTER = Object.freeze({
  id: 'gpu-rtx4090',
  name: 'NVIDIA GeForce RTX 4090',
  vendor: 'nvidia',
  architecture: 'rtx_20_plus',
  vramMb: 24576,
  memoryState: 'known'
});

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
    expect(progress.map(event => event.state)).toEqual(expect.arrayContaining(['running', 'ready']));
  });

  test('cancels a queued install job without starting any download', () => {
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

    expect(installer.cancelInstallJob(accepted.jobId)).toEqual(expect.objectContaining({ state: 'cancelled' }));
    expect(performInstall).not.toHaveBeenCalled();
    expect(scheduled).toEqual(expect.any(Function));
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
  });

  test('spawns embedded Python directly, verifies adapter/backend plus 256 smoke output, and owns idle shutdown', async () => {
    const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-process-'));
    const pythonPath = path.join(runtimeRoot, 'python_embeded', 'python.exe');
    const mainPath = path.join(runtimeRoot, 'ComfyUI', 'main.py');
    fs.mkdirSync(path.dirname(pythonPath), { recursive: true });
    fs.mkdirSync(path.dirname(mainPath), { recursive: true });
    fs.writeFileSync(pythonPath, 'python');
    fs.writeFileSync(mainPath, 'main');
    const child = new EventEmitter();
    child.pid = 4242;
    child.exitCode = null;
    child.kill = jest.fn(() => { child.exitCode = 0; child.emit('exit', 0); return true; });
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
        json: async () => ({ devices: [{ name: 'NVIDIA GeForce RTX 4090', type: 'cuda' }] })
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

      expect(state).toEqual(expect.objectContaining({ state: 'running', pid: 4242, port: 8299 }));
      expect(spawnImpl).toHaveBeenCalledWith(
        fs.realpathSync(pythonPath),
        ['-s', fs.realpathSync(mainPath), '--listen', '127.0.0.1', '--port', '8299', '--disable-auto-launch'],
        expect.objectContaining({ cwd: fs.realpathSync(runtimeRoot), shell: false, windowsHide: true })
      );
      expect(smokeTest).toHaveBeenCalledWith(expect.objectContaining({
        width: 256,
        height: 256,
        baseUrl: 'http://127.0.0.1:8299'
      }));
      expect(setTimeoutImpl).toHaveBeenCalledWith(expect.any(Function), 5 * 60 * 1000);

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
        json: async () => ({ devices: [{ name: ADAPTER.name, type: 'cuda' }] })
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
        json: async () => ({ devices: [{ name: 'Different GPU', type: 'cuda' }] })
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
});
