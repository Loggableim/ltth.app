const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const { SchnorrbecherAdmin } = require('../ui');

describe('Schnorrbecher admin UI', () => {
  test('renders state and sends catalog-backed test, add, reset, and cache-clear actions', async () => {
    const document = new JSDOM('<!doctype html><html><body></body></html>').window.document;
    document.body.innerHTML = [
      '<span id="total-value"></span><span id="physical-count"></span>',
      '<span id="pending-count"></span><span id="connection-status"></span>',
      '<span id="livestream-status"></span><input id="overlay-url">',
      '<button id="test-gift"></button><button id="add-coins"></button>',
      '<button id="reset-coin-jar"></button><button id="clear-event-cache"></button>'
    ].join('');

    const calls = [];
    const admin = new SchnorrbecherAdmin({
      document,
      fetch: async (url, options = {}) => {
        calls.push({ url, options });
        return { ok: true, json: async () => ({ state: {} }) };
      },
      location: { origin: 'http://localhost:3000' },
      confirm: () => true,
      clipboard: { writeText: jest.fn() }
    });

    admin.renderStatus({
      state: { totalCoinValue: 1245 },
      physicalCoinCount: 83,
      pendingSpawns: 2,
      livestreamStatus: 'active'
    });

    expect(document.querySelector('#total-value').textContent).toBe(new Intl.NumberFormat().format(1245));
    expect(document.querySelector('#physical-count').textContent).toBe('83');
    expect(document.querySelector('#pending-count').textContent).toBe('2');
    expect(document.querySelector('#overlay-url').value).toBe('http://localhost:3000/overlay/coincup?transparent=1');

    await admin.triggerTestGift();
    await admin.addCoins();
    await admin.reset();
    await admin.clearEventCache();

    expect(calls.map(call => call.url)).toEqual(expect.arrayContaining([
      '/api/coin-jar/test-gift',
      '/api/coin-jar/reset',
      '/api/coin-jar/event-cache/clear'
    ]));
    expect(calls.filter(call => call.url === '/api/coin-jar/test-gift')).toHaveLength(2);
  });

  test('offers the three generated glass styles in the configuration form', () => {
    const ui = fs.readFileSync(path.join(__dirname, '..', 'ui.html'), 'utf8');

    expect(ui).toContain('name="jarStyle"');
    expect(ui).toContain('value="classic"');
    expect(ui).toContain('value="mason"');
    expect(ui).toContain('value="arcade"');
  });
});
