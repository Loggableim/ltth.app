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
});
