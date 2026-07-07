const crypto = require('crypto');

const STORE_SESSION_COOKIE = 'ltth_store_session';
const STORE_SESSION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

function cleanEnvValue(value) {
  return String(value || '').trim();
}

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function getStoreSessionSecret(env = process.env) {
  return cleanEnvValue(env.LTTH_STORE_SESSION_SECRET || env.CLERK_SECRET_KEY);
}

function signStoreSessionPayload(encodedPayload, env = process.env) {
  const secret = getStoreSessionSecret(env);
  if (!secret) {
    return '';
  }

  return crypto
    .createHmac('sha256', secret)
    .update(encodedPayload)
    .digest('base64url');
}

function serializeStoreSession(account = {}, options = {}) {
  const env = options.env || process.env;
  const now = options.now || (() => new Date());
  const userId = cleanEnvValue(account.userId);
  if (!userId || !getStoreSessionSecret(env)) {
    return '';
  }

  const issuedAt = now().getTime();
  const expiresAt = issuedAt + STORE_SESSION_MAX_AGE_MS;
  const payload = base64UrlEncode(JSON.stringify({
    userId,
    sessionId: cleanEnvValue(account.sessionId) || null,
    iat: issuedAt,
    exp: expiresAt
  }));
  const signature = signStoreSessionPayload(payload, env);

  return signature ? `${payload}.${signature}` : '';
}

function parseCookies(cookieHeader = '') {
  const cookies = {};
  for (const part of String(cookieHeader || '').split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) {
      cookies[key] = decodeURIComponent(value);
    }
  }
  return cookies;
}

function parseStoreSessionCookie(req, options = {}) {
  const env = options.env || process.env;
  const now = options.now || (() => new Date());
  const cookieName = options.cookieName || STORE_SESSION_COOKIE;
  const value = parseCookies(req.headers?.cookie || '')[cookieName];
  if (!value) {
    return null;
  }

  const [encodedPayload, signature] = value.split('.');
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signStoreSessionPayload(encodedPayload, env);
  if (!expectedSignature) {
    return null;
  }

  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    return null;
  }

  if (!payload.userId || !Number.isFinite(payload.exp) || payload.exp <= now().getTime()) {
    return null;
  }

  return {
    userId: cleanEnvValue(payload.userId),
    sessionId: cleanEnvValue(payload.sessionId) || null
  };
}

function appendSetCookie(res, cookie) {
  const existing = res.getHeader?.('Set-Cookie');
  if (!existing) {
    res.setHeader?.('Set-Cookie', cookie);
    return;
  }

  res.setHeader?.('Set-Cookie', Array.isArray(existing) ? existing.concat(cookie) : [existing, cookie]);
}

function setStoreSessionCookie(res, account = {}, options = {}) {
  const token = serializeStoreSession(account, options);
  if (!token) {
    return false;
  }

  const cookieName = options.cookieName || STORE_SESSION_COOKIE;
  const maxAgeSeconds = Math.floor(STORE_SESSION_MAX_AGE_MS / 1000);
  const now = options.now || (() => new Date());
  const expiresAt = new Date(now().getTime() + STORE_SESSION_MAX_AGE_MS).toUTCString();
  appendSetCookie(
    res,
    `${cookieName}=${encodeURIComponent(token)}; Max-Age=${maxAgeSeconds}; Expires=${expiresAt}; Path=/; HttpOnly; SameSite=Lax`
  );
  return true;
}

function clearStoreSessionCookie(res, options = {}) {
  const cookieName = options.cookieName || STORE_SESSION_COOKIE;
  appendSetCookie(res, `${cookieName}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; HttpOnly; SameSite=Lax`);
}

function deriveClerkFrontendDomain(publishableKey) {
  try {
    let encoded = String(publishableKey || '').split('_')[2] || '';
    encoded = encoded.replace(/-/g, '+').replace(/_/g, '/');
    while (encoded.length % 4) encoded += '=';
    return Buffer.from(encoded, 'base64').toString('utf8').replace(/\$$/, '');
  } catch (error) {
    return '';
  }
}

function buildStoreAuthConfig(env = process.env) {
  const publishableKey = cleanEnvValue(
    env.CLERK_PUBLISHABLE_KEY ||
    env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
    env.VITE_CLERK_PUBLISHABLE_KEY
  );
  const secretKey = cleanEnvValue(env.CLERK_SECRET_KEY);
  const proxyUrl = cleanEnvValue(env.CLERK_PROXY_URL || env.NEXT_PUBLIC_CLERK_PROXY_URL);
  const frontendDomain = cleanEnvValue(env.CLERK_FRONTEND_API || deriveClerkFrontendDomain(publishableKey));
  const authBridgeUrl = cleanEnvValue(env.CLERK_AUTH_BRIDGE_URL || 'https://ltth.app/auth/');
  const authCallbackPath = cleanEnvValue(env.CLERK_AUTH_CALLBACK_PATH || '/auth/clerk/callback.html');
  const accountPortalBaseUrl = cleanEnvValue(
    env.LTTH_ACCOUNT_PORTAL_URL ||
    env.CLERK_ACCOUNT_PORTAL_URL ||
    'https://accounts.ltth.app'
  ).replace(/\/+$/, '');
  const accountManagementUrl = cleanEnvValue(
    env.LTTH_ACCOUNT_MANAGEMENT_URL ||
    `${accountPortalBaseUrl}/user`
  );
  const signInUrl = cleanEnvValue(
    env.LTTH_ACCOUNT_SIGN_IN_URL ||
    `${accountPortalBaseUrl}/sign-in`
  );
  const signUpUrl = cleanEnvValue(
    env.LTTH_ACCOUNT_SIGN_UP_URL ||
    `${accountPortalBaseUrl}/sign-up`
  );
  const unauthorizedSignInUrl = cleanEnvValue(
    env.LTTH_ACCOUNT_UNAUTHORIZED_SIGN_IN_URL ||
    `${accountPortalBaseUrl}/unauthorized-sign-in`
  );

  return {
    authRequired: true,
    closedStore: true,
    clerkEnabled: Boolean(publishableKey && secretKey),
    publishableKey,
    frontendDomain,
    proxyUrl,
    authBridgeUrl,
    authCallbackPath,
    accountPortalBaseUrl,
    accountManagementUrl,
    signInUrl,
    signUpUrl,
    unauthorizedSignInUrl,
    secretConfigured: Boolean(secretKey),
    billingEnabled: env.CLERK_BILLING_ENABLED !== 'false',
    loginMethods: ['email', 'passkey', 'google', 'apple', 'tiktok']
  };
}

function resolveClerkExpress(clerkExpress, logger) {
  if (clerkExpress) {
    return clerkExpress;
  }

  try {
    return require('@clerk/express');
  } catch (error) {
    logger?.warn?.(`[Clerk] @clerk/express is unavailable: ${error.message}`);
    return null;
  }
}

function resolveClerkClient(options = {}) {
  if (options.clerkClient) {
    return options.clerkClient;
  }

  const clerkExpress = resolveClerkExpress(options.clerkExpress, options.logger);
  return clerkExpress?.clerkClient || null;
}

function normalizeStoreLicense(source = {}) {
  const license = source.ltthLicense || source.license || source;
  const status = cleanEnvValue(license.status);
  const plan = cleanEnvValue(license.plan);
  const active = license.active === true || (status === 'active' && plan === 'beta-free');

  return {
    active,
    status: active ? 'active' : (status || 'missing'),
    plan: active ? (plan || 'beta-free') : (plan || null),
    licenseId: cleanEnvValue(license.licenseId) || null,
    claimedAt: cleanEnvValue(license.claimedAt) || null,
    termsVersion: cleanEnvValue(license.termsVersion) || null
  };
}

function normalizeList(value) {
  const rawItems = Array.isArray(value)
    ? value
    : String(value || '').split(',');
  const seen = new Set();
  const items = [];

  for (const rawItem of rawItems) {
    const item = cleanEnvValue(rawItem).toLowerCase();
    if (item && !seen.has(item)) {
      seen.add(item);
      items.push(item);
    }
  }

  return items;
}

function normalizeStoreAccess(source = {}) {
  const access = source.ltthAccess || source.access || source;

  return {
    groups: normalizeList(access.groups || access.group),
    closedBetaPlugins: normalizeList(
      access.closedBetaPlugins ||
      access.closed_beta_plugins ||
      access.plugins ||
      access.pluginIds
    )
  };
}

function extractLicenseFromUser(user = {}) {
  const privateLicense = user.privateMetadata?.ltthLicense;
  const publicLicense = user.publicMetadata?.ltth;
  if (privateLicense) {
    return normalizeStoreLicense(privateLicense);
  }

  if (publicLicense?.hasLicense === true) {
    return normalizeStoreLicense({
      status: 'active',
      plan: publicLicense.plan || 'beta-free',
      licenseId: publicLicense.licenseId || null,
      claimedAt: publicLicense.claimedAt || null,
      termsVersion: publicLicense.termsVersion || null
    });
  }

  return normalizeStoreLicense();
}

function extractAccessFromUser(user = {}) {
  return normalizeStoreAccess(
    user.privateMetadata?.ltthAccess ||
    user.publicMetadata?.ltthAccess ||
    user.publicMetadata?.ltth?.access ||
    {}
  );
}

function extractLicenseFromClaims(claims = {}) {
  return normalizeStoreLicense(
    claims.ltthLicense ||
    claims.ltth_license ||
    claims.metadata?.ltthLicense ||
    claims.publicMetadata?.ltth ||
    {}
  );
}

function extractAccessFromClaims(claims = {}) {
  return normalizeStoreAccess(
    claims.ltthAccess ||
    claims.ltth_access ||
    claims.metadata?.ltthAccess ||
    claims.publicMetadata?.ltthAccess ||
    claims.publicMetadata?.ltth?.access ||
    {}
  );
}

async function loadStoreLicense(userId, options = {}) {
  const claimsLicense = extractLicenseFromClaims(options.sessionClaims || {});
  if (claimsLicense.active) {
    return claimsLicense;
  }

  const clerkClient = resolveClerkClient(options);
  if (!userId || !clerkClient?.users || typeof clerkClient.users.getUser !== 'function') {
    return claimsLicense;
  }

  const user = await clerkClient.users.getUser(userId);
  return extractLicenseFromUser(user);
}

async function loadStoreEntitlements(userId, options = {}) {
  const claims = options.sessionClaims || {};
  const claimsLicense = extractLicenseFromClaims(claims);
  const claimsAccess = extractAccessFromClaims(claims);
  const claimsHaveAccess = claimsAccess.groups.length > 0 || claimsAccess.closedBetaPlugins.length > 0;

  if (claimsLicense.active && claimsHaveAccess) {
    return {
      license: claimsLicense,
      access: claimsAccess
    };
  }

  const clerkClient = resolveClerkClient(options);
  if (!userId || !clerkClient?.users || typeof clerkClient.users.getUser !== 'function') {
    return {
      license: claimsLicense,
      access: claimsAccess
    };
  }

  const user = await clerkClient.users.getUser(userId);
  return {
    license: extractLicenseFromUser(user),
    access: extractAccessFromUser(user)
  };
}

async function loadStoreAccountFromSessionCookie(req, options = {}) {
  const session = parseStoreSessionCookie(req, options);
  if (!session?.userId) {
    return null;
  }

  const entitlements = await loadStoreEntitlements(session.userId, options);
  return {
    userId: session.userId,
    sessionId: session.sessionId,
    actor: null,
    license: entitlements.license,
    access: entitlements.access,
    has: () => false,
    source: 'local-cookie'
  };
}

function hasActiveStoreLicense(account = {}) {
  return normalizeStoreLicense(account.license || {}).active === true;
}

function hasStoreAdminAccess(account = {}) {
  return normalizeStoreAccess(account.access || {}).groups.includes('admin');
}

function hasClosedBetaPluginAccess(account = {}, pluginId = '') {
  const access = normalizeStoreAccess(account.access || {});
  const groups = new Set(access.groups);
  const pluginIds = new Set(access.closedBetaPlugins);
  const safePluginId = cleanEnvValue(pluginId).toLowerCase();

  return groups.has('admin') || groups.has('closed-beta') || pluginIds.has(safePluginId);
}

function buildBetaLicense(userId, now = () => new Date()) {
  const safeUserId = cleanEnvValue(userId);
  const timestamp = now().toISOString();
  return {
    active: true,
    status: 'active',
    plan: 'beta-free',
    licenseId: `ltth_beta_${safeUserId}`,
    claimedAt: timestamp,
    termsVersion: 'beta-2026-07'
  };
}

async function claimBetaLicenseForStoreAccount(account = {}, options = {}) {
  const userId = cleanEnvValue(account.userId);
  if (!userId) {
    const error = new Error('Authenticated Clerk user is required to claim a beta license.');
    error.code = 'AUTH_REQUIRED';
    throw error;
  }

  const clerkClient = resolveClerkClient(options);
  if (!clerkClient?.users || typeof clerkClient.users.updateUserMetadata !== 'function') {
    const error = new Error('Clerk user metadata API is unavailable.');
    error.code = 'CLERK_METADATA_UNAVAILABLE';
    throw error;
  }

  const license = buildBetaLicense(userId, options.now);
  await clerkClient.users.updateUserMetadata(userId, {
    privateMetadata: {
      ltthLicense: {
        status: license.status,
        plan: license.plan,
        licenseId: license.licenseId,
        claimedAt: license.claimedAt,
        termsVersion: license.termsVersion
      }
    },
    publicMetadata: {
      ltth: {
        hasLicense: true,
        plan: license.plan,
        licenseId: license.licenseId,
        claimedAt: license.claimedAt,
        termsVersion: license.termsVersion
      }
    }
  });

  return license;
}

function createClerkMiddleware(options = {}) {
  const env = options.env || process.env;
  const logger = options.logger;
  const config = buildStoreAuthConfig(env);

  if (!config.clerkEnabled) {
    return (req, res, next) => next();
  }

  const clerkExpress = resolveClerkExpress(options.clerkExpress, logger);
  if (!clerkExpress || typeof clerkExpress.clerkMiddleware !== 'function') {
    return (req, res, next) => next();
  }

  try {
    return clerkExpress.clerkMiddleware();
  } catch (error) {
    logger?.error?.(`[Clerk] Failed to initialize Clerk middleware: ${error.message}`);
    return (req, res, next) => next();
  }
}

function createClerkFrontendProxy(options = {}) {
  const env = options.env || process.env;
  const logger = options.logger;

  return async (req, res, next) => {
    const config = buildStoreAuthConfig(env);
    if (!config.clerkEnabled || !config.frontendDomain || !config.proxyUrl) {
      return next();
    }

    const basePath = config.proxyUrl.replace(/^https?:\/\/[^/]+/i, '').replace(/\/+$/, '') || '/__clerk';
    const originalUrl = req.originalUrl || req.url || '';
    if (!originalUrl.startsWith(basePath)) {
      return next();
    }

    const targetPath = originalUrl.slice(basePath.length) || '/';
    const targetUrl = new URL(targetPath, `https://${config.frontendDomain}`);
    const headers = buildProxyHeaders(req, config, env);
    const method = req.method || 'GET';
    const init = { method, headers, redirect: 'manual' };

    if (!['GET', 'HEAD'].includes(method.toUpperCase())) {
      init.body = req;
      init.duplex = 'half';
    }

    try {
      const upstream = await fetch(targetUrl, init);
      res.status(upstream.status);
      copyProxyResponseHeaders(upstream.headers, res);

      if (method.toUpperCase() === 'HEAD' || upstream.body == null) {
        return res.end();
      }

      const { Readable } = require('stream');
      return Readable.fromWeb(upstream.body).pipe(res);
    } catch (error) {
      logger?.warn?.(`[Clerk] Frontend API proxy failed: ${error.message}`);
      return res.status(502).json({
        success: false,
        code: 'CLERK_PROXY_FAILED',
        error: 'Could not reach Clerk Frontend API proxy.'
      });
    }
  };
}

function buildProxyHeaders(req, config, env = process.env) {
  const blocked = new Set([
    'connection',
    'content-length',
    'host',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade'
  ]);
  const headers = {};

  for (const [key, value] of Object.entries(req.headers || {})) {
    if (!blocked.has(key.toLowerCase()) && value != null) {
      headers[key] = Array.isArray(value) ? value.join(', ') : value;
    }
  }

  headers['Clerk-Proxy-Url'] = buildProxyUrl(req, config);
  headers['Clerk-Secret-Key'] = config.secretConfigured ? cleanEnvValue(env.CLERK_SECRET_KEY) : '';
  headers['X-Forwarded-For'] = req.ip || req.socket?.remoteAddress || '';

  return headers;
}

function buildProxyUrl(req, config) {
  const configured = cleanEnvValue(config.proxyUrl);
  if (/^https?:\/\//i.test(configured)) {
    return configured.replace(/\/+$/, '');
  }

  const protocol = req.protocol || 'http';
  const host = req.get?.('host') || req.headers?.host || '127.0.0.1:3000';
  return `${protocol}://${host}${configured || '/__clerk'}`.replace(/\/+$/, '');
}

function copyProxyResponseHeaders(headers, res) {
  const blocked = new Set([
    'connection',
    'content-encoding',
    'content-length',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade'
  ]);

  headers.forEach((value, key) => {
    if (!blocked.has(key.toLowerCase())) {
      res.setHeader(key, value);
    }
  });

  if (typeof headers.getSetCookie === 'function') {
    const cookies = headers.getSetCookie();
    if (cookies.length > 0) {
      res.setHeader('set-cookie', cookies);
    }
  }
}

function createRequireStoreAuth(options = {}) {
  const env = options.env || process.env;
  const logger = options.logger;

  return async (req, res, next) => {
    const config = buildStoreAuthConfig(env);
    if (!config.clerkEnabled) {
      return res.status(503).json({
        success: false,
        code: 'CLERK_NOT_CONFIGURED',
        error: 'Plugin store login is required, but Clerk is not configured.'
      });
    }

    const clerkExpress = resolveClerkExpress(options.clerkExpress, logger);
    if (!clerkExpress || typeof clerkExpress.getAuth !== 'function') {
      return res.status(503).json({
        success: false,
        code: 'CLERK_SDK_UNAVAILABLE',
        error: 'Plugin store login is required, but the Clerk SDK is unavailable.'
      });
    }

    let auth;
    try {
      auth = clerkExpress.getAuth(req);
    } catch (error) {
      logger?.warn?.(`[Clerk] Could not read store auth state: ${error.message}`);
      return res.status(401).json({
        success: false,
        code: 'AUTH_REQUIRED',
        error: 'Sign in to use the plugin store.'
      });
    }

    if (!auth || auth.isAuthenticated !== true) {
      try {
        const cookieAccount = await loadStoreAccountFromSessionCookie(req, {
          ...options,
          env,
          logger
        });
        if (cookieAccount) {
          req.storeAccount = cookieAccount;
          return next();
        }
      } catch (error) {
        logger?.warn?.(`[Clerk] Could not restore local store session: ${error.message}`);
        clearStoreSessionCookie(res);
      }

      return res.status(401).json({
        success: false,
        code: 'AUTH_REQUIRED',
        error: 'Sign in to use the plugin store.'
      });
    }

    req.storeAccount = {
      userId: auth.userId || null,
      sessionId: auth.sessionId || null,
      actor: auth.actor || null,
      license: normalizeStoreLicense(),
      access: normalizeStoreAccess(),
      has: typeof auth.has === 'function' ? auth.has.bind(auth) : () => false
    };

    try {
      const entitlements = await loadStoreEntitlements(req.storeAccount.userId, {
        ...options,
        env,
        logger,
        sessionClaims: auth.sessionClaims || {}
      });
      req.storeAccount.license = entitlements.license;
      req.storeAccount.access = entitlements.access;
    } catch (error) {
      logger?.warn?.(`[Clerk] Could not load store entitlements: ${error.message}`);
      req.storeAccount.license = normalizeStoreLicense();
      req.storeAccount.access = normalizeStoreAccess();
    }

    return next();
  };
}

function buildStoreAccountResponse(req, env = process.env) {
  const account = req.storeAccount || {};
  const config = buildStoreAuthConfig(env);

  return {
    success: true,
    account: {
      authenticated: Boolean(account.userId),
      userId: account.userId || null,
      sessionId: account.sessionId || null,
      license: normalizeStoreLicense(account.license || {}),
      access: normalizeStoreAccess(account.access || {})
    },
    billingEnabled: config.billingEnabled,
    closedStore: true
  };
}

module.exports = {
  buildStoreAccountResponse,
  buildStoreAuthConfig,
  buildBetaLicense,
  claimBetaLicenseForStoreAccount,
  createClerkFrontendProxy,
  createClerkMiddleware,
  createRequireStoreAuth,
  clearStoreSessionCookie,
  deriveClerkFrontendDomain,
  extractAccessFromUser,
  extractLicenseFromUser,
  hasClosedBetaPluginAccess,
  hasActiveStoreLicense,
  hasStoreAdminAccess,
  loadStoreEntitlements,
  parseStoreSessionCookie,
  normalizeStoreAccess,
  normalizeStoreLicense,
  setStoreSessionCookie,
  STORE_SESSION_COOKIE,
  STORE_SESSION_MAX_AGE_MS
};
