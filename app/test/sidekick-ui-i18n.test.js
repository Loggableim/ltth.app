'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { flattenTranslations } = require('../../scripts/lib/plugin-i18n-audit');
const i18n = require('../modules/i18n');

const repoRoot = path.resolve(__dirname, '..', '..');
const uiPath = path.join(repoRoot, 'app', 'plugins', 'sidekick', 'ui.html');

describe('Sidekick status UI localization', () => {
  const source = fs.readFileSync(uiPath, 'utf8');
  const document = new JSDOM(source).window.document;

  test('loads the shared locale client and marks the public status panel navigation', () => {
    expect(source).toContain('/js/i18n-client.js');
    for (const key of [
      'title', 'subtitle', 'tab_status', 'tab_avatar', 'tab_settings', 'tab_memory',
      'tab_analytics', 'tab_events', 'connections', 'controls', 'chats_per_minute',
      'gifts', 'follows', 'active_viewers', 'avatar_connection', 'chat_settings',
      'memory_statistics', 'live_rates', 'event_log', 'deduper_status', 'save_settings'
    ]) {
      expect(document.querySelector(`[data-i18n="plugins.sidekick.ui.${key}"]`)).not.toBeNull();
    }
    expect(document.querySelector('[data-i18n-placeholder="plugins.sidekick.ui.message_placeholder"]')).not.toBeNull();
  });

  test.each(['de', 'en', 'es', 'fr'])('ships status labels in %s', (locale) => {
    const localePath = path.join(repoRoot, 'app', 'plugins', 'sidekick', 'locales', `${locale}.json`);
    const values = flattenTranslations(JSON.parse(fs.readFileSync(localePath, 'utf8')));
    for (const key of [
      'plugins.sidekick.ui.title', 'plugins.sidekick.ui.tab_status',
      'plugins.sidekick.ui.muted', 'plugins.sidekick.ui.connected',
      'plugins.sidekick.ui.disconnected', 'plugins.sidekick.ui.active_viewers',
      'plugins.sidekick.ui.avatar_connection', 'plugins.sidekick.ui.chat_settings',
      'plugins.sidekick.ui.memory_statistics', 'plugins.sidekick.ui.event_log',
      'plugins.sidekick.ui.no_results'
    ]) expect(values[key]).toEqual(expect.any(String));
  });

  test.each(['de', 'en', 'es', 'fr'])('covers every rendered and runtime label in %s', (locale) => {
    const localePath = path.join(repoRoot, 'app', 'plugins', 'sidekick', 'locales', `${locale}.json`);
    const values = flattenTranslations(JSON.parse(fs.readFileSync(localePath, 'utf8')));
    const germanPath = path.join(repoRoot, 'app', 'plugins', 'sidekick', 'locales', 'de.json');
    const germanValues = flattenTranslations(JSON.parse(fs.readFileSync(germanPath, 'utf8')));
    const markupKeys = [...source.matchAll(/data-i18n(?:-placeholder|-title|-aria-label)?="plugins\.sidekick\.ui\.([^"]+)"/g)]
      .map(match => `plugins.sidekick.ui.${match[1]}`);
    const runtimeKeys = [...source.matchAll(/sidekickText\('([^']+)'/g)]
      .map(match => `plugins.sidekick.ui.${match[1]}`);
    const sharedWords = new Set([
      'tab_status', 'ok', 'emotion', 'animaze_engine', 'event_chat', 'event_follow',
      'event_share', 'event_like', 'host', 'port', 'vnyan_port', 'gift_rose', 'likes_label'
    ].map(key => `plugins.sidekick.ui.${key}`));

    for (const key of new Set([...markupKeys, ...runtimeKeys])) {
      if (typeof values[key] !== 'string') throw new Error(`Missing ${locale} translation: ${key}`);
      if (locale !== 'de' && !sharedWords.has(key)) {
        expect(values[key]).not.toBe(germanValues[key]);
      }
    }
  });

  test.each(['de', 'en', 'es', 'fr'])('registers Sidekick translations in the app catalog for %s', (locale) => {
    const translated = i18n.t('plugins.sidekick.ui.active_viewers', {}, locale);
    expect(translated).not.toBe('plugins.sidekick.ui.active_viewers');
    expect(translated.length).toBeGreaterThan(0);
  });

  test('reloads API-backed empty states after the selected locale is ready', () => {
    const readyStart = source.indexOf('window.i18n?.ready?.then(() => {');
    const readyEnd = source.indexOf('\n    });', readyStart);
    expect(readyStart).toBeGreaterThanOrEqual(0);
    expect(readyEnd).toBeGreaterThan(readyStart);

    const readyBlock = source.slice(readyStart, readyEnd);
    for (const loader of [
      'fetchStatus()', 'fetchConfig()', 'fetchAvatarRules()', 'fetchMemoryStats()',
      'fetchTopUsers()', 'fetchEvents()', 'fetchMetrics()'
    ]) expect(readyBlock).toContain(loader);
  });
});
