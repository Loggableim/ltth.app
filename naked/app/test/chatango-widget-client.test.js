const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

function loadChatangoAdapterClass(dom) {
  const adapterPath = path.join(__dirname, '../public/js/chatango-theme-adapter.js');
  const source = fs.readFileSync(adapterPath, 'utf8');
  const sourceWithoutAutoInit = source.replace(
    /\n\/\/ Initialize the adapter when the script loads\nconst chatangoThemeAdapter = new ChatangoThemeAdapter\(\);\s*$/,
    ''
  );
  const sandbox = {
    console: {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    },
    document: dom.window.document,
    fetch: jest.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ success: true, plugins: [] })
    })),
    localStorage: dom.window.localStorage,
    module: { exports: {} },
    MutationObserver: dom.window.MutationObserver,
    setTimeout
  };

  vm.runInNewContext(`${sourceWithoutAutoInit}\nmodule.exports = ChatangoThemeAdapter;`, sandbox);
  return sandbox.module.exports;
}

describe('Chatango floating widget client', () => {
  let dom;
  let Adapter;
  let adapter;

  beforeEach(() => {
    dom = new JSDOM(
      '<!doctype html><html><body><div id="chatango-widget-container"></div></body></html>',
      { url: 'http://localhost/' }
    );
    Adapter = loadChatangoAdapterClass(dom);
    adapter = Object.create(Adapter.prototype);
    adapter.pluginConfig = {
      enabled: true,
      roomHandle: 'pupcidsltth',
      theme: 'night',
      fontSize: '10',
      allowPM: false,
      showTicker: true,
      widgetPosition: 'br',
      widgetWidth: 200,
      widgetHeight: 300,
      collapsedWidth: 75,
      collapsedHeight: 30,
      widgetEnabled: true
    };
    adapter.themeConfigs = {
      night: {
        a: '13A318',
        p: '10'
      }
    };
    adapter.embedIdCounter = 0;
  });

  test('loads the floating widget as a direct Chatango script instead of a fixed host iframe', () => {
    adapter.loadWidgetEmbed('night');

    const container = dom.window.document.getElementById('chatango-widget-container');
    const script = container.querySelector('script[src="https://st.chatango.com/js/gz/emb.js"]');

    expect(container.querySelector('iframe')).toBeNull();
    expect(script).not.toBeNull();
    expect(script.id).toMatch(/^cid/);
    expect(script.style.width).toBe('200px');
    expect(script.style.height).toBe('300px');
    expect(script.textContent).toContain('"pos":"br"');
    expect(script.textContent).toContain('"cvw":75');
    expect(script.textContent).toContain('"cvh":30');
  });
});
