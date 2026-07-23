const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');
const { spawn, execFile } = require('child_process');
const zipLib = require('zip-lib');
const zipLibPackageDir = path.dirname(require.resolve('zip-lib/package.json'));
const yauzl = require(require.resolve('yauzl', { paths: [zipLibPackageDir] }));

const ALLOWED_ARCHIVE_ORIGINS = Object.freeze([
  'https://github.com',
  'https://objects.githubusercontent.com',
  'https://release-assets.githubusercontent.com',
  'https://huggingface.co',
  'https://cdn-lfs.huggingface.co',
  'https://cas-bridge.xethub.hf.co'
]);

// Intentionally empty until a release ships a reviewed archive URL and hashes.
// Runtime trust must come from packaged server code, never persisted client config.
const RELEASE_TRUSTED_MANIFEST = null;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_ARCHIVE_ENTRIES = 100000;
const MAX_ARCHIVE_UNCOMPRESSED_BYTES = 64 * 1024 * 1024 * 1024;
const COMFYUI_VERSION = '0.28.0';
const RELEASE_BASE_URL = 'https://github.com/Comfy-Org/ComfyUI/releases/download/v0.28.0';
const AMD_SUPPORTED_HARDWARE = Object.freeze([
  /\bradeon\s+rx\s+7900\s+xtx\b/i,
  /\bradeon\s+rx\s+7900\s+xt\b/i,
  /\bradeon\s+rx\s+7900\s+gre\b/i,
  /\bradeon\s+rx\s+7800\s+xt\b/i,
  /\bradeon\s+rx\s+7700\s+xt\b/i,
  /\bradeon\s+rx\s+7600(?:\s+xt)?\b/i,
  /\bradeon\s+rx\s+90(?:60|70)(?:\s+xt)?\b/i,
  /\bradeon\s+pro\s+w7900\b/i,
  /\bradeon\s+pro\s+w7800\b/i,
  /\bradeon\s+pro\s+w7[67]00\b/i,
  /\bradeon\s+(?:880m|890m)\b/i
]);
const MANAGED_RUNTIME_CATALOG = Object.freeze({
  version: COMFYUI_VERSION,
  profiles: Object.freeze([
    Object.freeze({
      id: 'nvidia-standard',
      label: 'NVIDIA RTX 20+',
      backend: 'cuda',
      version: COMFYUI_VERSION,
      archiveUrl: `${RELEASE_BASE_URL}/ComfyUI_windows_portable_nvidia.7z`,
      sha256: '797183fe6165b96a1800793cdc2110e4c62c45e8775647a7166fe8c6290e2fd9',
      downloadSizeBytes: 2092156323,
      archiveType: '7z',
      runtimeRootRelativePath: 'ComfyUI_windows_portable',
      pythonRelativePath: 'python_embeded/python.exe',
      mainRelativePath: 'ComfyUI/main.py'
    }),
    Object.freeze({
      id: 'nvidia-cuda126-legacy',
      label: 'NVIDIA GTX 10 (CUDA 12.6 legacy)',
      backend: 'cuda',
      version: COMFYUI_VERSION,
      archiveUrl: `${RELEASE_BASE_URL}/ComfyUI_windows_portable_nvidia_cu126.7z`,
      sha256: '6af1b60b6a1fad780b07871e4ff356ac04a1807755ee13c6050e3ec3a4157cc0',
      downloadSizeBytes: 2034160963,
      archiveType: '7z',
      runtimeRootRelativePath: 'ComfyUI_windows_portable',
      pythonRelativePath: 'python_embeded/python.exe',
      mainRelativePath: 'ComfyUI/main.py'
    }),
    Object.freeze({
      id: 'intel-arc',
      label: 'Intel Arc A770',
      backend: 'xpu',
      version: COMFYUI_VERSION,
      archiveUrl: `${RELEASE_BASE_URL}/ComfyUI_windows_portable_intel.7z`,
      sha256: 'cc662b0d71c06419e92511ba40d7bef681c2b3cdb1be9f725f8da197bb68ce94',
      downloadSizeBytes: 1680009614,
      archiveType: '7z',
      runtimeRootRelativePath: 'ComfyUI_windows_portable',
      pythonRelativePath: 'python_embeded/python.exe',
      mainRelativePath: 'ComfyUI/main.py'
    }),
    Object.freeze({
      id: 'amd-experimental',
      label: 'AMD Radeon (experimental)',
      backend: 'rocm',
      version: COMFYUI_VERSION,
      archiveUrl: `${RELEASE_BASE_URL}/ComfyUI_windows_portable_amd.7z`,
      sha256: '824f70126a8733ce25cc5713d20dba91ddd9f27efd6ac04a6d4a57dbf09ecd3c',
      downloadSizeBytes: 1762815561,
      archiveType: '7z',
      runtimeRootRelativePath: 'ComfyUI_windows_portable',
      pythonRelativePath: 'python_embeded/python.exe',
      mainRelativePath: 'ComfyUI/main.py',
      experimental: true
    })
  ]),
  model: Object.freeze({
    id: 'sdxl_lightning_4step',
    fileName: 'sdxl_lightning_4step.safetensors',
    downloadUrl: 'https://huggingface.co/ByteDance/SDXL-Lightning/resolve/main/sdxl_lightning_4step.safetensors?download=true',
    sizeBytes: 6938040682,
    sha256: 'e0d996ee0013e79d9d3561f50fcafb9a17e3ff07b780358e3b66d67932c4d490',
    license: 'OpenRAIL++'
  })
});

class ManagedRuntimeInstaller {
  constructor({
    platform = () => process.platform,
    windowsRelease = () => os.release(),
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
    execFileImpl = execFile,
    performInstall = null,
    scheduleJob = callback => setImmediate(callback),
    onState = () => {},
    findFreePort = null,
    smokeTest = null,
    diskFreeBytes = null,
    setTimeoutImpl = setTimeout,
    clearTimeoutImpl = clearTimeout,
    idleTimeoutMs = 5 * 60 * 1000,
    maxArchiveEntries = MAX_ARCHIVE_ENTRIES,
    maxArchiveUncompressedBytes = MAX_ARCHIVE_UNCOMPRESSED_BYTES,
    maxArchiveRedirects = 5,
    healthAttempts = 20,
    healthRetryDelayMs = 500
  } = {}) {
    this.platform = platform;
    this.windowsRelease = windowsRelease;
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
    this.execFile = execFileImpl;
    this.performInstall = performInstall || (input => this.performCatalogInstall(input));
    this.scheduleJob = scheduleJob;
    this.onState = onState;
    this.findFreePort = findFreePort || (() => this.findAvailablePort());
    this.smokeTest = smokeTest || (input => this.runGenerationSmokeTest(input));
    this.diskFreeBytes = diskFreeBytes || (target => this.readDiskFreeBytes(target));
    this.setTimeout = setTimeoutImpl;
    this.clearTimeout = clearTimeoutImpl;
    this.idleTimeoutMs = Math.max(1, Number(idleTimeoutMs) || 5 * 60 * 1000);
    this.maxArchiveEntries = Math.max(1, Number(maxArchiveEntries) || MAX_ARCHIVE_ENTRIES);
    this.maxArchiveUncompressedBytes = Math.max(1, Number(maxArchiveUncompressedBytes) || MAX_ARCHIVE_UNCOMPRESSED_BYTES);
    this.maxArchiveRedirects = Math.max(0, Math.min(10, Number(maxArchiveRedirects) || 0));
    this.healthAttempts = Math.max(1, Math.min(100, Number(healthAttempts) || 1));
    this.healthRetryDelayMs = Math.max(0, Math.min(10000, Number(healthRetryDelayMs) || 0));
    this.current = null;
    this.installation = null;
    this.jobs = new Map();
    this.managedChild = null;
    this.processState = { state: 'stopped', pid: null, port: null, baseUrl: null };
    this.idleTimer = null;
    this.lastSmokeTest = null;
    this.installation = this.loadInstallationRecord();
  }

  recommend(gpu = {}) {
    const vendor = String(gpu.vendor || '').toLowerCase();
    const vramMb = Number(gpu.vramMb) || 0;
    if (this.platform() !== 'win32') {
      return {
        supported: false,
        mode: 'expert_or_remote',
        reasonCode: 'windows_required',
        reason: 'Managed local generation is Windows-first; use external ComfyUI or a remote provider.'
      };
    }
    if (!vramMb || gpu.memoryState === 'unknown') {
      return {
        supported: false,
        mode: 'expert_or_remote',
        reasonCode: 'unknown_memory',
        reason: 'GPU memory could not be determined safely.'
      };
    }
    let profileId = null;
    const name = String(gpu.name || '');
    const architecture = String(gpu.architecture || '');
    if (vendor === 'nvidia') {
      if (architecture === 'gtx_10_legacy' || /\bgtx\s*10\d{2}\b/i.test(name)) {
        profileId = 'nvidia-cuda126-legacy';
      } else if (architecture === 'rtx_20_plus' || /\brtx\s*(20|30|40|50)\d{2}\b/i.test(name) || !architecture) {
        profileId = 'nvidia-standard';
      }
    } else if (vendor === 'intel' && (architecture === 'arc_a770' || /\barc.*a770\b/i.test(name))) {
      profileId = 'intel-arc';
    } else if (vendor === 'amd') {
      if (!this.isWindows11()) {
        return {
          supported: false,
          mode: 'expert_or_remote',
          reasonCode: 'windows_11_required',
          reason: 'The pinned AMD runtime requires Windows 11.'
        };
      }
      if (!AMD_SUPPORTED_HARDWARE.some(pattern => pattern.test(name))) {
        return {
          supported: false,
          mode: 'expert_or_remote',
          reasonCode: 'unsupported_amd_hardware',
          reason: 'This AMD adapter is outside the pinned supported hardware matrix.'
        };
      }
      profileId = 'amd-experimental';
    }
    if (!profileId || vramMb < 6144) {
      return {
        supported: false,
        mode: 'expert_or_remote',
        reasonCode: profileId ? 'insufficient_memory' : 'unsupported_adapter',
        reason: 'The selected adapter has no supported managed runtime profile.'
      };
    }
    const size = vramMb >= 12288 ? 1024 : (vramMb >= 8192 ? 768 : 512);
    const profile = MANAGED_RUNTIME_CATALOG.profiles.find(item => item.id === profileId);
    return {
      supported: true,
      mode: 'managed',
      profileId,
      presetId: 'sdxl_lightning_4step',
      width: size,
      height: size,
      steps: 4,
      concurrency: 1,
      experimental: Boolean(profile?.experimental),
      smokeTestRequired: true,
      reason: `${Math.round(vramMb / 1024)} GB GPU memory supports the pinned ${profile?.label || profileId} profile.`
    };
  }

  getCatalog() {
    return {
      version: MANAGED_RUNTIME_CATALOG.version,
      profiles: MANAGED_RUNTIME_CATALOG.profiles.map(profile => ({ ...profile })),
      model: { ...MANAGED_RUNTIME_CATALOG.model }
    };
  }

  getPublicProfiles() {
    return MANAGED_RUNTIME_CATALOG.profiles.map(profile => ({
      id: profile.id,
      label: profile.label,
      backend: profile.backend,
      version: profile.version,
      experimental: Boolean(profile.experimental)
    }));
  }

  getProfile(profileId) {
    const profile = MANAGED_RUNTIME_CATALOG.profiles.find(item => item.id === profileId);
    return profile ? { ...profile } : null;
  }

  isWindows11() {
    const release = String(this.windowsRelease() || '');
    const parts = release.split('.').map(value => Number.parseInt(value, 10) || 0);
    return parts[0] >= 10 && parts[2] >= 22000;
  }

  createInstallJob(request = {}, adapters = []) {
    this.validateInstallRequest(request);
    const adapter = request.adapterId
      ? adapters.find(item => item.id === request.adapterId)
      : adapters.find(item => this.recommend(item).supported);
    if (!adapter) throw new Error('STREAM_MONSTERS_RUNTIME_ADAPTER_NOT_FOUND');
    const recommendation = this.recommend(adapter);
    if (!recommendation.supported) throw new Error('STREAM_MONSTERS_RUNTIME_UNSUPPORTED_GPU');
    const profileId = request.profileId || recommendation.profileId;
    if (profileId !== recommendation.profileId || !this.getProfile(profileId)) {
      throw new Error('STREAM_MONSTERS_RUNTIME_PROFILE_INVALID');
    }
    const jobId = `runtime-job-${crypto.randomBytes(12).toString('hex')}`;
    const controller = new AbortController();
    const job = {
      jobId,
      state: 'queued',
      adapterId: adapter.id,
      profileId,
      progress: { phase: 'queued', completedBytes: 0, totalBytes: 0 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      adapter,
      controller,
      error: null,
      result: null
    };
    this.jobs.set(jobId, job);
    this.scheduleJob(() => this.runInstallJob(job).catch(() => {}));
    return { jobId, state: job.state };
  }

  validateInstallRequest(request) {
    if (!request || typeof request !== 'object' || Array.isArray(request)) {
      throw new Error('STREAM_MONSTERS_RUNTIME_INSTALL_REQUEST_INVALID');
    }
    const allowed = new Set(['adapterId', 'profileId', 'acceptModelLicense']);
    if (Object.keys(request).some(key => !allowed.has(key))) {
      throw new Error('STREAM_MONSTERS_RUNTIME_INSTALL_REQUEST_INVALID');
    }
    for (const key of ['adapterId', 'profileId']) {
      if (request[key] !== undefined && (
        typeof request[key] !== 'string' ||
        !/^[a-z0-9._-]{1,100}$/i.test(request[key])
      )) {
        throw new Error('STREAM_MONSTERS_RUNTIME_INSTALL_REQUEST_INVALID');
      }
    }
    if (request.acceptModelLicense !== true) {
      throw new Error('STREAM_MONSTERS_MODEL_LICENSE_REQUIRED');
    }
  }

  async runInstallJob(job) {
    if (job.state === 'cancelled' || job.controller.signal.aborted) return this.publicJob(job);
    this.updateJob(job, { state: 'running', progress: { ...job.progress, phase: 'preflight' } });
    try {
      const result = await this.performInstall({
        jobId: job.jobId,
        adapter: job.adapter,
        profile: this.getProfile(job.profileId),
        model: { ...MANAGED_RUNTIME_CATALOG.model },
        signal: job.controller.signal,
        onProgress: progress => this.updateJob(job, { progress: { ...job.progress, ...progress } })
      });
      this.throwIfAborted(job.controller.signal);
      this.installation = result;
      this.updateJob(job, {
        state: 'ready',
        result,
        progress: { ...job.progress, phase: 'complete' }
      });
    } catch (error) {
      const cancelled = job.controller.signal.aborted || error.message === 'STREAM_MONSTERS_RUNTIME_ABORTED';
      this.updateJob(job, {
        state: cancelled ? 'cancelled' : 'failed',
        error: cancelled ? null : error.message,
        progress: { ...job.progress, phase: cancelled ? 'cancelled' : 'failed' }
      });
    }
    return this.publicJob(job);
  }

  updateJob(job, updates) {
    Object.assign(job, updates, { updatedAt: new Date().toISOString() });
    this.onState(this.publicJob(job));
    return job;
  }

  getInstallJob(jobId) {
    const job = this.jobs.get(String(jobId || ''));
    return job ? this.publicJob(job) : null;
  }

  cancelInstallJob(jobId) {
    const job = this.jobs.get(String(jobId || ''));
    if (!job) return null;
    if (['ready', 'failed', 'cancelled'].includes(job.state)) return this.publicJob(job);
    job.controller.abort();
    this.updateJob(job, {
      state: 'cancelled',
      progress: { ...job.progress, phase: 'cancelled' }
    });
    return this.publicJob(job);
  }

  publicJob(job) {
    return {
      jobId: job.jobId,
      state: job.state,
      adapterId: job.adapterId,
      profileId: job.profileId,
      progress: { ...job.progress },
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      error: job.error,
      result: job.result ? {
        state: job.result.state,
        verified: Boolean(job.result.verified),
        runtimeRoot: job.result.runtimeRoot
      } : null
    };
  }

  async performCatalogInstall({ jobId, adapter, profile, model, signal, onProgress }) {
    this.throwIfAborted(signal);
    const requiredBytes = (Number(profile.downloadSizeBytes) || 0) + model.sizeBytes + (2 * 1024 ** 3);
    await this.preflightDisk(requiredBytes);
    const previousInstallation = this.installation;
    const stagingRoot = await this.createCatalogStaging(jobId);
    const contentRoot = path.join(stagingRoot, 'content');
    await fs.promises.mkdir(contentRoot, { recursive: true });
    try {
      const archivePath = await this.downloadArtifact({
        url: profile.archiveUrl,
        targetPath: path.join(stagingRoot, `runtime.${profile.archiveType}`),
        expectedSize: Number(profile.downloadSizeBytes) || 0,
        sha256: profile.sha256,
        signal,
        onProgress: progress => onProgress({ ...progress, phase: 'runtime_download' })
      });
      this.throwIfAborted(signal);
      onProgress({ phase: 'archive_inspection' });
      await this.inspect({ archivePath, runtimeRoot: contentRoot, archiveType: profile.archiveType });
      await this.extract({ archivePath, runtimeRoot: contentRoot, archiveType: profile.archiveType });
      const extractedRuntimeRoot = this.resolveExistingInside(contentRoot, profile.runtimeRootRelativePath);
      const modelDir = this.resolveInside(extractedRuntimeRoot, path.join('ComfyUI', 'models', 'checkpoints'));
      await fs.promises.mkdir(modelDir, { recursive: true });
      await this.downloadArtifact({
        url: model.downloadUrl,
        targetPath: path.join(modelDir, model.fileName),
        expectedSize: model.sizeBytes,
        sha256: model.sha256,
        signal,
        onProgress: progress => onProgress({ ...progress, phase: 'model_download' })
      });
      const installsRoot = path.join(this.resolveRuntimeRootV2(), 'installs');
      await fs.promises.mkdir(installsRoot, { recursive: true });
      const installDir = path.join(
        installsRoot,
        `${profile.id}-${profile.version}-${profile.sha256.slice(0, 16)}`
      );
      if (fs.existsSync(installDir)) {
        throw new Error('STREAM_MONSTERS_RUNTIME_INSTALL_ALREADY_EXISTS');
      }
      await fs.promises.rename(extractedRuntimeRoot, installDir);
      this.installation = {
        state: 'installed',
        verified: false,
        runtimeRoot: installDir,
        profileId: profile.id,
        adapterId: adapter.id,
        model: {
          id: model.id,
          fileName: model.fileName,
          sizeBytes: model.sizeBytes,
          license: model.license,
          verified: true
        },
        previousRuntimeRoot: previousInstallation?.verified ? previousInstallation.runtimeRoot : null
      };
      onProgress({ phase: 'runtime_verification' });
      await this.startManagedRuntime({ adapter, allowUnverified: true });
      this.installation = {
        ...this.installation,
        state: 'ready',
        verified: true,
        smokeTest: this.lastSmokeTest
      };
      await this.writeActiveInstallation(this.installation);
      await this.cleanupValidatedStaging(stagingRoot);
      return this.installation;
    } catch (error) {
      this.installation = previousInstallation;
      await this.cleanupValidatedStaging(stagingRoot).catch(() => {});
      throw error;
    }
  }

  resolveRuntimeRootV2() {
    if (!this.dataDir) throw new Error('STREAM_MONSTERS_RUNTIME_DATA_DIR_REQUIRED');
    return path.resolve(this.dataDir, 'managed-runtimes-v2');
  }

  async createCatalogStaging(jobId) {
    const root = this.resolveRuntimeRootV2();
    const stagingBase = path.join(root, 'staging');
    await fs.promises.mkdir(stagingBase, { recursive: true, mode: 0o700 });
    const canonicalBase = await fs.promises.realpath(stagingBase);
    const canonicalDataDir = await fs.promises.realpath(path.resolve(this.dataDir));
    this.assertInside(canonicalDataDir, canonicalBase);
    return fs.promises.mkdtemp(path.join(canonicalBase, `${jobId}-`));
  }

  async cleanupValidatedStaging(stagingRoot) {
    const stagingBase = path.join(this.resolveRuntimeRootV2(), 'staging');
    const canonicalBase = await fs.promises.realpath(stagingBase);
    const resolved = path.resolve(stagingRoot);
    this.assertInside(canonicalBase, resolved);
    const stat = await fs.promises.lstat(resolved);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error('STREAM_MONSTERS_RUNTIME_STAGING_UNSAFE');
    }
    await fs.promises.rm(resolved, { recursive: true, force: true });
  }

  async preflightDisk(requiredBytes, target = this.dataDir) {
    const freeBytes = await this.diskFreeBytes(target);
    if (!Number.isFinite(freeBytes) || freeBytes < requiredBytes) {
      throw new Error('STREAM_MONSTERS_RUNTIME_DISK_SPACE_INSUFFICIENT');
    }
    return { requiredBytes, freeBytes };
  }

  async getDiskStatus(profileId = null) {
    const profile = this.getProfile(profileId) || MANAGED_RUNTIME_CATALOG.profiles[0];
    const requiredBytes = (Number(profile?.downloadSizeBytes) || 0) +
      MANAGED_RUNTIME_CATALOG.model.sizeBytes +
      (2 * 1024 ** 3);
    const freeBytes = await this.diskFreeBytes(this.dataDir);
    return {
      targetRoot: this.resolveRuntimeRootV2(),
      requiredBytes,
      freeBytes: Number.isFinite(freeBytes) ? freeBytes : null,
      sufficient: Number.isFinite(freeBytes) && freeBytes >= requiredBytes
    };
  }

  readDiskFreeBytes(target) {
    if (typeof fs.statfsSync !== 'function') return Number.POSITIVE_INFINITY;
    const stats = fs.statfsSync(target || process.cwd());
    return Number(stats.bavail) * Number(stats.bsize);
  }

  async writeActiveInstallation(installation) {
    const root = this.resolveRuntimeRootV2();
    await fs.promises.mkdir(root, { recursive: true });
    const target = path.join(root, 'active.json');
    const part = `${target}.part`;
    const publicRecord = {
      state: installation.state,
      verified: installation.verified,
      runtimeRoot: installation.runtimeRoot,
      profileId: installation.profileId,
      adapterId: installation.adapterId,
      model: installation.model,
      smokeTest: installation.smokeTest
    };
    await fs.promises.writeFile(part, JSON.stringify(publicRecord, null, 2), { mode: 0o600 });
    await fs.promises.rm(target, { force: true });
    await fs.promises.rename(part, target);
  }

  loadInstallationRecord() {
    if (!this.dataDir) return null;
    try {
      const root = this.resolveRuntimeRootV2();
      const installsRoot = fs.realpathSync(path.join(root, 'installs'));
      const record = JSON.parse(fs.readFileSync(path.join(root, 'active.json'), 'utf8'));
      if (
        record?.verified !== true ||
        record.state !== 'ready' ||
        typeof record.runtimeRoot !== 'string' ||
        typeof record.adapterId !== 'string' ||
        !this.getProfile(record.profileId)
      ) {
        return null;
      }
      const runtimeRoot = fs.realpathSync(record.runtimeRoot);
      this.assertInside(installsRoot, runtimeRoot);
      if (!fs.statSync(runtimeRoot).isDirectory()) return null;
      return { ...record, runtimeRoot };
    } catch (_) {
      return null;
    }
  }

  async startManagedRuntime({ adapter, allowUnverified = false } = {}) {
    if (this.managedChild && this.managedChild.exitCode === null) {
      this.touchActivity();
      return this.getProcessState();
    }
    const installation = this.installation;
    if (!installation || (!installation.verified && !allowUnverified)) {
      throw new Error('STREAM_MONSTERS_RUNTIME_NOT_INSTALLED');
    }
    const profile = this.getProfile(installation.profileId);
    if (!profile) throw new Error('STREAM_MONSTERS_RUNTIME_PROFILE_INVALID');
    const selectedAdapter = adapter || { id: installation.adapterId, name: installation.adapterId };
    if (selectedAdapter.id !== installation.adapterId) {
      throw new Error('STREAM_MONSTERS_RUNTIME_ADAPTER_MISMATCH');
    }
    const runtimeRoot = fs.realpathSync(installation.runtimeRoot);
    const pythonPath = this.resolveExistingInside(runtimeRoot, profile.pythonRelativePath);
    const mainPath = this.resolveExistingInside(runtimeRoot, profile.mainRelativePath);
    const port = await this.findFreePort();
    const args = [
      '-s',
      mainPath,
      '--listen',
      '127.0.0.1',
      '--port',
      String(port),
      '--disable-auto-launch'
    ];
    const child = this.spawn(pythonPath, args, {
      cwd: runtimeRoot,
      windowsHide: true,
      detached: false,
      stdio: 'ignore',
      shell: false
    });
    this.managedChild = child;
    this.processState = {
      state: 'starting',
      pid: child.pid || null,
      port,
      baseUrl: `http://127.0.0.1:${port}`,
      adapterId: selectedAdapter.id,
      profileId: profile.id
    };
    child.once?.('exit', () => {
      if (this.managedChild === child) {
        this.managedChild = null;
        this.processState = { ...this.processState, state: 'stopped', pid: null };
      }
    });
    child.once?.('error', () => {});
    if (child.exitCode !== null && child.exitCode !== undefined) {
      throw new Error('STREAM_MONSTERS_RUNTIME_CHILD_EXITED');
    }
    try {
      await this.verifyManagedRuntime({
        adapter: selectedAdapter,
        profile,
        baseUrl: this.processState.baseUrl,
        child
      });
    } catch (error) {
      await this.stopManagedRuntime();
      throw error;
    }
    this.processState = { ...this.processState, state: 'running' };
    this.current = {
      state: 'ready',
      runtimeRoot,
      comfyRootDir: path.join(runtimeRoot, 'ComfyUI'),
      pid: child.pid || null,
      port,
      recommendation: this.recommend(selectedAdapter),
      manifestVersion: profile.version
    };
    this.touchActivity();
    return this.getProcessState();
  }

  async verifyManagedRuntime({ adapter, profile, baseUrl = this.processState.baseUrl, child = this.managedChild } = {}) {
    let response = null;
    for (let attempt = 0; attempt < this.healthAttempts; attempt += 1) {
      if (!child || (child.exitCode !== null && child.exitCode !== undefined)) {
        throw new Error('STREAM_MONSTERS_RUNTIME_CHILD_EXITED');
      }
      try {
        const candidate = await this.fetch(`${baseUrl}/system_stats`, { redirect: 'manual' });
        if (candidate?.ok && !REDIRECT_STATUSES.has(Number(candidate?.status))) {
          response = candidate;
          break;
        }
      } catch (_) {}
      if (attempt + 1 < this.healthAttempts && this.healthRetryDelayMs > 0) {
        await new Promise(resolve => this.setTimeout(resolve, this.healthRetryDelayMs));
      }
    }
    if (!response) throw new Error('STREAM_MONSTERS_RUNTIME_HEALTHCHECK_FAILED');
    const stats = await response.json();
    const serialized = JSON.stringify(stats).toLowerCase();
    if (!serialized.includes(String(adapter.name || adapter.id || '').toLowerCase())) {
      throw new Error('STREAM_MONSTERS_RUNTIME_DEVICE_MISMATCH');
    }
    if (!serialized.includes(String(profile.backend || '').toLowerCase())) {
      throw new Error('STREAM_MONSTERS_RUNTIME_BACKEND_MISMATCH');
    }
    const smoke = await this.smokeTest({
      baseUrl,
      width: 256,
      height: 256,
      adapter,
      profile,
      model: { ...MANAGED_RUNTIME_CATALOG.model }
    });
    if (!smoke?.ok || smoke.width !== 256 || smoke.height !== 256) {
      throw new Error('STREAM_MONSTERS_RUNTIME_SMOKE_TEST_FAILED');
    }
    this.lastSmokeTest = {
      state: 'passed',
      width: smoke.width,
      height: smoke.height,
      completedAt: new Date().toISOString()
    };
    return this.lastSmokeTest;
  }

  async runGenerationSmokeTest({ baseUrl, width, height, model }) {
    const workflow = {
      '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: model.fileName } },
      '2': { class_type: 'EmptyLatentImage', inputs: { width, height, batch_size: 1 } },
      '3': { class_type: 'CLIPTextEncode', inputs: { text: 'small blue crystal monster egg', clip: ['1', 1] } },
      '4': { class_type: 'CLIPTextEncode', inputs: { text: 'text, watermark', clip: ['1', 1] } },
      '5': {
        class_type: 'KSampler',
        inputs: {
          seed: 1,
          steps: 4,
          cfg: 0,
          sampler_name: 'euler',
          scheduler: 'sgm_uniform',
          denoise: 1,
          model: ['1', 0],
          positive: ['3', 0],
          negative: ['4', 0],
          latent_image: ['2', 0]
        }
      },
      '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
      '7': { class_type: 'SaveImage', inputs: { filename_prefix: 'streammonsters-smoke', images: ['6', 0] } }
    };
    const submitted = await this.fetch(`${baseUrl}/prompt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: workflow })
    });
    if (!submitted?.ok) return { ok: false, width, height };
    const payload = await submitted.json();
    const promptId = payload.prompt_id;
    if (!promptId) return { ok: false, width, height };
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const history = await this.fetch(`${baseUrl}/history/${encodeURIComponent(promptId)}`);
      if (history?.ok) {
        const body = await history.json();
        if (body?.[promptId]?.outputs) return { ok: true, width, height };
      }
      await new Promise(resolve => this.setTimeout(resolve, 500));
    }
    return { ok: false, width, height };
  }

  findAvailablePort() {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.unref();
      server.once('error', reject);
      server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
        const address = server.address();
        const port = typeof address === 'object' && address ? address.port : null;
        server.close(error => error ? reject(error) : resolve(port));
      });
    });
  }

  touchActivity() {
    if (this.idleTimer) this.clearTimeout(this.idleTimer);
    this.idleTimer = this.setTimeout(() => this.stopManagedRuntime(), this.idleTimeoutMs);
    this.idleTimer?.unref?.();
  }

  async stopManagedRuntime() {
    if (this.idleTimer) {
      this.clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    const child = this.managedChild;
    if (child) {
      this.managedChild = null;
      try { child.kill(); } catch (_) {}
    }
    this.processState = { ...this.processState, state: 'stopped', pid: null };
    this.current = this.current ? { ...this.current, state: 'stopped', pid: null } : null;
    return this.getProcessState();
  }

  getProcessState() {
    return { ...this.processState };
  }

  async destroy() {
    for (const job of this.jobs.values()) {
      if (!['ready', 'failed', 'cancelled'].includes(job.state)) this.cancelInstallJob(job.jobId);
    }
    await this.stopManagedRuntime();
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
    await this.inspectArchive({ archivePath: archive, runtimeRoot, archiveType: manifest.archiveType });
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

  async downloadArtifact({
    url,
    targetPath,
    expectedSize = 0,
    sha256,
    signal = null,
    onProgress = () => {}
  }) {
    this.throwIfAborted(signal);
    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
    const partPath = `${targetPath}.part`;
    let completedBytes = 0;
    try {
      completedBytes = (await fs.promises.stat(partPath)).size;
    } catch (_) {}
    if (expectedSize > 0 && completedBytes === Number(expectedSize)) {
      const complete = await this.verify({ archivePath: partPath, sha256 });
      if (complete) {
        await fs.promises.rm(targetPath, { force: true });
        await fs.promises.rename(partPath, targetPath);
        onProgress({ phase: 'download', completedBytes, totalBytes: Number(expectedSize) });
        return targetPath;
      }
      await fs.promises.rm(partPath, { force: true });
      completedBytes = 0;
    }
    const headers = completedBytes > 0 ? { Range: `bytes=${completedBytes}-` } : undefined;
    const response = await this.fetchArchive(url, { signal, headers });
    if (!response?.ok || !response.body) {
      await this.releaseResponseBody(response);
      throw new Error(`STREAM_MONSTERS_RUNTIME_DOWNLOAD_HTTP_${response?.status || 'UNKNOWN'}`);
    }
    const append = completedBytes > 0 && Number(response.status) === 206;
    if (!append) completedBytes = 0;
    const source = response.body.getReader && Readable.fromWeb
      ? Readable.fromWeb(response.body)
      : Readable.from(response.body);
    source.on('data', chunk => {
      completedBytes += chunk.length;
      onProgress({
        phase: 'download',
        completedBytes,
        totalBytes: Math.max(0, Number(expectedSize) || 0)
      });
    });
    await pipeline(
      source,
      fs.createWriteStream(partPath, { flags: append ? 'a' : 'w' }),
      ...(signal ? [{ signal }] : [])
    );
    this.throwIfAborted(signal);
    if (expectedSize > 0 && completedBytes !== Number(expectedSize)) {
      throw new Error('STREAM_MONSTERS_RUNTIME_DOWNLOAD_SIZE_MISMATCH');
    }
    const verified = await this.verify({ archivePath: partPath, sha256 });
    if (!verified) {
      await fs.promises.rm(partPath, { force: true });
      throw new Error('STREAM_MONSTERS_RUNTIME_CHECKSUM_MISMATCH');
    }
    await fs.promises.rm(targetPath, { force: true });
    await fs.promises.rename(partPath, targetPath);
    return targetPath;
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

  async fetchArchive(initialUrl, { signal = null, headers = undefined } = {}) {
    let current = this.validateArchiveUrl(initialUrl);
    for (let redirects = 0; redirects <= this.maxArchiveRedirects; redirects += 1) {
      this.throwIfAborted(signal);
      const options = { redirect: 'manual' };
      if (signal) options.signal = signal;
      if (headers) options.headers = headers;
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

  async inspect({ archivePath, runtimeRoot, archiveType = 'zip' }) {
    if (archiveType === '7z') {
      return this.inspectSevenZip({ archivePath, runtimeRoot });
    }
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
            if (seenEntries > this.maxArchiveEntries || totalBytes > this.maxArchiveUncompressedBytes) {
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

  async inspectSevenZip({ archivePath, runtimeRoot }) {
    const { stdout } = await this.runTar(['-tvf', archivePath]);
    const lines = String(stdout || '').split(/\r?\n/).filter(Boolean);
    if (lines.length > this.maxArchiveEntries) {
      throw new Error('STREAM_MONSTERS_RUNTIME_ARCHIVE_ENTRY_UNSAFE');
    }
    let totalBytes = 0;
    for (const line of lines) {
      const type = line[0];
      if (!['-', 'd'].includes(type)) {
        throw new Error('STREAM_MONSTERS_RUNTIME_ARCHIVE_ENTRY_UNSAFE');
      }
      const match = line.match(/^\S+\s+\S+\s+\S+\s+(\d+)\s+\S+\s+\S+\s+\S+\s+(.+)$/);
      if (!match) throw new Error('STREAM_MONSTERS_RUNTIME_ARCHIVE_ENTRY_UNSAFE');
      totalBytes += Number(match[1]) || 0;
      if (totalBytes > this.maxArchiveUncompressedBytes) {
        throw new Error('STREAM_MONSTERS_RUNTIME_ARCHIVE_ENTRY_UNSAFE');
      }
      const entryName = match[2];
      if (entryName.includes(' -> ') || entryName.includes(' link to ')) {
        throw new Error('STREAM_MONSTERS_RUNTIME_ARCHIVE_ENTRY_UNSAFE');
      }
      try {
        this.validateRelativePath(entryName.replace(/[\\/]$/, ''));
        this.resolveInside(runtimeRoot, entryName);
      } catch (_) {
        throw new Error('STREAM_MONSTERS_RUNTIME_ARCHIVE_ENTRY_UNSAFE');
      }
    }
  }

  async extractSevenZip({ archivePath, runtimeRoot }) {
    await fs.promises.mkdir(runtimeRoot, { recursive: true });
    await this.runTar(['-xf', archivePath, '-C', runtimeRoot]);
  }

  runTar(args) {
    return new Promise((resolve, reject) => {
      this.execFile('tar.exe', args, {
        windowsHide: true,
        shell: false,
        maxBuffer: 64 * 1024 * 1024
      }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error('STREAM_MONSTERS_RUNTIME_ARCHIVE_INVALID'));
          return;
        }
        resolve({ stdout, stderr });
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

  async extract({ archivePath, runtimeRoot, archiveType = 'zip' }) {
    if (archiveType === '7z') {
      return this.extractSevenZip({ archivePath, runtimeRoot });
    }
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
