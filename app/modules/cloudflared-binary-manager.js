'use strict';

const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const path = require('path');
const zlib = require('zlib');
const tar = require('tar-stream');

const CLOUDFLARED_VERSION = '2026.7.2';
const DOWNLOAD_TIMEOUT_MS = 120_000;
const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const RELEASE_BASE_URL =
  `https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}`;

const CLOUDFLARED_MANIFEST = Object.freeze({
  'win32:x64': Object.freeze({
    asset: 'cloudflared-windows-amd64.exe',
    sha256: 'cdb5d4432f6ae1595654a692a51308b69d2bf7af961f5578d9391837cf072df9',
    archive: false
  }),
  'darwin:x64': Object.freeze({
    asset: 'cloudflared-darwin-amd64.tgz',
    sha256: '4ee0d3b48a990a2f9b5faec5838f73ec1f400aa8e0a4864be576adfafec406cb',
    archive: true
  }),
  'darwin:arm64': Object.freeze({
    asset: 'cloudflared-darwin-arm64.tgz',
    sha256: '2086e51c61d6565781d84117a5007d0c826d03ffdc74acb91c08c167f9f8cd7c',
    archive: true
  }),
  'linux:x64': Object.freeze({
    asset: 'cloudflared-linux-amd64',
    sha256: 'ec905ea7b7e327ff8abdde8cb64697a2152de74dbcdbf6aec9db8364eb3886cd',
    archive: false
  }),
  'linux:arm64': Object.freeze({
    asset: 'cloudflared-linux-arm64',
    sha256: '405df476437e027fc6d18729a5a77155c0a33a6082aeee60a799a688f3052e66',
    archive: false
  })
});

const ALLOWED_DOWNLOAD_HOSTS = new Set([
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com'
]);

class CloudflaredInstallError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = 'CloudflaredInstallError';
    this.code = code;
  }
}

function createError(code, message, cause) {
  return new CloudflaredInstallError(code, message, cause ? { cause } : {});
}

async function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const input = fs.createReadStream(filePath);
    input.on('data', chunk => hash.update(chunk));
    input.on('error', reject);
    input.on('end', () => resolve(hash.digest('hex')));
  });
}

function safeRemove(filePath) {
  try {
    fs.rmSync(filePath, { force: true });
  } catch (_) {
    // Best-effort cleanup of a task-owned temporary file.
  }
}

class CloudflaredBinaryManager {
  constructor({
    toolsRoot,
    platform = process.platform,
    arch = process.arch,
    httpsGet = https.get,
    logger = console,
    manifest = CLOUDFLARED_MANIFEST,
    downloadTimeoutMs = DOWNLOAD_TIMEOUT_MS,
    maxDownloadBytes = MAX_DOWNLOAD_BYTES
  }) {
    if (!toolsRoot || typeof toolsRoot !== 'string') {
      throw new TypeError('toolsRoot is required');
    }

    this.toolsRoot = path.resolve(toolsRoot);
    this.platform = platform;
    this.arch = arch;
    this.httpsGet = httpsGet;
    this.logger = logger;
    this.manifest = manifest;
    this.downloadTimeoutMs = downloadTimeoutMs;
    this.maxDownloadBytes = maxDownloadBytes;
    this.installing = null;
  }

  getInstallDir() {
    return path.join(
      this.toolsRoot,
      'cloudflared',
      CLOUDFLARED_VERSION
    );
  }

  getExecutablePath() {
    return path.join(
      this.getInstallDir(),
      this.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared'
    );
  }

  getQuickTunnelConfigPath() {
    return this.platform === 'win32' ? 'NUL' : '/dev/null';
  }

  async ensureInstalled() {
    if (this.installing) {
      return this.installing;
    }

    this.installing = this._ensureInstalled()
      .finally(() => {
        this.installing = null;
      });
    return this.installing;
  }

  _getRelease() {
    const key = `${this.platform}:${this.arch}`;
    const release = this.manifest[key];
    if (!release) {
      throw createError(
        'CLOUDFLARED_PLATFORM_UNSUPPORTED',
        `cloudflared is not available for ${this.platform}/${this.arch}`
      );
    }
    return release;
  }

  async _ensureInstalled() {
    const release = this._getRelease();
    const installDir = this.getInstallDir();
    const executablePath = this.getExecutablePath();
    const metadataPath = path.join(installDir, 'install.json');

    fs.mkdirSync(installDir, { recursive: true });

    if (await this._isInstalledReleaseValid(release, executablePath, metadataPath)) {
      return executablePath;
    }

    const nonce = `${process.pid}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    const downloadPath = path.join(installDir, `download-${nonce}.partial`);
    const executablePartialPath = path.join(installDir, `cloudflared-${nonce}.partial`);
    const metadataPartialPath = path.join(installDir, `install-${nonce}.partial`);

    try {
      const downloadSha256 = await this._downloadToFile(
        `${RELEASE_BASE_URL}/${release.asset}`,
        downloadPath
      );
      if (downloadSha256 !== release.sha256) {
        throw createError(
          'CLOUDFLARED_CHECKSUM_MISMATCH',
          'Downloaded cloudflared release did not match the pinned SHA-256'
        );
      }

      let executableSha256;
      if (release.archive) {
        executableSha256 = await this._extractArchive(
          downloadPath,
          executablePartialPath
        );
      } else {
        fs.renameSync(downloadPath, executablePartialPath);
        executableSha256 = downloadSha256;
      }

      if (this.platform !== 'win32') {
        fs.chmodSync(executablePartialPath, 0o755);
      }

      const metadata = {
        version: CLOUDFLARED_VERSION,
        releaseAsset: release.asset,
        releaseSha256: release.sha256,
        executableSha256
      };
      fs.writeFileSync(
        metadataPartialPath,
        `${JSON.stringify(metadata, null, 2)}\n`,
        { encoding: 'utf8', flag: 'wx' }
      );

      this._replaceFile(executablePartialPath, executablePath);
      this._replaceFile(metadataPartialPath, metadataPath);
      this.logger.info?.(`cloudflared ${CLOUDFLARED_VERSION} installed`);
      return executablePath;
    } finally {
      safeRemove(downloadPath);
      safeRemove(executablePartialPath);
      safeRemove(metadataPartialPath);
    }
  }

  async _isInstalledReleaseValid(release, executablePath, metadataPath) {
    if (!fs.existsSync(executablePath) || !fs.existsSync(metadataPath)) {
      return false;
    }

    try {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      if (
        metadata.version !== CLOUDFLARED_VERSION ||
        metadata.releaseAsset !== release.asset ||
        metadata.releaseSha256 !== release.sha256 ||
        typeof metadata.executableSha256 !== 'string'
      ) {
        return false;
      }

      const executableSha256 = await hashFile(executablePath);
      if (executableSha256 !== metadata.executableSha256) {
        return false;
      }
      if (!release.archive && executableSha256 !== release.sha256) {
        return false;
      }
      return true;
    } catch (error) {
      this.logger.warn?.(`Ignoring invalid cloudflared install metadata: ${error.message}`);
      return false;
    }
  }

  _downloadToFile(url, destination, redirectCount = 0) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let request;

      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        if (error) reject(error);
        else resolve(value);
      };

      const parsedUrl = new URL(url);
      if (
        parsedUrl.protocol !== 'https:' ||
        !ALLOWED_DOWNLOAD_HOSTS.has(parsedUrl.hostname.toLowerCase())
      ) {
        finish(createError(
          'CLOUDFLARED_DOWNLOAD_HOST_REJECTED',
          'cloudflared download redirected to an untrusted host'
        ));
        return;
      }

      try {
        request = this.httpsGet(parsedUrl, response => {
          const statusCode = Number(response.statusCode || 0);
          if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
            response.resume();
            if (redirectCount >= MAX_REDIRECTS) {
              finish(createError(
                'CLOUDFLARED_TOO_MANY_REDIRECTS',
                'cloudflared download exceeded the redirect limit'
              ));
              return;
            }

            const nextUrl = new URL(response.headers.location, parsedUrl);
            this._downloadToFile(nextUrl, destination, redirectCount + 1)
              .then(value => finish(null, value), finish);
            return;
          }

          if (statusCode !== 200) {
            response.resume();
            finish(createError(
              'CLOUDFLARED_DOWNLOAD_FAILED',
              `cloudflared download returned HTTP ${statusCode}`
            ));
            return;
          }

          const declaredLength = Number(response.headers['content-length'] || 0);
          if (declaredLength > this.maxDownloadBytes) {
            response.resume();
            finish(createError(
              'CLOUDFLARED_DOWNLOAD_TOO_LARGE',
              'cloudflared download exceeded the size limit'
            ));
            return;
          }

          const output = fs.createWriteStream(destination, { flags: 'wx' });
          const hash = crypto.createHash('sha256');
          let receivedBytes = 0;

          const fail = error => {
            output.destroy();
            response.destroy();
            finish(error);
          };

          output.on('error', error => {
            fail(createError(
              'CLOUDFLARED_DOWNLOAD_WRITE_FAILED',
              'Could not store the cloudflared download',
              error
            ));
          });
          response.on('error', error => {
            fail(createError(
              'CLOUDFLARED_DOWNLOAD_FAILED',
              'cloudflared download stream failed',
              error
            ));
          });
          response.on('data', chunk => {
            receivedBytes += chunk.length;
            if (receivedBytes > this.maxDownloadBytes) {
              fail(createError(
                'CLOUDFLARED_DOWNLOAD_TOO_LARGE',
                'cloudflared download exceeded the size limit'
              ));
              return;
            }
            hash.update(chunk);
            if (!output.write(chunk)) {
              response.pause();
              output.once('drain', () => response.resume());
            }
          });
          response.on('end', () => {
            output.end(() => finish(null, hash.digest('hex')));
          });
        });
      } catch (error) {
        finish(createError(
          'CLOUDFLARED_DOWNLOAD_FAILED',
          'Could not start the cloudflared download',
          error
        ));
        return;
      }

      request.setTimeout?.(this.downloadTimeoutMs, () => {
        request.destroy(createError(
          'CLOUDFLARED_DOWNLOAD_TIMEOUT',
          'cloudflared download timed out'
        ));
      });
      request.on?.('error', error => {
        finish(error instanceof CloudflaredInstallError
          ? error
          : createError(
            'CLOUDFLARED_DOWNLOAD_FAILED',
            'cloudflared download request failed',
            error
          ));
      });
    });
  }

  _extractArchive(archivePath, destination) {
    return new Promise((resolve, reject) => {
      const extract = tar.extract();
      const hash = crypto.createHash('sha256');
      let executableCount = 0;
      let failed = false;

      const fail = error => {
        if (failed) return;
        failed = true;
        reject(error);
      };

      extract.on('entry', (header, stream, next) => {
        const name = String(header.name || '');
        const segments = name.replace(/^\.\//, '').split('/');
        const unsafeName =
          !name ||
          name.includes('\0') ||
          name.includes('\\') ||
          path.posix.isAbsolute(name) ||
          segments.includes('..');

        if (unsafeName) {
          stream.resume();
          fail(createError(
            'CLOUDFLARED_ARCHIVE_UNSAFE',
            'cloudflared archive contained an unsafe path'
          ));
          next();
          return;
        }

        if (header.type === 'directory') {
          stream.resume();
          next();
          return;
        }

        if (
          header.type !== 'file' ||
          segments.length !== 1 ||
          segments[0] !== 'cloudflared' ||
          executableCount > 0
        ) {
          stream.resume();
          fail(createError(
            'CLOUDFLARED_ARCHIVE_UNSAFE',
            'cloudflared archive contained an unexpected entry'
          ));
          next();
          return;
        }

        executableCount += 1;
        const output = fs.createWriteStream(destination, { flags: 'wx' });
        stream.on('data', chunk => hash.update(chunk));
        stream.on('error', fail);
        output.on('error', fail);
        output.on('finish', next);
        stream.pipe(output);
      });

      extract.on('error', error => {
        fail(createError(
          'CLOUDFLARED_ARCHIVE_INVALID',
          'Could not unpack the cloudflared archive',
          error
        ));
      });
      extract.on('finish', () => {
        if (failed) return;
        if (executableCount !== 1) {
          fail(createError(
            'CLOUDFLARED_ARCHIVE_UNSAFE',
            'cloudflared archive did not contain exactly one executable'
          ));
          return;
        }
        resolve(hash.digest('hex'));
      });

      const input = fs.createReadStream(archivePath);
      input.on('error', error => {
        fail(createError(
          'CLOUDFLARED_ARCHIVE_INVALID',
          'Could not read the cloudflared archive',
          error
        ));
      });
      input
        .pipe(zlib.createGunzip())
        .on('error', error => {
          fail(createError(
            'CLOUDFLARED_ARCHIVE_INVALID',
            'Could not decompress the cloudflared archive',
            error
          ));
        })
        .pipe(extract);
    });
  }

  _replaceFile(source, destination) {
    const backup = `${destination}.previous`;
    safeRemove(backup);
    if (fs.existsSync(destination)) {
      fs.renameSync(destination, backup);
    }

    try {
      fs.renameSync(source, destination);
      safeRemove(backup);
    } catch (error) {
      if (fs.existsSync(backup) && !fs.existsSync(destination)) {
        fs.renameSync(backup, destination);
      }
      throw error;
    }
  }
}

module.exports = {
  CLOUDFLARED_VERSION,
  DOWNLOAD_TIMEOUT_MS,
  MAX_DOWNLOAD_BYTES,
  CLOUDFLARED_MANIFEST,
  CloudflaredInstallError,
  CloudflaredBinaryManager
};
