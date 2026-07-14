const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const { LOCALES, buildGuides } = require('../../scripts/plugin-tutorial-source');

describe('plugin guide definition rendering', () => {
  const repoRoot = path.join(__dirname, '..', '..');

  beforeAll(() => {
    childProcess.execFileSync(process.execPath, [path.join(repoRoot, 'scripts', 'build-plugin-docs.js')], {
      cwd: repoRoot,
      stdio: 'pipe'
    });
  });

  test('renders each GuideDefinition section and its localized bundle entries', () => {
    for (const guide of buildGuides(repoRoot)) {
      const page = fs.readFileSync(path.join(repoRoot, 'docs', 'plugins', `${guide.id}.html`), 'utf8');
      for (const section of ['purpose', 'activation', 'workflows', 'settings', 'integrations', 'controls', 'troubleshooting']) {
        expect(page).toContain(`data-guide-section="${section}"`);
      }

      for (const locale of LOCALES) {
        const values = JSON.parse(fs.readFileSync(path.join(repoRoot, 'locales', `${locale}.json`), 'utf8'));
        expect(values[`docs.plugin.${guide.id}.purpose`]).toEqual(expect.any(String));
        expect(values[`docs.plugin.${guide.id}.activation.navigation`]).toEqual(expect.any(String));
        expect(values[`docs.plugin.${guide.id}.workflows.golden-path.title`]).toEqual(expect.any(String));
        expect(values[`docs.plugin.${guide.id}.settings.0.purpose`]).toEqual(expect.any(String));
        expect(values[`docs.plugin.${guide.id}.integrations.0.description`]).toEqual(expect.any(String));
        expect(values[`docs.plugin.${guide.id}.troubleshooting.0.resolution`]).toEqual(expect.any(String));
      }
    }
  });
});
