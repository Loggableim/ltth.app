const StreamMonstersRoutes = require('../plugins/streamalchemy/backend/streammonsters/routes');
const StreamAlchemyPlugin = require('../plugins/streamalchemy');

const TRUSTED_MANIFEST = Object.freeze({
  version: 'runtime-1',
  archiveUrl: 'https://github.com/Loggableim/ltth.app/releases/download/runtime-1/runtime.zip',
  sha256: 'a'.repeat(64),
  modelSha256: 'b'.repeat(64),
  archiveType: 'zip',
  executableRelativePath: 'ComfyUI/runtime.exe',
  comfyRootRelativePath: 'ComfyUI',
  healthBaseUrl: 'http://127.0.0.1:8188',
  healthUrl: 'http://127.0.0.1:8188/system_stats'
});

function createResponse() {
  return {
    statusCode: 200,
    status: jest.fn(function status(code) {
      this.statusCode = code;
      return this;
    }),
    json: jest.fn()
  };
}

const FORBIDDEN_RUNTIME_KEYS = new Set([
  'runtimeRoot',
  'previousRuntimeRoot',
  'targetRoot',
  'targetPath',
  'pid',
  'port',
  'baseUrl',
  'deviceSelectorArgs',
  'pnpDeviceId',
  'pciBusId',
  'locationPaths',
  'backendIndex',
  'runtimeDeviceIndex',
  'backendIdentity',
  'uuid',
  'error'
]);

function expectSafeRuntimePayload(payload) {
  const keys = [];
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    for (const [key, nested] of Object.entries(value)) {
      keys.push(key);
      visit(nested);
    }
  };
  visit(payload);
  expect(keys.filter(key => FORBIDDEN_RUNTIME_KEYS.has(key))).toEqual([]);
  expect(JSON.stringify(payload)).not.toMatch(
    /C:\\private|127\.0\.0\.1:8188|GPU-PRIVATE|--cuda-device|PCIROOT|backend English prose/
  );
}

function createSubject({ storedManifest = null, artPool = null } = {}) {
  const registered = [];
  const emit = jest.fn();
  const updateConfig = jest.fn(updates => ({
    streamMonsters: {
      enabled: true,
      ...(updates.streamMonsters || {})
    }
  }));
  const config = {
    streamMonsters: {
      enabled: true,
      localRuntime: { state: 'not_installed', manifest: storedManifest }
    },
    localGeneration: {}
  };
  const managedRuntime = {
    current: null,
    installation: {
      state: 'ready',
      verified: true,
      adapterId: 'gpu-1',
      profileId: 'nvidia-standard',
      runtimeRoot: 'C:\\private\\managed-runtime\\active',
      previousRuntimeRoot: 'C:\\private\\managed-runtime\\previous',
      model: { verified: true }
    },
    lastSmokeTest: {
      state: 'passed',
      width: 256,
      height: 256,
      adapterId: 'gpu-1',
      profileId: 'nvidia-standard',
      runtimeVersion: '0.28.0'
    },
    recommend: jest.fn(() => ({
      supported: true,
      profileId: 'nvidia-standard',
      presetId: 'sdxl_lightning_4step',
      width: 768,
      height: 768,
      steps: 4
    })),
    getPublicProfiles: jest.fn(() => [
      { id: 'nvidia-standard', label: 'NVIDIA RTX 20+', backend: 'cuda', version: '0.28.0' },
      { id: 'nvidia-cuda126-legacy', label: 'NVIDIA legacy', backend: 'cuda', version: '0.27.2' },
      { id: 'amd-experimental', label: 'AMD Radeon (experimental)', backend: 'rocm', experimental: true }
    ]),
    getProfile: jest.fn(profileId => ({
      'nvidia-standard': { id: 'nvidia-standard', backend: 'cuda', version: '0.28.0' },
      'nvidia-cuda126-legacy': { id: 'nvidia-cuda126-legacy', backend: 'cuda', version: '0.27.2' },
      'amd-experimental': { id: 'amd-experimental', backend: 'rocm' }
    }[profileId] || null)),
    getCatalog: jest.fn(() => ({
      profiles: [{
        id: 'nvidia-standard',
        downloadSizeBytes: 2092156323,
        installedSizeBytes: 8368625292
      }, {
        id: 'amd-experimental',
        downloadSizeBytes: 1762815561,
        installedSizeBytes: 7051262244,
        experimental: true,
        backend: 'rocm'
      }],
      model: {
        id: 'sdxl_lightning_4step',
        fileName: 'sdxl_lightning_4step.safetensors',
        sizeBytes: 6938040682,
        license: 'OpenRAIL++'
      }
    })),
    getTrustedManifest: jest.fn(() => ({ ...TRUSTED_MANIFEST })),
    getProcessState: jest.fn(() => ({
      state: 'running',
      pid: 9191,
      port: 8188,
      baseUrl: 'http://127.0.0.1:8188',
      deviceSelectorArgs: ['--cuda-device', '0'],
      backendIndex: 0
    })),
    resolveRuntimeRoot: jest.fn(() => 'C:\\LTTH\\managed-runtime'),
    resolveInside: jest.fn((root, relativePath) => require('path').resolve(root, relativePath)),
    resolveExistingInside: jest.fn((root, relativePath) => require('path').resolve(root, relativePath)),
    install: jest.fn(async () => ({
      state: 'ready',
      runtimeRoot: 'C:\\LTTH\\managed-runtime',
      recommendation: { presetId: 'sdxl_lightning_4step', width: 768, height: 768, steps: 4 }
    })),
    createInstallJob: jest.fn(() => ({ jobId: 'runtime-job-1', state: 'queued' })),
    getInstallJob: jest.fn(jobId => ({ jobId, state: 'running' })),
    cancelInstallJob: jest.fn(jobId => ({ jobId, state: 'cancelled' })),
    startManagedRuntime: jest.fn(async () => ({ state: 'running', pid: 42 })),
    stopManagedRuntime: jest.fn(async () => ({ state: 'stopped', pid: null })),
    verifyManagedRuntime: jest.fn(async () => ({ state: 'passed', width: 256, height: 256 })),
    forceVerifyManagedRuntime: jest.fn(async () => ({
      state: 'passed',
      width: 256,
      height: 256,
      adapterId: 'gpu-1',
      profileId: 'nvidia-standard',
      runtimeVersion: '0.28.0'
    }))
  };
  const routes = new StreamMonstersRoutes({
    api: {
      registerRoute: (method, routePath, handler) => registered.push({ method, routePath, handler }),
      emit
    },
    pluginDir: 'C:\\LTTH\\plugins\\streamalchemy',
    store: {},
    engine: {},
    generationPool: {},
    artPool,
    systemAnalyzer: {
      analyze: jest.fn(async () => ({
        gpu: { id: 'gpu-1', name: 'NVIDIA GeForce RTX 4060', vendor: 'nvidia', vramMb: 8192 },
        adapters: [
          {
            id: 'gpu-1',
            name: 'NVIDIA GeForce RTX 4060',
            vendor: 'nvidia',
            vramMb: 8192,
            driver: '572.42',
            pnpDeviceId: 'PCI\\VEN_10DE&DEV_2882\\PRIVATE',
            pciBusId: '0000:01:00.0',
            locationPaths: ['PCIROOT(0)#PCI(0100)'],
            backendIndex: 0,
            backendIdentity: {
              uuid: 'GPU-PRIVATE-UUID',
              pciBusId: '0000:01:00.0'
            }
          },
          {
            id: 'gpu-2',
            name: 'AMD Radeon RX 7900 XTX',
            vendor: 'amd',
            vramMb: 24576,
            driver: '31.0.1'
          }
        ],
        disk: { targetRoot: 'C:\\LTTH', freeGb: 50 }
      }))
    },
    managedRuntime,
    localModelInstaller: { startInstall: jest.fn(() => null) },
    configProvider: {
      getConfig: jest.fn(() => config),
      updateConfig
    }
  });
  routes.register();
  const findRoute = (method, routePath) => registered.find(route => route.method === method && route.routePath === routePath);
  return { findRoute, managedRuntime, updateConfig, emit };
}

describe('Stream Monsters privileged routes', () => {
  test.each([
    ['POST', '/api/streammonsters/config'],
    ['POST', '/api/streammonsters/pool'],
    ['POST', '/api/streammonsters/pool/prepare'],
    ['POST', '/api/streammonsters/local-runtime/install']
  ])('rejects unauthenticated non-local %s %s requests', async (method, routePath) => {
    const { findRoute, managedRuntime, updateConfig } = createSubject();
    const response = createResponse();
    const request = {
      ip: '203.0.113.10',
      headers: {},
      body: { localRuntime: { manifest: { archiveUrl: 'https://attacker.example/payload.zip', sha256: 'c'.repeat(64) } } }
    };

    await findRoute(method, routePath).handler(request, response);

    expect(response.statusCode).toBe(403);
    expect(updateConfig).not.toHaveBeenCalled();
    expect(managedRuntime.install).not.toHaveBeenCalled();
  });

  test('does not allow an authenticated config request to mutate runtime trust data', async () => {
    const { findRoute, updateConfig } = createSubject();
    const response = createResponse();

    await findRoute('POST', '/api/streammonsters/config').handler({
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
      body: {
        enabled: false,
        creatorName: 'creator',
        localRuntime: {
          manifest: { archiveUrl: 'https://attacker.example/payload.zip', sha256: 'c'.repeat(64) }
        }
      }
    }, response);

    expect(updateConfig).toHaveBeenCalledWith({
      streamMonsters: { enabled: false, creatorName: 'creator' }
    });
  });

  test.each([null, []])('treats non-object config payload %p as an empty update', async (body) => {
    const { findRoute, updateConfig } = createSubject();
    const response = createResponse();

    await findRoute('POST', '/api/streammonsters/config').handler({
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
      body
    }, response);

    expect(response.statusCode).toBe(200);
    expect(updateConfig).toHaveBeenCalledWith({ streamMonsters: {} });
  });

  test('ignores stored trust data and accepts only adapter/profile/license identifiers for an async job', async () => {
    const attackerManifest = {
      ...TRUSTED_MANIFEST,
      archiveUrl: 'https://attacker.example/payload.zip',
      sha256: 'c'.repeat(64),
      modelSha256: 'd'.repeat(64)
    };
    const { findRoute, managedRuntime, updateConfig } = createSubject({ storedManifest: attackerManifest });
    const response = createResponse();

    await findRoute('POST', '/api/streammonsters/local-runtime/install').handler({
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
      body: {
        adapterId: 'gpu-1',
        profileId: 'nvidia-standard',
        acceptModelLicense: true
      }
    }, response);

    expect(response.statusCode).toBe(202);
    expect(response.json).toHaveBeenCalledWith({ jobId: 'runtime-job-1', state: 'queued' });
    expect(managedRuntime.createInstallJob).toHaveBeenCalledWith({
      adapterId: 'gpu-1',
      profileId: 'nvidia-standard',
      acceptModelLicense: true
    }, expect.arrayContaining([expect.objectContaining({ id: 'gpu-1' })]));
    expect(managedRuntime.install).not.toHaveBeenCalled();
    expect(updateConfig).not.toHaveBeenCalled();
    expect(JSON.stringify(managedRuntime.createInstallJob.mock.calls)).not.toContain('attacker.example');
  });

  test('extends status compatibly and exposes job plus managed-process admin routes', async () => {
    const { findRoute, managedRuntime } = createSubject();
    const statusResponse = createResponse();

    await findRoute('GET', '/api/streammonsters/local-runtime/status').handler({}, statusResponse);

    expect(statusResponse.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      runtime: expect.any(Object),
      recommendation: expect.any(Object),
      manifestAvailable: true,
      installDetails: expect.objectContaining({
        runtimeDownloadBytes: 2092156323,
        runtimeInstalledBytes: 8368625292,
        modelDownloadBytes: 6938040682
      }),
      adapters: expect.arrayContaining([expect.objectContaining({ id: 'gpu-1' })]),
      selectedAdapterId: 'gpu-1',
      profiles: expect.arrayContaining([expect.objectContaining({ id: 'nvidia-standard' })]),
      installation: expect.objectContaining({ verified: true }),
      model: expect.objectContaining({ license: 'OpenRAIL++', verified: true }),
      smokeTest: expect.objectContaining({ state: 'passed' }),
      disk: expect.objectContaining({ freeGb: 50 })
    }));

    const getResponse = createResponse();
    await findRoute('GET', '/api/streammonsters/local-runtime/install/:jobId').handler({
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
      params: { jobId: 'runtime-job-1' }
    }, getResponse);
    expect(managedRuntime.getInstallJob).toHaveBeenCalledWith('runtime-job-1');

    const deleteResponse = createResponse();
    await findRoute('DELETE', '/api/streammonsters/local-runtime/install/:jobId').handler({
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
      params: { jobId: 'runtime-job-1' }
    }, deleteResponse);
    expect(managedRuntime.cancelInstallJob).toHaveBeenCalledWith('runtime-job-1');

    for (const action of ['start', 'stop', 'verify']) {
      const response = createResponse();
      await findRoute('POST', `/api/streammonsters/local-runtime/${action}`).handler({
        ip: '127.0.0.1',
        socket: { remoteAddress: '127.0.0.1' },
        headers: {},
        body: {}
      }, response);
      expect(response.statusCode).toBe(200);
    }
    expect(managedRuntime.startManagedRuntime).toHaveBeenCalled();
    expect(managedRuntime.stopManagedRuntime).toHaveBeenCalled();
  });

  test('serializes public runtime status without paths, process data or adapter identities', async () => {
    const { findRoute } = createSubject();
    const response = createResponse();

    await findRoute('GET', '/api/streammonsters/local-runtime/status').handler({
      query: { adapterId: 'gpu-1' }
    }, response);

    const payload = response.json.mock.calls[0][0];
    expect(payload.runtime).toEqual({ state: 'running' });
    expect(payload.adapters[0]).toEqual({
      id: 'gpu-1',
      name: 'NVIDIA GeForce RTX 4060',
      vendor: 'nvidia',
      vramMb: 8192,
      vramGb: 8,
      driverVersion: '572.42',
      supportState: null
    });
    expect(payload.installation).toEqual({
      state: 'ready',
      verified: true,
      profileId: 'nvidia-standard',
      adapterId: 'gpu-1'
    });
    expect(payload.disk).toEqual(expect.objectContaining({ freeGb: 50 }));
    expect(payload.disk).not.toHaveProperty('targetRoot');
    expect(payload.installDetails).not.toHaveProperty('targetDir');
    expectSafeRuntimePayload(payload);
    expect(JSON.stringify(payload)).not.toMatch(/C:\\|VEN_10DE/);
  });

  test('sanitizes start, stop, verify and pool runtime broadcasts with stable public fields', async () => {
    const artPool = { prepare: jest.fn(async () => ({ jobs: [], coverage: [] })) };
    const { findRoute, managedRuntime, emit } = createSubject({ artPool });
    const internalRuntime = {
      state: 'running',
      pid: 9191,
      port: 8188,
      baseUrl: 'http://127.0.0.1:8188',
      runtimeRoot: 'C:\\private\\managed-runtime\\active',
      backendIndex: 0,
      runtimeDeviceIndex: 0,
      deviceSelectorArgs: ['--cuda-device', '0'],
      backendIdentity: { uuid: 'GPU-PRIVATE' }
    };
    managedRuntime.startManagedRuntime.mockResolvedValue(internalRuntime);
    managedRuntime.stopManagedRuntime.mockResolvedValue({ ...internalRuntime, state: 'stopped' });
    managedRuntime.forceVerifyManagedRuntime.mockResolvedValue({
      state: 'passed',
      width: 256,
      height: 256,
      adapterId: 'gpu-1',
      profileId: 'nvidia-standard',
      runtimeVersion: '0.28.0',
      baseUrl: internalRuntime.baseUrl,
      runtimeRoot: internalRuntime.runtimeRoot
    });

    for (const action of ['start', 'stop', 'verify']) {
      const response = createResponse();
      await findRoute('POST', `/api/streammonsters/local-runtime/${action}`).handler({
        ip: '127.0.0.1',
        socket: { remoteAddress: '127.0.0.1' },
        headers: {},
        body: { adapterId: 'gpu-1', profileId: 'nvidia-standard' }
      }, response);
      expect(response.statusCode).toBe(200);
      expectSafeRuntimePayload(response.json.mock.calls[0][0]);
    }
    await findRoute('POST', '/api/streammonsters/pool/prepare').handler({
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
      body: { targetPerVariant: 2 }
    }, createResponse());

    const runtimeBroadcasts = emit.mock.calls.filter(([event]) => event.startsWith('local_runtime_'));
    expect(runtimeBroadcasts.map(([event]) => event)).toEqual(expect.arrayContaining([
      'local_runtime_state',
      'local_runtime_progress'
    ]));
    expect(runtimeBroadcasts.length).toBeGreaterThanOrEqual(5);
    for (const [, payload] of runtimeBroadcasts) expectSafeRuntimePayload(payload);
    expect(runtimeBroadcasts).toEqual(expect.arrayContaining([
      ['local_runtime_progress', expect.objectContaining({ phase: 'verify', state: 'checking' })],
      ['local_runtime_progress', expect.objectContaining({
        phase: 'verify',
        state: 'passed',
        width: 256,
        height: 256
      })]
    ]));
  });

  test('sanitizes asynchronous install lifecycle broadcasts and replaces raw errors with errorCode', () => {
    const emit = jest.fn();
    const subject = {
      api: { emit },
      streamMonstersManagedRuntime: {
        installation: null,
        jobs: new Map()
      }
    };
    const internalState = {
      jobId: 'runtime-job-secret',
      state: 'failed',
      adapterId: 'gpu-1',
      profileId: 'nvidia-standard',
      pid: 9191,
      port: 8188,
      baseUrl: 'http://127.0.0.1:8188',
      runtimeRoot: 'C:\\private\\managed-runtime\\active',
      backendIdentity: { uuid: 'GPU-PRIVATE' },
      error: 'backend English prose C:\\private\\managed-runtime\\active',
      errorCode: 'STREAM_MONSTERS_RUNTIME_UNKNOWN',
      progress: {
        phase: 'failed',
        completedBytes: 12,
        totalBytes: 24,
        targetPath: 'C:\\private\\runtime.zip',
        baseUrl: 'http://127.0.0.1:8188'
      }
    };

    StreamAlchemyPlugin.prototype.handleManagedRuntimeState.call(subject, internalState);

    expect(emit).toHaveBeenCalledWith('local_runtime_progress', {
      jobId: 'runtime-job-secret',
      state: 'failed',
      phase: 'failed',
      adapterId: 'gpu-1',
      profileId: 'nvidia-standard',
      completedBytes: 12,
      totalBytes: 24,
      errorCode: 'STREAM_MONSTERS_RUNTIME_UNKNOWN'
    });
    expect(emit).toHaveBeenCalledWith('local_runtime_state', expect.objectContaining({
      jobId: 'runtime-job-secret',
      state: 'failed',
      adapterId: 'gpu-1',
      profileId: 'nvidia-standard',
      errorCode: 'STREAM_MONSTERS_RUNTIME_UNKNOWN'
    }));
    for (const [, payload] of emit.mock.calls) expectSafeRuntimePayload(payload);
  });

  test('recomputes the public recommendation for the adapter selected by the wizard', async () => {
    const { findRoute, managedRuntime } = createSubject();
    managedRuntime.recommend.mockImplementation(adapter => ({
      supported: true,
      profileId: adapter.id === 'gpu-2' ? 'amd-experimental' : 'nvidia-standard',
      experimental: adapter.id === 'gpu-2'
    }));
    const response = createResponse();

    await findRoute('GET', '/api/streammonsters/local-runtime/status').handler({
      query: { adapterId: 'gpu-2' }
    }, response);

    expect(managedRuntime.recommend).toHaveBeenCalledWith(expect.objectContaining({ id: 'gpu-2' }));
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      selectedAdapterId: 'gpu-2',
      recommendation: expect.objectContaining({
        profileId: 'amd-experimental',
        experimental: true
      }),
      installDetails: expect.objectContaining({
        runtimeDownloadBytes: 1762815561,
        runtimeInstalledBytes: 7051262244
      }),
      runtimeDetails: expect.objectContaining({
        profileId: 'amd-experimental',
        backend: 'rocm',
        adapterId: 'gpu-2',
        device: 'AMD Radeon RX 7900 XTX',
        driverVersion: '31.0.1',
        vramMb: 24576,
        verifiedOnDevice: false
      })
    }));
  });

  test('does not reuse installed profile values for an unsupported selected adapter', async () => {
    const { findRoute, managedRuntime } = createSubject();
    managedRuntime.recommend.mockReturnValue({
      supported: false,
      profileId: null,
      reasonCode: 'unsupported_adapter',
      mode: 'expert_or_remote'
    });
    const response = createResponse();

    await findRoute('GET', '/api/streammonsters/local-runtime/status').handler({
      query: { adapterId: 'gpu-2' }
    }, response);

    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      selectedAdapterId: 'gpu-2',
      recommendation: expect.objectContaining({ supported: false, reasonCode: 'unsupported_adapter' }),
      installDetails: null,
      runtimeDetails: expect.objectContaining({
        profileId: null,
        backend: null,
        adapterId: 'gpu-2',
        verifiedOnDevice: false
      })
    }));
  });

  test('defaults runtime status to the installed adapter and reports only matching smoke verification', async () => {
    const { findRoute, managedRuntime } = createSubject();
    managedRuntime.installation.adapterId = 'gpu-2';
    managedRuntime.installation.profileId = 'amd-experimental';
    managedRuntime.lastSmokeTest = {
      state: 'passed',
      width: 256,
      height: 256,
      adapterId: 'gpu-2',
      profileId: 'amd-experimental',
      runtimeVersion: null
    };
    managedRuntime.recommend.mockImplementation(adapter => ({
      supported: true,
      profileId: adapter.id === 'gpu-2' ? 'amd-experimental' : 'nvidia-standard'
    }));
    const response = createResponse();

    await findRoute('GET', '/api/streammonsters/local-runtime/status').handler({
      query: {}
    }, response);

    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      selectedAdapterId: 'gpu-2',
      runtimeDetails: expect.objectContaining({
        profileId: 'amd-experimental',
        backend: 'rocm',
        adapterId: 'gpu-2',
        device: 'AMD Radeon RX 7900 XTX',
        verifiedOnDevice: true
      })
    }));
  });

  test('rejects adapter A smoke evidence after switching the installed and selected adapter to B', async () => {
    const { findRoute, managedRuntime } = createSubject();
    managedRuntime.installation.adapterId = 'gpu-2';
    managedRuntime.installation.profileId = 'amd-experimental';
    managedRuntime.recommend.mockReturnValue({
      supported: true,
      profileId: 'amd-experimental'
    });
    const response = createResponse();

    await findRoute('GET', '/api/streammonsters/local-runtime/status').handler({
      query: { adapterId: 'gpu-2' }
    }, response);

    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      runtimeDetails: expect.objectContaining({
        adapterId: 'gpu-2',
        profileId: 'amd-experimental',
        verifiedOnDevice: false
      })
    }));
  });

  test('rejects smoke evidence from a previous profile on the same adapter', async () => {
    const { findRoute, managedRuntime } = createSubject();
    managedRuntime.installation.profileId = 'nvidia-cuda126-legacy';
    managedRuntime.recommend.mockReturnValue({
      supported: true,
      profileId: 'nvidia-cuda126-legacy'
    });
    const response = createResponse();

    await findRoute('GET', '/api/streammonsters/local-runtime/status').handler({
      query: { adapterId: 'gpu-1' }
    }, response);

    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      runtimeDetails: expect.objectContaining({
        adapterId: 'gpu-1',
        profileId: 'nvidia-cuda126-legacy',
        verifiedOnDevice: false
      })
    }));
  });

  test('verify binds returned smoke evidence to the installed adapter and profile', async () => {
    const { findRoute, managedRuntime } = createSubject();
    managedRuntime.lastSmokeTest = {
      state: 'passed',
      width: 256,
      height: 256,
      adapterId: 'gpu-1',
      profileId: 'nvidia-standard',
      runtimeVersion: '0.28.0',
      completedAt: '2020-01-01T00:00:00.000Z'
    };
    managedRuntime.forceVerifyManagedRuntime.mockResolvedValue({
      ...managedRuntime.lastSmokeTest,
      completedAt: '2026-07-23T12:00:00.000Z'
    });
    const response = createResponse();

    await findRoute('POST', '/api/streammonsters/local-runtime/verify').handler({
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
      body: { adapterId: 'gpu-1', profileId: 'nvidia-standard' }
    }, response);

    expect(response.json).toHaveBeenCalledWith({
      success: true,
      smokeTest: expect.objectContaining({
        adapterId: 'gpu-1',
        profileId: 'nvidia-standard',
        runtimeVersion: '0.28.0',
        completedAt: '2026-07-23T12:00:00.000Z'
      })
    });
    expect(managedRuntime.forceVerifyManagedRuntime).toHaveBeenCalledWith({
      adapter: expect.objectContaining({ id: 'gpu-1' }),
      profile: expect.objectContaining({ id: 'nvidia-standard' })
    });
    expect(managedRuntime.startManagedRuntime).not.toHaveBeenCalled();
  });

  test('does not verify a profile that differs from the installed runtime', async () => {
    const { findRoute, managedRuntime } = createSubject();
    const response = createResponse();

    await findRoute('POST', '/api/streammonsters/local-runtime/verify').handler({
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
      body: { adapterId: 'gpu-1', profileId: 'nvidia-cuda126-legacy' }
    }, response);

    expect(response.statusCode).toBe(409);
    expect(managedRuntime.verifyManagedRuntime).not.toHaveBeenCalled();
  });

  test('starts an installed managed runtime before pool preparation and emits progress/state events', async () => {
    const artPool = { prepare: jest.fn(async () => ({ jobs: [], coverage: [] })) };
    const { findRoute, managedRuntime, emit } = createSubject({ artPool });
    const response = createResponse();

    await findRoute('POST', '/api/streammonsters/pool/prepare').handler({
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
      body: { targetPerVariant: 2 }
    }, response);

    expect(managedRuntime.startManagedRuntime).toHaveBeenCalledWith(expect.objectContaining({
      adapter: expect.objectContaining({ id: 'gpu-1' })
    }));
    expect(artPool.prepare).toHaveBeenCalledWith({ targetPerVariant: 2 });
    expect(emit).toHaveBeenCalledWith('local_runtime_progress', expect.objectContaining({ phase: 'pool_prepare' }));
    expect(emit).toHaveBeenCalledWith('local_runtime_state', expect.objectContaining({ state: 'running' }));
    expect(emit).toHaveBeenCalledWith('art_pool_progress', expect.objectContaining({ state: 'complete' }));
  });

  test('sanitizes pool preparation failures before broadcasting them', async () => {
    const artPool = {
      prepare: jest.fn(async () => {
        throw new Error('backend failed at C:\\private\\pool\\secret.json');
      })
    };
    const { findRoute, emit } = createSubject({ artPool });
    const response = createResponse();

    await findRoute('POST', '/api/streammonsters/pool/prepare').handler({
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
      body: { targetPerVariant: 2 }
    }, response);

    const failure = emit.mock.calls.find(([event, payload]) => (
      event === 'art_pool_progress' && payload.state === 'failed'
    ));
    expect(failure).toEqual([
      'art_pool_progress',
      {
        state: 'failed',
        phase: 'pool_prepare',
        errorCode: 'STREAM_MONSTERS_RUNTIME_UNKNOWN'
      }
    ]);
    expectSafeRuntimePayload(failure[1]);
  });

  test('returns a conflict when cancellation reaches the non-cancellable commit phase', async () => {
    const { findRoute, managedRuntime } = createSubject();
    managedRuntime.cancelInstallJob.mockRejectedValueOnce(
      new Error('STREAM_MONSTERS_RUNTIME_INSTALL_COMMITTING')
    );
    const response = createResponse();

    await findRoute('DELETE', '/api/streammonsters/local-runtime/install/:jobId').handler({
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
      params: { jobId: 'runtime-job-1' }
    }, response);

    expect(response.statusCode).toBe(409);
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      error: 'STREAM_MONSTERS_RUNTIME_INSTALL_COMMITTING'
    });
  });
});
