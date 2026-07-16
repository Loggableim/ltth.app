const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const YtDlpRunner = require('./yt-dlp-runner');

const DEFAULT_TTL_DAYS = 30;
const DEFAULT_MAX_SIZE_MB = 2048;

class MediaCache {
  constructor(config = {}, api = {}, dependencies = {}) {
    this.config = config || {};
    this.api = api || {};
    this.now = dependencies.now || (() => Date.now());
    this.cacheDir = this.config.cacheDir || path.join(
      this.api.getPluginDataDir?.() || process.cwd(),
      'music-cache'
    );
    this.ttlDays = this._positiveNumber(
      this.config.cacheTTLDays ?? this.config.ttlDays,
      DEFAULT_TTL_DAYS
    );
    this.maxSizeMB = this._positiveNumber(
      this.config.maxCacheSizeMB ?? this.config.maxSizeMB,
      DEFAULT_MAX_SIZE_MB
    );
    this.inflight = new Map();
    this.jobControllers = new Set();
    this.pinnedKeys = new Set();
    this.destroyed = false;
    this.ownsRunner = !dependencies.runner;
    this.runner = dependencies.runner || new YtDlpRunner({
      maxConcurrent: this._positiveNumber(this.config.maxConcurrentDownloads, 2),
      maxQueue: this._positiveNumber(this.config.maxQueuedDownloads, 100),
      spawnImpl: dependencies.spawn,
      taskkillImpl: dependencies.taskkill,
      platform: dependencies.platform || (dependencies.spawn ? 'test' : process.platform),
      logger: this.api
    });
    fs.mkdirSync(this.cacheDir, { recursive: true });
  }

  get(trackKey) {
    if (!trackKey) return null;
    const filePath = this._findPublishedFile(trackKey);
    if (!filePath) return null;
    try {
      const timestamp = new Date(this.now());
      fs.utimesSync(filePath, timestamp, timestamp);
      return filePath;
    } catch (_error) {
      return null;
    }
  }

  has(trackKey) {
    return Boolean(this.get(trackKey));
  }

  pin(trackKey) {
    if (trackKey) this.pinnedKeys.add(String(trackKey));
  }

  unpin(trackKey) {
    this.pinnedKeys.delete(String(trackKey || ''));
  }

  setPinned(trackKey, pinned = true) {
    if (pinned) this.pin(trackKey);
    else this.unpin(trackKey);
  }

  download(trackKey, url, options = {}) {
    return this.getOrDownload({ trackKey, url }, options);
  }

  getOrDownload(track, options = {}) {
    if (this.destroyed) {
      return Promise.reject(new Error('Media cache is destroyed'));
    }
    const trackKey = String(track?.trackKey || '').trim();
    const url = String(track?.url || track?.webpageUrl || '').trim();
    if (!trackKey || !url) {
      return Promise.reject(new Error('trackKey and url are required'));
    }

    const cached = this.get(trackKey);
    if (cached) return Promise.resolve(cached);
    if (this.inflight.has(trackKey)) return this.inflight.get(trackKey);

    const promise = this._startDownload(trackKey, url, options);
    this.inflight.set(trackKey, promise);
    promise.then(
      () => this.inflight.delete(trackKey),
      () => this.inflight.delete(trackKey)
    );
    return promise;
  }

  async prune(options = {}) {
    const files = this._publishedFiles();
    const ttlMs = this.ttlDays * 24 * 60 * 60 * 1000;
    const now = this.now();
    const protectedHashes = new Set(
      (options.protectedKeys || []).map((key) => this._hash(key))
    );
    let remaining = files;

    if (ttlMs > 0) {
      remaining = files.filter((entry) => {
        if (entry.pinned || protectedHashes.has(entry.hash) || now - entry.stat.mtimeMs <= ttlMs) {
          return true;
        }
        this._removeFile(entry.path);
        return false;
      });
    }

    const maxBytes = this.maxSizeMB * 1024 * 1024;
    let bytes = remaining.reduce((sum, entry) => sum + entry.stat.size, 0);
    const lru = remaining
      .filter((entry) => !entry.pinned && !protectedHashes.has(entry.hash))
      .sort((a, b) => a.stat.atimeMs - b.stat.atimeMs || a.path.localeCompare(b.path));
    const removed = new Set();
    for (const entry of lru) {
      if (bytes <= maxBytes) break;
      this._removeFile(entry.path);
      bytes -= entry.stat.size;
      removed.add(entry.path);
    }

    remaining = remaining.filter((entry) => !removed.has(entry.path));
    return { bytes: Math.max(0, bytes), files: remaining.length };
  }

  getStats() {
    const files = this._publishedFiles();
    const runner = this.runner.getStatus?.() || {};
    return {
      directory: this.cacheDir,
      files: files.length,
      bytes: files.reduce((sum, entry) => sum + entry.stat.size, 0),
      inflight: this.inflight.size,
      pinned: this.pinnedKeys.size,
      runner
    };
  }

  async destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const controller of [...this.jobControllers]) controller.abort();
    if (this.ownsRunner) await this.runner.destroy();
    await Promise.allSettled([...this.inflight.values()]);
    this.inflight.clear();
  }

  async _startDownload(trackKey, url, options) {
    const hash = this._hash(trackKey);
    const nonce = crypto.randomBytes(6).toString('hex');
    const temporaryPrefix = `${hash}.download-${nonce}`;
    const outputTemplate = path.join(this.cacheDir, `${temporaryPrefix}.%(ext)s`);
    const args = [
      '--no-warnings',
      '--no-playlist',
      '--format',
      'bestaudio/best',
      '--output',
      outputTemplate,
      '--print',
      'after_move:filepath',
      url
    ];
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort();
    if (options.signal?.aborted) controller.abort();
    else options.signal?.addEventListener?.('abort', abortFromCaller, { once: true });
    this.jobControllers.add(controller);

    try {
      const stdout = await this._runWithAbort(
        options.ytdlpPath || this.config.ytdlpPath || 'yt-dlp',
        args,
        {
          signal: controller.signal,
          deadline: options.deadline || Date.now() + this._positiveNumber(
            this.config.downloadTimeoutMs,
            45000
          ),
          priority: options.priority
        }
      );
      if (this.destroyed || controller.signal.aborted) {
        throw new Error('Media cache download aborted');
      }
      const downloadedPath = this._resolveDownloadedPath(stdout, temporaryPrefix);
      if (!downloadedPath) throw new Error('yt-dlp did not publish a cache file');
      const stat = fs.statSync(downloadedPath);
      if (!stat.isFile() || stat.size <= 0) throw new Error('Downloaded cache file is empty');
      const extension = this._safeExtension(downloadedPath);
      const finalPath = path.join(this.cacheDir, `${hash}${extension}`);
      if (fs.existsSync(finalPath)) fs.rmSync(finalPath, { force: true });
      fs.renameSync(downloadedPath, finalPath);
      const timestamp = new Date(this.now());
      fs.utimesSync(finalPath, timestamp, timestamp);
      this._removeTemporaryFiles(temporaryPrefix);
      await this.prune({ protectedKeys: [trackKey] });
      if (stat.size > this.maxSizeMB * 1024 * 1024) {
        this._removeFile(finalPath);
        throw new Error('Downloaded cache file exceeds the configured cache limit');
      }
      return finalPath;
    } finally {
      options.signal?.removeEventListener?.('abort', abortFromCaller);
      this.jobControllers.delete(controller);
      this._removeTemporaryFiles(temporaryPrefix);
    }
  }

  async _runWithAbort(executable, args, options) {
    if (options.signal.aborted) throw new Error('Media cache download aborted');
    let abortListener;
    const aborted = new Promise((resolve, reject) => {
      abortListener = () => reject(new Error('Media cache download aborted'));
      options.signal.addEventListener('abort', abortListener, { once: true });
    });
    try {
      return await Promise.race([
        this.runner.run(executable, args, options),
        aborted
      ]);
    } finally {
      options.signal.removeEventListener('abort', abortListener);
    }
  }

  _resolveDownloadedPath(stdout, temporaryPrefix) {
    const candidates = String(stdout || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .reverse();
    const expectedRoot = `${path.resolve(this.cacheDir)}${path.sep}`.toLowerCase();
    for (const candidate of candidates) {
      const resolved = path.resolve(candidate);
      if (resolved.toLowerCase().startsWith(expectedRoot) && fs.existsSync(resolved)) {
        return resolved;
      }
    }
    const fallback = fs.readdirSync(this.cacheDir)
      .find((name) => name.startsWith(`${temporaryPrefix}.`));
    return fallback ? path.join(this.cacheDir, fallback) : null;
  }

  _findPublishedFile(trackKey) {
    const hash = this._hash(trackKey);
    const name = fs.readdirSync(this.cacheDir).find(
      (entry) => entry.startsWith(`${hash}.`) && !entry.includes('.download-')
    );
    if (!name) return null;
    const filePath = path.join(this.cacheDir, name);
    try {
      const stat = fs.statSync(filePath);
      if (stat.isFile() && stat.size > 0) return filePath;
      this._removeFile(filePath);
    } catch (_error) {
      // A concurrent prune may remove a candidate between readdir and stat.
    }
    return null;
  }

  _publishedFiles() {
    const pinnedHashes = new Set([...this.pinnedKeys].map((key) => this._hash(key)));
    return fs.readdirSync(this.cacheDir)
      .filter((name) => /^[a-f0-9]{64}\.[^.]+$/i.test(name))
      .map((name) => {
        const filePath = path.join(this.cacheDir, name);
        try {
          const stat = fs.statSync(filePath);
          if (!stat.isFile() || stat.size <= 0) return null;
          return {
            path: filePath,
            stat,
            hash: name.slice(0, 64),
            pinned: pinnedHashes.has(name.slice(0, 64))
          };
        } catch (_error) {
          return null;
        }
      })
      .filter(Boolean);
  }

  _removeTemporaryFiles(prefix) {
    try {
      fs.readdirSync(this.cacheDir)
        .filter((name) => name.startsWith(`${prefix}.`))
        .forEach((name) => this._removeFile(path.join(this.cacheDir, name)));
    } catch (_error) {
      // Best-effort cleanup; the next prune can retry.
    }
  }

  _removeFile(filePath) {
    try {
      fs.rmSync(filePath, { force: true });
    } catch (error) {
      this.api.log?.(`[music-bot] Failed to remove cached media: ${error.message}`, 'debug');
    }
  }

  _safeExtension(filePath) {
    const extension = path.extname(filePath).toLowerCase();
    return /^\.[a-z0-9]{1,10}$/.test(extension) ? extension : '.media';
  }

  _hash(trackKey) {
    return crypto.createHash('sha256').update(String(trackKey)).digest('hex');
  }

  _positiveNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}

module.exports = MediaCache;
