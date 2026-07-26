'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { Readable } = require('stream');
const zlib = require('zlib');
const tar = require('tar-stream');

const {
  CLOUDFLARED_VERSION,
  CloudflaredBinaryManager
} = require('../modules/cloudflared-binary-manager');

const temporaryDirectories = [];

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function createToolsRoot() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-cloudflared-'));
  temporaryDirectories.push(directory);
  return directory;
}

function createHttpsGet(responses, requests = []) {
  return (url, callback) => {
    requests.push(String(url));
    const request = new EventEmitter();
    request.setTimeout = (_timeout, handler) => {
      request.timeoutHandler = handler;
      return request;
    };
    request.destroy = error => {
      if (error) {
        process.nextTick(() => request.emit('error', error));
      }
    };

    const next = responses.shift();
    process.nextTick(() => {
      if (next instanceof Error) {
        request.emit('error', next);
        return;
      }

      const response = Readable.from(next.body ? [next.body] : []);
      response.statusCode = next.statusCode || 200;
      response.headers = next.headers || {};
      callback(response);
    });
    return request;
  };
}

function manifestFor({ asset, body, archive = false }) {
  return {
    [`${process.platform}:${process.arch}`]: {
      asset,
      sha256: sha256(body),
      archive
    }
  };
}

async function createTarGzip(entries) {
  const pack = tar.pack();
  const chunks = [];
  const completed = new Promise((resolve, reject) => {
    pack.on('data', chunk => chunks.push(chunk));
    pack.on('error', reject);
    pack.on('end', () => resolve(zlib.gzipSync(Buffer.concat(chunks))));
  });

  for (const entry of entries) {
    await new Promise((resolve, reject) => {
      pack.entry(entry.header, entry.body || Buffer.alloc(0), error => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
  pack.finalize();
  return completed;
}

afterEach(() => {
  while (temporaryDirectories.length) {
    fs.rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
  }
});

describe('CloudflaredBinaryManager', () => {
  test.each([
    ['win32', 'NUL'],
    ['darwin', '/dev/null'],
    ['linux', '/dev/null']
  ])('uses the %s null device as the accountless Quick Tunnel config source', (
    platform,
    expected
  ) => {
    const manager = new CloudflaredBinaryManager({
      toolsRoot: createToolsRoot(),
      platform,
      arch: process.arch,
      logger: { info() {}, warn() {}, error() {} }
    });

    expect(manager.getQuickTunnelConfigPath()).toBe(expected);
  });

  test.each([
    ['win32', 'x64', 'cloudflared-windows-amd64.exe'],
    ['darwin', 'x64', 'cloudflared-darwin-amd64.tgz'],
    ['darwin', 'arm64', 'cloudflared-darwin-arm64.tgz'],
    ['linux', 'x64', 'cloudflared-linux-amd64'],
    ['linux', 'arm64', 'cloudflared-linux-arm64']
  ])('requests the pinned %s %s release asset', async (platform, arch, asset) => {
    const requests = [];
    const manager = new CloudflaredBinaryManager({
      toolsRoot: createToolsRoot(),
      platform,
      arch,
      httpsGet: createHttpsGet([{ body: Buffer.from('wrong') }], requests),
      logger: { info() {}, warn() {}, error() {} }
    });

    await expect(manager.ensureInstalled()).rejects.toMatchObject({
      code: 'CLOUDFLARED_CHECKSUM_MISMATCH'
    });
    expect(requests).toEqual([
      `https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/${asset}`
    ]);
  });

  test('rejects an unsupported platform and architecture before downloading', async () => {
    const requests = [];
    const manager = new CloudflaredBinaryManager({
      toolsRoot: createToolsRoot(),
      platform: 'freebsd',
      arch: 'riscv64',
      httpsGet: createHttpsGet([], requests),
      logger: { info() {}, warn() {}, error() {} }
    });

    await expect(manager.ensureInstalled()).rejects.toMatchObject({
      code: 'CLOUDFLARED_PLATFORM_UNSUPPORTED'
    });
    expect(requests).toHaveLength(0);
  });

  test('installs and reuses a verified direct binary', async () => {
    const body = Buffer.from('verified cloudflared executable');
    const requests = [];
    const manager = new CloudflaredBinaryManager({
      toolsRoot: createToolsRoot(),
      platform: process.platform,
      arch: process.arch,
      manifest: manifestFor({ asset: 'cloudflared-test', body }),
      httpsGet: createHttpsGet([{ body }], requests),
      logger: { info() {}, warn() {}, error() {} }
    });

    const firstPath = await manager.ensureInstalled();
    const secondPath = await manager.ensureInstalled();

    expect(fs.readFileSync(firstPath)).toEqual(body);
    expect(secondPath).toBe(firstPath);
    expect(requests).toHaveLength(1);
    expect(JSON.parse(fs.readFileSync(path.join(path.dirname(firstPath), 'install.json'), 'utf8')))
      .toMatchObject({
        version: CLOUDFLARED_VERSION,
        releaseAsset: 'cloudflared-test',
        releaseSha256: sha256(body),
        executableSha256: sha256(body)
      });
  });

  test('rejects a release checksum mismatch without leaving an executable', async () => {
    const expected = Buffer.from('expected');
    const manager = new CloudflaredBinaryManager({
      toolsRoot: createToolsRoot(),
      platform: process.platform,
      arch: process.arch,
      manifest: manifestFor({ asset: 'cloudflared-test', body: expected }),
      httpsGet: createHttpsGet([{ body: Buffer.from('tampered') }]),
      logger: { info() {}, warn() {}, error() {} }
    });

    await expect(manager.ensureInstalled()).rejects.toMatchObject({
      code: 'CLOUDFLARED_CHECKSUM_MISMATCH'
    });
    expect(fs.existsSync(manager.getExecutablePath())).toBe(false);
  });

  test('redownloads when the installed executable no longer matches metadata', async () => {
    const body = Buffer.from('verified executable');
    const manager = new CloudflaredBinaryManager({
      toolsRoot: createToolsRoot(),
      platform: process.platform,
      arch: process.arch,
      manifest: manifestFor({ asset: 'cloudflared-test', body }),
      httpsGet: createHttpsGet([{ body }, { body }]),
      logger: { info() {}, warn() {}, error() {} }
    });

    const executablePath = await manager.ensureInstalled();
    fs.writeFileSync(executablePath, 'tampered');
    await manager.ensureInstalled();

    expect(fs.readFileSync(executablePath)).toEqual(body);
  });

  test('rejects a response that exceeds the configured download cap', async () => {
    const body = Buffer.from('too large');
    const manager = new CloudflaredBinaryManager({
      toolsRoot: createToolsRoot(),
      platform: process.platform,
      arch: process.arch,
      manifest: manifestFor({ asset: 'cloudflared-test', body }),
      maxDownloadBytes: 3,
      httpsGet: createHttpsGet([{ body }]),
      logger: { info() {}, warn() {}, error() {} }
    });

    await expect(manager.ensureInstalled()).rejects.toMatchObject({
      code: 'CLOUDFLARED_DOWNLOAD_TOO_LARGE'
    });
    expect(fs.existsSync(manager.getExecutablePath())).toBe(false);
  });

  test('coalesces concurrent installation calls into one download', async () => {
    const body = Buffer.from('shared download');
    const requests = [];
    const manager = new CloudflaredBinaryManager({
      toolsRoot: createToolsRoot(),
      platform: process.platform,
      arch: process.arch,
      manifest: manifestFor({ asset: 'cloudflared-test', body }),
      httpsGet: createHttpsGet([{ body }], requests),
      logger: { info() {}, warn() {}, error() {} }
    });

    const [first, second] = await Promise.all([
      manager.ensureInstalled(),
      manager.ensureInstalled()
    ]);

    expect(second).toBe(first);
    expect(requests).toHaveLength(1);
  });

  test('follows a bounded HTTPS redirect to an allowed release host', async () => {
    const body = Buffer.from('redirected download');
    const requests = [];
    const manager = new CloudflaredBinaryManager({
      toolsRoot: createToolsRoot(),
      platform: process.platform,
      arch: process.arch,
      manifest: manifestFor({ asset: 'cloudflared-test', body }),
      httpsGet: createHttpsGet([
        {
          statusCode: 302,
          headers: {
            location: 'https://release-assets.githubusercontent.com/cloudflared-test'
          }
        },
        { body }
      ], requests),
      logger: { info() {}, warn() {}, error() {} }
    });

    await manager.ensureInstalled();

    expect(requests).toEqual([
      `https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-test`,
      'https://release-assets.githubusercontent.com/cloudflared-test'
    ]);
  });

  test('rejects a redirect to an untrusted host', async () => {
    const body = Buffer.from('redirected download');
    const manager = new CloudflaredBinaryManager({
      toolsRoot: createToolsRoot(),
      platform: process.platform,
      arch: process.arch,
      manifest: manifestFor({ asset: 'cloudflared-test', body }),
      httpsGet: createHttpsGet([{
        statusCode: 302,
        headers: { location: 'https://example.com/cloudflared' }
      }]),
      logger: { info() {}, warn() {}, error() {} }
    });

    await expect(manager.ensureInstalled()).rejects.toMatchObject({
      code: 'CLOUDFLARED_DOWNLOAD_HOST_REJECTED'
    });
    expect(fs.existsSync(manager.getExecutablePath())).toBe(false);
  });

  test('aborts a stalled request with a stable timeout error', async () => {
    const body = Buffer.from('never returned');
    const httpsGet = () => {
      const request = new EventEmitter();
      request.setTimeout = (_milliseconds, handler) => {
        process.nextTick(handler);
        return request;
      };
      request.destroy = error => {
        process.nextTick(() => request.emit('error', error));
      };
      return request;
    };
    const manager = new CloudflaredBinaryManager({
      toolsRoot: createToolsRoot(),
      platform: process.platform,
      arch: process.arch,
      manifest: manifestFor({ asset: 'cloudflared-test', body }),
      httpsGet,
      downloadTimeoutMs: 1,
      logger: { info() {}, warn() {}, error() {} }
    });

    await expect(manager.ensureInstalled()).rejects.toMatchObject({
      code: 'CLOUDFLARED_DOWNLOAD_TIMEOUT'
    });
    expect(fs.existsSync(manager.getExecutablePath())).toBe(false);
  });

  test('extracts one verified macOS executable and records its derived digest', async () => {
    const executable = Buffer.from('darwin executable');
    const archive = await createTarGzip([
      { header: { name: 'cloudflared', type: 'file', mode: 0o755 }, body: executable }
    ]);
    const manager = new CloudflaredBinaryManager({
      toolsRoot: createToolsRoot(),
      platform: 'darwin',
      arch: 'arm64',
      manifest: {
        'darwin:arm64': {
          asset: 'cloudflared-test.tgz',
          sha256: sha256(archive),
          archive: true
        }
      },
      httpsGet: createHttpsGet([{ body: archive }]),
      logger: { info() {}, warn() {}, error() {} }
    });

    const executablePath = await manager.ensureInstalled();
    const metadata = JSON.parse(
      fs.readFileSync(path.join(path.dirname(executablePath), 'install.json'), 'utf8')
    );

    expect(fs.readFileSync(executablePath)).toEqual(executable);
    expect(metadata.executableSha256).toBe(sha256(executable));
  });

  test('rejects traversal and link entries in a macOS archive', async () => {
    const archive = await createTarGzip([
      { header: { name: '../cloudflared', type: 'file' }, body: Buffer.from('unsafe') }
    ]);
    const manager = new CloudflaredBinaryManager({
      toolsRoot: createToolsRoot(),
      platform: 'darwin',
      arch: 'x64',
      manifest: {
        'darwin:x64': {
          asset: 'cloudflared-test.tgz',
          sha256: sha256(archive),
          archive: true
        }
      },
      httpsGet: createHttpsGet([{ body: archive }]),
      logger: { info() {}, warn() {}, error() {} }
    });

    await expect(manager.ensureInstalled()).rejects.toMatchObject({
      code: 'CLOUDFLARED_ARCHIVE_UNSAFE'
    });
    expect(fs.existsSync(manager.getExecutablePath())).toBe(false);
  });
});
