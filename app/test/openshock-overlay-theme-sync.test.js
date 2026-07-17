'use strict';

const fs = require('fs');
const path = require('path');

describe('OpenShock overlay theme sync', () => {
  const overlayPath = path.join(__dirname, '..', 'plugins', 'openshock', 'overlay', 'openshock_overlay.html');

  test('does not observe the same theme attribute it writes', () => {
    const source = fs.readFileSync(overlayPath, 'utf8');

    expect(source).not.toContain("new MutationObserver(syncTheme).observe(document.documentElement");
    expect(source).toContain("new MutationObserver(syncTheme).observe(window.parent.document.documentElement");
  });
});
