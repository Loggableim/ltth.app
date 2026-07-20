const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const APP_DIR = path.join(__dirname, '..');
const variants = [
  'plugins/emoji-rain/ui.html',
  'plugins/webgpu-emoji-rain/ui.html'
];

describe.each(variants)('%s command editor layout', file => {
  const html = fs.readFileSync(path.join(APP_DIR, file), 'utf8');
  const document = new JSDOM(html).window.document;

  test('uses a full-width editor card outside the SuperFan card', () => {
    const editor = document.getElementById('animal-command-editor');
    const card = editor.closest('.emoji-command-editor-card');

    expect(card).not.toBeNull();
    expect(card.classList.contains('config-section')).toBe(true);
    expect(card.parentElement.classList.contains('settings-grid')).toBe(true);
    expect(card.querySelector('#superfan_burst_enabled')).toBeNull();
    expect(html).toMatch(/\.emoji-command-editor-card\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s);
  });

  test('prevents hidden image controls and row overflow', () => {
    expect(html).toMatch(/\.emoji-command-editor\s+\[hidden\]\s*\{[^}]*display:\s*none\s*!important/s);
    expect(html).toMatch(/\.emoji-command-editor__row\s*>\s*\*\s*\{[^}]*min-width:\s*0/s);
    expect(html).toMatch(/\.emoji-command-editor__row\s*\{[^}]*grid-template-columns:[^;]*minmax\(0,/s);
  });
});
