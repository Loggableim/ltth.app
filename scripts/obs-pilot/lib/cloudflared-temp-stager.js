'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { CLOUDFLARED_MANIFEST, CLOUDFLARED_VERSION } = require('../../../app/modules/cloudflared-binary-manager');

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function resolvePinnedSource({ homeDir, localAppData, version = CLOUDFLARED_VERSION } = {}) {
  const candidates = [];
  if (homeDir) candidates.push(path.join(homeDir, 'AppData', 'Local', 'ltth.app', 'runtime-tools', 'cloudflared', version, 'cloudflared.exe'));
  if (localAppData) candidates.push(path.join(localAppData, 'ltth.app', 'runtime-tools', 'cloudflared', version, 'cloudflared.exe'));
  return candidates.find(candidate => fs.existsSync(candidate)) || candidates[0] || null;
}

function stagePinnedCloudflared({ sourcePath, toolsRoot, version = CLOUDFLARED_VERSION, release = CLOUDFLARED_MANIFEST['win32:x64'] }) {
  if (!sourcePath || !fs.existsSync(sourcePath)) throw Object.assign(new Error('Pinned cloudflared source is missing'), { code: 'CLOUDFLARED_SOURCE_MISSING' });
  const sourceStat = fs.lstatSync(sourcePath);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) throw Object.assign(new Error('Pinned cloudflared source is not a regular file'), { code: 'CLOUDFLARED_SOURCE_INVALID' });
  const sourceHash = sha256File(sourcePath);
  if (sourceHash !== release.sha256) throw Object.assign(new Error('Pinned cloudflared source hash mismatch'), { code: 'CLOUDFLARED_SOURCE_HASH_MISMATCH' });
  const installDir = path.join(path.resolve(toolsRoot), 'cloudflared', version);
  fs.mkdirSync(installDir, { recursive: true });
  const executablePath = path.join(installDir, 'cloudflared.exe');
  const metadataPath = path.join(installDir, 'install.json');
  if (fs.existsSync(executablePath) || fs.existsSync(metadataPath)) throw Object.assign(new Error('Cloudflared staging target already exists'), { code: 'CLOUDFLARED_STAGE_TARGET_EXISTS' });
  const metadata = { version, releaseAsset: release.asset, releaseSha256: release.sha256, executableSha256: sourceHash };
  try {
    fs.copyFileSync(sourcePath, executablePath, fs.constants.COPYFILE_EXCL);
    fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    if (sha256File(executablePath) !== release.sha256) throw Object.assign(new Error('Staged cloudflared hash mismatch'), { code: 'CLOUDFLARED_STAGE_HASH_MISMATCH' });
    return { executablePath, metadataPath, sha256: sourceHash };
  } catch (error) {
    fs.rmSync(executablePath, { force: true });
    fs.rmSync(metadataPath, { force: true });
    throw error;
  }
}
module.exports = { resolvePinnedSource, stagePinnedCloudflared };
