const fs = require('fs');
const path = require('path');

describe('docs screenshot capture viewport', () => {
  test('keeps screenshot clip coordinates within the viewport after scrolling', () => {
    const { screenshotClipForAnchor } = require('../../scripts/lib/capture-framing');
    const viewport = {
      scrollX: 0,
      scrollY: 536,
      scrollWidth: 1440,
      clientWidth: 1440,
      height: 900,
      scrollHeight: 13259
    };
    const anchorRect = { left: 84, top: 18.28125, width: 1272, height: 938 };

    expect(screenshotClipForAnchor(viewport, anchorRect)).toEqual({
      x: 400,
      y: 207,
      width: 640,
      height: 560
    });
  });

  test('focuses an anchor vertically without horizontally panning the page', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'scripts', 'capture-product-screenshots.js'),
      'utf8'
    );
    const framingSource = fs.readFileSync(
      path.join(__dirname, '..', '..', 'scripts', 'lib', 'capture-framing.js'),
      'utf8'
    );

    expect(source).toContain("anchor.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })");
    expect(source).toContain("window.scrollTo({ left: 0, top: window.scrollY, behavior: 'instant' })");
    expect(source).toContain("SCREENSHOT_WAIT_AFTER_LOAD_MS || 1500");
    expect(source).toContain("require('./lib/capture-framing')");
    expect(framingSource).toContain('function screenshotClipForAnchor');
    expect(framingSource).toContain('const requestedWidth = crop?.width || 640;');
    expect(framingSource).toContain('const requestedHeight = crop?.height || 560;');
    expect(framingSource).toContain('const width = Math.min(viewport.clientWidth, requestedWidth);');
    expect(source).toContain('asset.workflow.captureRule.imageCrop');
    expect(framingSource).toContain('x: Math.round(Math.max(0, Math.min(anchorCenterX - (width / 2), maxX)))');
    expect(source).toContain("await page.screenshot({ path: temporaryPath, type: 'png', clip: screenshotClip })");
  });

  test('defines the required 1440 by 900 product capture window for every guide action', () => {
    const spec = require('../../scripts/docs-screenshot-spec');
    const docs = spec.buildDocsSpec(path.join(__dirname, '..', '..'));

    expect(docs.viewport).toEqual({ width: 1440, height: 900, deviceScaleFactor: 1 });
    expect(docs.assets.every((asset) => Boolean(asset.viewport))).toBe(true);
    expect(docs.assets.find((asset) => asset.id === 'stream-monsters__alchemy-card').viewport).toEqual({
      width: 1440,
      height: 1040,
      deviceScaleFactor: 1
    });
    expect(docs.assets.find((asset) => asset.id === 'stream-monsters__retention-rules').viewport).toEqual({
      width: 1440,
      height: 1200,
      deviceScaleFactor: 1
    });
    expect(docs.assets.find((asset) => asset.id === 'stream-monsters__automation-rule').viewport).toEqual({
      width: 1440,
      height: 3400,
      deviceScaleFactor: 1
    });
    expect(docs.assets.find((asset) => asset.id === 'stream-monsters__action-chain').viewport).toEqual({
      width: 1440,
      height: 2300,
      deviceScaleFactor: 1
    });
    expect(docs.assets.find((asset) => asset.id === 'stream-monsters__rule-reset').viewport).toEqual({
      width: 1440,
      height: 1600,
      deviceScaleFactor: 1
    });
    expect(docs.assets.filter((asset) => !['stream-monsters__alchemy-card', 'stream-monsters__retention-rules', 'stream-monsters__automation-rule', 'stream-monsters__action-chain', 'stream-monsters__rule-dry-run', 'stream-monsters__rule-reset'].includes(asset.id))
      .every((asset) => asset.viewport.width === 1440 && asset.viewport.height === 900)).toBe(true);
  });

  test('frames the whole portrait battle card with title and explanation without simulating it', () => {
    const spec = require('../../scripts/docs-screenshot-spec');
    const docs = spec.buildDocsSpec(path.join(__dirname, '..', '..'));
    const asset = docs.assets.find((entry) => entry.id === 'stream-monsters__rule-dry-run');
    const { screenshotClipForAnchor } = require('../../scripts/lib/capture-framing');
    // Source-based candidate only: card bounds are estimated from the fixed
    // 300x533 preview CSS and its existing title/caption, not browser-measured.
    const plannedCardBounds = { left: 728, top: 110, width: 628, height: 615 };
    const previewBounds = { left: 892, top: 143, width: 300, height: 533 };
    const clip = screenshotClipForAnchor({
      scrollX: 0,
      scrollY: 6400,
      scrollWidth: 1440,
      clientWidth: 1440,
      height: 820,
      scrollHeight: 13259
    }, previewBounds, asset.workflow.captureRule.imageCrop);

    expect(asset.selector).toBe('#portraitBattlePreview');
    expect(asset.workflow.captureRule).toMatchObject({
      selector: '#portraitBattlePreview',
      viewport: { width: 1440, height: 820 },
      imageCrop: { width: 760, height: 720 },
      stateChange: false
    });
    expect(asset.viewport).toEqual({ width: 1440, height: 820, deviceScaleFactor: 1 });
    expect(clip).toEqual({ x: 662, y: 50, width: 760, height: 720 });
    expect(clip.x).toBeLessThanOrEqual(plannedCardBounds.left);
    expect(clip.x + clip.width).toBeGreaterThanOrEqual(plannedCardBounds.left + plannedCardBounds.width);
    expect(clip.y).toBeLessThanOrEqual(plannedCardBounds.top);
    expect(clip.y + clip.height).toBeGreaterThanOrEqual(plannedCardBounds.top + plannedCardBounds.height);
    expect(asset.workflow.operations).toEqual([
      { type: 'goto', route: '/stream-monsters/ui' },
      { type: 'open-plugin-surface', selector: '#portraitBattlePreview' }
    ]);
    expect(asset.workflow.operations.some((operation) => ['click', 'fill', 'run-local-preview'].includes(operation.type)))
      .toBe(false);
  });

  test('separates the OBS URL workflow target from its OBS Browser Source card clip anchor', () => {
    const spec = require('../../scripts/docs-screenshot-spec');
    const docs = spec.buildDocsSpec(path.join(__dirname, '..', '..'));
    const asset = docs.assets.find((entry) => entry.id === 'stream-monsters__alchemy-overlay');
    const { screenshotClipForAnchor } = require('../../scripts/lib/capture-framing');
    const plannedCardBounds = { left: 512, top: 330, width: 415, height: 235 };
    const clip = screenshotClipForAnchor({
      scrollX: 0,
      scrollY: 4700,
      scrollWidth: 1440,
      clientWidth: 1440,
      height: 900,
      scrollHeight: 13259
    }, plannedCardBounds, asset.workflow.captureRule.imageCrop);
    const captureSource = fs.readFileSync(
      path.join(__dirname, '..', '..', 'scripts', 'capture-product-screenshots.js'),
      'utf8'
    );

    expect(asset.selector).toBe('#overlayUrl');
    expect(asset.clipSelector).toBe('.area#live-center .grid > .card:nth-child(2)');
    expect(asset.workflow.operations).toEqual([
      { type: 'goto', route: '/stream-monsters/ui' },
      { type: 'open-plugin-surface', selector: '#overlayUrl' }
    ]);
    expect(asset.workflow.postconditions).toContainEqual({ type: 'visible', selector: '#overlayUrl' });
    expect(asset.workflow.captureRule).toMatchObject({
      selector: '#overlayUrl',
      clipSelector: asset.clipSelector,
      viewport: { width: 1440, height: 900 },
      imageCrop: { width: 520, height: 440 },
      stateChange: false
    });
    expect(asset.viewport).toEqual({ width: 1440, height: 900, deviceScaleFactor: 1 });
    expect(clip).toEqual({ x: 460, y: 228, width: 520, height: 440 });
    expect(clip.x).toBeLessThanOrEqual(plannedCardBounds.left);
    expect(clip.x + clip.width).toBeGreaterThanOrEqual(plannedCardBounds.left + plannedCardBounds.width);
    expect(clip.y).toBeLessThanOrEqual(plannedCardBounds.top);
    expect(clip.y + clip.height).toBeGreaterThanOrEqual(plannedCardBounds.top + plannedCardBounds.height);
    expect(docs.assets.filter((entry) => entry.id !== 'stream-monsters__alchemy-overlay')
      .every((entry) => !entry.clipSelector)).toBe(true);
    expect(captureSource).toContain('await assertRenderedAnchor(page, asset.clipSelector)');
    expect(captureSource).toContain('state.clipRect || state.anchorRect');
  });

  test('frames the viewer, season badge, empty collection, and leaderboards without resetting viewer data', () => {
    const spec = require('../../scripts/docs-screenshot-spec');
    const docs = spec.buildDocsSpec(path.join(__dirname, '..', '..'));
    const asset = docs.assets.find((entry) => entry.id === 'stream-monsters__rule-reset');
    const { screenshotClipForAnchor } = require('../../scripts/lib/capture-framing');
    // Source-based envelope only: not measured in the browser. Covers the full-width
    // community section plus its viewer, maintenance, and seasonal leaderboard rows.
    const plannedSectionBounds = { left: 84, top: 55, width: 1272, height: 1450 };
    const clip = screenshotClipForAnchor({
      scrollX: 0,
      scrollY: 9300,
      scrollWidth: 1440,
      clientWidth: 1440,
      height: 1600,
      scrollHeight: 13259
    }, plannedSectionBounds, asset.workflow.captureRule.imageCrop);

    expect(asset.selector).toBe('#community-seasons');
    expect(asset.workflow.operations).toEqual([
      { type: 'goto', route: '/stream-monsters/ui' },
      { type: 'open-plugin-surface', selector: '#community-seasons' }
    ]);
    expect(asset.workflow.captureRule).toMatchObject({
      selector: '#community-seasons',
      viewport: { width: 1440, height: 1600 },
      imageCrop: { width: 1400, height: 1560 },
      stateChange: false
    });
    expect(asset.viewport).toEqual({ width: 1440, height: 1600, deviceScaleFactor: 1 });
    expect(clip).toEqual({ x: 20, y: 0, width: 1400, height: 1560 });
    expect(clip.x).toBeLessThanOrEqual(plannedSectionBounds.left);
    expect(clip.x + clip.width).toBeGreaterThanOrEqual(plannedSectionBounds.left + plannedSectionBounds.width);
    expect(clip.y).toBeLessThanOrEqual(plannedSectionBounds.top);
    expect(clip.y + clip.height).toBeGreaterThanOrEqual(plannedSectionBounds.top + plannedSectionBounds.height);
  });

  test('frames the asset summary, bounded stage gallery, and complete dex in an unmeasured envelope', () => {
    const spec = require('../../scripts/docs-screenshot-spec');
    const docs = spec.buildDocsSpec(path.join(__dirname, '..', '..'));
    const asset = docs.assets.find((entry) => entry.id === 'stream-monsters__action-chain');
    const { screenshotClipForAnchor } = require('../../scripts/lib/capture-framing');
    // Source-derived planning envelope only. Browser CSS geometry is unmeasured.
    const plannedSectionBounds = { left: 84, top: 100, width: 1272, height: 2100 };
    const clip = screenshotClipForAnchor({
      scrollX: 0,
      scrollY: 7200,
      scrollWidth: 1440,
      clientWidth: 1440,
      height: 2300,
      scrollHeight: 13259
    }, plannedSectionBounds, asset.workflow.captureRule.imageCrop);

    expect(asset.workflow.captureRule).toMatchObject({
      selector: '#asset-library',
      viewport: { width: 1440, height: 2300 },
      imageCrop: { width: 1400, height: 2260 },
      stateChange: false
    });
    expect(asset.viewport).toEqual({ width: 1440, height: 2300, deviceScaleFactor: 1 });
    expect(clip).toEqual({ x: 20, y: 20, width: 1400, height: 2260 });
    expect(clip.x).toBeLessThanOrEqual(plannedSectionBounds.left);
    expect(clip.x + clip.width).toBeGreaterThanOrEqual(plannedSectionBounds.left + plannedSectionBounds.width);
    expect(clip.y).toBeLessThanOrEqual(plannedSectionBounds.top);
    expect(clip.y + clip.height).toBeGreaterThanOrEqual(plannedSectionBounds.top + plannedSectionBounds.height);
  });

  test('frames the complete gift/mapping/alias section within an explicit unmeasured envelope', () => {
    const spec = require('../../scripts/docs-screenshot-spec');
    const docs = spec.buildDocsSpec(path.join(__dirname, '..', '..'));
    const asset = docs.assets.find((entry) => entry.id === 'stream-monsters__automation-rule');
    const { screenshotClipForAnchor } = require('../../scripts/lib/capture-framing');
    // Conservative source-planning bounds only. No browser geometry is claimed.
    const plannedSectionBounds = { left: 84, top: 50, width: 1272, height: 3300 };
    const clip = screenshotClipForAnchor({
      scrollX: 0,
      scrollY: 4200,
      scrollWidth: 1440,
      clientWidth: 1440,
      height: 3400,
      scrollHeight: 13259
    }, plannedSectionBounds, asset.workflow.captureRule.imageCrop);

    expect(asset.workflow.captureRule).toMatchObject({
      selector: '#gifts-chat',
      viewport: { width: 1440, height: 3400 },
      imageCrop: { width: 1400, height: 3360 },
      stateChange: false
    });
    expect(asset.viewport).toEqual({ width: 1440, height: 3400, deviceScaleFactor: 1 });
    expect(clip).toEqual({ x: 20, y: 20, width: 1400, height: 3360 });
    expect(clip.x).toBeLessThanOrEqual(plannedSectionBounds.left);
    expect(clip.x + clip.width).toBeGreaterThanOrEqual(plannedSectionBounds.left + plannedSectionBounds.width);
    expect(clip.y).toBeLessThanOrEqual(plannedSectionBounds.top);
    expect(clip.y + clip.height).toBeGreaterThanOrEqual(plannedSectionBounds.top + plannedSectionBounds.height);
  });

  test('gives retention-rules a source-based full-section frame with explicit unmeasured geometry', () => {
    const spec = require('../../scripts/docs-screenshot-spec');
    const docs = spec.buildDocsSpec(path.join(__dirname, '..', '..'));
    const asset = docs.assets.find((entry) => entry.id === 'stream-monsters__retention-rules');
    const { screenshotClipForAnchor } = require('../../scripts/lib/capture-framing');
    // Conservative test envelope derived from the desktop section structure,
    // deliberately synthetic: only a local browser run can supply actual CSS pixels.
    const plannedSectionBounds = { left: 84, top: 50, width: 1272, height: 1100 };
    const clip = screenshotClipForAnchor({
      scrollX: 0,
      scrollY: 4200,
      scrollWidth: 1440,
      clientWidth: 1440,
      height: 1200,
      scrollHeight: 13259
    }, plannedSectionBounds, asset.workflow.captureRule.imageCrop);

    expect(asset.workflow.captureRule).toMatchObject({
      selector: '#gameplay',
      viewport: { width: 1440, height: 1200 },
      imageCrop: { width: 1400, height: 1160 },
      stateChange: false
    });
    expect(asset.viewport).toEqual({ width: 1440, height: 1200, deviceScaleFactor: 1 });
    expect(clip).toEqual({ x: 20, y: 20, width: 1400, height: 1160 });
    expect(clip.x).toBeLessThanOrEqual(plannedSectionBounds.left);
    expect(clip.x + clip.width).toBeGreaterThanOrEqual(plannedSectionBounds.left + plannedSectionBounds.width);
    expect(clip.y).toBeLessThanOrEqual(plannedSectionBounds.top);
    expect(clip.y + clip.height).toBeGreaterThanOrEqual(plannedSectionBounds.top + plannedSectionBounds.height);
  });

  test('frames the complete measured Live Center inside the selected viewport crop', () => {
    const spec = require('../../scripts/docs-screenshot-spec');
    const docs = spec.buildDocsSpec(path.join(__dirname, '..', '..'));
    const asset = docs.assets.find((entry) => entry.id === 'stream-monsters__alchemy-card');
    const { screenshotClipForAnchor } = require('../../scripts/lib/capture-framing');
    const anchorRect = { left: 84, top: 51, width: 1272, height: 938 };
    const clip = screenshotClipForAnchor({
      scrollX: 0,
      scrollY: 536,
      scrollWidth: 1440,
      clientWidth: 1440,
      height: 1040,
      scrollHeight: 13259
    }, anchorRect, asset.workflow.captureRule.imageCrop);

    expect(asset.workflow.captureRule).toMatchObject({
      selector: '#live-center',
      viewport: { width: 1440, height: 1040 },
      imageCrop: { width: 1400, height: 1000 },
      stateChange: false
    });
    expect(asset.viewport).toEqual({ width: 1440, height: 1040, deviceScaleFactor: 1 });
    expect(clip).toEqual({ x: 20, y: 20, width: 1400, height: 1000 });
    expect(clip.x).toBeLessThanOrEqual(anchorRect.left);
    expect(clip.x + clip.width).toBeGreaterThanOrEqual(anchorRect.left + anchorRect.width);
    expect(clip.y).toBeLessThanOrEqual(anchorRect.top);
    expect(clip.y + clip.height).toBeGreaterThanOrEqual(anchorRect.top + anchorRect.height);
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

  test('does not treat the deliberately blocked external request as a product console error', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'scripts', 'capture-product-screenshots.js'),
      'utf8'
    );

    expect(source).toContain('function isBlockedExternalRequestConsoleError(message) {');
    expect(source).toContain("message.text().includes('net::ERR_BLOCKED_BY_CLIENT')");
    expect(source).toContain('if (isBlockedExternalRequestConsoleError(message)) return;');
  });

  test('records only isolated local network requests and stores that evidence in every receipt', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'scripts', 'capture-product-screenshots.js'),
      'utf8'
    );

    expect(source).toContain('page.__docsCaptureNetwork = [];');
    expect(source).toContain('const url = request.url();');
    expect(source).toContain('if (!isAllowedCaptureNetworkUrl(url)) {');
    expect(source).toContain("request.abort('blockedbyclient')");
    expect(source).toContain('if (/^https?:/i.test(url) && isAllowedCaptureNetworkUrl(url)) {');
    expect(source).toContain('network: page.__docsCaptureNetwork');
    expect(source).toContain("if (COLLECTION === 'docs' && !START_APP) {");
  });

  test('uses one request handler for local evidence and external blocking', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'scripts', 'capture-product-screenshots.js'),
      'utf8'
    );
    const configureStart = source.indexOf('async function configurePage');
    const configureEnd = source.indexOf('async function synchronizeCaptureLocale');
    const interceptionStart = source.indexOf('async function attachPluginAssetRewrite');
    const interceptionEnd = source.indexOf('function freePort');

    expect(configureStart).toBeGreaterThan(-1);
    expect(interceptionStart).toBeGreaterThan(-1);
    expect(source.slice(configureStart, configureEnd)).not.toContain("page.on('request'");
    const interception = source.slice(interceptionStart, interceptionEnd);
    expect(interception).toContain('page.__docsCaptureNetwork.push({');
    expect(interception).toContain("if (!isAllowedCaptureNetworkUrl(url)) {");
  });

  test('keeps unrelated receipts unchanged during a partial capture', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'scripts', 'capture-product-screenshots.js'),
      'utf8'
    );
    const manifestSource = fs.readFileSync(
      path.join(__dirname, '..', '..', 'scripts', 'lib', 'capture-manifest.js'),
      'utf8'
    );

    expect(source).toContain('return mergePartialCaptureOutputs(existingOutputs, newOutputs);');
    expect(manifestSource).toContain('function mergePartialCaptureOutputs(existingOutputs, newOutputs) {');
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

  test('keeps the signed-out Store capture on its real local UI without synthetic API responses', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'scripts', 'capture-product-screenshots.js'),
      'utf8'
    );

    expect(source).not.toContain('STORE_ADMIN_OPTIONAL_API_RESPONSES');
    expect(source).toContain("asset.action.prepare === 'open-store-admin-view'");
    expect(source).toContain("window.NavigationManager.switchView('plugins')");
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
    expect(source).toContain("if (window.I18n && typeof window.I18n.load === 'function') {");
    expect(source).toContain('await window.I18n.load(lang);');
    expect(source).toContain('window.I18n.apply?.();');
  });

  test('waits for a page i18n client to finish initialization before changing its locale', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'scripts', 'capture-product-screenshots.js'),
      'utf8'
    );

    expect(source).toContain('async function synchronizeCaptureLocale(page, locale)');
    expect(source).toContain("typeof window.i18n.setLocale !== 'function'");
    expect(source).toContain('window.i18n.initialized !== false');
    expect(source).toContain('await synchronizeCaptureLocale(page, locale);');
  });

  test('records checkbox interactions when the already-enabled control is exercised before it is restored', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'scripts', 'capture-product-screenshots.js'),
      'utf8'
    );

    expect(source).toContain('let exercised = false;');
    expect(source).toContain('exercised = true;');
    expect(source).toContain('changed: before.value !== after.value || before.checked !== after.checked || exercised');
  });

  test('uses the documented emoji example for the Emoji Rain input capture', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'scripts', 'capture-product-screenshots.js'),
      'utf8'
    );

    expect(source).toContain("'emoji-rain/choose-emojis': '💧, ✨, 🎉'");
  });
});
