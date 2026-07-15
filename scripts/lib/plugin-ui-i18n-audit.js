'use strict';

const fs = require('fs');
const path = require('path');
const {
  LOCALES,
  flattenTranslations,
  isInvariantUiText
} = require('./plugin-i18n-audit');

const MALFORMED_UTF8 = /\uFFFD|\u00C3(?:[\u0080-\u00BF]|\u0192)|\u00C2[\u0080-\u00BF]|\u00E2[\u0080-\u00BF]{1,2}/;
const USER_FACING_TAGS = new Set(['a', 'button', 'h1', 'h2', 'h3', 'h4', 'label', 'legend', 'li', 'option', 'p', 'span', 'summary', 'th']);
const USER_FACING_ATTRIBUTES = ['aria-label', 'placeholder', 'title'];
const TRANSLATION_KEY_ATTRIBUTES = ['data-i18n', 'data-i18n-key', 'data-i18n-placeholder', 'data-i18n-title', 'data-i18n-aria-label'];

function walkFiles(root, predicate) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) return walkFiles(fullPath, predicate);
    return predicate(fullPath) ? [fullPath] : [];
  });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function getAttribute(attributes, name) {
  const expression = new RegExp(`\\s${name}\\s*=\\s*([\"'])(.*?)\\1`, 'i');
  const match = attributes.match(expression);
  return match ? match[2].trim() : null;
}

function getTranslationKeys(source) {
  const keys = [];
  for (const attribute of TRANSLATION_KEY_ATTRIBUTES) {
    const dataI18n = new RegExp(`\\b${attribute}\\s*=\\s*(["'])(.*?)\\1`, 'gi');
    let match;
    while ((match = dataI18n.exec(source))) keys.push(match[2].trim());
  }

  let match;
  const translateCall = /\b(?:api|i18n)\.t\(\s*(["'`])([^"'`]+)\1/g;
  while ((match = translateCall.exec(source))) keys.push(match[2].trim());
  return [...new Set(keys.filter((key) => key && !key.includes('${')))];
}

function getI18nKey(attributes) {
  for (const attribute of TRANSLATION_KEY_ATTRIBUTES) {
    const key = getAttribute(attributes, attribute);
    if (key) return key;
  }
  return null;
}

function getInterpolationTokens(value) {
  const tokens = [];
  const expression = /\$\{([^}]+)\}/g;
  let match;
  while ((match = expression.exec(String(value)))) tokens.push(match[1].trim());
  return tokens.sort();
}

function isUserFacingText(value) {
  return /[\p{L}\p{N}]/u.test(value);
}

function collectHtmlControls(pluginId, uiPath) {
  const source = fs.readFileSync(uiPath, 'utf8');
  const relativePath = path.relative(path.dirname(path.dirname(uiPath)), uiPath).replace(/\\/g, '/');
  const controls = [];
  const elementPattern = /<([a-z][\w-]*)([^>]*)>([^<]*)<\/\1>/gi;
  let match;
  while ((match = elementPattern.exec(source))) {
    const [, tag, attributes, rawText] = match;
    const text = rawText.replace(/&nbsp;/gi, ' ').trim();
    if (text.includes('${')) continue;
    if (!USER_FACING_TAGS.has(tag.toLowerCase()) || !isUserFacingText(text) || isInvariantUiText(text)) continue;
    if (!getI18nKey(attributes)) {
      controls.push({ type: 'missing-key', file: relativePath, subject: `${tag.toLowerCase()} text \"${text}\"` });
    }
  }

  const tagPattern = /<([a-z][\w-]*)([^>]*)>/gi;
  while ((match = tagPattern.exec(source))) {
    const [, tag, attributes] = match;
    if (!USER_FACING_TAGS.has(tag.toLowerCase())) continue;
    const hasKey = Boolean(getI18nKey(attributes));
    for (const attribute of USER_FACING_ATTRIBUTES) {
      const value = getAttribute(attributes, attribute);
      if (value && value.includes('${')) continue;
      if (value && isUserFacingText(value) && !isInvariantUiText(value) && !hasKey && !getAttribute(attributes, `data-i18n-${attribute}`)) {
        controls.push({ type: 'missing-key', file: relativePath, subject: `${attribute} \"${value}\"` });
      }
    }
  }
  return controls;
}

function loadPluginLocales(pluginRoot, pluginId, errors) {
  const valuesByLocale = {};
  for (const locale of LOCALES) {
    const localePath = path.join(pluginRoot, 'locales', `${locale}.json`);
    if (!fs.existsSync(localePath)) {
      errors.push(`${pluginId}/${locale}: missing ${locale}.json`);
      valuesByLocale[locale] = {};
      continue;
    }
    try {
      valuesByLocale[locale] = flattenTranslations(readJson(localePath));
    } catch (error) {
      errors.push(`${pluginId}/${locale}: invalid JSON (${error.message})`);
      valuesByLocale[locale] = {};
    }
  }
  return valuesByLocale;
}

function assertKey(pluginId, key, file, valuesByLocale, errors, claims) {
  if (!key.startsWith('common.') && (key.startsWith('generated.') || !key.startsWith(`plugins.${pluginId}.`))) {
    errors.push(`${pluginId}/${file}: invalid UI key ${key}`);
  }

  const tokenSets = [];
  for (const locale of LOCALES) {
    const value = valuesByLocale[locale][key];
    if (value === undefined) {
      errors.push(`${pluginId}/${locale}: missing locale leaf ${key} used by ${file}`);
      continue;
    }
    if (typeof value !== 'string') {
      errors.push(`${pluginId}/${locale}: non-string locale leaf ${key} used by ${file}`);
      continue;
    }
    if (MALFORMED_UTF8.test(value)) errors.push(`${pluginId}/${locale}: malformed UTF-8 text at ${key}`);
    tokenSets.push(JSON.stringify(getInterpolationTokens(value)));

    if (!claims.has(locale)) claims.set(locale, new Map());
    const localeClaims = claims.get(locale);
    const prior = localeClaims.get(key);
    const origin = `${pluginId}/${file}`;
    if (prior && prior.origin !== origin && prior.value !== value) {
      errors.push(`${locale}: UI translation collision ${key} between ${prior.origin} and ${origin}`);
    } else if (!prior) {
      localeClaims.set(key, { origin, value });
    }
  }
  if (tokenSets.length > 1 && !tokenSets.every((tokens) => tokens === tokenSets[0])) {
    errors.push(`${pluginId}: parameter mismatch at ${key}`);
  }
}

function auditPluginUi({ repoRoot, catalog }) {
  const errors = [];
  const claims = new Map();
  const controlsByPlugin = {};
  const keysByPlugin = {};

  for (const plugin of catalog.plugins) {
    const pluginId = plugin.id;
    const pluginRoot = path.dirname(plugin.manifestPath);
    const htmlFiles = walkFiles(pluginRoot, (filePath) => filePath.endsWith('.html'));
    const sourceFiles = walkFiles(pluginRoot, (filePath) => {
      const relative = path.relative(pluginRoot, filePath).replace(/\\/g, '/');
      if (relative.split('/').includes('test')) return false;
      if (filePath.endsWith('.html')) return true;
      return filePath.endsWith('.js') && /(?:^|\/)(?:ui|overlay|public|frontend|client)(?:\/|$)|(?:^|\/)(?:ui|overlay|client)\.js$/i.test(relative);
    });
    const valuesByLocale = loadPluginLocales(pluginRoot, pluginId, errors);
    const controls = htmlFiles.flatMap((uiPath) => collectHtmlControls(pluginId, uiPath));
    controlsByPlugin[pluginId] = controls;
    controls.forEach((control) => {
      errors.push(`${pluginId}/${control.file}: missing data-i18n key for ${control.subject}`);
    });

    const keyOrigins = new Map();
    for (const sourcePath of sourceFiles) {
      const file = path.relative(pluginRoot, sourcePath).replace(/\\/g, '/');
      const keys = getTranslationKeys(fs.readFileSync(sourcePath, 'utf8'));
      keys.forEach((key) => {
        if (!keyOrigins.has(key)) keyOrigins.set(key, file);
      });
    }
    keysByPlugin[pluginId] = [...keyOrigins.keys()].sort();
    for (const [key, file] of keyOrigins) assertKey(pluginId, key, file, valuesByLocale, errors, claims);
  }

  return {
    errors: [...new Set(errors)].sort(),
    controlsByPlugin,
    keysByPlugin
  };
}

module.exports = { auditPluginUi, getInterpolationTokens };
