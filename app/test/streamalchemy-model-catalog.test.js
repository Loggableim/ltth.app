const path = require('path');
const ModelCatalog = require('../plugins/streamalchemy/backend/model-catalog');

describe('StreamAlchemy model catalog', () => {
  test('returns curated presets with install guidance and one-click support metadata', () => {
    const catalog = new ModelCatalog();
    const presets = catalog.listPresets();

    expect(presets.map(preset => preset.id)).toEqual([
      'sdxl_lightning_4step',
      'flux1_schnell',
      'sd35_medium'
    ]);

    expect(presets[0]).toEqual(expect.objectContaining({
      id: 'sdxl_lightning_4step',
      workflowId: 'comfy_sdxl_lightning_4step',
      installMethod: 'one_click',
      targetRelativePath: path.join('models', 'checkpoints', 'sdxl_lightning_4step.safetensors'),
      sizeBytes: 6938040682,
      sha256: 'e0d996ee0013e79d9d3561f50fcafb9a17e3ff07b780358e3b66d67932c4d490',
      license: 'OpenRAIL++'
    }));

    expect(presets[1]).toEqual(expect.objectContaining({
      id: 'flux1_schnell',
      installMethod: 'guided'
    }));

    expect(presets[2]).toEqual(expect.objectContaining({
      id: 'sd35_medium',
      installMethod: 'manual'
    }));
  });

  test('resolves selected preset from local config and falls back to the default small preset', () => {
    const catalog = new ModelCatalog();

    expect(catalog.resolveConfigPreset({
      selectedPresetId: 'flux1_schnell'
    }).id).toBe('flux1_schnell');

    expect(catalog.resolveConfigPreset({
      selectedPresetId: 'missing'
    }).id).toBe('sdxl_lightning_4step');
  });
});
