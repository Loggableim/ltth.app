// i18n.js - Internationalization for ltth.app
(function() {
    'use strict';
    
    let translations = {};
    let currentLang = 'de';
    
    function get(key) {
        const parts = key.split('.');
        let obj = translations;
        for (const part of parts) {
            if (obj == null || typeof obj !== 'object') return key;
            obj = obj[part];
        }
        return (obj != null && typeof obj === 'string') ? obj : key;
    }
    
    async function load(lang) {
        try {
            const response = await fetch('/locales/' + lang + '.json');
            if (!response.ok) throw new Error('HTTP ' + response.status);
            translations = await response.json();
            currentLang = lang;
            return true;
        } catch(e) {
            console.warn('i18n: Could not load locale', lang, e);
            if (lang !== 'de') {
                return load('de'); // fallback to German
            }
            return false;
        }
    }
    
    function apply() {
        document.documentElement.lang = currentLang;
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
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const value = get(key);
            if (value !== key) {
                if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                    el.placeholder = value;
                } else if (el.hasAttribute('data-i18n-attr')) {
                    const attr = el.getAttribute('data-i18n-attr');
                    el.setAttribute(attr, value);
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
