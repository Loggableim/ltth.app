'use strict';

// Independent post-run review for an immutable actual ClarityHUD probe receipt.
// It does not start a server, open a browser, or modify the original receipt.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../..');
const EVIDENCE_DIR = path.join(ROOT, 'docs/coordination/evidence/actual-clarityhud-backend-20261007-159584b5');
const RECEIPT_PATH = path.join(EVIDENCE_DIR, 'receipt.json');

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function readRelative(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath));
}

function main() {
  const receiptBytesBefore = fs.readFileSync(RECEIPT_PATH);
  const receipt = JSON.parse(receiptBytesBefore.toString('utf8'));
  const failures = [];
  const checks = {};

  const check = (name, condition) => {
    checks[name] = Boolean(condition);
    if (!condition) failures.push(name);
  };

  const serverOutput = fs.readFileSync(path.join(EVIDENCE_DIR, 'backend-output.txt'), 'utf8');
  const loadedPhrase = /ClarityHUD plugin loaded successfully/i.test(serverOutput);
  const unloadedPhrase = /Unloaded plugin: clarityhud/i.test(serverOutput);
  const serverClosedPhrase = /Server closed/i.test(serverOutput);
  const shutdownTimedOut = /Graceful shutdown timed out/i.test(serverOutput);
  const appServerSource = readRelative('app/server.js').toString('utf8');
  const databaseSource = readRelative('app/modules/database.js').toString('utf8');
  const databaseCloseMethod = databaseSource.match(/^\s{4}close\(\) \{[\s\S]*?^\s{4}\}/m)?.[0] || '';

  check('originalRunnerReceiptIsFailAndUnmodifiedAtReviewStart', receipt.result === 'FAIL' && receipt.error === 'Cleanup or source stability was not confirmed');
  check('actualOverlayHtmlRouteWasByteExact', receipt.servedHtml?.status === 200 && receipt.servedHtml.byteExactMatch === true && receipt.servedHtml.sha256 === receipt.servedHtml.sourceSha256 && sha256(readRelative(receipt.servedHtml.sourcePath)) === receipt.servedHtml.sourceSha256);
  check('fullSettingsGETPassed', receipt.api?.some(item => item.route === '/api/clarityhud/settings/full' && item.method === 'GET' && item.status === 200 && item.success) === true);
  const state = receipt.api?.find(item => item.route === '/api/clarityhud/state/full');
  check('fullStateGETPassedWithEmptySyntheticState', state?.method === 'GET' && state.status === 200 && state.success && Object.values(state.eventCounts || {}).length > 0 && Object.values(state.eventCounts || {}).every(count => count === 0));
  check('originalRendererLoadedGermanLayoutWithoutErrors', receipt.browser?.title === 'ClarityHUD – Vollständiges Aktivitäts-Overlay' && receipt.browser.localeAttribute === 'de' && receipt.browser.layoutClass?.includes('layout-singleStream') && receipt.browser.feedContainerCount === 1 && receipt.browser.renderedEventItems === 0 && receipt.browser.pageErrors.length === 0 && receipt.browser.consoleErrors.length === 0 && receipt.browser.requestFailures.length === 0);
  check('rendererUsedLoopbackOnlyAndMadeNoExternalRequests', receipt.browser?.externalRequestsBlocked.length === 0 && receipt.browser?.websocketOrigins.length === 1 && receipt.browser.websocketOrigins[0] === `ws://127.0.0.1:${receipt.port}`);

  const screenshot = receipt.browser?.screenshot;
  const screenshotBytes = screenshot && readRelative(screenshot.path);
  check('screenshotContentHashMatches', Boolean(screenshotBytes) && screenshotBytes.length === screenshot.bytes && sha256(screenshotBytes) === screenshot.sha256);
  check('onlyClarityhudWasAllowedAndManifestWasNotChanged', JSON.stringify(receipt.allowedPluginIds) === JSON.stringify(['clarityhud']) && receipt.pluginManifest.originalId === 'clarityhud' && receipt.pluginManifest.stagedId === 'clarityhud' && receipt.pluginManifest.originalEnabled === true && receipt.pluginManifest.stagedEnabled === true && receipt.pluginManifest.enabledWasChanged === false && receipt.pluginManifest.onlyEnabledFieldDiffers === true);
  check('strictChildEnvironmentContainedNoCredentialValues', receipt.childEnvironmentCredentialValueCount === 0 && receipt.childEnvironmentKeys.includes('LTTH_DOCS_CAPTURE_ALLOWED_PLUGINS'));
  check('allPinnedSourcesAndPluginTreeWereStableDuringCapture', receipt.sourcePrePost.allPinnedSourcesStable && receipt.sourcePrePost.clarityhudSourceStable && receipt.sourcePrePost.clarityhudFixtureStable && receipt.sourcePrePost.fixtureStillMatchesSource && receipt.sourcePrePost.originalManifestUnchanged && receipt.sourcePrePost.stagedManifestUnchanged && receipt.sourcePrePost.sourceChanges.every(item => item.stable));

  const shutdown = receipt.shutdownResponse;
  const dbCheck = receipt.databaseCloseVerification?.reopenAndQuickCheckAfterExit;
  check('ownedAppShutdownReturned200AndExitedZero', shutdown?.status === 200 && shutdown.body?.success === true && shutdown.targetPid === receipt.pid && shutdown.targetPort === receipt.port && receipt.cleanup?.childExitCode === 0 && receipt.cleanup?.childSignalCode === null && receipt.cleanup?.terminalConfirmed && receipt.cleanup?.forced === false && receipt.childCloseEvent !== null);
  check('databaseCloseCallPrecedesServerClose', /db\.close\(\);[\s\S]{0,160}server\.close\(/.test(appServerSource) && /this\.db\.close\(\)/.test(databaseCloseMethod));
  check('databaseClosedAndReopenedCleanlyAfterProcessExit', receipt.databaseCloseVerification?.processExitCode === 0 && dbCheck?.passed === true && dbCheck.quickCheck?.[0]?.quick_check === 'ok');
  check('databaseManagerDoesNotEmitADedicatedCloseSuccessLog', !/logger\.(?:info|debug)|console\.(?:log|info)/.test(databaseCloseMethod) && !/database closed|Database.*closed/i.test(serverOutput));
  check('clarityhudLoadAndUnloadAndServerCloseAreProvenByActualLog', loadedPhrase && unloadedPhrase && serverClosedPhrase && !shutdownTimedOut);
  check('ownedListenerBrowserAndTempProfileAreClosed', receipt.cleanup?.portClosed === true && receipt.cleanup?.browserClosed === true && receipt.cleanup?.tempProfileRemoved === true);
  check('preCleanupDiagnosticsAndBackendOutputWerePreserved', fs.existsSync(path.join(EVIDENCE_DIR, 'pre-cleanup-diagnostics.json')) && fs.existsSync(path.join(EVIDENCE_DIR, 'backend-output.txt')) && receipt.backendOutput?.stdioClosedBeforeLogSnapshot === true);

  const executedRunner = receipt.sourceFiles.find(item => item.path === 'scripts/obs-pilot/actual-clarityhud-backend-probe.js');
  const currentRunnerHash = sha256(readRelative('scripts/obs-pilot/actual-clarityhud-backend-probe.js'));
  const review = {
    schemaVersion: 1,
    reviewedAtUtc: new Date().toISOString(),
    outcome: failures.length === 0 ? 'PASS' : 'FAIL',
    interpretation: 'The original probe receipt is preserved byte-for-byte. Its result was FAIL because the runner used two unsuitable log predicates: it expected a ClarityHUD loaded line with a different word order, and it required a database-close success log even though DatabaseManager.close() emits no such log. The actual ClarityHUD load/unload and server-close lines, source-verified db.close() ordering, exit code 0 and a successful post-exit SQLite quick_check establish shutdown. No backend or browser rerun was performed.',
    originalReceipt: {
      path: path.relative(ROOT, RECEIPT_PATH).split(path.sep).join('/'),
      sha256BeforeReview: sha256(receiptBytesBefore),
      originalResult: receipt.result,
      originalError: receipt.error
    },
    predicateCorrection: {
      originalExpectedPhrase: 'Plugin clarityhud loaded successfully',
      actualLoggedPhrase: 'ClarityHUD plugin loaded successfully',
      actualPhraseMatched: loadedPhrase,
      originalDatabaseLogPredicate: 'database closed|Database.*closed',
      dedicatedDatabaseCloseSuccessLogExists: /logger\.(?:info|debug)|console\.(?:log|info)/.test(databaseCloseMethod) || /database closed|Database.*closed/i.test(serverOutput),
      databaseCloseInsteadProvenBy: 'app/server.js db.close() before server.close(), exit code 0, and read-only SQLite reopen with PRAGMA quick_check = ok',
      postRunProbeRunnerHash: {
        executedSha256: executedRunner.sha256,
        currentAfterPredicateCorrectionSha256: currentRunnerHash,
        changedAfterCaptureForReviewOnly: executedRunner.sha256 !== currentRunnerHash
      }
    },
    checkedFacts: {
      checks,
      serverLogIncludesClarityhudLoaded: loadedPhrase,
      serverLogIncludesClarityhudUnloaded: unloadedPhrase,
      serverLogIncludesServerClosed: serverClosedPhrase,
      serverLogIncludesShutdownTimeout: shutdownTimedOut,
      backendOutputSha256: sha256(Buffer.from(serverOutput)),
      screenshotSha256Reverified: Boolean(screenshotBytes) && sha256(screenshotBytes) === screenshot.sha256,
      receiptSha256Unchanged: sha256(fs.readFileSync(RECEIPT_PATH)) === sha256(receiptBytesBefore)
    },
    knownObservations: [
      'The server log reports its initial update-check subprocess could not find git.exe in the intentionally minimal environment (ENOENT); no external browser requests or non-loopback websocket were observed.',
      'ClarityHUD unload logs its existing Express limitation that 22 routes cannot be unregistered; this one-shot isolated server then completed shutdown with exit code 0.',
      'DatabaseManager.close() has no dedicated success log, so the receipt records no database-close log and verifies closure through shutdown ordering plus a successful post-exit SQLite reopen and integrity check.'
    ],
    failures
  };

  check('originalReceiptRemainedUnchanged', review.checkedFacts.receiptSha256Unchanged);
  review.checkedFacts.checks = checks;
  review.failures = failures;
  review.outcome = failures.length === 0 ? 'PASS' : 'FAIL';

  const outputPath = path.join(EVIDENCE_DIR, 'independent-review.json');
  fs.writeFileSync(outputPath, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ outcome: review.outcome, output: path.relative(ROOT, outputPath).split(path.sep).join('/'), failures })}\n`);
  if (failures.length) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
}
