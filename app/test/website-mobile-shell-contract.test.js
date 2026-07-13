const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const websiteRoot = path.join(__dirname, '..', '..');

function getCssBlock(source, atRule) {
  const atRuleIndex = source.indexOf(atRule);
  const openingBraceIndex = source.indexOf('{', atRuleIndex);
  let depth = 1;

  for (let index = openingBraceIndex + 1; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(openingBraceIndex + 1, index);
  }

  throw new Error(`Missing closing brace for ${atRule}`);
}

function getCssBlocks(source, atRule) {
  const blocks = [];
  let searchIndex = 0;
  let atRuleIndex = source.indexOf(atRule, searchIndex);

  while (atRuleIndex !== -1) {
    const blockSource = source.slice(atRuleIndex);
    const block = getCssBlock(blockSource, atRule);

    blocks.push(block);
    searchIndex = atRuleIndex + atRule.length + block.length + 2;
    atRuleIndex = source.indexOf(atRule, searchIndex);
  }

  return blocks;
}

describe('public website mobile shell contract', () => {
  let headerHtml;
  let headerDocument;
  let layoutCss;
  let layoutJs;
  let flowEngineDocument;

  beforeAll(() => {
    headerHtml = fs.readFileSync(path.join(websiteRoot, '_partials', 'header.html'), 'utf8');
    headerDocument = new JSDOM(headerHtml).window.document;
    layoutCss = fs.readFileSync(path.join(websiteRoot, 'css', 'layout.css'), 'utf8');
    layoutJs = fs.readFileSync(path.join(websiteRoot, 'js', 'layout.js'), 'utf8');
    flowEngineDocument = new JSDOM(
      fs.readFileSync(path.join(websiteRoot, 'features', 'flow-engine.html'), 'utf8')
    ).window.document;
  });

  test('keeps the Features destination separate from its mobile accordion control', () => {
    const featuresLink = headerDocument.querySelector('a[href="/features/"][data-page="features"]');
    const featuresController = headerDocument.getElementById('featuresMenuToggle');
    const featuresPanel = headerDocument.getElementById('featuresMegaPanel');

    expect(featuresLink).not.toBeNull();
    expect(featuresLink.getAttribute('aria-controls')).toBeNull();
    expect(featuresLink.getAttribute('aria-expanded')).toBeNull();
    expect(featuresController).not.toBeNull();
    expect(featuresController.tagName).toBe('BUTTON');
    expect(featuresController.getAttribute('aria-controls')).toBe('featuresMegaPanel');
    expect(featuresController.getAttribute('aria-expanded')).toBe('false');
    expect(headerDocument.querySelectorAll('[aria-controls="featuresMegaPanel"]')).toHaveLength(1);
    expect(featuresPanel).not.toBeNull();
    expect(featuresPanel.classList.contains('nav-mega-panel')).toBe(true);
  });

  test('exposes the compact beta notice through an explicit control and content relationship', () => {
    const betaController = headerDocument.getElementById('betaBannerToggle');
    const betaContent = headerDocument.getElementById('betaBannerContent');

    expect(betaController).not.toBeNull();
    expect(betaController.tagName).toBe('BUTTON');
    expect(betaController.getAttribute('aria-controls')).toBe('betaBannerContent');
    expect(betaController.getAttribute('aria-expanded')).toBe('false');
    expect(betaContent).not.toBeNull();
    expect(betaContent.classList.contains('beta-content')).toBe(true);
    expect(getCssBlocks(layoutCss, '@media (max-width: 767px)').join('\n')).toMatch(
      /\.beta-banner-toggle\s*{[^}]*display:\s*(?:inline-)?flex;/m
    );
  });

  test('uses the shared mobile stack class for Flow Engine screenshots', () => {
    const screenshotGrid = flowEngineDocument.querySelector('.screenshot-container')?.parentElement;

    expect(screenshotGrid).not.toBeNull();
    expect(screenshotGrid.classList.contains('site-split-grid')).toBe(true);
  });

  test('removes the navbar fixed-position containing block on mobile', () => {
    const mobileShellCss = getCssBlocks(layoutCss, '@media (max-width: 767px)').join('\n');

    expect(mobileShellCss).toMatch(/\.navbar\s*{[^}]*backdrop-filter:\s*none;/m);
    expect(mobileShellCss).toMatch(/\.navbar\s*{[^}]*-webkit-backdrop-filter:\s*none;/m);
  });

  test('does not leave navigation behavior behind at the 768px breakpoint', () => {
    const legacyMobileCss = getCssBlocks(layoutCss, '@media (max-width: 768px)').join('\n');

    expect(legacyMobileCss).not.toMatch(/\.nav-menu\s*{/m);
    expect(legacyMobileCss).not.toMatch(/\.nav-mega(?:\s|[.{])/m);
  });

  test('uses the 767px mobile cutoff for the Features mega menu', () => {
    expect(layoutJs).toMatch(/const\s+isMobile\s*=\s*\(\)\s*=>\s*window\.innerWidth\s*<=\s*767\s*;/m);
  });

  test('defines the mobile navigation as a viewport-bounded drawer below the measured header', () => {
    expect(layoutCss).toMatch(
      /@media\s*\(max-width:\s*767px\)\s*{[\s\S]*?\.nav-menu\s*{[\s\S]*?position:\s*fixed;[\s\S]*?top:\s*var\(--site-header-height\);[\s\S]*?height:\s*calc\(100dvh\s*-\s*var\(--site-header-height\)\);[\s\S]*?max-height:\s*calc\(100dvh\s*-\s*var\(--site-header-height\)\);[\s\S]*?overflow-y:\s*auto;/m
    );
  });
});
