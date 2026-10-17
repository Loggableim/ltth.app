'use strict';

const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function findPythonCommand() {
  for (const candidate of [
    { command: 'python', args: [] },
    { command: 'py', args: ['-3'] }
  ]) {
    const result = spawnSync(candidate.command, [...candidate.args, '--version'], { encoding: 'utf8' });
    if (result.status === 0) return candidate;
  }
  throw new Error('Python 3 is required for the synthetic Pages metadata test.');
}

function sha256File(filename) {
  return crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
}

describe('Pages internal metadata exclusion', () => {
  let tempRoot;

  afterEach(() => {
    if (!tempRoot) return;
    const tempBase = path.resolve(os.tmpdir());
    const resolved = path.resolve(tempRoot);
    const stat = fs.lstatSync(resolved);
    if (!stat.isDirectory()
      || stat.isSymbolicLink()
      || path.dirname(resolved) !== tempBase
      || !path.basename(resolved).startsWith('ltth-pages-internal-metadata-')) {
      throw new Error(`Refusing to remove test path outside its unique temp directory: ${tempRoot}`);
    }
    fs.rmSync(resolved, { recursive: true, force: true });
    tempRoot = undefined;
  });

  test('does not publish internal docs or screenshot indexes but keeps public content unchanged', () => {
    const python = findPythonCommand();
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-pages-internal-metadata-'));
    const repoRoot = path.join(tempRoot, 'repo');
    const scriptsDir = path.join(repoRoot, 'scripts');
    const docsDir = path.join(repoRoot, 'docs');
    const screenshotsDir = path.join(repoRoot, 'screenshots');
    const installDir = path.join(repoRoot, 'install');
    const outputDir = path.join(tempRoot, 'published-docs');
    const scriptPath = path.join(scriptsDir, 'build_pages_bundle.py');

    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.mkdirSync(path.join(docsDir, 'user-guide'), { recursive: true });
    fs.mkdirSync(path.join(screenshotsDir, 'docs'), { recursive: true });
    fs.mkdirSync(path.join(installDir, 'test'), { recursive: true });
    fs.copyFileSync(path.join(__dirname, '..', '..', 'scripts', 'build_pages_bundle.py'), scriptPath);
    const manifestPath = path.join(docsDir, 'root-i18n-migration-manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify({
      entries: [{ source: 'features/plugin-chatango.html', key: 'website.features.plugin-chatango.text.001' }]
    }));
    const manifestSha256 = sha256File(manifestPath);
    fs.writeFileSync(path.join(docsDir, 'user-guide', 'start.html'), '<h1>Public user guide</h1>\n');
    const screenshotReadme = path.join(screenshotsDir, 'README.md');
    const screenshotIndex = path.join(screenshotsDir, 'README_SCREENSHOTS.md');
    const captureManifest = path.join(screenshotsDir, 'docs-capture-manifest.json');
    const publicScreenshot = path.join(screenshotsDir, 'docs', 'dashboard.png');
    const installer = path.join(installDir, 'install.js');
    const guardTest = path.join(installDir, 'test', 'public-release-env-guard.tests.ps1');
    fs.writeFileSync(screenshotReadme, 'plugin-chatango-dashboard.png\n');
    fs.writeFileSync(screenshotIndex, 'features/plugin-chatango.html\n');
    fs.writeFileSync(captureManifest, JSON.stringify({ requests: [{ url: 'http://127.0.0.1:53190/js/chatango-theme-adapter.js' }] }));
    fs.writeFileSync(publicScreenshot, 'synthetic screenshot bytes\n');
    fs.writeFileSync(installer, 'synthetic public installer entrypoint\n');
    fs.writeFileSync(guardTest, "synthetic regression fixture: chatango retired\n");
    const screenshotReadmeHash = sha256File(screenshotReadme);
    const screenshotIndexHash = sha256File(screenshotIndex);
    const captureManifestHash = sha256File(captureManifest);
    const publicScreenshotHash = sha256File(publicScreenshot);
    const guardTestHash = sha256File(guardTest);

    const code = [
      'import importlib.util, pathlib, sys',
      'script=pathlib.Path(sys.argv[1])',
      'spec=importlib.util.spec_from_file_location("synthetic_pages_builder", script)',
      'module=importlib.util.module_from_spec(spec)',
      'spec.loader.exec_module(module)',
      'module.copy_tree(module.REPO_ROOT / "docs", pathlib.Path(sys.argv[2]), set())',
      'module.copy_tree(module.REPO_ROOT / "screenshots", pathlib.Path(sys.argv[2]) / "screenshots", set())',
      'module.copy_tree(module.REPO_ROOT / "install", pathlib.Path(sys.argv[2]) / "install", set())'
    ].join('\n');
    const result = spawnSync(python.command, [...python.args, '-c', code, scriptPath, outputDir], {
      encoding: 'utf8'
    });

    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(outputDir, 'root-i18n-migration-manifest.json'))).toBe(false);
    expect(fs.readFileSync(path.join(outputDir, 'user-guide', 'start.html'), 'utf8')).toContain('Public user guide');
    expect(sha256File(manifestPath)).toBe(manifestSha256);
    expect(fs.existsSync(path.join(outputDir, 'screenshots', 'README.md'))).toBe(false);
    expect(fs.existsSync(path.join(outputDir, 'screenshots', 'README_SCREENSHOTS.md'))).toBe(false);
    expect(fs.existsSync(path.join(outputDir, 'screenshots', 'docs-capture-manifest.json'))).toBe(false);
    expect(fs.readFileSync(path.join(outputDir, 'screenshots', 'docs', 'dashboard.png'), 'utf8')).toContain('synthetic screenshot bytes');
    expect(sha256File(screenshotReadme)).toBe(screenshotReadmeHash);
    expect(sha256File(screenshotIndex)).toBe(screenshotIndexHash);
    expect(sha256File(captureManifest)).toBe(captureManifestHash);
    expect(sha256File(publicScreenshot)).toBe(publicScreenshotHash);
    expect(fs.existsSync(path.join(outputDir, 'install', 'test', 'public-release-env-guard.tests.ps1'))).toBe(false);
    expect(fs.readFileSync(path.join(outputDir, 'install', 'install.js'), 'utf8')).toContain('synthetic public installer entrypoint');
    expect(sha256File(guardTest)).toBe(guardTestHash);
  });
});
