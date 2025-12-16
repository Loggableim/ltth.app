/**
 * Talking Heads OBS Overlay JavaScript
 * 
 * Displays animated talking head avatars that sync with TTS playback.
 * When a user speaks via TTS:
 * - Shows their avatar with closed mouth (idle)
 * - Switches to open mouth image while TTS is playing
 * - Returns to closed mouth when TTS ends
 * - Includes blinking animation for more natural appearance
 */

document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('talking-heads-container');
    
    // Animation constants
    const BLINK_DURATION_MS = 150;
    const BLINK_RANDOMNESS_RANGE_MS = 1000;
    const BLINK_RANDOMNESS_OFFSET_MS = 500;
    const HIDE_DELAY_AFTER_SPEAKING_MS = 2000;
    
    // Configuration (can be overridden via URL params)
    const urlParams = new URLSearchParams(window.location.search);
    const config = {
        fadeInDuration: parseInt(urlParams.get('fadeIn')) || 300,
        fadeOutDuration: parseInt(urlParams.get('fadeOut')) || 300,
        blinkInterval: parseInt(urlParams.get('blink')) || 3000,
        showUsername: urlParams.get('hideUsername') !== 'true',
        avatarSize: parseInt(urlParams.get('size')) || 200
    };
    
    // Active talking heads
    const activeTalkingHeads = new Map(); // uniqueId -> element
    
    // Blink intervals
    const blinkIntervals = new Map(); // uniqueId -> intervalId
    
    /**
     * Create a talking head element
     */
    function createTalkingHead(uniqueId, username, avatarData) {
        const element = document.createElement('div');
        element.className = 'talking-head';
        element.id = `talking-head-${uniqueId}`;
        element.style.setProperty('--fade-in', `${config.fadeInDuration}ms`);
        element.style.setProperty('--fade-out', `${config.fadeOutDuration}ms`);
        
        element.innerHTML = `
            <div class="avatar-container" style="width: ${config.avatarSize}px; height: ${config.avatarSize}px;">
                <img class="avatar-image closed-mouth" src="data:image/png;base64,${avatarData.closedMouth}" alt="${username}">
                <img class="avatar-image open-mouth" src="data:image/png;base64,${avatarData.openMouth}" alt="${username} speaking">
                <div class="speaking-indicator">
                    <div class="bar"></div>
                    <div class="bar"></div>
                    <div class="bar"></div>
                    <div class="bar"></div>
                    <div class="bar"></div>
                </div>
            </div>
            ${config.showUsername ? `<div class="username-label">@${username}</div>` : ''}
        `;
        
        container.appendChild(element);
        
        // Trigger animation on next frame
        requestAnimationFrame(() => {
            element.classList.add('visible');
        });
        
        // Start blink animation
        startBlinkAnimation(uniqueId, element);
        
        return element;
    }
    
    /**
     * Remove a talking head element
     */
    function removeTalkingHead(uniqueId) {
        const element = activeTalkingHeads.get(uniqueId);
        if (!element) return;
        
        // Stop blink animation
        stopBlinkAnimation(uniqueId);
        
        // Trigger hide animation
        element.classList.remove('visible');
        element.classList.add('hiding');
        
        // Remove after animation completes
        setTimeout(() => {
            element.remove();
            activeTalkingHeads.delete(uniqueId);
        }, config.fadeOutDuration);
    }
    
    /**
     * Start mouth open animation (speaking)
     */
    function startSpeaking(uniqueId) {
        const element = activeTalkingHeads.get(uniqueId);
        if (element) {
            element.classList.add('speaking');
        }
    }
    
    /**
     * Stop mouth open animation (not speaking)
     */
    function stopSpeaking(uniqueId) {
        const element = activeTalkingHeads.get(uniqueId);
        if (element) {
            element.classList.remove('speaking');
        }
    }
    
    /**
     * Start blink animation at intervals
     */
    function startBlinkAnimation(uniqueId, element) {
        // Random initial delay for natural effect
        const initialDelay = Math.random() * config.blinkInterval;
        
        setTimeout(() => {
            const intervalId = setInterval(() => {
                element.classList.add('blinking');
                setTimeout(() => {
                    element.classList.remove('blinking');
                }, BLINK_DURATION_MS);
            }, config.blinkInterval + (Math.random() * BLINK_RANDOMNESS_RANGE_MS - BLINK_RANDOMNESS_OFFSET_MS)); // Add some randomness
            
            blinkIntervals.set(uniqueId, intervalId);
        }, initialDelay);
    }
    
    /**
     * Stop blink animation
     */
    function stopBlinkAnimation(uniqueId) {
        const intervalId = blinkIntervals.get(uniqueId);
        if (intervalId) {
            clearInterval(intervalId);
            blinkIntervals.delete(uniqueId);
        }
    }
    
    /**
     * Connect to server via Socket.IO
     */
    function connect() {
        if (typeof io === 'undefined') {
            console.error('Socket.IO not available');
            return;
        }
        
        const socket = io(window.location.origin);
        
        socket.on('connect', () => {
            console.log('Talking Heads overlay connected');
            // Request current status
            socket.emit('talking-heads:status');
        });
        
        socket.on('disconnect', () => {
            console.log('Talking Heads overlay disconnected');
        });
        
        // Handle mouth open event (TTS started)
        socket.on('talking-heads:mouth-open', (data) => {
            console.log('Mouth open event:', data);
            
            const { uniqueId, username, avatar } = data;
            
            // Create talking head if not exists
            if (!activeTalkingHeads.has(uniqueId)) {
                const element = createTalkingHead(uniqueId, username, avatar);
                activeTalkingHeads.set(uniqueId, element);
            }
            
            // Start speaking animation
            startSpeaking(uniqueId);
        });
        
        // Handle mouth close event (TTS ended)
        socket.on('talking-heads:mouth-close', (data) => {
            console.log('Mouth close event:', data);
            
            const { uniqueId } = data;
            
            // Stop speaking animation
            stopSpeaking(uniqueId);
            
            // Remove talking head after a short delay
            setTimeout(() => {
                removeTalkingHead(uniqueId);
            }, HIDE_DELAY_AFTER_SPEAKING_MS); // Keep visible after speaking ends
        });
        
        // Handle status response
        socket.on('talking-heads:status', (data) => {
            console.log('Current status:', data);
            
            // Recreate any active talking heads
            if (data.active) {
                data.active.forEach(async (item) => {
                    // Request avatar data
                    try {
                        const response = await fetch(`/api/talking-heads/avatar/${item.uniqueId}`);
                        const avatarData = await response.json();
                        
                        if (avatarData.success) {
                            const element = createTalkingHead(item.uniqueId, item.username, avatarData.avatar);
                            activeTalkingHeads.set(item.uniqueId, element);
                            
                            if (item.isSpeaking) {
                                startSpeaking(item.uniqueId);
                            }
                        }
                    } catch (error) {
                        console.error('Failed to load avatar:', error);
                    }
                });
            }
        });
        
        // Handle config updates
        socket.on('talking-heads:config-updated', (newConfig) => {
            console.log('Config updated:', newConfig);
            config.fadeInDuration = newConfig.fadeInDuration || config.fadeInDuration;
            config.fadeOutDuration = newConfig.fadeOutDuration || config.fadeOutDuration;
            config.blinkInterval = newConfig.blinkInterval || config.blinkInterval;
        });
    }
    
    // Initialize
    connect();
});
