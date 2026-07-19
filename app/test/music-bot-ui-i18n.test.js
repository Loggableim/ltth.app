const fs = require('fs');
const path = require('path');

const pluginRoot = path.join(__dirname, '../plugins/music-bot');
const locales = ['en', 'de', 'es', 'fr'];

function getPath(object, keyPath) {
  return keyPath.split('.').reduce((value, key) => value?.[key], object);
}

function readSectionMap(source, constantName) {
  const block = source.match(new RegExp(`const ${constantName} = Object\\.fromEntries\\(Object\\.entries\\(\\{([\\s\\S]*?)\\}\\)\\.flatMap`));
  expect(block).not.toBeNull();
  const mapping = {};
  for (const match of block[1].matchAll(/(\w+):\s*'([^']*)'/g)) {
    match[2].split(' ').forEach((key) => { mapping[key] = match[1]; });
  }
  return mapping;
}

describe('Music Bot runtime i18n', () => {
  const uiRuntimePaths = {
    seekUnavailable: 'player.seekUnavailable',
    seekFailed: 'player.seekFailed',
    historyLoadFailed: 'history.historyLoadFailed',
    playlistSaveFailed: 'playlists.playlistSaveFailed',
    playlistConflict: 'playlists.playlistConflict',
    importRunning: 'playlists.importRunning'
  };
  const overlayKeys = [
    'songSkipping', 'voteSkip', 'requestedBy', 'unknownTitle', 'queueCount', 'waitingForMusic'
  ];

  test('keeps every dynamic UI message in the Music Bot locale namespace', () => {
    const source = fs.readFileSync(path.join(pluginRoot, 'assets/ui.js'), 'utf8');

    Object.keys(uiRuntimePaths).forEach((key) => {
      expect(source).toContain(`tr('${key}'`);
    });
  });

  test('uses localized runtime messages in the overlay', () => {
    const source = fs.readFileSync(path.join(pluginRoot, 'overlay.html'), 'utf8');

    overlayKeys.forEach((key) => {
      expect(source).toContain(`tr('${key}'`);
    });
  });

  test.each(locales)('provides complete non-empty UI and overlay runtime translations for %s', (locale) => {
    const data = JSON.parse(fs.readFileSync(path.join(pluginRoot, `locales/${locale}.json`), 'utf8'));
    const base = data.music_bot.ui;

    Object.values(uiRuntimePaths).forEach((keyPath) => {
      expect(getPath(base, keyPath)).toEqual(expect.any(String));
      expect(getPath(base, keyPath).trim()).not.toBe('');
    });
    overlayKeys.forEach((key) => {
      expect(getPath(base, `controls.overlay.${key}`)).toEqual(expect.any(String));
      expect(getPath(base, `controls.overlay.${key}`).trim()).not.toBe('');
    });
  });

  test.each(locales)('resolves every literal dynamic admin key from a meaningful section in %s', (locale) => {
    const source = fs.readFileSync(path.join(pluginRoot, 'assets/ui.js'), 'utf8');
    const base = JSON.parse(fs.readFileSync(path.join(pluginRoot, `locales/${locale}.json`), 'utf8')).music_bot.ui;
    const runtimeSections = readSectionMap(source, 'RUNTIME_I18N_SECTIONS');
    const catalogSections = readSectionMap(source, 'CATALOG_I18N_SECTIONS');
    const runtimeKeys = [...new Set(Array.from(source.matchAll(/(?<![A-Za-z])tr\('([^']+)'/g), (match) => match[1]))];
    const catalogKeys = [...new Set(Array.from(source.matchAll(/catalogTr\('([^']+)'/g), (match) => match[1]))];

    runtimeKeys.forEach((key) => {
      expect(runtimeSections[key]).toEqual(expect.any(String));
      expect(getPath(base, `${runtimeSections[key]}.${key}`)).toEqual(expect.any(String));
      expect(getPath(base, `${runtimeSections[key]}.${key}`).trim()).not.toBe('');
    });
    catalogKeys.forEach((key) => {
      expect(catalogSections[key]).toEqual(expect.any(String));
      expect(getPath(base, `${catalogSections[key]}.${key}`)).toEqual(expect.any(String));
      expect(getPath(base, `${catalogSections[key]}.${key}`).trim()).not.toBe('');
    });
  });
});
