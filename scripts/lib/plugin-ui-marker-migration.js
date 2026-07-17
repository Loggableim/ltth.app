'use strict';

const TRANSLATABLE_TAGS = 'a|button|div|em|h1|h2|h3|h4|label|li|option|p|small|span|strong|td|th|title';
const TAG_PATTERN = new RegExp(`<(${TRANSLATABLE_TAGS})(\\s[^>]*)?>([^<>]+)<\\/\\1>`, 'gi');

function normalizeText(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inIgnoredBlock(source, offset) {
  const before = source.slice(0, offset);
  const start = Math.max(
    before.lastIndexOf('<script'),
    before.lastIndexOf('<style'),
    before.lastIndexOf('<template'),
    before.lastIndexOf('<svg')
  );
  const end = Math.max(
    before.lastIndexOf('</script>'),
    before.lastIndexOf('</style>'),
    before.lastIndexOf('</template>'),
    before.lastIndexOf('</svg>')
  );
  return start > end;
}

function addExistingPluginMarkers(source, translationMap) {
  let marked = 0;
  const next = source.replace(TAG_PATTERN, (match, tag, attributes = '', text, offset) => {
    if (inIgnoredBlock(source, offset) || /\bdata-i18n(?:-[\w-]+)?\s*=/.test(attributes)) return match;
    const key = translationMap.get(normalizeText(text));
    if (!key || /\$\{[^}]+\}/.test(text)) return match;
    marked += 1;
    return `<${tag}${attributes} data-i18n="${key}">${text}</${tag}>`;
  });
  return { source: next, marked };
}

function buildUniqueTranslationMap(entries) {
  const candidates = new Map();
  for (const [key, value] of entries) {
    const text = normalizeText(value);
    if (!text) continue;
    if (!candidates.has(text)) candidates.set(text, new Set());
    candidates.get(text).add(key);
  }
  return new Map([...candidates.entries()]
    .filter(([, keys]) => keys.size === 1)
    .map(([text, keys]) => [text, [...keys][0]]));
}

function rewriteLegacyPluginKeys(source, pluginId, translationKeys) {
  let rewritten = 0;
  const replacementFor = (key) => {
    if (key.startsWith('common.') || key.startsWith('generated.') || key.startsWith(`plugins.${pluginId}.`)) return key;
    const namespaced = `plugins.${pluginId}.${key}`;
    if (!translationKeys.has(namespaced)) return key;
    rewritten += 1;
    return namespaced;
  };

  const attributes = String(source).replace(/(\bdata-i18n(?:-[\w-]+)?\s*=\s*["'])([^"']+)(["'])/gi, (match, prefix, key, suffix) => {
    return `${prefix}${replacementFor(key.trim())}${suffix}`;
  });
  const next = attributes.replace(/(\b(?:api|i18n)\.t\(\s*["'])([^"']+)(["'])/g, (match, prefix, key, suffix) => {
    return `${prefix}${replacementFor(key.trim())}${suffix}`;
  });
  return { source: next, rewritten };
}

module.exports = { addExistingPluginMarkers, buildUniqueTranslationMap, normalizeText, rewriteLegacyPluginKeys };
