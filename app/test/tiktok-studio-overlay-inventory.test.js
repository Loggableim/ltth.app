'use strict';

const fs = require('fs');
const path = require('path');

const APP_ROOT = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(APP_ROOT, relativePath), 'utf8');
}

const STRAIGHTFORWARD_SURFACES = [
  {
    html: 'plugins/soundboard/ui/index.html',
    sources: ['public/js/dashboard-soundboard.js'],
    selectors: ['#animation-overlay-url'],
    existingCopyToken: 'id="copy-overlay-url"'
  },
  {
    html: 'plugins/animazingpal/ui.html',
    sources: ['plugins/animazingpal/live-host-ui.js'],
    selectors: ['#stream-assistant-overlay-url'],
    existingCopyToken: 'data-livehost-save="streamAssistant"'
  },
  {
    html: 'plugins/flame-overlay/ui/settings.html',
    selectors: ['#overlayUrl'],
    existingCopyToken: 'id="openOverlayBtn"'
  },
  {
    html: 'plugins/gcce/ui.html',
    selectors: ['#hud-overlay-url'],
    existingCopyToken: 'id="btn-copy-overlay-url"'
  },
  {
    html: 'plugins/interactive-story/ui.html',
    selectors: ['#overlayUrl'],
    existingCopyToken: 'id="copyOverlayUrlBtn"'
  },
  {
    html: 'plugins/music-bot/ui.html',
    sources: ['plugins/music-bot/assets/ui.js'],
    selectors: ['#overlay-url'],
    existingCopyToken: 'id="overlay-copy"'
  },
  {
    html: 'plugins/openshock/ui.html',
    sources: ['plugins/openshock/ui.js'],
    selectors: ['#zappiehellOverlayUrl'],
    existingCopyToken: 'id="copyZappieHellOverlayUrl"'
  },
  {
    html: 'plugins/schnorrbecher/ui.html',
    sources: ['plugins/schnorrbecher/ui.js'],
    selectors: ['#overlay-url'],
    existingCopyToken: 'id="copy-overlay-url"'
  },
  {
    html: 'plugins/streamalchemy/streammonsters-ui.html',
    selectors: ['#overlayUrl'],
    existingCopyToken: 'id="overlayUrl"'
  },
  {
    html: 'plugins/stt-ticker/ui.html',
    selectors: ['#overlay-url'],
    existingCopyToken: 'id="btn-update-url"'
  },
  {
    html: 'plugins/stt-ticker/capture.html',
    selectors: ['#ml-overlay-url'],
    existingCopyToken: 'id="btn-copy-overlay-url"'
  },
  {
    html: 'plugins/toptier/ui.html',
    selectors: ['self', 'self'],
    existingCopyToken: 'data-copy-url='
  },
  {
    html: 'plugins/visual-fx-frame-webgpu/ui/settings.html',
    selectors: ['#overlayUrl'],
    existingCopyToken: 'id="openOverlayBtn"'
  },
  {
    html: 'plugins/weather-control/ui.html',
    selectors: ['#overlayUrl'],
    existingCopyToken: 'id="copyOverlayUrlBtn"'
  },
  {
    html: 'plugins/webgpu-weather-control/ui.html',
    selectors: ['#overlayUrl'],
    existingCopyToken: 'id="copyOverlayUrlBtn"'
  }
];

describe('TikTok Studio overlay action inventory', () => {
  test.each(STRAIGHTFORWARD_SURFACES)(
    '$html keeps OBS copy and exposes every URL group to the shared helper',
    ({ html, sources = [], selectors, existingCopyToken }) => {
      const markup = read(html);
      const combined = [markup, ...sources.map(read)].join('\n');

      expect(markup).toContain(
        '<script src="/js/tiktok-studio-url.js"></script>'
      );
      expect(combined).toContain(existingCopyToken);
      expect(
        (combined.match(/\bdata-copy-tiktok-studio-url\b/g) || []).length
      ).toBe(selectors.length);
      expect(
        (combined.match(
          /data-i18n(?:-key)?="common\.tiktok_studio\.copy_url"/g
        ) || []).length
      ).toBeGreaterThanOrEqual(selectors.length);

      for (const selector of selectors) {
        expect(combined).toContain(
          `data-overlay-url-source="${selector}"`
        );
      }
    }
  );
});
