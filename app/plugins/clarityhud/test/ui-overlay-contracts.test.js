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
