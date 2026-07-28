import { webcrypto } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { createTikTokLoginWorker } from '../src/index.js';

const PRODUCTION_HOST = 'auth.ltth.app';
const CALLBACK_PATH = '/oauth/tiktok/callback';
const TOKEN_ENDPOINT = 'https://open.tiktokapis.com/v2/oauth/token/';
const VALID_STATE = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ';

function createEnv(host = PRODUCTION_HOST) {
  return {
    TIKTOK_CLIENT_KEY: 'test-client-key',
    TIKTOK_CLIENT_SECRET: 'test-client-secret',
    TIKTOK_REDIRECT_URI: `https://${host}${CALLBACK_PATH}`
  };
}

function readStateCookie(response) {
  const setCookie = response.headers.get('Set-Cookie');
  const match = setCookie?.match(
    /^__Host-ltth_tiktok_oauth_state=([A-Za-z0-9_-]+);/
  );

  if (!match) {
    throw new Error(`OAuth state cookie missing from: ${setCookie}`);
  }

  return {
    header: setCookie,
    state: match[1]
  };
}

function callbackRequest(state, cookieState = state, host = PRODUCTION_HOST) {
  const url = new URL(`https://${host}${CALLBACK_PATH}`);
  url.searchParams.set('code', 'authorization-code');
  url.searchParams.set('state', state);

  return new Request(url, {
    headers: {
      Cookie: `__Host-ltth_tiktok_oauth_state=${cookieState}`
    }
  });
}

describe('TikTok Login Kit Worker request boundary', () => {
  it('rejects methods other than GET without calling TikTok', async () => {
    const fetchImpl = vi.fn();
    const worker = createTikTokLoginWorker({ fetchImpl, cryptoImpl: webcrypto });

    const response = await worker.fetch(
      new Request(`https://${PRODUCTION_HOST}/oauth/tiktok/start`, {
        method: 'POST'
      }),
      createEnv()
    );

    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('GET');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ['non-HTTPS requests', 'http://auth.ltth.app/oauth/tiktok/start', 400],
    ['unknown hosts', 'https://example.com/oauth/tiktok/start', 404],
    [
      'allowed hosts with a non-default port',
      'https://auth.ltth.app:8443/oauth/tiktok/start',
      404
    ]
  ])('rejects %s', async (_label, url, expectedStatus) => {
    const worker = createTikTokLoginWorker({
      fetchImpl: vi.fn(),
      cryptoImpl: webcrypto
    });

    const response = await worker.fetch(new Request(url), createEnv());

    expect(response.status).toBe(expectedStatus);
  });
});

describe('GET /oauth/tiktok/start', () => {
  it('sets a hardened random state cookie and redirects with only the basic scope', async () => {
    const worker = createTikTokLoginWorker({
      fetchImpl: vi.fn(),
      cryptoImpl: webcrypto
    });

    const response = await worker.fetch(
      new Request(`https://${PRODUCTION_HOST}/oauth/tiktok/start`),
      createEnv()
    );

    expect(response.status).toBe(302);

    const cookie = readStateCookie(response);
    expect(cookie.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(cookie.header).toContain('Path=/');
    expect(cookie.header).toContain('Max-Age=300');
    expect(cookie.header).toContain('Secure');
    expect(cookie.header).toContain('HttpOnly');
    expect(cookie.header).toContain('SameSite=Lax');

    const redirect = new URL(response.headers.get('Location'));
    expect(`${redirect.origin}${redirect.pathname}`).toBe(
      'https://www.tiktok.com/v2/auth/authorize/'
    );
    expect(Object.fromEntries(redirect.searchParams)).toEqual({
      client_key: 'test-client-key',
      redirect_uri: `https://${PRODUCTION_HOST}${CALLBACK_PATH}`,
      response_type: 'code',
      scope: 'user.info.basic',
      state: cookie.state
    });
  });
});

describe('GET /oauth/tiktok/callback', () => {
  it('rejects a state mismatch before token exchange and clears the cookie', async () => {
    const fetchImpl = vi.fn();
    const worker = createTikTokLoginWorker({ fetchImpl, cryptoImpl: webcrypto });

    const response = await worker.fetch(
      callbackRequest('returned-state', 'cookie-state'),
      createEnv()
    );

    expect(response.status).toBe(400);
    expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0');
    expect(await response.text()).toContain('could not be verified');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('exchanges the code server-side and renders success without exposing tokens', async () => {
    const accessToken = 'access-token-must-stay-secret';
    const refreshToken = 'refresh-token-must-stay-secret';
    const fetchImpl = vi.fn(async () =>
      Response.json({
        access_token: accessToken,
        expires_in: 86400,
        open_id: 'test-open-id',
        refresh_expires_in: 31536000,
        refresh_token: refreshToken,
        scope: 'user.info.basic',
        token_type: 'Bearer'
      })
    );
    const worker = createTikTokLoginWorker({ fetchImpl, cryptoImpl: webcrypto });

    const response = await worker.fetch(
      callbackRequest(VALID_STATE),
      createEnv()
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe(
      'text/html; charset=UTF-8'
    );
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [tokenUrl, tokenInit] = fetchImpl.mock.calls[0];
    expect(tokenUrl).toBe(TOKEN_ENDPOINT);
    expect(tokenInit.method).toBe('POST');
    expect(tokenInit.headers).toEqual({
      'Content-Type': 'application/x-www-form-urlencoded'
    });
    expect(Object.fromEntries(new URLSearchParams(tokenInit.body))).toEqual({
      client_key: 'test-client-key',
      client_secret: 'test-client-secret',
      code: 'authorization-code',
      grant_type: 'authorization_code',
      redirect_uri: `https://${PRODUCTION_HOST}${CALLBACK_PATH}`
    });

    const html = await response.text();
    expect(html).toContain('TikTok login complete');
    expect(html).not.toContain(accessToken);
    expect(html).not.toContain(refreshToken);
    expect(html).not.toContain('test-open-id');
  });

  it('renders a safe error when TikTok rejects the token exchange', async () => {
    const upstreamToken = 'upstream-token-must-not-leak';
    const fetchImpl = vi.fn(async () =>
      Response.json(
        {
          error: 'invalid_grant',
          error_description: `Rejected ${upstreamToken}`,
          log_id: 'sensitive-upstream-log-id'
        },
        { status: 400 }
      )
    );
    const worker = createTikTokLoginWorker({ fetchImpl, cryptoImpl: webcrypto });

    const response = await worker.fetch(
      callbackRequest(VALID_STATE),
      createEnv()
    );

    expect(response.status).toBe(502);
    expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0');

    const html = await response.text();
    expect(html).toContain('TikTok login could not be completed');
    expect(html).not.toContain(upstreamToken);
    expect(html).not.toContain('invalid_grant');
    expect(html).not.toContain('sensitive-upstream-log-id');
  });
});
