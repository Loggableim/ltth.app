'use strict';

const { EventEmitter } = require('node:events');
const { Readable } = require('node:stream');
const crypto = require('node:crypto');

let mockSqliteAttempts = 0;
jest.mock('better-sqlite3', () => {
  mockSqliteAttempts++;
  throw new Error('SQLite is forbidden in this synthetic export suite');
});
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { exportBackup } = require('../modules/backup/exporter');
const { DecompressionBudget } = require('../modules/backup/decompression-budget');
const {
  MAX_BACKUP_UNCOMPRESSED_SIZE_BYTES,
  MAX_BACKUP_ENTRY_UNCOMPRESSED_SIZE_BYTES
} = require('../modules/backup/validators');

class SyntheticArchive extends EventEmitter {
  constructor() {
    super();
    this.entries = new Map();
    this.aborted = false;
  }

  append(contents, { name }) {
    this.entries.set(name, Buffer.from(contents));
  }

  file(filePath, { name }) {
    this.entries.set(name, { stagedFilePath: filePath });
  }

  finalize() {}

  readEntries() {
    return new Map([...this.entries].map(([name, value]) => [
      name,
      value && value.stagedFilePath ? fs.readFileSync(value.stagedFilePath) : Buffer.from(value)
    ]));
  }

  abort() {
    this.aborted = true;
  }
}

function dependencies(sourceDir, archiveRef, exportSizeLimits) {
  return {
    db: null,
    pluginLoader: null,
    configPathManager: {
      getUserDataDir: () => sourceDir
    },
    archiveFactory: () => (archiveRef.archive = new SyntheticArchive()),
    exportSizeLimits
  };
}

async function exportUserData(sourceDir, archiveRef, exportSizeLimits) {
  return exportBackup(dependencies(sourceDir, archiveRef, exportSizeLimits), {
    includeGlobalSettings: false,
    includePluginSettings: false,
    includePluginData: false,
    includeUserConfigs: false,
    includeUploads: false,
    includeUserData: true
  });
}

describe('backup export uncompressed size budget', () => {
  test('uses the import hard boundaries with exact and plus-one arithmetic only', () => {
    expect(MAX_BACKUP_ENTRY_UNCOMPRESSED_SIZE_BYTES).toBe(2 * 1024 * 1024 * 1024);
    expect(MAX_BACKUP_UNCOMPRESSED_SIZE_BYTES).toBe(10 * 1024 * 1024 * 1024);

    const entry = new DecompressionBudget();
    entry.add('synthetic.db', MAX_BACKUP_ENTRY_UNCOMPRESSED_SIZE_BYTES);
    expect(() => entry.add('synthetic.db', 1)).toThrow(/maximum uncompressed size/i);

    const total = new DecompressionBudget();
    total.add('first.bin', MAX_BACKUP_ENTRY_UNCOMPRESSED_SIZE_BYTES);
    total.add('second.bin', MAX_BACKUP_ENTRY_UNCOMPRESSED_SIZE_BYTES);
    total.add('third.bin', MAX_BACKUP_ENTRY_UNCOMPRESSED_SIZE_BYTES);
    total.add('fourth.bin', MAX_BACKUP_ENTRY_UNCOMPRESSED_SIZE_BYTES);
    total.add('fifth.bin', MAX_BACKUP_ENTRY_UNCOMPRESSED_SIZE_BYTES);
    expect(total.totalBytes).toBe(MAX_BACKUP_UNCOMPRESSED_SIZE_BYTES);
    expect(() => total.add('sixth.bin', 1))
      .toThrow(/maximum total uncompressed size/i);
  });

  test('accepts an exact synthetic entry cap and aborts without returning an over-limit archive', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-export-entry-budget-'));
    const sourceDir = path.join(root, 'user-data');
    fs.mkdirSync(sourceDir);
    const payload = Buffer.alloc(64 * 1024, 0x5a);
    fs.writeFileSync(path.join(sourceDir, 'payload.bin'), payload);
    const limits = { maxEntryBytes: payload.length, maxTotalBytes: 1024 * 1024 };
    const exactRef = {};
    const overRef = {};

    try {
      await expect(exportUserData(sourceDir, exactRef, limits)).resolves.toBeTruthy();
      fs.writeFileSync(path.join(sourceDir, 'payload.bin'), Buffer.concat([payload, Buffer.from([0x33])]));
      expect(exactRef.archive.readEntries().get('user_data/payload.bin')).toEqual(payload);
      exactRef.archive.emit('close');

      fs.writeFileSync(path.join(sourceDir, 'payload.bin'), Buffer.concat([payload, Buffer.from([0x21])]));
      await expect(exportUserData(sourceDir, overRef, limits))
        .rejects.toMatchObject({ code: 'BACKUP_ENTRY_UNCOMPRESSED_SIZE_LIMIT' });
      expect(overRef.archive.aborted).toBe(true);
      expect(overRef.archive.entries.has('user_data/payload.bin')).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('rejects a logically over-limit profile database before SQLite snapshot reads', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-export-profile-db-budget-'));
    const sourceDir = path.join(root, 'user-configs');
    fs.mkdirSync(sourceDir);
    const databasePath = path.join(sourceDir, 'synthetic-profile.db');
    fs.writeFileSync(databasePath, 'synthetic non-database marker');
    const archiveRef = {};
    const realStatSync = fs.statSync;

    fs.statSync = function syntheticLargeDatabaseStat(filePath, ...args) {
      const stat = realStatSync.call(fs, filePath, ...args);
      if (path.resolve(String(filePath)) !== path.resolve(databasePath)) return stat;
      return { ...stat, size: MAX_BACKUP_ENTRY_UNCOMPRESSED_SIZE_BYTES + 1 };
    };

    try {
      await expect(exportBackup({
        db: null,
        pluginLoader: null,
        configPathManager: { getUserConfigsDir: () => sourceDir },
        archiveFactory: () => (archiveRef.archive = new SyntheticArchive())
      }, {
        includeGlobalSettings: false,
        includePluginSettings: false,
        includePluginData: false,
        includeUserConfigs: true,
        includeUploads: false,
        includeUserData: false
      })).rejects.toMatchObject({ code: 'BACKUP_ENTRY_UNCOMPRESSED_SIZE_LIMIT' });
      expect(archiveRef.archive.aborted).toBe(true);
    } finally {
      fs.statSync = realStatSync;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('applies the 2-GiB importer boundary to non-database profile configuration files', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-export-profile-file-budget-'));
    const sourceDir = path.join(root, 'user-configs');
    fs.mkdirSync(sourceDir);
    const filePath = path.join(sourceDir, 'synthetic-settings.json');
    const payload = Buffer.from('{"synthetic":true}');
    fs.writeFileSync(filePath, payload);
    const realStatSync = fs.statSync;
    const logicalSizes = [500 * 1024 * 1024 + 1, MAX_BACKUP_ENTRY_UNCOMPRESSED_SIZE_BYTES];

    try {
      for (const logicalSize of logicalSizes) {
        const archiveRef = {};
        let sourceStatCalls = 0;
        fs.statSync = function syntheticProfileFileStat(file, ...args) {
          const stat = realStatSync.call(fs, file, ...args);
          if (path.resolve(String(file)) !== path.resolve(filePath)) return stat;
          // Only collection observes the synthetic boundary. Stream verification
          // must compare the real payload size with the bytes actually copied.
          sourceStatCalls++;
          return sourceStatCalls === 1 ? { ...stat, size: logicalSize } : stat;
        };
        await exportBackup({
          db: null,
          pluginLoader: null,
          configPathManager: { getUserConfigsDir: () => sourceDir },
          archiveFactory: () => (archiveRef.archive = new SyntheticArchive())
        }, {
          includeGlobalSettings: false,
          includePluginSettings: false,
          includePluginData: false,
          includeUserConfigs: true,
          includeUploads: false,
          includeUserData: false
        });
        expect(archiveRef.archive.readEntries().get('user_configs/synthetic-settings.json')).toEqual(payload);
        archiveRef.archive.emit('close');
      }

      const overRef = {};
      fs.statSync = function syntheticOverLimitProfileFileStat(file, ...args) {
        const stat = realStatSync.call(fs, file, ...args);
        return path.resolve(String(file)) === path.resolve(filePath)
          ? { ...stat, size: MAX_BACKUP_ENTRY_UNCOMPRESSED_SIZE_BYTES + 1 }
          : stat;
      };
      await expect(exportBackup({
        db: null,
        pluginLoader: null,
        configPathManager: { getUserConfigsDir: () => sourceDir },
        archiveFactory: () => (overRef.archive = new SyntheticArchive())
      }, {
        includeGlobalSettings: false,
        includePluginSettings: false,
        includePluginData: false,
        includeUserConfigs: true,
        includeUploads: false,
        includeUserData: false
      })).rejects.toMatchObject({ code: 'BACKUP_ENTRY_UNCOMPRESSED_SIZE_LIMIT' });
      expect(overRef.archive.aborted).toBe(true);
    } finally {
      fs.statSync = realStatSync;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('counts generated metadata in the aggregate and fails closed at plus one byte', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-export-total-budget-'));
    const sourceDir = path.join(root, 'user-data');
    fs.mkdirSync(sourceDir);
    fs.writeFileSync(path.join(sourceDir, 'first.bin'), Buffer.alloc(2048, 0x31));
    fs.writeFileSync(path.join(sourceDir, 'second.bin'), Buffer.alloc(3072, 0x32));
    const baselineRef = {};
    const exactRef = {};
    const overRef = {};

    try {
      await exportUserData(sourceDir, baselineRef, { maxEntryBytes: 128 * 1024, maxTotalBytes: 1024 * 1024 });
      const baselineEntries = baselineRef.archive.readEntries();
      const exactTotal = [...baselineEntries.values()].reduce((sum, entry) => sum + entry.length, 0);
      baselineRef.archive.emit('close');

      await expect(exportUserData(sourceDir, exactRef, {
        maxEntryBytes: 128 * 1024,
        maxTotalBytes: exactTotal
      })).resolves.toBeTruthy();
      exactRef.archive.emit('close');

      await expect(exportUserData(sourceDir, overRef, {
        maxEntryBytes: 128 * 1024,
        maxTotalBytes: exactTotal - 1
      })).rejects.toMatchObject({ code: 'BACKUP_TOTAL_UNCOMPRESSED_SIZE_LIMIT' });
      expect(overRef.archive.aborted).toBe(true);
    } finally {
      baselineRef.archive?.emit('close');
      exactRef.archive?.emit('close');
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
  test.each(['unchanged', 'same-size rewrite', 'truncate', 'append', 'vanished'])(
    'binds snapshot bytes or fatally rejects a source mutation: %s', async (mutation) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-export-source-guard-'));
      const source = path.join(root, 'payload.bin');
      fs.writeFileSync(source, 'AAAAAAAA');
      const archiveRef = {};
      const stagePaths = [];
      const realRead = fs.createReadStream;
      const realWrite = fs.createWriteStream;
      let streamRead = false;
      fs.createWriteStream = function trackSyntheticStage(file, ...args) {
        stagePaths.push(file);
        return realWrite.call(fs, file, ...args);
      };
      fs.createReadStream = function interleavedSyntheticSource(file, ...args) {
        if (path.resolve(String(file)) !== source) return realRead.call(fs, file, ...args);
        return Readable.from((async function* () {
          const fd = fs.openSync(source, 'r');
          try {
            const first = Buffer.alloc(4);
            const count = fs.readSync(fd, first, 0, 4, 0);
            yield first.subarray(0, count);
            if (mutation === 'same-size rewrite') fs.writeFileSync(source, 'BBBBBBBB');
            if (mutation === 'truncate') fs.truncateSync(source, 2);
            if (mutation === 'append') fs.appendFileSync(source, 'BBBB');
            // Remove after reading/closing on Windows to avoid unlinking an open handle.
            let position = 4;
            for (;;) {
              const chunk = Buffer.alloc(4);
              const bytes = fs.readSync(fd, chunk, 0, 4, position);
              if (!bytes) break;
              position += bytes;
              yield chunk.subarray(0, bytes);
            }
          } finally {
            fs.closeSync(fd);
            if (mutation === 'vanished') fs.unlinkSync(source);
            streamRead = true;
          }
        })());
      };
      try {
        const operation = exportUserData(root, archiveRef, {
          maxEntryBytes: 4096,
          maxTotalBytes: 16384
        });
        if (mutation === 'unchanged') {
          await expect(operation).resolves.toBeTruthy();
          const entries = archiveRef.archive.readEntries();
          const payload = entries.get('user_data/payload.bin');
          const checksum = JSON.parse(entries.get('checksums.json')).files['user_data/payload.bin'];
          expect(payload.toString()).toBe('AAAAAAAA');
          expect(checksum.sizeBytes).toBe(payload.length);
          expect(checksum.sha256).toBe(crypto.createHash('sha256').update(payload).digest('hex'));
          expect(archiveRef.archive.aborted).toBe(false);
          archiveRef.archive.emit('close');
        } else {
          await expect(operation).rejects.toMatchObject({ code: 'BACKUP_EXPORT_SOURCE_CHANGED' });
          expect(archiveRef.archive.aborted).toBe(true);
          expect(archiveRef.archive.entries.has('user_data/payload.bin')).toBe(false);
          // A warning/skip followed by a returned archive is expressly forbidden.
          expect(archiveRef.archive.entries.has('manifest.json')).toBe(false);
        }
        expect(streamRead).toBe(true);
        expect(stagePaths.length).toBeGreaterThan(0);
        for (const stage of stagePaths) {
          expect(fs.existsSync(stage)).toBe(false);
          expect(fs.existsSync(path.dirname(stage))).toBe(false);
        }
      } finally {
        fs.createReadStream = realRead;
        fs.createWriteStream = realWrite;
        archiveRef.archive?.emit('close');
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  );

  afterAll(() => {
    expect(mockSqliteAttempts).toBe(0);
    if (process.env.LTTH_SQLITE_RECEIPT) {
      fs.writeFileSync(process.env.LTTH_SQLITE_RECEIPT, JSON.stringify({ sqliteAttempts: mockSqliteAttempts }));
    }
  });

});
