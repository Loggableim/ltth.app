const fs = require('fs');
const EventEmitter = require('events');
const path = require('path');
const vm = require('vm');

describe('Launcher shutdown endpoint', () => {
    test('endpoint is localhost-only and protected by launcher token', () => {
        const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
        const launcherSource = fs.readFileSync(path.join(__dirname, '..', 'modules', 'launcher.js'), 'utf8');

        expect(serverSource).toContain("app.post('/api/launcher/shutdown'");
        expect(serverSource).toContain('function isLocalLauncherRequest');
        expect(serverSource).toContain("process.env.LTTH_LAUNCHER_TOKEN");
        expect(serverSource).toContain("req.get('x-ltth-launcher-token')");
        expect(serverSource).toContain("scheduleServerShutdownAfterResponse(res, 'launcher graceful shutdown')");
        expect(serverSource).toContain("status: 'shutdown_complete'");
        expect(serverSource).toContain('launcherShutdownStatus = \'complete\'');
        expect(serverSource).toContain('runBoundedShutdownStage(');
        expect(serverSource).toContain('launcherShutdownStatus = \'pending\'');
        expect(serverSource).toContain("app.get('/api/launcher/shutdown-status'");
        expect(serverSource).toContain('scheduleLauncherServerCloseAfterResponse(res)');
        expect(serverSource).toContain("launcherShutdownStatus = 'pending'");
        expect(serverSource).toContain("supervisorPid: Number.parseInt(process.env.LTTH_LAUNCHER_SUPERVISOR_PID || '', 10) || null");
        expect(launcherSource).toContain("env.LTTH_LAUNCHER_SUPERVISOR_PID = String(process.pid)");
        expect(serverSource).not.toContain("app.post('/api/launcher/shutdown', authLimiter");
    });

    test.each(['close', 'error'])(
        'retries listener close when the completion response emits %s before finish',
        abortedEvent => {
            const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
            const helperStart = serverSource.indexOf('function scheduleLauncherServerCloseAfterResponse(res)');
            const helperEnd = serverSource.indexOf('\nfunction normalizeRemoteAddress', helperStart);
            expect(helperStart).toBeGreaterThan(-1);
            expect(helperEnd).toBeGreaterThan(helperStart);

            const server = { close: jest.fn(callback => callback()) };
            const processRef = { exit: jest.fn(), exitCode: undefined };
            const timer = { unref: jest.fn() };
            const context = vm.createContext({
                server,
                process: processRef,
                logger: { warn: jest.fn(), error: jest.fn() },
                setTimeout: jest.fn(() => timer),
                clearTimeout: jest.fn()
            });
            const harness = vm.runInContext(`
                let launcherShutdownCloseScheduled = false;
                let launcherShutdownStatus = 'complete';
                let launcherShutdownMessage = null;
                let _isShuttingDown = true;
                ${serverSource.slice(helperStart, helperEnd)}
                ({
                    scheduleLauncherServerCloseAfterResponse,
                    get closeScheduled() { return launcherShutdownCloseScheduled; }
                });
            `, context);

            const abortedResponse = new EventEmitter();
            harness.scheduleLauncherServerCloseAfterResponse(abortedResponse);
            expect(harness.closeScheduled).toBe(true);
            abortedResponse.emit(abortedEvent, new Error('synthetic response abort'));
            expect(harness.closeScheduled).toBe(false);
            expect(server.close).not.toHaveBeenCalled();

            // A late finish from the abandoned response must not close the listener.
            abortedResponse.emit('finish');
            expect(server.close).not.toHaveBeenCalled();

            const retryResponse = new EventEmitter();
            harness.scheduleLauncherServerCloseAfterResponse(retryResponse);
            expect(harness.closeScheduled).toBe(true);
            retryResponse.emit('finish');
            expect(server.close).toHaveBeenCalledTimes(1);
            expect(processRef.exit).toHaveBeenCalledWith(0);
        }
    );
});
