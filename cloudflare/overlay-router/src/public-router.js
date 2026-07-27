import {
  OFFLINE_PROBE_PARAMETER,
  createOfflinePageResponse
} from './offline-page.js';
import { isUnambiguousPublicPath } from './public-path.js';
import {
  createNeutralErrorResponse,
  normalizeTikTokUsername,
  parseInternalRouteHost
} from './validation.js';

const PUBLIC_ENTRY_HOST = 'overlay.ltth.app';
const RESERVED_ENTRY_SEGMENT = '_ltth';
const OFFLINE_PROBE_RETRY_SECONDS = 5;

function noStoreHeaders(extra = {}) {
  return {
    'Cache-Control': 'no-store',
    'Pragma': 'no-cache',
    'Referrer-Policy': 'no-referrer',
    ...extra
  };
}

function createProbeResponse(online) {
  return new Response(null, {
    status: online ? 204 : 503,
    headers: noStoreHeaders(
      online
        ? {}
        : { 'Retry-After': String(OFFLINE_PROBE_RETRY_SECONDS) }
    )
  });
}

function parseEntryPath(pathname) {
  const withoutLeadingSlash = pathname.slice(1);
  const separatorIndex = withoutLeadingSlash.indexOf('/');
  const encodedUsername = separatorIndex === -1
    ? withoutLeadingSlash
    : withoutLeadingSlash.slice(0, separatorIndex);
  if (!encodedUsername) {
    return null;
  }

  let username;
  try {
    username = normalizeTikTokUsername(
      decodeURIComponent(encodedUsername)
    );
  } catch {
    return null;
  }
  if (username === RESERVED_ENTRY_SEGMENT) {
    return null;
  }

  return {
    username,
    remainingPath: separatorIndex === -1
      ? '/'
      : withoutLeadingSlash.slice(separatorIndex)
  };
}

function isNavigationRequest(request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return false;
  }
  const mode = request.headers.get('sec-fetch-mode');
  const destination = request.headers.get('sec-fetch-dest');
  if (mode !== null || destination !== null) {
    return mode === 'navigate' ||
      destination === 'document' ||
      destination === 'iframe';
  }
  const accept = request.headers.get('accept') || '';
  return accept
    .split(',')
    .some((value) => value.trim().toLowerCase().startsWith('text/html'));
}

function createRedirectResponse(routeKey, remainingPath, search) {
  const target = new URL(`https://r-${routeKey}.ltth.app`);
  target.pathname = remainingPath;
  target.search = search;
  if (target.pathname !== remainingPath || target.search !== search) {
    return null;
  }
  return new Response(null, {
    status: 307,
    headers: noStoreHeaders({
      Location: target.toString()
    })
  });
}

export function createPublicRouter(options = {}) {
  const repository = options.repository;
  const now = typeof options.now === 'function'
    ? options.now
    : Date.now;
  if (!repository ||
      typeof repository.findActiveClaimByUsername !== 'function' ||
      typeof repository.findActiveLeaseByOwner !== 'function') {
    throw new TypeError('A public-routing repository is required');
  }

  return async function handlePublicEntry(request) {
    let url;
    try {
      url = new URL(request.url);
    } catch {
      return createNeutralErrorResponse(404);
    }
    if (url.protocol !== 'https:' ||
        url.hostname !== PUBLIC_ENTRY_HOST ||
        url.port !== '' ||
        !isUnambiguousPublicPath(url.pathname) ||
        (request.method !== 'GET' && request.method !== 'HEAD')) {
      return createNeutralErrorResponse(404);
    }

    const entry = parseEntryPath(url.pathname);
    if (!entry) {
      return createNeutralErrorResponse(404);
    }

    let claim;
    let lease;
    try {
      claim = await repository.findActiveClaimByUsername(entry.username);
      if (!claim) {
        return createNeutralErrorResponse(404);
      }
      if (parseInternalRouteHost(
        `r-${claim.routeKey}.ltth.app`
      ) !== claim.routeKey) {
        return createNeutralErrorResponse(503);
      }
      const timestamp = new Date(Math.trunc(now())).toISOString();
      lease = await repository.findActiveLeaseByOwner(
        claim.clerkUserId,
        timestamp
      );
    } catch {
      return createNeutralErrorResponse(503);
    }

    const online = Boolean(
      lease &&
      lease.clerkUserId === claim.clerkUserId
    );
    if (url.searchParams.has(OFFLINE_PROBE_PARAMETER)) {
      return createProbeResponse(online);
    }
    if (!online) {
      return isNavigationRequest(request)
        ? createOfflinePageResponse(request.url)
        : createNeutralErrorResponse(503);
    }
    return createRedirectResponse(
      claim.routeKey,
      entry.remainingPath,
      url.search
    ) || createNeutralErrorResponse(503);
  };
}
