'use strict';

const fs = require('fs');
const path = require('path');

const { auditPluginUi } = require('../../scripts/lib/plugin-ui-i18n-audit');
const { loadPublishedPluginCatalog } = require('../../scripts/lib/published-plugin-catalog');
const { flattenTranslations } = require('../../scripts/lib/plugin-i18n-audit');

const repoRoot = path.resolve(__dirname, '..', '..');
const pluginId = 'sidekick';

describe('Sidekick UI i18n', () => {
  test('marks every statically visible control with a complete namespaced translation', () => {
    const catalog = loadPublishedPluginCatalog(repoRoot);
    const result = auditPluginUi({
      repoRoot,
      catalog: {
        ...catalog,
        plugins: catalog.plugins.filter((plugin) => plugin.id === pluginId)
      }
    });

    expect(result.errors).toEqual([]);
  });

  test.each(['de', 'en', 'es', 'fr'])('provides semantic Sidekick controls in %s', (locale) => {
    const localePath = path.join(repoRoot, 'app', 'plugins', pluginId, 'locales', `${locale}.json`);
    const values = flattenTranslations(JSON.parse(fs.readFileSync(localePath, 'utf8')));

    for (const key of [
      'plugins.sidekick.ui.tabs.status',
      'plugins.sidekick.ui.connection.connect',
      'plugins.sidekick.ui.events.gift',
      'plugins.sidekick.ui.empty.noEvents',
      'plugins.sidekick.ui.hostDecision.title'
    ]) {
      expect(values[key]).toEqual(expect.any(String));
    }
  });

  test.each(['de', 'en', 'es', 'fr'])('provides translated runtime ASR and status messages in %s', (locale) => {
    const localePath = path.join(repoRoot, 'app', 'plugins', pluginId, 'locales', `${locale}.json`);
    const values = flattenTranslations(JSON.parse(fs.readFileSync(localePath, 'utf8')));

    for (const key of [
      'plugins.sidekick.ui.runtime.active',
      'plugins.sidekick.ui.runtime.muted',
      'plugins.sidekick.ui.runtime.connected',
      'plugins.sidekick.ui.runtime.disconnected',
      'plugins.sidekick.ui.asr.testRecordingStart',
      'plugins.sidekick.ui.asr.testRecordingStop',
      'plugins.sidekick.ui.asr.readyState',
      'plugins.sidekick.ui.asr.notReadyState',
      'plugins.sidekick.ui.asr.unsafeDeviceWarning',
      'plugins.sidekick.ui.confirm.resetSession',
      'plugins.sidekick.ui.confirm.clearMemory'
    ]) {
      expect(values[key]).toEqual(expect.any(String));
    }
  });

  test('uses namespaced translations for dynamic ASR controls and state labels', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', pluginId, 'ui.html'), 'utf8');

    expect(source).toContain("translateUi('plugins.sidekick.ui.runtime.active'");
    expect(source).toContain("translateUi('plugins.sidekick.ui.asr.testRecordingStart'");
    expect(source).toContain("translateUi('plugins.sidekick.ui.confirm.resetSession'");
    expect(source).toContain('translatePreflightCheck(check)');
    expect(source).toContain('translateAsrErrorCode(asrStatus.lastError.code');
  });

  test.each(['de', 'en', 'es', 'fr'])('provides Sidekick HUD labels in %s', (locale) => {
    const localePath = path.join(repoRoot, 'app', 'plugins', pluginId, 'locales', `${locale}.json`);
    const values = flattenTranslations(JSON.parse(fs.readFileSync(localePath, 'utf8')));

    for (const key of [
      'plugins.sidekick.ui.overlay.chatPerMinute',
      'plugins.sidekick.ui.overlay.gifts',
      'plugins.sidekick.ui.overlay.follows',
      'plugins.sidekick.ui.overlay.viewers',
      'plugins.sidekick.ui.overlay.gift'
    ]) {
      expect(values[key]).toEqual(expect.any(String));
    }
  });

  test.each(['de', 'en', 'es', 'fr'])('localizes preflight diagnostics and ASR API error codes in %s', (locale) => {
    const localePath = path.join(repoRoot, 'app', 'plugins', pluginId, 'locales', `${locale}.json`);
    const values = flattenTranslations(JSON.parse(fs.readFileSync(localePath, 'utf8')));

    for (const key of [
      'plugins.sidekick.ui.preflight.animazingPalAvailable',
      'plugins.sidekick.ui.preflight.microphoneBlocked',
      'plugins.sidekick.ui.asr.errors.ASR_DISABLED',
      'plugins.sidekick.ui.asr.errors.ASR_RATE_LIMITED'
    ]) {
      expect(values[key]).toEqual(expect.any(String));
    }
  });

  test('loads the shared i18n client on the admin panel and HUD overlay', () => {
    for (const relativePath of ['ui.html', 'overlay/sidekick-hud.html']) {
      const source = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', pluginId, relativePath), 'utf8');
      expect(source).toContain('/js/i18n-client.js');
    }

    const overlaySource = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', pluginId, 'overlay', 'sidekick-hud.html'), 'utf8');
    expect(overlaySource).toContain('data-i18n="plugins.sidekick.ui.overlay.chatPerMinute"');
    expect(overlaySource).toContain("translateOverlay('plugins.sidekick.ui.overlay.gift'");
  });
});
