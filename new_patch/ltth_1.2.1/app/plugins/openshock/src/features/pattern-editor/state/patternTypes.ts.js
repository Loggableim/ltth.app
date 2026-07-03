/**
 * @file patternTypes.ts.js - Type Definitions for Pattern Editor
 * @description TypeScript-style interfaces defined using JSDoc
 */

/**
 * @typedef {'Linear'|'Step'|'Bezier'} InterpolationType
 */

/**
 * @typedef {Object} BezierControls
 * @property {number} cp1x - Control point 1 x (0-1)
 * @property {number} cp1y - Control point 1 y (0-1)
 * @property {number} cp2x - Control point 2 x (0-1)
 * @property {number} cp2y - Control point 2 y (0-1)
 */

/**
 * @typedef {Object} Keyframe
 * @property {number} time - Time in milliseconds
 * @property {number} intensity - Intensity value (0-100)
 * @property {InterpolationType} interpolation - Interpolation type
 * @property {BezierControls} [bezierControls] - Bezier control points (optional)
 */

/**
 * @typedef {Object} PresetParams
 * @property {number} [intensity] - For Konstant preset (0-100)
 * @property {number} [startIntensity] - For Rampe preset (0-100)
 * @property {number} [endIntensity] - For Rampe preset (0-100)
 * @property {number} [duration] - For Rampe preset (ms)
 * @property {number} [pulseDuration] - For Puls preset (ms)
 * @property {number} [pauseDuration] - For Puls preset (ms)
 * @property {number} [minIntensity] - For Welle, Zufall presets (0-100)
 * @property {number} [maxIntensity] - For Welle, Zufall presets (0-100)
 * @property {number} [frequency] - For Welle, Zufall presets (Hz)
 */

/**
 * @typedef {'custom'|'preset'} PatternType
 */

/**
 * @typedef {'Konstant'|'Rampe'|'Puls'|'Welle'|'Zufall'} PresetName
 */

/**
 * @typedef {Object} PatternObject
 * @property {string} id - Unique pattern ID (uuid-v4 format)
 * @property {string} name - User-defined pattern name
 * @property {PatternType} type - Pattern type
 * @property {PresetName} [sourcePreset] - Source preset name if derived from preset
 * @property {PresetParams} [params] - Preset parameters (only for type='preset')
 * @property {Keyframe[]} [keyframes] - Keyframes (only for type='custom')
 * @property {number} duration - Total pattern duration in ms
 * @property {boolean} [isUserPattern] - Whether this is a user-created pattern
 * @property {string} [createdAt] - ISO timestamp of creation
 * @property {string} [updatedAt] - ISO timestamp of last update
 */

/**
 * @typedef {Object} PresetDefinition
 * @property {PresetName} name - Preset name
 * @property {string} description - Preset description
 * @property {string} icon - Emoji or icon for the preset
 * @property {Object} defaultParams - Default parameters for this preset
 * @property {Array<ParamDefinition>} paramDefinitions - Parameter definitions for UI
 */

/**
 * @typedef {Object} ParamDefinition
 * @property {string} key - Parameter key
 * @property {string} label - Display label
 * @property {string} type - Input type ('slider', 'number')
 * @property {number} min - Minimum value
 * @property {number} max - Maximum value
 * @property {number} step - Step value
 * @property {number} defaultValue - Default value
 * @property {string} unit - Unit label (e.g., '%', 'ms', 'Hz')
 */

/**
 * @typedef {Object} PatternLibraryState
 * @property {PatternObject[]} defaultPresets - Default preset patterns
 * @property {PatternObject[]} userPatterns - User-created patterns
 * @property {PatternObject|null} selectedPattern - Currently selected pattern
 * @property {boolean} isExpertMode - Whether expert mode is enabled
 */

/**
 * @typedef {Object} EditorState
 * @property {'library'|'parameter'|'keyframe'} currentView - Current view mode
 * @property {boolean} isPlaying - Whether pattern is currently playing
 * @property {boolean} isLooping - Whether pattern is looping
 * @property {string[]} selectedShockers - Array of selected shocker IDs
 */

/**
 * Default preset definitions
 * @type {PresetDefinition[]}
 */
export const DEFAULT_PRESETS = [
    {
        name: 'Konstant',
        description: 'Eine konstante Intensität über die Zeit',
        icon: '📊',
        defaultParams: {
            intensity: 50
        },
        paramDefinitions: [
            {
                key: 'intensity',
                label: 'Intensität',
                type: 'slider',
                min: 0,
                max: 100,
                step: 1,
                defaultValue: 50,
                unit: '%'
            }
        ]
    },
    {
        name: 'Rampe',
        description: 'Linear ansteigende oder abfallende Intensität',
        icon: '📈',
        defaultParams: {
            startIntensity: 0,
            endIntensity: 100,
            duration: 5000
        },
        paramDefinitions: [
            {
                key: 'startIntensity',
                label: 'Start-Intensität',
                type: 'slider',
                min: 0,
                max: 100,
                step: 1,
                defaultValue: 0,
                unit: '%'
            },
            {
                key: 'endIntensity',
                label: 'End-Intensität',
                type: 'slider',
                min: 0,
                max: 100,
                step: 1,
                defaultValue: 100,
                unit: '%'
            },
            {
                key: 'duration',
                label: 'Dauer',
                type: 'number',
                min: 300,
                max: 30000,
                step: 100,
                defaultValue: 5000,
                unit: 'ms'
            }
        ]
    },
    {
        name: 'Puls',
        description: 'Wiederkehrende Pulse mit Pausen',
        icon: '💓',
        defaultParams: {
            intensity: 50,
            pulseDuration: 500,
            pauseDuration: 500
        },
        paramDefinitions: [
            {
                key: 'intensity',
                label: 'Intensität',
                type: 'slider',
                min: 0,
                max: 100,
                step: 1,
                defaultValue: 50,
                unit: '%'
            },
            {
                key: 'pulseDuration',
                label: 'Puls-Dauer',
                type: 'number',
                min: 100,
                max: 5000,
                step: 50,
                defaultValue: 500,
                unit: 'ms'
            },
            {
                key: 'pauseDuration',
                label: 'Pausen-Dauer',
                type: 'number',
                min: 100,
                max: 5000,
                step: 50,
                defaultValue: 500,
                unit: 'ms'
            }
        ]
    },
    {
        name: 'Welle',
        description: 'Sinusförmige Wellenform',
        icon: '🌊',
        defaultParams: {
            minIntensity: 0,
            maxIntensity: 100,
            frequency: 1
        },
        paramDefinitions: [
            {
                key: 'minIntensity',
                label: 'Min-Intensität',
                type: 'slider',
                min: 0,
                max: 100,
                step: 1,
                defaultValue: 0,
                unit: '%'
            },
            {
                key: 'maxIntensity',
                label: 'Max-Intensität',
                type: 'slider',
                min: 0,
                max: 100,
                step: 1,
                defaultValue: 100,
                unit: '%'
            },
            {
                key: 'frequency',
                label: 'Frequenz',
                type: 'slider',
                min: 0.1,
                max: 5,
                step: 0.1,
                defaultValue: 1,
                unit: 'Hz'
            }
        ]
    },
    {
        name: 'Zufall',
        description: 'Zufällige Intensitätswerte',
        icon: '🎲',
        defaultParams: {
            minIntensity: 0,
            maxIntensity: 100,
            frequency: 2
        },
        paramDefinitions: [
            {
                key: 'minIntensity',
                label: 'Min-Intensität',
                type: 'slider',
                min: 0,
                max: 100,
                step: 1,
                defaultValue: 0,
                unit: '%'
            },
            {
                key: 'maxIntensity',
                label: 'Max-Intensität',
                type: 'slider',
                min: 0,
                max: 100,
                step: 1,
                defaultValue: 100,
                unit: '%'
            },
            {
                key: 'frequency',
                label: 'Update-Frequenz',
                type: 'slider',
                min: 0.5,
                max: 10,
                step: 0.5,
                defaultValue: 2,
                unit: 'Hz'
            }
        ]
    }
];

/**
 * Generate a unique ID for a pattern
 * @returns {string} UUID v4 format
 */
export function generatePatternId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Export for browser
if (typeof window !== 'undefined') {
    window.PatternTypes = {
        DEFAULT_PRESETS,
        generatePatternId
    };
}
