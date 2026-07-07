/**
 * Dashboard Initialization
 * Handles language switcher initialization
 */

// Language Switcher Initialization
(async function initLanguageSwitchers() {
    console.log('[Dashboard] Waiting for i18n initialization...');
    
    // Wait for i18n to be ready via the exposed Promise (no polling)
    if (window.i18n && window.i18n.ready) {
        await window.i18n.ready;
    } else {
        // Fallback: wait for i18n to exist and be initialized
        let attempts = 0;
        while ((!window.i18n || !window.i18n.initialized) && attempts < 100) {
            await new Promise(resolve => setTimeout(resolve, 50));
            attempts++;
        }
    }
    
    if (!window.i18n || !window.i18n.initialized) {
        console.error('[Dashboard] Failed to initialize i18n after 5 seconds');
        return;
    }
    
    console.log('[Dashboard] i18n initialized, setting up language switchers...');
    console.log('[Dashboard] Current locale:', window.i18n.getLocale());
    
    const languageSelector = document.getElementById('language-selector');
    const topbarLanguageSelector = document.getElementById('topbar-language-selector');
    
    if (!languageSelector) {
        console.error('[Dashboard] Settings language selector not found!');
    } else if (window.i18n) {
        window.i18n.setupLanguageSwitcher(languageSelector);
        console.log('[Dashboard] Settings language selector initialized');
    }
    
    if (!topbarLanguageSelector) {
        console.error('[Dashboard] Topbar language selector not found!');
    } else if (window.i18n) {
        window.i18n.setupLanguageSwitcher(topbarLanguageSelector);
        console.log('[Dashboard] Topbar language selector initialized');
    }
    
    // Manual test - add click event to verify
    if (topbarLanguageSelector) {
        console.log('[Dashboard] Topbar selector value:', topbarLanguageSelector.value);
    }
    if (languageSelector) {
        console.log('[Dashboard] Settings selector value:', languageSelector.value);
    }
})();
