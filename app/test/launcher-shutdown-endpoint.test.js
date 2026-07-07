const fs = require('fs');
const path = require('path');

describe('Launcher shutdown endpoint', () => {
    test('endpoint is localhost-only and protected by launcher token', () => {
        const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

        expect(serverSource).toContain("app.post('/api/launcher/shutdown'");
        expect(serverSource).toContain('function isLocalLauncherRequest');
        expect(serverSource).toContain("process.env.LTTH_LAUNCHER_TOKEN");
        expect(serverSource).toContain("req.get('x-ltth-launcher-token')");
        expect(serverSource).toContain("scheduleServerShutdownAfterResponse(res, 'launcher graceful shutdown')");
        expect(serverSource).not.toContain("app.post('/api/launcher/shutdown', authLimiter");
    });
});
