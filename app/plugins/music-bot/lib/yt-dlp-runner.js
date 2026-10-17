const childProcess = require('child_process');
const { buildMusicBotChildEnv } = require('./child-process-env');
const DEFAULT_MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const DEFAULT_CHILD_CLOSE_TIMEOUT_MS = 2000;

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

function outputLimitError(maxOutputBytes) {
  const error = new Error(`yt-dlp output exceeded the ${maxOutputBytes}-byte safety limit`);
  error.code = 'YTDLP_OUTPUT_LIMIT';
  return error;
}

class YtDlpRunner {
  constructor(options = {}) {
    this.maxConcurrent = Math.max(1, Number(options.maxConcurrent) || 2);
    this.maxQueue = Math.max(this.maxConcurrent, Number(options.maxQueue) || 100);
    this.maxOutputBytes = Math.max(1024, Number(options.maxOutputBytes) || DEFAULT_MAX_OUTPUT_BYTES);
    this.spawnImpl = options.spawnImpl || childProcess.spawn;
    this.taskkillImpl = options.taskkillImpl || childProcess.spawn;
    this.processKill = options.processKill || process.kill.bind(process);
    this.platform = options.platform || process.platform;
    this.environment = options.environment || process.env;
    this.childCloseTimeoutMs = Math.max(
      1,
      Math.floor(Number(options.childCloseTimeoutMs) || DEFAULT_CHILD_CLOSE_TIMEOUT_MS)
    );
    this.logger = options.logger || null;
    this.queue = [];
    this.active = new Map();
    this.unconfirmedCloseJobs = new Set();
    this.nextId = 1;
    this.destroyed = false;
  }

  run(executable, args, options = {}) {
    if (this.destroyed) return this._rejectedRun(abortError('yt-dlp runner is destroyed'));
    if (this.queue.length + this.active.size >= this.maxQueue + this.maxConcurrent) {
      return this._rejectedRun(new Error('yt-dlp queue is full'));
    }

    const deadline = Number.isFinite(options.deadline) ? options.deadline : Date.now() + 45000;
    if (deadline <= Date.now()) return this._rejectedRun(timeoutError());
    if (options.signal?.aborted) return this._rejectedRun(abortError());

    let resolveChildClosed;
    const childClosed = new Promise((resolve) => { resolveChildClosed = resolve; });
    const result = new Promise((resolve, reject) => {
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
        resolveChildClosed,
        stdout: '',
        stderr: '',
        outputBytes: 0
      };
      job.onAbort = () => this._cancel(job, abortError());
      job.signal?.addEventListener('abort', job.onAbort, { once: true });
      job.deadlineTimer = setTimeout(() => this._cancel(job, timeoutError()), Math.max(1, deadline - Date.now()));
      job.deadlineTimer.unref?.();
      this.queue.push(job);
      this.queue.sort((a, b) => b.priority - a.priority || a.id - b.id);
      this._drain();
    });
    // Expose the process-lifecycle boundary separately from the operation
    // result: cancellation may reject before Windows confirms child close.
    result.childClosed = childClosed;
    return result;
  }

  _rejectedRun(error) {
    const result = Promise.reject(error);
    result.childClosed = Promise.resolve();
    return result;
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
    const closeResults = await Promise.all(
      active.map((job) => this._terminateAndSettle(job, abortError('yt-dlp runner destroyed')))
    );
    if (closeResults.some((closed) => !closed)) {
      const error = new Error('yt-dlp process close was not confirmed after bounded shutdown');
      error.code = 'YTDLP_CLOSE_TIMEOUT';
      throw error;
    }
  }

  _drain() {
    if (this.destroyed || this.unconfirmedCloseJobs.size > 0) return;
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
        env: buildMusicBotChildEnv('yt-dlp', this.environment, this.platform),
        ...(this.platform === 'win32' ? {} : { detached: true })
      });
    } catch (error) {
      this._settle(job, error);
      queueMicrotask(() => this._drain());
      return;
    }

    job.child = child;
    this.active.set(job.id, job);
    child.stdout?.on('data', (chunk) => this._appendOutput(job, 'stdout', chunk));
    child.stderr?.on('data', (chunk) => this._appendOutput(job, 'stderr', chunk));
    child.once('error', (error) => {
      if (job.terminating) return;
      let failure = error;
      if (error?.code === 'ENOENT') {
        const missing = new Error(`yt-dlp not found at "${job.executable}"`);
        missing.code = 'ENOENT';
        missing.ytdlpNotFound = true;
        failure = missing;
      }
      if (!child?.pid) {
        // Spawn failure has no owned OS process; settle the lifecycle directly.
        job.resolveChildClosed?.();
        this._complete(job, failure);
        return;
      }
      // Preserve active ownership until the close event. The operation can
      // report its error now, while destroy() still sees and waits for the child.
      job.pendingError = failure;
      this._settle(job, failure);
    });
    child.once('close', (code) => {
      job.resolveChildClosed?.();
      if (job.terminating) return;
      if (!this.active.has(job.id)) return;
      if (job.pendingError) {
        this._complete(job, job.pendingError);
        return;
      }
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

  updateLimits({ maxConcurrent, maxQueue, maxOutputBytes } = {}) {
    const requestedConcurrent = Number(maxConcurrent);
    if (Number.isFinite(requestedConcurrent)) {
      this.maxConcurrent = Math.max(1, Math.floor(requestedConcurrent));
    }
    const requestedQueue = Number(maxQueue);
    if (Number.isFinite(requestedQueue)) {
      this.maxQueue = Math.max(this.maxConcurrent, Math.floor(requestedQueue));
    } else {
      this.maxQueue = Math.max(this.maxQueue, this.maxConcurrent);
    }
    const requestedOutputBytes = Number(maxOutputBytes);
    if (Number.isFinite(requestedOutputBytes)) {
      this.maxOutputBytes = Math.max(1024, Math.floor(requestedOutputBytes));
    }
    this._drain();
  }

  _appendOutput(job, field, chunk) {
    if (job.settled || job.terminating) return;
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    const remaining = this.maxOutputBytes - job.outputBytes;
    if (buffer.length > remaining) {
      if (remaining > 0) job[field] += buffer.subarray(0, remaining).toString();
      job.outputBytes = this.maxOutputBytes;
      void this._terminateAndSettle(job, outputLimitError(this.maxOutputBytes));
      return;
    }
    job[field] += buffer.toString();
    job.outputBytes += buffer.length;
  }

  _settle(job, error, value) {
    if (job.settled) return;
    job.settled = true;
    clearTimeout(job.deadlineTimer);
    job.signal?.removeEventListener('abort', job.onAbort);
    if (!job.child) job.resolveChildClosed?.();
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
      let closed = this._isChildClosed(job.child);
      try {
        if (!closed) {
          this._watchForTerminatingChildClose(job);
          await this._killProcessTree(job.child);
          closed = await this._waitForChildClose(job.child);
        }
        if (!closed && job.child) {
          try { job.child.kill('SIGKILL'); } catch (_error) { /* already gone */ }
          closed = await this._waitForChildClose(job.child);
        }
        closed = closed || this._isChildClosed(job.child);
        if (!closed) {
          job.closeUnconfirmed = true;
          this.unconfirmedCloseJobs.add(job);
          try {
            this.logger?.log?.(
              '[music-bot] yt-dlp child close was not confirmed (YTDLP_CLOSE_TIMEOUT)',
              'warn'
            );
          } catch (_error) { /* logger failures must not block shutdown */ }
        } else {
          job.closeConfirmed = true;
          job.closeUnconfirmed = false;
          this.unconfirmedCloseJobs.delete(job);
          this.active.delete(job.id);
        }
        if (closed) job.resolveChildClosed?.();
      } finally {
        this._settle(job, error);
        if (!this.destroyed && closed) this._drain();
      }
      return closed;
    })();
    return job.terminationPromise;
  }

  _watchForTerminatingChildClose(job) {
    const child = job?.child;
    if (!child || this._isChildClosed(child) || job.terminationCloseListener) return;
    job.terminationCloseListener = () => {
      job.resolveChildClosed?.();
      job.closeConfirmed = true;
      job.closeUnconfirmed = false;
      this.unconfirmedCloseJobs.delete(job);
      this.active.delete(job.id);
      if (!this.destroyed) this._drain();
    };
    child.once('close', job.terminationCloseListener);
  }

  _isChildClosed(child) {
    return !child
      || child.exitCode != null
      || child.signalCode != null
      || child.closed === true;
  }

  _waitForChildClose(child) {
    if (this._isChildClosed(child)) return Promise.resolve(true);
    if (typeof child?.once !== 'function') return Promise.resolve(false);

    return new Promise((resolve) => {
      let settled = false;
      let timeout = null;
      const finish = (closed) => {
        if (settled) return;
        settled = true;
        if (timeout) clearTimeout(timeout);
        child.removeListener?.('close', onClose);
        child.removeListener?.('error', onError);
        resolve(closed);
      };
      const onClose = () => finish(true);
      const onError = () => finish(this._isChildClosed(child));

      child.once('close', onClose);
      child.once('error', onError);
      timeout = setTimeout(() => finish(this._isChildClosed(child)), this.childCloseTimeoutMs);
    });
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
          {
            stdio: 'ignore',
            windowsHide: true,
            env: buildMusicBotChildEnv('taskkill', this.environment, this.platform)
          }
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
YtDlpRunner.outputLimitError = outputLimitError;

module.exports = YtDlpRunner;
