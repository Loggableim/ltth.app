const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

function jsonResponse(payload) {
  return { status: 200, json: async () => payload };
}

function bootUi() {
  const html = fs.readFileSync(path.join(__dirname, '../plugins/music-bot/ui.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '../plugins/music-bot/assets/ui.js'), 'utf8');
  const resolveRequests = [];
  let windowRef;
  const fetch = jest.fn((url, options = {}) => {
    if (String(url).includes('/api/plugins/music-bot/resolve?')) {
      return new Promise((resolve, reject) => {
        const request = {
          url: String(url),
          signal: options.signal,
          resolve: (payload) => resolve(jsonResponse(payload))
        };
        options.signal?.addEventListener('abort', () => {
          reject(new windowRef.DOMException('The operation was aborted.', 'AbortError'));
        }, { once: true });
        resolveRequests.push(request);
      });
    }
    return Promise.resolve(jsonResponse({ success: true }));
  });
  const dom = new JSDOM(html, {
    url: 'http://localhost:3000/plugins/music-bot/ui',
    runScripts: 'dangerously',
    beforeParse(window) {
      windowRef = window;
      window.io = () => ({ on: jest.fn(), emit: jest.fn() });
      window.fetch = fetch;
      window.open = jest.fn();
      window.navigator.clipboard = { writeText: jest.fn(async () => {}) };
    }
  });
  dom.window.eval(js);
  return { dom, fetch, resolveRequests };
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('Timed out waiting for UI fixture state');
}

describe('Music Bot search preview cancellation', () => {
  let dom;

  afterEach(() => {
    dom?.window.close();
    dom = null;
  });

  test('aborts preview on input and suppresses AbortError feedback/reset', async () => {
    const fixture = bootUi();
    dom = fixture.dom;
    await waitFor(() => fixture.fetch.mock.calls.length > 0);

    const input = dom.window.document.getElementById('search-input');
    input.value = 'older preview query';
    dom.window.document.getElementById('search-btn').click();
    await waitFor(() => fixture.resolveRequests.length === 1);
    const oldRequest = fixture.resolveRequests[0];
    expect(oldRequest.signal).toBeInstanceOf(dom.window.AbortSignal);
    expect(oldRequest.signal.aborted).toBe(false);

    input.value = 'https://www.youtube.com/watch?v=NEWID77';
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    await waitFor(() => oldRequest.signal.aborted);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(dom.window.document.getElementById('preview-frame').src).toContain('NEWID77');
    expect(dom.window.document.getElementById('search-feedback').textContent).toBe('');
    const toastMessages = [...dom.window.document.querySelectorAll('.musicbot-toast-message')]
      .map((element) => element.textContent);
    expect(toastMessages).not.toContain('GET request failed.');
  });

  test('replacing a preview aborts the old request and lets only the new result update UI', async () => {
    const fixture = bootUi();
    dom = fixture.dom;
    await waitFor(() => fixture.fetch.mock.calls.length > 0);

    const input = dom.window.document.getElementById('search-input');
    const search = dom.window.document.getElementById('search-btn');
    input.value = 'first preview query';
    search.click();
    await waitFor(() => fixture.resolveRequests.length === 1);
    const first = fixture.resolveRequests[0];

    input.value = 'second preview query';
    search.click();
    await waitFor(() => fixture.resolveRequests.length === 2);
    const second = fixture.resolveRequests[1];
    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);

    second.resolve({
      success: true,
      song: {
        title: 'Second fixture result',
        artist: 'Offline fixture',
        duration: 120,
        source: 'soundcloud',
        url: 'https://example.test/offline-fixture'
      }
    });
    await waitFor(() => dom.window.document.getElementById('search-feedback').textContent.includes('Second fixture result'));

    expect(dom.window.document.getElementById('search-feedback').textContent).toContain('Second fixture result');
    expect(dom.window.document.getElementById('search-feedback').textContent).not.toContain('first preview query');
    const toastMessages = [...dom.window.document.querySelectorAll('.musicbot-toast-message')]
      .map((element) => element.textContent);
    expect(toastMessages).not.toContain('GET request failed.');
  });
});
