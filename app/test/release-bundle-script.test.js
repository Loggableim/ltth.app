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

  const rgsRoot = path.join(
    root,
    'app',
    'plugins',
    'talking-heads',
    'assets',
    'asset-packs',
    'rgs'
  );
  const headsRoot = path.join(rgsRoot, 'Animated body parts', 'Heads', 'head1');
  const eyesRoot = path.join(rgsRoot, 'Animated body parts', 'Eyes', 'eyes1');
  fs.mkdirSync(headsRoot, { recursive: true });
  fs.mkdirSync(eyesRoot, { recursive: true });
  fs.writeFileSync(path.join(rgsRoot, 'License.txt'), 'RGS license\n');
  fs.writeFileSync(path.join(headsRoot, 'idle_0.png'), Buffer.from('runtime-head'));
  fs.writeFileSync(path.join(headsRoot, 'idle_1.png'), Buffer.from('unused-head-frame'));
  fs.writeFileSync(path.join(eyesRoot, 'idle_0.png'), Buffer.from('runtime-eyes'));
  fs.writeFileSync(path.join(eyesRoot, 'idle_3.png'), Buffer.from('runtime-blink'));
  fs.writeFileSync(path.join(eyesRoot, 'idle_7.png'), Buffer.from('unused-eye-frame'));

  const bobaAnimalRoot = path.join(
    root,
    'app',
    'plugins',
    'talking-heads',
    'assets',
    'asset-packs',
    'boba',
    'animals',
    'Fox'
  );
  const bobaLayersRoot = path.join(bobaAnimalRoot, 'Layers');
  const bobaReadyRoot = path.join(bobaAnimalRoot, 'Ready-To-Use');
  fs.mkdirSync(bobaLayersRoot, { recursive: true });
  fs.mkdirSync(bobaReadyRoot, { recursive: true });
  fs.writeFileSync(path.join(bobaLayersRoot, 'Fox_Base.png'), Buffer.from('runtime-boba-layer'));
  fs.writeFileSync(path.join(bobaReadyRoot, 'Fox.png'), Buffer.from('unused-composite'));

  const nestedDependencyRoot = path.join(root, 'app', 'app', 'node_modules', 'example');
  fs.mkdirSync(nestedDependencyRoot, { recursive: true });
  fs.writeFileSync(path.join(nestedDependencyRoot, 'index.js'), 'module.exports = {};\n');

  const testRoot = path.join(root, 'app', 'test');
  fs.mkdirSync(testRoot, { recursive: true });
  fs.writeFileSync(path.join(testRoot, 'release-only.test.js'), 'test("not shipped", () => {});\n');

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
    expect(names).toContain('ltth_1.3.24/app/plugins/talking-heads/assets/asset-packs/rgs/License.txt');
    expect(names).toContain(
      'ltth_1.3.24/app/plugins/talking-heads/assets/asset-packs/rgs/Animated body parts/Heads/head1/idle_0.png'
    );
    expect(names).toContain(
      'ltth_1.3.24/app/plugins/talking-heads/assets/asset-packs/rgs/Animated body parts/Eyes/eyes1/idle_3.png'
    );
    expect(names).not.toContain(
      'ltth_1.3.24/app/plugins/talking-heads/assets/asset-packs/rgs/Animated body parts/Heads/head1/idle_1.png'
    );
    expect(names).not.toContain(
      'ltth_1.3.24/app/plugins/talking-heads/assets/asset-packs/rgs/Animated body parts/Eyes/eyes1/idle_7.png'
    );
    expect(names).toContain(
      'ltth_1.3.24/app/plugins/talking-heads/assets/asset-packs/boba/animals/Fox/Layers/Fox_Base.png'
    );
    expect(names).not.toContain(
      'ltth_1.3.24/app/plugins/talking-heads/assets/asset-packs/boba/animals/Fox/Ready-To-Use/Fox.png'
    );
    expect(names).not.toContain('ltth_1.3.24/app/app/node_modules/example/index.js');
    expect(names).not.toContain('ltth_1.3.24/app/test/release-only.test.js');
  });

  it('rejects a bundle above the configured committed-zip ceiling', () => {
    const python = findPythonCommand();
    tempRoot = createTempRepo();

    const scriptPath = path.join(tempRoot, 'scripts', 'build_release_bundle.py');
    const zipPath = path.join(tempRoot, 'oversized.zip');
    fs.writeFileSync(zipPath, Buffer.from('too large'));

    const probe = spawnSync(
      python.command,
      [
        ...python.args,
        '-c',
        [
          'import importlib.util, pathlib, sys',
          'spec = importlib.util.spec_from_file_location("bundle", sys.argv[1])',
          'module = importlib.util.module_from_spec(spec)',
          'spec.loader.exec_module(module)',
          'module.MAX_RELEASE_BUNDLE_BYTES = 1',
          'module.validate_bundle_size(pathlib.Path(sys.argv[2]))'
        ].join('; '),
        scriptPath,
        zipPath
      ],
      { encoding: 'utf8' }
    );

    expect(probe.status).not.toBe(0);
    expect(probe.stderr).toContain('the committed ZIP must stay below');
  });

  it('does not archive an old bundle under the already-selected target version', () => {
    const python = findPythonCommand();
    tempRoot = createTempRepo();

    const sourceScript = path.join(__dirname, '..', '..', 'scripts', 'release_from_new_patch.py');
    const scriptPath = path.join(tempRoot, 'scripts', 'release_from_new_patch.py');
    fs.copyFileSync(sourceScript, scriptPath);

    fs.writeFileSync(path.join(tempRoot, 'app', 'CURRENT_VERSION.txt'), '1.3.24\n');
    const patchRoot = path.join(tempRoot, 'new_patch', 'ltth_1.3.24');
    fs.mkdirSync(patchRoot, { recursive: true });
    fs.writeFileSync(path.join(patchRoot, 'ltth_1.3.24.zip'), Buffer.from('new-bundle'));
    fs.writeFileSync(path.join(patchRoot, 'changelog.txt'), 'Stable 1.3.24\n');

    const result = spawnSync(
      python.command,
      [...python.args, scriptPath],
      {
        cwd: tempRoot,
        encoding: 'utf8',
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
      }
    );

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(fs.readFileSync(path.join(tempRoot, 'app', 'ltth_latest.zip'))).toEqual(Buffer.from('new-bundle'));
    expect(fs.existsSync(path.join(tempRoot, 'app', 'archive', 'ltth_1.3.24.zip'))).toBe(false);
    expect(fs.existsSync(path.join(tempRoot, 'released_patches', 'ltth_1.3.24', 'ltth_1.3.24.zip'))).toBe(true);
  });
});
