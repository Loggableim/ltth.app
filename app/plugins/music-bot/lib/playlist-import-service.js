const { randomUUID } = require('crypto');

function abortError() {
  const error = new Error('Playlist import aborted');
  error.code = 'ABORT_ERR';
  return error;
}

class PlaylistImportService {
  constructor({ store, catalog, runner, ytdlpPath = 'yt-dlp', onProgress = null } = {}) {
    if (!store || !catalog || !runner?.run) throw new Error('PlaylistImportService requires store, catalog, and runner');
    this.store = store;
    this.catalog = catalog;
    this.runner = runner;
    this.ytdlpPath = ytdlpPath;
    this.onProgress = onProgress;
    this.jobs = new Map();
    this.queue = [];
    this.active = null;
    this.destroyed = false;
  }

  start({ playlistId, url } = {}) {
    if (this.destroyed) throw abortError();
    this.store.get(playlistId);
    const sourceUrl = String(url || '').trim();
    if (!/^https?:\/\//i.test(sourceUrl)) throw new Error('Playlist import URL must be http or https');
    const controller = new AbortController();
    let resolve;
    const job = {
      id: randomUUID(), playlistId, url: sourceUrl, controller, status: 'queued', progress: 0,
      total: 0, added: 0, error: null, createdAt: Date.now(), startedAt: null, completedAt: null,
      promise: new Promise((done) => { resolve = done; }), resolve
    };
    this.jobs.set(job.id, job);
    this.queue.push(job);
    this._publish(job);
    void this._drain();
    return this._public(job);
  }

  get(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    return this._public(job);
  }

  wait(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return Promise.reject(new Error('Playlist import job not found'));
    return job.promise.then(() => this._public(job));
  }

  abort(jobId) {
    const job = this.jobs.get(jobId);
    if (!job || this._terminal(job)) return this.get(jobId);
    job.controller.abort();
    if (job.status === 'queued') {
      this.queue = this.queue.filter((candidate) => candidate !== job);
      this._finish(job, 'aborted');
    }
    return this.get(jobId);
  }

  async destroy() {
    this.destroyed = true;
    [...this.jobs.values()].forEach((job) => this.abort(job.id));
    if (this.active?.promise) await this.active.promise;
  }

  async _drain() {
    if (this.active || this.destroyed) return;
    const job = this.queue.shift();
    if (!job) return;
    if (job.controller.signal.aborted) {
      this._finish(job, 'aborted');
      return this._drain();
    }
    this.active = job;
    job.status = 'running';
    job.startedAt = Date.now();
    job.progress = 5;
    this._publish(job);
    job.promise = this._run(job)
      .catch(() => {})
      .finally(() => {
        this.active = null;
        void this._drain();
      });
    await job.promise;
  }

  async _run(job) {
    try {
      const output = await this.runner.run(this.ytdlpPath, [
        '--flat-playlist', '--dump-single-json', '--no-warnings', job.url
      ], {
        priority: -10,
        signal: job.controller.signal,
        deadline: Date.now() + 120000
      });
      if (job.controller.signal.aborted) throw abortError();
      job.progress = 70;
      this._publish(job);
      const entries = this._parseSnapshot(output);
      job.total = entries.length;
      job.progress = 90;
      this._publish(job);
      if (job.controller.signal.aborted) throw abortError();
      const result = this.store.importSnapshot(job.playlistId, entries);
      job.added = result.added;
      this._finish(job, 'completed');
    } catch (error) {
      if (job.controller.signal.aborted || error?.code === 'ABORT_ERR' || error?.name === 'AbortError') {
        this._finish(job, 'aborted');
      } else {
        job.error = error?.message || String(error);
        this._finish(job, 'failed');
      }
    }
  }

  _parseSnapshot(output) {
    let payload;
    try {
      payload = JSON.parse(String(output || ''));
    } catch (_error) {
      throw new Error('yt-dlp returned an invalid playlist snapshot');
    }
    const rawEntries = Array.isArray(payload) ? payload : payload.entries;
    if (!Array.isArray(rawEntries)) throw new Error('yt-dlp snapshot did not contain playlist entries');
    return rawEntries.filter(Boolean).map((entry) => {
      const providerId = String(entry.id || entry.url || '').trim();
      const title = String(entry.title || '').trim();
      if (!providerId || !title) throw new Error('yt-dlp snapshot contains an invalid playlist entry');
      return {
        provider: 'youtube', providerId, title,
        artist: entry.channel || entry.uploader || entry.artist || '',
        channelId: entry.channel_id || null, channelName: entry.channel || entry.uploader || null,
        url: entry.webpage_url || entry.original_url || `https://www.youtube.com/watch?v=${encodeURIComponent(providerId)}`
      };
    });
  }

  _finish(job, status) {
    if (this._terminal(job)) return;
    job.status = status;
    job.progress = 100;
    job.completedAt = Date.now();
    this._publish(job);
    job.resolve();
  }

  _terminal(job) {
    return ['completed', 'failed', 'aborted'].includes(job.status);
  }

  _public(job) {
    return {
      id: job.id, jobId: job.id, playlistId: job.playlistId, status: job.status, progress: job.progress,
      total: job.total, added: job.added, error: job.error, createdAt: job.createdAt,
      startedAt: job.startedAt, completedAt: job.completedAt
    };
  }

  _publish(job) {
    this.onProgress?.(this._public(job));
  }
}

PlaylistImportService.abortError = abortError;

module.exports = PlaylistImportService;
