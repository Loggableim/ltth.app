const MAX_SEARCH_TIMEOUT_MS = 250;
const HASH_MB = 16;
const FIXED_NODE_BUDGET = 1200;
const MULTI_PV_COUNT = 8;
const MIN_NATIVE_ELO = 1320;
const MAX_NATIVE_ELO = 3000;
const SELECTOR_VERSION = 'seeded-multipv-v1';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createAbortError(message) {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

function toUci(move) {
  if (typeof move === 'string') {
    const normalized = move.trim().toLowerCase();
    return /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(normalized) ? normalized : null;
  }

  if (!move || typeof move !== 'object') return null;
  if (typeof move.uci === 'string') return toUci(move.uci);

  const from = typeof move.from === 'string' ? move.from.toLowerCase() : '';
  const to = typeof move.to === 'string' ? move.to.toLowerCase() : '';
  const promotion = typeof move.promotion === 'string' ? move.promotion.toLowerCase() : '';
  const normalized = `${from}${to}${promotion}`;
  return /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(normalized) ? normalized : null;
}

function normaliseLegalMoves(legalMoves) {
  if (!Array.isArray(legalMoves)) return [];
  return [...new Set(legalMoves.map(toUci).filter(Boolean))].sort();
}

function stableHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function selectDeterministicMove(legalMoves, { fen, seed, targetElo }) {
  const hash = stableHash(`${SELECTOR_VERSION}\u0000${seed}\u0000${fen}\u0000${targetElo}`);
  return legalMoves[hash % legalMoves.length];
}

function parseWorkerMessage(message) {
  if (message && typeof message === 'object' && 'data' in message) return parseWorkerMessage(message.data);
  if (typeof message === 'string') return message;
  if (Buffer.isBuffer(message)) return message.toString('utf8');
  return String(message || '');
}

function parseInfoCandidate(line) {
  const pvMatch = /\bpv\s+([a-h][1-8][a-h][1-8][qrbn]?)/i.exec(line);
  if (!pvMatch) return null;
  const multipvMatch = /\bmultipv\s+(\d+)/i.exec(line);
  const scoreMatch = /\bscore\s+(cp|mate)\s+(-?\d+)/i.exec(line);
  const scoreType = scoreMatch?.[1]?.toLowerCase();
  const rawScore = scoreMatch ? Number(scoreMatch[2]) : 0;
  const score = scoreType === 'mate'
    ? (rawScore >= 0 ? 100000 - rawScore : -100000 - rawScore)
    : rawScore;
  return {
    move: pvMatch[1].toLowerCase(),
    multipv: multipvMatch ? Number(multipvMatch[1]) : Number.MAX_SAFE_INTEGER,
    score
  };
}

function selectWeakCandidate(candidates, fallback, { fen, seed, targetElo }) {
  const validCandidates = [...candidates.values()]
    .sort((left, right) => right.score - left.score || left.multipv - right.multipv || left.move.localeCompare(right.move));
  if (!validCandidates.length) return fallback;

  const strength = clamp((targetElo - 400) / (MIN_NATIVE_ELO - 400), 0, 1);
  const hash = stableHash(`${SELECTOR_VERSION}\u0000weak\u0000${seed}\u0000${fen}\u0000${targetElo}`);
  const noise = (hash / 0x100000000) * 0.35;
  const weakestIndex = validCandidates.length - 1;
  const index = Math.min(
    weakestIndex,
    Math.max(0, Math.round((1 - strength) * weakestIndex + noise - 0.175))
  );
  return validCandidates[index].move;
}


function createOptionalStockfishWorker() {
  try {
    const { spawn } = require('child_process');
    const path = require('path');
    const stockfishModulePath = require.resolve('stockfish');
    const enginePath = path.join(path.dirname(stockfishModulePath), 'bin', 'stockfish-18-lite-single.js');
    const child = spawn(process.execPath, [enginePath], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    child.stdin.on('error', () => undefined);
    child.stderr.on('data', () => undefined);
    const sourceFor = event => (event === 'message' ? child.stdout : child);
    const eventFor = event => (event === 'message' ? 'data' : event);
    return {
      pid: child.pid,
      postMessage(command) {
        if (!child.stdin || child.stdin.destroyed) {
          throw new Error('Stockfish worker stdin is unavailable');
        }
        child.stdin.write(`${String(command)}\n`);
      },
      on(event, listener) {
        sourceFor(event)?.on?.(eventFor(event), listener);
        return this;
      },
      off(event, listener) {
        const source = sourceFor(event);
        const detach = source?.off || source?.removeListener;
        detach?.call(source, eventFor(event), listener);
        return this;
      },
      removeListener(event, listener) {
        return this.off(event, listener);
      },
      terminate() {
        if (child.killed || child.exitCode != null) return;
        const forceTerminate = setTimeout(() => {
          if (!child.killed && child.exitCode == null) child.kill();
        }, 100);
        forceTerminate.unref?.();
        child.once('exit', () => clearTimeout(forceTerminate));
        try {
          child.stdin.end('quit\n');
        } catch (_) {
          child.kill();
        }
      }
    };
  } catch (_) {
    // Deployments without the optional GPL Stockfish package retain the legal fallback.
    return null;
  }
}

class ChessAutoplayService {
  constructor({
    workerFactory = createOptionalStockfishWorker,
    timeoutMs = MAX_SEARCH_TIMEOUT_MS,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout
  } = {}) {
    this.workerFactory = workerFactory;
    this.requiresReadySignal = workerFactory === createOptionalStockfishWorker;
    this.timeoutMs = clamp(Number(timeoutMs) || MAX_SEARCH_TIMEOUT_MS, 1, MAX_SEARCH_TIMEOUT_MS);
    this.setTimeoutFn = setTimeoutFn;
    this.clearTimeoutFn = clearTimeoutFn;
    this.worker = null;
    this.workerReady = false;
    this.workerCleanup = null;
    this.workerReadyWaiters = new Set();
    this.activeJob = null;
    this.selectionTail = null;
    this.workerUnavailable = false;
    this.destroyed = false;
  }

  selectMove({ fen, legalMoves, seed, targetElo, signal } = {}) {
    if (typeof fen !== 'string' || !fen.trim()) {
      return Promise.reject(new TypeError('A FEN is required for chess autoplay'));
    }

    const normalizedMoves = normaliseLegalMoves(legalMoves);
    if (!normalizedMoves.length) {
      return Promise.reject(new Error('No legal autoplay moves are available'));
    }

    if (signal?.aborted || this.destroyed) {
      return Promise.reject(createAbortError('Chess autoplay selection was cancelled'));
    }

    const request = {
      fen: fen.trim(),
      legalMoves: normalizedMoves,
      seed: String(seed ?? ''),
      targetElo: clamp(Number(targetElo) || 400, 400, MAX_NATIVE_ELO),
      signal
    };
    const run = () => this._selectMove(request);
    const selection = this.selectionTail
      ? this.selectionTail.catch(() => undefined).then(run)
      : run();
    this.selectionTail = selection.catch(() => undefined);
    return selection;
  }

  _selectMove(request) {
    if (this.destroyed || request.signal?.aborted) {
      return Promise.reject(createAbortError('Chess autoplay selection was cancelled'));
    }

    const fallback = selectDeterministicMove(request.legalMoves, request);
    const worker = this._getWorker();
    if (!worker || !this.workerReady) {
      return Promise.resolve({
        move: fallback,
        source: 'fallback',
        timedOut: false,
        selectorVersion: SELECTOR_VERSION
      });
    }

    return this._searchWorker(worker, request, fallback);
  }

  _getWorker() {
    if (this.worker) return this.worker;
    if (this.workerUnavailable || this.destroyed) return null;

    let worker;
    try {
      worker = this.workerFactory?.() || null;
    } catch (_) {
      worker = null;
    }
    if (!worker || typeof worker.postMessage !== 'function') {
      this.workerUnavailable = true;
      return null;
    }

    this.worker = worker;
    this.workerReady = !this.requiresReadySignal;
    this._attachWorkerListener(worker);
    this._post(worker, 'uci');
    this._post(worker, `setoption name Hash value ${HASH_MB}`);
    this._post(worker, 'setoption name Threads value 1');
    this._post(worker, `setoption name MultiPV value ${MULTI_PV_COUNT}`);
    this._post(worker, 'isready');
    return worker;
  }

  warm({ timeoutMs = 5000 } = {}) {
    const worker = this._getWorker();
    if (!worker) return Promise.resolve(false);
    if (this.workerReady) return Promise.resolve(true);
    const waitMs = clamp(Number(timeoutMs) || 5000, 1, 10000);
    return new Promise(resolve => {
      const waiter = ready => {
        this.clearTimeoutFn(waiter.timeout);
        this.workerReadyWaiters.delete(waiter);
        resolve(ready);
      };
      waiter.timeout = this.setTimeoutFn(
        () => waiter(this.worker === worker && this.workerReady),
        waitMs
      );
      waiter.timeout.unref?.();
      this.workerReadyWaiters.add(waiter);
    });
  }

  _resolveWorkerReady(ready) {
    for (const waiter of [...this.workerReadyWaiters]) {
      waiter(ready);
    }
  }

  _attachWorkerListener(worker) {
    const listener = message => this._handleWorkerMessage(worker, message);
    const failureListener = () => this._handleWorkerFailure(worker);
    if (typeof worker.addEventListener === 'function') {
      worker.addEventListener('message', listener);
      worker.addEventListener('error', failureListener);
      this.workerCleanup = () => {
        worker.removeEventListener?.('message', listener);
        worker.removeEventListener?.('error', failureListener);
      };
      return;
    }
    if (typeof worker.on === 'function') {
      worker.on('message', listener);
      worker.on('error', failureListener);
      worker.on('exit', failureListener);
      this.workerCleanup = () => {
        const detach = worker.off || worker.removeListener;
        detach?.call(worker, 'message', listener);
        detach?.call(worker, 'error', failureListener);
        detach?.call(worker, 'exit', failureListener);
      };
      return;
    }
    const previous = worker.onmessage;
    worker.onmessage = listener;
    this.workerCleanup = () => {
      if (worker.onmessage === listener) worker.onmessage = previous || null;
    };
  }

  _handleWorkerFailure(worker) {
    if (!worker || this.worker !== worker) return;
    if (this.activeJob?.worker === worker) {
      this._finishJob(this.activeJob, {
        move: this.activeJob.fallback,
        source: 'fallback',
        timedOut: false,
        selectorVersion: SELECTOR_VERSION
      }, { retireWorker: true });
      return;
    }
    this._retireWorker(worker);
  }

  _searchWorker(worker, request, fallback) {
    return new Promise((resolve, reject) => {
      const job = {
        worker,
        request,
        fallback,
        resolve,
        reject,
        candidates: new Map(),
        timeout: null,
        onAbort: null
      };
      this.activeJob = job;
      job.timeout = this.setTimeoutFn(() => {
        this._finishJob(job, {
          move: fallback,
          source: 'fallback',
          timedOut: true,
          selectorVersion: SELECTOR_VERSION
        }, { retireWorker: true });
      }, this.timeoutMs);
      job.timeout.unref?.();
      if (request.signal) {
        job.onAbort = () => this._abortJob(job, 'Chess autoplay selection was cancelled');
        request.signal.addEventListener('abort', job.onAbort, { once: true });
      }

      if (request.targetElo >= MIN_NATIVE_ELO) {
        this._post(worker, 'setoption name UCI_LimitStrength value true');
        this._post(worker, `setoption name UCI_Elo value ${clamp(request.targetElo, MIN_NATIVE_ELO, MAX_NATIVE_ELO)}`);
      } else {
        this._post(worker, 'setoption name UCI_LimitStrength value false');
      }
      this._post(worker, `position fen ${request.fen}`);
      this._post(worker, `go nodes ${FIXED_NODE_BUDGET}`);
    });
  }

  _handleWorkerMessage(worker, rawMessage) {
    const message = rawMessage && typeof rawMessage === 'object' && 'data' in rawMessage
      ? rawMessage.data
      : rawMessage;
    if (message && typeof message === 'object' && message.type === 'ready') {
      if (this.worker !== worker) return;
      this.workerReady = true;
      this._resolveWorkerReady(true);
      return;
    }
    if (message && typeof message === 'object' && message.type === 'error') {
      this._handleWorkerFailure(worker);
      return;
    }

    const output = message && typeof message === 'object' && message.type === 'line'
      ? message.line
      : message;
    if (parseWorkerMessage(output).split(/\r?\n/).some(line => /^readyok$/i.test(line.trim()))) {
      if (this.worker === worker) {
        this.workerReady = true;
        this._resolveWorkerReady(true);
      }
    }

    const job = this.activeJob;
    if (!job || job.worker !== worker) return;

    for (const line of parseWorkerMessage(output).split(/\r?\n/)) {
      const candidate = parseInfoCandidate(line);
      if (candidate && job.request.legalMoves.includes(candidate.move)) {
        job.candidates.set(candidate.move, candidate);
      }

      const bestMove = /^bestmove\s+([a-h][1-8][a-h][1-8][qrbn]?)/i.exec(line);
      if (!bestMove) continue;
      const move = bestMove[1].toLowerCase();
      if (!job.request.legalMoves.includes(move)) {
        this._finishJob(job, {
          move: job.fallback,
          source: 'fallback',
          timedOut: false,
          selectorVersion: SELECTOR_VERSION
        });
        return;
      }

      const selectedMove = job.request.targetElo < MIN_NATIVE_ELO
        ? selectWeakCandidate(job.candidates, move, job.request)
        : move;
      this._finishJob(job, {
        move: selectedMove,
        source: 'stockfish',
        timedOut: false,
        selectorVersion: SELECTOR_VERSION
      });
      return;
    }
  }

  _finishJob(job, result, { retireWorker = false } = {}) {
    if (this.activeJob !== job) return;
    this.activeJob = null;
    this.clearTimeoutFn(job.timeout);
    if (job.onAbort) job.request.signal?.removeEventListener('abort', job.onAbort);
    if (retireWorker) this._retireWorker(job.worker);
    job.resolve(result);
  }

  _abortJob(job, message) {
    if (this.activeJob !== job) return;
    this.activeJob = null;
    this.clearTimeoutFn(job.timeout);
    if (job.onAbort) job.request.signal?.removeEventListener('abort', job.onAbort);
    this._retireWorker(job.worker);
    job.reject(createAbortError(message));
  }

  _post(worker, command) {
    try {
      worker.postMessage(command);
    } catch (_) {
      if (this.activeJob?.worker === worker) {
        this._finishJob(this.activeJob, {
          move: this.activeJob.fallback,
          source: 'fallback',
          timedOut: false,
          selectorVersion: SELECTOR_VERSION
        }, { retireWorker: true });
      } else {
        this._retireWorker(worker);
      }
    }
  }

  _retireWorker(worker = this.worker, { unavailable = false } = {}) {
    if (!worker || this.worker !== worker) return;
    this.workerUnavailable = unavailable;
    this.workerReady = false;
    this._resolveWorkerReady(false);
    this.workerCleanup?.();
    this.workerCleanup = null;
    this.worker = null;
    try {
      const terminated = worker.terminate?.();
      Promise.resolve(terminated).catch(() => undefined);
    } catch (_) {
      // Termination is best effort for an already failed local worker.
    }
  }

  destroy() {
    if (this.destroyed) return Promise.resolve();
    this.destroyed = true;
    if (this.activeJob) this._abortJob(this.activeJob, 'Chess autoplay service was destroyed');
    this._retireWorker();
    return Promise.resolve();
  }
}

module.exports = ChessAutoplayService;
module.exports.SELECTOR_VERSION = SELECTOR_VERSION;
module.exports.MAX_SEARCH_TIMEOUT_MS = MAX_SEARCH_TIMEOUT_MS;
module.exports.FIXED_NODE_BUDGET = FIXED_NODE_BUDGET;
