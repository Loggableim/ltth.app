const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const yaml = require('yaml');

describe('Pages workflow checkout credentials', () => {
  it('disables persisted checkout credentials in every non-deploy job checkout', () => {
    const workflowPath = path.join(__dirname, '..', '..', '.github', 'workflows', 'pages.yml');
    const workflow = yaml.parse(fs.readFileSync(workflowPath, 'utf8'));

    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      if (jobName === 'deploy') continue;
      for (const step of job.steps || []) {
        if (step.uses && step.uses.startsWith('actions/checkout@')) {
          expect(step.with && step.with['persist-credentials']).toBe(false);
        }
      }
    }
  });
});

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

function runPythonCode(code, args = []) {
  const python = findPythonCommand();
  return spawnSync(python.command, [...python.args, '-c', code, ...args], { encoding: 'utf8' });
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
  for (const name of [
    'verify_pages_release_payload.py',
    'fetch_release_assets_fallback.py',
    'resolve_pages_release_run.py',
    'public-plugin-allowlist.json'
  ]) {
    fs.copyFileSync(
      path.join(__dirname, '..', '..', 'scripts', name),
      path.join(root, 'scripts', name)
    );
  }
  fs.writeFileSync(path.join(root, 'plugin-store.json'), JSON.stringify({ plugins: [] }));

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

function sha256File(filename) {
  return crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
}

function writeVersionMetadata(root, version) {
  fs.writeFileSync(path.join(root, 'version.json'), JSON.stringify({
    version,
    downloadVersion: version,
    downloadUrl: `https://github.com/Loggableim/ltth.app/releases/tag/v${version}`
  }));
  fs.writeFileSync(path.join(root, 'app', 'CURRENT_VERSION.txt'), `${version}\n`);
  fs.writeFileSync(path.join(root, 'app', 'CURRENT_RELEASE.json'), JSON.stringify({ version }));
}

function writePublicAllowlist(root, ids = ['goals']) {
  fs.writeFileSync(path.join(root, 'scripts', 'public-plugin-allowlist.json'), JSON.stringify({
    schemaVersion: 1,
    publicPluginIds: ids
  }));
}

function writeReleaseArtifact(root, version, commitSha, entries) {
  const artifactDir = path.join(root, 'artifact');
  const archivePath = path.join(artifactDir, 'ltth_latest.zip');
  writeZip(archivePath, entries);
  const manifest = {
    schema: 1,
    component: 'ltth_latest.zip',
    version,
    tag: `v${version}`,
    commitSha,
    sha256: sha256File(archivePath),
    bytes: fs.statSync(archivePath).size
  };
  fs.writeFileSync(path.join(artifactDir, 'ltth_latest.json'), JSON.stringify(manifest));
  return { artifactDir, archivePath, manifest };
}

function runPayloadVerifier(root, args) {
  const python = findPythonCommand();
  return spawnSync(python.command, [
    ...python.args,
    path.join(root, 'scripts', 'verify_pages_release_payload.py'),
    ...args
  ], { cwd: root, encoding: 'utf8' });
}

function runPayloadVerifierApi(root, siteDir, manifestPath, expectedReleaseCommitSha) {
  const python = findPythonCommand();
  const verifierDir = path.join(root, 'scripts');
  const code = [
    'import sys',
    'from pathlib import Path',
    'sys.path.insert(0, sys.argv[1])',
    'from verify_pages_release_payload import verify_pages_bundle',
    'try:',
    ' verify_pages_bundle(Path(sys.argv[2]), Path(sys.argv[3]), Path(sys.argv[4]), sys.argv[5])',
    'except Exception as exc:',
    ' print(str(exc), file=sys.stderr)',
    ' raise SystemExit(1)',
    'print("PAGES_BUNDLE_API_VERIFIED")'
  ].join('\n');
  return spawnSync(python.command, [
    ...python.args, '-c', code, verifierDir, siteDir,
    path.join(root, 'version.json'), manifestPath, expectedReleaseCommitSha
  ], { cwd: root, encoding: 'utf8' });
}

function createVerifierRepo() {
  const root = createTempRepo();
  const version = '9.8.7';
  writeVersionMetadata(root, version);
  writePublicAllowlist(root);
  fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
  fs.writeFileSync(path.join(root, 'download.html'), '<!doctype html><title>Download</title>');
  fs.writeFileSync(path.join(root, 'downloads', 'launcher.exe'), 'test launcher marker');
  for (const file of ['install.js', 'install.ps1', 'install.sh', 'uninstall.ps1', 'uninstall.sh']) {
    fs.writeFileSync(path.join(root, file), 'test installer marker');
  }
  return { root, version };
}

function runtimeEntries(version, pluginId = 'goals') {
  return {
    [`ltth_${version}/app/config/distribution-mode.json`]: '{"channel":"public"}',
    [`ltth_${version}/app/plugins/${pluginId}/plugin.json`]: JSON.stringify({ id: pluginId })
  };
}

function writeStorePackage(root, pluginId = 'goals') {
  const filename = `${pluginId}-1.0.0.zip`;
  const packageDir = path.join(root, 'plugin-store', 'packages');
  const packagePath = path.join(packageDir, filename);
  writeZip(packagePath, { 'plugin.json': JSON.stringify({ id: pluginId }) });
  const packageUrl = `https://ltth.app/plugin-store/packages/${filename}`;
  fs.writeFileSync(path.join(root, 'plugin-store.json'), JSON.stringify({
    plugins: [{ id: pluginId, packageUrl, sha256: sha256File(packagePath) }]
  }));
  return { filename, packagePath, packageUrl };
}

function writeStorePackages(root, pluginIds) {
  const packageDir = path.join(root, 'plugin-store', 'packages');
  const plugins = pluginIds.map(pluginId => {
    const filename = `${pluginId}-1.0.0.zip`;
    const packagePath = path.join(packageDir, filename);
    writeZip(packagePath, { 'plugin.json': JSON.stringify({ id: pluginId }) });
    return {
      id: pluginId,
      packageUrl: `https://ltth.app/plugin-store/packages/${filename}`,
      sha256: sha256File(packagePath)
    };
  });
  fs.writeFileSync(path.join(root, 'plugin-store.json'), JSON.stringify({ plugins }));
  return plugins;
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
    const publicAllowlistPath = path.join(outputDir, 'scripts', 'public-plugin-allowlist.json');

    expect(fs.existsSync(versionPath)).toBe(true);
    expect(fs.existsSync(releasePath)).toBe(true);
    expect(fs.existsSync(zipPath)).toBe(true);
    expect(fs.existsSync(authIndexPath)).toBe(true);
    expect(fs.existsSync(authBridgePath)).toBe(true);
    expect(fs.existsSync(publicAllowlistPath)).toBe(true);
    expect(fs.readFileSync(versionPath, 'utf8')).toBe('1.3.24\n');
    expect(JSON.parse(fs.readFileSync(releasePath, 'utf8'))).toMatchObject({
      version: '1.3.24',
      notes: 'Release notes'
    });
    expect(fs.readFileSync(zipPath)).toEqual(fs.readFileSync(path.join(tempRoot, 'app', 'ltth_latest.zip')));
    expect(fs.readFileSync(authIndexPath, 'utf8')).toBe('<!doctype html><title>Auth</title>');
    expect(fs.readFileSync(authBridgePath, 'utf8')).toBe('window.__authBridge = true;');
    expect(JSON.parse(fs.readFileSync(publicAllowlistPath, 'utf8'))).toEqual(
      JSON.parse(fs.readFileSync(path.join(tempRoot, 'scripts', 'public-plugin-allowlist.json'), 'utf8'))
    );
  });

  it.each([
    ['plugin folder', 'plugins/chatango/plugin.json', '{"id":"chatango"}'],
    ['plugin theme adapter folder', 'plugins/goals/themes/chatango/theme.json', '{"id":"chatango"}']
  ])('omits the Pages runtime ZIP and package links when it contains a Chatango %s', (description, relativePath, contents) => {
    const python = findPythonCommand();
    tempRoot = createTempRepo();
    writeZip(path.join(tempRoot, 'app', 'ltth_latest.zip'), {
      'ltth_1.3.24/app/config/distribution-mode.json': '{"channel":"public"}',
      [`ltth_1.3.24/app/${relativePath}`]: contents
    });

    const output = path.join(tempRoot, 'out');
    const build = spawnSync(python.command, [
      ...python.args,
      path.join(tempRoot, 'scripts', 'build_pages_bundle.py'), '--output', output
    ], { encoding: 'utf8' });

    expect(build.status).toBe(0);
    expect(fs.existsSync(path.join(output, 'app', 'ltth_latest.zip'))).toBe(false);
    expect(fs.existsSync(path.join(tempRoot, 'app', 'ltth_latest.zip'))).toBe(true);
    const publishedCatalog = JSON.parse(fs.readFileSync(path.join(output, 'plugin-store.json'), 'utf8'));
    expect(publishedCatalog.plugins.some((plugin) => /chatango/i.test(plugin.packageUrl || ''))).toBe(false);
  });

  it('omits a version-matched app ZIP that contains policy-owned beta assets', () => {
    const python = findPythonCommand();
    tempRoot = createTempRepo();
    const policy = JSON.parse(fs.readFileSync(path.join(tempRoot, 'app', 'config', 'plugin-release-policy.json'), 'utf8'));
    const entries = {
      'ltth_1.3.24/app/config/distribution-mode.json': '{"channel":"public"}',
      'ltth_1.3.24/app/plugins/goals/plugin.json': '{"id":"goals"}',
      'ltth_1.3.24/app/plugins/gift-catalog/plugin.json': '{"id":"gift-catalog"}'
    };
    for (const assetPath of Object.keys(policy.publicAssetPathOwners)) {
      entries[`ltth_1.3.24/app/public${assetPath}`] = 'closed-beta asset';
    }
    writeZip(path.join(tempRoot, 'app', 'ltth_latest.zip'), entries);

    const output = path.join(tempRoot, 'out');
    const result = spawnSync(python.command, [
      ...python.args,
      path.join(tempRoot, 'scripts', 'build_pages_bundle.py'), '--output', output
    ], { encoding: 'utf8' });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(fs.existsSync(path.join(output, 'app', 'ltth_latest.zip'))).toBe(false);
    expect(fs.existsSync(path.join(tempRoot, 'app', 'ltth_latest.zip'))).toBe(true);
  });

  it('omits Chatango feature paths case-insensitively and strips a retired Store listing', () => {
    const python = findPythonCommand();
    tempRoot = createTempRepo();
    fs.mkdirSync(path.join(tempRoot, 'features', 'CHATANGO'), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, 'features', 'Plugin-ChAtAnGo.html'), 'retired feature');
    fs.writeFileSync(path.join(tempRoot, 'features', 'CHATANGO', 'index.html'), 'retired alias path');
    fs.writeFileSync(path.join(tempRoot, 'features', 'public-feature.html'), 'public feature');

    const output = path.join(tempRoot, 'out');
    const build = () => spawnSync(python.command, [...python.args,
      path.join(tempRoot, 'scripts', 'build_pages_bundle.py'), '--output', output], { encoding: 'utf8' });
    const cleanBuild = build();
    expect(cleanBuild.status).toBe(0);
    expect(fs.existsSync(path.join(output, 'features', 'Plugin-ChAtAnGo.html'))).toBe(false);
    expect(fs.existsSync(path.join(output, 'features', 'CHATANGO', 'index.html'))).toBe(false);
    expect(fs.readFileSync(path.join(output, 'features', 'public-feature.html'), 'utf8')).toBe('public feature');

    fs.writeFileSync(path.join(tempRoot, 'plugin-store.json'), JSON.stringify({
      plugins: [{ id: 'ChAtAnGo', packageUrl: 'https://ltth.app/plugin-store/packages/chatango-1.0.0.zip' }]
    }));
    const retiredCatalogBuild = build();
    expect(retiredCatalogBuild.status).toBe(0);
    const publishedCatalog = JSON.parse(fs.readFileSync(path.join(output, 'plugin-store.json'), 'utf8'));
    expect(publishedCatalog.plugins).toEqual([]);
    expect(JSON.parse(fs.readFileSync(path.join(tempRoot, 'plugin-store.json'), 'utf8')).plugins)
      .toEqual([{ id: 'ChAtAnGo', packageUrl: 'https://ltth.app/plugin-store/packages/chatango-1.0.0.zip' }]);
  });

  it('omits retired Chatango assets and public docs while preserving unrelated assets and docs', () => {
    const python = findPythonCommand();
    tempRoot = createTempRepo();
    const files = {
      'assets/plugin-logos/ChAtAnGo.svg': 'retired logo',
      'assets/screenshots/CHATANGO.PNG': 'retired screenshot',
      'assets/plugin-logos/community.svg': 'public logo',
      'assets/screenshots/dashboard.png': 'public screenshot',
      'docs/BROWSER_CONSOLE_WARNINGS.md': 'retired browser warnings',
      'docs/de/BROWSER_CONSOLE_WARNINGS.md': 'retired localized warnings',
      'docs/superpowers/plans/2026-07-04-plugin-store-appstore-ui.md': 'retired store plan',
      'docs/de/superpowers/plans/2026-07-04-plugin-store-appstore-ui.md': 'retired localized plan',
      'docs/guides/plugins.md': 'unrelated public docs'
    };
    for (const [relativePath, contents] of Object.entries(files)) {
      const sourcePath = path.join(tempRoot, relativePath);
      fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
      fs.writeFileSync(sourcePath, contents);
    }

    const output = path.join(tempRoot, 'out');
    const build = spawnSync(python.command, [
      ...python.args,
      path.join(tempRoot, 'scripts', 'build_pages_bundle.py'), '--output', output
    ], { encoding: 'utf8' });

    expect(build.status).toBe(0);
    expect(build.stderr).toBe('');
    for (const relativePath of Object.keys(files)) {
      expect(fs.existsSync(path.join(tempRoot, relativePath))).toBe(true);
    }
    for (const relativePath of [
      'assets/plugin-logos/ChAtAnGo.svg',
      'assets/screenshots/CHATANGO.PNG',
      'docs/BROWSER_CONSOLE_WARNINGS.md',
      'docs/de/BROWSER_CONSOLE_WARNINGS.md',
      'docs/superpowers/plans/2026-07-04-plugin-store-appstore-ui.md',
      'docs/de/superpowers/plans/2026-07-04-plugin-store-appstore-ui.md'
    ]) {
      expect(fs.existsSync(path.join(output, relativePath))).toBe(false);
    }
    for (const relativePath of [
      'assets/plugin-logos/community.svg',
      'assets/screenshots/dashboard.png',
      'docs/guides/plugins.md'
    ]) {
      expect(fs.readFileSync(path.join(output, relativePath), 'utf8')).toBe(files[relativePath]);
    }
  });

  it('omits screenshot mocks, capture archives, and closed-beta plugin docs while preserving public screenshots', () => {
    const python = findPythonCommand();
    tempRoot = createTempRepo();
    const policy = JSON.parse(fs.readFileSync(
      path.join(tempRoot, 'app', 'config', 'plugin-release-policy.json'), 'utf8'
    ));
    const retiredIds = new Set([
      ...policy.closedBeta,
      ...(policy.publicRuntimeExcluded || []),
      ...Object.keys(policy.aliases || {})
    ]);
    const screenshots = {
      'screenshots/archive/docs-capture-manifest.json': '{"stale":true}',
      'screenshots/mocks/animazingpal.html': '<title>Mock</title>',
      'screenshots/features/animazingpal-teaser.png': 'beta feature teaser',
      'screenshots/de/docs/plugins/goals/guide.png': 'public plugin docs'
    };
    for (const id of retiredIds) {
      screenshots[`screenshots/en/docs/plugins/${id}/guide.png`] = `closed beta docs: ${id}`;
    }
    for (const [relativePath, contents] of Object.entries(screenshots)) {
      const sourcePath = path.join(tempRoot, relativePath);
      fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
      fs.writeFileSync(sourcePath, contents);
    }

    const output = path.join(tempRoot, 'out');
    const build = spawnSync(python.command, [
      ...python.args,
      path.join(tempRoot, 'scripts', 'build_pages_bundle.py'), '--output', output
    ], { encoding: 'utf8' });

    expect(build.status).toBe(0);
    expect(build.stderr).toBe('');
    for (const relativePath of [
      'screenshots/archive/docs-capture-manifest.json',
      'screenshots/mocks/animazingpal.html',
      ...[...retiredIds].map((id) => `screenshots/en/docs/plugins/${id}/guide.png`)
    ]) {
      expect(fs.existsSync(path.join(output, relativePath))).toBe(false);
      expect(fs.existsSync(path.join(tempRoot, relativePath))).toBe(true);
    }
    for (const relativePath of [
      'screenshots/features/animazingpal-teaser.png',
      'screenshots/de/docs/plugins/goals/guide.png'
    ]) {
      expect(fs.readFileSync(path.join(output, relativePath), 'utf8')).toBe(screenshots[relativePath]);
    }
  });

  it('shows localized Closed Beta status for AnimazingPal and Talking Heads', () => {
    const repoRoot = path.join(__dirname, '..', '..');
    const faqHtml = fs.readFileSync(path.join(repoRoot, 'faq.html'), 'utf8');
    const overlaysHtml = fs.readFileSync(path.join(repoRoot, 'features', 'overlays.html'), 'utf8');
    expect(faqHtml).toContain('Geschlossene Beta · Demnächst verfügbar.');
    expect(faqHtml).not.toMatch(/GPT-4o-mini|GPT-5 Nano|OpenAI API-Key/i);
    expect(overlaysHtml).toContain('data-i18n="website.features.overlays.text.055"');
    expect(overlaysHtml).toContain('Geschlossene Beta · Noch nicht öffentlich verfügbar.');
    expect(overlaysHtml).not.toMatch(/<meta[^>]+(?:name="description"|property="og:description")[^>]*Talking Heads/i);

    for (const locale of ['de', 'en', 'es', 'fr']) {
      const translations = JSON.parse(fs.readFileSync(
        path.join(repoRoot, 'locales', `${locale}.json`), 'utf8'
      ));
      const overlayText = translations.website.features.overlays.text;
      expect(translations['faq.p.87']).toMatch(/beta|bêta/i);
      expect(translations['faq.h3.88']).not.toMatch(/openai/i);
      expect(translations['faq.p.90']).toMatch(/release|freigabe|lance|lanz|sortie/i);
      expect(overlayText['018']).toMatch(/beta|bêta/i);
      expect(overlayText['055']).toMatch(/beta|bêta/i);
    }
  });

  it.each(['path', 'manifest'])('omits Pages runtime ZIPs for every closed-beta ID and alias found in the %s', (identityLocation) => {
    const { root, version } = createVerifierRepo();
    tempRoot = root;
    const releaseSha = 'a'.repeat(40);
    const policy = JSON.parse(fs.readFileSync(path.join(root, 'app', 'config', 'plugin-release-policy.json'), 'utf8'));
    const retiredIds = [...policy.closedBeta, ...Object.keys(policy.aliases)];
    const storedPackage = writeStorePackage(root, 'goals');
    const output = path.join(root, 'out');

    for (const retiredId of retiredIds) {
      const localPluginDir = path.join(root, 'app', 'plugins', retiredId);
      fs.mkdirSync(localPluginDir, { recursive: true });
      const localManifest = path.join(localPluginDir, 'plugin.json');
      fs.writeFileSync(localManifest, JSON.stringify({ id: retiredId }));

      const entries = {
        [`ltth_${version}/app/config/distribution-mode.json`]: '{"channel":"public"}',
        [identityLocation === 'path'
          ? `ltth_${version}/app/plugins/${retiredId}/plugin.json`
          : `ltth_${version}/app/plugins/reintroduced/plugin.json`]: JSON.stringify({
          id: identityLocation === 'path' ? 'goals' : retiredId
        })
      };
      const artifact = writeReleaseArtifact(root, version, releaseSha, entries);
      fs.copyFileSync(artifact.archivePath, path.join(root, 'app', 'ltth_latest.zip'));

      const build = runPythonCode('import runpy,sys; script,output=sys.argv[1:3]; sys.argv=[script,"--output",output]; runpy.run_path(script,run_name="__main__")', [
        path.join(root, 'scripts', 'build_pages_bundle.py'), output
      ]);
      if (build.status !== 0) throw new Error(build.stderr || build.stdout || 'Pages builder failed');
      expect(fs.existsSync(path.join(output, 'app', 'ltth_latest.zip'))).toBe(false);
      expect(fs.existsSync(localManifest)).toBe(true);

      // Simulate an incorrectly restaged ZIP: the final verifier must reject it even
      // though the Pages builder already omitted the same policy-violating payload.
      fs.copyFileSync(artifact.archivePath, path.join(output, 'app', 'ltth_latest.zip'));
      const verify = runPayloadVerifier(root, [
        'verify-pages-site', '--site-dir', output,
        '--version-file', path.join(root, 'version.json'),
        '--manifest', path.join(artifact.artifactDir, 'ltth_latest.json'),
        '--expected-release-commit-sha', releaseSha
      ]);
      expect(verify.status).not.toBe(0);
      expect(verify.stderr).toContain('runtime ZIP fails the public distribution policy');
    }

    expect(fs.existsSync(storedPackage.packagePath)).toBe(true);
  });

  it('rejects NFKC and bounded URL-decoded Chatango spellings in synthetic Pages ZIP members', () => {
    const python = findPythonCommand();
    const script = path.join(__dirname, '..', '..', 'scripts', 'build_pages_bundle.py');
    const probe = String.raw`
import pathlib, sys, tempfile, zipfile
sys.path.insert(0, str(pathlib.Path(sys.argv[1]).parent))
from build_pages_bundle import is_public_app_archive, is_public_package
spellings = ['Chatango', 'Ｃｈａｔａｎｇｏ', '%63hatango', '%2563hatango']
with tempfile.TemporaryDirectory(prefix='ltth-pages-id-normalization-') as temporary:
    root = pathlib.Path(temporary)
    for index, spelling in enumerate(spellings):
        archive = root / f'case-{index}.zip'
        with zipfile.ZipFile(archive, 'w') as bundle:
            bundle.writestr('ltth_1.4.5/app/config/distribution-mode.json', '{"channel":"public"}')
            bundle.writestr(f'ltth_1.4.5/app/plugins/{spelling}/main.js', 'synthetic')
        if is_public_app_archive(archive, {'chatango'}, set()):
            raise AssertionError(f'accepted withdrawn path spelling: {spelling}')
        package = root / f'{spelling}-1.0.0.zip'
        with zipfile.ZipFile(package, 'w') as bundle:
            bundle.writestr('plugin.json', '{"id":"goals"}')
        if is_public_package(package, {'chatango'}):
            raise AssertionError(f'accepted withdrawn package filename: {spelling}')
    archive = root / 'allowed.zip'
    with zipfile.ZipFile(archive, 'w') as bundle:
        bundle.writestr('ltth_1.4.5/app/config/distribution-mode.json', '{"channel":"public"}')
        bundle.writestr('ltth_1.4.5/app/plugins/goals/main.js', 'synthetic')
    if not is_public_app_archive(archive, {'chatango'}, set()):
        raise AssertionError('rejected harmless plugin fixture')
    package = root / 'goals-1.0.0.zip'
    with zipfile.ZipFile(package, 'w') as bundle:
        bundle.writestr('plugin.json', '{"id":"goals"}')
    if not is_public_package(package, {'chatango'}):
        raise AssertionError('rejected harmless package filename')
`;
    const result = spawnSync(python.command, [...python.args, '-c', probe, script], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'normalized Pages ZIP fixture failed');
    expect(result.stdout).toBe('');
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
    writeZip(path.join(packages, 'closed-directory.zip'), {
      'plugin.json': '{"id":"open-wrapper"}',
      'vendor/MUSIC-BOT/plugin.json': '{"id":"public-helper"}'
    });
    fs.writeFileSync(path.join(tempRoot, 'plugin-store.json'), JSON.stringify({
      plugins: [
        { id: 'goals', packageUrl: 'https://ltth.app/plugin-store/packages/goals-1.0.0.zip' },
        { id: 'music-bot', packageUrl: 'https://ltth.app/plugin-store/packages/music-bot-1.0.0.zip' },
        { id: 'renamed', packageUrl: 'https://ltth.app/plugin-store/packages/renamed-package.zip' },
        { id: 'legacy', packageUrl: 'https://ltth.app/plugin-store/packages/legacy-alias.zip' },
        { id: 'dependency', packageUrl: 'https://ltth.app/plugin-store/packages/closed-dependency.zip' },
        { id: 'directory', packageUrl: 'https://ltth.app/plugin-store/packages/closed-directory.zip' }
      ]
    }));
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
    for (const name of ['music-bot-1.0.0.zip', 'renamed-package.zip', 'legacy-alias.zip', 'closed-dependency.zip', 'closed-directory.zip']) {
      expect(fs.existsSync(path.join(output, 'plugin-store', 'packages', name))).toBe(false);
      expect(fs.existsSync(path.join(packages, name))).toBe(true);
    }
    expect(fs.existsSync(path.join(output, 'app', 'ltth_latest.zip'))).toBe(false);
    expect(fs.existsSync(path.join(tempRoot, 'app', 'ltth_latest.zip'))).toBe(true);
  });

  it('deploys Pages only from the successful release run after provenance and publication guards pass', () => {
    const workflowDir = path.join(__dirname, '..', '..', '.github', 'workflows');
    const pagesWorkflow = fs.readFileSync(path.join(workflowDir, 'pages.yml'), 'utf8');
    const releaseWorkflow = fs.readFileSync(path.join(workflowDir, 'release.yml'), 'utf8');
    const payloadVerifier = fs.readFileSync(
      path.join(__dirname, '..', '..', 'scripts', 'verify_pages_release_payload.py'),
      'utf8'
    );

    expect(pagesWorkflow).toContain('workflow_run:');
    const parsedPagesWorkflow = yaml.parse(pagesWorkflow);
    expect(parsedPagesWorkflow.on.push.branches).toEqual(['main']);
    expect(pagesWorkflow).toContain("github.event.workflow_run.head_repository.full_name == github.repository");
    expect(pagesWorkflow).toContain('scripts/resolve_pages_release_run.py --repository "$GITHUB_REPOSITORY" --tag "$TAG"');
    expect(pagesWorkflow).toContain('id: release_artifact');
    expect(pagesWorkflow).toContain('continue-on-error: true');
    expect(pagesWorkflow).toContain('if: steps.release_artifact.outcome != \'success\'');
    expect(pagesWorkflow).toContain('scripts/fetch_release_assets_fallback.py');
    expect(pagesWorkflow).toContain('--tag "$RELEASE_TAG"');
    expect(pagesWorkflow).toContain('- Create GitHub Release');
    expect(pagesWorkflow).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(pagesWorkflow).not.toMatch(/gh\s+release\s+download/i);
    expect(pagesWorkflow).toContain('name: app-release-assets');
    expect(pagesWorkflow).toContain('run-id: ${{ steps.release_run.outputs.run_id }}');
    expect(pagesWorkflow).toContain('--expected-release-commit-sha "$RELEASE_COMMIT_SHA"');
    expect(pagesWorkflow).toContain('RELEASE_COMMIT_SHA: ${{ steps.release_run.outputs.commit_sha }}');
    expect(pagesWorkflow).toContain('repository: ${{ github.repository }}');

    const buildSteps = parsedPagesWorkflow.jobs.build.steps;
    const deploymentSteps = parsedPagesWorkflow.jobs.deploy.steps;
    const provenanceCheck = buildSteps.findIndex((step) => step.name === 'Verify release provenance and stage exact runtime bytes');
    const pagesBuild = buildSteps.findIndex((step) => step.run === 'python3 scripts/build_pages_bundle.py --output "$RUNNER_TEMP/pages-site"');
    const publicationGuard = buildSteps.findIndex((step) => step.name === 'Require full publication pass for the staged Pages bundle');
    const pagesUpload = buildSteps.findIndex((step) => step.uses === 'actions/upload-pages-artifact@56afc609e74202658d3ffba0e8f6dda462b719fa');
    const pagesDeploy = deploymentSteps.findIndex((step) => step.uses === 'actions/deploy-pages@d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e');
    expect(provenanceCheck).toBeGreaterThanOrEqual(0);
    expect(pagesBuild).toBeGreaterThanOrEqual(0);
    expect(publicationGuard).toBeGreaterThanOrEqual(0);
    expect(pagesUpload).toBeGreaterThanOrEqual(0);
    expect(pagesDeploy).toBeGreaterThanOrEqual(0);
    expect(provenanceCheck).toBeLessThan(pagesBuild);
    expect(pagesBuild).toBeLessThan(publicationGuard);
    expect(publicationGuard).toBeLessThan(pagesUpload);
    expect(parsedPagesWorkflow.jobs.deploy.needs).toContain('build');
    expect(parsedPagesWorkflow.jobs.deploy.permissions).toEqual({
      pages: 'write',
      'id-token': 'write',
    });

    expect(payloadVerifier).toContain('manifest_commit.lower() != expected_commit');
    expect(payloadVerifier).toContain('archive_zip.testzip()');
    expect(payloadVerifier).toContain('_sha256(archive).lower() != declared_hash.lower()');
    expect(payloadVerifier).toContain('archive.stat().st_size != declared_bytes');
    expect(payloadVerifier).toContain('is_public_app_archive(runtime_zip, excluded_ids, public_assets)');
    expect(payloadVerifier).toContain('is_public_package(path, excluded_ids)');
    expect(payloadVerifier).toContain('catalog_ids != public_plugin_ids');

    expect(releaseWorkflow).toContain('name: app-release-assets');
    expect(releaseWorkflow).toContain('--commit-sha "$GITHUB_SHA"');
    expect(releaseWorkflow).toContain('app-release-assets/ltth_latest.zip');
    expect(releaseWorkflow).toContain('app-release-assets/ltth_latest.json');
    expect(releaseWorkflow).toContain('retention-days: 90');
    expect(releaseWorkflow).toContain('if-no-files-found: error');
  });

  it('resolves only the newest successful exact-tag release from the canonical repository', () => {
    const script = path.join(__dirname, '..', '..', 'scripts', 'resolve_pages_release_run.py');
    const runs = [
      { id: 11, run_number: 10, run_attempt: 1, name: 'Create GitHub Release', event: 'push', status: 'completed', conclusion: 'success', head_branch: 'v9.8.7', head_sha: 'a'.repeat(40), head_repository: { full_name: 'Loggableim/ltth.app' } },
      { id: 12, run_number: 12, run_attempt: 1, name: 'Create GitHub Release', event: 'push', status: 'completed', conclusion: 'failure', head_branch: 'v9.8.7', head_sha: 'b'.repeat(40), head_repository: { full_name: 'Loggableim/ltth.app' } },
      { id: 13, run_number: 13, run_attempt: 1, name: 'Create GitHub Release', event: 'push', status: 'completed', conclusion: 'success', head_branch: 'v9.8.7', head_sha: 'c'.repeat(40), head_repository: { full_name: 'fork/ltth.app' } },
      { id: 14, run_number: 14, run_attempt: 1, name: 'Create GitHub Release', event: 'push', status: 'completed', conclusion: 'success', head_branch: 'v9.8.8', head_sha: 'd'.repeat(40), head_repository: { full_name: 'Loggableim/ltth.app' } },
      { id: 15, run_number: 15, run_attempt: 2, name: 'Create GitHub Release', event: 'push', status: 'completed', conclusion: 'success', head_branch: 'v9.8.7', head_sha: 'e'.repeat(40), head_repository: { full_name: 'Loggableim/ltth.app' } }
    ];
    const code = 'import importlib.util,json,sys; s=importlib.util.spec_from_file_location("resolver",sys.argv[1]); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print(json.dumps(m.select_release_run(json.loads(sys.argv[2]),"Loggableim/ltth.app","v9.8.7")))';
    const selected = runPythonCode(code, [script, JSON.stringify(runs)]);
    expect(selected.status).toBe(0);
    expect(JSON.parse(selected.stdout)).toEqual({ run_id: 15, commit_sha: 'e'.repeat(40), tag: 'v9.8.7' });
  });

  it('fetches fallback assets only from the exact stable release tag and verifies its sidecar and ZIP', () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-release-fallback-'));
    const script = path.join(__dirname, '..', '..', 'scripts', 'fetch_release_assets_fallback.py');
    const code = [
      'import hashlib,importlib.util,io,json,pathlib,sys,zipfile',
      'from unittest.mock import patch',
      'spec=importlib.util.spec_from_file_location("fallback",sys.argv[1]); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)',
      'version="9.8.7"; tag="v"+version; commit="a"*40',
      'buf=io.BytesIO(); z=zipfile.ZipFile(buf,"w"); z.writestr("ltth_9.8.7/app/config/distribution-mode.json","{\\"channel\\":\\"public\\"}"); z.close(); archive=buf.getvalue()',
      'sidecar=json.dumps({"schema":1,"component":"ltth_latest.zip","version":version,"tag":tag,"commitSha":commit,"sha256":hashlib.sha256(archive).hexdigest(),"bytes":len(archive)}).encode()',
      'release={"tag_name":tag,"draft":False,"prerelease":False,"assets":[{"name":"ltth_latest.json","url":"https://api.github.com/repos/Loggableim/ltth.app/releases/assets/1","size":len(sidecar),"state":"uploaded"},{"name":"ltth_latest.zip","url":"https://api.github.com/repos/Loggableim/ltth.app/releases/assets/2","size":len(archive),"state":"uploaded"}]}',
      'class Response:',
      ' def __init__(self,data,url): self.data=io.BytesIO(data); self.url=url',
      ' def __enter__(self): return self',
      ' def __exit__(self,*args): return False',
      ' def read(self,size=-1): return self.data.read(size)',
      ' def geturl(self): return self.url',
      'def fake(req,timeout=0):',
      ' url=req.full_url',
      ' if url.endswith("/releases/tags/v9.8.7"): return Response(json.dumps(release).encode(),url)',
      ' if url.endswith("/releases/assets/1"): return Response(sidecar,url)',
      ' if url.endswith("/releases/assets/2"): return Response(archive,url)',
      ' raise AssertionError("unexpected URL: "+url)',
      'with patch.object(m,"urlopen",side_effect=fake):',
      ' out=pathlib.Path(sys.argv[2]); result=m.fetch_exact_release_assets("Loggableim/ltth.app",tag,version,commit,out,"test-token","https://api.github.com")',
      ' assert result["tag"]==tag and result["commitSha"]==commit and result["sha256"]==hashlib.sha256(archive).hexdigest()',
      ' assert (out/"ltth_latest.zip").read_bytes()==archive and (out/"ltth_latest.json").read_bytes()==sidecar',
      ' try: m.fetch_exact_release_assets("Loggableim/ltth.app","v9.8.6",version,commit,out,"test-token","https://api.github.com")',
      ' except m.FallbackError: pass',
      ' else: raise AssertionError("mismatched tag accepted")',
      'print("EXACT_TAG_FALLBACK_OK")'
    ].join('\n');
    const result = runPythonCode(code, [script, path.join(tempRoot, 'assets')]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('EXACT_TAG_FALLBACK_OK');
  });

  it('verifies and stages the exact release ZIP with independent commit, version, size, hash, and ZIP checks', () => {
    const { root, version } = createVerifierRepo();
    tempRoot = root;
    const releaseSha = 'a'.repeat(40);
    const artifact = writeReleaseArtifact(root, version, releaseSha, runtimeEntries(version));
    const destination = path.join(root, 'app', 'ltth_latest.zip');
    const command = () => runPayloadVerifier(root, [
      'verify-artifact', '--artifact-dir', artifact.artifactDir,
      '--version-file', path.join(root, 'version.json'), '--destination', destination,
      '--expected-release-commit-sha', releaseSha
    ]);
    expect(command().status).toBe(0);
    expect(fs.readFileSync(destination)).toEqual(fs.readFileSync(artifact.archivePath));

    const original = JSON.parse(fs.readFileSync(path.join(artifact.artifactDir, 'ltth_latest.json'), 'utf8'));
    const cases = [
      { ...original, commitSha: 'b'.repeat(40) },
      { ...original, version: '9.8.6', tag: 'v9.8.6' },
      { ...original, sha256: '0'.repeat(64) },
      { ...original, bytes: original.bytes + 1 }
    ];
    for (const manifest of cases) {
      fs.writeFileSync(path.join(artifact.artifactDir, 'ltth_latest.json'), JSON.stringify(manifest));
      fs.rmSync(destination, { force: true });
      expect(command().status).not.toBe(0);
      expect(fs.existsSync(destination)).toBe(false);
    }
    fs.writeFileSync(path.join(artifact.artifactDir, 'ltth_latest.json'), JSON.stringify(original));
    fs.writeFileSync(artifact.archivePath, 'not a zip');
    fs.writeFileSync(path.join(artifact.artifactDir, 'ltth_latest.json'), JSON.stringify({
      ...original,
      bytes: Buffer.byteLength('not a zip'),
      sha256: sha256File(artifact.archivePath)
    }));
    expect(command().status).not.toBe(0);
    expect(fs.existsSync(destination)).toBe(false);
  });

  it('passes the full Pages guard with a distinct site SHA and rejects incomplete, extra, beta, and Chatango catalogs', () => {
    const { root, version } = createVerifierRepo();
    tempRoot = root;
    const releaseSha = 'a'.repeat(40);
    const artifact = writeReleaseArtifact(root, version, releaseSha, runtimeEntries(version));
    const staged = path.join(root, 'app', 'ltth_latest.zip');
    const stageResult = runPayloadVerifier(root, [
      'verify-artifact', '--artifact-dir', artifact.artifactDir,
      '--version-file', path.join(root, 'version.json'), '--destination', staged,
      '--expected-release-commit-sha', releaseSha
    ]);
    expect(stageResult.status).toBe(0);
    expect(writeStorePackages(root, ['goals'])).toHaveLength(1);
    const siteSha = 'b'.repeat(40);
    expect(siteSha).not.toBe(releaseSha);
    const output = path.join(root, 'out');
    const python = findPythonCommand();
    const build = spawnSync(python.command, [...python.args,
      path.join(root, 'scripts', 'build_pages_bundle.py'), '--output', output], { encoding: 'utf8' });
    expect(build.status).toBe(0);
    const verify = () => runPayloadVerifier(root, [
      'verify-pages-site', '--site-dir', output, '--version-file', path.join(root, 'version.json'),
      '--manifest', path.join(artifact.artifactDir, 'ltth_latest.json'),
      '--expected-release-commit-sha', releaseSha
    ]);
    expect(verify().status).toBe(0);
    const apiVerify = runPayloadVerifierApi(root, output, path.join(artifact.artifactDir, 'ltth_latest.json'), releaseSha);
    expect(apiVerify.status).toBe(0);
    expect(apiVerify.stdout).toContain('PAGES_BUNDLE_API_VERIFIED');

    writePublicAllowlist(root, ['goals', 'soundboard']);
    expect(verify().status).not.toBe(0);
    const incompleteApiVerify = runPayloadVerifierApi(root, output, path.join(artifact.artifactDir, 'ltth_latest.json'), releaseSha);
    expect(incompleteApiVerify.status).not.toBe(0);
    expect(incompleteApiVerify.stderr).toContain('does not match the canonical public plugin allowlist');
    writePublicAllowlist(root, ['goals']);
    writeStorePackages(root, ['goals', 'soundboard']);
    fs.copyFileSync(path.join(root, 'plugin-store.json'), path.join(output, 'plugin-store.json'));
    for (const name of ['goals-1.0.0.zip', 'soundboard-1.0.0.zip']) {
      fs.copyFileSync(path.join(root, 'plugin-store', 'packages', name), path.join(output, 'plugin-store', 'packages', name));
    }
    expect(verify().status).not.toBe(0);
    writeStorePackages(root, ['goals']);
    fs.copyFileSync(path.join(root, 'plugin-store.json'), path.join(output, 'plugin-store.json'));
    fs.rmSync(path.join(output, 'plugin-store', 'packages', 'soundboard-1.0.0.zip'), { force: true });

    fs.writeFileSync(path.join(root, 'plugin-store.json'), JSON.stringify({ plugins: [] }));
    fs.writeFileSync(path.join(output, 'plugin-store.json'), JSON.stringify({ plugins: [] }));
    fs.rmSync(path.join(output, 'plugin-store', 'packages', 'goals-1.0.0.zip'), { force: true });
    const emptyApiVerify = runPayloadVerifierApi(root, output, path.join(artifact.artifactDir, 'ltth_latest.json'), releaseSha);
    expect(emptyApiVerify.status).not.toBe(0);
    expect(emptyApiVerify.stderr).toContain('does not match the canonical public plugin allowlist');

    for (const badId of ['music-bot', 'chatango']) {
      writePublicAllowlist(root, [badId]);
      writeStorePackages(root, [badId]);
      fs.copyFileSync(path.join(root, 'plugin-store.json'), path.join(output, 'plugin-store.json'));
      fs.rmSync(path.join(output, 'plugin-store', 'packages'), { recursive: true, force: true });
      fs.mkdirSync(path.join(output, 'plugin-store', 'packages'), { recursive: true });
      fs.copyFileSync(path.join(root, 'plugin-store', 'packages', `${badId}-1.0.0.zip`), path.join(output, 'plugin-store', 'packages', `${badId}-1.0.0.zip`));
      expect(verify().status).not.toBe(0);
    }
  });

  it('rejects case-fold duplicate catalog package ZIPs in the source tree', () => {
    const python = findPythonCommand();
    tempRoot = createTempRepo();
    writePublicAllowlist(tempRoot, ['goals']);
    writeStorePackage(tempRoot, 'goals');
    const duplicatePath = path.join(
      tempRoot, 'plugin-store', 'packages', 'nested', 'GOALS-1.0.0.ZIP'
    );
    writeZip(duplicatePath, {
      'plugin.json': JSON.stringify({ id: 'goals' }),
      'payload.txt': 'case-variant extra package'
    });

    const output = path.join(tempRoot, 'out');
    const result = spawnSync(python.command, [
      ...python.args,
      path.join(tempRoot, 'scripts', 'build_pages_bundle.py'), '--output', output
    ], { encoding: 'utf8' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Duplicate case-insensitive public package ZIP filename');
    expect(fs.existsSync(output)).toBe(false);
  });

  it.each([
    ['case-fold duplicate', 'nested/GOALS-1.0.0.ZIP'],
    ['unlisted nested archive', 'nested/unlisted.zip']
  ])('rejects %s from the final Pages Store ZIP set', (_label, relativePath) => {
    const { root, version } = createVerifierRepo();
    tempRoot = root;
    const releaseSha = 'a'.repeat(40);
    const artifact = writeReleaseArtifact(root, version, releaseSha, runtimeEntries(version));
    const stage = runPayloadVerifier(root, [
      'verify-artifact', '--artifact-dir', artifact.artifactDir,
      '--version-file', path.join(root, 'version.json'),
      '--destination', path.join(root, 'app', 'ltth_latest.zip'),
      '--expected-release-commit-sha', releaseSha
    ]);
    expect(stage.status).toBe(0);

    writeStorePackage(root, 'goals');
    const output = path.join(root, 'out');
    const python = findPythonCommand();
    const build = spawnSync(python.command, [
      ...python.args,
      path.join(root, 'scripts', 'build_pages_bundle.py'), '--output', output
    ], { encoding: 'utf8' });
    expect(build.status).toBe(0);
    writeZip(path.join(output, 'plugin-store', 'packages', ...relativePath.split('/')), {
      'plugin.json': JSON.stringify({ id: 'goals' }),
      'payload.txt': 'unlisted nested archive'
    });

    const verify = runPayloadVerifier(root, [
      'verify-pages-site', '--site-dir', output,
      '--version-file', path.join(root, 'version.json'),
      '--manifest', path.join(artifact.artifactDir, 'ltth_latest.json'),
      '--expected-release-commit-sha', releaseSha
    ]);
    expect(verify.status).not.toBe(0);
    expect(verify.stderr).toMatch(/duplicate case-insensitive|directly under the package directory|ZIP set does not match/i);
  });

  it('copies only the 24 catalog package ZIPs and keeps non-catalog source ZIPs local', () => {
    const python = findPythonCommand();
    tempRoot = createTempRepo();
    const repositoryRoot = path.join(__dirname, '..', '..');
    const catalog = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'plugin-store.json'), 'utf8'));
    const allowlist = JSON.parse(fs.readFileSync(
      path.join(repositoryRoot, 'scripts', 'public-plugin-allowlist.json'),
      'utf8'
    ));
    expect(catalog.plugins).toHaveLength(24);
    expect(new Set(catalog.plugins.map(plugin => plugin.id))).toEqual(new Set(allowlist.publicPluginIds));

    const sourcePackages = path.join(tempRoot, 'plugin-store', 'packages');
    const expectedNames = new Set();
    for (const plugin of catalog.plugins) {
      const filename = new URL(plugin.packageUrl).pathname.split('/').pop();
      expectedNames.add(filename.toLowerCase());
      writeZip(path.join(sourcePackages, filename), {
        'plugin.json': JSON.stringify({ id: plugin.id })
      });
    }
    const staleNames = [
      'coinbattle-1.0.0.zip',
      'minecraft-connect-1.0.0.zip',
      'openshock-1.1.0.zip',
      'spotlight-1.1.1.zip',
      'spotlight-1.1.2.zip',
      'spotlight-1.1.3.zip',
      'spotlight-1.1.4.zip',
      'animazingpal-1.4.0.zip',
      'interactive-story-1.0.0.zip',
      'music-bot-1.2.0.zip',
      'osc-bridge-1.0.0.zip',
      'schnorrbecher-1.0.0.zip',
      'sidekick-1.0.0.zip',
      'stream-monsters-1.12.0.zip',
      'talking-heads-1.0.0.zip',
      'visual-fx-frame-webgpu-1.1.0.zip',
      'visual-fx-frame-webgpu-1.2.0.zip',
      'webgpu-emoji-rain-2.0.0.zip',
      'webgpu-emoji-rain-3.0.0.zip',
      'webgpu-weather-control-1.0.0.zip'
    ];
    for (const filename of staleNames) {
      const id = filename.slice(0, filename.lastIndexOf('-'));
      writeZip(path.join(sourcePackages, filename), {
        'plugin.json': JSON.stringify({ id })
      });
    }
    const releasePolicy = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'app', 'config', 'plugin-release-policy.json'), 'utf8'));
    catalog.plugins.push(...[...releasePolicy.closedBeta, 'chatango'].map(id => ({
      id,
      version: '1.0.0',
      packageUrl: `https://ltth.app/plugin-store/packages/${id}-1.0.0.zip`
    })));
    fs.writeFileSync(path.join(tempRoot, 'plugin-store.json'), JSON.stringify(catalog));

    const outputDir = path.join(tempRoot, 'out');
    const result = spawnSync(python.command, [
      ...python.args,
      path.join(tempRoot, 'scripts', 'build_pages_bundle.py'), '--output', outputDir
    ], { encoding: 'utf8' });

    expect(result.status).toBe(0);
    const publishedCatalog = JSON.parse(fs.readFileSync(path.join(outputDir, 'plugin-store.json'), 'utf8'));
    expect(new Set(publishedCatalog.plugins.map(plugin => plugin.id))).toEqual(new Set(allowlist.publicPluginIds));
    expect(publishedCatalog.plugins.some(plugin => [...releasePolicy.closedBeta, 'chatango'].includes(plugin.id))).toBe(false);
    const outputPackages = fs.readdirSync(path.join(outputDir, 'plugin-store', 'packages'))
      .filter(name => name.toLowerCase().endsWith('.zip'));
    expect(outputPackages).toHaveLength(24);
    expect(new Set(outputPackages.map(name => name.toLowerCase()))).toEqual(expectedNames);
    for (const filename of staleNames) {
      expect(outputPackages).not.toContain(filename);
      expect(fs.existsSync(path.join(sourcePackages, filename))).toBe(true);
    }
  });
});
