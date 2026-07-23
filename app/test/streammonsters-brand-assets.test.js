const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const yauzl = require('yauzl');

const repoRoot = path.join(__dirname, '..', '..');

function listZipEntries(zipPath) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (openError, zipFile) => {
      if (openError) return reject(openError);
      const entries = [];
      zipFile.on('entry', entry => {
        entries.push(entry.fileName);
        zipFile.readEntry();
      });
      zipFile.on('end', () => resolve(entries));
      zipFile.on('error', reject);
      zipFile.readEntry();
    });
  });
}

describe('Stream Monsters public branding', () => {
  it('uses generated Stream Monsters assets while retaining the stable plugin ID', async () => {
    const featurePage = fs.readFileSync(path.join(repoRoot, 'features', 'plugin-stream-alchemy.html'), 'utf8');
    const pluginPage = fs.readFileSync(path.join(repoRoot, 'plugins.html'), 'utf8');
    const docsPage = fs.readFileSync(path.join(repoRoot, 'docs', 'plugins', 'streamalchemy.html'), 'utf8');
    const docsIndex = JSON.parse(fs.readFileSync(path.join(repoRoot, 'docs', 'plugins', 'index.json'), 'utf8'));
    const pluginUi = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', 'streamalchemy', 'ui.html'), 'utf8');
    const legacyPluginUi = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', 'streamalchemy', 'ui-old.html'), 'utf8');
    const overlay = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', 'streamalchemy', 'overlay.html'), 'utf8');
    const storeRegistry = JSON.parse(fs.readFileSync(path.join(repoRoot, 'plugin-store.json'), 'utf8'));
    const pluginManifest = JSON.parse(fs.readFileSync(
      path.join(repoRoot, 'app', 'plugins', 'streamalchemy', 'plugin.json'),
      'utf8'
    ));
    const iconPath = path.join(repoRoot, 'assets', 'plugin-logos', 'stream-monsters-icon.png');
    const logoPath = path.join(repoRoot, 'assets', 'plugin-logos', 'stream-monsters-logo.png');
    const featureBannerPath = path.join(repoRoot, 'screenshots', 'features', 'stream-monsters.png');
    const streamMonsters = storeRegistry.plugins.find((plugin) => plugin.id === 'streamalchemy');
    const streamMonstersDocs = docsIndex.find((plugin) => plugin.id === 'streamalchemy');
    const packagePath = path.join(repoRoot, 'plugin-store', 'packages', 'streamalchemy-1.2.0.zip');

    expect(featurePage).toContain('Stream Monsters');
    expect(featurePage).toContain('/assets/plugin-logos/stream-monsters-logo.png');
    expect(featurePage).toContain('/assets/plugin-logos/stream-monsters-icon.png');
    expect(featurePage).toContain('https://ltth.app/screenshots/features/stream-monsters.png');
    expect(pluginPage).toContain("'streamalchemy': '/assets/plugin-logos/stream-monsters-icon.png'");
    expect(docsPage).toContain('Stream Monsters 1.2');
    expect(docsPage).toContain('Collector Arena');
    expect(docsPage).not.toMatch(/>Stream[\s-]?Alchemy</i);
    expect(streamMonstersDocs.name).toBe('Stream Monsters');
    expect(streamMonstersDocs.translations.de.summary).toContain('Quests');
    expect(streamMonstersDocs.translations.de.firstResult).toContain('Kenney');
    expect(streamMonsters.screenshots).toEqual(['/screenshots/features/stream-monsters.png']);
    expect(pluginManifest.version).toBe('1.2.0');
    expect(streamMonsters.version).toBe(pluginManifest.version);
    expect(pluginManifest.devStatus).toBe('working-beta');
    expect(streamMonsters.channel).toBe('open-beta');
    expect(streamMonsters.badges).toContain('working-beta');
    expect(streamMonsters.packageUrl).toBe('https://ltth.app/plugin-store/packages/streamalchemy-1.2.0.zip');
    expect(fs.existsSync(packagePath)).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, 'plugin-store', 'packages', 'streamalchemy-1.1.2.zip'))).toBe(true);
    expect(crypto.createHash('sha256').update(fs.readFileSync(packagePath)).digest('hex')).toBe(streamMonsters.sha256);
    expect(pluginManifest.icon).toBe('/plugins/streamalchemy/assets/branding/stream-monsters-icon.png');
    expect(pluginManifest.logo).toBe('/plugins/streamalchemy/assets/branding/stream-monsters-logo.png');
    expect(fs.existsSync(path.join(repoRoot, 'app', pluginManifest.icon))).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, 'app', pluginManifest.logo))).toBe(true);
    expect(fs.existsSync(iconPath)).toBe(true);
    expect(fs.existsSync(logoPath)).toBe(true);
    expect(fs.existsSync(featureBannerPath)).toBe(true);
    expect(pluginUi).toContain('>Stream Monsters<');
    expect(pluginUi).not.toContain('>StreamAlchemy<');
    expect(legacyPluginUi).not.toMatch(/Stream Alchemy/i);
    expect(overlay).toContain('>Stream Monsters<');
    expect(overlay).not.toContain('>StreamAlchemy<');

    const packageEntries = await listZipEntries(packagePath);
    expect(packageEntries).toEqual(expect.arrayContaining([
      'plugin.json',
      'assets/branding/stream-monsters-icon.png',
      'assets/branding/stream-monsters-logo.png',
      'assets/kenney-monster-builder/License.txt',
      ...['ember', 'tide', 'grove', 'gale', 'volt', 'lunar'].flatMap(element => (
        ['standard', 'charged'].map(variant => `assets/eggs/${element}-${variant}.png`)
      ))
    ]));

    for (const featureIndex of ['features/index.html', 'features-en.html', 'features-es.html', 'features-fr.html']) {
      const source = fs.readFileSync(path.join(repoRoot, featureIndex), 'utf8');
      expect(source).toContain('/screenshots/features/stream-monsters.png');
      expect(source).not.toContain('/screenshots/features/stream-alchemy.png');
    }

    for (const locale of ['de', 'en', 'es', 'fr']) {
      const translations = JSON.parse(fs.readFileSync(
        path.join(repoRoot, 'app', 'plugins', 'streamalchemy', 'locales', `${locale}.json`),
        'utf8'
      ));
      expect(translations.plugins.streamalchemy.ui.app.title).toBe('Stream Monsters');
      expect(translations.plugins.streamalchemy.labels.stream_alchemy).toContain('Stream Monsters');

      const appTranslations = JSON.parse(fs.readFileSync(
        path.join(repoRoot, 'app', 'locales', `${locale}.json`),
        'utf8'
      ));
      const dashboardCopy = appTranslations.common.dashboard.used_for_fish_speech_1_5_tts_and_streamalchemy_flux_1_schnell_image_generation;
      expect(dashboardCopy).toContain('Stream Monsters');
      expect(dashboardCopy).not.toContain('StreamAlchemy');
    }
  });
});
