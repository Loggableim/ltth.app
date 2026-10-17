'use strict';

const fs = require('fs');
const path = require('path');
const {
  createCaptureLifecycleReporter,
  formatFatalCaptureError,
  runCapturePhase
} = require('../../scripts/lib/capture-lifecycle-report');

describe('capture lifecycle reports', () => {
  test.each([
    ['browser', 'launch'],
    ['browser', 'navigate-and-capture'],
    ['app', 'health-check']
  ])('reports %s %s failure and records process/temp cleanup', async (component, phase) => {
    const stdout = jest.spyOn(console, 'log').mockImplementation(() => {});
    const stderr = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const reporter = createCaptureLifecycleReporter({ write: (line) => console.log(line) });
      const fields = { locale: 'de', guideId: 'sidekick', id: 'sidekick__status-view', pid: 4312, port: 40231, browserPort: 43917 };
      reporter.record({ component: 'app', event: 'process-start', phase: 'server', ...fields, status: 'started' });
      await expect(runCapturePhase(reporter, { component, phase, ...fields }, async () => {
        const error = new Error('access_token=sample-secret');
        if (phase !== 'navigate-and-capture') {
          error.captureExitCode = 1;
          error.captureSignal = 'SIGTERM';
        }
        throw error;
      })).rejects.toThrow('access_token=sample-secret');

      await expect(runCapturePhase(reporter, {
        component, phase: 'process-cleanup', ...fields
      }, async () => { throw new Error('close failed password=close-secret'); })).rejects.toThrow('close failed');
      reporter.record({ component, event: 'process-close', phase: 'runtime', ...fields, exitCode: null, signal: 'SIGTERM' });
      await runCapturePhase(reporter, {
        component: 'app', phase: 'temp-profile-cleanup', ...fields, tempProfile: 'created',
        resultDetails: () => ({ tempProfile: 'removed' })
      }, async () => {});

      const messages = stdout.mock.calls.map(([line]) => JSON.parse(line.replace(/^\[capture-lifecycle\] /, '')));
      const failure = messages.find((event) => event.component === component && event.phase === phase && event.event === 'failure');
      expect(failure).toMatchObject({
        locale: 'de', id: 'sidekick__status-view', pid: 4312, port: 40231, browserPort: 43917,
        exitCode: phase === 'navigate-and-capture' ? 'unknown' : 1,
        signal: phase === 'navigate-and-capture' ? 'none' : 'SIGTERM'
      });
      expect(failure.error).toContain('access_token=[REDACTED]');
      expect(failure.error).not.toContain('sample-secret');
      const cleanupFailure = messages.find((event) => event.phase === 'process-cleanup' && event.event === 'failure');
      expect(cleanupFailure.error).toContain('password=[REDACTED]');
      expect(cleanupFailure.error).not.toContain('close-secret');
      expect(messages.some((event) => event.event === 'process-close' && event.signal === 'SIGTERM')).toBe(true);
      expect(messages.some((event) => event.phase === 'temp-profile-cleanup' && event.event === 'success' && event.tempProfile === 'removed')).toBe(true);
      expect(stderr).not.toHaveBeenCalled();
    } finally {
      stdout.mockRestore();
      stderr.mockRestore();
    }
  });

  test('redacts fatal top-level stacks before output', () => {
    const secret = formatFatalCaptureError(new Error('password=private-value'));
    const userPath = formatFatalCaptureError(new Error('SQLite path C:\\Users\\person\\AppData\\Local\\ltth.app\\user_configs\\default.db'));
    expect(secret).toContain('password=[REDACTED]');
    expect(secret).not.toContain('private-value');
    expect(userPath).toContain('[redacted user data path/output]');
    expect(userPath).not.toContain('default.db');
  });

  test('wires diagnostics through launch, health, navigation, cleanup, and fatal paths', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../scripts/capture-product-screenshots.js'), 'utf8');
    expect(source).toContain("phase: 'health-check'");
    expect(source).toContain("phase: 'launch'");
    expect(source).toContain("phase: 'navigate-and-capture'");
    expect(source).toContain("phase: 'process-cleanup'");
    expect(source).toContain("phase: 'temp-profile-cleanup'");
    expect(source).toContain("child.once('exit'");
    expect(source).toContain("processHandle.once?.('exit'");
    expect(source).toContain('await stopIsolatedApp(app, guideLabel, lifecycle)');
    expect(source).toContain('console.error(formatFatalCaptureError(error))');
  });
});
