'use strict';

const {
  validateRequestedOverlayURL,
  buildPublicOverlayURL
} = require('../modules/public-overlay-url');

describe('public overlay URL validation', () => {
  test('accepts the XP-bar username and preserves its encoded query value', () => {
    const validated = validateRequestedOverlayURL({
      overlayURL: 'http://127.0.0.1:3000/overlay/viewer-xp/xp-bar?username=viewer%20one',
      requestOrigin: 'http://127.0.0.1:3000'
    });

    expect(validated.href).toBe(
      'http://127.0.0.1:3000/overlay/viewer-xp/xp-bar?username=viewer%20one'
    );
  });

  test('accepts bounded Sidekick presentation parameters', () => {
    const validated = validateRequestedOverlayURL({
      overlayURL: 'http://127.0.0.1:3000/overlay/sidekick/hud?position=bottom-left&minimal=true&events=false&maxEvents=10',
      requestOrigin: 'http://127.0.0.1:3000'
    });

    expect(validated.search).toBe('?position=bottom-left&minimal=true&events=false&maxEvents=10');
  });

  test.each([
    ['/overlay/viewer-xp/xp-bar?apiKey=secret-canary', 'OVERLAY_URL_QUERY_INVALID'],
    ['/overlay/viewer-xp/xp-bar?username=viewer&access_token=secret-canary', 'OVERLAY_URL_QUERY_INVALID'],
    ['/overlay/viewer-xp/xp-bar?username=one&username=two', 'OVERLAY_URL_QUERY_INVALID'],
    ['/overlay/viewer-xp/xp-bar?username=', 'OVERLAY_URL_QUERY_INVALID'],
    ['/overlay/viewer-xp/xp-bar?username=%20viewer', 'OVERLAY_URL_QUERY_INVALID'],
    [`/overlay/viewer-xp/xp-bar?username=${'u'.repeat(81)}`, 'OVERLAY_URL_QUERY_INVALID'],
    ['/overlay/sidekick/hud?theme=dark', 'OVERLAY_URL_QUERY_INVALID'],
    ['/overlay/sidekick/hud?position=top;display:none', 'OVERLAY_URL_QUERY_INVALID'],
    ['/overlay/sidekick/hud?minimal=yes', 'OVERLAY_URL_QUERY_INVALID'],
    ['/overlay/sidekick/hud?maxEvents=11', 'OVERLAY_URL_QUERY_INVALID'],
    ['/overlay/sidekick/hud?maxEvents=1&maxEvents=2', 'OVERLAY_URL_QUERY_INVALID'],
    ['/overlay/viewer-xp/level-up?token=secret-canary', 'OVERLAY_URL_QUERY_INVALID']
  ])('rejects unapproved or malformed public query %s', (pathAndQuery, code) => {
    expect(() => validateRequestedOverlayURL({
      overlayURL: `http://127.0.0.1:3000${pathAndQuery}`,
      requestOrigin: 'http://127.0.0.1:3000'
    })).toThrow(expect.objectContaining({ code }));
  });

  test('allows queryless local overlay URLs to retain their existing path behavior', () => {
    const validated = validateRequestedOverlayURL({
      overlayURL: 'http://127.0.0.1:3000/goals/overlay',
      requestOrigin: 'http://127.0.0.1:3000'
    });

    expect(validated.pathname).toBe('/goals/overlay');
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
      overlayURL: 'http://127.0.0.1:3000/overlay/sidekick/hud?position=top-right&maxEvents=5',
      requestOrigin: 'http://127.0.0.1:3000'
    });

    expect(buildPublicOverlayURL({
      tunnelURL: 'https://quiet-river.trycloudflare.com',
      validatedOverlayURL: validated
    })).toBe(
      'https://quiet-river.trycloudflare.com/overlay/sidekick/hud?position=top-right&maxEvents=5'
    );
  });

  test('revalidates the URL object before building the public link', () => {
    const validated = validateRequestedOverlayURL({
      overlayURL: 'http://127.0.0.1:3000/overlay/viewer-xp/xp-bar?username=viewer',
      requestOrigin: 'http://127.0.0.1:3000'
    });
    validated.searchParams.set('token', 'secret-canary');

    expect(() => buildPublicOverlayURL({
      tunnelURL: 'https://quiet-river.trycloudflare.com',
      validatedOverlayURL: validated
    })).toThrow(expect.objectContaining({ code: 'OVERLAY_URL_QUERY_INVALID' }));
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
