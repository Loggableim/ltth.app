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
});
