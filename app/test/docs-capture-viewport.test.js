const fs = require('fs');
const path = require('path');

describe('docs screenshot capture viewport', () => {
  test('focuses an anchor vertically without horizontally panning the page', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'scripts', 'capture-product-screenshots.js'),
      'utf8'
    );

    expect(source).toContain("anchor.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })");
    expect(source).toContain("window.scrollTo({ left: 0, top: window.scrollY, behavior: 'instant' })");
    expect(source).toContain("SCREENSHOT_WAIT_AFTER_LOAD_MS || 1500");
    expect(source).toContain('function screenshotClipForAnchor');
    expect(source).toContain('const width = Math.min(viewport.clientWidth, 640);');
    expect(source).toContain('x: Math.round(Math.max(0, Math.min(anchorCenterX - (width / 2), maxX)))');
    expect(source).toContain("await page.screenshot({ path: target, type: 'png', clip: screenshotClip })");
  });

  test('defines the required 1440 by 900 product capture window for every guide action', () => {
    const spec = require('../../scripts/docs-screenshot-spec');
    const docs = spec.buildDocsSpec(path.join(__dirname, '..', '..'));

    expect(docs.viewport).toEqual({ width: 1440, height: 900, deviceScaleFactor: 1 });
    expect(docs.assets.every((asset) => asset.viewport.width === 1440 && asset.viewport.height === 900)).toBe(true);
  });

  test('waits for a document root before applying capture locale and theme state', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'scripts', 'capture-product-screenshots.js'),
      'utf8'
    );

    expect(source).toContain('function applyCaptureDocumentSettings(lang) {');
    expect(source).toContain('const root = document.documentElement;');
    expect(source).toContain("document.addEventListener('DOMContentLoaded', () => applyCaptureDocumentSettings(lang), { once: true });");
    expect(source).toContain('await page.evaluateOnNewDocument(applyCaptureDocumentSettings, locale);');
  });

  test('captures declared selector-specific postconditions instead of only the screenshot anchor', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'scripts', 'capture-product-screenshots.js'),
      'utf8'
    );

    expect(source).toContain('const observedSelectors = [...new Set([');
    expect(source).toContain('asset.workflow.postconditions.map((condition) => condition.selector)');
    expect(source).toContain('controls: Object.fromEntries(selectors.map((selector) => {');
  });

  test('starts each asset with a fresh console-evidence window', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'scripts', 'capture-product-screenshots.js'),
      'utf8'
    );
    const captureAsset = source.slice(source.indexOf('async function captureAsset'));

    expect(captureAsset).toContain('page.__docsCaptureConsoleErrors = [];');
    expect(captureAsset.indexOf('page.__docsCaptureConsoleErrors = [];'))
      .toBeLessThan(captureAsset.indexOf('await page.goto('));
  });

  test('keeps the browser source location with each captured console error', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'scripts', 'capture-product-screenshots.js'),
      'utf8'
    );

    expect(source).toContain('const location = message.location();');
    expect(source).toContain('location.url ? `${message.text()} (${location.url}:${location.lineNumber})` : message.text()');
  });

  test('does not rewrite shared font assets into plugin paths', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'scripts', 'capture-product-screenshots.js'),
      'utf8'
    );

    expect(source).toContain("['api', 'js', 'css', 'images', 'assets', 'fonts', 'locales']");
  });

  test('preserves the registered runtime routes for dynamic overlay dependencies', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'scripts', 'capture-product-screenshots.js'),
      'utf8'
    );

    expect(source).toContain("const RUNTIME_PLUGIN_ROUTE_PREFIXES = new Set(['flame-overlay', 'visual-fx-frame-webgpu']);");
    expect(source).toContain('RUNTIME_PLUGIN_ROUTE_PREFIXES.has(match[1])');
  });

  test('keeps the signed-out Store capture isolated while declaring optional dashboard APIs unavailable', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'scripts', 'capture-product-screenshots.js'),
      'utf8'
    );

    expect(source).toContain('const STORE_ADMIN_OPTIONAL_API_RESPONSES = Object.freeze({');
    expect(source).toContain("if (guideId !== 'store-admin') return false;");
    expect(source).toContain('request.respond({');
  });

  test('creates a local goal before navigating to its overlay URL', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'scripts', 'capture-product-screenshots.js'),
      'utf8'
    );

    expect(source).toContain('async function prepareGoalsOverlay(page, baseUrl, asset, locale)');
    expect(source).toContain("overlayUrl.searchParams.set('id', goalId);");
    expect(source).toContain("asset.action.prepare === 'create-demo-goal-overlay'");
  });

  test('synchronizes the dashboard i18n client before recording locale evidence', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'scripts', 'capture-product-screenshots.js'),
      'utf8'
    );

    expect(source).toContain("if (window.i18n && typeof window.i18n.setLocale === 'function') {");
    expect(source).toContain('await window.i18n.setLocale(lang);');
    expect(source).toContain('window.i18n.updateDOM?.();');
  });

  test('uses the documented emoji example for the Emoji Rain input capture', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'scripts', 'capture-product-screenshots.js'),
      'utf8'
    );

    expect(source).toContain("'emoji-rain/choose-emojis': '💧, ✨, 🎉'");
  });
});
