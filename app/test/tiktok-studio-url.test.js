'use strict';

const {
  TikTokStudioUrlError,
  copy
} = require('../public/js/tiktok-studio-url');

function response(body, ok = true) {
  return {
    ok,
    json: jest.fn().mockResolvedValue(body)
  };
}

function dependencies(overrides = {}) {
  const writeText = jest.fn().mockResolvedValue(undefined);
  return {
    locationHref: 'http://127.0.0.1:3000/plugins/goals/ui',
    fetchImpl: jest.fn().mockResolvedValue(response({
      success: true,
      tunnelURL: 'https://quiet-river.trycloudflare.com',
      publicURL: 'https://quiet-river.trycloudflare.com/goals/overlay?id=goal-1',
      reused: false
    })),
    navigatorRef: { clipboard: { writeText } },
    documentRef: null,
    writeText,
    ...overrides
  };
}

describe('LTTHTikTokStudioUrl.copy', () => {
  test('posts a local overlay URL and copies only the server-returned public URL', async () => {
    const deps = dependencies();

    const copied = await copy(
      'http://localhost:3000/goals/overlay?id=goal-1',
      deps
    );

    expect(deps.fetchImpl).toHaveBeenCalledWith(
      '/api/network/overlay-tunnel/ensure',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          overlayURL: 'http://localhost:3000/goals/overlay?id=goal-1'
        })
      }
    );
    expect(deps.writeText).toHaveBeenCalledWith(
      'https://quiet-river.trycloudflare.com/goals/overlay?id=goal-1'
    );
    expect(copied).toBe(
      'https://quiet-river.trycloudflare.com/goals/overlay?id=goal-1'
    );
  });

  test('copies an external HTTPS URL unchanged without ensuring a tunnel', async () => {
    const deps = dependencies();
    const directorURL = 'https://vdo.ninja/?director=room-7&cleanoutput';

    const copied = await copy(directorURL, deps);

    expect(deps.fetchImpl).not.toHaveBeenCalled();
    expect(deps.writeText).toHaveBeenCalledWith(directorURL);
    expect(copied).toBe(directorURL);
  });

  test.each([
    ['', 'URL_UNAVAILABLE'],
    ['not a valid url', 'URL_INVALID'],
    ['http://example.com/overlay', 'EXTERNAL_HTTP_NOT_ALLOWED'],
    ['https://user:pass@example.com/overlay', 'URL_CREDENTIALS_NOT_ALLOWED'],
    ['file:///overlay.html', 'URL_PROTOCOL_NOT_ALLOWED']
  ])('rejects unsafe candidate %s', async (rawURL, code) => {
    const deps = dependencies();

    await expect(copy(rawURL, deps)).rejects.toMatchObject({
      name: 'TikTokStudioUrlError',
      code
    });
    expect(deps.writeText).not.toHaveBeenCalled();
  });

  test('does not copy a local fallback when ensure fails', async () => {
    const deps = dependencies({
      fetchImpl: jest.fn().mockResolvedValue(response({
        success: false,
        code: 'OVERLAY_TUNNEL_START_FAILED',
        error: 'retry'
      }, false))
    });

    await expect(copy(
      'http://127.0.0.1:3000/animation-overlay.html',
      deps
    )).rejects.toMatchObject({
      code: 'OVERLAY_TUNNEL_START_FAILED'
    });
    expect(deps.writeText).not.toHaveBeenCalled();
  });

  test('uses a readonly temporary textarea when Clipboard API is unavailable', async () => {
    const textarea = {
      value: '',
      readOnly: false,
      style: {},
      setAttribute: jest.fn(function setAttribute(name) {
        if (name === 'readonly') this.readOnly = true;
      }),
      select: jest.fn(),
      remove: jest.fn()
    };
    const documentRef = {
      body: { appendChild: jest.fn() },
      createElement: jest.fn(() => textarea),
      execCommand: jest.fn(() => true)
    };
    const deps = dependencies({
      navigatorRef: {},
      documentRef
    });

    const copied = await copy(
      'https://vdo.ninja/?director=room-7',
      deps
    );

    expect(copied).toBe('https://vdo.ninja/?director=room-7');
    expect(textarea.readOnly).toBe(true);
    expect(documentRef.body.appendChild).toHaveBeenCalledWith(textarea);
    expect(documentRef.execCommand).toHaveBeenCalledWith('copy');
    expect(textarea.remove).toHaveBeenCalledTimes(1);
  });

  test('removes the fallback textarea when legacy copy fails', async () => {
    const textarea = {
      style: {},
      setAttribute: jest.fn(),
      select: jest.fn(),
      remove: jest.fn()
    };
    const deps = dependencies({
      navigatorRef: {},
      documentRef: {
        body: { appendChild: jest.fn() },
        createElement: jest.fn(() => textarea),
        execCommand: jest.fn(() => false)
      }
    });

    await expect(copy(
      'https://vdo.ninja/?director=room-7',
      deps
    )).rejects.toBeInstanceOf(TikTokStudioUrlError);
    expect(textarea.remove).toHaveBeenCalledTimes(1);
  });

  test('coalesces concurrent ensure requests for the same URL but performs both copies', async () => {
    let resolveEnsure;
    const fetchImpl = jest.fn(() => new Promise(resolve => {
      resolveEnsure = resolve;
    }));
    const deps = dependencies({ fetchImpl });
    const localURL = 'http://127.0.0.1:3000/animation-overlay.html';

    const first = copy(localURL, deps);
    const second = copy(localURL, deps);
    resolveEnsure(response({
      success: true,
      publicURL: 'https://quiet-river.trycloudflare.com/animation-overlay.html'
    }));

    await expect(Promise.all([first, second])).resolves.toEqual([
      'https://quiet-river.trycloudflare.com/animation-overlay.html',
      'https://quiet-river.trycloudflare.com/animation-overlay.html'
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(deps.writeText).toHaveBeenCalledTimes(2);
  });
});
