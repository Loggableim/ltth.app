'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const BadgeRenderer = require('../lib/badge-renderer');

const overlayDir = path.resolve(__dirname, '../overlays');
const fullHtml = fs.readFileSync(path.join(overlayDir, 'full.html'), 'utf8');
const fullScript = fs.readFileSync(path.join(overlayDir, 'full.js'), 'utf8');

function createFullSettingsHarness() {
  const dom = new JSDOM(fullHtml, {
    runScripts: 'outside-only',
    url: 'http://127.0.0.1:3000/overlay/clarity/full'
  });
  const { window } = dom;
  window.i18n = { ready: new Promise(() => {}) };
  window.eval(`${fullScript}\nwindow.__displayHarness = { STATE, getDefaultSettings, applySettings, loadSettings };`);
  return { dom, window, harness: window.__displayHarness };
}

describe('ClarityHUD renderer display regressions', () => {
  test('Full cards stay visible and custom outline survives day mode with the default preset', () => {
    const { dom, window, harness } = createFullSettingsHarness();
    try {
      const item = window.document.createElement('div');
      item.className = 'event-item';
      window.document.body.appendChild(item);
      expect(window.getComputedStyle(item).opacity).toBe('1');

      harness.STATE.settings = {
        ...harness.getDefaultSettings(),
        mode: 'day',
        accessibilityPreset: 'default',
        outlineColor: '#123456',
        outlineThickness: '4px',
        reduceMotion: true
      };
      harness.applySettings();
      expect(window.document.body.classList.contains('day-mode')).toBe(true);
      expect(window.document.body.classList.contains('reduce-motion')).toBe(true);
      expect(window.document.documentElement.style.getPropertyValue('--outline-color')).toBe('#123456');
      expect(window.document.documentElement.style.getPropertyValue('--outline-width')).toBe('4px');

      const dayModeBlock = fullHtml.match(/body\.day-mode\s*\{([^}]+)\}/)?.[1] || '';
      expect(dayModeBlock).not.toMatch(/--outline-color\s*:/);

      harness.STATE.settings = { ...harness.STATE.settings, reduceMotion: false };
      harness.applySettings();
      expect(window.document.body.classList.contains('reduce-motion')).toBe(false);
    } finally {
      dom.window.close();
    }
  });

  test.each(['failed-request', 'unsuccessful-response'])('fallback settings preserve outline and reduced-motion defaults for %s', async mode => {
    const { dom, window, harness } = createFullSettingsHarness();
    try {
      window.fetch = mode === 'failed-request'
        ? () => Promise.reject(new Error('isolated fixture failure'))
        : async () => ({ json: async () => ({ success: false }) });
      await harness.loadSettings();
      expect(harness.STATE.settings).toMatchObject({
        outlineColor: '#000000',
        outlineThickness: '2px',
        reduceMotion: false,
        accessibilityPreset: 'default'
      });
      expect(window.document.body.classList.contains('reduce-motion')).toBe(false);
      expect(window.document.documentElement.style.getPropertyValue('--outline-color')).toBe('#000000');
      expect(window.document.documentElement.style.getPropertyValue('--outline-width')).toBe('2px');

      // Imported sparse settings may omit textColor; outlines still apply independently.
      harness.STATE.settings = {
        mode: 'day',
        accessibilityPreset: 'default',
        outlineColor: '#654321',
        outlineThickness: '5px'
      };
      harness.applySettings();
      expect(window.document.documentElement.style.getPropertyValue('--outline-color')).toBe('#654321');
      expect(window.document.documentElement.style.getPropertyValue('--outline-width')).toBe('5px');
    } finally {
      dom.window.close();
    }
  });

  test('badge flags use strict booleans for normalized, nested, and legacy identity inputs', () => {
    const renderer = new BadgeRenderer({ showModerator: true, showSubscriber: true, showTeamLevel: true });
    for (const input of [
      { isModerator: true, isSubscriber: true },
      { user: { isModerator: true, isSubscriber: true } },
      { userIdentity: { isModeratorOfAnchor: true, isSubscriberOfAnchor: true } }
    ]) {
      expect(renderer.extractBadges(input)).toMatchObject({ isModerator: true, isSubscriber: true });
    }

    for (const input of [
      { isModerator: false, isSubscriber: false },
      { isModerator: 'false', isSubscriber: 'false' },
      { user: { isModerator: 'false', isSubscriber: 'false' } },
      { userIdentity: { isModeratorOfAnchor: 'false', isSubscriberOfAnchor: 'false' } },
      {},
      { teamMemberLevel: 4 }
    ]) {
      expect(renderer.extractBadges(input)).toMatchObject({ isModerator: false, isSubscriber: false });
    }
    expect(renderer.extractBadges({ teamMemberLevel: 4 })).toMatchObject({ teamLevel: 4, isModerator: false, isSubscriber: false });
  });
});
