const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const overlayPath = path.join(__dirname, '../plugins/stt-ticker/overlay/ticker.html');

function bootOverlay() {
  const html = fs.readFileSync(overlayPath, 'utf8')
    .replace('<script src="/socket.io/socket.io.js"></script>', '');
  const handlers = {};
  const dom = new JSDOM(html, {
    url: 'http://localhost:3001/overlay/stt-ticker?design=classic&maxLines=2',
    runScripts: 'dangerously',
    beforeParse(window) {
      window.io = () => ({
        on(event, handler) { handlers[event] = handler; }
      });
      window.console = { log() {}, warn() {}, error() {} };
    }
  });
  return { dom, handlers };
}

describe('STT Ticker Deepgram interim overlay', () => {
  test('replaces the ephemeral line without adding it to the final ring', () => {
    const { dom, handlers } = bootOverlay();
    const document = dom.window.document;

    handlers['stt-ticker:transcript']({ segments: [{ id: 1, text: 'Vorheriger Satz.' }] });
    handlers['stt-ticker:interim']({ text: 'Hallo', provider: 'deepgram', isFinal: false });

    expect(document.getElementById('line-0').textContent).toBe('Hallo');
    expect(document.getElementById('line-1').textContent).toBe('Vorheriger Satz.');

    handlers['stt-ticker:interim']({ text: 'Hallo Welt', provider: 'deepgram', isFinal: false });
    expect(document.getElementById('line-0').textContent).toBe('Hallo Welt');

    handlers['stt-ticker:interim']({ text: '', provider: 'deepgram', isFinal: true });
    expect(document.getElementById('line-0').textContent).toBe('Vorheriger Satz.');
    expect(document.getElementById('lines').textContent).not.toContain('Hallo Welt');
  });

  test('reveals the committed final line after the interim is cleared', () => {
    const { dom, handlers } = bootOverlay();
    const document = dom.window.document;

    handlers['stt-ticker:interim']({ text: 'Finaler', isFinal: false });
    handlers['stt-ticker:transcript']({ segments: [{ id: 2, text: 'Finaler Satz.' }] });
    handlers['stt-ticker:interim']({ text: '', isFinal: true });

    expect(document.getElementById('line-0').textContent).toBe('Finaler Satz.');
  });
});
