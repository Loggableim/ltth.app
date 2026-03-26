// layout.js - Shared Layout Loader for ltth.app
(function() {
    'use strict';
    
    const SUPPORTED_LANGS = ['de', 'en', 'es', 'fr'];
    const DEFAULT_LANG = 'de';
    
    function detectLanguage() {
        // 1. localStorage
        const stored = localStorage.getItem('ltth_lang');
        if (stored && SUPPORTED_LANGS.includes(stored)) return stored;
        
        // 2. URL param
        const urlParams = new URLSearchParams(window.location.search);
        const urlLang = urlParams.get('lang');
        if (urlLang && SUPPORTED_LANGS.includes(urlLang)) return urlLang;
        
        // 3. navigator language
        const navLang = (navigator.language || navigator.userLanguage || '').slice(0, 2).toLowerCase();
        if (SUPPORTED_LANGS.includes(navLang)) return navLang;
        
        return DEFAULT_LANG;
    }
    
    function switchLanguage(lang) {
        localStorage.setItem('ltth_lang', lang);
        const url = new URL(window.location.href);
        url.searchParams.set('lang', lang);
        window.location.href = url.toString();
    }
    
    async function loadPartial(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to load ' + url);
            return await response.text();
        } catch(e) {
            console.warn('layout.js: Could not load partial', url, e);
            return '';
        }
    }
    
    function setActiveNav(lang) {
        const path = window.location.pathname;
        document.querySelectorAll('.nav-link[data-page]').forEach(link => {
            const page = link.getAttribute('data-page');
            link.classList.remove('active');
            if (page === 'home' && (path === '/' || path === '/index.html')) {
                link.classList.add('active');
            } else if (page && path.includes(page)) {
                link.classList.add('active');
            }
        });
    }
    
    function initHamburger() {
        const toggle = document.getElementById('navToggle');
        const menu = document.getElementById('navMenu');
        if (toggle && menu) {
            toggle.addEventListener('click', () => {
                const isOpen = menu.classList.toggle('open');
                toggle.setAttribute('aria-expanded', isOpen);
                toggle.classList.toggle('open', isOpen);
            });
            // Close on outside click
            document.addEventListener('click', (e) => {
                if (!toggle.contains(e.target) && !menu.contains(e.target)) {
                    menu.classList.remove('open');
                    toggle.classList.remove('open');
                    toggle.setAttribute('aria-expanded', 'false');
                }
            });
        }
    }
    
    function initScrollProgress() {
        const bar = document.createElement('div');
        bar.id = 'scrollProgress';
        bar.style.cssText = 'position:fixed;top:0;left:0;height:3px;background:var(--color-primary);z-index:9999;width:0;transition:width 0.1s;';
        document.body.prepend(bar);
        window.addEventListener('scroll', () => {
            const scrollTop = window.scrollY;
            const docHeight = document.documentElement.scrollHeight - window.innerHeight;
            bar.style.width = (docHeight > 0 ? (scrollTop / docHeight) * 100 : 0) + '%';
        }, { passive: true });
    }
    
    function initNavbarScroll() {
        const navbar = document.getElementById('navbar');
        if (navbar) {
            window.addEventListener('scroll', () => {
                navbar.classList.toggle('scrolled', window.scrollY > 50);
            }, { passive: true });
        }
    }
    
    function initLangSwitcher(currentLang) {
        document.querySelectorAll('[data-lang-switch]').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                const lang = el.getAttribute('data-lang-switch');
                if (lang) switchLanguage(lang);
            });
            const lang = el.getAttribute('data-lang-switch');
            if (lang === currentLang) el.classList.add('active');
        });
    }
    
    function initFeaturesDropdown() {
        const dropdown = document.querySelector('.nav-dropdown');
        if (dropdown) {
            const toggle = dropdown.querySelector('.nav-dropdown-toggle');
            const menu = dropdown.querySelector('.nav-dropdown-menu');
            if (toggle && menu) {
                toggle.addEventListener('click', (e) => {
                    e.preventDefault();
                    dropdown.classList.toggle('open');
                });
                document.addEventListener('click', (e) => {
                    if (!dropdown.contains(e.target)) {
                        dropdown.classList.remove('open');
                    }
                });
            }
        }
    }
    
    async function init(options) {
        options = options || {};
        const lang = detectLanguage();
        window.__ltthLang = lang;
        
        // Only inject shared header if page doesn't already have a #navbar
        const existingNav = document.getElementById('navbar');
        if (!existingNav) {
            const headerHTML = await loadPartial('/_partials/header.html');
            if (headerHTML) {
                const headerEl = document.createElement('div');
                headerEl.innerHTML = headerHTML;
                const nav = headerEl.querySelector('nav, header');
                if (nav) {
                    document.body.insertBefore(nav, document.body.firstChild);
                }
            }
        }
        
        // Only inject shared footer if page doesn't already have a .footer
        const existingFooter = document.querySelector('footer.footer');
        if (!existingFooter) {
            const footerHTML = await loadPartial('/_partials/footer.html');
            if (footerHTML) {
                const footerEl = document.createElement('div');
                footerEl.innerHTML = footerHTML;
                const footer = footerEl.querySelector('footer');
                if (footer) {
                    document.body.appendChild(footer);
                }
            }
        }
        
        // Init interactions
        initHamburger();
        initScrollProgress();
        initNavbarScroll();
        initLangSwitcher(lang);
        initFeaturesDropdown();
        setActiveNav(lang);
        
        // Dispatch event for i18n
        document.dispatchEvent(new CustomEvent('layoutReady', { detail: { lang } }));
    }
    
    window.LTTHLayout = { init, detectLanguage };
})();
