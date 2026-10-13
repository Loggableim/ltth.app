'use strict';

const fs = require('fs');
const path = require('path');
const {
  assertWorkflowOperationsExecuted,
  createBlockedNetworkEvidence
} = require('../../scripts/lib/docs-capture-workflow-runner');
const os = require('os');
const {
  buildSafeCaptureEnvironment,
  getCapturePluginAllowlist,
  validateSafeCaptureEnvironment
} = require('../../scripts/capture-product-screenshots');

const runnerPath = path.join(__dirname, '..', '..', 'scripts', 'capture-product-screenshots.js');

describe('documentation screenshot workflow runner', () => {
  describe('safe local capture environment', () => {
    let tempRoot;
    let profileDir;

    beforeEach(() => {
      tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-capture-env-test-'));
      profileDir = path.join(tempRoot, 'profile');
      fs.mkdirSync(path.join(profileDir, 'logs'), { recursive: true });
    });

    afterEach(() => fs.rmSync(tempRoot, { recursive: true, force: true }));

    test('builds a minimal Windows environment and ignores unrelated inherited values', () => {
      const env = buildSafeCaptureEnvironment({
        profileDir,
        port: 34567,
        platform: 'win32',
        tempDir: tempRoot,
        systemEnvironment: {
          SystemRoot: 'C:\\Windows',
          WINDIR: 'C:\\Windows',
          USERPROFILE: 'C:\\Users\\real-user',
          APPDATA: 'C:\\Users\\real-user\\AppData\\Roaming',
          API_TOKEN: 'must-not-pass'
        }
      });

      expect(env.APPDATA).toBeUndefined();
      expect(env.API_TOKEN).toBeUndefined();
      expect(env.SystemRoot).toBe('C:\\Windows');
      expect(env.USERPROFILE).toBe('');
      expect(env.LTTH_DOCS_CAPTURE_ALLOWED_PLUGINS).toBe('');
      expect(env.LOCALAPPDATA).toBe(profileDir);
      expect(env.LTTH_LOG_DIR).toBe(path.join(profileDir, 'logs'));
      expect(env.LTTH_BIND_ADDRESS).toBe('127.0.0.1');
      expect(env.LTTH_NO_BROWSER).toBe('true');
      expect(() => validateSafeCaptureEnvironment(env, { platform: 'win32', tempDir: tempRoot })).not.toThrow();
    });

    test('rejects an inherited secret or other unapproved variable before capture can start', () => {
      const env = buildSafeCaptureEnvironment({ profileDir, port: 34567, tempDir: tempRoot });
      env.API_TOKEN = 'must-not-pass';

      expect(() => validateSafeCaptureEnvironment(env, { tempDir: tempRoot }))
        .toThrow('Safe capture environment contains unsupported variable: API_TOKEN');
    });

    test('rejects missing isolated logs and a non-loopback bind address', () => {
      const missingLogs = buildSafeCaptureEnvironment({ profileDir, port: 34567, tempDir: tempRoot });
      missingLogs.LTTH_LOG_DIR = path.join(tempRoot, 'outside-logs');
      expect(() => validateSafeCaptureEnvironment(missingLogs, { tempDir: tempRoot }))
        .toThrow('Documentation capture paths must stay inside a nested temporary profile');

      const nonLoopback = buildSafeCaptureEnvironment({ profileDir, port: 34567, tempDir: tempRoot });
      nonLoopback.LTTH_BIND_ADDRESS = '0.0.0.0';
      expect(() => validateSafeCaptureEnvironment(nonLoopback, { tempDir: tempRoot }))
        .toThrow('Documentation capture environment has unsafe flag values');
    });

    test('allows a plugin only when its fixture is nested and explicitly listed', () => {
      const pluginDir = path.join(profileDir, 'plugins');
      const pluginRoot = path.join(pluginDir, 'dashboard-local');
      fs.mkdirSync(pluginRoot, { recursive: true });
      fs.writeFileSync(path.join(pluginRoot, 'plugin.json'), JSON.stringify({ id: 'dashboard-local' }));
      const env = buildSafeCaptureEnvironment({
        profileDir,
        port: 34567,
        pluginDir,
        allowedPluginIds: 'dashboard-local',
        tempDir: tempRoot
      });

      expect(() => validateSafeCaptureEnvironment(env, { tempDir: tempRoot })).not.toThrow();
      env.LTTH_DOCS_CAPTURE_ALLOWED_PLUGINS = '';
      expect(() => validateSafeCaptureEnvironment(env, { tempDir: tempRoot }))
        .toThrow('Documentation capture plugin fixture manifest ID must match its canonical directory and allowlist ID');
    });

    test('validates the isolated child environment before spawning the app', () => {
      const source = fs.readFileSync(runnerPath, 'utf8');
      const start = source.slice(source.indexOf('async function startIsolatedApp('), source.indexOf('async function stopIsolatedApp('));

      expect(start.indexOf('validateSafeCaptureEnvironment(childEnvironment)'))
        .toBeLessThan(start.indexOf('spawn(process.execPath'));
      expect(start).toContain('env: childEnvironment');
      expect(start).not.toContain('...process.env');
      expect(start).toContain('http://127.0.0.1:${port}');
    });

    test('derives the plugin allowlist only from manifests inside the isolated fixture', () => {
      const fixtureRoot = path.join(profileDir, 'plugins');
      const pluginRoot = path.join(fixtureRoot, 'dashboard-local');
      fs.mkdirSync(pluginRoot, { recursive: true });
      fs.writeFileSync(path.join(pluginRoot, 'plugin.json'), JSON.stringify({ id: 'dashboard-local' }));
      fs.mkdirSync(path.join(fixtureRoot, 'without-manifest'));

      expect(getCapturePluginAllowlist(null)).toBe('');
      expect(getCapturePluginAllowlist(fixtureRoot)).toBe('dashboard-local');
    });
  });

  test('accepts only declared operations with matching observed local evidence', () => {
    const operations = assertWorkflowOperationsExecuted({
      workflow: {
        operations: [
          { type: 'goto', route: '/plugins/example/ui.html' },
          { type: 'open-plugin-surface', selector: '#panel' },
          { type: 'set-demo-value', selector: '#title' },
          { type: 'prepare', name: 'open-example-panel' }
        ]
      },
      state: {
        route: '/plugins/example/ui.html?lang=en',
        controls: { '#panel': { visible: true } }
      },
      interactions: [{
        type: 'set-demo-value',
        selector: '#title',
        status: 'performed',
        observed: true,
        changed: true
      }],
      preparation: [{ type: 'open-example-panel', observed: true }]
    });

    expect(operations).toHaveLength(4);
    expect(operations.every((operation) => operation.observed)).toBe(true);
  });

  test('rejects unsupported operations and unobserved interaction claims', () => {
    expect(() => assertWorkflowOperationsExecuted({
      workflow: { operations: [{ type: 'remote-device-test', selector: '#device' }] },
      state: { route: '/', controls: {} }
    })).toThrow('Unsupported documentation workflow operation');

    expect(() => assertWorkflowOperationsExecuted({
      workflow: { operations: [{ type: 'run-local-preview', selector: '#preview' }] },
      state: { route: '/', controls: {} },
      interactions: [{ type: 'run-local-preview', selector: '#preview', status: 'performed', changed: true }]
    })).toThrow('has no observed local interaction evidence');
  });

  test('accepts an earlier setup navigation when an overlay is the final route', () => {
    const operations = assertWorkflowOperationsExecuted({
      workflow: {
        operations: [
          { type: 'goto', route: '/plugins/advanced-timer/ui.html' },
          { type: 'goto', route: '/plugins/advanced-timer/overlay/index.html' }
        ]
      },
      state: {
        route: '/plugins/advanced-timer/overlay/index.html?timer=demo',
        navigations: [{ route: '/plugins/advanced-timer/ui.html?lang=en', observed: true }]
      }
    });

    expect(operations.every((operation) => operation.observed)).toBe(true);
  });

  test('records every blocked external request as capture evidence', () => {
    expect(createBlockedNetworkEvidence({
      url: 'https://example.com/tracker.js',
      method: 'GET',
      resourceType: 'script'
    })).toEqual({
      url: 'https://example.com/tracker.js',
      method: 'GET',
      resourceType: 'script',
      attempted: true,
      disposition: 'blocked'
    });
  });

  test('does not inject Store Admin or OpenShock demo UI state', () => {
    const source = fs.readFileSync(runnerPath, 'utf8');

    expect(source).not.toContain('STORE_ADMIN_OPTIONAL_API_RESPONSES');
    expect(source).not.toContain('handleCommandSent({');
    expect(source).not.toContain('changed: true');
    expect(source).toContain('assertWorkflowOperationsExecuted');
    expect(source).toContain('executedOperations');
    expect(source).toContain('blockedNetwork');
    expect(source).toContain("prepare: 'open-goal-create-modal', preparationEvidenceSelector: '#goal-modal'");
  });
});
