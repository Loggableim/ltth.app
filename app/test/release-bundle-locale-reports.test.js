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
  throw new Error('Python 3 is required for the synthetic release bundle test.');
}

function sha256File(filename) {
  return crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
}

describe('release bundle internal artifact exclusions', () => {
  let tempRoot;

  afterEach(() => {
    if (!tempRoot) return;
    const tempBase = path.resolve(os.tmpdir());
    const resolved = path.resolve(tempRoot);
    const stat = fs.lstatSync(resolved);
    if (!stat.isDirectory()
      || stat.isSymbolicLink()
      || path.dirname(resolved) !== tempBase
      || !path.basename(resolved).startsWith('ltth-release-locale-reports-')) {
      throw new Error(`Refusing to remove test path outside its unique temp directory: ${tempRoot}`);
    }
    fs.rmSync(resolved, { recursive: true, force: true });
    tempRoot = undefined;
  });

  test('omits generated reports and Jest caches while retaining normal runtime files', () => {
    const python = findPythonCommand();
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-release-locale-reports-'));
    const repoRoot = path.join(tempRoot, 'repo');
    const scriptsDir = path.join(repoRoot, 'scripts');
    const appRoot = path.join(repoRoot, 'app');
    const localeDir = path.join(appRoot, 'locales');
    const scriptPath = path.join(scriptsDir, 'build_release_bundle.py');
    const zipPath = path.join(tempRoot, 'synthetic-runtime.zip');

    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.mkdirSync(path.join(appRoot, 'config'), { recursive: true });
    fs.mkdirSync(localeDir, { recursive: true });
    fs.copyFileSync(path.join(__dirname, '..', '..', 'scripts', 'build_release_bundle.py'), scriptPath);
    fs.writeFileSync(path.join(appRoot, 'config', 'plugin-release-policy.json'), JSON.stringify({
      schemaVersion: 1,
      closedBeta: [],
      publicRuntimeExcluded: [],
      aliases: {},
      publicAssetPathOwners: {}
    }));

    for (const locale of ['de', 'en', 'es', 'fr']) {
      fs.writeFileSync(path.join(localeDir, `${locale}.json`), JSON.stringify({ app: { title: `Synthetic ${locale}` } }));
    }
    fs.writeFileSync(path.join(localeDir, 'plugin-custom.json'), '{"retained":true}\n');
    const reportNames = ['validation-report.json', 'translation-inventory.json', 'literal-inventory.json'];
    const reportHashes = new Map();
    for (const name of reportNames) {
      const reportPath = path.join(localeDir, name);
      fs.writeFileSync(reportPath, `synthetic stale ${name}\n`);
      reportHashes.set(name, sha256File(reportPath));
    }

    const pluginLocales = path.join(appRoot, 'plugins', 'goals', 'locales');
    fs.mkdirSync(pluginLocales, { recursive: true });
    fs.writeFileSync(path.join(appRoot, 'plugins', 'goals', 'plugin.json'), '{"id":"goals"}\n');
    fs.writeFileSync(path.join(pluginLocales, 'en.json'), '{"title":"Goals"}\n');

    const jestCache = path.join(appRoot, '.jest-ceo-dashboard-focused');
    fs.mkdirSync(path.join(jestCache, 'jest-transform-cache-synthetic', 'ab'), { recursive: true });
    fs.writeFileSync(path.join(jestCache, 'jest-transform-cache-synthetic', 'ab', 'transform.js'), 'synthetic jest cache');
    fs.writeFileSync(path.join(jestCache, 'haste-map-synthetic'), 'synthetic haste cache');
    const hiddenRuntimeFile = path.join(appRoot, '.runtime-template');
    fs.writeFileSync(hiddenRuntimeFile, 'retained hidden runtime template');
    const jestCacheHashes = [
      path.join(jestCache, 'jest-transform-cache-synthetic', 'ab', 'transform.js'),
      path.join(jestCache, 'haste-map-synthetic')
    ].map(file => sha256File(file));
    const hiddenRuntimeHash = sha256File(hiddenRuntimeFile);

    const buildProgram = [
      'import importlib.util, pathlib, sys, zipfile, json',
      'script=pathlib.Path(sys.argv[1])',
      'spec=importlib.util.spec_from_file_location("synthetic_release_builder", script)',
      'module=importlib.util.module_from_spec(spec)',
      'spec.loader.exec_module(module)',
      'module.build_bundle_zip(pathlib.Path(sys.argv[2]), "9.9.9", pathlib.Path(sys.argv[3]), enforce_committed_size_limit=False)',
      'with zipfile.ZipFile(sys.argv[3]) as archive: print(json.dumps(archive.namelist()))'
    ].join('\n');
    const result = spawnSync(python.command, [...python.args, '-c', buildProgram, scriptPath, repoRoot, zipPath], {
      encoding: 'utf8'
    });

    expect(result.status).toBe(0);
    const members = JSON.parse(result.stdout.trim());
    const prefix = 'ltth_9.9.9/app/locales/';
    for (const name of reportNames) {
      expect(members).not.toContain(`${prefix}${name}`);
      expect(sha256File(path.join(localeDir, name))).toBe(reportHashes.get(name));
    }
    for (const name of ['de.json', 'en.json', 'es.json', 'fr.json', 'plugin-custom.json']) {
      expect(members).toContain(`${prefix}${name}`);
    }
    expect(members).toContain('ltth_9.9.9/app/plugins/goals/locales/en.json');
    expect(members).not.toContain('ltth_9.9.9/app/.jest-ceo-dashboard-focused/jest-transform-cache-synthetic/ab/transform.js');
    expect(members).not.toContain('ltth_9.9.9/app/.jest-ceo-dashboard-focused/haste-map-synthetic');
    expect(members).toContain('ltth_9.9.9/app/.runtime-template');
    expect(sha256File(path.join(jestCache, 'jest-transform-cache-synthetic', 'ab', 'transform.js'))).toBe(jestCacheHashes[0]);
    expect(sha256File(path.join(jestCache, 'haste-map-synthetic'))).toBe(jestCacheHashes[1]);
    expect(sha256File(hiddenRuntimeFile)).toBe(hiddenRuntimeHash);
  });
});
