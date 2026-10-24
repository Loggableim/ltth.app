const fs = require('fs');
const path = require('path');

const themes = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'themes.css'), 'utf8');

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

  test('shows a solid current-text-color focus indicator on the dashboard connection input', () => {
    expect(themes).toMatch(/:is\(\[data-theme="day"\],\s*\[data-theme="night"\],\s*\[data-theme="cid"\]\)\s+#view-dashboard\s+\.connection-input:focus-visible\s*\{[^}]*outline:\s*2px solid currentColor\s*!important;[^}]*outline-offset:\s*2px\s*!important;/s);
  });

});
