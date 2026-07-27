import { describe, expect, it } from 'vitest';
import { createOverlayRouterWorker } from './src/index.js';
import { OFFLINE_PROBE_PARAMETER } from './src/offline-page.js';
import { isUnambiguousPublicPath } from './src/public-path.js';
import { createPublicRouter } from './src/public-router.js';

const NOW_MS = Date.parse('2026-07-27T10:00:00.000Z');
const NOW_ISO = '2026-07-27T10:00:00.000Z';
const ROUTE_KEY = '0123456789abcdef0123456789abcdef';
const RAW_PATH_GUARD_TOKEN = 'g'.repeat(64);

function activeClaim(overrides = {}) {
  return {
    usernameKey: 'creator.name',
    clerkUserId: 'user-public',
    routeKey: ROUTE_KEY,
    state: 'active',
    ...overrides
  };
}

function activeLease(overrides = {}) {
  return {
    clerkUserId: 'user-public',
    tunnelOrigin: 'https://quiet-river.trycloudflare.com',
    expiresAt: '2026-07-27T10:01:00.000Z',
    ...overrides
  };
}

function createRepository({
  claim = activeClaim(),
  lease = activeLease()
} = {}) {
  const calls = [];
  return {
    calls,
    async findActiveClaimByUsername(usernameKey) {
      calls.push(['claim', usernameKey]);
      return claim;
    },
    async findActiveLeaseByOwner(clerkUserId, now) {
      calls.push(['lease', clerkUserId, now]);
      return lease;
    }
  };
}

function navigationHeaders(extra = {}) {
  return {
    accept: 'text/html,application/xhtml+xml',
    'sec-fetch-mode': 'navigate',
    ...extra
  };
}

function nestPercentEncoding(value, additionalLayers) {
  let encoded = value;
  for (let layer = 0; layer < additionalLayers; layer += 1) {
    encoded = encoded.replaceAll('%', '%25');
  }
  return encoded;
}

describe('stable public entry routing', () => {
  it('normalizes the username and temporarily redirects while preserving path and query bytes', async () => {
    const repository = createRepository();
    const handle = createPublicRouter({
      repository,
      now: () => NOW_MS
    });
    const request = new Request(
      'https://overlay.ltth.app/%EF%BC%A3reator.Name/plugins/%E2%9C%93/overlay.html?scene=two%20words&asset=%2Fkeep',
      { headers: navigationHeaders() }
    );

    const response = await handle(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      `https://r-${ROUTE_KEY}.ltth.app/plugins/%E2%9C%93/overlay.html?scene=two%20words&asset=%2Fkeep`
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('pragma')).toBe('no-cache');
    expect(repository.calls).toEqual([
      ['claim', 'creator.name'],
      ['lease', 'user-public', NOW_ISO]
    ]);
  });

  it.each([
    [
      '/creator.name/plugins/overlay%2Ehtml?label=main',
      '/plugins/overlay%2Ehtml?label=main'
    ],
    [
      '/creator.name/plugins/100%25-ready%2525.html?label=100%25',
      '/plugins/100%25-ready%2525.html?label=100%25'
    ],
    [
      `/creator.name/plugins/overlay${nestPercentEncoding('%2e', 6)}html`,
      `/plugins/overlay${nestPercentEncoding('%2e', 6)}html`
    ],
    [
      `/creator.name/plugins/100${nestPercentEncoding('%25', 6)}-ready.html`,
      `/plugins/100${nestPercentEncoding('%25', 6)}-ready.html`
    ]
  ])('preserves a legitimate encoded filename in %s', async (
    publicPath,
    routedPath
  ) => {
    const handle = createPublicRouter({
      repository: createRepository(),
      now: () => NOW_MS
    });
    const response = await handle(new Request(
      `https://overlay.ltth.app${publicPath}`,
      { headers: navigationHeaders() }
    ));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      `https://r-${ROUTE_KEY}.ltth.app${routedPath}`
    );
  });

  it('returns an exact empty online probe instead of redirecting', async () => {
    const handle = createPublicRouter({
      repository: createRepository(),
      now: () => NOW_MS
    });
    const response = await handle(new Request(
      `https://overlay.ltth.app/creator.name/overlay.html?scene=main&${OFFLINE_PROBE_PARAMETER}=1`
    ));

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('renders transparent recovery only for an offline navigation', async () => {
    const handle = createPublicRouter({
      repository: createRepository({ lease: null }),
      now: () => NOW_MS
    });
    const response = await handle(new Request(
      'https://overlay.ltth.app/creator.name/overlay.html?scene=private',
      { headers: navigationHeaders() }
    ));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body).toContain('window.location.reload()');
    expect(body).not.toContain('creator.name');
    expect(body).not.toContain('scene=private');
    expect(body).not.toContain(ROUTE_KEY);
  });

  it('returns a neutral unavailable response for offline assets', async () => {
    const handle = createPublicRouter({
      repository: createRepository({ lease: null }),
      now: () => NOW_MS
    });
    const response = await handle(new Request(
      'https://overlay.ltth.app/creator.name/assets/overlay.js?token=private',
      { headers: { accept: 'application/javascript' } }
    ));

    expect(response.status).toBe(503);
    expect(await response.text()).toBe('Service Unavailable');
    expect(response.headers.get('retry-after')).toBeNull();
  });

  it('returns an empty 503 probe with Retry-After while the lease is stale', async () => {
    const handle = createPublicRouter({
      repository: createRepository({ lease: null }),
      now: () => NOW_MS
    });
    const response = await handle(new Request(
      `https://overlay.ltth.app/creator.name/overlay.html?${OFFLINE_PROBE_PARAMETER}=1`
    ));

    expect(response.status).toBe(503);
    expect(await response.text()).toBe('');
    expect(response.headers.get('retry-after')).toBe('5');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('keeps missing and reserved username entries neutral', async () => {
    const missingRepository = createRepository({ claim: null });
    const missingHandle = createPublicRouter({
      repository: missingRepository,
      now: () => NOW_MS
    });
    const reservedRepository = createRepository();
    const reservedHandle = createPublicRouter({
      repository: reservedRepository,
      now: () => NOW_MS
    });

    const missing = await missingHandle(new Request(
      'https://overlay.ltth.app/not-claimed/overlay.html',
      { headers: navigationHeaders() }
    ));
    const reserved = await reservedHandle(new Request(
      'https://overlay.ltth.app/_LTTH/secret',
      { headers: navigationHeaders() }
    ));

    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe('Not Found');
    expect(reserved.status).toBe(404);
    expect(await reserved.text()).toBe('Not Found');
    expect(reservedRepository.calls).toEqual([]);
  });

  it('rejects an entry authority with a non-default port', async () => {
    const repository = createRepository();
    const handle = createPublicRouter({
      repository,
      now: () => NOW_MS
    });
    const response = await handle(new Request(
      'https://overlay.ltth.app:8443/creator.name/overlay.html',
      { headers: navigationHeaders() }
    ));

    expect(response.status).toBe(404);
    expect(repository.calls).toEqual([]);
  });

  it('does not treat explicit non-navigation fetch metadata as navigation', async () => {
    const handle = createPublicRouter({
      repository: createRepository({ lease: null }),
      now: () => NOW_MS
    });
    const response = await handle(new Request(
      'https://overlay.ltth.app/creator.name/fragment.html',
      {
        headers: {
          accept: 'text/html',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors'
        }
      }
    ));

    expect(response.status).toBe(503);
    expect(response.headers.get('content-type')).toContain('text/plain');
    expect(await response.text()).toBe('Service Unavailable');
  });

  it('never constructs a redirect from a malformed stored route key', async () => {
    const handle = createPublicRouter({
      repository: createRepository({
        claim: activeClaim({
          routeKey: 'attacker.example/path'
        })
      }),
      now: () => NOW_MS
    });
    const response = await handle(new Request(
      'https://overlay.ltth.app/creator.name/overlay.html',
      { headers: navigationHeaders() }
    ));

    expect(response.status).toBe(503);
    expect(response.headers.get('location')).toBeNull();
    expect(await response.text()).toBe('Service Unavailable');
  });

  it.each([
    '/creator.name//plugins/overlay.html',
    '/creator.name/plugins/%5c/overlay.html',
    '/creator.name/plugins/%2Foverlay.html',
    '/creator.name/plugins/%252e%252e/overlay.html'
  ])('rejects an ambiguous visible entry path %s before claim lookup', async (
    pathname
  ) => {
    const repository = createRepository();
    const handle = createPublicRouter({
      repository,
      now: () => NOW_MS
    });
    const response = await handle(new Request(
      `https://overlay.ltth.app${pathname}`,
      { headers: navigationHeaders() }
    ));

    expect(response.status).toBe(404);
    expect(repository.calls).toEqual([]);
  });
});

describe('visible public path ambiguity guard', () => {
  it.each([
    ['/plugins/overlay%2Ehtml', true],
    ['/plugins/100%25-ready.html', true],
    ['/plugins/100%2525-ready.html', true],
    ['/plugins/%41lpha%20overlay.html', true],
    ['/plugins/%2e/overlay.html', false],
    ['/plugins/.%2e/overlay.html', false],
    ['/plugins/%252e%252e/overlay.html', false],
    ['/plugins/%25%32%65%25%32%65/overlay.html', false],
    ['/plugins/%2ftransport', false],
    ['/plugins/%252ftransport', false],
    ['/plugins/%25%32%66transport', false],
    ['/plugins/%5ctransport', false],
    ['/plugins/%255ctransport', false],
    ['/plugins/%25%35%63transport', false],
    [`/plugins/${nestPercentEncoding('%2f', 2)}transport`, false],
    [`/plugins/${nestPercentEncoding('%5c', 5)}transport`, false],
    [
      `/plugins/${nestPercentEncoding('%2e%2e', 2)}/overlay.html`,
      false
    ],
    [
      `/plugins/${nestPercentEncoding('%2e', 7)}/overlay.html`,
      false
    ],
    [
      `/plugins/overlay${nestPercentEncoding('%2e', 6)}html`,
      true
    ],
    [
      `/plugins/100${nestPercentEncoding('%25', 6)}-ready.html`,
      true
    ],
    [
      `/plugins/overlay${nestPercentEncoding('%2e', 15)}html`,
      true
    ],
    [
      `/plugins/${nestPercentEncoding('%2f', 15)}transport`,
      false
    ],
    [
      `/plugins/overlay${nestPercentEncoding('%2e', 16)}html`,
      false
    ],
    ['/plugins/bad%zz', false],
    ['/plugins\\overlay.html', false],
    ['/plugins//overlay.html', false],
    ['/plugins/../overlay.html', false]
  ])('classifies %s as unambiguous=%s', (pathname, expected) => {
    expect(isUnambiguousPublicPath(pathname)).toBe(expected);
  });
});

describe('Worker public dispatcher', () => {
  it('classifies exact authorities before attestation and management', async () => {
    const events = [];
    const managementResponse = new Response('management', { status: 202 });
    const worker = createOverlayRouterWorker({
      repositoryFactory() {
        events.push('repository');
        return {};
      },
      managementHandlerFactory() {
        events.push('management:create');
        return async (request) => {
          events.push(`management:${new URL(request.url).hostname}`);
          if (new URL(request.url).pathname === '/_ltth/v1/account') {
            return managementResponse;
          }
          return null;
        };
      },
      publicRouterFactory() {
        return async () => {
          events.push('entry');
          return new Response('entry');
        };
      },
      proxyHandlerFactory() {
        return async () => {
          events.push('proxy');
          return new Response('proxy');
        };
      },
      rawPathAttestationVerifier(request) {
        events.push(`attestation:${new URL(request.url).hostname}`);
        return true;
      }
    });

    const unrelatedManagement = await worker.fetch(new Request(
      'https://unrelated.ltth.app/_ltth/v1/account'
    ), {}, {});
    expect(unrelatedManagement.status).toBe(404);
    expect(events).toEqual([]);

    const management = await worker.fetch(new Request(
      'https://overlay.ltth.app/_ltth/v1/account'
    ), {}, {});
    const entry = await worker.fetch(new Request(
      'https://overlay.ltth.app/creator/overlay.html'
    ), {}, {});
    const proxy = await worker.fetch(new Request(
      `https://r-${ROUTE_KEY}.ltth.app/overlay.html`
    ), {}, {});
    const unrelated = await worker.fetch(new Request(
      'https://www.ltth.app/overlay.html'
    ), {}, {});

    expect(management).toBe(managementResponse);
    expect(await entry.text()).toBe('entry');
    expect(await proxy.text()).toBe('proxy');
    expect(unrelated.status).toBe(404);
    expect(await unrelated.text()).toBe('Not Found');
    expect(events).toEqual([
      'attestation:overlay.ltth.app',
      'repository',
      'management:create',
      'management:overlay.ltth.app',
      'attestation:overlay.ltth.app',
      'repository',
      'management:create',
      'management:overlay.ltth.app',
      'entry',
      `attestation:r-${ROUTE_KEY}.ltth.app`,
      'repository',
      'management:create',
      `management:r-${ROUTE_KEY}.ltth.app`,
      'proxy'
    ]);
  });

  it('never dispatches malformed opaque or non-HTTPS hosts to proxying', async () => {
    let entryCalls = 0;
    let proxyCalls = 0;
    const worker = createOverlayRouterWorker({
      repositoryFactory: () => ({}),
      managementHandlerFactory: () => async () => null,
      publicRouterFactory: () => async () => {
        entryCalls += 1;
        return new Response('entry');
      },
      proxyHandlerFactory: () => async () => {
        proxyCalls += 1;
        return new Response('proxy');
      },
      rawPathAttestationVerifier: () => true
    });

    const malformed = await worker.fetch(new Request(
      `https://prefix.r-${ROUTE_KEY}.ltth.app/overlay.html`
    ), {}, {});
    const insecure = await worker.fetch(new Request(
      `http://r-${ROUTE_KEY}.ltth.app/overlay.html`
    ), {}, {});
    const alternateOpaquePort = await worker.fetch(new Request(
      `https://r-${ROUTE_KEY}.ltth.app:8443/overlay.html`
    ), {}, {});
    const alternateEntryPort = await worker.fetch(new Request(
      'https://overlay.ltth.app:8443/creator/overlay.html'
    ), {}, {});

    expect(malformed.status).toBe(404);
    expect(insecure.status).toBe(404);
    expect(alternateOpaquePort.status).toBe(404);
    expect(alternateEntryPort.status).toBe(404);
    expect(entryCalls).toBe(0);
    expect(proxyCalls).toBe(0);
  });

  it('fails closed when Fetch has discarded an encoded dot path before dispatch', async () => {
    const events = [];
    const worker = createOverlayRouterWorker({
      repositoryFactory: () => {
        events.push('repository');
        return {};
      },
      managementHandlerFactory: () => async () => {
        events.push('management');
        return null;
      },
      publicRouterFactory: () => {
        events.push('entry:create');
        return async () => {
          events.push('entry');
          return new Response('entry');
        };
      },
      proxyHandlerFactory: () => {
        events.push('proxy:create');
        return async () => {
          events.push('proxy');
          return new Response('proxy');
        };
      }
    });
    const rawEntry = new Request(
      'https://overlay.ltth.app/creator.name/%2e%2e/socket.io/'
    );
    const rawSocketPost = new Request(
      `https://${`r-${ROUTE_KEY}.ltth.app`}/foo/%2e%2e/socket.io/`,
      { method: 'POST', body: 'ambiguous' }
    );
    const rawSocketSuffixPost = new Request(
      `https://${`r-${ROUTE_KEY}.ltth.app`}/socket.io/%2e`,
      { method: 'POST', body: 'ambiguous-suffix' }
    );

    expect(rawEntry.url).toBe(
      'https://overlay.ltth.app/socket.io/'
    );
    expect(rawSocketPost.url).toBe(
      `https://r-${ROUTE_KEY}.ltth.app/socket.io/`
    );
    expect(rawSocketSuffixPost.url).toBe(
      `https://r-${ROUTE_KEY}.ltth.app/socket.io/`
    );

    const entryResponse = await worker.fetch(rawEntry, {
      OVERLAY_RAW_PATH_GUARD_TOKEN: RAW_PATH_GUARD_TOKEN
    }, {});
    const proxyResponse = await worker.fetch(rawSocketPost, {
      OVERLAY_RAW_PATH_GUARD_TOKEN: RAW_PATH_GUARD_TOKEN
    }, {});
    const suffixResponse = await worker.fetch(rawSocketSuffixPost, {
      OVERLAY_RAW_PATH_GUARD_TOKEN: RAW_PATH_GUARD_TOKEN
    }, {});

    expect(entryResponse.status).toBe(503);
    expect(proxyResponse.status).toBe(503);
    expect(suffixResponse.status).toBe(503);
    expect(events).toEqual([]);
  });

  it('dispatches only when the trusted raw-path attestation matches', async () => {
    const events = [];
    const worker = createOverlayRouterWorker({
      repositoryFactory: () => ({}),
      managementHandlerFactory: () => async () => {
        events.push('management');
        return null;
      },
      publicRouterFactory: () => async () => {
        events.push('entry');
        return new Response('entry');
      },
      proxyHandlerFactory: () => async () => new Response('proxy')
    });
    const request = new Request(
      'https://overlay.ltth.app/creator.name/plugins/%E2%9C%93/overlay.html?scene=two%20words',
      {
        headers: {
          'x-ltth-raw-path-guard': RAW_PATH_GUARD_TOKEN
        }
      }
    );
    const rejected = await worker.fetch(request, {
      OVERLAY_RAW_PATH_GUARD_TOKEN: 'x'.repeat(64)
    }, {});

    expect(rejected.status).toBe(503);
    expect(events).toEqual([]);

    const response = await worker.fetch(request, {
      OVERLAY_RAW_PATH_GUARD_TOKEN: RAW_PATH_GUARD_TOKEN
    }, {});

    expect(await response.text()).toBe('entry');
    expect(events).toEqual(['management', 'entry']);
  });
});
