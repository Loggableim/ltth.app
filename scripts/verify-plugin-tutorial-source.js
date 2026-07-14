'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { LOCALES, buildGuides } = require('./plugin-tutorial-source');

const ROOT = path.resolve(__dirname, '..');
const manifestRoots = [path.join(ROOT, 'app', 'plugins'), path.join(ROOT, 'plugin-store', 'sources')];
const manifests = manifestRoots.flatMap((pluginRoot) => fs.readdirSync(pluginRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(pluginRoot, entry.name, 'plugin.json')))
  .map((entry) => JSON.parse(fs.readFileSync(path.join(pluginRoot, entry.name, 'plugin.json'), 'utf8'))))
  .filter((manifest) => manifest.id !== 'store-admin');
const source = fs.readFileSync(path.join(__dirname, 'plugin-tutorial-source.js'), 'utf8');
const captureSource = fs.readFileSync(path.join(__dirname, 'capture-product-screenshots.js'), 'utf8');
const guides = buildGuides(ROOT);

assert.deepStrictEqual(LOCALES, ['de', 'en', 'es', 'fr']);
assert.ok(!source.includes('function stepCopy('), 'step copy must not be selected from a shared index-based template');
assert.ok(!source.includes('function buildSteps('), 'capture steps must not be built from a shared index-based template');
assert.ok(!source.includes('return `#${stepId}`;'), 'capture selectors must come from verified UI anchors, not generated step ids');
assert.ok(!captureSource.includes('applyCaptureFocus'), 'captures must not draw synthetic focus frames or labels');
assert.ok(!captureSource.includes('revealSafeDemoState'), 'captures must not force hidden UI into view');
assert.ok(!captureSource.includes('data-ltth-docs-'), 'captures must not inject documentation-only DOM state');
assert.ok(!captureSource.includes('document.createElement('), 'captures must not inject synthetic DOM elements');
assert.ok(captureSource.includes('asset.action && asset.action.allowClick'), 'a declared local-safe action must be able to execute its real workflow');
assert.strictEqual(guides.length, manifests.length + 1, 'every manifest plus Store Admin needs one guide');
assert.ok(guides.some((guide) => guide.id === 'visual-fx-frame-webgpu'), 'Visual FX Frame WEBGPU needs a guide');
const workflowSignatures = new Set();
const SAFE_ACTION_TYPES = new Set([
  'open-plugin-manager',
  'open-plugin-surface',
  'set-demo-value',
  'save-demo-config',
  'run-local-preview',
  'open-local-settings',
  'select-local-source',
  'open-overlay-preview',
  'inspect-readonly-api',
  'inspect-safe-store-state',
  'reset-demo-state'
]);
const GENERIC_SELECTORS = new Set(['body', 'main', 'form', '[role="main"]', '.container', '#app', 'canvas']);

for (const guide of guides) {
  assert.ok(guide.steps.length >= 5 && guide.steps.length <= 9, `${guide.id} must have 5–9 specific steps`);
  const signature = guide.steps.map((step) => step.id).join('|');
  assert.ok(!workflowSignatures.has(signature), `${guide.id} must not reuse a generic workflow`);
  workflowSignatures.add(signature);
  assert.ok(guide.capture && guide.capture.fixture, `${guide.id} needs a safe capture fixture`);
  for (const locale of LOCALES) {
    for (const field of ['title', 'summary', 'firstResult', 'requirements', 'safety', 'troubleshooting']) {
      assert.ok(guide.copy[locale][field], `${guide.id} is missing ${locale} ${field}`);
    }
  }
  for (const step of guide.steps) {
    assert.ok(step.id && typeof step.id === 'string', `${guide.id} needs an explicit step id`);
    assert.ok(step.capture.route.startsWith('/'), `${guide.id}/${step.id} needs an application route`);
    assert.ok(step.capture.assertVisible, `${guide.id}/${step.id} needs a visible UI assertion`);
    assert.notStrictEqual(step.capture.assertVisible, 'body', `${guide.id}/${step.id} must not use the body as its UI assertion`);
    assert.ok(!step.capture.assertVisible.includes(','), `${guide.id}/${step.id} must use one explicit UI selector`);
    assert.ok(!GENERIC_SELECTORS.has(step.capture.assertVisible), `${guide.id}/${step.id} must not use a generic UI selector`);
    assert.ok(step.capture.action && SAFE_ACTION_TYPES.has(step.capture.action.type), `${guide.id}/${step.id} needs a declared safe action type`);
    if (step.capture.action.allowClick) {
      assert.ok(['save-demo-config', 'run-local-preview', 'open-local-settings', 'select-local-source'].includes(step.capture.action.type), `${guide.id}/${step.id} may only click a declared local-safe action`);
    }
    if (step.capture.action.clickSelector) {
      assert.ok(typeof step.capture.action.clickSelector === 'string' && step.capture.action.clickSelector.startsWith('#'), `${guide.id}/${step.id} needs an explicit local click selector`);
    }
    if (step.capture.action.cleanupSelector) {
      const isManualGameCleanup = guide.id === 'game-engine' && step.id === 'test-round' && step.capture.action.cleanupSelector === '#end-manual-game';
      const isQuizCleanup = guide.id === 'quiz-show' && ['answer-window', 'sample-question', 'quiz-reset'].includes(step.id) && step.capture.action.cleanupSelector === '#stopQuizBtn';
      assert.ok(isManualGameCleanup || isQuizCleanup, `${guide.id}/${step.id} may only declare a verified local workflow cleanup`);
    }
    if (step.capture.action.prepare) {
      const isTimerDemo = guide.id === 'advanced-timer' && step.id === 'countdown-preview' && step.capture.action.prepare === 'create-demo-timer';
      const isTimerOverlayDemo = guide.id === 'advanced-timer' && step.id === 'timer-overlay' && step.capture.action.prepare === 'create-demo-timer-overlay';
      const isTikFinitySave = guide.id === 'data-source' && step.id === 'data-preview' && step.capture.action.prepare === 'select-local-tikfinity';
      const isFireworksSettings = guide.id === 'fireworks' && ['fireworks-card', 'effect-profile', 'audio-limit', 'fireworks-reset'].includes(step.id) && step.capture.action.prepare === 'open-fireworks-settings';
      const isFlameTab = guide.id === 'flame-overlay' && ((step.id === 'frame-style' && step.capture.action.prepare === 'open-flame-frame-tab') || (step.id === 'frame-intensity' && step.capture.action.prepare === 'open-flame-motion-tab'));
      const isManualGame = guide.id === 'game-engine' && ['test-round', 'queue-reset'].includes(step.id) && step.capture.action.prepare === 'start-local-manual-game';
      const isGoalsCreate = guide.id === 'goals' && ['goal-target', 'reset-rule', 'progress-pulse', 'goal-reset'].includes(step.id) && step.capture.action.prepare === 'open-goal-create-modal';
      const isGoalsOverlayDemo = guide.id === 'goals' && step.id === 'goal-overlay' && step.capture.action.prepare === 'create-demo-goal-overlay';
      const isMilestoneTier = guide.id === 'milestone-leaderboard' && ['xp-rule', 'milestone'].includes(step.id) && step.capture.action.prepare === 'open-milestone-tier-modal';
      const isOpenShockSafety = guide.id === 'openshock' && ['safety-card', 'safe-limit'].includes(step.id) && step.capture.action.prepare === 'open-openshock-safety-tab';
      const isMinecraftTab = guide.id === 'minecraft-connect'
        && ((step.id === 'offline-address' && step.capture.action.prepare === 'open-minecraft-setup-tab')
          || (step.id === 'event-format' && step.capture.action.prepare === 'open-minecraft-chat-tab'));
      const isQuizWorkflow = guide.id === 'quiz-show'
        && ((step.id === 'question-pool' && step.capture.action.prepare === 'open-quiz-questions-tab')
          || (['answer-window', 'sample-question', 'quiz-reset'].includes(step.id) && step.capture.action.prepare === 'start-local-quiz')
          || (step.id === 'quiz-overlay' && step.capture.action.prepare === 'open-quiz-overlay-config-tab'));
      const isSoundboardWorkspace = guide.id === 'soundboard'
        && ((['sound-slot', 'volume-rule'].includes(step.id) && step.capture.action.prepare === 'open-soundboard-event-sounds')
          || (step.id === 'muted-sound-test' && step.capture.action.prepare === 'open-soundboard-obs-overlay'));
      const isStoreAdminView = guide.id === 'store-admin' && step.capture.action.prepare === 'open-store-admin-view';
      const isSpotlightWorkflow = guide.id === 'spotlight'
        && ((['event-style', 'display-duration'].includes(step.id) && step.capture.action.prepare === 'open-spotlight-settings')
          || (['chatter-preview', 'spotlight-overlay', 'spotlight-reset'].includes(step.id) && step.capture.action.prepare === 'open-spotlight-preview'));
      const isStreamAlchemySettings = guide.id === 'streamalchemy' && ['alchemy-card', 'automation-rule', 'action-chain', 'rule-dry-run'].includes(step.id) && step.capture.action.prepare === 'open-streamalchemy-settings';
      assert.ok(isTimerDemo || isTimerOverlayDemo || isTikFinitySave || isFireworksSettings || isFlameTab || isManualGame || isGoalsCreate || isGoalsOverlayDemo || isMilestoneTier || isOpenShockSafety || isMinecraftTab || isQuizWorkflow || isSoundboardWorkspace || isStoreAdminView || isSpotlightWorkflow || isStreamAlchemySettings, `${guide.id}/${step.id} may only prepare a verified local demo workflow`);
    }
    assert.ok(step.capture.focusText && typeof step.capture.focusText === 'object', `${guide.id}/${step.id} needs localized focus text`);
    assert.ok(!step.capture.route.includes('docsPlugin='), `${guide.id}/${step.id} must not capture the ignored docsPlugin parameter`);
    for (const locale of LOCALES) {
      for (const field of ['title', 'body', 'expected', 'alt']) {
        assert.ok(step.copy[locale][field], `${guide.id}/${step.id} is missing ${locale} ${field}`);
      }
    }
  }
}

console.log(`OK: ${guides.length} plugin-specific guides with localized, actionable capture steps.`);
