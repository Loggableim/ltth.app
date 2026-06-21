/**
 * @file patternStore.ts.js - State Management for Pattern Editor
 * @description Simple state management using observer pattern (similar to Zustand)
 */

/**
 * Pattern Editor Store
 * Manages all state for the pattern editor including patterns, selection, and UI state
 */
class PatternStore {
    constructor() {
        // State
        this.state = {
            // Pattern library
            defaultPresets: [],
            userPatterns: [],
            selectedPattern: null,
            
            // Editor state
            currentView: 'library', // 'library' | 'parameter' | 'keyframe'
            isExpertMode: false,
            
            // Playback state
            isPlaying: false,
            isLooping: false,
            selectedShockers: [],
            
            // Keyframe editor state
            keyframes: [],
            selectedKeyframeIndex: null,
            totalDuration: 5000,
            
            // UI state
            zoom: 1,
            panOffset: 0
        };
        
        // Subscribers
        this.subscribers = [];
        
        // Initialize default presets
        this._initializeDefaultPresets();
        
        // Load user patterns from localStorage
        this._loadUserPatterns();
    }

    /**
     * Initialize default presets
     * @private
     */
    _initializeDefaultPresets() {
        const presets = [
            {
                id: 'preset-konstant',
                name: 'Konstant',
                type: 'preset',
                sourcePreset: 'Konstant',
                params: { intensity: 50 },
                duration: 1000,
                isUserPattern: false
            },
            {
                id: 'preset-rampe',
                name: 'Rampe',
                type: 'preset',
                sourcePreset: 'Rampe',
                params: { startIntensity: 0, endIntensity: 100, duration: 5000 },
                duration: 5000,
                isUserPattern: false
            },
            {
                id: 'preset-puls',
                name: 'Puls',
                type: 'preset',
                sourcePreset: 'Puls',
                params: { intensity: 50, pulseDuration: 500, pauseDuration: 500 },
                duration: 5000,
                isUserPattern: false
            },
            {
                id: 'preset-welle',
                name: 'Welle',
                type: 'preset',
                sourcePreset: 'Welle',
                params: { minIntensity: 0, maxIntensity: 100, frequency: 1 },
                duration: 5000,
                isUserPattern: false
            },
            {
                id: 'preset-zufall',
                name: 'Zufall',
                type: 'preset',
                sourcePreset: 'Zufall',
                params: { minIntensity: 0, maxIntensity: 100, frequency: 2 },
                duration: 5000,
                isUserPattern: false
            }
        ];
        
        this.state.defaultPresets = presets;
    }

    /**
     * Load user patterns from localStorage
     * @private
     */
    _loadUserPatterns() {
        try {
            const saved = localStorage.getItem('openshock_user_patterns');
            if (saved) {
                this.state.userPatterns = JSON.parse(saved);
            }
        } catch (error) {
            console.error('[PatternStore] Error loading user patterns:', error);
        }
    }

    /**
     * Save user patterns to localStorage
     * @private
     */
    _saveUserPatterns() {
        try {
            localStorage.setItem(
                'openshock_user_patterns',
                JSON.stringify(this.state.userPatterns)
            );
        } catch (error) {
            console.error('[PatternStore] Error saving user patterns:', error);
        }
    }

    /**
     * Subscribe to state changes
     * @param {function(Object): void} callback - Callback function
     * @returns {function(): void} Unsubscribe function
     */
    subscribe(callback) {
        this.subscribers.push(callback);
        
        // Return unsubscribe function
        return () => {
            const index = this.subscribers.indexOf(callback);
            if (index > -1) {
                this.subscribers.splice(index, 1);
            }
        };
    }

    /**
     * Notify all subscribers of state change
     * @private
     */
    _notify() {
        this.subscribers.forEach(callback => {
            try {
                callback(this.state);
            } catch (error) {
                console.error('[PatternStore] Error in subscriber:', error);
            }
        });
    }

    /**
     * Update state and notify subscribers
     * @param {Object} updates - State updates
     */
    setState(updates) {
        this.state = { ...this.state, ...updates };
        this._notify();
    }

    /**
     * Get current state
     * @returns {Object} Current state
     */
    getState() {
        return { ...this.state };
    }

    // ===== Pattern Management Actions =====

    /**
     * Select a pattern
     * @param {string|null} patternId - Pattern ID or null to deselect
     */
    selectPattern(patternId) {
        if (!patternId) {
            this.setState({
                selectedPattern: null,
                currentView: 'library',
                isExpertMode: false
            });
            return;
        }

        const pattern = this._findPatternById(patternId);
        if (pattern) {
            this.setState({
                selectedPattern: pattern,
                currentView: 'parameter',
                keyframes: pattern.keyframes || [],
                totalDuration: pattern.duration || 5000
            });
        }
    }

    /**
     * Find pattern by ID
     * @private
     */
    _findPatternById(id) {
        return [...this.state.defaultPresets, ...this.state.userPatterns]
            .find(p => p.id === id) || null;
    }

    /**
     * Update selected pattern parameters
     * @param {Object} params - New parameters
     */
    updatePatternParams(params) {
        if (!this.state.selectedPattern) return;

        const updatedPattern = {
            ...this.state.selectedPattern,
            params: { ...this.state.selectedPattern.params, ...params }
        };

        this.setState({ selectedPattern: updatedPattern });
    }

    /**
     * Save current pattern as user pattern
     * @param {string} name - Pattern name
     * @returns {Object} Saved pattern
     */
    saveAsUserPattern(name) {
        if (!this.state.selectedPattern) {
            throw new Error('No pattern selected');
        }

        // Sync keyframes and duration from editor state to ensure latest values are saved
        const keyframes = this.state.keyframes.length > 0 
            ? this.state.keyframes 
            : this.state.selectedPattern.keyframes;
        const duration = this.state.totalDuration || this.state.selectedPattern.duration;

        const newPattern = {
            ...this.state.selectedPattern,
            id: this._generateId(),
            name: name,
            keyframes: keyframes,
            duration: duration,
            isUserPattern: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const userPatterns = [...this.state.userPatterns, newPattern];
        
        this.setState({
            userPatterns,
            selectedPattern: newPattern
        });
        
        this._saveUserPatterns();
        
        return newPattern;
    }

    /**
     * Update an existing user pattern
     * @param {string} id - Pattern ID
     * @param {Object} updates - Pattern updates
     */
    updateUserPattern(id, updates) {
        const index = this.state.userPatterns.findIndex(p => p.id === id);
        if (index === -1) {
            throw new Error('Pattern not found');
        }

        const updatedPattern = {
            ...this.state.userPatterns[index],
            ...updates,
            id, // Preserve ID
            updatedAt: new Date().toISOString()
        };

        const userPatterns = [...this.state.userPatterns];
        userPatterns[index] = updatedPattern;

        this.setState({ userPatterns });
        this._saveUserPatterns();

        // Update selected pattern if it's the one being edited
        if (this.state.selectedPattern?.id === id) {
            this.setState({ selectedPattern: updatedPattern });
        }
    }

    /**
     * Delete a user pattern
     * @param {string} id - Pattern ID
     */
    deleteUserPattern(id) {
        const userPatterns = this.state.userPatterns.filter(p => p.id !== id);
        
        this.setState({ userPatterns });
        this._saveUserPatterns();

        // Deselect if this was the selected pattern
        if (this.state.selectedPattern?.id === id) {
            this.setState({ selectedPattern: null, currentView: 'library' });
        }
    }

    // ===== View & Mode Actions =====

    /**
     * Switch to expert mode (keyframe editor)
     */
    enableExpertMode() {
        if (!this.state.selectedPattern) return;

        // Convert preset to keyframes if needed
        let keyframes = this.state.selectedPattern.keyframes;
        
        if (this.state.selectedPattern.type === 'preset') {
            // Convert preset to keyframes
            const PatternEngine = window.PatternEngine;
            if (PatternEngine) {
                const converted = PatternEngine.convertPresetToKeyframes(
                    this.state.selectedPattern
                );
                keyframes = converted.keyframes;
            }
        }

        this.setState({
            isExpertMode: true,
            currentView: 'keyframe',
            keyframes: keyframes || []
        });
    }

    /**
     * Exit expert mode
     */
    disableExpertMode() {
        this.setState({
            isExpertMode: false,
            currentView: 'parameter'
        });
    }

    /**
     * Change current view
     * @param {'library'|'parameter'|'keyframe'} view - View name
     */
    setCurrentView(view) {
        this.setState({ currentView: view });
    }

    // ===== Keyframe Actions =====

    /**
     * Add a keyframe
     * @param {number} time - Time in ms
     * @param {number} intensity - Intensity (0-100)
     * @param {string} interpolation - Interpolation type
     */
    addKeyframe(time, intensity, interpolation = 'Linear') {
        const keyframes = [...this.state.keyframes];
        keyframes.push({ time, intensity, interpolation });
        keyframes.sort((a, b) => a.time - b.time);
        
        this.setState({ keyframes });
        this._updateSelectedPatternKeyframes(keyframes);
    }

    /**
     * Update a keyframe
     * @param {number} index - Keyframe index
     * @param {Object} updates - Keyframe updates
     */
    updateKeyframe(index, updates) {
        const keyframes = [...this.state.keyframes];
        keyframes[index] = { ...keyframes[index], ...updates };
        keyframes.sort((a, b) => a.time - b.time);
        
        this.setState({ keyframes });
        this._updateSelectedPatternKeyframes(keyframes);
    }

    /**
     * Delete a keyframe
     * @param {number} index - Keyframe index
     */
    deleteKeyframe(index) {
        const keyframes = this.state.keyframes.filter((_, i) => i !== index);
        
        this.setState({
            keyframes,
            selectedKeyframeIndex: null
        });
        this._updateSelectedPatternKeyframes(keyframes);
    }

    /**
     * Select a keyframe
     * @param {number|null} index - Keyframe index or null
     */
    selectKeyframe(index) {
        this.setState({ selectedKeyframeIndex: index });
    }

    /**
     * Update selected pattern with current keyframes
     * @private
     */
    _updateSelectedPatternKeyframes(keyframes) {
        if (!this.state.selectedPattern) return;

        const updatedPattern = {
            ...this.state.selectedPattern,
            type: 'custom',
            keyframes: keyframes,
            duration: this.state.totalDuration || this.state.selectedPattern.duration,
            params: undefined // Remove params when switching to custom
        };

        this.setState({ selectedPattern: updatedPattern });
    }

    // ===== Playback Actions =====

    /**
     * Set playback state
     * @param {boolean} isPlaying - Is playing
     */
    setPlaying(isPlaying) {
        this.setState({ isPlaying });
    }

    /**
     * Set looping state
     * @param {boolean} isLooping - Is looping
     */
    setLooping(isLooping) {
        this.setState({ isLooping });
    }

    /**
     * Set selected shockers
     * @param {string[]} shockerIds - Array of shocker IDs
     */
    setSelectedShockers(shockerIds) {
        this.setState({ selectedShockers: shockerIds });
    }

    // ===== Utility =====

    /**
     * Generate a unique ID
     * @private
     */
    _generateId() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * Get all patterns (presets + user patterns)
     * @returns {Array} All patterns
     */
    getAllPatterns() {
        return [...this.state.defaultPresets, ...this.state.userPatterns];
    }

    /**
     * Export pattern as JSON
     * @param {string} patternId - Pattern ID
     * @returns {string} JSON string
     */
    exportPattern(patternId) {
        const pattern = this._findPatternById(patternId);
        if (!pattern) {
            throw new Error('Pattern not found');
        }

        const exportData = {
            ...pattern,
            exportedAt: new Date().toISOString(),
            version: '2.0'
        };

        return JSON.stringify(exportData, null, 2);
    }

    /**
     * Import pattern from JSON
     * @param {string} json - JSON string
     * @returns {Object} Imported pattern
     */
    importPattern(json) {
        try {
            const data = JSON.parse(json);
            
            const newPattern = {
                ...data,
                id: this._generateId(),
                isUserPattern: true,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                exportedAt: undefined,
                version: undefined
            };

            const userPatterns = [...this.state.userPatterns, newPattern];
            
            this.setState({ userPatterns });
            this._saveUserPatterns();
            
            return newPattern;
        } catch (error) {
            throw new Error(`Failed to import pattern: ${error.message}`);
        }
    }
}

// Create singleton instance
const patternStore = new PatternStore();

// Export for browser
if (typeof window !== 'undefined') {
    window.patternStore = patternStore;
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = patternStore;
}
