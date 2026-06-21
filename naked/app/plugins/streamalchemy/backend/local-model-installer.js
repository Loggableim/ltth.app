const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');

const DEFAULT_MODEL = 'black-forest-labs/FLUX.1-schnell';
const DEFAULT_MODEL_FILE = 'flux1-schnell.safetensors';
const DEFAULT_MODEL_DIRECTORY = 'local-models';
const DEFAULT_MODEL_DOWNLOAD_URL = 'https://huggingface.co/black-forest-labs/FLUX.1-schnell/resolve/main/flux1-schnell.safetensors';

class LocalModelInstaller {
  constructor({ dataDir, fetchImpl = global.fetch, logger = null, env = process.env } = {}) {
    this.dataDir = dataDir;
    this.fetch = fetchImpl;
    this.logger = logger;
    this.env = env;
    this.currentJob = null;
  }

  async getStatus(config = {}) {
    const resolved = this.resolveConfig(config);
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
      await fs.promises.mkdir(job.targetDir, { recursive: true });
      await fs.promises.rm(job.partialPath, { force: true });

      this.logger?.info?.(`[STREAMALCHEMY] Installing local model ${job.model} to ${job.targetPath}`);
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

      await pipeline(source, progress, fs.createWriteStream(job.partialPath));

      if (hash) {
        const actual = hash.digest('hex');
        if (actual !== job.checksumSha256) {
          throw new Error('MODEL_CHECKSUM_MISMATCH');
        }
      }

      await fs.promises.rename(job.partialPath, job.targetPath);
      const stat = await fs.promises.stat(job.targetPath);
      job.state = 'installed';
      job.bytesDownloaded = stat.size;
      job.bytesTotal = job.bytesTotal || stat.size;
      job.finishedAt = new Date().toISOString();
      this.logger?.info?.(`[STREAMALCHEMY] Local model installed: ${job.targetPath}`);
      return this.formatJobStatus(job);
    } catch (error) {
      job.state = 'failed';
      job.error = error.message;
      job.finishedAt = new Date().toISOString();
      await fs.promises.rm(job.partialPath, { force: true }).catch(() => {});
      this.logger?.error?.(`[STREAMALCHEMY] Local model install failed: ${error.message}`);
      return this.formatJobStatus(job);
    }
  }

  resolveConfig(config = {}) {
    if (!this.dataDir) {
      throw new Error('MODEL_INSTALL_DATA_DIR_MISSING');
    }

    const model = this.cleanString(config.model) || DEFAULT_MODEL;
    const fileName = this.safeFileName(config.modelFile) || this.fileNameFromModel(model);
    const modelDirectory = this.safeRelativeDirectory(config.modelDirectory) || DEFAULT_MODEL_DIRECTORY;
    const downloadUrl = this.cleanString(config.modelDownloadUrl) || (
      model === DEFAULT_MODEL ? DEFAULT_MODEL_DOWNLOAD_URL : null
    );
    const checksumSha256 = this.normalizeChecksum(config.modelChecksumSha256);
    const modelAuthToken = this.cleanString(config.modelAuthToken);
    const targetDir = path.resolve(this.dataDir, modelDirectory);
    const targetPath = path.resolve(targetDir, fileName);
    const root = path.resolve(this.dataDir);

    if (!this.isPathInside(root, targetPath)) {
      throw new Error('MODEL_INSTALL_PATH_INVALID');
    }

    return {
      model,
      fileName,
      modelDirectory,
      downloadUrl,
      checksumSha256,
      modelAuthToken,
      targetDir,
      targetPath,
      partialPath: `${targetPath}.part`
    };
  }

  formatBaseStatus(resolved) {
    return {
      model: resolved.model,
      fileName: resolved.fileName,
      modelDirectory: resolved.modelDirectory,
      targetPath: resolved.targetPath,
      downloadUrl: resolved.downloadUrl,
      canInstall: this.isValidHttpUrl(resolved.downloadUrl)
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

  safeFileName(value) {
    const candidate = this.cleanString(value);
    if (!candidate) return null;
    const baseName = path.basename(candidate);
    if (baseName !== candidate || baseName === '.' || baseName === '..') {
      throw new Error('MODEL_FILE_NAME_INVALID');
    }
    return baseName.replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  safeRelativeDirectory(value) {
    const candidate = this.cleanString(value);
    if (!candidate) return null;
    const normalized = path.normalize(candidate);
    if (path.isAbsolute(normalized) || normalized.split(path.sep).includes('..')) {
      throw new Error('MODEL_DIRECTORY_INVALID');
    }
    return normalized;
  }

  fileNameFromModel(model) {
    const lastSegment = String(model).split(/[\\/]/).filter(Boolean).pop() || DEFAULT_MODEL_FILE;
    const withExtension = path.extname(lastSegment) ? lastSegment : `${lastSegment}.safetensors`;
    return this.safeFileName(withExtension) || DEFAULT_MODEL_FILE;
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
      return await fs.promises.stat(targetPath);
    } catch (error) {
      return null;
    }
  }

  safeStatSync(targetPath) {
    try {
      return fs.statSync(targetPath);
    } catch (error) {
      return null;
    }
  }
}

module.exports = LocalModelInstaller;
