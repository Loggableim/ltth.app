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
        this._readyResolve = null;
        this.ready = new Promise(resolve => { this._readyResolve = resolve; });
        
        // Load locale from localStorage
        const savedLocale = localStorage.getItem('app_locale');
        if (savedLocale) {
            this.currentLocale = savedLocale;
        }
    }

    /**
     * Initialize i18n with locale from URL (?lang=), localStorage, or default
     */
    async init() {
        // Check URL parameter first (?lang=) — overrides localStorage
        const urlParams = new URLSearchParams(window.location.search);
        const urlLocale = urlParams.get('lang');
        const savedLocale = this.normalizeLocale(urlLocale || localStorage.getItem('app_locale') || this.defaultLocale);
        
        // Load English as the baseline for the initial boot, but keep a
        // supported language isolated so missing keys cannot borrow English
        // silently during a language switch.
        await this.loadTranslations(this.defaultLocale);
        if (savedLocale !== this.defaultLocale) {
            await this.loadTranslations(savedLocale);
        }
        
        this.initialized = true;
        this._readyResolve();
        return this;
    }

    /**
     * Load translations from server
     */
    async loadTranslations(locale) {
        locale = this.normalizeLocale(locale);
        try {
            const response = await fetch(`/api/i18n/translations/${locale}`);
            if (!response.ok) {
                throw new Error(`Failed to load translations: ${response.statusText}`);
            }
            
            const data = await response.json();
            this.translations[locale] = data;
            this.currentLocale = locale;
            if (document && document.documentElement) {
                document.documentElement.lang = locale;
            }
            
            // Save to localStorage
            localStorage.setItem('app_locale', locale);
            
            console.log(`✅ [i18n] Loaded translations for: ${locale}`);
            return true;
        } catch (error) {
            console.error(`❌ [i18n] Failed to load translations for ${locale}:`, error);
            
            // Do not silently replace a supported language with English. A
            // missing locale is a deployment error and must stay visible to
            // QA instead of making a partially translated UI look healthy.
            return false;
        }
    }

    /**
     * Change language and reload translations
     */
    async changeLanguage(locale) {
        locale = this.normalizeLocale(locale);
        console.log(`[i18n] changeLanguage called: ${this.currentLocale} -> ${locale}`);
        
        if (this.currentLocale === locale) {
            console.log(`[i18n] Already using locale: ${locale}`);
            return true;
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
            
            // Update DOM immediately
            this.updateDOM();
            console.log(`[i18n] DOM updated after language change to: ${locale}`);
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
                // Supported locales must not silently borrow another language.
                // updateDOM preserves the original label when this key is not
                // present, making missing translations visible to QA.
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
     * Capture a stable fallback value for a DOM element the first time it is translated.
     * This preserves the original HTML content when a translation key is missing.
     */
    getStableFallback(element, fallbackAttribute, valueGetter) {
        if (element.hasAttribute(fallbackAttribute)) {
            return element.getAttribute(fallbackAttribute);
        }

        const fallback = valueGetter();
        const normalizedFallback = fallback == null ? '' : String(fallback);
        element.setAttribute(fallbackAttribute, normalizedFallback);
        return normalizedFallback;
    }

    /**
     * Change the current locale
     */
    async setLocale(locale) {
        locale = this.normalizeLocale(locale);
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
        
        console.log(`[i18n] Language changed to: ${locale}`);
        
        return true;
    }

    /**
     * Get current locale
     */
    getLocale() {
        return this.currentLocale;
    }

    normalizeLocale(locale) {
        const normalized = String(locale || '').trim().toLowerCase().replace('_', '-').split('-')[0];
        return ['en', 'de', 'es', 'fr'].includes(normalized) ? normalized : this.defaultLocale;
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
            const fallback = this.getStableFallback(element, 'data-i18n-fallback', () => {
                if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                    if (element.hasAttribute('placeholder')) {
                        return element.getAttribute('placeholder');
                    }
                    return element.value;
                }

                return element.textContent;
            });
            const resolvedTranslation = translation === key ? fallback : translation;
            
            // Update text content or placeholder based on element type
            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                if (element.hasAttribute('placeholder')) {
                    element.placeholder = resolvedTranslation;
                } else {
                    element.value = resolvedTranslation;
                }
            } else {
                element.textContent = resolvedTranslation;
            }
        });

        // Plugin UIs historically used data-i18n-key. Keep that attribute
        // compatible with the central data-i18n contract so overlays and
        // settings pages do not need a second translation runtime.
        document.querySelectorAll('[data-i18n-key]').forEach(element => {
            if (element.hasAttribute('data-i18n')) return;
            const key = element.getAttribute('data-i18n-key');
            const translation = this.t(key);
            if (translation === key) return;
            const isHtml = element.getAttribute('data-i18n-html') === 'true';
            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                element.placeholder = translation;
            } else if (isHtml) {
                element.innerHTML = translation;
            } else {
                element.textContent = translation;
            }
        });

        // Update elements with data-i18n-title attribute (for tooltips)
        document.querySelectorAll('[data-i18n-title]').forEach(element => {
            const key = element.getAttribute('data-i18n-title');
            const translation = this.t(key);
            const fallback = this.getStableFallback(element, 'data-i18n-title-fallback', () => {
                return element.getAttribute('title') || '';
            });
            element.title = translation === key ? fallback : translation;
        });

        // Accessible names and form hints are translated independently from
        // visible text so keyboard and assistive-technology users follow the
        // active language as well.
        document.querySelectorAll('[data-i18n-aria-label]').forEach(element => {
            const key = element.getAttribute('data-i18n-aria-label');
            const translation = this.t(key);
            const fallback = this.getStableFallback(element, 'data-i18n-aria-label-fallback', () => element.getAttribute('aria-label') || '');
            element.setAttribute('aria-label', translation === key ? fallback : translation);
        });

        document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
            const key = element.getAttribute('data-i18n-placeholder');
            const translation = this.t(key);
            const fallback = this.getStableFallback(element, 'data-i18n-placeholder-fallback', () => element.getAttribute('placeholder') || '');
            element.setAttribute('placeholder', translation === key ? fallback : translation);
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
            
            const translation = this.t(key, paramsObj);
            const fallback = this.getStableFallback(element, 'data-i18n-html-fallback', () => {
                return element.innerHTML;
            });
            element.innerHTML = translation === key ? fallback : translation;
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

// Shared handler for language change events
const handleLanguageChange = async (data, fromPostMessage = false) => {
    const newLocale = data.locale;
    console.log(`[i18n] Received language change event: ${newLocale}`);
    
    if (i18n.currentLocale !== newLocale) {
        const success = await i18n.changeLanguage(newLocale);
        if (success) {
            i18n.updateDOM();
            console.log(`[i18n] Language updated to: ${newLocale} (via event)`);
            
            // Only propagate to iframes if this is the parent window AND
            // the change didn't originate from a postMessage (prevents infinite loops)
            if (window === window.top && !fromPostMessage) {
                const iframes = document.querySelectorAll('iframe');
                iframes.forEach(iframe => {
                    try {
                        // Note: contentWindow is accessible even for cross-origin iframes,
                        // but postMessage will succeed/fail based on actual permissions.
                        // The try-catch handles all failure scenarios (cross-origin, security, etc.)
                        const iframeWindow = iframe.contentWindow;
                        if (iframeWindow) {
                            iframeWindow.postMessage({
                                type: 'language-changed',
                                locale: newLocale
                            }, window.location.origin);
                        }
                    } catch (e) {
                        // Expected for cross-origin iframes or iframes with security restrictions
                        console.debug('[i18n] Skipping language change for iframe (not accessible):', e.message);
                    }
                });
            }
        }
    }
};

// Listen for language changes via socket.io (for real-time sync across tabs/plugins)
if (typeof io !== 'undefined') {
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

// Listen for postMessage from parent window (for iframe language sync)
window.addEventListener('message', (event) => {
    // Accept messages from same origin for security
    // Note: Exact origin matching is intentional. All plugin UIs are served from
    // the same origin (the app server), so subdomain/parent domain matching is
    // unnecessary and would reduce security.
    if (event.origin !== window.location.origin) {
        return;
    }
    
    if (event.data && event.data.type === 'language-changed') {
        // Pass true as second parameter to indicate this came from postMessage
        // This prevents infinite propagation loops
        handleLanguageChange({ locale: event.data.locale }, true);
    }
});
