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
    html: 'plugins/talking-heads/ui.html',
    sources: ['plugins/talking-heads/assets/ui.js'],
    selectors: ['#publicOverlayUrl'],
    existingCopyToken: 'id="copyLocalOverlayUrl"'
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
  },
  {
    html: 'plugins/advanced-timer/ui.html',
    sources: ['plugins/advanced-timer/ui/ui.js'],
    selectors: ['self'],
    existingCopyToken: 'class="btn btn-xs btn-secondary copy-url-btn"'
  },
  {
    html: 'plugins/clarityhud/ui/main.html',
    sources: ['plugins/clarityhud/ui/main.js'],
    selectors: ['#chat-url', '#full-url', '#multi-url', '#stream-url'],
    existingCopyToken: 'data-action="copy-url"'
  },
  {
    html: 'plugins/coinbattle/ui.html',
    sources: ['plugins/coinbattle/ui.js'],
    selectors: ['#pyramid-overlay-url', '#overlay-url'],
    existingCopyToken: 'id="btn-copy-url"'
  },
  {
    html: 'plugins/fireworks/ui/settings.html',
    sources: ['plugins/fireworks/ui/settings.js'],
    selectors: ['#fireworks-overlay-url'],
    existingCopyToken: 'id="copy-overlay-url"'
  },
  {
    html: 'plugins/goals/ui.html',
    sources: ['plugins/goals/ui.js'],
    selectors: ['self', 'self'],
    existingCopyToken: 'data-action="copy-multigoal-url"'
  },
  {
    html: 'plugins/spotlight/ui/main.html',
    sources: ['plugins/spotlight/ui/main.js'],
    selectors: ['self'],
    existingCopyToken: 'data-action="copy"'
  },
  {
    html: 'plugins/webgpu-fireworks/ui/settings.html',
    sources: ['plugins/webgpu-fireworks/ui/settings.js'],
    selectors: ['#webgpu-fireworks-overlay-url'],
    existingCopyToken: 'id="copy-overlay-url"'
  },
  {
    html: 'plugins/emoji-rain/ui.html',
    selectors: [
      '#emoji-rain-url-complete',
      '#emoji-rain-url-combined',
      '#emoji-rain-url-emojis',
      '#emoji-rain-url-hearts',
      '#emoji-rain-url-gifts'
    ],
    existingCopyToken: 'OBS Setup'
  },
  {
    html: 'plugins/webgpu-emoji-rain/ui.html',
    selectors: [
      '#webgpu-emoji-rain-url-complete',
      '#webgpu-emoji-rain-url-combined',
      '#webgpu-emoji-rain-url-emojis',
      '#webgpu-emoji-rain-url-hearts',
      '#webgpu-emoji-rain-url-gifts'
    ],
    existingCopyToken: 'OBS Setup'
  },
  {
    html: 'plugins/quiz-show/quiz_show.html',
    selectors: [
      '#quiz-show-overlay-url',
      '#quiz-show-splitscreen-url',
      '#quiz-show-leaderboard-url'
    ],
    existingCopyToken: 'OBS Browser-Quellen URLs'
  },
  {
    html: 'plugins/game-engine/ui.html',
    sources: ['plugins/game-engine/tiktok-studio-ui.js'],
    generatedActions: true,
    selectors: [
      '#chess-overlay-url',
      '#plinko-overlay-url',
      '#wheel-overlay-url',
      '#slot-overlay-url',
      '#arena-overlay-url',
      '#overlay-url-gameboard',
      '#overlay-url-chess',
      '#overlay-url-plinko',
      '#overlay-url-wheel',
      '#overlay-url-slot',
      '#overlay-url-arena',
      '#overlay-url-hud',
      '#game-engine-unified-url',
      '#overlay-url-connect4-mode',
      '#overlay-url-chess-mode',
      '#overlay-url-plinko-mode',
      '#overlay-url-wheel-mode',
      '#overlay-url-slot-mode',
      '#overlay-url-arena-mode'
    ],
    existingCopyToken: 'function copyOverlayURL'
  },
  {
    html: 'plugins/vdoninja/ui.html',
    selectors: ['#directorUrl'],
    existingCopyToken: 'data-copy-target="directorUrl"'
  }
];

describe('TikTok Studio overlay action inventory', () => {
  test.each(STRAIGHTFORWARD_SURFACES)(
    '$html keeps OBS copy and exposes every URL group to the shared helper',
    ({ html, sources = [], selectors, existingCopyToken, generatedActions = false }) => {
      const markup = read(html);
      const combined = [markup, ...sources.map(read)].join('\n');

      expect(markup).toContain(
        '<script src="/js/tiktok-studio-url.js"></script>'
      );
      expect(combined).toContain(existingCopyToken);
      if (generatedActions) {
        expect(combined).toContain(
          "button.setAttribute('data-copy-tiktok-studio-url', '')"
        );
        expect(combined).toContain(
          "button.setAttribute('data-i18n', 'common.tiktok_studio.copy_url')"
        );
        for (const selector of selectors) {
          expect(combined).toContain(`selector: '${selector}'`);
        }
      } else {
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
    }
  );

  test('keeps temporary and intentional external copy actions explicitly marked', () => {
    const helper = read('public/js/tiktok-studio-url.js');
    const vdoNinja = read('plugins/vdoninja/ui.html');

    expect(helper).toContain('[data-copy-tiktok-studio-temporary-url]');
    expect(vdoNinja).toContain('data-tiktok-studio-url-mode="external"');
  });
});
