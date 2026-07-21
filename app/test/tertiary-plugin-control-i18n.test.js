'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const LOCALES = ['de', 'en', 'es', 'fr'];

const repairedControls = [
  {
    pluginId: 'emoji-rain',
    html: 'app/plugins/emoji-rain/ui.html',
    selector: '#enabled-toggle',
    attribute: 'data-i18n-aria-label',
    key: 'plugins.emoji-rain.form_controls.enabled_toggle_aria'
  },
  {
    pluginId: 'webgpu-emoji-rain',
    html: 'app/plugins/webgpu-emoji-rain/ui.html',
    selector: '#enabled-toggle',
    attribute: 'data-i18n-aria-label',
    key: 'plugins.webgpu-emoji-rain.form_controls.enabled_toggle_aria'
  },
];

function flattened(value, prefix = '') {
  return Object.entries(value).reduce((result, [key, nested]) => {
    const next = `${prefix}${key}`;
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      Object.assign(result, flattened(nested, `${next}.`));
    } else {
      result[next] = nested;
    }
    return result;
  }, {});
}

function sourceWindow(source, selector) {
  const id = selector.slice(1);
  const index = source.indexOf(`id="${id}"`);
  expect(index).toBeGreaterThanOrEqual(0);
  return source.slice(Math.max(0, index - 200), index + 400);
}

function startTagFor(source, selector) {
  const id = selector.slice(1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`<[^>]*\\bid="${id}"[^>]*>`, 'i'));
  expect(match).not.toBeNull();
  return match[0];
}

describe('tertiary plugin control i18n', () => {
  test('binds the remaining visible controls to stable plugin locale keys', () => {
    for (const control of repairedControls) {
      const source = fs.readFileSync(path.join(repoRoot, control.html), 'utf8');
      expect(sourceWindow(source, control.selector)).toContain(`${control.attribute}="${control.key}"`);
      for (const locale of LOCALES) {
        const localeFile = path.join(repoRoot, 'app', 'plugins', control.pluginId, 'locales', `${locale}.json`);
        const translations = flattened(JSON.parse(fs.readFileSync(localeFile, 'utf8')));
        expect(translations[control.key]).toEqual(expect.any(String));
        expect(translations[control.key].trim()).not.toBe('');
      }
    }
  });

  test('keeps regional preset codes, add glyph, and intentionally hidden request input out of the locale inventory', () => {
    const giftCatalog = fs.readFileSync(path.join(repoRoot, 'app/plugins/gift-catalog/ui.html'), 'utf8');
    for (const [selector, code] of [['#preset-de', 'DE'], ['#preset-us', 'US'], ['#preset-jp', 'JP']]) {
      const control = sourceWindow(giftCatalog, selector);
      expect(control).toContain(`>${code}</button>`);
      expect(startTagFor(giftCatalog, selector)).not.toMatch(/data-i18n(?:-[\w-]+)?=/);
    }

    const fireworks = fs.readFileSync(path.join(repoRoot, 'app/plugins/fireworks/ui/settings.html'), 'utf8');
    expect(sourceWindow(fireworks, '#add-color')).toMatch(/>\+<\/button>/);

    const musicBot = fs.readFileSync(path.join(repoRoot, 'app/plugins/music-bot/ui.html'), 'utf8');
    expect(musicBot).toContain('<form id="request-form" style="display:none">');
    expect(startTagFor(musicBot, '#request-input')).not.toMatch(/(?:aria-label|placeholder|data-i18n)/);
  });

  test('documents the runtime-labelled import checkbox as a parser artifact rather than a missing translation', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'app/plugins/config-import/ui.html'), 'utf8');
    expect(source).toContain("<input type=\"checkbox\" id=\"impUserConfigs\" checked><span data-i18n=\"plugins.config-import.config-import.ui.userConfigs\"></span>");
  });
});
