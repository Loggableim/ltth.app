'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ALLOWED_TARGET_ROOTS = new Set(['obs', 'runtime', 'pilot', 'host-receipt', 'redist']);
const SENSITIVE_SEGMENT = /(^|[._-])(private|credentials?|secrets?|tokens?|cookies?|password|passwd|stream[-_]?key|host[-_]?profiles?|profiles?|auth)([._-]|$)/i;
const FORBIDDEN_EXTENSIONS = new Set(['.env', '.key', '.pem', '.pfx', '.p12', '.kdbx', '.sqlite', '.sqlite3', '.db', '.log', '.lnk', '.url', '.reg', '.bak', '.old']);
const PUBLIC_KEY_POLICY_FILE = 'transfer-public-key-exception.obs32.1.0.json';
const PUBLIC_KEY_POLICY_SHA256 = '104189d06ecc8246bb774626181ba5eb7f9e9c2bbbcec6ac34c44273274fecb2';
const PUBLIC_KEY_SOURCE_MANIFEST_SHA256 = '41e4bed8eb2fe413dfafd032a2708c51c1a0a7488741bd4716511ccd2728f8fa';
const PUBLIC_KEY_SOURCE_PATH = 'data/obs-studio/OBSPublicRSAKey.pem';
const PUBLIC_KEY_TARGET_PATH = 'obs/data/obs-studio/OBSPublicRSAKey.pem';
const PUBLIC_KEY_SOURCE_ROOT = 'C:/Program Files/obs-studio';
const PATH_EXCEPTION_POLICY = require('./transfer-path-exceptions.json');
const PATH_EXCEPTIONS = new Map(PATH_EXCEPTION_POLICY.exceptions.map((entry) => [entry.path.toLowerCase(), entry]));

const HOST_ONLY = new Map([
  ['app/plugins/sidekick/test/pilot-public-overlay-harness.test.js', 'host-side contract test; never guest runtime'],
  ['scripts/obs-pilot/create-isolation-receipt.js', 'host-only VBoxManage receipt producer'],
  ['scripts/obs-pilot/test/contract.test.js', 'host-only security and behavior tests'],
  ['scripts/obs-pilot/test/stage-contract.test.js', 'host-only stage regression tests'],
]);

const SIDEKICK_ROOT_KEYS = new Set([
  'schemaVersion', 'status', 'createdAt', 'purpose', 'constraints', 'runtime', 'pilot',
  'existingHarness', 'requiredToAuthorBeforeTransfer', 'packageClosure', 'files', 'totals',
  'excluded', 'runtimeCommands', 'sourceProvenance', 'effectiveTransfer', 'excludedFromGuest', 'guestTransfer',
]);

function fail(message) {
  throw new Error(message);
}

function exactKeys(value, expected, context, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${context} must be an object`);
  const actual = Object.keys(value).sort();
  const allowed = [...expected].sort();
  for (const key of actual) if (!allowed.includes(key)) fail(`${context} has unknown property: ${key}`);
  for (const key of allowed) if (!actual.includes(key) && !optional.includes(key)) fail(`${context} is missing property: ${key}`);
}

function loadPublicKeyExceptionPolicy() {
  const filePath = path.join(__dirname, PUBLIC_KEY_POLICY_FILE);
  const raw = fs.readFileSync(filePath);
  const actualPolicyHash = crypto.createHash('sha256').update(raw).digest('hex');
  if (actualPolicyHash !== PUBLIC_KEY_POLICY_SHA256) fail('trusted public-key exception policy pin mismatch');
  const policy = JSON.parse(raw.toString('utf8'));
  exactKeys(policy, ['schemaVersion', 'policyVersion', 'sourceVersion', 'sourceManifestSha256', 'obsExecutableSha256', 'scope', 'entries'], 'Trusted public-key exception policy');
  if (policy.schemaVersion !== 1 || policy.policyVersion !== 'obs-public-rsa-internal-test-v1' ||
      policy.sourceVersion !== '32.1.0' || policy.sourceManifestSha256 !== PUBLIC_KEY_SOURCE_MANIFEST_SHA256 ||
      policy.scope !== 'internal-isolated-vm-test-only; no external redistribution or release' ||
      !Array.isArray(policy.entries) || policy.entries.length !== 1) {
    fail('trusted public-key exception policy metadata is invalid');
  }
  const entry = policy.entries[0];
  exactKeys(entry, ['sourcePath', 'path', 'bytes', 'sha256', 'pemType', 'asymmetricKeyType', 'modulusLengthBits'], 'Trusted public-key exception entry');
  if (entry.sourcePath !== PUBLIC_KEY_SOURCE_PATH || entry.path !== PUBLIC_KEY_TARGET_PATH ||
      entry.bytes !== 814 || entry.sha256 !== '8cb9323b3e07c62c5298842aac70bfba50613f0319faa47369c99f176efd6ab2' ||
      entry.pemType !== 'PUBLIC KEY' || entry.asymmetricKeyType !== 'rsa' || entry.modulusLengthBits !== 4096 ||
      policy.obsExecutableSha256 !== 'dda672742960c9e036b06675854e36ebced0f86656a6cfa5a50eea0df5c9c2e0') {
    fail('trusted public-key exception pin is invalid');
  }
  return { policy, entry };
}

function verifyTrustedObsManifest(obsManifest, obsRoot, repositoryRoot, policy) {
  if (path.resolve(obsRoot).toLowerCase() !== path.resolve(PUBLIC_KEY_SOURCE_ROOT).toLowerCase()) {
    fail('trusted public-key exception requires the pinned OBS 32.1.0 source root');
  }
  const manifestPath = path.join(repositoryRoot, 'docs/coordination/obs-portable-transfer-manifest.json');
  const raw = fs.readFileSync(manifestPath);
  const manifestHash = crypto.createHash('sha256').update(raw).digest('hex');
  if (manifestHash !== policy.sourceManifestSha256) fail('trusted public-key exception OBS source manifest pin mismatch');
  const trustedManifest = JSON.parse(raw.toString('utf8'));
  if (JSON.stringify(obsManifest) !== JSON.stringify(trustedManifest) || obsManifest.source?.version !== policy.sourceVersion ||
      obsManifest.source?.mainExecutableSha256 !== policy.obsExecutableSha256) {
    fail('trusted public-key exception requires the exact OBS 32.1.0 source manifest');
  }
}

function verifyPublicKeyBuffer(data, entry) {
  if (!Buffer.isBuffer(data) || data.length !== entry.bytes || crypto.createHash('sha256').update(data).digest('hex') !== entry.sha256) {
    fail(`trusted public-key exception byte/hash mismatch: ${entry.path}`);
  }
  const text = data.toString('ascii');
  if (/-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----/.test(text)) fail(`private key material rejected: ${entry.path}`);
  const blocks = [...text.matchAll(/-----BEGIN ([A-Z0-9 ]+)-----\r?\n([A-Za-z0-9+/=\r\n]+?)\r?\n-----END \1-----\r?\n?/g)];
  if (blocks.length !== 1 || blocks[0][0].trimEnd() !== text.trimEnd() || blocks[0][1] !== entry.pemType) {
    fail(`trusted public-key PEM structure or type mismatch: ${entry.path}`);
  }
  let key;
  try {
    key = crypto.createPublicKey(data);
  } catch {
    fail(`trusted public-key PEM parser rejected file: ${entry.path}`);
  }
  if (key.type !== 'public' || key.asymmetricKeyType !== entry.asymmetricKeyType ||
      key.asymmetricKeyDetails?.modulusLength !== entry.modulusLengthBits) {
    fail(`trusted public-key crypto classification mismatch: ${entry.path}`);
  }
}

function safeRelativePathStructure(value, requireAllowedRoot = true, deferPinnedPublicKeyExtension = false) {
  if (typeof value !== 'string' || !value || value.length > 240 || value.includes('\\') || value.startsWith('/') || /^[a-z]:/i.test(value) || value.includes(':') || value.includes('\0') || value !== value.normalize('NFC')) {
    fail(`unsafe relative path: ${String(value)}`);
  }
  const parts = value.split('/');
  if (parts.length < 2 || (requireAllowedRoot && !ALLOWED_TARGET_ROOTS.has(parts[0]))) fail(`path outside ISO helper allowed roots: ${value}`);
  for (const part of parts) {
    if (!part || part === '.' || part === '..' || part.startsWith('.') || part.endsWith('.') || part.endsWith(' ') || /[<>"|?*\x00-\x1f]/.test(part)) fail(`unsafe path segment: ${value}`);
    if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(part.split('.', 1)[0])) fail(`Windows-reserved path segment: ${value}`);
  }
  const leaf = parts.at(-1);
  const extension = path.posix.extname(leaf).toLowerCase();
  const exactPublicKeyCandidate = deferPinnedPublicKeyExtension && [PUBLIC_KEY_SOURCE_PATH, PUBLIC_KEY_TARGET_PATH].includes(value);
  if ((FORBIDDEN_EXTENSIONS.has(extension) && !(extension === '.pem' && exactPublicKeyCandidate)) || /^\.env($|\.)/i.test(leaf)) fail(`forbidden transfer extension: ${value}`);
  return parts.join('/');
}

function safeRelativePath(value, requireAllowedRoot = true, allowSensitiveException = false, allowPinnedPublicKeyExtension = false) {
  const normalized = safeRelativePathStructure(value, requireAllowedRoot, allowPinnedPublicKeyExtension);
  if (!allowSensitiveException && normalized.split('/').some((part) => SENSITIVE_SEGMENT.test(part))) {
    fail(`sensitive path segment: ${normalized}`);
  }
  return normalized;
}

function validateHelperManifest(manifest) {
  return validateHelperManifestInternal(manifest, new Set());
}

function validateHelperManifestInternal(manifest, verifiedPublicKeyTargets) {
  exactKeys(manifest, ['schemaVersion', 'files'], 'Helper manifest');
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.files) || manifest.files.length < 1 || manifest.files.length > 10000) fail('helper manifest schema or file count is invalid');
  const paths = new Set();
  const pathErrors = [];
  let totalBytes = 0;
  for (const entry of manifest.files) {
    exactKeys(entry, ['path', 'bytes', 'sha256'], 'Helper manifest entry');
    const isPublicKeyTarget = entry.path === PUBLIC_KEY_TARGET_PATH;
    const hasPemExtension = typeof entry.path === 'string' && path.posix.extname(entry.path).toLowerCase() === '.pem';
    if (hasPemExtension && (!isPublicKeyTarget || !verifiedPublicKeyTargets.has(entry.path))) {
      fail(`trusted public-key exception requires verified source bytes: ${entry.path}`);
    }
    if (isPublicKeyTarget && !verifiedPublicKeyTargets.has(entry.path)) {
      fail(`trusted public-key exception requires verified source bytes: ${entry.path}`);
    }
    if (isPublicKeyTarget) {
      const { entry: publicKeyEntry } = loadPublicKeyExceptionPolicy();
      if (entry.bytes !== publicKeyEntry.bytes || typeof entry.sha256 !== 'string' || entry.sha256.toLowerCase() !== publicKeyEntry.sha256) {
        fail(`trusted public-key exception metadata mismatch: ${entry.path}`);
      }
    }
    const exceptionCandidate = PATH_EXCEPTIONS.get(typeof entry.path === 'string' ? entry.path.toLowerCase() : '');
    const exception = exceptionCandidate && exceptionCandidate.path === entry.path ? exceptionCandidate : null;
    if (exception && (entry.bytes !== exception.bytes || typeof entry.sha256 !== 'string' || entry.sha256.toLowerCase() !== exception.sha256)) fail(`trusted path exception metadata mismatch: ${entry.path}`);
    let target;
    try {
      target = safeRelativePath(entry.path, true, Boolean(exception), isPublicKeyTarget);
    } catch (error) {
      pathErrors.push(`${entry.path}: ${error.message}`);
      continue;
    }
    const folded = target.toLocaleLowerCase('en-US');
    if (paths.has(folded)) fail(`duplicate or case-colliding helper path: ${target}`);
    paths.add(folded);
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || entry.bytes > 2147483648 || typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(entry.sha256)) fail(`helper entry size/hash is invalid: ${target}`);
    totalBytes += entry.bytes;
    if (totalBytes + 1048576 > 2147483648) fail('helper payload plus transfer manifest exceeds 2 GiB');
  }
  if (pathErrors.length) fail(`helper manifest contains ${pathErrors.length} unsafe target path(s): ${pathErrors.slice(0, 20).join(' | ')}`);
  return manifest;
}

function noReparseChain(root, fullPath) {
  const relative = path.relative(root, fullPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) fail(`source resolves outside root: ${fullPath}`);
  let cursor = root;
  const rootStat = fs.lstatSync(cursor);
  if (rootStat.isSymbolicLink()) fail(`reparse source root: ${cursor}`);
  for (const part of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    const info = fs.lstatSync(cursor);
    if (info.isSymbolicLink()) fail(`reparse source path: ${cursor}`);
  }
}

function hashFile(filePath) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let bytes = 0;
    for (;;) {
      const read = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (!read) break;
      bytes += read;
      hash.update(buffer.subarray(0, read));
    }
    return { bytes, sha256: hash.digest('hex') };
  } finally {
    fs.closeSync(fd);
  }
}

function normalizeTransferManifests({ obsManifest, obsRoot, sidekickManifest, repositoryRoot }) {
  exactKeys(obsManifest, ['schemaVersion', 'status', 'createdAt', 'purpose', 'source', 'totals', 'files', 'peDirectImportAnalysis', 'limitations'], 'OBS manifest');
  if (obsManifest.schemaVersion !== 1 || !Array.isArray(obsManifest.files)) fail('OBS manifest schema is unsupported');
  exactKeys(sidekickManifest, SIDEKICK_ROOT_KEYS, 'Sidekick manifest', ['effectiveTransfer', 'excludedFromGuest', 'guestTransfer']);
  if (sidekickManifest.schemaVersion !== 1 || !Array.isArray(sidekickManifest.files)) fail('Sidekick manifest schema is unsupported');
  const effectiveTransfer = sidekickManifest.effectiveTransfer;
  if (effectiveTransfer !== undefined) {
    exactKeys(effectiveTransfer, ['schemaVersion', 'pathMapping', 'rolePolicy', 'files'], 'Sidekick effectiveTransfer');
    if (effectiveTransfer.schemaVersion !== 1 || !Array.isArray(effectiveTransfer.files)) {
      fail('Sidekick effectiveTransfer schema is unsupported');
    }
  }
  if (sidekickManifest.excludedFromGuest !== undefined && !Array.isArray(sidekickManifest.excludedFromGuest)) fail('Sidekick excludedFromGuest must be an array');

  const publicKeyPolicy = loadPublicKeyExceptionPolicy();
  const verifiedPublicKeyTargets = new Set();
  let trustedObsManifestVerified = false;
  const effective = [];
  const excluded = [];
  const targets = new Set();
  const validateSourceEntry = (entry, sourceRoot, mapping, context) => {
    exactKeys(entry, mapping.role ? ['path', 'role', 'bytes', 'sha256'] : ['path', 'bytes', 'sha256'], `${context} entry`);
    const candidateTarget = mapping.map(entry.path, entry.role);
    const exceptionCandidate = PATH_EXCEPTIONS.get(String(candidateTarget || '').toLowerCase());
    const exception = exceptionCandidate && exceptionCandidate.path === candidateTarget ? exceptionCandidate : null;
    const isPublicKeyCandidate = context === 'OBS' && candidateTarget === publicKeyPolicy.entry.path && entry.path === publicKeyPolicy.entry.sourcePath;
    const sourcePath = safeRelativePathStructure(entry.path, false, isPublicKeyCandidate);
    if (mapping.role && typeof entry.role !== 'string') fail(`${context} role is invalid: ${sourcePath}`);
    const mapped = mapping.map(sourcePath, entry.role);
    if (!mapped) fail(`${context} has unknown path or role: ${sourcePath}`);
    const targetCandidate = safeRelativePathStructure(mapped, true, isPublicKeyCandidate);
    if (!exception && !isPublicKeyCandidate) safeRelativePath(targetCandidate);
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(entry.sha256)) {
      fail(`${context} size or SHA-256 is invalid: ${sourcePath}`);
    }
    const sourceFull = path.resolve(sourceRoot, ...sourcePath.split('/'));
    noReparseChain(path.resolve(sourceRoot), sourceFull);
    const stat = fs.statSync(sourceFull);
    if (!stat.isFile()) fail(`source is not a regular file: ${sourcePath}`);
    const actual = hashFile(sourceFull);
    if (actual.bytes !== entry.bytes || actual.sha256 !== entry.sha256.toLowerCase()) fail(`source hash drift: ${sourcePath}`);
    if (exception && (actual.bytes !== exception.bytes || actual.sha256 !== exception.sha256)) {
      fail(`trusted path exception metadata mismatch: ${candidateTarget}`);
    }
    if (isPublicKeyCandidate) {
      if (!trustedObsManifestVerified) {
        verifyTrustedObsManifest(obsManifest, obsRoot, repositoryRoot, publicKeyPolicy.policy);
        trustedObsManifestVerified = true;
      }
      if (actual.bytes !== publicKeyPolicy.entry.bytes || actual.sha256 !== publicKeyPolicy.entry.sha256) {
        fail(`trusted public-key exception metadata mismatch: ${candidateTarget}`);
      }
      const publicKeyBytes = fs.readFileSync(sourceFull);
      verifyPublicKeyBuffer(publicKeyBytes, publicKeyPolicy.entry);
      verifiedPublicKeyTargets.add(targetCandidate);
    }
    const target = safeRelativePath(targetCandidate, true, Boolean(exception), isPublicKeyCandidate);
    const folded = target.toLocaleLowerCase('en-US');
    if (targets.has(folded)) fail(`normalized target collision: ${target}`);
    targets.add(folded);
    effective.push({ path: target, bytes: actual.bytes, sha256: actual.sha256 });
  };

  for (const entry of obsManifest.files) {
    validateSourceEntry(entry, obsRoot, {
      map: (source) => /^(bin|data|obs-plugins)\//.test(source) ? `obs/${source}` : null,
    }, 'OBS');
  }

  const roleMap = new Map();
  const guestEntries = effectiveTransfer ? new Map() : null;
  if (guestEntries) {
    for (const entry of effectiveTransfer.files) {
      exactKeys(entry, ['path', 'bytes', 'sha256'], 'Sidekick effectiveTransfer file');
      const exceptionCandidate = PATH_EXCEPTIONS.get(typeof entry.path === 'string' ? entry.path.toLowerCase() : '');
      const exactException = exceptionCandidate && exceptionCandidate.path === entry.path;
      const target = exactException ? safeRelativePathStructure(entry.path) : safeRelativePath(entry.path);
      const folded = target.toLocaleLowerCase('en-US');
      if (guestEntries.has(folded)) fail(`duplicate guestTransfer target: ${target}`);
      guestEntries.set(folded, entry);
    }
  }
  const knownRoles = new Set([
    'bundled portable Node 22.14.0; ABI 127; selected runtime packages require no native addons',
    'guest loopback-only synthetic fixture server entrypoint',
    'pilot runtime source',
    'shared guest UUID, isolation receipt, loopback and evidence-path guard',
    'single Sidekick OBS pilot runner; never starts OBS; safe unique evidence path only',
    'Socket.IO browser client bundle for OBS Browser Source',
    'guest runtime stage contract helper',
    'Standalone browser client bundle served as /socket.io/socket.io.js; package source/runtime modules are not transferred.',
  ]);
  for (const entry of sidekickManifest.files) {
    if (!entry || typeof entry.path !== 'string' || typeof entry.role !== 'string') fail('Sidekick file entry path/role is invalid');
    const candidateSource = entry.path;
    const candidateTarget = candidateSource.startsWith('runtime/') ? candidateSource : `pilot/${candidateSource}`;
    const source = safeRelativePathStructure(entry.path, false);
    const knownExcluded = HOST_ONLY.get(source);
    if (knownExcluded) {
      const allowedRoles = new Set([
        'host-side source-contract reference; not guest runtime dependency',
        'host-side read-only exact-UUID VBoxManage isolation receipt producer; emits no raw config',
        'host-side in-process security and behavior tests; opens no listeners',
        'source-only regression tests for stage order, duplicate/stale events, counters, and cleanup',
      ]);
      if (!allowedRoles.has(entry.role)) fail(`host-only path has unexpected role: ${source}`);
      roleMap.set(source, knownExcluded);
      continue;
    }
    const isPackage = /^package .+@[^;]+; .+$/.test(entry.role);
    if (!isPackage && !knownRoles.has(entry.role) && !(source === 'app/node_modules/socket.io-client/dist/socket.io.js' && entry.transferredAsStandaloneFile === true && entry.role === 'Standalone browser client bundle served as /socket.io/socket.io.js; package source/runtime modules are not transferred.')) {
      fail(`Sidekick manifest has unknown role: ${entry.role} (${source})`);
    }
    let target = null;
    if (isPackage || entry.role === 'pilot runtime source' ||
        entry.role === 'guest loopback-only synthetic fixture server entrypoint' ||
        entry.role === 'single Sidekick OBS pilot runner; never starts OBS; safe unique evidence path only' ||
        entry.role === 'shared guest UUID, isolation receipt, loopback and evidence-path guard' ||
        entry.role === 'Socket.IO browser client bundle for OBS Browser Source' || entry.role === 'guest runtime stage contract helper' || knownRoles.has(entry.role)) {
      if (source === 'runtime/node/node.exe' && entry.role === 'bundled portable Node 22.14.0; ABI 127; selected runtime packages require no native addons') target = source;
      else if (source.startsWith('app/')) target = `pilot/${source}`;
      else if (source.startsWith('scripts/')) target = `pilot/${source}`;
    } else if (entry.role === 'bundled portable Node 22.14.0; ABI 127; selected runtime packages require no native addons' && source === 'runtime/node/node.exe') {
      target = source;
    }
    if (!target) fail(`Sidekick manifest has unknown role or unmapped root: ${entry.role} (${source})`);
    roleMap.set(source, { kind: 'effective', target });
    const sourceEntry = { path: entry.path, role: entry.role, bytes: entry.bytes, sha256: entry.sha256 };
    if (guestEntries) {
      const declared = guestEntries.get(target.toLocaleLowerCase('en-US'));
      if (!declared) fail(`effective target missing from effectiveTransfer allowlist: ${target}`);
      if (declared.bytes !== entry.bytes || declared.sha256.toLowerCase() !== entry.sha256.toLowerCase()) fail(`effectiveTransfer metadata differs from source entry: ${target}`);
      guestEntries.delete(target.toLocaleLowerCase('en-US'));
    }
    validateSourceEntry(sourceEntry, repositoryRoot, { role: true, map: () => target }, 'Sidekick');
  }
  if (guestEntries && guestEntries.size) {
    fail(`effectiveTransfer allowlist contains targets without a source record: ${[...guestEntries.values()][0].path}`);
  } else {
    for (const [source, details] of roleMap) if (details.kind !== 'effective') excluded.push({ path: source, reason: details });
  }
  if (sidekickManifest.excludedFromGuest) {
    const excludedPaths = new Set(sidekickManifest.excludedFromGuest.map((entry) => {
      exactKeys(entry, ['path', 'role', 'reason'], 'Sidekick excludedFromGuest entry');
      return safeRelativePath(entry.path, false);
    }));
    const expectedExcluded = new Set([...roleMap].filter(([, info]) => info.kind !== 'effective').map(([source]) => source));
    if (excludedPaths.size !== expectedExcluded.size || [...expectedExcluded].some((item) => !excludedPaths.has(item))) fail('excludedFromGuest does not exactly match the four recognized host-only records');
  }

  effective.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  const manifest = validateHelperManifestInternal({ schemaVersion: 1, files: effective }, verifiedPublicKeyTargets);
  const canonical = JSON.stringify(manifest);
  const manifestSha256 = crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
  return {
    status: 'dry-run-only-normalization-verified',
    manifest,
    manifestSha256,
    files: effective.length,
    bytes: effective.reduce((sum, file) => sum + file.bytes, 0),
    excluded,
  };
}

module.exports = { normalizeTransferManifests, safeRelativePath, validateHelperManifest };

if (require.main === module) {
  const repositoryRoot = path.resolve(__dirname, '../..');
  const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8'));
  try {
    const result = normalizeTransferManifests({
      obsManifest: readJson('docs/coordination/obs-portable-transfer-manifest.json'),
      obsRoot: 'C:/Program Files/obs-studio',
      sidekickManifest: readJson('docs/coordination/obs-sidekick-pilot-transfer-manifest.json'),
      repositoryRoot,
    });
    process.stdout.write(`${JSON.stringify({
      status: result.status,
      files: result.files,
      bytes: result.bytes,
      manifestSha256: result.manifestSha256,
      excluded: result.excluded,
    }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`dry-run rejected: ${error.message}\n`);
    process.exitCode = 1;
  }
}
