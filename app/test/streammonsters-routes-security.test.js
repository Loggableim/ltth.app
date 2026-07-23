const StreamMonstersRoutes = require('../plugins/streamalchemy/backend/streammonsters/routes');

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
      model: { verified: true }
    },
    lastSmokeTest: { state: 'passed', width: 256, height: 256 },
    recommend: jest.fn(() => ({
      supported: true,
      profileId: 'nvidia-standard',
      presetId: 'sdxl_lightning_4step',
      width: 768,
      height: 768,
      steps: 4
    })),
    getPublicProfiles: jest.fn(() => [{ id: 'nvidia-standard', label: 'NVIDIA RTX 20+', backend: 'cuda' }]),
    getCatalog: jest.fn(() => ({
      profiles: [{
        id: 'nvidia-standard',
        downloadSizeBytes: 2092156323
      }],
      model: {
        id: 'sdxl_lightning_4step',
        fileName: 'sdxl_lightning_4step.safetensors',
        sizeBytes: 6938040682,
        license: 'OpenRAIL++'
      }
    })),
    getTrustedManifest: jest.fn(() => ({ ...TRUSTED_MANIFEST })),
    getProcessState: jest.fn(() => ({ state: 'stopped', pid: null })),
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
    verifyManagedRuntime: jest.fn(async () => ({ state: 'passed', width: 256, height: 256 }))
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
        adapters: [{ id: 'gpu-1', name: 'NVIDIA GeForce RTX 4060', vendor: 'nvidia', vramMb: 8192 }],
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
    expect(managedRuntime.verifyManagedRuntime).toHaveBeenCalled();
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
});
