// layout.js - Shared Layout Loader for ltth.app
(function() {
    'use strict';
    
    const SUPPORTED_LANGS = ['de', 'en', 'es', 'fr'];
    const DEFAULT_LANG = 'de';
    const INJECTED_ATTR = 'data-ltth-injected';
    const FEATURE_LANG_PATHS = {
        '/features/': 'de',
        '/features': 'de',
        '/features/index.html': 'de',
        '/features-en.html': 'en',
        '/features-es.html': 'es',
        '/features-fr.html': 'fr',
    };
    const FEATURE_LANG_TARGETS = {
        de: '/features/',
        en: '/features-en.html',
        es: '/features-es.html',
        fr: '/features-fr.html',
    };

    const SCREENSHOT_LOCALE_ROOTS = {
        de: '/screenshots/de/features/',
        en: '/screenshots/features/',
        es: '/screenshots/es/features/',
        fr: '/screenshots/fr/features/'
    };

    function localizedScreenshotUrl(value, lang) {
        if (!value || !SCREENSHOT_LOCALE_ROOTS[lang]) return value;
        try {
            const url = new URL(value, window.location.origin);
            const match = url.pathname.match(/^\/screenshots\/(?:de\/|es\/|fr\/)?features\/(.+)$/);
            if (!match) return value;
            url.pathname = `${SCREENSHOT_LOCALE_ROOTS[lang]}${match[1]}`;
            return `${url.pathname}${url.search}${url.hash}`;
        } catch (error) {
            console.debug('layout.js: could not localize screenshot URL', error);
            return value;
        }
    }

    function applyScreenshotLocale(lang, root) {
        const container = root || document;
        container.querySelectorAll('img[src], meta[property="og:image"], meta[name="twitter:image"]').forEach((element) => {
            const attribute = element.tagName === 'META' ? 'content' : 'src';
            const current = element.getAttribute(attribute);
            const localized = localizedScreenshotUrl(current, lang);
            if (localized && localized !== current) element.setAttribute(attribute, localized);
        });
    }

    function persistLanguage(lang) {
        try {
            localStorage.setItem('ltth_lang', lang);
        } catch (e) {
            console.debug('layout.js: localStorage unavailable while persisting language', e);
        }
    }
    
    function detectLanguage() {
        const path = window.location.pathname;
        if (FEATURE_LANG_PATHS[path]) {
            const lang = FEATURE_LANG_PATHS[path];
            persistLanguage(lang);
            return lang;
        }

        // 1. URL param
        const urlParams = new URLSearchParams(window.location.search);
        const urlLang = urlParams.get('lang');
        if (urlLang) {
            const normalizedUrlLang = urlLang.toLowerCase().split('-')[0];
            if (SUPPORTED_LANGS.includes(normalizedUrlLang)) {
                persistLanguage(normalizedUrlLang);
                return normalizedUrlLang;
            }
            return 'en';
        }
        
        // 2. localStorage
        try {
            const stored = localStorage.getItem('ltth_lang');
            if (stored && SUPPORTED_LANGS.includes(stored)) return stored;
        } catch (e) {
            console.debug('layout.js: localStorage unavailable, continuing with URL/navigator language detection', e);
        }
        
        // 3. navigator language
        const navLang = (navigator.language || navigator.userLanguage || '').slice(0, 2).toLowerCase();
        if (SUPPORTED_LANGS.includes(navLang)) return navLang;
        
        return DEFAULT_LANG;
    }
    
    function switchLanguage(lang) {
        persistLanguage(lang);

        const path = window.location.pathname;
        if (
            path === '/features/' ||
            path === '/features' ||
            path === '/features/index.html' ||
            path === '/features.html' ||
            path === '/features-en.html' ||
            path === '/features-es.html' ||
            path === '/features-fr.html'
        ) {
            window.location.href = FEATURE_LANG_TARGETS[lang] || '/features/';
            return;
        }

        const url = new URL(window.location.href);
        url.searchParams.set('lang', lang);
        window.location.href = url.toString();
    }
    
    async function loadPartial(url) {
        try {
            // Always use absolute path relative to origin (works in deep subdirectories)
            const absoluteUrl = url.startsWith('/') ? url : '/' + url;
            // Bypass stale browser cache so header/footer updates show up immediately
            // after a deploy or local rebuild.
            const response = await fetch(absoluteUrl, { cache: 'reload' });
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
            } else if (page === 'features' && path.startsWith('/features')) {
                link.classList.add('active');
            } else if (page) {
                const pageBase = page.replace('.html', '');
                const segments = path.split('/').filter(Boolean);
                const last = segments[segments.length - 1] || '';
                if (
                    last === page ||
                    last === pageBase ||
                    (segments.length > 0 && segments[0] === pageBase && path.endsWith('/')) ||
                    path === '/' + page
                ) {
                    link.classList.add('active');
                }
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
            document.body.style.overflow = 'hidden';
        }
        function closeMenu() {
            menu.classList.remove('open', 'active');
            toggle.classList.remove('open', 'active');
            toggle.setAttribute('aria-expanded', 'false');
            document.body.style.overflow = '';
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
        // Close menu when a nav-link is clicked on mobile
        menu.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                if (window.innerWidth <= 768) closeMenu();
            });
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
                    const panelTop = navbar.getBoundingClientRect().bottom;
                    panel.style.top = panelTop + 'px';
                    panel.style.maxHeight = Math.max(240, window.innerHeight - panelTop) + 'px';
                    panel.style.overflowY = 'auto';
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
            // The panel is fixed to the viewport, so the pointer briefly
            // leaves the trigger while travelling into it. Give the pointer
            // a generous grace period instead of collapsing the menu mid-way.
            closeTimer = setTimeout(closeMega, 650);
        }
        function onPanelEnter() {
            clearTimeout(closeTimer);
        }
        function onPanelLeave() {
            closeTimer = setTimeout(closeMega, 300);
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

    function initBetaNotice() {
        const notice = document.getElementById('betaNotice');
        const closeBtn = document.getElementById('betaClose');
        if (!notice || !closeBtn) return;
        // If already owned by BetaNoticeManager (main.js), skip
        if (closeBtn.getAttribute('data-ltth-beta-init')) return;
        closeBtn.setAttribute('data-ltth-beta-init', 'true');
        try {
            if (localStorage.getItem('ltth_beta_closed') === '1') {
                notice.style.display = 'none';
                return;
            }
        } catch(e) {}
        closeBtn.addEventListener('click', () => {
            notice.style.display = 'none';
            try { localStorage.setItem('ltth_beta_closed', '1'); } catch(e) {}
        });
    }

    function initSiteV2Styles() {
        if (document.body.classList.contains('home-page')) return;
        document.body.classList.add('site-v2');
        if (document.getElementById('ltthSiteV2Styles')) return;

        const link = document.createElement('link');
        link.id = 'ltthSiteV2Styles';
        link.rel = 'stylesheet';
        link.href = '/css/site-v2.css?v=site-v2-20260712a';
        document.head.appendChild(link);
    }

    function initFeatureGuide() {
        if (!window.location.pathname.startsWith('/features/')) return;
        if (document.getElementById('ltthFeatureGuide')) return;
        const script = document.createElement('script');
        script.id = 'ltthFeatureGuide';
        script.src = '/js/feature-enhancer.js?v=20260711a';
        document.body.appendChild(script);
    }

    function initLegalCopy(lang) {
        let title = document.getElementById('legal-privacy-title');
        let copy = document.getElementById('legal-privacy-copy');
        let review = document.getElementById('legal-review-copy');
        if (!title || !copy || !review) {
            const container = document.querySelector('.legal-content');
            if (!container) return;
            const section = document.createElement('section');
            section.className = 'legal-section';
            section.innerHTML = '<h2 id="legal-privacy-title"></h2><p id="legal-privacy-copy"></p><p id="legal-review-copy"></p>';
            container.insertBefore(section, container.querySelector('.legal-back') || null);
            title = section.querySelector('#legal-privacy-title');
            copy = section.querySelector('#legal-privacy-copy');
            review = section.querySelector('#legal-review-copy');
        }
        const text = {
            en: ['Privacy and EU contact', 'The website processes only technical access data required for operation. The public site has no night-mode toggle, personalization tracking, or mandatory account. For GDPR requests, contact rainer@dominik.in.', 'These notes are not individual legal advice. Verify operator, VAT/company-register and editorial-responsibility details before publication.'],
            es: ['Protección de datos y contacto UE', 'El sitio procesa únicamente datos técnicos necesarios para funcionar. No hay modo nocturno, seguimiento de personalización ni cuenta obligatoria. Para solicitudes RGPD, escribe a rainer@dominik.in.', 'Estas notas no sustituyen asesoramiento jurídico individual. Verifica los datos del operador, IVA/registro mercantil y responsabilidad editorial antes de publicar.'],
            fr: ['Protection des données et contact UE', 'Le site traite uniquement les données techniques nécessaires à son fonctionnement. Il n’y a ni mode nuit, ni suivi de personnalisation, ni compte obligatoire. Pour les demandes RGPD, écrivez à rainer@dominik.in.', 'Ces informations ne remplacent pas un conseil juridique individuel. Vérifiez les données de l’opérateur, TVA/registre et responsabilité éditoriale avant publication.']
        }[lang];
        if (text) { title.textContent = text[0]; copy.textContent = text[1]; review.textContent = text[2]; }
    }

    function initCommunityCopy(lang) {
        let section = document.getElementById('ltthCommunitySupport');
        if (!section) return;
        const copy = {
            en: ['LTTH support on Discord', 'The Discord is a multistreamer server. For ltth.app support, post in the PupCid area or open a ticket. Reproducible bugs can also be filed on GitHub.', 'Open PupCid support'],
            es: ['Soporte de LTTH en Discord', 'Discord es un servidor para multistreamers. Para recibir ayuda con ltth.app, publica en el área de PupCid o abre un ticket. Los errores reproducibles también pueden reportarse en GitHub.', 'Abrir soporte de PupCid'],
            fr: ['Support LTTH sur Discord', 'Discord est un serveur de multistreamers. Pour le support ltth.app, écrivez dans l’espace PupCid ou ouvrez un ticket. Les bugs reproductibles peuvent aussi être signalés sur GitHub.', 'Ouvrir le support PupCid']
        }[lang];
        if (!copy) return;
        if (!section.querySelector('[data-community-title]')) {
            section = document.createElement('section');
            section.id = 'ltthCommunitySupport';
            section.className = 'features-preview';
            section.innerHTML = '<div class="container"><div class="support-card"><h2 class="section-title" data-community-title></h2><p data-community-copy></p><a class="btn btn-primary" data-community-cta href="https://discord.gg/qazznedY8g" target="_blank" rel="noopener"></a></div></div>';
            const main = document.querySelector('main');
            if (main) main.insertBefore(section, main.firstElementChild);
        }
        section.querySelector('[data-community-title]').textContent = copy[0];
        section.querySelector('[data-community-copy]').textContent = copy[1];
        section.querySelector('[data-community-cta]').textContent = copy[2];
    }

    function initSupportPage() {
        if (!window.location.pathname.includes('support')) return;
        const donation = document.querySelector('[data-i18n="support.a.19"]');
        const wrapper = donation && donation.closest('div[style*="max-width"]');
        if (wrapper) wrapper.hidden = true;
    }

    function initDocsCopy(lang) {
        if (!window.location.pathname.includes('docs')) return;
        let article = document.getElementById('feature-map');
        const copy = {
            en: ['Feature overview and current tutorials', 'Every feature page now includes requirements, setup, configuration, testing and troubleshooting. Start with the feature overview and open the practical guide for the module you use.', 'Launcher and updates', 'The Windows launcher keeps versions separate, creates backups and supports rollback. Check the health status and logs after every update.'],
            es: ['Resumen de funciones y tutoriales actuales', 'Cada página de funciones incluye requisitos, instalación, configuración, pruebas y solución de problemas. Empieza en el resumen de funciones y abre la guía práctica del módulo.', 'Lanzador y actualizaciones', 'El lanzador de Windows separa las versiones, crea copias de seguridad y permite rollback. Comprueba el estado y los registros después de cada actualización.'],
            fr: ['Vue des fonctions et tutoriels actuels', 'Chaque page de fonction présente les prérequis, l’installation, la configuration, les tests et le dépannage. Commencez par la vue des fonctions puis ouvrez le guide pratique du module.', 'Lanceur et mises à jour', 'Le lanceur Windows sépare les versions, crée des sauvegardes et permet le rollback. Vérifiez l’état et les journaux après chaque mise à jour.']
        }[lang];
        if (!copy) return;
        if (!article) {
            const main = document.querySelector('.docs-content');
            if (!main) return;
            article = document.createElement('article'); article.id = 'feature-map'; main.appendChild(article);
        }
        article.innerHTML = `<h1>${copy[0]}</h1><p>${copy[1]}</p><h2>${copy[2]}</h2><p>${copy[3]}</p><p><a href="/features/">Open feature overview</a> · <a href="/features/plugin-system.html">Plugin system</a> · <a href="/features/security.html">Security</a></p>`;
    }
    
    async function init(options) {
        options = options || {};
        const lang = detectLanguage();
        window.__ltthLang = lang;

        // Prevent layout shift: hide body content until header/footer are injected
        document.body.setAttribute('data-layout-loading', '');
        initSiteV2Styles();
        initFeatureGuide();
        initLegalCopy(window.__ltthLang || 'de');
        if (window.location.pathname.includes('community')) initCommunityCopy(window.__ltthLang || 'de');
        initSupportPage();
        initDocsCopy(window.__ltthLang || 'de');

        try {
            // --- Header injection ---
            // A header injected by layout.js carries INJECTED_ATTR on #site-header.
            // If #navbar exists without that marker it is an outdated hardcoded fragment;
            // replace it with the current version from the partial (but never remove it
            // before the replacement is actually available).
            const injectedHeader = document.querySelector('#site-header[' + INJECTED_ATTR + ']');
            if (!injectedHeader) {
                const staleHeader = document.getElementById('site-header');
                const staleNav = document.getElementById('navbar');

                const headerHTML = await loadPartial('/_partials/header.html');
                if (headerHTML) {
                    const headerEl = document.createElement('div');
                    headerEl.innerHTML = headerHTML;
                    const header = headerEl.querySelector('header');
                    if (header) {
                        header.setAttribute(INJECTED_ATTR, 'true');
                        if (staleHeader && staleHeader.parentNode) {
                            staleHeader.replaceWith(header);
                        } else if (staleNav && staleNav.parentNode) {
                            const wrapper = staleNav.closest('header') || staleNav.parentElement;
                            if (wrapper && wrapper.parentNode && wrapper !== document.body && wrapper !== document.documentElement) {
                                wrapper.replaceWith(header);
                            } else {
                                document.body.insertBefore(header, document.body.firstChild);
                                staleNav.remove();
                            }
                        } else {
                            document.body.insertBefore(header, document.body.firstChild);
                        }
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
                const footerHTML = await loadPartial('/_partials/footer.html');
                if (footerHTML) {
                    const footerEl = document.createElement('div');
                    footerEl.innerHTML = footerHTML;
                    const footer = footerEl.querySelector('footer');
                    if (footer) {
                        footer.setAttribute(INJECTED_ATTR, 'true');
                        if (staleFooter && staleFooter.parentNode) {
                            staleFooter.replaceWith(footer);
                        } else {
                            document.body.appendChild(footer);
                        }
                    }
                }
            }

            // Init interactions
            initHamburger();
            initBetaNotice();
            initScrollProgress();
            initNavbarScroll();
            initLangSwitcher(lang);
            initMegaMenu();
            setActiveNav(lang);

            applyScreenshotLocale(lang);
            if (!window.__ltthScreenshotObserver) {
                window.__ltthScreenshotObserver = new MutationObserver((mutations) => {
                    mutations.forEach((mutation) => {
                        mutation.addedNodes.forEach((node) => {
                            if (node.nodeType === Node.ELEMENT_NODE) applyScreenshotLocale(lang, node);
                        });
                    });
                });
                window.__ltthScreenshotObserver.observe(document.body, { childList: true, subtree: true });
            }

            // Re-apply i18n translations to newly injected header/footer nodes
            if (window.I18n && typeof window.I18n.apply === 'function') {
                window.I18n.apply();
            }

            // Dispatch event so dependent modules (main.js, i18n.js) can finish setup
            document.dispatchEvent(new CustomEvent('layoutReady', { detail: { lang } }));
        } catch (e) {
            console.error('layout.js: Layout initialization failed during injection or interaction setup', e);
        } finally {
            // Reveal page even when partial loading fails
            document.body.removeAttribute('data-layout-loading');
        }
    }
    
    window.LTTHLayout = { init, detectLanguage, applyScreenshotLocale, localizedScreenshotUrl };
})();
