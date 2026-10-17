'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createPilotFixture, HOST } = require('../fixture-host');
const {
  EXPECTED_VM_UUID,
  LOCALE_QUERY,
  atomicCreateFile,
  finalizePilotResult,
  localObsUrl,
  readIsolationReceipt,
  runPilot,
  safeError,
  validateEvidenceDirectoryPath,
  validateHudAsset,
  validateIsolationReceipt
} = require('../run-pilot');
const { collectIsolationReceipt, parseMachineReadable, validateMachineInfo } = require('../create-isolation-receipt');

function fakeResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: Buffer.alloc(0),
    writeHead(code, headers) { this.statusCode = code; Object.assign(this.headers, headers); },
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(value) { this.body = Buffer.from(value || ''); }
  };
}

async function request(fixture, method, url) {
  const res = fakeResponse();
  fixture.handleHttp({ method, url }, res);
  return { ...res, json: res.body.length ? JSON.parse(res.body.toString('utf8')) : null };
}

function validReceipt() {
  return {
    schemaVersion: 1,
    vmUuid: EXPECTED_VM_UUID,
    vmPowerState: 'running',
    networkAdaptersDisabled: true,
    sharedFoldersDisabled: true,
    clipboardDisabled: true,
    dragAndDropDisabled: true,
    usbDisabled: true,
    clipboardFileTransfersDisabled: true,
    vrdeDisabled: true,
    observedAtUtc: new Date().toISOString(),
    evidenceSource: 'host-vboxmanage-showvminfo',
    showvminfoSha256: 'a'.repeat(64),
    hostReviewEvidenceSha256: 'b'.repeat(64)
  };
}

test('fixture only serves bounded synthetic API routes and rejects other methods and paths', async () => {
  const fixture = createPilotFixture();
  const failedStatus = await request(fixture, 'GET', '/api/sidekick/public-status');
  assert.equal(failedStatus.statusCode, 503);
  assert.equal(failedStatus.json.success, false);

  const status = await request(fixture, 'GET', '/api/sidekick/public-status');
  assert.equal(status.statusCode, 200);
  assert.deepEqual(Object.keys(status.json.status).sort(), ['activeViewers', 'chatsPerMinute', 'connected', 'muted', 'totalFollows', 'totalGifts']);

  const events = await request(fixture, 'GET', '/api/sidekick/public-events?limit=9999');
  assert.equal(events.statusCode, 200);
  assert.equal(events.json.events.length, 2);
  assert.doesNotMatch(JSON.stringify(events.json), /uid|apiKey|private|token/i);

  const deniedMethod = await request(fixture, 'POST', '/api/sidekick/public-status');
  assert.equal(deniedMethod.statusCode, 405);
  assert.equal(deniedMethod.headers.allow, 'GET');
  const deniedPath = await request(fixture, 'GET', '/api/sidekick/config');
  assert.equal(deniedPath.statusCode, 404);
  assert.equal(fixture.getStats().deniedRequests, 2);
  assert.equal(fixture.getStats().statusFailures, 1);
  assert.equal(fixture.getStats().statusSuccesses, 1);
  assert.equal(fixture.getStats().eventSuccesses, 1);
  assert.equal(fixture.getAddress(), null);
});

test('Socket.IO handler returns only current synthetic public status and only on the explicit request event', () => {
  const fixture = createPilotFixture({ failFirstStatus: false });
  let connectionHandler;
  const io = { on(event, handler) { assert.equal(event, 'connection'); connectionHandler = handler; } };
  fixture.attachSocket(io);
  const handlers = new Map();
  const emitted = [];
  connectionHandler({ on: (event, handler) => handlers.set(event, handler), emit: (...args) => emitted.push(args) });

  assert.deepEqual([...handlers.keys()].sort(), ['disconnect', 'sidekick:public-status:request']);
  assert.equal(fixture.getActiveSocketClients(), 1);
  assert.equal(fixture.getStats().socketConnections, 1);
  handlers.get('sidekick:public-status:request')();
  assert.equal(emitted.length, 0);
  fixture.setSocketStatusEnabled(true);
  handlers.get('sidekick:public-status:request')();
  assert.equal(emitted[0][0], 'sidekick:public-status');
  assert.deepEqual(Object.keys(emitted[0][1]).sort(), ['activeViewers', 'chatsPerMinute', 'connected', 'muted', 'totalFollows', 'totalGifts']);
  assert.doesNotMatch(JSON.stringify(emitted), /uid|apiKey|private|token/i);
  assert.deepEqual(fixture.getSocketStatusEvents(), [emitted[0][1]]);

  fixture.advancePhase(2);
  handlers.get('sidekick:public-status:request')();
  assert.equal(emitted.at(-1)[1].connected, false);
  assert.equal(fixture.getStats().socketRequests, 3);
  handlers.get('disconnect')();
  assert.equal(fixture.getActiveSocketClients(), 0);
});

test('records only status payloads actually delivered through the synthetic public socket', () => {
  const fixture = createPilotFixture({ failFirstStatus: false });
  fixture.advancePhase(1);
  fixture.setSocketStatusEnabled(true);
  assert.deepEqual(fixture.getSocketStatusEvents(), []);
  let handler;
  fixture.attachSocket({ on: (event, callback) => { assert.equal(event, 'connection'); handler = callback; } });
  const events = new Map();
  const delivered = [];
  handler({
    on: (event, callback) => events.set(event, callback),
    emit: (event, payload) => delivered.push({ event, payload })
  });
  events.get('sidekick:public-status:request')();
  assert.equal(delivered.length, 1);
  assert.equal(delivered[0].payload.muted, true);
  assert.deepEqual(fixture.getSocketStatusEvents(), [delivered[0].payload]);
});

test('live listener refuses to start without a separately hash-verified receipt object', async () => {
  const fixture = createPilotFixture();
  try {
    await assert.rejects(fixture.start(), /separately hash-verified isolation receipt/);
    assert.equal(fixture.getAddress(), null);
  } finally {
    await fixture.close();
  }
});

test('OBS and evidence destinations are constrained before the runner can start', () => {
  assert.equal(localObsUrl('ws://127.0.0.1:4455'), 'ws://127.0.0.1:4455/');
  assert.throws(() => localObsUrl('ws://192.0.2.1:4455'), /loopback/);
  assert.throws(() => localObsUrl('wss://127.0.0.1:4455'), /plain loopback/);
  assert.throws(() => localObsUrl('ws://user:pass@127.0.0.1:4455'), /plain loopback/);

  const tempParent = fs.realpathSync(os.tmpdir());
  const safe = path.join(tempParent, `ltth-sidekick-obs-20261007T010203Z-${'a'.repeat(8)}`);
  assert.equal(validateEvidenceDirectoryPath(safe), path.resolve(safe));
  assert.throws(() => validateEvidenceDirectoryPath(path.join(__dirname, 'ltth-sidekick-obs-20261007T010203Z-aaaaaaaa')), /outside the repository/);
  assert.throws(() => validateEvidenceDirectoryPath(path.join(tempParent, 'evidence')), /unique ltth-sidekick-obs/);
  assert.throws(() => validateEvidenceDirectoryPath(path.win32.join('\\\\server\\share', 'ltth-sidekick-obs-20261007T010203Z-aaaaaaaa')), /guest local drive/);
});

test('guest receipt is strict and excludes arbitrary credential-bearing fields', () => {
  assert.equal(validateIsolationReceipt(validReceipt()).vmUuid, EXPECTED_VM_UUID);
  assert.throws(() => validateIsolationReceipt({ ...validReceipt(), networkAdaptersDisabled: false }), /networkAdaptersDisabled/);
  assert.throws(() => validateIsolationReceipt({ ...validReceipt(), password: 'must-not-be-here' }), /unsupported fields/);
});

test('host receipt producer accepts only current read-only machine information for the exact running isolated VM', () => {
  const info = [
    `UUID="${EXPECTED_VM_UUID}"`,
    'VMState="poweroff"',
    ...Array.from({ length: 8 }, (_, index) => `nic${index + 1}="none"`),
    'clipboard="disabled"',
    'clipboardfiletransfers="disabled"',
    'draganddrop="disabled"',
    'usb="off"',
    'vrde="off"',
    'SharedFolderNameMachineMapping1=""'
  ].join('\n');
  const values = parseMachineReadable(info);
  assert.throws(() => validateMachineInfo(values), /requires the exact OBS pilot VM to be running/);
  const runningInfo = info.replace('VMState="poweroff"', 'VMState="running"');
  assert.equal(validateMachineInfo(parseMachineReadable(runningInfo)).vmPowerState, 'running');
  assert.throws(() => validateMachineInfo(parseMachineReadable(info.replace('VMState="poweroff"', 'VMState="saved"'))), /requires the exact OBS pilot VM to be running/);
  assert.throws(() => validateMachineInfo(parseMachineReadable(runningInfo.replace('nic1="none"', 'nic1="nat"'))), /nic1 is not disabled/);
  assert.throws(() => validateMachineInfo(parseMachineReadable(runningInfo.replace('SharedFolderNameMachineMapping1=""', 'SharedFolderNameMachineMapping1="host-share"'))), /shared folders/);
});

test('host receipt emits sanitized parsed-field evidence and guest accepts the fresh running snapshot', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-obs-isolation-'));
  const outputPath = path.join(directory, 'ltth-obs-isolation-20261007T010203Z-aaaaaaaa.json');
  const hostEvidencePath = path.join(directory, 'ltth-obs-host-review-20261007T010203Z-aaaaaaaa.json');
  const raw = Buffer.from([
    `UUID="${EXPECTED_VM_UUID}"`, 'VMState="running"',
    ...Array.from({ length: 8 }, (_, index) => `nic${index + 1}="none"`),
    'clipboard="disabled"', 'clipboardfiletransfers="disabled"', 'draganddrop="disabled"', 'usb="off"', 'vrde="off"'
  ].join('\r\n'));
  try {
    let called = false;
    const receipt = collectIsolationReceipt({
      outputPath,
      hostEvidencePath,
      vboxManagePath: path.join(directory, 'VBoxManage.exe'),
      now: new Date(),
      run(executable, args, options) {
        called = true;
        assert.equal(executable, path.join(directory, 'VBoxManage.exe'));
        assert.deepEqual(args, ['showvminfo', EXPECTED_VM_UUID, '--machinereadable']);
        assert.equal(options.encoding, 'buffer');
        return { status: 0, stdout: raw, stderr: Buffer.alloc(0) };
      }
    });
    assert.equal(called, true);
    assert.equal(receipt.showvminfoSha256, require('node:crypto').createHash('sha256').update(raw).digest('hex'));
    const hostReview = JSON.parse(fs.readFileSync(hostEvidencePath, 'utf8'));
    assert.equal(hostReview.vmUuid, EXPECTED_VM_UUID);
    assert.equal(hostReview.vmPowerState, 'running');
    assert.deepEqual(Object.values(hostReview.networkAdapterModes), Array(8).fill('none'));
    assert.equal(hostReview.sharedFolderCount, 0);
    assert.doesNotMatch(JSON.stringify(hostReview), /[A-Z]:\\\\|password|cookie|token/i);
    assert.equal(receipt.vmPowerState, 'running');

    assert.equal(readIsolationReceipt(outputPath, { expectedFileSha256: receipt.receiptFileSha256 }).vmPowerState, 'running');
    assert.throws(() => readIsolationReceipt(outputPath), /supplied separately/);
    assert.throws(() => readIsolationReceipt(outputPath, { expectedFileSha256: 'b'.repeat(64) }), /does not match/);
    assert.throws(() => collectIsolationReceipt({ outputPath, hostEvidencePath, run: () => { throw new Error('must not run on collision'); } }), /already exists/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('guest rejects stale, future-dated and self-asserted isolation receipts', () => {
  const nowMs = Date.parse('2026-10-07T01:10:00.000Z');
  const recentReceipt = { ...validReceipt(), observedAtUtc: '2026-10-07T01:09:00.000Z' };
  assert.throws(() => validateIsolationReceipt({ ...validReceipt(), observedAtUtc: '2026-10-07T00:00:00.000Z' }, { nowMs }), /stale/);
  assert.throws(() => validateIsolationReceipt({ ...recentReceipt, observedAtUtc: '2026-10-07T01:13:00.000Z' }, { nowMs }), /future/);
  assert.throws(() => validateIsolationReceipt({ ...recentReceipt, evidenceSource: 'manual-claim' }, { nowMs }), /raw host showvminfo/);
});

test('receipt sidecar transfer contract rejects missing path, wrong UUID/hash, stale data and isolation drift', async () => {
  await assert.rejects(runPilot({ environment: {} }), /path must be absolute/);

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-obs-receipt-sidecar-'));
  const receiptPath = path.join(directory, 'receipt.json');
  const writeReceipt = (receipt) => {
    const bytes = Buffer.from(`${JSON.stringify(receipt)}\n`);
    fs.writeFileSync(receiptPath, bytes);
    return require('node:crypto').createHash('sha256').update(bytes).digest('hex');
  };
  try {
    const valid = validReceipt();
    const expectedHash = writeReceipt(valid);
    assert.equal(readIsolationReceipt(receiptPath, { expectedFileSha256: expectedHash }).vmUuid, EXPECTED_VM_UUID);

    const wrongUuidHash = writeReceipt({ ...valid, vmUuid: '11111111-1111-4111-8111-111111111111' });
    assert.throws(() => readIsolationReceipt(receiptPath, { expectedFileSha256: wrongUuidHash }), /vmUuid/);

    writeReceipt(valid);
    assert.throws(() => readIsolationReceipt(receiptPath, { expectedFileSha256: '0'.repeat(64) }), /does not match/);

    const staleHash = writeReceipt({ ...valid, observedAtUtc: '2026-10-01T00:00:00.000Z' });
    assert.throws(() => readIsolationReceipt(receiptPath, { expectedFileSha256: staleHash }), /stale/);

    for (const flag of [
      'networkAdaptersDisabled',
      'sharedFoldersDisabled',
      'clipboardDisabled',
      'dragAndDropDisabled',
      'usbDisabled',
      'clipboardFileTransfersDisabled',
      'vrdeDisabled'
    ]) {
      const isolationDriftHash = writeReceipt({ ...valid, [flag]: false });
      assert.throws(() => readIsolationReceipt(receiptPath, { expectedFileSha256: isolationDriftHash }), new RegExp(flag));
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('capture completion stays pending for image review and fails closed on cleanup or visually identical renders', () => {
  const captures = Array.from({ length: 5 }, (_, index) => ({
    stage: ['status-unavailable', 'status-recovered', 'muted', 'disconnected', 'reconnected'][index],
    stageContract: { stage: ['status-unavailable', 'status-recovered', 'muted', 'disconnected', 'reconnected'][index] },
    visible: true,
    restored: true,
    temporaryInputRemoved: true,
    temporarySceneItemRemoved: true,
    initialSceneItems: [],
    restoredSceneItems: [],
    sourcePng: { sha256: String(index).repeat(64) }
  }));
  const clean = { status: 'started', captures, stageContract: { stagesVerified: 5 }, cleanup: { obsDisconnected: true, fixtureClosed: true, tutorialSceneRestored: true }, error: null };
  assert.equal(finalizePilotResult(clean).status, 'capture-complete-review-pending');
  assert.equal(clean.review.status, 'pending-independent-image-review');

  const cleanupFailure = { status: 'started', captures, stageContract: { stagesVerified: 5 }, cleanup: { obsDisconnected: false, fixtureClosed: true, tutorialSceneRestored: true }, error: null };
  assert.equal(finalizePilotResult(cleanupFailure).status, 'failed');
  assert.equal(cleanupFailure.error.code, 'CLEANUP_NOT_VERIFIED');

  const unchanged = captures.map((capture) => ({ ...capture, sourcePng: { sha256: 'f'.repeat(64) } }));
  const semanticFailure = { status: 'started', captures: unchanged, stageContract: { stagesVerified: 5 }, cleanup: { obsDisconnected: true, fixtureClosed: true, tutorialSceneRestored: true }, error: null };
  assert.equal(finalizePilotResult(semanticFailure).status, 'failed');
  assert.equal(semanticFailure.error.code, 'CAPTURE_CONTRACT_FAILED');

  const missingStageContracts = { status: 'started', captures, cleanup: { obsDisconnected: true, fixtureClosed: true, tutorialSceneRestored: true }, error: null };
  assert.equal(finalizePilotResult(missingStageContracts).status, 'failed');
  assert.equal(missingStageContracts.error.code, 'CAPTURE_CONTRACT_FAILED');
});

test('HUD has only same-origin local client assets and connection URL validation stays loopback-only', () => {
  const hud = validateHudAsset();
  assert.ok(hud.bytes > 1000);
  assert.match(hud.sha256, /^[a-f0-9]{64}$/);
  assert.equal(HOST, '127.0.0.1');
});

test('Sidekick source manifest separates the fail-closed guest transfer from retained source provenance', () => {
  const manifestPath = path.resolve(__dirname, '../../../docs/coordination/obs-sidekick-pilot-transfer-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const allowedRoles = new Set([
    'pilot runtime source',
    'bundled portable Node 22.14.0; ABI 127; selected runtime packages require no native addons',
    'guest loopback-only synthetic fixture server entrypoint',
    'single Sidekick OBS pilot runner; never starts OBS; safe unique evidence path only',
    'shared guest UUID, isolation receipt, loopback and evidence-path guard',
    'guest runtime stage contract helper',
    'Socket.IO browser client bundle for OBS Browser Source'
  ]);
  const isTransferable = file => file.role.startsWith('package ') || allowedRoles.has(file.role);
  const sourceEntries = manifest.files;
  const expectedEntries = sourceEntries.filter(isTransferable);
  const transfer = manifest.effectiveTransfer;

  assert.equal(transfer.schemaVersion, 1);
  assert.deepEqual(transfer.files, expectedEntries.map(file => ({
    path: file.path.startsWith('runtime/') ? file.path : `pilot/${file.path}`,
    bytes: file.bytes,
    sha256: file.sha256
  })));
  assert.deepEqual(manifest.excludedFromGuest.map(file => file.path).sort(), [
    'app/plugins/sidekick/test/pilot-public-overlay-harness.test.js',
    'scripts/obs-pilot/create-isolation-receipt.js',
    'scripts/obs-pilot/test/contract.test.js',
    'scripts/obs-pilot/test/stage-contract.test.js'
  ]);
  for (const excluded of manifest.excludedFromGuest) {
    const source = sourceEntries.find(file => file.path === excluded.path);
    assert.ok(source, `excluded source provenance missing: ${excluded.path}`);
    assert.equal(transfer.files.some(file => file.path.endsWith(excluded.path)), false);
  }
  assert.equal(sourceEntries.every(file => isTransferable(file) === transfer.files.some(candidate => candidate.path.endsWith(file.path))), true);
  assert.equal(manifest.sourceProvenance.socketIoClientBundle.name, 'socket.io-client');
  assert.equal(manifest.sourceProvenance.socketIoClientBundle.version, '4.8.3');
  assert.equal(manifest.sourceProvenance.socketIoClientBundle.transferredAsStandaloneFile, true);
  assert.deepEqual(LOCALE_QUERY, {
    requested: 'en',
    applied: false,
    reason: 'The self-contained Sidekick HUD ignores the lang query; its current UI remains German.'
  });
});

test('evidence writes are exclusive and failures redact the ephemeral websocket password', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-obs-pilot-test-'));
  try {
    const resultPath = atomicCreateFile(directory, 'result.json', Buffer.from('{"ok":true}\n'));
    assert.equal(fs.readFileSync(resultPath, 'utf8'), '{"ok":true}\n');
    assert.throws(() => atomicCreateFile(directory, 'result.json', Buffer.from('overwrite')), /EEXIST/);
    assert.deepEqual(safeError(new Error('connection password123 rejected'), 'password123'), {
      code: 'PILOT_FAILED', message: 'connection [redacted] rejected'
    });
    const longSecret = 'a'.repeat(245) + 'password123';
    assert.doesNotMatch(safeError(new Error(longSecret), 'password123').message, /password123/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('receipt file reader rejects oversized, non-regular or invalid receipts', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-obs-pilot-receipt-'));
  const receiptPath = path.join(directory, 'receipt.json');
  try {
    fs.writeFileSync(receiptPath, JSON.stringify(validReceipt()), { flag: 'wx' });
    const expectedFileSha256 = require('node:crypto').createHash('sha256').update(fs.readFileSync(receiptPath)).digest('hex');
    assert.equal(readIsolationReceipt(receiptPath, { expectedFileSha256 }).receiptFileSha256, expectedFileSha256);
    const tamperedReceipt = JSON.stringify({ ...validReceipt(), vmPowerState: 'saved' });
    fs.writeFileSync(receiptPath, tamperedReceipt);
    assert.throws(() => readIsolationReceipt(receiptPath, { expectedFileSha256 }), /does not match/);
    const tamperedFileHash = require('node:crypto').createHash('sha256').update(tamperedReceipt).digest('hex');
    assert.throws(() => readIsolationReceipt(receiptPath, { expectedFileSha256: tamperedFileHash }), /powered-off preboot receipt/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
