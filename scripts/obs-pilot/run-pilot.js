'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createPilotFixture, HOST } = require('./fixture-host');
const { EXPECTED_VM_UUID, ROOT, localObsUrl, readIsolationReceipt, validateEvidenceDirectoryPath, validateIsolationReceipt } = require('./safety-contract');
const { ObsDocsCaptureSession, TUTORIAL_SCENE_NAME } = require('../lib/obs-docs-capture');
const { assertPngIsVisible, decodePngData } = require('../capture-obs-docs-screenshot');
const { createStageContractSequence } = require('./stage-contract');

const WIDTH = 1280;
const HEIGHT = 720;
const LOCALE_QUERY = Object.freeze({
  requested: 'en',
  applied: false,
  reason: 'The self-contained Sidekick HUD ignores the lang query; its current UI remains German.'
});
const STATUS_STAGES = Object.freeze([
  { name: 'status-unavailable', phase: 0, statusFailures: 1 },
  { name: 'status-recovered', phase: 0, statusFailures: 1 },
  { name: 'muted', phase: 1, statusFailures: 1 },
  { name: 'disconnected', phase: 2, statusFailures: 1 },
  { name: 'reconnected', phase: 3, statusFailures: 1 }
]);

function atomicCreateFile(directory, filename, contents) {
  if (!/^[a-z0-9][a-z0-9._-]{0,95}$/i.test(filename)) throw new Error('Unsafe pilot evidence filename');
  const destination = path.join(directory, filename);
  const temporary = path.join(directory, `.${filename}.${crypto.randomBytes(8).toString('hex')}.tmp`);
  const file = fs.openSync(temporary, 'wx', 0o600);
  try {
    fs.writeFileSync(file, contents);
    fs.fsyncSync(file);
  } finally {
    fs.closeSync(file);
  }
  try {
    fs.linkSync(temporary, destination);
    fs.unlinkSync(temporary);
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch (_) { /* best-effort cleanup of this unique temporary file */ }
    throw error;
  }
  return destination;
}

function pngRecord(imageData, { stage, kind }) {
  const image = decodePngData(imageData, { width: WIDTH, height: HEIGHT });
  const visible = assertPngIsVisible(image);
  return {
    filename: `${stage}.${kind}.png`,
    bytes: image.length,
    sha256: crypto.createHash('sha256').update(image).digest('hex'),
    width: WIDTH,
    height: HEIGHT,
    colors: visible.colors,
    contrast: visible.contrast
  };
}

function finalizePilotResult(result) {
  const allStagesCaptured = result.captures.length === STATUS_STAGES.length;
  const allStageContractsVerified = result.stageContract?.stagesVerified === STATUS_STAGES.length &&
    result.captures.every((capture) => capture.stageContract?.stage === capture.stage);
  const allCapturesVisibleAndRestored = allStagesCaptured && result.captures.every((capture) =>
    capture.visible === true && capture.restored === true && capture.temporaryInputRemoved === true &&
    capture.temporarySceneItemRemoved === true && Array.isArray(capture.initialSceneItems) && capture.initialSceneItems.length === 0 &&
    Array.isArray(capture.restoredSceneItems) && capture.restoredSceneItems.length === 0
  );
  const distinctRenders = allStagesCaptured && new Set(result.captures.map((capture) => capture.sourcePng?.sha256)).size === STATUS_STAGES.length;
  const cleanupVerified = result.cleanup.obsDisconnected === true && result.cleanup.fixtureClosed === true && result.cleanup.tutorialSceneRestored === true;

  if (result.status !== 'failed' && allCapturesVisibleAndRestored && allStageContractsVerified && distinctRenders && cleanupVerified) {
    result.status = 'capture-complete-review-pending';
  } else {
    result.status = 'failed';
    if (!result.error) {
      result.error = {
        code: !cleanupVerified ? 'CLEANUP_NOT_VERIFIED' : 'CAPTURE_CONTRACT_FAILED',
        message: !cleanupVerified
          ? 'OBS disconnect, fixture shutdown, or tutorial scene restoration was not verified'
          : 'Capture set was incomplete, stage transport contract failed, renders were unchanged, or the tutorial scene was not restored'
      };
    }
  }
  result.review = { status: 'pending-independent-image-review', acceptedBy: null };
  return result;
}

function validateHudAsset(filePath = path.join(ROOT, 'app/plugins/sidekick/overlay/sidekick-hud.html')) {
  const html = fs.readFileSync(filePath, 'utf8');
  const references = [...html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]);
  const remote = references.filter((reference) => /^https?:\/\//i.test(reference) || reference.startsWith('//'));
  if (remote.length) throw new Error('Sidekick pilot HUD has remote static asset references');
  if (!references.includes('/socket.io/socket.io.js')) throw new Error('Sidekick pilot HUD no longer uses the expected same-origin Socket.IO client');
  return { bytes: Buffer.byteLength(html), sha256: crypto.createHash('sha256').update(html).digest('hex') };
}

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function safeError(error, secret = '') {
  const code = typeof error?.code === 'string' && /^[A-Z0-9_]{1,48}$/.test(error.code) ? error.code : 'PILOT_FAILED';
  let message = String(error?.message || 'Pilot failed').replace(/\s+/g, ' ');
  if (secret) message = message.split(secret).join('[redacted]');
  return { code, message: message.slice(0, 240) };
}

async function runPilot({ environment = process.env, createObsClient } = {}) {
  const isolation = readIsolationReceipt(environment.LTTH_OBS_PILOT_ISOLATION_RECEIPT, {
    expectedFileSha256: environment.LTTH_OBS_PILOT_ISOLATION_RECEIPT_SHA256
  });
  const evidenceDirectory = validateEvidenceDirectoryPath(environment.LTTH_OBS_PILOT_EVIDENCE_DIR);
  const obsUrl = localObsUrl(environment.OBS_WEBSOCKET_URL || 'ws://127.0.0.1:4455');
  const port = Number(environment.LTTH_OBS_PILOT_FIXTURE_PORT || 8765);
  if (port !== 8765) throw new Error('Pilot fixture port is fixed at 8765');
  const hud = validateHudAsset();
  const fixture = createPilotFixture({ failFirstStatus: true });
  const OBSWebSocket = createObsClient || require(path.join(ROOT, 'app/node_modules/obs-websocket-js')).default;
  const obs = new OBSWebSocket();
  const sourceName = `LTTH Sidekick Pilot ${crypto.randomUUID()}`;
  fs.mkdirSync(evidenceDirectory);
  let connected = false;
  const result = {
    schemaVersion: 1,
    status: 'started',
    guestIsolation: isolation,
    hud,
    localeQuery: LOCALE_QUERY,
    sceneName: TUTORIAL_SCENE_NAME,
    sourceName,
    fixtureAddress: null,
    captures: [],
    fixtureActivity: [],
    stageContract: null,
    cleanup: { obsDisconnected: false, fixtureClosed: false, tutorialSceneRestored: false },
    error: null
  };

  try {
    result.fixtureAddress = await fixture.start({ host: HOST, port, isolationReceipt: isolation });
    await obs.connect(obsUrl, environment.OBS_WEBSOCKET_PASSWORD || '');
    connected = true;

    const [streamStatus, recordStatus] = await Promise.all([
      obs.call('GetStreamStatus'),
      obs.call('GetRecordStatus')
    ]);
    if (streamStatus?.outputActive || recordStatus?.outputActive) throw new Error('OBS stream or recording is active; stopping pilot before mutation');
    const scenes = await obs.call('GetSceneList');
    if (scenes?.scenes?.length !== 1 || scenes.scenes[0]?.sceneName !== TUTORIAL_SCENE_NAME || scenes.currentProgramSceneName !== TUTORIAL_SCENE_NAME) {
      throw new Error('Guest OBS must use a fresh profile with only the active tutorial scene');
    }
    const obsVersion = await obs.call('GetVersion');
    if (typeof obsVersion?.obsVersion !== 'string' || !obsVersion.obsVersion) throw new Error('OBS version could not be verified inside the guest');
    result.guestRuntimeEvidence = { obsVersion: obsVersion.obsVersion, obsWebSocketVersion: String(obsVersion.obsWebSocketVersion || '') };

    const session = new ObsDocsCaptureSession(obs, { sourceName });
    const stageSequence = createStageContractSequence();
    for (let index = 0; index < STATUS_STAGES.length; index += 1) {
      const stage = STATUS_STAGES[index];
      const statusEventStart = fixture.getSocketStatusEvents().length;
      fixture.advancePhase(stage.phase);
      const beforeActivity = fixture.getStats();
      if (index === 1) fixture.setSocketStatusEnabled(true);
      const overlayUrl = `http://${HOST}:${port}/overlay/sidekick/hud?lang=en`;
      let activeStats;
      const receipt = await session.capture({
        sceneName: TUTORIAL_SCENE_NAME,
        overlayUrl,
        width: WIDTH,
        height: HEIGHT,
        beforeScreenshot: async () => {
          activeStats = await fixture.waitForActivity({
            statusRequests: beforeActivity.statusRequests + 1,
            statusFailures: beforeActivity.statusFailures + (stage.statusFailures > beforeActivity.statusFailures ? 1 : 0),
            statusSuccesses: beforeActivity.statusSuccesses + (index > 0 ? 1 : 0),
            eventRequests: beforeActivity.eventRequests + 1,
            eventSuccesses: beforeActivity.eventSuccesses + 1,
            socketRequests: beforeActivity.socketRequests + 1
          });
          await delay(450);
        }
      });
      if (!receipt.restored || !receipt.temporaryInputRemoved || !receipt.temporarySceneItemRemoved) throw new Error(`OBS source cleanup failed during stage ${stage.name}`);
      if (receipt.initialSceneItems.length !== 0 || receipt.restoredSceneItems.length !== 0) throw new Error(`Tutorial scene baseline changed during stage ${stage.name}`);
      const scenePng = pngRecord(receipt.imageData, { stage: stage.name, kind: 'scene' });
      const sourcePng = pngRecord(receipt.sourceImageData, { stage: stage.name, kind: 'source' });
      atomicCreateFile(evidenceDirectory, scenePng.filename, Buffer.from(receipt.imageData.slice('data:image/png;base64,'.length), 'base64'));
      atomicCreateFile(evidenceDirectory, sourcePng.filename, Buffer.from(receipt.sourceImageData.slice('data:image/png;base64,'.length), 'base64'));
      const cleanupStats = await fixture.waitForNoSocketClients();
      const contractReceipt = stageSequence.verifyStage({
        stageName: stage.name,
        baseline: beforeActivity,
        activity: activeStats,
        cleanup: cleanupStats,
        socketStatusEvents: fixture.getSocketStatusEvents().slice(statusEventStart)
      });
      result.fixtureActivity.push({ stage: stage.name, baseline: beforeActivity, activity: activeStats, cleanup: cleanupStats });
      result.captures.push({
        stage: stage.name,
        stageContract: contractReceipt,
        overlayUrl,
        scenePng,
        sourcePng,
        visible: receipt.visible,
        initialSceneItems: receipt.initialSceneItems,
        restoredSceneItems: receipt.restoredSceneItems,
        temporarySceneItemRemoved: receipt.temporarySceneItemRemoved,
        temporaryInputRemoved: receipt.temporaryInputRemoved,
        streamActive: receipt.streamActive,
        recordActive: receipt.recordActive,
        restored: receipt.restored,
        outputChecks: receipt.outputChecks
      });
    }
    result.stageContract = stageSequence.finish();
    const [finalStreamStatus, finalRecordStatus] = await Promise.all([
      obs.call('GetStreamStatus'),
      obs.call('GetRecordStatus')
    ]);
    if (finalStreamStatus?.outputActive || finalRecordStatus?.outputActive) throw new Error('OBS stream or recording became active during the pilot');
    result.cleanup.tutorialSceneRestored = true;
  } catch (error) {
    result.status = 'failed';
    result.error = safeError(error, environment.OBS_WEBSOCKET_PASSWORD || '');
  } finally {
    if (connected) {
      try { await obs.disconnect(); result.cleanup.obsDisconnected = true; } catch (_) { /* report cleanup failure without leaking connection details */ }
    }
    try { await fixture.close(); result.cleanup.fixtureClosed = true; } catch (_) { /* report cleanup failure without leaking connection details */ }
    result.cleanup.fixtureClosed = result.cleanup.fixtureClosed && fixture.isClosed();
    finalizePilotResult(result);
    try {
      atomicCreateFile(evidenceDirectory, 'pilot-result.json', Buffer.from(`${JSON.stringify(result, null, 2)}\n`));
    } catch (error) {
      result.status = 'failed';
      result.error = safeError(error, environment.OBS_WEBSOCKET_PASSWORD || '');
      result.error.code = 'EVIDENCE_WRITE_FAILED';
    }
  }

  if (result.status !== 'capture-complete-review-pending') throw new Error(result.error?.message || 'Sidekick OBS pilot failed');
  return result;
}

if (require.main === module) {
  runPilot().then((result) => {
    process.stdout.write(`Sidekick OBS pilot ${result.status}: ${result.captures.length} captures; evidence in ${process.env.LTTH_OBS_PILOT_EVIDENCE_DIR}\n`);
  }).catch((error) => {
    process.stderr.write(`Sidekick OBS pilot did not pass: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  EXPECTED_VM_UUID,
  HEIGHT,
  LOCALE_QUERY,
  STATUS_STAGES,
  WIDTH,
  atomicCreateFile,
  finalizePilotResult,
  localObsUrl,
  pngRecord,
  readIsolationReceipt,
  runPilot,
  safeError,
  validateEvidenceDirectoryPath,
  validateHudAsset,
  validateIsolationReceipt
};
