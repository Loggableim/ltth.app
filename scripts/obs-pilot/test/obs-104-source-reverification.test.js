'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { buildAudit } = require('../reverify-obs-104-source');

const AUDIT = buildAudit();

test('reverifies the full 104-case denominator without converting retirement controls into OBS passes', () => {
  assert.equal(AUDIT.cases.length, 104);
  assert.equal(new Set(AUDIT.cases.map(item => item.caseId)).size, 104);
  assert.deepEqual(AUDIT.counts.scopes, {
    CURRENT_PUBLIC_OVERLAY_GUIDE: 68,
    CHATANGO_RETIRED_CONTROL: 4,
    LOCAL_CLOSED_BETA_OVERLAY: 32
  });
  assert.equal(AUDIT.counts.activeObsRendererCases, 100);
  assert.equal(AUDIT.counts.retiredControlCases, 4);
  assert.equal(AUDIT.counts.obsPassed, 0);
  assert.equal(AUDIT.counts.obsNotTested, 104);
  assert.equal(AUDIT.policy.obsStarted, false);
  assert.equal(AUDIT.policy.vmStarted, false);
  assert.equal(AUDIT.policy.publicTunnelStarted, false);
  assert.equal(AUDIT.policy.retiredControlCasesAreObsPasses, false);
});

test('all current active renderer and locale files exist and static HTML references resolve locally', () => {
  const active = AUDIT.cases.filter(item => item.countsAsActiveObsRendererCase);
  assert.equal(active.length, 100);
  assert.ok(active.every(item => item.renderer.exists && item.renderer.isHtmlDocument));
  assert.ok(active.every(item => item.renderer.localeFile.exists));
  assert.equal(AUDIT.counts.unresolvedLocalStaticDependencies, 0);
  assert.equal(AUDIT.counts.publicOverlayRegistryDeniedRuntimeEndpoints, 0);
});

test('the current source-route drift remains visible instead of inheriting stale handler claims', () => {
  const musicCases = AUDIT.cases.filter(item => item.plugin === 'music-bot');
  assert.equal(musicCases.length, 4);
  for (const item of musicCases) {
    assert.equal(item.route.recordedHandlerPathStatus, 'recorded-handler-path-not-found-in-current-handler-source');
    assert.ok(item.route.currentOverlayRouteLiterals.includes('/plugins/music-bot/overlay'));
    assert.equal(item.route.exactRegistryEntrypoint, true);
    assert.equal(item.renderer.path, 'app/plugins/music-bot/overlay.html');
  }
});

test('Chatango remains four explicit retirement controls with no renderer or OBS pass', () => {
  const chatango = AUDIT.cases.filter(item => item.plugin === 'chatango');
  assert.equal(chatango.length, 4);
  assert.ok(chatango.every(item => item.acceptanceScope === 'CHATANGO_RETIRED_CONTROL'));
  assert.ok(chatango.every(item => !item.renderer.exists && item.obsStatus === 'NOT_TESTED' && item.notAnObsPass));
});

test('fixture evidence distinguishes existing named tests from missing test declarations', () => {
  assert.equal(AUDIT.counts.casesWithNamedFixtureTests, 28);
  assert.equal(AUDIT.counts.casesWithMissingNamedFixtureTests, 76);
  assert.ok(AUDIT.cases.filter(item => item.fixtureCoverage.fixtureTest.exists)
    .every(item => item.fixtureCoverage.fixtureWasRunByThisAudit === false));
  assert.ok(AUDIT.cases.filter(item => !item.fixtureCoverage.fixtureTest.exists)
    .every(item => item.fixtureCoverage.exactCoverageGap.startsWith('No existing isolated fixture test')));
});

test('OpenShock primary overlay fixture is declared for four public locales while OBS remains untested', () => {
  const cases = AUDIT.cases.filter(item => item.plugin === 'openshock');
  assert.equal(cases.length, 4);
  assert.ok(cases.every(item => item.acceptanceScope === 'CURRENT_PUBLIC_OVERLAY_GUIDE'));
  assert.ok(cases.every(item => item.fixtureCoverage.fixtureTest.path === 'app/plugins/openshock/test/obs-primary-overlay-fixture.test.js'));
  assert.ok(cases.every(item => item.fixtureCoverage.fixtureTest.exists));
  assert.ok(cases.every(item => item.obsStatus === 'NOT_TESTED' && item.notAnObsPass));
});

test('Flame Overlay and Fireworks have source-backed trigger fixtures for all four public locales only', () => {
  for (const plugin of ['flame-overlay', 'fireworks']) {
    const cases = AUDIT.cases.filter(item => item.plugin === plugin);
    assert.equal(cases.length, 4);
    assert.ok(cases.every(item => item.acceptanceScope === 'CURRENT_PUBLIC_OVERLAY_GUIDE'));
    assert.ok(cases.every(item => item.fixtureCoverage.fixtureTest.path === 'app/test/obs-priority-trigger-renderer-fixtures.test.js'));
    assert.ok(cases.every(item => item.fixtureCoverage.fixtureTest.exists));
    assert.ok(cases.every(item => item.obsStatus === 'NOT_TESTED' && item.notAnObsPass));
  }
  assert.equal(AUDIT.counts.obsPassed, 0);
  assert.equal(AUDIT.counts.obsNotTested, 104);
});
