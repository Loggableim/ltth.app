'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { I18n } = require('../modules/i18n');

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value)}\n`, 'utf8');
}

describe('plugin translation source precedence', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-i18n-precedence-'));
    writeJson(path.join(root, 'locales', 'de.json'), {});
    writeJson(path.join(root, 'app-plugins', 'mirrored', 'plugin.json'), { id: 'mirrored' });
    writeJson(path.join(root, 'app-plugins', 'mirrored', 'locales', 'de.json'), {
      plugins: { mirrored: { title: 'Runtime title' } }
    });
    writeJson(path.join(root, 'store-sources', 'mirrored', 'plugin.json'), { id: 'mirrored' });
    writeJson(path.join(root, 'store-sources', 'mirrored', 'locales', 'de.json'), {
      plugins: { mirrored: { title: 'Store title' } }
    });
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  test('keeps the runtime plugin locale when a store source mirrors its manifest id', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const i18n = new I18n('de', {
      localesDir: path.join(root, 'locales'),
      pluginRoots: [path.join(root, 'app-plugins'), path.join(root, 'store-sources')]
    });

    expect(i18n.getAllTranslations('de').plugins.mirrored.title).toBe('Runtime title');
    expect(error).not.toHaveBeenCalledWith(
      'Error loading plugin translations:',
      expect.stringContaining('Translation collision')
    );
    error.mockRestore();
  });
});
