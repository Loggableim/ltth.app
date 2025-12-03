/**
 * Client-side Internationalization (i18n) Library
 * 
 * This library provides translation capabilities for the browser,
 * with support for live language switching and automatic UI updates.
 * 
 * Features:
 * - Load translations from server
 * - Support for interpolation ({key} syntax)
 * - Language switching with event emission
 * - LocalStorage persistence
 * - Automatic UI re-rendering
 */

class I18nClient {
    constructor() {
        this.currentLocale = 'en';
        this.defaultLocale = 'en';
        this.translations = {};
        this.listeners = [];
        this.initialized = false;
        this.onLanguageChangeCallbacks = [];
        
        // Load locale from localStorage
        const savedLocale = localStorage.getItem('app_locale');
        if (savedLocale) {
            this.currentLocale = savedLocale;
        }
    }

    /**
     * Initialize i18n with locale from localStorage or default
     */
    async init() {
        // Get saved locale from localStorage or use default
        const savedLocale = localStorage.getItem('app_locale') || this.defaultLocale;
        
        // Load translations for the saved locale
        await this.loadTranslations(savedLocale);
        
        this.initialized = true;
        return this;
    }

    /**
     * Load translations from server
     */
    async loadTranslations(locale) {
        try {
            const response = await fetch(`/api/i18n/translations/${locale}`);
            if (!response.ok) {
                throw new Error(`Failed to load translations: ${response.statusText}`);
            }
            
            const data = await response.json();
            this.translations[locale] = data;
            this.currentLocale = locale;
            
            // Save to localStorage
            localStorage.setItem('app_locale', locale);
            
            console.log(`✅ [i18n] Loaded translations for: ${locale}`);
            return true;
        } catch (error) {
            console.error(`❌ [i18n] Failed to load translations for ${locale}:`, error);
            
            // Fallback to default locale if not already trying it
            if (locale !== this.defaultLocale) {
                console.log(`[i18n] Falling back to ${this.defaultLocale}`);
                return this.loadTranslations(this.defaultLocale);
            }
            return false;
        }
    }

    /**
     * Change language and reload translations
     */
    async changeLanguage(locale) {
        console.log(`[i18n] changeLanguage called: ${this.currentLocale} -> ${locale}`);
        
        if (this.currentLocale === locale) {
            console.log(`[i18n] Already using locale: ${locale}`);
            return true; // Already using this locale
        }

        const success = await this.loadTranslations(locale);
        
        if (success) {
            console.log(`[i18n] Translations loaded successfully for: ${locale}`);
            
            // Trigger language change callbacks
            this.onLanguageChangeCallbacks.forEach(callback => {
                try {
                    callback(locale);
                } catch (error) {
                    console.error('[i18n] Error in language change callback:', error);
                }
            });
            
            // Update HTML lang attribute
            document.documentElement.lang = locale;
            console.log(`[i18n] Updated document.documentElement.lang to: ${locale}`);
        } else {
            console.error(`[i18n] Failed to load translations for: ${locale}`);
        }
        
        return success;
    }

    /**
     * Register callback for language changes
     */
    onLanguageChange(callback) {
        if (typeof callback === 'function') {
            this.onLanguageChangeCallbacks.push(callback);
        }
    }

    /**
     * Translate a key
     * @param {string} key - Translation key (e.g., 'dashboard.title')
     * @param {object} params - Parameters for interpolation
     * @returns {string} Translated string
     */
    t(key, params = {}) {
        if (!this.initialized) {
            console.warn('[i18n] Not initialized yet, returning key');
            return key;
        }

        const keys = key.split('.');
        let translation = this.translations[this.currentLocale];

        // Traverse the translation object
        for (const k of keys) {
            if (translation && typeof translation === 'object' && k in translation) {
                translation = translation[k];
            } else {
                // Fallback to default locale
                if (this.currentLocale !== this.defaultLocale && this.translations[this.defaultLocale]) {
                    translation = this.translations[this.defaultLocale];
                    for (const fallbackKey of keys) {
                        if (translation && typeof translation === 'object' && fallbackKey in translation) {
                            translation = translation[fallbackKey];
                        } else {
                            return key;
                        }
                    }
                    break;
                }
                return key;
            }
        }

        // If translation is still an object, return the key
        if (typeof translation !== 'string') {
            return key;
        }

        // Interpolate parameters
        return this.interpolate(translation, params);
    }

    /**
     * Interpolate parameters into translation string
     * Supports both {param} and {{param}} syntax
     */
    interpolate(str, params) {
        return str.replace(/\{\{?(\w+)\}?\}/g, (match, key) => {
            return key in params ? params[key] : match;
        });
    }

    /**
     * Change the current locale
     */
    async setLocale(locale) {
        if (locale === this.currentLocale) {
            return true;
        }

        // Load translations if not already loaded
        if (!this.translations[locale]) {
            const success = await this.loadTranslations(locale);
            if (!success) {
                return false;
            }
        } else {
            this.currentLocale = locale;
            localStorage.setItem('app_locale', locale);
            document.documentElement.lang = locale;
        }

        // Notify all listeners
        this.notifyListeners(locale);
        
        console.log(`🌍 Language changed to: ${locale}`);
        
        return true;
    }

    /**
     * Get current locale
     */
    getLocale() {
        return this.currentLocale;
    }

    /**
     * Get all available locales
     */
    async getAvailableLocales() {
        try {
            const response = await fetch('/api/i18n/locales');
            if (!response.ok) {
                throw new Error('Failed to fetch available locales');
            }
            const data = await response.json();
            return data || ['en', 'de', 'es', 'fr'];
        } catch (error) {
            console.error('[i18n] Failed to fetch available locales:', error);
            return ['en', 'de', 'es', 'fr'];
        }
    }

    /**
     * Register a listener for locale changes
     */
    onChange(callback) {
        this.listeners.push(callback);
    }

    /**
     * Unregister a listener
     */
    offChange(callback) {
        const index = this.listeners.indexOf(callback);
        if (index > -1) {
            this.listeners.splice(index, 1);
        }
    }

    /**
     * Notify all listeners of locale change
     */
    notifyListeners(newLocale) {
        this.listeners.forEach(callback => {
            try {
                callback(newLocale);
            } catch (error) {
                console.error('Error in locale change listener:', error);
            }
        });
    }

    /**
     * Update all elements with data-i18n attribute
     */
    updateDOM() {
        // Update elements with data-i18n attribute
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            const params = element.getAttribute('data-i18n-params');
            
            let paramsObj = {};
            if (params) {
                try {
                    paramsObj = JSON.parse(params);
                } catch (e) {
                    console.warn(`Invalid data-i18n-params for ${key}:`, params);
                }
            }
            
            const translation = this.t(key, paramsObj);
            
            // Update text content or placeholder based on element type
            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                if (element.hasAttribute('placeholder')) {
                    element.placeholder = translation;
                } else {
                    element.value = translation;
                }
            } else {
                element.textContent = translation;
            }
        });

        // Update elements with data-i18n-title attribute (for tooltips)
        document.querySelectorAll('[data-i18n-title]').forEach(element => {
            const key = element.getAttribute('data-i18n-title');
            element.title = this.t(key);
        });

        // Update elements with data-i18n-html attribute (for HTML content)
        document.querySelectorAll('[data-i18n-html]').forEach(element => {
            const key = element.getAttribute('data-i18n-html');
            const params = element.getAttribute('data-i18n-params');
            
            let paramsObj = {};
            if (params) {
                try {
                    paramsObj = JSON.parse(params);
                } catch (e) {
                    console.warn(`Invalid data-i18n-params for ${key}:`, params);
                }
            }
            
            element.innerHTML = this.t(key, paramsObj);
        });
    }

    /**
     * Setup language switcher for a select element
     */
    setupLanguageSwitcher(selectElement) {
        if (!selectElement) {
            console.warn('[i18n] setupLanguageSwitcher called with null/undefined element');
            return;
        }

        console.log(`[i18n] Setting up language switcher for element ID: ${selectElement.id}`);
        
        // Set current value
        selectElement.value = this.currentLocale;
        console.log(`[i18n] Set ${selectElement.id} value to: ${this.currentLocale}`);

        // Listen for changes
        selectElement.addEventListener('change', async (e) => {
            const newLocale = e.target.value;
            console.log(`[i18n] Language change triggered to: ${newLocale}`);
            
            const success = await this.changeLanguage(newLocale);
            
            if (success) {
                console.log(`[i18n] Language change successful, updating DOM...`);
                this.updateDOM();
                
                // Sync all language selectors
                this.syncAllLanguageSelectors(newLocale);
                
                console.log(`✅ [i18n] Language changed to: ${newLocale}`);
                
                // Show notification (if available)
                if (typeof showNotification === 'function') {
                    showNotification(`Language changed to ${newLocale}`, 'success');
                }
            } else {
                console.error(`❌ [i18n] Failed to change language to: ${newLocale}`);
                selectElement.value = this.currentLocale; // Revert
            }
        });
        
        console.log(`[i18n] Event listener registered for ${selectElement.id}`);
    }

    /**
     * Sync all language selectors to the current locale
     */
    syncAllLanguageSelectors(locale) {
        const selectors = [
            document.getElementById('language-selector'),
            document.getElementById('topbar-language-selector')
        ];

        selectors.forEach(selector => {
            if (selector && selector.value !== locale) {
                selector.value = locale;
            }
        });
    }
}

// Create global instance
const i18n = new I18nClient();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
        await i18n.init();
        i18n.updateDOM();
    });
} else {
    // DOM already loaded
    i18n.init().then(() => i18n.updateDOM());
}

// Make available globally
window.i18n = i18n;

// Listen for language changes via socket.io (for real-time sync across tabs/plugins)
if (typeof io !== 'undefined') {
    // Shared handler for language change events
    const handleLanguageChange = async (data) => {
        const newLocale = data.locale;
        console.log(`[i18n] Received language change event: ${newLocale}`);
        
        if (i18n.currentLocale !== newLocale) {
            const success = await i18n.changeLanguage(newLocale);
            if (success) {
                i18n.updateDOM();
                console.log(`[i18n] Language updated to: ${newLocale} (via socket.io)`);
            }
        }
    };
    
    // Wait for socket.io to be ready
    const setupSocketListener = () => {
        if (window.socket) {
            // Listen for both event names (server uses 'locale-changed', client may emit 'language-changed')
            window.socket.on('locale-changed', handleLanguageChange);
            window.socket.on('language-changed', handleLanguageChange);
            
            console.log('[i18n] Socket.io language sync enabled');
        } else {
            // Retry after a short delay if socket not ready yet
            setTimeout(setupSocketListener, 100);
        }
    };
    
    // Start trying to setup the listener
    setupSocketListener();
}
