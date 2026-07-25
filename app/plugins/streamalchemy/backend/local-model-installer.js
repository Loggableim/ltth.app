const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');
const ModelCatalog = require('./model-catalog');

class LocalModelInstaller {
  constructor({ dataDir, fetchImpl = global.fetch, logger = null, env = process.env, catalog = new ModelCatalog(), fsImpl = fs } = {}) {
    this.dataDir = dataDir;
    this.fetch = fetchImpl;
    this.logger = logger;
    this.env = env;
    this.catalog = catalog;
    this.fs = fsImpl;
    this.currentJob = null;
  }

  async getStatus(config = {}) {
    const resolved = this.resolveConfig(config);
    if (!resolved.targetPath) {
      return {
        ...this.formatBaseStatus(resolved),
        state: 'missing',
        sizeBytes: 0
      };
    }

    const activeJob = this.getActiveJobForPath(resolved.targetPath);
    if (activeJob) {
      return this.formatJobStatus(activeJob);
    }

    const fileStat = await this.safeStat(resolved.targetPath);
    if (fileStat?.isFile()) {
      return {
        ...this.formatBaseStatus(resolved),
        state: 'installed',
        sizeBytes: fileStat.size
      };
    }

    const failedJob = this.getFailedJobForPath(resolved.targetPath);
    if (failedJob) {
      return this.formatJobStatus(failedJob);
    }

    const partialStat = await this.safeStat(resolved.partialPath);
    if (partialStat?.isFile()) {
      return {
        ...this.formatBaseStatus(resolved),
        state: 'partial',
        sizeBytes: partialStat.size
      };
    }

    return {
      ...this.formatBaseStatus(resolved),
      state: 'missing',
      sizeBytes: 0
    };
  }

  startInstall(config = {}) {
    const resolved = this.resolveConfig(config);
    if (!resolved.canInstall) {
      throw new Error(resolved.installMethod === 'one_click'
        ? 'MODEL_INSTALL_REQUIRES_COMFY_ROOT'
        : 'MODEL_INSTALL_MANUAL_ONLY');
    }
    this.assertValidDownloadUrl(resolved.downloadUrl);

    const activeJob = this.getActiveJobForPath(resolved.targetPath);
    if (activeJob) {
      return this.formatJobStatus(activeJob);
    }

    if (this.currentJob?.state === 'installing') {
      throw new Error('MODEL_INSTALL_ALREADY_RUNNING');
    }

    const existingStat = this.safeStatSync(resolved.targetPath);
    if (existingStat?.isFile()) {
      return {
        ...this.formatBaseStatus(resolved),
        state: 'installed',
        sizeBytes: existingStat.size
      };
    }

    const job = {
      ...resolved,
      state: 'installing',
      bytesDownloaded: 0,
      bytesTotal: null,
      startedAt: new Date().toISOString(),
      error: null,
      promise: null
    };

    job.promise = this.runInstall(job);
    this.currentJob = job;
    return this.formatJobStatus(job);
  }

  async waitForCurrentInstall() {
    if (!this.currentJob?.promise) {
      return null;
    }
    return this.currentJob.promise;
  }

  async runInstall(job) {
    try {
      await this.fs.promises.mkdir(job.targetDir, { recursive: true });
      await this.fs.promises.rm(job.partialPath, { force: true });

      this.logger?.info?.(`[STREAM MONSTERS] Installing local model ${job.modelName} to ${job.targetPath}`);
      const fetchOptions = this.createFetchOptions(job);
      const response = fetchOptions
        ? await this.fetch(job.downloadUrl, fetchOptions)
        : await this.fetch(job.downloadUrl);
      if (!response?.ok) {
        throw new Error(`MODEL_DOWNLOAD_HTTP_${response?.status || 'UNKNOWN'}`);
      }

      const contentLength = Number(response.headers?.get?.('content-length')) || null;
      job.bytesTotal = contentLength;

      const source = this.toNodeReadable(response.body);
      if (!source) {
        throw new Error('MODEL_DOWNLOAD_EMPTY_BODY');
      }

      const hash = job.checksumSha256 ? crypto.createHash('sha256') : null;
      const progress = new Transform({
        transform: (chunk, encoding, callback) => {
          job.bytesDownloaded += chunk.length;
          hash?.update(chunk);
          callback(null, chunk);
        }
      });

      await pipeline(source, progress, this.fs.createWriteStream(job.partialPath));

      if (hash) {
        const actual = hash.digest('hex');
        if (actual !== job.checksumSha256) {
          throw new Error('MODEL_CHECKSUM_MISMATCH');
        }
      }

      await this.fs.promises.rename(job.partialPath, job.targetPath);
      const stat = await this.fs.promises.stat(job.targetPath);
      job.state = 'installed';
      job.bytesDownloaded = stat.size;
      job.bytesTotal = job.bytesTotal || stat.size;
      job.finishedAt = new Date().toISOString();
      this.logger?.info?.(`[STREAM MONSTERS] Local model installed: ${job.targetPath}`);
      return this.formatJobStatus(job);
    } catch (error) {
      job.state = 'failed';
      job.error = error.message;
      job.finishedAt = new Date().toISOString();
      await this.fs.promises.rm(job.partialPath, { force: true }).catch(() => {});
      this.logger?.error?.(`[STREAM MONSTERS] Local model install failed: ${error.message}`);
      return this.formatJobStatus(job);
    }
  }

  resolveConfig(config = {}) {
    const preset = this.catalog.resolveConfigPreset(config);
    const comfyRootDir = this.cleanString(config.comfyRootDir) || this.dataDir || null;
    if (!comfyRootDir) {
      throw new Error('MODEL_INSTALL_DATA_DIR_MISSING');
    }

    const targetPath = this.catalog.resolveTargetPath(preset, comfyRootDir);
    const targetDir = targetPath ? path.dirname(targetPath) : null;
    const checksumSha256 = this.normalizeChecksum(config.modelChecksumSha256);
    const modelAuthToken = this.cleanString(config.modelAuthToken);
    const root = path.resolve(comfyRootDir);

    if (targetPath && !this.isPathInside(root, targetPath)) {
      throw new Error('MODEL_INSTALL_PATH_INVALID');
    }

    return {
      presetId: preset.id,
      model: preset.id,
      modelName: preset.source,
      fileName: preset.fileName,
      modelDirectory: path.dirname(preset.targetRelativePath),
      downloadUrl: preset.downloadUrl,
      checksumSha256,
      modelAuthToken,
      targetDir,
      targetPath,
      partialPath: targetPath ? `${targetPath}.part` : null,
      installMethod: preset.installMethod,
      workflowId: preset.workflowId,
      canInstall: Boolean(config.comfyRootDir && preset.installMethod === 'one_click')
    };
  }

  formatBaseStatus(resolved) {
    return {
      presetId: resolved.presetId,
      model: resolved.model,
      modelName: resolved.modelName,
      fileName: resolved.fileName,
      modelDirectory: resolved.modelDirectory,
      targetPath: resolved.targetPath,
      downloadUrl: resolved.downloadUrl,
      installMethod: resolved.installMethod,
      workflowId: resolved.workflowId,
      canInstall: Boolean(resolved.canInstall && this.isValidHttpUrl(resolved.downloadUrl))
    };
  }

  formatJobStatus(job) {
    return {
      ...this.formatBaseStatus(job),
      state: job.state,
      bytesDownloaded: job.bytesDownloaded,
      bytesTotal: job.bytesTotal,
      sizeBytes: job.state === 'installed' ? job.bytesDownloaded : undefined,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      error: job.error
    };
  }

  getActiveJobForPath(targetPath) {
    if (this.currentJob?.state === 'installing' && this.currentJob.targetPath === targetPath) {
      return this.currentJob;
    }
    return null;
  }

  getFailedJobForPath(targetPath) {
    if (this.currentJob?.state === 'failed' && this.currentJob.targetPath === targetPath) {
      return this.currentJob;
    }
    return null;
  }

  toNodeReadable(body) {
    if (!body) return null;
    if (typeof body.pipe === 'function') return body;
    if (typeof body.getReader === 'function' && typeof Readable.fromWeb === 'function') {
      return Readable.fromWeb(body);
    }
    if (typeof body[Symbol.asyncIterator] === 'function') {
      return Readable.from(body);
    }
    return Readable.from([body]);
  }

  createFetchOptions(job) {
    const token = job.modelAuthToken || this.cleanString(this.env.HF_TOKEN) || this.cleanString(this.env.HUGGINGFACE_TOKEN);
    if (!token || !this.isHuggingFaceUrl(job.downloadUrl)) {
      return null;
    }
    return {
      headers: {
        Authorization: `Bearer ${token}`
      }
    };
  }

  assertValidDownloadUrl(url) {
    if (!this.isValidHttpUrl(url)) {
      throw new Error('MODEL_DOWNLOAD_URL_INVALID');
    }
  }

  isValidHttpUrl(value) {
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (error) {
      return false;
    }
  }

  isHuggingFaceUrl(value) {
    try {
      const parsed = new URL(value);
      return parsed.hostname === 'huggingface.co' || parsed.hostname.endsWith('.huggingface.co');
    } catch (error) {
      return false;
    }
  }

  isPathInside(root, candidate) {
    const relative = path.relative(root, candidate);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  }

  normalizeChecksum(value) {
    const checksum = this.cleanString(value);
    return /^[a-f0-9]{64}$/i.test(checksum) ? checksum.toLowerCase() : null;
  }

  cleanString(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  async safeStat(targetPath) {
    try {
      return await this.fs.promises.stat(targetPath);
    } catch (error) {
      return null;
    }
  }

  safeStatSync(targetPath) {
    try {
      return this.fs.statSync(targetPath);
    } catch (error) {
      return null;
    }
  }
}

module.exports = LocalModelInstaller;
