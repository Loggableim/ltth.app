'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const PluginLoader = require('../modules/plugin-loader');
test('enabling an absent plugin rejects before saved preferences are written', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-missing-plugin-'));
  try {
    const saved = { enabled: false, config: { custom: 'keep' } };
    const loader = Object.create(PluginLoader.prototype);
    Object.assign(loader, {
      pluginsDir: root,
      plugins: new Map(),
      state: { 'missing-plugin': saved },
      releasePolicy: { assertAllowed: id => id, isClosedBetaId: () => false },
      saveState: jest.fn(),
      logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() }
    });
    await expect(loader.enablePlugin('missing-plugin')).rejects.toThrow('Plugin directory not found: missing-plugin');
    expect(loader.state['missing-plugin']).toBe(saved);
    expect(loader.saveState).not.toHaveBeenCalled();
    expect(loader.plugins.size).toBe(0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
