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

function writeZip(filename, entries) {
  const python = findPythonCommand();
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const result = spawnSync(python.command, [...python.args, '-c',
    'import json,sys,zipfile; z=zipfile.ZipFile(sys.argv[1],"w"); [z.writestr(k,v) for k,v in json.loads(sys.argv[2]).items()]; z.close()',
    filename, JSON.stringify(entries)], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || 'ZIP fixture failed');
}

function createTempRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-release-bundle-'));
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'app'), { recursive: true });
  fs.mkdirSync(path.join(root, 'app', 'config'), { recursive: true });
  fs.copyFileSync(
    path.join(__dirname, '..', 'config', 'plugin-release-policy.json'),
    path.join(root, 'app', 'config', 'plugin-release-policy.json')
  );
  const releasePolicy = JSON.parse(fs.readFileSync(path.join(root, 'app', 'config', 'plugin-release-policy.json'), 'utf8'));
  for (const assetPath of Object.keys(releasePolicy.publicAssetPathOwners || {})) {
    const publicFile = path.join(root, 'app', 'public', assetPath.replace(/^\//, ''));
    fs.mkdirSync(path.dirname(publicFile), { recursive: true });
    fs.writeFileSync(publicFile, 'closed-beta static asset');
  }
  for (const id of releasePolicy.closedBeta) {
    const dir = path.join(root, 'app', 'plugins', id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({ id }));
    fs.writeFileSync(path.join(dir, 'main.js'), 'module.exports = {};');
  }
  fs.mkdirSync(path.join(root, 'app', 'plugins', 'goals'), { recursive: true });
  fs.writeFileSync(path.join(root, 'app', 'plugins', 'goals', 'plugin.json'), '{"id":"goals"}');
  fs.mkdirSync(path.join(root, 'app', 'plugins', 'gift-catalog'), { recursive: true });
  fs.writeFileSync(path.join(root, 'app', 'plugins', 'gift-catalog', 'plugin.json'), '{"id":"gift-catalog"}');
  fs.writeFileSync(path.join(root, 'app', 'plugins', 'gift-catalog', 'main.js'), 'module.exports = {};');
  fs.mkdirSync(path.join(root, 'app', 'modules'), { recursive: true });
  fs.writeFileSync(path.join(root, 'app', 'modules', 'public-overlay-payload-projection.js'), 'module.exports = { projectSidekickHudPayload() {} };');
  fs.writeFileSync(path.join(root, 'app', 'modules', 'public-overlay-registry.js'), "module.exports = { route: '/overlay/sidekick/hud' };\n");
  const nestedClosedDir = path.join(root, 'app', 'plugins', 'public-wrapper', 'vendor', 'MUSIC-BOT');
  fs.mkdirSync(nestedClosedDir, { recursive: true });
  fs.writeFileSync(path.join(root, 'app', 'plugins', 'public-wrapper', 'plugin.json'), '{"id":"public-wrapper"}');
  fs.writeFileSync(path.join(nestedClosedDir, 'plugin.json'), '{"id":"public-helper"}');
  for (const [directory, manifest] of [
    ['chatango', { id: 'chatango' }],
    ['Ｃｈａｔａｎｇｏ', { id: 'harmless-path-fixture' }],
    ['%63hatango', { id: 'harmless-path-fixture' }],
    ['%2563hatango', { id: 'harmless-path-fixture' }],
    ['renamed-chatango', { id: 'chatango' }],
    ['renamed-beta', { id: 'music-bot' }],
    ['renamed-alias', { id: 'other-id', aliases: ['streamalchemy'] }]
  ]) {
    const dir = path.join(root, 'app', 'plugins', directory);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify(manifest));
    fs.writeFileSync(path.join(dir, 'main.js'), 'module.exports = {};');
  }

  fs.mkdirSync(path.join(root, 'app', 'public', 'js'), { recursive: true });
  fs.writeFileSync(path.join(root, 'app', 'public', 'js', 'chatango-theme-adapter.js'), 'synthetic-retired-adapter');
  fs.writeFileSync(path.join(root, 'app', 'plugins', 'chatango', 'local-state.json'), '{"keep":"developer"}');

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
  fs.writeFileSync(path.join(root, 'app', '.config_path'), Buffer.from('C:\\Users\\fixture\\AppData\\Roaming\\LTTH\\config\r\n', 'utf8'));
  fs.mkdirSync(path.join(root, 'app', 'config', 'examples'), { recursive: true });
  fs.writeFileSync(path.join(root, 'app', 'config', 'examples', '.env.example'), 'synthetic-placeholder-only');
  fs.writeFileSync(path.join(root, 'app', 'config', 'examples', 'README.md'), 'safe example documentation');
  fs.mkdirSync(path.join(root, 'app', 'plugins', 'streamalchemy'), { recursive: true });
  fs.writeFileSync(path.join(root, 'app', 'plugins', 'streamalchemy', '.env.production'), 'synthetic-nested-environment');
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
  for (const directory of ['.codex-isolated', 'test_user_configs', 'coverage']) {
    fs.mkdirSync(path.join(root, 'app', directory), { recursive: true });
    fs.writeFileSync(path.join(root, 'app', directory, 'private-test-artifact.json'), '{}');
  }
  const profilesRoot = path.join(root, 'app', 'user_configs');
  for (const name of ['.env', '.env.local', '.env.production']) {
    fs.writeFileSync(path.join(root, 'app', name), 'synthetic-environment');
  }
  fs.writeFileSync(
    path.join(root, 'app', '.env.example'),
    [
      'PORT=3000',
      'EULER_BACKUP_API_KEY=your_euler_backup_api_key_here',
      'EULER_FALLBACK_API_KEY=your_euler_fallback_api_key_here',
      'SYNTHETIC_TOKEN=replace_me',
      'SYNTHETIC_SECRET=placeholder_secret',
      'SYNTHETIC_PASSWORD=change_this_password'
    ].join('\n') + '\n'
  );
  const userDataRoot = path.join(root, 'app', 'user_data');
  fs.mkdirSync(userDataRoot, { recursive: true });
  fs.writeFileSync(path.join(userDataRoot, 'tiktok_session.json'), 'synthetic-session');
  fs.mkdirSync(profilesRoot, { recursive: true });
  for (const name of ['.active_profile', 'fixture.db', 'fixture.json', 'test-config.json']) {
    fs.writeFileSync(path.join(profilesRoot, name), 'synthetic-private-profile');
  }

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

function readZipEntry(filePath, entryName) {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true }, (error, archive) => {
      if (error) return reject(error);
      archive.on('entry', entry => {
        if (entry.fileName !== entryName) {
          archive.readEntry();
          return;
        }
        archive.openReadStream(entry, (streamError, stream) => {
          if (streamError) return reject(streamError);
          const chunks = [];
          stream.on('data', chunk => chunks.push(chunk));
          stream.on('error', reject);
          stream.on('end', () => {
            archive.close();
            resolve(Buffer.concat(chunks).toString('utf8'));
          });
        });
      });
      archive.on('end', () => reject(new Error(`Missing synthetic ZIP entry: ${entryName}`)));
      archive.on('error', reject);
      archive.readEntry();
    });
  });
}

function hasOnlyPlaceholderCredentials(source) {
  const placeholder = /^(?:|<[^>]+>|\$\{[^}]+\}|\{[^}]+\}|__[^_]+__|(?:your|replace|change|insert|enter|example|placeholder|dummy|sample|todo|changeme|not[_-]?a[_-]?real)[\w.-]*|(?:x{3,}|\*{3,}|\.{3,})|(?:your[_-].+[_-]here))$/i;
  return source.split(/\r?\n/).every(line => {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || !/(?:API_KEY|_TOKEN|_SECRET|_PASSWORD)$/i.test(match[1])) return true;
    const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
    return placeholder.test(value);
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

  it('builds the versioned patch bundle and changelog for release automation', async () => {
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
    const configPathPointer = path.join(tempRoot, 'app', '.config_path');
    const originalConfigPathPointer = fs.readFileSync(configPathPointer);

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
    expect(names).not.toContain('ltth_1.3.24/launcher.exe');
    expect(names).toContain('ltth_1.3.24/app/package.json');
    expect(names).toContain('ltth_1.3.24/app/config/examples/README.md');
    expect(names).not.toContain('ltth_1.3.24/app/config/examples/.env.example');
    expect(names).toContain('ltth_1.3.24/app/config/distribution-mode.json');
    expect(names).toContain('ltth_1.3.24/app/plugins/goals/plugin.json');
    expect(names).toContain('ltth_1.3.24/app/modules/public-overlay-payload-projection.js');
    expect(names).toContain('ltth_1.3.24/app/modules/public-overlay-registry.js');
    expect(names.some(name => name.startsWith('ltth_1.3.24/app/plugins/sidekick/'))).toBe(false);
    expect(names.some(name => name.startsWith('ltth_1.3.24/app/plugins/gift-catalog/'))).toBe(false);
    expect(fs.existsSync(path.join(tempRoot, 'app', 'plugins', 'gift-catalog', 'plugin.json'))).toBe(true);
    for (const directory of ['chatango', 'Ｃｈａｔａｎｇｏ', '%63hatango', '%2563hatango', 'renamed-chatango']) {
      expect(names.some(name => name.startsWith(`ltth_1.3.24/app/plugins/${directory}/`))).toBe(false);
      expect(fs.readFileSync(path.join(tempRoot, 'app', 'plugins', directory, 'main.js'), 'utf8')).toBe('module.exports = {};');
    }
    expect(names).not.toContain('ltth_1.3.24/app/public/js/chatango-theme-adapter.js');
    expect(fs.readFileSync(path.join(tempRoot, 'app', 'public', 'js', 'chatango-theme-adapter.js'), 'utf8')).toBe('synthetic-retired-adapter');
    expect(fs.readFileSync(path.join(tempRoot, 'app', 'plugins', 'chatango', 'local-state.json'), 'utf8')).toBe('{"keep":"developer"}');
    expect(names.some(name => name.includes('/plugins/renamed-beta/') || name.includes('/plugins/renamed-alias/'))).toBe(false);
    expect(names.some(name => name.includes('/plugins/public-wrapper/'))).toBe(false);
    expect(fs.existsSync(path.join(tempRoot, 'app', 'plugins', 'public-wrapper', 'vendor', 'MUSIC-BOT', 'plugin.json'))).toBe(true);
    const releasePolicy = JSON.parse(fs.readFileSync(path.join(tempRoot, 'app', 'config', 'plugin-release-policy.json'), 'utf8'));
    for (const id of [...releasePolicy.closedBeta, ...Object.keys(releasePolicy.aliases)]) {
      expect(names.filter(name => name.startsWith(`ltth_1.3.24/app/plugins/${id}/`))).toEqual([]);
      expect(fs.existsSync(path.join(tempRoot, 'app', 'plugins', id, 'plugin.json'))).toBe(true);
    }
    for (const assetPath of Object.keys(releasePolicy.publicAssetPathOwners)) {
      expect(names).not.toContain(`ltth_1.3.24/app/public${assetPath}`);
      expect(fs.existsSync(path.join(tempRoot, 'app', 'public', assetPath.replace(/^\//, '')))).toBe(true);
    }
    expect(names.filter(name => name.startsWith('ltth_1.3.24/app/user_configs/'))).toEqual([]);
    expect(names.filter(name => name.startsWith('ltth_1.3.24/app/user_data/'))).toEqual([]);
    for (const directory of ['.codex-isolated', 'test_user_configs', 'coverage']) {
      expect(names.filter(name => name.startsWith(`ltth_1.3.24/app/${directory}/`))).toEqual([]);
    }
    expect(names).toContain('ltth_1.3.24/app/.env.example');
    const envExample = await readZipEntry(zipPath, 'ltth_1.3.24/app/.env.example');
    expect(hasOnlyPlaceholderCredentials(envExample)).toBe(true);
    expect(envExample).toContain('PORT=3000');
    expect(names).not.toContain('ltth_1.3.24/app/.config_path');
    expect(fs.readFileSync(configPathPointer).equals(originalConfigPathPointer)).toBe(true);
    expect(names).not.toContain('ltth_1.3.24/app/plugins/streamalchemy/.env.production');
    for (const name of ['.env', '.env.local', '.env.production']) {
      expect(names).not.toContain(`ltth_1.3.24/app/${name}`);
    }
    expect(names).not.toContain('ltth_1.3.24/app/plugins/talking-heads/assets/asset-packs/rgs/License.txt');
    expect(names).not.toContain(
      'ltth_1.3.24/app/plugins/talking-heads/assets/asset-packs/rgs/Animated body parts/Heads/head1/idle_0.png'
    );
    expect(names).not.toContain(
      'ltth_1.3.24/app/plugins/talking-heads/assets/asset-packs/rgs/Animated body parts/Eyes/eyes1/idle_3.png'
    );
    expect(names).not.toContain(
      'ltth_1.3.24/app/plugins/talking-heads/assets/asset-packs/rgs/Animated body parts/Heads/head1/idle_1.png'
    );
    expect(names).not.toContain(
      'ltth_1.3.24/app/plugins/talking-heads/assets/asset-packs/rgs/Animated body parts/Eyes/eyes1/idle_7.png'
    );
    expect(names).not.toContain(
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

  it('enforces the Stream Monsters 1.11.1 Stable store contract for LTTH 1.4.1', () => {
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

    const manifestPath = path.join(
      tempRoot,
      'app',
      'plugins',
      'streamalchemy',
      'plugin.json'
    );
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.version = '1.11.1';
    manifest.devStatus = 'stable';
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const packageDir = path.join(tempRoot, 'plugin-store', 'packages');
    fs.mkdirSync(packageDir, { recursive: true });
    const packagePath = path.join(packageDir, 'streamalchemy-1.11.1.zip');
    fs.writeFileSync(packagePath, Buffer.from('stream-monsters-1.11.1-package'));

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
          version: '1.11.0',
          minLtthVersion: '1.4.1',
          channel: 'stable',
          packageUrl: 'https://ltth.app/plugin-store/packages/streamalchemy-1.11.1.zip',
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
      'plugin-store.json streamalchemy.version must be 1.11.1 for LTTH 1.4.1'
    );

    const store = JSON.parse(fs.readFileSync(path.join(tempRoot, 'plugin-store.json'), 'utf8'));
    store.plugins[0].version = '1.11.1';
    store.plugins[0].minLtthVersion = '1.4.0';
    fs.writeFileSync(path.join(tempRoot, 'plugin-store.json'), JSON.stringify(store, null, 2));

    const compatibilityRejected = runBuilder();
    expect(compatibilityRejected.status).not.toBe(0);
    expect(compatibilityRejected.stderr).toContain(
      'plugin-store.json streamalchemy.minLtthVersion must be 1.4.1'
    );

    store.plugins[0].minLtthVersion = '1.4.1';
    store.plugins[0].channel = 'open-beta';
    fs.writeFileSync(path.join(tempRoot, 'plugin-store.json'), JSON.stringify(store, null, 2));

    const channelRejected = runBuilder();
    expect(channelRejected.status).not.toBe(0);
    expect(channelRejected.stderr).toContain(
      'plugin-store.json streamalchemy.channel must be stable'
    );

    store.plugins[0].channel = 'stable';
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
    expect(entries.map(entry => entry.name)).not.toContain('ltth_1.3.24/launcher.exe');
    expect(entries.map(entry => entry.name)).toContain('ltth_1.3.24/app/package.json');
    expect(entries.map(entry => entry.name)).not.toContain(
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
    const patchZip = path.join(patchRoot, 'ltth_1.3.24.zip');
    writeZip(patchZip, { 'ltth_1.3.24/app/plugins/goals/plugin.json': '{"id":"goals"}' });
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
    expect(fs.readFileSync(path.join(tempRoot, 'app', 'ltth_latest.zip'))).toEqual(
      fs.readFileSync(path.join(tempRoot, 'released_patches', 'ltth_1.3.24', 'ltth_1.3.24.zip'))
    );
    expect(fs.existsSync(path.join(tempRoot, 'app', 'archive', 'ltth_1.3.24.zip'))).toBe(false);
    expect(fs.existsSync(path.join(tempRoot, 'released_patches', 'ltth_1.3.24', 'ltth_1.3.24.zip'))).toBe(true);
  });

  it.each([
    ['case-folded directory', { 'ltth_1.3.25/app/plugins/Chatango/main.js': 'retired source' }],
    ['NFKC directory', { 'ltth_1.3.25/app/plugins/Ｃｈａｔａｎｇｏ/main.js': 'retired source' }],
    ['percent-encoded directory', { 'ltth_1.3.25/app/plugins/%63hatango/main.js': 'retired source' }],
    ['double-percent-encoded directory', { 'ltth_1.3.25/app/plugins/%2563hatango/main.js': 'retired source' }],
    ['renamed directory manifest ID', { 'ltth_1.3.25/app/plugins/renamed/plugin.json': '{"id":"chatango"}' }],
    ['manifest alias', { 'ltth_1.3.25/app/plugins/renamed/plugin.json': '{"id":"community-chat","aliases":["Chatango"]}' }],
    ['manifest replacement', { 'ltth_1.3.25/app/plugins/renamed/plugin.json': '{"id":"community-chat","replaces":["chatango"]}' }],
    ['invalid ZIP', null]
  ])('refuses a patch ZIP with %s before staging', (_caseName, entries) => {
    const python = findPythonCommand();
    tempRoot = createTempRepo();
    const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'release_from_new_patch.py');
    fs.copyFileSync(scriptPath, path.join(tempRoot, 'scripts', 'release_from_new_patch.py'));
    fs.writeFileSync(path.join(tempRoot, 'app', 'CURRENT_VERSION.txt'), '1.3.24\n');
    const currentZip = Buffer.from('existing-public-bundle');
    fs.writeFileSync(path.join(tempRoot, 'app', 'ltth_latest.zip'), currentZip);
    const patchRoot = path.join(tempRoot, 'new_patch', 'ltth_1.3.25');
    fs.mkdirSync(patchRoot, { recursive: true });
    const patchZip = path.join(patchRoot, 'ltth_1.3.25.zip');
    if (entries) writeZip(patchZip, entries);
    else fs.writeFileSync(patchZip, 'not a ZIP');
    fs.writeFileSync(path.join(patchRoot, 'changelog.txt'), 'Synthetic test fixture\n');

    const result = spawnSync(python.command, [...python.args, path.join(tempRoot, 'scripts', 'release_from_new_patch.py')], {
      cwd: tempRoot,
      encoding: 'utf8',
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/could not be safely validated|retired app plugin/);
    expect(fs.readFileSync(path.join(tempRoot, 'app', 'ltth_latest.zip'))).toEqual(currentZip);
    expect(fs.existsSync(path.join(tempRoot, 'app', 'archive', 'ltth_1.3.24.zip'))).toBe(false);
    expect(fs.existsSync(patchRoot)).toBe(true);
    expect(fs.existsSync(path.join(tempRoot, 'released_patches', 'ltth_1.3.25'))).toBe(false);
  });
});
