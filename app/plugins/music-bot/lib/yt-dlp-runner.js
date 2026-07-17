const childProcess = require('child_process');

function abortError(message = 'yt-dlp operation aborted') {
  const error = new Error(message);
  error.name = 'AbortError';
  error.code = 'ABORT_ERR';
  return error;
}

function timeoutError() {
  const error = new Error('yt-dlp timed out');
  error.code = 'ETIMEDOUT';
  return error;
}

class YtDlpRunner {
  constructor(options = {}) {
    this.maxConcurrent = Math.max(1, Number(options.maxConcurrent) || 2);
    this.maxQueue = Math.max(this.maxConcurrent, Number(options.maxQueue) || 100);
    this.spawnImpl = options.spawnImpl || childProcess.spawn;
    this.taskkillImpl = options.taskkillImpl || childProcess.spawn;
    this.processKill = options.processKill || process.kill.bind(process);
    this.platform = options.platform || process.platform;
    this.logger = options.logger || null;
    this.queue = [];
    this.active = new Map();
    this.nextId = 1;
    this.destroyed = false;
  }

  run(executable, args, options = {}) {
    if (this.destroyed) return Promise.reject(abortError('yt-dlp runner is destroyed'));
    if (this.queue.length + this.active.size >= this.maxQueue + this.maxConcurrent) {
      return Promise.reject(new Error('yt-dlp queue is full'));
    }

    const deadline = Number.isFinite(options.deadline) ? options.deadline : Date.now() + 45000;
    if (deadline <= Date.now()) return Promise.reject(timeoutError());
    if (options.signal?.aborted) return Promise.reject(abortError());

    return new Promise((resolve, reject) => {
      const job = {
        id: this.nextId++,
        executable,
        args: Array.isArray(args) ? [...args] : [],
        deadline,
        priority: Number(options.priority) || 0,
        signal: options.signal || null,
        resolve,
        reject,
        child: null,
        settled: false,
        terminating: false,
        stdout: '',
        stderr: ''
      };
      job.onAbort = () => this._cancel(job, abortError());
      job.signal?.addEventListener('abort', job.onAbort, { once: true });
      job.deadlineTimer = setTimeout(() => this._cancel(job, timeoutError()), Math.max(1, deadline - Date.now()));
      job.deadlineTimer.unref?.();
      this.queue.push(job);
      this.queue.sort((a, b) => b.priority - a.priority || a.id - b.id);
      this._drain();
    });
  }

  getStatus() {
    return {
      active: this.active.size,
      queued: this.queue.filter((job) => !job.settled).length,
      activePids: [...this.active.values()].map((job) => job.child?.pid).filter(Boolean),
      destroyed: this.destroyed
    };
  }

  async destroy() {
    if (this.destroyed && this.active.size === 0 && this.queue.length === 0) return;
    this.destroyed = true;

    const queued = this.queue.splice(0);
    for (const job of queued) this._settle(job, abortError('yt-dlp runner destroyed'));

    const active = [...this.active.values()];
    await Promise.all(active.map((job) => this._terminateAndSettle(job, abortError('yt-dlp runner destroyed'))));
    this.active.clear();
  }

  _drain() {
    if (this.destroyed) return;
    while (this.active.size < this.maxConcurrent && this.queue.length) {
      const job = this.queue.shift();
      if (!job || job.settled) continue;
      if (job.signal?.aborted) {
        this._settle(job, abortError());
        continue;
      }
      if (job.deadline <= Date.now()) {
        this._settle(job, timeoutError());
        continue;
      }
      this._start(job);
    }
  }

  _start(job) {
    let child;
    try {
      child = this.spawnImpl(job.executable, job.args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        ...(this.platform === 'win32' ? {} : { detached: true })
      });
    } catch (error) {
      this._settle(job, error);
      queueMicrotask(() => this._drain());
      return;
    }

    job.child = child;
    this.active.set(job.id, job);
    child.stdout?.on('data', (chunk) => { job.stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk) => { job.stderr += chunk.toString(); });
    child.once('error', (error) => {
      if (job.terminating) return;
      if (error?.code === 'ENOENT') {
        const missing = new Error(`yt-dlp not found at "${job.executable}"`);
        missing.code = 'ENOENT';
        missing.ytdlpNotFound = true;
        this._complete(job, missing);
        return;
      }
      this._complete(job, error);
    });
    child.once('close', (code) => {
      if (job.terminating) return;
      if (!this.active.has(job.id)) return;
      if (code !== 0) {
        const error = new Error(job.stderr.trim() || `yt-dlp exited with code ${code}`);
        error.exitCode = code;
        this._complete(job, error);
        return;
      }
      this._complete(job, null, job.stdout.trim());
    });
  }

  _complete(job, error, value) {
    this.active.delete(job.id);
    this._settle(job, error, value);
    this._drain();
  }

  _settle(job, error, value) {
    if (job.settled) return;
    job.settled = true;
    clearTimeout(job.deadlineTimer);
    job.signal?.removeEventListener('abort', job.onAbort);
    if (error) job.reject(error);
    else job.resolve(value);
  }

  _cancel(job, error) {
    if (job.settled || job.terminating) return;
    const queuedIndex = this.queue.indexOf(job);
    if (queuedIndex !== -1) {
      this.queue.splice(queuedIndex, 1);
      this._settle(job, error);
      return;
    }
    if (this.active.has(job.id)) {
      void this._terminateAndSettle(job, error);
    }
  }

  async _terminateAndSettle(job, error) {
    if (job.terminationPromise) return job.terminationPromise;
    job.terminating = true;
    job.terminationPromise = (async () => {
      try {
        await this._killProcessTree(job.child);
      } finally {
        this.active.delete(job.id);
        this._settle(job, error);
        if (!this.destroyed) this._drain();
      }
    })();
    return job.terminationPromise;
  }

  async _killProcessTree(child) {
    if (!child) return;
    if (!child.pid) {
      try { child.kill('SIGKILL'); } catch (_error) { /* already gone */ }
      return;
    }

    if (this.platform !== 'win32') {
      const processGroupId = -Math.abs(Number(child.pid));
      try {
        this.processKill(processGroupId, 'SIGTERM');
      } catch (error) {
        if (error?.code === 'ESRCH') return;
      }
      try {
        this.processKill(processGroupId, 'SIGKILL');
        return;
      } catch (error) {
        if (error?.code === 'ESRCH') return;
        try { child.kill('SIGKILL'); } catch (_fallbackError) { /* already gone */ }
        return;
      }
    }

    const killed = await new Promise((resolve) => {
      let taskkill;
      try {
        taskkill = this.taskkillImpl(
          'taskkill.exe',
          ['/PID', String(child.pid), '/T', '/F'],
          { stdio: 'ignore', windowsHide: true }
        );
      } catch (_error) {
        resolve(false);
        return;
      }
      let done = false;
      const fallbackTimer = setTimeout(() => finish(false), 1000);
      fallbackTimer.unref?.();
      const finish = (success) => {
        if (done) return;
        done = true;
        clearTimeout(fallbackTimer);
        resolve(success);
      };
      taskkill.once('error', () => finish(false));
      taskkill.once('close', (code) => finish(code === 0));
    });

    if (!killed) {
      try { child.kill('SIGKILL'); } catch (_error) { /* already gone */ }
    }
  }
}

YtDlpRunner.abortError = abortError;
YtDlpRunner.timeoutError = timeoutError;

module.exports = YtDlpRunner;
