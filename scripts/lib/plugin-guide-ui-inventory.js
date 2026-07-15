'use strict';

const fs = require('fs');
const path = require('path');

function sourceFileFor(repoRoot, route) {
  const pathname = route.split('?')[0];
  const explicit = {
    '/api-bridge/ui': ['app', 'plugins', 'api-bridge', 'ui.html'],
    '/emoji-rain/ui': ['app', 'plugins', 'emoji-rain', 'ui.html'],
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

function labelFor(source, selector, attributes, content) {
  const id = selector.startsWith('#') ? selector.slice(1) : '';
  const label = id
    ? source.match(new RegExp(`<label[^>]*\\bfor=["']${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>([\\s\\S]*?)<\\/label>`, 'i'))?.[1]
    : '';
  return strip(label) || attribute(attributes, 'aria-label') || attribute(attributes, 'title') || attribute(attributes, 'placeholder') || attribute(attributes, 'value') || strip(content) || selector;
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
  const add = (tag, attributes, content = '') => {
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
    controls.push({
      selector,
      kind: tag === 'button' ? 'action' : tag === 'a' ? 'link' : 'control',
      label: labelFor(source, selector, attributes, content),
      defaultValue: values.defaultValue,
      values: values.values,
      route
    });
  };

  for (const match of source.matchAll(/<(select|textarea|button|a)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) add(match[1].toLowerCase(), match[2], match[3]);
  for (const match of source.matchAll(/<input\b([^>]*)>/gi)) add('input', match[1]);
  return controls.sort((left, right) => left.selector.localeCompare(right.selector));
}

function collectGuideUiInventory(repoRoot, guide) {
  const route = guide.definition?.activation?.route || guide.capture?.route || '';
  const file = sourceFileFor(repoRoot, route);
  if (!file) return { route, file: null, controls: [] };
  return { route, file, controls: parseControls(referencedSource(file, repoRoot), route) };
}

function pluginSourceDirectory(repoRoot, pluginId, route) {
  const candidates = [
    path.join(repoRoot, 'app', 'plugins', pluginId),
    path.join(repoRoot, 'plugin-store', 'sources', pluginId)
  ];
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
