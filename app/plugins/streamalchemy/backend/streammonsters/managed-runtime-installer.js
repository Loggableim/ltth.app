const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');
const { spawn } = require('child_process');
const zipLib = require('zip-lib');

class ManagedRuntimeInstaller {
  constructor({
    platform = () => process.platform,
    dataDir = null,
    fetchImpl = global.fetch,
    downloadArchive = null,
    verifyArchive = null,
    extractArchive = null,
    startRuntime = null,
    healthCheck = null
  } = {}) {
    this.platform = platform;
    this.dataDir = dataDir;
    this.fetch = fetchImpl;
    this.downloadArchive = downloadArchive || (input => this.download(input));
    this.verifyArchive = verifyArchive || (input => this.verify(input));
    this.extractArchive = extractArchive || (input => this.extract(input));
    this.startRuntime = startRuntime || (input => this.start(input));
    this.healthCheck = healthCheck || (input => this.checkHealth(input));
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

  async install(gpu, manifest, { signal = null } = {}) {
    this.throwIfAborted(signal);
    const recommendation = this.recommend(gpu);
    if (!recommendation.supported) throw new Error('STREAM_MONSTERS_RUNTIME_UNSUPPORTED_GPU');
    this.validateManifest(manifest);
    const runtimeRoot = this.resolveRuntimeRoot();
    const archivePath = path.join(runtimeRoot, `runtime-${manifest.version}.zip`);
    await fs.promises.mkdir(runtimeRoot, { recursive: true });
    const archive = await this.downloadArchive({ manifest, archivePath, signal });
    this.throwIfAborted(signal);
    const verified = await this.verifyArchive({ archivePath: archive, sha256: manifest.sha256 });
    if (!verified) throw new Error('STREAM_MONSTERS_RUNTIME_CHECKSUM_MISMATCH');
    this.throwIfAborted(signal);
    await this.extractArchive({ archivePath: archive, runtimeRoot, archiveType: manifest.archiveType });
    this.throwIfAborted(signal);
    const executablePath = this.resolveInside(runtimeRoot, manifest.executableRelativePath);
    const processInfo = await this.startRuntime({ executablePath, runtimeRoot, manifest, recommendation });
    this.throwIfAborted(signal);
    const healthy = await this.healthCheck({ runtimeRoot, manifest, processInfo });
    if (!healthy) throw new Error('STREAM_MONSTERS_RUNTIME_HEALTHCHECK_FAILED');
    this.current = { state: 'ready', runtimeRoot, pid: processInfo?.pid || null, recommendation, manifestVersion: manifest.version };
    return this.current;
  }

  validateManifest(manifest = {}) {
    const validUrl = typeof manifest.archiveUrl === 'string' && /^https:\/\//i.test(manifest.archiveUrl);
    const validHash = typeof manifest.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(manifest.sha256);
    const validExecutable = typeof manifest.executableRelativePath === 'string' && manifest.executableRelativePath.length > 0;
    if (!manifest.version || !validUrl || !validHash || manifest.archiveType !== 'zip' || !validExecutable) {
      throw new Error('STREAM_MONSTERS_RUNTIME_MANIFEST_INVALID');
    }
  }

  resolveRuntimeRoot() {
    if (!this.dataDir) throw new Error('STREAM_MONSTERS_RUNTIME_DATA_DIR_REQUIRED');
    return path.resolve(this.dataDir, 'managed-runtime');
  }

  async download({ manifest, archivePath, signal = null }) {
    this.throwIfAborted(signal);
    const response = signal ? await this.fetch(manifest.archiveUrl, { signal }) : await this.fetch(manifest.archiveUrl);
    if (!response?.ok || !response.body) throw new Error(`STREAM_MONSTERS_RUNTIME_DOWNLOAD_HTTP_${response?.status || 'UNKNOWN'}`);
    const source = response.body.getReader && Readable.fromWeb ? Readable.fromWeb(response.body) : Readable.from(response.body);
    await pipeline(source, fs.createWriteStream(archivePath));
    return archivePath;
  }

  async verify({ archivePath, sha256 }) {
    const hash = crypto.createHash('sha256');
    await pipeline(fs.createReadStream(archivePath), hash);
    return hash.digest('hex').toLowerCase() === sha256.toLowerCase();
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

  async start({ executablePath, runtimeRoot }) {
    if (!fs.existsSync(executablePath)) throw new Error('STREAM_MONSTERS_RUNTIME_EXECUTABLE_MISSING');
    const child = spawn('cmd.exe', ['/d', '/s', '/c', executablePath], {
      cwd: runtimeRoot,
      windowsHide: true,
      detached: false,
      stdio: 'ignore'
    });
    return { pid: child.pid || null };
  }

  async checkHealth({ manifest }) {
    const url = manifest.healthUrl || 'http://127.0.0.1:8188/system_stats';
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        const response = await this.fetch(url);
        if (response?.ok) return true;
      } catch (_) {}
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    return false;
  }

  resolveInside(root, target) {
    const resolvedRoot = path.resolve(root);
    const candidate = path.resolve(resolvedRoot, target);
    const relative = path.relative(resolvedRoot, candidate);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('STREAM_MONSTERS_RUNTIME_PATH_INVALID');
    return candidate;
  }

  throwIfAborted(signal) {
    if (signal?.aborted) throw new Error('STREAM_MONSTERS_RUNTIME_ABORTED');
  }
}

module.exports = ManagedRuntimeInstaller;
