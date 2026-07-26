'use strict';

const {
  validateRequestedOverlayURL,
  buildPublicOverlayURL
} = require('../modules/public-overlay-url');

describe('public overlay URL validation', () => {
  test('accepts a registered URL on the current LTTH origin and preserves query data', () => {
    const validated = validateRequestedOverlayURL({
      overlayURL: 'http://127.0.0.1:3000/goals/overlay?id=goal%201&theme=dark',
      requestOrigin: 'http://127.0.0.1:3000'
    });

    expect(validated.href).toBe(
      'http://127.0.0.1:3000/goals/overlay?id=goal%201&theme=dark'
    );
  });

  test('accepts localhost and loopback aliases on the same bound port', () => {
    const validated = validateRequestedOverlayURL({
      overlayURL: 'http://localhost:3180/animation-overlay.html',
      requestOrigin: 'http://127.0.0.1:3180'
    });

    expect(validated.pathname).toBe('/animation-overlay.html');
  });

  test.each([
    ['http://127.0.0.1:3000/dashboard.html', 'OVERLAY_URL_NOT_REGISTERED'],
    ['http://127.0.0.1:3001/animation-overlay.html', 'OVERLAY_URL_ORIGIN_NOT_ALLOWED'],
    ['https://example.com/animation-overlay.html', 'OVERLAY_URL_ORIGIN_NOT_ALLOWED'],
    ['http://user:password@127.0.0.1:3000/animation-overlay.html', 'OVERLAY_URL_INVALID'],
    ['http://127.0.0.1:3000/animation-overlay.html#fragment', 'OVERLAY_URL_INVALID'],
    ['file:///animation-overlay.html', 'OVERLAY_URL_INVALID']
  ])('rejects unsafe overlay URL %s', (overlayURL, code) => {
    expect(() => validateRequestedOverlayURL({
      overlayURL,
      requestOrigin: 'http://127.0.0.1:3000'
    })).toThrow(expect.objectContaining({ code }));
  });

  test('constructs the result from the server-owned tunnel origin', () => {
    const validated = validateRequestedOverlayURL({
      overlayURL: 'http://127.0.0.1:3000/quiz-show/overlay/splitscreen?layout=portrait',
      requestOrigin: 'http://127.0.0.1:3000'
    });

    expect(buildPublicOverlayURL({
      tunnelURL: 'https://quiet-river.trycloudflare.com',
      validatedOverlayURL: validated
    })).toBe(
      'https://quiet-river.trycloudflare.com/quiz-show/overlay/splitscreen?layout=portrait'
    );
  });

  test('rejects a non-Quick-Tunnel server origin', () => {
    const validated = validateRequestedOverlayURL({
      overlayURL: 'http://127.0.0.1:3000/animation-overlay.html',
      requestOrigin: 'http://127.0.0.1:3000'
    });

    expect(() => buildPublicOverlayURL({
      tunnelURL: 'https://example.com',
      validatedOverlayURL: validated
    })).toThrow(expect.objectContaining({ code: 'OVERLAY_TUNNEL_URL_INVALID' }));
  });
});
