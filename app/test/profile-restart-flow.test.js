const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const profileManagerSource = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'js', 'profile-manager.js'),
    'utf8'
);

function jsonResponse(payload, { ok = true, status = 200 } = {}) {
    return {
        ok,
        status,
        statusText: ok ? 'OK' : 'Service Unavailable',
        json: async () => payload,
        clone() { return this; }
    };
}

async function createProfileManagerHarness(fetchImpl) {
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', () => {});
    const dom = new JSDOM(`<!doctype html><html><body>
        <div class="topbar"></div>
        <button id="profile-btn"></button>
        <span id="current-profile-name"></span>
    </body></html>`, {
        runScripts: 'outside-only',
        url: 'http://localhost:3000/dashboard.html',
        virtualConsole
    });
    dom.window.fetch = fetchImpl;
    dom.window.socket = { on: jest.fn() };
    dom.window.showToast = jest.fn();
    dom.window.i18n = { t: key => key };
    dom.window.console = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    dom.window.setTimeout = callback => {
        queueMicrotask(callback);
        return 1;
    };
    dom.window.clearTimeout = jest.fn();
    dom.window.setInterval = jest.fn(() => 1);
    dom.window.clearInterval = jest.fn();
    dom.window.Date.now = () => 1000;
    dom.window.eval(profileManagerSource);
    await dom.window.profileManager.loadProfileStatus();
    return { dom };
}

describe('Profile restart flow', () => {
    test('restart endpoint uses the same limiter class as profile switching', () => {
        const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

        expect(serverSource).toContain("app.post('/api/profiles/switch', apiLimiter");
        expect(serverSource).toContain("app.post('/api/server/restart', apiLimiter");
        expect(serverSource).not.toContain("app.post('/api/server/restart', authLimiter");
    });

    test('profile switching schedules a backend restart directly', () => {
        const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

        expect(serverSource).toContain(
            'serverRestartCoordinator.schedule(reason)'
        );
        expect(serverSource).toContain('scheduleServerRestartAfterResponse(res, `profile switch to ${username}`)');
        expect(serverSource).toContain('restartScheduled: true');
    });

    test('client waits until the target profile is active before reloading', () => {
        const profileManagerSource = fs.readFileSync(
            path.join(__dirname, '..', 'public', 'js', 'profile-manager.js'),
            'utf8'
        );

        expect(profileManagerSource).toContain("fetch('/api/profiles/active?restartPoll=' + Date.now()");
        expect(profileManagerSource).toContain('profilesMatch(data.activeProfile, targetProfile)');
        expect(profileManagerSource).toContain('!data.requiresRestart');
    });

    test('client restart wait allows large profile databases to finish startup', () => {
        const profileManagerSource = fs.readFileSync(
            path.join(__dirname, '..', 'public', 'js', 'profile-manager.js'),
            'utf8'
        );

        const timeoutMatch = profileManagerSource.match(
            /function waitForServerRestart\([^)]*maxWaitMs = (\d+)/
        );

        expect(timeoutMatch).not.toBeNull();
        expect(Number(timeoutMatch[1])).toBeGreaterThanOrEqual(120000);
    });

    test('client shows restart API errors instead of silently reloading', () => {
        const profileManagerSource = fs.readFileSync(
            path.join(__dirname, '..', 'public', 'js', 'profile-manager.js'),
            'utf8'
        );

        expect(profileManagerSource).toContain('async function readRestartError(response)');
        expect(profileManagerSource).toContain('function showRestartError(message)');
        expect(profileManagerSource).toContain('showRestartError(errorText)');
    });

    test('client exits restart waiting immediately when cleanup is blocked', () => {
        const profileManagerSource = fs.readFileSync(
            path.join(__dirname, '..', 'public', 'js', 'profile-manager.js'),
            'utf8'
        );

        expect(profileManagerSource).toContain("data?.restartState === 'blocked-cleanup' || Boolean(data?.restartFailure)");
        expect(profileManagerSource).toContain('if (hasBlockedRestart(data)) {');
        expect(profileManagerSource).toContain('handleBlockedRestart(data, targetProfile)');
        expect(profileManagerSource).toContain('resolve(false)');
        expect(profileManagerSource).toContain("localStorage.removeItem('selectedProfile')");
        expect(profileManagerSource).toContain("document.getElementById('server-restart-overlay')");
        expect(profileManagerSource).toContain('restartInProgress = false');
        expect(profileManagerSource).toContain("document.querySelector('#profile-switch-warning .btn-restart-now')?.remove()");
    });

    test('blocked restart status prevents page-load auto retry and manual restart actions', () => {
        const profileManagerSource = fs.readFileSync(
            path.join(__dirname, '..', 'public', 'js', 'profile-manager.js'),
            'utf8'
        );

        expect(profileManagerSource).toContain('if (restartInProgress || restartBlocked)');
        expect(profileManagerSource).toContain('if (restartBlocked) return;');
        expect(profileManagerSource).toContain('function checkPendingProfileSwitch() {\n        if (restartBlocked)');
        expect(profileManagerSource).toContain("window.i18n?.t('profile.restart_failed')");
    });

    test('pending profile state triggers automatic restart on page load', () => {
        const profileManagerSource = fs.readFileSync(
            path.join(__dirname, '..', 'public', 'js', 'profile-manager.js'),
            'utf8'
        );

        expect(profileManagerSource).toContain('beginProfileRestart({');
        expect(profileManagerSource).toContain('to: storedSelected');
    });

    test('plugin cleanup failure exposes an explicit retry that posts and resumes restart', async () => {
        const initialStatus = {
            activeProfile: 'CreatorOne',
            pendingProfile: 'CreatorTwo',
            requiresRestart: true,
            restartState: 'blocked-cleanup',
            restartFailure: {
                code: 'PLUGIN_CLEANUP_BLOCKED',
                message: 'Plugin cleanup did not complete.'
            }
        };
        const postRestart = jest.fn(async () => jsonResponse({ success: true, restartScheduled: true }));
        const fetchMock = jest.fn(async (url, options = {}) => {
            if (url === '/api/profiles/active') return jsonResponse(initialStatus);
            if (url === '/api/server/restart' && options.method === 'POST') return postRestart();
            if (String(url).startsWith('/api/profiles/active?restartPoll=')) {
                return jsonResponse({
                    activeProfile: 'CreatorTwo',
                    requiresRestart: false
                });
            }
            throw new Error(`Unexpected fixture request: ${url}`);
        });
        const { dom } = await createProfileManagerHarness(fetchMock);
        const { document, profileManager } = dom.window;
        const retryButton = document.querySelector('#restart-cleanup-blocked-notice .btn-retry-plugin-cleanup');

        expect(retryButton).not.toBeNull();
        expect(retryButton.textContent).toContain('Bereinigung erneut versuchen');

        retryButton.click();
        await expect(profileManager.retryBlockedCleanup()).resolves.toBe(true);

        expect(postRestart).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith('/api/server/restart', expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }));
        expect(document.getElementById('restart-cleanup-blocked-notice')).toBeNull();
        dom.window.close();
    });

    test('database cleanup failure has no retry action and does not post restart', async () => {
        const initialStatus = {
            activeProfile: 'CreatorOne',
            restartState: 'blocked-cleanup',
            restartFailure: {
                code: 'RESTART_CLEANUP_BLOCKED',
                message: 'Pending database events could not be flushed.'
            }
        };
        const fetchMock = jest.fn(async url => {
            if (url === '/api/profiles/active') return jsonResponse(initialStatus);
            throw new Error(`Unexpected fixture request: ${url}`);
        });
        const { dom } = await createProfileManagerHarness(fetchMock);
        const { document, profileManager } = dom.window;

        expect(document.getElementById('restart-cleanup-blocked-notice')).not.toBeNull();
        expect(document.querySelector('.btn-retry-plugin-cleanup')).toBeNull();
        await expect(profileManager.retryBlockedCleanup()).resolves.toBe(false);
        await profileManager.restartNow();
        expect(fetchMock.mock.calls.every(([url]) => url === '/api/profiles/active')).toBe(true);
        expect(fetchMock).not.toHaveBeenCalledWith('/api/server/restart', expect.anything());
        dom.window.close();
    });
});
