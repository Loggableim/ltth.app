'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { buildGuides } = require('./plugin-tutorial-source');

const ROOT = path.resolve(__dirname, '..');

function sourceFileFor(route) {
  const pathname = route.split('?')[0];
  if (pathname.startsWith('/api/bridge/')) return null;
  if (pathname === '/api-bridge/ui') return path.join(ROOT, 'app', 'plugins', 'api-bridge', 'ui.html');
  if (pathname === '/emoji-rain/ui') return path.join(ROOT, 'app', 'plugins', 'emoji-rain', 'ui.html');
  if (pathname === '/emoji-rain/overlay') return path.join(ROOT, 'app', 'plugins', 'emoji-rain', 'overlay.html');
  if (pathname.startsWith('/emoji-rain/obs-hud')) return path.join(ROOT, 'app', 'plugins', 'emoji-rain', 'obs-hud.html');
  if (pathname === '/clarityhud/ui') return path.join(ROOT, 'app', 'plugins', 'clarityhud', 'ui', 'main.html');
  if (pathname === '/overlay/clarity/full') return path.join(ROOT, 'app', 'plugins', 'clarityhud', 'overlays', 'full.html');
  if (pathname === '/webgpu-fireworks/overlay') return path.join(ROOT, 'app', 'plugins', 'webgpu-fireworks', 'overlay.html');
  if (pathname === '/webgpu-fireworks/ui') return path.join(ROOT, 'app', 'plugins', 'webgpu-fireworks', 'ui', 'settings.html');
  if (pathname === '/goals/overlay') return path.join(ROOT, 'app', 'plugins', 'goals', 'overlay', 'index.html');
  if (pathname === '/flame-overlay/ui') return path.join(ROOT, 'app', 'plugins', 'flame-overlay', 'ui', 'settings.html');
  if (pathname === '/flame-overlay/overlay') return path.join(ROOT, 'app', 'plugins', 'flame-overlay', 'renderer', 'index.html');
  if (pathname === '/visual-fx-frame-webgpu/ui') return path.join(ROOT, 'plugin-store', 'sources', 'visual-fx-frame-webgpu', 'ui', 'settings.html');
  if (pathname === '/visual-fx-frame-webgpu/overlay') return path.join(ROOT, 'plugin-store', 'sources', 'visual-fx-frame-webgpu', 'renderer', 'index.html');
  if (pathname.startsWith('/dashboard.html')) return path.join(ROOT, 'app', 'public', 'dashboard.html');
  return path.join(ROOT, 'app', pathname.replace(/^\//, ''));
}

function sourceContainsSelector(source, selector) {
  if (selector === 'pre') return true;
  const id = selector.match(/^#([A-Za-z0-9_-]+)$/);
  if (id) return source.includes(`id="${id[1]}"`) || source.includes(`id='${id[1]}'`);
  const className = selector.match(/^\.([A-Za-z0-9_-]+)$/);
  if (className) return new RegExp(`class=["'][^"']*\\b${className[1]}\\b`).test(source) || source.includes(className[1]);
  const href = selector.match(/^a\[href="([^"]+)"\]$/);
  if (href) return source.includes(`href="${href[1]}"`) || source.includes(`href='${href[1]}'`);
  if (selector === 'button[data-action="preview"][data-type="chatter"]') {
    return source.includes('data-action="preview"')
      && source.includes('data-type="${type.id}"')
      && source.includes("id: 'chatter'");
  }
  if (selector === '.plugin-mode-btn[data-plugin-mode="store"]') {
    return source.includes('plugin-mode-btn') && source.includes('data-plugin-mode="store"');
  }
  const dataAttribute = selector.match(/^\[([A-Za-z0-9_-]+)(?:="([^"]+)")?\]$/);
  if (dataAttribute) {
    const [, attribute, value] = dataAttribute;
    return source.includes(attribute) && (!value || source.includes(value));
  }
  return false;
}

function renderedSurfaceSource(file) {
  const html = fs.readFileSync(file, 'utf8');
  const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)]
    .map((match) => match[1].split('?')[0])
    .filter((src) => src.startsWith('/'))
    .map((src) => src.startsWith('/js/')
      ? path.join(ROOT, 'app', 'public', src.replace(/^\//, ''))
      : path.join(ROOT, 'app', src.replace(/^\//, '')))
    .filter((scriptFile) => fs.existsSync(scriptFile))
    .map((scriptFile) => fs.readFileSync(scriptFile, 'utf8'));
  // Some product forms, including Spotlight's overlay settings, are rendered
  // by their own shipped local script after the page loads. Keep the source
  // assertion tied to scripts referenced by this exact surface instead of
  // allowing selectors from unrelated plugin files.
  return [html, ...scripts].join('\n');
}

for (const guide of buildGuides(ROOT)) {
  for (const step of guide.steps) {
    const file = sourceFileFor(step.capture.route);
    if (!file) {
      assert.strictEqual(step.capture.assertVisible, 'pre', `${guide.id}/${step.id} API response needs its JSON <pre> anchor`);
      continue;
    }
    assert.ok(fs.existsSync(file), `${guide.id}/${step.id} references a missing product surface: ${step.capture.route}`);
    const source = renderedSurfaceSource(file);
    assert.ok(sourceContainsSelector(source, step.capture.assertVisible), `${guide.id}/${step.id} selector ${step.capture.assertVisible} is absent from ${step.capture.route}`);
  }
}

console.log('OK: every tutorial capture selector resolves to a shipped product surface.');
