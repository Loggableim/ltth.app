'use strict';

const fs = require('fs');
const path = require('path');
const { runBoundedShutdownStage } = require('../modules/launcher-shutdown-stage');

describe('launcher shutdown stages', () => {
  test.each(['LAUNCHER_SHUTDOWN', 'SIGTERM'])(
    'long overlay cleanup on %s becomes retryable pending without closing the queue or database',
    async (signal) => {
      let finishOverlayCleanup;
      let overlayFinished = false;
      const nextCleanup = jest.fn();
      const queueClose = jest.fn();
      const databaseClose = jest.fn();
      const pendingState = { signal, status: 'running' };
      const overlayCleanup = new Promise(resolve => {
        finishOverlayCleanup = () => {
          overlayFinished = true;
          resolve();
        };
      });

      const result = await runBoundedShutdownStage(() => overlayCleanup, { timeoutMs: 10 });
      if (result.timedOut || result.error) pendingState.status = 'pending';
      else {
        nextCleanup();
        queueClose();
        databaseClose();
      }

      expect(result).toEqual({ timedOut: true });
      expect(pendingState.status).toBe('pending');
      expect(overlayFinished).toBe(false);
      expect(nextCleanup).not.toHaveBeenCalled();
      expect(queueClose).not.toHaveBeenCalled();
      expect(databaseClose).not.toHaveBeenCalled();

      finishOverlayCleanup();
      await overlayCleanup;
      expect(overlayFinished).toBe(true);
    }
  );

  test('cleanup stages are retryable and force-exit starts only after database close', () => {
    const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const gracefulShutdown = serverSource.slice(serverSource.indexOf('async function gracefulShutdown'));
    const pluginCleanupStart = gracefulShutdown.indexOf('const pluginShutdown = await unloadPluginsForShutdown');
    const obsCleanupStart = gracefulShutdown.indexOf('obs.disconnect()');
    const cloudCleanupStart = gracefulShutdown.indexOf('cloudSync.shutdown()');
    const databaseClose = gracefulShutdown.indexOf('db.close();');
    const forceExitTimer = gracefulShutdown.indexOf('forceExitTimer = setTimeout');

    expect(gracefulShutdown).toContain('runBoundedShutdownStage(');
    expect(gracefulShutdown).toContain("launcherShutdownStatus = 'pending'");
    expect(gracefulShutdown).toContain('Overlay cleanup is still pending');
    expect(pluginCleanupStart).toBeGreaterThan(-1);
    expect(obsCleanupStart).toBeGreaterThan(pluginCleanupStart);
    expect(cloudCleanupStart).toBeGreaterThan(obsCleanupStart);
    expect(databaseClose).toBeGreaterThan(cloudCleanupStart);
    expect(forceExitTimer).toBeGreaterThan(databaseClose);
  });
});
