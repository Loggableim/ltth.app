const fs = require('fs');
const os = require('os');
const path = require('path');
const { Readable } = require('stream');

const LocalModelInstaller = require('../plugins/streamalchemy/backend/local-model-installer');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'streamalchemy-model-installer-'));
}

function createLogger() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  };
}

function createResponse(body, headers = {}) {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );

  return {
    ok: true,
    status: 200,
    headers: {
      get: key => normalizedHeaders[String(key).toLowerCase()] || null
    },
    body: Readable.from([Buffer.from(body)])
  };
}

describe('LocalModelInstaller', () => {
  test('reports missing local model with install metadata', async () => {
    const dataDir = createTempDir();
    const installer = new LocalModelInstaller({
      dataDir,
      env: {},
      logger: createLogger()
    });

    const status = await installer.getStatus({
      model: 'black-forest-labs/FLUX.1-schnell',
      modelFile: 'flux1-schnell.safetensors',
      modelDownloadUrl: 'https://example.com/flux1-schnell.safetensors'
    });

    expect(status).toEqual(expect.objectContaining({
      state: 'missing',
      model: 'black-forest-labs/FLUX.1-schnell',
      fileName: 'flux1-schnell.safetensors',
      canInstall: true
    }));
    expect(status.targetPath).toBe(path.join(dataDir, 'local-models', 'flux1-schnell.safetensors'));
  });

  test('downloads model to the plugin data directory and reports installed status', async () => {
    const dataDir = createTempDir();
    const fetchImpl = jest.fn().mockResolvedValue(createResponse('model-bytes', {
      'content-length': '11'
    }));
    const installer = new LocalModelInstaller({
      dataDir,
      fetchImpl,
      env: {},
      logger: createLogger()
    });
    const config = {
      model: 'black-forest-labs/FLUX.1-schnell',
      modelFile: 'flux1-schnell.safetensors',
      modelDownloadUrl: 'https://example.com/flux1-schnell.safetensors'
    };

    const started = installer.startInstall(config);
    expect(started).toEqual(expect.objectContaining({
      state: 'installing',
      model: 'black-forest-labs/FLUX.1-schnell'
    }));

    await installer.waitForCurrentInstall();

    const status = await installer.getStatus(config);
    expect(status).toEqual(expect.objectContaining({
      state: 'installed',
      sizeBytes: 11,
      canInstall: true
    }));
    expect(fs.readFileSync(status.targetPath, 'utf8')).toBe('model-bytes');
    expect(fetchImpl).toHaveBeenCalledWith('https://example.com/flux1-schnell.safetensors');
  });

  test('rejects non-http model download URLs before writing files', () => {
    const dataDir = createTempDir();
    const installer = new LocalModelInstaller({
      dataDir,
      fetchImpl: jest.fn(),
      env: {},
      logger: createLogger()
    });

    expect(() => installer.startInstall({
      model: 'bad-model',
      modelFile: 'bad.safetensors',
      modelDownloadUrl: 'file:///C:/secret/model.safetensors'
    })).toThrow('MODEL_DOWNLOAD_URL_INVALID');

    expect(fs.existsSync(path.join(dataDir, 'local-models', 'bad.safetensors'))).toBe(false);
  });

  test('keeps failed background install visible in status for the UI', async () => {
    const dataDir = createTempDir();
    const installer = new LocalModelInstaller({
      dataDir,
      fetchImpl: jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: { get: jest.fn() },
        body: null
      }),
      env: {},
      logger: createLogger()
    });
    const config = {
      model: 'black-forest-labs/FLUX.1-schnell',
      modelFile: 'flux1-schnell.safetensors',
      modelDownloadUrl: 'https://example.com/flux1-schnell.safetensors'
    };

    installer.startInstall(config);
    await installer.waitForCurrentInstall();

    await expect(installer.getStatus(config)).resolves.toEqual(expect.objectContaining({
      state: 'failed',
      error: 'MODEL_DOWNLOAD_HTTP_401',
      canInstall: true
    }));
  });

  test('sends Hugging Face bearer token for gated model downloads', async () => {
    const dataDir = createTempDir();
    const fetchImpl = jest.fn().mockResolvedValue(createResponse('token-model'));
    const installer = new LocalModelInstaller({
      dataDir,
      fetchImpl,
      env: { HF_TOKEN: 'hf_test_token' },
      logger: createLogger()
    });
    const config = {
      model: 'black-forest-labs/FLUX.1-schnell',
      modelFile: 'flux1-schnell.safetensors',
      modelDownloadUrl: 'https://huggingface.co/black-forest-labs/FLUX.1-schnell/resolve/main/flux1-schnell.safetensors'
    };

    installer.startInstall(config);
    await installer.waitForCurrentInstall();

    expect(fetchImpl).toHaveBeenCalledWith(config.modelDownloadUrl, {
      headers: {
        Authorization: 'Bearer hf_test_token'
      }
    });
  });
});
