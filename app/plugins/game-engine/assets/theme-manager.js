/**
 * Theme Manager for LTTH Game Engine
 * Supports day/night/contrast/vision-impaired plus system fallback.
 */

class ThemeManager {
  constructor() {
    this.themes = ['day', 'night', 'contrast', 'vision-impaired', 'system'];
    this.currentTheme = null;
    this.systemThemeListener = null;
    this.parentThemeObserver = null;
  }

  init() {
    const envTheme = this.readThemeFromEnvironment();
    if (envTheme) {
      this.currentTheme = this.normalizeTheme(envTheme);
      this.applyTheme(this.currentTheme);
      console.log('[ThemeManager] Respecting environment theme:', envTheme, '->', this.currentTheme);
    } else {
      const savedTheme = localStorage.getItem('game-engine-theme') || 'night';
      this.setTheme(savedTheme);
    }

    if (window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      this.systemThemeListener = (e) => {
        if (this.currentTheme === 'system') {
          this.applyTheme(e.matches ? 'night' : 'day');
        }
      };
      mediaQuery.addEventListener('change', this.systemThemeListener);
    }

    try {
      if (window.parent && window.parent !== window) {
        this.parentThemeObserver = new MutationObserver(() => {
          const env = this.readThemeFromEnvironment();
          if (env) {
            this.currentTheme = this.normalizeTheme(env);
            this.applyTheme(this.currentTheme);
            window.dispatchEvent(new CustomEvent('theme-changed', {
              detail: { theme: this.currentTheme, applied: this.getAppliedTheme() }
            }));
          }
        });
        this.parentThemeObserver.observe(window.parent.document.documentElement, {
          attributes: true,
          attributeFilter: ['data-theme']
        });
      }
    } catch (error) {
      console.warn('[ThemeManager] Could not observe parent theme:', error);
    }

    window.addEventListener('storage', (event) => {
      if (event && ['dashboard-theme', 'theme', 'ui-theme', 'game-engine-theme'].includes(event.key)) {
        const env = this.readThemeFromEnvironment();
        if (env) {
          this.currentTheme = this.normalizeTheme(env);
          this.applyTheme(this.currentTheme);
        }
      }
    });

    console.log('[ThemeManager] Initialized with theme:', this.currentTheme);
  }

  getCurrentTheme() {
    return this.currentTheme;
  }

  getAppliedTheme() {
    if (this.currentTheme === 'system') {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'night';
      }
      return 'day';
    }
    return this.currentTheme;
  }

  setTheme(theme) {
    const normalized = this.normalizeTheme(theme);
    this.currentTheme = normalized;
    localStorage.setItem('game-engine-theme', normalized);

    if (normalized === 'system') {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.applyTheme(prefersDark ? 'night' : 'day');
    } else {
      this.applyTheme(normalized);
    }

    window.dispatchEvent(new CustomEvent('theme-changed', {
      detail: { theme: this.currentTheme, applied: this.getAppliedTheme() }
    }));

    console.log('[ThemeManager] Theme set to:', normalized, '(applied:', this.getAppliedTheme() + ')');
  }

  applyTheme(theme) {
    const root = document.documentElement;
    const applied = this.normalizeTheme(theme);

    root.style.transition = 'background-color 0.3s ease, color 0.3s ease';
    root.setAttribute('data-theme', applied);
    root.style.colorScheme = (applied === 'day' || applied === 'contrast' || applied === 'vision-impaired') ? 'light' : 'dark';

    setTimeout(() => {
      root.style.transition = '';
    }, 300);
  }

  toggleTheme() {
    const appliedTheme = this.getAppliedTheme();
    const newTheme = appliedTheme === 'day' ? 'night' : 'day';
    this.setTheme(newTheme);
  }

  cycleTheme() {
    const currentIndex = this.themes.indexOf(this.currentTheme);
    const nextIndex = (currentIndex + 1) % this.themes.length;
    this.setTheme(this.themes[nextIndex]);
  }

  destroy() {
    if (this.systemThemeListener && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.removeEventListener('change', this.systemThemeListener);
    }
    if (this.parentThemeObserver) {
      this.parentThemeObserver.disconnect();
    }
  }

  readThemeFromEnvironment() {
    try {
      if (window.parent && window.parent !== window) {
        const parentTheme = window.parent.document?.documentElement?.getAttribute('data-theme');
        if (this.isValidTheme(parentTheme)) {
          return parentTheme;
        }
      }
    } catch (error) {}

    try {
      for (const key of ['dashboard-theme', 'theme', 'ui-theme', 'game-engine-theme']) {
        const value = localStorage.getItem(key);
        if (this.isValidTheme(value)) {
          return value;
        }
        if (value === 'dark') return 'night';
        if (value === 'light') return 'day';
      }
    } catch (error) {}

    const existingTheme = document.documentElement.getAttribute('data-theme');
    if (this.isValidTheme(existingTheme)) {
      return existingTheme;
    }
    return null;
  }

  isValidTheme(theme) {
    return this.themes.includes(theme);
  }

  normalizeTheme(theme) {
    if (theme === 'dark') return 'night';
    if (theme === 'light') return 'day';
    if (this.isValidTheme(theme)) return theme;
    return 'night';
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ThemeManager;
}
