const path = require('path');

const { buildGuides } = require('../../scripts/plugin-tutorial-source');

describe('Emoji Rain guide overlay URL', () => {
  test('uses the current LTTH host rather than a hard-coded development port', () => {
    const guide = buildGuides(path.join(__dirname, '..', '..')).find((entry) => entry.id === 'emoji-rain');
    const obsStep = guide.steps.find((step) => step.id === 'verify-obs-hud');

    expect(guide.overlay).toBe('/emoji-rain/obs-hud');
    for (const locale of ['de', 'en', 'es', 'fr']) {
      expect(obsStep.copy[locale].body).not.toContain('localhost:3000');
      expect(obsStep.copy[locale].body).toContain('/emoji-rain/obs-hud');
    }
  });
});
