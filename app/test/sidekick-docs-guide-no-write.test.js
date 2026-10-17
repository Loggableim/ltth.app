'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { buildGuides } = require('../../scripts/plugin-tutorial-source');

const repoRoot = path.resolve(__dirname, '../..');

describe('Sidekick status guide capture workflow', () => {
  test('uses only route navigation and status-tab activation', () => {
    const guide = buildGuides(repoRoot).find(item => item.id === 'sidekick');
    const step = guide.steps.find(item => item.id === 'status-view');

    expect(step.capture.route).toBe('/plugins/sidekick/ui.html');
    expect(step.capture.action).toEqual({ type: 'open-plugin-surface', stepId: 'status-view' });
    expect(step.workflow.operations).toEqual([
      { type: 'goto', route: '/plugins/sidekick/ui.html' },
      { type: 'open-plugin-surface', selector: '#tab-status' }
    ]);
    expect(step.workflow.captureRule.stateChange).toBe(false);
  });

  test('initial UI load and opening the Status tab issue no writes, POSTs, or socket emits', async () => {
    const uiHtml = fs.readFileSync(path.join(repoRoot, 'app/plugins/sidekick/ui.html'), 'utf8');
    const requests = [];
    const emitted = [];
    const socketHandlers = new Map();

    const dom = new JSDOM(uiHtml, {
      url: 'http://127.0.0.1/plugins/sidekick/ui.html?lang=de',
      runScripts: 'dangerously',
      beforeParse(window) {
        window.io = () => ({
          on: (event, handler) => socketHandlers.set(event, handler),
          emit: (...args) => emitted.push(args),
          disconnect: () => {}
        });
        window.fetch = async (input, init = {}) => {
          requests.push({ url: String(input), method: String(init.method || 'GET').toUpperCase() });
          return { ok: true, status: 200, json: async () => ({ success: false }) };
        };
        window.setInterval = () => 0;
        window.clearInterval = () => {};
        window.setTimeout = () => 0;
        window.clearTimeout = () => {};
      }
    });

    try {
      await new Promise(resolve => setImmediate(resolve));
      const statusTab = dom.window.document.querySelector('.tab[data-tab="status"]');
      expect(statusTab).not.toBeNull();
      statusTab.click();
      await new Promise(resolve => setImmediate(resolve));

      expect(requests.length).toBeGreaterThan(0);
      expect(requests.every(request => request.method === 'GET')).toBe(true);
      expect(requests.some(request => request.url.includes('/api/sidekick/mute'))).toBe(false);
      expect(emitted).toEqual([]);
      expect(socketHandlers.has('sidekick:status')).toBe(true);
    } finally {
      dom.window.close();
    }
  });
});
