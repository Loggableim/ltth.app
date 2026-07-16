const fs = require('fs');
const path = require('path');

const pluginRoot = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(pluginRoot, relativePath), 'utf8');
}

describe('ClarityHUD UI and overlay contracts', () => {
  test('keeps the manifest, dashboard, and shared schema on the same version', () => {
    const manifest = JSON.parse(read('plugin.json'));
    const mainHtml = read('ui/main.html');
    const schema = read('lib/settings-schema.js');

    expect(manifest.version).toBe('1.1.0');
    expect(schema).toContain("const VERSION = '1.1.0'");
    expect(mainHtml).toContain('id="plugin-version"');
    expect(mainHtml).toContain('v1.1.0');
  });

  test('loads shared settings schema and exposes profile, preset, live preview, and setup wizard controls', () => {
    const mainHtml = read('ui/main.html');
    const mainJs = read('ui/main.js');

    expect(mainHtml).toContain('/plugins/clarityhud/lib/settings-schema.js');
    expect(mainHtml).toContain('data-action="export-profile"');
    expect(mainHtml).toContain('data-action="import-profile"');
    expect(mainHtml).toContain('data-action="open-setup-wizard"');
    expect(mainHtml).toContain('id="profile-import-input"');

    expect(mainJs).toContain('async function exportProfile');
    expect(mainJs).toContain('async function importProfile');
    expect(mainJs).toContain('async function loadPresets');
    expect(mainJs).toContain('async function saveCustomPreset');
    expect(mainJs).toContain('function openSetupWizard');
    expect(mainJs).toContain('function sendLivePreviewSettings');
    expect(mainJs).toContain('postMessage');
    expect(mainJs).toContain('/api/clarityhud/multi/status');
  });

  test('keeps the ClarityHUD dashboard view focused on the iframe content', () => {
    const dashboardHtml = fs.readFileSync(
      path.join(__dirname, '..', '..', '..', 'public', 'dashboard.html'),
      'utf8'
    );
    const clarityHudBlock = dashboardHtml.match(
      /<!-- View: ClarityHUD -->[\s\S]*?<!-- View: Advanced Timer -->/
    );
    const clarityHudBlockHtml = clarityHudBlock && clarityHudBlock[0];

    expect(clarityHudBlockHtml).toBeTruthy();
    expect(clarityHudBlockHtml).toContain('data-src="/clarityhud/ui"');
    expect(clarityHudBlockHtml).not.toContain('view-header');
    expect(clarityHudBlockHtml).not.toContain('Open in New Tab');
  });

  test('uses debug-gated overlay logging helpers instead of unconditional chat and multi logs', () => {
    const chatJs = read('overlays/chat.js');
    const multiJs = read('overlays/multi.js');
    const fullJs = read('overlays/full.js');
    const streamJs = read('overlays/stream.js');

    expect(chatJs).toContain("createClarityHUDLogger('CHAT HUD')");
    expect(multiJs).toContain("createClarityHUDLogger('MULTI HUD')");
    expect(fullJs).toContain("createClarityHUDLogger('CLARITY FULL')");
    expect(streamJs).toContain("createClarityHUDLogger('CLARITY STREAM')");
  });

  test('loads the shared namespaced runtime translator before every overlay script', () => {
    const runtimeI18n = read('lib/i18n-runtime.js');

    expect(runtimeI18n).toContain('plugins.clarityhud.runtime.');
    ['chat.html', 'full.html', 'multi.html', 'stream.html'].forEach((overlay) => {
      const html = read(`overlays/${overlay}`);
      expect(html).toContain('/plugins/clarityhud/lib/i18n-runtime.js');
    });
  });

  test('localizes dynamic full-overlay fallbacks and initialization errors', () => {
    const fullJs = read('overlays/full.js');

    expect(fullJs).toContain("ClarityHUDI18n.text('overlay.anonymous'");
    expect(fullJs).toContain("ClarityHUDI18n.text('overlay.init_retry'");
    expect(fullJs).toContain("ClarityHUDI18n.text('overlay.init_failed'");
    expect(fullJs).toContain("ClarityHUDI18n.text('overlay.coins'");
    expect(fullJs).toContain("ClarityHUDI18n.text('overlay.gift_sent'");
    expect(fullJs).toContain("ClarityHUDI18n.text(`overlay.event.${type}`");
    expect(fullJs).toContain('window.i18n.ready.then(init)');

    ['de', 'en', 'es', 'fr'].forEach((locale) => {
      const translations = JSON.parse(read(`locales/${locale}.json`));
      const overlay = translations.plugins.clarityhud.runtime.overlay;
      expect(overlay).toMatchObject({ anonymous: expect.any(String), init_retry: expect.any(String), init_failed: expect.any(String), coins: expect.any(String), gift_sent: expect.any(String) });
    });
  });

  test('provides every runtime key used by the shared overlay helpers', () => {
    ['de', 'en', 'es', 'fr'].forEach((locale) => {
      const runtime = JSON.parse(read(`locales/${locale}.json`)).plugins.clarityhud.runtime;

      expect(runtime.badge).toMatchObject({
        team_level: expect.any(String),
        moderator: expect.any(String),
        subscriber: expect.any(String),
        gifter_level: expect.any(String),
        fan_club_with_name: expect.any(String),
        fan_club_level: expect.any(String)
      });
      expect(runtime.debug).toMatchObject({
        status: expect.any(String),
        socket: expect.any(String),
        events: expect.any(String),
        streams: expect.any(String)
      });
      expect(runtime.empty).toMatchObject({
        no_activity_title: expect.any(String),
        no_activity_description: expect.any(String)
      });
      expect(runtime.overlay).toMatchObject({
        gift_sent_count: expect.any(String),
        multi_gift_sent: expect.any(String),
        message_render_error: expect.any(String)
      });
    });
  });

  test('removes unsafe dynamic innerHTML rendering from multi and stream ticker overlays', () => {
    const multiJs = read('overlays/multi.js');
    const streamJs = read('overlays/stream.js');

    expect(multiJs).not.toContain('badgeContainerEl.innerHTML = STATE.badgeRenderer.render');
    expect(multiJs).not.toContain('textEl.innerHTML = STATE.messageParser.parse');
    expect(streamJs).not.toContain('inner.innerHTML = itemsHTML + itemsHTML');
    expect(streamJs).toContain('renderTickerItems');
  });

  test('standardizes full overlay rendering around a virtual-scrolling refresh path', () => {
    const fullJs = read('overlays/full.js');

    expect(fullJs).toContain('function initializeFullVirtualScrolling');
    expect(fullJs).toContain('STATE.virtualScroller');
    expect(fullJs).toContain('useVirtualScrolling');
    expect(fullJs).toContain("return 'showChat';");
    expect(fullJs).not.toContain("showChats");
  });

  test('documents the new ClarityHUD API and setup features', () => {
    const readme = read('README.md');

    expect(readme).toContain('/api/clarityhud/test/multi');
    expect(readme).toContain('/api/clarityhud/profile/export');
    expect(readme).toContain('/api/clarityhud/profile/import');
    expect(readme).toContain('/api/clarityhud/presets');
    expect(readme).toContain('/api/clarityhud/multi/status');
    expect(readme).toContain('Setup Wizard');
    expect(readme).toContain('giftStreakMode');
    expect(readme).toContain('likeAggregationWindowMs');
  });
});
