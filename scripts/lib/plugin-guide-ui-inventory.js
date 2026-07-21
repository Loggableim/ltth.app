'use strict';

const fs = require('fs');
const path = require('path');
const { LOCALES, flattenTranslations } = require('./plugin-i18n-audit');

function sourceFileFor(repoRoot, route) {
  const pathname = route.split('?')[0];
  const explicit = {
    '/api-bridge/ui': ['app', 'plugins', 'api-bridge', 'ui.html'],
    '/emoji-rain/ui': ['app', 'plugins', 'emoji-rain', 'ui.html'],
    '/webgpu-weather-control/ui': ['app', 'plugins', 'webgpu-weather-control', 'ui.html'],
    '/clarityhud/ui': ['app', 'plugins', 'clarityhud', 'ui', 'main.html'],
    '/visual-fx-frame-webgpu/ui': ['plugin-store', 'sources', 'visual-fx-frame-webgpu', 'ui', 'settings.html'],
    '/dashboard.html': ['app', 'public', 'dashboard.html']
  };
  if (explicit[pathname]) return path.join(repoRoot, ...explicit[pathname]);
  if (pathname.startsWith('/api/')) return null;
  const candidate = path.join(repoRoot, 'app', pathname.replace(/^\//, ''));
  return fs.existsSync(candidate) ? candidate : null;
}

function referencedSource(file, repoRoot) {
  const html = fs.readFileSync(file, 'utf8');
  const dependencies = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)]
    .map((match) => match[1].split('?')[0])
    .filter((source) => !/^https?:/i.test(source))
    .map((source) => source.startsWith('/')
      ? (source.startsWith('/js/') ? path.join(repoRoot, 'app', 'public', source.replace(/^\//, '')) : path.join(repoRoot, 'app', source.replace(/^\//, '')))
      : path.resolve(path.dirname(file), source))
    .filter((source) => fs.existsSync(source))
    .map((source) => fs.readFileSync(source, 'utf8'));
  return [html, ...dependencies].join('\n');
}

function attribute(attributes, name) {
  const match = attributes.match(new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'));
  return match ? match[2].trim() : '';
}

function hasAttribute(attributes, name) {
  return new RegExp(`(?:^|\\s)${name}(?:\\s|=|$)`, 'i').test(attributes);
}

function strip(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function selectorFor(tag, attributes) {
  const id = attribute(attributes, 'id');
  if (id) return `#${id}`;
  const name = attribute(attributes, 'name');
  return name ? `${tag}[name="${name.replaceAll('"', '\\"')}"]` : '';
}

function i18nKeyFor(attributes) {
  return attribute(attributes, 'data-i18n')
    || attribute(attributes, 'data-i18n-key')
    || attribute(attributes, 'data-i18n-placeholder')
    || attribute(attributes, 'data-i18n-title')
    || attribute(attributes, 'data-i18n-aria-label');
}

function nearestDivContainer(source, offset) {
  const stack = [];
  for (const match of source.slice(0, offset).matchAll(/<\/?div\b[^>]*>/gi)) {
    if (/^<\/div\b/i.test(match[0])) {
      stack.pop();
    } else {
      stack.push({ start: match.index, contentStart: match.index + match[0].length });
    }
  }
  const container = stack.at(-1);
  if (!container) return null;

  let depth = 0;
  for (const match of source.slice(container.start).matchAll(/<\/?div\b[^>]*>/gi)) {
    depth += /^<\/div\b/i.test(match[0]) ? -1 : 1;
    if (depth === 0) return { ...container, end: container.start + match.index };
  }
  return null;
}

function contextualLabelFor(source, offset) {
  const container = nearestDivContainer(source, offset);
  if (!container) return null;
  const containerSource = source.slice(container.contentStart, container.end);
  const controls = [...containerSource.matchAll(/<(?:input|select|textarea|button|a)\b/gi)];
  if (controls.length !== 1) return null;

  const candidates = [];
  const addCandidate = (attributes, content, rank, index) => {
    const key = i18nKeyFor(attributes) || i18nKeyFor(content);
    const label = strip(content);
    if (key && label) candidates.push({ key, label, rank, index });
  };
  const preceding = source.slice(container.contentStart, offset);
  for (const match of preceding.matchAll(/<(label|span|h[1-6]|p)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
    const rank = /\bform-label\b/i.test(match[2]) || match[1].toLowerCase() === 'label'
      ? 3
      : /^h[1-6]$/i.test(match[1])
        ? 2
        : match[1].toLowerCase() === 'span'
          ? 1
          : 0;
    addCandidate(match[2], match[3], rank, container.contentStart + match.index);
  }
  const following = source.slice(offset, container.end);
  for (const match of following.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/gi)) {
    addCandidate(match[1], match[2], 4, offset + match.index);
  }
  candidates.sort((left, right) => right.rank - left.rank || right.index - left.index);
  const candidate = candidates[0];
  return candidate ? { label: candidate.label, i18nKey: candidate.key } : null;
}

function labelFor(source, selector, attributes, content, offset = source.length) {
  const id = selector.startsWith('#') ? selector.slice(1) : '';
  const labels = [...source.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/gi)];
  const explicit = id ? labels.find((candidate) => attribute(candidate[1], 'for') === id) : null;
  let labelAttributes = explicit?.[1] || '';
  let label = explicit?.[2] || '';
  if (!label) {
    const preceding = source.slice(0, offset);
    const openingLabels = [...preceding.matchAll(/<label\b([^>]*)>/gi)];
    const enclosing = openingLabels
      .map((candidate) => ({
        attributes: candidate[1],
        contentStart: candidate.index + candidate[0].length,
        contentEnd: source.indexOf('</label>', candidate.index + candidate[0].length)
      }))
      .filter((candidate) => candidate.contentEnd >= offset)
      .reverse();
    const localized = enclosing.find((candidate) => (
      i18nKeyFor(candidate.attributes) || i18nKeyFor(source.slice(candidate.contentStart, candidate.contentEnd))
    ));
    const selected = localized || enclosing[0];
    if (selected) {
      labelAttributes = selected.attributes;
      label = source.slice(selected.contentStart, selected.contentEnd);
    }
  }
  if (!label) {
    const preceding = source.slice(0, offset);
    const nearest = labels.filter((candidate) => candidate.index < offset).at(-1);
    if (nearest && !/<(?:input|select|textarea|button)\b/i.test(preceding.slice(nearest.index + nearest[0].length))) {
      labelAttributes = nearest[1];
      label = nearest[2];
    }
  }
  const labelText = strip(label);
  const i18nKey = i18nKeyFor(labelAttributes) || i18nKeyFor(label) || i18nKeyFor(content) || i18nKeyFor(attributes) || '';
  const contextual = !labelText && !i18nKey ? contextualLabelFor(source, offset) : null;
  return {
    label: contextual?.label || labelText || attribute(attributes, 'aria-label') || attribute(attributes, 'title') || attribute(attributes, 'placeholder') || attribute(attributes, 'value') || strip(content) || selector,
    i18nKey: contextual?.i18nKey || i18nKey
  };
}

function controlValues(tag, attributes, content) {
  if (tag === 'button') return { defaultValue: 'action', values: 'action' };
  if (tag === 'a') return { defaultValue: attribute(attributes, 'href') || 'link', values: 'link' };
  if (tag === 'select') {
    const options = [...String(content).matchAll(/<option([^>]*)>([\s\S]*?)<\/option>/gi)].map((match) => ({
      selected: hasAttribute(match[1], 'selected'),
      value: attribute(match[1], 'value') || strip(match[2])
    })).filter((option) => option.value);
    return { defaultValue: options.find((option) => option.selected)?.value || options[0]?.value || 'not declared', values: options.map((option) => option.value).join(', ') || 'not declared' };
  }
  const type = attribute(attributes, 'type').toLowerCase();
  if (type === 'checkbox' || type === 'radio') return { defaultValue: hasAttribute(attributes, 'checked') ? 'checked' : 'unchecked', values: 'checked, unchecked' };
  const minimum = attribute(attributes, 'min');
  const maximum = attribute(attributes, 'max');
  const value = attribute(attributes, 'value') || attribute(attributes, 'data-default') || strip(content) || 'empty';
  return { defaultValue: value, values: minimum || maximum ? `${minimum || '-infinity'} to ${maximum || 'infinity'}` : 'text or value shown in the control' };
}

function parseControls(source, route) {
  const controls = [];
  const seen = new Set();
  const add = (tag, attributes, content = '', offset = source.length) => {
    // Template-rendered markup often contains source expressions such as
    // `${item.id}`. Those are not visible controls or truthful defaults until
    // the runtime has supplied data, so a static guide must not publish the
    // expression itself as a label, selector, or value.
    if (String(attributes).includes('${') || String(content).includes('${')) return;
    const type = attribute(attributes, 'type').toLowerCase();
    if (type === 'hidden' || hasAttribute(attributes, 'hidden') || /display\s*:\s*none/i.test(attribute(attributes, 'style'))) return;
    if (tag === 'a' && !/(?:\bbtn\b|role\s*=\s*["']button["'])/i.test(attributes)) return;
    const selector = selectorFor(tag, attributes);
    if (!selector || seen.has(selector)) return;
    seen.add(selector);
    const values = controlValues(tag, attributes, content);
    const label = labelFor(source, selector, attributes, content, offset);
    controls.push({
      selector,
      kind: tag === 'button' ? 'action' : tag === 'a' ? 'link' : 'control',
      label: label.label,
      ...(label.i18nKey ? { i18nKey: label.i18nKey } : {}),
      defaultValue: values.defaultValue,
      values: values.values,
      route
    });
  };

  for (const match of source.matchAll(/<(select|textarea|button|a)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) add(match[1].toLowerCase(), match[2], match[3], match.index);
  for (const match of source.matchAll(/<input\b([^>]*)>/gi)) add('input', match[1], '', match.index);
  return controls.sort((left, right) => left.selector.localeCompare(right.selector));
}

function localizedControlLabels(repoRoot, guide, route, controls) {
  const directory = pluginSourceDirectory(repoRoot, guide.id, route);
  const valuesByLocale = Object.fromEntries(LOCALES.map((locale) => {
    const loadLocale = (localePath) => {
      if (!localePath || !fs.existsSync(localePath)) return {};
      try {
        return flattenTranslations(JSON.parse(fs.readFileSync(localePath, 'utf8').replace(/^\uFEFF/, '')));
      } catch {
        return {};
      }
    };
    const appLocale = loadLocale(path.join(repoRoot, 'app', 'locales', `${locale}.json`));
    const pluginLocale = loadLocale(directory && path.join(directory, 'locales', `${locale}.json`));
    return [locale, { ...appLocale, ...pluginLocale }];
  }));
  return controls.map((control) => {
    if (!control.i18nKey) return control;
    const labels = Object.fromEntries(LOCALES
      .map((locale) => [locale, valuesByLocale[locale][control.i18nKey]])
      .filter(([, value]) => typeof value === 'string' && value.trim()));
    return Object.keys(labels).length ? { ...control, labels } : control;
  });
}

function collectGuideUiInventory(repoRoot, guide) {
  const route = guide.definition?.activation?.route || guide.capture?.route || '';
  const file = sourceFileFor(repoRoot, route);
  if (!file) return { route, file: null, controls: [] };
  const controls = parseControls(referencedSource(file, repoRoot), route);
  return { route, file, controls: localizedControlLabels(repoRoot, guide, route, controls) };
}

function pluginSourceDirectory(repoRoot, pluginId, route) {
  const candidates = pluginId ? [
    path.join(repoRoot, 'app', 'plugins', pluginId),
    path.join(repoRoot, 'plugin-store', 'sources', pluginId)
  ] : [];
  const pluginDirectory = candidates.find((candidate) => fs.existsSync(candidate));
  if (pluginDirectory) return pluginDirectory;
  const surface = sourceFileFor(repoRoot, route);
  return surface ? path.dirname(surface) : null;
}

function sourceFiles(directory) {
  if (!directory || !fs.existsSync(directory)) return [];
  const files = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!['node_modules', 'test', 'tests'].includes(entry.name)) visit(file);
      } else if (/\.(?:js|cjs|mjs|html)$/i.test(entry.name)) {
        files.push(file);
      }
    }
  };
  visit(directory);
  return files.sort();
}

function uniqueIntegrations(entries) {
  const byKey = new Map();
  for (const entry of entries) byKey.set(`${entry.type}:${entry.method || ''}:${entry.value}`, entry);
  return [...byKey.values()].sort((left, right) => left.type.localeCompare(right.type) || left.value.localeCompare(right.value));
}

function collectPluginIntegrationInventory(repoRoot, pluginId, route) {
  const directory = pluginSourceDirectory(repoRoot, pluginId, route);
  const source = sourceFiles(directory).map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  const integrations = [];
  const add = (type, value, method = null) => {
    if (value) integrations.push({ type, value, ...(method ? { method } : {}) });
  };

  for (const match of source.matchAll(/registerRoute\(\s*['"](get|post|put|patch|delete)['"]\s*,\s*['"](\/api\/[^'"]+)/gi)) add('rest', match[2], match[1].toUpperCase());
  for (const match of source.matchAll(/(?:socket|io)\.(?:on|emit)\(\s*['"]([^'"]+)/gi)) add('socket-event', match[1]);
  for (const match of source.matchAll(/register(?:Flow)?Action\(\s*['"]([^'"]+)/gi)) add('flow-action', match[1]);
  for (const match of source.matchAll(/register(?:Chat)?Command\(\s*['"]([^'"]+)/gi)) add('chat-command', match[1]);
  for (const match of source.matchAll(/\b(api\.(?:getPluginDataDir|getSetting|setSetting|deleteSetting)|(?:database|db)\.(?:get|set|run|prepare))\b/g)) add('storage', match[1]);
  for (const match of source.matchAll(/registerRoute\(\s*['"](get|post|put|patch|delete)['"]\s*,\s*['"](\/api\/[^'"]*(?:import|export)[^'"]*)/gi)) add('import-export', match[2], match[1].toUpperCase());

  return {
    directory,
    sourceFiles: sourceFiles(directory),
    integrations: uniqueIntegrations(integrations)
  };
}

module.exports = { collectGuideUiInventory, collectPluginIntegrationInventory, parseControls, sourceFileFor };
