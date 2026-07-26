const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const yauzl = require('yauzl');

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
  fs.writeFileSync(
    path.join(root, 'app', 'package-lock.json'),
    JSON.stringify({
      name: 'tiktok-stream-tool',
      version: '1.3.24',
      lockfileVersion: 3,
      packages: {
        '': {
          name: 'tiktok-stream-tool',
          version: '1.3.24'
        }
      }
    }, null, 2)
  );
  fs.writeFileSync(path.join(root, 'app', 'ltth_latest.zip'), Buffer.from('old-latest'));
  fs.mkdirSync(path.join(root, 'app', 'plugins', 'streamalchemy'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'app', 'plugins', 'streamalchemy', 'plugin.json'),
    JSON.stringify({
      id: 'streamalchemy',
      name: 'Stream Monsters',
      version: '1.5.0'
    }, null, 2)
  );
  fs.mkdirSync(path.join(root, 'app', 'output', 'playwright'), { recursive: true });
  fs.writeFileSync(path.join(root, 'app', 'output', 'playwright', 'private.png'), 'runtime-output');
  fs.mkdirSync(path.join(root, 'app', '.playwright-cli'), { recursive: true });
  fs.writeFileSync(path.join(root, 'app', '.playwright-cli', 'session.json'), 'runtime-session');

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

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function readZipEntries(filePath) {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true }, (error, archive) => {
      if (error) return reject(error);
      const entries = [];
      archive.on('entry', entry => {
        entries.push({
          name: entry.fileName,
          mtime: entry.getLastModDate().toISOString()
        });
        archive.readEntry();
      });
      archive.on('end', () => resolve(entries));
      archive.on('error', reject);
      archive.readEntry();
    });
  });
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

  it('rejects a requested version that disagrees with version.json', () => {
    const python = findPythonCommand();
    tempRoot = createTempRepo();

    const result = spawnSync(
      python.command,
      [
        ...python.args,
        path.join(tempRoot, 'scripts', 'build_release_bundle.py'),
        '--version',
        '1.3.25'
      ],
      {
        cwd: tempRoot,
        encoding: 'utf8'
      }
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'Requested release version 1.3.25 does not match version.json version 1.3.24'
    );
    expect(fs.existsSync(path.join(tempRoot, 'new_patch', 'ltth_1.3.25'))).toBe(false);
  });

  it('rejects every stale package metadata version', () => {
    const python = findPythonCommand();
    tempRoot = createTempRepo();
    const cases = [
      {
        relativePath: 'package.json',
        mutate: data => { data.version = '1.3.23'; },
        error: 'package.json version must be 1.3.24'
      },
      {
        relativePath: 'app/package.json',
        mutate: data => { data.version = '1.3.23'; },
        error: 'app/package.json version must be 1.3.24'
      },
      {
        relativePath: 'app/package-lock.json',
        mutate: data => { data.version = '1.3.23'; },
        error: 'app/package-lock.json version must be 1.3.24'
      },
      {
        relativePath: 'app/package-lock.json',
        mutate: data => { data.packages[''].version = '1.3.23'; },
        error: 'app/package-lock.json packages[""].version must be 1.3.24'
      }
    ];

    for (const testCase of cases) {
      const filePath = path.join(tempRoot, testCase.relativePath);
      const original = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(original);
      testCase.mutate(data);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

      const result = spawnSync(
        python.command,
        [
          ...python.args,
          path.join(tempRoot, 'scripts', 'build_release_bundle.py'),
          '--version',
          '1.3.24'
        ],
        {
          cwd: tempRoot,
          encoding: 'utf8'
        }
      );

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(testCase.error);
      fs.writeFileSync(filePath, original);
    }
  });

  it('enforces the Stream Monsters 1.5 store contract for LTTH 1.4.1', () => {
    const python = findPythonCommand();
    tempRoot = createTempRepo();

    const versionData = JSON.parse(fs.readFileSync(path.join(tempRoot, 'version.json'), 'utf8'));
    versionData.version = '1.4.1';
    versionData.downloadVersion = '1.4.1';
    fs.writeFileSync(path.join(tempRoot, 'version.json'), JSON.stringify(versionData, null, 2));

    for (const relativePath of ['package.json', 'app/package.json']) {
      const filePath = path.join(tempRoot, relativePath);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      data.version = '1.4.1';
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    }

    const lockPath = path.join(tempRoot, 'app', 'package-lock.json');
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    lock.version = '1.4.1';
    lock.packages[''].version = '1.4.1';
    fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2));

    const packageDir = path.join(tempRoot, 'plugin-store', 'packages');
    fs.mkdirSync(packageDir, { recursive: true });
    const packagePath = path.join(packageDir, 'streamalchemy-1.5.0.zip');
    fs.writeFileSync(packagePath, Buffer.from('stream-monsters-1.5-package'));

    fs.writeFileSync(
      path.join(tempRoot, 'plugin-store.json'),
      JSON.stringify({
        plugins: [{
          id: 'streamalchemy',
          name: {
            en: 'Stream Monsters',
            de: 'Stream Monsters',
            es: 'Stream Monsters',
            fr: 'Stream Monsters'
          },
          version: '1.4.9',
          minLtthVersion: '1.4.1',
          channel: 'open-beta',
          packageUrl: 'https://ltth.app/plugin-store/packages/streamalchemy-1.5.0.zip',
          sha256: sha256(packagePath)
        }]
      }, null, 2)
    );

    const scriptPath = path.join(tempRoot, 'scripts', 'build_release_bundle.py');
    const runBuilder = () => spawnSync(
      python.command,
      [...python.args, scriptPath, '--version', '1.4.1'],
      {
        cwd: tempRoot,
        encoding: 'utf8'
      }
    );

    const rejected = runBuilder();
    expect(rejected.status).not.toBe(0);
    expect(rejected.stderr).toContain(
      'plugin-store.json streamalchemy.version must be 1.5.0 for LTTH 1.4.1'
    );

    const store = JSON.parse(fs.readFileSync(path.join(tempRoot, 'plugin-store.json'), 'utf8'));
    store.plugins[0].version = '1.5.0';
    store.plugins[0].minLtthVersion = '1.4.0';
    fs.writeFileSync(path.join(tempRoot, 'plugin-store.json'), JSON.stringify(store, null, 2));

    const compatibilityRejected = runBuilder();
    expect(compatibilityRejected.status).not.toBe(0);
    expect(compatibilityRejected.stderr).toContain(
      'plugin-store.json streamalchemy.minLtthVersion must be 1.4.1'
    );

    store.plugins[0].minLtthVersion = '1.4.1';
    fs.writeFileSync(path.join(tempRoot, 'plugin-store.json'), JSON.stringify(store, null, 2));

    const accepted = runBuilder();
    expect(accepted.status).toBe(0);
    expect(accepted.stderr).toBe('');

    fs.appendFileSync(packagePath, Buffer.from('tampered'));
    const hashRejected = runBuilder();
    expect(hashRejected.status).not.toBe(0);
    expect(hashRejected.stderr).toContain(
      'Stream Monsters store package SHA-256 does not match plugin-store.json'
    );
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

  it('builds deterministic oversized release assets with commit and checksum metadata', async () => {
    const python = findPythonCommand();
    tempRoot = createTempRepo();
    const scriptPath = path.join(tempRoot, 'scripts', 'build_release_bundle.py');
    const firstDir = path.join(tempRoot, 'release-assets-first');
    const secondDir = path.join(tempRoot, 'release-assets-second');
    const commitSha = '0123456789abcdef0123456789abcdef01234567';

    const runBuilder = outputDir => spawnSync(
      python.command,
      [
        ...python.args,
        scriptPath,
        '--version',
        '1.3.24',
        '--release-assets-dir',
        outputDir,
        '--commit-sha',
        commitSha
      ],
      {
        cwd: tempRoot,
        encoding: 'utf8'
      }
    );

    const first = runBuilder(firstDir);
    expect(first.status).toBe(0);
    expect(first.stderr).toBe('');

    const sizeLimitProbe = spawnSync(
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
          'module.build_release_assets(pathlib.Path(sys.argv[2]), "1.3.24", pathlib.Path(sys.argv[3]), sys.argv[4])'
        ].join('; '),
        scriptPath,
        tempRoot,
        path.join(tempRoot, 'release-assets-size-probe'),
        commitSha
      ],
      {
        cwd: tempRoot,
        encoding: 'utf8'
      }
    );
    expect(sizeLimitProbe.status).toBe(0);
    expect(sizeLimitProbe.stderr).toBe('');

    const sourceFile = path.join(tempRoot, 'app', 'plugins', 'streamalchemy', 'plugin.json');
    const changedMtime = new Date('2035-06-07T08:09:10.000Z');
    fs.utimesSync(sourceFile, changedMtime, changedMtime);

    const second = runBuilder(secondDir);
    expect(second.status).toBe(0);
    expect(second.stderr).toBe('');

    const firstZip = path.join(firstDir, 'ltth_latest.zip');
    const secondZip = path.join(secondDir, 'ltth_latest.zip');
    const firstManifestPath = path.join(firstDir, 'ltth_latest.json');
    const secondManifestPath = path.join(secondDir, 'ltth_latest.json');
    const firstManifest = JSON.parse(fs.readFileSync(firstManifestPath, 'utf8'));

    expect(fs.readFileSync(secondZip)).toEqual(fs.readFileSync(firstZip));
    expect(fs.readFileSync(secondManifestPath)).toEqual(fs.readFileSync(firstManifestPath));
    expect(firstManifest).toEqual({
      schema: 1,
      component: 'ltth_latest.zip',
      version: '1.3.24',
      tag: 'v1.3.24',
      commitSha,
      sha256: sha256(firstZip),
      bytes: fs.statSync(firstZip).size
    });

    const entries = await readZipEntries(firstZip);
    expect(entries.map(entry => entry.name)).toContain(
      'ltth_1.3.24/app/plugins/streamalchemy/plugin.json'
    );
    expect(entries.map(entry => entry.name).join('\n')).not.toMatch(
      /\/app\/(?:output|\.playwright-cli)\//
    );
    expect(new Set(entries.map(entry => entry.mtime))).toHaveProperty('size', 1);
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
