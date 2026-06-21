/**
 * Test: Fireworks Plugin Sidebar Integration
 * 
 * Validates that the Fireworks plugin is properly integrated into the dashboard:
 * - Sidebar menu entry exists
 * - View container exists
 * - Locale translations exist
 */

const fs = require('fs');
const path = require('path');

describe('Fireworks Plugin Sidebar Integration', () => {
  let dashboardHtml;
  let enLocale;
  let deLocale;

  beforeAll(() => {
    // Load dashboard HTML
    const dashboardPath = path.join(__dirname, '..', 'public', 'dashboard.html');
    dashboardHtml = fs.readFileSync(dashboardPath, 'utf8');

    // Load locale files
    const enLocalePath = path.join(__dirname, '..', 'locales', 'en.json');
    const deLocalePath = path.join(__dirname, '..', 'locales', 'de.json');
    enLocale = JSON.parse(fs.readFileSync(enLocalePath, 'utf8'));
    deLocale = JSON.parse(fs.readFileSync(deLocalePath, 'utf8'));
  });

  describe('Sidebar Menu Entry', () => {
    test('should have fireworks sidebar item with correct attributes', () => {
      expect(dashboardHtml).toContain('data-view="fireworks"');
      expect(dashboardHtml).toContain('data-plugin="fireworks"');
    });

    test('should have fireworks sidebar item in correct location (after webgpu-emoji-rain)', () => {
      const webgpuEmojiRainIndex = dashboardHtml.indexOf('data-view="webgpu-emoji-rain"');
      const fireworksIndex = dashboardHtml.indexOf('data-view="fireworks"');
      
      expect(webgpuEmojiRainIndex).toBeGreaterThan(0);
      expect(fireworksIndex).toBeGreaterThan(0);
      expect(fireworksIndex).toBeGreaterThan(webgpuEmojiRainIndex);
    });

    test('should use sparkles icon for fireworks', () => {
      // Check if sparkles icon is near the fireworks sidebar item
      const fireworksSidebarSection = dashboardHtml.substring(
        dashboardHtml.indexOf('data-view="fireworks"') - 100,
        dashboardHtml.indexOf('data-view="fireworks"') + 200
      );
      expect(fireworksSidebarSection).toContain('data-lucide="sparkles"');
    });

    test('should use i18n key for fireworks label', () => {
      const fireworksSidebarSection = dashboardHtml.substring(
        dashboardHtml.indexOf('data-view="fireworks"') - 100,
        dashboardHtml.indexOf('data-view="fireworks"') + 300
      );
      expect(fireworksSidebarSection).toContain('data-i18n="navigation.fireworks"');
    });
  });

  describe('View Container', () => {
    test('should have fireworks view container', () => {
      expect(dashboardHtml).toContain('id="view-fireworks"');
    });

    test('should have correct plugin data attribute on view', () => {
      const viewSection = dashboardHtml.substring(
        dashboardHtml.indexOf('id="view-fireworks"'),
        dashboardHtml.indexOf('id="view-fireworks"') + 1000
      );
      expect(viewSection).toContain('data-plugin="fireworks"');
    });

    test('should have iframe with correct data-src', () => {
      const viewSection = dashboardHtml.substring(
        dashboardHtml.indexOf('id="view-fireworks"'),
        dashboardHtml.indexOf('id="view-fireworks"') + 1000
      );
      expect(viewSection).toContain('data-src="/fireworks/ui"');
    });

    test('should have external link to fireworks UI', () => {
      const viewSection = dashboardHtml.substring(
        dashboardHtml.indexOf('id="view-fireworks"'),
        dashboardHtml.indexOf('id="view-fireworks"') + 1000
      );
      expect(viewSection).toContain('href="/fireworks/ui"');
    });

    test('should have proper view title with icon', () => {
      const viewSection = dashboardHtml.substring(
        dashboardHtml.indexOf('id="view-fireworks"'),
        dashboardHtml.indexOf('id="view-fireworks"') + 1000
      );
      expect(viewSection).toContain('Fireworks Superplugin');
      expect(viewSection).toContain('data-lucide="sparkles"');
    });
  });

  describe('Locale Translations', () => {
    test('should have English translation for fireworks', () => {
      expect(enLocale.navigation).toBeDefined();
      expect(enLocale.navigation.fireworks).toBe('Fireworks');
    });

    test('should have German translation for fireworks', () => {
      expect(deLocale.navigation).toBeDefined();
      expect(deLocale.navigation.fireworks).toBe('Feuerwerk');
    });

    test('should have translations in correct position (after emoji_rain)', () => {
      const enKeys = Object.keys(enLocale.navigation);
      const deKeys = Object.keys(deLocale.navigation);
      
      const enEmojiRainIndex = enKeys.indexOf('emoji_rain');
      const enFireworksIndex = enKeys.indexOf('fireworks');
      const enMultiGuestIndex = enKeys.indexOf('multi_guest');
      
      expect(enFireworksIndex).toBeGreaterThan(enEmojiRainIndex);
      expect(enFireworksIndex).toBeLessThan(enMultiGuestIndex);
      
      const deEmojiRainIndex = deKeys.indexOf('emoji_rain');
      const deFireworksIndex = deKeys.indexOf('fireworks');
      const deMultiGuestIndex = deKeys.indexOf('multi_guest');
      
      expect(deFireworksIndex).toBeGreaterThan(deEmojiRainIndex);
      expect(deFireworksIndex).toBeLessThan(deMultiGuestIndex);
    });
  });

  describe('Pattern Consistency', () => {
    test('sidebar item should follow same pattern as webgpu-emoji-rain', () => {
      // Extract webgpu-emoji-rain sidebar pattern
      const webgpuEmojiRainPattern = dashboardHtml.substring(
        dashboardHtml.indexOf('data-view="webgpu-emoji-rain"') - 100,
        dashboardHtml.indexOf('data-view="webgpu-emoji-rain"') + 300
      );
      
      // Extract fireworks sidebar pattern
      const fireworksPattern = dashboardHtml.substring(
        dashboardHtml.indexOf('data-view="fireworks"') - 100,
        dashboardHtml.indexOf('data-view="fireworks"') + 300
      );
      
      // Both should have the same structural elements
      expect(webgpuEmojiRainPattern).toContain('class="sidebar-item"');
      expect(fireworksPattern).toContain('class="sidebar-item"');
      expect(webgpuEmojiRainPattern).toContain('<i data-lucide=');
      expect(fireworksPattern).toContain('<i data-lucide=');
      expect(webgpuEmojiRainPattern).toContain('sidebar-item-text');
      expect(fireworksPattern).toContain('sidebar-item-text');
    });

    test('view container should follow same pattern as webgpu-emoji-rain', () => {
      // Check both have view-section
      const webgpuEmojiRainView = dashboardHtml.substring(
        dashboardHtml.indexOf('id="view-webgpu-emoji-rain"'),
        dashboardHtml.indexOf('id="view-webgpu-emoji-rain"') + 800
      );
      const fireworksView = dashboardHtml.substring(
        dashboardHtml.indexOf('id="view-fireworks"'),
        dashboardHtml.indexOf('id="view-fireworks"') + 800
      );
      
      expect(webgpuEmojiRainView).toContain('class="view-section"');
      expect(fireworksView).toContain('class="view-section"');
      expect(webgpuEmojiRainView).toContain('class="view-header"');
      expect(fireworksView).toContain('class="view-header"');
      expect(webgpuEmojiRainView).toContain('class="iframe-container"');
      expect(fireworksView).toContain('class="iframe-container"');
    });
  });
});
