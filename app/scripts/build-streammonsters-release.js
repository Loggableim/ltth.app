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
    const readmeOverlay = release.readmeOverlay;
    if (
      !/^\d+\.\d+\.\d+$/.test(version)
      || !isPlainObject(release)
      || release.manifestVersion !== version
      || !/^[a-f0-9]{40}$/.test(String(release.sourceCommit || ''))
      || (
        release.sourceTree !== undefined
        && !/^[a-f0-9]{40}$/.test(String(release.sourceTree))
      )
      || release.package !== `plugin-store/packages/streamalchemy-${version}.zip`
      || !/^[a-f0-9]{64}$/.test(String(release.sha256 || ''))
      || (
        release.packageBuilder !== undefined
        && !/^app\/scripts\/build-streammonsters-release(?:-v18)?\.js$/.test(
          String(release.packageBuilder)
        )
      )
      || overrideKeys.some(key => !['description', 'descriptions', 'devStatus'].includes(key))
      || (
        release.manifestOverrides !== undefined
        && !isPlainObject(release.manifestOverrides)
      )
      || (
        readmeOverlay !== undefined
        && (
          !isPlainObject(readmeOverlay)
          || typeof readmeOverlay.title !== 'string'
          || !readmeOverlay.title.trim()
          || typeof readmeOverlay.summary !== 'string'
          || !readmeOverlay.summary.trim()
          || !Array.isArray(readmeOverlay.highlights)
          || !readmeOverlay.highlights.length
          || readmeOverlay.highlights.some(item => (
            typeof item !== 'string' || !item.trim()
          ))
        )
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

function verifySourceTreeBinding(repoRoot, sourceCommit, sourceTree, sourcePath) {
  const committedTree = childProcess.execFileSync(
    'git',
    ['-C', repoRoot, 'rev-parse', `${sourceCommit}:${normalizeRelativePath(sourcePath)}`],
    { encoding: 'utf8', windowsHide: true }
  ).trim();
  if (committedTree !== sourceTree) {
    throw new Error(
      `Release source tree does not belong to source commit: ` +
      `expected ${committedTree}, got ${sourceTree}`
    );
  }
}

function readGitPluginFiles({ repoRoot, sourceCommit, sourceTree, sourcePath }) {
  verifyCommit(repoRoot, sourceCommit);
  if (sourceTree) {
    verifyTree(repoRoot, sourceTree);
    verifySourceTreeBinding(repoRoot, sourceCommit, sourceTree, sourcePath);
  }
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

function renderReleaseReadme({
  version,
  sourceCommit,
  overlay,
  packageBuilder = 'app/scripts/build-streammonsters-release.js'
}) {
  return [
    `# ${overlay.title}`,
    '',
    overlay.summary.trim(),
    '',
    '## Release highlights',
    '',
    ...overlay.highlights.map(item => `- ${item.trim()}`),
    '',
    '## Compatibility',
    '',
    '- The stable `streamalchemy` plugin ID and existing player data remain compatible.',
    '- Gift effects are limited to egg creation, incubation speed, and show effects; they never improve combat values or odds.',
    '',
    '## Provenance',
    '',
    `- Version: ${version}`,
    `- Audited source commit: ${sourceCommit}`,
    `- Package builder: \`${packageBuilder}\``,
    ''
  ].join('\n');
}

function applyReadmeOverlay(files, release, version) {
  if (!release.readmeOverlay) return files;
  const readmeFile = files.find(file => file.relativePath === 'README.md');
  if (!readmeFile) throw new Error('Release source has no root README.md');
  readmeFile.bytes = Buffer.from(renderReleaseReadme({
    version,
    sourceCommit: release.sourceCommit,
    overlay: release.readmeOverlay,
    packageBuilder: release.packageBuilder
  }), 'utf8');
  return files;
}

async function buildArchiveFromFiles({ files, outputPath, overwrite = false }) {
  const absoluteOutput = path.resolve(outputPath);
  if (fs.existsSync(absoluteOutput) && !overwrite) {
    throw new Error(
      `Refusing to overwrite existing release archive without explicit overwrite: ${absoluteOutput}`
    );
  }
  const normalizedFiles = files.map(file => ({
    ...file,
    relativePath: normalizeRelativePath(file.relativePath)
  }));
  fs.mkdirSync(path.dirname(absoluteOutput), { recursive: true });
  const temporaryOutput = path.join(
    path.dirname(absoluteOutput),
    `.${path.basename(absoluteOutput)}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`
  );
  const writeTemporaryArchive = () => new Promise((resolve, reject) => {
    const archive = new yazl.ZipFile();
    const output = fs.createWriteStream(temporaryOutput, { flags: 'wx' });
    let settled = false;
    const fail = error => {
      if (settled) return;
      settled = true;
      const rejectAfterClose = () => reject(error);
      if (output.closed) {
        rejectAfterClose();
        return;
      }
      output.once('close', rejectAfterClose);
      output.destroy();
    };
    output.on('error', fail);
    archive.outputStream.on('error', fail);
    output.on('close', () => {
      if (settled) return;
      settled = true;
      resolve();
    });
    archive.outputStream.pipe(output);
    try {
      for (const file of normalizedFiles) {
        archive.addBuffer(file.bytes, file.relativePath, {
          mtime: FIXED_ZIP_MTIME,
          mode: 0o100644,
          compress: true,
          compressionLevel: 9
        });
      }
      archive.end({ forceZip64Format: false });
    } catch (error) {
      fail(error);
    }
  });
  return writeTemporaryArchive()
    .then(() => {
      if (fs.existsSync(absoluteOutput) && !overwrite) {
        throw new Error(
          `Refusing to overwrite existing release archive without explicit overwrite: ${absoluteOutput}`
        );
      }
      fs.renameSync(temporaryOutput, absoluteOutput);
      const bytes = fs.readFileSync(absoluteOutput);
      return {
        outputPath: absoluteOutput,
        fileCount: normalizedFiles.length,
        size: bytes.length,
        sha256: crypto.createHash('sha256').update(bytes).digest('hex')
      };
    })
    .finally(() => {
      fs.rmSync(temporaryOutput, { force: true });
    });
}

async function buildReleaseFromGit({
  repoRoot = REPO_ROOT,
  version,
  outputPath,
  releaseMap = loadReleaseMap(),
  overwrite = false
}) {
  const release = releaseMap.releases[version];
  if (!release) throw new Error(`Unknown Stream Monsters release: ${version}`);
  const files = applyReadmeOverlay(applyManifestVersion(await readGitPluginFiles({
    repoRoot: path.resolve(repoRoot),
    sourceCommit: release.sourceCommit,
    sourceTree: release.sourceTree,
    sourcePath: releaseMap.sourcePath
  }), release.manifestVersion, release.manifestOverrides), release, version);
  const result = await buildArchiveFromFiles({
    files,
    outputPath: outputPath || path.join(repoRoot, release.package),
    overwrite
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
  const cliArguments = process.argv.slice(2);
  const overwrite = cliArguments.includes('--overwrite');
  const unknownOptions = cliArguments.filter(argument => (
    argument.startsWith('--') && argument !== '--overwrite'
  ));
  if (unknownOptions.length) {
    throw new Error(`Unknown option: ${unknownOptions.join(', ')}`);
  }
  const requested = cliArguments.filter(argument => argument !== '--overwrite');
  const versions = requested.length ? requested : Object.keys(releaseMap.releases);
  for (const version of versions) {
    const result = await buildReleaseFromGit({ version, releaseMap, overwrite });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }
}

module.exports = {
  RELEASE_MAP_PATH,
  applyManifestVersion,
  applyReadmeOverlay,
  buildArchiveFromFiles,
  buildReleaseFromGit,
  loadReleaseMap,
  main,
  normalizeRelativePath,
  readGitPluginFiles,
  renderReleaseReadme,
  verifyCommit,
  verifySourceTreeBinding,
  verifyTree
};

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
