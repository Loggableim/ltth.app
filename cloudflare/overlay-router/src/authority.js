const ROUTE_KEY_PATTERN = /^[0-9a-f]{32}$/;
const AUTHORITY_OVERRIDE_KEYS = Object.freeze([
  'OVERLAY_ENTRY_HOST',
  'OVERLAY_ROUTE_HOST_SUFFIX'
]);

export const PRODUCTION_ROUTING_AUTHORITIES = Object.freeze({
  environment: 'production',
  entryHost: 'overlay.ltth.app',
  routeHostSuffix: 'ltth.app'
});

export const STAGING_ROUTING_AUTHORITIES = Object.freeze({
  environment: 'staging',
  entryHost: 'overlay-staging.ltth.app',
  routeHostSuffix: 'overlay-staging.ltth.app'
});

function hasAuthorityOverride(env) {
  return AUTHORITY_OVERRIDE_KEYS.some((key) =>
    typeof env?.[key] === 'string' && env[key].trim().length > 0
  );
}

function requireAuthorities(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    typeof value.entryHost !== 'string' ||
    typeof value.routeHostSuffix !== 'string'
  ) {
    throw new TypeError('Routing authorities are invalid');
  }
  return value;
}

export function resolveRoutingAuthorities(env = {}) {
  if (hasAuthorityOverride(env)) {
    throw new TypeError('Routing authority overrides are not supported');
  }
  const environment = typeof env?.OVERLAY_ROUTING_ENVIRONMENT === 'string'
    ? env.OVERLAY_ROUTING_ENVIRONMENT.trim()
    : '';
  if (
    environment === '' ||
    environment === 'local' ||
    environment === 'production'
  ) {
    return PRODUCTION_ROUTING_AUTHORITIES;
  }
  if (environment === 'staging') {
    return STAGING_ROUTING_AUTHORITIES;
  }
  throw new TypeError('Routing environment is invalid');
}

export function buildOpaqueRouteHost(routeKey, authorities) {
  const selected = requireAuthorities(authorities);
  if (typeof routeKey !== 'string' || !ROUTE_KEY_PATTERN.test(routeKey)) {
    throw new TypeError('Route key is invalid');
  }
  return `r-${routeKey}.${selected.routeHostSuffix}`;
}

export function classifyRoutingAuthority(hostname, authorities) {
  const selected = requireAuthorities(authorities);
  if (
    typeof hostname !== 'string' ||
    hostname.length === 0 ||
    hostname !== hostname.toLowerCase()
  ) {
    return null;
  }
  if (hostname === selected.entryHost) {
    return { kind: 'entry', routeKey: null };
  }
  const prefix = 'r-';
  const suffix = `.${selected.routeHostSuffix}`;
  if (
    !hostname.startsWith(prefix) ||
    !hostname.endsWith(suffix)
  ) {
    return null;
  }
  const routeKey = hostname.slice(
    prefix.length,
    hostname.length - suffix.length
  );
  if (!ROUTE_KEY_PATTERN.test(routeKey)) {
    return null;
  }
  return { kind: 'proxy', routeKey };
}

export function publicEntryOrigin(authorities) {
  return `https://${requireAuthorities(authorities).entryHost}`;
}
