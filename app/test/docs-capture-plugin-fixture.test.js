const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  parseDocsCapturePluginIds,
  prepareDocsPluginFixture,
  isPathInside
} = require('../../scripts/lib/docs-capture-plugin-fixture');

describe('docs capture plugin fixture', () => {
  let repoRoot;
  let profileDir;

  beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-docs-fixture-test-'));
    profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-docs-profile-test-'));
  });

  afterEach(() => {
    for (const [candidate, prefix] of [
      [repoRoot, 'ltth-docs-fixture-test-'],
      [profileDir, 'ltth-docs-profile-test-']
    ]) {
      if (!candidate) continue;
      const tempRoot = path.resolve(os.tmpdir());
      const resolvedCandidate = path.resolve(candidate);
      const candidateStat = fs.lstatSync(resolvedCandidate);
      if (!candidateStat.isDirectory()
        || candidateStat.isSymbolicLink()
        || path.dirname(resolvedCandidate) !== tempRoot
        || !path.basename(resolvedCandidate).startsWith(prefix)
        || !isPathInside(tempRoot, resolvedCandidate)) {
        throw new Error(`Refusing to remove a test path outside its unique temp directory: ${candidate}`);
      }
      fs.rmSync(resolvedCandidate, { recursive: true, force: true });
    }
  });

  function addPlugin(root, id, extraFiles = {}) {
    const pluginDir = path.join(root, 'app', 'plugins', id);
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({ id, enabled: false }));
    for (const [relativePath, contents] of Object.entries(extraFiles)) {
      const target = path.join(pluginDir, relativePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, contents);
    }
  }

  test('copies and enables exactly the explicitly allowed plugin IDs', () => {
    addPlugin(repoRoot, 'quiz-show');
    addPlugin(repoRoot, 'tts');
    fs.mkdirSync(path.join(repoRoot, 'app', 'modules'), { recursive: true });
    fs.mkdirSync(path.join(repoRoot, 'app', 'node_modules'), { recursive: true });

    const fixtureRoot = prepareDocsPluginFixture(repoRoot, profileDir, ['quiz-show']);
    expect(fs.readdirSync(fixtureRoot).sort()).toEqual(['quiz-show']);
    expect(JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'quiz-show', 'plugin.json'), 'utf8')).enabled).toBe(true);
    expect(fs.existsSync(path.join(fixtureRoot, 'tts'))).toBe(false);
    expect(fs.existsSync(path.join(profileDir, 'docs-capture-app', 'modules'))).toBe(false);
    expect(fs.existsSync(path.join(profileDir, 'docs-capture-app', 'node_modules'))).toBe(false);
  });

  test('stages only regular allowlisted plugin files under temp and creates no junctions', () => {
    addPlugin(repoRoot, 'milestone-leaderboard', {
      'vendor/viewer-leaderboard/overlays/xp-bar.html': '<main>fixture</main>'
    });
    fs.mkdirSync(path.join(repoRoot, 'app', 'modules'), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, 'app', 'modules', 'source-only.txt'), 'keep source');
    fs.mkdirSync(path.join(repoRoot, 'app', 'node_modules'), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, 'app', 'node_modules', 'source-only.txt'), 'keep dependency');
    const foreignProfileFile = path.join(profileDir, 'leave-this-file.txt');
    fs.writeFileSync(foreignProfileFile, 'preserve');

    const symlinkSpy = jest.spyOn(fs, 'symlinkSync');
    try {
      const fixtureRoot = prepareDocsPluginFixture(repoRoot, profileDir, ['milestone-leaderboard']);
      const fixtureAppRoot = path.dirname(fixtureRoot);
      const stagedEntry = path.join(fixtureRoot, 'milestone-leaderboard', 'vendor', 'viewer-leaderboard', 'overlays', 'xp-bar.html');

      expect(path.dirname(fixtureRoot)).toBe(path.join(profileDir, 'docs-capture-app'));
      expect(fs.readdirSync(fixtureRoot)).toEqual(['milestone-leaderboard']);
      expect(fs.readFileSync(stagedEntry, 'utf8')).toBe('<main>fixture</main>');
      expect(JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'milestone-leaderboard', 'plugin.json'), 'utf8')).enabled).toBe(true);
      expect(fs.existsSync(path.join(fixtureAppRoot, 'modules'))).toBe(false);
      expect(fs.existsSync(path.join(fixtureAppRoot, 'node_modules'))).toBe(false);
      expect(fs.readFileSync(path.join(repoRoot, 'app', 'modules', 'source-only.txt'), 'utf8')).toBe('keep source');
      expect(fs.readFileSync(path.join(repoRoot, 'app', 'node_modules', 'source-only.txt'), 'utf8')).toBe('keep dependency');
      expect(fs.readFileSync(foreignProfileFile, 'utf8')).toBe('preserve');
      expect(symlinkSpy).not.toHaveBeenCalled();

      const pending = [fixtureAppRoot];
      while (pending.length) {
        const current = pending.pop();
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
          const target = path.join(current, entry.name);
          expect(fs.lstatSync(target).isSymbolicLink()).toBe(false);
          if (entry.isDirectory()) pending.push(target);
        }
      }
    } finally {
      symlinkSpy.mockRestore();
    }
  });

  test('empty and absent allowlists produce an empty fixture', () => {
    addPlugin(repoRoot, 'quiz-show');

    for (const allowedIds of [undefined, '', []]) {
      const fixtureRoot = prepareDocsPluginFixture(repoRoot, profileDir, allowedIds);
      expect(fs.readdirSync(fixtureRoot)).toEqual([]);
    }
  });

  test('supports an explicit plugin-store source without copying unrelated providers', () => {
    const storeDir = path.join(repoRoot, 'plugin-store', 'sources', 'store-admin');
    fs.mkdirSync(storeDir, { recursive: true });
    fs.writeFileSync(path.join(storeDir, 'plugin.json'), JSON.stringify({ id: 'store-admin', enabled: false }));
    addPlugin(repoRoot, 'emoji-rain', { 'assets/icon.svg': '<svg></svg>' });
    addPlugin(repoRoot, 'openshock');

    const fixtureRoot = prepareDocsPluginFixture(repoRoot, profileDir, ['store-admin', 'emoji-rain']);
    expect(fs.readdirSync(fixtureRoot).sort()).toEqual(['emoji-rain', 'store-admin']);
    expect(fs.existsSync(path.join(fixtureRoot, 'emoji-rain', 'assets', 'icon.svg'))).toBe(true);
    expect(fs.existsSync(path.join(fixtureRoot, 'openshock'))).toBe(false);
  });

  test('requires any declared source to exist and match its allowlisted ID', () => {
    expect(() => prepareDocsPluginFixture(repoRoot, profileDir, ['missing-plugin']))
      .toThrow(/not available locally/);
  });

  test.each([
    { value: '../outside', error: /invalid plugin ID/ },
    { value: 'uppercase-ID', error: /invalid plugin ID/ },
    { value: 'id,', error: /invalid plugin ID/ },
    { value: ['quiz-show', 'quiz-show'], error: /duplicate plugin IDs/ }
  ])('rejects malformed or duplicate plugin allowlists: $value', ({ value, error }) => {
    expect(() => parseDocsCapturePluginIds(value)).toThrow(error);
  });

  test('parses a comma-separated explicit plugin set and defaults to zero', () => {
    expect(parseDocsCapturePluginIds(undefined)).toEqual([]);
    expect(parseDocsCapturePluginIds('quiz-show, store-admin')).toEqual(['quiz-show', 'store-admin']);
  });
});
