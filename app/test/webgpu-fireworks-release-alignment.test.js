const fs = require('fs');
const path = require('path');

const appRoot = path.join(__dirname, '..');
const repoRoot = path.join(appRoot, '..');
const APP_VERSION = '1.3.34';
const PLUGIN_VERSION = '3.0.0';
const RELEASE_DATE = '2026-07-19';

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function pluginAssetUrls(source) {
  return [...source.matchAll(/(?:src|href)="(\/plugins\/webgpu-fireworks\/[^"?]+\.(?:css|js)(?:\?[^"#]+)?)"/g)]
    .map(match => match[1]);
}

describe('WebGPU Fireworks 3.0.0 release alignment', () => {
  test('aligns app and public release metadata to LTTH 1.3.34', () => {
    const rootPackage = readJson('package.json');
    const appPackage = readJson('app/package.json');
    const appLock = readJson('app/package-lock.json');
    const currentRelease = readJson('app/CURRENT_RELEASE.json');
    const publicRelease = readJson('version.json');

    expect(rootPackage.version).toBe(APP_VERSION);
    expect(appPackage.version).toBe(APP_VERSION);
    expect(appLock.version).toBe(APP_VERSION);
    expect(appLock.packages[''].version).toBe(APP_VERSION);
    expect(read('app/CURRENT_VERSION.txt').trim()).toBe(APP_VERSION);

    expect(currentRelease.version).toBe(APP_VERSION);
    expect(currentRelease.updated_at.startsWith(RELEASE_DATE)).toBe(true);
    expect(currentRelease.notes).toContain('WebGPU Fireworks 3.0.0');

    expect(publicRelease).toEqual(expect.objectContaining({
      version: APP_VERSION,
      releaseDate: RELEASE_DATE,
      downloadVersion: APP_VERSION,
      downloadUrl: `https://github.com/Loggableim/ltth.app/releases/tag/v${APP_VERSION}`
    }));
    expect(publicRelease.downloadNote).toContain('WebGPU Fireworks 3.0.0');
    expect(publicRelease.changelog[APP_VERSION]).toEqual(expect.objectContaining({
      date: RELEASE_DATE,
      changes: expect.any(Array)
    }));
    expect(publicRelease.changelog[APP_VERSION].changes.join('\n')).toContain('27');
  });

  test('aligns active download, website, locale, and changelog surfaces', () => {
    const activeSurfaces = [
      'downloads/index.html',
      '_partials/header.html',
      '_partials/footer.html'
    ];

    for (const relativePath of activeSurfaces) {
      const source = read(relativePath);
      expect(source).toContain(APP_VERSION);
      expect(source).not.toContain('1.3.33');
    }

    for (const locale of ['de', 'en', 'es', 'fr']) {
      const translations = readJson(`locales/${locale}.json`);
      expect(translations.beta.notice.compact).toContain(APP_VERSION);
      expect(translations.beta.notice.compact).not.toContain('1.3.33');
    }

    for (const relativePath of ['CHANGELOG.md', 'app/CHANGELOG.md']) {
      const changelog = read(relativePath);
      expect(changelog).toContain(`## [${APP_VERSION}] - ${RELEASE_DATE}`);
      expect(changelog).toContain('PyroDSL');
      expect(changelog).toContain('Show Designer');
      expect(changelog).toContain('WebGPU Fireworks 3.0.0');
    }
  });

  test('aligns the plugin manifest and every active plugin asset cache key to 3.0.0', () => {
    const manifest = readJson('app/plugins/webgpu-fireworks/plugin.json');
    const surfaces = {
      'app/plugins/webgpu-fireworks/overlay.html': [
        '/plugins/webgpu-fireworks/gpu/engine.js',
        '/plugins/webgpu-fireworks/gpu/show-plan-v2-runtime.js',
        '/plugins/webgpu-fireworks/gpu/spawn-command-policy.js',
        '/plugins/webgpu-fireworks/gpu/webgpu-particle-engine.js'
      ],
      'app/plugins/webgpu-fireworks/ui/settings.html': [
        '/plugins/webgpu-fireworks/ui/settings.js',
        '/plugins/webgpu-fireworks/ui/show-style-options.js'
      ],
      'app/plugins/webgpu-fireworks/ui/designer.html': [
        '/plugins/webgpu-fireworks/ui/designer.css',
        '/plugins/webgpu-fireworks/ui/show-designer-api.js',
        '/plugins/webgpu-fireworks/ui/show-designer-model.js',
        '/plugins/webgpu-fireworks/ui/show-designer-view.js',
        '/plugins/webgpu-fireworks/ui/show-designer.js'
      ]
    };

    expect(manifest.version).toBe(PLUGIN_VERSION);
    for (const [relativePath, expectedAssets] of Object.entries(surfaces)) {
      const assetUrls = pluginAssetUrls(read(relativePath));
      const assetPaths = assetUrls.map(url => url.split('?')[0]).sort();

      expect(assetPaths).toEqual([...expectedAssets].sort());
      expect(assetUrls.every(url => new RegExp(`\\?v=${PLUGIN_VERSION.replace(/\\./g, '\\\\.')}($|-[a-z0-9.-]+$)`, 'i').test(url)))
        .toBe(true);
    }
  });
});
