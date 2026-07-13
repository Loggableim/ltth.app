const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const STORE_SESSION_COOKIE = 'ltth_store_session';
const STORE_SESSION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const CLERK_JWKS_URL = 'https://api.clerk.com/v1/jwks';
const jwksCache = new Map();

function cleanEnvValue(value) {
  return String(value || '').trim();
}

function normalizeList(value) {
  const rawItems = Array.isArray(value) ? value : String(value || '').split(',');
  const items = [];
  const seen = new Set();

  for (const rawItem of rawItems) {
    const item = cleanEnvValue(rawItem).toLowerCase();
    if (item && !seen.has(item)) {
      seen.add(item);
      items.push(item);
    }
  }

  return items;
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
  const cookieName = options.cookieName || STORE_SESSION_COOKIE;
  const cookies = parseCookies(req.headers?.cookie || '');
  return cleanEnvValue(cookies[cookieName] || cookies.__session) || null;
}

function extractSessionToken(req, options = {}) {
  const header = cleanEnvValue(req.headers?.authorization || req.get?.('authorization'));
  if (header) {
    const bearer = header.match(/^Bearer\s+(.+)$/i);
    return cleanEnvValue(bearer ? bearer[1] : header) || null;
  }

  return parseStoreSessionCookie(req, options);
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
  const token = cleanEnvValue(options.token || account.sessionToken || account.token);
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

function getRequestOrigin(req = {}) {
  const origin = cleanEnvValue(req.headers?.origin || req.get?.('origin'));
  if (origin) {
    return origin;
  }

  const host = cleanEnvValue(req.get?.('host') || req.headers?.host);
  if (!host) {
    return '';
  }

  const protocol = cleanEnvValue(req.protocol || req.headers?.['x-forwarded-proto'] || 'http').split(',')[0].trim() || 'http';
  return `${protocol}://${host}`;
}

function buildAuthorizedParties(req, config, env = process.env) {
  const parties = new Set([
    ...normalizeList(env.LTTH_STORE_AUTHORIZED_PARTIES || env.CLERK_AUTHORIZED_PARTIES),
    ...normalizeList(config.authBridgeUrl ? new URL(config.authBridgeUrl).origin : ''),
    ...normalizeList(config.accountPortalBaseUrl ? new URL(config.accountPortalBaseUrl).origin : ''),
    ...normalizeList(getRequestOrigin(req))
  ]);

  return Array.from(parties).filter(Boolean);
}

function decodeJwtHeader(token) {
  try {
    return jwt.decode(token, { complete: true }) || null;
  } catch {
    return null;
  }
}

function deriveClerkFrontendDomain(publishableKey) {
  try {
    let encoded = String(publishableKey || '').split('_')[2] || '';
    encoded = encoded.replace(/-/g, '+').replace(/_/g, '/');
    while (encoded.length % 4) encoded += '=';
    return Buffer.from(encoded, 'base64').toString('utf8').replace(/\$$/, '');
  } catch {
    return '';
  }
}

function buildStoreAuthConfig(env = process.env) {
  const publishableKey = cleanEnvValue(
    env.LTTH_STORE_CLERK_PUBLISHABLE_KEY ||
    env.CLERK_PUBLISHABLE_KEY ||
    env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
    env.VITE_CLERK_PUBLISHABLE_KEY
  );
  const accountPortalBaseUrl = cleanEnvValue(
    env.LTTH_ACCOUNT_PORTAL_URL ||
    env.CLERK_ACCOUNT_PORTAL_URL ||
    'https://ltth.app/auth/'
  ).replace(/\/+$/, '');
  const authBridgeUrl = cleanEnvValue(
    env.LTTH_AUTH_BRIDGE_URL ||
    env.CLERK_AUTH_BRIDGE_URL ||
    `${accountPortalBaseUrl}/`
  );
  const authCallbackPath = cleanEnvValue(env.CLERK_AUTH_CALLBACK_PATH || '/auth/clerk/callback.html');
  const proxyUrl = cleanEnvValue(env.LTTH_STORE_CLERK_PROXY_URL || env.CLERK_PROXY_URL);
  const accountManagementUrl = cleanEnvValue(
    env.LTTH_ACCOUNT_MANAGEMENT_URL ||
    `${accountPortalBaseUrl}/`
  );
  const signInUrl = cleanEnvValue(
    env.LTTH_ACCOUNT_SIGN_IN_URL ||
    `${accountPortalBaseUrl}/?mode=sign-in`
  );
  const signUpUrl = cleanEnvValue(
    env.LTTH_ACCOUNT_SIGN_UP_URL ||
    `${accountPortalBaseUrl}/?mode=sign-up`
  );
  const unauthorizedSignInUrl = cleanEnvValue(
    env.LTTH_ACCOUNT_UNAUTHORIZED_SIGN_IN_URL ||
    `${accountPortalBaseUrl}/?mode=sign-in&reason=unauthorized`
  );
  const frontendDomain = cleanEnvValue(env.CLERK_FRONTEND_API || deriveClerkFrontendDomain(publishableKey));
  const jwtKey = cleanEnvValue(
    env.LTTH_STORE_CLERK_JWT_KEY ||
    env.CLERK_JWT_KEY ||
    env.NEXT_PUBLIC_CLERK_JWT_KEY ||
    env.VITE_CLERK_JWT_KEY
  );
  const storeAuthorizedParties = normalizeList([
    env.LTTH_STORE_AUTHORIZED_PARTIES,
    env.CLERK_AUTHORIZED_PARTIES,
    authBridgeUrl ? new URL(authBridgeUrl).origin : '',
    accountPortalBaseUrl ? new URL(accountPortalBaseUrl).origin : ''
  ].filter(Boolean).join(','));

  return {
    authRequired: true,
    closedStore: true,
    clerkEnabled: Boolean(publishableKey),
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
    jwtKey,
    storeAuthorizedParties,
    secretConfigured: Boolean(cleanEnvValue(env.LTTH_STORE_CLERK_SECRET_KEY || env.CLERK_SECRET_KEY)),
    billingEnabled: env.CLERK_BILLING_ENABLED !== 'false',
    loginMethods: ['email', 'passkey', 'google', 'apple', 'tiktok']
  };
}

async function fetchClerkJwks(jwksUrl, logger) {
  const cacheKey = String(jwksUrl || '').trim() || CLERK_JWKS_URL;
  const cached = jwksCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.keys;
  }

  const response = await fetch(cacheKey, {
    headers: { accept: 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Clerk JWKS from ${cacheKey} (${response.status})`);
  }

  const payload = await response.json();
  const keys = Array.isArray(payload?.keys) ? payload.keys : [];
  if (keys.length === 0) {
    throw new Error(`Clerk JWKS response from ${cacheKey} did not include any keys`);
  }

  jwksCache.set(cacheKey, {
    keys,
    expiresAt: Date.now() + (10 * 60 * 1000)
  });

  return keys;
}

async function resolveClerkVerificationKey(token, options = {}) {
  const env = options.env || process.env;
  const config = options.config || buildStoreAuthConfig(env);
  const header = decodeJwtHeader(token);
  const jwtKey = cleanEnvValue(
    env.LTTH_STORE_CLERK_JWT_KEY ||
    env.CLERK_JWT_KEY ||
    env.NEXT_PUBLIC_CLERK_JWT_KEY ||
    env.VITE_CLERK_JWT_KEY
  );

  if (jwtKey) {
    return jwtKey;
  }

  const jwksUrl = cleanEnvValue(
    env.LTTH_STORE_CLERK_JWKS_URL ||
    env.CLERK_JWKS_URL ||
    (config.frontendDomain ? `https://${config.frontendDomain}/.well-known/jwks.json` : '') ||
    CLERK_JWKS_URL
  );
  const keys = await fetchClerkJwks(jwksUrl, options.logger);
  const candidates = header?.header?.kid ? keys.filter((key) => key.kid === header.header.kid) : keys;

  for (const key of candidates) {
    try {
      return crypto.createPublicKey({ key, format: 'jwk' });
    } catch (error) {
      options.logger?.warn?.(`[Clerk] Ignoring invalid JWKS key ${key.kid || '<unknown>'}: ${error.message}`);
    }
  }

  throw new Error('No usable Clerk public key was found for the current token.');
}

async function verifyClerkSessionToken(token, options = {}) {
  const env = options.env || process.env;
  const config = options.config || buildStoreAuthConfig(env);
  const header = decodeJwtHeader(token);

  if (!header?.header || header.header.alg !== 'RS256') {
    const error = new Error('Unsupported Clerk session token algorithm.');
    error.code = 'CLERK_TOKEN_INVALID';
    throw error;
  }

  const publicKey = await resolveClerkVerificationKey(token, {
    env,
    config,
    logger: options.logger
  });

  let payload;
  try {
    payload = jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      clockTolerance: 5
    });
  } catch (error) {
    const wrapped = new Error(`Clerk session token verification failed: ${error.message}`);
    wrapped.code = 'CLERK_TOKEN_INVALID';
    throw wrapped;
  }

  const authorizedParties = Array.from(new Set([
    ...normalizeList(options.authorizedParties || ''),
    ...buildAuthorizedParties(options.req || {}, config, env)
  ]));
  const tokenOrigin = cleanEnvValue(payload.azp).toLowerCase();
  if (tokenOrigin && authorizedParties.length > 0 && !authorizedParties.includes(tokenOrigin)) {
    const error = new Error(`Clerk session token was issued for an unexpected origin: ${payload.azp}`);
    error.code = 'CLERK_TOKEN_INVALID';
    throw error;
  }

  return payload;
}

function normalizeStoreLicense(source = {}) {
  const license = source.ltthLicense || source.license || source;
  const status = cleanEnvValue(license.status);
  const plan = cleanEnvValue(license.plan);
  const active = license.active === true || (status === 'active' && Boolean(plan));

  return {
    active,
    status: active ? 'active' : (status || 'missing'),
    plan: active ? (plan || 'beta-free') : (plan || null),
    licenseId: cleanEnvValue(license.licenseId) || null,
    claimedAt: cleanEnvValue(license.claimedAt) || null,
    termsVersion: cleanEnvValue(license.termsVersion) || null,
    source: cleanEnvValue(license.source) || null
  };
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
    ),
    features: normalizeList(access.features || access.feature)
  };
}

function normalizeClerkPlan(value) {
  const match = cleanEnvValue(value).toLowerCase().match(/^[uo]:([a-z0-9][a-z0-9_-]*)$/);
  return match ? match[1] : null;
}

function normalizeClerkFeatures(value) {
  return normalizeList(String(value || '').replace(/\b[uo]:/g, ''));
}

function extractBillingEntitlementFromClaims(claims = {}) {
  const plan = normalizeClerkPlan(claims.pla);
  const features = normalizeClerkFeatures(claims.fea);

  return {
    present: Boolean(plan),
    paid: Boolean(plan && plan !== 'free'),
    plan,
    features,
    source: plan ? 'clerk-billing' : null
  };
}

function mergeStoreAccess(...values) {
  const merged = {
    groups: [],
    closedBetaPlugins: [],
    features: []
  };

  for (const value of values) {
    const access = normalizeStoreAccess(value);
    merged.groups = normalizeList(merged.groups.concat(access.groups));
    merged.closedBetaPlugins = normalizeList(merged.closedBetaPlugins.concat(access.closedBetaPlugins));
    merged.features = normalizeList(merged.features.concat(access.features));
  }

  return merged;
}

function buildBillingLicense(entitlement = {}) {
  return normalizeStoreLicense({
    active: entitlement.present,
    status: entitlement.present ? 'active' : 'missing',
    plan: entitlement.plan,
    source: entitlement.source
  });
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

function hasSubscriberPluginAccess(account = {}) {
  const access = normalizeStoreAccess(account.access || {});
  const groups = new Set(access.groups);
  return groups.has('admin') || groups.has('subscriber');
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
  const billing = extractBillingEntitlementFromClaims(options.sessionClaims || {});
  if (billing.present) {
    return buildBillingLicense(billing);
  }

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
  const billing = extractBillingEntitlementFromClaims(claims);
  const claimsLicense = extractLicenseFromClaims(claims);
  const claimsAccess = extractAccessFromClaims(claims);
  const claimsHaveAccess = claimsAccess.groups.length > 0 || claimsAccess.closedBetaPlugins.length > 0;

  const clerkClient = resolveClerkClient(options);
  let user = null;
  if (userId && clerkClient?.users && typeof clerkClient.users.getUser === 'function') {
    user = await clerkClient.users.getUser(userId);
  }

  if (billing.present) {
    const billingAccess = {
      groups: billing.paid ? ['subscriber'] : [],
      features: billing.features
    };
    const userAccess = user ? extractAccessFromUser(user) : {};
    return {
      license: buildBillingLicense(billing),
      access: mergeStoreAccess(billingAccess, claimsAccess, userAccess)
    };
  }

  if (claimsLicense.active && claimsHaveAccess) {
    return {
      license: claimsLicense,
      access: claimsAccess
    };
  }

  if (!user) {
    return {
      license: claimsLicense.active ? claimsLicense : buildBetaLicense(userId, options.now),
      access: claimsAccess
    };
  }

  return {
    license: extractLicenseFromUser(user),
    access: extractAccessFromUser(user)
  };
}

async function loadStoreAccountFromSessionCookie(req, options = {}) {
  const token = parseStoreSessionCookie(req, options);
  if (!token) {
    return null;
  }

  const sessionClaims = await verifyClerkSessionToken(token, {
    ...options,
    req
  });
  const userId = cleanEnvValue(sessionClaims.sub || sessionClaims.userId);
  if (!userId) {
    return null;
  }

  const entitlements = await loadStoreEntitlements(userId, {
    ...options,
    sessionClaims
  });

  return {
    userId,
    sessionId: cleanEnvValue(sessionClaims.sid || sessionClaims.sessionId) || null,
    actor: sessionClaims.act || null,
    sessionClaims,
    license: entitlements.license,
    access: entitlements.access,
    has: () => false,
    source: 'local-cookie',
    sessionToken: token
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
  const license = buildBetaLicense(userId, options.now);

  if (!clerkClient?.users || typeof clerkClient.users.updateUserMetadata !== 'function') {
    return license;
  }

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

function createClerkMiddleware() {
  return (req, res, next) => next();
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

function createClerkFrontendProxy(options = {}) {
  const env = options.env || process.env;
  const logger = options.logger;

  return async (req, res, next) => {
    const config = buildStoreAuthConfig(env);
    if (!config.clerkEnabled || !config.frontendDomain || !config.authBridgeUrl) {
      return next();
    }

    const basePath = config.authBridgeUrl.replace(/^https?:\/\/[^/]+/i, '').replace(/\/+$/, '') || '/__clerk';
    const originalUrl = req.originalUrl || req.url || '';
    const originalPath = originalUrl.split(/[?#]/, 1)[0];
    const localCallbackPath = config.authCallbackPath.replace(/[?#].*$/, '');
    const callbackDirectory = localCallbackPath.slice(0, localCallbackPath.lastIndexOf('/') + 1);

    // The local callback page is served from app/public. Do not proxy it (or
    // its adjacent browser helpers) to the public account portal.
    if (callbackDirectory && originalPath.startsWith(callbackDirectory)) {
      return next();
    }

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

function createRequireStoreAuth(options = {}) {
  const env = options.env || process.env;
  const logger = options.logger;

  return async (req, res, next) => {
    const config = buildStoreAuthConfig(env);
    if (!config.clerkEnabled) {
      return res.status(503).json({
        success: false,
        code: 'CLERK_NOT_CONFIGURED',
        error: 'Plugin store login is required, but the public Clerk config is missing.'
      });
    }

    const sessionToken = extractSessionToken(req, options);
    if (!sessionToken) {
      return res.status(401).json({
        success: false,
        code: 'AUTH_REQUIRED',
        error: 'Sign in to use the plugin store.'
      });
    }

    let sessionClaims;
    try {
      sessionClaims = await verifyClerkSessionToken(sessionToken, {
        ...options,
        env,
        req,
        logger,
        config,
        authorizedParties: config.storeAuthorizedParties
      });
    } catch (error) {
      logger?.warn?.(`[Clerk] Could not verify store session token: ${error.message}`);
      const cookieHeader = String(req.headers?.cookie || '');
      if (cookieHeader.includes(`${STORE_SESSION_COOKIE}=`) || cookieHeader.includes('__session=')) {
        clearStoreSessionCookie(res, options);
      }
      return res.status(401).json({
        success: false,
        code: 'AUTH_REQUIRED',
        error: 'Sign in to use the plugin store.'
      });
    }

    const userId = cleanEnvValue(sessionClaims.sub || sessionClaims.userId);
    if (!userId) {
      return res.status(401).json({
        success: false,
        code: 'AUTH_REQUIRED',
        error: 'Sign in to use the plugin store.'
      });
    }

    req.storeAuthToken = sessionToken;
    req.storeAccount = {
      userId,
      sessionId: cleanEnvValue(sessionClaims.sid || sessionClaims.sessionId) || null,
      actor: sessionClaims.act || null,
      sessionClaims,
      license: buildBetaLicense(userId),
      access: normalizeStoreAccess(),
      has: () => false,
      source: 'local-cookie',
      sessionToken
    };

    try {
      const entitlements = await loadStoreEntitlements(req.storeAccount.userId, {
        ...options,
        env,
        logger,
        sessionClaims
      });
      req.storeAccount.license = entitlements.license;
      req.storeAccount.access = entitlements.access;
    } catch (error) {
      logger?.warn?.(`[Clerk] Could not load store entitlements: ${error.message}`);
      req.storeAccount.license = buildBetaLicense(userId);
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
  STORE_SESSION_COOKIE,
  STORE_SESSION_MAX_AGE_MS,
  buildBetaLicense,
  buildStoreAccountResponse,
  buildStoreAuthConfig,
  claimBetaLicenseForStoreAccount,
  clearStoreSessionCookie,
  createClerkFrontendProxy,
  createClerkMiddleware,
  createRequireStoreAuth,
  deriveClerkFrontendDomain,
  extractAccessFromClaims,
  extractAccessFromUser,
  extractLicenseFromClaims,
  extractLicenseFromUser,
  hasActiveStoreLicense,
  hasClosedBetaPluginAccess,
  hasStoreAdminAccess,
  hasSubscriberPluginAccess,
  loadStoreAccountFromSessionCookie,
  loadStoreEntitlements,
  loadStoreLicense,
  parseStoreSessionCookie,
  normalizeStoreAccess,
  normalizeStoreLicense,
  resolveClerkClient,
  setStoreSessionCookie,
  extractSessionToken,
  verifyClerkSessionToken
};
