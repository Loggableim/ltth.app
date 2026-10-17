'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const SCRIPT_PATH = path.join(ROOT, 'plugins/clarityhud/overlays/full.js');

describe('ClarityHUD SuperFan display renderer', () => {
  test('renders only text, event type, level, and no-referrer allowlisted avatar from its own channel', () => {
    const dom = new JSDOM('<div id="overlay-container"><div class="feed-container"></div></div>', {
      runScripts: 'outside-only',
      url: 'http://127.0.0.1:3000/overlay/clarity/full',
      pretendToBeVisual: true
    });
    const { window } = dom;
    const handlers = new Map();
    const socket = {
      connected: false,
      on(event, handler) {
        const list = handlers.get(event) || [];
        list.push(handler);
        handlers.set(event, list);
      },
      off() {},
      disconnect() {},
      deliver(event, payload) { (handlers.get(event) || []).forEach(handler => handler(payload)); }
    };

    try {
      window.i18n = { ready: new Promise(() => {}) };
      window.io = () => socket;
      window.requestAnimationFrame = callback => window.setTimeout(callback, 0);
      window.eval(`${fs.readFileSync(SCRIPT_PATH, 'utf8')}\nwindow.__superfanTest = { STATE, connectSocket };`);
      const { STATE, connectSocket } = window.__superfanTest;
      STATE.container = window.document.getElementById('overlay-container');
      STATE.settings = {
        showSuperFans: true,
        layoutMode: 'singleStream',
        feedDirection: 'top',
        maxLines: 20,
        useVirtualScrolling: false,
        animationIn: 'none'
      };
      STATE.events.superfanDisplay = [];
      connectSocket();

      const markupName = '<img src=x onerror=alert(1)>';
      socket.deliver('clarityhud.update.superfan-display', {
        eventType: 'superfan-join', displayName: markupName, level: 5
      });

      const textCard = window.document.querySelector('.event-item');
      expect(textCard.querySelector('.event-username').textContent).toBe(markupName);
      expect(textCard.querySelector('img')).toBeNull();
      expect(textCard.querySelector('.event-type').textContent).toBe('possible Super Fan club join signal');
      expect(textCard.querySelector('.event-gift-info').textContent).toBe('Level 5');
      expect(STATE.events.superfanDisplay).toHaveLength(1);

      socket.deliver('clarityhud.update.superfan-display', {
        eventType: 'superfan', displayName: 'Avatar fixture',
        profilePictureUrl: 'https://p16-sign.tiktokcdn.com/fixture.jpg'
      });
      const avatar = [...window.document.querySelectorAll('.event-item img')][0];
      expect(avatar.referrerPolicy).toBe('no-referrer');
      expect(avatar.src).toBe('https://p16-sign.tiktokcdn.com/fixture.jpg');
      expect(handlers.has('clarityhud.update.subscribe')).toBe(true);
      expect(handlers.get('clarityhud.update.subscribe')).toHaveLength(1);
    } finally {
      window.close();
    }
  });
});
