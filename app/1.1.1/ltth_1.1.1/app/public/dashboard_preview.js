/**
 * Dashboard Preview Client
 * 
 * Handles client-side audio preview for the soundboard system.
 * Connects to the server via WebSocket and plays audio when preview events are received.
 * 
 * Security:
 * - Only plays audio from whitelisted sources (validated by server)
 * - No unsafe DOM manipulation
 * - Uses HTML5 audio element for playback
 */

(function() {
    'use strict';

    // Configuration
    const CONFIG = {
        AUDIO_ELEMENT_ID: 'preview-audio',
        MAX_VOLUME: 1.0,
        DEFAULT_VOLUME: 0.8,
        RECONNECT_DELAY: 3000,
        DEBUG: false
    };

    // State
    let socket = null;
    let audioElement = null;
    let isIdentified = false;

    /**
     * Log helper
     */
    function log(message, ...args) {
        if (CONFIG.DEBUG) {
            console.log('[Dashboard Preview]', message, ...args);
        }
    }

    /**
     * Initialize the audio preview system
     */
    function init() {
        log('Initializing dashboard preview client...');

        // Get or create audio element
        audioElement = document.getElementById(CONFIG.AUDIO_ELEMENT_ID);
        if (!audioElement) {
            log('Audio element not found, creating one...');
            audioElement = document.createElement('audio');
            audioElement.id = CONFIG.AUDIO_ELEMENT_ID;
            audioElement.controls = true;
            audioElement.style.display = 'none'; // Hidden by default
            audioElement.volume = CONFIG.DEFAULT_VOLUME;
            document.body.appendChild(audioElement);
        }

        // Setup audio element event listeners
        setupAudioListeners();

        // Connect to Socket.IO (should already be connected from global socket)
        if (window.socket && window.socket.connected) {
            socket = window.socket;
            log('Using existing Socket.IO connection');
            identifyAsDashboard();
        } else {
            log('No existing Socket.IO connection found, waiting...');
            // Wait for socket to be available
            waitForSocket();
        }
    }

    /**
     * Wait for global socket to be available
     */
    function waitForSocket() {
        const checkInterval = setInterval(() => {
            if (window.socket && window.socket.connected) {
                clearInterval(checkInterval);
                socket = window.socket;
                log('Socket.IO connection detected');
                identifyAsDashboard();
            }
        }, 100);

        // Timeout after 10 seconds
        setTimeout(() => {
            clearInterval(checkInterval);
            if (!socket) {
                console.error('[Dashboard Preview] Socket.IO connection timeout');
            }
        }, 10000);
    }

    /**
     * Identify this client as a dashboard client to the server
     */
    function identifyAsDashboard() {
        if (!socket) {
            log('Cannot identify - no socket connection');
            return;
        }

        log('Identifying as dashboard client...');
        socket.emit('soundboard:identify', { client: 'dashboard' });

        // Listen for identification confirmation
        socket.once('soundboard:identified', (data) => {
            isIdentified = true;
            log('Identified successfully:', data);
        });

        // Setup preview event listener
        socket.on('soundboard:preview', handlePreviewEvent);

        // Handle reconnection
        socket.on('reconnect', () => {
            log('Socket reconnected, re-identifying...');
            isIdentified = false;
            identifyAsDashboard();
        });
    }

    /**
     * Setup audio element event listeners
     */
    function setupAudioListeners() {
        if (!audioElement) return;

        audioElement.addEventListener('loadstart', () => {
            log('Loading audio...');
        });

        audioElement.addEventListener('loadedmetadata', () => {
            log('Audio metadata loaded, duration:', audioElement.duration);
        });

        audioElement.addEventListener('canplay', () => {
            log('Audio ready to play');
        });

        audioElement.addEventListener('playing', () => {
            log('Audio playing');
            showNotification('🔊 Preview playing');
        });

        audioElement.addEventListener('pause', () => {
            log('Audio paused');
        });

        audioElement.addEventListener('ended', () => {
            log('Audio ended');
            hideAudioPlayer();
        });

        audioElement.addEventListener('error', (e) => {
            const error = audioElement.error;
            console.error('[Dashboard Preview] Audio error:', {
                code: error?.code,
                message: error?.message,
                src: audioElement.src
            });
            showNotification('❌ Audio preview error', 'error');
            hideAudioPlayer();
        });
    }

    /**
     * Handle preview event from server
     */
    function handlePreviewEvent(message) {
        log('Preview event received:', message);

        if (!message || !message.payload) {
            console.error('[Dashboard Preview] Invalid preview message:', message);
            return;
        }

        const { sourceType, filename, url } = message.payload;

        if (!sourceType) {
            console.error('[Dashboard Preview] Missing sourceType in payload');
            return;
        }

        // Determine audio source URL
        let audioSrc = null;

        if (sourceType === 'local') {
            if (!filename) {
                console.error('[Dashboard Preview] Missing filename for local source');
                return;
            }
            // Construct path to local file
            audioSrc = `/sounds/${encodeURIComponent(filename)}`;
            log('Playing local file:', audioSrc);
        } else if (sourceType === 'url') {
            if (!url) {
                console.error('[Dashboard Preview] Missing url for external source');
                return;
            }
            // Use external URL directly (already validated by server)
            audioSrc = url;
            log('Playing external URL:', audioSrc);
        } else {
            console.error('[Dashboard Preview] Unknown sourceType:', sourceType);
            return;
        }

        // Play the audio
        playAudio(audioSrc);
    }

    /**
     * Play audio from given source
     */
    function playAudio(src) {
        if (!audioElement) {
            console.error('[Dashboard Preview] Audio element not available');
            return;
        }

        // Stop current playback if any
        if (!audioElement.paused) {
            audioElement.pause();
        }

        // Set new source (no direct DOM innerHTML manipulation - safe)
        audioElement.src = src;

        // Show audio player
        showAudioPlayer();

        // Attempt to play
        const playPromise = audioElement.play();

        if (playPromise !== undefined) {
            playPromise
                .then(() => {
                    log('Playback started successfully');
                })
                .catch((error) => {
                    console.error('[Dashboard Preview] Playback failed:', error);
                    
                    // Handle autoplay blocking
                    if (error.name === 'NotAllowedError') {
                        showNotification('⚠️ Autoplay blocked - click to play', 'warning');
                        // Audio player is visible, user can click play button
                    } else {
                        showNotification('❌ Playback error', 'error');
                        hideAudioPlayer();
                    }
                });
        }
    }

    /**
     * Show audio player
     */
    function showAudioPlayer() {
        if (audioElement) {
            audioElement.style.display = 'block';
            log('Audio player shown');
        }
    }

    /**
     * Hide audio player
     */
    function hideAudioPlayer() {
        if (audioElement) {
            audioElement.style.display = 'none';
            log('Audio player hidden');
        }
    }

    /**
     * Show notification to user (if notification system exists)
     */
    function showNotification(message, type = 'info') {
        // Try to use existing notification system
        if (typeof window.showToast === 'function') {
            window.showToast(message);
        } else if (typeof window.showNotification === 'function') {
            window.showNotification(message, type);
        } else {
            log('Notification:', message, type);
        }
    }

    /**
     * Public API
     */
    window.DashboardPreviewClient = {
        init: init,
        isConnected: () => socket && socket.connected,
        isIdentified: () => isIdentified,
        getAudioElement: () => audioElement,
        
        // Manual controls
        play: (src) => playAudio(src),
        stop: () => {
            if (audioElement && !audioElement.paused) {
                audioElement.pause();
                hideAudioPlayer();
            }
        },
        setVolume: (volume) => {
            if (audioElement) {
                audioElement.volume = Math.max(0, Math.min(CONFIG.MAX_VOLUME, volume));
            }
        },
        getVolume: () => audioElement ? audioElement.volume : 0,
        
        // Debug
        enableDebug: () => { CONFIG.DEBUG = true; },
        disableDebug: () => { CONFIG.DEBUG = false; }
    };

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    log('Dashboard preview client loaded');
})();
