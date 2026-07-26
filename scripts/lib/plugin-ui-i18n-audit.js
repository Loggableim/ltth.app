'use strict';

const fs = require('fs');
const path = require('path');
const acorn = require(path.join(__dirname, '..', '..', 'app', 'node_modules', 'acorn'));
const {
  LOCALES,
  flattenTranslations,
  isInvariantUiText
} = require('./plugin-i18n-audit');

const MALFORMED_UTF8 = /\uFFFD|\u00C3(?:[\u0080-\u00BF]|\u0192)|\u00C2[\u0080-\u00BF]|\u00E2[\u0080-\u00BF]{1,2}/;
const USER_FACING_TAGS = new Set(['a', 'button', 'h1', 'h2', 'h3', 'h4', 'label', 'legend', 'li', 'option', 'p', 'span', 'summary', 'th']);
const USER_FACING_ATTRIBUTES = ['aria-label', 'placeholder', 'title'];
const TRANSLATION_KEY_ATTRIBUTES = ['data-i18n', 'data-i18n-key', 'data-i18n-placeholder', 'data-i18n-title', 'data-i18n-aria-label'];
const RAW_TEXT_SINKS = new Set(['textContent', 'innerText', 'innerHTML', 'placeholder', 'title', 'ariaLabel']);
const MESSAGE_CALLS = new Set(['alert', 'confirm', 'prompt', 'notify', 'toast', 'showToast']);
const TRANSLATION_HELPERS = new Set(['t', 'translate', 'translateRuntime']);

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

function getTranslationKeys(source, pluginId) {
  const keys = [];
  for (const attribute of TRANSLATION_KEY_ATTRIBUTES) {
    const dataI18n = new RegExp(`\\b${attribute}\\s*=\\s*(["'])(.*?)\\1`, 'gi');
    let match;
    while ((match = dataI18n.exec(source))) keys.push(match[2].trim());
  }

  let match;
  const translateCall = /\b(?:(?:(?:[A-Za-z_$][\w$]*\.)+)?(?:t|translate|translateRuntime))\(\s*(["'`])([^"'`]+)\1/g;
  while ((match = translateCall.exec(source))) keys.push(match[2].trim());
  const clarityRuntimeCall = /\bClarityHUDI18n\.text\(\s*(["'`])([^"'`]+)\1/g;
  while ((match = clarityRuntimeCall.exec(source))) {
    keys.push(`plugins.${pluginId}.runtime.${match[2].trim()}`);
  }
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
  const expression = /\$\{\s*([^}]+?)\s*\}|\{\{\s*([^}]+?)\s*\}\}|\{([A-Za-z_][\w.-]*)\}/g;
  let match;
  while ((match = expression.exec(String(value)))) tokens.push((match[1] || match[2] || match[3]).trim());
  return tokens.sort();
}

function parseJavaScript(source) {
  const input = String(source).replace(/^\uFEFF/, '');
  try {
    return acorn.parse(input, { ecmaVersion: 'latest', sourceType: 'module', allowAwaitOutsideFunction: true });
  } catch (moduleError) {
    try {
      return acorn.parse(input, { ecmaVersion: 'latest', sourceType: 'script', allowAwaitOutsideFunction: true });
    } catch (scriptError) {
      return null;
    }
  }
}

function walkAst(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  Object.entries(node).forEach(([key, value]) => {
    if (key === 'start' || key === 'end' || key === 'loc') return;
    if (Array.isArray(value)) value.forEach((child) => walkAst(child, visit));
    else if (value && typeof value.type === 'string') walkAst(value, visit);
  });
}

function memberName(node) {
  if (!node || node.type !== 'MemberExpression') return null;
  if (!node.computed && node.property.type === 'Identifier') return node.property.name;
  if (node.computed && node.property.type === 'Literal' && typeof node.property.value === 'string') return node.property.value;
  return null;
}

function callName(node) {
  if (!node || node.type !== 'CallExpression') return null;
  if (node.callee.type === 'Identifier') return node.callee.name;
  return memberName(node.callee);
}

function staticTextTemplates(expression) {
  if (!expression) return ['__LTTH_DYNAMIC__'];
  if (expression.type === 'Literal' && typeof expression.value === 'string') return [expression.value];
  if (expression.type === 'TemplateLiteral') {
    return [expression.quasis.map((quasi) => quasi.value.cooked || quasi.value.raw || '').join('__LTTH_DYNAMIC__')];
  }
  if (expression.type === 'BinaryExpression' && expression.operator === '+') {
    const left = staticTextTemplates(expression.left);
    const right = staticTextTemplates(expression.right);
    return left.flatMap((leftValue) => right.map((rightValue) => `${leftValue}${rightValue}`)).slice(0, 32);
  }
  if (expression.type === 'ConditionalExpression') {
    return [...staticTextTemplates(expression.consequent), ...staticTextTemplates(expression.alternate)].slice(0, 32);
  }
  if (expression.type === 'LogicalExpression') {
    return [...staticTextTemplates(expression.left), ...staticTextTemplates(expression.right)].slice(0, 32);
  }
  return ['__LTTH_DYNAMIC__'];
}

function visibleText(value) {
  return String(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/__LTTH_DYNAMIC__/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isStylesheetText(value) {
  return /\{[^}]*\b(?:align-items|animation|background|border|color|content|display|font(?:-[\w-]+)?|height|left|margin|opacity|padding|position|right|text-shadow|top|transform|transition|width|z-index)\s*:/i.test(value);
}

function rawTextErrors(pluginId, file, source) {
  const ast = parseJavaScript(source);
  if (!ast) return [];
  const errors = new Set();
  const report = (sink, expression) => {
    staticTextTemplates(expression).forEach((template) => {
      const text = visibleText(template);
      if (text && !isStylesheetText(text) && isUserFacingText(text) && !isInvariantUiText(text)) {
        errors.add(`${pluginId}/${file}: raw user-facing text at ${sink} "${text}"`);
      }
    });
  };

  walkAst(ast, (node) => {
    if (node.type === 'AssignmentExpression') {
      const sink = memberName(node.left);
      if (RAW_TEXT_SINKS.has(sink)) report(sink, node.right);
      return;
    }
    if (node.type !== 'CallExpression') return;
    const name = callName(node);
    if (name === 'setAttribute' && node.arguments.length >= 2) {
      const attribute = staticTextTemplates(node.arguments[0]).join('');
      if (['aria-label', 'placeholder', 'title'].includes(attribute)) report(attribute, node.arguments[1]);
      return;
    }
    if (MESSAGE_CALLS.has(name) && node.arguments.length) report(name, node.arguments[0]);
  });
  return [...errors].sort();
}

function inlineScripts(source) {
  const scripts = [];
  const expression = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = expression.exec(source))) scripts.push(match[1]);
  return scripts;
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

function loadAppCommonLocales(repoRoot, errors) {
  const valuesByLocale = {};
  for (const locale of LOCALES) {
    const localePath = path.join(repoRoot, 'app', 'locales', `${locale}.json`);
    if (!fs.existsSync(localePath)) {
      valuesByLocale[locale] = {};
      continue;
    }
    try {
      const translations = flattenTranslations(readJson(localePath));
      valuesByLocale[locale] = Object.fromEntries(
        Object.entries(translations).filter(([key]) => key.startsWith('common.'))
      );
    } catch (error) {
      errors.push(`app/${locale}: invalid JSON (${error.message})`);
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
  const appCommonByLocale = loadAppCommonLocales(repoRoot, errors);

  for (const plugin of catalog.plugins) {
    const pluginId = plugin.id;
    const pluginRoot = path.dirname(plugin.manifestPath);
    const htmlFiles = walkFiles(pluginRoot, (filePath) => filePath.endsWith('.html'));
    const sourceFiles = walkFiles(pluginRoot, (filePath) => {
      const relative = path.relative(pluginRoot, filePath).replace(/\\/g, '/');
      if (relative.split('/').some((segment) => ['test', 'tests', 'node_modules', 'vendor'].includes(segment))) return false;
      if (filePath.endsWith('.html')) return true;
      return filePath.endsWith('.js');
    });
    const pluginValuesByLocale = loadPluginLocales(pluginRoot, pluginId, errors);
    const valuesByLocale = Object.fromEntries(LOCALES.map((locale) => [
      locale,
      { ...appCommonByLocale[locale], ...pluginValuesByLocale[locale] }
    ]));
    const controls = htmlFiles.flatMap((uiPath) => collectHtmlControls(pluginId, uiPath));
    controlsByPlugin[pluginId] = controls;
    controls.forEach((control) => {
      errors.push(`${pluginId}/${control.file}: missing data-i18n key for ${control.subject}`);
    });

    const keyOrigins = new Map();
    for (const sourcePath of sourceFiles) {
      const file = path.relative(pluginRoot, sourcePath).replace(/\\/g, '/');
      const source = fs.readFileSync(sourcePath, 'utf8');
      const keys = getTranslationKeys(source, pluginId);
      keys.forEach((key) => {
        if (!keyOrigins.has(key)) keyOrigins.set(key, file);
      });
      if (sourcePath.endsWith('.js')) errors.push(...rawTextErrors(pluginId, file, source));
      else inlineScripts(source).forEach((script) => errors.push(...rawTextErrors(pluginId, file, script)));
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
