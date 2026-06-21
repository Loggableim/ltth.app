const fs = require('fs');
const path = require('path');
const DatabaseManager = require('../modules/database');

describe('Database Alias/Cleanup Stability', () => {
    let dbPath;
    let db;

    const removeIfExists = (targetPath) => {
        if (fs.existsSync(targetPath)) {
            fs.rmSync(targetPath, { force: true });
        }
    };

    beforeEach(() => {
        dbPath = path.join(__dirname, `tmp-alias-cleanup-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
        db = new DatabaseManager(dbPath);
    });

    afterEach(() => {
        if (db) {
            try {
                db.close();
            } catch (_) {}
        }

        removeIfExists(dbPath);
        removeIfExists(`${dbPath}-wal`);
        removeIfExists(`${dbPath}-shm`);
    });

    test('close() clears pending batch timer and flushes queued events', () => {
        db.logEvent('chat', 'tester', { message: 'hello' });

        expect(db.eventBatchQueue.length).toBe(1);
        expect(db.eventBatchTimer).toBeTruthy();

        db.close();

        expect(db.eventBatchTimer).toBeNull();

        const reOpen = new DatabaseManager(dbPath);
        const logs = reOpen.getEventLogs(10);
        expect(logs.length).toBeGreaterThanOrEqual(1);
        reOpen.close();
    });

    test('alias creation does not break cleanup path after close', () => {
        db.addUsernameAlias('alias_user', 'test', true);
        db.logEvent('chat', 'alias_user', { msg: 'x' });
        db.close();

        expect(() => db.cleanupEventLogs(100)).not.toThrow();
        expect(db.cleanupEventLogs(100)).toBe(0);
    });
});
