const fs = require('fs');
const path = require('path');

describe('Fireworks Worker Mode Bootstrap', () => {
  const overlayPath = path.join(__dirname, '..', 'plugins', 'fireworks', 'overlay.html');
  const enginePath = path.join(__dirname, '..', 'plugins', 'fireworks', 'gpu', 'engine.js');
  let overlayHtml;
  let engineJs;

  beforeAll(() => {
    overlayHtml = fs.readFileSync(overlayPath, 'utf8');
    engineJs = fs.readFileSync(enginePath, 'utf8');
  });

  test('overlay sets worker flag with OffscreenCanvas detection', () => {
    expect(overlayHtml).toContain('FIREWORKS_USE_WORKER');
    expect(overlayHtml).toContain('OffscreenCanvas');
    expect(overlayHtml).toContain('transferControlToOffscreen');
  });

  test('engine exposes configuration for worker consumption', () => {
    expect(engineJs).toContain('window.FIREWORKS_CONFIG');
  });

  test('engine respects worker mode and skips main-thread init', () => {
    expect(engineJs).toContain('window.FIREWORKS_USE_WORKER');
  });
});
