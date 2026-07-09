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
  fs.writeFileSync(path.join(root, 'app', 'ltth_latest.zip'), Buffer.from('zip-bundle'));
  fs.mkdirSync(path.join(root, 'auth'), { recursive: true });
  fs.writeFileSync(path.join(root, 'auth', 'index.html'), '<!doctype html><title>Auth</title>');
  fs.writeFileSync(path.join(root, 'auth', 'bridge.js'), 'window.__authBridge = true;');

  return root;
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
    expect(fs.readFileSync(zipPath)).toEqual(Buffer.from('zip-bundle'));
    expect(fs.readFileSync(authIndexPath, 'utf8')).toBe('<!doctype html><title>Auth</title>');
    expect(fs.readFileSync(authBridgePath, 'utf8')).toBe('window.__authBridge = true;');
  });

  it('triggers Pages deployments when app release artifacts change', () => {
    const workflowPath = path.join(__dirname, '..', '..', '.github', 'workflows', 'pages.yml');
    const workflow = fs.readFileSync(workflowPath, 'utf8');

    expect(workflow).toContain('app/**');
    expect(workflow).toContain('auth/**');
  });
});
