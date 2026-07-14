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

  test('links dashboard icon assets without adding inactive plugin manifests', () => {
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
      expect(fs.existsSync(path.join(fixtureRoot, 'emoji-rain', 'plugin.json'))).toBe(false);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
      fs.rmSync(profileDir, { recursive: true, force: true });
    }
  });
});
