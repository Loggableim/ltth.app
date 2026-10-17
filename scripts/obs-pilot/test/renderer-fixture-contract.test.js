'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { validateRendererFixtureManifest } = require('../renderer-fixture-contract');

const ROOT = path.resolve(__dirname, '../../..');
const manifests = [
  JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/coordination/obs-104-advanced-timer-fixture.json'), 'utf8')),
  JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/coordination/obs-104-stt-ticker-fixture.json'), 'utf8')),
  JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/coordination/obs-104-goals-fixture.json'), 'utf8')),
  JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/coordination/obs-104-spotlight-fixture.json'), 'utf8')),
  JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/coordination/obs-104-quiz-show-fixture.json'), 'utf8')),
  JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/coordination/obs-104-toptier-fixture.json'), 'utf8')),
  JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/coordination/obs-104-interactive-story-fixture.json'), 'utf8')),
  JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/coordination/obs-104-viewerxp-fixture.json'), 'utf8')),
  JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/coordination/obs-104-webgpu-weather-control-fixture.json'), 'utf8'))
];
const timerEvidence = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/coordination/obs-104-renderer-fixture-evidence.json'), 'utf8'));
const sttEvidence = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/coordination/obs-104-stt-ticker-fixture-evidence.json'), 'utf8'));
const goalsEvidence = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/coordination/obs-104-goals-fixture-evidence.json'), 'utf8'));
const spotlightEvidence = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/coordination/obs-104-spotlight-fixture-evidence.json'), 'utf8'));
const quizShowEvidence = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/coordination/obs-104-quiz-show-fixture-evidence.json'), 'utf8'));
const toptierEvidence = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/coordination/obs-104-toptier-fixture-evidence.json'), 'utf8'));
const interactiveStoryEvidence = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/coordination/obs-104-interactive-story-fixture-evidence.json'), 'utf8'));
const viewerXPEvidence = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/coordination/obs-104-viewerxp-fixture-evidence.json'), 'utf8'));
const weatherEvidence = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/coordination/obs-104-webgpu-weather-control-fixture-evidence.json'), 'utf8'));

function fileSha256(relativePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, ...relativePath.split('/')))).digest('hex');
}

test('all nine four-locale fixture manifests pin only contained family closure files', () => {
  const timer = validateRendererFixtureManifest(ROOT, manifests[0]);
  const stt = validateRendererFixtureManifest(ROOT, manifests[1]);
  const goals = validateRendererFixtureManifest(ROOT, manifests[2]);
  const spotlight = validateRendererFixtureManifest(ROOT, manifests[3]);
  const quizShow = validateRendererFixtureManifest(ROOT, manifests[4]);
  const toptier = validateRendererFixtureManifest(ROOT, manifests[5]);
  const interactiveStory = validateRendererFixtureManifest(ROOT, manifests[6]);
  const viewerXP = validateRendererFixtureManifest(ROOT, manifests[7]);
  const weather = validateRendererFixtureManifest(ROOT, manifests[8]);
  assert.equal(timer.files.length, 8);
  assert.equal(timer.totalBytes, 291243);
  assert.equal(stt.files.length, 7);
  assert.equal(stt.totalBytes, 275912);
  assert.equal(goals.files.length, 8);
  assert.equal(goals.totalBytes, 278409);
  assert.equal(spotlight.files.length, 12);
  assert.equal(spotlight.totalBytes, 276085);
  assert.equal(quizShow.files.length, 11);
  assert.equal(quizShow.totalBytes, 619570);
  assert.equal(toptier.files.length, 11);
  assert.equal(toptier.totalBytes, 300253);
  assert.equal(interactiveStory.files.length, 8);
  assert.equal(interactiveStory.totalBytes, 344265);
  assert.equal(viewerXP.files.length, 10);
  assert.equal(viewerXP.totalBytes, 503763);
  assert.equal(weather.files.length, 8);
  assert.equal(weather.totalBytes, 274572);
  for (const evidence of [timerEvidence, sttEvidence, goalsEvidence, spotlightEvidence, quizShowEvidence, toptierEvidence, interactiveStoryEvidence, viewerXPEvidence, weatherEvidence]) {
    assert.equal(fileSha256(evidence.manifest.path), evidence.manifest.sha256);
    assert.equal(evidence.result.exitCode, 0);
    assert.equal(evidence.result.testsFailed, 0);
    for (const witness of evidence.sourceWitnesses) assert.equal(fileSha256(witness.path), witness.sha256);
  }
  assert.equal(timerEvidence.result.testsPassed, 29);
  assert.equal(sttEvidence.result.testsPassed, 11);
  assert.equal(goalsEvidence.result.testsPassed, 29);
  assert.equal(spotlightEvidence.result.testsPassed, 5);
  assert.equal(quizShowEvidence.result.testsPassed, 6);
  assert.deepEqual(quizShowEvidence.sourceReview.socketRequester, {
    event: 'quiz-show:get-public-state', argumentCount: 0, initialConnectedEmissions: 2,
    registry: 'incoming-event allowlist and same-socket safe-state response via buildGameStatePayload'
  });
  assert.deepEqual(quizShowEvidence.sourceReview.mainOwnerDelta, {
    path: 'app/plugins/quiz-show/main.js',
    sha256: 'c8aa91ba8334c3f04150335b3774e627fc10c31ba5b955228ee6883861d97857',
    ownerConfirmedStable: true,
    ownerFocusedTests: '6 suites / 366 tests passed; node --check passed',
    independentReview: false
  });
  assert.equal(quizShowEvidence.sourceReview.dynamicDependenciesUnresolved.length, 6);
  assert.deepEqual(manifests[4].runnerContract.socketEventsEmitted, ['quiz-show:get-public-state']);
  assert.equal(manifests[4].runnerContract.unresolvedDynamicDependencies.length, 6);
  assert.equal(toptierEvidence.result.testsPassed, 8);
  assert.equal(interactiveStoryEvidence.result.testsPassed, 6);
  assert.equal(viewerXPEvidence.result.testsPassed, 23);
  assert.equal(viewerXPEvidence.result.testsFailed, 0);
  assert.deepEqual(manifests[7].runnerContract.socketEventsEmitted, ['viewer-xp:public-profile:request', 'viewer-xp:public-leaderboard:request']);
  assert.equal(manifests[7].runnerContract.unresolvedDynamicDependencies.length, 3);
  assert.equal(weatherEvidence.result.testsPassed, 1);
  assert.equal(weatherEvidence.result.testsFailed, 0);
  assert.equal(manifests[8].caseCount, 1);
  assert.deepEqual(manifests[8].runnerContract.socketEventsEmitted, [
    'webgpu-weather:client-ready', 'webgpu-weather:overlay-state', 'webgpu-weather:request-permanent-effects'
  ]);
  assert.equal(manifests[8].runnerContract.unresolvedDynamicDependencies.length, 3);
  for (const result of [timer, stt, goals, spotlight, quizShow, toptier, interactiveStory, viewerXP, weather]) {
    assert.equal(result.listenerStarted, false);
    assert.deepEqual(result.files.filter((entry) => entry.role === 'plugin-locale').map((entry) => path.posix.basename(entry.path, '.json')).sort(), ['de', 'en', 'es', 'fr']);
    assert.deepEqual(result.files.filter((entry) => /(?:profiles?|user_configs?|\.env)/i.test(entry.path)), []);
  }
});

test('STT Ticker manifest pins the resolved standalone socket binding and updated renderer evidence', () => {
  const stt = validateRendererFixtureManifest(ROOT, manifests[1]);
  assert.equal(stt.files.length, 7);
  assert.equal(stt.totalBytes, 275912);
  assert.equal(stt.listenerStarted, false);
  assert.equal(fileSha256(sttEvidence.manifest.path), sttEvidence.manifest.sha256);
  assert.equal(sttEvidence.result.exitCode, 0);
  assert.equal(sttEvidence.result.testsPassed, 11);
  assert.equal(sttEvidence.result.testsFailed, 0);
  for (const witness of sttEvidence.sourceWitnesses) assert.equal(fileSha256(witness.path), witness.sha256);
  assert.equal(manifests[1].runnerContract.listenerStarted, false);
  assert.equal(manifests[1].runnerContract.externalNetwork, 'blocked');
  assert.equal(manifests[1].runnerContract.productProfileOrCredentialData, 'excluded');
});

test('Viewer-XP manifest independently pins the three-renderer four-locale closure', () => {
  const result = validateRendererFixtureManifest(ROOT, manifests[7]);
  assert.equal(result.files.length, 10);
  assert.equal(result.totalBytes, 503763);
  assert.equal(result.listenerStarted, false);
  assert.equal(fileSha256(viewerXPEvidence.manifest.path), viewerXPEvidence.manifest.sha256);
  assert.equal(viewerXPEvidence.result.testsPassed, 23);
  assert.equal(viewerXPEvidence.result.testsFailed, 0);
  for (const witness of viewerXPEvidence.sourceWitnesses) assert.equal(fileSha256(witness.path), witness.sha256);
  assert.equal(manifests[7].runnerContract.listenerStarted, false);
  assert.equal(manifests[7].runnerContract.externalNetwork, 'blocked');
  assert.equal(manifests[7].runnerContract.productProfileOrCredentialData, 'excluded');
});

test('WebGPU Weather manifest independently pins its CPU-only renderer closure', () => {
  const result = validateRendererFixtureManifest(ROOT, manifests[8]);
  assert.equal(result.files.length, 8);
  assert.equal(result.totalBytes, 274572);
  assert.equal(result.listenerStarted, false);
  assert.equal(fileSha256(weatherEvidence.manifest.path), weatherEvidence.manifest.sha256);
  assert.equal(weatherEvidence.result.testsPassed, 1);
  assert.equal(weatherEvidence.result.testsFailed, 0);
  for (const witness of weatherEvidence.sourceWitnesses) assert.equal(fileSha256(witness.path), witness.sha256);
  assert.equal(manifests[8].runnerContract.listenerStarted, false);
  assert.equal(manifests[8].runnerContract.externalNetwork, 'blocked');
  assert.equal(manifests[8].runnerContract.productProfileOrCredentialData, 'excluded');
});

test('fixture manifests reject traversal, user-state paths, and credential-like fields', () => {
  for (const manifest of manifests) {
    const traversal = structuredClone(manifest);
    traversal.files[0].path = '../app/.env';
    assert.throws(() => validateRendererFixtureManifest(ROOT, traversal), /safe repository-relative path/);

    const profilePath = structuredClone(manifest);
    profilePath.files[0].path = `app/user_configs/${manifest.fixtureId}/default.json`;
    assert.throws(() => validateRendererFixtureManifest(ROOT, profilePath), /user profile, credential or runtime state/);

    const credentialField = structuredClone(manifest);
    credentialField.runnerContract.password = 'must-not-be-present';
    assert.throws(() => validateRendererFixtureManifest(ROOT, credentialField), /unknown or missing fields/);
  }
});

test('fixture manifests fail closed for missing assets, byte drift and SHA drift', () => {
  for (const manifest of manifests) {
    const firstPath = path.resolve(ROOT, ...manifest.files[0].path.split('/'));
    const missingAssetFs = {
      realpathSync: fs.realpathSync.bind(fs),
      statSync: fs.statSync.bind(fs),
      readFileSync: fs.readFileSync.bind(fs),
      lstatSync(filePath) {
        if (path.resolve(filePath) === firstPath) {
          const error = new Error('synthetic missing asset');
          error.code = 'ENOENT';
          throw error;
        }
        return fs.lstatSync(filePath);
      }
    };
    assert.throws(() => validateRendererFixtureManifest(ROOT, manifest, { fsApi: missingAssetFs }), /missing local asset .*ENOENT/);

    const wrongBytes = structuredClone(manifest);
    wrongBytes.files[0].bytes += 1;
    assert.throws(() => validateRendererFixtureManifest(ROOT, wrongBytes), /byte count mismatch/);

    const wrongHash = structuredClone(manifest);
    wrongHash.files[0].sha256 = '0'.repeat(64);
    assert.throws(() => validateRendererFixtureManifest(ROOT, wrongHash), /SHA-256 mismatch/);
  }
});

test('fixture manifests reject a reparse point before following it', () => {
  for (const manifest of manifests) {
    const targetPath = path.resolve(ROOT, ...manifest.files[0].path.split('/'));
    const fakeReparseFs = {
      realpathSync: fs.realpathSync.bind(fs),
      statSync: fs.statSync.bind(fs),
      readFileSync: fs.readFileSync.bind(fs),
      lstatSync(filePath) {
        if (path.resolve(filePath) === targetPath) return { isSymbolicLink: () => true, isReparsePoint: true };
        return fs.lstatSync(filePath);
      }
    };
    assert.throws(() => validateRendererFixtureManifest(ROOT, manifest, { fsApi: fakeReparseFs }), /reparse point is forbidden/);
  }
});

test('runner contracts reject listeners, external URLs, dynamic routes, and profile or provider paths', () => {
  for (const manifest of manifests) {
    const listener = structuredClone(manifest);
    listener.runnerContract.listenerStarted = true;
    assert.throws(() => validateRendererFixtureManifest(ROOT, listener), /network listener is forbidden/);

    const external = structuredClone(manifest);
    external.runnerContract.assetGetRoutes[0].path = 'https://example.invalid/script.js';
    assert.throws(() => validateRendererFixtureManifest(ROOT, external), /asset route allowlist changed/);

    const dynamic = structuredClone(manifest);
    dynamic.runnerContract.apiGetPatterns = ['/api/${arbitraryRoute}'];
    assert.throws(() => validateRendererFixtureManifest(ROOT, dynamic), /API route allowlist changed/);

    const broad = structuredClone(manifest);
    broad.files.push({ ...broad.files[0], path: 'app/plugins/unreviewed/main.js' });
    assert.throws(() => validateRendererFixtureManifest(ROOT, broad), /exact four-locale pinned renderer closure/);
  }
});
