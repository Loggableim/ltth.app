const fs = require('fs');
const path = require('path');

const dashboard = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.html'), 'utf8');
const themes = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'themes.css'), 'utf8');

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
});
