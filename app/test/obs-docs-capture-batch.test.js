'use strict';

const { parseBatchOptions, runBatchObsCapture } = require('../../scripts/capture-obs-docs-screenshots');
const { EXPECTED_OVERLAY_GUIDE_COUNT, OBS_DOCS_CAPTURE_LOCALES } = require('../../scripts/lib/obs-docs-capture-inventory');

describe('OBS documentation capture batch', () => {
  const expectedCaptureCount = EXPECTED_OVERLAY_GUIDE_COUNT * OBS_DOCS_CAPTURE_LOCALES.length;
  const environment = {
    OBS_DOCS_CAPTURE_ALLOW: 'yes',
    OBS_DOCS_BASE_URL: 'http://127.0.0.1:3000',
    OBS_WEBSOCKET_URL: 'ws://127.0.0.1:4455'
  };

  test('requires explicit opt-in and a local LTTH base URL', () => {
    expect(() => parseBatchOptions({ ...environment, OBS_DOCS_CAPTURE_ALLOW: 'no' }))
      .toThrow('OBS_DOCS_CAPTURE_ALLOW=yes is required');
    expect(() => parseBatchOptions({ ...environment, OBS_DOCS_BASE_URL: 'https://ltth.app' }))
      .toThrow('OBS documentation capture base URL must be a localhost HTTP URL');
  });

  test('dispatches the full localized overlay matrix to the safe single-capture runner', async () => {
    const calls = [];
    const resetReport = jest.fn();
    const records = await runBatchObsCapture({
      environment,
      resetReport,
      capture: async (options) => {
        calls.push(options);
        return {
          plugin: options.plugin,
          locale: options.locale,
          sceneName: options.sceneName,
          sourceName: options.sourceName,
          width: options.width,
          height: options.height,
          restored: true
        };
      }
    });

    expect(records).toHaveLength(expectedCaptureCount);
    expect(calls).toHaveLength(expectedCaptureCount);
    expect(resetReport).toHaveBeenCalledWith({ targetCount: expectedCaptureCount });
    expect(calls.every((options) => options.sceneName === 'tutorial')).toBe(true);
    expect(calls.every((options) => options.overlayUrl.startsWith('http://127.0.0.1:3000/'))).toBe(true);
    expect(calls.every((options) => options.obsUrl === 'ws://127.0.0.1:4455/')).toBe(true);
  });
});
