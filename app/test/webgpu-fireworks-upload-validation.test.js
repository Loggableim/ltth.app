'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const FireworksPlugin = require('../plugins/webgpu-fireworks/main');
const { normalizeConfig } = require('../plugins/webgpu-fireworks/lib/config-schema');

const {
  UploadValidationError,
  validateUploadMetadata,
  validateUploadSignature,
  validateStoredUpload,
  readUploadHeader
} = require('../plugins/webgpu-fireworks/lib/upload-validation');

function createRouteHarness(uploadDir) {
  const routes = new Map();
  const api = {
    routes,
    registerRoute: jest.fn((method, route, handler) => routes.set(`${method}:${route}`, handler)),
    registerMiddleware: jest.fn(),
    getPluginDataDir: jest.fn(() => uploadDir),
    getConfig: jest.fn(() => null),
    setConfig: jest.fn(),
    getDatabase: jest.fn(() => null),
    emit: jest.fn(),
    log: jest.fn()
  };
  const plugin = new FireworksPlugin(api);
  plugin.config = normalizeConfig({ enabled: true });
  plugin.uploadDir = uploadDir;
  return { api, plugin };
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status: jest.fn(function setStatus(statusCode) {
      this.statusCode = statusCode;
      return this;
    }),
    json: jest.fn(function sendJson(body) {
      this.body = body;
      return this;
    })
  };
}

describe('WebGPU Fireworks upload validation', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'webgpu-fireworks-upload-'));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test.each([
    [{ originalname: 'sound.mp3evil', mimetype: 'audio/mpeg' }, 'UNSUPPORTED_UPLOAD_EXTENSION'],
    [{ originalname: 'sound.mp3', mimetype: 'image/png' }, 'UPLOAD_MIME_MISMATCH'],
    [{ originalname: 'image.png', mimetype: 'application/octet-stream' }, 'UPLOAD_MIME_MISMATCH'],
    [{ originalname: 'movie.exe', mimetype: 'video/mp4' }, 'UNSUPPORTED_UPLOAD_EXTENSION']
  ])('rejects invalid metadata %#', (file, code) => {
    expect(() => validateUploadMetadata(file)).toThrow(UploadValidationError);
    try {
      validateUploadMetadata(file);
    } catch (error) {
      expect(error).toMatchObject({ code, status: 415 });
    }
  });

  test.each([
    [{ originalname: 'sound.mp3', mimetype: 'audio/mpeg' }, 'mp3'],
    [{ originalname: 'sound.wav', mimetype: 'audio/wav' }, 'wav'],
    [{ originalname: 'sound.ogg', mimetype: 'audio/ogg' }, 'ogg'],
    [{ originalname: 'clip.webm', mimetype: 'video/webm' }, 'webm'],
    [{ originalname: 'clip.mp4', mimetype: 'video/mp4' }, 'mp4'],
    [{ originalname: 'loop.gif', mimetype: 'image/gif' }, 'gif'],
    [{ originalname: 'image.png', mimetype: 'image/png' }, 'png'],
    [{ originalname: 'photo.jpg', mimetype: 'image/jpeg' }, 'jpg'],
    [{ originalname: 'photo.jpeg', mimetype: 'image/jpeg' }, 'jpeg']
  ])('accepts exact extension and MIME pair %#', (file, extension) => {
    expect(validateUploadMetadata(file)).toMatchObject({ extension });
  });

  test.each([
    ['mp3', Buffer.from('49443304000000000000', 'hex')],
    ['mp3', Buffer.from('fffb906400000000', 'hex')],
    ['wav', Buffer.from('524946462400000057415645', 'hex')],
    ['ogg', Buffer.from('4f676753000200000000', 'hex')],
    ['webm', Buffer.from('1a45dfa39f428681', 'hex')],
    ['mp4', Buffer.from('000000186674797069736f6d', 'hex')],
    ['gif', Buffer.from('474946383961', 'hex')],
    ['png', Buffer.from('89504e470d0a1a0a', 'hex')],
    ['jpg', Buffer.from('ffd8ffe000104a464946', 'hex')]
  ])('accepts a valid %s signature', (extension, header) => {
    expect(validateUploadSignature(extension, header)).toBe(true);
  });

  test.each(['mp3', 'wav', 'ogg', 'webm', 'mp4', 'gif', 'png', 'jpg', 'jpeg'])(
    'rejects disguised bytes for %s',
    extension => {
      expect(() => validateUploadSignature(extension, Buffer.from('not media')))
        .toThrow(UploadValidationError);
    }
  );

  test('validates the stored file and rejects a MIME-correct PNG containing text', async () => {
    const filePath = path.join(tempDir, 'firework-invalid.png');
    fs.writeFileSync(filePath, Buffer.from('plain text payload'));

    await expect(validateStoredUpload({
      path: filePath,
      originalname: 'avatar.png',
      mimetype: 'image/png'
    })).rejects.toMatchObject({ code: 'UPLOAD_SIGNATURE_MISMATCH', status: 415 });
  });

  test('closes the stored file handle when reading the upload header fails', async () => {
    const readError = new Error('read failed');
    const close = jest.fn().mockResolvedValue();
    jest.spyOn(fs.promises, 'open').mockResolvedValue({
      read: jest.fn().mockRejectedValue(readError),
      close
    });

    await expect(readUploadHeader(path.join(tempDir, 'unreadable.png'))).rejects.toBe(readError);
    expect(close).toHaveBeenCalledTimes(1);
  });

  test('upload route deletes a signature-invalid stored file and returns 415', async () => {
    const { api, plugin } = createRouteHarness(tempDir);
    const filePath = path.join(tempDir, 'firework-disguised.png');
    fs.writeFileSync(filePath, Buffer.from('not a png'));
    plugin.upload = {
      single: jest.fn(() => (req, _res, callback) => {
        req.file = {
          path: filePath,
          filename: 'firework-disguised.png',
          originalname: 'picture.png',
          mimetype: 'image/png',
          size: 9
        };
        callback(null);
      })
    };
    plugin.registerRoutes();
    const response = createResponse();

    await api.routes.get('post:/api/webgpu-fireworks/upload')({ body: {} }, response);
    await new Promise(resolve => setImmediate(resolve));

    expect(response.statusCode).toBe(415);
    expect(response.body).toMatchObject({
      success: false,
      code: 'UPLOAD_SIGNATURE_MISMATCH'
    });
    expect(response.body).not.toHaveProperty('url');
    expect(fs.existsSync(filePath)).toBe(false);
  });

  test('upload route validates bytes before returning the accepted response shape', async () => {
    const { api, plugin } = createRouteHarness(tempDir);
    const filePath = path.join(tempDir, 'firework-valid.png');
    fs.writeFileSync(filePath, Buffer.from('89504e470d0a1a0a', 'hex'));
    plugin.upload = {
      single: jest.fn(() => (req, _res, callback) => {
        req.file = {
          path: filePath,
          filename: 'firework-valid.png',
          originalname: 'picture.png',
          mimetype: 'image/png',
          size: 8
        };
        callback(null);
      })
    };
    plugin.registerRoutes();
    const response = createResponse();

    await api.routes.get('post:/api/webgpu-fireworks/upload')({ body: {} }, response);
    await new Promise(resolve => setImmediate(resolve));

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      success: true,
      url: '/plugins/webgpu-fireworks/uploads/firework-valid.png',
      filename: 'firework-valid.png',
      size: 8
    });
    expect(fs.existsSync(filePath)).toBe(true);
  });

  test.each([
    [{ code: 'LIMIT_FILE_SIZE', message: 'File too large' }, 413, 'UPLOAD_TOO_LARGE'],
    [new UploadValidationError('UPLOAD_MIME_MISMATCH', 'MIME mismatch'), 415, 'UPLOAD_MIME_MISMATCH'],
    [new Error('disk unavailable'), 500, 'UPLOAD_FAILED']
  ])('maps upload error %# to HTTP %i', async (error, status, code) => {
    const { api, plugin } = createRouteHarness(tempDir);
    plugin.upload = { single: jest.fn(() => (_req, _res, callback) => callback(error)) };
    plugin.registerRoutes();
    const response = createResponse();

    await api.routes.get('post:/api/webgpu-fireworks/upload')({ body: {} }, response);

    expect(response.statusCode).toBe(status);
    expect(response.body).toMatchObject({ success: false, code });
    expect(response.body).not.toHaveProperty('url');
  });

  test('maps a missing uploaded file to a typed 400 response', async () => {
    const { api, plugin } = createRouteHarness(tempDir);
    plugin.upload = { single: jest.fn(() => (_req, _res, callback) => callback(null)) };
    plugin.registerRoutes();
    const response = createResponse();

    await api.routes.get('post:/api/webgpu-fireworks/upload')({ body: {} }, response);

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({
      success: false,
      code: 'UPLOAD_FILE_REQUIRED',
      error: 'No file uploaded'
    });
  });

  test('logs non-ENOENT cleanup errors without masking the validation response', async () => {
    const { api, plugin } = createRouteHarness(tempDir);
    const filePath = path.join(tempDir, 'firework-cleanup-failure.png');
    fs.writeFileSync(filePath, Buffer.from('not a png'));
    const cleanupError = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    const unlink = jest.spyOn(fs.promises, 'unlink').mockRejectedValueOnce(cleanupError);
    plugin.upload = {
      single: jest.fn(() => (req, _res, callback) => {
        req.file = {
          path: filePath,
          filename: 'firework-cleanup-failure.png',
          originalname: 'picture.png',
          mimetype: 'image/png',
          size: 9
        };
        callback(null);
      })
    };
    plugin.registerRoutes();
    const response = createResponse();

    await api.routes.get('post:/api/webgpu-fireworks/upload')({ body: {} }, response);
    await new Promise(resolve => setImmediate(resolve));

    expect(unlink).toHaveBeenCalledWith(filePath);
    expect(api.log).toHaveBeenCalledWith(expect.stringContaining('permission denied'), 'warn');
    expect(response.body).toMatchObject({
      success: false,
      code: 'UPLOAD_SIGNATURE_MISMATCH'
    });
  });
});
