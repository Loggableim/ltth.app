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
    ['sound.mp3', 'audio/mpeg', 'mp3'],
    ['sound.mp3', 'audio/mp3', 'mp3'],
    ['sound.wav', 'audio/wav', 'wav'],
    ['sound.wav', 'audio/x-wav', 'wav'],
    ['sound.wav', 'audio/wave', 'wav'],
    ['sound.ogg', 'audio/ogg', 'ogg'],
    ['sound.ogg', 'video/ogg', 'ogg'],
    ['sound.ogg', 'application/ogg', 'ogg'],
    ['clip.webm', 'audio/webm', 'webm'],
    ['clip.webm', 'video/webm', 'webm'],
    ['clip.mp4', 'audio/mp4', 'mp4'],
    ['clip.mp4', 'video/mp4', 'mp4'],
    ['loop.gif', 'image/gif', 'gif'],
    ['image.png', 'image/png', 'png'],
    ['photo.jpg', 'image/jpeg', 'jpg'],
    ['photo.jpeg', 'image/jpeg', 'jpeg']
  ])('accepts exact %s and %s metadata', (originalname, mimetype, extension) => {
    expect(validateUploadMetadata({ originalname, mimetype })).toEqual({ extension, mimetype });
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

  test('accepts a valid GIF87a signature', () => {
    expect(validateUploadSignature('gif', Buffer.from('474946383761', 'hex'))).toBe(true);
  });

  test('accepts a valid jpeg signature', () => {
    expect(validateUploadSignature('jpeg', Buffer.from('ffd8ffe1001045786966', 'hex'))).toBe(true);
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

  test('reads at most 64 header bytes and closes the stored file handle on success', async () => {
    const filePath = path.join(tempDir, 'large-header.bin');
    const source = Buffer.alloc(80, 0xab);
    const read = jest.fn(async (buffer, offset, length) => {
      source.copy(buffer, offset, 0, length);
      return { bytesRead: length, buffer };
    });
    const close = jest.fn().mockResolvedValue();
    const open = jest.spyOn(fs.promises, 'open').mockResolvedValue({ read, close });

    const header = await readUploadHeader(filePath, 128);

    expect(open).toHaveBeenCalledWith(filePath, 'r');
    expect(read).toHaveBeenCalledWith(expect.any(Buffer), 0, 64, 0);
    expect(header).toEqual(source.subarray(0, 64));
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

    expect(response.statusCode).toBe(415);
    expect(response.body).toEqual({
      success: false,
      code: 'UPLOAD_SIGNATURE_MISMATCH',
      error: expect.any(String)
    });
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

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      success: true,
      url: '/plugins/webgpu-fireworks/uploads/firework-valid.png',
      filename: 'firework-valid.png',
      size: 8
    });
    expect(fs.existsSync(filePath)).toBe(true);
  });

  test('awaits a delayed Multer callback before resolving the route handler', async () => {
    const { api, plugin } = createRouteHarness(tempDir);
    const filePath = path.join(tempDir, 'firework-delayed.png');
    fs.writeFileSync(filePath, Buffer.from('89504e470d0a1a0a', 'hex'));
    let releaseUpload;
    plugin.upload = {
      single: jest.fn(() => (req, _res, callback) => {
        releaseUpload = () => {
          req.file = {
            path: filePath,
            filename: 'firework-delayed.png',
            originalname: 'picture.png',
            mimetype: 'image/png',
            size: 8
          };
          callback(null);
        };
      })
    };
    plugin.registerRoutes();
    const response = createResponse();

    const routePromise = api.routes.get('post:/api/webgpu-fireworks/upload')({ body: {} }, response);
    let routeSettled = false;
    const observedRoutePromise = routePromise.then(result => {
      routeSettled = true;
      return result;
    });
    await Promise.resolve();

    expect(routeSettled).toBe(false);
    expect(response.json).not.toHaveBeenCalled();

    releaseUpload();
    await observedRoutePromise;

    expect(routeSettled).toBe(true);
    expect(response.body).toEqual({
      success: true,
      url: '/plugins/webgpu-fireworks/uploads/firework-delayed.png',
      filename: 'firework-delayed.png',
      size: 8
    });
    expect(response.json).toHaveBeenCalledTimes(1);
  });

  test('maps a synchronous Multer middleware throw once to UPLOAD_FAILED', async () => {
    const { api, plugin } = createRouteHarness(tempDir);
    plugin.upload = {
      single: jest.fn(() => () => {
        throw new Error('middleware exploded');
      })
    };
    plugin.registerRoutes();
    const response = createResponse();

    await api.routes.get('post:/api/webgpu-fireworks/upload')({ body: {} }, response);

    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({
      success: false,
      code: 'UPLOAD_FAILED',
      error: 'middleware exploded'
    });
    expect(response.status).toHaveBeenCalledTimes(1);
    expect(response.json).toHaveBeenCalledTimes(1);
  });

  test('ignores a duplicate Multer callback and sends exactly one response', async () => {
    const { api, plugin } = createRouteHarness(tempDir);
    plugin.upload = {
      single: jest.fn(() => (_req, _res, callback) => {
        callback(new UploadValidationError('UPLOAD_MIME_MISMATCH', 'first mismatch'));
        callback(new Error('duplicate callback'));
      })
    };
    plugin.registerRoutes();
    const response = createResponse();

    await api.routes.get('post:/api/webgpu-fireworks/upload')({ body: {} }, response);

    expect(response.statusCode).toBe(415);
    expect(response.body).toEqual({
      success: false,
      code: 'UPLOAD_MIME_MISMATCH',
      error: 'first mismatch'
    });
    expect(response.status).toHaveBeenCalledTimes(1);
    expect(response.json).toHaveBeenCalledTimes(1);
  });

  test.each([
    {
      label: 'file-size limit',
      error: { code: 'LIMIT_FILE_SIZE', message: 'File too large' },
      status: 413,
      code: 'UPLOAD_TOO_LARGE',
      message: 'File too large'
    },
    {
      label: 'typed MIME mismatch',
      error: new UploadValidationError('UPLOAD_MIME_MISMATCH', 'MIME mismatch'),
      status: 415,
      code: 'UPLOAD_MIME_MISMATCH',
      message: 'MIME mismatch'
    },
    {
      label: 'unexpected storage error',
      error: new Error('disk unavailable'),
      status: 500,
      code: 'UPLOAD_FAILED',
      message: 'disk unavailable'
    }
  ])('maps $label to HTTP $status with an exact failure body', async ({ error, status, code, message }) => {
    const { api, plugin } = createRouteHarness(tempDir);
    plugin.upload = { single: jest.fn(() => (_req, _res, callback) => callback(error)) };
    plugin.registerRoutes();
    const response = createResponse();

    await api.routes.get('post:/api/webgpu-fireworks/upload')({ body: {} }, response);

    expect(response.statusCode).toBe(status);
    expect(response.body).toEqual({ success: false, code, error: message });
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

    expect(unlink).toHaveBeenCalledWith(filePath);
    expect(api.log).toHaveBeenCalledWith(expect.stringContaining('permission denied'), 'warn');
    expect(response.body).toEqual({
      success: false,
      code: 'UPLOAD_SIGNATURE_MISMATCH',
      error: expect.any(String)
    });
  });

  test('silently ignores ENOENT cleanup and preserves the validation response', async () => {
    const { api, plugin } = createRouteHarness(tempDir);
    const filePath = path.join(tempDir, 'firework-already-removed.png');
    fs.writeFileSync(filePath, Buffer.from('not a png'));
    const cleanupError = Object.assign(new Error('already removed'), { code: 'ENOENT' });
    const unlink = jest.spyOn(fs.promises, 'unlink').mockRejectedValueOnce(cleanupError);
    plugin.upload = {
      single: jest.fn(() => (req, _res, callback) => {
        req.file = {
          path: filePath,
          filename: 'firework-already-removed.png',
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

    expect(unlink).toHaveBeenCalledWith(filePath);
    expect(api.log).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(415);
    expect(response.body).toEqual({
      success: false,
      code: 'UPLOAD_SIGNATURE_MISMATCH',
      error: expect.any(String)
    });
    expect(response.json).toHaveBeenCalledTimes(1);
  });
});
