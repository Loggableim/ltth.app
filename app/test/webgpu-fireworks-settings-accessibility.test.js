'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const pluginRoot = path.join(__dirname, '..', 'plugins', 'webgpu-fireworks');
const read = relative => fs.readFileSync(path.join(pluginRoot, relative), 'utf8');

describe('WebGPU Fireworks settings switches', () => {
  test('uses named native switches with synchronized state', () => {
    const document = new JSDOM(read('ui/settings.html')).window.document;
    const switches = [...document.querySelectorAll('.toggle-switch')];

    expect(switches).toHaveLength(19);
    for (const toggle of switches) {
      expect(toggle.tagName).toBe('BUTTON');
      expect(toggle.type).toBe('button');
      expect(toggle.getAttribute('role')).toBe('switch');
      expect(toggle.hasAttribute('aria-checked')).toBe(true);
      expect(document.querySelector(`label[for="${toggle.id}"]`)).not.toBeNull();
    }

    const source = read('ui/settings.js');
    expect(source).toContain("toggle.setAttribute('aria-checked', String(enabled))");
  });

  test('binds adaptive and frame-skip switches exactly once through the shared handler', () => {
    const source = read('ui/settings.js');

    expect(source).toContain("document.querySelectorAll('.toggle-switch[data-config]')");
    expect(source).not.toContain("document.getElementById('adaptive-toggle')?.addEventListener('click'");
    expect(source).not.toContain("document.getElementById('frame-skip-toggle')?.addEventListener('click'");
  });
});
