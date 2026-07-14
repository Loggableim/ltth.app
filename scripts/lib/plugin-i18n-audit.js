'use strict';

const fs = require('fs');
const path = require('path');

const INVARIANT_UI_TEXT = new Set([
  '-- FPS',
  'Emoji Rain',
  'Glow Burst',
  'OBS HUD',
  'Overlay',
  'Pastel',
  'Premium Stage',
  'PupCid Standard',
  'Rainbow Live',
  'Retro Pixel',
  'PNG, JPG, GIF, WebP, SVG'
]);

const LOCALES = ['de', 'en', 'es', 'fr'];
const MALFORMED_UTF8 = /\uFFFD|Ã.|Â.|â(?:€|€™|€˜|€œ|€)/;

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function flattenTranslations(value, prefix = '', flat = {}) {
  Object.entries(value || {}).forEach(([key, child]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (isObject(child)) {
      flattenTranslations(child, fullKey, flat);
      return;
    }
    flat[fullKey] = child;
  });
  return flat;
}

function readLocale(localePath) {
  return JSON.parse(fs.readFileSync(localePath, 'utf8').replace(/^\uFEFF/, ''));
}

function isUserFacingText(value) {
  return typeof value === 'string' && /[A-Za-zÀ-ÿ]/.test(value);
}

function isInvariantUiText(value) {
  return INVARIANT_UI_TEXT.has(value)
    || /^(?:720p|1080p|1440p|4K)(?: Portrait)? \(\d+x\d+\)$/.test(value);
}

function auditPluginLocales(pluginsRoot) {
  const errors = [];
  const claims = new Map();

  if (!fs.existsSync(pluginsRoot)) {
    return { errors: [`Plugin directory does not exist: ${pluginsRoot}`], plugins: [] };
  }

  const plugins = fs.readdirSync(pluginsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  plugins.forEach((pluginId) => {
    const localesDir = path.join(pluginsRoot, pluginId, 'locales');
    if (!fs.existsSync(localesDir)) return;

    const valuesByLocale = {};
    LOCALES.forEach((locale) => {
      const localePath = path.join(localesDir, `${locale}.json`);
      if (!fs.existsSync(localePath)) {
        errors.push(`${pluginId}: missing ${locale}.json`);
        valuesByLocale[locale] = {};
        return;
      }

      try {
        valuesByLocale[locale] = flattenTranslations(readLocale(localePath));
      } catch (error) {
        errors.push(`${pluginId}/${locale}: invalid JSON (${error.message})`);
        valuesByLocale[locale] = {};
      }
    });

    const keySet = new Set(LOCALES.flatMap((locale) => Object.keys(valuesByLocale[locale])));
    const namespace = `plugins.${pluginId}.`;

    [...keySet].sort().forEach((key) => {
      const presentLocales = LOCALES.filter((locale) => Object.hasOwn(valuesByLocale[locale], key));
      LOCALES.filter((locale) => !presentLocales.includes(locale)).forEach((locale) => {
        errors.push(`${pluginId}/${locale}: missing key ${key}`);
      });

      if (key.startsWith('generated.')) {
        presentLocales.forEach((locale) => {
          errors.push(`${pluginId}/${locale}: forbidden generated key ${key}`);
        });
      } else if (!key.startsWith(namespace)) {
        presentLocales.forEach((locale) => {
          errors.push(`${pluginId}/${locale}: key must be namespaced under ${namespace} (${key})`);
        });
      }

      presentLocales.forEach((locale) => {
        const value = valuesByLocale[locale][key];
        if (typeof value === 'string' && MALFORMED_UTF8.test(value)) {
          errors.push(`${pluginId}/${locale}: malformed UTF-8 text at ${key}`);
        }

        if (!claims.has(locale)) claims.set(locale, new Map());
        const localeClaims = claims.get(locale);
        const prior = localeClaims.get(key);
        if (prior && prior.pluginId !== pluginId && prior.value !== value) {
          errors.push(`${locale}: translation key collision ${key} between ${prior.pluginId} and ${pluginId}`);
        } else if (!prior) {
          localeClaims.set(key, { pluginId, value });
        }
      });

      if (presentLocales.length === LOCALES.length) {
        const values = LOCALES.map((locale) => valuesByLocale[locale][key]);
        if (values.every((value) => value === values[0]) && isUserFacingText(values[0]) && !isInvariantUiText(values[0])) {
          errors.push(`${pluginId}: nonlocalized UI copy at ${key}`);
        }
      }
    });
  });

  return { errors: [...new Set(errors)].sort(), plugins };
}

module.exports = { LOCALES, flattenTranslations, auditPluginLocales };
