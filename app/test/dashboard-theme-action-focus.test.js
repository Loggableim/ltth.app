'use strict';

const fs = require('node:fs');
const path = require('node:path');
const postcss = require('postcss');

const cssDir = path.join(__dirname, '..', 'public', 'css');
const themesCss = fs.readFileSync(path.join(cssDir, 'themes.css'), 'utf8');
const navigationCss = fs.readFileSync(path.join(cssDir, 'navigation.css'), 'utf8');
const themes = postcss.parse(themesCss);
const navigation = postcss.parse(navigationCss);

function getThemeTokens(theme) {
  const tokens = {};
  themes.walkRules((rule) => {
    if (rule.parent.type !== 'root') return;
    if (!rule.selectors.some((selector) => {
      const normalized = selector.trim();
      return normalized === ':root' || normalized === `[data-theme="${theme}"]`;
    })) return;
    rule.walkDecls(/^--/, (declaration) => { tokens[declaration.prop] = declaration.value; });
  });
  return tokens;
}

function luminance(hex) {
  const channels = hex.slice(1).match(/.{2}/g).map((channel) => parseInt(channel, 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(first, second) {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function getRule(stylesheet, selector) {
  let found;
  const normalizedSelector = selector.replace(/\s+/g, '');
  stylesheet.walkRules((rule) => {
    if (rule.selector.replace(/\s+/g, '') === normalizedSelector) found = rule;
  });
  return found;
}

describe('dashboard semantic action and focus theme tokens', () => {
  test.each(['day', 'night', 'cid'])('%s action labels and focus rings meet contrast requirements', (theme) => {
    const tokens = getThemeTokens(theme);
    expect(tokens['--color-action-primary']).toBe('#166534');
    expect(tokens['--color-action-primary-hover']).toBe('#14532d');
    expect(tokens['--color-action-secondary']).toBe('#6d28d9');
    expect(tokens['--color-focus-ring']).toMatch(/^#[0-9a-f]{6}$/i);
    expect(contrastRatio('#ffffff', tokens['--color-action-primary'])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#ffffff', tokens['--color-action-secondary'])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokens['--color-focus-ring'], tokens['--color-bg-primary'])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokens['--color-focus-ring'], tokens['--color-bg-secondary'])).toBeGreaterThanOrEqual(4.5);
  });

  test('keeps day and night surfaces and text inverted', () => {
    const day = getThemeTokens('day');
    const night = getThemeTokens('night');
    expect(day['--color-bg-primary']).toBe('#f4f8f5');
    expect(day['--color-text-primary']).toBe('#17181c');
    expect(night['--color-bg-primary']).toBe('#07130f');
    expect(night['--color-text-primary']).toBe('#f5f7f2');
    expect(day['--color-action-primary']).toBe(night['--color-action-primary']);
    expect(day['--color-action-secondary']).toBe(night['--color-action-secondary']);
  });

  test('uses a visible semantic ring for keyboard focus and removes blue form focus shadows', () => {
    expect(themesCss).toMatch(/html:is\(\[data-theme="day"\], \[data-theme="night"\], \[data-theme="cid"\], \[data-theme="aurora"\], \[data-theme="contrast"\]\) :focus-visible\s*\{[^}]*outline:\s*3px solid var\(--color-focus-ring\);[^}]*outline-offset:\s*2px;/s);
    expect(navigationCss).toMatch(/\.sidebar-category-header:focus-visible,[\s\S]*?\.topbar-icon-btn:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--color-focus-ring\);/s);

    for (const selector of ['.connection-input:focus', '.form-input:focus,\n.form-select:focus,\n.form-textarea:focus']) {
      const rule = getRule(navigation, selector);
      expect(rule).toBeDefined();
      const declarations = {};
      rule.walkDecls((declaration) => { declarations[declaration.prop] = declaration.value; });
      expect(declarations.outline).toContain('var(--color-focus-ring)');
      expect(declarations['box-shadow']).toBe('none');
    }
    expect(navigationCss).not.toContain('box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1)');
  });
});
