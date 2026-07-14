const { createCaptureReceipt } = require('../../scripts/lib/capture-receipt');

describe('CaptureReceipt workflow evidence', () => {
  test('records declared operations and evaluates real workflow postconditions', () => {
    const workflow = {
      operations: [
        { type: 'goto', route: '/plugins/example/ui.html' },
        { type: 'set-demo-value', selector: '#title' }
      ],
      postconditions: [
        { type: 'http-status', expected: '< 400' },
        { type: 'url', expected: '/plugins/example/ui.html' },
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
      preparation: [{ type: 'activate-tab', selector: '[data-tab="main"]' }]
    });

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
});
