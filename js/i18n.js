// i18n.js - Internationalization for ltth.app
(function() {
    'use strict';
    
    let translations = {};
    let currentLang = 'de';

    function normalizeLang(lang) {
        const normalized = String(lang || '').trim().toLowerCase().replace('_', '-').split('-')[0];
        return ['de', 'en', 'es', 'fr'].includes(normalized) ? normalized : 'de';
    }
    
    function get(key) {
        if (Object.prototype.hasOwnProperty.call(translations, key) && typeof translations[key] === 'string') {
            return translations[key];
        }
        const parts = key.split('.');
        let obj = translations;
        for (const part of parts) {
            if (obj == null || typeof obj !== 'object') return key;
            obj = obj[part];
        }
        if ((obj == null || typeof obj !== 'string') && Object.prototype.hasOwnProperty.call(translations, key) && typeof translations[key] === 'string') {
            return translations[key];
        }
        return (obj != null && typeof obj === 'string') ? obj : key;
    }
    
    async function load(lang) {
        lang = normalizeLang(lang);
        try {
            const response = await fetch('/locales/' + lang + '.json', { cache: 'no-cache' });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const baseTranslations = await response.json();
            const guideResponse = await fetch('/locales/guides/' + lang + '.json', { cache: 'no-cache' });
            const isGuidePage = /^\/docs\/plugins\//.test(window.location.pathname);
            if (!guideResponse.ok && isGuidePage) {
                throw new Error('Guide locale HTTP ' + guideResponse.status);
            }
            const guideTranslations = guideResponse.ok ? await guideResponse.json() : {};
            translations = { ...baseTranslations, ...guideTranslations };
            currentLang = lang;
            return true;
        } catch(e) {
            console.warn('i18n: Could not load locale', lang, e);
            // Keep supported locales isolated. Falling back to German here
            // hides missing deployment assets and makes a partially
            // translated page look healthy to users and QA.
            return false;
        }
    }
    
    function apply() {
        document.documentElement.lang = currentLang;
        document.documentElement.dataset.lang = currentLang;
        document.querySelectorAll('[data-i18n-href]').forEach(el => {
            const key = el.getAttribute('data-i18n-href');
            const value = get(key);
            if (value !== key) {
                el.setAttribute('href', value);
            }
        });
        document.querySelectorAll('[data-i18n-alt]').forEach(el => {
            const key = el.getAttribute('data-i18n-alt');
            const value = get(key);
            if (value !== key) {
                el.setAttribute('alt', value);
            }
        });
        document.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
            const key = el.getAttribute('data-i18n-aria-label');
            const value = get(key);
            if (value !== key) el.setAttribute('aria-label', value);
        });
        document.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
            const key = el.getAttribute('data-i18n-aria-label');
            const value = get(key);
            if (value !== key) el.setAttribute('aria-label', value);
        });
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            const value = get(key);
            if (value !== key) el.setAttribute('title', value);
        });
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const value = get(key);
            if (value !== key) {
                if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                    el.placeholder = value;
                } else if (el.hasAttribute('data-i18n-attr')) {
                    const attr = el.getAttribute('data-i18n-attr');
                    el.setAttribute(attr, value);
                } else if (el.hasAttribute('data-i18n-html')) {
                    // A small, explicit escape hatch for trusted locale strings
                    // that intentionally contain markup (for example the footer
                    // credit with its styled heart).
                    el.innerHTML = value;
                } else if (el.children.length > 0) {
                    const textNodes = Array.from(el.childNodes).filter(node => node.nodeType === Node.TEXT_NODE);
                    const meaningfulTextNodes = textNodes.filter(node => node.textContent.trim().length > 0);
                    const childrenWithText = Array.from(el.children).filter(child => {
                        return (child.textContent || '').trim().length > 0;
                    });
                    const translatableChildren = childrenWithText.filter(child => child.hasAttribute && (child.hasAttribute('data-i18n') || child.hasAttribute('data-i18n-alt')));

                    if (meaningfulTextNodes.length > 0) {
                        if (translatableChildren.length === 0) {
                            childrenWithText.forEach(child => {
                                child.textContent = '';
                            });
                        }
                        meaningfulTextNodes.forEach((node, index) => {
                            node.textContent = index === 0 ? value : '';
                        });
                    } else if (textNodes.length > 0) {
                        textNodes[textNodes.length - 1].textContent = value;
                    } else {
                        el.textContent = value;
                    }
                } else {
                    el.textContent = value;
                }
            }
        });
        // Update page title if data-i18n-title set on <head>
        const titleKey = document.head.getAttribute('data-i18n-title');
        if (titleKey) {
            const title = get(titleKey);
            if (title !== titleKey) document.title = title;
        }
        // Generated plugin tutorials keep one canonical URL while their
        // localized browser metadata follows the visible guide language.
        const pluginSummary = document.querySelector('.plugin-doc-hero > [data-i18n$=".summary"]');
        const pluginTitle = document.querySelector('.plugin-doc-hero h1');
        if (pluginSummary) {
            const description = document.querySelector('meta[name="description"]');
            const ogDescription = document.querySelector('meta[property="og:description"]');
            const ogTitle = document.querySelector('meta[property="og:title"]');
            if (description) description.setAttribute('content', pluginSummary.textContent.trim());
            if (ogDescription) ogDescription.setAttribute('content', pluginSummary.textContent.trim());
            if (ogTitle && pluginTitle) ogTitle.setAttribute('content', `${pluginTitle.textContent.trim()} – LTTH Docs`);
        }
        document.dispatchEvent(new CustomEvent('i18nApplied', { detail: { lang: currentLang } }));
    }
    
    async function init(lang) {
        await load(lang || 'de');
        apply();
        // Re-apply translations once layout.js has injected header/footer
        document.addEventListener('layoutReady', () => {
            apply();
        }, { once: true });
    }
    
    window.I18n = { init, apply, t: get, load, get currentLang() { return currentLang; } };
})();
