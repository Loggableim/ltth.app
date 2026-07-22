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
    this.pruneBatchSize = Math.max(1, Math.floor(Number(this.config.pruneBatchSize) || 25));
    this._scheduledPrune = null;
    this._scheduledPruneProtectedKeys = new Set();
    this.ownsRunner = !dependencies.runner;
    this.runner = dependencies.runner || new YtDlpRunner({
      maxConcurrent: this._positiveNumber(this.config.maxConcurrentDownloads, 2),
      maxQueue: this._positiveNumber(this.config.maxQueuedDownloads, 100),
      spawnImpl: dependencies.spawn,
      taskkillImpl: dependencies.taskkill,
      processKill: dependencies.processKill,
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
      remaining = [];
      for (let index = 0; index < files.length; index += 1) {
        const entry = files[index];
        if (entry.pinned || protectedHashes.has(entry.hash) || now - entry.stat.mtimeMs <= ttlMs) {
          remaining.push(entry);
        } else if (!this._removeFile(entry.path)) {
          remaining.push(entry);
        }
        await this._yieldPruneWork(index + 1);
      }
    }

    const maxBytes = this.maxSizeMB * 1024 * 1024;
    let bytes = remaining.reduce((sum, entry) => sum + entry.stat.size, 0);
    const lru = remaining
      .filter((entry) => !entry.pinned && !protectedHashes.has(entry.hash))
      .sort((a, b) => a.stat.atimeMs - b.stat.atimeMs || a.path.localeCompare(b.path));
    for (let index = 0; index < lru.length; index += 1) {
      const entry = lru[index];
      if (bytes <= maxBytes) break;
      if (this._removeFile(entry.path)) {
        bytes -= entry.stat.size;
      }
      await this._yieldPruneWork(index + 1);
    }

    const actual = this._publishedFiles();
    return {
      bytes: actual.reduce((sum, entry) => sum + entry.stat.size, 0),
      files: actual.length
    };
  }

  schedulePrune(options = {}) {
    for (const key of options.protectedKeys || []) {
      if (key) this._scheduledPruneProtectedKeys.add(String(key));
    }
    if (this._scheduledPrune) return this._scheduledPrune;

    this._scheduledPrune = new Promise((resolve) => {
      setImmediate(async () => {
        const protectedKeys = [...this._scheduledPruneProtectedKeys];
        this._scheduledPruneProtectedKeys.clear();
        try {
          resolve(await this.prune({ protectedKeys }));
        } catch (error) {
          this.api.log?.(`[music-bot] Cache prune failed: ${error.message}`, 'warn');
          resolve(null);
        } finally {
          this._scheduledPrune = null;
        }
      });
    });
    return this._scheduledPrune;
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
    const deadline = options.deadline || Date.now() + this._positiveNumber(
      this.config.downloadTimeoutMs,
      45000
    );
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
          deadline,
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
      if (stat.size > this.maxSizeMB * 1024 * 1024) {
        this._removeFile(downloadedPath);
        throw new Error('Downloaded cache file exceeds the configured cache limit');
      }

      const lock = await this._acquirePublishLock(hash, controller.signal, deadline);
      let finalPath = null;
      let published = false;
      try {
        if (this.destroyed || controller.signal.aborted) {
          throw new Error('Media cache download aborted');
        }
        const existing = this._canonicalizePublishedFiles(hash);
        if (existing) {
          this._touchFile(existing);
          return existing;
        }

        const extension = this._safeExtension(downloadedPath);
        finalPath = path.join(this.cacheDir, `${hash}${extension}`);
        fs.renameSync(downloadedPath, finalPath);
        published = true;
        this._touchFile(finalPath);
        this._removeTemporaryFiles(temporaryPrefix);
        this.schedulePrune({ protectedKeys: [trackKey] });
        if (this.destroyed || controller.signal.aborted) {
          throw new Error('Media cache download aborted');
        }
        if (!fs.existsSync(finalPath)) {
          throw new Error('Published cache file disappeared during prune');
        }
        return finalPath;
      } catch (error) {
        if (published && finalPath) this._invalidatePublishedFile(finalPath, hash, nonce);
        throw error;
      } finally {
        this._releasePublishLock(lock);
      }
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
    if (fs.existsSync(this._publishLockPath(hash))) return null;
    return this._findPublishedFileByHash(hash);
  }

  _findPublishedFileByHash(hash) {
    const candidates = this._publishedCandidates(hash);
    return candidates.length ? candidates[0].path : null;
  }

  _publishedCandidates(hash) {
    const prefix = `${hash}.`;
    return fs.readdirSync(this.cacheDir)
      .filter((name) => (
        name.startsWith(prefix) &&
        !name.endsWith('.lock') &&
        /^[a-f0-9]{64}\.[^.]+$/i.test(name)
      ))
      .map((name) => {
        const filePath = path.join(this.cacheDir, name);
        try {
          const stat = fs.statSync(filePath);
          if (!stat.isFile() || stat.size <= 0) {
            this._removeFile(filePath);
            return null;
          }
          return { path: filePath, stat };
        } catch (_error) {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs || a.path.localeCompare(b.path));
  }

  _canonicalizePublishedFiles(hash) {
    const candidates = this._publishedCandidates(hash);
    if (!candidates.length) return null;
    const [keep, ...duplicates] = candidates;
    duplicates.forEach((entry) => this._removeFile(entry.path));
    return keep.path;
  }

  _publishedFiles() {
    const pinnedHashes = new Set([...this.pinnedKeys].map((key) => this._hash(key)));
    return fs.readdirSync(this.cacheDir)
      .filter((name) => !name.endsWith('.lock') && /^[a-f0-9]{64}\.[^.]+$/i.test(name))
      .map((name) => {
        const filePath = path.join(this.cacheDir, name);
        try {
          const stat = fs.statSync(filePath);
          if (!stat.isFile() || stat.size <= 0) return null;
          return {
            path: filePath,
            stat,
            hash: name.slice(0, 64),
            pinned: pinnedHashes.has(name.slice(0, 64)) || fs.existsSync(
              this._publishLockPath(name.slice(0, 64))
            )
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
      return !fs.existsSync(filePath);
    } catch (error) {
      this.api.log?.(`[music-bot] Failed to remove cached media: ${error.message}`, 'debug');
      return false;
    }
  }

  async _yieldPruneWork(completed) {
    if (completed % this.pruneBatchSize !== 0) return;
    await new Promise((resolve) => setImmediate(resolve));
  }

  _touchFile(filePath) {
    const timestamp = new Date(this.now());
    fs.utimesSync(filePath, timestamp, timestamp);
  }

  _publishLockPath(hash) {
    return path.join(this.cacheDir, `${hash}.lock`);
  }

  async _acquirePublishLock(hash, signal, deadline) {
    const lockPath = this._publishLockPath(hash);
    while (true) {
      if (this.destroyed || signal.aborted) throw new Error('Media cache download aborted');
      if (Date.now() >= deadline) throw new Error('Media cache publish lock timed out');
      try {
        const descriptor = fs.openSync(lockPath, 'wx');
        return { descriptor, path: lockPath };
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        try {
          const stat = fs.statSync(lockPath);
          if (Date.now() - stat.mtimeMs > 60000) this._removeFile(lockPath);
        } catch (_error) {
          // The lock owner may have released it between open and stat.
        }
        await this._waitForPublishLock(signal, Math.min(25, Math.max(1, deadline - Date.now())));
      }
    }
  }

  _waitForPublishLock(signal, delayMs) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new Error('Media cache download aborted'));
        return;
      }
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, delayMs);
      const onAbort = () => {
        clearTimeout(timer);
        reject(new Error('Media cache download aborted'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  _releasePublishLock(lock) {
    if (!lock) return;
    try {
      fs.closeSync(lock.descriptor);
    } catch (_error) {
      // The descriptor may already have been closed by the runtime.
    }
    this._removeFile(lock.path);
  }

  _invalidatePublishedFile(filePath, hash, nonce) {
    if (this._removeFile(filePath)) return;
    const quarantine = path.join(
      this.cacheDir,
      `${hash}.download-${nonce}.invalid${path.extname(filePath)}`
    );
    try {
      fs.renameSync(filePath, quarantine);
    } catch (error) {
      this.api.log?.(`[music-bot] Failed to invalidate cached media: ${error.message}`, 'error');
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
