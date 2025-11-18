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
