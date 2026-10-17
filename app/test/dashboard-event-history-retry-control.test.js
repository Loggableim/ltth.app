'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const dashboardSource = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'js', 'dashboard.js'),
  'utf8'
);
const locales = Object.fromEntries(['en', 'de', 'es', 'fr'].map(locale => [
  locale,
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'locales', `${locale}.json`), 'utf8'))
]));
const eventLogStart = dashboardSource.indexOf('// ========== EVENT LOG ==========');
const eventLogEnd = dashboardSource.indexOf('// ========== STATS MENU NAVIGATION ==========', eventLogStart);
const initializeButtonsStart = dashboardSource.indexOf('function initializeButtons() {');
const initializeButtonsMarker = dashboardSource.indexOf('// ========== EVENT DELEGATION FOR DYNAMIC BUTTONS', initializeButtonsStart);
const initializeButtonsEnd = dashboardSource.lastIndexOf('}', initializeButtonsMarker) + 1;
if ([eventLogStart, eventLogEnd, initializeButtonsStart, initializeButtonsMarker].some(index => index < 0) || initializeButtonsEnd < 2) {
  throw new Error('Could not locate dashboard event-history or button initialization source');
}

function interpolate(value, params = {}) {
  return value.replace(/\{(\w+)\}/g, (match, name) => (
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
  ));
}

describe('Dashboard event history retry control', () => {
  test('clicking Retry after an API error restores saved rows and clears the error state', async () => {
    const dom = new JSDOM(`<!doctype html><html><body>
      <p id="event-log-status" hidden></p>
      <button id="event-log-retry-btn" data-i18n="events.history_retry" hidden>Retry</button>
      <button id="clear-events-btn">Clear</button>
      <table><tbody id="event-log"></tbody></table>
    </body></html>`, { runScripts: 'outside-only' });
    const { window } = dom;
    const fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({ success: false }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          logs: [{
            event_type: 'chat',
            timestamp: '2026-10-08T12:00:00.000Z',
            data: { username: 'synthetic-viewer', message: 'restored fixture row' }
          }]
        })
      });
    window.fetch = fetch;
    window.console = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    window.i18n = {
      t(key, params) {
        const value = key.split('.').reduce((current, part) => current && current[part], locales.en);
        return typeof value === 'string' ? interpolate(value, params) : key;
      }
    };
    window.trackEventForStatsMenu = jest.fn();
    window.escapeHtml = value => {
      const element = window.document.createElement('span');
      element.textContent = String(value);
      return element.innerHTML;
    };
    window.unlockAudio = jest.fn(async () => {});
    window.initProfileSearchFilter = jest.fn();
    window.setupEventDelegation = jest.fn();

    try {
      window.eval(`let audioUnlocked = false;\n${dashboardSource.slice(eventLogStart, eventLogEnd)}\n` +
        `${dashboardSource.slice(initializeButtonsStart, initializeButtonsEnd)}\n` +
        'window.eventHistoryRetryFixture = { initializeButtons, loadEventHistory };');
      window.eventHistoryRetryFixture.initializeButtons();

      await expect(window.eventHistoryRetryFixture.loadEventHistory()).resolves.toBe(false);
      const status = window.document.getElementById('event-log-status');
      const retryButton = window.document.getElementById('event-log-retry-btn');
      expect(status.textContent).toBe(locales.en.events.history_load_error);
      expect(status.hidden).toBe(false);
      expect(retryButton.hidden).toBe(false);

      retryButton.click();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(fetch).toHaveBeenLastCalledWith('/api/event-logs?limit=100', { cache: 'no-store' });
      expect(window.document.querySelectorAll('#event-log tr')).toHaveLength(1);
      expect(window.document.querySelector('#event-log tr').textContent).toContain('restored fixture row');
      expect(status.hidden).toBe(true);
      expect(status.textContent).toBe('');
      expect(retryButton.hidden).toBe(true);
    } finally {
      window.close();
    }
  });
});
