const path = require('path');

const { buildGuides } = require('../../scripts/plugin-tutorial-source');

describe('Chatango tutorial capture workflow', () => {
  test('opens the real local preview before asserting its visible close control', () => {
    const repoRoot = path.join(__dirname, '..', '..');
    const guide = buildGuides(repoRoot).find((entry) => entry.id === 'chatango');
    const review = guide.steps.find((step) => step.id === 'chatango-review');

    expect(review.capture.assertVisible).toBe('#close-preview-btn');
    expect(review.capture.action).toMatchObject({
      type: 'run-local-preview',
      allowClick: true,
      clickSelector: '#btn-preview'
    });
  });
});
