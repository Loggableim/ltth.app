'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const {
  FAMILY_FILES,
  MATRIX_PATH,
  assertTransferReady,
  buildRendererReadiness
} = require('../renderer-readiness');

const ROOT = path.resolve(__dirname, '../../..');

function build(overrides = {}) {
  return buildRendererReadiness(ROOT, overrides);
}

test('current evidence separates static closure, consumer locales, backend witnesses and OBS', () => {
  const report = build();
  assert.equal(report.summary.staticManifestsPassed, 9);
  assert.equal(report.summary.fixtureEvidencePassed, 9);
  assert.equal(report.summary.actualOriginalConsumerFourLocaleCoverage, '8/9');
  assert.equal(report.summary.sharedSourceReviewsPending, 0);
  assert.equal(report.summary.liveBackendWitnessesObserved, 0);
  assert.equal(report.summary.realObsCasesChecked, 0);
  assert.equal(report.summary.realObsCasesExpected, 104);
  const weather = report.families.find(family => family.id === 'webgpu-weather-control');
  assert.equal(weather.sharedSourceReview.status, 'CLEAR');
  assert.equal(weather.actualOriginalConsumerLocales.status, 'NOT_COVERED');
  assert.equal(report.decision.status, 'NOT_READY');
  assert.equal(report.decision.isoStageAllowed, false);
  assert.equal(report.decision.freezeContract, 'HOLD');
  assert.throws(() => assertTransferReady(report), error => error.code === 'TRANSFER_NOT_READY');
});

test('pending shared review stays blocked despite false stable owner claims', () => {
  const report = build({ loadJson(relativePath) {
    const value = require(path.join(ROOT, ...relativePath.split('/')));
    if (relativePath.endsWith('webgpu-weather-control-fixture-evidence.json')) {
      return { ...value, status: 'source-hash-bound-cpu-fixture-run', sourceReview: { ownerConfirmedStable: true }, pendingSharedSourceReview: { ...value.pendingSharedSourceReview, status: 'stable' } };
    }
    return value;
  } });
  assert.equal(report.families.find(family => family.id === 'webgpu-weather-control').sharedSourceReview.status, 'PENDING');
  assert.equal(report.decision.isoStageAllowed, false);
});

test('missing pending review and missing shared witness fails closed', () => {
  const report = build({ loadJson(relativePath) {
    const value = require(path.join(ROOT, ...relativePath.split('/')));
    if (relativePath.endsWith('webgpu-weather-control-fixture-evidence.json')) {
      const { pendingSharedSourceReview, ...rest } = value;
      return { ...rest, sourceWitnesses: rest.sourceWitnesses.filter(witness => witness.path !== 'app/modules/public-overlay-payload-projection.js') };
    }
    return value;
  } });
  const weather = report.families.find(family => family.id === 'webgpu-weather-control');
  assert.equal(weather.sharedSourceReview.status, 'FAIL');
  assert.match(weather.failures.join(' '), /required shared source witness/);
  assert.equal(report.decision.status, 'BLOCKED');
});

test('stale owner hash and missing evidence cannot pass', () => {
  const stale = build({ loadJson(relativePath) {
    const value = require(path.join(ROOT, ...relativePath.split('/')));
    if (relativePath.endsWith('viewerxp-fixture-evidence.json')) {
      return { ...value, sourceWitnesses: value.sourceWitnesses.map((witness, index) => index ? witness : { ...witness, sha256: '0'.repeat(64) }) };
    }
    return value;
  } });
  assert.equal(stale.families.find(family => family.id === 'viewerxp').evidence.status, 'FAIL');
  assert.equal(stale.decision.isoStageAllowed, false);

  const missing = build({ loadJson(relativePath) {
    if (relativePath.endsWith('viewerxp-fixture-evidence.json')) throw new Error('synthetic missing evidence');
    return require(path.join(ROOT, ...relativePath.split('/')));
  } });
  assert.equal(missing.families.find(family => family.id === 'viewerxp').evidence.status, 'FAIL');
  assert.equal(missing.decision.isoStageAllowed, false);
});

test('even all CPU fixtures passing never authorizes ISO without backend and OBS witnesses', () => {
  const report = build({
    families: FAMILY_FILES.filter(family => family.id !== 'webgpu-weather-control'),
    loadJson(relativePath) {
      if (relativePath === MATRIX_PATH) {
        const matrix = require(path.join(ROOT, ...relativePath.split('/')));
        return { ...matrix, items: matrix.items.map(item => ({ ...item, obsEvidence: { status: 'PASS' } })) };
      }
      return require(path.join(ROOT, ...relativePath.split('/')));
    }
  });
  assert.equal(report.gates.sourceFixtureReady.status, 'PASS');
  assert.equal(report.summary.fixtureEvidencePassed, 8);
  assert.equal(report.decision.status, 'NOT_READY');
  assert.equal(report.decision.isoStageAllowed, false);
  assert.equal(report.decision.freezeContract, 'HOLD');
});

test('a green current CPU family remains NOT_READY with backend and OBS at zero', () => {
  const report = build({ families: FAMILY_FILES.filter(family => family.id === 'advanced-timer') });
  assert.equal(report.summary.staticManifestsPassed, 1);
  assert.equal(report.summary.fixtureEvidencePassed, 1);
  assert.equal(report.summary.actualOriginalConsumerFourLocaleCoverage, '1/1');
  assert.equal(report.summary.liveBackendWitnessesObserved, 0);
  assert.equal(report.summary.realObsCasesChecked, 0);
  assert.equal(report.summary.realObsCasesExpected, 104);
  assert.equal(report.decision.status, 'NOT_READY');
  assert.equal(report.decision.transferReady, false);
  assert.equal(report.decision.isoStageAllowed, false);
  assert.equal(report.decision.freezeContract, 'HOLD');
  assert.throws(() => assertTransferReady(report), error => error.code === 'TRANSFER_NOT_READY');
});

test('empty families and duplicate matrix case IDs fail closed', () => {
  const empty = build({ families: [] });
  assert.equal(empty.decision.status, 'BLOCKED');
  assert.equal(empty.decision.isoStageAllowed, false);

  const duplicate = build({ loadJson(relativePath) {
    const value = require(path.join(ROOT, ...relativePath.split('/')));
    if (relativePath === MATRIX_PATH) return { ...value, items: value.items.map((item, index) => index === 1 ? { ...item, caseId: value.items[0].caseId } : item) };
    return value;
  } });
  assert.equal(duplicate.decision.status, 'BLOCKED');
  assert.ok(duplicate.decision.reasons.some(reason => /duplicate case ids/.test(reason)));
});
