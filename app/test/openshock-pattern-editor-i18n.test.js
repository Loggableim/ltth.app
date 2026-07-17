'use strict';

const fs = require('fs');
const path = require('path');

const pluginDir = path.join(__dirname, '..', 'plugins', 'openshock');

function getPath(value, dottedPath) {
  return dottedPath.split('.').reduce((current, part) => current && current[part], value);
}

test('OpenShock standalone pattern editor registers stable localized runtime keys', () => {
  const editor = fs.readFileSync(path.join(pluginDir, 'src', 'features', 'pattern-editor', 'index.html'), 'utf8');
  const library = fs.readFileSync(path.join(pluginDir, 'src', 'features', 'pattern-editor', 'components', 'PatternLibrary.tsx.js'), 'utf8');
  const liveControls = fs.readFileSync(path.join(pluginDir, 'src', 'features', 'pattern-editor', 'components', 'LiveControls.tsx.js'), 'utf8');

  expect(editor).toContain('window.OpenShockPatternI18n');
  expect(library).toContain("patternEditorText('library.title'");
  expect(liveControls).toContain("patternEditorText('live.title'");

  for (const locale of ['en', 'de', 'es', 'fr']) {
    const messages = JSON.parse(fs.readFileSync(path.join(pluginDir, 'locales', `${locale}.json`), 'utf8'));
    for (const key of [
      'plugins.openshock.pattern_editor.view.title',
      'plugins.openshock.pattern_editor.library.title',
      'plugins.openshock.pattern_editor.live.title',
      'plugins.openshock.pattern_editor.keyframe.title',
      'plugins.openshock.pattern_editor.parameter.customization',
      'plugins.openshock.pattern_editor.connection.emergency_stop_confirm'
    ]) {
      expect(getPath(messages, key)).toEqual(expect.any(String));
    }
  }
});
