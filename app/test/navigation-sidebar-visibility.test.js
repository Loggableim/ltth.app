const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const navigationScript = fs.readFileSync(
  path.join(__dirname, '../public/js/navigation.js'),
  'utf8'
);

function okJson(body) {
  return {
    ok: true,
    json: async () => body
  };
}

function createNavigationDom() {
  const dom = new JSDOM(`<!doctype html>
    <html>
      <body>
        <style>
          .content-view { display: none; }
          .content-view.active { display: flex; }
        </style>
        <aside id="sidebar" class="sidebar">
          <div class="sidebar-header">
            <button id="sidebar-toggle" type="button"></button>
          </div>
          <nav class="sidebar-nav">
            <div class="sidebar-category" data-category="audio-voice">
              <div class="sidebar-category-items">
                <a href="#" class="sidebar-item" data-view="tts" data-plugin="tts" data-tooltip="TTS">
                  <span class="sidebar-item-text">TTS</span>
                </a>
                <a href="#" class="sidebar-item" data-view="dashboard" data-tooltip="Dashboard">
                  <span class="sidebar-item-text">Dashboard</span>
                </a>
                <a href="#" class="sidebar-item" data-view="flows" data-tooltip="Flows">
                  <span class="sidebar-item-text">Flows</span>
                </a>
              </div>
            </div>
          </nav>
        </aside>
        <main>
          <div id="view-tts" class="content-view" data-plugin="tts"></div>
          <div id="view-dashboard" class="content-view"></div>
          <div id="view-flows" class="content-view"></div>
        </main>
      </body>
    </html>`, {
    runScripts: 'outside-only',
    url: 'http://localhost/dashboard.html'
  });

  const state = {
    ttsEnabled: false
  };

  dom.window.console = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };
  dom.window.fetch = jest.fn(async url => {
    if (String(url) === '/api/plugins') {
      return okJson({
        success: true,
        plugins: [
          { id: 'tts', enabled: state.ttsEnabled }
        ]
      });
    }

    throw new Error(`Unexpected fetch request in navigation sidebar test: ${url}`);
  });
  dom.window.lucide = { createIcons: jest.fn() };

  dom.window.eval(navigationScript);

  return { dom, state };
}

describe('Navigation sidebar plugin visibility', () => {
  test('allows switching to a hidden core view', () => {
    const { dom } = createNavigationDom();
    try {
      const flowsView = dom.window.document.getElementById('view-flows');
      const dashboardView = dom.window.document.getElementById('view-dashboard');

      expect(flowsView.classList.contains('active')).toBe(false);
      expect(dom.window.NavigationManager).toBeDefined();

      dom.window.NavigationManager.switchView('flows');

      expect(flowsView.classList.contains('active')).toBe(true);
      expect(dashboardView.classList.contains('active')).toBe(false);
    } finally {
      dom.window.close();
    }
  });

  test('keeps disabled plugin views blocked from navigation', () => {
    const { dom } = createNavigationDom();
    try {
      const ttsView = dom.window.document.getElementById('view-tts');
      const dashboardView = dom.window.document.getElementById('view-dashboard');

      ttsView.setAttribute('data-plugin-state', 'disabled');

      dom.window.NavigationManager.switchView('tts');

      expect(ttsView.classList.contains('active')).toBe(false);
      expect(dashboardView.classList.contains('active')).toBe(true);
    } finally {
      dom.window.close();
    }
  });

  test('hides disabled sidebar plugin entries', async () => {
    const { dom } = createNavigationDom();
    try {
      const sidebarItem = dom.window.document.querySelector('.sidebar-item[data-plugin="tts"]');

      expect(sidebarItem).not.toBeNull();

      await dom.window.NavigationManager.refreshPluginVisibility();

      expect(sidebarItem.style.display).toBe('none');
      expect(sidebarItem.classList.contains('plugin-disabled')).toBe(false);
      expect(sidebarItem.getAttribute('aria-disabled')).toBeNull();
    } finally {
      dom.window.close();
    }
  });

  test('restores sidebar plugin entries when the plugin becomes enabled', async () => {
    const { dom, state } = createNavigationDom();
    try {
      const sidebarItem = dom.window.document.querySelector('.sidebar-item[data-plugin="tts"]');

      state.ttsEnabled = false;
      await dom.window.NavigationManager.refreshPluginVisibility();
      expect(sidebarItem.style.display).toBe('none');

      state.ttsEnabled = true;
      await dom.window.NavigationManager.refreshPluginVisibility();

      expect(sidebarItem.style.display).not.toBe('none');
      expect(sidebarItem.classList.contains('plugin-disabled')).toBe(false);
      expect(sidebarItem.getAttribute('aria-disabled')).toBe('false');
    } finally {
      dom.window.close();
    }
  });
});
