const fs = require('fs');
const path = require('path');

describe('Fireworks renderer capability contract', () => {
  const overlayPath = path.join(__dirname, '..', 'plugins', 'fireworks', 'overlay.html');
  const enginePath = path.join(__dirname, '..', 'plugins', 'fireworks', 'gpu', 'engine.js');
  const gpuDir = path.join(__dirname, '..', 'plugins', 'fireworks', 'gpu');
  const manifestPath = path.join(__dirname, '..', 'plugins', 'fireworks', 'plugin.json');
  let overlayHtml;
  let engineJs;

  beforeAll(() => {
    overlayHtml = fs.readFileSync(overlayPath, 'utf8');
    engineJs = fs.readFileSync(enginePath, 'utf8');
  });

  test('overlay does not expose the removed worker bootstrap', () => {
    expect(overlayHtml).not.toContain('FIREWORKS_USE_WORKER');
    expect(overlayHtml).not.toContain('fireworks-worker.js');
    expect(fs.existsSync(path.join(gpuDir, 'fireworks-worker.js'))).toBe(false);
    expect(fs.existsSync(path.join(gpuDir, 'engine.js.backup'))).toBe(false);
    expect(fs.existsSync(path.join(gpuDir, 'engine.js.webgl-only'))).toBe(false);
  });

  test('engine exposes configuration for worker consumption', () => {
    expect(engineJs).toContain('window.FIREWORKS_CONFIG');
  });

  test('engine advertises only its implemented WebGL2 and Canvas renderers', () => {
    expect(engineJs).not.toContain('window.FIREWORKS_USE_WORKER');
    expect(engineJs).not.toContain('navigator.gpu');
    expect(engineJs).toContain("rendererMode = 'webgl'");
    expect(engineJs).toContain("rendererMode = 'canvas'");
  });

  test('renderer selection happens before a canvas context is acquired', () => {
    const engineClassStart = engineJs.indexOf('class FireworksEngine');
    const constructorSection = engineJs.slice(
      engineClassStart,
      engineJs.indexOf('async init()', engineClassStart)
    );
    expect(constructorSection).toContain('this.ctx = null');
    expect(constructorSection).not.toContain("this.canvas.getContext('2d')");
    expect(engineJs).toContain('replaceRenderCanvas()');
  });

  test('renderer lifecycle cleans up animation, resize, socket, and WebGL resources', () => {
    expect(engineJs).toContain('cancelAnimationFrame(this.animationFrameId)');
    expect(engineJs).toContain("window.removeEventListener('resize', this.resizeHandler)");
    expect(engineJs).toContain('this.disposeRenderer(true)');
    expect(engineJs).toContain("window.addEventListener('pagehide'");
  });

  test('plugin manifest describes the implemented renderers without WebGPU claims', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(manifest.version).toBe('2.0.1');
    expect(manifest.description).toContain('WebGL2');
    expect(manifest.description).toContain('Canvas 2D fallback');
    expect(manifest.description).not.toContain('WebGPU');
  });
});
