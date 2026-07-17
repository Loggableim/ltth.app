'use strict';

const path = require('path');
const fs = require('fs');
const { auditPluginUi } = require('../../scripts/lib/plugin-ui-i18n-audit');
const { auditPluginLocales, flattenTranslations } = require('../../scripts/lib/plugin-i18n-audit');
const { loadPublishedPluginCatalog } = require('../../scripts/lib/published-plugin-catalog');

describe('Milestone Leaderboard translations', () => {
  test('has no strict UI or locale audit errors', () => {
    const repoRoot = path.resolve(__dirname, '..', '..');
    const catalog = loadPublishedPluginCatalog(repoRoot);
    const errors = [
      ...auditPluginUi({ repoRoot, catalog }).errors,
      ...auditPluginLocales(path.join(repoRoot, 'app', 'plugins')).errors
    ].filter((error) => error.startsWith('milestone-leaderboard'));

    expect(errors).toEqual([]);
  });

  test('translates runtime text for the served Gift Milestone UI and overlay', () => {
    const repoRoot = path.resolve(__dirname, '..', '..');
    const pluginRoot = path.join(repoRoot, 'app', 'plugins', 'milestone-leaderboard');
    const uiSource = fs.readFileSync(path.join(pluginRoot, 'vendor', 'gift-milestone', 'ui.js'), 'utf8');
    const overlaySource = fs.readFileSync(path.join(pluginRoot, 'vendor', 'gift-milestone', 'overlay.js'), 'utf8');
    const runtimeKeys = [
      'empty_tiers',
      'tier_level',
      'tier_disabled',
      'tier_coins',
      'custom_media',
      'test_tier',
      'edit_tier_action',
      'delete_tier_action',
      'empty_users',
      'no_tier',
      'user_coins',
      'last_milestone',
      'reset_user',
      'add_tier',
      'edit_tier',
      'confirm_delete_tier',
      'confirm_reset_user',
      'confirm_reset_all',
      'status_enabled',
      'status_disabled',
      'config_saved',
      'plugin_disabled',
      'overlay_thank_you',
      'overlay_title',
      'overlay_tier_reached'
    ];

    expect(uiSource).toContain("giftMilestoneText('empty_tiers'");
    expect(uiSource).toContain('window.i18n.onLanguageChange');
    expect(overlaySource).toContain("giftMilestoneOverlayText('overlay_thank_you'");

    for (const locale of ['de', 'en', 'es', 'fr']) {
      const messages = flattenTranslations(JSON.parse(fs.readFileSync(
        path.join(pluginRoot, 'locales', `${locale}.json`),
        'utf8'
      )));
      for (const key of runtimeKeys) {
        expect(messages[`plugins.milestone-leaderboard.gift_milestone.runtime.${key}`]).toEqual(expect.any(String));
      }
    }
  });

  test('uses namespaced runtime translations on every served Viewer XP surface', () => {
    const repoRoot = path.resolve(__dirname, '..', '..');
    const viewerRoot = path.join(repoRoot, 'app', 'plugins', 'milestone-leaderboard', 'vendor', 'viewer-leaderboard');
    const servedFiles = [
      'ui/admin.html',
      'overlays/xp-bar.html',
      'overlays/leaderboard.html',
      'overlays/level-up.html',
      'overlays/user-profile.html',
      'overlays/event-ticker.html'
    ];
    const helper = fs.readFileSync(path.join(viewerRoot, 'viewer-xp-i18n.js'), 'utf8');
    const runtimeKeys = [
      'xp_level',
      'xp_gain',
      'level_up',
      'leaderboard_last_days',
      'leaderboard_level',
      'leaderboard_updated',
      'rewards',
      'new_color',
      'unknown_user',
      'newcomer',
      'profile_level',
      'profile_days',
      'relative_now',
      'relative_minutes_ago',
      'relative_hours_ago',
      'relative_days_ago',
      'ticker_connected',
      'ticker_disconnected',
      'ticker_waiting',
      'ticker_xp',
      'no_viewers',
      'connection_error_title',
      'connection_error_message',
      'event_chat_message',
      'event_gift',
      'event_follow',
      'event_share',
      'event_like',
      'event_subscribe',
      'event_daily_bonus',
      'event_streak_bonus',
      'event_watch_time_minute',
      'event_chat',
      'event_join',
      'event_manual_award',
      'event_spin_win',
      'event_spin_loss'
    ];

    expect(helper).toContain('plugins.milestone-leaderboard.viewer_xp.runtime.');
    for (const file of servedFiles) {
      expect(fs.readFileSync(path.join(viewerRoot, file), 'utf8'))
        .toContain('/plugins/viewer-leaderboard/viewer-xp-i18n.js');
    }
    expect(fs.readFileSync(path.join(viewerRoot, 'overlays', 'event-ticker.html'), 'utf8'))
      .toContain("ViewerXpI18n.text(key, fallback)");
    expect(fs.readFileSync(path.join(viewerRoot, 'ui', 'admin.html'), 'utf8'))
      .toContain('function formatViewerXpEventType(type)');
    for (const locale of ['de', 'en', 'es', 'fr']) {
      const messages = flattenTranslations(JSON.parse(fs.readFileSync(
        path.join(repoRoot, 'app', 'plugins', 'milestone-leaderboard', 'locales', `${locale}.json`),
        'utf8'
      )));
      for (const key of runtimeKeys) {
        expect(messages[`plugins.milestone-leaderboard.viewer_xp.runtime.${key}`]).toEqual(expect.any(String));
      }
    }
  });

  test('localizes dynamic status, confirmation, and empty-state text in the served Viewer XP admin UI', () => {
    const repoRoot = path.resolve(__dirname, '..', '..');
    const pluginRoot = path.join(repoRoot, 'app', 'plugins', 'milestone-leaderboard');
    const adminSource = fs.readFileSync(
      path.join(pluginRoot, 'vendor', 'viewer-leaderboard', 'ui', 'admin.html'),
      'utf8'
    );
    const runtimeKeys = [...adminSource.matchAll(/adminText\('([a-z0-9_]+)'/g)]
      .map((match) => `admin.${match[1]}`);

    expect(adminSource).toContain('function adminText(');
    expect(adminSource).not.toMatch(/alert\(['"][A-Za-z]/);
    expect(adminSource).not.toMatch(/confirm\(['"][A-Za-z]/);
    for (const locale of ['de', 'en', 'es', 'fr']) {
      const messages = flattenTranslations(JSON.parse(fs.readFileSync(
        path.join(pluginRoot, 'locales', `${locale}.json`),
        'utf8'
      )));
      for (const key of new Set(runtimeKeys)) {
        expect(messages[`plugins.milestone-leaderboard.viewer_xp.runtime.${key}`]).toEqual(expect.any(String));
      }
    }
  });
});
