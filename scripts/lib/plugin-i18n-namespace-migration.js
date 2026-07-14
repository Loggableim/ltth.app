'use strict';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function slugify(value) {
  const words = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);
  return words.join('_') || 'label';
}

function payloadForPlugin(locale, pluginId) {
  const copied = clone(locale || {});
  if (copied.plugins && copied.plugins[pluginId]) return copied.plugins[pluginId];
  return copied;
}

function migratePluginLocales(pluginId, locales) {
  const source = Object.fromEntries(Object.entries(locales).map(([locale, value]) => [
    locale,
    payloadForPlugin(value, pluginId)
  ]));
  const generated = source.en && source.en.generated ? source.en.generated : {};
  const usedLabels = new Set(Object.keys(source.en && source.en.labels ? source.en.labels : {}));
  const keyMap = {};

  Object.keys(generated).sort().forEach((legacyKey) => {
    const base = slugify(generated[legacyKey]);
    let label = base;
    if (usedLabels.has(label)) label = `${base}_${legacyKey.slice(0, 6)}`;
    usedLabels.add(label);
    keyMap[`generated.${legacyKey}`] = `labels.${label}`;
  });

  const migrated = {};
  Object.entries(source).forEach(([locale, payload]) => {
    const next = clone(payload);
    const generatedLabels = next.generated || {};
    delete next.generated;
    next.labels = { ...(next.labels || {}) };
    Object.entries(keyMap).forEach(([legacyKey, modernKey]) => {
      const legacyLeaf = legacyKey.slice('generated.'.length);
      const modernLeaf = modernKey.slice('labels.'.length);
      if (Object.hasOwn(generatedLabels, legacyLeaf)) {
        next.labels[modernLeaf] = generatedLabels[legacyLeaf];
      }
    });
    migrated[locale] = { plugins: { [pluginId]: next } };
  });

  return { locales: migrated, keyMap };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function rewritePluginTranslationReferences(source, pluginId, keyMap) {
  return Object.entries(keyMap).reduce((result, [legacyKey, modernKey]) => {
    const target = `plugins.${pluginId}.${modernKey}`;
    const escapedKey = escapeRegExp(legacyKey);
    const attribute = new RegExp(`(data-i18n(?:-[a-z-]+)?\\s*=\\s*[\"'])${escapedKey}([\"'])`, 'g');
    const call = new RegExp(`((?:window\\.)?i18n\\.t\\(\\s*[\"'])${escapedKey}([\"'])`, 'g');
    return result.replace(attribute, `$1${target}$2`).replace(call, `$1${target}$2`);
  }, source);
}

module.exports = { migratePluginLocales, rewritePluginTranslationReferences, slugify };
