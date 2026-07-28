import { describe, expect, it } from 'vitest';
import { createProxyHandler } from './src/proxy.js';

const NOW_MS = Date.parse('2026-07-27T10:00:00.000Z');
const NOW_ISO = '2026-07-27T10:00:00.000Z';
const ROUTE_KEY = '0123456789abcdef0123456789abcdef';
const ROUTE_HOST = `r-${ROUTE_KEY}.ltth.app`;

function nestPercentEncoding(value, additionalLayers) {
  let encoded = value;
  for (let layer = 0; layer < additionalLayers; layer += 1) {
    encoded = encoded.replaceAll('%', '%25');
  }
  return encoded;
}

function activeClaim(overrides = {}) {
  return {
    routeKey: ROUTE_KEY,
    clerkUserId: 'user-proxy',
    state: 'active',
    ...overrides
  };
}

function activeLease(overrides = {}) {
  return {
    clerkUserId: 'user-proxy',
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
    async findActiveClaimByRouteKey(routeKey) {
      calls.push(['claim', routeKey]);
      return claim;
    },
    async findActiveLeaseByRouteKey(routeKey, now) {
      calls.push(['lease', routeKey, now]);
      return lease;
    }
  };
}

function createHandler({
  repository = createRepository(),
  fetchImpl
} = {}) {
  return {
    repository,
    handle: createProxyHandler({
      repository,
      fetch: fetchImpl || (async () => new Response('ok')),
      now: () => NOW_MS
    })
  };
}

describe('strict opaque-host HTTP proxy', () => {
  it('builds only the validated tunnel target, uses manual redirects, and streams a filtered response', async () => {
    let upstreamRequest;
    const responseBody = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('streamed response'));
        controller.close();
      }
    });
    const { repository, handle } = createHandler({
      fetchImpl: async (request) => {
        upstreamRequest = request;
        return new Response(responseBody, {
          headers: {
            'content-type': 'text/plain',
            'x-safe-overlay': 'yes',
            'set-cookie': 'private=session',
            server: 'private-origin',
            'x-tunnel-origin': 'https://quiet-river.trycloudflare.com',
            'access-control-allow-origin': '*',
            'access-control-allow-credentials': 'true'
          }
        });
      }
    });
    const response = await handle(new Request(
      `https://${ROUTE_HOST}/plugins/%E2%9C%93/overlay.js?scene=two%20words&asset=%2Fkeep`,
      {
        headers: {
          accept: 'text/plain',
          authorization: 'Bearer private',
          cookie: 'session=private',
          'x-forwarded-for': '127.0.0.1',
          origin: 'https://overlay.ltth.app'
        }
      }
    ));

    expect(upstreamRequest.url).toBe(
      'https://quiet-river.trycloudflare.com/plugins/%E2%9C%93/overlay.js?scene=two%20words&asset=%2Fkeep'
    );
    expect(upstreamRequest.redirect).toBe('manual');
    expect(upstreamRequest.headers.get('accept')).toBe('text/plain');
    expect(upstreamRequest.headers.get('authorization')).toBeNull();
    expect(upstreamRequest.headers.get('cookie')).toBeNull();
    expect(upstreamRequest.headers.get('x-forwarded-for')).toBeNull();
    expect(repository.calls).toEqual([
      ['claim', ROUTE_KEY],
      ['lease', ROUTE_KEY, NOW_ISO]
    ]);
    expect(await response.text()).toBe('streamed response');
    expect(response.headers.get('content-type')).toBe('text/plain');
    expect(response.headers.get('x-safe-overlay')).toBe('yes');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('server')).toBeNull();
    expect(response.headers.get('x-tunnel-origin')).toBeNull();
    expect(response.headers.get('access-control-allow-origin'))
      .toBe('https://overlay.ltth.app');
    expect(response.headers.get('access-control-allow-credentials')).toBeNull();
    expect(response.headers.get('access-control-allow-methods'))
      .toBe('GET, HEAD, OPTIONS');
  });

  it('keeps an origin-less request origin-less on the private upstream hop', async () => {
    let upstreamRequest;
    const { handle } = createHandler({
      fetchImpl: async (request) => {
        upstreamRequest = request;
        return new Response('ok');
      }
    });

    const response = await handle(new Request(
      `https://${ROUTE_HOST}/overlay.html`
    ));

    expect(response.status).toBe(200);
    expect(upstreamRequest.headers.get('origin')).toBeNull();
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(response.headers.get('vary')).toBe('Origin');
  });

  it.each([
    '/plugins/overlay%2Ehtml',
    '/plugins/100%25-ready%2525.html',
    `/plugins/overlay${nestPercentEncoding('%2e', 6)}html`,
    `/plugins/100${nestPercentEncoding('%25', 6)}-ready.html`
  ])('preserves a legitimate encoded proxy filename %s', async (
    pathname
  ) => {
    let upstreamUrl;
    const { handle } = createHandler({
      fetchImpl: async (request) => {
        upstreamUrl = request.url;
        return new Response('ok');
      }
    });
    const response = await handle(new Request(
      `https://${ROUTE_HOST}${pathname}?label=100%25`
    ));

    expect(response.status).toBe(200);
    expect(upstreamUrl).toBe(
      `https://quiet-river.trycloudflare.com${pathname}?label=100%25`
    );
  });

  it.each([
    ['PUT', '/api/state', {}],
    ['DELETE', '/socket.io/', {}],
    ['POST', '/api/state', {}],
    ['POST', '/api/streammonsters/overlay/heartbeat/adjacent', {}],
    ['PATCH', '/overlay.html', {}],
    ['GET', '/overlay.html', { 'x-http-method-override': 'DELETE' }],
    ['GET', '/overlay.html', { 'x-method-override': 'POST' }],
    ['GET', '/overlay.html', { 'x-original-method': 'PATCH' }]
  ])('rejects %s %s and override attempts before route lookup', async (
    method,
    pathname,
    headers
  ) => {
    let fetchCalls = 0;
    const { repository, handle } = createHandler({
      fetchImpl: async () => {
        fetchCalls += 1;
        return new Response('unexpected');
      }
    });
    const response = await handle(new Request(
      `https://${ROUTE_HOST}${pathname}`,
      { method, headers }
    ));

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('Not Found');
    expect(response.headers.get('vary')).toBe('Origin');
    expect(repository.calls).toEqual([]);
    expect(fetchCalls).toBe(0);
  });

  it('allows POST only at the exact Socket.IO transport path and streams its body', async () => {
    let upstreamRequest;
    let upstreamUrl;
    let upstreamBody;
    let upstreamRedirect;
    const { handle } = createHandler({
      fetchImpl: async (request) => {
        upstreamRequest = request;
        upstreamUrl = request.url;
        upstreamRedirect = request.redirect;
        upstreamBody = await request.text();
        return new Response('accepted', { status: 202 });
      }
    });
    const response = await handle(new Request(
      `https://${ROUTE_HOST}/socket.io/?EIO=4&transport=polling`,
      {
        method: 'POST',
        headers: {
          'content-type': 'text/plain;charset=UTF-8',
          origin: 'https://overlay.ltth.app'
        },
        body: '40{"event":"opaque-payload"}'
      }
    ));

    expect(response.status).toBe(202);
    expect(upstreamUrl).toBe(
      'https://quiet-river.trycloudflare.com/socket.io/?EIO=4&transport=polling'
    );
    expect(upstreamRedirect).toBe('manual');
    expect(upstreamBody).toBe('40{"event":"opaque-payload"}');
    expect(upstreamRequest.headers.get('origin')).toBe(
      'https://quiet-river.trycloudflare.com'
    );
    expect(response.headers.get('access-control-allow-origin')).toBe(
      'https://overlay.ltth.app'
    );
    expect(response.headers.get('access-control-allow-methods'))
      .toBe('GET, HEAD, OPTIONS, POST');
  });

  it('allows only the exact registered Stream Monsters heartbeat POST', async () => {
    let upstreamRequest;
    const { handle } = createHandler({
      fetchImpl: async (request) => {
        upstreamRequest = request;
        return new Response('accepted', { status: 202 });
      }
    });
    const response = await handle(new Request(
      `https://${ROUTE_HOST}/api/streammonsters/overlay/heartbeat`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: `https://${ROUTE_HOST}`
        },
        body: '{"renderer":"webgpu"}'
      }
    ));

    expect(response.status).toBe(202);
    expect(upstreamRequest.url).toBe(
      'https://quiet-river.trycloudflare.com/api/streammonsters/overlay/heartbeat'
    );
    expect(upstreamRequest.headers.get('origin')).toBe(
      'https://quiet-river.trycloudflare.com'
    );
    expect(response.headers.get('access-control-allow-origin')).toBe(
      `https://${ROUTE_HOST}`
    );
    expect(response.headers.get('access-control-allow-methods')).toBe(
      'GET, HEAD, OPTIONS, POST'
    );
  });

  it('rewrites accepted Socket.IO preflight origins only on the upstream hop', async () => {
    let upstreamRequest;
    const { handle } = createHandler({
      fetchImpl: async (request) => {
        upstreamRequest = request;
        return new Response(null, {
          status: 204,
          headers: { vary: 'Accept-Encoding' }
        });
      }
    });
    const response = await handle(new Request(
      `https://${ROUTE_HOST}/socket.io/?EIO=4&transport=polling`,
      {
        method: 'OPTIONS',
        headers: { origin: `https://${ROUTE_HOST}` }
      }
    ));

    expect(response.status).toBe(204);
    expect(upstreamRequest.headers.get('origin')).toBe(
      'https://quiet-river.trycloudflare.com'
    );
    expect(response.headers.get('access-control-allow-origin')).toBe(
      `https://${ROUTE_HOST}`
    );
    expect(response.headers.get('vary')).toBe('Accept-Encoding, Origin');
  });

  it('rejects WebSocket upgrade semantics on non-GET requests', async () => {
    let fetchCalls = 0;
    const { repository, handle } = createHandler({
      fetchImpl: async () => {
        fetchCalls += 1;
        return new Response('unexpected');
      }
    });
    const response = await handle(new Request(
      `https://${ROUTE_HOST}/socket.io/?EIO=4&transport=websocket`,
      {
        method: 'POST',
        headers: {
          connection: 'Upgrade',
          upgrade: 'websocket'
        },
        body: 'unexpected'
      }
    ));

    expect(response.status).toBe(404);
    expect(repository.calls).toEqual([]);
    expect(fetchCalls).toBe(0);
  });

  it.each([
    '//socket.io/',
    '/socket.io/%5c/transport',
    '/socket.io/%2Ftransport',
    '/socket.io/%252ftransport',
    '/socket.io/%255ctransport',
    '/socket.io/%252e/transport',
    '/socket.io/%25%32%65/transport',
    `/socket.io/${nestPercentEncoding('%2f', 2)}transport`,
    `/socket.io/${nestPercentEncoding('%5c', 5)}transport`,
    `/socket.io/${nestPercentEncoding('%2e%2e', 3)}/transport`,
    '/socket.io/bad%zz'
  ])('rejects an ambiguous visible proxy path %s before route lookup', async (
    pathname
  ) => {
    let fetchCalls = 0;
    const { repository, handle } = createHandler({
      fetchImpl: async () => {
        fetchCalls += 1;
        return new Response('unexpected');
      }
    });
    const response = await handle(new Request(
      `https://${ROUTE_HOST}${pathname}`
    ));

    expect(response.status).toBe(404);
    expect(repository.calls).toEqual([]);
    expect(fetchCalls).toBe(0);
  });

  it('rejects a stored non-Quick-Tunnel origin without making an SSRF fetch', async () => {
    let fetchCalls = 0;
    const { handle } = createHandler({
      repository: createRepository({
        lease: activeLease({
          tunnelOrigin: 'https://169.254.169.254/latest/meta-data'
        })
      }),
      fetchImpl: async () => {
        fetchCalls += 1;
        return new Response('private metadata');
      }
    });
    const response = await handle(new Request(
      `https://${ROUTE_HOST}/overlay.html?secret=query`
    ));

    expect(response.status).toBe(502);
    expect(await response.text()).toBe('Bad Gateway');
    expect(fetchCalls).toBe(0);
  });

  it('rejects an opaque route authority with a non-default port', async () => {
    let fetchCalls = 0;
    const { repository, handle } = createHandler({
      fetchImpl: async () => {
        fetchCalls += 1;
        return new Response('unexpected');
      }
    });
    const response = await handle(new Request(
      `https://${ROUTE_HOST}:8443/overlay.html`
    ));

    expect(response.status).toBe(404);
    expect(repository.calls).toEqual([]);
    expect(fetchCalls).toBe(0);
  });

  it('turns upstream redirects into a neutral gateway failure', async () => {
    const { handle } = createHandler({
      fetchImpl: async () => new Response('redirect details', {
        status: 302,
        headers: {
          location: 'https://secret-origin.trycloudflare.com/private?token=secret'
        }
      })
    });
    const response = await handle(new Request(
      `https://${ROUTE_HOST}/overlay.html?scene=private`
    ));

    expect(response.status).toBe(502);
    expect(await response.text()).toBe('Bad Gateway');
    expect(response.headers.get('location')).toBeNull();
  });

  it('rejects an arbitrary browser origin before route lookup or proxying', async () => {
    let fetchCalls = 0;
    const { handle } = createHandler({
      fetchImpl: async () => {
        fetchCalls += 1;
        return new Response('unexpected');
      }
    });
    const response = await handle(new Request(
      `https://${ROUTE_HOST}/overlay.html`,
      { headers: { origin: 'https://evil.example' } }
    ));

    expect(response.status).toBe(404);
    expect(fetchCalls).toBe(0);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(response.headers.get('vary')).toBe('Origin');
  });

  it.each([
    [
      'Socket.IO polling',
      'POST',
      '/socket.io/?EIO=4&transport=polling',
      { origin: 'https://evil.example' },
      '40'
    ],
    [
      'Socket.IO preflight',
      'OPTIONS',
      '/socket.io/?EIO=4&transport=polling',
      {
        origin: 'https://evil.example',
        'access-control-request-method': 'POST'
      },
      undefined
    ],
    [
      'Socket.IO WebSocket upgrade',
      'GET',
      '/socket.io/?EIO=4&transport=websocket',
      {
        connection: 'Upgrade',
        upgrade: 'websocket',
        origin: 'https://evil.example'
      },
      undefined
    ]
  ])('rejects an arbitrary origin for %s before route lookup', async (
    _label,
    method,
    pathname,
    headers,
    body
  ) => {
    let fetchCalls = 0;
    const { repository, handle } = createHandler({
      fetchImpl: async () => {
        fetchCalls += 1;
        return new Response('unexpected');
      }
    });
    const response = await handle(new Request(
      `https://${ROUTE_HOST}${pathname}`,
      { method, headers, body }
    ));

    expect(response.status).toBe(404);
    expect(response.headers.get('vary')).toBe('Origin');
    expect(repository.calls).toEqual([]);
    expect(fetchCalls).toBe(0);
  });

  it.each([
    [undefined, null, 'Origin'],
    [undefined, 'Accept-Encoding', 'Accept-Encoding, Origin'],
    [undefined, 'Origin', 'Origin'],
    [undefined, '*', '*'],
    ['https://overlay.ltth.app', 'Accept-Encoding', 'Accept-Encoding, Origin']
  ])('varies every proxy response by Origin for request %s and upstream Vary %s', async (
    origin,
    upstreamVary,
    expectedVary
  ) => {
    const { handle } = createHandler({
      fetchImpl: async () => new Response('ok', {
        headers: upstreamVary ? { vary: upstreamVary } : {}
      })
    });
    const headers = origin ? { origin } : {};
    const response = await handle(new Request(
      `https://${ROUTE_HOST}/overlay.html`,
      { headers }
    ));

    expect(response.status).toBe(200);
    expect(response.headers.get('vary')).toBe(expectedVary);
  });

  it('returns neutral unavailability without trying a stale route lease', async () => {
    let fetchCalls = 0;
    const { handle } = createHandler({
      repository: createRepository({ lease: null }),
      fetchImpl: async () => {
        fetchCalls += 1;
        return new Response('stale tunnel');
      }
    });
    const response = await handle(new Request(
      `https://${ROUTE_HOST}/overlay.html?private=query`
    ));

    expect(response.status).toBe(503);
    expect(await response.text()).toBe('Service Unavailable');
    expect(fetchCalls).toBe(0);
  });

  it('proxies a WebSocket upgrade without inspecting its payload', async () => {
    const pair = new WebSocketPair();
    const client = pair[0];
    let upstreamRequest;
    const { handle } = createHandler({
      fetchImpl: async (request) => {
        upstreamRequest = request;
        return new Response(null, {
          status: 101,
          webSocket: client,
          headers: {
            upgrade: 'websocket',
            connection: 'Upgrade',
            'sec-websocket-protocol': 'socket.io'
          }
        });
      }
    });
    const response = await handle(new Request(
      `https://${ROUTE_HOST}/socket.io/?EIO=4&transport=websocket`,
      {
        headers: {
          connection: 'Upgrade',
          upgrade: 'websocket',
          'sec-websocket-protocol': 'socket.io',
          cookie: 'private=session',
          origin: `https://${ROUTE_HOST}`
        }
      }
    ));

    expect(upstreamRequest.url).toBe(
      'https://quiet-river.trycloudflare.com/socket.io/?EIO=4&transport=websocket'
    );
    expect(upstreamRequest.headers.get('upgrade')).toBe('websocket');
    expect(upstreamRequest.headers.get('cookie')).toBeNull();
    expect(upstreamRequest.headers.get('origin')).toBe(
      'https://quiet-river.trycloudflare.com'
    );
    expect(response.status).toBe(101);
    expect(response.webSocket).toBe(client);
    expect(response.headers.get('sec-websocket-protocol')).toBe('socket.io');
    expect(response.headers.get('access-control-allow-origin')).toBe(
      `https://${ROUTE_HOST}`
    );
  });
});
