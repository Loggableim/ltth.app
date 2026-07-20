const fs = require('fs');
const path = require('path');

const pluginRoot = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(pluginRoot, file), 'utf8');

describe('CoinBattle UI and overlay regressions', () => {
  test('overlay static labels participate in i18n', () => {
    const html = read('overlay/overlay.html');

    expect(html).toMatch(/class="timer-label"[^>]*data-i18n=/);
    expect(html).toMatch(/class="winner-label"[^>]*data-i18n=/);
    expect(html).toMatch(/class="post-match-title"[^>]*data-i18n=/);
  });

  test('overlay owns cancellable Pyramid display timers', () => {
    const js = read('overlay/overlay.js');

    expect(js).toMatch(/pyramidPostMatchTimeout/);
    expect(js).toMatch(/clearTimeout\(pyramidPostMatchTimeout\)/);
  });

  test('dashboard reset persists defaults instead of only reloading saved config', () => {
    const js = read('ui.js');
    const resetBody = js.match(/function resetSettings\(\) \{[\s\S]*?\n  \}/)?.[0] || '';

    expect(resetBody).toMatch(/fetch\(/);
    expect(resetBody).toMatch(/config\/reset/);
  });
});

