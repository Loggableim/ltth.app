/**
 * @file PatternEditorView.tsx.js - Main Pattern Editor View
 * @description Composes all pattern editor components and manages layout/modes
 */

class PatternEditorView {
    constructor(containerElement, apiClient = null) {
        this.container = containerElement;
        this.apiClient = apiClient;
        
        // Create store
        this.store = window.patternStore || new (window.PatternStore || function() {})();
        
        // Components
        this.patternLibrary = null;
        this.parameterEditor = null;
        this.keyframeEditor = null;
        this.liveControls = null;
        
        this.unsubscribe = null;
    }

    /**
     * Initialize the pattern editor
     */
    init() {
        this.render();
        
        // Subscribe to view changes
        this.unsubscribe = this.store.subscribe((state) => {
            this._updateView(state.currentView);
        });
    }

    /**
     * Set API client for live testing
     */
    setApiClient(apiClient) {
        this.apiClient = apiClient;
        if (this.liveControls) {
            this.liveControls.apiClient = apiClient;
        }
    }

    /**
     * Set available devices
     */
    setDevices(devices) {
        if (this.liveControls) {
            this.liveControls.setDevices(devices);
        }
    }

    /**
     * Cleanup
     */
    destroy() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
        
        if (this.patternLibrary) {
            this.patternLibrary.destroy();
        }
        
        if (this.parameterEditor) {
            this.parameterEditor.destroy();
        }
        
        if (this.keyframeEditor) {
            this.keyframeEditor.destroy();
        }
        
        if (this.liveControls) {
            this.liveControls.destroy();
        }
    }

    /**
     * Render the main view
     */
    render() {
        this.container.innerHTML = `
            <div class="pattern-editor-view">
                <!-- Header -->
                <div class="pattern-editor-header">
                    <h1 class="text-3xl font-bold text-white mb-2">
                        ⚡ Pattern Editor
                    </h1>
                    <p class="text-gray-400 mb-4">
                        Erstelle und bearbeite OpenShock Patterns mit dem visuellen Editor
                    </p>
                </div>

                <!-- Main Content -->
                <div class="pattern-editor-layout">
                    <!-- Left Panel: Library / Editor -->
                    <div class="pattern-editor-main">
                        <div id="patternLibraryContainer"></div>
                        <div id="parameterEditorContainer"></div>
                        <div id="keyframeEditorContainer"></div>
                    </div>

                    <!-- Right Panel: Live Controls -->
                    <div class="pattern-editor-sidebar">
                        <div id="liveControlsContainer"></div>
                    </div>
                </div>
            </div>
        `;

        // Initialize components
        this._initializeComponents();
        
        // Update initial view
        const state = this.store.getState();
        this._updateView(state.currentView);
    }

    /**
     * Initialize all components
     * @private
     */
    _initializeComponents() {
        // Pattern Library
        const libraryContainer = this.container.querySelector('#patternLibraryContainer');
        if (libraryContainer) {
            this.patternLibrary = new (window.PatternLibrary)(libraryContainer, this.store);
            this.patternLibrary.init();
        }

        // Parameter Editor
        const parameterContainer = this.container.querySelector('#parameterEditorContainer');
        if (parameterContainer) {
            this.parameterEditor = new (window.ParameterEditor)(parameterContainer, this.store);
            this.parameterEditor.init();
        }

        // Keyframe Editor
        const keyframeContainer = this.container.querySelector('#keyframeEditorContainer');
        if (keyframeContainer) {
            this.keyframeEditor = new (window.KeyframeEditor)(keyframeContainer, this.store);
            this.keyframeEditor.init();
        }

        // Live Controls
        const controlsContainer = this.container.querySelector('#liveControlsContainer');
        if (controlsContainer) {
            this.liveControls = new (window.LiveControls)(controlsContainer, this.store, this.apiClient);
            this.liveControls.init();
        }
    }

    /**
     * Update view visibility based on current view
     * @private
     */
    _updateView(currentView) {
        const libraryContainer = this.container.querySelector('#patternLibraryContainer');
        const parameterContainer = this.container.querySelector('#parameterEditorContainer');
        const keyframeContainer = this.container.querySelector('#keyframeEditorContainer');

        if (!libraryContainer || !parameterContainer || !keyframeContainer) return;

        // Hide all
        libraryContainer.style.display = 'none';
        parameterContainer.style.display = 'none';
        keyframeContainer.style.display = 'none';

        // Show current view
        switch (currentView) {
            case 'library':
                libraryContainer.style.display = 'block';
                break;
            case 'parameter':
                parameterContainer.style.display = 'block';
                break;
            case 'keyframe':
                keyframeContainer.style.display = 'block';
                break;
        }
    }
}

// Export for browser
if (typeof window !== 'undefined') {
    window.PatternEditorView = PatternEditorView;
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PatternEditorView;
}
