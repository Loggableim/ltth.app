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

  test('aligns the plugin manifest and runtime cache keys to 3.0.0', () => {
    const manifest = readJson('app/plugins/webgpu-fireworks/plugin.json');
    const overlay = read('app/plugins/webgpu-fireworks/overlay.html');
    const settings = read('app/plugins/webgpu-fireworks/ui/settings.html');
    const overlayCacheKeys = [...overlay.matchAll(/<script src="\/plugins\/webgpu-fireworks\/[^"?]+\?v=([^"&]+)"/g)]
      .map(match => match[1]);

    expect(manifest.version).toBe(PLUGIN_VERSION);
    expect(overlayCacheKeys).toHaveLength(4);
    expect(overlayCacheKeys.every(key => key.startsWith(`${PLUGIN_VERSION}-`))).toBe(true);
    expect(settings).toContain(`settings.js?v=${PLUGIN_VERSION}-avatar-head-1`);
    expect(overlay).not.toContain('?v=2.2.1-');
    expect(settings).not.toContain('?v=2.2.1-');
  });
});
