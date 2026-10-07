const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

describe('TopTier combined board with the default variant', () => {
  test('requests and renders likes and gifts when board=combined and variant=animated-race', () => {
    const html = '<!doctype html><html><body><div id="tt-root"></div></body></html>';
    const dom = new JSDOM(html, {
      url: 'http://localhost/plugins/toptier/overlay.html?board=combined&variant=animated-race',
      runScripts: 'outside-only'
    });
    const handlers = new Map();
    const requests = [];
    const disconnect = jest.fn();
    dom.window.io = () => ({
      on: (event, handler) => handlers.set(event, handler),
      emit: (event, payload) => requests.push({ event, payload }),
      disconnect
    });

    try {
      const source = fs.readFileSync(path.join(__dirname, '../assets/overlay.js'), 'utf8');
      dom.window.eval(source);
      dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
      handlers.get('connect')();

      expect(requests).toEqual([
        { event: 'toptier:get-board', payload: { board: 'likes' } },
        { event: 'toptier:get-board', payload: { board: 'gifts' } }
      ]);

      handlers.get('toptier:update')({
        board: 'likes',
        entries: [{ username: 'SyntheticLiker', nickname: 'Synthetic Liker', profile_picture_url: '', score: 120, rank: 1 }],
        sessionId: 'fixture-session-a'
      });
      handlers.get('toptier:update')({
        board: 'gifts',
        entries: [{ username: 'SyntheticGifter', nickname: 'Synthetic Gifter', profile_picture_url: '', score: 45, rank: 1 }],
        sessionId: 'fixture-session-a'
      });

      const root = dom.window.document.getElementById('tt-root');
      expect(root.className).toContain('tt-variant-animated-race');
      expect(root.querySelector('.tt-board-title').textContent).toContain('Likes');
      expect(root.textContent).toContain('Synthetic Liker');
      expect(root.textContent).toContain('Gifts');
      expect(root.textContent).toContain('Synthetic Gifter');
      dom.window.dispatchEvent(new dom.window.Event('pagehide'));
      expect(disconnect).toHaveBeenCalledTimes(1);
    } finally {
      dom.window.close();
    }
  });
});
