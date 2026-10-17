'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

function createHud(fetchMock) {
  const file = path.join(__dirname, '..', 'overlay', 'sidekick-hud.html');
  const html = fs.readFileSync(file, 'utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://127.0.0.1/overlay/sidekick/hud' });
  const { window } = dom;
  window.fetch = fetchMock;
  window.setInterval = () => 0;
  window.console.error = jest.fn();
  window.io = () => ({ on: jest.fn(), emit: jest.fn() });

  const scripts = [...window.document.querySelectorAll('script:not([src])')];
  const inlineScript = scripts[scripts.length - 1].textContent;
  window.eval(`${inlineScript}\nwindow.__hudTest = { fetchStatus, fetchEvents };`);

  return {
    dom,
    message: () => window.document.getElementById('availability-message'),
    statusDot: () => window.document.getElementById('status-dot'),
    hooks: window.__hudTest
  };
}

describe('Sidekick HUD fetch availability', () => {
  test('shows status failure instead of stale green, then clears the error on recovery', async () => {
    const pending = new Promise(() => {});
    const fetchMock = jest.fn()
      .mockReturnValueOnce(pending)
      .mockReturnValueOnce(pending)
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        success: true,
        status: { connected: true, muted: false, chatsPerMinute: 12, totalGifts: 4, totalFollows: 2, activeViewers: 7 }
      }) })
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        success: true,
        status: { connected: true, muted: false, chatsPerMinute: 3, totalGifts: 1, totalFollows: 1, activeViewers: 2 }
      }) });
    const hud = createHud(fetchMock);

    await hud.hooks.fetchStatus();
    expect(hud.statusDot().className).toBe('status-dot');
    expect(hud.message().classList.contains('hidden')).toBe(true);

    await hud.hooks.fetchStatus();
    expect(hud.statusDot().className).toBe('status-dot disconnected');
    expect(hud.message().textContent).toBe('Sidekick status unavailable');
    expect(hud.message().classList.contains('hidden')).toBe(false);

    await hud.hooks.fetchStatus();
    expect(hud.statusDot().className).toBe('status-dot');
    expect(hud.message().textContent).toBe('');
    expect(hud.message().classList.contains('hidden')).toBe(true);
    hud.dom.window.close();
  });

  test('reports event-feed failure while keeping a successful status separate, then clears on recovery', async () => {
    const pending = new Promise(() => {});
    const fetchMock = jest.fn()
      .mockReturnValueOnce(pending)
      .mockReturnValueOnce(pending)
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        success: true,
        status: { connected: true, muted: false, chatsPerMinute: 12, totalGifts: 4, totalFollows: 2, activeViewers: 7 }
      }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, events: [] }) })
      .mockRejectedValueOnce(new Error('synthetic network failure'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, events: [] }) });
    const hud = createHud(fetchMock);

    await hud.hooks.fetchStatus();
    await hud.hooks.fetchEvents();
    await hud.hooks.fetchEvents();
    expect(hud.message().textContent).toBe('Event feed unavailable');
    expect(hud.message().classList.contains('hidden')).toBe(false);

    await hud.hooks.fetchEvents();
    expect(hud.message().textContent).toBe('');
    expect(hud.message().classList.contains('hidden')).toBe(true);
    hud.dom.window.close();
  });
});
