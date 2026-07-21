'use strict';

const path = require('path');

const { buildGuides } = require('../../scripts/plugin-tutorial-source');

describe('plugin tutorial workflow evidence', () => {
  test('requires a real preview click and an independently visible result', () => {
    const guides = buildGuides(path.join(__dirname, '..', '..'));
    const chatango = guides.find((guide) => guide.id === 'chatango');
    const review = chatango.steps.find((step) => step.id === 'chatango-review');

    expect(review.workflow.operations).toContainEqual({
      type: 'run-local-preview',
      selector: '#btn-preview'
    });
    expect(review.workflow.postconditions).toContainEqual({
      type: 'visible',
      selector: '#close-preview-btn'
    });
    expect(review.workflow.postconditions).toContainEqual({
      type: 'interaction',
      selector: '#btn-preview',
      expected: { type: 'run-local-preview', changed: true }
    });
  });

  test('backs every declared local interaction with an executable local action', () => {
    const interactiveTypes = new Set([
      'set-demo-value',
      'select-local-source',
      'save-demo-config',
      'run-local-preview',
      'open-local-settings',
      'reset-demo-state'
    ]);
    const guides = buildGuides(path.join(__dirname, '..', '..'));
    const missingActions = [];

    for (const guide of guides) {
      for (const step of guide.steps) {
        const type = step.capture.action.type;
        if (!interactiveTypes.has(type)) continue;
        const declaresOperation = step.workflow.operations.some((operation) => operation.type === type);
        if (!declaresOperation) continue;
        if (type === 'set-demo-value' || step.capture.action.allowClick || step.capture.action.prepare) continue;
        missingActions.push(`${guide.id}/${step.id} (${type})`);
      }
    }

    expect(missingActions).toEqual([]);
  });

  test.each([
    ['chatango', 'widget-preview', '#btn-preview', '#preview-card'],
    ['coinbattle', 'demo-match', '#btn-start-match', '#match-status-text'],
    ['gift-catalog', 'gift-preview', '#demo-shuffle-list', '#demo-list'],
    ['gift-catalog', 'catalog-review', '#save-config', '#connection-state'],
    ['gcce', 'command-dry-run', '#btn-validate-commands', '#message-container'],
    ['interactive-story', 'local-decision', '#toggleOverlayPreviewBtn', '#overlayPreviewContainer'],
    ['multicam', 'multicam-review', '#saveMappingsBtn', '#saveStatus'],
    ['soundboard', 'soundboard-review', '[data-save-proxy]', '#soundboard-save-state'],
    ['milestone-leaderboard', 'xp-pulse', '#testButton', '#notification'],
    ['flame-overlay', 'frame-preview', '#previewToggle', '#previewContainer'],
    ['visual-fx-frame-webgpu', 'gpu-frame-preview', '#previewToggle', '#previewContainer'],
    ['emoji-rain', 'save-emoji-rain', '#save-config-btn', '#notification'],
    ['fireworks', 'fireworks-test', '#test-btn', '#toast'],
    ['fireworks', 'fireworks-reset', '#save-btn', '#toast'],
    ['spotlight', 'chatter-preview', '#preview-test-btn', '#toast'],
    ['schnorrbecher', 'test-gift', '#test-gift', '#total-value'],
    ['toptier', 'tier-threshold', '#test-overlay', '#toast'],
    ['webgpu-emoji-rain', 'gpu-rain-test', '#test-emoji-rain-btn', '#notification']
  ])('uses a real local result surface for %s/%s', (guideId, stepId, clickSelector, evidenceSelector) => {
    const guide = buildGuides(path.join(__dirname, '..', '..')).find((entry) => entry.id === guideId);
    const step = guide.steps.find((entry) => entry.id === stepId);

    expect(step.capture.action).toMatchObject({
      allowClick: true,
      clickSelector,
      evidenceSelector
    });
    expect(step.workflow.operations).toContainEqual({ type: step.capture.action.type, selector: clickSelector });
  });

  test.each([
    ['advanced-timer', 'timer-reset'],
    ['data-source', 'field-map'],
    ['coinbattle', 'match-reset'],
    ['gcce', 'command-review'],
    ['openshock', 'shock-simulation'],
    ['openshock', 'safety-reset'],
    ['interactive-story', 'story-reset'],
    ['minecraft-connect', 'offline-message'],
    ['multicam', 'scene-dry-run'],
    ['music-bot', 'queue-reset'],
    ['osc-bridge', 'loopback-check'],
    ['osc-bridge', 'osc-review'],
    ['streamalchemy', 'rule-reset'],
    ['stt-ticker', 'sample-sentence'],
    ['stt-ticker', 'ticker-reset'],
    ['talking-heads', 'text-preview'],
    ['talking-heads', 'heads-reset'],
    ['thermal-printer', 'queue-test'],
    ['thermal-printer', 'printer-review'],
    ['toptier', 'rank-preview'],
    ['toptier', 'tier-reset'],
    ['tts', 'muted-voice-preview'],
    ['tts', 'tts-review'],
    ['vdoninja', 'browser-preview'],
    ['vdoninja', 'ninja-reset'],
    ['milestone-leaderboard', 'xp-reset'],
    ['flame-overlay', 'frame-reset'],
    ['visual-fx-frame-webgpu', 'frame-reset'],
    ['webgpu-emoji-rain', 'gpu-preset'],
    ['webgpu-emoji-rain', 'gpu-rain-reset'],
    ['webgpu-fireworks', 'gpu-fireworks-reset']
  ])('keeps an unexecutable external or unseeded workflow as a review for %s/%s', (guideId, stepId) => {
    const guide = buildGuides(path.join(__dirname, '..', '..')).find((entry) => entry.id === guideId);
    const step = guide.steps.find((entry) => entry.id === stepId);

    expect(step.capture.action.type).toBe('open-plugin-surface');
    expect(step.workflow.captureRule.stateChange).toBe(false);
    expect(step.workflow.operations.some((operation) => operation.type === 'open-plugin-surface')).toBe(true);
  });

  test('uses the actual local overlay toggle for minecraft-connect', () => {
    const guide = buildGuides(path.join(__dirname, '..', '..')).find((entry) => entry.id === 'minecraft-connect');
    const step = guide.steps.find((entry) => entry.id === 'minecraft-overlay-settings');

    expect(step.capture.action).toMatchObject({
      type: 'set-demo-value',
      prepare: 'open-minecraft-setup-tab'
    });
    expect(step.workflow.captureRule.stateChange).toBe(true);
  });
});
