const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const ViewerXPDatabase = require('../plugins/milestone-leaderboard/vendor/viewer-leaderboard/backend/database');

describe('Viewer XP idempotency', () => {
  let tmpDir;
  let sqlite;
  let viewerDb;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-viewer-xp-idempotency-'));
    sqlite = new Database(path.join(tmpDir, 'viewer.db'));
    viewerDb = new ViewerXPDatabase({
      getDatabase: () => ({ db: sqlite }),
      log: jest.fn()
    });
    viewerDb.initialize();
  });

  afterEach(() => {
    viewerDb.destroy();
    sqlite.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('applies a keyed grant once and logs the profile update atomically', () => {
    const first = viewerDb.addXPOnce(
      'slot-viewer',
      25,
      'slot_win',
      { category: 'small_win', machineId: 1 },
      'slot:spin-77:reward:0'
    );
    const duplicate = viewerDb.addXPOnce(
      'slot-viewer',
      25,
      'slot_win',
      { category: 'small_win', machineId: 1 },
      'slot:spin-77:reward:0'
    );

    expect(first).toEqual(expect.objectContaining({ applied: true }));
    expect(duplicate).toEqual(expect.objectContaining({ applied: false, duplicate: true }));
    expect(viewerDb.getViewerProfile('slot-viewer').xp).toBe(25);
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM xp_transactions WHERE username = 'slot-viewer'").get().count).toBe(1);
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM viewer_xp_idempotency WHERE idempotency_key = 'slot:spin-77:reward:0'").get().count).toBe(1);
  });
});
