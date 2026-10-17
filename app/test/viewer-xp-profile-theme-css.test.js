const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

describe('Viewer XP user profile theme styles', () => {
  test('parses theme CSS as stylesheet rules instead of visible body text', () => {
    const htmlPath = path.join(
      __dirname,
      '../plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/user-profile.html'
    );
    const dom = new JSDOM(fs.readFileSync(htmlPath, 'utf8'));

    try {
      const { document } = dom.window;
      expect(document.body.textContent).not.toContain('html[data-theme="cid"] body');
      expect(document.body.textContent).not.toContain('html[data-theme="vision-impaired"] body');

      const selectors = Array.from(document.styleSheets[0].cssRules, rule => rule.selectorText).filter(Boolean);
      expect(selectors).toContain('html[data-theme="cid"] body');
      expect(selectors).toContain('html[data-theme="vision-impaired"] body');
    } finally {
      dom.window.close();
    }
  });
});
