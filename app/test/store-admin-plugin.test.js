const assert = require('assert');
const fs = require('fs');
const path = require('path');

const StoreAdminPlugin = require('../../plugin-store/sources/store-admin/main');

describe('Store admin plugin', () => {
  it('registers admin UI and user management API routes', async () => {
    const api = createApi();
    const plugin = new StoreAdminPlugin(api, createAdminOptions());

    await plugin.init();

    const routes = api.routes.map((route) => `${route.method.toUpperCase()} ${route.path}`).sort();
    assert(routes.includes('GET /store-admin/ui'));
    assert(routes.includes('GET /api/store-admin/me'));
    assert(routes.includes('GET /api/store-admin/health'));
    assert(routes.includes('GET /api/store-admin/feedback'));
    assert(routes.includes('GET /api/store-admin/users'));
    assert(routes.includes('POST /api/store-admin/users/:userId/access'));
    assert(routes.includes('POST /api/store-admin/users/:userId/license'));
  });

  it('rejects admin APIs when the authenticated account lacks the admin group', async () => {
    const api = createApi();
    const plugin = new StoreAdminPlugin(api, createAdminOptions({
      adminGroups: []
    }));
    const response = createJsonResponse();

    const account = await plugin.requireAdmin({}, response);

    assert.strictEqual(account, null);
    assert.strictEqual(response.statusCode, 403);
    assert.strictEqual(response.body.code, 'ADMIN_ACCESS_REQUIRED');
  });

  it('lists Clerk users with safe LTTH entitlement summaries for admins', async () => {
    const api = createApi();
    const getUserList = jest.fn(async () => ({
      data: [
        {
          id: 'user_123',
          username: 'loggableim',
          firstName: 'Loggable',
          lastName: 'IM',
          primaryEmailAddressId: 'email_123',
          emailAddresses: [
            { id: 'email_123', emailAddress: 'loggableim@gmail.com' }
          ],
          privateMetadata: {
            ltthLicense: {
              status: 'active',
              plan: 'beta-free',
              licenseId: 'ltth_beta_user_123'
            },
            ltthAccess: {
              groups: ['admin'],
              closedBetaPlugins: ['openshock']
            }
          }
        }
      ],
      totalCount: 1
    }));
    const plugin = new StoreAdminPlugin(api, createAdminOptions({ getUserList }));
    await plugin.init();
    const usersRoute = api.routes.find((route) => route.method === 'GET' && route.path === '/api/store-admin/users');
    const response = createJsonResponse();

    await usersRoute.handler({ query: { q: 'loggableim@gmail.com' } }, response);

    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(response.body.success, true);
    assert.strictEqual(response.body.users.length, 1);
    assert.strictEqual(response.body.users[0].email, 'loggableim@gmail.com');
    assert.strictEqual(response.body.users[0].license.active, true);
    assert.deepStrictEqual(response.body.users[0].access.groups, ['admin']);
    assert.deepStrictEqual(response.body.users[0].access.closedBetaPlugins, ['openshock']);
    assert.deepStrictEqual(getUserList.mock.calls[0][0], { emailAddress: ['loggableim@gmail.com'], limit: 50 });
  });

  it('returns store health and feedback summaries for admins', async () => {
    const api = createApi();
    const insights = {
      getSummary: jest.fn(() => ({
        feedbackCount: 2,
        telemetryCount: 3,
        plugins: {
          tts: {
            feedbackCount: 2,
            installSuccessCount: 1,
            installFailureCount: 1
          }
        }
      })),
      listFeedback: jest.fn(() => [
        { pluginId: 'tts', rating: 5, message: 'Good', userId: 'user_123' }
      ])
    };
    const plugin = new StoreAdminPlugin(api, createAdminOptions({ insights }));
    await plugin.init();
    const healthRoute = api.routes.find((route) => route.method === 'GET' && route.path === '/api/store-admin/health');
    const feedbackRoute = api.routes.find((route) => route.method === 'GET' && route.path === '/api/store-admin/feedback');
    const healthResponse = createJsonResponse();
    const feedbackResponse = createJsonResponse();

    await healthRoute.handler({}, healthResponse);
    await feedbackRoute.handler({}, feedbackResponse);

    assert.strictEqual(healthResponse.body.success, true);
    assert.strictEqual(healthResponse.body.summary.feedbackCount, 2);
    assert.strictEqual(healthResponse.body.summary.plugins.tts.installFailureCount, 1);
    assert.strictEqual(feedbackResponse.body.success, true);
    assert.strictEqual(feedbackResponse.body.feedback[0].message, 'Good');
    assert.strictEqual(insights.getSummary.mock.calls.length, 1);
    assert.strictEqual(insights.listFeedback.mock.calls.length, 1);
  });

  it('includes Store health and feedback management in the admin UI', () => {
    const uiHtml = fs.readFileSync(path.join(__dirname, '..', '..', 'plugin-store', 'sources', 'store-admin', 'ui.html'), 'utf8');

    assert(uiHtml.includes('Store Health'));
    assert(uiHtml.includes('Latest Feedback'));
    assert(uiHtml.includes('/api/store-admin/health'));
    assert(uiHtml.includes('/api/store-admin/feedback'));
  });
});

function createApi() {
  return {
    routes: [],
    pluginDir: process.cwd(),
    registerRoute(method, path, handler) {
      this.routes.push({ method, path, handler });
      return true;
    },
    log: jest.fn()
  };
}

function createAdminOptions(overrides = {}) {
  const getUserList = overrides.getUserList || jest.fn(async () => ({ data: [], totalCount: 0 }));
  const adminGroups = overrides.adminGroups || ['admin'];

  return {
    env: {
      CLERK_PUBLISHABLE_KEY: 'pk_test_public',
      CLERK_SECRET_KEY: 'sk_test_secret'
    },
    clerkExpress: {
      getAuth: () => ({
        isAuthenticated: true,
        userId: 'admin_user',
        sessionId: 'sess_admin'
      })
    },
    insights: overrides.insights,
    clerkClient: {
      users: {
        getUser: jest.fn(async () => ({
          id: 'admin_user',
          privateMetadata: {
            ltthAccess: {
              groups: adminGroups,
              closedBetaPlugins: []
            }
          }
        })),
        getUserList,
        updateUserMetadata: jest.fn(async () => ({ id: 'user_123' }))
      }
    }
  };
}

function createJsonResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    sendFile(filePath) {
      this.filePath = filePath;
      return this;
    }
  };
}
