const fs = require('fs');
const path = require('path');

const themes = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'themes.css'), 'utf8');

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

describe('dashboard Day theme accessibility states', () => {
  test('uses the light card and border tokens for Day dashboard stats', () => {
    expect(themes).toMatch(/html\[data-theme="day"\]\s+#view-dashboard\s+\.stat-card\s*\{[^}]*background:\s*var\(--color-bg-card\);[^}]*border-color:\s*var\(--color-border\);/s);
  });

  test('keeps the runtime value on one line in the supported dashboard themes', () => {
    expect(themes).toMatch(/:is\(\[data-theme="day"\],\s*\[data-theme="night"\],\s*\[data-theme="cid"\]\)\s+#view-dashboard\s+#stat-runtime\s*\{[^}]*font-size:\s*clamp\(0\.8125rem,\s*1vw,\s*1\.65rem\);[^}]*white-space:\s*nowrap;/s);
  });

  test('uses readable Day colors only within the light-surface security warning', () => {
    expect(themes).toMatch(/html\[data-theme="day"\]\s+#network-security-warning\s+\.text-yellow-400\s*\{[^}]*color:\s*#854d0e;/s);
    expect(themes).toMatch(/html\[data-theme="day"\]\s+#network-security-warning\s+\.text-gray-300\s*\{[^}]*color:\s*var\(--color-text-primary\);/s);
  });

  test('keeps the tunnel error readable on its dark warning surface in all supported themes', () => {
    expect(themes).toMatch(/:is\(\[data-theme="day"\],\s*\[data-theme="night"\],\s*\[data-theme="cid"\]\)\s+#network-overlay-tunnel-error\s*\{[^}]*color:\s*#fecaca;/s);
  });

  test('shows a solid semantic focus-ring indicator on the dashboard connection input', () => {
    expect(themes).toMatch(/:is\(\[data-theme="day"\],\s*\[data-theme="night"\],\s*\[data-theme="cid"\]\)\s+#view-dashboard\s+\.connection-input:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--color-focus-ring\)\s*!important;[^}]*outline-offset:\s*2px\s*!important;/s);
  });

  test('uses high-contrast Day tokens for dashboard placeholders and load errors', () => {
    expect(themes).toMatch(/html\[data-theme="day"\]\s+#view-dashboard\s+:is\(input,\s*textarea\)::placeholder\s*\{[^}]*color:\s*var\(--color-input-placeholder\);[^}]*opacity:\s*1;/s);
    expect(themes).toMatch(/html\[data-theme="day"\]\s+#view-events\s+#event-log-status,\s*html\[data-theme="day"\]\s+#view-settings\s+#active-profile-status\s*\{[^}]*color:\s*var\(--color-text-secondary\)\s*!important;/s);

    expect(themes).toMatch(/\[data-theme="day"\]\s*\{[^}]*--color-text-secondary:\s*#42444b;/s);
    expect(themes).toMatch(/\[data-theme="day"\]\s*\{[^}]*--color-input-placeholder:\s*#595c65;/s);
    const dayInputPlaceholder = '#595c65';
    const dayTextSecondary = '#42444b';
    const whiteSurface = '#ffffff';
    const profileInfoSurface = '#d2d7e8';
    expect(contrastRatio(dayInputPlaceholder, whiteSurface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(dayTextSecondary, whiteSurface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(dayTextSecondary, profileInfoSurface)).toBeGreaterThanOrEqual(4.5);
  });

});
