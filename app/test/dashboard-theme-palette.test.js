const fs = require('fs');
const path = require('path');
const postcss = require('postcss');

const dashboard = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.html'), 'utf8');
const themes = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'themes.css'), 'utf8');
const themeManager = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'theme-manager.js'), 'utf8');
const stylesheet = postcss.parse(themes);

function getThemeTokens(theme) {
  const tokens = {};
  stylesheet.walkRules((rule) => {
    if (rule.parent.type !== 'root') return;
    const appliesToTheme = rule.selectors.some((selector) => {
      const normalized = selector.trim();
      return normalized === ':root' || normalized === `[data-theme="${theme}"]`;
    });
    if (!appliesToTheme) return;
    rule.walkDecls(/^--/, (declaration) => {
      tokens[declaration.prop] = declaration.value;
    });
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

describe('dashboard brand palette', () => {
  test('loads theme tokens after the Tailwind utilities they adapt', () => {
    const tailwindIndex = dashboard.indexOf('/css/tailwind.output.css');
    const themesIndex = dashboard.indexOf('/css/themes.css');

    expect(tailwindIndex).toBeGreaterThanOrEqual(0);
    expect(themesIndex).toBeGreaterThan(tailwindIndex);
  });

  test('uses the day brand token for dashboard and profile success text', () => {
    const match = themes.match(/html\[data-theme="day"\]\s+:is\(\s*\.text-green-400,([\s\S]*?)\)\s*\{([^}]*)\}/);

    expect(match).not.toBeNull();
    expect(match[0]).toContain('.text-green-400');
    expect(match[1]).toContain('.profile-integrity-status.healthy');
    expect(match[1]).toContain('.migration-status-badge.completed');
    expect(match[1]).toContain('.integrity-status-badge.success');
    expect(match[2]).toMatch(/color:\s*var\(--brand-primary\)/);
  });

  test('keeps completed wizard steps aligned with the day brand token', () => {
    expect(themes).toMatch(/html\[data-theme="day"\]\s+\.wizard-step-btn\.done\s+\.step-num\s*\{[^}]*background:\s*var\(--brand-primary\);[^}]*border-color:\s*var\(--brand-primary\);/s);
  });

  test('adapts hard-coded inline success text without changing night or logo themes', () => {
    expect(themes).toMatch(/html\[data-theme="day"\]\s+\[style\*="color: #22c55e"\]\s*\{[^}]*color:\s*var\(--brand-primary\)\s*!important;/s);
  });

  test.each(['day', 'night', 'cid'])('%s theme keeps the green, white, and violet brand roles', (theme) => {
    const tokens = getThemeTokens(theme);
    expect(tokens['--brand-primary']).toBe(theme === 'day' ? '#166534' : '#4ade80');
    expect(tokens['--color-accent-primary']).toBe(tokens['--brand-primary']);
    expect(tokens['--color-accent-secondary']).toBe('#7c3aed');
    expect(tokens['--color-action-primary']).toBe('#166534');
    expect(tokens['--color-text-primary']).toBe(theme === 'day' ? '#17181c' : '#f5f7f2');
    expect(tokens['--color-bg-secondary']).toBe(theme === 'day' ? '#ffffff' : '#0d2119');
  });

  test.each(['day', 'night', 'cid'])('%s semantic text and action pairs meet WCAG AA contrast', (theme) => {
    const tokens = getThemeTokens(theme);
    const pairs = [
      [tokens['--color-text-primary'], tokens['--color-bg-secondary']],
      [tokens['--color-text-muted'], tokens['--color-bg-secondary']],
      ['#ffffff', tokens['--color-action-primary']],
      ['#ffffff', tokens['--color-accent-secondary']],
      ['#ffffff', '#b91c1c'],
      [tokens['--brand-primary'], tokens['--color-bg-primary']]
    ];
    for (const [foreground, background] of pairs) {
      expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
    }
  });

  test.each(['night', 'cid'])('%s surfaces are green-tinted with readable off-white text', (theme) => {
    const tokens = getThemeTokens(theme);
    expect(tokens['--color-bg-primary']).toBe('#07130f');
    expect(tokens['--color-bg-secondary']).toBe('#0d2119');
    expect(tokens['--color-bg-card']).toBe('#10271e');
    expect(tokens['--color-text-primary']).toBe('#f5f7f2');
    expect(contrastRatio(tokens['--color-text-primary'], tokens['--color-bg-card'])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokens['--color-text-muted'], tokens['--color-bg-secondary'])).toBeGreaterThanOrEqual(4.5);
  });

  test('day mode inverts to white surfaces and dark text while retaining violet navigation', () => {
    const day = getThemeTokens('day');
    expect(day['--color-bg-secondary']).toBe('#ffffff');
    expect(day['--color-bg-card']).toBe('#ffffff');
    expect(day['--color-text-primary']).toBe('#17181c');
    expect(day['--color-action-secondary']).toBe('#6d28d9');
    expect(contrastRatio(day['--color-text-primary'], day['--color-bg-secondary'])).toBeGreaterThanOrEqual(4.5);
  });

  test.each(['day', 'night', 'cid'])('%s dashboard stat and shortcut cards use the themed surface and visible border', (theme) => {
    let cardRule;
    stylesheet.walkRules((rule) => {
      if (rule.selectors.some((selector) => selector.trim() === 'html:is([data-theme="day"], [data-theme="night"], [data-theme="cid"]) #view-dashboard :is(.stat-card, .shortcut-card)')) {
        cardRule = rule;
      }
    });
    expect(cardRule).toBeDefined();
    const declarations = {};
    const important = {};
    cardRule.walkDecls((declaration) => {
      declarations[declaration.prop] = declaration.value;
      important[declaration.prop] = declaration.important;
    });
    expect(declarations.background).toBe('var(--color-bg-card)');
    expect(important.background).toBe(true);
    expect(declarations['border-color']).toBe('#567964');
    expect(important['border-color']).toBe(true);

    const tokens = getThemeTokens(theme);
    expect(contrastRatio(tokens['--color-text-primary'], tokens['--color-bg-card'])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#567964', tokens['--color-bg-card'])).toBeGreaterThanOrEqual(3);
  });

  test('keeps the selectable contrast theme on green and violet brand accents', () => {
    const contrastRule = stylesheet.nodes.find((rule) => rule.selector === '[data-theme="contrast"]');
    const tokens = {};
    contrastRule.walkDecls(/^--/, (declaration) => { tokens[declaration.prop] = declaration.value; });
    expect(tokens['--color-accent-primary']).toBe('#14c91f');
    expect(tokens['--color-accent-secondary']).toBe('#a78bfa');
    expect(tokens['--color-input-focus']).toBe('#14c91f');
    expect(tokens['--color-chart-primary']).toBe('#14c91f');
    expect(tokens['--color-active-bg']).toBe('rgba(167, 139, 250, 0.25)');
  });

  test('uses semantic brand tokens for active navigation and primary actions', () => {
    expect(themes).toMatch(/\.tab\.active[\s\S]*?background:\s*var\(--color-action-secondary\)\s*!important;/);
    expect(themes).toMatch(/:is\(button\.primary, \.btn\.primary, \[class~="primary"\], \.back-link, \.external-link\)[\s\S]*?background:\s*var\(--color-action-primary\)\s*!important;/);
    expect(themes).toMatch(/html\[data-theme="contrast"\][\s\S]*?button:is\(\[class\*="bg-blue-500"\]/);
    expect(themeManager).toMatch(/night:[\s\S]*?swatches: \['#166534', '#ffffff', '#7c3aed'\]/);
    expect(themeManager).toMatch(/day:[\s\S]*?swatches: \['#166534', '#ffffff', '#7c3aed'\]/);
  });

  test('keeps connection success green and error red with readable foregrounds', () => {
    expect(themes).toMatch(/html:is\(\[data-theme="day"\], \[data-theme="night"\], \[data-theme="cid"\]\) \.status-connected\s*\{[^}]*background:\s*var\(--color-action-primary\) !important;[^}]*color:\s*#ffffff !important;/s);
    expect(themes).toMatch(/html:is\(\[data-theme="day"\], \[data-theme="night"\], \[data-theme="cid"\]\) \.status-error\s*\{[^}]*background:\s*#b91c1c !important;[^}]*color:\s*#ffffff !important;/s);
    expect(themes).toMatch(/html\[data-theme\] button:is\(\[class\*="bg-red-500"\], \[class\*="bg-red-600"\]\)\s*\{[^}]*background:\s*#7f1d1d !important;/s);
  });
});
