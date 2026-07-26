'use strict';

const fs = require('fs');
const path = require('path');
const {
  targets
} = require('../plugins/game-engine/tiktok-studio-ui');

describe('Game Engine TikTok Studio URL actions', () => {
  test('keeps mode-dependent URL values machine-readable for the shared helper', () => {
    const html = fs.readFileSync(
      path.join(__dirname, '..', 'plugins', 'game-engine', 'ui.html'),
      'utf8'
    );
    const helper = fs.readFileSync(
      path.join(
        __dirname,
        '..',
        'plugins',
        'game-engine',
        'tiktok-studio-ui.js'
      ),
      'utf8'
    );

    expect(html).toContain(
      'urlSpan.setAttribute(\'data-overlay-url\', url);'
    );
    expect(helper).toContain(
      "button.setAttribute('data-overlay-url-attribute', target.attribute);"
    );
    expect(targets).toHaveLength(19);
    expect(targets.filter(target => target.attribute)).toHaveLength(6);
  });
});
