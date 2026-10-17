/**
 * Theme Manager
 * Handles theme switching and persistence
 * Brand palette: green, off-white, and violet.
 */

class ThemeManager {
    constructor() {
        this.currentTheme = 'cid'; // Default theme for new installations
        this.monitoredIframes = new WeakSet(); // Track iframes to avoid duplicate listeners
        this.themes = {
            'vision-impaired': {
                name: 'Vision Impaired',
                icon: 'accessibility',
                description: 'Large text and extreme contrast',
                badge: 'Accessibility',
                swatches: ['#ffffff', '#fbbf24', '#000000']
            },
            cid: {
                name: 'Cid',
                icon: 'sparkles',
                description: 'Green-tinted dark brand theme with off-white and violet accents',
                badge: 'Brand',
                swatches: ['#4ade80', '#f5f7f2', '#7c3aed']
            },
            night: {
                name: 'Night Mode',
                icon: 'moon',
                description: 'Dark brand theme with green and violet accents',
                swatches: ['#4ade80', '#f5f7f2', '#7c3aed']
            },
            day: {
                name: 'Day Mode',
                icon: 'sun',
                description: 'Light brand theme with green and violet accents',
                swatches: ['#166534', '#ffffff', '#7c3aed']
            },
            contrast: {
                name: 'High Contrast',
                icon: 'eye',
                description: 'Legacy high contrast',
                badge: 'Legacy',
                swatches: ['#000000', '#fbbf24', '#ffffff']
            }
        };
        
        this.init();
    }

    init() {
        // Load saved theme from localStorage
        const savedTheme = localStorage.getItem('dashboard-theme');
        if (savedTheme && this.themes[savedTheme]) {
            this.currentTheme = savedTheme;
        }

        // Apply theme immediately
        this.applyTheme(this.currentTheme);

        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupUI());
        } else {
            this.setupUI();
        }
    }

    setupUI() {
        this.createThemeToggle();
        this.attachEventListeners();
        this.setupIframeMonitoring();
        this.registerLocaleListeners();
        this.updateThemeToggleLabels();
    }

    getThemeTranslation(themeKey, field) {
        const key = `theme.selector.options.${themeKey}.${field}`;
        const translated = window.i18n?.t?.(key);
        return translated && translated !== key ? translated : this.themes[themeKey][field];
    }

    getThemeSelectorTitle() {
        const key = 'theme.selector.title';
        const translated = window.i18n?.t?.(key);
        return translated && translated !== key ? translated : 'Change theme';
    }

    registerLocaleListeners() {
        const i18n = window.i18n;
        if (!i18n) return;

        const refresh = () => this.updateThemeToggleLabels();
        if (typeof i18n.onLanguageChange === 'function') i18n.onLanguageChange(refresh);
        if (typeof i18n.onChange === 'function') i18n.onChange(refresh);
        if (i18n.ready && typeof i18n.ready.then === 'function') i18n.ready.then(refresh);
    }

    updateThemeToggleLabels() {
        const toggleBtn = document.getElementById('theme-toggle-btn');
        if (toggleBtn) {
            const selectorTitle = this.getThemeSelectorTitle();
            toggleBtn.title = selectorTitle;
            toggleBtn.setAttribute('aria-label', selectorTitle);
            const label = toggleBtn.querySelector('.theme-toggle-label');
            if (label) label.textContent = this.getThemeTranslation(this.currentTheme, 'name');
        }

        document.querySelectorAll('.theme-option').forEach((option) => {
            const themeKey = option.dataset.themeOption;
            const theme = this.themes[themeKey];
            if (!theme) return;

            const name = option.querySelector('.theme-option-name-text');
            const description = option.querySelector('.theme-option-description');
            const badge = option.querySelector('.theme-option-badge');
            if (name) name.textContent = this.getThemeTranslation(themeKey, 'name');
            if (description) description.textContent = this.getThemeTranslation(themeKey, 'description');
            if (badge && theme.badge) badge.textContent = this.getThemeTranslation(themeKey, 'badge');
        });

        const dropdown = document.getElementById('theme-dropdown');
        if (dropdown) dropdown.setAttribute('aria-label', this.getThemeSelectorTitle());
    }

    updateThemeSelection(theme) {
        document.querySelectorAll('.theme-option').forEach((option) => {
            const selected = option.dataset.themeOption === theme;
            option.classList.toggle('active', selected);
            option.setAttribute('aria-checked', String(selected));
            option.tabIndex = selected ? 0 : -1;
        });
    }

    setThemeDropdownOpen(open, restoreFocus = false) {
        const toggleBtn = document.getElementById('theme-toggle-btn');
        const dropdown = document.getElementById('theme-dropdown');
        if (!toggleBtn || !dropdown) return;

        dropdown.classList.toggle('show', open);
        toggleBtn.setAttribute('aria-expanded', String(open));
        if (open) {
            const selected = dropdown.querySelector('.theme-option[aria-checked="true"]');
            if (selected) {
                // Resolve the newly visible popup before moving focus into it.
                selected.getBoundingClientRect();
                selected.focus();
            }
        } else if (restoreFocus) {
            toggleBtn.focus();
        }
    }

    selectThemeOption(option) {
        const theme = option?.dataset.themeOption;
        if (!theme || !this.themes[theme]) return;

        this.setTheme(theme);
        this.setThemeDropdownOpen(false, true);
    }

    handleThemeOptionKeydown(event, option) {
        const options = [...document.querySelectorAll('#theme-dropdown .theme-option')];
        const currentIndex = options.indexOf(option);
        if (currentIndex < 0 || options.length === 0) return;

        let nextIndex = currentIndex;
        switch (event.key) {
            case 'ArrowDown':
            case 'ArrowRight':
                nextIndex = (currentIndex + 1) % options.length;
                break;
            case 'ArrowUp':
            case 'ArrowLeft':
                nextIndex = (currentIndex - 1 + options.length) % options.length;
                break;
            case 'Home':
                nextIndex = 0;
                break;
            case 'End':
                nextIndex = options.length - 1;
                break;
            case 'Enter':
            case ' ':
            case 'Spacebar':
                event.preventDefault();
                this.selectThemeOption(option);
                return;
            case 'Escape':
                event.preventDefault();
                this.setThemeDropdownOpen(false, true);
                return;
            default:
                return;
        }

        event.preventDefault();
        const nextOption = options[nextIndex];
        this.setTheme(nextOption.dataset.themeOption);
        nextOption.focus();
    }

    setupIframeMonitoring() {
        // Monitor for iframe load events
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.tagName === 'IFRAME') {
                        this.monitorIframeLoad(node);
                    } else if (node.nodeType === Node.ELEMENT_NODE) {
                        node.querySelectorAll('iframe').forEach((iframe) => {
                            this.monitorIframeLoad(iframe);
                        });
                    }
                });
            });
        });

        const observeRoot = document.documentElement || document.body;
        if (!observeRoot) {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.setupIframeMonitoring(), { once: true });
            }
            return;
        }

        observer.observe(observeRoot, {
            childList: true,
            subtree: true
        });

        // Apply theme to existing iframes when they load
        document.querySelectorAll('iframe').forEach((iframe) => {
            this.monitorIframeLoad(iframe);
        });
    }

    monitorIframeLoad(iframe) {
        // Skip if already monitoring this iframe
        if (this.monitoredIframes.has(iframe)) {
            return;
        }
        this.monitoredIframes.add(iframe);

        // Apply theme immediately if already loaded
        try {
            if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
                this.applyThemeToDocument(iframe.contentDocument, this.currentTheme);
                // Also apply to nested iframes within this iframe
                this.applyThemeToIframesInDoc(iframe.contentDocument, this.currentTheme);
            }
        } catch (e) {
            // Ignore cross-origin errors
            console.debug('Cannot apply theme to iframe (cross-origin):', e.message);
        }

        // Listen for load event
        iframe.addEventListener('load', () => {
            try {
                if (iframe.contentDocument) {
                    this.applyThemeToDocument(iframe.contentDocument, this.currentTheme);
                    // Also apply to nested iframes within this iframe
                    this.applyThemeToIframesInDoc(iframe.contentDocument, this.currentTheme);
                }
            } catch (e) {
                // Ignore cross-origin errors
                console.debug('Cannot apply theme to loaded iframe:', e.message);
            }
        });
    }

    /**
     * Apply theme to all iframes within a specific document (non-recursive helper)
     */
    applyThemeToIframesInDoc(doc, theme) {
        const iframes = doc.querySelectorAll('iframe');
        iframes.forEach(iframe => {
            try {
                if (iframe.contentDocument && iframe.contentDocument.documentElement) {
                    this.applyThemeToDocument(iframe.contentDocument, theme);
                }
            } catch (e) {
                // Ignore cross-origin iframes
            }
        });
    }

    createThemeToggle() {
        // Find the topbar-right container
        const topbarRight = document.querySelector('.topbar-right');
        if (!topbarRight) {
            console.debug('Theme toggle not created: topbar-right container not found (this is normal for overlay pages)');
            return;
        }

        // Create theme toggle button container
        const themeToggleContainer = document.createElement('div');
        themeToggleContainer.style.position = 'relative';
        themeToggleContainer.innerHTML = `
            <button id="theme-toggle-btn" class="theme-toggle-btn" title="Change theme" aria-label="Change theme" aria-controls="theme-dropdown" aria-expanded="false">
                <span class="theme-toggle-icon-wrap">
                    <i data-lucide="${this.themes[this.currentTheme].icon}"></i>
                </span>
                <span class="theme-toggle-label">${this.themes[this.currentTheme].name}</span>
            </button>
            <div id="theme-dropdown" class="theme-dropdown" role="radiogroup" aria-label="Change theme">
                ${Object.entries(this.themes).map(([key, theme]) => `
                    <button type="button" role="radio" aria-checked="${key === this.currentTheme}" tabindex="${key === this.currentTheme ? '0' : '-1'}" class="theme-option ${key === this.currentTheme ? 'active' : ''}" data-theme-option="${key}">
                        <span class="theme-option-preview" aria-hidden="true">
                            <span style="background:${theme.swatches?.[0] || 'var(--brand-primary)'}"></span>
                            <span style="background:${theme.swatches?.[1] || 'var(--color-accent-primary)'}"></span>
                            <span style="background:${theme.swatches?.[2] || 'var(--color-accent-secondary)'}"></span>
                        </span>
                        <span class="theme-option-icon" aria-hidden="true">
                            <i data-lucide="${theme.icon}"></i>
                        </span>
                        <span class="theme-option-content">
                            <span class="theme-option-name">
                                <span class="theme-option-name-text">${theme.name}</span>
                                ${theme.badge ? `<span class="theme-option-badge">${theme.badge}</span>` : ''}
                            </span>
                            <span class="theme-option-description">${theme.description}</span>
                        </span>
                        <i data-lucide="check" class="theme-option-check" aria-hidden="true"></i>
                    </button>
                `).join('')}
            </div>
        `;

        // Insert before settings button
        const settingsBtn = document.getElementById('topbar-settings-btn');
        if (settingsBtn) {
            topbarRight.insertBefore(themeToggleContainer, settingsBtn);
        } else {
            topbarRight.appendChild(themeToggleContainer);
        }

        // Initialize Lucide icons for the new elements
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    attachEventListeners() {
        const toggleBtn = document.getElementById('theme-toggle-btn');
        const dropdown = document.getElementById('theme-dropdown');

        if (!toggleBtn || !dropdown) return;

        // Toggle dropdown
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.setThemeDropdownOpen(!dropdown.classList.contains('show'));
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!toggleBtn.contains(e.target) && !dropdown.contains(e.target)) {
                this.setThemeDropdownOpen(false);
            }
        });

        document.addEventListener('focusin', (e) => {
            if (dropdown.classList.contains('show') && !dropdown.contains(e.target)) {
                this.setThemeDropdownOpen(false);
            }
        });

        // Theme option clicks
        const themeOptions = dropdown.querySelectorAll('.theme-option');
        themeOptions.forEach(option => {
            option.addEventListener('click', () => this.selectThemeOption(option));
            option.addEventListener('keydown', (event) => this.handleThemeOptionKeydown(event, option));
        });
    }

    setTheme(theme) {
        if (!this.themes[theme]) {
            console.warn('Unknown theme:', theme);
            return;
        }

        this.currentTheme = theme;
        this.applyTheme(theme);
        this.saveTheme(theme);
        this.updateUI(theme);
    }

    applyTheme(theme) {
        // Apply theme to main document
        this.applyThemeToDocument(document, theme);

        // Apply theme to all iframes
        this.applyThemeToIframes(theme);

        // Update sidebar logo based on theme
        this.updateSidebarLogo(theme);
    }

    updateSidebarLogo(theme) {
        const wideLogo = document.querySelector('.sidebar-logo-wide');
        const miniIcon = document.getElementById('sidebar-mini-icon');

        if (wideLogo) {
            wideLogo.src = '/logo-wide.png';
        }
        if (miniIcon) {
            miniIcon.src = '/ltthicon-cutout.png?v=6';
        }
    }

    applyThemeToDocument(doc, theme) {
        // Remove all theme classes
        doc.documentElement.setAttribute('data-theme', theme);
    }

    applyThemeToIframes(theme) {
        // Find all iframes recursively
        const applyToAllIframes = (rootDoc) => {
            const iframes = rootDoc.querySelectorAll('iframe');
            
            iframes.forEach(iframe => {
                try {
                    // Check if iframe is loaded and accessible
                    if (iframe.contentDocument && iframe.contentDocument.documentElement) {
                        this.applyThemeToDocument(iframe.contentDocument, theme);
                        // Recurse into nested iframes
                        applyToAllIframes(iframe.contentDocument);
                    }
                } catch (e) {
                    // Ignore cross-origin iframes
                    console.debug('Cannot apply theme to iframe:', e.message);
                }
            });
        };

        applyToAllIframes(document);
    }

    saveTheme(theme) {
        localStorage.setItem('dashboard-theme', theme);
    }

    updateUI(theme) {
        // Update toggle button icon
        const toggleBtn = document.getElementById('theme-toggle-btn');
        if (toggleBtn) {
            const icon = toggleBtn.querySelector('i');
            const label = toggleBtn.querySelector('.theme-toggle-label');
            if (icon) {
                icon.setAttribute('data-lucide', this.themes[theme].icon);
            }
            if (label) {
                label.textContent = this.getThemeTranslation(theme, 'name');
            }
            if (window.lucide) {
                window.lucide.createIcons();
            }
        }

        this.updateThemeSelection(theme);
        this.updateThemeToggleLabels();
    }

    getCurrentTheme() {
        return this.currentTheme;
    }
}

// Initialize theme manager
const themeManager = new ThemeManager();
