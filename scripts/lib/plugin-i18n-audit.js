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
  'PNG, JPG, GIF, WebP, SVG',
  'LTTH Music Bot',
  'Auto-DJ',
  'Cyberpunk',
  'Minimal',
  'Hype',
  'Post-FX',
  'Ultra',
  'ElevenLabs',
  'Speechify',
  'Inter',
  'Montserrat',
  'Oswald',
  'Poppins',
  'Raleway',
  'Roboto',
  'Rose, GG',
  'G',
  'Normal',
  'Emojis',
  'FPS',
  'Chat',
  'Cid',
  'English',
  'Deutsch',
  'Arial',
  'Georgia',
  'SiliconFlow',
  'Furry',
  'MrBeast',
  'mycommand',
  'StreamAlchemy',
  'Solo',
  'weather',
  'weatherlist',
  'weatherstop'
]);

// Unit symbols are language-independent. Keep this intentionally narrow:
// longer unit labels such as "milliseconds" must still be translated
// independently by every locale.
const UNIVERSAL_TECHNICAL_UNIT_SYMBOLS = new Set(['ms', 'px']);

const LOCALES = ['de', 'en', 'es', 'fr'];
// Mojibake leaves UTF-8 continuation-byte code points after a Latin-1 lead
// character (for example "GrÃ¶ÃŸe"). Do not flag legitimate words such as
// the French "Âge", whose second character is an ordinary ASCII letter.
const MALFORMED_UTF8 = /\uFFFD|\u00C3[\u0080-\u00BF]|\u00C2[\u0080-\u00BF]|\u00E2[\u0080-\u00BF]{1,2}/;

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
  const normalized = value.replace(/^[^\p{L}\p{N}]+/u, '').replace(/[：:]$/u, '').trim();
  return INVARIANT_UI_TEXT.has(value)
    || INVARIANT_UI_TEXT.has(normalized)
    || UNIVERSAL_TECHNICAL_UNIT_SYMBOLS.has(normalized)
    || value === '×'
    || value === '&times;'
    || value === '&#9654;'
    || value === 'ℹ️'
    || /^v?\d+(?:\.\d+){1,3}(?:[-+][\w.-]+)?$/i.test(normalized)
    || /^\d+(?:p|k|x|\/s)$/i.test(normalized)
    || /^[-+]?\d+(?:[.,]\d+)?(?:\s*(?:%|x|×|\/|→|-|–)\s*[-+]?\d+(?:[.,]\d+)?)*$/.test(normalized)
    || /^[A-Za-z]$/.test(normalized)
    || /^(?:\[|\{)[\s\S]*(?:\]|\})$/.test(value)
    || /^(?:720p|1080p|1440p|4K)(?: Portrait)? \(\d+x\d+\)$/.test(normalized)
    || /^(?:\d{3,4}x\d{3,4}(?:\s*\(\dK\)|\s*->\s*\d{3,4}x\d{3,4})?|\d{3,4}p \(\d+x\d+\)|\d+ XP x\d+|!?[A-Za-z](?:, !?[A-Za-z]){1,5}|sk-\.\.\.|Times New Roman|OpenAI(?: \([^)]+\)| TTS \(Premium\))?|Speechify TTS \(Premium\)|Webhook|Audio)$/.test(normalized)
    || /^(?:[A-Z][A-Z0-9+._-]{1,}|\d+(?:\.\d+)?\s?(?:ms|s|fps|px|%|MB|GB|KB)|https?:\/\/\S+|\/\S+|[\w.-]+:\/\/\S+|[\w.-]+\.\w{2,})(?:\s*[|/,]\s*(?:[A-Z][A-Z0-9+._-]{1,}|\d+(?:\.\d+)?\s?(?:ms|s|fps|px|%|MB|GB|KB)))?$/.test(value)
    || /^[\w.-]+\.\w{2,}(?:\/\S*)?$/.test(normalized)
    || /^keyword\d+(?:\s+keyword\d+)*$/i.test(normalized)
}

function isCopiedEnglishUiText(targetValue, englishValue) {
  return typeof targetValue === 'string'
    && targetValue === englishValue
    && isUserFacingText(englishValue)
    && !isInvariantUiText(englishValue);
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

        const englishValue = valuesByLocale.en[key];
        ['de', 'es', 'fr'].forEach((locale) => {
          if (isCopiedEnglishUiText(valuesByLocale[locale][key], englishValue)) {
            errors.push(`${pluginId}/${locale}: English UI copy at ${key}`);
          }
        });
      }
    });
  });

  return { errors: [...new Set(errors)].sort(), plugins };
}

module.exports = { LOCALES, flattenTranslations, isInvariantUiText, isCopiedEnglishUiText, auditPluginLocales };
