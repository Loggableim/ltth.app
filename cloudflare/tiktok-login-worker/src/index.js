const ALLOWED_HOSTS = new Set([
  'auth.ltth.app',
  'auth-staging.ltth.app',
  'ltth-tiktok-login-worker.pixstash.workers.dev'
]);
const AUTHORIZE_ENDPOINT = 'https://www.tiktok.com/v2/auth/authorize/';
const TOKEN_ENDPOINT = 'https://open.tiktokapis.com/v2/oauth/token/';
const START_PATH = '/oauth/tiktok/start';
const CALLBACK_PATH = '/oauth/tiktok/callback';
const STATE_COOKIE_NAME = '__Host-ltth_tiktok_oauth_state';
const STATE_MAX_AGE_SECONDS = 300;
const STATE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const HTML_HEADERS = {
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  'Content-Type': 'text/html; charset=UTF-8',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff'
};

function plainTextResponse(body, status, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=UTF-8',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders
    }
  });
}

function htmlResponse(title, message, status, clearState = false) {
  const headers = new Headers(HTML_HEADERS);
  if (clearState) {
    headers.set('Set-Cookie', clearStateCookie());
  }

  const body = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
</head>
<body>
  <main>
    <h1>${title}</h1>
    <p>${message}</p>
  </main>
</body>
</html>`;

  return new Response(body, { status, headers });
}

function createState(cryptoImpl) {
  const bytes = new Uint8Array(32);
  cryptoImpl.getRandomValues(bytes);
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

function createStateCookie(state) {
  return `${STATE_COOKIE_NAME}=${state}; Path=/; Max-Age=${STATE_MAX_AGE_SECONDS}; Secure; HttpOnly; SameSite=Lax`;
}

function clearStateCookie() {
  return `${STATE_COOKIE_NAME}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax`;
}

function readCookie(request, name) {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) {
    return null;
  }

  for (const cookie of cookieHeader.split(';')) {
    const separatorIndex = cookie.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const cookieName = cookie.slice(0, separatorIndex).trim();
    if (cookieName === name) {
      return cookie.slice(separatorIndex + 1).trim();
    }
  }

  return null;
}

function stateTokensMatch(returnedState, cookieState) {
  if (
    !STATE_PATTERN.test(returnedState ?? '') ||
    !STATE_PATTERN.test(cookieState ?? '')
  ) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < returnedState.length; index += 1) {
    difference |= returnedState.charCodeAt(index) ^ cookieState.charCodeAt(index);
  }

  return difference === 0;
}

function readConfiguration(env, requestUrl) {
  const requiredBindings = [
    'TIKTOK_CLIENT_KEY',
    'TIKTOK_CLIENT_SECRET',
    'TIKTOK_REDIRECT_URI'
  ];

  for (const binding of requiredBindings) {
    if (typeof env?.[binding] !== 'string' || env[binding].trim() === '') {
      return null;
    }
  }

  const expectedRedirectUri = `https://${requestUrl.host}${CALLBACK_PATH}`;
  let redirectUri;
  try {
    redirectUri = new URL(env.TIKTOK_REDIRECT_URI);
  } catch {
    return null;
  }

  if (redirectUri.href !== expectedRedirectUri) {
    return null;
  }

  return {
    clientKey: env.TIKTOK_CLIENT_KEY,
    clientSecret: env.TIKTOK_CLIENT_SECRET,
    redirectUri: redirectUri.href
  };
}

function startAuthorization(configuration, cryptoImpl) {
  const state = createState(cryptoImpl);
  const authorizeUrl = new URL(AUTHORIZE_ENDPOINT);
  authorizeUrl.searchParams.set('client_key', configuration.clientKey);
  authorizeUrl.searchParams.set('redirect_uri', configuration.redirectUri);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('scope', 'user.info.basic');
  authorizeUrl.searchParams.set('state', state);

  return new Response(null, {
    status: 302,
    headers: {
      'Cache-Control': 'no-store',
      Location: authorizeUrl.href,
      'Referrer-Policy': 'no-referrer',
      'Set-Cookie': createStateCookie(state)
    }
  });
}

async function exchangeAuthorizationCode(
  request,
  requestUrl,
  configuration,
  fetchImpl
) {
  const returnedState = requestUrl.searchParams.get('state');
  const cookieState = readCookie(request, STATE_COOKIE_NAME);

  if (!stateTokensMatch(returnedState, cookieState)) {
    return htmlResponse(
      'TikTok login could not be verified',
      'The login request could not be verified. Please start again.',
      400,
      true
    );
  }

  if (requestUrl.searchParams.has('error')) {
    return htmlResponse(
      'TikTok login was not completed',
      'TikTok authorization was cancelled or denied. You may close this window.',
      400,
      true
    );
  }

  const code = requestUrl.searchParams.get('code');
  if (!code) {
    return htmlResponse(
      'TikTok login could not be completed',
      'The authorization response did not include a login code. Please start again.',
      400,
      true
    );
  }

  const body = new URLSearchParams({
    client_key: configuration.clientKey,
    client_secret: configuration.clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: configuration.redirectUri
  });

  try {
    const tokenResponse = await fetchImpl(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });
    const tokenPayload = await tokenResponse.json();

    if (
      !tokenResponse.ok ||
      typeof tokenPayload?.access_token !== 'string' ||
      tokenPayload.access_token === ''
    ) {
      throw new Error('Token exchange rejected');
    }
  } catch {
    return htmlResponse(
      'TikTok login could not be completed',
      'TikTok could not complete the login. Please try again.',
      502,
      true
    );
  }

  return htmlResponse(
    'TikTok login complete',
    'Authorization succeeded. You can close this window.',
    200,
    true
  );
}

export function createTikTokLoginWorker({
  fetchImpl = globalThis.fetch,
  cryptoImpl = globalThis.crypto
} = {}) {
  return {
    async fetch(request, env) {
      const requestUrl = new URL(request.url);

      if (requestUrl.protocol !== 'https:') {
        return plainTextResponse('HTTPS Required', 400);
      }

      if (!ALLOWED_HOSTS.has(requestUrl.host)) {
        return plainTextResponse('Not Found', 404);
      }

      if (request.method !== 'GET') {
        return plainTextResponse('Method Not Allowed', 405, { Allow: 'GET' });
      }

      if (requestUrl.pathname !== START_PATH && requestUrl.pathname !== CALLBACK_PATH) {
        return plainTextResponse('Not Found', 404);
      }

      const configuration = readConfiguration(env, requestUrl);
      if (!configuration) {
        return htmlResponse(
          'TikTok login is unavailable',
          'The login service is not configured correctly.',
          500
        );
      }

      if (requestUrl.pathname === START_PATH) {
        return startAuthorization(configuration, cryptoImpl);
      }

      return exchangeAuthorizationCode(
        request,
        requestUrl,
        configuration,
        fetchImpl
      );
    }
  };
}

export default createTikTokLoginWorker();
