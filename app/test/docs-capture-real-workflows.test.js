const fs = require('fs');
const path = require('path');

const { buildGuides } = require('../../scripts/plugin-tutorial-source');

describe('documentation capture real workflows', () => {
  const repoRoot = path.join(__dirname, '..', '..');
  const guides = buildGuides(repoRoot);

  function step(pluginId, stepId) {
    return guides
      .find((guide) => guide.id === pluginId)
      .steps.find((guideStep) => guideStep.id === stepId);
  }

  test('opens the real ClarityHUD settings modal before documenting its reset control', () => {
    expect(step('clarityhud', 'hud-reset').capture).toMatchObject({
      assertVisible: '#reset-defaults-btn',
      action: {
        type: 'open-local-settings',
        allowClick: true,
        clickSelector: '#chat-settings-btn'
      }
    });
  });

  test('creates a local timer before documenting its dashboard preview', () => {
    expect(step('advanced-timer', 'countdown-preview').capture).toMatchObject({
      assertVisible: '#timers-container',
      action: {
        type: 'run-local-preview',
        prepare: 'create-demo-timer',
        allowClick: true,
        clickSelector: '#timer-form button[type="submit"]'
      }
    });
  });

  test('creates the isolated backup before documenting its result card', () => {
    expect(step('config-import', 'backup-cleanup').capture).toMatchObject({
      assertVisible: '#exportResultCard',
      action: {
        type: 'save-demo-config',
        allowClick: true,
        clickSelector: '#exportBtn'
      }
    });
  });

  test.each(['goal-target', 'reset-rule', 'progress-pulse', 'goal-reset'])(
    'opens the real Goals create dialog before documenting %s',
    (stepId) => {
      expect(step('goals', stepId).capture.action).toMatchObject({ prepare: 'open-goal-create-modal' });
    }
  );

  test.each(['xp-rule', 'milestone'])(
    'opens the real Milestone Leaderboard tier dialog before documenting %s',
    (stepId) => {
      expect(step('milestone-leaderboard', stepId).capture.action).toMatchObject({ prepare: 'open-milestone-tier-modal' });
    }
  );

  test('documents the Interactive Story overlay entry point instead of fabricating an idle overlay', () => {
    const overlay = step('interactive-story', 'story-overlay');
    expect(overlay.capture).toMatchObject({
      route: '/plugins/interactive-story/ui.html?demo=1',
      assertVisible: '#heroOpenOverlayBtn',
      action: { type: 'open-plugin-surface' }
    });
  });

  test('uses the actual Interactive Story offline vote-preview button', () => {
    expect(step('interactive-story', 'local-decision').capture).toMatchObject({
      route: '/plugins/interactive-story/ui.html?demo=1',
      assertVisible: '#toggleOverlayPreviewBtn',
      action: { type: 'run-local-preview', allowClick: true, clickSelector: '#toggleOverlayPreviewBtn', evidenceSelector: '#overlayPreviewContainer' }
    });
  });

  test('keeps the requested locale while reviewing the Interactive Story language selector', () => {
    const storyMode = step('interactive-story', 'story-mode');

    expect(storyMode.capture).toMatchObject({
      route: '/plugins/interactive-story/ui.html?demo=1',
      assertVisible: '#languageSelect',
      action: { type: 'open-plugin-surface' }
    });
    expect(storyMode.workflow.operations).toContainEqual({
      type: 'open-plugin-surface',
      selector: '#languageSelect'
    });
    expect(storyMode.workflow.captureRule.stateChange).toBe(false);
  });

  test.each(['store-card', 'official-source', 'package-status', 'store-inspection', 'store-review'])(
    'treats the signed-out Store Admin %s capture as review-only',
    (stepId) => {
      const storeStep = step('store-admin', stepId);

      expect(storeStep.capture.action).toMatchObject({
        type: 'inspect-safe-store-state',
        prepare: 'open-store-admin-view'
      });
      expect(storeStep.workflow.captureRule.stateChange).toBe(false);
    }
  );

  test('keeps JavaScript and localized shipped demo mode for every Interactive Story capture', () => {
    const guide = guides.find((candidate) => candidate.id === 'interactive-story');
    const runnerSource = fs.readFileSync(path.join(repoRoot, 'scripts', 'capture-product-screenshots.js'), 'utf8');
    const uiSource = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', 'interactive-story', 'ui.html'), 'utf8');

    expect(guide.steps).toHaveLength(6);
    expect(guide.steps.every((guideStep) => guideStep.capture.route === '/plugins/interactive-story/ui.html?demo=1')).toBe(true);
    expect(runnerSource).toContain('await page.setJavaScriptEnabled(true);');
    expect(runnerSource).not.toContain("asset.guideId === 'interactive-story'");
    expect(uiSource).toContain("const isPreviewMode = new URLSearchParams(window.location.search).get('demo') === '1';");
    expect(uiSource).toContain("const socket = isPreviewMode ? { on: () => {}, emit: () => {} } : io();");
    expect(uiSource).toContain('await window.i18n.init();');
    expect(uiSource).toMatch(/if\s*\(!isPreviewMode\)\s*\{\s*loadStatus\(\);\s*loadConfig\(\);\s*loadThemes\(\);\s*loadDebugLogs\(\);/);
  });

  test('describes the Interactive Story preview without inventing a demo vote', () => {
    const localPreview = step('interactive-story', 'local-decision');

    expect(JSON.stringify(localPreview.copy)).not.toContain('Test Voting Choices');
    for (const locale of ['de', 'en', 'es', 'fr']) {
      expect(localPreview.copy[locale].body).toMatch(/(?:preview|Vorschau|vista previa|aper(?:cu|çu))/i);
      expect(localPreview.copy[locale].expected).not.toMatch(/(?:sample choices|Beispieloptionen|opciones de ejemplo|choix exemples)/i);
    }
  });

  test.each(['safety-card', 'safe-limit'])(
    'opens the real OpenShock Safety tab before documenting %s',
    (stepId) => {
      expect(step('openshock', stepId).capture.action).toMatchObject({ prepare: 'open-openshock-safety-tab' });
    }
  );

  test('documents the real empty OpenShock overlay without fabricating a hardware event', () => {
    const overlay = step('openshock', 'shock-overlay');

    expect(overlay.capture).toMatchObject({
      route: '/plugins/openshock/overlay/openshock_overlay.html',
      assertVisible: '.background-orbs',
      action: { type: 'open-overlay-preview' }
    });
    expect(overlay.workflow.captureRule.stateChange).toBe(false);
  });

  test.each([
    ['config-import', 'export-scope'],
    ['openshock', 'device-placeholder'],
    ['goals', 'goal-reset'],
    ['game-engine', 'game-mode'],
    ['talking-heads', 'character-select'],
    ['toptier', 'ranking-rule']
  ])(
    'does not falsely require a state change for the review-only %s/%s screenshot',
    (pluginId, stepId) => {
      expect(step(pluginId, stepId).workflow.captureRule.stateChange).toBe(false);
    }
  );

  test.each([
    ['goals', 'goal-target'],
    ['goals', 'reset-rule'],
    ['openshock', 'safe-limit']
  ])(
    'keeps the actual editable %s/%s workflow state-changing',
    (pluginId, stepId) => {
      expect(step(pluginId, stepId).workflow.captureRule.stateChange).toBe(true);
    }
  );

  test('opens the real Minecraft configuration tabs before documenting fields inside them', () => {
    expect(step('minecraft-connect', 'offline-address').capture.action).toMatchObject({ prepare: 'open-minecraft-setup-tab' });
    expect(step('minecraft-connect', 'event-format').capture.action).toMatchObject({ prepare: 'open-minecraft-chat-tab' });
  });

  test('creates a local Quiz Show question before documenting a running round', () => {
    expect(step('quiz-show', 'question-pool').capture.action).toMatchObject({ prepare: 'open-quiz-questions-tab' });
    expect(step('quiz-show', 'answer-window').capture.action).toMatchObject({ type: 'run-local-preview', prepare: 'start-local-quiz', preparationEvidenceSelector: '#timerDisplay', cleanupSelector: '#stopQuizBtn' });
    expect(step('quiz-show', 'sample-question').capture).toMatchObject({ assertVisible: '#currentQuestionDisplay' });
    expect(step('quiz-show', 'sample-question').capture.action).toMatchObject({ type: 'run-local-preview', prepare: 'start-local-quiz', preparationEvidenceSelector: '#timerDisplay', cleanupSelector: '#stopQuizBtn' });
    expect(step('quiz-show', 'quiz-reset').capture).toMatchObject({ assertVisible: '#startQuizBtn' });
    expect(step('quiz-show', 'quiz-reset').capture.action).toMatchObject({ type: 'reset-demo-state', prepare: 'start-local-quiz', preparationEvidenceSelector: '#timerDisplay', allowClick: true, clickSelector: '#stopQuizBtn', evidenceSelector: '#timerDisplay', confirmDialog: true });
  });

  test('documents the Quiz Show overlay configuration entry point rather than an empty overlay', () => {
    expect(step('quiz-show', 'quiz-overlay').capture).toMatchObject({
      route: '/plugins/quiz-show/quiz_show.html',
      assertVisible: '#openOverlayBtn',
      action: { type: 'open-plugin-surface', prepare: 'open-quiz-overlay-config-tab' }
    });
  });

  test('opens the real Soundboard workspaces and documents its visible volume slider', () => {
    expect(step('soundboard', 'sound-slot').capture.action).toMatchObject({ prepare: 'open-soundboard-event-sounds' });
    expect(step('soundboard', 'volume-rule').capture).toMatchObject({
      assertVisible: '#soundboard-gift-volume-slider',
      action: { prepare: 'open-soundboard-event-sounds' }
    });
    expect(step('soundboard', 'muted-sound-test').capture.action).toMatchObject({ prepare: 'open-soundboard-obs-overlay' });
  });

  test('accepts the native confirmation after the real local Soundboard save', () => {
    expect(step('soundboard', 'soundboard-review').capture.action).toMatchObject({
      allowClick: true,
      clickSelector: '[data-save-proxy]',
      evidenceSelector: '#soundboard-save-state',
      confirmDialog: true
    });
  });

  test('opens the real Store Admin view without touching sources or packages', () => {
    expect(step('store-admin', 'store-card').capture).toMatchObject({
      route: '/dashboard.html',
      assertVisible: '.plugin-store-mode-tabs',
      action: { type: 'inspect-safe-store-state', prepare: 'open-store-admin-view' }
    });
    expect(step('store-admin', 'official-source').capture.assertVisible).toBe('.plugin-store-auth-card');
    expect(step('store-admin', 'package-status').capture.assertVisible).toBe('[data-store-auth-mode="sign-in"]');
    expect(step('store-admin', 'store-inspection').capture.assertVisible).toBe('[data-store-auth-mode="sign-up"]');
    expect(step('store-admin', 'store-review').capture.assertVisible).toBe('[data-store-account-signin]');
  });

  test('records the Store Admin account review as a non-mutating inspection', () => {
    expect(step('store-admin', 'store-review').workflow.captureRule.stateChange).toBe(false);
  });

  test('keeps Spotlight documentation on visible product controls instead of an empty preview frame', () => {
    expect(step('spotlight', 'event-style').capture).toMatchObject({ assertVisible: '#designVariant', action: { type: 'set-demo-value', prepare: 'open-spotlight-settings', inputSelector: '#designVariant' } });
    expect(step('spotlight', 'display-duration').capture).toMatchObject({ assertVisible: '#fadeDuration', action: { type: 'open-plugin-surface', prepare: 'open-spotlight-settings' } });
    expect(step('spotlight', 'chatter-preview').capture.action).toMatchObject({ prepare: 'open-spotlight-preview', allowClick: true, clickSelector: '#preview-test-btn' });
    expect(step('spotlight', 'spotlight-overlay').capture).toMatchObject({
      route: '/plugins/spotlight/ui/main.html',
      assertVisible: 'button[data-action="preview"][data-type="chatter"]',
      action: { type: 'open-plugin-surface' }
    });
    expect(step('spotlight', 'spotlight-reset').capture.action).toMatchObject({ prepare: 'open-spotlight-preview' });
  });

  test.each([
    ['emoji-rain', 'verify-obs-hud', '/emoji-rain/ui', 'a[href="/emoji-rain/obs-hud"]'],
    ['spotlight', 'spotlight-overlay', '/plugins/spotlight/ui/main.html', 'button[data-action="preview"][data-type="chatter"]'],
    ['streamalchemy', 'alchemy-overlay', '/plugins/streamalchemy/ui.html', 'a[href="/streamalchemy/overlay"]'],
    ['talking-heads', 'heads-overlay', '/plugins/talking-heads/ui.html', '#testAnimationBtn'],
    ['flame-overlay', 'frame-obs-source', '/flame-overlay/ui', '#overlayUrl'],
    ['visual-fx-frame-webgpu', 'frame-obs-source', '/visual-fx-frame-webgpu/ui', '#overlayUrl'],
    ['webgpu-fireworks', 'gpu-fireworks-overlay', '/webgpu-fireworks/ui', '#copy-overlay-url'],
    ['fireworks', 'fireworks-overlay', '/plugins/fireworks/ui/settings.html', '#copy-overlay-url'],
    ['weather-control', 'weather-overlay', '/plugins/weather-control/ui.html', '#overlayUrl'],
    ['webgpu-emoji-rain', 'gpu-rain-overlay', '/plugins/webgpu-emoji-rain/ui.html', '#obs-hud-setup']
  ])(
    'uses a visible settings control for %s/%s instead of an empty overlay export',
    (pluginId, stepId, route, assertVisible) => {
      const overlayStep = step(pluginId, stepId);
      expect(overlayStep.capture).toMatchObject({
        route,
        assertVisible,
        action: { type: 'open-plugin-surface' }
      });
      expect(overlayStep.capture.action.type).not.toBe('open-overlay-preview');
      expect(overlayStep.capture.action.allowEmptySurface).not.toBe(true);
      expect(overlayStep.workflow.captureRule.stateChange).toBe(false);
    }
  );

  test('opens the actual Music Bot settings panel before documenting duplicate detection', () => {
    expect(step('music-bot', 'queue-rule').capture.action).toMatchObject({
      type: 'set-demo-value',
      prepare: 'open-music-bot-settings'
    });
  });

  test('uses tighter direct crops for the adjacent, but distinct, Multicam status and scene controls', () => {
    expect(step('multicam', 'camera-source').workflow.captureRule.imageCrop).toEqual({ width: 500, height: 260 });
    expect(step('multicam', 'scene-rule').workflow.captureRule.imageCrop).toEqual({ width: 500, height: 260 });
  });

  test.each(['alchemy-card', 'automation-rule', 'action-chain', 'rule-dry-run'])(
    'opens the real StreamAlchemy Settings view before documenting %s',
    (stepId) => {
      expect(step('streamalchemy', stepId).capture.action).toMatchObject({ prepare: 'open-streamalchemy-settings' });
    }
  );

  test('uses a tight, distinct crop for the StreamAlchemy overlay link', () => {
    expect(step('streamalchemy', 'alchemy-overlay').workflow.captureRule.imageCrop).toEqual({ width: 420, height: 260 });
  });

  test.each(['fireworks-card', 'effect-profile', 'audio-limit'])(
    'opens the real Fireworks settings tab before documenting %s',
    (stepId) => {
      expect(step('fireworks', stepId).capture.action).toMatchObject({ prepare: 'open-fireworks-settings' });
    }
  );

  test('uses the actual Fireworks test and save controls instead of a synthetic reset state', () => {
    expect(step('fireworks', 'fireworks-test').capture.action).toMatchObject({
      type: 'run-local-preview',
      allowClick: true,
      clickSelector: '#test-btn'
    });
    expect(step('fireworks', 'fireworks-reset').capture.action).toMatchObject({
      type: 'save-demo-config',
      prepare: 'open-fireworks-settings',
      allowClick: true,
      clickSelector: '#save-btn'
    });
  });

  test('publishes Emoji Rain’s actual OBS HUD route instead of a generic plugin overlay path', () => {
    const guide = guides.find((candidate) => candidate.id === 'emoji-rain');
    expect(guide.overlay).toBe('/emoji-rain/obs-hud');
  });

  test('captures the actual Emoji Rain result surface after the local test button runs', () => {
    expect(step('emoji-rain', 'run-local-rain-test').capture).toMatchObject({
      assertVisible: '#notification',
      action: { type: 'run-local-preview', allowClick: true, clickSelector: '#test-emoji-rain-btn' }
    });
  });

  test('uses WebGPU Emoji Rain’s own local test control instead of its shared save button', () => {
    expect(step('webgpu-emoji-rain', 'gpu-rain-test').capture).toMatchObject({
      assertVisible: '#test-emoji-rain-btn',
      action: { type: 'run-local-preview', allowClick: true, clickSelector: '#test-emoji-rain-btn' }
    });
  });

  test('uses the documented comma-separated emoji sample instead of generic text', () => {
    const emojiList = step('emoji-rain', 'choose-emojis');
    expect(emojiList.workflow.postconditions).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'input-value', selector: '#emoji_set', expected: '💧, ✨, 🎉' })
    ]));
  });

  test('opens the relevant Flame Overlay tabs before documenting their controls', () => {
    expect(step('flame-overlay', 'frame-style').capture.action).toMatchObject({ prepare: 'open-flame-frame-tab' });
    expect(step('flame-overlay', 'frame-intensity').capture.action).toMatchObject({ prepare: 'open-flame-motion-tab' });
  });

  test('starts a local manual game before documenting its running and reset controls', () => {
    expect(step('game-engine', 'test-round').capture).toMatchObject({
      assertVisible: '#manual-game-controls',
      action: { prepare: 'start-local-manual-game', cleanupSelector: '#end-manual-game' }
    });
    expect(step('game-engine', 'queue-reset').capture.action).toMatchObject({ prepare: 'start-local-manual-game' });
  });

  test('keeps AnimazingPal connection settings as a review-only capture when no settings save is executed', () => {
    const mappingReview = step('animazingpal', 'mapping-review');

    expect(mappingReview.capture).toMatchObject({
      assertVisible: '#tab-settings',
      action: { type: 'open-plugin-surface' }
    });
    expect(mappingReview.workflow.captureRule.stateChange).toBe(false);
  });

  test('refreshes the real ClarityHUD full preview and records its real status result', () => {
    expect(step('clarityhud', 'full-hud-preview').capture.action).toMatchObject({
      type: 'run-local-preview',
      allowClick: true,
      clickSelector: 'button[data-action="refresh-preview"][data-type="full"]',
      evidenceSelector: '#toast'
    });
  });
});
