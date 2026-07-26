'use strict';

const fs = require('fs');
const path = require('path');

const pluginRoot = path.join(__dirname, '..', 'plugins', 'quiz-show');

describe('Quiz Show public overlay render mode', () => {
  test('loads the public render-mode guard before the overlay runtime', () => {
    const html = fs.readFileSync(
      path.join(pluginRoot, 'quiz_show_overlay.html'),
      'utf8'
    );
    const guardIndex = html.indexOf(
      '<script src="/js/public-overlay-render-mode.js"></script>'
    );
    const runtimeIndex = html.indexOf(
      '<script src="/quiz-show/quiz_show_overlay.js"></script>'
    );

    expect(guardIndex).toBeGreaterThan(-1);
    expect(runtimeIndex).toBeGreaterThan(guardIndex);
  });

  test('routes HUD position writes through the local-only helper', () => {
    const source = fs.readFileSync(
      path.join(pluginRoot, 'quiz_show_overlay.js'),
      'utf8'
    );

    expect(source).toContain(
      'LTTHPublicOverlayRenderMode.postJsonLocalOnly('
    );
    expect(source).not.toContain(
      "fetch('/api/quiz-show/hud-config', {\n                method: 'POST'"
    );
  });
});
