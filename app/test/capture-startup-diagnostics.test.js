'use strict';

const path = require('path');
const { EventEmitter } = require('events');
const {
  createStartupOutputCollector,
  formatEarlyExitDiagnostic,
  reportNoCaptureOutputs,
  resolveBundledNode,
  validateNodeRuntime
} = require('../../scripts/lib/capture-startup-diagnostics');

function runChildFixture({ stdout = '', stderr = '', stdoutChunks = [], stderrChunks = [], maxChars = 1000, code = 0, signal = null }) {
  return new Promise((resolve, reject) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    const getOutput = createStartupOutputCollector(child, maxChars);
    child.once('error', reject);
    child.once('close', (exitCode, exitSignal) => resolve({ code: exitCode, signal: exitSignal, output: getOutput() }));
    setImmediate(() => {
      for (const chunk of [stdout, ...stdoutChunks].filter(Boolean)) child.stdout.emit('data', Buffer.from(chunk));
      for (const chunk of [stderr, ...stderrChunks].filter(Boolean)) child.stderr.emit('data', Buffer.from(chunk));
      child.emit('close', code, signal);
    });
  });
}

describe('capture startup diagnostics', () => {
  test('reports an early successful exit with stdout and stderr tails', async () => {
    const result = await runChildFixture({ stdout: 'fixture stdout', stderr: 'fixture stderr' });
    const message = formatEarlyExitDiagnostic(result);

    expect(message).toContain('exitCode=0');
    expect(message).toContain('signal=none');
    expect(message).toContain('fixture stdout');
    expect(message).toContain('fixture stderr');
  });

  test('captures a logged unhandled rejection while preserving its successful process exit', async () => {
    const result = await runChildFixture({ stderr: 'Unhandled rejection: fixture rejection', code: 0 });
    const message = formatEarlyExitDiagnostic(result);

    expect(result.code).toBe(0);
    expect(message).toContain('fixture rejection');
    expect(message).toContain('exitCode=0');
  });

  test('reports signal termination separately from the exit code', async () => {
    const result = await runChildFixture({ code: null, signal: 'SIGTERM', stderr: 'fixture terminated' });
    const message = formatEarlyExitDiagnostic(result);

    expect(message).toContain('exitCode=unknown');
    expect(message).toContain('signal=SIGTERM');
  });

  test('redacts credential values and suppresses user configuration output', async () => {
    const result = await runChildFixture({ stderr: 'access_token=top-secret\nreading C:/Users/name/app/user_configs/account.db' });
    const message = formatEarlyExitDiagnostic(result);

    expect(message).toContain('access_token=[REDACTED]');
    expect(message).toContain('[redacted user data path/output]');
    expect(message).not.toContain('top-secret');
    expect(message).not.toContain('account.db');
  });

  test('redacts a credential split across chunks at the bounded-buffer edge', async () => {
    const result = await runChildFixture({
      stderrChunks: ['F'.repeat(25) + '\n', 'access_', 'token=boundary-secret\n'],
      maxChars: 32
    });
    const message = formatEarlyExitDiagnostic(result);

    expect(message).toContain('access_token=[REDACTED]');
    expect(message).not.toContain('boundary-secret');
  });

  test('bounds diagnostic tails per stream', () => {
    const message = formatEarlyExitDiagnostic({
      code: 1,
      signal: null,
      output: { stdout: `${'A'.repeat(100)}\n`.repeat(50), stderr: `${'B'.repeat(100)}\n`.repeat(50) }
    });
    expect(message.length).toBeLessThan(5000);
    expect(message).toContain('A'.repeat(100));
    expect(message).toContain('B'.repeat(100));
  });

  test('reports zero-output failures to stderr with redacted details and nonzero status', () => {
    const stdout = jest.spyOn(console, 'log').mockImplementation(() => {});
    const stderr = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const status = reportNoCaptureOutputs([{
        locale: 'de',
        id: 'sidekick__status-view',
        phase: 'app-startup',
        exitCode: 1,
        signal: null,
        error: 'access_token=private-token\nSQLite path C:\\Users\\person\\AppData\\Local\\ltth.app\\user_configs\\default.db'
      }]);
      const output = stderr.mock.calls.map(([message]) => String(message)).join('\n');

      expect(status).toBe(1);
      expect(stdout).not.toHaveBeenCalled();
      expect(stderr).toHaveBeenCalledTimes(2);
      expect(output).toContain('locale=de id=sidekick__status-view phase=app-startup exitCode=1 signal=none');
      expect(output).toContain('access_token=[REDACTED]');
      expect(output).toContain('[redacted user data path/output]');
      expect(output).toContain('No screenshots captured; existing manifest left unchanged.');
      expect(output).not.toContain('private-token');
      expect(output).not.toContain('default.db');
    } finally {
      stdout.mockRestore();
      stderr.mockRestore();
    }
  });

  test('selects and validates only the bundled Node 22 native ABI', () => {
    const repoRoot = path.resolve('..');
    const selected = resolveBundledNode(repoRoot, {
      platform: 'win32',
      existsSync: executable => executable.endsWith(path.join('runtime', 'node', 'node.exe')),
      inspect: executable => ({ version: 'v22.14.0', modules: '127', executable })
    });

    expect(selected.executablePath).toBe(path.join(repoRoot, 'runtime', 'node', 'node.exe'));
    expect(selected.runtime.modules).toBe('127');
    expect(() => resolveBundledNode(repoRoot, {
      platform: 'win32',
      existsSync: () => true,
      inspect: () => ({ version: 'v24.0.0', modules: '137' })
    })).toThrow(/expected Node 22 \/ native ABI 127/);
    expect(() => validateNodeRuntime({ version: 'v24.16.0', modules: '137' }))
      .toThrow(/expected Node 22 \/ native ABI 127/);
  });

  test('fails early instead of falling back to a global Node when bundle is missing', () => {
    expect(() => resolveBundledNode(path.resolve('..'), {
      platform: 'win32',
      existsSync: () => false
    })).toThrow(/Bundled Node runtime is missing/);
  });

  test('places the host runtime guard before capture effects and bundled Node startup', () => {
    const runnerPath = path.resolve(__dirname, '../../scripts/capture-product-screenshots.js');
    const source = require('fs').readFileSync(runnerPath, 'utf8');
    const capture = source.indexOf('async function capture()');
    const hostGuard = source.indexOf('validateNodeRuntime({ version: process.version', capture);
    const buildSpec = source.indexOf('buildDocsSpec(REPO_ROOT)', capture);
    const startup = source.indexOf('async function startIsolatedApp(');
    const bundledPreflight = source.indexOf('resolveBundledNode(REPO_ROOT)', startup);
    const portAllocation = source.indexOf("phase: 'port-allocation'", startup);
    const profileCreate = source.indexOf('fs.mkdtempSync', startup);
    const childSpawn = source.indexOf('spawn(captureNode.executablePath', startup);

    expect(hostGuard).toBeGreaterThan(capture);
    expect(buildSpec).toBeGreaterThan(hostGuard);
    expect(bundledPreflight).toBeGreaterThan(startup);
    expect(portAllocation).toBeGreaterThan(bundledPreflight);
    expect(profileCreate).toBeGreaterThan(portAllocation);
    expect(childSpawn).toBeGreaterThan(portAllocation);
    expect(childSpawn).toBeGreaterThan(profileCreate);
  });

  test('routes the Windows docs screenshot command through bundled Node', () => {
    const packageJson = require('../../package.json');
    expect(packageJson.scripts['docs:screenshots'])
      .toContain('runtime\\node\\node.exe scripts/capture-product-screenshots.js');
    expect(packageJson.scripts['docs:screenshots']).not.toContain('&& node scripts/');
  });
});
