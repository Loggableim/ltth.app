const { parseCaptureOptions, runLocalPreparation } = require('../../scripts/capture-obs-docs-screenshot');

describe('OBS documentation capture runner', () => {
  const baseEnvironment = {
    OBS_DOCS_CAPTURE_ALLOW: 'yes',
    OBS_DOCS_PLUGIN: 'emoji-rain',
    OBS_DOCS_LOCALE: 'en',
    OBS_DOCS_OVERLAY_URL: 'http://127.0.0.1:3000/emoji-rain/obs-hud',
    OBS_DOCS_WIDTH: '1280',
    OBS_DOCS_HEIGHT: '720'
  };

  test('requires an explicit operator opt-in before OBS can be changed', () => {
    expect(() => parseCaptureOptions({ ...baseEnvironment, OBS_DOCS_CAPTURE_ALLOW: 'no' }))
      .toThrow('OBS_DOCS_CAPTURE_ALLOW=yes is required');
  });

  test('accepts only a local LTTH overlay and records a fixed tutorial target', () => {
    expect(parseCaptureOptions(baseEnvironment)).toMatchObject({
      sceneName: 'tutorial',
      plugin: 'emoji-rain',
      locale: 'en',
      overlayUrl: 'http://127.0.0.1:3000/emoji-rain/obs-hud',
      width: 1280,
      height: 720
    });
    expect(() => parseCaptureOptions({ ...baseEnvironment, OBS_DOCS_OVERLAY_URL: 'https://example.com/overlay' }))
      .toThrow('OBS documentation captures may use only a local LTTH overlay URL');
    expect(() => parseCaptureOptions({ ...baseEnvironment, OBS_DOCS_PREPARE_URL: 'https://example.com/test' }))
      .toThrow('OBS documentation captures may use only a local LTTH preparation URL');
  });

  test('accepts only localhost OBS WebSocket endpoints', () => {
    expect(parseCaptureOptions({ ...baseEnvironment, OBS_WEBSOCKET_URL: 'ws://127.0.0.1:4455' }).obsUrl)
      .toBe('ws://127.0.0.1:4455/');
    expect(() => parseCaptureOptions({ ...baseEnvironment, OBS_WEBSOCKET_URL: 'ws://192.168.1.5:4455' }))
      .toThrow('OBS documentation captures may use only a local OBS WebSocket URL');
  });

  test('does not follow redirects during local overlay preparation', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({ status: 302, ok: false, json: async () => null });
    try {
      await expect(runLocalPreparation({
        preparationUrl: 'http://127.0.0.1:3000/api/plugins/emoji-rain/prepare-docs',
        preparationBody: null,
        settleMs: 1
      })).rejects.toThrow('Local overlay preparation must not redirect');
      expect(global.fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ redirect: 'manual' }));
    } finally {
      global.fetch = originalFetch;
    }
  });
});
