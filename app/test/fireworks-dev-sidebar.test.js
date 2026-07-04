const fs = require('fs');
const path = require('path');

describe('Fireworks Dev Sidebar Integration', () => {
  let dashboardHtml;
  let enLocale;
  let deLocale;

  function readLocale(filePath) {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw.replace(/^\uFEFF/, ''));
  }

  beforeAll(() => {
    dashboardHtml = fs.readFileSync(
      path.join(__dirname, '..', 'public', 'dashboard.html'),
      'utf8'
    );
    enLocale = readLocale(path.join(__dirname, '..', 'locales', 'en.json'));
    deLocale = readLocale(path.join(__dirname, '..', 'locales', 'de.json'));
  });

  test('adds a separate fireworks-dev sidebar entry', () => {
    expect(dashboardHtml).toContain('data-view="fireworks-dev"');
    expect(dashboardHtml).toContain('data-plugin="fireworks-dev"');
  });

  test('adds a separate fireworks-dev dashboard view', () => {
    const viewSection = dashboardHtml.substring(
      dashboardHtml.indexOf('id="view-fireworks-dev"'),
      dashboardHtml.indexOf('id="view-fireworks-dev"') + 1000
    );

    expect(viewSection).toContain('data-plugin="fireworks-dev"');
    expect(viewSection).toContain('data-src="/fireworks-dev/ui"');
    expect(viewSection).toContain('href="/fireworks-dev/ui"');
  });

  test('keeps stable fireworks and dev fireworks as separate entries', () => {
    expect(dashboardHtml).toContain('data-view="fireworks"');
    expect(dashboardHtml).toContain('data-view="fireworks-dev"');
  });

  test('adds locale labels for fireworks-dev', () => {
    expect(enLocale.navigation.fireworks_dev).toBe('Fireworks Dev');
    expect(deLocale.navigation.fireworks_dev).toBe('Feuerwerk Dev');
  });
});
