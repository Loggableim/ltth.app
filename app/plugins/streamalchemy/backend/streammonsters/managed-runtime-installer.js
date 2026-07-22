const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');
const { spawn } = require('child_process');
const zipLib = require('zip-lib');
const zipLibPackageDir = path.dirname(require.resolve('zip-lib/package.json'));
const yauzl = require(require.resolve('yauzl', { paths: [zipLibPackageDir] }));

const ALLOWED_ARCHIVE_ORIGINS = Object.freeze([
  'https://github.com',
  'https://objects.githubusercontent.com',
  'https://release-assets.githubusercontent.com'
]);

// Intentionally empty until a release ships a reviewed archive URL and hashes.
// Runtime trust must come from packaged server code, never persisted client config.
const RELEASE_TRUSTED_MANIFEST = null;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_ARCHIVE_ENTRIES = 100000;
const MAX_ARCHIVE_UNCOMPRESSED_BYTES = 64 * 1024 * 1024 * 1024;

class ManagedRuntimeInstaller {
  constructor({
    platform = () => process.platform,
    dataDir = null,
    fetchImpl = global.fetch,
    downloadArchive = null,
    verifyArchive = null,
    inspectArchive = null,
    extractArchive = null,
    startRuntime = null,
    healthCheck = null,
    trustedManifest = RELEASE_TRUSTED_MANIFEST,
    allowedArchiveOrigins = ALLOWED_ARCHIVE_ORIGINS,
    spawnImpl = spawn,
    maxArchiveRedirects = 5,
    healthAttempts = 20,
    healthRetryDelayMs = 500
  } = {}) {
    this.platform = platform;
    this.dataDir = dataDir;
    this.fetch = fetchImpl;
    this.downloadArchive = downloadArchive || (input => this.download(input));
    this.verifyArchive = verifyArchive || (input => this.verify(input));
    this.inspectArchive = inspectArchive || (input => this.inspect(input));
    this.extractArchive = extractArchive || (input => this.extract(input));
    this.startRuntime = startRuntime || (input => this.start(input));
    this.healthCheck = healthCheck || (input => this.checkHealth(input));
    this.trustedManifest = this.copyManifest(trustedManifest);
    this.allowedArchiveOrigins = new Set(allowedArchiveOrigins.map(origin => new URL(origin).origin.toLowerCase()));
    this.spawn = spawnImpl;
    this.maxArchiveRedirects = Math.max(0, Math.min(10, Number(maxArchiveRedirects) || 0));
    this.healthAttempts = Math.max(1, Math.min(100, Number(healthAttempts) || 1));
    this.healthRetryDelayMs = Math.max(0, Math.min(10000, Number(healthRetryDelayMs) || 0));
    this.current = null;
  }

  recommend(gpu = {}) {
    const vendor = String(gpu.vendor || '').toLowerCase();
    const vramMb = Number(gpu.vramMb) || 0;
    if (this.platform() !== 'win32' || vendor !== 'nvidia' || vramMb < 6144) {
      return {
        supported: false,
        mode: 'expert_or_remote',
        reason: 'Managed local generation currently requires Windows, an NVIDIA GPU and at least 6 GB VRAM.'
      };
    }
    const size = vramMb >= 12288 ? 1024 : (vramMb >= 8192 ? 768 : 512);
    return {
      supported: true,
      mode: 'managed',
      presetId: 'sdxl_lightning_4step',
      width: size,
      height: size,
      steps: 4,
      concurrency: 1,
      reason: `${Math.round(vramMb / 1024)} GB NVIDIA VRAM supports a fast four-step local egg-art profile.`
    };
  }

  async install(gpu, requestedManifest, { signal = null } = {}) {
    this.throwIfAborted(signal);
    const recommendation = this.recommend(gpu);
    if (!recommendation.supported) throw new Error('STREAM_MONSTERS_RUNTIME_UNSUPPORTED_GPU');
    const manifest = this.getTrustedManifest();
    if (!manifest) throw new Error('STREAM_MONSTERS_RUNTIME_MANIFEST_UNAVAILABLE');
    if (requestedManifest !== undefined && !this.manifestsMatch(requestedManifest, manifest)) {
      throw new Error('STREAM_MONSTERS_RUNTIME_MANIFEST_UNTRUSTED');
    }
    this.validateManifest(manifest);
    const { runtimeRoot, archivePath } = await this.createRuntimeWorkspace(manifest);
    const archive = await this.downloadArchive({ manifest, archivePath, signal });
    this.throwIfAborted(signal);
    const verified = await this.verifyArchive({ archivePath: archive, sha256: manifest.sha256 });
    if (!verified) throw new Error('STREAM_MONSTERS_RUNTIME_CHECKSUM_MISMATCH');
    this.throwIfAborted(signal);
    await this.inspectArchive({ archivePath: archive, runtimeRoot });
    this.throwIfAborted(signal);
    await this.extractArchive({ archivePath: archive, runtimeRoot, archiveType: manifest.archiveType });
    this.throwIfAborted(signal);
    const executablePath = this.resolveExistingInside(runtimeRoot, manifest.executableRelativePath);
    const comfyRootDir = this.resolveExistingInside(runtimeRoot, manifest.comfyRootRelativePath || 'ComfyUI');
    const processInfo = await this.startRuntime({ executablePath, runtimeRoot, manifest, recommendation });
    this.throwIfAborted(signal);
    const healthy = await this.healthCheck({ runtimeRoot, manifest, processInfo });
    if (!healthy) throw new Error('STREAM_MONSTERS_RUNTIME_HEALTHCHECK_FAILED');
    this.current = {
      state: 'ready',
      runtimeRoot,
      comfyRootDir,
      pid: processInfo?.pid || null,
      recommendation,
      manifestVersion: manifest.version
    };
    return this.current;
  }

  validateManifest(manifest = {}) {
    const validVersion = typeof manifest.version === 'string' && /^[a-z0-9._-]{1,80}$/i.test(manifest.version);
    const validHash = typeof manifest.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(manifest.sha256);
    const validModelHash = typeof manifest.modelSha256 === 'string' && /^[a-f0-9]{64}$/i.test(manifest.modelSha256);
    if (!validVersion || !validHash || !validModelHash || manifest.archiveType !== 'zip') {
      throw new Error('STREAM_MONSTERS_RUNTIME_MANIFEST_INVALID');
    }
    this.validateArchiveUrl(manifest.archiveUrl);
    this.validateRelativePath(manifest.executableRelativePath, { executable: true });
    this.validateRelativePath(manifest.comfyRootRelativePath || 'ComfyUI');
    if (manifest.executableArgs !== undefined && (
      !Array.isArray(manifest.executableArgs) ||
      manifest.executableArgs.length > 32 ||
      manifest.executableArgs.some(value => typeof value !== 'string' || value.length > 512 || value.includes('\0'))
    )) {
      throw new Error('STREAM_MONSTERS_RUNTIME_MANIFEST_INVALID');
    }
    this.validateLoopbackUrl(manifest.healthBaseUrl || 'http://127.0.0.1:8188');
    this.validateLoopbackUrl(manifest.healthUrl || 'http://127.0.0.1:8188/system_stats');
  }

  copyManifest(manifest) {
    if (!manifest || typeof manifest !== 'object') return null;
    return Object.freeze({
      ...manifest,
      executableArgs: Array.isArray(manifest.executableArgs) ? Object.freeze([...manifest.executableArgs]) : undefined
    });
  }

  getTrustedManifest() {
    return this.copyManifest(this.trustedManifest);
  }

  manifestsMatch(candidate, trusted) {
    if (!candidate || typeof candidate !== 'object') return false;
    const fields = [
      'version', 'archiveUrl', 'sha256', 'modelSha256', 'archiveType',
      'executableRelativePath', 'comfyRootRelativePath', 'healthBaseUrl', 'healthUrl'
    ];
    return fields.every(field => candidate[field] === trusted[field]) &&
      JSON.stringify(candidate.executableArgs || []) === JSON.stringify(trusted.executableArgs || []);
  }

  validateArchiveUrl(value) {
    let url;
    try {
      url = new URL(value);
    } catch (_) {
      throw new Error('STREAM_MONSTERS_RUNTIME_ARCHIVE_URL_UNAPPROVED');
    }
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      !this.allowedArchiveOrigins.has(url.origin.toLowerCase())
    ) {
      throw new Error('STREAM_MONSTERS_RUNTIME_ARCHIVE_URL_UNAPPROVED');
    }
    return url;
  }

  validateLoopbackUrl(value) {
    let url;
    try {
      url = new URL(value);
    } catch (_) {
      throw new Error('STREAM_MONSTERS_RUNTIME_HEALTH_URL_INVALID');
    }
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      !(hostname === 'localhost' || hostname === '::1' || /^127\.\d+\.\d+\.\d+$/.test(hostname))
    ) {
      throw new Error('STREAM_MONSTERS_RUNTIME_HEALTH_URL_INVALID');
    }
    return url;
  }

  validateRelativePath(target, { executable = false } = {}) {
    if (typeof target !== 'string' || !target || target.includes('\0')) {
      throw new Error('STREAM_MONSTERS_RUNTIME_PATH_INVALID');
    }
    const normalized = target.replace(/\\/g, '/');
    const segments = normalized.split('/');
    const reservedWindowsName = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
    if (
      path.posix.isAbsolute(normalized) ||
      path.win32.isAbsolute(target) ||
      segments.some(segment => (
        !segment ||
        segment === '.' ||
        segment === '..' ||
        segment.includes(':') ||
        /[. ]$/.test(segment) ||
        reservedWindowsName.test(segment)
      )) ||
      (executable && path.posix.extname(normalized).toLowerCase() !== '.exe')
    ) {
      throw new Error('STREAM_MONSTERS_RUNTIME_PATH_INVALID');
    }
  }

  resolveRuntimeRoot() {
    if (!this.dataDir) throw new Error('STREAM_MONSTERS_RUNTIME_DATA_DIR_REQUIRED');
    return path.resolve(this.dataDir, 'managed-runtimes-v1');
  }

  async createRuntimeWorkspace(manifest) {
    const baseDir = this.resolveRuntimeRoot();
    await fs.promises.mkdir(baseDir, { recursive: true, mode: 0o700 });
    const baseStat = await fs.promises.lstat(baseDir);
    if (!baseStat.isDirectory() || baseStat.isSymbolicLink()) {
      throw new Error('STREAM_MONSTERS_RUNTIME_BASE_DIR_UNSAFE');
    }
    const dataDir = await fs.promises.realpath(path.resolve(this.dataDir));
    const canonicalBase = await fs.promises.realpath(baseDir);
    this.assertInside(dataDir, canonicalBase);
    await fs.promises.chmod(canonicalBase, 0o700).catch(() => {});
    const prefix = path.join(canonicalBase, `${manifest.version}-${manifest.sha256.slice(0, 16).toLowerCase()}-`);
    const stagingRoot = await fs.promises.mkdtemp(prefix);
    await fs.promises.chmod(stagingRoot, 0o700).catch(() => {});
    const runtimeRoot = path.join(stagingRoot, 'runtime');
    await fs.promises.mkdir(runtimeRoot, { mode: 0o700 });
    return {
      stagingRoot,
      runtimeRoot,
      archivePath: path.join(stagingRoot, 'runtime.zip')
    };
  }

  async download({ manifest, archivePath, signal = null }) {
    this.throwIfAborted(signal);
    const response = await this.fetchArchive(manifest.archiveUrl, { signal });
    if (!response?.ok || !response.body) {
      await this.releaseResponseBody(response);
      throw new Error(`STREAM_MONSTERS_RUNTIME_DOWNLOAD_HTTP_${response?.status || 'UNKNOWN'}`);
    }
    const source = response.body.getReader && Readable.fromWeb ? Readable.fromWeb(response.body) : Readable.from(response.body);
    await pipeline(source, fs.createWriteStream(archivePath));
    return archivePath;
  }

  async fetchArchive(initialUrl, { signal = null } = {}) {
    let current = this.validateArchiveUrl(initialUrl);
    for (let redirects = 0; redirects <= this.maxArchiveRedirects; redirects += 1) {
      this.throwIfAborted(signal);
      const options = { redirect: 'manual' };
      if (signal) options.signal = signal;
      const response = await this.fetch(current.href, options);
      if (response?.url && new URL(response.url).href !== current.href) {
        await this.releaseResponseBody(response);
        throw new Error('STREAM_MONSTERS_RUNTIME_REDIRECT_INVALID');
      }
      if (!REDIRECT_STATUSES.has(Number(response?.status))) return response;
      await this.releaseResponseBody(response);
      if (redirects >= this.maxArchiveRedirects) {
        throw new Error('STREAM_MONSTERS_RUNTIME_REDIRECT_LIMIT');
      }
      const location = response.headers?.get?.('location');
      if (!location) throw new Error('STREAM_MONSTERS_RUNTIME_REDIRECT_INVALID');
      let next;
      try {
        next = new URL(location, current);
      } catch (_) {
        throw new Error('STREAM_MONSTERS_RUNTIME_REDIRECT_INVALID');
      }
      current = this.validateArchiveUrl(next.href);
    }
    throw new Error('STREAM_MONSTERS_RUNTIME_REDIRECT_LIMIT');
  }

  async releaseResponseBody(response) {
    const body = response?.body;
    if (!body) return;
    try {
      if (typeof body.cancel === 'function') {
        await body.cancel();
      } else if (typeof body.destroy === 'function') {
        body.destroy();
      }
    } catch (_) {}
  }

  async verify({ archivePath, sha256 }) {
    const hash = crypto.createHash('sha256');
    await pipeline(fs.createReadStream(archivePath), hash);
    return hash.digest('hex').toLowerCase() === sha256.toLowerCase();
  }

  async inspect({ archivePath, runtimeRoot }) {
    const canonicalRoot = path.resolve(runtimeRoot);
    let totalBytes = 0;
    let seenEntries = 0;
    const entryNames = new Set();
    await new Promise((resolve, reject) => {
      yauzl.open(archivePath, {
        lazyEntries: true,
        decodeStrings: true,
        validateEntrySizes: true,
        strictFileNames: true
      }, (openError, zipFile) => {
        if (openError) {
          reject(new Error('STREAM_MONSTERS_RUNTIME_ARCHIVE_INVALID'));
          return;
        }
        let settled = false;
        const fail = () => {
          if (settled) return;
          settled = true;
          zipFile.close();
          reject(new Error('STREAM_MONSTERS_RUNTIME_ARCHIVE_ENTRY_UNSAFE'));
        };
        zipFile.once('error', fail);
        zipFile.once('end', () => {
          if (settled) return;
          settled = true;
          resolve();
        });
        zipFile.on('entry', entry => {
          try {
            seenEntries += 1;
            totalBytes += Number(entry.uncompressedSize) || 0;
            if (seenEntries > MAX_ARCHIVE_ENTRIES || totalBytes > MAX_ARCHIVE_UNCOMPRESSED_BYTES) {
              throw new Error('archive limits exceeded');
            }
            const normalizedName = String(entry.fileName || '').replace(/\/$/, '').toLowerCase();
            if (entryNames.has(normalizedName)) throw new Error('duplicate archive entry');
            entryNames.add(normalizedName);
            this.validateArchiveEntry(entry, canonicalRoot);
            zipFile.readEntry();
          } catch (_) {
            fail();
          }
        });
        zipFile.readEntry();
      });
    });
  }

  validateArchiveEntry(entry, runtimeRoot) {
    const entryName = String(entry?.fileName || '');
    if (!entryName || entryName.includes('\\')) {
      throw new Error('STREAM_MONSTERS_RUNTIME_ARCHIVE_ENTRY_UNSAFE');
    }
    const isDirectory = entryName.endsWith('/');
    const relativeName = isDirectory ? entryName.slice(0, -1) : entryName;
    this.validateRelativePath(relativeName);
    this.resolveInside(runtimeRoot, relativeName);
    const mode = (Number(entry.externalFileAttributes) >>> 16) & 0xffff;
    const fileType = mode & 0o170000;
    if (fileType && fileType !== 0o100000 && fileType !== 0o040000) {
      throw new Error('STREAM_MONSTERS_RUNTIME_ARCHIVE_ENTRY_UNSAFE');
    }
    if ((fileType === 0o040000 && !isDirectory) || (fileType === 0o100000 && isDirectory)) {
      throw new Error('STREAM_MONSTERS_RUNTIME_ARCHIVE_ENTRY_UNSAFE');
    }
    if ((Number(entry.generalPurposeBitFlag) & 0x1) !== 0) {
      throw new Error('STREAM_MONSTERS_RUNTIME_ARCHIVE_ENTRY_UNSAFE');
    }
  }

  async extract({ archivePath, runtimeRoot }) {
    let unsafePath = null;
    const unzip = new zipLib.Unzip({
      onEntry: event => {
        try {
          this.resolveInside(runtimeRoot, event.entryName);
        } catch (error) {
          unsafePath = error;
          event.preventDefault();
        }
      }
    });
    await unzip.extract(archivePath, runtimeRoot);
    if (unsafePath) throw unsafePath;
  }

  async start({ executablePath, runtimeRoot, manifest = {} }) {
    if (!fs.existsSync(executablePath)) throw new Error('STREAM_MONSTERS_RUNTIME_EXECUTABLE_MISSING');
    const canonicalRoot = fs.realpathSync(runtimeRoot);
    const canonicalExecutable = fs.realpathSync(executablePath);
    this.assertInside(canonicalRoot, canonicalExecutable);
    if (!fs.statSync(canonicalExecutable).isFile()) throw new Error('STREAM_MONSTERS_RUNTIME_EXECUTABLE_MISSING');
    const child = this.spawn(canonicalExecutable, manifest.executableArgs || [], {
      cwd: canonicalRoot,
      windowsHide: true,
      detached: false,
      stdio: 'ignore',
      shell: false
    });
    if (typeof child.once === 'function') child.once('error', () => {});
    return { pid: child.pid || null };
  }

  async checkHealth({ manifest }) {
    const url = manifest.healthUrl || 'http://127.0.0.1:8188/system_stats';
    this.validateLoopbackUrl(url);
    for (let attempt = 0; attempt < this.healthAttempts; attempt += 1) {
      try {
        const response = await this.fetch(url, { redirect: 'manual' });
        const unexpectedUrl = response?.url && new URL(response.url).href !== new URL(url).href;
        const redirected = REDIRECT_STATUSES.has(Number(response?.status));
        const healthy = Boolean(response?.ok);
        await this.releaseResponseBody(response);
        if (unexpectedUrl || redirected) return false;
        if (healthy) return true;
      } catch (_) {}
      if (attempt + 1 < this.healthAttempts && this.healthRetryDelayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, this.healthRetryDelayMs));
      }
    }
    return false;
  }

  resolveInside(root, target) {
    const resolvedRoot = path.resolve(root);
    const candidate = path.resolve(resolvedRoot, target);
    this.assertInside(resolvedRoot, candidate);
    return candidate;
  }

  resolveExistingInside(root, target) {
    const candidate = this.resolveInside(root, target);
    if (!fs.existsSync(candidate)) throw new Error('STREAM_MONSTERS_RUNTIME_PATH_INVALID');
    const canonicalRoot = fs.realpathSync(root);
    const canonicalCandidate = fs.realpathSync(candidate);
    this.assertInside(canonicalRoot, canonicalCandidate);
    return canonicalCandidate;
  }

  assertInside(root, candidate) {
    const relative = path.relative(path.resolve(root), path.resolve(candidate));
    if (!relative || (!relative.startsWith('..') && !path.isAbsolute(relative))) return;
    throw new Error('STREAM_MONSTERS_RUNTIME_PATH_INVALID');
  }

  throwIfAborted(signal) {
    if (signal?.aborted) throw new Error('STREAM_MONSTERS_RUNTIME_ABORTED');
  }
}

module.exports = ManagedRuntimeInstaller;
