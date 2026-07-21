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

  test('keeps the LIVE status when a socket sync arrives', () => {
    const document = new JSDOM('<!doctype html><html><body></body></html>').window.document;
    document.body.innerHTML = [
      '<span id="total-value"></span><span id="physical-count"></span>',
      '<span id="pending-count"></span><span id="connection-status"></span>',
      '<span id="livestream-status"></span><input id="overlay-url">'
    ].join('');
    const handlers = {};
    const admin = new SchnorrbecherAdmin({
      document,
      location: { origin: 'http://localhost:3000' },
      socket: {
        on: (event, handler) => { handlers[event] = handler; },
        emit: jest.fn()
      }
    });

    admin.bind();
    handlers['coinJar.sync']({
      totalCoinValue: 5,
      visualCoinCount: 1,
      livestreamStatus: 'active'
    });

    expect(document.querySelector('#livestream-status').textContent).toBe('LIVE');
  });

  test('exposes fixed pixel sizes for all gift value bands and serializes them as numbers', () => {
    const ui = fs.readFileSync(path.join(__dirname, '..', 'ui.html'), 'utf8');
    const document = new JSDOM([
      '<form id="coin-jar-config">',
      '<input name="giftSize1" type="number" value="32">',
      '<input name="giftSize5000Plus" type="number" value="180">',
      '</form>'
    ].join('')).window.document;
    const admin = new SchnorrbecherAdmin({ document });

    expect(ui).toContain('name="giftSize1"');
    expect(ui).toContain('1 Coin (px)');
    expect(ui).toContain('name="giftSize5000Plus"');
    expect(ui).toContain('5000+ Coins (px)');
    expect(ui).toContain('name="maxPhysicalIcons" type="number" min="20" max="3000"');
    expect(ui).toContain('Spawn-Delay-Multiplikator');
    expect(ui).not.toContain('name="physicsEnabled"');
    expect(admin.collectConfig()).toEqual({ giftSize1: 32, giftSize5000Plus: 180 });
  });
});
