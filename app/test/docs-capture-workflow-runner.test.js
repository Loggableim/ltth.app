'use strict';

const fs = require('fs');
const path = require('path');
const {
  assertWorkflowOperationsExecuted,
  createBlockedNetworkEvidence
} = require('../../scripts/lib/docs-capture-workflow-runner');
const os = require('os');
const {
  assertDashboardNavigationResponse,
  buildSafeCaptureEnvironment,
  createDashboardOutputDirectory,
  getCapturePluginAllowlist,
  isAllowedDashboardCaptureUrl,
  attachDashboardOnlyRequestPolicy,
  validateDashboardOutputDirectory,
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

  describe('dashboard-only capture boundaries', () => {
    const origin = 'http://127.0.0.1:34567';

    test.each([
      ['dashboard route', `${origin}/dashboard.html?lang=de`, true],
      ['local asset', `${origin}/js/dashboard.js`, true],
      ['local API', `${origin}/api/health`, true],
      ['different host', 'http://localhost:34567/dashboard.html', false],
      ['different port', 'http://127.0.0.1:34568/dashboard.html', false],
      ['different scheme', 'https://127.0.0.1:34567/dashboard.html', false],
      ['external host', 'https://example.com/dashboard.html', false],
      ['credentials in URL', 'http://user@127.0.0.1:34567/dashboard.html', false]
    ])('origin policy handles %s', (_label, url, allowed) => {
      expect(isAllowedDashboardCaptureUrl(url, origin)).toBe(allowed);
    });

    test('rejects redirects and any navigation response outside the exact origin', async () => {
      const response = (url, status) => ({ url: () => url, status: () => status });
      await expect(assertDashboardNavigationResponse(response(`${origin}/dashboard.html`, 200), origin)).resolves.toBeDefined();
      await expect(assertDashboardNavigationResponse(response(`${origin}/dashboard.html`, 302), origin))
        .rejects.toThrow('Dashboard navigation redirects are not allowed');
      await expect(assertDashboardNavigationResponse(response('http://localhost:34567/dashboard.html', 200), origin))
        .rejects.toThrow('Dashboard navigation escaped its allowed origin');
    });

    test('continues only requests matching the allowed origin and aborts all others', async () => {
      const handlers = {};
      const page = {
        setRequestInterception: jest.fn(async () => {}),
        on: jest.fn((event, handler) => { handlers[event] = handler; })
      };
      await attachDashboardOnlyRequestPolicy(page, origin);
      const allowed = { url: () => `${origin}/js/dashboard.js`, continue: jest.fn(), abort: jest.fn(async () => {}) };
      const denied = { url: () => 'https://example.com/tracker.js', continue: jest.fn(), abort: jest.fn(async () => {}) };

      handlers.request(allowed);
      handlers.request(denied);
      await Promise.resolve();

      expect(allowed.continue).toHaveBeenCalledWith({ url: `${origin}/js/dashboard.js` });
      expect(allowed.abort).not.toHaveBeenCalled();
      expect(denied.abort).toHaveBeenCalledWith('blockedbyclient');
      expect(denied.continue).not.toHaveBeenCalled();
    });

    test('requires an explicit absolute output directory outside the repository', () => {
      const repository = path.resolve(__dirname, '..', '..');
      expect(() => validateDashboardOutputDirectory(undefined, repository)).toThrow('explicit absolute SCREENSHOT_OUTPUT_DIR');
      expect(() => validateDashboardOutputDirectory(path.join(repository, 'screenshots'), repository))
        .toThrow('must be outside the repository');
      expect(() => validateDashboardOutputDirectory(path.join(os.tmpdir(), 'arbitrary-temp-dir'), repository))
        .toThrow('dedicated disposable temp prefix');
      const requested = path.join(os.tmpdir(), `ltth-dashboard-capture-test-${process.pid}`);
      expect(validateDashboardOutputDirectory(requested, repository)).toBe(path.resolve(requested));
      fs.mkdirSync(requested, { recursive: true });
      expect(() => validateDashboardOutputDirectory(requested, repository)).toThrow('must not already exist');
      fs.rmSync(requested, { recursive: true, force: true });

      const linkPath = path.join(os.tmpdir(), `ltth-dashboard-capture-link-${process.pid}`);
      const targetPath = path.join(os.tmpdir(), `ltth-dashboard-capture-target-${process.pid}`);
      fs.mkdirSync(targetPath, { recursive: true });
      try {
        fs.symlinkSync(targetPath, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
        expect(() => validateDashboardOutputDirectory(linkPath, repository)).toThrow('must not already exist');
      } finally {
        fs.rmSync(linkPath, { recursive: true, force: true });
        fs.rmSync(targetPath, { recursive: true, force: true });
      }

      const created = createDashboardOutputDirectory(requested, repository);
      try {
        expect(fs.realpathSync(created)).toBe(created);
        expect(path.dirname(created)).toBe(path.resolve(os.tmpdir()));
        expect(path.basename(created)).toMatch(/^ltth-dashboard-capture-test-/);
      } finally {
        fs.rmSync(created, { recursive: true, force: true });
      }
    });

    test('keeps dashboard-only mode separate and validates output before any app/browser runner', () => {
      const source = fs.readFileSync(runnerPath, 'utf8');
      const capture = source.slice(source.indexOf('async function capture()'), source.indexOf("if (require.main === module)"));

      expect(capture.indexOf('validateDashboardOutputDirectory(process.env.SCREENSHOT_OUTPUT_DIR)'))
        .toBeLessThan(capture.indexOf('captureDashboardOnly(locale, outputDir)'));
      expect(capture.indexOf('DASHBOARD_ONLY')).toBeLessThan(capture.indexOf('buildDocsSpec(REPO_ROOT)'));
      expect(capture).toContain('await captureDashboardOnly(locale, outputDir)');
      expect(capture).toContain('return;');
      expect(source).toContain("new URL('/dashboard.html', origin)");
      expect(source).toContain('await attachDashboardOnlyRequestPolicy(page, origin)');
      expect(source).toContain("path.join(outputDir, 'dashboard-state.json')");
      expect(source).toContain("path.join(outputDir, 'dashboard.png')");
      expect(source).toContain("await page.screenshot({ path: screenshotPath, type: 'png', fullPage: true })");
      expect(source).toContain('assertSandboxedDashboardBrowserSupport(browserExecutablePath())');
      expect(source).toContain('response.status()');
      const dashboardFlow = source.slice(source.indexOf('async function captureDashboardOnly('), source.indexOf('function compatibleDocsOutput('));
      expect(dashboardFlow).not.toContain('--no-sandbox');
      expect(dashboardFlow).not.toContain('--disable-setuid-sandbox');
      expect(dashboardFlow).toContain("redirect: 'manual'");
      expect(dashboardFlow.indexOf('await assertDashboardNavigationResponse(response, origin)'))
        .toBeLessThan(dashboardFlow.indexOf('await page.waitForFunction'));

      const appStart = source.slice(source.indexOf('async function startIsolatedApp('), source.indexOf('async function stopIsolatedApp('));
      expect(appStart).toContain("!DASHBOARD_ONLY && COLLECTION === 'docs'");
      expect(appStart).toContain('validateSafeCaptureEnvironment(childEnvironment)');
      expect(appStart).toContain('env: childEnvironment');
      expect(appStart).not.toContain('...process.env');
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
