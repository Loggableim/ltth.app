'use strict';

const path = require('path');

const { buildGuides } = require('../../scripts/plugin-tutorial-source');

describe('interaction capture guide evidence', () => {
  const repoRoot = path.join(__dirname, '..', '..');

  function step(pluginId, stepId) {
    const guide = buildGuides(repoRoot).find((entry) => entry.id === pluginId);
    return guide.steps.find((entry) => entry.id === stepId);
  }

  test.each([
    ['chatango', 'chatango-review', '#btn-preview', '#preview-card'],
    ['config-import', 'backup-cleanup', '#exportBtn', '#exportResultCard'],
    ['data-source', 'local-source', '#card-tikfinity', '#tikfinity-settings-card'],
    ['data-source', 'data-preview', '#btn-save-tikfinity', '#toast'],
    ['weather-control', 'lifecycle-rule', '#testRainEffectBtn', '#statusAlert'],
    ['weather-control', 'weather-reset', '#stopAllPreviewBtn', '#statusAlert'],
    ['visual-fx-frame-webgpu', 'gpu-frame-preview', '#previewToggle', '#previewContainer']
  ])('%s/%s captures the real result of its local click', (pluginId, stepId, clickSelector, evidenceSelector) => {
    const entry = step(pluginId, stepId);

    expect(entry.capture.action).toMatchObject({
      allowClick: true,
      clickSelector,
      evidenceSelector
    });
    expect(entry.workflow.postconditions).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'visible', selector: evidenceSelector })
    ]));
  });

  test('keeps state-changing reset labels off controls that only save a preset', () => {
    const entry = step('visual-fx-frame-webgpu', 'frame-reset');

    expect(entry.capture.action.type).toBe('open-plugin-surface');
    expect(entry.workflow.captureRule.stateChange).toBe(false);
  });

  test('uses a safe inspected Import tab instead of claiming to save it', () => {
    const entry = step('config-import', 'restore-inspection');

    expect(entry.capture.action.type).toBe('open-plugin-surface');
    expect(entry.workflow.captureRule.stateChange).toBe(false);
  });
});
