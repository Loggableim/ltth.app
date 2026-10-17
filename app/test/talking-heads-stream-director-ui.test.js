'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const pluginRoot = path.join(__dirname, '..', 'plugins', 'talking-heads');

function response(body) {
  return {
    ok: true,
    json: jest.fn().mockResolvedValue(body)
  };
}

function flush() {
  return new Promise(resolve => setImmediate(resolve));
}

describe('Talking Heads Broadcast Arcade Stream Director', () => {
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('keeps live health, Boba lab, overlay setup, and advanced workflows visibly separated', () => {
    const html = fs.readFileSync(path.join(pluginRoot, 'ui.html'), 'utf8');
    const document = new JSDOM(html).window.document;

    expect(document.querySelector('main[data-surface="broadcast-arcade"]')).not.toBeNull();
    expect(document.getElementById('liveBridgeHealth')).not.toBeNull();
    expect(document.getElementById('bobaCharacterLab')).not.toBeNull();
    expect(document.getElementById('overlaySetup')).not.toBeNull();
    expect(document.querySelector('details#advancedSettings')).not.toBeNull();
    expect(document.getElementById('manualSetsPanel')).not.toBeNull();
    expect(document.getElementById('cachePanel')).not.toBeNull();
    expect(document.getElementById('viewerBarPanel')).not.toBeNull();
    expect(document.getElementById('localOverlayUrl')).not.toBeNull();
    expect(document.getElementById('publicOverlayUrl')).not.toBeNull();
    expect(document.querySelector('[data-copy-tiktok-studio-url][data-overlay-url-source="#publicOverlayUrl"]'))
      .not.toBeNull();
    expect(document.body.textContent).not.toContain('!keep');
    expect(document.body.textContent).not.toContain('!reroll');
  });

  test('sends the Character Lab Test Spin only to its local preview route', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    const html = fs.readFileSync(path.join(pluginRoot, 'ui.html'), 'utf8');
    const source = fs.readFileSync(path.join(pluginRoot, 'assets', 'ui.js'), 'utf8');
    const dom = new JSDOM(html, {
      url: 'http://127.0.0.1:3000/plugins/talking-heads/ui.html',
      pretendToBeVisual: true
    });
    const fetchImpl = jest.fn(async (url, options = {}) => {
      if (url === '/api/talkingheads/config') {
        return response({
          success: true,
          config: {
            enabled: true,
            assetPack: 'boba',
            assetCharacter: 'Fox',
            assetOptions: {},
            firstAssignmentEnabled: true,
            rerollGiftEnabled: true,
            rerollGiftNames: ['Heart Me'],
            spinDurationMs: 2600
          },
          assetCatalog: {
            packs: [{
              id: 'boba',
              name: 'Boba Animals',
              characters: ['Fox'],
              options: { expression: ['Default', 'Happy'] }
            }]
          }
        });
      }
      if (url === '/api/talkingheads/status') {
        return response({ success: true, status: { enabled: true, rendererBridge: { available: true } } });
      }
      if (url === '/api/talkingheads/test-spin') {
        return response({ success: true, preview: true, spin: { spinId: 'preview-spin-id' } });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    const context = {
      window: dom.window,
      document: dom.window.document,
      fetch: fetchImpl,
      console,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      URL
    };
    dom.window.i18n = { t: jest.fn(() => '') };
    vm.runInNewContext(source, context, { filename: 'talking-heads-ui.js' });

    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
    await flush();
    await flush();
    const button = dom.window.document.getElementById('testSpinBtn');

    expect(button).not.toBeNull();
    button.click();
    await flush();

    expect(fetchImpl).toHaveBeenCalledWith('/api/talkingheads/test-spin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    expect(fetchImpl.mock.calls.map(([url]) => url)).not.toContain('/api/talkingheads/preview-tts');
  });

  test('renders Boba artwork cards and materializes the selected usable frame preview', async () => {
    const html = fs.readFileSync(path.join(pluginRoot, 'ui.html'), 'utf8');
    const source = fs.readFileSync(path.join(pluginRoot, 'assets', 'ui.js'), 'utf8');
    const dom = new JSDOM(html, {
      url: 'http://127.0.0.1:3000/plugins/talking-heads/ui.html',
      pretendToBeVisual: true
    });
    const fetchImpl = jest.fn(async (url, options = {}) => {
      if (url === '/api/talkingheads/config') {
        return response({
          success: true,
          config: {
            enabled: true,
            assetPack: 'boba',
            assetCharacter: 'Fox',
            assetOptions: { expression: 'Default' },
            firstAssignmentEnabled: true,
            rerollGiftEnabled: true,
            rerollGiftNames: ['Heart Me'],
            spinDurationMs: 2600
          },
          assetCatalog: {
            packs: [{
              id: 'boba',
              name: 'Boba Animals',
              characters: ['Fox', 'Bear'],
              options: { expression: ['Default', 'Happy'] }
            }]
          }
        });
      }
      if (url === '/api/talkingheads/status') {
        return response({ success: true, status: { enabled: true, rendererBridge: { available: true } } });
      }
      if (url === '/api/talkingheads/test-generate') {
        const selection = JSON.parse(options.body || '{}');
        return response({
          success: true,
          spriteUrls: {
            idle_neutral: `/api/talkingheads/sprite/${selection.assetCharacter}-${selection.assetOptions?.expression || 'Default'}.svg`
          }
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    const context = {
      window: dom.window,
      document: dom.window.document,
      fetch: fetchImpl,
      console,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      URL
    };
    dom.window.i18n = { t: jest.fn(() => '') };
    vm.runInNewContext(source, context, { filename: 'talking-heads-ui.js' });

    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
    await flush();
    await flush();
    await flush();

    const grid = dom.window.document.getElementById('bobaThumbnailGrid');
    const preview = dom.window.document.getElementById('assetPreview');
    expect(grid.querySelectorAll('.boba-thumbnail img')).toHaveLength(2);
    expect(grid.querySelector('.boba-thumbnail img').getAttribute('src'))
      .toContain('/plugins/talking-heads/assets/asset-packs/boba/animals/Fox/Ready-To-Use/Fox.png');
    expect(preview.getAttribute('src')).toBe('/api/talkingheads/sprite/Fox-Default.svg');

    const character = dom.window.document.getElementById('assetCharacter');
    character.value = 'Bear';
    character.dispatchEvent(new dom.window.Event('change'));
    await flush();
    await flush();

    expect(preview.getAttribute('src')).toBe('/api/talkingheads/sprite/Bear-Default.svg');
  });

  test('materializes a generic frame before confirming a non-Boba Character Lab selection', async () => {
    const html = fs.readFileSync(path.join(pluginRoot, 'ui.html'), 'utf8');
    const source = fs.readFileSync(path.join(pluginRoot, 'assets', 'ui.js'), 'utf8');
    const styles = fs.readFileSync(path.join(pluginRoot, 'assets', 'ui.css'), 'utf8');
    const dom = new JSDOM(html, {
      url: 'http://127.0.0.1:3000/plugins/talking-heads/ui.html',
      pretendToBeVisual: true
    });
    const style = dom.window.document.createElement('style');
    style.textContent = styles;
    dom.window.document.head.appendChild(style);
    const fetchImpl = jest.fn(async (url, options = {}) => {
      if (url === '/api/talkingheads/config') {
        return response({
          success: true,
          config: {
            enabled: true,
            assetPack: 'boba',
            assetCharacter: 'Fox',
            assetOptions: { expression: 'Default' },
            firstAssignmentEnabled: true,
            rerollGiftEnabled: true,
            rerollGiftNames: ['Heart Me'],
            spinDurationMs: 2600
          },
          assetCatalog: {
            packs: [
              { id: 'boba', name: 'Boba Animals', characters: ['Fox'], options: { expression: ['Default'] } },
              { id: 'kenney', name: 'Kenney Monster Builder', characters: ['blueA'], options: { eye: ['human'] } }
            ]
          }
        });
      }
      if (url === '/api/talkingheads/status') {
        return response({ success: true, status: { enabled: true, rendererBridge: { available: true } } });
      }
      if (url === '/api/talkingheads/test-generate') {
        const selection = JSON.parse(options.body || '{}');
        return response({
          success: true,
          spriteUrls: { idle_neutral: `/api/talkingheads/sprite/${selection.assetPack}-${selection.assetCharacter}.svg` }
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    const context = {
      window: dom.window,
      document: dom.window.document,
      fetch: fetchImpl,
      console,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      URL
    };
    dom.window.i18n = { t: jest.fn(() => '') };
    vm.runInNewContext(source, context, { filename: 'talking-heads-ui.js' });

    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
    await flush();
    await flush();
    await flush();

    const pack = dom.window.document.getElementById('assetPack');
    pack.value = 'kenney';
    pack.dispatchEvent(new dom.window.Event('change'));
    await flush();
    await flush();

    const preview = dom.window.document.getElementById('assetPreview');
    const grid = dom.window.document.getElementById('bobaThumbnailGrid');
    expect(preview.getAttribute('src')).toBe('/api/talkingheads/sprite/kenney-blueA.svg');
    expect(grid.hidden).toBe(true);
    expect(dom.window.getComputedStyle(grid).display).toBe('none');
    expect(grid.getClientRects()).toHaveLength(0);
    expect(grid.querySelectorAll('.boba-thumbnail')).toHaveLength(0);
    expect(fetchImpl).toHaveBeenCalledWith('/api/talkingheads/test-generate', expect.objectContaining({
      body: expect.stringContaining('"assetPack":"kenney"')
    }));

    pack.value = 'boba';
    pack.dispatchEvent(new dom.window.Event('change'));
    await flush();
    await flush();

    expect(grid.hidden).toBe(false);
    expect(dom.window.getComputedStyle(grid).display).toBe('grid');
    expect(grid.querySelectorAll('.boba-thumbnail')).toHaveLength(1);
  });

  test('renders all nameplate and animation controls in Stream Director UI', () => {
    const html = fs.readFileSync(path.join(pluginRoot, 'ui.html'), 'utf8');
    const document = new JSDOM(html).window.document;

    const card = document.getElementById('nameplateAnimationSettings');
    expect(card).not.toBeNull();
    expect(card.classList.contains('director-card--nameplate')).toBe(true);

    const ids = [
      'nameplatePosition',
      'nameplateFontFamily',
      'nameplateFontSize',
      'nameplateFontColor',
      'nameplateBackgroundColor',
      'nameplateBackgroundOpacity',
      'opacityValue',
      'nameplateTextShadow',
      'nameplateTextStroke',
      'headEntranceAnimation',
      'headExitAnimation',
      'nameplateEntranceAnimation',
      'nameplateExitAnimation',
      'saveNameplateSettingsBtn',
      'nameplatePreviewBox',
      'nameplatePreviewAvatar',
      'nameplatePreviewHead',
      'nameplatePreviewName'
    ];

    for (const id of ids) {
      expect(document.getElementById(id)).not.toBeNull();
    }
  });

  test('loads, previews, and saves nameplate & animation configurations in Stream Director UI', async () => {
    const html = fs.readFileSync(path.join(pluginRoot, 'ui.html'), 'utf8');
    const source = fs.readFileSync(path.join(pluginRoot, 'assets', 'ui.js'), 'utf8');
    const dom = new JSDOM(html, {
      url: 'http://127.0.0.1:3000/plugins/talking-heads/ui.html',
      pretendToBeVisual: true
    });

    let savedPayload = null;
    const initialConfig = {
      enabled: true,
      assetPack: 'boba',
      assetCharacter: 'Fox',
      assetOptions: { expression: 'Default' },
      firstAssignmentEnabled: true,
      rerollGiftEnabled: true,
      rerollGiftNames: ['Heart Me'],
      spinDurationMs: 2600,
      nameplatePosition: 'below',
      nameplateFontFamily: 'Impact, fantasy, sans-serif',
      nameplateFontSize: 18,
      nameplateFontColor: '#00ffcc',
      nameplateBackgroundColor: '#102030',
      nameplateBackgroundOpacity: 0.8,
      nameplateTextShadow: 'glow',
      nameplateTextStroke: '1px black',
      headEntranceAnimation: 'bounce',
      headExitAnimation: 'fade',
      nameplateEntranceAnimation: 'pop',
      nameplateExitAnimation: 'slide-down'
    };

    const fetchImpl = jest.fn(async (url, options = {}) => {
      if (url === '/api/talkingheads/config') {
        if (options.method === 'POST') {
          savedPayload = JSON.parse(options.body || '{}');
          return response({ success: true, config: savedPayload });
        }
        return response({
          success: true,
          config: initialConfig,
          assetCatalog: {
            packs: [{ id: 'boba', name: 'Boba Animals', characters: ['Fox'] }]
          }
        });
      }
      if (url === '/api/talkingheads/status') {
        return response({ success: true, status: { enabled: true, rendererBridge: { available: true } } });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const context = {
      window: dom.window,
      document: dom.window.document,
      fetch: fetchImpl,
      console,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      URL
    };
    dom.window.i18n = { t: jest.fn((k) => k) };
    vm.runInNewContext(source, context, { filename: 'talking-heads-ui.js' });

    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
    await flush();
    await flush();

    const doc = dom.window.document;
    expect(doc.getElementById('nameplatePosition').value).toBe('below');
    expect(doc.getElementById('nameplateFontFamily').value).toBe('Impact, fantasy, sans-serif');
    expect(doc.getElementById('nameplateFontSize').value).toBe('18');
    expect(doc.getElementById('nameplateFontColor').value).toBe('#00ffcc');
    expect(doc.getElementById('nameplateBackgroundColor').value).toBe('#102030');
    expect(doc.getElementById('nameplateBackgroundOpacity').value).toBe('0.8');
    expect(doc.getElementById('opacityValue').textContent).toBe('80%');
    expect(doc.getElementById('nameplateTextShadow').value).toBe('glow');
    expect(doc.getElementById('nameplateTextStroke').value).toBe('1px black');
    expect(doc.getElementById('headEntranceAnimation').value).toBe('bounce');
    expect(doc.getElementById('headExitAnimation').value).toBe('fade');
    expect(doc.getElementById('nameplateEntranceAnimation').value).toBe('pop');
    expect(doc.getElementById('nameplateExitAnimation').value).toBe('slide-down');

    // Check preview box styling updated by applyConfig
    const previewName = doc.getElementById('nameplatePreviewName');
    expect(previewName.style.fontFamily).toBe('Impact, fantasy, sans-serif');
    expect(previewName.style.fontSize).toBe('18px');
    expect(previewName.style.color).toBe('rgb(0, 255, 204)');

    // Simulate modifying controls
    doc.getElementById('nameplatePosition').value = 'above';
    doc.getElementById('nameplateFontSize').value = '24';
    doc.getElementById('nameplateFontSize').dispatchEvent(new dom.window.Event('input'));
    expect(previewName.style.fontSize).toBe('24px');

    doc.getElementById('nameplateFontColor').value = '#ff0055';
    doc.getElementById('nameplateFontColor').dispatchEvent(new dom.window.Event('input'));
    expect(previewName.style.color).toBe('rgb(255, 0, 85)');

    doc.getElementById('nameplateBackgroundOpacity').value = '0.5';
    doc.getElementById('nameplateBackgroundOpacity').dispatchEvent(new dom.window.Event('input'));
    expect(doc.getElementById('opacityValue').textContent).toBe('50%');

    // Click Save button
    const saveBtn = doc.getElementById('saveNameplateSettingsBtn');
    saveBtn.click();
    await flush();
    await flush();

    expect(fetchImpl).toHaveBeenCalledWith('/api/talkingheads/config', expect.objectContaining({
      method: 'POST'
    }));
    expect(savedPayload).toMatchObject({
      nameplatePosition: 'above',
      nameplateFontSize: 24,
      nameplateFontColor: '#ff0055',
      nameplateBackgroundColor: '#102030',
      nameplateBackgroundOpacity: 0.5,
      nameplateTextShadow: 'glow',
      nameplateTextStroke: '1px black',
      headEntranceAnimation: 'bounce',
      headExitAnimation: 'fade',
      nameplateEntranceAnimation: 'pop',
      nameplateExitAnimation: 'slide-down'
    });
  });
});
