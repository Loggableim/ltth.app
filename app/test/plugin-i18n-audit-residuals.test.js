'use strict';

const fs = require('fs');
const path = require('path');
const { isInvariantUiText } = require('../../scripts/lib/plugin-i18n-audit');

const repoRoot = path.resolve(__dirname, '..', '..');
const locales = ['de', 'en', 'es', 'fr'];

function getTranslation(pluginId, locale, key) {
  const translation = JSON.parse(fs.readFileSync(
    path.join(repoRoot, 'app', 'plugins', pluginId, 'locales', `${locale}.json`),
    'utf8'
  ));
  return key.split('.').reduce((value, segment) => value && value[segment], translation);
}

describe('plugin i18n audit residuals', () => {
  test('keeps AnimazingPal action and section labels independently localized', () => {
    const keys = [
      'plugins.animazingpal.runtime.action.emote',
      'plugins.animazingpal.runtime.action.pose',
      'plugins.animazingpal.runtime.section.animaze.emotes'
    ];

    keys.forEach((key) => {
      const values = locales.map((locale) => getTranslation('animazingpal', locale, key));
      expect(values.every((value) => typeof value === 'string' && value.trim())).toBe(true);
      expect(new Set(values).size).toBe(locales.length);
    });
  });

  test('treats the universal ms unit symbol as a narrow technical invariant', () => {
    const values = locales.map((locale) => getTranslation(
      'gcce',
      locale,
      'plugins.gcce.runtime.units.milliseconds_short'
    ));

    expect(values).toEqual(['ms', 'ms', 'ms', 'ms']);
    expect(isInvariantUiText('ms')).toBe(true);
    expect(isInvariantUiText('Save settings')).toBe(false);
  });
});
