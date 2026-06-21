const fs = require('fs');
const path = require('path');

describe('Profile restart flow', () => {
    test('restart endpoint uses the same limiter class as profile switching', () => {
        const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

        expect(serverSource).toContain("app.post('/api/profiles/switch', apiLimiter");
        expect(serverSource).toContain("app.post('/api/server/restart', apiLimiter");
        expect(serverSource).not.toContain("app.post('/api/server/restart', authLimiter");
    });

    test('profile switching schedules a backend restart directly', () => {
        const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

        expect(serverSource).toContain('function scheduleServerRestart');
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

    test('pending profile state triggers automatic restart on page load', () => {
        const profileManagerSource = fs.readFileSync(
            path.join(__dirname, '..', 'public', 'js', 'profile-manager.js'),
            'utf8'
        );

        expect(profileManagerSource).toContain('beginProfileRestart({');
        expect(profileManagerSource).toContain('to: storedSelected');
    });
});
