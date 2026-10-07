const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const releasePolicy = require('../config/plugin-release-policy.json');

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

function createNavigationDom(options = {}) {
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
              <a href="#" class="sidebar-item" data-view="stream-monsters" data-plugin="stream-monsters">Stream Monsters</a>
          </nav>
        </aside>
        <div id="shortcuts-grid"></div>
        <main>
          <div id="view-tts" class="content-view" data-plugin="tts"></div>
          <div id="view-dashboard" class="content-view"></div>
          <div id="view-flows" class="content-view"></div>
          <div id="view-stream-monsters" class="content-view" data-plugin="stream-monsters"><iframe data-src="/stream-monsters/ui"></iframe></div>
          <div id="view-webgpu-emoji-rain" class="content-view" data-plugin="webgpu-emoji-rain"><iframe data-src="/webgpu-emoji-rain/ui"></iframe></div>
        </main>
      </body>
    </html>`, {
    runScripts: 'outside-only',
    url: options.url || 'http://localhost/dashboard.html'
  });

  const state = {
    ttsEnabled: false,
    distributionMode: options.distributionMode || 'local',
    plugins: options.plugins || null,
    fetchResults: [],
    requests: 0
  };
  if (options.savedView) dom.window.localStorage.setItem('active-view', options.savedView);

  dom.window.console = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };
  dom.window.fetch = jest.fn(async url => {
    if (String(url) === '/api/plugins') {
      state.requests += 1;
      const queued = state.fetchResults.shift();
      if (queued instanceof Error) throw queued;
      if (queued) return queued;
      return okJson({
        success: true,
        distributionMode: state.distributionMode,
        plugins: state.plugins || [{ id: 'tts', enabled: state.ttsEnabled }]
      });
    }

    throw new Error(`Unexpected fetch request in navigation sidebar test: ${url}`);
  });
  dom.window.lucide = { createIcons: jest.fn() };

  const domReadyListeners = [];
  const addEventListener = dom.window.document.addEventListener.bind(dom.window.document);
  dom.window.document.addEventListener = (type, listener, ...args) => {
    if (type === 'DOMContentLoaded') {
      domReadyListeners.push(listener);
      return;
    }
    return addEventListener(type, listener, ...args);
  };
  dom.window.eval(navigationScript);
  dom.window.document.addEventListener = addEventListener;

  return {
    dom,
    state,
    async runDomReady() {
      for (const listener of domReadyListeners) {
        await listener.call(dom.window.document, new dom.window.Event('DOMContentLoaded'));
      }
    }
  };
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

  test('hides public beta shortcuts and blocks their static views', async () => {
    const { dom, runDomReady } = createNavigationDom({
      distributionMode: 'public',
      plugins: [{ id: 'tts', enabled: true }]
    });
    try {
      await runDomReady();
      const sidebar = dom.window.document.querySelector('.sidebar-item[data-plugin="stream-monsters"]');
      const monsterShortcut = dom.window.document.querySelector('.shortcut-card[data-view="stream-monsters"]');
      const emojiShortcut = dom.window.document.querySelector('.shortcut-card[data-view="webgpu-emoji-rain"]');
      const monsterView = dom.window.document.getElementById('view-stream-monsters');

      expect(sidebar.style.display).toBe('none');
      expect(monsterShortcut.style.display).toBe('none');
      expect(emojiShortcut.style.display).toBe('none');
      expect(monsterView.dataset.pluginState).toBe('blocked');
      dom.window.NavigationManager.switchView('stream-monsters');
      expect(monsterView.classList.contains('active')).toBe(false);
      expect(monsterView.querySelector('iframe').hasAttribute('src')).toBe(false);
    } finally {
      dom.window.close();
    }
  });

  test('keeps all local beta views and shortcuts available in developer mode', async () => {
    const betaPlugins = releasePolicy.closedBeta.map(id => ({ id, enabled: true }));
    const { dom, runDomReady } = createNavigationDom({
      distributionMode: 'local',
      plugins: [{ id: 'tts', enabled: true }, ...betaPlugins]
    });
    try {
      const sidebarItems = dom.window.document.querySelector('.sidebar-category-items');
      const main = dom.window.document.querySelector('main');
      releasePolicy.closedBeta.forEach(id => {
        if (!dom.window.document.querySelector(`.sidebar-item[data-plugin="${id}"]`)) {
          const link = dom.window.document.createElement('a');
          link.className = 'sidebar-item';
          link.dataset.plugin = id;
          link.dataset.view = id;
          sidebarItems.appendChild(link);
        }
        if (!dom.window.document.getElementById(`view-${id}`)) {
          const view = dom.window.document.createElement('div');
          view.id = `view-${id}`;
          view.className = 'content-view';
          view.dataset.plugin = id;
          main.appendChild(view);
        }
      });
      await runDomReady();
      const shortcut = dom.window.document.querySelector('.shortcut-card[data-view="stream-monsters"]');
      const view = dom.window.document.getElementById('view-stream-monsters');

      expect(shortcut.style.display).not.toBe('none');
      expect(view.dataset.pluginState).toBe('enabled');
      releasePolicy.closedBeta.forEach(id => {
        expect(dom.window.document.querySelector(`.sidebar-item[data-plugin="${id}"]`).style.display).not.toBe('none');
        expect(dom.window.document.getElementById(`view-${id}`).dataset.pluginState).toBe('enabled');
      });
      dom.window.NavigationManager.switchView('stream-monsters');
      expect(view.classList.contains('active')).toBe(true);
      expect(view.querySelector('iframe').getAttribute('src')).toBe('/stream-monsters/ui');
    } finally {
      dom.window.close();
    }
  });

  test('does not restore a saved public beta view or load its iframe', async () => {
    const { dom, runDomReady } = createNavigationDom({
      distributionMode: 'public',
      plugins: [{ id: 'tts', enabled: true }],
      savedView: 'stream-monsters'
    });
    try {
      await runDomReady();
      const dashboard = dom.window.document.getElementById('view-dashboard');
      const monsterView = dom.window.document.getElementById('view-stream-monsters');

      expect(dashboard.classList.contains('active')).toBe(true);
      expect(monsterView.classList.contains('active')).toBe(false);
      expect(monsterView.querySelector('iframe').hasAttribute('src')).toBe(false);
      expect(dom.window.localStorage.getItem('active-view')).toBe('dashboard');
    } finally {
      dom.window.close();
    }
  });

  test('rejects a public beta view requested in the dashboard hash', async () => {
    const { dom, runDomReady } = createNavigationDom({
      distributionMode: 'public',
      plugins: [{ id: 'tts', enabled: true }],
      url: 'http://localhost/dashboard.html#webgpu-emoji-rain'
    });
    try {
      await runDomReady();
      const dashboard = dom.window.document.getElementById('view-dashboard');
      const emojiView = dom.window.document.getElementById('view-webgpu-emoji-rain');

      expect(dashboard.classList.contains('active')).toBe(true);
      expect(emojiView.classList.contains('active')).toBe(false);
      expect(emojiView.querySelector('iframe').hasAttribute('src')).toBe(false);
    } finally {
      dom.window.close();
    }
  });

  test('keeps plugin navigation pending through a failed API request, serves core views, and recovers on retry', async () => {
    const { dom, state, runDomReady } = createNavigationDom({
      distributionMode: 'public',
      plugins: [{ id: 'tts', enabled: true }],
      url: 'http://localhost/dashboard.html#stream-monsters'
    });
    try {
      state.fetchResults.push(new Error('temporary offline'));
      const monsterSidebar = dom.window.document.querySelector('.sidebar-item[data-plugin="stream-monsters"]');
      expect(monsterSidebar.dataset.pluginState).toBe('pending');
      expect(monsterSidebar.style.display).toBe('none');

      const coreView = dom.window.document.getElementById('view-flows');
      dom.window.NavigationManager.switchView('flows');
      expect(coreView.classList.contains('active')).toBe(true);

      await runDomReady();
      const dashboard = dom.window.document.getElementById('view-dashboard');
      const monsterView = dom.window.document.getElementById('view-stream-monsters');
      expect(state.requests).toBe(2);
      expect(monsterView.dataset.pluginState).toBe('blocked');
      expect(dashboard.classList.contains('active')).toBe(true);
      expect(monsterView.querySelector('iframe').hasAttribute('src')).toBe(false);
    } finally {
      dom.window.close();
    }
  });

  test('treats a legacy response without distribution mode as unknown and retries before revealing plugin navigation', async () => {
    const { dom, state, runDomReady } = createNavigationDom({
      distributionMode: 'public',
      plugins: [],
      url: 'http://localhost/dashboard.html#stream-monsters'
    });
    try {
      state.fetchResults.push(okJson({ success: true, plugins: [{ id: 'stream-monsters', enabled: true }] }));
      const sidebar = dom.window.document.querySelector('.sidebar-item[data-plugin="stream-monsters"]');
      expect(sidebar.dataset.pluginState).toBe('pending');

      await runDomReady();

      const view = dom.window.document.getElementById('view-stream-monsters');
      expect(state.requests).toBe(2);
      expect(view.dataset.pluginState).toBe('blocked');
      expect(view.classList.contains('active')).toBe(false);
      expect(view.querySelector('iframe').hasAttribute('src')).toBe(false);
      expect(dom.window.document.getElementById('view-dashboard').classList.contains('active')).toBe(true);
    } finally {
      dom.window.close();
    }
  });
});
