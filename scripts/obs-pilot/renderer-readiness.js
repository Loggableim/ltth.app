'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { validateRendererFixtureManifest } = require('./renderer-fixture-contract');

const FAMILY_FILES = Object.freeze([
  ['advanced-timer', 'obs-104-advanced-timer-fixture.json', 'obs-104-renderer-fixture-evidence.json'],
  ['stt-ticker', 'obs-104-stt-ticker-fixture.json', 'obs-104-stt-ticker-fixture-evidence.json'],
  ['goals', 'obs-104-goals-fixture.json', 'obs-104-goals-fixture-evidence.json'],
  ['spotlight', 'obs-104-spotlight-fixture.json', 'obs-104-spotlight-fixture-evidence.json'],
  ['quiz-show', 'obs-104-quiz-show-fixture.json', 'obs-104-quiz-show-fixture-evidence.json'],
  ['toptier', 'obs-104-toptier-fixture.json', 'obs-104-toptier-fixture-evidence.json'],
  ['interactive-story', 'obs-104-interactive-story-fixture.json', 'obs-104-interactive-story-fixture-evidence.json'],
  ['viewerxp', 'obs-104-viewerxp-fixture.json', 'obs-104-viewerxp-fixture-evidence.json'],
  ['webgpu-weather-control', 'obs-104-webgpu-weather-control-fixture.json', 'obs-104-webgpu-weather-control-fixture-evidence.json']
].map(([id, manifest, evidence]) => Object.freeze({
  id,
  manifestPath: `docs/coordination/${manifest}`,
  evidencePath: `docs/coordination/${evidence}`
})));

const EXPECTED_LOCALES = Object.freeze(['de', 'en', 'es', 'fr']);
const MATRIX_PATH = 'docs/coordination/obs-104-acceptance-matrix.json';
const REPORT_PATH = 'docs/coordination/obs-104-renderer-readiness.json';
const REQUIRED_SHARED_WITNESSES = Object.freeze({
  'webgpu-weather-control': Object.freeze(['app/modules/public-overlay-payload-projection.js'])
});

class RendererReadinessError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RendererReadinessError';
    this.code = code;
  }
}

function isPlainRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function safeRepoPath(repoRoot, relativePath, fsApi) {
  if (typeof relativePath !== 'string' || !relativePath || relativePath.includes('\\')
    || path.posix.isAbsolute(relativePath) || relativePath.split('/').includes('..')) {
    throw new Error('path is not a safe repository-relative path');
  }
  const root = fsApi.realpathSync(repoRoot);
  const absolutePath = path.resolve(root, ...relativePath.split('/'));
  const relative = path.relative(root, absolutePath);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('path escapes the repository root');
  }
  let current = root;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    const stat = fsApi.lstatSync(current);
    if (stat.isSymbolicLink() || stat.isReparsePoint === true) throw new Error('reparse point is forbidden');
  }
  const resolved = fsApi.realpathSync(absolutePath);
  const finalRelative = path.relative(root, resolved);
  if (finalRelative === '..' || finalRelative.startsWith(`..${path.sep}`) || path.isAbsolute(finalRelative)) {
    throw new Error('resolved path escapes the repository root');
  }
  if (!fsApi.statSync(resolved).isFile()) throw new Error('only regular files are allowed');
  return resolved;
}

function readJson(repoRoot, relativePath, fsApi) {
  const absolute = safeRepoPath(repoRoot, relativePath, fsApi);
  return JSON.parse(fsApi.readFileSync(absolute, 'utf8'));
}

function collectActualLocales(evidence) {
  const direct = evidence?.coverage?.locales ?? evidence?.evidence?.locales;
  if (Array.isArray(direct)) return [...direct].sort();
  if (typeof direct === 'string' && /selects and renders de\/en\/es\/fr/i.test(direct)) return [...EXPECTED_LOCALES];
  return [];
}

function verifySourceWitnesses(repoRoot, evidence, fsApi) {
  if (!Array.isArray(evidence?.sourceWitnesses) || evidence.sourceWitnesses.length === 0) {
    return { status: 'FAIL', checked: 0, failures: ['sourceWitnesses are missing'] };
  }
  const seen = new Set();
  const failures = [];
  for (const witness of evidence.sourceWitnesses) {
    if (!isPlainRecord(witness) || typeof witness.path !== 'string' || !/^[a-f0-9]{64}$/.test(witness.sha256 || '')) {
      failures.push('invalid source witness entry');
      continue;
    }
    const folded = witness.path.toLowerCase();
    if (seen.has(folded)) {
      failures.push(`duplicate source witness: ${witness.path}`);
      continue;
    }
    seen.add(folded);
    try {
      const currentPath = safeRepoPath(repoRoot, witness.path, fsApi);
      const actual = sha256(fsApi.readFileSync(currentPath));
      if (actual !== witness.sha256) failures.push(`stale source witness: ${witness.path}`);
    } catch (error) {
      failures.push(`unavailable source witness ${witness.path}: ${error.message}`);
    }
  }
  return { status: failures.length ? 'FAIL' : 'PASS', checked: seen.size, failures };
}

function verifyFixtureResult(evidence) {
  const result = evidence?.result;
  if (!isPlainRecord(result) || result.exitCode !== 0 || result.testsFailed !== 0
    || !Number.isSafeInteger(result.testsPassed) || result.testsPassed < 1
    || !Number.isSafeInteger(result.testSuitesPassed) || result.testSuitesPassed < 1) {
    return { status: 'FAIL', reason: 'passing source-fixture result is missing or invalid' };
  }
  return {
    status: 'PASS',
    testSuitesPassed: result.testSuitesPassed,
    testsPassed: result.testsPassed,
    testsFailed: result.testsFailed
  };
}

function verifyEvidenceManifest(manifestPath, manifestRelativePath, manifest, evidence, fsApi) {
  const manifestBytes = fsApi.readFileSync(manifestPath);
  const expected = evidence?.manifest;
  if (!isPlainRecord(expected)) throw new Error('evidence manifest summary is missing');
  const fileCount = manifest.files.length;
  const localeCount = manifest.files.filter(file => file.role === 'plugin-locale').length;
  const byteCount = manifest.files.reduce((sum, file) => sum + file.bytes, 0);
  if (expected.path !== manifestRelativePath
    || expected.sha256 !== sha256(manifestBytes) || expected.files !== fileCount
    || expected.localeFiles !== localeCount || expected.bytes !== byteCount) {
    throw new Error('evidence does not match the current manifest path, SHA-256, file count, locale count or byte total');
  }
  return { sha256: expected.sha256, files: fileCount, localeFiles: localeCount, bytes: byteCount };
}

function buildFamily(repoRoot, family, { fsApi, loadJson, validateManifest }) {
  const failures = [];
  let manifest;
  let evidence;
  let staticClosure;
  let evidenceManifest;
  let sourceWitnesses;
  let fixtureResult;
  try {
    manifest = loadJson(family.manifestPath);
    staticClosure = validateManifest(repoRoot, manifest, { fsApi });
  } catch (error) {
    failures.push(`static closure: ${error.message}`);
  }
  try {
    evidence = loadJson(family.evidencePath);
    if (!isPlainRecord(evidence)) throw new Error('evidence must be an object');
    if (manifest) {
      const manifestAbsolute = safeRepoPath(repoRoot, family.manifestPath, fsApi);
      evidenceManifest = verifyEvidenceManifest(manifestAbsolute, family.manifestPath, manifest, evidence, fsApi);
    }
    sourceWitnesses = verifySourceWitnesses(repoRoot, evidence, fsApi);
    if (sourceWitnesses.status !== 'PASS') failures.push(...sourceWitnesses.failures);
    fixtureResult = verifyFixtureResult(evidence);
    if (fixtureResult.status !== 'PASS') failures.push(fixtureResult.reason);
  } catch (error) {
    failures.push(`evidence: ${error.message}`);
  }

  const pending = isPlainRecord(evidence?.pendingSharedSourceReview)
    ? {
      status: 'PENDING',
      path: evidence.pendingSharedSourceReview.path || null,
      reason: evidence.pendingSharedSourceReview.status || 'shared-source review pending',
      gate: evidence.pendingSharedSourceReview.gate || null
    }
    : { status: 'NONE' };
  const requiredShared = REQUIRED_SHARED_WITNESSES[family.id] || [];
  const witnessPaths = new Set((evidence?.sourceWitnesses || []).filter(isPlainRecord).map(witness => witness.path));
  const requiredSharedMissing = requiredShared.filter(relativePath => !witnessPaths.has(relativePath)
    && !(pending.status === 'PENDING' && pending.path === relativePath));
  if (requiredSharedMissing.length) {
    failures.push(`required shared source witness is neither pinned nor explicitly pending: ${requiredSharedMissing.join(', ')}`);
  }
  const sharedSourceStatus = pending.status === 'PENDING'
    ? 'PENDING'
    : (requiredShared.every(relativePath => witnessPaths.has(relativePath))
      ? (sourceWitnesses?.status === 'PASS' ? 'CLEAR' : 'FAIL')
      : (requiredShared.length ? 'FAIL' : 'NONE'));
  const actualLocales = collectActualLocales(evidence);
  const localeCoverage = actualLocales.length === EXPECTED_LOCALES.length
    && actualLocales.every((locale, index) => locale === EXPECTED_LOCALES[index])
    ? { status: 'PASS', locales: actualLocales }
    : { status: 'NOT_COVERED', locales: actualLocales, pinnedLocaleFiles: evidenceManifest?.localeFiles ?? null };
  const producerScope = manifest?.runnerContract?.pluginControlProducer || null;
  const liveBackendWitness = {
    status: 'NOT_OBSERVED',
    fixtureProducerScope: producerScope,
    note: 'A CPU fixture producer description is not evidence of a live backend/database witness.'
  };

  return {
    id: family.id,
    manifestPath: family.manifestPath,
    evidencePath: family.evidencePath,
    staticClosure: staticClosure
      ? { status: 'PASS', files: staticClosure.files.length, bytes: staticClosure.totalBytes, localeFiles: staticClosure.files.filter(file => file.role === 'plugin-locale').length }
      : { status: 'FAIL' },
    evidence: evidenceManifest ? { status: failures.length ? 'FAIL' : 'PASS', ...evidenceManifest } : { status: 'FAIL' },
    originalConsumerFixture: fixtureResult || { status: 'FAIL' },
    actualOriginalConsumerLocales: localeCoverage,
    liveBackendWitness,
    sharedSourceReview: { ...pending, status: sharedSourceStatus },
    obsAcceptance: { status: 'NOT_CHECKED', cases: 0 },
    failures
  };
}

function buildRendererReadiness(repoRoot, {
  fsApi = fs,
  families = FAMILY_FILES,
  loadJson = relativePath => readJson(repoRoot, relativePath, fsApi),
  validateManifest = validateRendererFixtureManifest
} = {}) {
  const inputFailures = [];
  if (!Array.isArray(families) || families.length === 0) {
    inputFailures.push('curated family inventory is empty or invalid');
    families = [];
  }
  const familyIds = new Set();
  for (const family of families) {
    if (!isPlainRecord(family) || typeof family.id !== 'string' || familyIds.has(family.id)) {
      inputFailures.push('curated family inventory contains an invalid or duplicate family id');
      break;
    }
    familyIds.add(family.id);
  }
  const familyResults = families.map(family => buildFamily(repoRoot, family, { fsApi, loadJson, validateManifest }));
  let matrix;
  const topLevelFailures = [];
  try {
    matrix = loadJson(MATRIX_PATH);
    if (!Number.isSafeInteger(matrix.caseCount) || matrix.caseCount !== 104 || !Array.isArray(matrix.items) || matrix.items.length !== 104) {
      topLevelFailures.push('acceptance matrix is not the exact 104-case source matrix');
    } else {
      const ids = matrix.items.map(item => isPlainRecord(item) ? item.caseId : null);
      if (ids.some(id => typeof id !== 'string' || !id) || new Set(ids).size !== matrix.items.length) {
        topLevelFailures.push('acceptance matrix contains missing or duplicate case ids');
      }
    }
  } catch (error) {
    topLevelFailures.push(`acceptance matrix: ${error.message}`);
  }

  const staticFailures = familyResults.filter(family => family.staticClosure.status !== 'PASS' || family.evidence.status !== 'PASS');
  const pendingFamilies = familyResults.filter(family => family.sharedSourceReview.status === 'PENDING');
  const sharedFailures = familyResults.filter(family => family.sharedSourceReview.status === 'FAIL');
  const fixtureFailures = familyResults.filter(family => family.originalConsumerFixture.status !== 'PASS');
  const allStaticOk = staticFailures.length === 0 && topLevelFailures.length === 0;
  const sharedSourceClear = pendingFamilies.length === 0;
  const consumerFixturesOk = fixtureFailures.length === 0;
  const localeCovered = familyResults.filter(family => family.actualOriginalConsumerLocales.status === 'PASS').length;
  const backendWitnessObserved = familyResults.filter(family => family.liveBackendWitness.status === 'PASS').length;
  const obsCaseCount = matrix?.caseCount || 104;
  const obsCasesVerified = Array.isArray(matrix?.items)
    ? matrix.items.filter(item => isPlainRecord(item.obsEvidence) && item.obsEvidence.status === 'PASS').length
    : 0;
  const backendClear = backendWitnessObserved === familyResults.length;
  const obsClear = obsCasesVerified === obsCaseCount;
  const sourceFixtureReady = familyResults.length > 0 && allStaticOk && consumerFixturesOk;
  // This report is a transfer/release decision, so source-fixture success alone can never authorize staging.
  const ready = false;
  const blocked = inputFailures.length > 0 || staticFailures.length > 0 || topLevelFailures.length > 0 || fixtureFailures.length > 0 || sharedFailures.length > 0;

  return {
    schemaVersion: 1,
    generatedAtUtc: new Date().toISOString(),
    scope: 'nine curated renderer CPU-fixture families; not the complete 26-family renderer inventory or a runtime package closure',
    decision: {
      status: blocked || pendingFamilies.length ? 'BLOCKED' : 'NOT_READY',
      releaseReady: ready,
      transferReady: ready,
      isoStageAllowed: ready,
      freezeContract: ready ? 'RELEASED' : 'HOLD',
      reasons: [
        ...inputFailures,
        ...topLevelFailures,
        ...staticFailures.flatMap(family => family.failures.map(failure => `${family.id}: ${failure}`)),
        ...fixtureFailures.map(family => `${family.id}: original consumer fixture evidence is not passing`),
        ...pendingFamilies.map(family => `${family.id}: shared source review pending for ${family.sharedSourceReview.path || 'an unpinned shared source'}`),
        ...sharedFailures.map(family => `${family.id}: required shared source witness is missing or stale`),
        ...(backendClear ? [] : [`live backend witnesses: ${backendWitnessObserved}/${familyResults.length}`]),
        ...(obsClear ? [] : [`real OBS acceptance: ${obsCasesVerified}/${obsCaseCount}`]),
        'release/transfer authorization requires a separate owner-approved gate; this CPU readiness report never enables staging',
        'real OBS acceptance is not checked; source fixtures do not satisfy Browser Source or visual review'
      ]
    },
    summary: {
      curatedFamilies: familyResults.length,
      staticManifestsPassed: familyResults.filter(family => family.staticClosure.status === 'PASS').length,
      fixtureEvidencePassed: familyResults.filter(family => family.originalConsumerFixture.status === 'PASS').length,
      actualOriginalConsumerFourLocaleCoverage: `${localeCovered}/${familyResults.length}`,
      sharedSourceReviewsPending: pendingFamilies.length,
      liveBackendWitnessesObserved: backendWitnessObserved,
      realObsCasesChecked: obsCasesVerified,
      realObsCasesExpected: obsCaseCount
    },
    gates: {
      sourceFixtureReady: { status: sourceFixtureReady ? 'PASS' : 'BLOCKED' },
      staticClosure: { status: allStaticOk ? 'PASS' : 'BLOCKED' },
      originalConsumerFixtures: { status: consumerFixturesOk ? 'PASS' : 'BLOCKED' },
      originalConsumerFourLocaleCoverage: { status: localeCovered === familyResults.length ? 'PASS' : 'PARTIAL' },
      liveBackendWitness: { status: 'NOT_OBSERVED' },
      sharedSourceReviews: { status: sharedFailures.length ? 'FAIL' : sharedSourceClear ? 'CLEAR' : 'BLOCKED' },
      realObs: { status: obsClear ? 'PASS' : 'NOT_CHECKED', casesChecked: obsCasesVerified, casesExpected: obsCaseCount }
    },
    families: familyResults
  };
}

function assertTransferReady(report) {
  if (!report || report.decision?.status !== 'READY' || report.decision?.transferReady !== true
    || report.decision?.isoStageAllowed !== true || report.decision?.freezeContract !== 'RELEASED') {
    throw new RendererReadinessError('TRANSFER_NOT_READY', 'Renderer evidence is not ready; ISO staging must not start and source freeze remains on hold.');
  }
  return true;
}

function runCli(args = process.argv.slice(2)) {
  const repoRoot = path.resolve(__dirname, '../..');
  const report = buildRendererReadiness(repoRoot);
  if (args.includes('--write-report')) {
    const reportPath = path.join(repoRoot, ...REPORT_PATH.split('/'));
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.decision.status === 'READY' ? 0 : 2;
}

if (require.main === module) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`${error.name || 'Error'}: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  EXPECTED_LOCALES,
  FAMILY_FILES,
  MATRIX_PATH,
  REPORT_PATH,
  RendererReadinessError,
  assertTransferReady,
  buildRendererReadiness,
  collectActualLocales,
  runCli,
  verifySourceWitnesses
};
