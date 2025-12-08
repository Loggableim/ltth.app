/**
 * OpenShock Overlay - Real-time Event Display
 * Handles Socket.IO events and displays command execution in overlay
 */

// ============================================================================
// Global Variables
// ============================================================================

let socket = null;
let currentEvent = null;
let eventTimeout = null;
let durationInterval = null;
let config = {
    enabled: true,
    showDevice: true,
    showIntensity: true,
    showPattern: true,
    animationDuration: 2000,
    autoHideDelay: 1000
};

// Event queue for handling multiple simultaneous events
let eventQueue = [];
let isProcessingEvent = false;

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the overlay on page load
 */
document.addEventListener('DOMContentLoaded', () => {
    console.log('[OpenShock Overlay] Initializing...');
    loadConfig();
    initializeSocket();
});

/**
 * Load overlay configuration from API
 */
async function loadConfig() {
    try {
        const response = await fetch('/api/openshock/config');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (data.overlay) {
            config = { ...config, ...data.overlay };
            console.log('[OpenShock Overlay] Config loaded:', config);
        }
    } catch (error) {
        console.error('[OpenShock Overlay] Failed to load config:', error);
        // Continue with default config
    }
}

/**
 * Initialize Socket.IO connection
 */
function initializeSocket() {
    try {
        // Connect to Socket.IO server
        socket = io({
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: Infinity
        });

        // Connection events
        socket.on('connect', () => {
            console.log('[OpenShock Overlay] Socket connected:', socket.id);
        });

        socket.on('disconnect', (reason) => {
            console.log('[OpenShock Overlay] Socket disconnected:', reason);
        });

        socket.on('reconnect', (attemptNumber) => {
            console.log('[OpenShock Overlay] Socket reconnected after', attemptNumber, 'attempts');
        });

        socket.on('error', (error) => {
            console.error('[OpenShock Overlay] Socket error:', error);
        });

        // OpenShock plugin events
        socket.on('openshock:command-sent', handleCommandSent);
        socket.on('openshock:emergency-stop', handleEmergencyStop);
        socket.on('openshock:queue-update', handleQueueUpdate);
        socket.on('openshock:stats-update', handleStatsUpdate);

        console.log('[OpenShock Overlay] Socket.IO listeners registered');
    } catch (error) {
        console.error('[OpenShock Overlay] Failed to initialize socket:', error);
    }
}

// ============================================================================
// Event Handling
// ============================================================================

/**
 * Handle command-sent event
 * @param {Object} data - Event data containing command details
 */
function handleCommandSent(data) {
    console.log('[OpenShock Overlay] Command sent:', data);

    if (!config.enabled) {
        console.log('[OpenShock Overlay] Overlay disabled, ignoring event');
        return;
    }

    try {
        // Extract event data
        const command = data.command || {};
        const eventData = {
            type: command.type || 'shock',
            intensity: command.intensity || 0,
            duration: command.duration || 1000,
            deviceName: data.deviceName || 'Unknown Device',
            deviceId: data.deviceId || '',
            username: data.username || 'Anonymous',
            userId: data.userId || '',
            source: data.source || 'manual',
            timestamp: Date.now(),
            pattern: command.pattern || null
        };

        // Queue or process event
        if (isProcessingEvent) {
            console.log('[OpenShock Overlay] Event in progress, queueing...');
            eventQueue.push(eventData);
        } else {
            processEvent(eventData);
        }
    } catch (error) {
        console.error('[OpenShock Overlay] Error handling command sent:', error);
    }
}

/**
 * Handle emergency stop event
 */
function handleEmergencyStop() {
    console.log('[OpenShock Overlay] Emergency stop activated!');

    // Clear any active events
    if (currentEvent) {
        hideEvent();
    }

    // Clear queue
    eventQueue = [];

    // Show emergency warning
    showSafetyWarning('EMERGENCY STOP ACTIVATED');

    // Hide warning after 5 seconds
    setTimeout(() => {
        hideSafetyWarning();
    }, 5000);
}

/**
 * Handle queue update event
 * @param {Object} data - Queue status data
 */
function handleQueueUpdate(data) {
    console.log('[OpenShock Overlay] Queue update:', data);

    try {
        const stats = {
            queueLength: data.queueLength || 0,
            processing: data.processing || false,
            ...data
        };

        updateStatsCorner(stats);
    } catch (error) {
        console.error('[OpenShock Overlay] Error handling queue update:', error);
    }
}

/**
 * Handle stats update event
 * @param {Object} data - Statistics data
 */
function handleStatsUpdate(data) {
    console.log('[OpenShock Overlay] Stats update:', data);

    try {
        updateStatsCorner(data);
    } catch (error) {
        console.error('[OpenShock Overlay] Error handling stats update:', error);
    }
}

// ============================================================================
// Event Processing
// ============================================================================

/**
 * Process an event from the queue
 * @param {Object} eventData - Event data to process
 */
function processEvent(eventData) {
    isProcessingEvent = true;
    currentEvent = eventData;

    // Show event card
    showEvent(eventData);

    // Start duration countdown
    if (eventData.duration > 0) {
        startDurationCountdown(eventData.duration);
    }

    // Show pattern preview if applicable
    if (eventData.pattern && config.showPattern) {
        showPatternPreview(eventData.pattern);
    }

    // Calculate total display time
    const displayDuration = eventData.duration + config.autoHideDelay;

    // Schedule event hide
    eventTimeout = setTimeout(() => {
        hideEvent();
        processNextEvent();
    }, displayDuration);
}

/**
 * Process next event in queue
 */
function processNextEvent() {
    if (eventQueue.length > 0) {
        const nextEvent = eventQueue.shift();
        processEvent(nextEvent);
    } else {
        isProcessingEvent = false;
        currentEvent = null;
    }
}

// ============================================================================
// UI Updates
// ============================================================================

/**
 * Show event card with animation
 * @param {Object} eventData - Event data to display
 */
function showEvent(eventData) {
    console.log('[OpenShock Overlay] Showing event:', eventData);

    try {
        const card = document.getElementById('event-card');
        if (!card) {
            console.error('[OpenShock Overlay] Event card element not found');
            return;
        }

        // Set type icon and color
        const typeIcon = getTypeIcon(eventData.type);
        const typeColor = getTypeColor(eventData.type);

        const typeIconElement = document.getElementById('type-icon');
        if (typeIconElement) {
            typeIconElement.textContent = typeIcon;
        }

        const typeTextElement = document.getElementById('type-text');
        if (typeTextElement) {
            typeTextElement.textContent = eventData.type.toUpperCase();
        }

        // Apply accent color
        const accentElements = card.querySelectorAll('.accent-color');
        accentElements.forEach(el => {
            el.style.background = typeColor;
        });

        // Set device name
        if (config.showDevice) {
            const deviceElement = document.getElementById('device-name');
            if (deviceElement) {
                deviceElement.textContent = escapeHtml(eventData.deviceName);
            }
        }

        // Set intensity
        if (config.showIntensity) {
            const intensityElement = document.getElementById('intensity-value');
            if (intensityElement) {
                intensityElement.textContent = `${eventData.intensity}%`;
            }
            updateIntensityBar(eventData.intensity);
        }

        // Set duration
        const durationElement = document.getElementById('duration-value');
        if (durationElement) {
            durationElement.textContent = formatDuration(eventData.duration);
        }

        // Set username
        const usernameElement = document.getElementById('username');
        if (usernameElement) {
            usernameElement.textContent = escapeHtml(eventData.username);
        }

        // Set source badge
        const sourceElement = document.getElementById('source-badge');
        if (sourceElement) {
            sourceElement.innerHTML = getSourceBadge(eventData.source);
        }

        // Show card with slide-in animation
        card.classList.remove('hidden');
        card.classList.add('slide-in');

        // Remove animation class after animation completes
        setTimeout(() => {
            card.classList.remove('slide-in');
        }, config.animationDuration);

    } catch (error) {
        console.error('[OpenShock Overlay] Error showing event:', error);
    }
}

/**
 * Hide event card with animation
 */
function hideEvent() {
    console.log('[OpenShock Overlay] Hiding event');

    try {
        const card = document.getElementById('event-card');
        if (!card) {
            return;
        }

        // Add slide-out animation
        card.classList.add('slide-out');

        // Hide card after animation
        setTimeout(() => {
            card.classList.add('hidden');
            card.classList.remove('slide-out');
        }, config.animationDuration);

        // Stop countdown
        stopDurationCountdown();

        // Hide pattern preview
        hidePatternPreview();

        // Clear timeout
        if (eventTimeout) {
            clearTimeout(eventTimeout);
            eventTimeout = null;
        }

    } catch (error) {
        console.error('[OpenShock Overlay] Error hiding event:', error);
    }
}

/**
 * Update intensity bar
 * @param {number} intensity - Intensity value (0-100)
 */
function updateIntensityBar(intensity) {
    try {
        const fillElement = document.getElementById('intensity-fill');
        if (fillElement) {
            fillElement.style.width = `${intensity}%`;
        }
    } catch (error) {
        console.error('[OpenShock Overlay] Error updating intensity bar:', error);
    }
}

/**
 * Start duration countdown animation
 * @param {number} duration - Duration in milliseconds
 */
function startDurationCountdown(duration) {
    console.log('[OpenShock Overlay] Starting countdown:', duration, 'ms');

    try {
        stopDurationCountdown(); // Clear any existing interval

        const startTime = Date.now();
        const durationBarFill = document.getElementById('duration-fill');
        const durationValue = document.getElementById('duration-value');

        if (!durationBarFill) {
            console.error('[OpenShock Overlay] Duration bar fill element not found');
            return;
        }

        // Update every 100ms
        durationInterval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const remaining = Math.max(0, duration - elapsed);
            const percentage = (remaining / duration) * 100;

            // Update bar width
            durationBarFill.style.width = `${percentage}%`;

            // Update value text
            if (durationValue) {
                durationValue.textContent = formatDuration(remaining);
            }

            // Stop when countdown reaches 0
            if (remaining <= 0) {
                stopDurationCountdown();
            }
        }, 100);

    } catch (error) {
        console.error('[OpenShock Overlay] Error starting countdown:', error);
    }
}

/**
 * Stop duration countdown
 */
function stopDurationCountdown() {
    if (durationInterval) {
        clearInterval(durationInterval);
        durationInterval = null;
    }
}

/**
 * Show pattern preview timeline
 * @param {Object} pattern - Pattern configuration
 */
function showPatternPreview(pattern) {
    console.log('[OpenShock Overlay] Showing pattern preview:', pattern);

    try {
        const previewElement = document.getElementById('pattern-preview');
        if (!previewElement) {
            return;
        }

        const timelineElement = document.getElementById('pattern-timeline');
        if (!timelineElement) {
            return;
        }

        // Clear existing timeline
        timelineElement.innerHTML = '';

        // Create pattern visualization
        if (pattern.steps && Array.isArray(pattern.steps)) {
            pattern.steps.forEach((step, index) => {
                const stepElement = document.createElement('div');
                stepElement.className = 'pattern-step';
                stepElement.style.height = `${step.intensity || 0}%`;
                stepElement.title = `Step ${index + 1}: ${step.intensity}% for ${step.duration}ms`;
                timelineElement.appendChild(stepElement);
            });
        }

        // Show preview
        previewElement.classList.remove('hidden');

    } catch (error) {
        console.error('[OpenShock Overlay] Error showing pattern preview:', error);
    }
}

/**
 * Hide pattern preview
 */
function hidePatternPreview() {
    try {
        const previewElement = document.getElementById('pattern-preview');
        if (previewElement) {
            previewElement.classList.add('hidden');
        }
    } catch (error) {
        console.error('[OpenShock Overlay] Error hiding pattern preview:', error);
    }
}

/**
 * Show safety warning overlay
 * @param {string} message - Warning message to display
 */
function showSafetyWarning(message) {
    console.log('[OpenShock Overlay] Showing safety warning:', message);

    try {
        const warningElement = document.getElementById('safety-warning');
        if (!warningElement) {
            return;
        }

        const messageElement = document.getElementById('warning-message');
        if (messageElement) {
            messageElement.textContent = escapeHtml(message);
        }

        // Show warning with pulse animation
        warningElement.classList.remove('hidden');
        warningElement.classList.add('pulse');

    } catch (error) {
        console.error('[OpenShock Overlay] Error showing safety warning:', error);
    }
}

/**
 * Hide safety warning overlay
 */
function hideSafetyWarning() {
    try {
        const warningElement = document.getElementById('safety-warning');
        if (warningElement) {
            warningElement.classList.remove('pulse');
            warningElement.classList.add('hidden');
        }
    } catch (error) {
        console.error('[OpenShock Overlay] Error hiding safety warning:', error);
    }
}

/**
 * Update stats corner display
 * @param {Object} stats - Statistics data
 */
function updateStatsCorner(stats) {
    console.log('[OpenShock Overlay] Updating stats corner:', stats);

    try {
        const statsElement = document.getElementById('stats-corner');
        if (!statsElement) {
            return;
        }

        // Update queue length
        const queueElement = document.getElementById('queue-length');
        if (queueElement && typeof stats.queueLength !== 'undefined') {
            queueElement.textContent = stats.queueLength;
        }

        // Update total commands
        const totalElement = document.getElementById('total-commands');
        if (totalElement && typeof stats.totalCommands !== 'undefined') {
            totalElement.textContent = stats.totalCommands;
        }

        // Update active users
        const usersElement = document.getElementById('active-users');
        if (usersElement && typeof stats.activeUsers !== 'undefined') {
            usersElement.textContent = stats.activeUsers;
        }

        // Update session duration
        const durationElement = document.getElementById('session-duration');
        if (durationElement && typeof stats.sessionDuration !== 'undefined') {
            durationElement.textContent = formatSessionDuration(stats.sessionDuration);
        }

        // Show stats corner if hidden
        if (statsElement.classList.contains('hidden')) {
            statsElement.classList.remove('hidden');
        }

    } catch (error) {
        console.error('[OpenShock Overlay] Error updating stats corner:', error);
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get icon for command type
 * @param {string} type - Command type (shock, vibrate, sound)
 * @returns {string} Icon character
 */
function getTypeIcon(type) {
    const icons = {
        'shock': '⚡',
        'vibrate': '📳',
        'sound': '🔊'
    };
    return icons[type.toLowerCase()] || '⚡';
}

/**
 * Get color for command type
 * @param {string} type - Command type
 * @returns {string} CSS color value
 */
function getTypeColor(type) {
    const colors = {
        'shock': 'linear-gradient(135deg, #ff6b6b, #ee5a6f)',
        'vibrate': 'linear-gradient(135deg, #4ecdc4, #44a08d)',
        'sound': 'linear-gradient(135deg, #f093fb, #f5576c)'
    };
    return colors[type.toLowerCase()] || colors['shock'];
}

/**
 * Get source badge HTML
 * @param {string} source - Event source
 * @returns {string} HTML string for badge
 */
function getSourceBadge(source) {
    const badges = {
        'gift': '<span class="badge badge-gift">🎁 Gift</span>',
        'chat': '<span class="badge badge-chat">💬 Chat</span>',
        'follow': '<span class="badge badge-follow">❤️ Follow</span>',
        'share': '<span class="badge badge-share">🔄 Share</span>',
        'like': '<span class="badge badge-like">👍 Like</span>',
        'manual': '<span class="badge badge-manual">⚙️ Manual</span>',
        'api': '<span class="badge badge-api">🔌 API</span>',
        'test': '<span class="badge badge-test">🧪 Test</span>'
    };
    return badges[source.toLowerCase()] || `<span class="badge">${escapeHtml(source)}</span>`;
}

/**
 * Format duration for display
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration string
 */
function formatDuration(ms) {
    if (ms < 1000) {
        return `${Math.round(ms)}ms`;
    } else if (ms < 60000) {
        return `${(ms / 1000).toFixed(1)}s`;
    } else {
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}m ${seconds}s`;
    }
}

/**
 * Format session duration
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration string
 */
function formatSessionDuration(ms) {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    } else {
        return `${seconds}s`;
    }
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Get intensity level descriptor
 * @param {number} intensity - Intensity value (0-100)
 * @returns {string} Descriptor text
 */
function getIntensityLevel(intensity) {
    if (intensity >= 80) return 'EXTREME';
    if (intensity >= 60) return 'HIGH';
    if (intensity >= 40) return 'MEDIUM';
    if (intensity >= 20) return 'LOW';
    return 'MINIMAL';
}

/**
 * Get intensity color class
 * @param {number} intensity - Intensity value (0-100)
 * @returns {string} CSS class name
 */
function getIntensityColorClass(intensity) {
    if (intensity >= 80) return 'intensity-extreme';
    if (intensity >= 60) return 'intensity-high';
    if (intensity >= 40) return 'intensity-medium';
    if (intensity >= 20) return 'intensity-low';
    return 'intensity-minimal';
}

// ============================================================================
// Cleanup and Error Handling
// ============================================================================

/**
 * Cleanup function called when overlay is being destroyed
 */
function cleanup() {
    console.log('[OpenShock Overlay] Cleaning up...');

    // Stop all timers
    if (eventTimeout) {
        clearTimeout(eventTimeout);
        eventTimeout = null;
    }

    if (durationInterval) {
        clearInterval(durationInterval);
        durationInterval = null;
    }

    // Clear event queue
    eventQueue = [];
    currentEvent = null;
    isProcessingEvent = false;

    // Disconnect socket
    if (socket) {
        socket.disconnect();
        socket = null;
    }

    console.log('[OpenShock Overlay] Cleanup complete');
}

/**
 * Handle visibility change (tab switch)
 */
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        console.log('[OpenShock Overlay] Tab hidden');
    } else {
        console.log('[OpenShock Overlay] Tab visible');
        // Reconnect socket if needed
        if (socket && !socket.connected) {
            console.log('[OpenShock Overlay] Reconnecting socket...');
            socket.connect();
        }
    }
});

/**
 * Handle page unload
 */
window.addEventListener('beforeunload', () => {
    cleanup();
});

/**
 * Global error handler
 */
window.addEventListener('error', (event) => {
    console.error('[OpenShock Overlay] Global error:', event.error);
});

/**
 * Unhandled promise rejection handler
 */
window.addEventListener('unhandledrejection', (event) => {
    console.error('[OpenShock Overlay] Unhandled promise rejection:', event.reason);
});

// ============================================================================
// Debug Functions (Development Only)
// ============================================================================

/**
 * Test event display (for development/debugging)
 */
function testEvent(type = 'shock', intensity = 50, duration = 3000) {
    const testData = {
        type: type,
        intensity: intensity,
        duration: duration,
        deviceName: 'Test Device',
        deviceId: 'test-123',
        username: 'TestUser',
        userId: 'user-123',
        source: 'test',
        timestamp: Date.now()
    };

    handleCommandSent({ command: testData, ...testData });
}

/**
 * Test emergency stop
 */
function testEmergencyStop() {
    handleEmergencyStop();
}

/**
 * Test stats update
 */
function testStatsUpdate() {
    const testStats = {
        queueLength: 3,
        totalCommands: 42,
        activeUsers: 7,
        sessionDuration: 125000
    };

    handleStatsUpdate(testStats);
}

// Expose test functions to window for debugging
if (typeof window !== 'undefined') {
    window.openshockOverlay = {
        testEvent,
        testEmergencyStop,
        testStatsUpdate,
        cleanup,
        getConfig: () => config,
        getSocket: () => socket,
        getCurrentEvent: () => currentEvent,
        getEventQueue: () => eventQueue
    };
}

console.log('[OpenShock Overlay] Script loaded successfully');
