const fs = require('fs');
const os = require('os');
const path = require('path');

const { prepareDocsPluginFixture } = require('../../scripts/lib/docs-capture-plugin-fixture');

describe('docs capture plugin fixture', () => {
  test('enables only the declared local runtime dependencies with the guide plugin', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-docs-fixture-test-'));
    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-docs-profile-test-'));
    try {
      for (const id of ['quiz-show', 'tts']) {
        const pluginDir = path.join(repoRoot, 'app', 'plugins', id);
        fs.mkdirSync(pluginDir, { recursive: true });
        fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({ id, enabled: false }));
      }
      fs.mkdirSync(path.join(repoRoot, 'app', 'modules'), { recursive: true });
      fs.mkdirSync(path.join(repoRoot, 'app', 'node_modules'), { recursive: true });

      const fixtureRoot = prepareDocsPluginFixture(repoRoot, profileDir, 'quiz-show');
      for (const id of ['quiz-show', 'tts']) {
        const manifest = JSON.parse(fs.readFileSync(path.join(fixtureRoot, id, 'plugin.json'), 'utf8'));
        expect(manifest.enabled).toBe(true);
      }
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
      fs.rmSync(profileDir, { recursive: true, force: true });
    }
  });

  test('enables every locally available plugin route in each isolated guide fixture', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-docs-full-routes-test-'));
    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-docs-full-routes-profile-test-'));
    try {
      const pluginRoots = [
        ['app', 'plugins', 'emoji-rain'],
        ['app', 'plugins', 'webgpu-emoji-rain'],
        ['app', 'plugins', 'openshock'],
        ['app', 'plugins', 'soundboard'],
        ['plugin-store', 'sources', 'store-admin']
      ];
      for (const parts of pluginRoots) {
        const pluginDir = path.join(repoRoot, ...parts);
        fs.mkdirSync(pluginDir, { recursive: true });
        const id = parts.at(-1);
        fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({ id, name: id, entry: 'main.js', enabled: false }));
        fs.writeFileSync(path.join(pluginDir, 'main.js'), 'module.exports = class Plugin {};');
      }
      fs.mkdirSync(path.join(repoRoot, 'app', 'modules'), { recursive: true });
      fs.mkdirSync(path.join(repoRoot, 'app', 'node_modules'), { recursive: true });

      const fixtureRoot = prepareDocsPluginFixture(repoRoot, profileDir, 'store-admin');
      for (const id of ['emoji-rain', 'webgpu-emoji-rain', 'openshock', 'soundboard', 'store-admin']) {
        const manifest = JSON.parse(fs.readFileSync(path.join(fixtureRoot, id, 'plugin.json'), 'utf8'));
        expect(manifest.enabled).toBe(true);
      }
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
      fs.rmSync(profileDir, { recursive: true, force: true });
    }
  });

  test('keeps dashboard plugin assets together with their enabled local route manifests', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-docs-static-assets-test-'));
    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-docs-static-assets-profile-'));
    try {
      for (const id of ['store-admin', 'emoji-rain']) {
        const pluginDir = path.join(repoRoot, 'app', 'plugins', id);
        fs.mkdirSync(path.join(pluginDir, 'assets'), { recursive: true });
        fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({ id, enabled: false }));
        fs.writeFileSync(path.join(pluginDir, 'assets', 'icon.png'), id);
      }
      fs.mkdirSync(path.join(repoRoot, 'app', 'modules'), { recursive: true });
      fs.mkdirSync(path.join(repoRoot, 'app', 'node_modules'), { recursive: true });

      const fixtureRoot = prepareDocsPluginFixture(repoRoot, profileDir, 'store-admin');
      expect(fs.existsSync(path.join(fixtureRoot, 'emoji-rain', 'assets', 'icon.png'))).toBe(true);
      expect(JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'emoji-rain', 'plugin.json'), 'utf8')).enabled).toBe(true);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
      fs.rmSync(profileDir, { recursive: true, force: true });
    }
  });

  test.each([
    ['webgpu-emoji-rain', 'emoji-rain'],
    ['webgpu-fireworks', 'fireworks']
  ])('keeps the documented %s route provider instead of its exclusive legacy sibling', (guideId, siblingId) => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-docs-exclusive-routes-test-'));
    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-docs-exclusive-routes-profile-'));
    try {
      for (const id of [guideId, siblingId]) {
        const pluginDir = path.join(repoRoot, 'app', 'plugins', id);
        fs.mkdirSync(pluginDir, { recursive: true });
        fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({ id, name: id, entry: 'main.js', enabled: false }));
        fs.writeFileSync(path.join(pluginDir, 'main.js'), 'module.exports = class Plugin {};');
      }
      fs.mkdirSync(path.join(repoRoot, 'app', 'modules'), { recursive: true });
      fs.mkdirSync(path.join(repoRoot, 'app', 'node_modules'), { recursive: true });

      const fixtureRoot = prepareDocsPluginFixture(repoRoot, profileDir, guideId);
      expect(JSON.parse(fs.readFileSync(path.join(fixtureRoot, guideId, 'plugin.json'), 'utf8')).enabled).toBe(true);
      expect(JSON.parse(fs.readFileSync(path.join(fixtureRoot, siblingId, 'plugin.json'), 'utf8')).enabled).toBe(false);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
      fs.rmSync(profileDir, { recursive: true, force: true });
    }
  });
});
