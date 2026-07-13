'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { buildGuides } = require('./plugin-tutorial-source');

const ROOT = path.resolve(__dirname, '..');

function sourceFileFor(route) {
  if (route.startsWith('/api/bridge/')) return null;
  if (route === '/api-bridge/ui') return path.join(ROOT, 'app', 'plugins', 'api-bridge', 'ui.html');
  if (route === '/clarityhud/ui') return path.join(ROOT, 'app', 'plugins', 'clarityhud', 'ui', 'main.html');
  if (route === '/overlay/clarity/full') return path.join(ROOT, 'app', 'plugins', 'clarityhud', 'overlays', 'full.html');
  if (route === '/webgpu-fireworks/overlay') return path.join(ROOT, 'app', 'plugins', 'webgpu-fireworks', 'overlay.html');
  if (route === '/visual-fx-frame-webgpu/ui') return path.join(ROOT, 'plugin-store', 'sources', 'visual-fx-frame-webgpu', 'ui', 'settings.html');
  if (route === '/visual-fx-frame-webgpu/overlay') return path.join(ROOT, 'plugin-store', 'sources', 'visual-fx-frame-webgpu', 'renderer', 'index.html');
  if (route.startsWith('/dashboard.html')) return path.join(ROOT, 'app', 'public', 'dashboard.html');
  return path.join(ROOT, 'app', route.replace(/^\//, ''));
}

function sourceContainsSelector(source, selector) {
  if (selector === 'pre') return true;
  const id = selector.match(/^#([A-Za-z0-9_-]+)$/);
  if (id) return source.includes(`id="${id[1]}"`) || source.includes(`id='${id[1]}'`);
  if (selector === '.plugin-mode-btn[data-plugin-mode="store"]') {
    return source.includes('plugin-mode-btn') && source.includes('data-plugin-mode="store"');
  }
  return false;
}

for (const guide of buildGuides(ROOT)) {
  for (const step of guide.steps) {
    const file = sourceFileFor(step.capture.route);
    if (!file) {
      assert.strictEqual(step.capture.assertVisible, 'pre', `${guide.id}/${step.id} API response needs its JSON <pre> anchor`);
      continue;
    }
    assert.ok(fs.existsSync(file), `${guide.id}/${step.id} references a missing product surface: ${step.capture.route}`);
    const source = fs.readFileSync(file, 'utf8');
    assert.ok(sourceContainsSelector(source, step.capture.assertVisible), `${guide.id}/${step.id} selector ${step.capture.assertVisible} is absent from ${step.capture.route}`);
  }
}

console.log('OK: every tutorial capture selector resolves to a shipped product surface.');
