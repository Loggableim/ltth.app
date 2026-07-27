const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade'
]);

const REQUEST_EXACT_HEADERS = new Set([
  'authorization',
  'cookie',
  'cookie2',
  'host',
  'cf-access-client-id',
  'cf-access-client-secret',
  'cf-client-cert-der-base64',
  'forwarded',
  'true-client-ip',
  'x-auth-email',
  'x-auth-key',
  'x-amzn-mtls-clientcert',
  'x-client-cert',
  'x-forwarded-client-cert',
  'x-forwarded-client-cert-chain',
  'x-real-ip'
]);

const RESPONSE_EXACT_HEADERS = new Set([
  'set-cookie',
  'set-cookie2',
  'server',
  'server-timing',
  'via',
  'www-authenticate',
  'x-powered-by'
]);

const CREDENTIAL_NAME_PATTERN =
  /(?:^|[-_])(?:api[-_]?key|auth|authorization|credential|credentials|jwt|secret|token)(?:$|[-_])/;

function connectionScopedHeaderNames(headers) {
  const names = new Set();
  const connection = headers.get('connection');
  if (!connection) {
    return names;
  }
  for (const token of connection.split(',')) {
    const name = token.trim().toLowerCase();
    if (name) {
      names.add(name);
    }
  }
  return names;
}

function isRequestSensitive(name) {
  return (
    REQUEST_EXACT_HEADERS.has(name) ||
    name.startsWith('clerk-') ||
    name.startsWith('device-') ||
    name.startsWith('ltth-device-') ||
    name.startsWith('x-clerk-') ||
    name.startsWith('x-ltth-') ||
    name.startsWith('x-device-') ||
    name.startsWith('x-forwarded-') ||
    name.includes('client-cert') ||
    /^cf-(?:access|client-cert|connecting-ip|ipcountry|ray|visitor|worker)(?:-|$)/.test(name) ||
    CREDENTIAL_NAME_PATTERN.test(name)
  );
}

function isResponseSensitive(name) {
  return (
    RESPONSE_EXACT_HEADERS.has(name) ||
    name.startsWith('clerk-') ||
    name.startsWith('x-clerk-') ||
    name.startsWith('x-ltth-') ||
    name.startsWith('x-device-') ||
    name.startsWith('x-internal-') ||
    name.startsWith('x-origin-') ||
    name.startsWith('x-upstream-') ||
    name.startsWith('x-backend-') ||
    name.startsWith('x-cloudflared-') ||
    name.startsWith('x-tunnel-') ||
    name.startsWith('x-envoy-') ||
    name.startsWith('cf-') ||
    CREDENTIAL_NAME_PATTERN.test(name)
  );
}

function filterHeaders(input, isSensitive) {
  const source = new Headers(input);
  const filtered = new Headers();
  const connectionScoped = connectionScopedHeaderNames(source);

  for (const [rawName, value] of source) {
    const name = rawName.toLowerCase();
    if (
      HOP_BY_HOP_HEADERS.has(name) ||
      connectionScoped.has(name) ||
      isSensitive(name)
    ) {
      continue;
    }
    filtered.append(rawName, value);
  }
  return filtered;
}

export function filterProxyRequestHeaders(input) {
  return filterHeaders(input, isRequestSensitive);
}

export function filterProxyResponseHeaders(input) {
  return filterHeaders(input, isResponseSensitive);
}
