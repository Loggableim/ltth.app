const path = require('path');

function requireAppModule(modulePath) {
  const candidates = [
    path.join(__dirname, '..', '..', 'modules', modulePath),
    path.join(__dirname, '..', '..', '..', 'app', 'modules', modulePath)
  ];

  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') {
        throw error;
      }
    }
  }

  throw new Error(`Unable to load app module: ${modulePath}`);
}

const {
  buildBetaLicense,
  buildStoreAuthConfig,
  hasStoreAdminAccess,
  loadStoreEntitlements,
  normalizeStoreAccess,
  normalizeStoreLicense
} = requireAppModule('clerk-store-auth');

class StoreAdminPlugin {
  constructor(api, options = {}) {
    this.api = api;
    this.options = options;
    this.env = options.env || process.env;
  }

  async init() {
    this.api.registerRoute('GET', '/store-admin/ui', (req, res) => {
      res.sendFile(path.join(__dirname, 'ui.html'));
    });

    this.api.registerRoute('GET', '/api/store-admin/me', async (req, res) => {
      const account = await this.requireAdmin(req, res);
      if (!account) return;

      res.json({
        success: true,
        account
      });
    });

    this.api.registerRoute('GET', '/api/store-admin/health', async (req, res) => {
      const account = await this.requireAdmin(req, res);
      if (!account) return;

      res.json({
        success: true,
        summary: this.getStoreInsights().getSummary()
      });
    });

    this.api.registerRoute('GET', '/api/store-admin/feedback', async (req, res) => {
      const account = await this.requireAdmin(req, res);
      if (!account) return;

      res.json({
        success: true,
        feedback: this.getStoreInsights().listFeedback(req.query || {})
      });
    });

    this.api.registerRoute('GET', '/api/store-admin/users', async (req, res) => {
      const account = await this.requireAdmin(req, res);
      if (!account) return;

      const result = await this.listUsers(req.query || {});
      res.json({
        success: true,
        ...result
      });
    });

    this.api.registerRoute('POST', '/api/store-admin/users/:userId/access', async (req, res) => {
      const account = await this.requireAdmin(req, res);
      if (!account) return;

      const access = await this.updateUserAccess(req.params.userId, req.body || {});
      res.json({
        success: true,
        access
      });
    });

    this.api.registerRoute('POST', '/api/store-admin/users/:userId/license', async (req, res) => {
      const account = await this.requireAdmin(req, res);
      if (!account) return;

      const license = await this.updateUserLicense(req.params.userId, req.body || {});
      res.json({
        success: true,
        license
      });
    });

    this.api.log?.('LTTH App Store Admin routes registered', 'info');
  }

  resolveClerkExpress() {
    if (this.options.clerkExpress) {
      return this.options.clerkExpress;
    }

    try {
      return require('@clerk/express');
    } catch (error) {
      this.api.log?.(`Clerk SDK unavailable: ${error.message}`, 'warn');
      return null;
    }
  }

  resolveClerkClient() {
    if (this.options.clerkClient) {
      return this.options.clerkClient;
    }

    return this.resolveClerkExpress()?.clerkClient || null;
  }

  getStoreInsights() {
    if (this.options.insights &&
      typeof this.options.insights.getSummary === 'function' &&
      typeof this.options.insights.listFeedback === 'function') {
      return this.options.insights;
    }

    return {
      getSummary: () => ({
        feedbackCount: 0,
        telemetryCount: 0,
        plugins: {}
      }),
      listFeedback: () => []
    };
  }

  async requireAdmin(req, res) {
    const config = buildStoreAuthConfig(this.env);
    if (!config.clerkEnabled) {
      res.status(503).json({
        success: false,
        code: 'CLERK_NOT_CONFIGURED',
        error: 'Clerk is required for LTTH App Store Admin.'
      });
      return null;
    }

    const clerkExpress = this.resolveClerkExpress();
    if (!clerkExpress || typeof clerkExpress.getAuth !== 'function') {
      res.status(503).json({
        success: false,
        code: 'CLERK_SDK_UNAVAILABLE',
        error: 'Clerk SDK is unavailable.'
      });
      return null;
    }

    let auth;
    try {
      auth = clerkExpress.getAuth(req);
    } catch (error) {
      this.api.log?.(`Could not read Clerk auth state: ${error.message}`, 'warn');
      res.status(401).json({
        success: false,
        code: 'AUTH_REQUIRED',
        error: 'Sign in to use LTTH App Store Admin.'
      });
      return null;
    }

    if (!auth || auth.isAuthenticated !== true || !auth.userId) {
      res.status(401).json({
        success: false,
        code: 'AUTH_REQUIRED',
        error: 'Sign in to use LTTH App Store Admin.'
      });
      return null;
    }

    const entitlements = await loadStoreEntitlements(auth.userId, {
      ...this.options,
      env: this.env,
      sessionClaims: auth.sessionClaims || {}
    });
    const account = {
      userId: auth.userId,
      sessionId: auth.sessionId || null,
      license: entitlements.license,
      access: entitlements.access
    };

    if (!hasStoreAdminAccess(account)) {
      res.status(403).json({
        success: false,
        code: 'ADMIN_ACCESS_REQUIRED',
        error: 'LTTH App Store Admin requires the admin access group.'
      });
      return null;
    }

    return account;
  }

  async listUsers(query = {}) {
    const clerkClient = this.resolveClerkClient();
    this.assertUserApi(clerkClient, 'getUserList');

    const search = String(query.q || query.query || '').trim();
    const limit = Math.max(1, Math.min(100, parseInt(query.limit, 10) || 50));
    const params = { limit };

    if (search) {
      if (search.includes('@')) {
        params.emailAddress = [search.toLowerCase()];
      } else {
        params.query = search;
      }
    }

    const result = await clerkClient.users.getUserList(params);
    const users = Array.isArray(result?.data) ? result.data : (Array.isArray(result) ? result : []);

    return {
      users: users.map((user) => this.summarizeUser(user)),
      totalCount: Number.isFinite(result?.totalCount) ? result.totalCount : users.length
    };
  }

  async updateUserAccess(userId, body = {}) {
    const clerkClient = this.resolveClerkClient();
    this.assertUserApi(clerkClient, 'updateUserMetadata');

    const access = normalizeStoreAccess({
      groups: body.groups,
      closedBetaPlugins: body.closedBetaPlugins
    });

    await clerkClient.users.updateUserMetadata(String(userId || '').trim(), {
      privateMetadata: {
        ltthAccess: access
      }
    });

    return access;
  }

  async updateUserLicense(userId, body = {}) {
    const clerkClient = this.resolveClerkClient();
    this.assertUserApi(clerkClient, 'updateUserMetadata');

    const action = String(body.action || 'claim').trim().toLowerCase();
    const license = action === 'revoke'
      ? {
          active: false,
          status: 'revoked',
          plan: 'beta-free',
          licenseId: null,
          claimedAt: null,
          termsVersion: null
        }
      : buildBetaLicense(userId);

    await clerkClient.users.updateUserMetadata(String(userId || '').trim(), {
      privateMetadata: {
        ltthLicense: action === 'revoke' ? {
          status: 'revoked',
          plan: 'beta-free'
        } : {
          status: license.status,
          plan: license.plan,
          licenseId: license.licenseId,
          claimedAt: license.claimedAt,
          termsVersion: license.termsVersion
        }
      },
      publicMetadata: {
        ltth: {
          hasLicense: action !== 'revoke',
          plan: action === 'revoke' ? null : license.plan,
          licenseId: action === 'revoke' ? null : license.licenseId,
          claimedAt: action === 'revoke' ? null : license.claimedAt,
          termsVersion: action === 'revoke' ? null : license.termsVersion
        }
      }
    });

    return normalizeStoreLicense(license);
  }

  summarizeUser(user = {}) {
    const primaryEmail = this.getPrimaryEmail(user);

    return {
      id: user.id || null,
      email: primaryEmail,
      username: user.username || null,
      firstName: user.firstName || null,
      lastName: user.lastName || null,
      createdAt: user.createdAt || null,
      lastSignInAt: user.lastSignInAt || null,
      license: normalizeStoreLicense(user.privateMetadata?.ltthLicense || user.publicMetadata?.ltth || {}),
      access: normalizeStoreAccess(user.privateMetadata?.ltthAccess || user.publicMetadata?.ltthAccess || {})
    };
  }

  getPrimaryEmail(user = {}) {
    const emails = Array.isArray(user.emailAddresses) ? user.emailAddresses : [];
    const primary = emails.find((email) => email.id === user.primaryEmailAddressId) || emails[0];
    return primary?.emailAddress || null;
  }

  assertUserApi(clerkClient, methodName) {
    if (!clerkClient?.users || typeof clerkClient.users[methodName] !== 'function') {
      const error = new Error(`Clerk users.${methodName} is unavailable.`);
      error.code = 'CLERK_USERS_API_UNAVAILABLE';
      throw error;
    }
  }
}

module.exports = StoreAdminPlugin;
