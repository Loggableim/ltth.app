'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const dashboardSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'dashboard.js'), 'utf8');
const managerSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'profile-manager.js'), 'utf8');
const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function extractDashboardSwitch() {
  const start = dashboardSource.indexOf('async function switchProfile(username) {');
  const end = dashboardSource.indexOf('// Löscht ein Profil', start);
  if (start < 0 || end < 0) throw new Error('Could not locate dashboard switchProfile function');
  return dashboardSource.slice(start, end);
}

function extractRoute(method, route, endMarker, context) {
  const start = serverSource.indexOf(`app.${method}('${route}'`);
  const end = serverSource.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error(`Could not locate ${method.toUpperCase()} ${route}`);

  let handler;
  const app = { [method]: (_route, _limiter, callback) => { handler = callback; } };
  vm.runInNewContext(serverSource.slice(start, end), { app, apiLimiter: {}, ...context });
  return handler;
}

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function createRoutes({ activeProfile = 'creatorA', pendingProfile, restartFailure = null } = {}) {
  let loadedProfile = activeProfile;
  let activeFileProfile = pendingProfile || activeProfile;
  let failure = restartFailure;
  const scheduled = jest.fn();
  const manager = {
    getActiveProfile: () => activeFileProfile,
    profileExists: name => ['creatorA', 'creatorB'].includes(name),
    setActiveProfile: name => { activeFileProfile = name; }
  };
  const ValidationError = class ValidationError extends Error {};
  const common = {
    profileManager: manager,
    loadedProfile,
    PORT: 3000,
    serverRestartFailure: failure,
    serverRestartScheduled: false,
    BLOCKED_PLUGIN_CLEANUP_FAILURE: { code: 'PLUGIN_CLEANUP_BLOCKED' },
    scheduleServerRestartAfterResponse: scheduled,
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    io: { emit: jest.fn() },
    Validators: {
      string(value, options) {
        if (typeof value !== 'string' || !options.pattern.test(value)) {
          throw new ValidationError('Invalid username');
        }
        return value;
      }
    },
    ValidationError
  };
  const activeHandler = () => extractRoute('get', '/api/profiles/active', '// Neues Profil erstellen', common);
  const switchHandler = extractRoute('post', '/api/profiles/switch', '// ========== SERVER RESTART ROUTE ==========', common);
  return {
    scheduled,
    manager,
    active(req = {}, res = responseRecorder()) { activeHandler()(req, res); return res; },
    switch(username, res = responseRecorder()) {
      switchHandler({ body: { username } }, res);
      return res;
    },
    setLoadedProfile(name) { loadedProfile = name; common.loadedProfile = name; },
    setFailure(value) { failure = value; common.serverRestartFailure = value; }
  };
}

function makeDom() {
  const dom = new JSDOM('<!doctype html><html><body><div id="profile-modal"></div></body></html>', {
    url: 'http://localhost:3000/dashboard.html',
    runScripts: 'outside-only'
  });
  dom.window.console = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  dom.window.alert = jest.fn();
  dom.window.hideProfileModal = jest.fn();
  dom.window.eval(`${extractDashboardSwitch()}\nwindow.switchProfile = switchProfile;`);
  return dom;
}

describe('dashboard profile switch contract', () => {
  test('requires confirmation, posts to the real switch route, records pending state, then recognizes target active', async () => {
    const routes = createRoutes();
    const dom = makeDom();
    const { window } = dom;
    const restartFlow = jest.fn();
    const requests = [];
    window.profileManager = { beginProfileRestart: restartFlow };
    window.confirm = jest.fn(() => true);
    window.fetch = jest.fn(async (url, options = {}) => {
      requests.push({ url: String(url), options });
      if (url === '/api/profiles/switch') {
        const payload = JSON.parse(options.body);
        const res = routes.switch(payload.username);
        return { ok: res.statusCode < 400, json: async () => res.body };
      }
      if (String(url).startsWith('/api/profiles/active')) {
        const res = routes.active();
        return { ok: true, json: async () => res.body };
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    try {
      await window.switchProfile('creatorB');
      expect(window.confirm).toHaveBeenCalledTimes(1);
      expect(requests[0].url).toBe('/api/profiles/switch');
      expect(requests[0].options.method).toBe('POST');
      expect(JSON.parse(requests[0].options.body)).toEqual({ username: 'creatorB' });
      expect(routes.manager.getActiveProfile()).toBe('creatorB');
      expect(routes.scheduled).toHaveBeenCalledWith(expect.anything(), 'profile switch to creatorB');
      expect(routes.active().body).toMatchObject({
        activeProfile: 'creatorA', pendingProfile: 'creatorB', requiresRestart: true,
        restartState: 'pending-restart'
      });
      expect(window.localStorage.getItem('selectedProfile')).toBe('creatorB');
      expect(window.hideProfileModal).toHaveBeenCalledTimes(1);
      expect(restartFlow).toHaveBeenCalledWith({
        from: 'creatorA', to: 'creatorB', requiresRestart: true, restartScheduled: true
      });

      routes.setLoadedProfile('creatorB');
      expect(routes.active().body).toMatchObject({
        activeProfile: 'creatorB', requiresRestart: false, restartState: 'active'
      });
      expect(requests.some(request => request.url === '/api/server/restart')).toBe(false);
    } finally {
      window.close();
    }
  });

  test('cancelled confirmation makes no route request and leaves the active profile unchanged', async () => {
    const routes = createRoutes();
    const dom = makeDom();
    const { window } = dom;
    window.confirm = jest.fn(() => false);
    window.fetch = jest.fn();

    try {
      await window.switchProfile('creatorB');
      expect(window.fetch).not.toHaveBeenCalled();
      expect(window.localStorage.getItem('selectedProfile')).toBeNull();
      expect(routes.manager.getActiveProfile()).toBe('creatorA');
      expect(routes.scheduled).not.toHaveBeenCalled();
    } finally {
      window.close();
    }
  });

  test('switch API rejects invalid and missing synthetic profiles without scheduling a restart', () => {
    const routes = createRoutes();
    const invalid = routes.switch('creator B');
    expect(invalid.statusCode).toBe(400);
    expect(invalid.body.success).toBe(false);
    const missing = routes.switch('missingProfile');
    expect(missing.statusCode).toBe(404);
    expect(missing.body.success).toBe(false);
    expect(routes.manager.getActiveProfile()).toBe('creatorA');
    expect(routes.scheduled).not.toHaveBeenCalled();
  });

  test('switching to the already loaded profile does not schedule restart', () => {
    const routes = createRoutes();
    const response = routes.switch('creatorA');
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({ success: true, requiresRestart: false, activeProfile: 'creatorA' });
    expect(routes.manager.getActiveProfile()).toBe('creatorA');
    expect(routes.scheduled).not.toHaveBeenCalled();
  });

  test('cleanup blocked status keeps loaded profile active and disables restart action', async () => {
    const blockedFailure = {
      code: 'PLUGIN_CLEANUP_BLOCKED',
      message: 'Server restart is blocked because plugin cleanup did not complete.'
    };
    const routes = createRoutes({ activeProfile: 'creatorA', pendingProfile: 'creatorB', restartFailure: blockedFailure });
    const active = routes.active().body;
    const dom = new JSDOM(`<!doctype html><html><body>
      <header class="topbar"></header><button id="profile-btn"><span id="current-profile-name"></span></button>
      <div id="server-restart-overlay">Waiting</div>
    </body></html>`, { url: 'http://localhost:3000/dashboard.html', runScripts: 'outside-only' });
    const { window } = dom;
    const posts = [];
    window.console = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    window.showToast = jest.fn();
    window.i18n = { t: key => key };
    window.localStorage.setItem('selectedProfile', 'creatorB');
    window.fetch = jest.fn(async (url, options = {}) => {
      if (url === '/api/profiles/active') return { ok: true, json: async () => active };
      if (options.method === 'POST') posts.push(url);
      throw new Error(`Unexpected request: ${url}`);
    });
    window.eval(managerSource);

    try {
      await window.profileManager.loadProfileStatus();
      expect(window.profileManager.activeProfile).toBe('creatorA');
      expect(window.profileManager.selectedProfile).toBe('creatorB');
      expect(window.profileManager.profileSwitchPending).toBe(true);
      expect(window.document.getElementById('current-profile-name').textContent).toContain('creatorA');
      expect(window.document.getElementById('server-restart-overlay')).toBeNull();
      expect(window.document.querySelector('#profile-switch-warning .btn-restart-now')).toBeNull();
      expect(window.document.getElementById('restart-cleanup-blocked-notice')).not.toBeNull();
      expect(window.localStorage.getItem('selectedProfile')).toBeNull();
      expect(posts).toEqual([]);
    } finally {
      window.close();
    }
  });

  test('dashboard reports a switch route error without marking the target selected', async () => {
    const routes = createRoutes();
    const dom = makeDom();
    const { window } = dom;
    window.confirm = jest.fn(() => true);
    window.fetch = jest.fn(async () => ({ json: async () => ({ success: false, error: 'Profile not found' }) }));

    try {
      await window.switchProfile('missingProfile');
      expect(window.alert).toHaveBeenCalledWith('❌ Fehler beim Wechseln des Profils: Profile not found');
      expect(window.localStorage.getItem('selectedProfile')).toBeNull();
      expect(window.hideProfileModal).not.toHaveBeenCalled();
      expect(routes.manager.getActiveProfile()).toBe('creatorA');
    } finally {
      window.close();
    }
  });
});
