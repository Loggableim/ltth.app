'use strict';

const { applyOverlayEntryPoints } = require('../../scripts/lib/guide-overlay-entry-points');

describe('guide overlay entry points', () => {
  test('accepts a concrete local cache revalidation response', () => {
    const guide = applyOverlayEntryPoints({
      id: 'example',
      steps: [{ id: 'overlay', capture: {}, workflow: {} }]
    }, {
      overlay: {
        route: '/plugins/example/overlay.html',
        selector: '#overlay-root',
        copy: {
          en: { title: 'Overlay', body: 'Open it.', expected: 'Visible.' }
        }
      }
    });

    expect(guide.steps[0].workflow.postconditions).toContainEqual({
      type: 'http-status',
      expected: [200, 304]
    });
  });
});
