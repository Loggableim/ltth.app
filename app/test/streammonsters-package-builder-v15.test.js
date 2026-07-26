const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const yauzl = require('yauzl');

const {
  FIXED_ZIP_MTIME,
  buildPluginArchive,
  listPackageFiles
} = require('../scripts/build-streammonsters-release-v15');

function sha256(filename) {
  return crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
}

function readEntries(filename) {
  return new Promise((resolve, reject) => {
    yauzl.open(filename, { lazyEntries: true }, (error, zipFile) => {
      if (error) return reject(error);
      const entries = [];
      zipFile.on('entry', entry => {
        entries.push({
          name: entry.fileName,
          mtime: entry.getLastModDate().toISOString()
        });
        zipFile.readEntry();
      });
      zipFile.on('end', () => resolve(entries));
      zipFile.on('error', reject);
      zipFile.readEntry();
    });
  });
}

describe('Stream Monsters deterministic package builder', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-package-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('sorts files, fixes timestamps and produces identical archives', async () => {
    const sourceDir = path.join(tempDir, 'source');
    fs.mkdirSync(path.join(sourceDir, 'nested'), { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'z.txt'), 'last\n');
    fs.writeFileSync(path.join(sourceDir, 'nested', 'a.txt'), 'first\n');
    fs.writeFileSync(path.join(sourceDir, 'plugin.json'), '{"version":"1.5.0"}\n');
    const first = path.join(tempDir, 'first.zip');
    const second = path.join(tempDir, 'second.zip');

    expect(listPackageFiles(sourceDir).map(file => file.relativePath)).toEqual([
      'nested/a.txt',
      'plugin.json',
      'z.txt'
    ]);
    await buildPluginArchive({ sourceDir, outputPath: first });
    await buildPluginArchive({ sourceDir, outputPath: second });

    expect(sha256(first)).toBe(sha256(second));
    expect(await readEntries(first)).toEqual([
      { name: 'nested/a.txt', mtime: FIXED_ZIP_MTIME.toISOString() },
      { name: 'plugin.json', mtime: FIXED_ZIP_MTIME.toISOString() },
      { name: 'z.txt', mtime: FIXED_ZIP_MTIME.toISOString() }
    ]);
  });

  test('normalizes text line endings so Windows and Linux build identical archives', async () => {
    const sourceLf = path.join(tempDir, 'source-lf');
    const sourceCrlf = path.join(tempDir, 'source-crlf');
    fs.mkdirSync(sourceLf, { recursive: true });
    fs.mkdirSync(sourceCrlf, { recursive: true });
    fs.writeFileSync(path.join(sourceLf, 'plugin.json'), '{\n  "version": "1.5.0"\n}\n');
    fs.writeFileSync(path.join(sourceCrlf, 'plugin.json'), '{\r\n  "version": "1.5.0"\r\r\n}\r\n');
    fs.writeFileSync(path.join(sourceLf, 'asset.png'), Buffer.from([0, 13, 10, 255]));
    fs.writeFileSync(path.join(sourceCrlf, 'asset.png'), Buffer.from([0, 13, 10, 255]));

    const lfArchive = path.join(tempDir, 'lf.zip');
    const crlfArchive = path.join(tempDir, 'crlf.zip');
    await buildPluginArchive({ sourceDir: sourceLf, outputPath: lfArchive });
    await buildPluginArchive({ sourceDir: sourceCrlf, outputPath: crlfArchive });

    expect(sha256(crlfArchive)).toBe(sha256(lfArchive));
  });

  test('rejects symbolic links instead of packaging paths outside the plugin', () => {
    if (process.platform === 'win32') return;
    const sourceDir = path.join(tempDir, 'source');
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.symlinkSync(path.join(tempDir, 'outside'), path.join(sourceDir, 'escape'));
    expect(() => listPackageFiles(sourceDir)).toThrow(/symbolic links/i);
  });
});
