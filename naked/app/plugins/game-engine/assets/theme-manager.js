/**
 * Theme Manager for LTTH Game Engine
 * Manages Dark/Light theme switching with localStorage persistence
 * Feature #1 Implementation
 */

class ThemeManager {
  constructor() {
    this.themes = ['dark', 'light', 'system'];
    this.currentTheme = null;
    this.systemThemeListener = null;
  }

  /**
   * Initialize theme system
   */
  init() {
    // Load saved theme or default to system
    const savedTheme = localStorage.getItem('game-engine-theme') || 'system';
    this.setTheme(savedTheme);

    // Listen for system theme changes
    if (window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      this.systemThemeListener = (e) => {
        if (this.currentTheme === 'system') {
          this.applyTheme(e.matches ? 'dark' : 'light');
        }
      };
      mediaQuery.addEventListener('change', this.systemThemeListener);
    }

    console.log('[ThemeManager] Initialized with theme:', savedTheme);
  }

  /**
   * Get current theme setting
   * @returns {string} Current theme ('dark', 'light', or 'system')
   */
  getCurrentTheme() {
    return this.currentTheme;
  }

  /**
   * Get actual applied theme (resolves 'system' to 'dark' or 'light')
   * @returns {string} Applied theme ('dark' or 'light')
   */
  getAppliedTheme() {
    if (this.currentTheme === 'system') {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
      return 'light';
    }
    return this.currentTheme;
  }

  /**
   * Set theme
   * @param {string} theme - 'dark', 'light', or 'system'
   */
  setTheme(theme) {
    if (!this.themes.includes(theme)) {
      console.warn('[ThemeManager] Invalid theme:', theme, 'defaulting to system');
      theme = 'system';
    }

    this.currentTheme = theme;
    localStorage.setItem('game-engine-theme', theme);

    // Apply the actual theme
    if (theme === 'system') {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.applyTheme(prefersDark ? 'dark' : 'light');
    } else {
      this.applyTheme(theme);
    }

    // Emit custom event for other parts of the app
    window.dispatchEvent(new CustomEvent('theme-changed', {
      detail: { theme: this.currentTheme, applied: this.getAppliedTheme() }
    }));

    console.log('[ThemeManager] Theme set to:', theme, '(applied:', this.getAppliedTheme() + ')');
  }

  /**
   * Apply theme to document
   * @param {string} theme - 'dark' or 'light'
   */
  applyTheme(theme) {
    const root = document.documentElement;
    
    // Add smooth transition for theme change
    root.style.transition = 'background-color 0.3s ease, color 0.3s ease';
    
    if (theme === 'light') {
      root.setAttribute('data-theme', 'day');
    } else {
      root.setAttribute('data-theme', 'night');
    }

    // Remove transition after animation completes
    setTimeout(() => {
      root.style.transition = '';
    }, 300);
  }

  /**
   * Toggle between dark and light (ignores system)
   */
  toggleTheme() {
    const appliedTheme = this.getAppliedTheme();
    const newTheme = appliedTheme === 'dark' ? 'light' : 'dark';
    this.setTheme(newTheme);
  }

  /**
   * Cycle through all themes (dark -> light -> system)
   */
  cycleTheme() {
    const currentIndex = this.themes.indexOf(this.currentTheme);
    const nextIndex = (currentIndex + 1) % this.themes.length;
    this.setTheme(this.themes[nextIndex]);
  }

  /**
   * Destroy theme manager (cleanup)
   */
  destroy() {
    if (this.systemThemeListener && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.removeEventListener('change', this.systemThemeListener);
    }
  }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ThemeManager;
}
