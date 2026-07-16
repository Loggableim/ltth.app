const fs = require('fs');
const path = require('path');

const pluginRoot = path.join(__dirname, '../plugins/music-bot');
const locales = ['en', 'de', 'es', 'fr'];

function getPath(object, keyPath) {
  return keyPath.split('.').reduce((value, key) => value?.[key], object);
}

describe('Music Bot runtime i18n', () => {
  const uiRuntimeKeys = [
    'pause', 'noTrackPlaying', 'playbackResumed', 'playbackStarted',
    'nextTrackPlaying', 'resume', 'noPlayableTrack', 'skip', 'playingNow', 'nextTitle', 'autoDj',
    'searchLoadingInfo', 'searchLoading',
    'noSearchResult', 'queueAdding', 'queueAdded', 'requestFailed', 'songAdded',
    'requestRejected', 'masterVolume', 'sourceVolume', 'volumeUpdateFailed',
    'crossfade', 'crossfadeSaveFailed', 'copied', 'copyFailed', 'autoDjStarted', 'autoDjWaiting',
    'noTrackAvailable', 'saveSuccess', 'saveFailure', 'enterBanValue', 'banAdded',
    'banAddFailed', 'banRemoveFailed', 'network', 'getFailed', 'postFailed',
    'deleteFailed', 'apiError', 'unknownError', 'connectionInterrupted',
    'socketDisconnected', 'nothingPlaying', 'requestedBy', 'viewer', 'queueEmptyTitle',
    'queueEmptyDescription', 'historyEmpty', 'idle', 'skipLoading', 'skip', 'playing',
    'active', 'disabled', 'enabled', 'selectionSource', 'blockedCount', 'giftsCount',
    'noGiftsFound', 'selectGiftsFirst', 'saveTargetFailed', 'giftsApplied',
    'giftCatalogUpdated', 'giftCatalog', 'giftCatalogLoading', 'giftCatalogLoadFailed',
    'noEntries', 'delete', 'queueOrderUpdated', 'queueUpdateFailed', 'trackRemoved',
    'trackAlreadyPlaying', 'selectedTrack', 'trackStartFailed', 'trackMoved', 'paused',
    'loadingNextTrack', 'disabledState', 'catalogLocales', 'catalogLocalesDefault',
    'catalogRegion', 'catalogUpdated', 'catalogLoadedWithApiCount', 'catalogLoaded',
    'catalogVisible'
  ];
  const overlayKeys = [
    'songSkipping', 'voteSkip', 'requestedBy', 'unknownTitle', 'queueCount', 'waitingForMusic'
  ];

  test('keeps every dynamic UI message in the Music Bot locale namespace', () => {
    const source = fs.readFileSync(path.join(pluginRoot, 'assets/ui.js'), 'utf8');

    uiRuntimeKeys.forEach((key) => {
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
    const base = data.plugins['music-bot'].music_bot.ui;

    uiRuntimeKeys.forEach((key) => {
      expect(getPath(base, `controls.runtimeMessages.${key}`)).toEqual(expect.any(String));
      expect(getPath(base, `controls.runtimeMessages.${key}`).trim()).not.toBe('');
    });
    overlayKeys.forEach((key) => {
      expect(getPath(base, `controls.overlay.${key}`)).toEqual(expect.any(String));
      expect(getPath(base, `controls.overlay.${key}`).trim()).not.toBe('');
    });
  });
});
