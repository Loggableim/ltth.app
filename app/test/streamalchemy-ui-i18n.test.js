const fs = require('fs');
const path = require('path');

const {
  TEMPLATE_CATALOG,
  resolveStageSkill
} = require('../plugins/streamalchemy/backend/streammonsters/catalog');
const {
  flattenTranslations
} = require('../../scripts/lib/plugin-i18n-audit');

const LOCALES = ['de', 'en', 'es', 'fr'];
const MONSTERS_PREFIX = 'plugins.streamalchemy.ui.monsters.';
const localeRoot = path.join(
  __dirname,
  '..',
  'plugins',
  'streamalchemy',
  'locales'
);

function readLocale(locale) {
  return flattenTranslations(JSON.parse(
    fs.readFileSync(path.join(localeRoot, `${locale}.json`), 'utf8')
      .replace(/^\uFEFF/, '')
  ));
}

function placeholders(value) {
  return [...String(value || '').matchAll(
    /{{[A-Za-z_][\w.-]*}}|{[A-Za-z_][\w.-]*}/g
  )]
    .map(match => match[0])
    .sort();
}

describe('Stream Monsters 1.11 Rules v8 locale contract', () => {
  const translations = Object.fromEntries(
    LOCALES.map(locale => [locale, readLocale(locale)])
  );

  test('resolves every staged skill name and effect in all four languages', () => {
    const requiredKeys = new Set();
    for (const template of TEMPLATE_CATALOG) {
      for (const stage of [1, 2, 3]) {
        for (const choice of ['A', 'B', 'C']) {
          const skill = resolveStageSkill(template.templateId, choice, stage, 8);
          requiredKeys.add(skill.nameKey);
          requiredKeys.add(skill.shortTextKey);
        }
      }
    }

    for (const key of requiredKeys) {
      const fullKey = `${MONSTERS_PREFIX}${key}`;
      for (const locale of LOCALES) {
        expect(translations[locale][fullKey]).toEqual(expect.any(String));
        expect(translations[locale][fullKey].trim()).not.toBe('');
      }
      for (const locale of ['de', 'es', 'fr']) {
        expect(translations[locale][fullKey])
          .not.toBe(translations.en[fullKey]);
      }
    }
  });

  test('fully localizes passive charge, Elemental Hour and evolution presentation copy', () => {
    const keys = [
      'specialReady',
      'specialReadyIn',
      'specialPassiveChargeHint',
      'elementalHourExplanation',
      'evolutionStageTitle',
      'evolutionStatsTitle',
      'evolutionStatDelta',
      'evolutionSkillUnlocked',
      'evolutionSkillEffect',
      'arenaCollapseBanner',
      'overlayBattleKicker'
    ];

    for (const key of keys) {
      const fullKey = `${MONSTERS_PREFIX}${key}`;
      for (const locale of LOCALES) {
        expect(translations[locale][fullKey]).toEqual(expect.any(String));
        expect(translations[locale][fullKey].trim()).not.toBe('');
        expect(placeholders(translations[locale][fullKey]))
          .toEqual(placeholders(translations.en[fullKey]));
      }
      for (const locale of ['de', 'es', 'fr']) {
        expect(translations[locale][fullKey])
          .not.toBe(translations.en[fullKey]);
      }
    }
  });

  test('identifies the live interactive arena as Rules v8 in every language', () => {
    const fullKey = `${MONSTERS_PREFIX}rulesDynamic`;
    for (const locale of LOCALES) {
      expect(translations[locale][fullKey]).toContain('Rules v8');
      expect(placeholders(translations[locale][fullKey]))
        .toEqual(['{duration}', '{prefix}']);
    }
  });
});
