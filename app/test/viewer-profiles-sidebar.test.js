/**
 * Regression coverage for the hidden, consolidated Viewer Profiles UI.
 */

const fs = require('fs');
const path = require('path');

function readLocale(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw.replace(/^\uFEFF/, ''));
}

describe('Viewer Profiles dashboard cleanup', () => {
  let dashboardHtml;
  let locales;

  beforeAll(() => {
    const dashboardPath = path.join(__dirname, '..', 'public', 'dashboard.html');
    dashboardHtml = fs.readFileSync(dashboardPath, 'utf8');

    locales = ['de', 'en', 'es', 'fr'].map(locale => readLocale(
      path.join(__dirname, '..', 'locales', `${locale}.json`)
    ));
  });

  test('does not expose Viewer Profiles in the dashboard sidebar or embedded views', () => {
    expect(dashboardHtml).not.toContain('data-view="viewer-profiles"');
    expect(dashboardHtml).not.toContain('id="view-viewer-profiles"');
    expect(dashboardHtml).not.toContain('/viewer-profiles/ui');
  });

  test('removes the stale root navigation translation from every supported locale', () => {
    locales.forEach(locale => {
      expect(locale.navigation.viewer_profiles).toBeUndefined();
    });
  });
});
