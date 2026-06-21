const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const wikiScript = fs.readFileSync(
  path.join(__dirname, '../public/js/wiki.js'),
  'utf8'
);

function createWikiDom() {
  const dom = new JSDOM(`<!doctype html>
    <html>
      <body>
        <aside class="wiki-sidebar">
          <div class="wiki-search-container">
            <input id="wiki-search" />
          </div>
          <nav id="wiki-nav"></nav>
        </aside>
        <main class="wiki-content">
          <div id="wiki-article"></div>
        </main>
      </body>
    </html>`, {
    runScripts: 'outside-only',
    url: 'http://localhost/wiki.html'
  });

  dom.window.FrontendLogger = {
    createLogger: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    })
  };
  dom.window.lucide = { createIcons: jest.fn() };

  return dom;
}

function okJson(body) {
  return {
    ok: true,
    json: async () => body
  };
}

async function waitFor(assertion) {
  const started = Date.now();
  let lastError;

  while (Date.now() - started < 1000) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  throw lastError;
}

describe('Wiki client regressions', () => {
  test('uses stored language before the initial page request', async () => {
    const dom = createWikiDom();
    const requests = [];

    dom.window.localStorage.setItem('wiki-language', 'de');
    dom.window.fetch = jest.fn(async url => {
      requests.push(String(url));
      if (String(url).includes('/structure')) {
        return okJson({
          sections: [{
            id: 'start',
            title: 'Start',
            icon: 'book-open',
            pages: [{ id: 'home', title: 'Home', icon: 'home' }]
          }]
        });
      }

      return okJson({
        id: 'home',
        title: 'Home',
        html: '<h2 id="deutsch">Deutsch</h2>',
        toc: [],
        breadcrumb: [],
        languageAnchor: 'deutsch',
        lastUpdated: '2026-04-28T00:00:00.000Z'
      });
    });

    dom.window.eval(wikiScript);
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));

    await waitFor(() => {
      expect(requests).toContain('/api/wiki/page/home?lang=de');
    });
    expect(requests).not.toContain('/api/wiki/page/home?lang=en');
  });

  test('renders search result fields as text instead of executable markup', async () => {
    const dom = createWikiDom();

    dom.window.fetch = jest.fn(async url => {
      const requestUrl = String(url);
      if (requestUrl.includes('/structure')) {
        return okJson({
          sections: [{
            id: 'start',
            title: 'Start',
            icon: 'book-open',
            pages: [{ id: 'home', title: 'Home', icon: 'home' }]
          }]
        });
      }

      if (requestUrl.includes('/search')) {
        return okJson([{
          id: 'home',
          title: '<img src=x onerror="danger()">Danger',
          section: 'Start',
          excerpt: '<script>danger()</script> documentation',
          matches: ['danger']
        }]);
      }

      return okJson({
        id: 'home',
        title: 'Home',
        html: '<p>Home</p>',
        toc: [],
        breadcrumb: [],
        languageAnchor: 'english',
        lastUpdated: '2026-04-28T00:00:00.000Z'
      });
    });

    dom.window.eval(wikiScript);
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));

    await waitFor(() => {
      expect(dom.window.document.querySelector('.wiki-article-content')).not.toBeNull();
    });

    const input = dom.window.document.getElementById('wiki-search');
    input.value = 'danger';
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));

    await new Promise(resolve => setTimeout(resolve, 350));
    await waitFor(() => {
      expect(dom.window.document.getElementById('wiki-search-results')).not.toBeNull();
    });

    const results = dom.window.document.getElementById('wiki-search-results');
    expect(results).not.toBeNull();
    expect(results.querySelector('img')).toBeNull();
    expect(results.querySelector('script')).toBeNull();
    expect(results.textContent).toContain('<img src=x onerror="danger()">Danger');
    expect(results.textContent).toContain('<script>danger()</script> documentation');
  });
});
