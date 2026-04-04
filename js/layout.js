// layout.js - Shared Layout Loader for ltth.app
(function() {
    'use strict';
    
    const SUPPORTED_LANGS = ['de', 'en', 'es', 'fr'];
    const DEFAULT_LANG = 'de';
    const INJECTED_ATTR = 'data-ltth-injected';
    
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
            // Always use absolute path relative to origin (works in deep subdirectories)
            const absoluteUrl = url.startsWith('/') ? url : '/' + url;
            const response = await fetch(absoluteUrl);
            if (!response.ok) throw new Error('Failed to load ' + absoluteUrl);
            return await response.text();
        } catch(e) {
            console.warn('layout.js: Could not load partial', url, e);
            return '';
        }
    }

    const LANG_MAP = {
        de: { flag: '🇩🇪', text: 'DE' },
        en: { flag: '🇬🇧', text: 'EN' },
        es: { flag: '🇪🇸', text: 'ES' },
        fr: { flag: '🇫🇷', text: 'FR' }
    };

    /**
     * Returns a Promise that resolves once the given selector matches an element
     * in document.body. Uses a MutationObserver so it reacts to DOM insertion
     * rather than polling, with a safety timeout fallback.
     */
    function waitForElement(selector, timeoutMs) {
        timeoutMs = timeoutMs || 3000;
        return new Promise(function(resolve) {
            if (document.querySelector(selector)) {
                resolve();
                return;
            }
            var obs = new MutationObserver(function() {
                if (document.querySelector(selector)) {
                    obs.disconnect();
                    resolve();
                }
            });
            obs.observe(document.body, { childList: true, subtree: true });
            setTimeout(function() { obs.disconnect(); resolve(); }, timeoutMs);
        });
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
        if (!toggle || !menu) return;

        // Prevent double-binding if layout.js already initialised this toggle
        if (toggle.getAttribute('data-ltth-burger-init')) return;
        toggle.setAttribute('data-ltth-burger-init', 'true');

        function openMenu() {
            // Toggle both .open (layout.css) and .active (main.css) for compatibility
            menu.classList.add('open', 'active');
            toggle.classList.add('open', 'active');
            toggle.setAttribute('aria-expanded', 'true');
        }
        function closeMenu() {
            menu.classList.remove('open', 'active');
            toggle.classList.remove('open', 'active');
            toggle.setAttribute('aria-expanded', 'false');
        }

        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = menu.classList.contains('open');
            isOpen ? closeMenu() : openMenu();
        });
        // Close on outside click
        document.addEventListener('click', (e) => {
            if (menu.classList.contains('open') &&
                !toggle.contains(e.target) && !menu.contains(e.target)) {
                closeMenu();
            }
        });
        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && menu.classList.contains('open')) closeMenu();
        });
    }
    
    function initScrollProgress() {
        if (document.getElementById('scrollProgress')) return;
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
        // Update current language display
        const flagEl = document.getElementById('currentLangFlag');
        const textEl = document.getElementById('currentLangText');
        if (flagEl && LANG_MAP[currentLang]) flagEl.textContent = LANG_MAP[currentLang].flag;
        if (textEl && LANG_MAP[currentLang]) textEl.textContent = LANG_MAP[currentLang].text;

        document.querySelectorAll('[data-lang-switch]').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                const lang = el.getAttribute('data-lang-switch');
                if (lang) switchLanguage(lang);
            });
            const lang = el.getAttribute('data-lang-switch');
            if (lang === currentLang) el.classList.add('active');
        });

        // Lang dropdown toggle
        const langDropdown = document.querySelector('.lang-dropdown');
        if (langDropdown) {
            const langToggle = langDropdown.querySelector('.lang-dropdown-toggle');
            if (langToggle) {
                langToggle.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    langDropdown.classList.toggle('open');
                });
                document.addEventListener('click', (e) => {
                    if (!langDropdown.contains(e.target)) langDropdown.classList.remove('open');
                });
            }
        }
    }
    
    function initMegaMenu() {
        const mega = document.getElementById('featuresMega');
        if (!mega) return;

        const toggle = mega.querySelector('.nav-mega-toggle');
        const panel = mega.querySelector('.nav-mega-panel');
        if (!toggle || !panel) return;

        const isMobile = () => window.innerWidth <= 768;

        function openMega() {
            mega.classList.add('open');
            toggle.setAttribute('aria-expanded', 'true');
            mega.dispatchEvent(new Event('ltth:open'));
            // Position panel below navbar on desktop
            if (!isMobile()) {
                const navbar = document.getElementById('navbar');
                if (navbar) {
                    panel.style.top = navbar.getBoundingClientRect().bottom + 'px';
                }
            }
        }

        function closeMega() {
            clearTimeout(closeTimer);
            mega.classList.remove('open');
            toggle.setAttribute('aria-expanded', 'false');
        }

        // Toggle on click (works for both desktop and mobile)
        toggle.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            mega.classList.contains('open') ? closeMega() : openMega();
        });

        // Desktop: also open on hover; re-evaluated on resize (debounced + guarded)
        let hoverActive = false;
        let closeTimer = null;

        function onMegaEnter() {
            clearTimeout(closeTimer);
            openMega();
        }
        function onMegaLeave() {
            closeTimer = setTimeout(closeMega, 150);
        }
        function onPanelEnter() {
            clearTimeout(closeTimer);
        }
        function onPanelLeave() {
            closeTimer = setTimeout(closeMega, 150);
        }

        function addHoverListeners() {
            if (hoverActive) return;
            hoverActive = true;
            mega.addEventListener('mouseenter', onMegaEnter);
            mega.addEventListener('mouseleave', onMegaLeave);
            panel.addEventListener('mouseenter', onPanelEnter);
            panel.addEventListener('mouseleave', onPanelLeave);
        }
        function removeHoverListeners() {
            if (!hoverActive) return;
            hoverActive = false;
            clearTimeout(closeTimer);
            mega.removeEventListener('mouseenter', onMegaEnter);
            mega.removeEventListener('mouseleave', onMegaLeave);
            panel.removeEventListener('mouseenter', onPanelEnter);
            panel.removeEventListener('mouseleave', onPanelLeave);
        }
        function updateHoverListeners() {
            isMobile() ? removeHoverListeners() : addHoverListeners();
        }
        updateHoverListeners();
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(updateHoverListeners, 100);
        }, { passive: true });

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (mega.classList.contains('open') && !mega.contains(e.target)) {
                closeMega();
            }
        });

        // Close on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && mega.classList.contains('open')) {
                closeMega();
                toggle.focus();
            }
        });

        // Keyboard navigation within panel: Arrow keys move between mega-items
        // Cache items list when panel opens for performance
        let cachedItems = [];
        mega.addEventListener('ltth:open', () => {
            cachedItems = Array.from(panel.querySelectorAll('.mega-item'));
        });
        panel.addEventListener('keydown', (e) => {
            const items = cachedItems.length ? cachedItems : Array.from(panel.querySelectorAll('.mega-item'));
            const idx = items.indexOf(document.activeElement);
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                items[Math.min(idx + 1, items.length - 1)]?.focus();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (idx <= 0) {
                    closeMega();
                    toggle.focus();
                } else {
                    items[idx - 1]?.focus();
                }
            }
        });

        // Close mega on scroll (desktop)
        let scrollTimer;
        window.addEventListener('scroll', () => {
            if (!isMobile() && mega.classList.contains('open')) {
                clearTimeout(scrollTimer);
                scrollTimer = setTimeout(closeMega, 100);
            }
        }, { passive: true });
    }

    function initTheme() {
        // Minimal theme management for pages that do not load main.js
        const themeBtn = document.getElementById('themeToggle');
        if (!themeBtn) return;
        // If main.js ThemeManager already owns this button, skip
        if (themeBtn.getAttribute('data-ltth-theme-init')) return;
        themeBtn.setAttribute('data-ltth-theme-init', 'true');

        function applyTheme(theme) {
            document.documentElement.setAttribute('data-theme', theme);
            try { localStorage.setItem('theme', theme); } catch(e) { console.debug('layout.js: Failed to persist theme', e); }
        }
        function getTheme() {
            try { return localStorage.getItem('theme'); } catch(e) { return null; }
        }
        // Apply stored or preferred theme
        const stored = getTheme();
        const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        applyTheme(stored || preferred);

        themeBtn.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme') || 'light';
            applyTheme(current === 'dark' ? 'light' : 'dark');
        });
    }
    
    async function init(options) {
        options = options || {};
        const lang = detectLanguage();
        window.__ltthLang = lang;

        // Prevent layout shift: hide body content until header/footer are injected
        document.body.setAttribute('data-layout-loading', '');
        
        // --- Header injection ---
        // A header injected by layout.js carries INJECTED_ATTR on #site-header.
        // If #navbar exists without that marker it is an outdated hardcoded fragment;
        // remove it so we can inject the current version from the partial.
        const injectedHeader = document.querySelector('#site-header[' + INJECTED_ATTR + ']');
        if (!injectedHeader) {
            const staleHeader = document.getElementById('site-header');
            const staleNav    = document.getElementById('navbar');
            if (staleHeader) {
                staleHeader.remove();
            } else if (staleNav) {
                // Remove the closest ancestor block element that wraps the nav
                const wrapper = staleNav.closest('header') || staleNav.parentElement;
                if (wrapper && wrapper !== document.body && wrapper !== document.documentElement) {
                    wrapper.remove();
                } else if (staleNav.parentNode) {
                    staleNav.remove();
                }
            }

            const headerHTML = await loadPartial('/_partials/header.html');
            if (headerHTML) {
                const headerEl = document.createElement('div');
                headerEl.innerHTML = headerHTML;
                const header = headerEl.querySelector('header');
                if (header) {
                    header.setAttribute(INJECTED_ATTR, 'true');
                    document.body.insertBefore(header, document.body.firstChild);
                }
            }
        }

        // Use MutationObserver to confirm #navbar is in the DOM before continuing,
        // so that initHamburger() and friends can safely query it.
        await waitForElement('#navbar');
        
        // --- Footer injection ---
        const injectedFooter = document.querySelector('footer.footer[' + INJECTED_ATTR + ']');
        if (!injectedFooter) {
            const staleFooter = document.querySelector('footer.footer');
            if (staleFooter) staleFooter.remove();

            const footerHTML = await loadPartial('/_partials/footer.html');
            if (footerHTML) {
                const footerEl = document.createElement('div');
                footerEl.innerHTML = footerHTML;
                const footer = footerEl.querySelector('footer');
                if (footer) {
                    footer.setAttribute(INJECTED_ATTR, 'true');
                    document.body.appendChild(footer);
                }
            }
        }
        
        // Reveal page now that layout is in place
        document.body.removeAttribute('data-layout-loading');

        // Init interactions
        initHamburger();
        initScrollProgress();
        initNavbarScroll();
        initLangSwitcher(lang);
        initMegaMenu();
        initTheme();
        setActiveNav(lang);
        
        // Re-apply i18n translations to newly injected header/footer nodes
        if (window.I18n && typeof window.I18n.apply === 'function') {
            window.I18n.apply();
        }

        // Dispatch event so dependent modules (main.js, i18n.js) can finish setup
        document.dispatchEvent(new CustomEvent('layoutReady', { detail: { lang } }));
    }
    
    window.LTTHLayout = { init, detectLanguage };
})();
