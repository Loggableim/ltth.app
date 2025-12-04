/**
 * Theme Manager
 * Handles day/night/high contrast theme switching
 * Corporate branding color: #12a116
 */

class ThemeManager {
    constructor() {
        this.currentTheme = 'night'; // Default theme
        this.monitoredIframes = new WeakSet(); // Track iframes to avoid duplicate listeners
        this.themes = {
            night: {
                name: 'Night Mode',
                icon: 'moon',
                description: 'Dark theme (default)'
            },
            day: {
                name: 'Day Mode',
                icon: 'sun',
                description: 'Light theme'
            },
            contrast: {
                name: 'High Contrast',
                icon: 'eye',
                description: 'For vision impaired'
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

        observer.observe(document.body, {
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
                }
            } catch (e) {
                // Ignore cross-origin errors
                console.debug('Cannot apply theme to loaded iframe:', e.message);
            }
        });
    }

    createThemeToggle() {
        // Find the topbar-right container
        const topbarRight = document.querySelector('.topbar-right');
        if (!topbarRight) {
            console.warn('Topbar-right container not found');
            return;
        }

        // Create theme toggle button container
        const themeToggleContainer = document.createElement('div');
        themeToggleContainer.style.position = 'relative';
        themeToggleContainer.innerHTML = `
            <button id="theme-toggle-btn" class="theme-toggle-btn" title="Change theme">
                <i data-lucide="${this.themes[this.currentTheme].icon}"></i>
            </button>
            <div id="theme-dropdown" class="theme-dropdown">
                ${Object.entries(this.themes).map(([key, theme]) => `
                    <div class="theme-option ${key === this.currentTheme ? 'active' : ''}" data-theme="${key}">
                        <div class="theme-option-icon">
                            <i data-lucide="${theme.icon}"></i>
                        </div>
                        <div class="theme-option-content">
                            <div class="theme-option-name">${theme.name}</div>
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
        const logoImg = document.getElementById('sidebar-logo-img');
        const miniIcon = document.getElementById('sidebar-mini-icon');
        
        if (logoImg) {
            // Day mode uses the daymode logo, night and contrast use the night-highcontrast logo
            if (theme === 'day') {
                logoImg.src = '/ltthlogo_daymode.png';
            } else {
                logoImg.src = '/ltthlogo_night-highcontrast-mode.png';
            }
        }
        
        if (miniIcon) {
            // Day mode uses the daymode mini icon, night and contrast use the night mini icon
            if (theme === 'day') {
                miniIcon.src = '/mini-icon-daymode.png';
            } else {
                miniIcon.src = '/mini-icon-night.png';
            }
        }
    }

    applyThemeToDocument(doc, theme) {
        // Remove all theme classes
        doc.documentElement.removeAttribute('data-theme');

        // Apply new theme (only for non-default)
        if (theme !== 'night') {
            doc.documentElement.setAttribute('data-theme', theme);
        }
    }

    applyThemeToIframes(theme) {
        // Find all iframes
        const iframes = document.querySelectorAll('iframe');
        
        iframes.forEach(iframe => {
            try {
                // Check if iframe is loaded and accessible
                if (iframe.contentDocument && iframe.contentDocument.documentElement) {
                    this.applyThemeToDocument(iframe.contentDocument, theme);
                }
            } catch (e) {
                // Ignore cross-origin iframes
                console.debug('Cannot apply theme to iframe:', e.message);
            }
        });
    }

    saveTheme(theme) {
        localStorage.setItem('dashboard-theme', theme);
    }

    updateUI(theme) {
        // Update toggle button icon
        const toggleBtn = document.getElementById('theme-toggle-btn');
        if (toggleBtn) {
            const icon = toggleBtn.querySelector('i');
            if (icon) {
                icon.setAttribute('data-lucide', this.themes[theme].icon);
                if (window.lucide) {
                    window.lucide.createIcons();
                }
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
