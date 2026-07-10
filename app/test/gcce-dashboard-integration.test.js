const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appRoot = path.join(__dirname, '..');

describe('GCCE dashboard integration', () => {
  it('exposes the HUD overlay only inside the Global Chat Command Engine', () => {
    const dashboard = readAppFile('public', 'dashboard.html');
    const gcceUi = readAppFile('plugins', 'gcce', 'ui.html');
    const gccePlugin = readAppFile('plugins', 'gcce', 'index.js');

    assert(dashboard.includes('data-view="gcce" data-plugin="gcce"'));
    assert(!dashboard.includes('data-view="gcce-hud"'));
    assert(!dashboard.includes('view-gcce-hud'));
    assert(!dashboard.includes('/plugins/gcce-hud/'));

    assert(gcceUi.includes('data-tab="hud"'));
    assert(gcceUi.includes('/plugins/gcce/overlay-hud'));
    assert(gccePlugin.includes("'/plugins/gcce/overlay-hud'"));
  });
});

function readAppFile(...segments) {
  return fs.readFileSync(path.join(appRoot, ...segments), 'utf8');
}
