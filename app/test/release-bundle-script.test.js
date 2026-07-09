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

  throw new Error('Python 3 is required for the LTTH release bundle test.');
}

function createTempRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-release-bundle-'));
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'app'), { recursive: true });

  const sourceScript = path.join(__dirname, '..', '..', 'scripts', 'build_release_bundle.py');
  const targetScript = path.join(root, 'scripts', 'build_release_bundle.py');
  fs.copyFileSync(sourceScript, targetScript);

  fs.writeFileSync(
    path.join(root, 'version.json'),
    JSON.stringify(
      {
        version: '1.3.24',
        downloadVersion: '1.3.24',
        downloadNote: 'Bootstrap launcher release',
        changelog: {
          '1.3.24': {
            changes: ['Launcher and app bundle are published together.']
          }
        }
      },
      null,
      2
    )
  );

  fs.writeFileSync(path.join(root, 'launcher.exe'), Buffer.from('launcher-binary'));
  fs.writeFileSync(path.join(root, 'CHANGELOG.md'), '# LTTH\n');
  fs.writeFileSync(path.join(root, 'LICENSE'), 'license\n');
  fs.writeFileSync(path.join(root, 'main.js'), 'console.log("hello");\n');
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '1.3.24' }, null, 2));
  fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3 }, null, 2));
  fs.writeFileSync(path.join(root, 'playwright.config.js'), 'module.exports = {};\n');

  fs.writeFileSync(path.join(root, 'app', 'package.json'), JSON.stringify({ version: '1.3.24' }, null, 2));
  fs.writeFileSync(path.join(root, 'app', 'package-lock.json'), JSON.stringify({ lockfileVersion: 3 }, null, 2));
  fs.writeFileSync(path.join(root, 'app', 'ltth_latest.zip'), Buffer.from('old-latest'));

  return root;
}

describe('Release bundle script', () => {
  let tempRoot;

  afterEach(() => {
    if (tempRoot) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
      tempRoot = undefined;
    }
  });

  it('builds the versioned patch bundle and changelog for release automation', () => {
    const python = findPythonCommand();
    tempRoot = createTempRepo();

    const scriptPath = path.join(tempRoot, 'scripts', 'build_release_bundle.py');
    const result = spawnSync(
      python.command,
      [...python.args, scriptPath, '--version', '1.3.24'],
      {
        cwd: tempRoot,
        encoding: 'utf8'
      }
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Built release bundle:');

    const versionDir = path.join(tempRoot, 'new_patch', 'ltth_1.3.24');
    const zipPath = path.join(versionDir, 'ltth_1.3.24.zip');
    const changelogPath = path.join(versionDir, 'changelog.txt');

    expect(fs.existsSync(zipPath)).toBe(true);
    expect(fs.existsSync(changelogPath)).toBe(true);
    expect(fs.readFileSync(changelogPath, 'utf8')).toContain('Bootstrap launcher release');

    const inspect = spawnSync(
      python.command,
      [
        ...python.args,
        '-c',
        'import json, sys, zipfile; print(json.dumps(zipfile.ZipFile(sys.argv[1]).namelist()))',
        zipPath
      ],
      { encoding: 'utf8' }
    );

    expect(inspect.status).toBe(0);
    const names = JSON.parse(inspect.stdout.trim());
    expect(names).toContain('ltth_1.3.24/launcher.exe');
    expect(names).toContain('ltth_1.3.24/app/package.json');
  });
});
