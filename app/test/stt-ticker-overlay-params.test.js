const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const overlayPath = path.join(__dirname, '../plugins/stt-ticker/overlay/ticker.html');

function bootOverlay(search = '') {
  const html = fs.readFileSync(overlayPath, 'utf8')
    .replace('<script src="/socket.io/socket.io.js"></script>', '');
  const handlers = {};

  const dom = new JSDOM(html, {
    url: `http://localhost:3001/overlay/stt-ticker${search}`,
    runScripts: 'dangerously',
    beforeParse(window) {
      window.console = {
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      };
      window.io = jest.fn(() => ({
        on(event, handler) {
          handlers[event] = handler;
        }
      }));
    }
  });

  return { dom, handlers };
}

describe('STT Ticker overlay params', () => {
  test.each(['classic', 'modern', 'minimal', 'neon', 'glass', 'compact', 'cinematic'])(
    'renders captions with the retained %s style',
    design => {
      const { dom, handlers } = bootOverlay(`?design=${design}&position=bottom-center&maxLines=2&fontSize=36px`);

      handlers['stt-ticker:transcript']({ segments: [{ id: 1, text: 'Visible caption' }] });

      expect(dom.window.document.body.dataset.design).toBe(design);
      expect(dom.window.document.getElementById('lines').textContent).toContain('Visible caption');
    }
  );

  test.each(['dual-language', 'scrolling', 'fliessend', 'starwars', 'ticker3', 'karaoke'])(
    'maps the retired %s URL style to Classic',
    design => {
      const { dom } = bootOverlay(`?design=${design}`);

      expect(dom.window.document.body.dataset.design).toBe('classic');
    }
  );

  test('renders Classic captions with the configured position and font size', () => {
    const { dom, handlers } = bootOverlay('?design=classic&position=top-right&maxLines=2&fontSize=42px');

    handlers['stt-ticker:transcript']({
      segments: [
        { id: 1, text: 'Hello there' },
        { id: 2, text: 'Hallo zusammen' }
      ]
    });

    const { document } = dom.window;
    const body = document.body;
    const classic = document.getElementById('lines');

    expect(body.dataset.design).toBe('classic');
    expect(body.dataset.position).toBe('top-right');
    expect(body.style.alignItems).toBe('flex-start');
    expect(body.style.justifyContent).toBe('flex-end');
    expect(body.style.paddingTop).toBe('32px');
    expect(classic.style.display).toBe('block');
    expect(classic.style.fontSize).toBe('42px');
    expect(classic.textContent).toContain('Hello there');
    expect(classic.textContent).toContain('Hallo zusammen');
  });

  test('renders every configured multi-language row even when classic maxLines is lower', () => {
    const { dom, handlers } = bootOverlay('?design=modern&position=middle-center&maxLines=2&fontSize=38px');

    handlers['stt-ticker:transcript']({
      multi: {
        lines: [
          { language: 'de', text: 'Guten Morgen', color: '#FFFFFF' },
          { language: 'en', text: 'Good morning', color: '#FFD700' },
          { language: 'fr', text: 'Bonjour', color: '#6BCBFF' }
        ]
      }
    });

    const { document } = dom.window;
    const body = document.body;
    const multi = document.getElementById('multi-lines');
    const classic = document.getElementById('lines');

    expect(body.dataset.design).toBe('modern');
    expect(body.dataset.position).toBe('middle-center');
    expect(body.style.alignItems).toBe('center');
    expect(body.style.justifyContent).toBe('center');
    expect(multi.style.display).toBe('block');
    expect(classic.style.display).toBe('none');
    expect(multi.style.fontSize).toBe('38px');
    expect(multi.querySelectorAll('.multi-line')).toHaveLength(3);
    expect(multi.textContent).toContain('Guten Morgen');
    expect(multi.textContent).toContain('Good morning');
    expect(multi.textContent).toContain('Bonjour');
  });

  test('hides older classic ring lines when maxLines is set to 1', () => {
    const { dom, handlers } = bootOverlay('?design=classic&position=bottom-left&maxLines=1&fontSize=24px');

    handlers['stt-ticker:transcript']({
      segments: [
        { id: 1, text: 'Alpha' },
        { id: 2, text: 'Beta' },
        { id: 3, text: 'Gamma' }
      ]
    });

    const { document } = dom.window;
    const body = document.body;
    const classic = document.getElementById('lines');
    const line0 = document.getElementById('line-0');
    const line1 = document.getElementById('line-1');
    const line2 = document.getElementById('line-2');

    expect(body.dataset.design).toBe('classic');
    expect(body.dataset.position).toBe('bottom-left');
    expect(body.style.alignItems).toBe('flex-end');
    expect(body.style.justifyContent).toBe('flex-start');
    expect(classic.style.display).toBe('block');
    expect(classic.style.fontSize).toBe('24px');
    expect(line0.textContent).toBe('Gamma');
    expect(line0.style.display).toBe('block');
    expect(line1.style.display).toBe('none');
    expect(line2.style.display).toBe('none');
  });
});
