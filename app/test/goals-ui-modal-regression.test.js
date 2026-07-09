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

describe('Goals UI create modal regression', () => {
  let dom;

  afterEach(() => {
    if (dom) {
      dom.window.close();
      dom = null;
    }
  });

  test('opens the create goal modal without crashing when optional firework fields are absent', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'goals', 'ui.html'), 'utf8');
    const uiScript = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'goals', 'ui.js'), 'utf8');

    dom = new JSDOM(html, {
      runScripts: 'outside-only',
      url: 'http://localhost:3000/plugins/goals/ui'
    });

    const { window } = dom;
    window.io = () => ({ on: jest.fn(), emit: jest.fn() });
    window.GoalTemplates = createGoalTemplates();
    window.setTimeout = (fn) => {
      fn();
      return 1;
    };
    window.clearTimeout = jest.fn();
    window.alert = jest.fn();
    window.confirm = jest.fn(() => true);
    window.prompt = jest.fn(() => null);
    window.navigator.clipboard = { writeText: jest.fn(async () => {}) };

    window.eval(uiScript);

    expect(() => window.openCreateModal()).not.toThrow();
    expect(window.document.getElementById('goal-modal').classList.contains('active')).toBe(true);
  });
});
