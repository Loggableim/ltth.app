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

function readJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(raw);
}

class I18n {
  constructor(defaultLocale = 'en') {
    this.defaultLocale = defaultLocale;
    this.currentLocale = defaultLocale;
    this.translations = {};
    this.translationOrigins = {};
    this.supportedLocales = ['en', 'de', 'es', 'fr'];
    this.loadTranslations();
  }

  normalizeLocale(locale) {
    const normalized = String(locale || '').trim().toLowerCase().replace('_', '-').split('-')[0];
    return this.supportedLocales.includes(normalized) ? normalized : this.defaultLocale;
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
          this.translations[locale] = readJsonFile(filePath);
          this.recordTranslationOrigins(locale, this.translations[locale], filePath);
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
   * Load translations from all plugins.
   *
   * Locale files are part of the public UI contract even when a plugin is
   * disabled by default: its settings/help page can still be opened directly
   * (and the plugin may be enabled later).  Keeping those namespaces in the
   * translation payload prevents a supported-language page from silently
   * rendering English labels just because the plugin is currently inactive.
   */
  loadPluginTranslations() {
    const pluginsDir = path.join(__dirname, '..', 'plugins');

    if (!fs.existsSync(pluginsDir)) {
      return;
    }

    try {
      const plugins = fs.readdirSync(pluginsDir);

      for (const plugin of plugins) {
        const manifestPath = path.join(pluginsDir, plugin, 'plugin.json');
        const pluginLocalesDir = path.join(pluginsDir, plugin, 'locales');
        let pluginId = plugin;

        if (fs.existsSync(manifestPath)) {
          try {
            const manifest = readJsonFile(manifestPath);
            if (typeof manifest.id === 'string' && manifest.id.trim()) pluginId = manifest.id.trim();
          } catch (error) {
            console.error(`Failed to read manifest for plugin ${plugin}:`, error.message);
          }
        }

        if (fs.existsSync(pluginLocalesDir)) {
          for (const locale of this.supportedLocales) {
            const pluginLocalePath = path.join(pluginLocalesDir, `${locale}.json`);

            if (fs.existsSync(pluginLocalePath)) {
              try {
                const pluginTranslations = readJsonFile(pluginLocalePath);

                // Merge plugin translations into main translations
                if (!this.translations[locale]) {
                  this.translations[locale] = {};
                }

                const namespacedTranslations = pluginTranslations.plugins
                  && pluginTranslations.plugins[pluginId]
                  ? pluginTranslations
                  : { plugins: { [pluginId]: pluginTranslations } };

                this.translations[locale] = this.mergeTranslationSource(
                  locale,
                  namespacedTranslations,
                  pluginLocalePath
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

  translationLeaves(value, prefix = '', leaves = {}) {
    if (!this.isObject(value)) {
      leaves[prefix] = value;
      return leaves;
    }
    Object.entries(value).forEach(([key, child]) => {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      this.translationLeaves(child, fullKey, leaves);
    });
    return leaves;
  }

  recordTranslationOrigins(locale, translations, sourcePath) {
    if (!this.translationOrigins[locale]) this.translationOrigins[locale] = new Map();
    Object.keys(this.translationLeaves(translations)).forEach((key) => {
      if (!this.translationOrigins[locale].has(key)) {
        this.translationOrigins[locale].set(key, sourcePath);
      }
    });
  }

  mergeTranslationSource(locale, source, sourcePath, target = this.translations[locale] || {}, fallbackSourcePath = 'existing translations') {
    const targetLeaves = this.translationLeaves(target);
    const sourceLeaves = this.translationLeaves(source);
    const origins = this.translationOrigins[locale] || new Map();

    Object.entries(sourceLeaves).forEach(([key, value]) => {
      if (Object.hasOwn(targetLeaves, key) && targetLeaves[key] !== value) {
        const existingSource = origins.get(key) || fallbackSourcePath;
        throw new Error(`Translation collision at ${key} between ${existingSource} and ${sourcePath}`);
      }
    });

    const merged = this.deepMerge(target, source);
    this.recordTranslationOrigins(locale, source, sourcePath);
    return merged;
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
    const normalized = this.normalizeLocale(locale);
    if (this.translations[normalized]) {
      this.currentLocale = normalized;
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
    const targetLocale = this.normalizeLocale(locale || this.currentLocale);
    const keys = key.split('.');

    let translation = this.translations[targetLocale];

    // Traverse the translation object
    for (const k of keys) {
      if (translation && typeof translation === 'object' && k in translation) {
        translation = translation[k];
      } else {
        // Supported locales must not silently borrow another language. The
        // caller can decide how to render a missing key (usually the original
        // DOM label); returning the key keeps the omission observable.
        return key;
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
    const targetLocale = this.normalizeLocale(locale || this.currentLocale);
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
    const requested = req.query.lang || req.headers['accept-language']?.split(',')[0] || 'en';
    const locale = globalI18n.normalizeLocale(requested);

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
