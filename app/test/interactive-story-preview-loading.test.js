'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');

describe('Interactive Story overlay preview loading', () => {
  test('loads the real overlay only when the user opens the preview', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', 'interactive-story', 'ui.html'), 'utf8');
    const helperIndex = source.indexOf('function ensureOverlayPreviewLoaded()');
    const toggleIndex = source.indexOf('function toggleOverlayPreview()');

    expect(source).not.toContain('if (overlayFrame) overlayFrame.src = overlayUrl;');
    expect(helperIndex).toBeGreaterThan(-1);
    expect(toggleIndex).toBeGreaterThan(helperIndex);
    expect(source).toMatch(/if \(container\.style\.display === 'none'\) \{\s+ensureOverlayPreviewLoaded\(\);/);
    expect(source).toContain("if (!previewFrame || previewFrame.getAttribute('src')) return;");
  });

  test('does not let the theme observer trigger itself on an unchanged theme', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', 'interactive-story', 'ui.html'), 'utf8');

    expect(source).toContain("themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });");
    expect(source).toContain("if (document.documentElement.getAttribute('data-theme') !== theme) {");
    expect(source).toContain("document.documentElement.setAttribute('data-theme', theme);");
  });
});
