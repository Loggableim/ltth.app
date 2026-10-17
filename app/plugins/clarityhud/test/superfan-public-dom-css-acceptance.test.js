'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const HTML_PATH = path.join(PLUGIN_ROOT, 'overlays/full.html');
const SCRIPT_PATH = path.join(PLUGIN_ROOT, 'overlays/full.js');
const I18N_RUNTIME_PATH = path.join(PLUGIN_ROOT, 'lib/i18n-runtime.js');
const LOCALE_DIR = path.join(PLUGIN_ROOT, 'locales');
const AVATAR_URL = 'https://p16-sign.tiktokcdn.com/synthetic-superfan.webp';
const LONG_NAME = 'SyntheticSuperFan'.repeat(18);

const LOCALES = {
  de: {
    signal: 'Mögliches Super-Fan-Signal',
    join: 'Möglicher Hinweis auf einen Super-Fan-Clubbeitritt',
    level: 'Fanclub-Stufe 7'
  },
  en: {
    signal: 'Possible Super Fan signal',
    join: 'Possible fan-club join signal',
    level: 'Fan club level 7'
  },
  es: {
    signal: 'Posible señal de Super Fan',
    join: 'Posible señal de incorporación al club Super Fan',
    level: 'Nivel del club de fans 7'
  },
  fr: {
    signal: 'Signal possible de Super Fan',
    join: 'Signal possible d’adhésion au Fan Club Super',
    level: 'Niveau du fan club 7'
  }
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readKey(object, dottedPath) {
  return dottedPath.split('.').reduce((current, key) => current?.[key], object);
}

function createFixture({
  locale,
  mode = 'night',
  layoutMode = 'singleStream',
  includeAvatar = true,
  eventType = 'superfan-join'
}) {
  const dom = new JSDOM(fs.readFileSync(HTML_PATH, 'utf8'), {
    runScripts: 'outside-only',
    url: 'http://127.0.0.1:3000/overlay/clarity/full',
    pretendToBeVisual: true
  });
  const { window } = dom;
  const localeData = readJson(path.join(LOCALE_DIR, `${locale}.json`));
  window.i18n = {
    initialized: true,
    ready: new Promise(() => {}),
    getLocale: () => locale,
    t(key, params = {}) {
      const translated = readKey(localeData, key);
      if (typeof translated !== 'string') return key;
      return translated.replace(/\{([^}]+)\}/g, (_, name) => String(params[name] ?? ''));
    }
  };

  window.eval(fs.readFileSync(I18N_RUNTIME_PATH, 'utf8'));
  window.eval(`${fs.readFileSync(SCRIPT_PATH, 'utf8')}\nwindow.__superfanFixture = { STATE, applySettings, render };`);
  const { STATE, applySettings, render } = window.__superfanFixture;
  STATE.container = window.document.getElementById('overlay-container');
  STATE.settings = {
    mode,
    layoutMode,
    feedDirection: 'newestTop',
    maxLines: 20,
    useVirtualScrolling: false,
    animationIn: 'none',
    showChat: false,
    showFollows: false,
    showShares: false,
    showLikes: false,
    showGifts: false,
    showSubs: false,
    showSuperFans: true,
    showTreasureChests: false,
    showJoins: false
  };

  const dto = {
    eventType,
    displayName: LONG_NAME,
    level: 7,
    ...(includeAvatar ? { profilePictureUrl: AVATAR_URL } : {})
  };
  STATE.events.superfanDisplay = [{
    id: 'synthetic-superfan-event',
    type: 'superfanDisplay',
    timestamp: 1,
    data: dto
  }];
  applySettings();
  render();
  return { dom, dto };
}

function findRule(dom, selector) {
  for (const sheet of dom.window.document.styleSheets) {
    for (const rule of sheet.cssRules || []) {
      if (rule.selectorText === selector) return rule;
    }
  }
  return null;
}

describe('ClarityHUD public SuperFan static DOM/CSS acceptance', () => {
  test.each(['day', 'night'])('applies the %s color scheme and avatar layout CSS', mode => {
    const { dom } = createFixture({ locale: 'en', mode });
    const { document } = dom.window;
    try {
      const modeClass = mode === 'day' ? 'day-mode' : 'night-mode';
      const oppositeClass = mode === 'day' ? 'night-mode' : 'day-mode';
      expect(document.body.classList.contains(modeClass)).toBe(true);
      expect(document.body.classList.contains(oppositeClass)).toBe(false);

      const themeRule = findRule(dom, `body.${modeClass}`);
      expect(themeRule).not.toBeNull();
      expect(themeRule.style.getPropertyValue('--bg-color').replace(/\s+/g, '')).toBe(
        mode === 'day' ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.9)'
      );
      expect(themeRule.style.getPropertyValue('--text-color')).toBe(
        mode === 'day' ? '#000000' : '#e0e0e0'
      );

      const avatarRule = findRule(dom, '.superfan-avatar');
      expect(avatarRule.style.getPropertyValue('width')).toBe('1.6em');
      expect(avatarRule.style.getPropertyValue('height')).toBe('1.6em');
      expect(avatarRule.style.getPropertyValue('border-radius')).toBe('50%');
      expect(avatarRule.style.getPropertyValue('object-fit')).toBe('cover');
    } finally {
      dom.window.close();
    }
  });

  test.each(Object.keys(LOCALES))('contains SuperFan signal translations in the %s locale asset', locale => {
    const localeData = readJson(path.join(LOCALE_DIR, `${locale}.json`));
    expect(readKey(localeData, 'plugins.clarityhud.runtime.overlay.superfan_signal')).toEqual(LOCALES[locale].signal);
    expect(readKey(localeData, 'plugins.clarityhud.runtime.overlay.superfan_join_signal')).toEqual(LOCALES[locale].join);
    expect(readKey(localeData, 'plugins.clarityhud.runtime.badge.fan_club_level')).toContain('{level}');
  });

  test.each(Object.entries(LOCALES).flatMap(([locale, labels]) => [
    [locale, 'superfan', labels.signal],
    [locale, 'superfan-join', labels.join]
  ]))('renders the %s SuperFan event %s with localized signal copy', (locale, eventType, expectedLabel) => {
    const { dom, dto } = createFixture({ locale, mode: 'night', eventType });
    const { document } = dom.window;
    try {
      expect(Object.keys(dto).sort()).toEqual(['displayName', 'eventType', 'level', 'profilePictureUrl'].sort());
      const card = document.querySelector('.event-item');
      expect(card).not.toBeNull();
      expect(card.classList.contains('event-sub')).toBe(true);
      expect(card.querySelector('.event-username').textContent).toBe(LONG_NAME);
      expect(card.querySelector('.event-type').textContent).toBe(expectedLabel);
      expect(card.querySelector('.superfan-avatar').src).toBe(AVATAR_URL);
      expect(card.querySelector('.superfan-avatar').referrerPolicy).toBe('no-referrer');
      expect(card.textContent).not.toMatch(/user_id|apiKey|rawPayload|synthetic-private/i);
      expect(card.querySelectorAll('[onerror], [onclick]')).toHaveLength(0);
    } finally {
      dom.window.close();
    }
  });

  test.each(Object.keys(LOCALES))('renders the localized Fan Club level in %s', locale => {
    const { dom } = createFixture({ locale, eventType: 'superfan' });
    try {
      const expectedLevel = readKey(
        readJson(path.join(LOCALE_DIR, `${locale}.json`)),
        'plugins.clarityhud.runtime.badge.fan_club_level'
      ).replace('{level}', '7');
      expect(dom.window.document.querySelector('.event-gift-info').textContent).toBe(expectedLevel);
      expect(expectedLevel).toBe(LOCALES[locale].level);
    } finally {
      dom.window.close();
    }
  });

  test('keeps text-only fallback when the approved DTO has no profile picture', () => {
    const { dom } = createFixture({ locale: 'en', includeAvatar: false });
    try {
      const card = dom.window.document.querySelector('.event-item');
      expect(card.querySelector('.event-username').textContent).toBe(LONG_NAME);
      expect(card.querySelector('.superfan-avatar')).toBeNull();
      expect(card.querySelectorAll('img')).toHaveLength(0);
    } finally {
      dom.window.close();
    }
  });

  test.each(['singleStream', 'structured', 'adaptive'])('preserves the SuperFan card in %s layout', layoutMode => {
    const { dom } = createFixture({ locale: 'en', layoutMode });
    try {
      const { document } = dom.window;
      expect(document.querySelector(`#overlay-container.layout-${layoutMode}`)).not.toBeNull();
      expect(document.querySelector('.event-item .event-username').textContent).toBe(LONG_NAME);
      expect(document.querySelector('.event-item .event-gift-info').textContent).toBe(LOCALES.en.level);
    } finally {
      dom.window.close();
    }
  });
});
