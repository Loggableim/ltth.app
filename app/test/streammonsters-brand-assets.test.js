const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..', '..');

describe('Stream Monsters public branding', () => {
  it('uses generated Stream Monsters assets while retaining the stable plugin ID', () => {
    const featurePage = fs.readFileSync(path.join(repoRoot, 'features', 'plugin-stream-alchemy.html'), 'utf8');
    const pluginPage = fs.readFileSync(path.join(repoRoot, 'plugins.html'), 'utf8');
    const pluginUi = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', 'streamalchemy', 'ui.html'), 'utf8');
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

    expect(featurePage).toContain('Stream Monsters');
    expect(featurePage).toContain('/assets/plugin-logos/stream-monsters-logo.png');
    expect(featurePage).toContain('/assets/plugin-logos/stream-monsters-icon.png');
    expect(featurePage).toContain('https://ltth.app/screenshots/features/stream-monsters.png');
    expect(pluginPage).toContain("'streamalchemy': '/assets/plugin-logos/stream-monsters-icon.png'");
    expect(streamMonsters.screenshots).toEqual(['/screenshots/features/stream-monsters.png']);
    expect(pluginManifest.version).toBe('1.1.2');
    expect(streamMonsters.version).toBe(pluginManifest.version);
    expect(streamMonsters.packageUrl).toBe('https://ltth.app/plugin-store/packages/streamalchemy-1.1.2.zip');
    expect(fs.existsSync(path.join(repoRoot, 'plugin-store', 'packages', 'streamalchemy-1.1.2.zip'))).toBe(true);
    expect(fs.existsSync(iconPath)).toBe(true);
    expect(fs.existsSync(logoPath)).toBe(true);
    expect(fs.existsSync(featureBannerPath)).toBe(true);
    expect(pluginUi).toContain('>Stream Monsters<');
    expect(pluginUi).not.toContain('>StreamAlchemy<');
    expect(overlay).toContain('>Stream Monsters<');
    expect(overlay).not.toContain('>StreamAlchemy<');

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
