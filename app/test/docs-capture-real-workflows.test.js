const path = require('path');

const { buildGuides } = require('../../scripts/plugin-tutorial-source');

describe('documentation capture real workflows', () => {
  const repoRoot = path.join(__dirname, '..', '..');

  function step(pluginId, stepId) {
    return buildGuides(repoRoot)
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

  test.each(['local-source', 'field-map'])(
    'selects the real local TikFinity source before documenting %s',
    (stepId) => {
      expect(step('data-source', stepId).capture.action).toMatchObject({
        type: 'select-local-source',
        allowClick: true,
        clickSelector: '#card-tikfinity'
      });
    }
  );

  test('saves the local TikFinity settings before documenting the result', () => {
    expect(step('data-source', 'data-preview').capture.action).toMatchObject({
      type: 'save-demo-config',
      prepare: 'select-local-tikfinity',
      allowClick: true,
      clickSelector: '#btn-save-tikfinity'
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
      action: { type: 'run-local-preview' }
    });
  });

  test.each(['safety-card', 'safe-limit'])(
    'opens the real OpenShock Safety tab before documenting %s',
    (stepId) => {
      expect(step('openshock', stepId).capture.action).toMatchObject({ prepare: 'open-openshock-safety-tab' });
    }
  );

  test('opens the real Minecraft configuration tabs before documenting fields inside them', () => {
    expect(step('minecraft-connect', 'offline-address').capture.action).toMatchObject({ prepare: 'open-minecraft-setup-tab' });
    expect(step('minecraft-connect', 'event-format').capture.action).toMatchObject({ prepare: 'open-minecraft-chat-tab' });
  });

  test('creates a local Quiz Show question before documenting a running round', () => {
    expect(step('quiz-show', 'question-pool').capture.action).toMatchObject({ prepare: 'open-quiz-questions-tab' });
    expect(step('quiz-show', 'answer-window').capture.action).toMatchObject({ type: 'run-local-preview', prepare: 'start-local-quiz', cleanupSelector: '#stopQuizBtn' });
    expect(step('quiz-show', 'sample-question').capture.action).toMatchObject({ type: 'run-local-preview', prepare: 'start-local-quiz', cleanupSelector: '#stopQuizBtn' });
    expect(step('quiz-show', 'quiz-reset').capture.action).toMatchObject({ prepare: 'start-local-quiz', cleanupSelector: '#stopQuizBtn' });
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

  test('opens the actual Spotlight modals before documenting their controls and preview', () => {
    expect(step('spotlight', 'event-style').capture).toMatchObject({ assertVisible: '#settings-form-container', action: { prepare: 'open-spotlight-settings' } });
    expect(step('spotlight', 'display-duration').capture).toMatchObject({ assertVisible: '#save-settings-btn', action: { prepare: 'open-spotlight-settings' } });
    expect(step('spotlight', 'chatter-preview').capture.action).toMatchObject({ prepare: 'open-spotlight-preview', allowClick: true, clickSelector: '#preview-test-btn' });
    expect(step('spotlight', 'spotlight-overlay').capture).toMatchObject({ route: '/plugins/spotlight/ui/main.html', assertVisible: '#preview-frame' });
    expect(step('spotlight', 'spotlight-reset').capture.action).toMatchObject({ prepare: 'open-spotlight-preview' });
  });

  test.each(['alchemy-card', 'automation-rule', 'action-chain', 'rule-dry-run'])(
    'opens the real StreamAlchemy Settings view before documenting %s',
    (stepId) => {
      expect(step('streamalchemy', stepId).capture.action).toMatchObject({ prepare: 'open-streamalchemy-settings' });
    }
  );

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
    const guide = buildGuides(repoRoot).find((candidate) => candidate.id === 'emoji-rain');
    expect(guide.overlay).toBe('/emoji-rain/obs-hud');
  });

  test('captures the actual Emoji Rain result surface after the local test button runs', () => {
    expect(step('emoji-rain', 'run-local-rain-test').capture).toMatchObject({
      assertVisible: '#notification',
      action: { type: 'run-local-preview', allowClick: true, clickSelector: '#test-emoji-rain-btn' }
    });
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
});
