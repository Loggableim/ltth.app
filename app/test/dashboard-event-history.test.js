'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const dashboardSource = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'js', 'dashboard.js'),
  'utf8'
);
const dashboardHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.html'), 'utf8');
const locales = Object.fromEntries(['en', 'de', 'es', 'fr'].map(locale => [
  locale,
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'locales', `${locale}.json`), 'utf8'))
]));
const sectionStart = dashboardSource.indexOf('// ========== EVENT LOG ==========');
const sectionEnd = dashboardSource.indexOf('// ========== STATS MENU NAVIGATION ==========', sectionStart);
const eventLogSource = dashboardSource.slice(sectionStart, sectionEnd);

function createEventLogFixture(fetchImpl = jest.fn(), locale = 'en') {
  const dom = new JSDOM(`<!doctype html><html><body>
    <p id="event-log-status" hidden></p>
    <button id="event-log-retry-btn" data-i18n="events.history_retry" hidden>Retry</button>
    <button id="clear-events-btn">Clear</button>
    <table><tbody id="event-log"></tbody></table>
  </body></html>`, { runScripts: 'outside-only' });
  const { window } = dom;
  window.fetch = fetchImpl;
  window.i18n = {
    t: key => key.split('.').reduce((value, part) => value && value[part], locales[locale]) || key
  };
  const retryButton = window.document.getElementById('event-log-retry-btn');
  retryButton.textContent = window.i18n.t(retryButton.dataset.i18n);
  window.console.error = jest.fn();
  window.trackEventForStatsMenu = jest.fn();
  window.escapeHtml = value => {
    const element = window.document.createElement('span');
    element.textContent = String(value);
    return element.innerHTML;
  };
  window.eval(`${eventLogSource}\nwindow.eventLogApi = {
    handleLiveEvent, loadEventHistory, clearEventHistory
  };`);
  return { dom, window, api: window.eventLogApi };
}

function response(logs, overrides = {}) {
  return {
    ok: true,
    json: async () => ({ success: true, logs }),
    ...overrides
  };
}

describe('Dashboard event history', () => {
  test('wires restore, live socket updates, persistent clear, and retry to the dashboard controls', () => {
    expect(dashboardSource).toContain('loadEventHistory(),');
    expect(dashboardSource).toMatch(/socket\.on\('tiktok:event'[\s\S]{0,100}handleLiveEvent\(event\)/);
    expect(dashboardSource).toContain("clearEventsBtn.addEventListener('click', clearEventHistory)");
    expect(dashboardSource).toContain("eventLogRetryBtn.addEventListener('click', loadEventHistory)");
    expect(dashboardSource).toContain("fetch('/api/event-logs/clear'");
    expect(dashboardHtml).toContain('data-i18n="events.history_retry"');
  });

  test('restores saved rows newest-first from the event-log API and renders stored content as text', async () => {
    const fetch = jest.fn().mockResolvedValue(response([
      { event_type: 'chat', timestamp: '2026-10-07T12:00:02Z', data: { username: 'new', message: 'latest' } },
      { event_type: 'chat', timestamp: '2026-10-07T12:00:01Z', data: { username: 'old', message: '<img src=x onerror=alert(1)>' } }
    ]));
    const fixture = createEventLogFixture(fetch);
    try {
      await expect(fixture.api.loadEventHistory()).resolves.toBe(true);
      const rows = [...fixture.window.document.querySelectorAll('#event-log tr')];
      expect(fetch).toHaveBeenCalledWith('/api/event-logs?limit=100', { cache: 'no-store' });
      expect(rows).toHaveLength(2);
      expect(rows[0].textContent).toContain('latest');
      expect(rows[1].textContent).toContain('<img src=x onerror=alert(1)>');
      expect(rows[1].querySelector('img')).toBeNull();
      expect(fixture.window.document.getElementById('event-log-status').hidden).toBe(true);
    } finally {
      fixture.dom.window.close();
    }
  });

  test('keeps live events received during restore, avoids duplicates, and caps the table at 100 rows', async () => {
    let resolveHistory;
    const fetch = jest.fn(() => new Promise(resolve => { resolveHistory = resolve; }));
    const fixture = createEventLogFixture(fetch);
    try {
      const loading = fixture.api.loadEventHistory();
      const overlappingEvent = { type: 'chat', data: { username: 'viewer', message: 'overlap' } };
      fixture.api.handleLiveEvent(overlappingEvent);
      fixture.api.handleLiveEvent(overlappingEvent);
      resolveHistory(response([
        { event_type: 'chat', data: overlappingEvent.data, timestamp: '2026-10-07T12:00:00Z' }
      ]));
      await expect(loading).resolves.toBe(true);
      expect(fixture.window.document.querySelectorAll('#event-log tr')).toHaveLength(2);
      expect([...fixture.window.document.querySelectorAll('#event-log tr')]
        .filter(row => row.textContent.includes('overlap'))).toHaveLength(2);

      for (let index = 0; index < 101; index += 1) {
        fixture.api.handleLiveEvent({ type: 'chat', data: { message: `live-${index}` } });
      }
      const rows = fixture.window.document.querySelectorAll('#event-log tr');
      expect(rows).toHaveLength(100);
      expect(rows[0].textContent).toContain('live-100');
      expect([...rows].some(row => row.textContent.includes('overlap'))).toBe(false);
    } finally {
      fixture.dom.window.close();
    }
  });

  test('clears persisted history before clearing the dashboard rows', async () => {
    const fetch = jest.fn()
      .mockResolvedValueOnce(response([{ event_type: 'follow', data: { username: 'viewer' } }]))
      .mockResolvedValueOnce(response([], { json: async () => ({ success: true }) }));
    const fixture = createEventLogFixture(fetch);
    try {
      await fixture.api.loadEventHistory();
      await expect(fixture.api.clearEventHistory()).resolves.toBe(true);
      expect(fetch).toHaveBeenLastCalledWith('/api/event-logs/clear', expect.objectContaining({ method: 'POST' }));
      expect(fixture.window.document.querySelectorAll('#event-log tr')).toHaveLength(0);
      expect(fixture.window.document.getElementById('event-log-status').textContent).toBe(locales.en.events.no_events);
      expect(fixture.window.document.getElementById('clear-events-btn').disabled).toBe(false);
    } finally {
      fixture.dom.window.close();
    }
  });

  test('does not let an in-flight restore repopulate rows after a successful clear', async () => {
    let resolveHistory;
    const fetch = jest.fn()
      .mockImplementationOnce(() => new Promise(resolve => { resolveHistory = resolve; }))
      .mockResolvedValueOnce(response([], { json: async () => ({ success: true }) }));
    const fixture = createEventLogFixture(fetch);
    try {
      const loading = fixture.api.loadEventHistory();
      await expect(fixture.api.clearEventHistory()).resolves.toBe(true);
      resolveHistory(response([{ event_type: 'chat', data: { message: 'stale history' } }]));
      await expect(loading).resolves.toBe(false);
      expect(fixture.window.document.querySelectorAll('#event-log tr')).toHaveLength(0);
    } finally {
      fixture.dom.window.close();
    }
  });

  test('does not start a retry restore while persistent clear is in flight', async () => {
    let resolveClear;
    const fetch = jest.fn(() => new Promise(resolve => { resolveClear = resolve; }));
    const fixture = createEventLogFixture(fetch);
    try {
      fixture.window.document.querySelector('#event-log').innerHTML = '<tr><td>old</td></tr>';
      const clearing = fixture.api.clearEventHistory();
      await expect(fixture.api.loadEventHistory()).resolves.toBe(false);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fixture.window.document.getElementById('event-log-retry-btn').disabled).toBe(true);

      resolveClear(response([], { json: async () => ({ success: true }) }));
      await expect(clearing).resolves.toBe(true);
      expect(fixture.window.document.querySelectorAll('#event-log tr')).toHaveLength(0);
      expect(fixture.window.document.getElementById('event-log-retry-btn').disabled).toBe(false);
    } finally {
      fixture.dom.window.close();
    }
  });

  test.each(['en', 'de', 'es', 'fr'])(
    'shows localized loading, failure, retry, and clear-failure messages in %s',
    async locale => {
      const fetch = jest.fn()
        .mockResolvedValueOnce({ ok: false, json: async () => ({ success: false }) })
        .mockResolvedValueOnce(response([]))
        .mockResolvedValueOnce({ ok: false, json: async () => ({ success: false }) });
      const fixture = createEventLogFixture(fetch, locale);
      try {
        const loading = fixture.api.loadEventHistory();
        const status = fixture.window.document.getElementById('event-log-status');
        expect(status.textContent).toBe(locales[locale].events.history_loading);
        expect(status.dataset.i18n).toBe('events.history_loading');
        await expect(loading).resolves.toBe(false);
        expect(status.textContent).toBe(locales[locale].events.history_load_error);
        expect(fixture.window.document.getElementById('event-log-retry-btn').textContent)
          .toBe(locales[locale].events.history_retry);

        await expect(fixture.api.loadEventHistory()).resolves.toBe(true);
        await expect(fixture.api.clearEventHistory()).resolves.toBe(false);
        expect(status.textContent).toBe(locales[locale].events.history_clear_error);
        expect(status.dataset.i18n).toBe('events.history_clear_error');
      } finally {
        fixture.dom.window.close();
      }
    }
  );

  test('shows a retryable load error and preserves rows when persistent clear fails', async () => {
    const fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({ success: false }) })
      .mockResolvedValueOnce(response([{ event_type: 'gift', data: { giftName: 'Rose' } }]))
      .mockResolvedValueOnce({ ok: false, json: async () => ({ success: false }) });
    const fixture = createEventLogFixture(fetch);
    try {
      await expect(fixture.api.loadEventHistory()).resolves.toBe(false);
      const status = fixture.window.document.getElementById('event-log-status');
      expect(status.textContent).toBe(locales.en.events.history_load_error);
      expect(fixture.window.document.getElementById('event-log-retry-btn').hidden).toBe(false);

      await expect(fixture.api.loadEventHistory()).resolves.toBe(true);
      await expect(fixture.api.clearEventHistory()).resolves.toBe(false);
      expect(fixture.window.document.querySelectorAll('#event-log tr')).toHaveLength(1);
      expect(status.textContent).toBe(locales.en.events.history_clear_error);
    } finally {
      fixture.dom.window.close();
    }
  });
});
