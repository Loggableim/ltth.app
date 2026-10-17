const fs = require('fs');
const path = require('path');

const appRoot = path.join(__dirname, '..');
const repoRoot = path.join(appRoot, '..');
const PLUGIN_VERSION = '3.1.1';

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

describe('WebGPU Fireworks 3.1.1 historical release and asset contract', () => {
  test('checks current package metadata independently from the historical Fireworks release', () => {
    const rootPackage = readJson('package.json');
    const appPackage = readJson('app/package.json');
    const appLock = readJson('app/package-lock.json');
    const publicRelease = readJson('version.json');
    const currentVersion = publicRelease.version;

    expect(rootPackage.version).toBe(currentVersion);
    expect(appPackage.version).toBe(currentVersion);
    expect(appLock.version).toBe(currentVersion);
    expect(appLock.packages[''].version).toBe(currentVersion);

    const latestChangelog = publicRelease.changelog[currentVersion];
    expect(publicRelease).toEqual(expect.objectContaining({
      version: currentVersion,
      downloadVersion: currentVersion,
      downloadUrl: `https://github.com/Loggableim/ltth.app/releases/tag/v${currentVersion}`
    }));
    expect(latestChangelog).toEqual(expect.objectContaining({
      date: publicRelease.releaseDate,
      changes: expect.any(Array)
    }));

    expect(publicRelease.changelog['1.4.1']).toEqual(expect.objectContaining({
      date: '2026-07-26',
      changes: expect.any(Array)
    }));
    expect(publicRelease.changelog['1.4.1'].changes.join('\n')).toContain('Stream Monsters 1.5.0');
    expect(publicRelease.changelog['1.4.0'].changes.join('\n')).toContain('WebGPU Fireworks 3.1.1');
  });

  test.todo('OPEN: align active website, deploy metadata, and changelogs to version.json 1.4.3; source currently reports 1.4.2 in CURRENT_VERSION/CURRENT_RELEASE, download page, header/footer, locales, and app changelog. No separate product contract confirming this drift is intentional.');

  test('aligns the plugin manifest and every active plugin asset cache key to 3.1.1', () => {
    const manifest = readJson('app/plugins/webgpu-fireworks/plugin.json');
    const surfaces = {
      'app/plugins/webgpu-fireworks/overlay.html': [
        '/plugins/webgpu-fireworks/gpu/boykisser-geometry.js',
        '/plugins/webgpu-fireworks/gpu/engine.js',
        '/plugins/webgpu-fireworks/gpu/show-plan-v2-runtime.js',
        '/plugins/webgpu-fireworks/gpu/spawn-command-policy.js',
        '/plugins/webgpu-fireworks/gpu/visible-envelope.js',
        '/plugins/webgpu-fireworks/gpu/webgpu-particle-engine.js'
      ],
      'app/plugins/webgpu-fireworks/ui/settings.html': [
        '/plugins/webgpu-fireworks/ui/settings-contract.js',
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

    const settingsAssets = pluginAssetUrls(read('app/plugins/webgpu-fireworks/ui/settings.html'))
      .map(url => url.split('?')[0]);
    expect(settingsAssets.indexOf('/plugins/webgpu-fireworks/ui/settings-contract.js'))
      .toBeLessThan(settingsAssets.indexOf('/plugins/webgpu-fireworks/ui/settings.js'));

    const overlayAssets = pluginAssetUrls(read('app/plugins/webgpu-fireworks/overlay.html'))
      .map(url => url.split('?')[0]);
    expect(overlayAssets.indexOf('/plugins/webgpu-fireworks/gpu/boykisser-geometry.js'))
      .toBeLessThan(overlayAssets.indexOf('/plugins/webgpu-fireworks/gpu/webgpu-particle-engine.js'));
  });
});
