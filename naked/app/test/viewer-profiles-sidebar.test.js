/**
 * Test: Viewer Profiles Plugin Sidebar Integration
 *
 * Validates that the viewer-profiles plugin is properly integrated into the dashboard:
 * - Sidebar menu entry exists with correct attributes
 * - View container exists with iframe lazy-loading
 * - Locale translations exist in supported locales
 */

const fs = require('fs');
const path = require('path');

describe('Viewer Profiles Plugin Sidebar Integration', () => {
  let dashboardHtml;
  let enLocale;
  let deLocale;
  let esLocale;
  let frLocale;

  beforeAll(() => {
    const dashboardPath = path.join(__dirname, '..', 'public', 'dashboard.html');
    dashboardHtml = fs.readFileSync(dashboardPath, 'utf8');

    enLocale = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'locales', 'en.json'), 'utf8'));
    deLocale = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'locales', 'de.json'), 'utf8'));
    esLocale = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'locales', 'es.json'), 'utf8'));
    frLocale = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'locales', 'fr.json'), 'utf8'));
  });

  describe('Sidebar Menu Entry', () => {
    test('should have viewer-profiles sidebar item with correct data-view', () => {
      expect(dashboardHtml).toContain('data-view="viewer-profiles"');
    });

    test('should have viewer-profiles sidebar item with correct data-plugin', () => {
      expect(dashboardHtml).toContain('data-plugin="viewer-profiles"');
    });

    test('should use users icon for viewer-profiles sidebar item', () => {
      const sidebarSection = dashboardHtml.substring(
        dashboardHtml.indexOf('data-view="viewer-profiles"') - 100,
        dashboardHtml.indexOf('data-view="viewer-profiles"') + 250
      );
      expect(sidebarSection).toContain('data-lucide="users"');
    });

    test('should use i18n key for viewer-profiles label', () => {
      const sidebarSection = dashboardHtml.substring(
        dashboardHtml.indexOf('data-view="viewer-profiles"') - 100,
        dashboardHtml.indexOf('data-view="viewer-profiles"') + 300
      );
      expect(sidebarSection).toContain('data-i18n="navigation.viewer_profiles"');
    });

    test('should appear after viewer-leaderboard in sidebar', () => {
      const leaderboardIdx = dashboardHtml.indexOf('data-view="viewer-leaderboard"');
      const profilesIdx = dashboardHtml.indexOf('data-view="viewer-profiles"');
      expect(leaderboardIdx).toBeGreaterThan(0);
      expect(profilesIdx).toBeGreaterThan(leaderboardIdx);
    });

    test('sidebar item should follow existing sidebar-item class pattern', () => {
      const sidebarSection = dashboardHtml.substring(
        dashboardHtml.indexOf('data-view="viewer-profiles"') - 100,
        dashboardHtml.indexOf('data-view="viewer-profiles"') + 250
      );
      expect(sidebarSection).toContain('class="sidebar-item"');
      expect(sidebarSection).toContain('<i data-lucide=');
      expect(sidebarSection).toContain('sidebar-item-text');
    });
  });

  describe('View Container', () => {
    test('should have viewer-profiles view container', () => {
      expect(dashboardHtml).toContain('id="view-viewer-profiles"');
    });

    test('should have correct plugin data attribute on view container', () => {
      const viewSection = dashboardHtml.substring(
        dashboardHtml.indexOf('id="view-viewer-profiles"'),
        dashboardHtml.indexOf('id="view-viewer-profiles"') + 1000
      );
      expect(viewSection).toContain('data-plugin="viewer-profiles"');
    });

    test('should have iframe with correct data-src for lazy loading', () => {
      const viewSection = dashboardHtml.substring(
        dashboardHtml.indexOf('id="view-viewer-profiles"'),
        dashboardHtml.indexOf('id="view-viewer-profiles"') + 1000
      );
      expect(viewSection).toContain('data-src="/viewer-profiles/ui"');
    });

    test('should have external link to standalone viewer-profiles UI', () => {
      const viewSection = dashboardHtml.substring(
        dashboardHtml.indexOf('id="view-viewer-profiles"'),
        dashboardHtml.indexOf('id="view-viewer-profiles"') + 1000
      );
      expect(viewSection).toContain('href="/viewer-profiles/ui"');
    });

    test('should have iframe-container wrapper', () => {
      const viewSection = dashboardHtml.substring(
        dashboardHtml.indexOf('id="view-viewer-profiles"'),
        dashboardHtml.indexOf('id="view-viewer-profiles"') + 1000
      );
      expect(viewSection).toContain('class="iframe-container"');
    });

    test('should have view-section and view-header structure', () => {
      const viewSection = dashboardHtml.substring(
        dashboardHtml.indexOf('id="view-viewer-profiles"'),
        dashboardHtml.indexOf('id="view-viewer-profiles"') + 1000
      );
      expect(viewSection).toContain('class="view-section"');
      expect(viewSection).toContain('class="view-header"');
    });
  });

  describe('Locale Translations', () => {
    test('should have English translation for viewer_profiles', () => {
      expect(enLocale.navigation).toBeDefined();
      expect(enLocale.navigation.viewer_profiles).toBe('Viewer Profiles');
    });

    test('should have German translation for viewer_profiles', () => {
      expect(deLocale.navigation).toBeDefined();
      expect(typeof deLocale.navigation.viewer_profiles).toBe('string');
      expect(deLocale.navigation.viewer_profiles.length).toBeGreaterThan(0);
    });

    test('should have Spanish translation for viewer_profiles', () => {
      expect(esLocale.navigation).toBeDefined();
      expect(typeof esLocale.navigation.viewer_profiles).toBe('string');
      expect(esLocale.navigation.viewer_profiles.length).toBeGreaterThan(0);
    });

    test('should have French translation for viewer_profiles', () => {
      expect(frLocale.navigation).toBeDefined();
      expect(typeof frLocale.navigation.viewer_profiles).toBe('string');
      expect(frLocale.navigation.viewer_profiles.length).toBeGreaterThan(0);
    });

    test('viewer_profiles key should appear after viewer_leaderboard in en.json', () => {
      const keys = Object.keys(enLocale.navigation);
      const leaderboardIdx = keys.indexOf('viewer_leaderboard');
      const profilesIdx = keys.indexOf('viewer_profiles');
      expect(leaderboardIdx).toBeGreaterThan(-1);
      expect(profilesIdx).toBeGreaterThan(leaderboardIdx);
    });
  });
});
