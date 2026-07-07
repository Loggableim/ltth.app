/**
 * Theme Manager
 * Handles theme switching and persistence
 * Corporate branding color: #12a116
 */

class ThemeManager {
    constructor() {
        this.currentTheme = 'night'; // Default theme
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
                description: 'Pup Cid inspired green-on-black brand mode',
                badge: 'Brand',
                swatches: ['#4ade80', '#12a116', '#000000']
            },
            night: {
                name: 'Night Mode',
                icon: 'moon',
                description: 'Legacy dark theme',
                swatches: ['#3b82f6', '#8b5cf6', '#12a116']
            },
            day: {
                name: 'Day Mode',
                icon: 'sun',
                description: 'Bright light theme',
                swatches: ['#ffffff', '#2563eb', '#12a116']
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
            <button id="theme-toggle-btn" class="theme-toggle-btn" title="Change theme" aria-haspopup="menu" aria-expanded="false">
                <span class="theme-toggle-icon-wrap">
                    <i data-lucide="${this.themes[this.currentTheme].icon}"></i>
                </span>
                <span class="theme-toggle-label">${this.themes[this.currentTheme].name}</span>
            </button>
            <div id="theme-dropdown" class="theme-dropdown">
                ${Object.entries(this.themes).map(([key, theme]) => `
                    <div class="theme-option ${key === this.currentTheme ? 'active' : ''}" data-theme="${key}">
                        <div class="theme-option-preview" aria-hidden="true">
                            <span style="background:${theme.swatches?.[0] || 'var(--brand-primary)'}"></span>
                            <span style="background:${theme.swatches?.[1] || 'var(--color-accent-primary)'}"></span>
                            <span style="background:${theme.swatches?.[2] || 'var(--color-accent-secondary)'}"></span>
                        </div>
                        <div class="theme-option-icon">
                            <i data-lucide="${theme.icon}"></i>
                        </div>
                        <div class="theme-option-content">
                            <div class="theme-option-name">
                                ${theme.name}
                                ${theme.badge ? `<span class="theme-option-badge">${theme.badge}</span>` : ''}
                            </div>
                            <div class="theme-option-description">${theme.description}</div>
                        </div>
                        <i data-lucide="check" class="theme-option-check"></i>
                    </div>
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
            dropdown.classList.toggle('show');
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!toggleBtn.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.remove('show');
            }
        });

        // Theme option clicks
        const themeOptions = dropdown.querySelectorAll('.theme-option');
        themeOptions.forEach(option => {
            option.addEventListener('click', () => {
                const theme = option.dataset.theme;
                this.setTheme(theme);
                dropdown.classList.remove('show');
            });
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
                label.textContent = this.themes[theme].name;
            }
            if (window.lucide) {
                window.lucide.createIcons();
            }
        }

        // Update active state in dropdown
        const themeOptions = document.querySelectorAll('.theme-option');
        themeOptions.forEach(option => {
            if (option.dataset.theme === theme) {
                option.classList.add('active');
            } else {
                option.classList.remove('active');
            }
        });
    }

    getCurrentTheme() {
        return this.currentTheme;
    }
}

// Initialize theme manager
const themeManager = new ThemeManager();
