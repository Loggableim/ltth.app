const { spawn } = require('child_process');
const path = require('path');

const SOUND_BOT_PROCESS_MARKER = 'ltth-soundbot-mpv-v1';
const SOUND_BOT_IPC_PREFIX = 'ltth-soundbot-mpv-v1-';
const MAX_CLEANUP_MS = 2000;
const MAX_SCANNER_OUTPUT_BYTES = 1024 * 1024;
const MAX_SCANNER_ERROR_CHARS = 512;
const MPV_EXECUTABLE_NAMES = new Set(['mpv', 'mpv.exe', 'mpv.com']);

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeExecutableName(value) {
  const normalized = String(value || '').trim().replace(/^['"]|['"]$/g, '');
  return path.basename(normalized).toLowerCase();
}

function isMarkedSoundbotMpv(entry = {}) {
  if (!Number.isInteger(Number(entry.pid)) || Number(entry.pid) <= 0) return false;
  if (!MPV_EXECUTABLE_NAMES.has(normalizeExecutableName(entry.name))) return false;

  const commandLine = String(entry.commandLine || '');
  if (!commandLine || /[\r\n]/.test(commandLine)) return false;
  const titleMarker = escapeRegExp(`--title=${SOUND_BOT_PROCESS_MARKER}`);
  const exactTitle = new RegExp(`(?:^|\\s)["']?${titleMarker}["']?(?=\\s|$)`);
  if (!exactTitle.test(commandLine)) return false;

  const ipcPrefix = escapeRegExp(SOUND_BOT_IPC_PREFIX);
  const exactIpc = new RegExp(
    `(?:^|\\s)["']?--input-ipc-server=(?:\\\\\\\\\\.\\\\pipe\\\\|[^\\s"']*[\\\\/])${ipcPrefix}[a-zA-Z0-9-]+(?:\\.sock)?["']?(?=\\s|$)`
  );
  return exactIpc.test(commandLine);
}

function processScannerError(executable, result = {}) {
  const exitCode = Number.isInteger(Number(result.code)) ? Number(result.code) : 'unknown';
  const detail = String(result.stderr || '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_SCANNER_ERROR_CHARS);
  const error = new Error(
    `${executable} process scan failed with exit code ${exitCode}${detail ? `: ${detail}` : ''}`
  );
  error.code = 'SOUNDBOT_PROCESS_SCAN_FAILED';
  error.exitCode = result.code;
  return error;
}

class SoundbotProcessRegistry {
  constructor(api = {}, options = {}) {
    this.api = api || {};
    this.platform = options.platform || process.platform;
    this._spawn = options.spawn || spawn;
    this._processKill = options.processKill || process.kill.bind(process);
    this._listProcessesOverride = options.listProcesses || null;
    this._terminateProcessOverride = options.terminateProcess || null;
    this._setTimeout = options.setTimeout || setTimeout;
    this._clearTimeout = options.clearTimeout || clearTimeout;
    this._now = options.now || Date.now;
    this._knownPids = new Set();
  }

  register(pid) {
    const normalized = Number(pid);
    if (!Number.isInteger(normalized) || normalized <= 0 || normalized === process.pid) {
      return false;
    }
    this._knownPids.add(normalized);
    return true;
  }

  unregister(pid) {
    return this._knownPids.delete(Number(pid));
  }

  async findMarkedProcesses({ timeoutMs = 500 } = {}) {
    const boundedTimeoutMs = Math.min(Math.max(Number(timeoutMs) || 500, 1), MAX_CLEANUP_MS);
    const listOperation = this._listProcessesOverride
      ? Promise.resolve().then(() => this._listProcessesOverride({ timeoutMs: boundedTimeoutMs }))
      : this._listProcesses({ timeoutMs: boundedTimeoutMs });
    const entries = await this._settleWithin(
      listOperation,
      boundedTimeoutMs,
      new Error('Soundbot process scan timed out')
    );
    if (entries instanceof Error) throw entries;
    return (Array.isArray(entries) ? entries : [])
      .filter(isMarkedSoundbotMpv)
      .map((entry) => ({
        ...entry,
        pid: Number(entry.pid),
        known: this._knownPids.has(Number(entry.pid))
      }));
  }

  async cleanupMarked({ timeoutMs = MAX_CLEANUP_MS } = {}) {
    const boundedTimeoutMs = Math.min(
      Math.max(Number(timeoutMs) || MAX_CLEANUP_MS, 1),
      MAX_CLEANUP_MS
    );
    const startedAt = this._now();
    const deadline = startedAt + boundedTimeoutMs;
    let marked = [];
    try {
      marked = await this.findMarkedProcesses({ timeoutMs: this._remaining(deadline) });
    } catch (error) {
      this.api.log?.(`[music-bot] Soundbot MPV scan failed: ${error.message}`, 'error');
      return { found: [], killed: [], remaining: [], error: error.message };
    }

    const found = marked.map((entry) => entry.pid);
    const killed = [];
    await Promise.all(marked.map(async (entry) => {
      const remainingMs = this._remaining(deadline);
      if (remainingMs <= 0) return;
      const termination = this._terminateProcessOverride
        ? Promise.resolve().then(() => this._terminateProcessOverride(entry, { timeoutMs: remainingMs }))
        : this._terminateProcess(entry, { timeoutMs: remainingMs });
      const terminated = await this._settleWithin(termination, remainingMs, false);
      if (terminated === true) {
        killed.push(entry.pid);
        this._knownPids.delete(entry.pid);
      }
    }));

    let remaining = found.filter((pid) => !killed.includes(pid));
    const rescanBudget = this._remaining(deadline);
    if (rescanBudget > 0) {
      try {
        remaining = (await this.findMarkedProcesses({ timeoutMs: rescanBudget }))
          .map((entry) => entry.pid);
      } catch (_) {
        // Preserve the conservative pre-rescan list when the final scan cannot settle.
      }
    }
    return {
      found,
      killed: killed.sort((left, right) => left - right),
      remaining: remaining.sort((left, right) => left - right),
      elapsedMs: Math.min(Math.max(this._now() - startedAt, 0), boundedTimeoutMs)
    };
  }

  _remaining(deadline) {
    return Math.max(0, Math.min(deadline - this._now(), MAX_CLEANUP_MS));
  }

  _settleWithin(operation, timeoutMs, timeoutValue) {
    const boundedTimeoutMs = Math.max(0, Math.min(Number(timeoutMs) || 0, MAX_CLEANUP_MS));
    if (boundedTimeoutMs <= 0) return Promise.resolve(timeoutValue);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        this._clearTimeout(timer);
        resolve(value);
      };
      const timer = this._setTimeout(() => finish(timeoutValue), boundedTimeoutMs);
      Promise.resolve(operation).then(finish, (error) => finish(error));
    });
  }

  async _listProcesses({ timeoutMs }) {
    if (this.platform === 'win32') {
      const script = "$ErrorActionPreference='Stop'; " + [
        "Get-CimInstance Win32_Process -Filter \"Name='mpv.exe' OR Name='mpv.com'\"",
        'Select-Object ProcessId,Name,CommandLine',
        'ConvertTo-Json -Compress'
      ].join(' | ');
      const result = await this._runProcess('powershell.exe', [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        script
      ], { timeoutMs });
      if (result.code !== 0) throw processScannerError('powershell.exe', result);
      if (!result.stdout.trim()) return [];
      const parsed = JSON.parse(result.stdout);
      return (Array.isArray(parsed) ? parsed : [parsed]).map((entry) => ({
        pid: Number(entry.ProcessId),
        name: entry.Name,
        commandLine: entry.CommandLine
      }));
    }

    const result = await this._runProcess('ps', ['-axo', 'pid=,comm=,args='], { timeoutMs });
    if (result.code !== 0) throw processScannerError('ps', result);
    return result.stdout.split(/\r?\n/).map((line) => {
      const match = line.match(/^\s*(\d+)\s+(\S+)\s+(.+)$/);
      if (!match) return null;
      return {
        pid: Number(match[1]),
        name: match[2],
        commandLine: match[3]
      };
    }).filter(Boolean);
  }

  async _terminateProcess(entry, { timeoutMs }) {
    if (!isMarkedSoundbotMpv(entry) || entry.pid === process.pid) return false;
    if (this.platform === 'win32') {
      const result = await this._runProcess(
        'taskkill.exe',
        ['/PID', String(entry.pid), '/T', '/F'],
        { timeoutMs }
      );
      return result.code === 0;
    }

    try {
      this._processKill(entry.pid, 'SIGTERM');
    } catch (error) {
      return error?.code === 'ESRCH';
    }
    const graceMs = Math.min(500, Math.max(1, timeoutMs));
    if (await this._waitForExit(entry.pid, graceMs)) return true;

    const remainingMs = Math.max(0, timeoutMs - graceMs);
    if (remainingMs <= 0) return false;
    let stillMarked = [];
    try {
      stillMarked = await this.findMarkedProcesses({ timeoutMs: Math.min(remainingMs, 250) });
    } catch (_) {
      return false;
    }
    if (!stillMarked.some((candidate) => candidate.pid === entry.pid)) return true;
    try {
      this._processKill(entry.pid, 'SIGKILL');
    } catch (error) {
      return error?.code === 'ESRCH';
    }
    return this._waitForExit(entry.pid, Math.max(1, remainingMs - Math.min(remainingMs, 250)));
  }

  _waitForExit(pid, timeoutMs) {
    const deadline = this._now() + Math.max(1, timeoutMs);
    return new Promise((resolve) => {
      const check = () => {
        try {
          this._processKill(pid, 0);
        } catch (error) {
          resolve(error?.code === 'ESRCH');
          return;
        }
        const remainingMs = deadline - this._now();
        if (remainingMs <= 0) {
          resolve(false);
          return;
        }
        this._setTimeout(check, Math.min(25, remainingMs));
      };
      check();
    });
  }

  _runProcess(executable, args, { timeoutMs }) {
    return new Promise((resolve, reject) => {
      let child;
      try {
        child = this._spawn(executable, args, {
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
          shell: false
        });
      } catch (error) {
        reject(error);
        return;
      }
      if (!child || typeof child.once !== 'function') {
        reject(new Error(`Failed to start process scanner: ${executable}`));
        return;
      }
      let stdout = '';
      let stderr = '';
      let settled = false;
      const finish = (error, code = null) => {
        if (settled) return;
        settled = true;
        this._clearTimeout(timer);
        if (error) reject(error);
        else resolve({ code, stdout, stderr });
      };
      const append = (current, chunk) => {
        const next = current + String(chunk || '');
        if (Buffer.byteLength(next) > MAX_SCANNER_OUTPUT_BYTES) {
          child.kill?.('SIGTERM');
          finish(new Error(`${executable} output exceeded safe limit`));
          return current;
        }
        return next;
      };
      child.stdout?.on?.('data', (chunk) => { stdout = append(stdout, chunk); });
      child.stderr?.on?.('data', (chunk) => { stderr = append(stderr, chunk); });
      child.once('error', (error) => finish(error));
      child.once('close', (code) => finish(null, code));
      const timer = this._setTimeout(() => {
        child.kill?.('SIGTERM');
        finish(new Error(`${executable} timed out`));
      }, Math.max(1, Math.min(Number(timeoutMs) || 500, MAX_CLEANUP_MS)));
    });
  }
}

module.exports = {
  MAX_CLEANUP_MS,
  SOUND_BOT_IPC_PREFIX,
  SOUND_BOT_PROCESS_MARKER,
  SoundbotProcessRegistry,
  isMarkedSoundbotMpv
};
