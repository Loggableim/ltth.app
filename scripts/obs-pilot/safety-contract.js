'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const HOST = '127.0.0.1';
const DEFAULT_PORT = 8765;
const ROOT = path.resolve(__dirname, '../..');
const EXPECTED_VM_UUID = '1d436b46-6288-4c8c-8270-30df1e527329';
const RECEIPT_MAX_AGE_MS = 30 * 60 * 1000;
const RECEIPT_FUTURE_SKEW_MS = 2 * 60 * 1000;
const VERIFIED_RECEIPTS = new WeakSet();

function localObsUrl(value = 'ws://127.0.0.1:4455') {
  let url;
  try { url = new URL(value); } catch (_) { throw new Error('OBS pilot accepts only ws://127.0.0.1'); }
  if (url.protocol !== 'ws:' || url.hostname !== HOST || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('OBS pilot accepts only a plain loopback OBS WebSocket URL');
  }
  return url.toString();
}

function validateIsolationReceipt(receipt, { nowMs = Date.now(), maxAgeMs = RECEIPT_MAX_AGE_MS } = {}) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) throw new Error('A verified guest isolation receipt is required');
  if (receipt.vmPowerState !== 'running') throw new Error('A powered-off preboot receipt cannot start the pilot fixture; a fresh running-VM receipt is required');
  const expected = {
    schemaVersion: 1,
    vmUuid: EXPECTED_VM_UUID,
    vmPowerState: receipt.vmPowerState,
    networkAdaptersDisabled: true,
    sharedFoldersDisabled: true,
    clipboardDisabled: true,
    dragAndDropDisabled: true,
    usbDisabled: true,
    clipboardFileTransfersDisabled: true,
    vrdeDisabled: true
  };
  for (const [key, value] of Object.entries(expected)) {
    if (receipt[key] !== value) throw new Error(`Guest isolation receipt is missing required field: ${key}`);
  }
  const allowedKeys = new Set([...Object.keys(expected), 'observedAtUtc', 'evidenceSource', 'showvminfoSha256', 'hostReviewEvidenceSha256']);
  if (Object.keys(receipt).some((key) => !allowedKeys.has(key))) throw new Error('Guest isolation receipt contains unsupported fields');
  const observedAt = Date.parse(receipt.observedAtUtc);
  if (typeof receipt.observedAtUtc !== 'string' || !Number.isFinite(observedAt)) throw new Error('Guest isolation receipt timestamp is invalid');
  if (observedAt > nowMs + RECEIPT_FUTURE_SKEW_MS) throw new Error('Guest isolation receipt timestamp is in the future');
  if (nowMs - observedAt > maxAgeMs) throw new Error('Guest isolation receipt is stale; this pilot session cannot proceed');
  if (receipt.evidenceSource !== 'host-vboxmanage-showvminfo') throw new Error('Guest isolation receipt source must be generated from raw host showvminfo');
  if (typeof receipt.showvminfoSha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(receipt.showvminfoSha256)) throw new Error('Guest isolation receipt has no raw showvminfo SHA-256');
  if (typeof receipt.hostReviewEvidenceSha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(receipt.hostReviewEvidenceSha256)) throw new Error('Guest isolation receipt has no structured host review evidence SHA-256');
  return Object.fromEntries(Object.keys(expected).concat(['observedAtUtc', 'evidenceSource', 'showvminfoSha256', 'hostReviewEvidenceSha256']).map((key) => [key, receipt[key]]));
}

function readIsolationReceipt(filePath, { expectedFileSha256 } = {}) {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw new Error('Isolation receipt path must be absolute');
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16384) throw new Error('Isolation receipt must be a small regular file');
  if (typeof expectedFileSha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(expectedFileSha256)) throw new Error('CEO-reviewed receipt file SHA-256 must be supplied separately');
  const raw = fs.readFileSync(filePath);
  const actualFileHash = crypto.createHash('sha256').update(raw).digest('hex');
  if (actualFileHash !== expectedFileSha256.toLowerCase()) throw new Error('Isolation receipt file does not match the separately reviewed SHA-256');
  const verified = {
    ...validateIsolationReceipt(JSON.parse(raw.toString('utf8'))),
    receiptFileSha256: actualFileHash
  };
  VERIFIED_RECEIPTS.add(verified);
  return verified;
}

function isVerifiedIsolationReceipt(receipt) {
  return Boolean(receipt && typeof receipt === 'object' && VERIFIED_RECEIPTS.has(receipt));
}

function validateEvidenceDirectoryPath(directoryPath) {
  if (typeof directoryPath !== 'string' || !path.isAbsolute(directoryPath)) throw new Error('Pilot evidence directory must be an absolute path');
  const target = path.resolve(directoryPath);
  const targetRoot = path.parse(target).root;
  const checkoutRoot = path.parse(ROOT).root;
  if (!targetRoot || targetRoot.startsWith('\\\\') || targetRoot.toLowerCase() !== checkoutRoot.toLowerCase()) {
    throw new Error('Pilot evidence must stay on the guest local drive');
  }
  const relative = path.relative(ROOT, target);
  if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
    throw new Error('Pilot evidence must be outside the repository checkout');
  }
  if (!/^ltth-sidekick-obs-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$/i.test(path.basename(target))) {
    throw new Error('Pilot evidence directory must use the unique ltth-sidekick-obs-UTC-random name');
  }
  if (fs.existsSync(target)) throw new Error('Pilot evidence directory already exists; refusing to overwrite');
  if (!fs.existsSync(path.dirname(target)) || !fs.statSync(path.dirname(target)).isDirectory()) {
    throw new Error('Pilot evidence parent directory must already exist');
  }
  const realParent = fs.realpathSync(path.dirname(target));
  const realRelative = path.relative(fs.realpathSync(ROOT), realParent);
  if (realRelative === '' || (!realRelative.startsWith(`..${path.sep}`) && realRelative !== '..' && !path.isAbsolute(realRelative))) {
    throw new Error('Pilot evidence parent resolves inside the repository checkout');
  }
  return target;
}

module.exports = { DEFAULT_PORT, EXPECTED_VM_UUID, HOST, RECEIPT_FUTURE_SKEW_MS, RECEIPT_MAX_AGE_MS, ROOT, isVerifiedIsolationReceipt, localObsUrl, readIsolationReceipt, validateEvidenceDirectoryPath, validateIsolationReceipt };
