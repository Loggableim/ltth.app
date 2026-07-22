'use strict';

const path = require('path');

const {
  buildObsCaptureInventory,
  localOverlayUrl,
  OBS_DOCS_CAPTURE_LOCALES,
  EXPECTED_OVERLAY_GUIDE_COUNT
} = require('../../scripts/lib/obs-docs-capture-inventory');

describe('OBS documentation capture inventory', () => {
  const repoRoot = path.join(__dirname, '..', '..');
  const expectedCaptureCount = EXPECTED_OVERLAY_GUIDE_COUNT * OBS_DOCS_CAPTURE_LOCALES.length;

  test('requires one declared, localized OBS capture per overlay guide', () => {
    const captures = buildObsCaptureInventory(repoRoot, { baseUrl: 'http://127.0.0.1:3000' });

    expect(OBS_DOCS_CAPTURE_LOCALES).toEqual(['de', 'en', 'es', 'fr']);
    expect(captures).toHaveLength(expectedCaptureCount);
    expect(new Set(captures.map((capture) => `${capture.plugin}:${capture.locale}`)).size).toBe(expectedCaptureCount);
    expect(new Set(captures.map((capture) => capture.plugin)).size).toBe(EXPECTED_OVERLAY_GUIDE_COUNT);
    expect(captures).toEqual(expect.arrayContaining([
      expect.objectContaining({
        plugin: 'emoji-rain',
        locale: 'de',
        overlayUrl: 'http://127.0.0.1:3000/emoji-rain/obs-hud?lang=de',
        width: expect.any(Number),
        height: expect.any(Number)
      })
    ]));
    for (const capture of captures) {
      expect(capture.sceneName).toBe('tutorial');
      expect(capture.sourceName).toBe('LTTH Docs Capture');
      expect(capture.width).toBeGreaterThan(0);
      expect(capture.height).toBeGreaterThan(0);
      expect(new URL(capture.overlayUrl).hostname).toBe('127.0.0.1');
      expect(new URL(capture.overlayUrl).searchParams.get('lang')).toBe(capture.locale);
    }
  });

  test('rejects protocol-relative overlay paths that resolve outside localhost', () => {
    expect(() => localOverlayUrl('http://remote.example/overlay')).toThrow('localhost HTTP URL');
  });
});
