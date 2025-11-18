/**
 * PupCid's Little TikTok Helper - ltth.app
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
                themeToggle.addEventListener('click', () => this.toggleTheme());
            }

            // Listen for system theme changes
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
            this.navToggle = document.getElementById('navToggle');
            this.navMenu = document.getElementById('navMenu');
            this.navbar = document.getElementById('navbar');
            this.isMenuOpen = false;
            this.init();
        }

        init() {
            this.setupEventListeners();
            this.setActiveLink();
            this.setupScrollBehavior();
        }

        setupEventListeners() {
            if (this.navToggle) {
                this.navToggle.addEventListener('click', () => this.toggleMenu());
            }

            // Close menu when clicking outside
            document.addEventListener('click', (e) => {
                if (this.isMenuOpen && 
                    !this.navMenu.contains(e.target) && 
                    !this.navToggle.contains(e.target)) {
                    this.closeMenu();
                }
            });

            // Close menu when pressing Escape
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.isMenuOpen) {
                    this.closeMenu();
                }
            });

            // Close menu when clicking on a link
            const navLinks = this.navMenu.querySelectorAll('.nav-link');
            navLinks.forEach(link => {
                link.addEventListener('click', () => {
                    if (window.innerWidth < 768) {
                        this.closeMenu();
                    }
                });
            });
        }

        toggleMenu() {
            this.isMenuOpen = !this.isMenuOpen;
            this.navMenu.classList.toggle('active', this.isMenuOpen);
            this.navToggle.classList.toggle('active', this.isMenuOpen);
            
            // Prevent body scroll when menu is open on mobile
            if (this.isMenuOpen) {
                document.body.style.overflow = 'hidden';
            } else {
                document.body.style.overflow = '';
            }
        }

        closeMenu() {
            this.isMenuOpen = false;
            this.navMenu.classList.remove('active');
            this.navToggle.classList.remove('active');
            document.body.style.overflow = '';
        }

        setActiveLink() {
            const currentPath = window.location.pathname;
            const navLinks = document.querySelectorAll('.nav-link');
            
            navLinks.forEach(link => {
                const linkPath = new URL(link.href).pathname;
                if (linkPath === currentPath || (currentPath === '/' && linkPath === '/index.html')) {
                    link.classList.add('active');
                } else {
                    link.classList.remove('active');
                }
            });
        }

        setupScrollBehavior() {
            let lastScroll = 0;
            const scrollThreshold = 10;

            window.addEventListener('scroll', () => {
                const currentScroll = window.pageYOffset;

                // Add shadow when scrolled
                if (currentScroll > 10) {
                    this.navbar.style.boxShadow = 'var(--shadow-md)';
                } else {
                    this.navbar.style.boxShadow = 'none';
                }

                lastScroll = currentScroll;
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
                        const offset = 80; // Account for fixed navbar
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

    // ===================================
    // Intersection Observer for Animations
    // ===================================
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
                    {
                        threshold: 0.1,
                        rootMargin: '0px 0px -50px 0px'
                    }
                );

                this.observeElements();
            }
        }

        observeElements() {
            const elements = document.querySelectorAll(
                '.feature-card, .hero-visual-card, .step, .cta-content'
            );
            
            elements.forEach(el => {
                el.style.opacity = '0';
                this.observer.observe(el);
            });
        }
    }

    // ===================================
    // Form Validation
    // ===================================
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
                if (!this.validateInput(input)) {
                    isValid = false;
                }
            });

            if (isValid) {
                // Form is valid, proceed with submission
                form.submit();
            }
        }

        validateInput(input) {
            const value = input.value.trim();
            const type = input.type;
            let isValid = true;

            // Clear previous errors
            this.clearError(input);

            if (value === '') {
                this.showError(input, 'This field is required');
                return false;
            }

            if (type === 'email' && !this.isValidEmail(value)) {
                this.showError(input, 'Please enter a valid email address');
                return false;
            }

            return isValid;
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
            if (errorMessage) {
                errorMessage.remove();
            }
        }
    }

    // ===================================
    // Service Worker Registration (PWA)
    // ===================================
    class ServiceWorkerManager {
        constructor() {
            this.init();
        }

        init() {
            if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                    navigator.serviceWorker.register('/sw.js')
                        .then(registration => {
                            console.log('ServiceWorker registered:', registration);
                        })
                        .catch(error => {
                            console.log('ServiceWorker registration failed:', error);
                        });
                });
            }
        }
    }

    // ===================================
    // Analytics Helper
    // ===================================
    class Analytics {
        static trackEvent(category, action, label = null, value = null) {
            if (typeof gtag !== 'undefined') {
                gtag('event', action, {
                    event_category: category,
                    event_label: label,
                    value: value
                });
            }
        }

        static trackPageView(path) {
            if (typeof gtag !== 'undefined') {
                gtag('config', 'GA_MEASUREMENT_ID', {
                    page_path: path
                });
            }
        }
    }

    // ===================================
    // Copy to Clipboard
    // ===================================
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
                    .catch(err => {
                        console.error('Failed to copy:', err);
                    });
            } else {
                // Fallback for older browsers
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
                        setTimeout(() => {
                            button.textContent = 'Copy';
                        }, 2000);
                    }
                } catch (err) {
                    console.error('Failed to copy:', err);
                }
                
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

    // ===================================
    // Initialize Everything
    // ===================================
    function init() {
        // Initialize core components
        new ThemeManager();
        new NavigationManager();
        new SmoothScroll();
        new AnimationObserver();
        new FormValidator();
        ClipboardManager.init();
        
        // Optional: Initialize PWA (uncomment to enable)
        // new ServiceWorkerManager();

        // Track initial page view
        Analytics.trackPageView(window.location.pathname);

        // Add loaded class to body
        document.body.classList.add('loaded');
    }

    // ===================================
    // Wait for DOM to be ready
    // ===================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ===================================
    // Export for external use
    // ===================================
    window.ltth = {
        Analytics,
        ClipboardManager
    };

})();

    // ===================================
    // Scroll Progress Bar
    // ===================================
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

    // ===================================
    // Version Badge Manager
    // ===================================
    class VersionBadgeManager {
        constructor() {
            this.init();
        }

        async init() {
            try {
                const response = await fetch('/version.json');
                const data = await response.json();
                this.updateVersionBadges(data);
            } catch (error) {
                console.error('Failed to load version data:', error);
            }
        }

        updateVersionBadges(versionData) {
            const badges = document.querySelectorAll('[data-version-badge]');
            badges.forEach(badge => {
                badge.textContent = versionData.version;
                
                // Add status indicator
                const statusClass = versionData.status || 'stable';
                badge.classList.add(`version-badge-${statusClass}`);
                
                // Create status dot
                const statusDot = document.createElement('span');
                statusDot.className = `version-badge-status ${statusClass}`;
                badge.prepend(statusDot);
            });
        }
    }

    // ===================================
    // Live Search Functionality
    // ===================================
    class LiveSearch {
        constructor() {
            this.searchInput = document.getElementById('search-input');
            this.searchResults = document.getElementById('search-results');
            this.searchData = [];
            this.init();
        }

        async init() {
            if (!this.searchInput) return;

            // Load search index
            await this.loadSearchIndex();

            // Setup event listeners
            this.searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));
            this.searchInput.addEventListener('focus', () => {
                if (this.searchInput.value) {
                    this.searchResults.classList.add('active');
                }
            });

            // Close search results when clicking outside
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.search-container')) {
                    this.searchResults.classList.remove('active');
                }
            });
        }

        async loadSearchIndex() {
            // In a real implementation, this would load from a search index JSON
            // For now, we'll create a simple in-memory index
            const pages = [
                { title: 'Features', url: '/features.html', excerpt: 'Discover all features of ltth.app' },
                { title: 'Plugins', url: '/plugins.html', excerpt: 'Explore available plugins' },
                { title: 'Documentation', url: '/docs.html', excerpt: 'Complete documentation' },
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

    // ===================================
    // Enhanced Theme Switcher (with Monochrome)
    // ===================================
    class EnhancedThemeManager extends ThemeManager {
        constructor() {
            super();
            this.themes = ['light', 'dark', 'system', 'monochrome'];
        }

        setTheme(theme) {
            if (theme === 'system') {
                const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                theme = prefersDark ? 'dark' : 'light';
            }
            
            this.theme = theme;
            document.documentElement.setAttribute('data-theme', theme);
            localStorage.setItem('theme', theme);
        }

        setupEventListeners() {
            super.setupEventListeners();

            // Add keyboard shortcut for theme toggle (Ctrl/Cmd + Shift + T)
            document.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'T') {
                    e.preventDefault();
                    this.cycleTheme();
                }
            });
        }

        cycleTheme() {
            const currentIndex = this.themes.indexOf(this.theme);
            const nextIndex = (currentIndex + 1) % this.themes.length;
            this.setTheme(this.themes[nextIndex]);
        }
    }

    // ===================================
    // Changelog Renderer
    // ===================================
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
            } catch (error) {
                console.error('Failed to load changelog:', error);
            }
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
                        <ul class="changelog-changes">
                            ${changes}
                        </ul>
                    </div>
                `;
            }).join('');

            this.container.innerHTML = entries;
        }
    }

    // ===================================
    // Performance Monitor
    // ===================================
    class PerformanceMonitor {
        constructor() {
            this.init();
        }

        init() {
            if ('PerformanceObserver' in window) {
                // Monitor Largest Contentful Paint
                const lcpObserver = new PerformanceObserver((entryList) => {
                    const entries = entryList.getEntries();
                    const lastEntry = entries[entries.length - 1];
                    console.log('LCP:', lastEntry.renderTime || lastEntry.loadTime);
                });
                lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });

                // Monitor First Input Delay
                const fidObserver = new PerformanceObserver((entryList) => {
                    const entries = entryList.getEntries();
                    entries.forEach(entry => {
                        console.log('FID:', entry.processingStart - entry.startTime);
                    });
                });
                fidObserver.observe({ entryTypes: ['first-input'] });

                // Monitor Cumulative Layout Shift
                let clsScore = 0;
                const clsObserver = new PerformanceObserver((entryList) => {
                    for (const entry of entryList.getEntries()) {
                        if (!entry.hadRecentInput) {
                            clsScore += entry.value;
                            console.log('CLS:', clsScore);
                        }
                    }
                });
                clsObserver.observe({ entryTypes: ['layout-shift'] });
            }

            // Report Web Vitals on page unload
            window.addEventListener('beforeunload', () => {
                if (navigator.sendBeacon) {
                    const vitals = this.collectVitals();
                    // In production, send to analytics endpoint
                    console.log('Web Vitals:', vitals);
                }
            });
        }

        collectVitals() {
            const navigation = performance.getEntriesByType('navigation')[0];
            return {
                dns: navigation.domainLookupEnd - navigation.domainLookupStart,
                tcp: navigation.connectEnd - navigation.connectStart,
                ttfb: navigation.responseStart - navigation.requestStart,
                download: navigation.responseEnd - navigation.responseStart,
                domInteractive: navigation.domInteractive - navigation.fetchStart,
                domComplete: navigation.domComplete - navigation.fetchStart,
                loadComplete: navigation.loadEventEnd - navigation.fetchStart
            };
        }
    }

    // ===================================
    // Lazy Image Loading
    // ===================================
    class LazyImageLoader {
        constructor() {
            this.images = document.querySelectorAll('img[data-src]');
            this.init();
        }

        init() {
            if ('IntersectionObserver' in window) {
                const imageObserver = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            this.loadImage(entry.target);
                            imageObserver.unobserve(entry.target);
                        }
                    });
                });

                this.images.forEach(img => imageObserver.observe(img));
            } else {
                // Fallback for browsers without IntersectionObserver
                this.images.forEach(img => this.loadImage(img));
            }
        }

        loadImage(img) {
            img.src = img.dataset.src;
            img.removeAttribute('data-src');
            img.classList.add('loaded');
        }
    }

    // ===================================
    // Accessibility Announcer
    // ===================================
    class AccessibilityAnnouncer {
        constructor() {
            this.createAnnouncer();
        }

        createAnnouncer() {
            const announcer = document.createElement('div');
            announcer.id = 'a11y-announcer';
            announcer.className = 'sr-only';
            announcer.setAttribute('role', 'status');
            announcer.setAttribute('aria-live', 'polite');
            announcer.setAttribute('aria-atomic', 'true');
            document.body.appendChild(announcer);
            this.announcer = announcer;
        }

        announce(message, priority = 'polite') {
            this.announcer.setAttribute('aria-live', priority);
            this.announcer.textContent = message;
            
            // Clear after announcement
            setTimeout(() => {
                this.announcer.textContent = '';
            }, 1000);
        }
    }

    // ===================================
    // Initialize Enhanced Features
    // ===================================
    function initEnhanced() {
        // Initialize all enhanced features
        new ScrollProgressBar();
        new VersionBadgeManager();
        new LiveSearch();
        new ChangelogRenderer();
        new LazyImageLoader();
        new AccessibilityAnnouncer();
        
        // Optional: Performance monitoring (disable in production)
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            new PerformanceMonitor();
        }

        // Export enhanced theme manager globally
        window.ltth.themeManager = new EnhancedThemeManager();
    }

    // Add enhanced initialization to the existing init
    const originalInit = init;
    init = function() {
        originalInit();
        initEnhanced();
    };

})();
