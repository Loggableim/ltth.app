/**
 * Internationalization (i18n) Module
 *
 * Supported languages:
 * - English (en)
 * - Deutsch (de)
 * - Español (es)
 * - Français (fr)
 */

const fs = require('fs');
const path = require('path');

class I18n {
  constructor(defaultLocale = 'en') {
    this.defaultLocale = defaultLocale;
    this.currentLocale = defaultLocale;
    this.translations = {};
    this.supportedLocales = ['en', 'de', 'es', 'fr'];
    this.loadTranslations();
  }

  /**
   * Load all translation files
   */
  loadTranslations() {
    const localesDir = path.join(__dirname, '..', 'locales');

    // Create locales directory if it doesn't exist
    if (!fs.existsSync(localesDir)) {
      fs.mkdirSync(localesDir, { recursive: true });
    }

    for (const locale of this.supportedLocales) {
      const filePath = path.join(localesDir, `${locale}.json`);

      if (fs.existsSync(filePath)) {
        try {
          this.translations[locale] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (error) {
          console.error(`Failed to load ${locale} translations:`, error.message);
          this.translations[locale] = {};
        }
      } else {
        this.translations[locale] = {};
      }
    }

    // Load plugin translations
    this.loadPluginTranslations();
  }

  /**
   * Load translations from all plugins
   */
  loadPluginTranslations() {
    const pluginsDir = path.join(__dirname, '..', 'plugins');

    if (!fs.existsSync(pluginsDir)) {
      return;
    }

    try {
      const plugins = fs.readdirSync(pluginsDir);

      for (const plugin of plugins) {
        const pluginLocalesDir = path.join(pluginsDir, plugin, 'locales');

        if (fs.existsSync(pluginLocalesDir)) {
          for (const locale of this.supportedLocales) {
            const pluginLocalePath = path.join(pluginLocalesDir, `${locale}.json`);

            if (fs.existsSync(pluginLocalePath)) {
              try {
                const pluginTranslations = JSON.parse(fs.readFileSync(pluginLocalePath, 'utf8'));

                // Merge plugin translations into main translations
                if (!this.translations[locale]) {
                  this.translations[locale] = {};
                }

                this.translations[locale] = this.deepMerge(
                  this.translations[locale],
                  pluginTranslations
                );

                console.log(`✅ Loaded ${locale} translations for plugin: ${plugin}`);
              } catch (error) {
                console.error(`Failed to load ${locale} translations for plugin ${plugin}:`, error.message);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error loading plugin translations:', error.message);
    }
  }

  /**
   * Deep merge two objects
   */
  deepMerge(target, source) {
    const output = Object.assign({}, target);

    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = this.deepMerge(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }

    return output;
  }

  /**
   * Check if value is an object
   */
  isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  /**
   * Set current locale
   */
  setLocale(locale) {
    if (this.translations[locale]) {
      this.currentLocale = locale;
      return true;
    }
    return false;
  }

  /**
   * Get current locale
   */
  getLocale() {
    return this.currentLocale;
  }

  /**
   * Translate a key
   * @param {string} key - Translation key (e.g., 'dashboard.title')
   * @param {object} params - Parameters for interpolation
   * @param {string} locale - Optional locale override
   */
  t(key, params = {}, locale = null) {
    const targetLocale = locale || this.currentLocale;
    const keys = key.split('.');

    let translation = this.translations[targetLocale];

    // Traverse the translation object
    for (const k of keys) {
      if (translation && typeof translation === 'object' && k in translation) {
        translation = translation[k];
      } else {
        // Fallback to default locale
        translation = this.translations[this.defaultLocale];
        for (const fallbackKey of keys) {
          if (translation && typeof translation === 'object' && fallbackKey in translation) {
            translation = translation[fallbackKey];
          } else {
            // Return key if not found
            return key;
          }
        }
        break;
      }
    }

    // If translation is still an object, something went wrong
    if (typeof translation !== 'string') {
      return key;
    }

    // Interpolate parameters
    return this.interpolate(translation, params);
  }

  /**
   * Interpolate parameters into translation string
   * Example: "Hello {name}" + {name: "John"} => "Hello John"
   */
  interpolate(str, params) {
    return str.replace(/\{(\w+)\}/g, (match, key) => {
      return key in params ? params[key] : match;
    });
  }

  /**
   * Get all available locales
   */
  getAvailableLocales() {
    return Object.keys(this.translations);
  }

  /**
   * Get all translations for a locale
   */
  getAllTranslations(locale = null) {
    const targetLocale = locale || this.currentLocale;
    return this.translations[targetLocale] || {};
  }

  /**
   * Reload all translations (useful after plugin changes)
   */
  reloadTranslations() {
    this.loadTranslations();
    console.log('✅ Translations reloaded');
  }

  /**
   * Express middleware for i18n
   */
  init(req, res, next) {
    // Get locale from query, header, or default
    const locale = req.query.lang || req.headers['accept-language']?.split(',')[0]?.split('-')[0] || 'en';

    // Attach i18n to request
    req.i18n = globalI18n;
    req.locale = locale;
    req.t = (key, params = {}) => globalI18n.t(key, params, locale);

    next();
  }
}

// Create global instance
const globalI18n = new I18n('en');

module.exports = globalI18n;
