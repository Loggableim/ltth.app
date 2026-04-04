/**
 * PupCid's Little TikTool Helper - ltth.app
 * Main JavaScript for Website Interactivity
 */

(function() {
    'use strict';

    // ===================================
    // Theme Management
    // ===================================
    class ThemeManager {
        constructor() {
            this.theme = this.getStoredTheme() || this.getPreferredTheme();
            this.init();
        }

        init() {
            this.setTheme(this.theme);
            this.setupEventListeners();
        }

        getStoredTheme() {
            return localStorage.getItem('theme');
        }

        getPreferredTheme() {
            if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                return 'dark';
            }
            return 'light';
        }

        setTheme(theme) {
            this.theme = theme;
            document.documentElement.setAttribute('data-theme', theme);
            localStorage.setItem('theme', theme);
        }

        toggleTheme() {
            const newTheme = this.theme === 'light' ? 'dark' : 'light';
            this.setTheme(newTheme);
        }

        setupEventListeners() {
            const themeToggle = document.getElementById('themeToggle');
            if (themeToggle) {
                if (!themeToggle.getAttribute('data-ltth-theme-init')) {
                    themeToggle.addEventListener('click', () => this.toggleTheme());
                }
            }

            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
                if (!this.getStoredTheme()) {
                    this.setTheme(e.matches ? 'dark' : 'light');
                }
            });
        }
    }

    // ===================================
    // Navigation Management
    // ===================================
    class NavigationManager {
        constructor() {
            this.isMenuOpen = false;
            this._initWhenReady();
        }

        _initWhenReady() {
            const nav = document.getElementById('navMenu');
            if (nav) {
                this._bindElements();
                this.init();
            } else {
                document.addEventListener('layoutReady', () => {
                    this._bindElements();
                    this.init();
                }, { once: true });
            }
        }

        _bindElements() {
            this.navToggle = document.getElementById('navToggle');
            this.navMenu   = document.getElementById('navMenu');
            this.navbar    = document.getElementById('navbar');
        }

        init() {
            this.setupEventListeners();
            this.setActiveLink();
            this.setupScrollBehavior();
        }

        setupEventListeners() {
            const alreadyBound = this.navToggle && this.navToggle.getAttribute('data-ltth-burger-init');

            if (!alreadyBound && this.navToggle) {
                this.navToggle.addEventListener('click', () => this.toggleMenu());
            }

            document.addEventListener('click', (e) => {
                if (this.isMenuOpen &&
                    this.navMenu && this.navToggle &&
                    !this.navMenu.contains(e.target) &&
                    !this.navToggle.contains(e.target)) {
                    this.closeMenu();
                }
            });

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.isMenuOpen) {
                    this.closeMenu();
                }
            });

            if (this.navMenu) {
                const navLinks = this.navMenu.querySelectorAll('.nav-link');
                navLinks.forEach(link => {
                    link.addEventListener('click', () => {
                        if (window.innerWidth < 768) {
                            this.closeMenu();
                        }
                    });
                });
            }
        }

        toggleMenu() {
            this.isMenuOpen = !this.isMenuOpen;
            if (this.navMenu)   this.navMenu.classList.toggle('active', this.isMenuOpen);
            if (this.navToggle) this.navToggle.classList.toggle('active', this.isMenuOpen);
            document.body.style.overflow = this.isMenuOpen ? 'hidden' : '';
        }

        closeMenu() {
            this.isMenuOpen = false;
            if (this.navMenu)   this.navMenu.classList.remove('active');
            if (this.navToggle) this.navToggle.classList.remove('active');
            document.body.style.overflow = '';
        }

        setActiveLink() {
            const currentPath = window.location.pathname;
            document.querySelectorAll('.nav-link').forEach(link => {
                try {
                    const linkPath = new URL(link.href).pathname;
                    if (linkPath === currentPath || (currentPath === '/' && linkPath === '/index.html')) {
                        link.classList.add('active');
                    } else {
                        link.classList.remove('active');
                    }
                } catch(e) { console.debug('NavigationManager: skipping link with invalid href', link, e); }
            });
        }

        setupScrollBehavior() {
            window.addEventListener('scroll', () => {
                if (this.navbar) {
                    this.navbar.style.boxShadow = window.pageYOffset > 10
                        ? 'var(--shadow-md)' : 'none';
                }
            });
        }
    }

    // ===================================
    // Smooth Scroll for Anchor Links
    // ===================================
    class SmoothScroll {
        constructor() {
            this.init();
        }

        init() {
            document.querySelectorAll('a[href^="#"]').forEach(anchor => {
                anchor.addEventListener('click', (e) => {
                    const href = anchor.getAttribute('href');
                    if (href === '#') return;
                    e.preventDefault();
                    const target = document.querySelector(href);
                    if (target) {
                        const offset = 80;
                        const targetPosition = target.offsetTop - offset;
                        window.scrollTo({
                            top: targetPosition,
                            behavior: 'smooth'
                        });
                    }
                });
            });
        }
    }

    class AnimationObserver {
        constructor() {
            this.observer = null;
            this.init();
        }

        init() {
            if ('IntersectionObserver' in window) {
                this.observer = new IntersectionObserver(
                    (entries) => {
                        entries.forEach(entry => {
                            if (entry.isIntersecting) {
                                entry.target.classList.add('fade-in');
                                this.observer.unobserve(entry.target);
                            }
                        });
                    },
                    { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
                );
                this.observeElements();
            }
        }

        observeElements() {
            const elements = document.querySelectorAll('.feature-card, .hero-visual-card, .step, .cta-content');
            elements.forEach(el => {
                el.style.opacity = '0';
                this.observer.observe(el);
            });
        }
    }

    class FormValidator {
        constructor() {
            this.forms = document.querySelectorAll('form[data-validate]');
            this.init();
        }

        init() {
            this.forms.forEach(form => {
                form.addEventListener('submit', (e) => this.handleSubmit(e, form));
            });
        }

        handleSubmit(e, form) {
            e.preventDefault();
            const inputs = form.querySelectorAll('input[required], textarea[required]');
            let isValid = true;
            inputs.forEach(input => {
                if (!this.validateInput(input)) isValid = false;
            });
            if (isValid) form.submit();
        }

        validateInput(input) {
            const value = input.value.trim();
            const type = input.type;
            this.clearError(input);
            if (value === '') {
                this.showError(input, 'This field is required');
                return false;
            }
            if (type === 'email' && !this.isValidEmail(value)) {
                this.showError(input, 'Please enter a valid email address');
                return false;
            }
            return true;
        }

        isValidEmail(email) {
            const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return re.test(email);
        }

        showError(input, message) {
            input.classList.add('error');
            const errorElement = document.createElement('span');
            errorElement.className = 'error-message';
            errorElement.textContent = message;
            input.parentElement.appendChild(errorElement);
        }

        clearError(input) {
            input.classList.remove('error');
            const errorMessage = input.parentElement.querySelector('.error-message');
            if (errorMessage) errorMessage.remove();
        }
    }

    class Analytics {
        static trackEvent(category, action, label = null, value = null) {
            if (typeof gtag !== 'undefined') {
                gtag('event', action, { event_category: category, event_label: label, value: value });
            }
        }
        static trackPageView(path) {
            if (typeof gtag !== 'undefined') {
                gtag('config', 'GA_MEASUREMENT_ID', { page_path: path });
            }
        }
    }

    class ClipboardManager {
        static copy(text, button = null) {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text)
                    .then(() => {
                        if (button) {
                            const originalText = button.textContent;
                            button.textContent = 'Copied!';
                            button.classList.add('success');
                            setTimeout(() => {
                                button.textContent = originalText;
                                button.classList.remove('success');
                            }, 2000);
                        }
                    })
                    .catch(err => console.error('Failed to copy:', err));
            } else {
                const textArea = document.createElement('textarea');
                textArea.value = text;
                textArea.style.position = 'fixed';
                textArea.style.left = '-9999px';
                document.body.appendChild(textArea);
                textArea.select();
                try {
                    document.execCommand('copy');
                    if (button) {
                        button.textContent = 'Copied!';
                        setTimeout(() => button.textContent = 'Copy', 2000);
                    }
                } catch (err) { console.error('Failed to copy:', err); }
                document.body.removeChild(textArea);
            }
        }
        static init() {
            document.querySelectorAll('[data-copy]').forEach(button => {
                button.addEventListener('click', () => {
                    const text = button.getAttribute('data-copy');
                    this.copy(text, button);
                });
            });
        }
    }

    function init() {
        new ThemeManager();
        new NavigationManager();
        new SmoothScroll();
        new AnimationObserver();
        new FormValidator();
        ClipboardManager.init();
        Analytics.trackPageView(window.location.pathname);
        document.body.classList.add('loaded');
    }

    window.ltth = { Analytics, ClipboardManager };

    class ScrollProgressBar {
        constructor() {
            this.createProgressBar();
            this.init();
        }
        createProgressBar() {
            const progressContainer = document.createElement('div');
            progressContainer.className = 'scroll-progress';
            progressContainer.innerHTML = '<div class="scroll-progress-bar"></div>';
            document.body.prepend(progressContainer);
            this.progressBar = progressContainer.querySelector('.scroll-progress-bar');
        }
        init() {
            window.addEventListener('scroll', () => this.updateProgress(), { passive: true });
            this.updateProgress();
        }
        updateProgress() {
            const windowHeight = window.innerHeight;
            const documentHeight = document.documentElement.scrollHeight;
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const scrollPercent = (scrollTop / (documentHeight - windowHeight)) * 100;
            this.progressBar.style.width = `${Math.min(scrollPercent, 100)}%`;
        }
    }

    class VersionBadgeManager {
        constructor() { this.init(); }
        async init() {
            try {
                const response = await fetch('/version.json');
                const data = await response.json();
                this.updateVersionBadges(data);
            } catch (error) { console.error('Failed to load version data:', error); }
        }
        updateVersionBadges(versionData) {
            const badges = document.querySelectorAll('[data-version-badge]');
            badges.forEach(badge => {
                badge.textContent = versionData.version;
                const statusClass = versionData.status || 'stable';
                badge.classList.add(`version-badge-${statusClass}`);
                const statusDot = document.createElement('span');
                statusDot.className = `version-badge-status ${statusClass}`;
                badge.prepend(statusDot);
            });
        }
    }

    class LiveSearch {
        constructor() {
            this.searchInput = document.getElementById('search-input');
            this.searchResults = document.getElementById('search-results');
            this.searchData = [];
            this.init();
        }
        async init() {
            if (!this.searchInput) return;
            await this.loadSearchIndex();
            this.searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));
            this.searchInput.addEventListener('focus', () => {
                if (this.searchInput.value) this.searchResults.classList.add('active');
            });
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.search-container')) this.searchResults.classList.remove('active');
            });
        }
        async loadSearchIndex() {
            const pages = [
                { title: 'Features', url: '/features.html', excerpt: 'Discover all features' },
                { title: 'Plugins', url: '/plugins.html', excerpt: 'Explore available plugins' },
                { title: 'Docs', url: '/docs.html', excerpt: 'Complete documentation' },
                { title: 'Download', url: '/download.html', excerpt: 'Download ltth.app' },
                { title: 'FAQ', url: '/faq.html', excerpt: 'Frequently asked questions' },
                { title: 'Support', url: '/support.html', excerpt: 'Get support' }
            ];
            this.searchData = pages;
        }
        handleSearch(query) {
            if (!query || query.length < 2) {
                this.searchResults.classList.remove('active');
                return;
            }
            const results = this.searchData.filter(item =>
                item.title.toLowerCase().includes(query.toLowerCase()) ||
                item.excerpt.toLowerCase().includes(query.toLowerCase())
            );
            this.displayResults(results, query);
        }
        displayResults(results, query) {
            if (results.length === 0) {
                this.searchResults.innerHTML = '<div class="search-no-results">No results found</div>';
                this.searchResults.classList.add('active');
                return;
            }
            const html = results.map(result => `
                <a href="${result.url}" class="search-result-item">
                    <div class="search-result-title">${this.highlightMatch(result.title, query)}</div>
                    <div class="search-result-excerpt">${this.highlightMatch(result.excerpt, query)}</div>
                </a>
            `).join('');
            this.searchResults.innerHTML = html;
            this.searchResults.classList.add('active');
        }
        highlightMatch(text, query) {
            const regex = new RegExp(`(${query})`, 'gi');
            return text.replace(regex, '<mark>$1</mark>');
        }
    }

    class ChangelogRenderer {
        constructor() {
            this.container = document.getElementById('changelog-container');
            this.init();
        }
        async init() {
            if (!this.container) return;
            try {
                const response = await fetch('/version.json');
                const data = await response.json();
                this.renderChangelog(data.changelog);
            } catch (error) { console.error('Failed to load changelog:', error); }
        }
        renderChangelog(changelog) {
            const entries = Object.entries(changelog).map(([version, data]) => {
                const changes = data.changes.map(change => `<li>${change}</li>`).join('');
                return `
                    <div class="changelog-entry">
                        <div class="changelog-header">
                            <h3 class="changelog-version">v${version}</h3>
                            <span class="changelog-date">${data.date}</span>
                        </div>
                        <ul class="changelog-changes">${changes}</ul>
                    </div>
                `;
            }).join('');
            this.container.innerHTML = entries;
        }
    }

    class LanguageManager {
        constructor() {
            this.currentLang = localStorage.getItem('language') || (navigator.language.startsWith('de') ? 'de' : 'en');
            this.translations = this.getTranslations();
            this.init();
        }
        init() {
            document.documentElement.setAttribute('lang', this.currentLang);
            this.setupEventListeners();
            this.updatePageContent();
        }
        setupEventListeners() {
            const langToggle = document.getElementById('langToggle');
            if (langToggle) langToggle.addEventListener('click', () => {
                const newLang = this.currentLang === 'de' ? 'en' : 'de';
                this.currentLang = newLang;
                localStorage.setItem('language', newLang);
                this.init();
            });
        }
        updatePageContent() {
            document.querySelectorAll('[data-i18n]').forEach(element => {
                const translation = this.getTranslation(element.getAttribute('data-i18n'));
                if (translation) {
                    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') element.placeholder = translation;
                    else element.textContent = translation;
                }
            });
            document.querySelectorAll('[data-i18n-html]').forEach(element => {
                const translation = this.getTranslation(element.getAttribute('data-i18n-html'));
                if (translation) element.innerHTML = translation;
            });
            const langToggle = document.getElementById('langToggle');
            if (langToggle) {
                const langText = langToggle.querySelector('.lang-text');
                if (langText) langText.textContent = this.currentLang === 'de' ? 'EN' : 'DE';
            }
        }
        getTranslation(key) {
            const keys = key.split('.');
            let value = this.translations[this.currentLang];
            for (const k of keys) {
                if (value && value[k]) value = value[k];
                else return null;
            }
            return value;
        }
        getTranslations() {
            return {
                de: { nav: { home: 'Home', features: 'Features', download: 'Download' } },
                en: { nav: { home: 'Home', features: 'Features', download: 'Download' } }
            };
        }
    }

    class BetaNoticeManager {
        constructor() {
            this.betaNotice = document.getElementById('betaNotice');
            this.betaClose = document.getElementById('betaClose');
            this.init();
        }
        init() {
            if (localStorage.getItem('betaNoticeDismissed') === 'true' && this.betaNotice) this.betaNotice.classList.add('hidden');
            if (this.betaClose) this.betaClose.addEventListener('click', () => {
                localStorage.setItem('betaNoticeDismissed', 'true');
                if (this.betaNotice) this.betaNotice.classList.add('hidden');
            });
        }
    }

    // Guard to ensure enhanced managers are created exactly once.
    let isEnhancedInitialized = false;
    const enhancedManagers = {};
    function initEnhanced() {
        if (isEnhancedInitialized) return;
        isEnhancedInitialized = true;
        enhancedManagers.scrollProgressBar = new ScrollProgressBar();
        enhancedManagers.versionBadgeManager = new VersionBadgeManager();
        enhancedManagers.liveSearch = new LiveSearch();
        enhancedManagers.changelogRenderer = new ChangelogRenderer();
        enhancedManagers.languageManager = new LanguageManager();
        enhancedManagers.betaNoticeManager = new BetaNoticeManager();
        window.ltth = window.ltth || {};
        window.ltth.enhancedManagers = enhancedManagers;
    }

    function initApp() {
        init();
        const hasInjectedLayout = !!document.querySelector('#site-header[data-ltth-injected]');
        if (hasInjectedLayout) {
            initEnhanced();
        } else {
            // layoutReady is dispatched after shared layout injection completes.
            document.addEventListener('layoutReady', initEnhanced, { once: true });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        initApp();
    }
})();
