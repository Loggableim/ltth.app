import { describe, expect, it } from 'vitest';
import { createOverlayRouterWorker } from './src/index.js';
import { OFFLINE_PROBE_PARAMETER } from './src/offline-page.js';
import { createPublicRouter } from './src/public-router.js';

const NOW_MS = Date.parse('2026-07-27T10:00:00.000Z');
const NOW_ISO = '2026-07-27T10:00:00.000Z';
const ROUTE_KEY = '0123456789abcdef0123456789abcdef';

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
});

describe('Worker public dispatcher', () => {
  it('offers every host to management before exact public-host dispatch', async () => {
    const events = [];
    const managementResponse = new Response('management', { status: 202 });
    const worker = createOverlayRouterWorker({
      repositoryFactory() {
        return {};
      },
      managementHandlerFactory() {
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
      }
    });

    const management = await worker.fetch(new Request(
      'https://unrelated.ltth.app/_ltth/v1/account'
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
      'management:unrelated.ltth.app',
      'management:overlay.ltth.app',
      'entry',
      `management:r-${ROUTE_KEY}.ltth.app`,
      'proxy',
      'management:www.ltth.app'
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
      }
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
});
