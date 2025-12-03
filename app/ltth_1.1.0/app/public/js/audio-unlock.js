/**
 * Audio Unlock Manager
 * Handles browser autoplay restrictions by unlocking audio on first user interaction
 * Supports both AudioContext and HTML5 Audio elements
 */

class AudioUnlockManager {
    constructor() {
        this.unlocked = false;
        this.audioContext = null;
        this.silentBuffer = null;
        this.listeners = [];
        this.unlockAttempts = 0;
        this.maxAttempts = 3;
        this.init();
    }

    init() {
        console.log('[AudioUnlock] Initializing audio unlock system...');

        // Listen for first user interaction
        const events = ['click', 'touchstart', 'keydown'];
        events.forEach(event => {
            document.addEventListener(event, () => this.unlock(), { once: true });
        });

        // Also try to unlock immediately (may work in some browsers)
        if (document.readyState === 'complete') {
            setTimeout(() => this.tryPassiveUnlock(), 100);
        } else {
            window.addEventListener('load', () => {
                setTimeout(() => this.tryPassiveUnlock(), 100);
            });
        }
    }

    async tryPassiveUnlock() {
        console.log('[AudioUnlock] Attempting passive unlock (may show browser warnings - this is expected)...');
        // Try without user gesture - may work in some browsers
        // Note: Browser warnings about AudioContext are expected and normal here
        try {
            await this.performUnlock();
        } catch (error) {
            console.log('[AudioUnlock] Passive unlock not allowed (expected), waiting for user interaction');
        }
    }

    async unlock() {
        if (this.unlocked) {
            console.log('[AudioUnlock] Already unlocked');
            return;
        }

        this.unlockAttempts++;
        console.log(`[AudioUnlock] Unlock attempt ${this.unlockAttempts}/${this.maxAttempts}`);

        try {
            await this.performUnlock();
        } catch (error) {
            console.warn(`[AudioUnlock] Unlock attempt ${this.unlockAttempts} failed:`, error);

            if (this.unlockAttempts >= this.maxAttempts) {
                console.error('[AudioUnlock] Max unlock attempts reached, showing manual unlock button');
                this.showUnlockButton();
            }
        }
    }

    async performUnlock() {
        try {
            // Create AudioContext (browser may show warnings if called without user gesture - this is normal)
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!this.audioContext && AudioContext) {
                this.audioContext = new AudioContext();
                console.log('[AudioUnlock] AudioContext created, state:', this.audioContext.state);
            }

            // Resume if suspended (browser may show warnings if called without user gesture - this is normal)
            if (this.audioContext && this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
                console.log('[AudioUnlock] AudioContext resumed, state:', this.audioContext.state);
            }

            // Create and play silent buffer
            if (this.audioContext && !this.silentBuffer) {
                this.silentBuffer = this.audioContext.createBuffer(1, 1, 22050);
                const source = this.audioContext.createBufferSource();
                source.buffer = this.silentBuffer;
                source.connect(this.audioContext.destination);
                source.start(0);
                console.log('[AudioUnlock] Silent buffer played');
            }

            // Also unlock HTML5 Audio
            const audio = new Audio();
            audio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
            audio.volume = 0.01; // Very quiet

            const playPromise = audio.play();
            if (playPromise !== undefined) {
                await playPromise;
                audio.pause();
                audio.remove();
                console.log('[AudioUnlock] HTML5 Audio unlocked');
            }

            // Mark as unlocked
            this.unlocked = true;
            window.audioUnlocked = true;

            // Notify all listeners
            this.listeners.forEach(cb => {
                try {
                    cb();
                } catch (error) {
                    console.error('[AudioUnlock] Listener callback error:', error);
                }
            });

            // Emit custom event
            window.dispatchEvent(new CustomEvent('audio-unlocked', {
                detail: {
                    audioContext: this.audioContext,
                    timestamp: Date.now()
                }
            }));

            console.log('✅ [AudioUnlock] Audio unlocked successfully!');

            // Remove unlock button if it exists
            const btn = document.getElementById('audio-unlock-btn');
            if (btn) btn.remove();

        } catch (error) {
            console.error('[AudioUnlock] Unlock failed:', error);
            throw error;
        }
    }

    showUnlockButton() {
        // Don't show button if already unlocked or button already exists
        if (this.unlocked || document.getElementById('audio-unlock-btn')) {
            return;
        }

        const btn = document.createElement('button');
        btn.id = 'audio-unlock-btn';
        btn.innerHTML = `
            <svg style="width:24px;height:24px;margin-right:8px;" viewBox="0 0 24 24" fill="currentColor">
                <path d="M14,3.23V5.29C16.89,6.15 19,8.83 19,12C19,15.17 16.89,17.85 14,18.71V20.77C18,19.86 21,16.28 21,12C21,7.72 18,4.14 14,3.23M16.5,12C16.5,10.23 15.5,8.71 14,7.97V16C15.5,15.29 16.5,13.76 16.5,12M3,9V15H7L12,20V4L7,9H3Z" />
            </svg>
            🔊 Audio aktivieren
        `;
        btn.style.cssText = `
            position: fixed;
            top: 80px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 99999;
            padding: 12px 24px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 12px;
            cursor: pointer;
            font-size: 16px;
            font-weight: bold;
            box-shadow: 0 8px 24px rgba(0,0,0,0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            transition: all 0.3s ease;
            animation: pulse 2s infinite;
        `;

        // Add CSS animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes pulse {
                0%, 100% { transform: translateX(-50%) scale(1); }
                50% { transform: translateX(-50%) scale(1.05); }
            }
            #audio-unlock-btn:hover {
                transform: translateX(-50%) scale(1.08) !important;
                box-shadow: 0 12px 32px rgba(0,0,0,0.5) !important;
            }
        `;
        document.head.appendChild(style);

        btn.onclick = async () => {
            console.log('[AudioUnlock] Manual unlock button clicked');
            try {
                await this.performUnlock();
                btn.style.opacity = '0';
                setTimeout(() => btn.remove(), 300);
            } catch (error) {
                console.error('[AudioUnlock] Manual unlock failed:', error);
                btn.textContent = '❌ Fehler - Bitte erneut versuchen';
                btn.style.background = '#ef4444';
                setTimeout(() => {
                    btn.innerHTML = `
                        <svg style="width:24px;height:24px;margin-right:8px;" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M14,3.23V5.29C16.89,6.15 19,8.83 19,12C19,15.17 16.89,17.85 14,18.71V20.77C18,19.86 21,16.28 21,12C21,7.72 18,4.14 14,3.23M16.5,12C16.5,10.23 15.5,8.71 14,7.97V16C15.5,15.29 16.5,13.76 16.5,12M3,9V15H7L12,20V4L7,9H3Z" />
                        </svg>
                        🔊 Audio aktivieren
                    `;
                    btn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                }, 2000);
            }
        };

        document.body.appendChild(btn);
        console.log('[AudioUnlock] Manual unlock button displayed');
    }

    onUnlock(callback) {
        if (this.unlocked) {
            // Already unlocked, call immediately
            callback();
        } else {
            // Add to listeners
            this.listeners.push(callback);
        }
    }

    getAudioContext() {
        return this.audioContext;
    }

    isUnlocked() {
        return this.unlocked;
    }
}

// Initialize global audio unlock manager
if (typeof window !== 'undefined') {
    window.audioUnlockManager = new AudioUnlockManager();
    window.audioUnlocked = false; // Will be set to true when unlocked

    // Helper function for safe audio playback
    window.playSafeAudio = async (audioElement) => {
        if (!window.audioUnlocked) {
            console.warn('[AudioUnlock] Audio not unlocked yet, waiting for user interaction');
            window.audioUnlockManager.showUnlockButton();
            return false;
        }

        try {
            await audioElement.play();
            return true;
        } catch (error) {
            console.error('[AudioUnlock] Audio playback failed:', error);
            return false;
        }
    };

    console.log('[AudioUnlock] Audio unlock manager initialized and ready');
}
