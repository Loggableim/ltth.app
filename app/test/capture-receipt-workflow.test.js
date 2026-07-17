const { assertNoBlockedNetworkAttempts, createCaptureReceipt, isAllowedCaptureNetworkUrl } = require('../../scripts/lib/capture-receipt');

describe('CaptureReceipt workflow evidence', () => {
  test('rejects every blocked external network attempt', () => {
    expect(() => assertNoBlockedNetworkAttempts([])).not.toThrow();
    expect(() => assertNoBlockedNetworkAttempts([{
      attempted: true,
      disposition: 'blocked',
      url: 'https://example.com/tracker.js'
    }])).toThrow('blocked external network attempt');
  });

  test('allows inline data assets while continuing to reject remote URLs', () => {
    expect(isAllowedCaptureNetworkUrl('data:image/svg+xml,%3Csvg%20/%3E')).toBe(true);
    expect(isAllowedCaptureNetworkUrl('http://127.0.0.1:43111/css/themes.css')).toBe(true);
    expect(isAllowedCaptureNetworkUrl('https://cdn.tailwindcss.com/')).toBe(false);
  });

  test('records declared operations and evaluates real workflow postconditions', () => {
    const workflow = {
      operations: [
        { type: 'goto', route: '/plugins/example/ui.html' },
        { type: 'set-demo-value', selector: '#title' }
      ],
      postconditions: [
        { type: 'http-status', expected: 200 },
        { type: 'url', expected: '/plugins/example/ui.html?lang=en' },
        { type: 'visible', selector: '#title' },
        { type: 'console', expected: 'no-errors' }
      ]
    };
    const receipt = createCaptureReceipt({
      asset: { guideId: 'example', route: '/plugins/example/ui.html', workflow },
      locale: 'en',
      appVersion: '1.2.3',
      screenshotPath: 'screenshots/docs/plugins/example/title.png',
      sha256: 'a'.repeat(64),
      httpStatus: 200,
      state: { route: '/plugins/example/ui.html?lang=en', anchorRect: { width: 100, height: 30 } },
      consoleErrors: [],
      network: [
        { url: 'http://127.0.0.1:43111/plugins/example/ui.html?lang=en', method: 'GET', resourceType: 'document' },
        { url: 'http://localhost:43111/api/plugins/example', method: 'GET', resourceType: 'fetch' }
      ],
      preparation: [{ type: 'activate-tab', selector: '[data-tab="main"]' }]
    });

    expect(receipt).toEqual(expect.objectContaining({
      schemaVersion: 2,
      network: expect.arrayContaining([
        expect.objectContaining({ url: 'http://127.0.0.1:43111/plugins/example/ui.html?lang=en' })
      ]),
      console: []
    }));
    expect(receipt.operations).toEqual(workflow.operations);
    expect(receipt.postconditions).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'http-status', passed: true }),
      expect.objectContaining({ type: 'url', passed: true }),
      expect.objectContaining({ type: 'visible', passed: true }),
      expect.objectContaining({ type: 'console', passed: true }),
      expect.objectContaining({ type: 'screenshot-hash', passed: true })
    ]));
    expect(receipt.postconditions.every((condition) => condition.passed)).toBe(true);
  });

  test('evaluates selector-specific input, checked, text, and overlay evidence', () => {
    const workflow = {
      operations: [{ type: 'goto', route: '/emoji-rain/ui' }, { type: 'set-demo-value', selector: '#emoji_set' }],
      postconditions: [
        { type: 'input-value', selector: '#emoji_set', expected: 'LTTH docs demo' },
        { type: 'checked', selector: '#enabled-toggle', expected: true },
        { type: 'text', selector: '#notification', expected: 'Test emojis spawned.' },
        { type: 'overlay-output', selector: '#canvas-container', expected: true }
      ]
    };
    const receipt = createCaptureReceipt({
      asset: { guideId: 'emoji-rain', route: '/emoji-rain/ui', workflow },
      locale: 'en',
      appVersion: '1.2.3',
      screenshotPath: 'screenshots/docs/plugins/emoji-rain/test.png',
      sha256: 'b'.repeat(64),
      httpStatus: 200,
      consoleErrors: [],
      state: {
        route: '/emoji-rain/ui?lang=en',
        anchorRect: { width: 100, height: 30 },
        controls: {
          '#emoji_set': { value: 'LTTH docs demo', visible: true },
          '#enabled-toggle': { checked: true, visible: true },
          '#notification': { text: 'Test emojis spawned.', visible: true },
          '#canvas-container': { overlay: true, visible: true }
        }
      }
    });

    expect(receipt.postconditions.every((condition) => condition.passed)).toBe(true);
  });

  test('resolves a localized workflow expectation for the captured locale', () => {
    const receipt = createCaptureReceipt({
      asset: {
        guideId: 'emoji-rain',
        route: '/emoji-rain/ui',
        workflow: {
          operations: [{ type: 'goto', route: '/emoji-rain/ui' }],
          postconditions: [{
            type: 'text',
            selector: '#notification',
            expected: { de: 'Test-Emojis wurden erzeugt.', en: 'Test emojis spawned.', es: 'Se generaron emojis de prueba.', fr: 'Les emoji de test ont été générés.' }
          }]
        }
      },
      locale: 'es',
      appVersion: '1.2.3',
      screenshotPath: 'screenshots/docs/plugins/emoji-rain/test.png',
      sha256: 'c'.repeat(64),
      httpStatus: 200,
      consoleErrors: [],
      state: {
        route: '/emoji-rain/ui?lang=es',
        anchorRect: { width: 100, height: 30 },
        controls: { '#notification': { text: 'Se generaron emojis de prueba.', visible: true } }
      }
    });

    expect(receipt.postconditions[0]).toEqual(expect.objectContaining({
      expected: 'Se generaron emojis de prueba.',
      passed: true
    }));
  });

  test('rejects network evidence outside the isolated local app and console errors', () => {
    const asset = {
      guideId: 'example',
      route: '/plugins/example/ui.html',
      workflow: {
        operations: [{ type: 'goto', route: '/plugins/example/ui.html' }],
        postconditions: [{ type: 'visible', selector: '#title' }]
      }
    };
    const baseReceipt = {
      asset,
      locale: 'en',
      appVersion: '1.2.3',
      screenshotPath: 'screenshots/docs/plugins/example/title.png',
      sha256: 'd'.repeat(64),
      httpStatus: 200,
      state: { route: '/plugins/example/ui.html?lang=en', anchorRect: { width: 100, height: 30 } }
    };

    expect(() => createCaptureReceipt({
      ...baseReceipt,
      network: [{ url: 'https://example.com/tracker.js', method: 'GET', resourceType: 'script' }]
    })).toThrow('non-local network request');
    expect(() => createCaptureReceipt({
      ...baseReceipt,
      consoleErrors: ['Uncaught TypeError: demo failure']
    })).toThrow('browser console errors');
  });

  test('records a performed local interaction and verifies its declared state effect', () => {
    const receipt = createCaptureReceipt({
      asset: {
        guideId: 'example',
        route: '/plugins/example/ui.html',
        workflow: {
          operations: [{ type: 'set-demo-value', selector: '#title' }],
          postconditions: [{
            type: 'interaction',
            selector: '#title',
            expected: { type: 'set-demo-value', changed: true }
          }]
        }
      },
      locale: 'en',
      appVersion: '1.2.3',
      screenshotPath: 'screenshots/docs/plugins/example/title.png',
      sha256: 'e'.repeat(64),
      httpStatus: 200,
      state: { route: '/plugins/example/ui.html?lang=en', anchorRect: { width: 100, height: 30 } },
      interactions: [{
        type: 'set-demo-value',
        selector: '#title',
        status: 'performed',
        before: { value: '' },
        after: { value: 'LTTH docs example' },
        changed: true
      }]
    });

    expect(receipt.interactions).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'set-demo-value', selector: '#title', changed: true })
    ]));
    expect(receipt.postconditions[0]).toEqual(expect.objectContaining({ type: 'interaction', passed: true }));
  });

  test('requires the observed HTTP status to equal the declared status', () => {
    const receipt = createCaptureReceipt({
      asset: {
        guideId: 'example',
        route: '/plugins/example/ui.html',
        workflow: {
          operations: [{ type: 'goto', route: '/plugins/example/ui.html' }],
          postconditions: [{ type: 'http-status', expected: 200 }]
        }
      },
      locale: 'en',
      appVersion: '1.2.3',
      screenshotPath: 'screenshots/docs/plugins/example/status.png',
      sha256: 'f'.repeat(64),
      httpStatus: 201,
      state: { route: '/plugins/example/ui.html' }
    });

    expect(receipt.postconditions[0]).toEqual(expect.objectContaining({ actual: 201, expected: 200, passed: false }));
  });

  test('requires the observed URL query string to equal the declared URL', () => {
    const receipt = createCaptureReceipt({
      asset: {
        guideId: 'example',
        route: '/plugins/example/ui.html',
        workflow: {
          operations: [{ type: 'goto', route: '/plugins/example/ui.html?lang=en' }],
          postconditions: [{ type: 'url', expected: '/plugins/example/ui.html?lang=en' }]
        }
      },
      locale: 'en',
      appVersion: '1.2.3',
      screenshotPath: 'screenshots/docs/plugins/example/url.png',
      sha256: '0'.repeat(64),
      httpStatus: 200,
      state: { route: '/plugins/example/ui.html?lang=de' }
    });

    expect(receipt.postconditions[0]).toEqual(expect.objectContaining({
      actual: '/plugins/example/ui.html?lang=de',
      expected: '/plugins/example/ui.html?lang=en',
      passed: false
    }));
  });

  test('accepts only SHA-256 screenshot hashes', () => {
    const receipt = createCaptureReceipt({
      asset: {
        guideId: 'example',
        route: '/plugins/example/ui.html',
        workflow: {
          operations: [{ type: 'goto', route: '/plugins/example/ui.html' }],
          postconditions: [{ type: 'visible', selector: '#title' }]
        }
      },
      locale: 'en',
      appVersion: '1.2.3',
      screenshotPath: 'screenshots/docs/plugins/example/hash.png',
      sha256: 'not-a-sha256',
      httpStatus: 200,
      state: { route: '/plugins/example/ui.html', anchorRect: { width: 100, height: 30 } }
    });

    expect(receipt.postconditions.at(-1)).toEqual(expect.objectContaining({
      type: 'screenshot-hash',
      actual: 'not-a-sha256',
      passed: false
    }));
  });
});
