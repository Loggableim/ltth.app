'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const EXPECTED_NODE_MAJOR = 22;
const EXPECTED_MODULE_ABI = '127';
const MAX_CAPTURED_CHARS_PER_STREAM = 12000;
const MAX_DIAGNOSTIC_CHARS_PER_STREAM = 2400;

function bundledNodePath(repoRoot, platform = process.platform) {
  return path.join(
    repoRoot,
    'runtime',
    'node',
    platform === 'win32' ? 'node.exe' : 'node'
  );
}

function validateNodeRuntime(runtime) {
  const major = Number(String(runtime?.version || '').replace(/^v/, '').split('.')[0]);
  if (major !== EXPECTED_NODE_MAJOR || String(runtime?.modules) !== EXPECTED_MODULE_ABI) {
    throw new Error(
      `Bundled Node runtime mismatch: expected Node ${EXPECTED_NODE_MAJOR} / native ABI ${EXPECTED_MODULE_ABI}, got ${runtime?.version || 'unknown'} / ABI ${runtime?.modules || 'unknown'}`
    );
  }
  return runtime;
}

function inspectNodeRuntime(executablePath, run = spawnSync) {
  const result = run(executablePath, [
    '-p',
    'JSON.stringify({version:process.version,modules:process.versions.modules})'
  ], { encoding: 'utf8', timeout: 5000, windowsHide: true });
  if (result.error || result.status !== 0) {
    const detail = result.error?.message || String(result.stderr || '').trim() || `exit ${result.status}`;
    throw new Error(`Bundled Node runtime could not be inspected (${detail})`);
  }

  let runtime;
  try {
    runtime = JSON.parse(String(result.stdout || '').trim());
  } catch (_) {
    throw new Error('Bundled Node runtime returned invalid version metadata');
  }

  return validateNodeRuntime(runtime);
}

function resolveBundledNode(repoRoot, options = {}) {
  const platform = options.platform || process.platform;
  const executablePath = bundledNodePath(repoRoot, platform);
  const existsSync = options.existsSync || require('fs').existsSync;
  if (!existsSync(executablePath)) {
    throw new Error(`Bundled Node runtime is missing: ${executablePath}`);
  }
  const runtime = validateNodeRuntime((options.inspect || inspectNodeRuntime)(executablePath));
  return { executablePath, runtime };
}

function redactDiagnosticLine(line) {
  if (/(?:user_configs|user_data|[\\/]uploads(?:[\\/]|\b)|\.config_path)/i.test(line)) {
    return '[redacted user data path/output]';
  }
  return line
    .replace(/([A-Z]:\\Users\\)[^\\\s]+/gi, '$1[REDACTED]')
    .replace(/([\\/]Users\/)[^/\s]+/g, '$1[REDACTED]')
    .replace(/([\\/]home\/)[^/\s]+/g, '$1[REDACTED]')
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1[REDACTED]')
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|passwd|secret|authorization|cookie|session[_-]?token)\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1[REDACTED]')
    .replace(/("(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|passwd|secret|authorization|cookie|session[_-]?token)"\s*:\s*)"[^"]*"/gi, '$1"[REDACTED]"');
}

function redactTail(value, maxChars = MAX_DIAGNOSTIC_CHARS_PER_STREAM) {
  const lines = String(value || '').split(/\r?\n/).map(redactDiagnosticLine);
  const selected = [];
  let size = 0;
  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index];
    const lineSize = line.length + (selected.length ? 1 : 0);
    if (lineSize > maxChars) {
      if (!selected.length) return '[redacted oversized diagnostic line]';
      break;
    }
    if (size + lineSize > maxChars) break;
    selected.unshift(line);
    size += lineSize;
  }
  return selected.join('\n').trim();
}

function createStartupOutputCollector(child, maxChars = MAX_CAPTURED_CHARS_PER_STREAM) {
  const streams = {
    stdout: { value: '', pending: '', droppingLine: false },
    stderr: { value: '', pending: '', droppingLine: false }
  };
  const appendLine = (state, rawLine) => {
    const line = redactDiagnosticLine(rawLine);
    if (line.length > maxChars) {
      state.value += `${state.value ? '\n' : ''}[redacted oversized startup output line]`;
    } else {
      state.value += `${state.value ? '\n' : ''}${line}`;
    }
    while (state.value.length > maxChars) {
      const nextLine = state.value.indexOf('\n');
      if (nextLine < 0) {
        state.value = '';
        break;
      }
      state.value = state.value.slice(nextLine + 1);
    }
  };
  const append = (streamName) => (chunk) => {
    const state = streams[streamName];
    let remaining = chunk.toString();
    if (state.droppingLine) {
      const end = remaining.indexOf('\n');
      if (end < 0) return;
      appendLine(state, '[redacted oversized startup output line]');
      state.droppingLine = false;
      remaining = remaining.slice(end + 1);
    }
    state.pending += remaining;
    let lineEnd = state.pending.indexOf('\n');
    while (lineEnd >= 0) {
      appendLine(state, state.pending.slice(0, lineEnd).replace(/\r$/, ''));
      state.pending = state.pending.slice(lineEnd + 1);
      lineEnd = state.pending.indexOf('\n');
    }
    if (state.pending.length > maxChars) {
      state.pending = '';
      state.droppingLine = true;
    }
  };
  child.stdout?.on('data', append('stdout'));
  child.stderr?.on('data', append('stderr'));
  child.once?.('close', () => {
    for (const state of Object.values(streams)) {
      if (state.pending) appendLine(state, state.pending);
      state.pending = '';
      state.droppingLine = false;
    }
  });
  return () => ({
    stdout: streams.stdout.value,
    stderr: streams.stderr.value
  });
}

function formatEarlyExitDiagnostic({ code, signal, output = {} }) {
  const details = [`exitCode=${code === null || code === undefined ? 'unknown' : code}`, `signal=${signal || 'none'}`];
  const stdout = redactTail(output.stdout);
  const stderr = redactTail(output.stderr);
  if (stdout) details.push(`stdout tail:\n${stdout}`);
  if (stderr) details.push(`stderr tail:\n${stderr}`);
  return `App exited before capture started (${details.join('; ')})`;
}

function formatStartupOutput(output = {}) {
  const stdout = redactTail(output.stdout);
  const stderr = redactTail(output.stderr);
  const details = [];
  if (stdout) details.push(`stdout tail:\n${stdout}`);
  if (stderr) details.push(`stderr tail:\n${stderr}`);
  return details.join('\n');
}

function formatCaptureFailureDiagnostics(failures) {
  return (failures || []).map((failure) => {
    const locale = String(failure.locale || 'unknown').replace(/[^a-z0-9_-]/gi, '_').slice(0, 24);
    const id = String(failure.id || 'unknown').replace(/[^a-z0-9_-]/gi, '_').slice(0, 96);
    const phase = String(failure.phase || 'unknown').replace(/[^a-z0-9_-]/gi, '_').slice(0, 32);
    const exitCode = Number.isInteger(failure.exitCode) ? String(failure.exitCode) : 'unknown';
    const signal = typeof failure.signal === 'string' && /^[A-Z0-9_]{1,24}$/.test(failure.signal)
      ? failure.signal
      : failure.signal === null || failure.signal === undefined ? 'none' : 'unknown';
    const error = redactTail(failure.error || 'No error details provided', MAX_DIAGNOSTIC_CHARS_PER_STREAM);
    return `[docs-capture-failure] locale=${locale} id=${id} phase=${phase} exitCode=${exitCode} signal=${signal}\n${error}`;
  });
}

function reportCaptureFailures(failures, writeError = console.error) {
  for (const diagnostic of formatCaptureFailureDiagnostics(failures)) writeError(diagnostic);
}

function reportNoCaptureOutputs(failures, writeError = console.error) {
  reportCaptureFailures(failures, writeError);
  writeError('No screenshots captured; existing manifest left unchanged.');
  return 1;
}

module.exports = {
  EXPECTED_MODULE_ABI,
  EXPECTED_NODE_MAJOR,
  bundledNodePath,
  createStartupOutputCollector,
  formatEarlyExitDiagnostic,
  formatCaptureFailureDiagnostics,
  formatStartupOutput,
  inspectNodeRuntime,
  redactTail,
  reportCaptureFailures,
  resolveBundledNode,
  validateNodeRuntime,
  reportNoCaptureOutputs
};
