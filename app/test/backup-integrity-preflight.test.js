'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const archiver = require('archiver');
const { createManifest } = require('../modules/backup/manifest');
const { exportBackup } = require('../modules/backup/exporter');
const { parseBackupZip, performImport, cleanupTempDir } = require('../modules/backup/importer');
const { MAX_BACKUP_FILES, MAX_BACKUP_UNCOMPRESSED_SIZE_BYTES, MAX_BACKUP_ENTRY_UNCOMPRESSED_SIZE_BYTES, validateBackupSize } = require('../modules/backup/validators');
const { DecompressionBudget } = require('../modules/backup/decompression-budget');

function checksum(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function writeArchive(entries) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-integrity-test-'));
  const zipPath = path.join(root, 'fixture.zip');
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip');
  archive.pipe(output);
  const archiveEntries = Array.isArray(entries) ? entries : Object.entries(entries);
  for (const [name, content, options = {}] of archiveEntries) archive.append(content, { ...options, name });
  await new Promise((resolve, reject) => {
    output.once('close', resolve);
    archive.once('error', reject);
    archive.finalize();
  });
  return { root, zipPath };
}

async function makeCurrentArchive(overrides = {}) {
  const entries = {
    'manifest.json': Buffer.from(JSON.stringify(createManifest({ plugins: [], warnings: [] }))),
    'global/settings.json': Buffer.from('{"fixture":true}'),
    'user_configs/profileB.db': Buffer.from('synthetic profile database'),
    'user_configs/.active_profile': Buffer.from('profileB'),
    'uploads/sample.bin': Buffer.from([0, 1, 2, 255])
  };
  const files = {};
  for (const [name, content] of Object.entries(entries)) {
    files[name] = { sha256: checksum(content), sizeBytes: content.length };
  }
  Object.assign(files, overrides.checksumEntries || {});
  const checksumDoc = overrides.checksumDoc || {
    formatVersion: '1.1.0',
    files
  };
  Object.assign(entries, overrides.entryChanges || {});
  entries['checksums.json'] = Buffer.from(typeof checksumDoc === 'string' ? checksumDoc : JSON.stringify(checksumDoc));
  return writeArchive(entries);
}

async function makeBudgetArchive(payloads) {
  const entries = {
    'manifest.json': Buffer.from(JSON.stringify(createManifest({ plugins: [], warnings: [] }))),
    ...payloads
  };
  const files = {};
  for (const [name, content] of Object.entries(entries)) {
    files[name] = { sha256: checksum(content), sizeBytes: content.length };
  }
  entries['checksums.json'] = Buffer.from(JSON.stringify({ formatVersion: '1.1.0', files }));
  const fixture = await writeArchive(entries);
  return { ...fixture, uncompressedBytes: Object.values(entries).reduce((sum, content) => sum + content.length, 0) };
}

async function exportSyntheticUserDataArchive(payloads) {
  const root = fs.mkdtempSync(path.join(__dirname, '.backup-roundtrip-'));
  const sourceDir = path.join(root, 'source-user-data');
  const zipPath = path.join(root, 'synthetic-export.zip');
  fs.mkdirSync(sourceDir, { recursive: true });
  for (const [relativePath, contents] of Object.entries(payloads)) {
    const filePath = path.join(sourceDir, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents);
  }

  try {
    const { stream } = await exportBackup({
      db: null,
      configPathManager: { getUserDataDir: () => sourceDir },
      pluginLoader: null,
      appVersion: 'synthetic-test',
      activeProfile: 'synthetic'
    }, {
      includeGlobalSettings: false,
      includePluginSettings: false,
      includePluginData: false,
      includeUserConfigs: false,
      includeUploads: false,
      includeUserData: true
    });
    const output = fs.createWriteStream(zipPath);
    await new Promise((resolve, reject) => {
      output.once('close', resolve);
      output.once('error', reject);
      stream.once('error', reject);
      stream.pipe(output);
    });

    const exportedEntries = await require('./helpers/zip-reader').readZipEntries(zipPath);
    const uncompressedBytes = [...exportedEntries.values()].reduce((sum, contents) => sum + contents.length, 0);
    return { root, sourceDir, zipPath, uncompressedBytes };
  } catch (error) {
    fs.rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

async function importSyntheticUserDataArchive(fixture, limits) {
  const parsed = await parseBackupZip(fixture.zipPath, fs.statSync(fixture.zipPath).size, limits);
  if (parsed.errors.length) return { parsed, result: null };
  const targetDir = path.join(fixture.root, 'restored-user-data');
  const result = await performImport(parsed, {
    db: null,
    configPathManager: { getUserDataDir: () => targetDir }
  }, {
    mode: 'merge',
    includeGlobalSettings: false,
    includePluginSettings: false,
    includePluginData: false,
    includeUserConfigs: false,
    includeUploads: false,
    includeUserData: true
  });
  return { parsed, result, targetDir };
}

function forgeCentralDirectoryUncompressedSize(zipPath, entryName, sizeBytes) {
  const zip = fs.readFileSync(zipPath);
  const signature = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
  let offset = 0;
  while ((offset = zip.indexOf(signature, offset)) >= 0) {
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    if (name === entryName) {
      zip.writeUInt32LE(sizeBytes, offset + 24);
      fs.writeFileSync(zipPath, zip);
      return;
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`Could not locate central directory entry ${entryName}`);
}

function forgeCentralDirectoryMode(zipPath, entryName, mode, dosAttributes = 0) {
  const zip = fs.readFileSync(zipPath);
  const signature = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
  let offset = 0;
  while ((offset = zip.indexOf(signature, offset)) >= 0) {
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    if (name === entryName) {
      zip.writeUInt32LE((((mode << 16) >>> 0) | dosAttributes) >>> 0, offset + 38);
      fs.writeFileSync(zipPath, zip);
      return;
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`Could not locate central directory entry ${entryName}`);
}

function seedTarget(root) {
  const configDir = path.join(root, 'target-config');
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(path.join(configDir, 'profileA.db'), 'preserve-current-profile');
  fs.writeFileSync(path.join(configDir, 'profileB.db'), 'preserve-existing-profile');
  fs.writeFileSync(path.join(configDir, '.active_profile'), 'profileA');
  return {
    configDir,
    before: ['profileA.db', 'profileB.db', '.active_profile'].map(name => fs.readFileSync(path.join(configDir, name))),
    deps: { db: { dbPath: path.join(configDir, 'profileA.db') }, configPathManager: { getUserConfigsDir: () => configDir } }
  };
}

function replaceArchiveName(zipPath, originalName, replacementName) {
  const archive = fs.readFileSync(zipPath);
  const original = Buffer.from(originalName);
  const replacement = Buffer.from(replacementName);
  if (original.length !== replacement.length) throw new Error('Archive names must have equal byte lengths');
  let offset = 0;
  let replacements = 0;
  while ((offset = archive.indexOf(original, offset)) >= 0) {
    replacement.copy(archive, offset);
    offset += replacement.length;
    replacements += 1;
  }
  if (replacements < 2) throw new Error('Expected the local and central ZIP headers to contain the filename');
  fs.writeFileSync(zipPath, archive);
}

async function assertRejectedWithoutMutation(buildArchive) {
  const { root, zipPath } = await buildArchive();
  const target = seedTarget(root);
  let parsed;
  try {
    parsed = await parseBackupZip(zipPath);
    expect(parsed.errors.length).toBeGreaterThan(0);
    expect(parsed.integrity.status).toBe('invalid');
    const result = await performImport(parsed, target.deps, {
      mode: 'replace', confirmProfileReplacement: true,
      includeGlobalSettings: true, includePluginSettings: true,
      includePluginData: false, includeUserConfigs: true,
      includeUploads: true, includeUserData: false
    });
    expect(result.success).toBe(false);
    expect(['profileA.db', 'profileB.db', '.active_profile'].map(name => fs.readFileSync(path.join(target.configDir, name)))).toEqual(target.before);
    expect(parsed.tmpDir).toBeNull();
  } finally {
    cleanupTempDir(parsed && parsed.tmpDir);
    fs.rmSync(root, { recursive: true, force: true });
  }
}

describe('backup integrity preflight', () => {
  test('pins compressed and expanded caps to safe integer limits', () => {
    expect(MAX_BACKUP_UNCOMPRESSED_SIZE_BYTES).toBe(10 * 1024 * 1024 * 1024);
    expect(MAX_BACKUP_ENTRY_UNCOMPRESSED_SIZE_BYTES).toBe(2 * 1024 * 1024 * 1024);
    expect(validateBackupSize(10 * 1024 * 1024 * 1024).valid).toBe(true);
    expect(validateBackupSize(10 * 1024 * 1024 * 1024 + 1).valid).toBe(false);
    expect(validateBackupSize(Number.NaN).valid).toBe(false);
    expect(validateBackupSize(Number.MAX_SAFE_INTEGER + 1).valid).toBe(false);

    const totalBelow = new DecompressionBudget();
    for (let index = 0; index < 4; index += 1) {
      totalBelow.add(`${index}.bin`, MAX_BACKUP_ENTRY_UNCOMPRESSED_SIZE_BYTES);
    }
    totalBelow.add('below.bin', MAX_BACKUP_ENTRY_UNCOMPRESSED_SIZE_BYTES - 1);
    expect(totalBelow.totalBytes).toBe(MAX_BACKUP_UNCOMPRESSED_SIZE_BYTES - 1);

    const total = new DecompressionBudget();
    for (let index = 0; index < 5; index += 1) {
      total.add(`${index}.bin`, MAX_BACKUP_ENTRY_UNCOMPRESSED_SIZE_BYTES);
    }
    expect(total.totalBytes).toBe(MAX_BACKUP_UNCOMPRESSED_SIZE_BYTES);
    expect(() => total.add('overflow.bin', 1)).toThrow('maximum total uncompressed size');

    const entry = new DecompressionBudget();
    const entryBelow = new DecompressionBudget();
    entryBelow.add('large.db', MAX_BACKUP_ENTRY_UNCOMPRESSED_SIZE_BYTES - 1);
    expect(entryBelow.entryBytes.get('large.db')).toBe(MAX_BACKUP_ENTRY_UNCOMPRESSED_SIZE_BYTES - 1);
    entry.add('large.db', MAX_BACKUP_ENTRY_UNCOMPRESSED_SIZE_BYTES);
    expect(() => entry.add('large.db', 1)).toThrow('maximum uncompressed size');
  });

  test.each([
    ['below', 2047, true],
    ['exactly at', 2048, true],
    ['above', 2049, false]
  ])('export-import roundtrip honors the per-entry boundary %s the synthetic test cap', async (_label, payloadSize, accepted) => {
    const fixture = await exportSyntheticUserDataArchive({ 'payload.bin': Buffer.alloc(payloadSize, 0x5a) });
    let parsed;
    try {
      const outcome = await importSyntheticUserDataArchive(fixture, { maxTotalBytes: 8192, maxEntryBytes: 2048 });
      parsed = outcome.parsed;
      if (accepted) {
        expect(parsed.errors).toEqual([]);
        expect(outcome.result).toEqual(expect.objectContaining({ success: true, errors: [] }));
        expect(fs.readFileSync(path.join(outcome.targetDir, 'payload.bin'))).toEqual(Buffer.alloc(payloadSize, 0x5a));
      } else {
        expect(parsed.errors).toContain('Backup entry exceeds the maximum uncompressed size');
        expect(outcome.result).toBeNull();
        expect(parsed.tmpDir).toBeNull();
      }
    } finally {
      cleanupTempDir(parsed && parsed.tmpDir);
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('export-import roundtrip accepts the exact synthetic aggregate cap and rejects cumulative overflow', async () => {
    const payloads = {
      'first.bin': Buffer.alloc(700, 0x31),
      'nested/second.bin': Buffer.alloc(701, 0x32)
    };
    const fixture = await exportSyntheticUserDataArchive(payloads);
    let parsed;
    try {
      const exact = await importSyntheticUserDataArchive(fixture, {
        maxTotalBytes: fixture.uncompressedBytes,
        maxEntryBytes: 2048
      });
      parsed = exact.parsed;
      expect(parsed.errors).toEqual([]);
      expect(exact.result).toEqual(expect.objectContaining({ success: true, errors: [] }));
      expect(fs.readFileSync(path.join(exact.targetDir, 'nested', 'second.bin'))).toEqual(payloads['nested/second.bin']);
      cleanupTempDir(parsed.tmpDir);
      parsed = null;

      const over = await importSyntheticUserDataArchive(fixture, {
        maxTotalBytes: fixture.uncompressedBytes - 1,
        maxEntryBytes: 2048
      });
      parsed = over.parsed;
      expect(parsed.errors).toContain('Backup exceeds the maximum total uncompressed size');
      expect(over.result).toBeNull();
      expect(parsed.tmpDir).toBeNull();
    } finally {
      cleanupTempDir(parsed && parsed.tmpDir);
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('rejects a caller-supplied compressed size that differs from the archive file', async () => {
    const fixture = await makeBudgetArchive({ 'uploads/payload.bin': Buffer.from('synthetic') });
    try {
      const parsed = await parseBackupZip(fixture.zipPath, 1);
      expect(parsed.errors).toEqual(['Backup archive size does not match the measured file size']);
      expect(parsed.tmpDir).toBeUndefined();
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test.each([
    ['one byte below', 1023, true],
    ['exactly at the entry cap', 1024, true],
    ['one byte above', 1025, false]
  ])('counts actual stream bytes for a single entry %s', async (_label, payloadSize, accepted) => {
    const fixture = await makeBudgetArchive({ 'uploads/payload.bin': Buffer.alloc(payloadSize, 0x41) });
    const tempDirSpy = jest.spyOn(os, 'tmpdir').mockReturnValue(fixture.root);
    let parsed;
    try {
      expect(fs.statSync(fixture.zipPath).size).toBeLessThan(payloadSize);
      parsed = await parseBackupZip(fixture.zipPath, fs.statSync(fixture.zipPath).size, {
        maxTotalBytes: 4096,
        maxEntryBytes: 1024
      });
      expect(parsed.errors.length === 0).toBe(accepted);
      if (accepted) expect(parsed.integrity.status).toBe('verified');
      else expect(parsed.errors).toContain('Backup entry exceeds the maximum uncompressed size');
      if (!accepted) {
        expect(parsed.tmpDir).toBeNull();
        expect(fs.readdirSync(fixture.root).some(name => name.startsWith('ltth-backup-'))).toBe(false);
      }
    } finally {
      tempDirSpy.mockRestore();
      cleanupTempDir(parsed && parsed.tmpDir);
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('accepts the exact aggregate cap and rejects cumulative overflow before returning a temp tree', async () => {
    const payloads = {
      'uploads/first.bin': Buffer.alloc(700, 0x31),
      'user_data/second.bin': Buffer.alloc(700, 0x32)
    };
    const fixture = await makeBudgetArchive(payloads);
    const tempDirSpy = jest.spyOn(os, 'tmpdir').mockReturnValue(fixture.root);
    let parsed;
    try {
      parsed = await parseBackupZip(fixture.zipPath, fs.statSync(fixture.zipPath).size, {
        maxTotalBytes: fixture.uncompressedBytes,
        maxEntryBytes: 1024
      });
      expect(parsed.errors).toEqual([]);
      expect(parsed.integrity.status).toBe('verified');
      cleanupTempDir(parsed.tmpDir);
      parsed = null;

      const overFixture = await makeBudgetArchive(payloads);
      parsed = await parseBackupZip(overFixture.zipPath, fs.statSync(overFixture.zipPath).size, {
        maxTotalBytes: overFixture.uncompressedBytes - 1,
        maxEntryBytes: 1024
      });
      expect(parsed.errors).toContain('Backup exceeds the maximum total uncompressed size');
      expect(parsed.tmpDir).toBeNull();
      expect(fs.readdirSync(fixture.root).some(name => name.startsWith('ltth-backup-'))).toBe(false);
      fs.rmSync(overFixture.root, { recursive: true, force: true });
    } finally {
      tempDirSpy.mockRestore();
      cleanupTempDir(parsed && parsed.tmpDir);
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

test.each([
  ['larger than actual; actual stream breaches the cap', 4096, /entry exceeds the maximum uncompressed size/i],
  ['smaller than actual; ZIP stream validation rejects the mismatch', 1, /too many bytes in the stream/i]
])('rejects a central-directory/stream size mismatch (%s) before import', async (_label, declaredSize, expectedError) => {
    const fixture = await makeBudgetArchive({ 'uploads/payload.bin': Buffer.alloc(2048, 0x42) });
    forgeCentralDirectoryUncompressedSize(fixture.zipPath, 'uploads/payload.bin', declaredSize);
    const tempDirSpy = jest.spyOn(os, 'tmpdir').mockReturnValue(fixture.root);
    let parsed;
    try {
      const outcome = await importSyntheticUserDataArchive(fixture, {
        maxTotalBytes: 4096,
        maxEntryBytes: 1024
      });
      parsed = outcome.parsed;
      expect(parsed.errors.join(' ')).toMatch(expectedError);
      expect(outcome.result).toBeNull();
      expect(parsed.tmpDir).toBeFalsy();
      expect(fs.existsSync(path.join(fixture.root, 'restored-user-data'))).toBe(false);
      expect(fs.readdirSync(fixture.root).some(name => name.startsWith('ltth-backup-'))).toBe(false);
    } finally {
      tempDirSpy.mockRestore();
      cleanupTempDir(parsed && parsed.tmpDir);
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test.each([
    ['duplicate exact names', [['uploads/repeated.bin', Buffer.from('first')], ['uploads/repeated.bin', Buffer.from('second')]]],
    ['case-only path collisions', [['uploads/Case.bin', Buffer.from('first')], ['uploads/case.bin', Buffer.from('second')]]],
    ['case-only directory-prefix collisions', [['Uploads/first.bin', Buffer.from('first')], ['uploads/second.bin', Buffer.from('second')]]],
    ['Unicode NFC/NFD path collisions', [['uploads/caf\u00e9.bin', Buffer.from('first')], ['uploads/cafe\u0301.bin', Buffer.from('second')]]]
  ])('rejects %s before extraction can select an ambiguous payload', async (_label, collisionEntries) => {
    const manifest = Buffer.from(JSON.stringify(createManifest({ plugins: [], warnings: [] })));
    const fixture = await writeArchive([['manifest.json', manifest], ...collisionEntries]);
    const tempDirSpy = jest.spyOn(os, 'tmpdir').mockReturnValue(fixture.root);
    let parsed;
    try {
      parsed = await parseBackupZip(fixture.zipPath, fs.statSync(fixture.zipPath).size);
      expect(parsed.errors).toContain('Backup archive contains invalid, duplicate or colliding entry paths');
      expect(parsed.tmpDir).toBeNull();
      expect(fs.readdirSync(fixture.root).some(name => name.startsWith('ltth-backup-'))).toBe(false);
    } finally {
      tempDirSpy.mockRestore();
      cleanupTempDir(parsed && parsed.tmpDir);
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test.each([
    ['symbolic link', 0o120777],
    ['FIFO special file', 0o010644],
    ['character device special file', 0o020600],
    ['Windows reparse point attribute', 0, 0x0400],
    ['Windows device attribute', 0, 0x0040]
  ])('rejects %s metadata before creating extracted paths', async (_label, mode, dosAttributes = 0) => {
    const manifest = Buffer.from(JSON.stringify(createManifest({ plugins: [], warnings: [] })));
    const fixture = await writeArchive([
      ['manifest.json', manifest],
      ['uploads/special-entry', Buffer.from('synthetic target or device data')]
    ]);
    forgeCentralDirectoryMode(fixture.zipPath, 'uploads/special-entry', mode, dosAttributes);
    const tempDirSpy = jest.spyOn(os, 'tmpdir').mockReturnValue(fixture.root);
    let parsed;
    try {
      parsed = await parseBackupZip(fixture.zipPath, fs.statSync(fixture.zipPath).size);
      expect(parsed.errors).toContain('Backup archive contains an unsupported file type');
      expect(parsed.tmpDir).toBeNull();
      expect(fs.readdirSync(fixture.root).some(name => name.startsWith('ltth-backup-'))).toBe(false);
    } finally {
      tempDirSpy.mockRestore();
      cleanupTempDir(parsed && parsed.tmpDir);
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('rejects a traversal ZIP member before it can write outside the extraction root', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-zip-traversal-'));
    const fixture = await writeArchive({ 'escaped.txt': Buffer.from('synthetic traversal payload') });
    const zipPath = path.join(root, 'traversal.zip');
    fs.copyFileSync(fixture.zipPath, zipPath);
    fs.rmSync(fixture.root, { recursive: true, force: true });
    replaceArchiveName(zipPath, 'escaped.txt', '../evil.txt');
    const tempDirSpy = jest.spyOn(os, 'tmpdir').mockReturnValue(root);
    let parsed;
    try {
      parsed = await parseBackupZip(zipPath, fs.statSync(zipPath).size);
      expect(parsed.errors.length).toBeGreaterThan(0);
      expect(fs.existsSync(path.join(root, 'evil.txt'))).toBe(false);
      expect(parsed.tmpDir).toBeUndefined();
    } finally {
      tempDirSpy.mockRestore();
      cleanupTempDir(parsed && parsed.tmpDir);
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('rejects an archive above the declared entry count before extracting its payload', async () => {
    const manifest = createManifest({ plugins: [], warnings: [] });
    manifest.formatVersion = '1.0.0';
    const manifestBytes = Buffer.from(JSON.stringify(manifest));
    const entries = { 'manifest.json': manifestBytes };
    for (let index = 0; index < MAX_BACKUP_FILES; index += 1) {
      entries[`payload/${String(index).padStart(5, '0')}.bin`] = Buffer.alloc(0);
    }
    entries['checksums.json'] = Buffer.from(JSON.stringify({ 'manifest.json': checksum(manifestBytes) }));

    const fixture = await writeArchive(entries);
    let parsed;
    try {
      parsed = await parseBackupZip(fixture.zipPath, fs.statSync(fixture.zipPath).size);
      expect(parsed.errors).toEqual([`Backup contains more than ${MAX_BACKUP_FILES} archive entries`]);
      expect(parsed.tmpDir).toBeNull();
    } finally {
      cleanupTempDir(parsed && parsed.tmpDir);
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('fully verifies every current archive member before importing profile data', async () => {
    const { root, zipPath } = await makeCurrentArchive();
    const targetRoot = fs.mkdtempSync(path.join(__dirname, '.backup-import-target-'));
    const target = seedTarget(targetRoot);
    let parsed;
    try {
      parsed = await parseBackupZip(zipPath);
      expect(parsed.errors).toEqual([]);
      expect(parsed.integrity).toEqual({ status: 'verified', verifiedFiles: 5, unverifiedFiles: 0 });
      const result = await performImport(parsed, target.deps, {
        mode: 'replace', confirmProfileReplacement: true,
        includeGlobalSettings: false, includePluginSettings: false,
        includePluginData: false, includeUserConfigs: true,
        includeUploads: false, includeUserData: false
      });
      expect(result).toEqual(expect.objectContaining({ success: true, errors: [] }));
      expect(fs.readFileSync(path.join(target.configDir, 'profileB.db'), 'utf8')).toBe('synthetic profile database');
      expect(fs.readFileSync(path.join(target.configDir, '.active_profile'), 'utf8')).toBe('profileB');
    } finally {
      cleanupTempDir(parsed && parsed.tmpDir);
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(targetRoot, { recursive: true, force: true });
    }
  });

  test('does not commit an extracted file changed after archive integrity verification', async () => {
    const fixture = await makeCurrentArchive();
    const targetUploads = path.join(fixture.root, 'target-uploads');
    fs.mkdirSync(targetUploads, { recursive: true });
    const targetFile = path.join(targetUploads, 'sample.bin');
    fs.writeFileSync(targetFile, 'preserve-before-bytes');
    let parsed;
    try {
      parsed = await parseBackupZip(fixture.zipPath, fs.statSync(fixture.zipPath).size);
      expect(parsed.integrity.status).toBe('verified');
      expect(parsed.uploadFiles).toHaveLength(1);

      // Deterministic same-user race: alter the extracted temp member after its ZIP
      // checksum has passed, at the gap before persistent restore staging begins.
      fs.writeFileSync(parsed.uploadFiles[0].tmpPath, 'SYNTHETIC_TAMPERED_PAYLOAD');
      const result = await performImport(parsed, {
        db: null,
        configPathManager: { getUploadsDir: () => targetUploads }
      }, {
        mode: 'replace',
        includeGlobalSettings: false,
        includePluginSettings: false,
        includePluginData: false,
        includeUserConfigs: false,
        includeUploads: true,
        includeUserData: false
      });

      expect(result.success).toBe(false);
      expect(result.errors.join(' ')).toMatch(/staged backup file failed integrity verification/i);
      expect(fs.readFileSync(targetFile, 'utf8')).toBe('preserve-before-bytes');
    } finally {
      cleanupTempDir(parsed && parsed.tmpDir);
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('rejects a staged payload swapped by an awaitable provider before commit', async () => {
    const fixture = await makeCurrentArchive();
    const targetUploads = path.join(fixture.root, 'provider-race-target-uploads');
    fs.mkdirSync(targetUploads, { recursive: true });
    const targetFile = path.join(targetUploads, 'sample.bin');
    fs.writeFileSync(targetFile, 'SYNTHETIC_PRESERVE_TARGET');
    let parsed;
    try {
      parsed = await parseBackupZip(fixture.zipPath, fs.statSync(fixture.zipPath).size);
      expect(parsed.integrity.status).toBe('verified');
      parsed.pluginSettings.fixture = { synthetic: true };

      const result = await performImport(parsed, {
        db: null,
        configPathManager: { getUploadsDir: () => targetUploads },
        backupProviders: {
          fixture: {
            importConfig: async () => {
              const stageDir = fs.readdirSync(targetUploads)
                .find(name => name.startsWith('.ltth-restore-stage-'));
              expect(stageDir).toBeTruthy();
              fs.writeFileSync(path.join(targetUploads, stageDir, 'payload'), 'SYNTHETIC_PROVIDER_SWAP');
              return { importedKeys: [], warnings: [] };
            }
          }
        }
      }, {
        mode: 'replace',
        includeGlobalSettings: false,
        includePluginSettings: true,
        includePluginData: false,
        includeUserConfigs: false,
        includeUploads: true,
        includeUserData: false
      });

      expect(result.success).toBe(false);
      expect(result.errors.join(' ')).toMatch(/staged backup file changed before commit/i);
      expect(fs.readFileSync(targetFile, 'utf8')).toBe('SYNTHETIC_PRESERVE_TARGET');
      expect(fs.readdirSync(targetUploads).some(name => name.startsWith('.ltth-restore-stage-'))).toBe(false);
    } finally {
      cleanupTempDir(parsed && parsed.tmpDir);
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('does not commit a tampered extracted active-profile marker', async () => {
    const fixture = await makeCurrentArchive();
    const target = seedTarget(fixture.root);
    let parsed;
    try {
      parsed = await parseBackupZip(fixture.zipPath, fs.statSync(fixture.zipPath).size);
      const marker = parsed.userConfigsFiles.find(file => file.relPath === '.active_profile');
      expect(marker).toBeTruthy();
      fs.writeFileSync(marker.tmpPath, 'SYNTHETIC_UNCONFIRMED_PROFILE');

      const result = await performImport(parsed, target.deps, {
        mode: 'replace',
        confirmProfileReplacement: true,
        includeGlobalSettings: false,
        includePluginSettings: false,
        includePluginData: false,
        includeUserConfigs: true,
        includeUploads: false,
        includeUserData: false
      });

      expect(result.success).toBe(false);
      expect(result.errors.join(' ')).toMatch(/staged backup file failed integrity verification/i);
      expect(['profileA.db', 'profileB.db', '.active_profile'].map(name =>
        fs.readFileSync(path.join(target.configDir, name))
      )).toEqual(target.before);
    } finally {
      cleanupTempDir(parsed && parsed.tmpDir);
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('rejects a tampered payload and preserves all profile files', async () => {
    await assertRejectedWithoutMutation(() => makeCurrentArchive({ entryChanges: { 'uploads/sample.bin': Buffer.from('tampered') } }));
  });

  test('rejects a size mismatch even when the digest matches', async () => {
    const data = Buffer.from('size checked');
    await assertRejectedWithoutMutation(async () => {
      const result = await makeCurrentArchive({ checksumEntries: { 'uploads/sample.bin': { sha256: checksum(data), sizeBytes: data.length + 1 } } });
      return result;
    });
  });

  test('rejects malformed checksum JSON and preserves all profile files', async () => {
    await assertRejectedWithoutMutation(() => makeCurrentArchive({ checksumDoc: '{bad json' }));
  });

  test('rejects missing or unknown checksum paths', async () => {
    const missing = await makeCurrentArchive({ checksumDoc: { formatVersion: '1.1.0', files: {} } });
    try {
      const parsed = await parseBackupZip(missing.zipPath);
      expect(parsed.errors.join(' ')).toContain('missing an entry');
      expect(parsed.integrity.status).toBe('invalid');
    } finally { fs.rmSync(missing.root, { recursive: true, force: true }); }
    await assertRejectedWithoutMutation(() => makeCurrentArchive({ checksumEntries: { 'surprise.txt': { sha256: 'a'.repeat(64), sizeBytes: 0 } } }));
  });

  test('rejects malformed settings after integrity verification without mutation', async () => {
    await assertRejectedWithoutMutation(() => makeCurrentArchive({ entryChanges: { 'global/settings.json': Buffer.from('{bad json') } }));
  });

  test('labels checksum-free pre-1.0 archives as unverified legacy', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-legacy-test-'));
    const manifest = createManifest({ plugins: [], warnings: [] });
    manifest.formatVersion = '0.9.0';
    const fixture = await writeArchive({ 'manifest.json': Buffer.from(JSON.stringify(manifest)) });
    try {
      const parsed = await parseBackupZip(fixture.zipPath);
      expect(parsed.errors).toEqual([]);
      expect(parsed.integrity).toEqual({ status: 'unverified-legacy', verifiedFiles: 0, unverifiedFiles: 1 });
      expect(parsed.warnings.join(' ')).toContain('contents are unverified');
      cleanupTempDir(parsed.tmpDir);
    } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(fixture.root, { recursive: true, force: true }); }
  });

  test('labels old digest-only partial checksums as partially verified', async () => {
    const entries = {
      'manifest.json': Buffer.from(JSON.stringify({ ...createManifest({ plugins: [], warnings: [] }), formatVersion: '1.0.0' })),
      'global/settings.json': Buffer.from('{}'),
      'plugins/example/data/state.bin': Buffer.from('legacy payload')
    };
    const oldChecksums = {
      'manifest.json': checksum(entries['manifest.json']),
      'global/settings.json': checksum(entries['global/settings.json'])
    };
    entries['checksums.json'] = Buffer.from(JSON.stringify(oldChecksums));
    const fixture = await writeArchive(entries);
    let parsed;
    try {
      parsed = await parseBackupZip(fixture.zipPath);
      expect(parsed.errors).toEqual([]);
      expect(parsed.integrity).toEqual({ status: 'partially-verified-legacy', verifiedFiles: 2, unverifiedFiles: 1 });
      expect(parsed.warnings.join(' ')).toContain('partial checksums');
    } finally { cleanupTempDir(parsed && parsed.tmpDir); fs.rmSync(fixture.root, { recursive: true, force: true }); }
  });
});
