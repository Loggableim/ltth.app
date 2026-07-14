'use strict';

const { LOCALES, flattenTranslations, isInvariantUiText } = require('./plugin-i18n-audit');

const INTERPOLATION_TOKEN = /\{\{[^{}]+\}\}|\{[^{}]+\}|%\d*\$?[sdif]|\$\{[^{}]+\}/g;

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function getValue(object, key) {
  return key.split('.').reduce((value, segment) => (value == null ? undefined : value[segment]), object);
}

function isUserFacingText(value) {
  return typeof value === 'string' && /[A-Za-zÀ-ÿ]/.test(value);
}

function isInvariantValue(value) {
  return isInvariantUiText(value);
}

function collectSharedUserFacingEntries(locales) {
  const flattened = Object.fromEntries(LOCALES.map((locale) => [locale, flattenTranslations(locales[locale])]))
  const keys = new Set(LOCALES.flatMap((locale) => Object.keys(flattened[locale])));
  return [...keys].sort().flatMap((key) => {
    const values = LOCALES.map((locale) => flattened[locale][key]);
    if (values.some((value) => value === undefined) || !values.every((value) => value === values[0])) return [];
    const value = values[0];
    return isUserFacingText(value) && !isInvariantValue(value) ? [{ key, value }] : [];
  });
}

function applyLocaleValue(locale, key, value) {
  const parts = key.split('.');
  let target = locale;
  parts.slice(0, -1).forEach((part) => {
    if (!isObject(target[part])) target[part] = {};
    target = target[part];
  });
  target[parts.at(-1)] = value;
  return locale;
}

function protectTokens(value) {
  const tokens = [];
  const text = value.replace(INTERPOLATION_TOKEN, (token) => {
    const marker = `__LTTH_TOKEN_${tokens.length}__`;
    tokens.push({ marker, token });
    return marker;
  });
  return { text, tokens };
}

function restoreTokens(value, tokens) {
  return tokens.reduce((result, { marker, token }) => result.replaceAll(marker, token), value);
}

function parseTranslationResponse(response) {
  if (!Array.isArray(response) || !Array.isArray(response[0])) {
    throw new Error('Translation service returned an unexpected response shape.');
  }
  return response[0].map((part) => part[0]).join('');
}

function splitBatchTranslation(response, separators) {
  let remaining = parseTranslationResponse(response);
  const values = [];
  separators.forEach((separator) => {
    const index = remaining.indexOf(separator);
    if (index < 0 || remaining.indexOf(separator, index + separator.length) >= 0) {
      throw new Error('Translation response did not preserve the expected batch separators.');
    }
    values.push(remaining.slice(0, index));
    remaining = remaining.slice(index + separator.length);
  });
  return [...values, remaining].map((value) => value.trim());
}

module.exports = {
  LOCALES,
  applyLocaleValue,
  collectSharedUserFacingEntries,
  getValue,
  parseTranslationResponse,
  protectTokens,
  restoreTokens,
  splitBatchTranslation
};
