'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

// Each profile is consistent at its own snapshot instant; this is not a
// cross-profile transaction. Source connections remain owned by the caller.
async function snapshotProfileDatabases(sourceFiles) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-backup-sqlite-'));
  let released = false;
  const cleanup = () => {
    if (!released) {
      fs.rmSync(root, { recursive: true, force: true });
      released = true;
    }
  };
  try {
    const files = [];
    for (const file of sourceFiles) {
      if (/\.db-(?:wal|shm)$/i.test(file.relPath)) continue;
      if (!/\.db$/i.test(file.relPath)) {
        files.push(file);
        continue;
      }
      const target = path.join(root, `${files.length}.db`);
      const db = new Database(file.absPath, { readonly: true, fileMustExist: true });
      try {
        await db.backup(target);
      } finally {
        db.close();
      }
      files.push({ ...file, absPath: target });
    }
    return { files, cleanup };
  } catch (err) {
    cleanup();
    throw err;
  }
}
module.exports = { snapshotProfileDatabases };
