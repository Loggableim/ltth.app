const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function findPythonCommand() {
  const candidates = [
    { command: 'python3', args: [] },
    { command: 'python', args: [] },
    { command: 'py', args: ['-3'] }
  ];

  for (const candidate of candidates) {
    const probe = spawnSync(candidate.command, [...candidate.args, '--version'], {
      encoding: 'utf8'
    });

    if (probe.status === 0) {
      return candidate;
    }
  }

  throw new Error('Python 3 is required to run the LTTH release bundle tests.');
}

function createTempRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-pages-bundle-'));
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'app'), { recursive: true });
  fs.mkdirSync(path.join(root, 'app', 'config'), { recursive: true });
  fs.copyFileSync(
    path.join(__dirname, '..', 'config', 'plugin-release-policy.json'),
    path.join(root, 'app', 'config', 'plugin-release-policy.json')
  );

  const sourceScript = path.join(__dirname, '..', '..', 'scripts', 'build_pages_bundle.py');
  const targetScript = path.join(root, 'scripts', 'build_pages_bundle.py');
  fs.copyFileSync(sourceScript, targetScript);

  fs.writeFileSync(path.join(root, 'app', 'CURRENT_VERSION.txt'), '1.3.24\n');
  fs.writeFileSync(
    path.join(root, 'app', 'CURRENT_RELEASE.json'),
    JSON.stringify(
      {
        version: '1.3.24',
        updated_at: '2026-07-09T00:00:00Z',
        notes: 'Release notes'
      },
      null,
      2
    )
  );
  writeZip(path.join(root, 'app', 'ltth_latest.zip'), {
    'ltth_1.3.24/app/config/distribution-mode.json': '{"channel":"public"}',
    'ltth_1.3.24/app/plugins/goals/plugin.json': '{"id":"goals"}'
  });
  fs.mkdirSync(path.join(root, 'auth'), { recursive: true });
  fs.writeFileSync(path.join(root, 'auth', 'index.html'), '<!doctype html><title>Auth</title>');
  fs.writeFileSync(path.join(root, 'auth', 'bridge.js'), 'window.__authBridge = true;');

  return root;
}

function writeZip(filename, entries) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const python = findPythonCommand();
  const result = spawnSync(python.command, [...python.args, '-c',
    'import json,sys,zipfile; z=zipfile.ZipFile(sys.argv[1],"w"); [z.writestr(k,v) for k,v in json.loads(sys.argv[2]).items()]; z.close()',
    filename, JSON.stringify(entries)], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || 'ZIP fixture failed');
}

describe('Pages release bundle', () => {
  let tempRoot;

  afterEach(() => {
    if (tempRoot) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
      tempRoot = undefined;
    }
  });

  it('copies the public app release artifacts into the pages output', () => {
    const python = findPythonCommand();
    tempRoot = createTempRepo();

    const outputDir = path.join(tempRoot, 'out');
    const scriptPath = path.join(tempRoot, 'scripts', 'build_pages_bundle.py');
    const result = spawnSync(
      python.command,
      [...python.args, scriptPath, '--output', outputDir],
      {
        cwd: tempRoot,
        encoding: 'utf8'
      }
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Website bundle written to:');

    const versionPath = path.join(outputDir, 'app', 'CURRENT_VERSION.txt');
    const releasePath = path.join(outputDir, 'app', 'CURRENT_RELEASE.json');
    const zipPath = path.join(outputDir, 'app', 'ltth_latest.zip');
    const authIndexPath = path.join(outputDir, 'auth', 'index.html');
    const authBridgePath = path.join(outputDir, 'auth', 'bridge.js');

    expect(fs.existsSync(versionPath)).toBe(true);
    expect(fs.existsSync(releasePath)).toBe(true);
    expect(fs.existsSync(zipPath)).toBe(true);
    expect(fs.existsSync(authIndexPath)).toBe(true);
    expect(fs.existsSync(authBridgePath)).toBe(true);
    expect(fs.readFileSync(versionPath, 'utf8')).toBe('1.3.24\n');
    expect(JSON.parse(fs.readFileSync(releasePath, 'utf8'))).toMatchObject({
      version: '1.3.24',
      notes: 'Release notes'
    });
    expect(fs.readFileSync(zipPath)).toEqual(fs.readFileSync(path.join(tempRoot, 'app', 'ltth_latest.zip')));
    expect(fs.readFileSync(authIndexPath, 'utf8')).toBe('<!doctype html><title>Auth</title>');
    expect(fs.readFileSync(authBridgePath, 'utf8')).toBe('window.__authBridge = true;');
  });

  it.each(['plugin.json', 'Plugin.json'])('omits closed-beta packages and renamed %s app manifests without deleting local sources', (manifestFilename) => {
    tempRoot = createTempRepo();
    const packages = path.join(tempRoot, 'plugin-store', 'packages');
    writeZip(path.join(packages, 'goals-1.0.0.zip'), {
      'plugin.json': '{"id":"goals"}',
      'vendor/public-helper/plugin.json': '{"id":"public_helper"}'
    });
    writeZip(path.join(packages, 'music-bot-1.0.0.zip'), { 'plugin.json': '{"id":"music-bot"}' });
    writeZip(path.join(packages, 'renamed-package.zip'), { 'plugin.json': '{"id":"talking-heads"}' });
    writeZip(path.join(packages, 'legacy-alias.zip'), { 'plugin.json': '{"id":"streamalchemy"}' });
    writeZip(path.join(packages, 'closed-dependency.zip'), {
      'plugin.json': '{"id":"open-wrapper"}',
      'vendor/talking-heads/plugin.json': '{"id":"talking-heads"}'
    });
    writeZip(path.join(tempRoot, 'app', 'ltth_latest.zip'), {
      'ltth_1.4.4/app/config/distribution-mode.json': '{"channel":"public"}',
      'ltth_1.4.4/app/plugins/renamed/main.js': 'local code',
      [`ltth_1.4.4/app/Plugins/renamed/${manifestFilename}`]: '{"id":"public-wrapper","aliases":["streamalchemy"]}'
    });
    const output = path.join(tempRoot, 'out');
    const python = findPythonCommand();
    const result = spawnSync(python.command, [...python.args,
      path.join(tempRoot, 'scripts', 'build_pages_bundle.py'), '--output', output], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(output, 'plugin-store', 'packages', 'goals-1.0.0.zip'))).toBe(true);
    for (const name of ['music-bot-1.0.0.zip', 'renamed-package.zip', 'legacy-alias.zip', 'closed-dependency.zip']) {
      expect(fs.existsSync(path.join(output, 'plugin-store', 'packages', name))).toBe(false);
      expect(fs.existsSync(path.join(packages, name))).toBe(true);
    }
    expect(fs.existsSync(path.join(output, 'app', 'ltth_latest.zip'))).toBe(false);
    expect(fs.existsSync(path.join(tempRoot, 'app', 'ltth_latest.zip'))).toBe(true);
  });

  it('triggers Pages deployments when app release artifacts change', () => {
    const workflowPath = path.join(__dirname, '..', '..', '.github', 'workflows', 'pages.yml');
    const workflow = fs.readFileSync(workflowPath, 'utf8');

    expect(workflow).toContain('app/**');
    expect(workflow).toContain('auth/**');
  });
});
