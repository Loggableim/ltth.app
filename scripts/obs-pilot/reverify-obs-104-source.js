'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { isHttpAllowed, isRegisteredEntrypoint } = require('../../app/modules/public-overlay-registry');

const ROOT = path.resolve(__dirname, '../..');
const INPUTS = Object.freeze({
  inventory: 'docs/coordination/obs-104-source-inventory.json',
  matrix: 'docs/coordination/obs-104-acceptance-matrix.json',
  checklist: 'docs/coordination/obs-104-readiness-checklist-20261007.json'
});
const OUTPUT = 'docs/coordination/obs-104-current-source-audit-20261008.json';
const LOCALES = Object.freeze(['de', 'en', 'es', 'fr']);
const EXPECTED_SCOPE_COUNTS = Object.freeze({
  CURRENT_PUBLIC_OVERLAY_GUIDE: 68,
  LOCAL_CLOSED_BETA_OVERLAY: 32,
  CHATANGO_RETIRED_CONTROL: 4
});

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function fileEvidence(relativePath) {
  if (typeof relativePath !== 'string' || !relativePath) return { path: relativePath || null, exists: false, sha256: null };
  const absolutePath = path.resolve(ROOT, relativePath);
  const exists = absolutePath.startsWith(`${ROOT}${path.sep}`) && fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile();
  return {
    path: relativePath,
    exists,
    sha256: exists ? createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex') : null
  };
}

function resolveStaticAsset(htmlPath, reference) {
  const cleanReference = reference.split(/[?#]/, 1)[0];
  if (!cleanReference || /\{\{|\$\{|<%|^data:|^blob:|^javascript:/i.test(cleanReference)) return null;
  if (/^(?:https?:)?\/\//i.test(cleanReference)) {
    return { reference, kind: 'external', exists: null, host: (() => { try { return new URL(cleanReference, 'https://relative.invalid').host; } catch { return null; } })() };
  }
  if (cleanReference.startsWith('/socket.io/') || cleanReference.startsWith('/api/')) {
    return {
      reference,
      kind: 'runtime-endpoint',
      publicOverlayRegistryAllows: isHttpAllowed({ method: 'GET', pathname: cleanReference.split(/[?#]/, 1)[0] }),
      exists: null
    };
  }
  if (!/\.(?:css|html?|js|mjs|cjs|json|png|jpe?g|gif|svg|webp|woff2?|ttf|otf|mp3|wav|mp4|webm|wasm)$/i.test(cleanReference)) return null;

  let candidate;
  if (htmlPath.startsWith('app/plugins/flame-overlay/') && cleanReference === 'default-config.js') {
    candidate = path.join(ROOT, 'app/plugins/flame-overlay/default-config.js');
  } else if (cleanReference.startsWith('/plugins/viewer-leaderboard/')) {
    candidate = path.join(ROOT, 'app/plugins/milestone-leaderboard/vendor/viewer-leaderboard', cleanReference.slice('/plugins/viewer-leaderboard/'.length));
  } else if (cleanReference.startsWith('/plugins/')) candidate = path.join(ROOT, 'app', cleanReference.slice(1));
  else if (cleanReference.startsWith('/openshock/openshock_overlay.')) candidate = path.join(ROOT, 'app/plugins/openshock/overlay', cleanReference.slice('/openshock/'.length));
  else if (cleanReference.startsWith('/openshock/')) candidate = path.join(ROOT, 'app/plugins/openshock', cleanReference.slice('/openshock/'.length));
  else if (cleanReference.startsWith('/quiz-show/')) candidate = path.join(ROOT, 'app/plugins/quiz-show', cleanReference.slice('/quiz-show/'.length));
  else if (cleanReference.startsWith('/overlay/talking-heads/')) candidate = path.join(ROOT, 'app/plugins/talking-heads', cleanReference.slice('/overlay/talking-heads/'.length));
  else if (cleanReference === '/flame-overlay/default-config.js') candidate = path.join(ROOT, 'app/plugins/flame-overlay/default-config.js');
  else if (cleanReference.startsWith('/flame-overlay/')) candidate = path.join(ROOT, 'app/plugins/flame-overlay/renderer', cleanReference.slice('/flame-overlay/'.length));
  else if (cleanReference === '/visual-fx-frame-webgpu/default-config.js') candidate = path.join(ROOT, 'app/plugins/visual-fx-frame-webgpu/default-config.js');
  else if (cleanReference.startsWith('/visual-fx-frame-webgpu/')) candidate = path.join(ROOT, 'app/plugins/visual-fx-frame-webgpu/renderer', cleanReference.slice('/visual-fx-frame-webgpu/'.length));
  else if (/^\/(?:js|css|fonts|images|assets|locales)\//.test(cleanReference)) candidate = path.join(ROOT, 'app/public', cleanReference.slice(1));
  else if (cleanReference.startsWith('/')) candidate = path.join(ROOT, 'app', cleanReference.slice(1));
  else candidate = path.resolve(ROOT, 'app', path.dirname(htmlPath.replace(/^app\//, '')), cleanReference);

  const exists = candidate.startsWith(`${ROOT}${path.sep}`) && fs.existsSync(candidate) && fs.statSync(candidate).isFile();
  return { reference, kind: 'local-static', exists, resolvedPath: exists ? path.relative(ROOT, candidate).replace(/\\/g, '/') : null };
}

function staticDependencies(htmlEvidence) {
  if (!htmlEvidence.exists) return [];
  const absolutePath = path.join(ROOT, htmlEvidence.path);
  const html = fs.readFileSync(absolutePath, 'utf8');
  const references = new Set();
  for (const match of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) references.add(match[1]);
  for (const match of html.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) references.add(match[1].trim());
  return [...references].map(reference => resolveStaticAsset(htmlEvidence.path, reference)).filter(Boolean);
}

function routeAudit(row) {
  const anchor = row.guideAnchor || {};
  const route = anchor.resolvedRoute || {};
  const handler = route.handler || {};
  const handlerEvidence = fileEvidence(handler.source);
  const rendererEvidence = fileEvidence(route.servedHtml);
  const handlerText = handlerEvidence.exists ? fs.readFileSync(path.join(ROOT, handler.source), 'utf8') : '';
  const handlerPathLiteralPresent = Boolean(handler.path && handlerText.includes(handler.path));
  const serverEvidence = fileEvidence('app/server.js');
  const serverText = fs.readFileSync(path.join(ROOT, 'app/server.js'), 'utf8');
  const genericPluginStaticMountPresent = /app\.use\(\s*['"]\/plugins['"]\s*,\s*express\.static\(/.test(serverText);
  const currentRouteLiterals = [...handlerText.matchAll(/registerRoute\(\s*['"](?:get|GET)['"]\s*,\s*['"]([^'"]+)['"]/g)]
    .map(match => match[1]).filter(value => /overlay|hud/i.test(value));
  const candidatePath = anchor.matrixPathname || (() => {
    try { return new URL(row.overlayUrl).pathname; } catch { return row.overlayPath || null; }
  })();
  const alternateCandidate = anchor.registeredAlternateCandidate || null;
  const alternateRegistered = alternateCandidate ? isRegisteredEntrypoint(alternateCandidate) : false;
  return {
    candidatePath: candidatePath || null,
    exactRegistryEntrypoint: candidatePath ? isRegisteredEntrypoint(candidatePath) : false,
    resolverClassification: route.resolution || 'not-recorded',
    handlerMethod: handler.method || null,
    handlerPath: handler.path || null,
    handlerSource: handlerEvidence,
    handlerPathLiteralPresent,
    currentOverlayRouteLiterals: [...new Set(currentRouteLiterals)],
    genericPluginStaticMount: route.resolution === 'global-plugin-static'
      ? { source: serverEvidence, mountPresent: genericPluginStaticMountPresent }
      : null,
    recordedHandlerPathStatus: route.resolution === 'global-plugin-static'
      ? (genericPluginStaticMountPresent ? 'generic-mount-verified-path-remains-local-file-check' : 'generic-mount-not-found')
      : (handlerPathLiteralPresent ? 'recorded-handler-path-found-in-current-source' : 'recorded-handler-path-not-found-in-current-handler-source'),
    servedRenderer: rendererEvidence,
    alternateCandidate,
    alternateCandidateRegistered: alternateRegistered,
    routeDecision: anchor.status || 'not-recorded',
    publicTunnelIsSeparateFromLocalObs: true
  };
}

function fixtureAudit(activeCase, checklistCase) {
  const testPath = activeCase?.fixtureTest || checklistCase?.existingEvidence?.fixtureTest || null;
  const testEvidence = fileEvidence(testPath);
  const sourceFiles = activeCase?.evidenceSources || (checklistCase?.existingEvidence?.evidenceSourceFiles || []).map(item => item.path);
  return {
    declaredStatus: activeCase?.status || 'retired-control',
    fixtureTest: testEvidence,
    fixtureWasRunByThisAudit: false,
    sourceFiles: sourceFiles.map(fileEvidence),
    exactCoverageGap: testEvidence.exists
      ? 'Named test file exists; this source audit does not assert its current test coverage or rerun it.'
      : 'No existing isolated fixture test is declared and present for this case; renderer/route/source verification is not runtime evidence.',
    blockerNotes: [
      ...(activeCase?.blocker ? [activeCase.blocker] : []),
      ...(checklistCase?.blockers || [])
    ]
  };
}

function latestHead() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8', windowsHide: true });
  return result.status === 0 ? result.stdout.trim() : null;
}

function buildAudit(repoRoot = ROOT) {
  if (path.resolve(repoRoot) !== ROOT) throw new Error('The OBS-104 source audit is bound to this workspace root');
  const inventory = readJson(INPUTS.inventory);
  const matrix = readJson(INPUTS.matrix);
  const checklist = readJson(INPUTS.checklist);
  const inventoryItems = inventory.items || [];
  const matrixItems = matrix.items || [];
  const checklistItems = checklist.cases || [];
  const byId = values => new Map(values.map(value => [value.caseId, value]));
  const matrixById = byId(matrixItems);
  const checklistById = byId(checklistItems);
  const seen = new Set();

  const cases = inventoryItems.map((sourceItem) => {
    const caseId = `${sourceItem.plugin}:${sourceItem.locale}`;
    if (seen.has(caseId)) throw new Error(`Duplicate OBS acceptance case ${caseId}`);
    seen.add(caseId);
    const activeCase = matrixById.get(caseId) || null;
    const checklistCase = checklistById.get(caseId) || null;
    if (!checklistCase) throw new Error(`Missing current checklist record for ${caseId}`);
    const retiredControl = checklistCase.acceptanceScope === 'CHATANGO_RETIRED_CONTROL';
    if (!retiredControl && !activeCase) throw new Error(`Missing active renderer profile for ${caseId}`);

    const route = routeAudit({ ...sourceItem, ...checklistCase });
    const html = route.servedRenderer;
    const localePath = `app/plugins/${sourceItem.plugin}/locales/${sourceItem.locale}.json`;
    const localeEvidence = fileEvidence(localePath);
    const dependencies = staticDependencies(html);
    return {
      caseId,
      plugin: sourceItem.plugin,
      locale: sourceItem.locale,
      acceptanceScope: checklistCase.acceptanceScope,
      denominatorMember: true,
      countsAsActiveObsRendererCase: !retiredControl,
      obsStatus: 'NOT_TESTED',
      obsVisualPass: false,
      notAnObsPass: true,
      route,
      renderer: {
        path: html.path || null,
        exists: html.exists,
        isHtmlDocument: html.exists && /<html(?:\s|>)/i.test(fs.readFileSync(path.join(ROOT, html.path), 'utf8')),
        localeFile: localeEvidence,
        declaredLocale: sourceItem.locale,
        dimensions: { width: sourceItem.width, height: sourceItem.height }
      },
      staticAssetDependencies: dependencies,
      rendererDependenciesFromSourceProfile: activeCase ? {
        gpu: activeCase.gpu || 'not-recorded',
        audio: activeCase.audio || 'not-recorded',
        external: activeCase.external || 'not-recorded'
      } : { gpu: 'not-applicable-retired-control', audio: 'not-applicable-retired-control', external: 'not-applicable-retired-control' },
      externalStaticDependencies: dependencies.filter(item => item.kind === 'external'),
      runtimeEndpointDependencies: dependencies.filter(item => item.kind === 'runtime-endpoint'),
      unresolvedLocalStaticDependencies: dependencies.filter(item => item.kind === 'local-static' && !item.exists),
      fixtureCoverage: fixtureAudit(activeCase, checklistCase),
      currentChecklistSourceReviewWasPreviouslyMarkedReverified: checklistCase.existingEvidence?.reverifiedNow === true,
      sourceInventoryPath: INPUTS.inventory,
      reverifiedAgainstCurrentCheckout: true
    };
  });

  if (cases.length !== 104 || seen.size !== 104) throw new Error(`Expected 104 unique acceptance records, found ${cases.length}`);
  const matrixActiveItems = matrixItems.filter(item => item.acceptanceScope !== 'CHATANGO_RETIRED_CONTROL');
  if (matrixItems.length !== 104 || matrixActiveItems.length !== 100) {
    throw new Error(`Expected 104 matrix records (100 active), found ${matrixItems.length} (${matrixActiveItems.length} active)`);
  }
  const scopeCounts = cases.reduce((counts, item) => {
    counts[item.acceptanceScope] = (counts[item.acceptanceScope] || 0) + 1;
    return counts;
  }, {});
  for (const [scope, expected] of Object.entries(EXPECTED_SCOPE_COUNTS)) {
    if (scopeCounts[scope] !== expected) throw new Error(`Expected ${expected} cases for ${scope}, found ${scopeCounts[scope] || 0}`);
  }

  const allSourcePaths = [...new Set([
    ...Object.values(INPUTS),
    'app/modules/public-overlay-registry.js',
    'app/server.js'
  ])];
  const sourcePins = allSourcePaths.map(fileEvidence);
  const notObs = cases.filter(item => item.obsStatus === 'NOT_TESTED' && item.notAnObsPass && !item.obsVisualPass).length;
  const counts = {
    totalDenominator: cases.length,
    activeObsRendererCases: cases.filter(item => item.countsAsActiveObsRendererCase).length,
    retiredControlCases: cases.filter(item => !item.countsAsActiveObsRendererCase).length,
    scopes: scopeCounts,
    obsPassed: cases.filter(item => item.obsVisualPass).length,
    obsNotTested: notObs,
    rendererFilesPresent: cases.filter(item => item.renderer.exists).length,
    rendererHtmlDocuments: cases.filter(item => item.renderer.isHtmlDocument).length,
    exactRegisteredCandidatePaths: cases.filter(item => item.route.exactRegistryEntrypoint).length,
    registeredAlternatePaths: cases.filter(item => item.route.alternateCandidateRegistered).length,
    recordedHandlerPathsNotFoundInCurrentSource: cases.filter(item => item.route.recordedHandlerPathStatus === 'recorded-handler-path-not-found-in-current-handler-source').length,
    genericStaticMountsVerified: cases.filter(item => item.route.genericPluginStaticMount?.mountPresent).length,
    localeFilesPresent: cases.filter(item => item.renderer.localeFile.exists).length,
    casesWithNamedFixtureTests: cases.filter(item => item.fixtureCoverage.fixtureTest.exists).length,
    casesWithMissingNamedFixtureTests: cases.filter(item => !item.fixtureCoverage.fixtureTest.exists).length,
    unresolvedLocalStaticDependencies: cases.reduce((sum, item) => sum + item.unresolvedLocalStaticDependencies.length, 0),
    publicOverlayRegistryDeniedRuntimeEndpoints: cases.reduce((sum, item) => sum + item.runtimeEndpointDependencies.filter(dep => !dep.publicOverlayRegistryAllows).length, 0),
    externalStaticDependencies: cases.reduce((sum, item) => sum + item.externalStaticDependencies.length, 0)
  };

  return {
    schemaVersion: 1,
    generatedAtUtc: new Date().toISOString(),
    status: 'current-source-reverified-no-obs-execution',
    sourceCommit: latestHead(),
    sourcePins,
    previousScope: {
      inventoryStatus: inventory.status,
      activeMatrixStatus: matrix.status,
      checklistStatus: checklist.status,
      revalidationSupersedesPriorCurrentnessClaims: true
    },
    counts,
    policy: {
      obsStarted: false,
      vmStarted: false,
      productProcessesStarted: false,
      publicTunnelStarted: false,
      realViewerDataUsed: false,
      staticAndFixtureEvidenceOnly: true,
      retiredControlCasesAreObsPasses: false
    },
    cases
  };
}

function writeAudit(repoRoot = ROOT) {
  const audit = buildAudit(repoRoot);
  const output = path.join(repoRoot, OUTPUT);
  fs.writeFileSync(output, `${JSON.stringify(audit, null, 2)}\n`);
  return { output, counts: audit.counts };
}

if (require.main === module) {
  try {
    const result = writeAudit();
    process.stdout.write(`${JSON.stringify(result.counts)}\nWrote ${result.output}\n`);
  } catch (error) {
    process.stderr.write(`OBS-104 source reverification failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { INPUTS, OUTPUT, EXPECTED_SCOPE_COUNTS, buildAudit, writeAudit };
