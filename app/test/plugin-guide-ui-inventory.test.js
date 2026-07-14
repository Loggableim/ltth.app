const path = require('path');

const { buildGuides } = require('../../scripts/plugin-tutorial-source');
const { collectGuideUiInventory } = require('../../scripts/lib/plugin-guide-ui-inventory');

describe('plugin guide UI inventory', () => {
  const repoRoot = path.join(__dirname, '..', '..');

  test('maps every statically discoverable visible control to documentation or an explicit internal classification', () => {
    for (const guide of buildGuides(repoRoot)) {
      const discovered = collectGuideUiInventory(repoRoot, guide);
      const documented = new Map(guide.definition.visibleControls
        .filter((control) => control.selector)
        .map((control) => [control.selector, control]));

      for (const control of discovered.controls) {
        expect(documented.get(control.selector)).toEqual(expect.objectContaining({
          classification: expect.stringMatching(/^(documented|decorative|internal)$/),
          section: expect.any(String)
        }));
      }

      expect(guide.definition.settingsReference.map((setting) => setting.selector)).toEqual(
        expect.arrayContaining(discovered.controls.filter((control) => control.kind !== 'link').map((control) => control.selector))
      );
    }
  });
});
