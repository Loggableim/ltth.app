const path = require('path');

const { LOCALES, buildGuides } = require('../../scripts/plugin-tutorial-source');
const { buildDocsSpec } = require('../../scripts/docs-screenshot-spec');

describe('plugin WorkflowStep contracts', () => {
  const repoRoot = path.join(__dirname, '..', '..');

  test('declares route, instructions, operations, postconditions, and capture rules per workflow step', () => {
    for (const guide of buildGuides(repoRoot)) {
      for (const step of guide.steps) {
        expect(step.workflow).toEqual(expect.objectContaining({
          route: step.capture.route,
          instructions: expect.any(Object),
          operations: expect.any(Array),
          postconditions: expect.any(Array),
          captureRule: expect.objectContaining({ selector: step.capture.assertVisible })
        }));
        expect(step.workflow.operations.some((operation) => operation.type === 'goto')).toBe(true);
        expect(step.workflow.postconditions).toEqual(expect.arrayContaining([
          expect.objectContaining({ type: 'http-status' }),
          expect.objectContaining({ type: 'visible', selector: step.capture.assertVisible })
        ]));
        for (const locale of LOCALES) {
          expect(step.workflow.instructions[locale]).toEqual(expect.objectContaining({
            title: step.copy[locale].title,
            body: step.copy[locale].body
          }));
        }
      }
    }
  });

  test('carries each workflow contract into the screenshot specification', () => {
    const spec = buildDocsSpec(repoRoot);
    for (const guide of buildGuides(repoRoot)) {
      for (const step of guide.steps) {
        const asset = spec.assets.find((candidate) => candidate.guideId === guide.id && candidate.stepId === step.id);
        expect(asset.workflow).toEqual(step.workflow);
      }
    }
  });

  test('creates a real local timer before documenting the Advanced Timer overlay URL', () => {
    const guide = buildGuides(repoRoot).find((candidate) => candidate.id === 'advanced-timer');
    const overlay = guide.steps.find((step) => step.id === 'timer-overlay');

    expect(overlay.capture.action).toEqual(expect.objectContaining({
      type: 'open-overlay-preview',
      prepare: 'create-demo-timer-overlay'
    }));
    expect(overlay.workflow.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'prepare', name: 'create-demo-timer' }),
      expect.objectContaining({ type: 'open-overlay-preview', selector: '#timer-container' })
    ]));
    expect(overlay.workflow.postconditions).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'text', selector: '#timer-container', expected: '01:30' })
    ]));
  });

  test('creates a real local goal before documenting the Goal Overlay URL', () => {
    const guide = buildGuides(repoRoot).find((candidate) => candidate.id === 'goals');
    const overlay = guide.steps.find((step) => step.id === 'goal-overlay');

    expect(overlay.capture.action).toEqual(expect.objectContaining({
      type: 'open-overlay-preview',
      prepare: 'create-demo-goal-overlay'
    }));
    expect(overlay.workflow.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'prepare', name: 'create-demo-goal' }),
      expect.objectContaining({ type: 'open-overlay-preview', selector: '#goal-container' })
    ]));
  });
});
