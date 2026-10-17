'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const dashboardSource = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'js', 'dashboard.js'),
  'utf8'
);
const sectionStart = dashboardSource.indexOf('// ========== EVENT LOG ==========');
const sectionEnd = dashboardSource.indexOf('// ========== STATS MENU NAVIGATION ==========', sectionStart);
const eventLogSource = dashboardSource.slice(sectionStart, sectionEnd);
const statsStart = sectionEnd;
const statsEnd = dashboardSource.indexOf('/**\n * Get activity icon for viewer', statsStart);
const statsSource = dashboardSource.slice(statsStart, statsEnd);
const locales = Object.fromEntries(['en', 'de', 'es', 'fr'].map(locale => [
  locale,
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'locales', `${locale}.json`), 'utf8'))
]));

function createFixture() {
  const panels = ['viewers', 'chat', 'likes', 'coins', 'followers', 'subscribers', 'gifts'];
  const panelMarkup = panels.map(name => `<div id="${name}-list"></div><span id="panel-${name}-count"></span><span id="event-stats-${name}"></span>`).join('');
  const dom = new JSDOM(`<!doctype html><html lang="en"><body>
    <p id="event-log-status" hidden></p><button id="event-log-retry-btn" hidden></button>
    <table><tbody id="event-log"></tbody></table>${panelMarkup}
  </body></html>`, {
    runScripts: 'outside-only'
  });
  const { window } = dom;
  let locale = 'en';
  const languageChangeCallbacks = [];
  window.i18n = {
    getLocale: () => locale,
    onLanguageChange: callback => languageChangeCallbacks.push(callback),
    t(key, params = {}) {
      const value = key.split('.').reduce((current, part) => current && current[part], locales[locale]);
      if (typeof value !== 'string') return key;
      return value.replace(/\{(\w+)\}/g, (match, name) => (
        Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
      ));
    }
  };
  window.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({
      success: true,
      logs: [
        { event_type: 'chat', timestamp: '2026-10-08T12:00:00.000Z', data: { username: 'viewer', message: 'Hello <b>chat</b>' } },
        { event_type: 'gift', timestamp: '2026-10-08T11:59:00.000Z', data: { username: 'gifter', giftName: 'Rose', repeatCount: 2, coins: 10 } },
        { event_type: 'follow', timestamp: '2026-10-08T11:58:00.000Z', data: { username: 'follower' } },
        { event_type: 'share', timestamp: '2026-10-08T11:57:00.000Z', data: { username: 'sharer' } },
        { event_type: 'like', timestamp: '2026-10-08T11:56:00.000Z', data: { username: 'liker', likeCount: 3, totalLikes: 8 } },
        { event_type: 'subscribe', timestamp: '2026-10-08T11:55:00.000Z', data: { username: 'subscriber' } }
      ]
    })
  }));
  window.trackEventForStatsMenu = jest.fn();
  window.escapeHtml = value => {
    const element = window.document.createElement('span');
    element.textContent = String(value);
    return element.innerHTML;
  };
  window.eval(`const MAX_PANEL_ITEMS = 30;
    let activeStatsPanel = null;
    const statsMenuData = {
      viewers: new Map(), chat: [], likes: [], coins: [], followers: [], subscribers: [], gifts: [],
      counts: { chat: 0, gifts: 0, followers: 0, subscribers: 0 }
    };
    ${eventLogSource}\n${statsSource}\nwindow.eventLogLocaleApi = {
    loadEventHistory, refreshStatsPanelContent, trackEventForStatsMenu,
    setEventLogStatus, handleLiveEvent
  };`);
  return {
    dom,
    window,
    api: window.eventLogLocaleApi,
    changeLocale(nextLocale) {
      locale = nextLocale;
      window.document.documentElement.lang = nextLocale;
      languageChangeCallbacks.forEach(callback => callback(nextLocale));
    }
  };
}

describe('Dashboard event rows follow immediate locale changes', () => {
  test.each(['en', 'de', 'es', 'fr'])('updates already loaded event rows and time formatting in %s', async locale => {
    const { window, api, changeLocale } = createFixture();
    try {
      await expect(api.loadEventHistory()).resolves.toBe(true);
      const rowsBeforeChange = [...window.document.querySelectorAll('#event-log tr')];
      expect(rowsBeforeChange).toHaveLength(6);

      changeLocale(locale);

      const rowsAfterChange = [...window.document.querySelectorAll('#event-log tr')];
      expect(rowsAfterChange).toHaveLength(rowsBeforeChange.length);
      rowsAfterChange.forEach((row, index) => expect(row).toBe(rowsBeforeChange[index]));
      expect(rowsAfterChange[0].children[1].textContent).toBe(`💬 ${locales[locale].events.log_type_chat}`);
      expect(rowsAfterChange[0].children[0].textContent)
        .toBe(new Date('2026-10-08T12:00:00.000Z').toLocaleTimeString(locale));
      expect(rowsAfterChange[0].children[3].textContent).toBe('Hello <b>chat</b>');
      expect(rowsAfterChange[0].children[3].querySelector('b')).toBeNull();
      expect(rowsAfterChange[1].children[1].textContent).toBe(`🎁 ${locales[locale].events.log_type_gift}`);
      expect(rowsAfterChange[1].children[3].textContent)
        .toBe(`Rose ${locales[locale].events.log_detail_gift.replace('{repeatCount}', '2').replace('{coins}', '10')}`);
      expect(rowsAfterChange[5].children[1].textContent).toBe(`🌟 ${locales[locale].events.log_type_subscribe}`);
      expect(rowsAfterChange[5].children[3].textContent).toBe(locales[locale].events.log_detail_subscribe);
    } finally {
      window.close();
    }
  });

  test('keeps history loading, empty, failure and retry text current across DE/EN/ES/FR', async () => {
    let resolveRequest;
    let responseMode = 'pending';
    const { window, api, changeLocale } = createFixture();
    window.fetch = jest.fn(() => {
      if (responseMode === 'pending') return new Promise(resolve => { resolveRequest = resolve; });
      if (responseMode === 'failure') return Promise.resolve({ ok: false, json: async () => ({ success: false }) });
      return Promise.resolve({ ok: true, json: async () => ({ success: true, logs: [] }) });
    });
    try {
      const loading = api.loadEventHistory();
      expect(window.document.getElementById('event-log-status').textContent).toBe(locales.en.events.history_loading);
      for (const locale of ['de', 'es', 'fr', 'en']) {
        changeLocale(locale);
        expect(window.document.getElementById('event-log-status').textContent).toBe(locales[locale].events.history_loading);
      }
      responseMode = 'failure';
      resolveRequest({ ok: false, json: async () => ({ success: false }) });
      await expect(loading).resolves.toBe(false);
      for (const locale of ['de', 'es', 'fr', 'en']) {
        changeLocale(locale);
        expect(window.document.getElementById('event-log-status').textContent).toBe(locales[locale].events.history_load_error);
        expect(window.document.getElementById('event-log-retry-btn').textContent).toBe(locales[locale].events.history_retry);
      }
      responseMode = 'empty';
      await expect(api.loadEventHistory()).resolves.toBe(true);
      for (const locale of ['de', 'es', 'fr', 'en']) {
        changeLocale(locale);
        expect(window.document.getElementById('event-log-status').textContent).toBe(locales[locale].events.no_events);
        if (locale !== 'en') {
          expect(window.document.getElementById('event-log-status').textContent).not.toBe(locales.en.events.no_events);
        }
      }
    } finally {
      window.close();
    }
  });

  test('renders empty and populated statistics panels immediately in the selected locale', () => {
    const { window, api, changeLocale } = createFixture();
    try {
      api.refreshStatsPanelContent('viewers');
      api.refreshStatsPanelContent('chat');
      api.refreshStatsPanelContent('likes');
      const expectations = [
        ['viewers-list', 'no_viewers'], ['chat-list', 'no_messages'], ['likes-list', 'no_likes'],
        ['coins-list', 'no_coins'], ['followers-list', 'no_followers'],
        ['subscribers-list', 'no_subscribers'], ['gifts-list', 'no_gifts']
      ];
      for (const locale of ['de', 'en', 'es', 'fr']) {
        changeLocale(locale);
        for (const [id, key] of expectations) {
          api.refreshStatsPanelContent(id.replace('-list', ''));
          expect(window.document.getElementById(id).textContent).toBe(locales[locale].dashboard[key]);
        }
      }

      api.trackEventForStatsMenu('chat', { username: 'synthetic-viewer', nickname: 'Synthetic', message: 'fixture only' });
      api.refreshStatsPanelContent('viewers');
      for (const locale of ['de', 'en', 'es', 'fr']) {
        changeLocale(locale);
        const viewer = window.document.querySelector('#viewers-list .stats-panel-item');
        expect(viewer.textContent).toContain('Synthetic');
        expect(viewer.textContent).toContain('@synthetic-viewer');
      }
      expect(window.fetch).not.toHaveBeenCalled();
    } finally {
      window.close();
    }
  });
});
