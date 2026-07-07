const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');
const ViewerProfilesPlugin = require('../plugins/viewer-leaderboard/backend/analytics-plugin');

function createResponse() {
  return {
    statusCode: 200,
    payload: null,
    sentFile: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.payload = data;
      return this;
    },
    send(data) {
      this.payload = data;
      return this;
    },
    setHeader(key, value) {
      this.headers[key] = value;
      return this;
    },
    sendFile(filePath) {
      this.sentFile = filePath;
      return this;
    }
  };
}

function createMockApi(db) {
  const routes = [];
  const events = [];
  const socketHandlers = [];
  const pluginInstances = new Map();

  return {
    routes,
    events,
    socketHandlers,
    pluginInstances,
    log: jest.fn(),
    getDatabase: () => db,
    getSocketIO: () => ({
      on: jest.fn(),
      emit: jest.fn(),
      removeListener: jest.fn()
    }),
    registerRoute(method, routePath, handler) {
      routes.push({ method, path: routePath, handler });
    },
    registerSocket(event, handler) {
      socketHandlers.push({ event, handler });
    },
    registerTikTokEvent() {
      return true;
    },
    getConfig() {
      return null;
    },
    setConfig() {},
    emit(event, data) {
      events.push({ event, data });
    },
    getPluginInstance(id) {
      return pluginInstances.get(id) || null;
    },
    getPlugin(id) {
      return pluginInstances.get(id) || null;
    }
  };
}

function findRoute(api, method, pathValue) {
  return api.routes.find(route => route.method === method && route.path === pathValue);
}

function seedViewer(db, username, overrides = {}) {
  const stmt = db.prepare(`
    INSERT INTO viewer_profiles (
      tiktok_username, display_name, profile_picture_url, total_visits,
      total_watchtime_seconds, total_coins_spent, total_gifts_sent,
      total_comments, total_likes, total_shares, last_seen_at,
      is_vip, vip_tier, is_favorite, birthday, tags
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const defaults = {
    display_name: username,
    profile_picture_url: null,
    total_visits: 10,
    total_watchtime_seconds: 7200,
    total_coins_spent: 2000,
    total_gifts_sent: 3,
    total_comments: 15,
    total_likes: 50,
    total_shares: 5,
    last_seen_at: new Date().toISOString(),
    is_vip: 0,
    vip_tier: null,
    is_favorite: 0,
    birthday: null,
    tags: JSON.stringify(['starter'])
  };

  const row = { ...defaults, ...overrides };
  stmt.run(
    username,
    row.display_name,
    row.profile_picture_url,
    row.total_visits,
    row.total_watchtime_seconds,
    row.total_coins_spent,
    row.total_gifts_sent,
    row.total_comments,
    row.total_likes,
    row.total_shares,
    row.last_seen_at,
    row.is_vip,
    row.vip_tier,
    row.is_favorite,
    row.birthday,
    row.tags
  );
}

describe('Viewer Profiles analytics dashboard', () => {
  let db;
  let api;
  let plugin;

  beforeEach(async () => {
    db = new Database(':memory:');
    api = createMockApi(db);
    plugin = new ViewerProfilesPlugin(api);
    await plugin.init();
  });

  afterEach(async () => {
    if (plugin) {
      await plugin.destroy();
    }
    if (db) {
      db.close();
    }
  });

  test('overview insights endpoint returns segment intelligence and top signals', () => {
    seedViewer(db, 'vip_candidate', {
      total_visits: 35,
      total_watchtime_seconds: 18000,
      total_coins_spent: 8000,
      total_comments: 40,
      total_likes: 150,
      total_shares: 12
    });
    seedViewer(db, 'birthday_viewer', {
      birthday: `${new Date().getFullYear() + 1}-06-03`,
      total_comments: 2,
      total_coins_spent: 120
    });

    const route = findRoute(api, 'GET', '/api/viewer-profiles/insights/overview');
    expect(route).toBeDefined();

    const req = { query: { limit: '5' } };
    const res = createResponse();
    route.handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.payload.success).toBe(true);
    expect(res.payload.data.stats.totalViewers).toBe(2);
    expect(res.payload.data.segments.length).toBeGreaterThan(0);
    expect(res.payload.data.topInsights[0].score).toBeGreaterThan(0);
  });

  test('bulk update endpoint updates multiple viewers and emits updates', () => {
    seedViewer(db, 'alpha');
    seedViewer(db, 'beta');

    const route = findRoute(api, 'POST', '/api/viewer-profiles/bulk/update');
    expect(route).toBeDefined();

    const req = {
      body: {
        usernames: ['alpha', 'beta'],
        updates: {
          is_favorite: true,
          tags: ['power_chatter']
        }
      }
    };
    const res = createResponse();
    route.handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.payload.success).toBe(true);
    expect(res.payload.data.updatedCount).toBe(2);

    const rows = db.prepare('SELECT tiktok_username, is_favorite, tags FROM viewer_profiles ORDER BY tiktok_username').all();
    expect(rows[0].is_favorite).toBe(1);
    expect(JSON.parse(rows[0].tags)).toEqual(['power_chatter']);
    expect(rows[1].is_favorite).toBe(1);
    expect(JSON.parse(rows[1].tags)).toEqual(['power_chatter']);

    const updatedEvents = api.events.filter(event => event.event === 'viewer:updated');
    expect(updatedEvents.length).toBeGreaterThanOrEqual(2);
  });

  test('viewer profile endpoints tolerate invalid legacy tags JSON', () => {
    seedViewer(db, 'broken_tags', {
      tags: '{"broken":'
    });

    const route = findRoute(api, 'GET', '/api/viewer-profiles/:username/insights');
    expect(route).toBeDefined();

    const req = { params: { username: 'broken_tags' } };
    const res = createResponse();
    expect(() => route.handler(req, res)).not.toThrow();

    expect(res.statusCode).toBe(200);
    expect(res.payload.success).toBe(true);
    expect(Array.isArray(res.payload.data.tags)).toBe(true);
    expect(res.payload.data.tags).toEqual([]);
  });

  test('avatar fallback is served locally and rejects traversal attempts', () => {
    const assetRoute = findRoute(api, 'GET', '/viewer-profiles/assets/:file');
    expect(assetRoute).toBeDefined();

    const assetRes = createResponse();
    assetRoute.handler({ params: { file: 'default-avatar.svg' } }, assetRes);
    expect(assetRes.statusCode).toBe(200);
    expect(assetRes.sentFile).toContain(path.join('viewer-leaderboard', 'assets', 'default-avatar.svg'));

    const badRes = createResponse();
    assetRoute.handler({ params: { file: '../../secret.txt' } }, badRes);
    expect(badRes.statusCode).toBe(404);
    expect(badRes.payload.error).toBe('Asset not found');

    const uiPath = path.join(__dirname, '..', 'plugins', 'viewer-leaderboard', 'viewer-profiles-ui.html');
    const uiHtml = fs.readFileSync(uiPath, 'utf8');
    expect(uiHtml).toContain('/viewer-profiles/assets/default-avatar.svg');
  });

  test('ui markup avoids inline event handlers that CSP blocks', () => {
    const uiPath = path.join(__dirname, '..', 'plugins', 'viewer-leaderboard', 'viewer-profiles-ui.html');
    const uiHtml = fs.readFileSync(uiPath, 'utf8');

    expect(uiHtml).not.toMatch(/<[^>]+\s(onclick|onchange|onkeypress|onerror)\s*=/i);
    expect(uiHtml).toContain('data-action="toggle-favorite"');
    expect(uiHtml).toContain('data-viewer-username=');
  });

  test('segment calculation improves when viewer XP data is available', () => {
    seedViewer(db, 'xprich', {
      total_visits: 24,
      total_watchtime_seconds: 42000,
      total_coins_spent: 2400,
      total_comments: 30,
      total_likes: 120,
      total_shares: 15
    });

    const baseInsight = plugin.db.getViewerInsights('xprich');
    expect(baseInsight.insights.segments).toContain('vip_candidates');
    expect(baseInsight.insights.segments).not.toContain('xp_rising');

    api.pluginInstances.set('viewer-leaderboard', {
      db: {
        getViewerProfile(username) {
          if (username !== 'xprich') {
            return null;
          }
          return {
            username: 'xprich',
            xp: 7200,
            total_xp_earned: 7200,
            level: 18
          };
        }
      }
    });

    const xpInsight = plugin.db.getViewerInsights('xprich');
    expect(xpInsight.insights.segments).toContain('xp_rising');
    expect(xpInsight.insights.score).toBeGreaterThan(baseInsight.insights.score - 1);
  });
});
