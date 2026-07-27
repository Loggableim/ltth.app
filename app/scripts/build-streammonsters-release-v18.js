const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const tar = require('tar-stream');
const yazl = require('yazl');

const {
  FIXED_ZIP_MTIME
} = require('./build-streammonsters-release-v15');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RELEASE_MAP_PATH = path.join(__dirname, 'streammonsters-release-map.json');
const TEXT_EXTENSIONS = new Set(['.html', '.js', '.json', '.md', '.txt']);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeRelativePath(value) {
  const normalized = String(value || '').replace(/\\/g, '/');
  if (
    !normalized
    || normalized.startsWith('/')
    || normalized.includes('\0')
    || normalized.split('/').includes('..')
  ) {
    throw new Error(`Unsafe package path: ${value}`);
  }
  return normalized;
}

function loadReleaseMap(filename = RELEASE_MAP_PATH) {
  const releaseMap = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (
    releaseMap.schemaVersion !== 1
    || releaseMap.pluginId !== 'streamalchemy'
    || releaseMap.sourcePath !== 'app/plugins/streamalchemy'
    || !isPlainObject(releaseMap.releases)
  ) {
    throw new Error('Invalid Stream Monsters release map');
  }
  for (const [version, release] of Object.entries(releaseMap.releases)) {
    const overrideKeys = Object.keys(release.manifestOverrides || {});
    if (
      !/^\d+\.\d+\.\d+$/.test(version)
      || !isPlainObject(release)
      || release.manifestVersion !== version
      || !/^[a-f0-9]{40}$/.test(String(release.sourceCommit || ''))
      || release.package !== `plugin-store/packages/streamalchemy-${version}.zip`
      || !/^[a-f0-9]{64}$/.test(String(release.sha256 || ''))
      || overrideKeys.some(key => !['description', 'descriptions', 'devStatus'].includes(key))
      || (
        release.manifestOverrides !== undefined
        && !isPlainObject(release.manifestOverrides)
      )
      || Object.prototype.hasOwnProperty.call(release, 'tag')
    ) {
      throw new Error(`Invalid Stream Monsters release definition: ${version}`);
    }
  }
  return releaseMap;
}

function normalizePackageBuffer(relativePath, bytes) {
  if (!TEXT_EXTENSIONS.has(path.extname(relativePath).toLowerCase())) {
    return bytes;
  }
  return Buffer.from(
    bytes.toString('utf8').replace(/\r+\n/g, '\n').replace(/\r/g, '\n'),
    'utf8'
  );
}

function verifyCommit(repoRoot, sourceCommit) {
  const resolved = childProcess.execFileSync(
    'git',
    ['-C', repoRoot, 'rev-parse', '--verify', `${sourceCommit}^{commit}`],
    { encoding: 'utf8', windowsHide: true }
  ).trim();
  if (resolved !== sourceCommit) {
    throw new Error(`Release source commit mismatch: expected ${sourceCommit}, got ${resolved}`);
  }
}

function verifyTree(repoRoot, sourceTree) {
  const type = childProcess.execFileSync(
    'git',
    ['-C', repoRoot, 'cat-file', '-t', sourceTree],
    { encoding: 'utf8', windowsHide: true }
  ).trim();
  if (type !== 'tree') {
    throw new Error(`Release source object is not a tree: ${sourceTree} (${type})`);
  }
}

function readGitPluginFiles({ repoRoot, sourceCommit, sourceTree, sourcePath }) {
  verifyCommit(repoRoot, sourceCommit);
  if (sourceTree) verifyTree(repoRoot, sourceTree);
  const prefix = sourceTree
    ? ''
    : `${normalizeRelativePath(sourcePath).replace(/\/+$/, '')}/`;
  const archiveArguments = [
    '-C',
    repoRoot,
    'archive',
    '--format=tar',
    sourceTree || sourceCommit
  ];
  if (!sourceTree) archiveArguments.push(sourcePath);
  return new Promise((resolve, reject) => {
    const extract = tar.extract();
    const files = [];
    const git = childProcess.spawn(
      'git',
      archiveArguments,
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let stderr = '';
    let gitClosed = false;
    let extractFinished = false;
    let settled = false;

    const fail = error => {
      if (settled) return;
      settled = true;
      git.kill();
      reject(error);
    };
    const finish = () => {
      if (settled || !gitClosed || !extractFinished) return;
      settled = true;
      files.sort((left, right) => left.relativePath.localeCompare(right.relativePath, 'en'));
      resolve(files);
    };

    git.stderr.setEncoding('utf8');
    git.stderr.on('data', chunk => {
      stderr += chunk;
    });
    git.on('error', fail);
    git.on('close', code => {
      if (code !== 0) {
        fail(new Error(`git archive failed (${code}): ${stderr.trim()}`));
        return;
      }
      gitClosed = true;
      finish();
    });

    extract.on('entry', (header, stream, next) => {
      const archivedPath = normalizeRelativePath(header.name);
      if (header.type === 'directory') {
        stream.resume();
        stream.on('end', next);
        return;
      }
      if (header.type !== 'file') {
        stream.resume();
        stream.on('end', () => fail(new Error(
          `Refusing non-file Git archive entry: ${archivedPath} (${header.type})`
        )));
        return;
      }
      if (!archivedPath.startsWith(prefix)) {
        stream.resume();
        stream.on('end', () => fail(new Error(
          `Git archive entry escaped plugin root: ${archivedPath}`
        )));
        return;
      }
      const relativePath = normalizeRelativePath(archivedPath.slice(prefix.length));
      const chunks = [];
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('error', fail);
      stream.on('end', () => {
        files.push({
          relativePath,
          bytes: normalizePackageBuffer(relativePath, Buffer.concat(chunks))
        });
        next();
      });
    });
    extract.on('error', fail);
    extract.on('finish', () => {
      extractFinished = true;
      finish();
    });
    git.stdout.on('error', fail);
    git.stdout.pipe(extract);
  });
}

function applyManifestVersion(files, manifestVersion, manifestOverrides = {}) {
  const manifestFile = files.find(file => file.relativePath === 'plugin.json');
  if (!manifestFile) throw new Error('Release source has no root plugin.json');
  const manifest = JSON.parse(manifestFile.bytes.toString('utf8'));
  if (manifest.id !== 'streamalchemy') {
    throw new Error(`Unexpected plugin id in release source: ${manifest.id}`);
  }
  Object.assign(manifest, manifestOverrides, { version: manifestVersion });
  manifestFile.bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return files;
}

function buildArchiveFromFiles({ files, outputPath }) {
  const absoluteOutput = path.resolve(outputPath);
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
      archive.addBuffer(file.bytes, normalizeRelativePath(file.relativePath), {
        mtime: FIXED_ZIP_MTIME,
        mode: 0o100644,
        compress: true,
        compressionLevel: 9
      });
    }
    archive.end({ forceZip64Format: false });
  });
}

async function buildReleaseFromGit({
  repoRoot = REPO_ROOT,
  version,
  outputPath,
  releaseMap = loadReleaseMap()
}) {
  const release = releaseMap.releases[version];
  if (!release) throw new Error(`Unknown Stream Monsters release: ${version}`);
  const files = applyManifestVersion(await readGitPluginFiles({
    repoRoot: path.resolve(repoRoot),
    sourceCommit: release.sourceCommit,
    sourceTree: release.sourceTree,
    sourcePath: releaseMap.sourcePath
  }), release.manifestVersion, release.manifestOverrides);
  const result = await buildArchiveFromFiles({
    files,
    outputPath: outputPath || path.join(repoRoot, release.package)
  });
  return {
    ...result,
    version,
    sourceCommit: release.sourceCommit,
    sourceTree: release.sourceTree || null,
    manifestVersion: release.manifestVersion
  };
}

async function main() {
  const releaseMap = loadReleaseMap();
  const requested = process.argv.slice(2);
  const versions = requested.length ? requested : Object.keys(releaseMap.releases);
  for (const version of versions) {
    const result = await buildReleaseFromGit({ version, releaseMap });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }
}

module.exports = {
  RELEASE_MAP_PATH,
  applyManifestVersion,
  buildArchiveFromFiles,
  buildReleaseFromGit,
  loadReleaseMap,
  normalizeRelativePath,
  readGitPluginFiles,
  verifyCommit,
  verifyTree
};

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
