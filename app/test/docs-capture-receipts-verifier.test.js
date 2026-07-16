'use strict';

const { validateDocsCaptureReceipts } = require('../../scripts/verify-docs-capture-receipts');

describe('documentation CaptureReceipt verifier', () => {
  const asset = {
    id: 'example__preview',
    guideId: 'example',
    stepId: 'preview',
    route: '/plugins/example/ui.html',
    workflow: {
      operations: [{ type: 'goto', route: '/plugins/example/ui.html' }],
      postconditions: [{ type: 'visible', selector: '#preview' }],
      captureRule: { stateChange: false }
    }
  };

  function manifest(receipt) {
    return {
      outputs: [{
        id: asset.id,
        locale: 'en',
        path: 'screenshots/docs/plugins/example/preview.png',
        sha256: 'a'.repeat(64),
        receipt
      }]
    };
  }

  function receipt(overrides = {}) {
    return {
      schemaVersion: 2,
      plugin: 'example',
      language: 'en',
      route: '/plugins/example/ui.html',
      screenshotPath: 'screenshots/docs/plugins/example/preview.png',
      sha256: 'a'.repeat(64),
      operations: asset.workflow.operations,
      postconditions: [
        { type: 'visible', selector: '#preview', actual: true, passed: true },
        { type: 'screenshot-hash', actual: 'a'.repeat(64), passed: true }
      ],
      network: [{ url: 'http://127.0.0.1:3000/plugins/example/ui.html' }],
      blockedNetwork: [],
      console: [],
      interactions: [],
      ...overrides
    };
  }

  test('rejects missing, failed, or externally-tainted receipt evidence', () => {
    expect(validateDocsCaptureReceipts({ manifest: manifest(receipt()), assets: [asset], locales: ['en'] }))
      .toEqual({ receiptCount: 1 });
    expect(() => validateDocsCaptureReceipts({
      manifest: manifest(receipt({ network: [{ url: 'https://example.com/tracker.js' }] })),
      assets: [asset],
      locales: ['en']
    })).toThrow('non-local network request');
    expect(() => validateDocsCaptureReceipts({
      manifest: manifest(receipt({ blockedNetwork: [{
        attempted: true,
        disposition: 'blocked',
        url: 'https://example.com/tracker.js'
      }] })),
      assets: [asset],
      locales: ['en']
    })).toThrow('blocked external network attempt');
    expect(() => validateDocsCaptureReceipts({
      manifest: manifest(receipt({ postconditions: [{ type: 'visible', passed: false }] })),
      assets: [asset],
      locales: ['en']
    })).toThrow('failed postcondition');
  });
});
