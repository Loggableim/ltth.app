/**
 * Language Switcher Component
 * Handles the flag dropdown in the top menu for changing language
 */

class LanguageSwitcher {
    constructor() {
        this.languageBtn = null;
        this.languageDropdown = null;
        this.currentFlag = null;
        
        // Flag mapping
        this.flags = {
            'en': '🇬🇧',
            'de': '🇩🇪',
            'es': '🇪🇸',
            'fr': '🇫🇷'
        };
        
        this.init();
    }

    init() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }
    }

    setup() {
        this.languageBtn = document.getElementById('language-btn');
        this.languageDropdown = document.getElementById('language-dropdown');
        this.currentFlag = document.getElementById('current-flag');
        
        if (!this.languageBtn || !this.languageDropdown) {
            console.warn('Language switcher elements not found');
            return;
        }

        // Set initial flag based on current locale
        if (window.i18n) {
            this.updateFlag(window.i18n.getLocale());
        }

        // Toggle dropdown on button click
        this.languageBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleDropdown();
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.languageBtn.contains(e.target) && !this.languageDropdown.contains(e.target)) {
                this.closeDropdown();
            }
        });

        // Handle language selection
        const languageOptions = this.languageDropdown.querySelectorAll('.language-option');
        languageOptions.forEach(option => {
            option.addEventListener('click', async (e) => {
                e.stopPropagation();
                const locale = option.getAttribute('data-locale');
                await this.changeLanguage(locale);
                this.closeDropdown();
            });
        });

        // Listen for i18n changes
        if (window.i18n) {
            window.i18n.onChange((newLocale) => {
                this.updateFlag(newLocale);
                this.updateActiveOption(newLocale);
            });
        }

        // Update initial active state
        if (window.i18n) {
            this.updateActiveOption(window.i18n.getLocale());
        }
    }

    toggleDropdown() {
        const isVisible = this.languageDropdown.style.display === 'block';
        if (isVisible) {
            this.closeDropdown();
        } else {
            this.openDropdown();
        }
    }

    openDropdown() {
        this.languageDropdown.style.display = 'block';
        this.languageDropdown.style.opacity = '0';
        this.languageDropdown.style.transform = 'translateY(-10px)';
        
        // Trigger animation
        requestAnimationFrame(() => {
            this.languageDropdown.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
            this.languageDropdown.style.opacity = '1';
            this.languageDropdown.style.transform = 'translateY(0)';
        });
    }

    closeDropdown() {
        this.languageDropdown.style.opacity = '0';
        this.languageDropdown.style.transform = 'translateY(-10px)';
        
        setTimeout(() => {
            this.languageDropdown.style.display = 'none';
        }, 200);
    }

    async changeLanguage(locale) {
        if (!window.i18n) {
            console.error('i18n not initialized');
            return;
        }

        try {
            // Change language in i18n
            const success = await window.i18n.setLocale(locale);
            
            if (success) {
                // Update the UI
                window.i18n.updateDOM();
                
                // Save to server
                await this.saveLanguageToServer(locale);
                
                // Emit socket event for other clients/overlays
                if (window.socket) {
                    window.socket.emit('language-changed', { locale });
                }
                
                console.log(`✅ Language changed to: ${locale}`);
            } else {
                console.error(`Failed to change language to: ${locale}`);
            }
        } catch (error) {
            console.error('Error changing language:', error);
        }
    }

    async saveLanguageToServer(locale) {
        try {
            const response = await fetch('/api/i18n/current', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ locale })
            });

            if (!response.ok) {
                throw new Error('Failed to save language to server');
            }
        } catch (error) {
            console.error('Error saving language to server:', error);
        }
    }

    updateFlag(locale) {
        if (this.currentFlag && this.flags[locale]) {
            this.currentFlag.textContent = this.flags[locale];
        }
    }

    updateActiveOption(locale) {
        const languageOptions = this.languageDropdown.querySelectorAll('.language-option');
        languageOptions.forEach(option => {
            if (option.getAttribute('data-locale') === locale) {
                option.classList.add('active');
            } else {
                option.classList.remove('active');
            }
        });
    }
}

// Initialize language switcher
const languageSwitcher = new LanguageSwitcher();

// Make available globally
window.languageSwitcher = languageSwitcher;
