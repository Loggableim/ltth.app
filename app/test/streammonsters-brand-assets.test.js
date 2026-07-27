const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..', '..');
const creatorScreenshot = '/screenshots/features/stream-monsters-creator-1.5.png';
const arenaScreenshot = '/screenshots/features/stream-monsters-arena-portrait-1.5.png';

function readJson(...parts) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, ...parts), 'utf8'));
}

describe('Stream Monsters 1.8 public branding', () => {
  it('publishes the stable plugin ID with the 1.8 package and both broadcast screenshots', () => {
    const featurePage = fs.readFileSync(path.join(repoRoot, 'features', 'plugin-stream-alchemy.html'), 'utf8');
    const pluginPage = fs.readFileSync(path.join(repoRoot, 'plugins.html'), 'utf8');
    const storeRegistry = readJson('plugin-store.json');
    const pluginManifest = readJson('app', 'plugins', 'streamalchemy', 'plugin.json');
    const streamMonsters = storeRegistry.plugins.find((plugin) => plugin.id === 'streamalchemy');

    expect(streamMonsters).toMatchObject({
      id: 'streamalchemy',
      version: '1.8.0',
      channel: 'open-beta',
      packageUrl: 'https://ltth.app/plugin-store/packages/streamalchemy-1.8.0.zip',
      screenshots: [creatorScreenshot, arenaScreenshot]
    });
    expect(streamMonsters.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(pluginManifest.version).toBe(streamMonsters.version);
    expect(pluginManifest.devStatus).toBe('working-beta');
    expect(streamMonsters.badges).toEqual(expect.arrayContaining(['working-beta', 'subscriber-only']));
    expect(streamMonsters.access).toEqual({ type: 'subscriber' });

    for (const locale of ['de', 'en', 'es', 'fr']) {
      const description = streamMonsters.description[locale];
      expect(description).toContain('72');
      expect(description).toContain('A/B/C');
    }

    expect(featurePage).toContain('/assets/plugin-logos/stream-monsters-logo.png');
    expect(featurePage).toContain('/assets/plugin-logos/stream-monsters-icon.png');
    expect(featurePage).toContain(`https://ltth.app${creatorScreenshot}`);
    expect(featurePage).toContain(`src="${creatorScreenshot}"`);
    expect(featurePage).toContain(`src="${arenaScreenshot}"`);
    expect(pluginPage).toContain("'streamalchemy': '/assets/plugin-logos/stream-monsters-icon.png'");
  });

  it('documents gift eggs plus optional recurring free eggs, 72 bundled forms, portrait A/B/C battles, and the emergency fallback', () => {
    const docsPage = fs.readFileSync(path.join(repoRoot, 'docs', 'plugins', 'streamalchemy.html'), 'utf8');
    const docsIndex = readJson('docs', 'plugins', 'index.json');
    const streamMonstersDocs = docsIndex.find((plugin) => plugin.id === 'streamalchemy');
    const furryManifest = readJson(
      'app',
      'plugins',
      'streamalchemy',
      'assets',
      'streammonsters',
      'furry',
      'manifest.json'
    );

    expect(docsPage).toContain('Stream Monsters 1.8');
    expect(docsPage).toMatch(/Gift-Eier|Geschenk-Eier/);
    expect(docsPage).toMatch(/optionale wiederkehrende Gratis-Eier/);
    expect(docsPage).not.toMatch(/Gifts-only-Eier|Gift-only Eier|nur (?:durch )?Gifts/i);
    expect(docsPage).toContain('72 gebündelte Formen');
    expect(docsPage).toContain('A/B/C-Arena');
    expect(docsPage).toContain('Portrait');
    expect(docsPage).toContain('Kenney-Notfall-Fallback');
    expect(docsPage).not.toMatch(/>Stream[\s-]?Alchemy</i);
    expect(streamMonstersDocs.name).toBe('Stream Monsters');
    expect(streamMonstersDocs.image).toEqual({
      de: creatorScreenshot,
      en: creatorScreenshot,
      es: creatorScreenshot,
      fr: creatorScreenshot
    });
    for (const locale of ['de', 'en', 'es', 'fr']) {
      expect(streamMonstersDocs.translations[locale].summary).toContain('72');
      expect(streamMonstersDocs.translations[locale].summary).toContain('A/B/C');
    }

    expect(furryManifest).toMatchObject({
      schemaVersion: 2,
      assetVersion: 'furry-1.5.0',
      productionMode: 'bundled-only'
    });
    expect(furryManifest.assets).toHaveLength(72);
    expect(furryManifest.assets.filter((asset) => asset.stage === 1)).toHaveLength(24);
    expect(furryManifest.assets.filter((asset) => asset.stage === 2)).toHaveLength(24);
    expect(furryManifest.assets.filter((asset) => asset.stage === 3)).toHaveLength(24);
  });

  it('uses the Creator screenshot for setup steps and the portrait arena for battle and OBS steps', () => {
    const creatorSteps = ['alchemy-card', 'automation-rule', 'action-chain', 'rule-reset'];
    const arenaSteps = ['rule-dry-run', 'alchemy-overlay'];

    for (const locale of ['de', 'en', 'es', 'fr']) {
      const guideLocale = readJson('locales', 'guides', `${locale}.json`);
      for (const stepId of creatorSteps) {
        expect(guideLocale[`docs.plugin.streamalchemy.steps.${stepId}.src`]).toBe(creatorScreenshot);
      }
      for (const stepId of arenaSteps) {
        expect(guideLocale[`docs.plugin.streamalchemy.steps.${stepId}.src`]).toBe(arenaScreenshot);
      }
    }

    for (const featureIndex of ['features/index.html', 'features-en.html', 'features-es.html', 'features-fr.html']) {
      const source = fs.readFileSync(path.join(repoRoot, featureIndex), 'utf8');
      expect(source).toContain(creatorScreenshot);
      expect(source).toContain(arenaScreenshot);
      expect(source).not.toContain('/screenshots/features/stream-monsters.png');
    }
  });

  it('captures the Creator at 1920x1080 and the portrait arena at 1080x1920', () => {
    const { buildSpec } = require('../../scripts/product-screenshot-spec');
    const captureSpec = buildSpec(repoRoot);
    const captureManifest = readJson('screenshots', 'product-capture-manifest.json');
    const expected = {
      'stream-monsters-creator-1.5': {
        route: '/streammonsters/ui',
        viewport: { width: 1920, height: 1080, deviceScaleFactor: 1 }
      },
      'stream-monsters-arena-portrait-1.5': {
        route: '/streammonsters/overlay?layout=portrait',
        viewport: { width: 1080, height: 1920, deviceScaleFactor: 1 }
      }
    };

    for (const [id, contract] of Object.entries(expected)) {
      expect(captureSpec.assets.find((asset) => asset.id === id)).toMatchObject(contract);
      expect(captureManifest.assets.find((asset) => asset.id === id)).toMatchObject(contract);
    }
    expect(captureSpec.assets.some((asset) => asset.id === 'stream-monsters')).toBe(false);
    expect(captureManifest.assets.some((asset) => asset.id === 'stream-alchemy')).toBe(false);
    const streamMonsterOutputs = captureManifest.outputs.filter((output) => (
      Object.prototype.hasOwnProperty.call(expected, output.id)
    ));
    expect(streamMonsterOutputs).toHaveLength(8);
    expect(new Set(streamMonsterOutputs.map((output) => output.locale))).toEqual(new Set(['de', 'en', 'es', 'fr']));
  });

  it('keeps Furry canonical and names the global SiliconFlow copy only after Fish Speech', () => {
    const pluginDir = path.join(repoRoot, 'app', 'plugins', 'streamalchemy');
    const pluginUi = fs.readFileSync(path.join(pluginDir, 'streammonsters-ui.html'), 'utf8');
    const overlay = fs.readFileSync(path.join(pluginDir, 'streammonsters-overlay.html'), 'utf8');
    const dashboard = fs.readFileSync(path.join(repoRoot, 'app', 'public', 'dashboard.html'), 'utf8');
    const expectedKey = 'used_for_fish_speech_1_5_tts';
    const retiredKey = 'used_for_fish_speech_1_5_tts_and_streamalchemy_flux_1_schnell_image_generation';

    expect(pluginUi).toContain('Stream Monsters');
    expect(pluginUi).not.toContain('>StreamAlchemy<');
    expect(overlay).toContain('Stream Monsters');
    expect(overlay).not.toContain('>StreamAlchemy<');
    expect(dashboard).toContain(`data-i18n="common.dashboard.${expectedKey}"`);
    expect(dashboard).not.toContain(retiredKey);

    for (const locale of ['de', 'en', 'es', 'fr']) {
      const appTranslations = readJson('app', 'locales', `${locale}.json`);
      const dashboardCopy = appTranslations.common.dashboard[expectedKey];
      expect(dashboardCopy).toMatch(/Fish Speech/i);
      expect(dashboardCopy).not.toMatch(/Stream Monsters|StreamAlchemy|Bildgenerierung|image generation/i);
      expect(appTranslations.common.dashboard).not.toHaveProperty(retiredKey);
    }
  });

  it('retains the Stream Monsters icon and logo in the site and plugin bundle', () => {
    const pluginManifest = readJson('app', 'plugins', 'streamalchemy', 'plugin.json');
    const pluginDir = path.join(repoRoot, 'app', 'plugins', 'streamalchemy');

    expect(pluginManifest.icon).toBe('/plugins/streamalchemy/assets/branding/stream-monsters-icon.png');
    expect(pluginManifest.logo).toBe('/plugins/streamalchemy/assets/branding/stream-monsters-logo.png');
    expect(fs.existsSync(path.join(repoRoot, 'app', pluginManifest.icon))).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, 'app', pluginManifest.logo))).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, 'assets', 'plugin-logos', 'stream-monsters-icon.png'))).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, 'assets', 'plugin-logos', 'stream-monsters-logo.png'))).toBe(true);
    expect(fs.existsSync(path.join(pluginDir, 'ui.html'))).toBe(false);
    expect(fs.existsSync(path.join(pluginDir, 'ui-old.html'))).toBe(false);
  });
});
