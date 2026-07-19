const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

function createGoalTemplates() {
  const template = {
    render: () => '<div class="preview-mock">Preview</div>',
    getStyles: () => ''
  };
  return {
    CompactBarTemplate: template,
    FullWidthTemplate: template,
    MinimalCounterTemplate: template,
    CircularProgressTemplate: template,
    FloatingPillTemplate: template,
    VerticalMeterTemplate: template,
    NeonGlowTemplate: template,
    HexagonProgressTemplate: template,
    GlassyCardTemplate: template
  };
}

function jsonResponse(body, ok = true) {
  return { ok, json: async () => body };
}

async function waitFor(assertion) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < 1000) {
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

describe('Goals dynamic WebGPU finale selector UI', () => {
  const appDir = path.join(__dirname, '..');
  const goalsDir = path.join(appDir, 'plugins', 'goals');
  const fireworksUiDir = path.join(appDir, 'plugins', 'webgpu-fireworks', 'ui');
  const html = fs.readFileSync(path.join(goalsDir, 'ui.html'), 'utf8');
  const helperSource = fs.readFileSync(path.join(fireworksUiDir, 'show-style-options.js'), 'utf8');
  const uiSource = fs.readFileSync(path.join(goalsDir, 'ui.js'), 'utf8');
  const customStyle = 'custom:00000000-0000-4000-8000-000000000621';
  let dom;

  afterEach(() => {
    dom?.window.close();
    dom = null;
  });

  async function boot() {
    dom = new JSDOM(html, {
      runScripts: 'outside-only',
      url: 'http://localhost:3000/plugins/goals/ui'
    });
    const { window } = dom;
    const socketHandlers = new Map();
    window.io = () => ({
      on: jest.fn((event, handler) => socketHandlers.set(event, handler)),
      emit: jest.fn()
    });
    window.GoalTemplates = createGoalTemplates();
    window.setTimeout = (callback) => {
      callback();
      return 1;
    };
    window.clearTimeout = jest.fn();
    window.alert = jest.fn();
    window.confirm = jest.fn(() => true);
    window.prompt = jest.fn(() => null);
    window.navigator.clipboard = { writeText: jest.fn(async () => {}) };
    const fetchMock = jest.fn(async (url, options = {}) => {
      if (String(url) === '/api/webgpu-fireworks/shows') {
        return jsonResponse({
          success: true,
          selectableStyles: [{ id: customStyle, name: 'Goal Signature', builtIn: false }]
        });
      }
      if (String(url) === '/api/goals' && options.method === 'POST') {
        return jsonResponse({ success: true });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    window.fetch = fetchMock;
    window.eval(helperSource);
    window.eval(uiSource);
    await waitFor(() => {
      expect(window.document.querySelector(`option[value="${customStyle}"]`)).not.toBeNull();
    });
    return { window, fetchMock, socketHandlers };
  }

  test('loads grouped choices with inherit, no selectable Auto, and lossless Custom normalization', async () => {
    const { window } = await boot();
    const select = window.document.getElementById('goal-firework-encounter');

    expect([...select.querySelectorAll('optgroup')].map(group => group.label))
      .toEqual(['Built-in shows', 'Custom shows']);
    expect(select.querySelector('option[value="inherit"]')).not.toBeNull();
    expect(select.querySelector('option[value="auto"]')).toBeNull();
    expect(window.normalizeGoalFireworkStyle('finale')).toBe('inherit');
    expect(window.normalizeGoalFireworkStyle('auto')).toBe('auto');
    expect(window.normalizeGoalFireworkStyle(customStyle)).toBe(customStyle);
    const uppercaseCustom = 'custom:00000000-0000-4000-8000-00000000062A';
    expect(window.normalizeGoalFireworkStyle(uppercaseCustom)).toBe(uppercaseCustom);
    expect(window.normalizeGoalFireworkStyle('custom:not-a-uuid')).toBe('inherit');
  });

  test('round-trips the exact published Custom ID and length through a Goal save payload', async () => {
    const { window, fetchMock } = await boot();
    const document = window.document;
    window.openCreateModal();
    document.getElementById('goal-name').value = 'Custom Finale Goal';
    const style = document.getElementById('goal-firework-encounter');
    style.value = customStyle;
    const length = document.getElementById('goal-firework-finale-length');
    length.value = 'long';

    document.getElementById('goal-form').dispatchEvent(
      new window.Event('submit', { bubbles: true, cancelable: true })
    );
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url, options = {}]) => (
        String(url) === '/api/goals' && options.method === 'POST'
      ))).toBe(true);
    });
    const request = fetchMock.mock.calls.find(([url, options = {}]) => (
      String(url) === '/api/goals' && options.method === 'POST'
    ));
    const payload = JSON.parse(request[1].body);
    expect(payload.firework_encounter_mode).toBe(customStyle);
    expect(payload.firework_finale_length).toBe('long');
  });

  test('keeps legacy Auto visible only as a disabled stored value', async () => {
    const { window } = await boot();
    await window.refreshGoalFinaleShowOptions('auto');
    const select = window.document.getElementById('goal-firework-encounter');
    const storedAuto = select.querySelector('option[value="auto"]');

    expect(select.value).toBe('auto');
    expect(storedAuto.disabled).toBe(true);
    expect(storedAuto.dataset.showUnavailable).toBe('true');
  });

  test('preserves a strict Custom ID even if the shared UI helper is temporarily unavailable', async () => {
    const { window } = await boot();
    delete window.WebGpuFireworksShowOptions;

    expect(window.normalizeGoalFireworkStyle(customStyle)).toBe(customStyle);
    expect(window.normalizeGoalFireworkStyle('custom:not-a-uuid')).toBe('inherit');
  });
});
