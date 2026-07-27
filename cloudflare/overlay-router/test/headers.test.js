import { describe, expect, it } from 'vitest';
import {
  filterProxyRequestHeaders,
  filterProxyResponseHeaders
} from './src/headers.js';
import {
  OFFLINE_PROBE_MAX_DELAY_MS,
  OFFLINE_PROBE_MIN_DELAY_MS,
  OFFLINE_PROBE_PARAMETER,
  createOfflinePageResponse,
  getOfflineProbeDelay
} from './src/offline-page.js';

describe('proxy request header filtering', () => {
  it('removes credentials, client certificates, origin metadata, and hop-by-hop headers', () => {
    const filtered = filterProxyRequestHeaders(new Headers({
      accept: 'text/html',
      authorization: 'Bearer clerk-secret',
      cookie: 'session=secret',
      cookie2: 'legacy-session=secret',
      'x-clerk-session-token': 'clerk-secret',
      'x-ltth-device-credential': 'device-secret',
      'device-id': 'private-device',
      'cf-access-client-id': 'client-id',
      'cf-access-client-secret': 'client-secret',
      'x-forwarded-client-cert': 'certificate',
      'cf-client-cert-der-base64': 'certificate',
      'x-amzn-mtls-clientcert': 'certificate',
      forwarded: 'for=private',
      'x-forwarded-for': '127.0.0.1',
      host: 'r-secret.ltth.app',
      connection: 'keep-alive, x-remove-me',
      'x-remove-me': 'connection-scoped',
      'keep-alive': 'timeout=5',
      te: 'trailers',
      trailer: 'x-checksum',
      'transfer-encoding': 'chunked',
      upgrade: 'websocket',
      'sec-websocket-protocol': 'socket.io'
    }));

    expect(Object.fromEntries(filtered)).toEqual({
      accept: 'text/html',
      'sec-websocket-protocol': 'socket.io'
    });
  });

  it('does not mutate the source headers', () => {
    const source = new Headers({
      authorization: 'Bearer secret',
      accept: 'application/json'
    });
    filterProxyRequestHeaders(source);
    expect(source.get('authorization')).toBe('Bearer secret');
  });
});

describe('proxy response header filtering', () => {
  it('removes cookies, credentials, origin diagnostics, internal metadata, and connection-named headers', () => {
    const filtered = filterProxyResponseHeaders(new Headers({
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-cache',
      'set-cookie': 'session=secret',
      server: 'private-origin',
      'x-powered-by': 'Express',
      'x-origin-server': 'desktop-host',
      'x-upstream-address': '127.0.0.1:3000',
      'x-cloudflared-tunnel': 'tunnel-secret',
      'x-ltth-route-key': 'route-secret',
      'x-internal-debug': 'origin-secret',
      'x-api-token': 'credential-secret',
      'www-authenticate': 'Bearer private',
      'set-cookie2': 'legacy-session=secret',
      'cf-ray': 'diagnostic-ray',
      connection: 'x-private-debug',
      'x-private-debug': 'origin-secret',
      via: 'private-proxy',
      'transfer-encoding': 'chunked'
    }));

    expect(Object.fromEntries(filtered)).toEqual({
      'cache-control': 'no-cache',
      'content-type': 'text/html; charset=utf-8'
    });
  });
});

describe('transparent offline page', () => {
  it('returns asset-free no-store HTML without embedding route or query details', async () => {
    const originalUrl =
      'https://overlay.ltth.app/private_owner/plugin/overlay?scene=super-secret';
    const response = createOfflinePageResponse(originalUrl);
    const body = await response.text();
    const csp = response.headers.get('content-security-policy');

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toMatch(/script-src 'nonce-[A-Za-z0-9_-]+'/);
    expect(csp).toMatch(/style-src 'nonce-[A-Za-z0-9_-]+'/);
    expect(body).not.toContain('private_owner');
    expect(body).not.toContain('super-secret');
    expect(body).not.toContain('trycloudflare.com');
    expect(body).not.toMatch(/<(?:img|link|iframe|object|embed|video|audio)\b/i);
    expect(body).toContain('window.location.href');
    expect(body).toContain(JSON.stringify(OFFLINE_PROBE_PARAMETER));
    expect(body).toContain('response.status === 204');
    expect(body).toContain('window.location.reload()');
  });

  it('chooses every retry delay inside the inclusive four-to-seven-second range', () => {
    expect(OFFLINE_PROBE_MIN_DELAY_MS).toBe(4000);
    expect(OFFLINE_PROBE_MAX_DELAY_MS).toBe(7000);
    expect(getOfflineProbeDelay(() => 0)).toBe(4000);
    expect(getOfflineProbeDelay(() => 0.5)).toBe(5500);
    expect(getOfflineProbeDelay(() => 0.999999)).toBe(7000);
  });
});
