'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const enhancementsSource = fs.readFileSync(
  path.join(__dirname, '../public/js/dashboard-enhancements.js'),
  'utf8'
);

function createDashboardDom({ distributionMode, plugins, fetchResults = [] }) {
  const dom = new JSDOM(`<!doctype html><html><body>
    <button id="quick-webgpu-emoji-rain-btn" class="quick-action-btn" data-plugin="webgpu-emoji-rain" data-action="webgpu-emoji-rain"><span>WebGPU EmojiRain</span></button>
    <button id="sidebar-quick-webgpu-emoji-rain" class="sidebar-quick-icon" data-plugin="webgpu-emoji-rain" data-action="webgpu-emoji-rain"></button>
    <button id="quick-osc-bridge-btn" class="quick-action-btn" data-plugin="osc-bridge" data-action="osc-bridge"><span>OSC Bridge</span></button>
    <button id="sidebar-quick-osc-bridge" class="sidebar-quick-icon" data-plugin="osc-bridge" data-action="osc-bridge"></button>
  </body></html>`, { runScripts: 'outside-only', url: 'http://localhost/dashboard.html' });

  const calls = [];
  dom.window.console = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  dom.window.fetch = jest.fn(async (url) => {
    calls.push(String(url));
    if (String(url) === '/api/plugins') {
      const result = fetchResults.shift();
      if (result instanceof Error) throw result;
      if (result) return result;
      return { ok: true, json: async () => ({ success: true, distributionMode, plugins }) };
    }
    if (String(url) === '/api/settings') return { ok: true, json: async () => ({}) };
    if (String(url) === '/api/webgpu-emoji-rain/status') {
      return { ok: true, json: async () => ({ success: true, enabled: true }) };
    }
    throw new Error(`Unexpected dashboard enhancement request: ${url}`);
  });

  dom.window.eval(enhancementsSource);
  return { dom, calls };
}

describe('dashboard quick actions follow the plugin inventory mode', () => {
  test('hides closed-beta quick actions in public mode', async () => {
    const { dom, calls } = createDashboardDom({ distributionMode: 'public', plugins: [] });
    try {
      const main = dom.window.document.getElementById('quick-webgpu-emoji-rain-btn');
      const sidebar = dom.window.document.getElementById('sidebar-quick-webgpu-emoji-rain');
      expect(main.style.display).toBe('none');
      expect(main.disabled).toBe(true);
      await dom.window.DashboardEnhancements.refreshQuickActionButtons();
      expect(main.dataset.pluginState).toBe('blocked');
      expect(sidebar.style.display).toBe('none');
      expect(dom.window.document.getElementById('quick-osc-bridge-btn').style.display).toBe('none');
      expect(dom.window.document.getElementById('sidebar-quick-osc-bridge').style.display).toBe('none');
      expect(calls).not.toContain('/api/webgpu-emoji-rain/status');
      expect(calls).not.toContain('/api/webgpu-emoji-rain/toggle');
    } finally {
      dom.window.close();
    }
  });

  test('keeps installed beta quick actions available in local developer mode', async () => {
    const plugins = [
      { id: 'webgpu-emoji-rain', enabled: true },
      { id: 'osc-bridge', enabled: true }
    ];
    const { dom } = createDashboardDom({ distributionMode: 'local', plugins });
    try {
      const main = dom.window.document.getElementById('quick-webgpu-emoji-rain-btn');
      await dom.window.DashboardEnhancements.refreshQuickActionButtons();
      expect(main.style.display).not.toBe('none');
      expect(main.disabled).toBe(false);
      expect(dom.window.document.getElementById('sidebar-quick-webgpu-emoji-rain').disabled).toBe(false);
      expect(dom.window.document.getElementById('quick-osc-bridge-btn').disabled).toBe(false);
      expect(dom.window.document.getElementById('sidebar-quick-osc-bridge').disabled).toBe(false);
    } finally {
      dom.window.close();
    }
  });

  test('keeps actions hidden and disabled until a failed inventory request recovers', async () => {
    const { dom } = createDashboardDom({
      distributionMode: 'public',
      plugins: [],
      fetchResults: [new Error('temporary offline')]
    });
    try {
      const main = dom.window.document.getElementById('quick-osc-bridge-btn');
      expect(main.dataset.pluginState).toBe('pending');
      expect(main.style.display).toBe('none');
      await dom.window.DashboardEnhancements.refreshQuickActionButtons();
      expect(main.dataset.pluginState).toBe('blocked');
      expect(main.style.display).toBe('none');
      expect(main.disabled).toBe(true);
    } finally {
      dom.window.close();
    }
  });
});
