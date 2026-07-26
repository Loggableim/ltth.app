'use strict';

(function initGameEngineTikTokStudioUi(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root?.document) {
    const install = () => api.install(root.document);
    if (root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', install, { once: true });
    } else {
      install();
    }
  }
})(
  typeof window !== 'undefined' ? window : null,
  function createGameEngineTikTokStudioUi(root) {
    const modeAttribute = 'data-overlay-url';
    const targets = [
      { selector: '#chess-overlay-url' },
      { selector: '#plinko-overlay-url' },
      { selector: '#wheel-overlay-url' },
      { selector: '#slot-overlay-url' },
      { selector: '#arena-overlay-url' },
      { selector: '#overlay-url-gameboard' },
      { selector: '#overlay-url-chess' },
      { selector: '#overlay-url-plinko' },
      { selector: '#overlay-url-wheel' },
      { selector: '#overlay-url-slot' },
      { selector: '#overlay-url-arena' },
      { selector: '#overlay-url-hud' },
      { selector: '#game-engine-unified-url' },
      {
        selector: '#overlay-url-connect4-mode',
        attribute: modeAttribute,
        initialUrl: 'http://localhost:3000/overlay/game-engine/unified'
      },
      {
        selector: '#overlay-url-chess-mode',
        attribute: modeAttribute,
        initialUrl: 'http://localhost:3000/overlay/game-engine/unified'
      },
      {
        selector: '#overlay-url-plinko-mode',
        attribute: modeAttribute,
        initialUrl: 'http://localhost:3000/overlay/game-engine/unified'
      },
      {
        selector: '#overlay-url-wheel-mode',
        attribute: modeAttribute,
        initialUrl: 'http://localhost:3000/overlay/game-engine/unified'
      },
      {
        selector: '#overlay-url-slot-mode',
        attribute: modeAttribute,
        initialUrl: 'http://localhost:3000/overlay/game-engine/unified'
      },
      {
        selector: '#overlay-url-arena-mode',
        attribute: modeAttribute,
        initialUrl: 'http://localhost:3000/overlay/game-engine/arena'
      }
    ];

    function translatedLabel() {
      const key = 'common.tiktok_studio.copy_url';
      const translated = root?.i18n?.t?.(key);
      return translated && translated !== key
        ? translated
        : 'TikTok-Studio-URL kopieren';
    }

    function install(documentRef) {
      for (const target of targets) {
        const source = documentRef?.querySelector?.(target.selector);
        if (!source?.parentElement) continue;
        const existing = [...source.parentElement.querySelectorAll(
          '[data-tiktok-studio-source]'
        )].find(button => (
          button.getAttribute('data-tiktok-studio-source') === target.selector
        ));
        if (existing) continue;

        if (
          target.attribute &&
          !source.getAttribute(target.attribute) &&
          target.initialUrl
        ) {
          source.setAttribute(target.attribute, target.initialUrl);
        }

        const button = documentRef.createElement('button');
        button.type = 'button';
        button.className = 'secondary';
        button.setAttribute('data-copy-tiktok-studio-url', '');
        button.setAttribute('data-overlay-url-source', target.selector);
        button.setAttribute('data-tiktok-studio-source', target.selector);
        button.setAttribute('data-i18n', 'common.tiktok_studio.copy_url');
        if (target.attribute) {
          button.setAttribute('data-overlay-url-attribute', target.attribute);
        }
        button.textContent = translatedLabel();
        source.parentElement.appendChild(button);
      }
    }

    return { install, targets };
  }
);
