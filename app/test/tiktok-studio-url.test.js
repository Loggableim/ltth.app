'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {
  TikTokStudioUrlError,
  copy,
  copyExternal,
  copyTemporary,
  handleButtonClick,
  readButtonURL
} = require('../public/js/tiktok-studio-url');

const VDO_DIRECTOR_URL =
  'https://vdo.ninja/?director=aaaaaaaaaaaa&password=bbbbbbbbbbbbbbbb&cleanoutput&api=aaaaaaaaaaaa';

function response(body, ok = true) {
  return {
    ok,
    json: jest.fn().mockResolvedValue(body)
  };
}

function dependencies(overrides = {}) {
  const writeText = jest.fn().mockResolvedValue(undefined);
  const focusNetworkSettings = jest.fn();
  const accountAccess = {
    getFreshToken: jest.fn().mockResolvedValue('fresh-clerk-token'),
    getAccount: jest.fn().mockResolvedValue({
      success: true,
      account: {
        claims: [
          {
            username: 'connected.creator',
            displayUsername: 'Connected.Creator',
            state: 'active',
            claimedAt: '2026-07-27T00:00:00.000Z',
            releaseRequestedAt: null,
            reusableAfter: null,
            updatedAt: '2026-07-27T00:00:00.000Z'
          },
          {
            username: 'default_creator',
            displayUsername: 'Default_Creator',
            state: 'active',
            claimedAt: '2026-07-27T00:00:00.000Z',
            releaseRequestedAt: null,
            reusableAfter: null,
            updatedAt: '2026-07-27T00:00:00.000Z'
          }
        ],
        devices: [],
        lease: { active: false }
      },
      defaultUsername: 'default_creator'
    }),
    getConnectedUsername: jest.fn().mockResolvedValue('Connected.Creator')
  };
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
    accountAccess,
    getActiveVdoDirectorUrl: jest.fn().mockResolvedValue(VDO_DIRECTOR_URL),
    focusNetworkSettings,
    writeText,
    ...overrides
  };
}

describe('LTTHTikTokStudioUrl.copy', () => {
  test('copies a stable URL for a registered local overlay without ensuring a tunnel', async () => {
    const deps = dependencies();

    const copied = await copy(
      'http://localhost:3000/goals/overlay?id=goal-1',
      deps
    );

    expect(deps.fetchImpl).not.toHaveBeenCalled();
    expect(deps.accountAccess.getFreshToken).toHaveBeenCalledWith({
      action: 'copy_stable'
    });
    expect(deps.accountAccess.getAccount).toHaveBeenCalledWith({
      token: 'fresh-clerk-token',
      fetchImpl: deps.fetchImpl
    });
    expect(deps.writeText).toHaveBeenCalledWith(
      'https://overlay.ltth.app/connected.creator/goals/overlay?id=goal-1'
    );
    expect(copied).toBe('https://overlay.ltth.app/connected.creator/goals/overlay?id=goal-1');
  });

  test('selects the active default claim when the connected name is not claimed', async () => {
    const deps = dependencies();
    deps.accountAccess.getConnectedUsername.mockResolvedValue('not_claimed');

    const copied = await copy(
      'http://127.0.0.1:3000/animation-overlay.html#main',
      deps
    );

    expect(deps.fetchImpl).not.toHaveBeenCalled();
    expect(copied).toBe(
      'https://overlay.ltth.app/default_creator/animation-overlay.html#main'
    );
  });

  test.each([
    ['', 'URL_UNAVAILABLE'],
    ['not a valid url', 'URL_INVALID'],
    ['http://example.com/overlay', 'STABLE_OVERLAY_INVALID'],
    ['http://127.0.0.1:3001/goals/overlay', 'STABLE_OVERLAY_INVALID'],
    ['https://vdo.ninja/?director=room-7', 'STABLE_OVERLAY_INVALID'],
    ['https://user:pass@example.com/overlay', 'URL_CREDENTIALS_NOT_ALLOWED'],
    ['file:///overlay.html', 'URL_PROTOCOL_NOT_ALLOWED']
  ])('rejects unsafe candidate %s', async (rawURL, code) => {
    const deps = dependencies();

    await expect(copy(rawURL, deps)).rejects.toMatchObject({
      name: 'TikTokStudioUrlError',
      code
    });
    expect(deps.writeText).not.toHaveBeenCalled();
    expect(deps.fetchImpl).not.toHaveBeenCalled();
    expect(deps.focusNetworkSettings).toHaveBeenCalledTimes(1);
  });

  test('requires an active claim and never falls back to Quick Tunnel', async () => {
    const deps = dependencies();
    deps.accountAccess.getAccount.mockResolvedValue({
      success: true,
      account: {
        claims: [],
        devices: [],
        lease: { active: false }
      },
      defaultUsername: null
    });

    await expect(copy(
      'http://127.0.0.1:3000/animation-overlay.html',
      deps
    )).rejects.toMatchObject({
      code: 'STABLE_OVERLAY_CLAIM_REQUIRED'
    });
    expect(deps.fetchImpl).not.toHaveBeenCalled();
    expect(deps.writeText).not.toHaveBeenCalled();
    expect(deps.focusNetworkSettings).toHaveBeenCalledWith({
      code: 'STABLE_OVERLAY_CLAIM_REQUIRED'
    });
  });

  test('treats account unavailability as claim-required and never ensures a tunnel', async () => {
    const deps = dependencies();
    deps.accountAccess.getAccount.mockRejectedValue(new Error('secret upstream failure'));

    await expect(copy(
      'http://127.0.0.1:3000/goals/overlay?private=value',
      deps
    )).rejects.toMatchObject({
      code: 'STABLE_OVERLAY_CLAIM_REQUIRED',
      message: 'An active TikTok username claim is required'
    });
    expect(deps.fetchImpl).not.toHaveBeenCalled();
    expect(deps.writeText).not.toHaveBeenCalled();
    expect(deps.focusNetworkSettings).toHaveBeenCalledWith({
      code: 'STABLE_OVERLAY_CLAIM_REQUIRED'
    });
  });

  test('keeps temporary Quick Tunnel copy as an explicit separate path', async () => {
    const deps = dependencies();

    const copied = await copyTemporary(
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
    expect(copied).toBe(
      'https://quiet-river.trycloudflare.com/goals/overlay?id=goal-1'
    );
    expect(deps.accountAccess.getFreshToken).not.toHaveBeenCalled();
  });

  test('copies intentional external HTTPS controls only through the external path', async () => {
    const deps = dependencies();

    await expect(copy(VDO_DIRECTOR_URL, deps)).rejects.toMatchObject({
      code: 'STABLE_OVERLAY_INVALID'
    });
    const copied = await copyExternal(VDO_DIRECTOR_URL, deps);

    expect(deps.fetchImpl).not.toHaveBeenCalled();
    expect(deps.writeText).toHaveBeenCalledWith(VDO_DIRECTOR_URL);
    expect(copied).toBe(VDO_DIRECTOR_URL);
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

    const copied = await copyExternal(
      VDO_DIRECTOR_URL,
      deps
    );

    expect(copied).toBe(VDO_DIRECTOR_URL);
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

    await expect(copyExternal(
      VDO_DIRECTOR_URL,
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

    const first = copyTemporary(localURL, deps);
    const second = copyTemporary(localURL, deps);
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

describe('declarative TikTok Studio copy buttons', () => {
  function buttonHarness(source) {
    const attributes = {
      'data-overlay-url-source': '#overlay-url'
    };
    const button = {
      disabled: false,
      getAttribute: jest.fn(name => attributes[name] || null),
      setAttribute: jest.fn(),
      removeAttribute: jest.fn()
    };
    const documentRef = {
      querySelector: jest.fn(selector => (
        selector === '#overlay-url' ? source : null
      ))
    };
    return { button, documentRef };
  }

  test('reads the referenced URL field at click time rather than caching it', async () => {
    const source = { value: 'http://127.0.0.1:3000/animation-overlay.html' };
    const { button, documentRef } = buttonHarness(source);
    const copyImpl = jest.fn().mockResolvedValue(
      'https://quiet-river.trycloudflare.com/animation-overlay.html'
    );
    const report = jest.fn();

    expect(readButtonURL(button, { documentRef })).toBe(source.value);
    source.value = 'http://127.0.0.1:3000/weather-control/overlay';

    await handleButtonClick(button, {
      documentRef,
      copyImpl,
      report
    });

    expect(copyImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:3000/weather-control/overlay'
    );
    expect(report).toHaveBeenNthCalledWith(
      1,
      'starting',
      'Preparing stable TikTok Studio URL...'
    );
    expect(report).toHaveBeenLastCalledWith(
      'success',
      'TikTok Studio URL copied'
    );
    expect(button.disabled).toBe(false);
    expect(button.removeAttribute).toHaveBeenCalledWith('aria-busy');
  });

  test('reads text content and an explicitly named attribute when requested', () => {
    const source = {
      textContent: '  http://localhost:3000/flame-overlay/overlay  ',
      getAttribute: jest.fn(name => (
        name === 'href' ? 'https://vdo.ninja/?director=room-7' : null
      ))
    };
    const { button, documentRef } = buttonHarness(source);

    expect(readButtonURL(button, { documentRef })).toBe(
      'http://localhost:3000/flame-overlay/overlay'
    );

    button.getAttribute.mockImplementation(name => {
      if (name === 'data-overlay-url-source') return '#overlay-url';
      if (name === 'data-overlay-url-attribute') return 'href';
      return null;
    });
    expect(readButtonURL(button, { documentRef })).toBe(
      'https://vdo.ninja/?director=room-7'
    );
  });

  test('can read a generated URL stored on the clicked button itself', () => {
    const attributes = {
      'data-overlay-url-source': 'self',
      'data-overlay-url-attribute': 'data-url',
      'data-url': 'http://localhost:3000/plugins/toptier/overlay.html?board=likes'
    };
    const button = {
      getAttribute: jest.fn(name => attributes[name] || null)
    };

    expect(readButtonURL(button, {
      documentRef: { querySelector: jest.fn() }
    })).toBe(
      'http://localhost:3000/plugins/toptier/overlay.html?board=likes'
    );
  });

  test('reports a localized failure and always restores the clicked button', async () => {
    const { button, documentRef } = buttonHarness({ value: '' });
    const error = new TikTokStudioUrlError(
      'URL_UNAVAILABLE',
      'Overlay URL is unavailable'
    );
    const report = jest.fn();

    await expect(handleButtonClick(button, {
      documentRef,
      copyImpl: jest.fn().mockRejectedValue(error),
      translate: (key, fallback) => (
        key === 'common.tiktok_studio.url_unavailable'
          ? 'Keine Overlay-URL'
          : fallback
      ),
      report
    })).resolves.toBeNull();

    expect(report).toHaveBeenLastCalledWith('error', 'Keine Overlay-URL');
    expect(button.disabled).toBe(false);
  });

  test.each([
    {
      attribute: 'data-copy-tiktok-studio-url',
      mode: null,
      expected: 'stable'
    },
    {
      attribute: 'data-copy-tiktok-studio-temporary-url',
      mode: null,
      expected: 'temporary'
    },
    {
      attribute: 'data-copy-tiktok-studio-url',
      mode: 'external',
      expected: 'external'
    }
  ])('dispatches the $expected action without crossing copy paths', async ({
    attribute,
    mode,
    expected
  }) => {
    const attributes = {
      [attribute]: '',
      'data-overlay-url-source': '#overlay-url'
    };
    if (mode) attributes['data-tiktok-studio-url-mode'] = mode;
    const button = {
      disabled: false,
      hasAttribute: jest.fn(name => Object.hasOwn(attributes, name)),
      getAttribute: jest.fn(name => attributes[name] ?? null),
      setAttribute: jest.fn(),
      removeAttribute: jest.fn()
    };
    const documentRef = {
      querySelector: jest.fn(() => ({
        value: expected === 'external'
          ? VDO_DIRECTOR_URL
          : 'http://127.0.0.1:3000/goals/overlay'
      }))
    };
    const implementations = {
      stable: jest.fn().mockResolvedValue('stable'),
      temporary: jest.fn().mockResolvedValue('temporary'),
      external: jest.fn().mockResolvedValue('external')
    };

    await expect(handleButtonClick(button, {
      documentRef,
      copyImpl: implementations.stable,
      copyTemporaryImpl: implementations.temporary,
      copyExternalImpl: implementations.external,
      report: jest.fn()
    })).resolves.toBe(expected);

    expect(implementations[expected]).toHaveBeenCalledTimes(1);
    for (const [name, implementation] of Object.entries(implementations)) {
      if (name !== expected) expect(implementation).not.toHaveBeenCalled();
    }
  });

  test('an external mode attribute cannot authorize a non-VDO.Ninja URL', async () => {
    const writeText = jest.fn();
    const report = jest.fn();
    const attributes = {
      'data-copy-tiktok-studio-url': '',
      'data-tiktok-studio-url-mode': 'external',
      'data-overlay-url-source': '#overlay-url'
    };
    const button = {
      disabled: false,
      hasAttribute: jest.fn(name => Object.hasOwn(attributes, name)),
      getAttribute: jest.fn(name => attributes[name] ?? null),
      setAttribute: jest.fn(),
      removeAttribute: jest.fn()
    };

    await expect(handleButtonClick(button, {
      documentRef: {
        querySelector: jest.fn(() => ({
          value: 'https://evil.example/?director=aaaaaaaaaaaa'
        }))
      },
      copyExternalImpl: rawUrl => copyExternal(rawUrl, {
        locationHref: 'http://127.0.0.1:3000/vdoninja/ui',
        navigatorRef: { clipboard: { writeText } },
        documentRef: null,
        getActiveVdoDirectorUrl: jest.fn().mockResolvedValue(
          VDO_DIRECTOR_URL
        )
      }),
      report
    })).resolves.toBeNull();

    expect(writeText).not.toHaveBeenCalled();
    expect(report).toHaveBeenLastCalledWith(
      'error',
      'Could not copy the TikTok Studio URL'
    );
  });
});

describe('same-origin iframe account handoff', () => {
  function browserApi(windowRef) {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'public', 'js', 'tiktok-studio-url.js'),
      'utf8'
    );
    vm.runInNewContext(source, {
      window: windowRef,
      URL,
      Promise,
      Map,
      Set,
      WeakSet
    });
    return windowRef.LTTHTikTokStudioUrl;
  }

  function iframeWindow(topRef) {
    const writeText = jest.fn().mockResolvedValue(undefined);
    return {
      top: topRef,
      location: {
        href: 'http://127.0.0.1:3000/plugins/goals/ui',
        origin: 'http://127.0.0.1:3000'
      },
      document: {
        readyState: 'loading',
        addEventListener: jest.fn()
      },
      navigator: { clipboard: { writeText } },
      open: jest.fn(),
      writeText
    };
  }

  test('uses only same-origin top-level in-memory account getters', async () => {
    const getFreshClerkToken = jest.fn().mockResolvedValue('fresh-top-token');
    const getAccount = jest.fn().mockResolvedValue({
      success: true,
      account: {
        claims: [{ username: 'top_creator', state: 'active' }],
        devices: [],
        lease: { active: false }
      },
      defaultUsername: 'top_creator'
    });
    const getConnectedUsername = jest.fn().mockResolvedValue('top_creator');
    const topRef = {
      location: { origin: 'http://127.0.0.1:3000' },
      LTTHStableOverlayRouting: {
        getFreshClerkToken,
        accountAccess: {
          getAccount,
          getConnectedUsername
        }
      }
    };
    const windowRef = iframeWindow(topRef);
    const api = browserApi(windowRef);

    await expect(api.copy(
      'http://127.0.0.1:3000/goals/overlay?id=goal-1'
    )).resolves.toBe(
      'https://overlay.ltth.app/top_creator/goals/overlay?id=goal-1'
    );

    expect(getFreshClerkToken).toHaveBeenCalledTimes(1);
    expect(getAccount).toHaveBeenCalledWith({
      token: 'fresh-top-token',
      fetchImpl: null
    });
    expect(windowRef.writeText).toHaveBeenCalledWith(
      'https://overlay.ltth.app/top_creator/goals/overlay?id=goal-1'
    );
  });

  test('accepts the registered Talking Heads speaker overlay in the browser fallback allowlist', async () => {
    const getFreshClerkToken = jest.fn().mockResolvedValue('fresh-top-token');
    const getAccount = jest.fn().mockResolvedValue({
      success: true,
      account: {
        claims: [{ username: 'talking.creator', state: 'active' }]
      },
      defaultUsername: 'talking.creator'
    });
    const topRef = {
      location: { origin: 'http://127.0.0.1:3000' },
      LTTHStableOverlayRouting: {
        getFreshClerkToken,
        accountAccess: {
          getAccount,
          getConnectedUsername: jest.fn().mockResolvedValue('talking.creator')
        }
      }
    };
    const windowRef = iframeWindow(topRef);
    const api = browserApi(windowRef);

    await expect(api.copy(
      'http://127.0.0.1:3000/overlay/talking-heads'
    )).resolves.toBe(
      'https://overlay.ltth.app/talking.creator/overlay/talking-heads'
    );
    expect(windowRef.writeText).toHaveBeenCalledWith(
      'https://overlay.ltth.app/talking.creator/overlay/talking-heads'
    );
  });

  test('contains cross-origin top access failures as claim-required', async () => {
    const windowRef = iframeWindow(null);
    Object.defineProperty(windowRef, 'top', {
      get() {
        throw new Error('cross-origin secret details');
      }
    });
    const api = browserApi(windowRef);

    await expect(api.copy(
      'http://127.0.0.1:3000/goals/overlay?private=value'
    )).rejects.toMatchObject({
      code: 'STABLE_OVERLAY_CLAIM_REQUIRED',
      message: 'An active TikTok username claim is required'
    });

    expect(windowRef.writeText).not.toHaveBeenCalled();
    expect(windowRef.open).not.toHaveBeenCalled();
  });
});
