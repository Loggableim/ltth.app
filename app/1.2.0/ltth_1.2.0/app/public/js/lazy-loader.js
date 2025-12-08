/**
 * Lazy Loading Utility Module
 * Provides dynamic script loading for non-critical modules
 * 
 * This module implements lazy loading strategy to reduce initial page load time
 * by deferring the loading of non-critical scripts until they are actually needed.
 */

(() => {
    'use strict';

    // Track loaded scripts to prevent duplicate loading
    const loadedScripts = new Set();
    
    // Track loading promises to prevent race conditions
    const loadingPromises = new Map();

    /**
     * Dynamically load a script
     * @param {string} src - The script URL to load
     * @returns {Promise<void>} - Resolves when script is loaded
     */
    function loadScript(src) {
        // Already loaded
        if (loadedScripts.has(src)) {
            return Promise.resolve();
        }

        // Currently loading - return existing promise
        if (loadingPromises.has(src)) {
            return loadingPromises.get(src);
        }

        // Create loading promise
        const promise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.async = true;

            script.onload = () => {
                loadedScripts.add(src);
                loadingPromises.delete(src);
                console.log(`✅ [LazyLoader] Loaded: ${src}`);
                resolve();
            };

            script.onerror = (error) => {
                loadingPromises.delete(src);
                console.error(`❌ [LazyLoader] Failed to load: ${src}`, error);
                reject(new Error(`Failed to load script: ${src}`));
            };

            // Use document.head as more reliable target (always exists when script runs)
            // Falls back to document.body for compatibility
            const target = document.head || document.body;
            if (!target) {
                reject(new Error('Cannot append script: document.head and document.body are not available'));
                return;
            }
            target.appendChild(script);
        });

        loadingPromises.set(src, promise);
        return promise;
    }

    /**
     * Module definitions for lazy loading
     * Maps view names to their required scripts
     */
    const moduleDefinitions = {
        'multi-guest': {
            scripts: ['/js/vdoninja-dashboard.js'],
            plugin: 'vdoninja'
        },
        'emoji-rain': {
            scripts: [], // emoji-rain-ui.js is for the iframe UI, not the dashboard
            plugin: 'emoji-rain'
        },
        'osc-bridge': {
            scripts: [], // osc-bridge-ui.js is for the iframe UI, not the dashboard
            plugin: 'osc-bridge'
        }
    };

    /**
     * Load modules required for a specific view
     * @param {string} viewName - The view being activated
     * @returns {Promise<void>} - Resolves when all required modules are loaded
     */
    async function loadModulesForView(viewName) {
        const moduleDef = moduleDefinitions[viewName];
        
        if (!moduleDef || !moduleDef.scripts.length) {
            return; // No lazy-loaded scripts for this view
        }

        console.log(`📦 [LazyLoader] Loading modules for view: ${viewName}`);

        try {
            await Promise.all(moduleDef.scripts.map(loadScript));
            console.log(`✅ [LazyLoader] All modules loaded for view: ${viewName}`);
        } catch (error) {
            console.error(`❌ [LazyLoader] Error loading modules for view: ${viewName}`, error);
        }
    }

    /**
     * Check if a module has been loaded
     * @param {string} src - The script URL
     * @returns {boolean}
     */
    function isLoaded(src) {
        return loadedScripts.has(src);
    }

    /**
     * Preload a module without blocking
     * @param {string} src - The script URL to preload
     */
    function preload(src) {
        if (loadedScripts.has(src) || loadingPromises.has(src)) {
            return;
        }

        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'script';
        link.href = src;
        document.head.appendChild(link);
        console.log(`📋 [LazyLoader] Preloading: ${src}`);
    }

    /**
     * Mark a script as already loaded (for scripts loaded in HTML)
     * @param {string} src - The script URL
     */
    function markAsLoaded(src) {
        loadedScripts.add(src);
    }

    // Export to window
    window.LazyLoader = {
        loadScript,
        loadModulesForView,
        isLoaded,
        preload,
        markAsLoaded,
        moduleDefinitions
    };
})();
