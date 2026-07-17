'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const { auditPluginUi } = require('../../scripts/lib/plugin-ui-i18n-audit');
const { loadPublishedPluginCatalog } = require('../../scripts/lib/published-plugin-catalog');
const { auditPluginLocales, flattenTranslations } = require('../../scripts/lib/plugin-i18n-audit');

const repoRoot = path.resolve(__dirname, '..', '..');
const pluginId = 'soundboard';

describe('Soundboard UI i18n', () => {
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

  test('keeps Soundboard locale copy independently translated in every supported language', () => {
    const errors = auditPluginLocales(path.join(repoRoot, 'app', 'plugins')).errors
      .filter((error) => error.startsWith(`${pluginId}/`) || error.startsWith(`${pluginId}:`));

    expect(errors).toEqual([]);
  });

  test('marks the remaining static Soundboard controls and input hints for translation', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', pluginId, 'ui', 'index.html'), 'utf8');
    const document = new JSDOM(source).window.document;
    const localizedAttributes = [
      ['#soundboard-like-threshold', 'data-i18n-placeholder'],
      ['#myinstants-search-input', 'data-i18n-placeholder'],
      ['#gif-search-input', 'data-i18n-placeholder'],
      ['#new-gift-id', 'data-i18n-placeholder'],
      ['#new-gift-label', 'data-i18n-placeholder'],
      ['#new-gift-url', 'data-i18n-placeholder'],
      ['#new-gift-volume', 'data-i18n-placeholder'],
      ['#advanced-search-input', 'data-i18n-placeholder'],
      ['#myinstants-search-btn', 'data-i18n'],
      ['#gif-search-btn', 'data-i18n'],
      ['#advanced-search-btn', 'data-i18n'],
      ['#trending-search-btn', 'data-i18n'],
      ['#export-animations-btn', 'data-i18n'],
      ['label[for="import-animations-file"]', 'data-i18n'],
      ['.category-btn[data-category="all"]', 'data-i18n']
    ];

    localizedAttributes.forEach(([selector, attribute]) => {
      const element = document.querySelector(selector);
      expect(element?.hasAttribute(attribute) || Boolean(element?.querySelector(`[${attribute}]`))).toBe(true);
    });
    [...document.querySelectorAll('option[value="gif"]')].forEach((option) => {
      expect(option.hasAttribute('data-i18n')).toBe(true);
    });
    [
      'strong[data-i18n="plugins.soundboard.ui.audioTarget.dashboard"]',
      'strong[data-i18n="plugins.soundboard.ui.audioTarget.both"]'
    ].forEach((selector) => {
      expect(document.querySelector(selector)).not.toBeNull();
    });
    [...document.querySelectorAll('.workspace-card strong')]
      .filter((label) => ['Preview', 'Use'].includes(label.textContent.trim()))
      .forEach((label) => expect(label.hasAttribute('data-i18n')).toBe(true));
  });

  test('keeps every guide-inventory input and icon action on a real translated attribute', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', pluginId, 'ui', 'index.html'), 'utf8');
    const document = new JSDOM(source).window.document;
    const selectors = [
      '#advanced-search-input', '#animation-overlay-url', '#close-gift-modal',
      '#config-import-export-textarea', '#gif-search-input', '#gift-catalog-search-input',
      '#gift-sounds-search-input', '#minimize-audio-test-btn', '#modal-gift-search-input',
      '#myinstants-search-input', '#new-gift-animation-url', '#new-gift-animation-volume',
      '#new-gift-id', '#new-gift-label', '#new-gift-url', '#new-gift-volume',
      '#open-overlay-url', '#soundboard-follow-animation-url', '#soundboard-follow-url',
      '#soundboard-gift-animation-url', '#soundboard-gift-url', '#soundboard-like-animation-url',
      '#soundboard-like-url', '#soundboard-share-animation-url', '#soundboard-share-url',
      '#soundboard-subscribe-animation-url', '#soundboard-subscribe-url'
    ];
    const attributes = ['data-i18n', 'data-i18n-key', 'data-i18n-placeholder', 'data-i18n-title', 'data-i18n-aria-label'];
    const keys = selectors.map((selector) => {
      const element = document.querySelector(selector);
      expect(element).not.toBeNull();
      const key = attributes.map((attribute) => element.getAttribute(attribute)).find(Boolean);
      expect(key).toMatch(/^plugins\.soundboard\./);
      return key;
    });

    for (const locale of ['de', 'en', 'es', 'fr']) {
      const values = flattenTranslations(JSON.parse(fs.readFileSync(path.join(repoRoot, 'app', 'plugins', pluginId, 'locales', `${locale}.json`), 'utf8')));
      for (const key of keys) expect(values[key]).toEqual(expect.any(String));
    }
  });

  test.each(['de', 'en', 'es', 'fr'])('provides semantic Soundboard controls in %s', (locale) => {
    const localePath = path.join(repoRoot, 'app', 'plugins', pluginId, 'locales', `${locale}.json`);
    const values = flattenTranslations(JSON.parse(fs.readFileSync(localePath, 'utf8')));

    for (const key of [
      'plugins.soundboard.ui.navigation.overview',
      'plugins.soundboard.ui.animation.fit',
      'plugins.soundboard.ui.events.testFollowSound',
      'plugins.soundboard.ui.actions.clear',
      'plugins.soundboard.ui.accessibility.closeGiftCatalogModal'
    ]) {
      expect(values[key]).toEqual(expect.any(String));
    }
  });
});
