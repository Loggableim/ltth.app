'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const StreamMonstersAssetRegistry = require(
  '../../plugins/stream-monsters/backend/streammonsters/asset-registry'
);

const AUDIO_ASSET_PATH =
  /^assets\/audio\/cues\/[A-Za-z0-9._-]+\.wav$/;
const SHA256 = /^[a-f0-9]{64}$/;

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isPlainObject(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function normalizeRealPath(value) {
  const resolved = path.normalize(fs.realpathSync(value));
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isWithin(root, target) {
  return target === root || target.startsWith(`${root}${path.sep}`);
}

function inspectContainedRegularFile({
  pluginDir,
  allowedRoot,
  absolutePath,
  description
}) {
  const relativeToPlugin = path.relative(pluginDir, absolutePath);
  const relativeToAllowedRoot = path.relative(allowedRoot, absolutePath);
  if (
    !relativeToPlugin ||
    relativeToPlugin === '..' ||
    relativeToPlugin.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeToPlugin) ||
    !relativeToAllowedRoot ||
    relativeToAllowedRoot === '..' ||
    relativeToAllowedRoot.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeToAllowedRoot)
  ) {
    throw new Error(`${description} is outside its manifest asset root`);
  }

  let cursor = pluginDir;
  for (const segment of relativeToPlugin.split(path.sep)) {
    cursor = path.join(cursor, segment);
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink()) {
      throw new Error(`${description} contains a symbolic link`);
    }
  }

  const realPluginDir = normalizeRealPath(pluginDir);
  const realAllowedRoot = normalizeRealPath(allowedRoot);
  const realAbsolutePath = normalizeRealPath(absolutePath);
  if (
    !isWithin(realPluginDir, realAllowedRoot) ||
    !isWithin(realAllowedRoot, realAbsolutePath)
  ) {
    throw new Error(`${description} escapes its manifest asset root`);
  }

  const stat = fs.lstatSync(absolutePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${description} is not a regular file`);
  }
}

function readManifest(manifestPath, description) {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`${description} is unavailable: ${error.message}`);
  }
  if (!isPlainObject(manifest)) {
    throw new Error(`${description} must contain a JSON object`);
  }
  return manifest;
}

function collectAudioDependencies(pluginDir) {
  const audioRoot = path.join(pluginDir, 'assets', 'audio');
  const manifestPath = path.join(audioRoot, 'manifest.json');
  inspectContainedRegularFile({
    pluginDir,
    allowedRoot: audioRoot,
    absolutePath: manifestPath,
    description: 'Stream Monsters audio manifest'
  });
  const manifest = readManifest(manifestPath, 'Stream Monsters audio manifest');
  if (
    manifest.schemaVersion !== 1 ||
    manifest.productionMode !== 'bundled-only' ||
    manifest.selection !== 'deterministic' ||
    !isPlainObject(manifest.cues)
  ) {
    throw new Error('Stream Monsters audio manifest contract is invalid');
  }

  const dependencies = [];
  const seenAssetPaths = new Set();
  const cueEntries = Object.entries(manifest.cues)
    .sort(([left], [right]) => compareText(left, right));
  for (const [cueId, cue] of cueEntries) {
    if (
      !isPlainObject(cue) ||
      cue.deterministicVariantKey !== 'stableEventId' ||
      !Array.isArray(cue.variants) ||
      cue.variants.length === 0
    ) {
      throw new Error(`Stream Monsters audio cue ${cueId} is invalid`);
    }
    for (const [index, variant] of cue.variants.entries()) {
      const assetPath = String(variant?.assetPath || '').replace(/\\/g, '/');
      const expectedHash = String(variant?.sha256 || '');
      const source =
        `plugins/streamalchemy/assets/audio/manifest.json#cues.${cueId}.variants[${index}]`;
      if (!AUDIO_ASSET_PATH.test(assetPath) || !SHA256.test(expectedHash)) {
        throw new Error(`${source} has an invalid asset contract`);
      }
      if (seenAssetPaths.has(assetPath)) {
        throw new Error(`${source} duplicates ${assetPath}`);
      }
      seenAssetPaths.add(assetPath);

      const absolutePath = path.resolve(pluginDir, assetPath);
      inspectContainedRegularFile({
        pluginDir,
        allowedRoot: path.join(audioRoot, 'cues'),
        absolutePath,
        description: source
      });
      const fileBuffer = fs.readFileSync(absolutePath);
      if (
        fileBuffer.length < 12 ||
        fileBuffer.subarray(0, 4).toString('ascii') !== 'RIFF' ||
        fileBuffer.subarray(8, 12).toString('ascii') !== 'WAVE'
      ) {
        throw new Error(`${source} is not a WAV file`);
      }
      const actualHash = crypto
        .createHash('sha256')
        .update(fileBuffer)
        .digest('hex');
      if (actualHash !== expectedHash) {
        throw new Error(`${source} failed its SHA-256 check`);
      }
      dependencies.push({
        kind: 'audio',
        method: 'GET',
        pathname: `/plugins/streamalchemy/${assetPath}`,
        source
      });
    }
  }
  return dependencies;
}

function collectFurryDependencies(pluginDir) {
  const registry = new StreamMonstersAssetRegistry({ pluginDir });
  const audit = registry.audit();
  if (audit.expected !== 72 || audit.assets.size !== audit.expected) {
    throw new Error(
      `Stream Monsters furry manifest audit expected 72 assets and validated ${audit.assets.size}`
    );
  }

  return [...audit.assets.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([assetKey, asset]) => ({
      kind: 'furry',
      method: 'GET',
      pathname: asset.publicUrl,
      source:
        `plugins/streamalchemy/assets/streammonsters/furry/manifest.json#${assetKey}`
    }));
}

function collectStreamMonstersManifestDependencies({ appRoot }) {
  const pluginDir = path.join(
    path.resolve(appRoot),
    'plugins',
    'streamalchemy'
  );
  const dependencies = [
    ...collectAudioDependencies(pluginDir),
    ...collectFurryDependencies(pluginDir)
  ].sort((left, right) => compareText(
    `${left.method} ${left.pathname}`,
    `${right.method} ${right.pathname}`
  ));

  const uniquePaths = new Set(dependencies.map(dependency => dependency.pathname));
  if (uniquePaths.size !== dependencies.length) {
    throw new Error('Stream Monsters manifests contain duplicate public paths');
  }
  return dependencies;
}

module.exports = {
  collectStreamMonstersManifestDependencies
};
