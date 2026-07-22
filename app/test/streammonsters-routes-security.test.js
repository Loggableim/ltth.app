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

function createSubject({ storedManifest = null } = {}) {
  const registered = [];
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
    recommend: jest.fn(() => ({ supported: true, presetId: 'sdxl_lightning_4step', width: 768, height: 768, steps: 4 })),
    getTrustedManifest: jest.fn(() => ({ ...TRUSTED_MANIFEST })),
    resolveRuntimeRoot: jest.fn(() => 'C:\\LTTH\\managed-runtime'),
    resolveInside: jest.fn((root, relativePath) => require('path').resolve(root, relativePath)),
    resolveExistingInside: jest.fn((root, relativePath) => require('path').resolve(root, relativePath)),
    install: jest.fn(async () => ({
      state: 'ready',
      runtimeRoot: 'C:\\LTTH\\managed-runtime',
      recommendation: { presetId: 'sdxl_lightning_4step', width: 768, height: 768, steps: 4 }
    }))
  };
  const routes = new StreamMonstersRoutes({
    api: {
      registerRoute: (method, routePath, handler) => registered.push({ method, routePath, handler }),
      emit: jest.fn()
    },
    pluginDir: 'C:\\LTTH\\plugins\\streamalchemy',
    store: {},
    engine: {},
    generationPool: {},
    systemAnalyzer: { analyze: jest.fn(async () => ({ gpu: { vendor: 'nvidia', vramMb: 8192 } })) },
    managedRuntime,
    localModelInstaller: { startInstall: jest.fn(() => null) },
    configProvider: {
      getConfig: jest.fn(() => config),
      updateConfig
    }
  });
  routes.register();
  const findRoute = (method, routePath) => registered.find(route => route.method === method && route.routePath === routePath);
  return { findRoute, managedRuntime, updateConfig };
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

  test('ignores a previously stored attacker manifest and installs only the server-pinned manifest', async () => {
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
      body: {}
    }, response);

    expect(managedRuntime.install).toHaveBeenCalledWith({ vendor: 'nvidia', vramMb: 8192 });
    expect(updateConfig).toHaveBeenCalledWith(expect.objectContaining({
      localGeneration: expect.objectContaining({
        modelChecksumSha256: TRUSTED_MANIFEST.modelSha256,
        comfyUrl: TRUSTED_MANIFEST.healthBaseUrl
      })
    }));
    expect(JSON.stringify(updateConfig.mock.calls)).not.toContain('attacker.example');
  });
});
