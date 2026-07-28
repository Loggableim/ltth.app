import {
  filterProxyRequestHeaders,
  filterProxyResponseHeaders
} from './headers.js';
import { isUnambiguousPublicPath } from './public-path.js';
import {
  createNeutralErrorResponse,
  parseInternalRouteHost,
  parseQuickTunnelOrigin
} from './validation.js';
import {
  PRODUCTION_ROUTING_AUTHORITIES,
  publicEntryOrigin
} from './authority.js';

const METHOD_OVERRIDE_HEADERS = Object.freeze([
  'x-http-method-override',
  'x-method-override',
  'x-original-method'
]);
const READ_ONLY_CORS_METHODS = 'GET, HEAD, OPTIONS';
const SOCKET_CORS_METHODS = `${READ_ONLY_CORS_METHODS}, POST`;
const ALLOWED_CORS_HEADERS = 'Accept, Content-Type';
const STREAM_MONSTERS_HEARTBEAT_PATH =
  '/api/streammonsters/overlay/heartbeat';

function isAllowedPublicPostPath(pathname) {
  return pathname === '/socket.io/' ||
    pathname === STREAM_MONSTERS_HEARTBEAT_PATH;
}

function isAllowedMethod(request, pathname) {
  if (METHOD_OVERRIDE_HEADERS.some((name) =>
    request.headers.has(name)
  )) {
    return false;
  }
  if (request.method === 'GET' ||
      request.method === 'HEAD' ||
      request.method === 'OPTIONS') {
    return true;
  }
  return request.method === 'POST' &&
    isAllowedPublicPostPath(pathname);
}

function isWebSocketUpgrade(request) {
  const upgrade = request.headers.get('upgrade');
  return typeof upgrade === 'string' &&
    upgrade.toLowerCase() === 'websocket';
}

function buildTargetUrl(tunnelOrigin, publicUrl) {
  const validatedOrigin = parseQuickTunnelOrigin(tunnelOrigin);
  const target = new URL(validatedOrigin);
  target.pathname = publicUrl.pathname;
  target.search = publicUrl.search;
  if (target.pathname !== publicUrl.pathname ||
      target.search !== publicUrl.search) {
    throw new TypeError('Public path did not round-trip');
  }
  return target;
}

function createUpstreamRequest(
  request,
  target,
  webSocketUpgrade
) {
  const headers = filterProxyRequestHeaders(request.headers);
  if (request.headers.has('origin')) {
    headers.set('Origin', target.origin);
  } else {
    headers.delete('Origin');
  }
  if (webSocketUpgrade) {
    headers.set('Upgrade', 'websocket');
  }
  const init = {
    method: request.method,
    headers,
    redirect: 'manual'
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
  }
  return new Request(target.toString(), init);
}

function removeUnsafeNavigationAndCorsHeaders(headers) {
  for (const name of Array.from(headers.keys())) {
    if (name.startsWith('access-control-')) {
      headers.delete(name);
    }
  }
  headers.delete('content-location');
  headers.delete('location');
  headers.delete('refresh');
}

function addVaryOrigin(headers) {
  const existing = headers.get('vary');
  if (!existing) {
    headers.set('Vary', 'Origin');
    return;
  }
  const values = existing
    .split(',')
    .map((value) => value.trim().toLowerCase());
  if (!values.includes('origin') && !values.includes('*')) {
    headers.set('Vary', `${existing}, Origin`);
  }
}

export function createProxyNeutralResponse(status) {
  const response = createNeutralErrorResponse(status);
  addVaryOrigin(response.headers);
  return response;
}

function applyNarrowCors(
  request,
  publicUrl,
  headers,
  authorities
) {
  addVaryOrigin(headers);
  const origin = request.headers.get('origin');
  if (!origin) {
    return;
  }
  const routeOrigin = `https://${publicUrl.hostname}`;
  if (
    origin !== publicEntryOrigin(authorities) &&
    origin !== routeOrigin
  ) {
    return;
  }
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set(
    'Access-Control-Allow-Methods',
    isAllowedPublicPostPath(publicUrl.pathname)
      ? SOCKET_CORS_METHODS
      : READ_ONLY_CORS_METHODS
  );
  headers.set('Access-Control-Allow-Headers', ALLOWED_CORS_HEADERS);
}

function createFilteredUpstreamResponse(
  request,
  publicUrl,
  upstream,
  authorities
) {
  const headers = filterProxyResponseHeaders(upstream.headers);
  removeUnsafeNavigationAndCorsHeaders(headers);
  applyNarrowCors(request, publicUrl, headers, authorities);
  const init = {
    status: upstream.status,
    statusText: upstream.statusText,
    headers
  };
  if (upstream.webSocket) {
    init.webSocket = upstream.webSocket;
  }
  return new Response(upstream.body, init);
}

export function createProxyHandler(options = {}) {
  const repository = options.repository;
  const fetchImpl = options.fetch || globalThis.fetch;
  const authorities = options.authorities ||
    PRODUCTION_ROUTING_AUTHORITIES;
  const now = typeof options.now === 'function'
    ? options.now
    : Date.now;
  if (!repository ||
      typeof repository.findActiveClaimByRouteKey !== 'function' ||
      typeof repository.findActiveLeaseByRouteKey !== 'function') {
    throw new TypeError('An opaque-routing repository is required');
  }
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('A proxy fetch implementation is required');
  }

  function neutral(status) {
    return createProxyNeutralResponse(status);
  }

  return async function handleProxyRequest(request) {
    let publicUrl;
    try {
      publicUrl = new URL(request.url);
    } catch {
      return neutral(404);
    }
    const routeKey = publicUrl.protocol === 'https:' &&
      publicUrl.port === ''
      ? parseInternalRouteHost(
        publicUrl.hostname,
        authorities
      )
      : null;
    if (!routeKey ||
        !isUnambiguousPublicPath(publicUrl.pathname) ||
        !isAllowedMethod(request, publicUrl.pathname)) {
      return neutral(404);
    }

    const requestOrigin = request.headers.get('origin');
    const routeOrigin = `https://${publicUrl.hostname}`;
    if (
      requestOrigin !== null &&
      requestOrigin !== publicEntryOrigin(authorities) &&
      requestOrigin !== routeOrigin
    ) {
      return neutral(404);
    }

    const upgradeHeader = request.headers.get('upgrade');
    const webSocketUpgrade = isWebSocketUpgrade(request);
    if ((upgradeHeader && !webSocketUpgrade) ||
        (webSocketUpgrade && request.method !== 'GET')) {
      return neutral(404);
    }

    let claim;
    let lease;
    try {
      claim = await repository.findActiveClaimByRouteKey(routeKey);
      if (!claim) {
        return neutral(404);
      }
      const timestamp = new Date(Math.trunc(now())).toISOString();
      lease = await repository.findActiveLeaseByRouteKey(
        routeKey,
        timestamp
      );
    } catch {
      return neutral(503);
    }
    if (!lease || lease.clerkUserId !== claim.clerkUserId) {
      return neutral(503);
    }

    let target;
    try {
      target = buildTargetUrl(lease.tunnelOrigin, publicUrl);
    } catch {
      return neutral(502);
    }

    let upstream;
    try {
      const upstreamRequest = createUpstreamRequest(
        request,
        target,
        webSocketUpgrade
      );
      upstream = await fetchImpl(upstreamRequest);
    } catch {
      return neutral(502);
    }
    if (!upstream ||
        !Number.isInteger(upstream.status) ||
        (upstream.status >= 300 && upstream.status < 400)) {
      return neutral(502);
    }

    try {
      return createFilteredUpstreamResponse(
        request,
        publicUrl,
        upstream,
        authorities
      );
    } catch {
      return neutral(502);
    }
  };
}
