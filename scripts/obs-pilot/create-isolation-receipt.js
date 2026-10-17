'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { EXPECTED_VM_UUID, ROOT } = require('./safety-contract');

const DEFAULT_VBOXMANAGE = 'C:\\Program Files\\Oracle\\VirtualBox\\VBoxManage.exe';
const REQUIRED_VALUES = Object.freeze({
  VMState: 'poweroff',
  clipboard: 'disabled',
  clipboardfiletransfers: 'disabled',
  draganddrop: 'disabled',
  usb: 'off',
  vrde: 'off'
});

function parseMachineReadable(text) {
  const values = new Map();
  for (const line of String(text).split(/\r?\n/)) {
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    let value = rawValue;
    if (rawValue.startsWith('"')) {
      try { value = JSON.parse(rawValue); } catch (_) { throw new Error(`Malformed VBoxManage value for ${key}`); }
    }
    values.set(key, String(value));
  }
  return values;
}

function validateMachineInfo(values) {
  if (!(values instanceof Map)) throw new TypeError('Parsed VBoxManage machine information is required');
  if (String(values.get('UUID') || '').toLowerCase() !== EXPECTED_VM_UUID) throw new Error('VBoxManage returned a different VM UUID');
  const vmPowerState = values.get('VMState');
  if (vmPowerState !== 'running') throw new Error('Isolation receipt requires the exact OBS pilot VM to be running');
  for (const [key, expected] of Object.entries(REQUIRED_VALUES)) {
    if (key === 'VMState') continue;
    if (values.get(key) !== expected) throw new Error(`Own OBS pilot VM must have ${key}=${expected}`);
  }
  for (let adapter = 1; adapter <= 8; adapter += 1) {
    if (values.get(`nic${adapter}`) !== 'none') throw new Error(`Own OBS pilot VM nic${adapter} is not disabled`);
  }
  for (const [key, value] of values) {
    if (/^sharedfolder/i.test(key) && value.trim()) throw new Error('Own OBS pilot VM must not have any shared folders');
  }
  return {
    schemaVersion: 1,
    vmUuid: EXPECTED_VM_UUID,
    vmPowerState,
    networkAdaptersDisabled: true,
    sharedFoldersDisabled: true,
    clipboardDisabled: true,
    clipboardFileTransfersDisabled: true,
    dragAndDropDisabled: true,
    usbDisabled: true,
    vrdeDisabled: true
  };
}

function validateExternalJsonPath(outputPath, basenamePattern, kind) {
  if (typeof outputPath !== 'string' || !path.isAbsolute(outputPath)) throw new Error(`${kind} output path must be absolute`);
  const target = path.resolve(outputPath);
  const checkoutRelative = path.relative(path.resolve(ROOT), target);
  if (checkoutRelative === '' || (!checkoutRelative.startsWith(`..${path.sep}`) && checkoutRelative !== '..' && !path.isAbsolute(checkoutRelative))) {
    throw new Error(`${kind} must be staged outside the repository checkout`);
  }
  const root = path.parse(target).root;
  if (!root || root.startsWith('\\\\')) throw new Error(`${kind} must stay on a local drive, not a UNC path`);
  if (!basenamePattern.test(path.basename(target))) throw new Error(`${kind} output must use its unique UTC-random filename`);
  if (fs.existsSync(target)) throw new Error(`${kind} output already exists; refusing to overwrite`);
  if (!fs.existsSync(path.dirname(target)) || !fs.statSync(path.dirname(target)).isDirectory()) throw new Error(`${kind} parent directory must already exist`);
  const realParent = fs.realpathSync(path.dirname(target));
  const realRelative = path.relative(fs.realpathSync(ROOT), realParent);
  if (realRelative === '' || (!realRelative.startsWith(`..${path.sep}`) && realRelative !== '..' && !path.isAbsolute(realRelative))) {
    throw new Error(`${kind} parent resolves inside the repository checkout`);
  }
  return target;
}

function validateOutputPath(outputPath) {
  return validateExternalJsonPath(outputPath, /^ltth-obs-isolation-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}\.json$/i, 'Receipt');
}

function validateHostEvidencePath(outputPath) {
  return validateExternalJsonPath(outputPath, /^ltth-obs-host-review-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}\.json$/i, 'Host review evidence');
}

function writeExclusive(target, content) {
  const descriptor = fs.openSync(target, 'wx', 0o600);
  try { fs.writeFileSync(descriptor, content); fs.fsyncSync(descriptor); }
  finally { fs.closeSync(descriptor); }
}

function collectIsolationReceipt({ outputPath, hostEvidencePath, vboxManagePath = DEFAULT_VBOXMANAGE, run = spawnSync, now = new Date() } = {}) {
  const target = validateOutputPath(outputPath);
  const hostEvidenceTarget = validateHostEvidencePath(hostEvidencePath);
  if (target.toLowerCase() === hostEvidenceTarget.toLowerCase()) throw new Error('Receipt and host review evidence must be separate files');
  if (typeof vboxManagePath !== 'string' || !path.isAbsolute(vboxManagePath)) throw new Error('VBoxManage executable path must be absolute');
  const result = run(vboxManagePath, ['showvminfo', EXPECTED_VM_UUID, '--machinereadable'], {
    cwd: path.dirname(vboxManagePath),
    encoding: 'buffer',
    timeout: 15000,
    maxBuffer: 64 * 1024,
    windowsHide: true
  });
  if (result.error || result.status !== 0 || !Buffer.isBuffer(result.stdout)) {
    const code = result.error?.code || `EXIT_${result.status === null ? 'UNKNOWN' : result.status}`;
    throw new Error(`Read-only VBoxManage isolation check failed (${code})`);
  }
  const machineInfo = parseMachineReadable(result.stdout.toString('utf8'));
  const proof = validateMachineInfo(machineInfo);
  const showvminfoSha256 = crypto.createHash('sha256').update(result.stdout).digest('hex');
  const sharedFolderCount = [...machineInfo].filter(([key, value]) => /^sharedfolder/i.test(key) && value.trim()).length;
  const hostEvidence = {
    schemaVersion: 1,
    evidenceSource: 'host-vboxmanage-showvminfo-parsed-fields',
    observedAtUtc: now.toISOString(),
    vmUuid: proof.vmUuid,
    vmPowerState: proof.vmPowerState,
    networkAdapterModes: Object.fromEntries(Array.from({ length: 8 }, (_, index) => [`nic${index + 1}`, machineInfo.get(`nic${index + 1}`)])),
    sharedFolderCount,
    hostIntegration: {
      clipboard: machineInfo.get('clipboard'),
      clipboardFileTransfers: machineInfo.get('clipboardfiletransfers'),
      dragAndDrop: machineInfo.get('draganddrop'),
      usb: machineInfo.get('usb'),
      vrde: machineInfo.get('vrde')
    },
    rawShowvminfoSha256: showvminfoSha256
  };
  const hostEvidenceContent = Buffer.from(`${JSON.stringify(hostEvidence, null, 2)}\n`, 'utf8');
  writeExclusive(hostEvidenceTarget, hostEvidenceContent);
  const receipt = {
    ...proof,
    observedAtUtc: now.toISOString(),
    evidenceSource: 'host-vboxmanage-showvminfo',
    showvminfoSha256,
    hostReviewEvidenceSha256: crypto.createHash('sha256').update(hostEvidenceContent).digest('hex')
  };
  const content = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  writeExclusive(target, content);
  receipt.receiptFileSha256 = crypto.createHash('sha256').update(content).digest('hex');
  receipt.hostReviewEvidenceFileSha256 = crypto.createHash('sha256').update(hostEvidenceContent).digest('hex');
  return receipt;
}

function main(argv = process.argv.slice(2)) {
  if (argv.length !== 4 || argv[0] !== '--output' || argv[2] !== '--host-evidence') {
    throw new Error('Usage: create-isolation-receipt.js --output <unique-receipt.json> --host-evidence <private-structured-review.json>');
  }
  const receipt = collectIsolationReceipt({ outputPath: argv[1], hostEvidencePath: argv[3] });
  process.stdout.write(`Read-only isolation receipt written; receipt SHA-256 ${receipt.receiptFileSha256}; host review SHA-256 ${receipt.hostReviewEvidenceFileSha256}; raw showvminfo SHA-256 ${receipt.showvminfoSha256}\n`);
}

if (require.main === module) {
  try { main(); }
  catch (error) {
    process.stderr.write(`Isolation receipt was not created: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { DEFAULT_VBOXMANAGE, parseMachineReadable, validateMachineInfo, validateOutputPath, validateHostEvidencePath, collectIsolationReceipt };
