const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const yazl = require('yazl');

const FIXED_ZIP_MTIME = new Date('2000-01-01T00:00:00.000Z');
const TEXT_EXTENSIONS = new Set(['.html', '.js', '.json', '.md', '.txt']);

function listPackageFiles(rootDir, relativeDir = '') {
  const absoluteDir = path.join(rootDir, relativeDir);
  return fs.readdirSync(absoluteDir, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, 'en'))
    .flatMap(entry => {
      const relativePath = path.posix.join(
        relativeDir.replace(/\\/g, '/'),
        entry.name
      );
      const absolutePath = path.join(rootDir, ...relativePath.split('/'));
      const stat = fs.lstatSync(absolutePath);
      if (stat.isSymbolicLink()) {
        throw new Error(`Refusing to package symbolic links: ${relativePath}`);
      }
      if (stat.isDirectory()) return listPackageFiles(rootDir, relativePath);
      if (!stat.isFile()) {
        throw new Error(`Refusing to package non-file entry: ${relativePath}`);
      }
      return [{ relativePath, absolutePath, size: stat.size }];
    });
}

function readPackageBuffer(file) {
  const bytes = fs.readFileSync(file.absolutePath);
  if (!TEXT_EXTENSIONS.has(path.extname(file.relativePath).toLowerCase())) {
    return bytes;
  }
  return Buffer.from(
    bytes.toString('utf8').replace(/\r+\n/g, '\n').replace(/\r/g, '\n'),
    'utf8'
  );
}

function buildPluginArchive({ sourceDir, outputPath }) {
  const absoluteSource = path.resolve(sourceDir);
  const absoluteOutput = path.resolve(outputPath);
  const files = listPackageFiles(absoluteSource);
  fs.mkdirSync(path.dirname(absoluteOutput), { recursive: true });

  return new Promise((resolve, reject) => {
    const archive = new yazl.ZipFile();
    const output = fs.createWriteStream(absoluteOutput, { flags: 'w' });
    let settled = false;
    const fail = error => {
      if (settled) return;
      settled = true;
      output.destroy();
      reject(error);
    };
    output.on('error', fail);
    archive.outputStream.on('error', fail);
    output.on('close', () => {
      if (settled) return;
      settled = true;
      const bytes = fs.readFileSync(absoluteOutput);
      resolve({
        outputPath: absoluteOutput,
        fileCount: files.length,
        size: bytes.length,
        sha256: crypto.createHash('sha256').update(bytes).digest('hex')
      });
    });
    archive.outputStream.pipe(output);
    for (const file of files) {
      archive.addBuffer(readPackageBuffer(file), file.relativePath, {
        mtime: FIXED_ZIP_MTIME,
        mode: 0o100644,
        compress: true,
        compressionLevel: 9
      });
    }
    archive.end({ forceZip64Format: false });
  });
}

async function main() {
  const appRoot = path.join(__dirname, '..');
  const repoRoot = path.join(appRoot, '..');
  const sourceDir = path.join(appRoot, 'plugins', 'streamalchemy');
  const manifest = JSON.parse(fs.readFileSync(path.join(sourceDir, 'plugin.json'), 'utf8'));
  const outputPath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(
      repoRoot,
      'plugin-store',
      'packages',
      `streamalchemy-${manifest.version}.zip`
    );
  const result = await buildPluginArchive({ sourceDir, outputPath });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

module.exports = {
  FIXED_ZIP_MTIME,
  buildPluginArchive,
  listPackageFiles,
  readPackageBuffer
};

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
