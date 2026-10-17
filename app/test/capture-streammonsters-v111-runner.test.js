const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  resolveLocalPlaywrightCli
} = require('../../scripts/capture-streammonsters-v111');

describe('Stream Monsters 1.11 capture runner isolation', () => {
  let repoRoot;

  beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-sm111-runner-test-'));
  });

  afterEach(() => fs.rmSync(repoRoot, { recursive: true, force: true }));

  test('fails before starting the app if the local Playwright CLI is unavailable', () => {
    expect(() => resolveLocalPlaywrightCli(repoRoot)).toThrow(/does not install packages or use npx/);
  });

  test('accepts only the local package entry point declared by its manifest', () => {
    const packageRoot = path.join(repoRoot, 'app', 'node_modules', '@playwright', 'cli');
    fs.mkdirSync(packageRoot, { recursive: true });
    fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({
      name: '@playwright/cli',
      bin: { 'playwright-cli': 'bin/cli.js' }
    }));
    fs.mkdirSync(path.join(packageRoot, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(packageRoot, 'bin', 'cli.js'), '');

    expect(resolveLocalPlaywrightCli(repoRoot)).toBe(path.join(packageRoot, 'bin', 'cli.js'));
  });

  test('uses the bundled runtime, a minimal child environment, and only Stream Monsters', () => {
    const runner = fs.readFileSync(path.resolve(__dirname, '../../scripts/capture-streammonsters-v111.js'), 'utf8');

    expect(runner).toContain("const allowedPluginIds = ['stream-monsters'];");
    expect(runner).toContain('createDocsCaptureChildEnvironment({');
    expect(runner).toContain('spawn(captureNode.executablePath');
    expect(runner).toContain('resolveLocalPlaywrightCli(REPO_ROOT)');
    expect(runner).not.toContain('...process.env');
    expect(runner).not.toContain("'--yes'");
    expect(runner).not.toContain("'npx'");
  });
});
