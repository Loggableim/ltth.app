/**
 * Soundboard UI JavaScript
 * Works both as standalone version for /soundboard/ui page and when included in main dashboard
 */
{
// Structured logger for this module.
/* global FrontendLogger */
const log = (typeof FrontendLogger !== 'undefined')
    ? FrontendLogger.createLogger('Soundboard')
    : { debug: Function.prototype, info: Function.prototype, warn: Function.prototype, error: Function.prototype };

// Socket connection
// Reuse existing socket from dashboard.js (window.socket) if available,
// otherwise create new connection for standalone /soundboard/ui page
const socket = window.socket || io();

// Add connection status logging
socket.on('connect', () => {
    log.info('Socket.io connected', { id: socket.id });
    
    // Identify as dashboard client for preview sound support
    socket.emit('soundboard:identify', { client: 'dashboard' });
    log.info('Sent identification as dashboard client');
});

socket.on('soundboard:identified', (data) => {
    log.info('Identified by server', data);
});

socket.on('disconnect', (reason) => {
    log.warn('Socket.io disconnected', { reason });
});

socket.on('connect_error', (error) => {
    log.error('Socket.io connection error', { error: error?.message || String(error) });
});

// Helper function to escape HTML and prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Helper function to generate unique IDs for sound controls
let soundIdCounter = 0;
function generateUniqueSoundId() {
    return `sound-${Date.now()}-${++soundIdCounter}`;
}

// Audio pool for soundboard playback
let audioPool = [];
let giftRecommendationsCache = [];

// Dedicated preview audio element (reused to prevent multiple simultaneous previews)
let previewAudio = null;
let isPreviewPlaying = false;

// Queue management for playback modes
let globalSoundQueue = [];           // Global queue for 'queue-all' mode
let perGiftSoundQueues = {};         // Per-gift queues for 'queue-per-gift' mode { giftId: { queue: [], isProcessing: false } }
let isProcessingGlobalQueue = false;
let currentPlayMode = 'overlap';     // Default to overlap mode ('overlap', 'queue-all', 'queue-per-gift')
let currentMaxQueueLength = 10;
let activeAnimationInput = null;
const MAX_GIFT_REPEAT_PLAYS = 50;

// ========== WORKSPACE NAVIGATION ==========
let currentWorkspaceView = 'overview';
let workspaceDirty = false;

function setWorkspaceDirty(isDirty = true) {
    workspaceDirty = isDirty;
    const saveState = document.getElementById('soundboard-save-state');
    if (saveState) {
        saveState.textContent = workspaceDirty ? 'Unsaved changes' : 'All settings saved';
        saveState.style.color = workspaceDirty ? '#f59e0b' : '';
    }
}

function updateWorkspaceOverview() {
    const giftCount = document.getElementById('overview-gift-count');
    if (giftCount) {
        giftCount.textContent = String(giftsCache.length || 0);
    }

    const enabledState = document.getElementById('overview-enabled-state');
    const enabledInput = document.getElementById('soundboard-enabled');
    if (enabledState && enabledInput) {
        enabledState.textContent = enabledInput.checked ? 'Enabled' : 'Disabled';
    }

    const obsState = document.getElementById('overview-obs-state');
    const overlayUrl = document.getElementById('animation-overlay-url');
    if (obsState && overlayUrl) {
        obsState.textContent = overlayUrl.value ? 'Ready' : 'Loading';
    }
}

async function loadGiftRecommendations() {
    const container = document.getElementById('gift-recommendations-list');
    if (!container) return;

    container.innerHTML = '<div class="text-gray-400 text-sm">Loading recommendations...</div>';

    try {
        giftRecommendationsCache = await fetchGiftRecommendations();
        renderGiftRecommendations();
    } catch (error) {
        log.error('Error loading gift recommendations', { error: error.message });
        container.innerHTML = '<div class="text-red-400 text-sm">Could not load recommendations.</div>';
    }
}

async function fetchGiftRecommendations() {
    const response = await fetch('/api/soundboard/recommendations/unconfigured-gifts?limit=10&lookback=5000');
    const contentType = response.headers.get('content-type') || '';

    if (response.ok && contentType.includes('application/json')) {
        const result = await response.json();
        if (result.success) {
            return result.recommendations || [];
        }
        throw new Error(result.error || 'Failed to load recommendations');
    }

    // Older running servers do not have the new plugin route until restart.
    // Fall back to the existing event log API so the UI still works after a refresh.
    return fetchGiftRecommendationsFromEventLogs();
}

async function fetchGiftRecommendationsFromEventLogs() {
    const [giftSoundsResponse, eventLogsResponse] = await Promise.all([
        fetch('/api/soundboard/gifts'),
        fetch('/api/event-logs?type=gift&limit=1000')
    ]);

    if (!giftSoundsResponse.ok || !eventLogsResponse.ok) {
        throw new Error('Recommendation fallback APIs are unavailable');
    }

    const configuredGifts = await giftSoundsResponse.json();
    const eventLogResult = await eventLogsResponse.json();
    const configuredIds = new Set((configuredGifts || []).map(gift => Number(gift.giftId)));
    const grouped = new Map();

    (eventLogResult.logs || []).forEach(row => {
        const gift = normalizeRecommendationGift(row.data || {});
        if (!gift.giftId || configuredIds.has(Number(gift.giftId))) {
            return;
        }

        const existing = grouped.get(gift.giftId) || {
            giftId: gift.giftId,
            label: gift.label || `Gift ${gift.giftId}`,
            imageUrl: gift.imageUrl || null,
            diamondCount: gift.diamondCount || null,
            dropCount: 0,
            repeatCount: 0,
            lastDroppedAt: row.timestamp || null
        };

        existing.dropCount += 1;
        existing.repeatCount += gift.repeatCount || 1;
        if (!existing.lastDroppedAt || (row.timestamp && row.timestamp > existing.lastDroppedAt)) {
            existing.lastDroppedAt = row.timestamp;
        }
        grouped.set(gift.giftId, existing);
    });

    return Array.from(grouped.values())
        .sort((a, b) => {
            if (b.repeatCount !== a.repeatCount) return b.repeatCount - a.repeatCount;
            return b.dropCount - a.dropCount;
        })
        .slice(0, 10);
}

function normalizeRecommendationGift(data = {}) {
    const gift = data.giftDetails || data.gift || data.giftInfo || {};
    const giftId = parseInt(
        data.giftId || data.gift_id || gift.giftId || gift.gift_id || gift.id || data.id,
        10
    );
    const repeatCount = parseInt(
        data.repeatCount || data.repeat_count || data.comboCount || data.combo_count ||
        data.giftCount || data.gift_count || gift.repeatCount || gift.repeat_count ||
        gift.giftCount || gift.gift_count || data.count || gift.count || 1,
        10
    );
    const diamondCount = parseInt(
        data.diamondCount || data.diamond_count || gift.diamondCount || gift.diamond_count || gift.diamonds || data.diamonds,
        10
    );

    return {
        giftId: Number.isFinite(giftId) ? giftId : null,
        label: data.giftName || data.gift_name || gift.giftName || gift.gift_name || gift.name || data.name,
        imageUrl: data.giftPictureUrl || data.gift_image || gift.giftPictureUrl || gift.imageUrl || gift.image || gift.icon || null,
        diamondCount: Number.isFinite(diamondCount) ? diamondCount : null,
        repeatCount: Number.isFinite(repeatCount) && repeatCount > 0 ? repeatCount : 1
    };
}

function renderGiftRecommendations() {
    const container = document.getElementById('gift-recommendations-list');
    if (!container) return;

    if (giftRecommendationsCache.length === 0) {
        container.innerHTML = '<div class="text-gray-400 text-sm">No recommendations yet. Gifts need to be dropped first, and already configured gifts are excluded.</div>';
        return;
    }

    container.innerHTML = '';
    giftRecommendationsCache.forEach(gift => {
        const card = document.createElement('div');
        card.className = 'gift-recommendation-card';
        card.innerHTML = `
            <div class="gift-recommendation-image">
                ${gift.imageUrl ? `<img src="${escapeHtml(gift.imageUrl)}" alt="${escapeHtml(gift.label)}">` : '🎁'}
            </div>
            <div style="min-width: 0;">
                <div class="gift-recommendation-title">${escapeHtml(gift.label)}</div>
                <div class="gift-recommendation-meta">
                    ${gift.repeatCount || gift.dropCount} received · ${gift.dropCount} drops · ID ${gift.giftId}
                    ${gift.diamondCount ? ` · 💎 ${gift.diamondCount}` : ''}
                </div>
            </div>
            <button class="btn btn-sm btn-primary" type="button" data-action="configure-recommended-gift" data-gift-id="${gift.giftId}">
                Configure
            </button>
        `;
        container.appendChild(card);
    });

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function configureRecommendedGift(giftId) {
    const gift = giftRecommendationsCache.find(item => Number(item.giftId) === Number(giftId));
    if (!gift) return;

    selectGift({
        id: gift.giftId,
        name: gift.label,
        image_url: gift.imageUrl || null,
        diamond_count: gift.diamondCount || 0
    });
    switchSoundboardWorkspace('gift-mapping');
}

function switchSoundboardWorkspace(viewName) {
    currentWorkspaceView = viewName || 'overview';

    document.querySelectorAll('[data-soundboard-view]').forEach(button => {
        button.classList.toggle('active', button.dataset.soundboardView === currentWorkspaceView);
    });

    document.querySelectorAll('[data-workspace-panel]').forEach(panel => {
        panel.classList.toggle('active', panel.dataset.workspacePanel === currentWorkspaceView);
    });

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function initializeSoundboardWorkspace() {
    const simpleSearchSlot = document.getElementById('library-simple-search-slot');
    const simpleSearch = document.querySelector('.myinstants-search');
    if (simpleSearchSlot && simpleSearch) {
        simpleSearchSlot.appendChild(simpleSearch);
    }

    const gifSearchSlot = document.getElementById('library-gif-search-slot');
    const gifSearch = document.querySelector('.gif-search');
    if (gifSearchSlot && gifSearch) {
        gifSearchSlot.appendChild(gifSearch);
    }

    document.querySelectorAll('[data-soundboard-view]').forEach(button => {
        button.addEventListener('click', () => {
            switchSoundboardWorkspace(button.dataset.soundboardView);
        });
    });

    document.querySelectorAll('[data-save-proxy]').forEach(button => {
        button.addEventListener('click', () => {
            const saveButton = document.getElementById('save-soundboard-btn');
            if (saveButton) saveButton.click();
        });
    });

    const workspaceRoot = document.querySelector('.soundboard-workspace');
    if (workspaceRoot) {
        workspaceRoot.addEventListener('input', event => {
            const target = event.target;
            if (target && target.matches && target.matches('input, select, textarea')) {
                setWorkspaceDirty(true);
                updateWorkspaceOverview();
            }
        });
        workspaceRoot.addEventListener('change', event => {
            const target = event.target;
            if (target && target.matches && target.matches('input, select, textarea')) {
                setWorkspaceDirty(true);
                updateWorkspaceOverview();
            }
        });
    }

    switchSoundboardWorkspace(currentWorkspaceView);
}

// ========== SOCKET EVENTS ==========
socket.on('soundboard:play', (data) => {
    log.info('Received soundboard:play event', data);
    
    // Check the audio target setting
    // audioTarget can be: 'dashboard', 'obs_overlay', or 'both'
    // For dashboard, we play if target is 'dashboard' or 'both'
    // Preview sounds (eventType: 'preview' or 'test') always play in dashboard
    const audioTarget = data.audioTarget || 'both';
    const isPreviewOrTest = data.eventType === 'preview' || data.eventType === 'test';
    
    if (isPreviewOrTest || audioTarget === 'dashboard' || audioTarget === 'both') {
        playDashboardSoundboard(data);
        logAudioEvent('play', `Playing sound: ${data.label} (target: ${audioTarget})`, data, true);
    } else {
        log.info(`Skipping playback - audio target is '${audioTarget}', not dashboard`, { label: data.label });
        logAudioEvent('info', `Skipped sound: ${data.label} (target: ${audioTarget}, plays in OBS overlay)`, data, true);
    }
});

socket.on('soundboard:preview', (payload) => {
    log.info('Received soundboard:preview event', payload);
    logAudioEvent('preview', `Preview request received`, payload, true);
    
    // Note: Preview events have a nested structure from transport-ws.js:
    // { type: 'preview-sound', payload: { sourceType, filename/url, timestamp } }
    if (!payload || !payload.payload) {
        log.error('Invalid preview payload structure', { payload });
        return;
    }
    
    const previewData = payload.payload;
    
    // Validate sourceType
    if (!previewData.sourceType) {
        log.error('Missing sourceType in preview', { previewData });
        return;
    }
    
    // Prepare common playback data
    let soundData;
    
    if (previewData.sourceType === 'local') {
        if (!previewData.filename) {
            log.error('Missing filename in local preview', { previewData });
            return;
        }
        soundData = {
            url: `/sounds/${previewData.filename}`,
            volume: 1.0,
            label: 'Preview (Local)',
            eventType: 'preview'
        };
    } else if (previewData.sourceType === 'url') {
        if (!previewData.url) {
            log.error('Missing URL in preview', { previewData });
            return;
        }
        soundData = {
            url: previewData.url,
            volume: 1.0,
            label: 'Preview (URL)',
            eventType: 'preview'
        };
    } else {
        log.error('Unknown preview sourceType', { sourceType: previewData.sourceType });
        return;
    }
    
    // Play the sound
    playDashboardSoundboard(soundData);
});

// ========== AUDIO PLAYBACK ==========
function playDashboardSoundboard(data) {
    log.info('Received sound', { label: data.label, mode: currentPlayMode, giftId: data.giftId || null });
    logAudioEvent('info', `Received sound: ${data.label} (mode: ${currentPlayMode}, giftId: ${data.giftId || 'none'})`, { url: data.url, volume: data.volume }, true);

    expandGiftRepeats(data).forEach(soundData => queueOrPlaySound(soundData));
}

function queueOrPlaySound(data) {
    const enforceQueueLimit = !data.repeatIndex || data.repeatIndex === 1;

    // Check play mode
    if (currentPlayMode === 'queue-all') {
        // Global queue - all sounds are queued sequentially
        if (!enqueueSound(globalSoundQueue, data, 'global queue', { enforceLimit: enforceQueueLimit })) {
            return;
        }
        logAudioEvent('info', `Added to global queue: ${data.label} (queue length: ${globalSoundQueue.length})`, null, true);
        
        // Start processing if not already processing
        if (!isProcessingGlobalQueue) {
            processGlobalQueue();
        }
    } else if (currentPlayMode === 'queue-per-gift') {
        // Per-gift/event queue - sounds of the same type queue together, different types play simultaneously
        const queueKey = getQueueKey(data);
        
        // Initialize queue for this gift/event type if it doesn't exist
        if (!perGiftSoundQueues[queueKey]) {
            perGiftSoundQueues[queueKey] = {
                queue: [],
                isProcessing: false
            };
        }
        
        // Add to this gift's queue
        if (!enqueueSound(perGiftSoundQueues[queueKey].queue, data, queueKey, { enforceLimit: enforceQueueLimit })) {
            return;
        }
        logAudioEvent('info', `Added to queue "${queueKey}": ${data.label} (queue length: ${perGiftSoundQueues[queueKey].queue.length})`, null, true);
        
        // Start processing this queue if not already processing
        if (!perGiftSoundQueues[queueKey].isProcessing) {
            processPerGiftQueue(queueKey);
        }
    } else {
        // Overlap mode - play immediately (original behavior)
        playSound(data);
    }
}

function normalizeGiftRepeatCount(data) {
    if (!data || data.eventType !== 'gift') {
        return 1;
    }

    const parsed = parseInt(data.repeatCount, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
        return 1;
    }

    return Math.min(parsed, MAX_GIFT_REPEAT_PLAYS);
}

function expandGiftRepeats(data) {
    const repeatCount = normalizeGiftRepeatCount(data);
    if (repeatCount === 1) {
        return [data];
    }

    logAudioEvent('info', `Expanding gift repeatCount ${repeatCount} for ${data.label}`, null, true);
    return Array.from({ length: repeatCount }, (_, index) => ({
        ...data,
        repeatCount,
        repeatIndex: index + 1
    }));
}

function normalizeMaxQueueLength(value) {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
        return 10;
    }
    return Math.min(parsed, 50);
}

function updateCurrentMaxQueueLength(value) {
    currentMaxQueueLength = normalizeMaxQueueLength(value);
    log.info('Max queue length set', { maxQueueLength: currentMaxQueueLength });
    logAudioEvent('info', `Max queue length: ${currentMaxQueueLength}`, null);
}

function enqueueSound(queue, data, queueLabel, options = {}) {
    const enforceLimit = options.enforceLimit !== false;

    if (enforceLimit && queue.length >= currentMaxQueueLength) {
        log.warn('Sound queue full, dropping sound', {
            queue: queueLabel,
            label: data.label,
            maxQueueLength: currentMaxQueueLength
        });
        logAudioEvent('warning', `Queue "${queueLabel}" full (${currentMaxQueueLength}), dropped: ${data.label}`, { url: data.url }, true);
        return false;
    }

    queue.push(data);
    return true;
}

/**
 * Get the queue key for per-gift queue mode
 * Gifts use giftId, other events use eventType
 */
function getQueueKey(data) {
    if (data.giftId) {
        return `gift-${data.giftId}`;
    }
    if (data.eventType && data.eventType !== 'unknown') {
        return `event-${data.eventType}`;
    }
    // Fallback to URL-based key for manual/test sounds
    // Extract just the filename or path segment to keep keys short
    if (data.url) {
        try {
            const url = new URL(data.url, window.location.origin);
            const filename = url.pathname.split('/').pop() || 'unknown';
            return `url-${filename}`;
        } catch {
            // If URL parsing fails, use a simple hash of the URL
            const hash = data.url.split('').reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0);
            return `url-${Math.abs(hash)}`;
        }
    }
    return 'default';
}

/**
 * Process the global sound queue (for 'queue-all' mode)
 */
function processGlobalQueue() {
    if (globalSoundQueue.length === 0) {
        isProcessingGlobalQueue = false;
        logAudioEvent('info', 'Global queue empty, processing stopped', null);
        return;
    }
    
    isProcessingGlobalQueue = true;
    const data = globalSoundQueue.shift();
    logAudioEvent('info', `Processing from global queue: ${data.label} (${globalSoundQueue.length} remaining)`, null, true);
    
    playSound(data, () => {
        // Callback when sound finishes - play next in queue
        // Small delay between sounds to prevent audio overlap
        const INTER_SOUND_DELAY_MS = 100;
        setTimeout(() => processGlobalQueue(), INTER_SOUND_DELAY_MS);
    });
}

/**
 * Process a specific gift/event queue (for 'queue-per-gift' mode)
 */
function processPerGiftQueue(queueKey) {
    const queueData = perGiftSoundQueues[queueKey];
    
    if (!queueData || queueData.queue.length === 0) {
        if (queueData) {
            queueData.isProcessing = false;
        }
        logAudioEvent('info', `Queue "${queueKey}" empty, processing stopped`, null);
        return;
    }
    
    queueData.isProcessing = true;
    const data = queueData.queue.shift();
    logAudioEvent('info', `Processing from queue "${queueKey}": ${data.label} (${queueData.queue.length} remaining)`, null, true);
    
    playSound(data, () => {
        // Callback when sound finishes - play next in this gift's queue
        // Small delay between sounds to prevent audio overlap
        const INTER_SOUND_DELAY_MS = 100;
        setTimeout(() => processPerGiftQueue(queueKey), INTER_SOUND_DELAY_MS);
    });
}

/**
 * Maximum time (ms) to wait for an audio element that has started playing to
 * fire `ended` or `error`. Prevents the queue from stalling on broken streams.
 */
const PLAY_STALL_TIMEOUT_MS = 60000;

/**
 * Play a single sound (used by all modes)
 * @param {Object} data - Sound data (url, volume, label, giftId, eventType)
 * @param {Function} onComplete - Callback when sound finishes (optional)
 */
function playSound(data, onComplete) {
    log.info('Playing sound', { label: data.label });
    logAudioEvent('info', `Playing sound: ${data.label}`, { url: data.url, volume: data.volume }, true);
    
    // Validate sound data
    if (!data || !data.url) {
        log.error('Invalid sound data - missing URL', { label: data?.label || 'unknown', data });
        logAudioEvent('error', `Invalid sound data - missing URL for: ${data?.label || 'unknown'}`, data, true);
        if (onComplete) onComplete();
        return;
    }
    
    // Create new audio element
    const audio = document.createElement('audio');
    audio.src = data.url;
    audio.volume = data.volume || 1.0;
    
    // CRITICAL: Append audio element to DOM for browser compatibility
    // Some browsers require audio elements to be in the DOM tree to play
    document.body.appendChild(audio);
    
    // Add to pool
    audioPool.push(audio);
    updateActiveSoundsCount();
    
    // Guard: ensure onComplete fires at most once regardless of which error/end
    // path triggers first (play() rejection, onerror, and onended can all fire).
    let completionFired = false;
    const safeComplete = () => {
        if (!completionFired) {
            completionFired = true;
            if (onComplete) onComplete();
        }
    };
    
    // Safety timeout: if the audio stalls after playback starts and never fires
    // ended/error, advance the queue anyway to prevent a permanent hang.
    let stallTimeoutId = null;
    const startStallTimeout = () => {
        stallTimeoutId = setTimeout(() => {
            log.warn('Audio stall timeout reached, advancing queue', { label: data.label });
            logAudioEvent('warning', `Audio stall timeout for ${data.label}, forcing queue advance`, { url: data.url }, true);
            cleanup();
            safeComplete();
        }, PLAY_STALL_TIMEOUT_MS);
    };
    
    // Helper function to clean up audio element
    const cleanup = () => {
        if (stallTimeoutId !== null) {
            clearTimeout(stallTimeoutId);
            stallTimeoutId = null;
        }
        // Remove from pool
        const index = audioPool.indexOf(audio);
        if (index > -1) {
            audioPool.splice(index, 1);
        }
        // Remove from DOM (modern method, more concise)
        if (audio.parentNode) {
            audio.remove();
        }
        updateActiveSoundsCount();
    };
    
    // Play
    audio.play().then(() => {
        log.info('Started playing', { label: data.label });
        logAudioEvent('success', `Successfully started: ${data.label}`, { url: data.url }, true);
        // Start stall guard only once playback is confirmed started.
        startStallTimeout();
    }).catch(err => {
        log.error('Playback error', { label: data.label, error: err.message });
        logAudioEvent('error', `Playback failed: ${err.message}`, { url: data.url, error: err }, true);
        cleanup();
        // Call onComplete even on error to continue queue
        safeComplete();
    });
    
    // Remove after playback
    audio.onended = () => {
        log.info('Finished playing', { label: data.label });
        logAudioEvent('info', `Finished playing: ${data.label}`, null);
        cleanup();
        
        // Call completion callback if provided
        safeComplete();
    };
    
    audio.onerror = (e) => {
        log.error('Audio element error', { label: data.label, type: e.type });
        logAudioEvent('error', `Audio error for ${data.label}: ${e.type}`, { url: data.url, error: e }, true);
        cleanup();
        
        // Call onComplete even on error to continue queue
        safeComplete();
    };
}

/**
 * Clear all queues (used when switching modes)
 */
function clearAllQueues() {
    const globalQueueCount = globalSoundQueue.length;
    let perGiftQueueCount = 0;
    
    // Clear global queue
    globalSoundQueue = [];
    isProcessingGlobalQueue = false;
    
    // Clear all per-gift queues
    for (const key in perGiftSoundQueues) {
        perGiftQueueCount += perGiftSoundQueues[key].queue.length;
    }
    perGiftSoundQueues = {};
    
    const totalCleared = globalQueueCount + perGiftQueueCount;
    if (totalCleared > 0) {
        logAudioEvent('warning', `Cleared ${totalCleared} queued sounds due to mode change`, null);
    }
}

// ========== SETTINGS ==========
async function loadSoundboardSettings() {
    try {
        const response = await fetch('/api/settings');
        const settings = await response.json();
        
        // Playback settings
        const soundboardEnabled = document.getElementById('soundboard-enabled');
        if (soundboardEnabled) soundboardEnabled.checked = settings.soundboard_enabled === 'true';
        
        // Audio playback target setting
        const audioTarget = document.getElementById('soundboard-audio-target');
        if (audioTarget) {
            audioTarget.value = settings.soundboard_audio_target || 'both';
            log.info('Audio target set', { value: audioTarget.value });
            logAudioEvent('info', `Audio target: ${audioTarget.value}`, null);
        }
        
        // Handle backwards compatibility: 'sequential' -> 'queue-all'
        let playModeValue = settings.soundboard_play_mode || 'overlap';
        if (playModeValue === 'sequential') {
            playModeValue = 'queue-all'; // Migrate old setting
            log.info('Migrated play mode from "sequential" to "queue-all"');
        }
        
        const playMode = document.getElementById('soundboard-play-mode');
        if (playMode) playMode.value = playModeValue;
        
        // Store the play mode for use in playback
        currentPlayMode = playModeValue;
        log.info('Play mode set', { mode: currentPlayMode });
        logAudioEvent('info', `Play mode: ${currentPlayMode}`, null);
        
        const maxQueue = document.getElementById('soundboard-max-queue');
        updateCurrentMaxQueueLength(settings.soundboard_max_queue_length || '10');
        if (maxQueue) maxQueue.value = String(currentMaxQueueLength);
        
        // Event sounds - Follow
        loadEventSoundSettings(settings, 'follow');
        
        // Event sounds - Subscribe
        loadEventSoundSettings(settings, 'subscribe');
        
        // Event sounds - Share
        loadEventSoundSettings(settings, 'share');
        loadAnimationSettings(settings, 'gift');
        loadAnimationSettings(settings, 'like');
        loadOverlayLayoutSettings(settings);
        
        // Default gift sound
        const giftUrl = document.getElementById('soundboard-gift-url');
        if (giftUrl) giftUrl.value = settings.soundboard_default_gift_sound || '';
        
        const giftVolume = document.getElementById('soundboard-gift-volume');
        const giftVolumeSlider = document.getElementById('soundboard-gift-volume-slider');
        const giftVolumeLabel = document.getElementById('soundboard-gift-volume-label');
        if (giftVolume) {
            const volumeValue = parseFloat(settings.soundboard_gift_volume || '1.0');
            giftVolume.value = volumeValue;
            if (giftVolumeSlider) giftVolumeSlider.value = Math.round(volumeValue * 100);
            if (giftVolumeLabel) giftVolumeLabel.textContent = `${Math.round(volumeValue * 100)}%`;
        }
        
        // Like threshold
        const likeUrl = document.getElementById('soundboard-like-url');
        if (likeUrl) likeUrl.value = settings.soundboard_like_sound || '';
        
        const likeVolume = document.getElementById('soundboard-like-volume');
        const likeVolumeSlider = document.getElementById('soundboard-like-volume-slider');
        const likeVolumeLabel = document.getElementById('soundboard-like-volume-label');
        if (likeVolume) {
            const volumeValue = parseFloat(settings.soundboard_like_volume || '1.0');
            likeVolume.value = volumeValue;
            if (likeVolumeSlider) likeVolumeSlider.value = Math.round(volumeValue * 100);
            if (likeVolumeLabel) likeVolumeLabel.textContent = `${Math.round(volumeValue * 100)}%`;
        }
        
        const likeThreshold = document.getElementById('soundboard-like-threshold');
        if (likeThreshold) likeThreshold.value = settings.soundboard_like_threshold || '0';
        
        const likeWindow = document.getElementById('soundboard-like-window');
        if (likeWindow) likeWindow.value = settings.soundboard_like_window_seconds || '10';

        updateWorkspaceOverview();
        setWorkspaceDirty(false);
        
    } catch (error) {
        log.error('Error loading soundboard settings', { error: error.message });
        logAudioEvent('error', `Failed to load settings: ${error.message}`, null);
        
        // Ensure currentPlayMode has a fallback value even if settings fail to load
        if (!currentPlayMode) {
            currentPlayMode = 'overlap';
            log.warn('Settings failed to load, using default play mode: overlap');
            logAudioEvent('warning', 'Using default play mode: overlap (settings failed to load)', null);
        }
    }
}

/**
 * Helper function to load event sound and animation settings
 */
function loadEventSoundSettings(settings, eventType) {
    // Sound URL
    const urlEl = document.getElementById(`soundboard-${eventType}-url`);
    if (urlEl) urlEl.value = settings[`soundboard_${eventType}_sound`] || '';
    
    // Sound Volume
    const volumeEl = document.getElementById(`soundboard-${eventType}-volume`);
    const volumeSliderEl = document.getElementById(`soundboard-${eventType}-volume-slider`);
    const volumeLabelEl = document.getElementById(`soundboard-${eventType}-volume-label`);
    if (volumeEl) {
        const volumeValue = parseFloat(settings[`soundboard_${eventType}_volume`] || '1.0');
        volumeEl.value = volumeValue;
        if (volumeSliderEl) volumeSliderEl.value = Math.round(volumeValue * 100);
        if (volumeLabelEl) volumeLabelEl.textContent = `${Math.round(volumeValue * 100)}%`;
    }
    
    // Animation URL
    const animUrlEl = document.getElementById(`soundboard-${eventType}-animation-url`);
    if (animUrlEl) animUrlEl.value = settings[`soundboard_${eventType}_animation_url`] || '';
    
    // Animation Type
    const animTypeEl = document.getElementById(`soundboard-${eventType}-animation-type`);
    if (animTypeEl) animTypeEl.value = settings[`soundboard_${eventType}_animation_type`] || 'none';
    
    // Animation Volume
    const animVolumeEl = document.getElementById(`soundboard-${eventType}-animation-volume`);
    const animVolumeSliderEl = document.getElementById(`soundboard-${eventType}-animation-volume-slider`);
    const animVolumeLabelEl = document.getElementById(`soundboard-${eventType}-animation-volume-label`);
    if (animVolumeEl) {
        const animVolumeValue = parseFloat(settings[`soundboard_${eventType}_animation_volume`] || '1.0');
        animVolumeEl.value = animVolumeValue;
        if (animVolumeSliderEl) animVolumeSliderEl.value = Math.round(animVolumeValue * 100);
        if (animVolumeLabelEl) animVolumeLabelEl.textContent = `${Math.round(animVolumeValue * 100)}%`;
    }
}

function loadAnimationSettings(settings, eventType) {
    const animUrlEl = document.getElementById(`soundboard-${eventType}-animation-url`);
    if (animUrlEl) animUrlEl.value = settings[`soundboard_${eventType}_animation_url`] || '';

    const animTypeEl = document.getElementById(`soundboard-${eventType}-animation-type`);
    if (animTypeEl) animTypeEl.value = settings[`soundboard_${eventType}_animation_type`] || 'none';

    const animVolumeEl = document.getElementById(`soundboard-${eventType}-animation-volume`);
    const animVolumeSliderEl = document.getElementById(`soundboard-${eventType}-animation-volume-slider`);
    const animVolumeLabelEl = document.getElementById(`soundboard-${eventType}-animation-volume-label`);
    if (animVolumeEl) {
        const animVolumeValue = parseFloat(settings[`soundboard_${eventType}_animation_volume`] || '1.0');
        animVolumeEl.value = animVolumeValue;
        if (animVolumeSliderEl) animVolumeSliderEl.value = Math.round(animVolumeValue * 100);
        if (animVolumeLabelEl) animVolumeLabelEl.textContent = `${Math.round(animVolumeValue * 100)}%`;
    }
}

function loadOverlayLayoutSettings(settings) {
    const values = {
        'soundboard-animation-x': settings.soundboard_animation_x || '50',
        'soundboard-animation-y': settings.soundboard_animation_y || '50',
        'soundboard-animation-width': settings.soundboard_animation_width || '45',
        'soundboard-animation-height': settings.soundboard_animation_height || '45',
        'soundboard-animation-duration': settings.soundboard_animation_duration || '5',
        'soundboard-animation-anchor': settings.soundboard_animation_anchor || 'center',
        'soundboard-animation-fit': settings.soundboard_animation_fit || 'contain'
    };

    Object.entries(values).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.value = value;
    });
}

function normalizeAnimationTypeForSave(urlEl, typeEl) {
    const url = urlEl?.value || '';
    const type = typeEl?.value || 'none';
    if (url && type === 'none') {
        const inferredType = inferAnimationTypeFromUrl(url);
        if (typeEl) typeEl.value = inferredType;
        return inferredType;
    }
    return type;
}

async function saveSoundboardSettings() {
    const soundboardEnabled = document.getElementById('soundboard-enabled');
    const audioTarget = document.getElementById('soundboard-audio-target');
    const playMode = document.getElementById('soundboard-play-mode');
    const maxQueue = document.getElementById('soundboard-max-queue');
    
    // Follow event
    const followUrl = document.getElementById('soundboard-follow-url');
    const followVolume = document.getElementById('soundboard-follow-volume');
    const followAnimUrl = document.getElementById('soundboard-follow-animation-url');
    const followAnimType = document.getElementById('soundboard-follow-animation-type');
    const followAnimVolume = document.getElementById('soundboard-follow-animation-volume');
    
    // Subscribe event
    const subscribeUrl = document.getElementById('soundboard-subscribe-url');
    const subscribeVolume = document.getElementById('soundboard-subscribe-volume');
    const subscribeAnimUrl = document.getElementById('soundboard-subscribe-animation-url');
    const subscribeAnimType = document.getElementById('soundboard-subscribe-animation-type');
    const subscribeAnimVolume = document.getElementById('soundboard-subscribe-animation-volume');
    
    // Share event
    const shareUrl = document.getElementById('soundboard-share-url');
    const shareVolume = document.getElementById('soundboard-share-volume');
    const shareAnimUrl = document.getElementById('soundboard-share-animation-url');
    const shareAnimType = document.getElementById('soundboard-share-animation-type');
    const shareAnimVolume = document.getElementById('soundboard-share-animation-volume');
    
    // Default gift sound
    const giftUrl = document.getElementById('soundboard-gift-url');
    const giftVolume = document.getElementById('soundboard-gift-volume');
    const giftAnimUrl = document.getElementById('soundboard-gift-animation-url');
    const giftAnimType = document.getElementById('soundboard-gift-animation-type');
    const giftAnimVolume = document.getElementById('soundboard-gift-animation-volume');
    
    // Like threshold
    const likeUrl = document.getElementById('soundboard-like-url');
    const likeVolume = document.getElementById('soundboard-like-volume');
    const likeAnimUrl = document.getElementById('soundboard-like-animation-url');
    const likeAnimType = document.getElementById('soundboard-like-animation-type');
    const likeAnimVolume = document.getElementById('soundboard-like-animation-volume');
    const likeThreshold = document.getElementById('soundboard-like-threshold');
    const likeWindow = document.getElementById('soundboard-like-window');
    const animationX = document.getElementById('soundboard-animation-x');
    const animationY = document.getElementById('soundboard-animation-y');
    const animationWidth = document.getElementById('soundboard-animation-width');
    const animationHeight = document.getElementById('soundboard-animation-height');
    const animationAnchor = document.getElementById('soundboard-animation-anchor');
    const animationDuration = document.getElementById('soundboard-animation-duration');
    const animationFit = document.getElementById('soundboard-animation-fit');
    
    const data = {
        soundboard_enabled: soundboardEnabled ? (soundboardEnabled.checked ? 'true' : 'false') : 'false',
        soundboard_audio_target: audioTarget?.value || 'both',
        soundboard_play_mode: playMode?.value || 'overlap',
        soundboard_max_queue_length: maxQueue?.value || '10',
        
        // Follow settings
        soundboard_follow_sound: followUrl?.value || '',
        soundboard_follow_volume: followVolume?.value || '1.0',
        soundboard_follow_animation_url: followAnimUrl?.value || '',
        soundboard_follow_animation_type: normalizeAnimationTypeForSave(followAnimUrl, followAnimType),
        soundboard_follow_animation_volume: followAnimVolume?.value || '1.0',
        
        // Subscribe settings
        soundboard_subscribe_sound: subscribeUrl?.value || '',
        soundboard_subscribe_volume: subscribeVolume?.value || '1.0',
        soundboard_subscribe_animation_url: subscribeAnimUrl?.value || '',
        soundboard_subscribe_animation_type: normalizeAnimationTypeForSave(subscribeAnimUrl, subscribeAnimType),
        soundboard_subscribe_animation_volume: subscribeAnimVolume?.value || '1.0',
        
        // Share settings
        soundboard_share_sound: shareUrl?.value || '',
        soundboard_share_volume: shareVolume?.value || '1.0',
        soundboard_share_animation_url: shareAnimUrl?.value || '',
        soundboard_share_animation_type: normalizeAnimationTypeForSave(shareAnimUrl, shareAnimType),
        soundboard_share_animation_volume: shareAnimVolume?.value || '1.0',
        
        // Default gift sound
        soundboard_default_gift_sound: giftUrl?.value || '',
        soundboard_gift_volume: giftVolume?.value || '1.0',
        soundboard_gift_animation_url: giftAnimUrl?.value || '',
        soundboard_gift_animation_type: normalizeAnimationTypeForSave(giftAnimUrl, giftAnimType),
        soundboard_gift_animation_volume: giftAnimVolume?.value || '1.0',
        
        // Like threshold
        soundboard_like_sound: likeUrl?.value || '',
        soundboard_like_volume: likeVolume?.value || '1.0',
        soundboard_like_animation_url: likeAnimUrl?.value || '',
        soundboard_like_animation_type: normalizeAnimationTypeForSave(likeAnimUrl, likeAnimType),
        soundboard_like_animation_volume: likeAnimVolume?.value || '1.0',
        soundboard_like_threshold: likeThreshold?.value || '0',
        soundboard_like_window_seconds: likeWindow?.value || '10',

        // OBS animation layout
        soundboard_animation_x: animationX?.value || '50',
        soundboard_animation_y: animationY?.value || '50',
        soundboard_animation_width: animationWidth?.value || '45',
        soundboard_animation_height: animationHeight?.value || '45',
        soundboard_animation_anchor: animationAnchor?.value || 'center',
        soundboard_animation_duration: animationDuration?.value || '5',
        soundboard_animation_fit: animationFit?.value || 'contain'
    };

    try {
        updateCurrentMaxQueueLength(data.soundboard_max_queue_length);
        if (maxQueue) maxQueue.value = String(currentMaxQueueLength);

        const response = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            alert('✅ Soundboard settings saved successfully!');
            logAudioEvent('success', 'Settings saved successfully', null);
            setWorkspaceDirty(false);
            updateWorkspaceOverview();
        }
    } catch (error) {
        log.error('Error saving soundboard settings', { error: error.message });
        alert('❌ Error saving soundboard settings!');
        logAudioEvent('error', `Failed to save settings: ${error.message}`, null);
    }
}

// Initialize event sound sliders
function initializeEventSoundSliders() {
    // Helper function to setup a slider
    const setupSlider = (sliderId, inputId, labelId) => {
        const slider = document.getElementById(sliderId);
        const input = document.getElementById(inputId);
        const label = document.getElementById(labelId);
        
        if (!slider || !input || !label) return;
        
        // Update label and input when slider changes
        slider.addEventListener('input', function() {
            const percentage = this.value;
            const volumeValue = parseFloat(percentage) / 100.0;
            label.textContent = `${percentage}%`;
            input.value = volumeValue.toFixed(1);
        });
        
        // Sync slider when input changes programmatically
        input.addEventListener('change', function() {
            const volumeValue = parseFloat(this.value);
            const percentage = Math.round(volumeValue * 100);
            slider.value = percentage;
            label.textContent = `${percentage}%`;
        });
    };
    
    // Setup all event sound sliders
    setupSlider('soundboard-follow-volume-slider', 'soundboard-follow-volume', 'soundboard-follow-volume-label');
    setupSlider('soundboard-subscribe-volume-slider', 'soundboard-subscribe-volume', 'soundboard-subscribe-volume-label');
    setupSlider('soundboard-share-volume-slider', 'soundboard-share-volume', 'soundboard-share-volume-label');
    setupSlider('soundboard-gift-volume-slider', 'soundboard-gift-volume', 'soundboard-gift-volume-label');
    setupSlider('soundboard-like-volume-slider', 'soundboard-like-volume', 'soundboard-like-volume-label');
}

// ========== GIFT SOUNDS ==========
// Cache for gift data to avoid redundant API calls
let giftsCache = [];

async function loadGiftSounds() {
    try {
        const response = await fetch('/api/soundboard/gifts');
        const gifts = await response.json();
        
        // Update cache
        giftsCache = gifts;
        updateWorkspaceOverview();
        
        const tbody = document.getElementById('gift-sounds-list');
        if (!tbody) {
            log.debug('gift-sounds-list element not found in current view, skipping render');
            return;
        }
        tbody.innerHTML = '';
        
        if (gifts.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="py-4 text-center text-gray-400">No gift sounds configured yet</td></tr>';
            return;
        }
        
        gifts.forEach(gift => {
            const row = document.createElement('tr');
            row.className = 'border-b border-gray-700';
            
            const animationInfo = gift.animationUrl && gift.animationType !== 'none'
                ? `<span class="text-green-400">${escapeHtml(gift.animationType)}</span>`
                : '<span class="text-gray-500">none</span>';
            
            // Generate unique IDs for this gift's volume controls
            const giftVolumeId = `gift-vol-${gift.giftId}`;
            const giftTestVolumeId = `gift-test-vol-${gift.giftId}`;
            const giftAnimVolumeId = `gift-anim-vol-${gift.giftId}`;
            
            // Create sound volume slider for Volume column
            const soundVolumeContainer = document.createElement('div');
            soundVolumeContainer.className = 'flex items-center gap-2';
            soundVolumeContainer.innerHTML = `
                <input type="range" id="${giftVolumeId}" min="0" max="100" value="${Math.round(gift.volume * 100)}" 
                    class="volume-slider volume-slider-inline"
                    data-gift-id="${gift.giftId}"
                    data-volume-type="sound"
                    title="Sound volume">
                <span id="${giftVolumeId}-label" class="volume-label">${Math.round(gift.volume * 100)}%</span>
            `;
            
            // Create animation volume slider for Anim. Vol. column
            const animVolumeContainer = document.createElement('div');
            animVolumeContainer.className = 'flex items-center gap-2';
            animVolumeContainer.innerHTML = `
                <input type="range" id="${giftAnimVolumeId}" min="0" max="100" value="${Math.round((gift.animationVolume || 1.0) * 100)}" 
                    class="volume-slider volume-slider-inline"
                    data-gift-id="${gift.giftId}"
                    data-volume-type="animation"
                    title="Animation volume">
                <span id="${giftAnimVolumeId}-label" class="volume-label">${Math.round((gift.animationVolume || 1.0) * 100)}%</span>
            `;
            
            // Create test button with volume slider
            const testContainer = document.createElement('div');
            testContainer.className = 'flex items-center gap-2';
            testContainer.innerHTML = `
                <button class="bg-blue-600 px-2 py-1 rounded text-xs hover:bg-blue-700" data-action="test-sound" data-url="${gift.mp3Url}" data-volume-input-id="${giftTestVolumeId}" title="Test sound">
                    🔊 Test
                </button>
                <input type="range" id="${giftTestVolumeId}" min="0" max="100" value="${Math.round(gift.volume * 100)}" 
                    class="volume-slider volume-slider-test"
                    title="Test volume">
                <span id="${giftTestVolumeId}-label" class="volume-label volume-label-test">${Math.round(gift.volume * 100)}%</span>
            `;
            
            // Add volume slider change listeners
            const soundVolumeSlider = soundVolumeContainer.querySelector(`#${giftVolumeId}`);
            const soundVolumeLabel = soundVolumeContainer.querySelector(`#${giftVolumeId}-label`);
            soundVolumeSlider.addEventListener('input', function() {
                soundVolumeLabel.textContent = `${this.value}%`;
            });
            soundVolumeSlider.addEventListener('change', function() {
                updateGiftVolume(gift, parseFloat(this.value) / 100.0, 'sound');
            });
            
            const animVolumeSlider = animVolumeContainer.querySelector(`#${giftAnimVolumeId}`);
            const animVolumeLabel = animVolumeContainer.querySelector(`#${giftAnimVolumeId}-label`);
            animVolumeSlider.addEventListener('input', function() {
                animVolumeLabel.textContent = `${this.value}%`;
            });
            animVolumeSlider.addEventListener('change', function() {
                updateGiftVolume(gift, parseFloat(this.value) / 100.0, 'animation');
            });
            
            const testVolumeSlider = testContainer.querySelector(`#${giftTestVolumeId}`);
            const testVolumeLabel = testContainer.querySelector(`#${giftTestVolumeId}-label`);
            testVolumeSlider.addEventListener('input', function() {
                testVolumeLabel.textContent = `${this.value}%`;
            });
            
            // Create edit button
            const editBtn = document.createElement('button');
            editBtn.className = 'bg-green-600 px-2 py-1 rounded text-xs hover:bg-green-700 mr-1';
            editBtn.dataset.action = 'edit-gift';
            editBtn.dataset.giftId = gift.giftId;
            editBtn.textContent = '✏️ Edit';
            
            // Create preview button
            const previewBtn = document.createElement('button');
            previewBtn.className = 'bg-purple-600 px-2 py-1 rounded text-xs hover:bg-purple-700 mr-1';
            previewBtn.dataset.action = 'preview-animation';
            previewBtn.dataset.animationUrl = gift.animationUrl || '';
            previewBtn.dataset.animationType = gift.animationType || 'none';
            previewBtn.dataset.animationVolume = gift.animationVolume || 1.0;
            previewBtn.textContent = '👁️ Preview';
            
            // Create delete button
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'bg-red-600 px-2 py-1 rounded text-xs hover:bg-red-700';
            deleteBtn.dataset.action = 'delete-gift';
            deleteBtn.dataset.giftId = gift.giftId;
            deleteBtn.textContent = '🗑️ Delete';
            
            row.innerHTML = `
                <td class="py-2 pr-4">${gift.giftId}</td>
                <td class="py-2 pr-4 font-semibold">${escapeHtml(gift.label)}</td>
                <td class="py-2 pr-4 text-sm truncate max-w-xs">${escapeHtml(gift.mp3Url)}</td>
                <td class="py-2 pr-4"></td>
                <td class="py-2 pr-4">${animationInfo}</td>
                <td class="py-2 pr-4"></td>
                <td class="py-2"></td>
            `;
            
            // Append volume controls to the table cells
            const volumeCell = row.querySelectorAll('td')[3];
            volumeCell.appendChild(soundVolumeContainer);
            
            const animVolumeCell = row.querySelectorAll('td')[5];
            animVolumeCell.appendChild(animVolumeContainer);
            
            // Append controls to the last cell
            const actionsCell = row.querySelector('td:last-child');
            actionsCell.appendChild(testContainer);
            actionsCell.appendChild(previewBtn);
            actionsCell.appendChild(editBtn);
            actionsCell.appendChild(deleteBtn);
            
            tbody.appendChild(row);
        });
        
    } catch (error) {
        log.error('Error loading gift sounds', { error: error.message });
        logAudioEvent('error', `Failed to load gift sounds: ${error.message}`, null);
    }
}

async function updateGiftVolume(gift, volume, volumeType) {
    try {
        // Use the gift object passed from the event listener to avoid fetching all gifts
        const updatedData = {
            giftId: gift.giftId,
            label: gift.label,
            mp3Url: gift.mp3Url,
            volume: volumeType === 'sound' ? volume : gift.volume,
            animationUrl: gift.animationUrl || null,
            animationType: gift.animationType || 'none',
            animationVolume: volumeType === 'animation' ? volume : (gift.animationVolume || 1.0)
        };
        
        // Save to database
        const updateResponse = await fetch('/api/soundboard/gifts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedData)
        });
        
        const result = await updateResponse.json();
        if (result.success) {
            // Update the gift object in cache
            if (volumeType === 'sound') {
                gift.volume = volume;
            } else {
                gift.animationVolume = volume;
            }
            
            const volumeTypeLabel = volumeType === 'sound' ? 'Sound' : 'Animation';
            logAudioEvent('success', `${volumeTypeLabel} volume updated for "${gift.label}": ${Math.round(volume * 100)}%`, null);
        } else {
            logAudioEvent('error', `Failed to update ${volumeType} volume for gift ${gift.giftId}`, null);
        }
    } catch (error) {
        log.error('Error updating gift volume', { error: error.message });
        logAudioEvent('error', `Failed to update gift volume: ${error.message}`, null);
    }
}

async function addGiftSound() {
    const giftIdEl = document.getElementById('new-gift-id');
    const labelEl = document.getElementById('new-gift-label');
    const urlEl = document.getElementById('new-gift-url');
    
    if (!giftIdEl || !labelEl || !urlEl) {
        log.warn('Gift sound form elements not found');
        return;
    }
    
    const giftId = giftIdEl.value;
    const label = labelEl.value;
    const url = urlEl.value;
    const volume = document.getElementById('new-gift-volume').value;
    const animationUrl = document.getElementById('new-gift-animation-url').value;
    const animationTypeEl = document.getElementById('new-gift-animation-type');
    let animationType = animationTypeEl.value;
    const animationVolume = document.getElementById('new-gift-animation-volume').value;

    if (animationUrl && animationType === 'none') {
        animationType = inferAnimationTypeFromUrl(animationUrl);
        animationTypeEl.value = animationType;
    }
    
    if (!giftId || !label || !url) {
        alert('Please select a gift from the catalog above and enter a sound URL!');
        return;
    }
    
    try {
        const response = await fetch('/api/soundboard/gifts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                giftId: parseInt(giftId),
                label: label,
                mp3Url: url,
                volume: parseFloat(volume),
                animationUrl: animationUrl || null,
                animationType: animationType || 'none',
                animationVolume: parseFloat(animationVolume)
            })
        });
        
        const result = await response.json();
        if (result.success) {
            alert('✅ Gift sound added/updated successfully!');
            logAudioEvent('success', `Gift sound added/updated: ${label}`, null);
            
            // Clear inputs
            clearGiftSoundForm();
            
            // Reload lists
            await loadGiftSounds();
            await loadGiftCatalog(); // Reload catalog to update checkmarks
            await loadGiftRecommendations();
        }
    } catch (error) {
        log.error('Error adding gift sound', { error: error.message });
        alert('Error adding gift sound!');
        logAudioEvent('error', `Failed to add gift sound: ${error.message}`, null);
    }
}

async function deleteGiftSound(giftId) {
    if (!confirm(`Delete sound for Gift ID ${giftId}?`)) return;
    
    try {
        const response = await fetch(`/api/soundboard/gifts/${giftId}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        if (result.success) {
            logAudioEvent('success', `Gift sound deleted: ${giftId}`, null);
            await loadGiftSounds();
            await loadGiftCatalog(); // Reload catalog to update checkmarks
            await loadGiftRecommendations();
        }
    } catch (error) {
        log.error('Error deleting gift sound', { error: error.message });
        logAudioEvent('error', `Failed to delete gift sound: ${error.message}`, null);
    }
}

async function openEditGiftModal(giftId) {
    try {
        // Fetch current gift sounds
        const response = await fetch('/api/soundboard/gifts');
        const gifts = await response.json();
        const gift = gifts.find(g => g.giftId === giftId);
        
        if (!gift) {
            alert('Gift sound not found!');
            return;
        }
        
        // Create modal overlay
        const modal = document.createElement('div');
        modal.id = 'edit-gift-modal';
        modal.className = 'modal-overlay active';
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.right = '0';
        modal.style.bottom = '0';
        modal.style.background = 'rgba(0, 0, 0, 0.8)';
        modal.style.display = 'flex';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        modal.style.zIndex = '10001';
        modal.style.padding = '20px';
        
        modal.innerHTML = `
            <div class="edit-gift-modal-content" style="background: var(--color-bg-primary); border: 2px solid var(--color-accent-primary); border-radius: 12px; max-width: 600px; width: 100%; max-height: 80vh; display: flex; flex-direction: column; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);">
                <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; padding: 20px 24px 16px; border-bottom: 1px solid var(--color-border); flex-shrink: 0;">
                    <h3 style="color: var(--color-accent-primary); font-size: 1.3rem; font-weight: 600; margin: 0;">
                        ✏️ Edit Gift Sound: ${escapeHtml(gift.label)}
                    </h3>
                    <button onclick="closeEditGiftModal()" style="background: transparent; border: none; color: var(--color-text-primary); cursor: pointer; padding: 8px; border-radius: 6px; font-size: 1.5rem; position: relative; z-index: 1; pointer-events: auto;">
                        ✕
                    </button>
                </div>
                
                <div class="modal-body" style="overflow-y: auto; flex: 1; padding: 20px 24px;">
                    <div class="form-grid" style="display: grid; gap: 16px;">
                        <div class="form-group">
                            <label style="display: block; font-weight: 600; margin-bottom: 8px; color: var(--color-text-primary);">Gift ID</label>
                            <input type="number" id="edit-gift-id" value="${gift.giftId}" readonly class="form-input" style="width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--color-border); background: var(--color-bg-secondary); color: var(--color-text-primary);">
                        </div>
                        
                        <div class="form-group">
                            <label style="display: block; font-weight: 600; margin-bottom: 8px; color: var(--color-text-primary);">Label</label>
                            <input type="text" id="edit-gift-label" value="${escapeHtml(gift.label)}" class="form-input" style="width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--color-border); background: var(--color-bg-primary); color: var(--color-text-primary);">
                        </div>
                        
                        <div class="form-group">
                            <label style="display: block; font-weight: 600; margin-bottom: 8px; color: var(--color-text-primary);">MP3 URL</label>
                            <input type="text" id="edit-gift-url" value="${escapeHtml(gift.mp3Url)}" class="form-input" style="width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--color-border); background: var(--color-bg-primary); color: var(--color-text-primary);">
                        </div>
                        
                        <div class="form-group">
                            <label style="display: block; font-weight: 600; margin-bottom: 8px; color: var(--color-text-primary);">Sound Volume (0.0 - 1.0)</label>
                            <input type="number" id="edit-gift-volume" value="${gift.volume}" min="0" max="1" step="0.1" class="form-input" style="width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--color-border); background: var(--color-bg-primary); color: var(--color-text-primary);">
                        </div>
                        
                        <div class="form-group">
                            <label style="display: block; font-weight: 600; margin-bottom: 8px; color: var(--color-text-primary);">Animation URL (optional)</label>
                            <div style="display: flex; gap: 8px; align-items: center;">
                                <input type="text" id="edit-gift-animation-url" value="${escapeHtml(gift.animationUrl || '')}" class="form-input" style="flex: 1; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--color-border); background: var(--color-bg-primary); color: var(--color-text-primary);">
                                <button onclick="previewEditModalAnimation()" style="padding: 10px 14px; border-radius: 8px; border: 1px solid var(--color-accent-primary); background: transparent; color: var(--color-accent-primary); cursor: pointer; white-space: nowrap; position: relative; z-index: 1; pointer-events: auto;">
                                    👁️ Preview
                                </button>
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label style="display: block; font-weight: 600; margin-bottom: 8px; color: var(--color-text-primary);">Animation Type</label>
                            <select id="edit-gift-animation-type" class="form-select" style="width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--color-border); background: var(--color-bg-primary); color: var(--color-text-primary);">
                                <option value="none" ${gift.animationType === 'none' ? 'selected' : ''}>No Animation</option>
                                <option value="image" ${gift.animationType === 'image' ? 'selected' : ''}>Image</option>
                                <option value="video" ${gift.animationType === 'video' ? 'selected' : ''}>Video</option>
                                <option value="gif" ${gift.animationType === 'gif' ? 'selected' : ''}>GIF</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label style="display: block; font-weight: 600; margin-bottom: 8px; color: var(--color-text-primary);">Animation Volume (0.0 - 1.0)</label>
                            <input type="number" id="edit-gift-animation-volume" value="${gift.animationVolume || 1.0}" min="0" max="1" step="0.1" class="form-input" style="width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--color-border); background: var(--color-bg-primary); color: var(--color-text-primary);">
                            <small style="color: var(--color-text-secondary); font-size: 0.85rem;">Controls the volume of the animation's audio (if the animation is a video with sound)</small>
                        </div>
                    </div>
                </div>
                
                <div class="form-actions" style="display: flex; gap: 12px; padding: 16px 24px 20px; border-top: 1px solid var(--color-border); flex-shrink: 0; position: relative; z-index: 1;">
                    <button onclick="saveEditedGiftSound()" class="btn btn-primary" style="flex: 1; padding: 10px 20px; border-radius: 8px; border: none; font-weight: 600; cursor: pointer; background: var(--color-accent-primary); color: white; position: relative; z-index: 1; pointer-events: auto;">
                        💾 Save Changes
                    </button>
                    <button onclick="closeEditGiftModal()" class="btn btn-secondary" style="flex: 1; padding: 10px 20px; border-radius: 8px; border: none; font-weight: 600; cursor: pointer; background: var(--color-btn-secondary-bg); color: var(--color-btn-secondary-text); position: relative; z-index: 1; pointer-events: auto;">
                        Cancel
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Close on background click
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeEditGiftModal();
            }
        });
        
    } catch (error) {
        log.error('Error opening edit modal', { error: error.message });
        alert('Error opening edit modal!');
    }
}

async function saveEditedGiftSound() {
    const giftId = parseInt(document.getElementById('edit-gift-id').value);
    const label = document.getElementById('edit-gift-label').value;
    const url = document.getElementById('edit-gift-url').value;
    const volume = parseFloat(document.getElementById('edit-gift-volume').value);
    const animationUrl = document.getElementById('edit-gift-animation-url').value;
    const animationTypeEl = document.getElementById('edit-gift-animation-type');
    let animationType = animationTypeEl.value;
    const animationVolume = parseFloat(document.getElementById('edit-gift-animation-volume').value);

    if (animationUrl && animationType === 'none') {
        animationType = inferAnimationTypeFromUrl(animationUrl);
        animationTypeEl.value = animationType;
    }
    
    if (isNaN(giftId) || !label || !url) {
        alert('Please fill in all required fields!');
        return;
    }
    
    // Validate numeric values
    if (isNaN(volume) || volume < 0 || volume > 1) {
        alert('Sound volume must be between 0.0 and 1.0!');
        return;
    }
    
    if (isNaN(animationVolume) || animationVolume < 0 || animationVolume > 1) {
        alert('Animation volume must be between 0.0 and 1.0!');
        return;
    }
    
    try {
        const response = await fetch('/api/soundboard/gifts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                giftId: giftId,
                label: label,
                mp3Url: url,
                volume: volume,
                animationUrl: animationUrl || null,
                animationType: animationType || 'none',
                animationVolume: animationVolume
            })
        });
        
        const result = await response.json();
        if (result.success) {
            alert('✅ Gift sound updated successfully!');
            logAudioEvent('success', `Gift sound updated: ${label}`, null);
            closeEditGiftModal();
            await loadGiftSounds();
            await loadGiftCatalog();
        }
    } catch (error) {
        log.error('Error updating gift sound', { error: error.message });
        alert('Error updating gift sound!');
        logAudioEvent('error', `Failed to update gift sound: ${error.message}`, null);
    }
}

function closeEditGiftModal() {
    const modal = document.getElementById('edit-gift-modal');
    if (modal) {
        modal.remove();
    }
}

/**
 * Reads animation settings from the open edit modal and calls previewAnimation().
 */
function previewEditModalAnimation() {
    const url = document.getElementById('edit-gift-animation-url').value;
    const type = document.getElementById('edit-gift-animation-type').value;
    const volume = parseFloat(document.getElementById('edit-gift-animation-volume').value);
    previewAnimation(url, type, volume);
}

/**
 * Opens a lightweight preview modal for an animation (video/gif/image).
 * @param {string} url - URL of the animation to preview
 * @param {string} type - Animation type: 'video', 'gif', 'image', or 'none'
 * @param {number} volume - Volume for video animations (0.0 - 1.0)
 */
function previewAnimation(url, type, volume) {
    if (!url || url.trim() === '') {
        alert('No animation URL configured');
        return;
    }

    log.info('Opening animation preview', { url, type, volume });

    // Remove any existing preview modal
    closeAnimationPreview();

    const overlay = document.createElement('div');
    overlay.id = 'animation-preview-modal';
    overlay.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; z-index: 10002; padding: 20px;';

    let mediaHtml = '';
    const escapedUrl = escapeHtml(url);
    const normalizedVolume = (isNaN(volume) || volume < 0 || volume > 1) ? 1.0 : volume;

    if (type === 'video') {
        mediaHtml = `<video src="${escapedUrl}" autoplay controls style="max-width: 80vw; max-height: 80vh; border-radius: 8px; display: block;"></video>`;
    } else {
        // gif and image types, plus fallback for unknown
        mediaHtml = `<img src="${escapedUrl}" alt="Animation preview" style="max-width: 80vw; max-height: 80vh; border-radius: 8px; display: block; object-fit: contain;">`;
    }

    overlay.innerHTML = `
        <div style="position: relative; display: flex; flex-direction: column; align-items: center; gap: 12px;">
            <button onclick="closeAnimationPreview()" style="position: absolute; top: -36px; right: -8px; background: rgba(255,255,255,0.15); border: none; color: #fff; cursor: pointer; padding: 6px 10px; border-radius: 6px; font-size: 1.2rem; line-height: 1; z-index: 1; pointer-events: auto;">✕</button>
            ${mediaHtml}
        </div>
    `;

    document.body.appendChild(overlay);

    // Set video volume after DOM insertion
    if (type === 'video') {
        const videoEl = overlay.querySelector('video');
        if (videoEl) {
            videoEl.volume = normalizedVolume;
        }
    }

    // Close when clicking outside the media
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
            closeAnimationPreview();
        }
    });
}

/**
 * Closes the animation preview modal.
 */
function closeAnimationPreview() {
    const modal = document.getElementById('animation-preview-modal');
    if (modal) {
        // Pause video to stop audio before removing
        const video = modal.querySelector('video');
        if (video) {
            video.pause();
        }
        modal.remove();
        log.info('Animation preview closed');
    }
}

async function testGiftSound(url, volume) {
    try {
        logAudioEvent('info', `Testing sound: ${url}`, { volume }, true);
        
        // Stop any currently playing preview
        if (previewAudio) {
            previewAudio.pause();
            previewAudio.currentTime = 0;
            logAudioEvent('info', 'Stopped previous preview', null);
        }
        
        // Create or reuse preview audio element
        if (!previewAudio) {
            previewAudio = document.createElement('audio');
            
            // CRITICAL: Append preview audio to DOM for browser compatibility
            document.body.appendChild(previewAudio);
            
            // Add event listeners for preview audio (using addEventListener for proper cleanup)
            previewAudio.addEventListener('ended', () => {
                isPreviewPlaying = false;
                logAudioEvent('success', 'Preview finished playing', null);
            });
            
            previewAudio.addEventListener('error', (e) => {
                isPreviewPlaying = false;
                const errorMsg = previewAudio.error ? `Error code: ${previewAudio.error.code}` : 'Unknown error';
                logAudioEvent('error', `Preview playback error: ${errorMsg}`, { url: previewAudio.src }, true);
            });
            
            previewAudio.addEventListener('pause', () => {
                if (!previewAudio.ended) {
                    logAudioEvent('info', 'Preview paused', null);
                }
            });
        }
        
        // Ensure audio unlocking if needed
        await ensureAudioUnlocked();
        
        // Set the new source and volume (after ensuring audio context is unlocked)
        previewAudio.src = url;
        previewAudio.volume = parseFloat(volume) || 1.0;
        
        // Load the audio before playing
        previewAudio.load();
        
        // Wait for audio to be ready before playing
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Audio loading timeout'));
            }, 10000); // 10 second timeout
            
            const onCanPlay = () => {
                clearTimeout(timeout);
                resolve();
            };
            
            const onError = () => {
                clearTimeout(timeout);
                const errorMsg = previewAudio.error ? `Error code: ${previewAudio.error.code}` : 'Unknown error';
                reject(new Error(`Failed to load audio: ${errorMsg}`));
            };
            
            // Event listeners with { once: true } automatically clean themselves up
            previewAudio.addEventListener('canplay', onCanPlay, { once: true });
            previewAudio.addEventListener('error', onError, { once: true });
        });
        
        // Play the preview
        isPreviewPlaying = true;
        await previewAudio.play();
        logAudioEvent('success', `Preview started playing: ${url}`, null, true);
        
    } catch (error) {
        isPreviewPlaying = false;
        log.error('Error testing sound', { error: error.message });
        logAudioEvent('error', `Failed to preview sound: ${error.message}`, { url }, true);
    }
}

function getAnimationFormValues(eventType) {
    return {
        url: document.getElementById(`soundboard-${eventType}-animation-url`)?.value || '',
        type: document.getElementById(`soundboard-${eventType}-animation-type`)?.value || 'none',
        volume: document.getElementById(`soundboard-${eventType}-animation-volume`)?.value || '1.0'
    };
}

function getOverlayLayoutFromForm() {
    return {
        x: document.getElementById('soundboard-animation-x')?.value || '50',
        y: document.getElementById('soundboard-animation-y')?.value || '50',
        width: document.getElementById('soundboard-animation-width')?.value || '45',
        height: document.getElementById('soundboard-animation-height')?.value || '45',
        anchor: document.getElementById('soundboard-animation-anchor')?.value || 'center',
        duration: document.getElementById('soundboard-animation-duration')?.value || '5',
        fit: document.getElementById('soundboard-animation-fit')?.value || 'contain'
    };
}

async function testOverlayAnimation(url, type = 'auto', volume = '1.0', eventType = 'test') {
    const response = await fetch('/api/soundboard/test-animation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, type, volume, eventType, label: `${eventType} animation test`, layout: getOverlayLayoutFromForm() })
    });

    const result = await response.json();
    if (!result.success) {
        throw new Error(result.error || 'Animation test failed');
    }

    logAudioEvent('success', `OBS animation test sent: ${eventType}`, { url, type }, true);
}

async function testEventSound(eventType) {
    const url = document.getElementById(`soundboard-${eventType}-url`)?.value || '';
    const volume = document.getElementById(`soundboard-${eventType}-volume`)?.value || '1.0';
    const animation = getAnimationFormValues(eventType);
    let tested = false;

    if (url) {
        await testGiftSound(url, volume);
        tested = true;
    }

    if (animation.url && animation.type !== 'none') {
        await testOverlayAnimation(animation.url, animation.type, animation.volume, eventType);
        tested = true;
    }

    if (!tested) {
        alert('Please enter a sound URL or animation URL first!');
    }
}

function findAnimationTypeSelect(inputEl) {
    if (!inputEl || !inputEl.id) return null;
    return document.getElementById(inputEl.id.replace('animation-url', 'animation-type'));
}

function inferAnimationTypeFromUrl(url) {
    const cleanUrl = (url || '').split('?')[0].toLowerCase();
    if (/\.(mp4|webm|mov)$/.test(cleanUrl)) return 'video';
    if (/\.gif$/.test(cleanUrl)) return 'gif';
    if (/\.(png|jpg|jpeg|webp|svg)$/.test(cleanUrl)) return 'image';
    return 'video';
}

function findAnimationVolumeInput(inputEl) {
    if (!inputEl || !inputEl.id) return null;
    return document.getElementById(inputEl.id.replace('animation-url', 'animation-volume'));
}

function getFocusedAnimationTarget() {
    if (activeAnimationInput && document.body.contains(activeAnimationInput)) {
        return activeAnimationInput;
    }
    return document.getElementById('new-gift-animation-url')
        || document.getElementById('soundboard-gift-animation-url')
        || document.querySelector('input[id$="animation-url"]');
}

function useGifForAnimation(url) {
    const target = getFocusedAnimationTarget();
    if (!target) {
        alert('No animation URL field found.');
        return;
    }

    target.value = url;
    activeAnimationInput = target;

    const typeSelect = findAnimationTypeSelect(target);
    if (typeSelect) typeSelect.value = 'gif';

    target.focus();
    logAudioEvent('success', 'GIF URL inserted into animation field', { target: target.id }, true);
}

async function testFocusedAnimation() {
    const target = getFocusedAnimationTarget();
    if (!target || !target.value) {
        alert('Select or fill an animation URL first.');
        return;
    }

    const typeSelect = findAnimationTypeSelect(target);
    const volumeInput = findAnimationVolumeInput(target);
    const type = typeSelect?.value || 'auto';
    const volume = volumeInput?.value || '1.0';
    const eventType = target.id.includes('like') ? 'like'
        : target.id.includes('gift') ? 'gift'
        : target.id.includes('follow') ? 'follow'
        : target.id.includes('subscribe') ? 'subscribe'
        : target.id.includes('share') ? 'share'
        : 'test';

    try {
        await testOverlayAnimation(target.value, type, volume, eventType);
    } catch (error) {
        alert(`Animation test failed: ${error.message}`);
    }
}

function renderGifResults(results) {
    const container = document.getElementById('gif-search-results');
    if (!container) return;

    container.innerHTML = '';
    if (!results || results.length === 0) {
        container.innerHTML = '<div class="text-gray-400 text-sm text-center py-4">No GIFs found</div>';
        return;
    }

    results.forEach(result => {
        const item = document.createElement('div');
        item.className = 'gif-result-item';

        const img = document.createElement('img');
        img.src = result.previewUrl || result.url;
        img.alt = result.title || 'GIF';
        img.loading = 'lazy';

        const body = document.createElement('div');
        body.className = 'gif-result-body';

        const title = document.createElement('div');
        title.className = 'gif-result-title';
        title.textContent = result.title || 'GIF';

        const useBtn = document.createElement('button');
        useBtn.className = 'btn btn-sm btn-primary';
        useBtn.type = 'button';
        useBtn.textContent = 'Use GIF';
        useBtn.addEventListener('click', () => useGifForAnimation(result.url));

        body.appendChild(title);
        body.appendChild(useBtn);
        item.appendChild(img);
        item.appendChild(body);
        container.appendChild(item);
    });
}

async function searchGifs() {
    const input = document.getElementById('gif-search-input');
    const status = document.getElementById('gif-search-status');
    const query = input?.value.trim();

    if (!query) {
        alert('Please enter a GIF search term.');
        return;
    }

    if (status) status.textContent = 'Searching GIFs...';

    try {
        const response = await fetch(`/api/soundboard/gif-search?query=${encodeURIComponent(query)}&limit=18`);
        const data = await response.json();

        if (!data.success) {
            if (status) status.textContent = data.error || 'GIF search failed.';
            renderGifResults([]);
            return;
        }

        if (status) status.textContent = `${data.results.length} GIFs found via GIPHY.`;
        renderGifResults(data.results);
    } catch (error) {
        if (status) status.textContent = `GIF search failed: ${error.message}`;
        renderGifResults([]);
    }
}

function clearGiftSoundForm() {
    document.getElementById('new-gift-id').value = '';
    document.getElementById('new-gift-label').value = '';
    document.getElementById('new-gift-url').value = '';
    document.getElementById('new-gift-volume').value = '1.0';
    document.getElementById('new-gift-animation-url').value = '';
    document.getElementById('new-gift-animation-type').value = 'none';
    document.getElementById('new-gift-animation-volume').value = '1.0';
}

// ========== GIFT CATALOG ==========
async function loadGiftCatalog() {
    // SYNCHRON vor dem fetch: Guard prüfen
    const infoDiv = document.getElementById('gift-catalog-info');
    const catalogDiv = document.getElementById('gift-catalog-list');
    if (!infoDiv || !catalogDiv) {
        log.debug('Gift catalog DOM elements not found in current view, skipping render');
        return;
    }

    try {
        const response = await fetch('/api/gift-catalog');
        const data = await response.json();

        if (!data.success) {
            infoDiv.innerHTML = '<span class="text-red-400">Error loading gift catalog</span>';
            catalogDiv.innerHTML = '';
            return;
        }
        
        const catalog = data.catalog || [];
        const lastUpdate = data.lastUpdate;
        
        // Info anzeigen
        if (catalog.length === 0) {
            infoDiv.innerHTML = `
                <span class="text-yellow-400">⚠️ No gifts in catalog. Connect to a stream and click "Refresh Catalog"</span>
            `;
            catalogDiv.innerHTML = '';
            return;
        }
        
        const updateText = lastUpdate ? `Last updated: ${new Date(lastUpdate).toLocaleString()}` : 'Never updated';
        infoDiv.innerHTML = `
            <span class="text-green-400">✅ ${catalog.length} gifts available</span>
            <span class="mx-2">•</span>
            <span class="text-gray-400">${updateText}</span>
        `;
        
        // Katalog anzeigen
        catalogDiv.innerHTML = '';
        catalog.forEach(gift => {
            const giftCard = document.createElement('div');
            giftCard.className = 'bg-gray-600 p-3 rounded cursor-pointer hover:bg-gray-500 transition flex flex-col items-center';
            giftCard.onclick = () => selectGift(gift);
            
            const hasSound = isGiftConfigured(gift.id);
            const borderClass = hasSound ? 'border-2 border-green-500' : '';
            
            giftCard.innerHTML = `
                <div class="relative ${borderClass} rounded">
                    ${gift.image_url
                        ? `<img src="${gift.image_url}" alt="${gift.name}" class="w-16 h-16 object-contain rounded">`
                        : `<div class="w-16 h-16 flex items-center justify-center text-3xl">🎁</div>`
                    }
                    ${hasSound ? '<div class="absolute -top-1 -right-1 bg-green-500 rounded-full w-4 h-4 flex items-center justify-center text-xs">✓</div>' : ''}
                </div>
                <div class="text-xs text-center mt-2 font-semibold truncate w-full">${gift.name}</div>
                <div class="text-xs text-gray-400">ID: ${gift.id}</div>
                ${gift.diamond_count ? `<div class="text-xs text-yellow-400">💎 ${gift.diamond_count}</div>` : ''}
            `;
            
            catalogDiv.appendChild(giftCard);
        });
        
    } catch (error) {
        log.error('Error loading gift catalog', { error: error.message });
        infoDiv.innerHTML = '<span class="text-red-400">Error loading catalog</span>';
        logAudioEvent('error', `Failed to load gift catalog: ${error.message}`, null);
    }
}

function isGiftConfigured(giftId) {
    // Prüfe ob ein Sound für dieses Gift bereits konfiguriert ist
    const table = document.getElementById('gift-sounds-list');
    if (!table) return false;
    
    const rows = table.querySelectorAll('tr');
    for (const row of rows) {
        const firstCell = row.querySelector('td:first-child');
        if (firstCell && parseInt(firstCell.textContent) === giftId) {
            return true;
        }
    }
    return false;
}

async function refreshGiftCatalog() {
    const btn = document.getElementById('refresh-catalog-btn');
    const icon = document.getElementById('refresh-icon');
    const infoDiv = document.getElementById('gift-catalog-info');
    
    // Button deaktivieren und Animation starten
    btn.disabled = true;
    icon.style.animation = 'spin 1s linear infinite';
    icon.style.display = 'inline-block';
    infoDiv.innerHTML = '<span class="text-blue-400">🔄 Updating gift catalog from stream...</span>';
    
    try {
        const response = await fetch('/api/gift-catalog/update', {
            method: 'POST'
        });
        
        const result = await response.json();
        
        if (result.success) {
            infoDiv.innerHTML = `<span class="text-green-400">✅ ${result.message || 'Catalog updated successfully'}</span>`;
            logAudioEvent('success', 'Gift catalog updated', null);
            // Katalog neu laden
            await loadGiftCatalog();
        } else {
            infoDiv.innerHTML = `<span class="text-red-400">❌ ${result.error || 'Failed to update catalog'}</span>`;
            logAudioEvent('error', `Failed to update catalog: ${result.error}`, null);
        }
    } catch (error) {
        log.error('Error refreshing gift catalog', { error: error.message });
        infoDiv.innerHTML = '<span class="text-red-400">❌ Error updating catalog. Make sure you are connected to a stream.</span>';
        logAudioEvent('error', `Failed to refresh catalog: ${error.message}`, null);
    } finally {
        btn.disabled = false;
        icon.style.animation = '';
    }
}

function selectGift(gift) {
    // Formular mit Gift-Daten füllen
    document.getElementById('new-gift-id').value = gift.id;
    document.getElementById('new-gift-label').value = gift.name;
    
    // Wenn bereits ein Sound konfiguriert ist, diese Daten laden
    loadExistingGiftSound(gift.id);
    
    // Scroll zum Formular
    document.getElementById('new-gift-url').scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById('new-gift-url').focus();
}

async function loadExistingGiftSound(giftId) {
    try {
        const response = await fetch('/api/soundboard/gifts');
        const gifts = await response.json();
        
        const existingGift = gifts.find(g => g.giftId === giftId);
        if (existingGift) {
            document.getElementById('new-gift-url').value = existingGift.mp3Url || '';
            document.getElementById('new-gift-volume').value = existingGift.volume || 1.0;
            document.getElementById('new-gift-animation-url').value = existingGift.animationUrl || '';
            document.getElementById('new-gift-animation-type').value = existingGift.animationType || 'none';
            document.getElementById('new-gift-animation-volume').value = existingGift.animationVolume || 1.0;
        }
    } catch (error) {
        log.error('Error loading existing gift sound', { error: error.message });
    }
}

// ========== MYINSTANTS SEARCH ==========
async function searchMyInstants() {
    const query = document.getElementById('myinstants-search-input').value;
    
    if (!query) {
        alert('Please enter a search query!');
        return;
    }
    
    const resultsDiv = document.getElementById('myinstants-results');
    resultsDiv.innerHTML = '<div class="text-gray-400 text-sm">🔍 Searching...</div>';
    
    try {
        const response = await fetch(`/api/myinstants/search?query=${encodeURIComponent(query)}`);
        const data = await response.json();
        
        if (!data.success || data.results.length === 0) {
            resultsDiv.innerHTML = '<div class="text-gray-400 text-sm">No results found</div>';
            return;
        }
        
        resultsDiv.innerHTML = '';
        data.results.forEach(sound => {
            const div = document.createElement('div');
            div.className = 'myinstants-result-item';
            
            // Generate unique ID for this sound's volume control
            const soundId = generateUniqueSoundId();
            
            // Create volume slider container
            const volumeContainer = document.createElement('div');
            volumeContainer.className = 'flex items-center gap-2';
            volumeContainer.innerHTML = `
                <label for="${soundId}-volume" class="volume-label" style="min-width: 40px;">Vol:</label>
                <input type="range" id="${soundId}-volume" min="0" max="100" value="100" 
                    class="volume-slider volume-slider-inline"
                    title="Preview volume">
                <span id="${soundId}-volume-label" class="volume-label">100%</span>
            `;
            
            // Create play button
            const playBtn = document.createElement('button');
            playBtn.className = 'bg-blue-600 px-3 py-2 rounded text-sm hover:bg-blue-700 transition flex items-center gap-2';
            playBtn.title = 'Preview this sound';
            playBtn.dataset.action = 'test-sound';
            playBtn.dataset.url = sound.url;
            playBtn.dataset.volumeInputId = `${soundId}-volume`;
            playBtn.innerHTML = `
                <i data-lucide="play" style="width: 14px; height: 14px;"></i>
                <span>Play</span>
            `;
            
            // Create use button
            const useBtn = document.createElement('button');
            useBtn.className = 'bg-green-600 px-3 py-2 rounded text-sm hover:bg-green-700 transition flex items-center gap-2';
            useBtn.title = 'Use this sound for selected gift';
            useBtn.dataset.action = 'use-sound';
            useBtn.dataset.name = sound.name;
            useBtn.dataset.url = sound.url;
            useBtn.innerHTML = `
                <i data-lucide="check" style="width: 14px; height: 14px;"></i>
                <span>Use</span>
            `;
            
            // Create result structure
            div.innerHTML = `
                <div class="myinstants-result-info">
                    <div class="myinstants-result-name">${escapeHtml(sound.name)}</div>
                    <div class="myinstants-result-url">${escapeHtml(sound.url)}</div>
                </div>
                <div class="myinstants-result-actions"></div>
            `;
            
            // Append controls to actions div
            const actionsDiv = div.querySelector('.myinstants-result-actions');
            actionsDiv.appendChild(volumeContainer);
            actionsDiv.appendChild(playBtn);
            actionsDiv.appendChild(useBtn);
            
            // Add volume slider change listener
            const volumeSlider = volumeContainer.querySelector(`#${soundId}-volume`);
            const volumeLabel = volumeContainer.querySelector(`#${soundId}-volume-label`);
            volumeSlider.addEventListener('input', function() {
                volumeLabel.textContent = `${this.value}%`;
            });
            
            resultsDiv.appendChild(div);
        });
        
        // Re-initialize Lucide icons for new elements
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
        
    } catch (error) {
        log.error('Error searching MyInstants', { error: error.message });
        resultsDiv.innerHTML = '<div class="text-red-400 text-sm">Error searching MyInstants</div>';
        logAudioEvent('error', `MyInstants search failed: ${error.message}`, null);
    }
}

function useMyInstantsSound(name, url) {
    document.getElementById('new-gift-label').value = name;
    document.getElementById('new-gift-url').value = url;
    logAudioEvent('info', `Selected MyInstants sound: ${name}`, { url });
}

// ========== EXPORT/IMPORT AUDIO ANIMATIONS ==========
async function exportAudioAnimations() {
    try {
        logAudioEvent('info', 'Exporting audio animations...', null);
        
        const response = await fetch('/api/soundboard/export-animations');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `soundboard-animations-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        logAudioEvent('success', 'Audio animations exported successfully!', null);
        alert('✅ Audio-Animationen erfolgreich exportiert!');
    } catch (error) {
        logAudioEvent('error', `Export failed: ${error.message}`, null);
        alert('❌ Fehler beim Exportieren der Audio-Animationen!');
    }
}

async function importAudioAnimations(file) {
    if (!file) {
        alert('Bitte wählen Sie eine JSON-Datei zum Importieren!');
        return;
    }
    
    if (!file.name.endsWith('.json')) {
        alert('Bitte wählen Sie eine gültige JSON-Datei!');
        return;
    }
    
    try {
        logAudioEvent('info', `Importing audio animations from file: ${file.name}`, null);
        
        const fileContent = await file.text();
        const importData = JSON.parse(fileContent);
        
        // Validate the import data structure
        if (!importData.animations || !Array.isArray(importData.animations)) {
            throw new Error('Invalid import file format');
        }
        
        const response = await fetch('/api/soundboard/import-animations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(importData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            const message = `Import abgeschlossen: ${result.imported} neue, ${result.updated} aktualisiert, ${result.failed} fehlgeschlagen`;
            logAudioEvent('success', message, result);
            
            let alertMessage = `✅ ${message}`;
            if (result.errors && result.errors.length > 0) {
                alertMessage += '\n\nFehler:\n' + result.errors.slice(0, 5).join('\n');
                if (result.errors.length > 5) {
                    alertMessage += `\n... und ${result.errors.length - 5} weitere`;
                }
            }
            
            alert(alertMessage);
            
            // Reload the gift sounds list to show the imported data
            await loadGiftSounds();
            await loadGiftCatalog();
        } else {
            throw new Error(result.error || 'Import failed');
        }
    } catch (error) {
        logAudioEvent('error', `Import failed: ${error.message}`, null);
        alert(`❌ Fehler beim Importieren der Audio-Animationen: ${error.message}`);
    }
}

// ========== ADVANCED SEARCH ==========
let selectedSoundForBinding = null;
let currentCategory = 'all';
let availableCategories = [];

// Icon mapping for categories
const categoryIcons = {
    'all': 'grid-3x3',
    'memes': 'laugh',
    'meme': 'laugh',
    'games': 'gamepad-2',
    'game': 'gamepad-2',
    'gaming': 'gamepad-2',
    'movies': 'film',
    'movie': 'film',
    'tv': 'film',
    'music': 'music',
    'songs': 'music',
    'song': 'music',
    'animals': 'dog',
    'animal': 'dog',
    'pets': 'dog',
    'sports': 'trophy',
    'sport': 'trophy',
    'politics': 'users',
    'political': 'users',
    'viral': 'trending-up',
    'trending': 'trending-up',
    'funny': 'smile',
    'comedy': 'smile',
    'anime': 'sparkles',
    'cartoons': 'tv',
    'cartoon': 'tv',
    'celebrities': 'star',
    'celebrity': 'star',
    'famous': 'star',
    'default': 'tag'
};

// Get icon for category
function getCategoryIcon(categoryName) {
    const name = categoryName.toLowerCase();
    for (const [key, icon] of Object.entries(categoryIcons)) {
        if (name.includes(key)) {
            return icon;
        }
    }
    return categoryIcons.default;
}

// Load categories from API
async function loadCategories() {
    try {
        const response = await fetch('/api/myinstants/categories');
        const data = await response.json();
        
        if (data.success && data.results && data.results.length > 0) {
            availableCategories = data.results;
            renderCategoryButtons();
        } else {
            log.warn('No categories returned from API, using defaults', { responseData: data });
            availableCategories = [
                { name: 'Memes', slug: 'memes' },
                { name: 'Games', slug: 'games' },
                { name: 'Movies', slug: 'movies' },
                { name: 'Music', slug: 'music' },
                { name: 'Animals', slug: 'animals' }
            ];
            renderCategoryButtons();
        }
    } catch (error) {
        log.error('Error loading categories', { error: error.message });
        // Use fallback categories
        availableCategories = [
            { name: 'Memes', slug: 'memes' },
            { name: 'Games', slug: 'games' },
            { name: 'Movies', slug: 'movies' },
            { name: 'Music', slug: 'music' },
            { name: 'Animals', slug: 'animals' }
        ];
        renderCategoryButtons();
    }
}

// Render category buttons
function renderCategoryButtons() {
    const container = document.getElementById('category-buttons-container');
    if (!container) return;
    
    // Keep the "All" button, remove the rest
    const allButton = container.querySelector('[data-category="all"]');
    container.innerHTML = '';
    if (allButton) {
        container.appendChild(allButton);
    }
    
    // Add category buttons from API
    availableCategories.forEach(category => {
        const button = document.createElement('button');
        button.className = 'category-btn';
        button.dataset.category = category.slug || category.name.toLowerCase();
        
        const iconName = getCategoryIcon(category.name);
        button.innerHTML = `
            <i data-lucide="${iconName}" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i>
            ${escapeHtml(category.name)}
        `;
        
        container.appendChild(button);
    });
    
    // Re-initialize Lucide icons for new buttons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

async function performAdvancedSearch() {
    const query = document.getElementById('advanced-search-input').value;
    const resultsDiv = document.getElementById('advanced-search-results');
    
    if (!query) {
        alert('Please enter a search query!');
        return;
    }
    
    resultsDiv.innerHTML = '<div class="text-gray-400 text-sm text-center py-4">🔍 Searching...</div>';
    
    try {
        // Build search query with category if not "all"
        let searchQuery = query;
        if (currentCategory !== 'all') {
            searchQuery = `${currentCategory} ${query}`;
        }
        
        const response = await fetch(`/api/myinstants/search?query=${encodeURIComponent(searchQuery)}`);
        const data = await response.json();
        
        if (!data.success || data.results.length === 0) {
            resultsDiv.innerHTML = '<div class="text-gray-400 text-sm text-center py-4">No results found. Try a different search term or category.</div>';
            return;
        }
        
        renderSearchResults(data.results, resultsDiv);
    } catch (error) {
        log.error('Error searching MyInstants', { error: error.message });
        resultsDiv.innerHTML = '<div class="text-red-400 text-sm text-center py-4">Error searching MyInstants. Please try again.</div>';
    }
}

async function searchTrending() {
    const resultsDiv = document.getElementById('advanced-search-results');
    resultsDiv.innerHTML = '<div class="text-gray-400 text-sm text-center py-4">🔍 Loading trending sounds...</div>';
    
    try {
        const response = await fetch('/api/myinstants/trending');
        const data = await response.json();
        
        if (!data.success || data.results.length === 0) {
            resultsDiv.innerHTML = '<div class="text-gray-400 text-sm text-center py-4">No trending sounds found.</div>';
            return;
        }
        
        renderSearchResults(data.results, resultsDiv);
    } catch (error) {
        log.error('Error loading trending sounds', { error: error.message });
        resultsDiv.innerHTML = '<div class="text-red-400 text-sm text-center py-4">Error loading trending sounds.</div>';
    }
}

function renderSearchResults(results, container) {
    container.innerHTML = '';
    
    results.forEach(sound => {
        const div = document.createElement('div');
        div.className = 'myinstants-result-item';
        
        // Generate unique ID for this sound's volume control
        const soundId = generateUniqueSoundId();
        
        // Create volume slider container
        const volumeContainer = document.createElement('div');
        volumeContainer.className = 'flex items-center gap-2';
        volumeContainer.innerHTML = `
            <label for="${soundId}-volume" class="volume-label" style="min-width: 40px;">Vol:</label>
            <input type="range" id="${soundId}-volume" min="0" max="100" value="100" 
                class="volume-slider volume-slider-inline"
                title="Preview volume">
            <span id="${soundId}-volume-label" class="volume-label">100%</span>
        `;
        
        // Create preview button
        const previewBtn = document.createElement('button');
        previewBtn.className = 'bg-blue-600 px-3 py-2 rounded text-sm hover:bg-blue-700 transition flex items-center gap-2';
        previewBtn.title = 'Preview this sound';
        previewBtn.dataset.action = 'test-sound';
        previewBtn.dataset.url = sound.url;
        previewBtn.dataset.volumeInputId = `${soundId}-volume`;
        previewBtn.innerHTML = `
            <i data-lucide="play" style="width: 14px; height: 14px;"></i>
            <span>Preview</span>
        `;
        
        // Create use button
        const useBtn = document.createElement('button');
        useBtn.className = 'bg-green-600 px-3 py-2 rounded text-sm hover:bg-green-700 transition flex items-center gap-2';
        useBtn.title = 'Bind this sound to a gift';
        useBtn.dataset.action = 'bind-to-gift';
        useBtn.dataset.name = sound.name;
        useBtn.dataset.url = sound.url;
        useBtn.innerHTML = `
            <i data-lucide="link" style="width: 14px; height: 14px;"></i>
            <span>Use</span>
        `;
        
        // Create result structure
        div.innerHTML = `
            <div class="myinstants-result-info">
                <div class="myinstants-result-name">${escapeHtml(sound.name)}</div>
                <div class="myinstants-result-url">${escapeHtml(sound.url)}</div>
            </div>
            <div class="myinstants-result-actions"></div>
        `;
        
        // Append controls to actions div
        const actionsDiv = div.querySelector('.myinstants-result-actions');
        actionsDiv.appendChild(volumeContainer);
        actionsDiv.appendChild(previewBtn);
        actionsDiv.appendChild(useBtn);
        
        // Add volume slider change listener
        const volumeSlider = volumeContainer.querySelector(`#${soundId}-volume`);
        const volumeLabel = volumeContainer.querySelector(`#${soundId}-volume-label`);
        volumeSlider.addEventListener('input', function() {
            volumeLabel.textContent = `${this.value}%`;
        });
        
        container.appendChild(div);
    });
    
    // Re-initialize Lucide icons for new elements
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function handleCategoryClick(category) {
    currentCategory = category;
    
    // Update active state
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.category === category) {
            btn.classList.add('active');
        }
    });
}

// ========== GIFT CATALOG MODAL ==========
async function openGiftCatalogModal(soundName, soundUrl) {
    selectedSoundForBinding = { name: soundName, url: soundUrl };
    
    // Update selected sound info
    document.getElementById('selected-sound-name').textContent = soundName;
    
    // Load gift catalog
    const gridDiv = document.getElementById('modal-gift-grid');
    gridDiv.innerHTML = '<div class="text-gray-400 text-sm text-center py-8">Loading gifts...</div>';
    
    try {
        const response = await fetch('/api/soundboard/catalog');
        const data = await response.json();
        
        if (!data.success || !data.gifts || data.gifts.length === 0) {
            gridDiv.innerHTML = '<div class="text-gray-400 text-sm text-center py-8">No gifts available. Please start a TikTok LIVE stream to populate the gift catalog.</div>';
        } else {
            // Get current gift sounds to mark which gifts already have sounds
            const giftSoundsResponse = await fetch('/api/soundboard/gifts');
            const giftSoundsData = await giftSoundsResponse.json();
            const giftSoundsMap = {};
            giftSoundsData.forEach(gs => {
                giftSoundsMap[gs.giftId] = true;
            });
            
            gridDiv.innerHTML = '';
            data.gifts.forEach(gift => {
                const card = document.createElement('div');
                card.className = 'gift-card';
                if (giftSoundsMap[gift.id]) {
                    card.classList.add('has-sound');
                }
                card.dataset.giftId = gift.id;
                card.dataset.giftLabel = gift.name;
                
                const imageHtml = gift.diamond_count 
                    ? `<div class="gift-card-image">💎</div>`
                    : `<div class="gift-card-image">🎁</div>`;
                
                card.innerHTML = `
                    ${imageHtml}
                    <div class="gift-card-name">${escapeHtml(gift.name)}</div>
                    <div class="gift-card-id">ID: ${gift.id}</div>
                    <div class="gift-card-coins">${gift.diamond_count || 0} 💎</div>
                    ${giftSoundsMap[gift.id] ? '<div class="gift-card-badge">Has Sound</div>' : ''}
                `;
                
                card.addEventListener('click', () => bindSoundToGift(gift.id, gift.name));
                gridDiv.appendChild(card);
            });
        }
    } catch (error) {
        log.error('Error loading gift catalog', { error: error.message });
        gridDiv.innerHTML = '<div class="text-red-400 text-sm text-center py-8">Error loading gifts. Please try again.</div>';
    }
    
    // Show modal
    document.getElementById('gift-catalog-modal').classList.add('active');
}

function closeGiftCatalogModal() {
    document.getElementById('gift-catalog-modal').classList.remove('active');
    selectedSoundForBinding = null;
}

async function bindSoundToGift(giftId, giftLabel) {
    if (!selectedSoundForBinding) {
        alert('No sound selected!');
        return;
    }
    
    try {
        const response = await fetch('/api/soundboard/gifts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                giftId: parseInt(giftId),
                label: giftLabel,
                mp3Url: selectedSoundForBinding.url,
                volume: 1.0,
                animationUrl: null,
                animationType: 'none'
            })
        });
        
        const result = await response.json();
        if (result.success) {
            alert(`✅ Sound "${selectedSoundForBinding.name}" successfully bound to gift "${giftLabel}"!`);
            closeGiftCatalogModal();
            
            // Reload gift sounds list
            await loadGiftSounds();
            await loadGiftCatalog();
        } else {
            alert('❌ Failed to bind sound to gift. Please try again.');
        }
    } catch (error) {
        log.error('Error binding sound to gift', { error: error.message });
        alert('❌ Error binding sound to gift!');
    }
}

// ========== AUDIO TESTING & PERMISSIONS ==========
let audioTestMinimized = false;
let soundboardAudioUnlocked = false; // Track if audio has been unlocked (soundboard-specific)

async function ensureAudioUnlocked() {
    if (soundboardAudioUnlocked) {
        return true;
    }
    
    try {
        // Try to create and resume AudioContext
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
            const audioContext = new AudioContext();
            
            if (audioContext.state === 'suspended') {
                await audioContext.resume();
            }
            
            updateAudioContextStatus(audioContext.state);
            
            // Test with a silent audio to unlock
            const audio = document.createElement('audio');
            audio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
            audio.volume = 0.01;
            
            await audio.play();
            soundboardAudioUnlocked = true;
            updateAutoplayStatus('Allowed');
            logAudioEvent('success', 'Audio permissions unlocked', null);
            return true;
        }
    } catch (error) {
        logAudioEvent('warning', `Auto-unlock failed: ${error.message}. Click "Enable Audio Permissions" button.`, null);
        return false;
    }
    return false;
}

function toggleAudioTestCard() {
    audioTestMinimized = !audioTestMinimized;
    const content = document.getElementById('audio-test-content');
    const btn = document.getElementById('minimize-audio-test-btn');
    
    if (audioTestMinimized) {
        content.style.display = 'none';
        btn.innerHTML = '<i data-lucide="chevron-down" style="width: 16px; height: 16px;"></i>';
        btn.title = 'Expand section';
    } else {
        content.style.display = 'block';
        btn.innerHTML = '<i data-lucide="chevron-up" style="width: 16px; height: 16px;"></i>';
        btn.title = 'Collapse section';
    }
    
    // Re-initialize Lucide icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

async function enableAudioPermissions() {
    logAudioEvent('info', 'Attempting to enable audio permissions...', null);
    
    try {
        // Try to create an AudioContext
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
            const audioContext = new AudioContext();
            
            if (audioContext.state === 'suspended') {
                await audioContext.resume();
            }
            
            updateAudioContextStatus(audioContext.state);
            logAudioEvent('success', `Audio context enabled: ${audioContext.state}`, null);
            
            // Test with a silent audio
            const audio = document.createElement('audio');
            audio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
            audio.volume = 0.01;
            
            try {
                await audio.play();
                soundboardAudioUnlocked = true;
                updateAutoplayStatus('Allowed');
                logAudioEvent('success', 'Audio autoplay test passed', null);
            } catch (err) {
                updateAutoplayStatus('Blocked');
                logAudioEvent('warning', `Audio autoplay test failed: ${err.message}`, null);
            }
        }
    } catch (error) {
        log.error('Error enabling audio', { error: error.message });
        logAudioEvent('error', `Failed to enable audio: ${error.message}`, null);
    }
}

function testAudioPlayback() {
    logAudioEvent('info', 'Testing audio playback...', null);
    
    const player = document.getElementById('audio-test-player');
    const audio = document.getElementById('test-audio-element');
    
    player.style.display = 'block';
    
    audio.play().then(() => {
        logAudioEvent('success', 'Test audio playback started', null);
    }).catch(err => {
        logAudioEvent('error', `Test audio playback failed: ${err.message}`, null);
    });
}

function clearAudioLog() {
    const logDiv = document.getElementById('audio-debug-log');
    logDiv.innerHTML = '<div style="color: #60a5fa;">🎵 Audio system ready. Waiting for events...</div>';
}

function updateActiveSoundsCount() {
    const countDiv = document.getElementById('active-sounds-count');
    if (countDiv) {
        countDiv.textContent = audioPool.length;
    }
}

function updateAudioContextStatus(state) {
    const statusDiv = document.getElementById('audio-context-status');
    if (statusDiv) {
        const stateColors = {
            'running': 'text-green-400',
            'suspended': 'text-yellow-400',
            'closed': 'text-red-400'
        };
        statusDiv.innerHTML = `<span class="${stateColors[state] || 'text-gray-400'}">${state || 'Unknown'}</span>`;
    }
}

function updateAutoplayStatus(status) {
    const statusDiv = document.getElementById('autoplay-status');
    if (statusDiv) {
        const statusColors = {
            'Allowed': 'text-green-400',
            'Blocked': 'text-red-400',
            'Checking...': 'text-gray-400'
        };
        statusDiv.innerHTML = `<span class="${statusColors[status] || 'text-gray-400'}">${status}</span>`;
    }
}

function logAudioEvent(level, message, data, alwaysLog = false) {
    const verboseLogging = document.getElementById('verbose-logging');
    
    // Skip logging if verbose logging is disabled AND this is not a critical event
    if (!alwaysLog && verboseLogging && !verboseLogging.checked) {
        return;
    }
    
    const logDiv = document.getElementById('audio-debug-log');
    if (!logDiv) return;
    
    const timestamp = new Date().toLocaleTimeString();
    const icons = {
        'info': 'ℹ️',
        'success': '✅',
        'warning': '⚠️',
        'error': '❌',
        'play': '🔊',
        'preview': '👁️'
    };
    const colors = {
        'info': '#60a5fa',
        'success': '#10b981',
        'warning': '#f59e0b',
        'error': '#ef4444',
        'play': '#8b5cf6',
        'preview': '#ec4899'
    };
    
    const icon = icons[level] || 'ℹ️';
    const color = colors[level] || '#94a3b8';
    
    const entry = document.createElement('div');
    entry.style.color = color;
    entry.style.marginBottom = '4px';
    
    let text = `${icon} [${timestamp}] ${message}`;
    if (data) {
        text += ` ${JSON.stringify(data)}`;
    }
    
    entry.textContent = text;
    
    logDiv.appendChild(entry);
    
    // Auto-scroll to bottom
    logDiv.scrollTop = logDiv.scrollHeight;
    
    // Limit log entries to last 100
    while (logDiv.children.length > 100) {
        logDiv.removeChild(logDiv.firstChild);
    }
}

// Check audio context status on load
function checkAudioSystemStatus() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
        const audioContext = new AudioContext();
        updateAudioContextStatus(audioContext.state);
    } else {
        updateAudioContextStatus('Not supported');
    }
    
    updateAutoplayStatus('Checking...');
}

// ========== EVENT LISTENERS ==========
document.addEventListener('DOMContentLoaded', function() {
    // Initialize Lucide icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    initializeSoundboardWorkspace();
    
    // Load initial data
    loadSoundboardSettings();
    loadGiftSounds();
    loadGiftCatalog();
    loadGiftRecommendations();
    loadCategories(); // Load categories for advanced search
    checkAudioSystemStatus();
    initializeEventSoundSliders(); // Initialize event sound volume sliders
    
    // Soundboard save button
    const saveSoundboardBtn = document.getElementById('save-soundboard-btn');
    if (saveSoundboardBtn) {
        saveSoundboardBtn.addEventListener('click', saveSoundboardSettings);
    }
    
    // Play mode selector - update currentPlayMode when changed
    const playModeSelector = document.getElementById('soundboard-play-mode');
    if (playModeSelector) {
        playModeSelector.addEventListener('change', function() {
            currentPlayMode = this.value;
            log.info('Play mode changed', { mode: currentPlayMode });
            logAudioEvent('info', `Play mode changed to: ${currentPlayMode}`, null);
            
            // Clear all queues when switching modes to prevent confusion
            clearAllQueues();
        });
    }
    
    // Test sound buttons (event delegation)
    document.addEventListener('click', function(event) {
        const testSoundBtn = event.target.closest('[data-test-sound]');
        if (testSoundBtn) {
            const soundType = testSoundBtn.dataset.testSound;
            testEventSound(soundType);
            return;
        }
        
        // Handle MyInstants and gift sound action buttons
        const actionBtn = event.target.closest('[data-action]');
        if (actionBtn) {
            const action = actionBtn.dataset.action;
            if (action === 'test-sound') {
                const url = actionBtn.dataset.url;
                // Check if there's a volume input ID specified (for preview buttons with volume sliders)
                let volume = parseFloat(actionBtn.dataset.volume) || 1.0;
                if (actionBtn.dataset.volumeInputId) {
                    const volumeInput = document.getElementById(actionBtn.dataset.volumeInputId);
                    if (volumeInput) {
                        volume = parseFloat(volumeInput.value) / 100.0; // Convert from 0-100 to 0.0-1.0
                    }
                }
                testGiftSound(url, volume);
            } else if (action === 'use-sound') {
                const name = actionBtn.dataset.name;
                const url = actionBtn.dataset.url;
                useMyInstantsSound(name, url);
            } else if (action === 'bind-to-gift') {
                const name = actionBtn.dataset.name;
                const url = actionBtn.dataset.url;
                openGiftCatalogModal(name, url);
            } else if (action === 'edit-gift') {
                const giftId = parseInt(actionBtn.dataset.giftId);
                openEditGiftModal(giftId);
            } else if (action === 'preview-animation') {
                const animUrl = actionBtn.dataset.animationUrl;
                const animType = actionBtn.dataset.animationType;
                const animVolume = parseFloat(actionBtn.dataset.animationVolume) || 1.0;
                previewAnimation(animUrl, animType, animVolume);
            } else if (action === 'delete-gift') {
                const giftId = parseInt(actionBtn.dataset.giftId);
                deleteGiftSound(giftId);
            } else if (action === 'configure-recommended-gift') {
                const giftId = parseInt(actionBtn.dataset.giftId);
                configureRecommendedGift(giftId);
            }
            return;
        }
    });

    const refreshGiftRecommendationsBtn = document.getElementById('refresh-gift-recommendations-btn');
    if (refreshGiftRecommendationsBtn) {
        refreshGiftRecommendationsBtn.addEventListener('click', loadGiftRecommendations);
    }
    
    // Catalog refresh button
    const refreshCatalogBtn = document.getElementById('refresh-catalog-btn');
    if (refreshCatalogBtn) {
        refreshCatalogBtn.addEventListener('click', refreshGiftCatalog);
    }
    
    // MyInstants search
    const myinstantsSearchBtn = document.getElementById('myinstants-search-btn');
    if (myinstantsSearchBtn) {
        myinstantsSearchBtn.addEventListener('click', searchMyInstants);
    }
    
    // MyInstants search on Enter key
    const myinstantsSearchInput = document.getElementById('myinstants-search-input');
    if (myinstantsSearchInput) {
        myinstantsSearchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                searchMyInstants();
            }
        });
    }

    document.addEventListener('focusin', function(e) {
        const target = e.target;
        if (target && target.matches && target.matches('input[id$="animation-url"]')) {
            activeAnimationInput = target;
        }
    });

    document.addEventListener('change', function(e) {
        const target = e.target;
        if (target && target.matches && target.matches('input[id$="animation-url"]')) {
            const typeSelect = findAnimationTypeSelect(target);
            if (typeSelect && target.value && typeSelect.value === 'none') {
                typeSelect.value = inferAnimationTypeFromUrl(target.value);
            }
        }
    });

    const gifSearchBtn = document.getElementById('gif-search-btn');
    if (gifSearchBtn) {
        gifSearchBtn.addEventListener('click', searchGifs);
    }

    const gifSearchInput = document.getElementById('gif-search-input');
    if (gifSearchInput) {
        gifSearchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                searchGifs();
            }
        });
    }

    const testFocusedAnimationBtn = document.getElementById('test-focused-animation-btn');
    if (testFocusedAnimationBtn) {
        testFocusedAnimationBtn.addEventListener('click', testFocusedAnimation);
    }
    
    // Add gift sound button
    const addGiftSoundBtn = document.getElementById('add-gift-sound-btn');
    if (addGiftSoundBtn) {
        addGiftSoundBtn.addEventListener('click', addGiftSound);
    }
    
    // Clear gift form button
    const clearGiftFormBtn = document.getElementById('clear-gift-form-btn');
    if (clearGiftFormBtn) {
        clearGiftFormBtn.addEventListener('click', clearGiftSoundForm);
    }
    
    // Audio test card minimize/maximize button
    const minimizeAudioTestBtn = document.getElementById('minimize-audio-test-btn');
    if (minimizeAudioTestBtn) {
        minimizeAudioTestBtn.addEventListener('click', toggleAudioTestCard);
    }
    
    // Enable audio button
    const enableAudioBtn = document.getElementById('enable-audio-btn');
    if (enableAudioBtn) {
        enableAudioBtn.addEventListener('click', enableAudioPermissions);
    }
    
    // Test audio button
    const testAudioBtn = document.getElementById('test-audio-btn');
    if (testAudioBtn) {
        testAudioBtn.addEventListener('click', testAudioPlayback);
    }
    
    // Clear audio log button
    const clearAudioLogBtn = document.getElementById('clear-audio-log-btn');
    if (clearAudioLogBtn) {
        clearAudioLogBtn.addEventListener('click', clearAudioLog);
    }
    
    // Verbose logging checkbox
    const verboseLoggingCheckbox = document.getElementById('verbose-logging');
    if (verboseLoggingCheckbox) {
        verboseLoggingCheckbox.addEventListener('change', function() {
            if (this.checked) {
                logAudioEvent('info', 'Verbose logging enabled', null);
            }
        });
    }
    
    // Advanced search button
    const advancedSearchBtn = document.getElementById('advanced-search-btn');
    if (advancedSearchBtn) {
        advancedSearchBtn.addEventListener('click', performAdvancedSearch);
    }
    
    // Advanced search on Enter key
    const advancedSearchInput = document.getElementById('advanced-search-input');
    if (advancedSearchInput) {
        advancedSearchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                performAdvancedSearch();
            }
        });
    }
    
    // Trending search button
    const trendingSearchBtn = document.getElementById('trending-search-btn');
    if (trendingSearchBtn) {
        trendingSearchBtn.addEventListener('click', searchTrending);
    }
    
    // Category buttons (event delegation for dynamically loaded categories)
    const categoryContainer = document.getElementById('category-buttons-container');
    if (categoryContainer) {
        categoryContainer.addEventListener('click', function(e) {
            const categoryBtn = e.target.closest('.category-btn');
            if (categoryBtn && categoryBtn.dataset.category) {
                handleCategoryClick(categoryBtn.dataset.category);
            }
        });
    }
    
    // Close gift catalog modal
    const closeGiftModalBtn = document.getElementById('close-gift-modal');
    if (closeGiftModalBtn) {
        closeGiftModalBtn.addEventListener('click', closeGiftCatalogModal);
    }
    
    // Close modal when clicking overlay
    const giftCatalogModal = document.getElementById('gift-catalog-modal');
    if (giftCatalogModal) {
        giftCatalogModal.addEventListener('click', function(e) {
            if (e.target === this) {
                closeGiftCatalogModal();
            }
        });
    }
    
    // Export audio animations button
    const exportAnimationsBtn = document.getElementById('export-animations-btn');
    if (exportAnimationsBtn) {
        exportAnimationsBtn.addEventListener('click', exportAudioAnimations);
    }
    
    // Import audio animations file input
    const importAnimationsFile = document.getElementById('import-animations-file');
    if (importAnimationsFile) {
        importAnimationsFile.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                importAudioAnimations(file);
            }
            // Reset the input so the same file can be selected again if needed
            e.target.value = '';
        });
    }
    
    // Initialize OBS overlay URL
    initializeOverlayUrl();
    
    // Initialize collapsible sections
    initializeCollapsibleSections();
    
    // Initialize event animation sliders
    initializeEventAnimationSliders();
    
    // Manual config import/export buttons
    const loadConfigToTextareaBtn = document.getElementById('load-config-to-textarea-btn');
    if (loadConfigToTextareaBtn) {
        loadConfigToTextareaBtn.addEventListener('click', loadConfigToTextarea);
    }
    
    const importConfigFromTextareaBtn = document.getElementById('import-config-from-textarea-btn');
    if (importConfigFromTextareaBtn) {
        importConfigFromTextareaBtn.addEventListener('click', importConfigFromTextarea);
    }
    
    const copyConfigTextareaBtn = document.getElementById('copy-config-textarea-btn');
    if (copyConfigTextareaBtn) {
        copyConfigTextareaBtn.addEventListener('click', copyConfigTextarea);
    }
    
    const clearConfigTextareaBtn = document.getElementById('clear-config-textarea-btn');
    if (clearConfigTextareaBtn) {
        clearConfigTextareaBtn.addEventListener('click', clearConfigTextarea);
    }
    
    const minimizeConfigImportExportBtn = document.getElementById('minimize-config-import-export-btn');
    if (minimizeConfigImportExportBtn) {
        minimizeConfigImportExportBtn.addEventListener('click', toggleConfigImportExportCard);
    }
    
    // Load current config into textarea on page load
    loadConfigToTextarea();
    
    logAudioEvent('info', 'Soundboard UI initialized', null);
});

// ========== MANUAL CONFIG IMPORT/EXPORT ==========
let configImportExportMinimized = false;

function toggleConfigImportExportCard() {
    configImportExportMinimized = !configImportExportMinimized;
    const content = document.getElementById('config-import-export-content');
    const btn = document.getElementById('minimize-config-import-export-btn');
    
    if (configImportExportMinimized) {
        content.style.display = 'none';
        btn.innerHTML = '<i data-lucide="chevron-down" style="width: 16px; height: 16px;"></i>';
        btn.title = 'Expand section';
    } else {
        content.style.display = 'block';
        btn.innerHTML = '<i data-lucide="chevron-up" style="width: 16px; height: 16px;"></i>';
        btn.title = 'Collapse section';
    }
    
    // Re-initialize Lucide icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

async function loadConfigToTextarea() {
    const textarea = document.getElementById('config-import-export-textarea');
    if (!textarea) return;
    
    try {
        logAudioEvent('info', 'Loading configuration to textarea...', null);
        
        const response = await fetch('/api/soundboard/export-animations');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Format JSON with indentation for readability
        textarea.value = JSON.stringify(data, null, 2);
        
        logAudioEvent('success', `Configuration loaded: ${data.animationsCount || 0} animations`, null);
    } catch (error) {
        logAudioEvent('error', `Failed to load configuration: ${error.message}`, null);
        textarea.value = '';
        textarea.placeholder = 'Fehler beim Laden der Konfiguration: ' + error.message;
    }
}

async function importConfigFromTextarea() {
    const textarea = document.getElementById('config-import-export-textarea');
    if (!textarea) return;
    
    const configText = textarea.value.trim();
    
    if (!configText) {
        alert('Bitte füge zuerst eine Konfiguration in das Textfeld ein!');
        return;
    }
    
    try {
        logAudioEvent('info', 'Importing configuration from textarea...', null);
        
        const importData = JSON.parse(configText);
        
        // Validate the import data structure
        if (!importData.animations || !Array.isArray(importData.animations)) {
            throw new Error('Ungültiges Datenformat: "animations" Array fehlt');
        }
        
        const response = await fetch('/api/soundboard/import-animations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(importData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            const message = `Import abgeschlossen: ${result.imported} neue, ${result.updated} aktualisiert, ${result.failed} fehlgeschlagen`;
            logAudioEvent('success', message, result);
            
            let alertMessage = `✅ ${message}`;
            if (result.errors && result.errors.length > 0) {
                alertMessage += '\n\nFehler:\n' + result.errors.slice(0, 5).join('\n');
                if (result.errors.length > 5) {
                    alertMessage += `\n... und ${result.errors.length - 5} weitere`;
                }
            }
            
            alert(alertMessage);
            
            // Reload the gift sounds list and catalog to show the imported data
            await loadGiftSounds();
            await loadGiftCatalog();
            
            // Reload config to show updated data
            await loadConfigToTextarea();
        } else {
            throw new Error(result.error || 'Import fehlgeschlagen');
        }
    } catch (error) {
        if (error instanceof SyntaxError) {
            logAudioEvent('error', 'Ungültiges JSON-Format im Textfeld', null);
            alert('❌ Ungültiges JSON-Format! Bitte überprüfe die Syntax.');
        } else {
            logAudioEvent('error', `Import fehlgeschlagen: ${error.message}`, null);
            alert(`❌ Import fehlgeschlagen: ${error.message}`);
        }
    }
}

function copyConfigTextarea() {
    const textarea = document.getElementById('config-import-export-textarea');
    if (!textarea) return;
    
    const text = textarea.value;
    
    if (!text) {
        alert('Das Textfeld ist leer. Klicke zuerst auf "Konfiguration laden".');
        return;
    }
    
    // Use clipboard API with fallback
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            showConfigCopySuccess();
        }).catch(err => {
            log.error('Failed to copy', { error: err?.message || String(err) });
            fallbackCopyConfig(text);
        });
    } else {
        fallbackCopyConfig(text);
    }
}

function fallbackCopyConfig(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.select();
    
    try {
        const successful = document.execCommand('copy');
        if (successful) {
            showConfigCopySuccess();
        } else {
            alert('Kopieren fehlgeschlagen. Bitte manuell kopieren (Strg+C).');
        }
    } catch (err) {
        log.error('Fallback copy failed', { error: err?.message || String(err) });
        alert('Kopieren fehlgeschlagen. Bitte manuell kopieren (Strg+C).');
    }
    
    document.body.removeChild(textArea);
}

function showConfigCopySuccess() {
    const copyBtn = document.getElementById('copy-config-textarea-btn');
    if (copyBtn) {
        const originalHtml = copyBtn.innerHTML;
        copyBtn.innerHTML = '<i data-lucide="check"></i> Kopiert!';
        copyBtn.classList.add('btn-success');
        if (typeof lucide !== 'undefined') lucide.createIcons();
        setTimeout(() => {
            copyBtn.innerHTML = originalHtml;
            copyBtn.classList.remove('btn-success');
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }, 2000);
    }
    logAudioEvent('success', 'Configuration copied to clipboard', null);
}

function clearConfigTextarea() {
    const textarea = document.getElementById('config-import-export-textarea');
    if (textarea) {
        textarea.value = '';
        logAudioEvent('info', 'Textarea cleared', null);
    }
}

// ========== OBS OVERLAY URL ==========
function initializeOverlayUrl() {
    const overlayUrlInput = document.getElementById('animation-overlay-url');
    const copyBtn = document.getElementById('copy-overlay-url');
    const openBtn = document.getElementById('open-overlay-url');
    
    if (overlayUrlInput) {
        // Construct the overlay URL
        const baseUrl = window.location.origin;
        const overlayUrl = `${baseUrl}/animation-overlay.html`;
        overlayUrlInput.value = overlayUrl;
        
        if (openBtn) {
            openBtn.href = overlayUrl;
        }
    }
    
    if (copyBtn) {
        copyBtn.addEventListener('click', function() {
            const url = overlayUrlInput?.value;
            if (url) {
                // Use clipboard API with fallback
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(url).then(() => {
                        showCopySuccess(copyBtn);
                    }).catch(err => {
                        log.error('Failed to copy URL', { error: err?.message || String(err) });
                        fallbackCopy(url, copyBtn);
                    });
                } else {
                    fallbackCopy(url, copyBtn);
                }
            }
        });
    }
}

/**
 * Fallback copy method for browsers without clipboard API
 */
function fallbackCopy(text, copyBtn) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.select();
    
    try {
        const successful = document.execCommand('copy');
        if (successful) {
            showCopySuccess(copyBtn);
        } else {
            alert('Failed to copy URL to clipboard');
        }
    } catch (err) {
        log.error('Fallback copy failed', { error: err?.message || String(err) });
        alert('Failed to copy URL to clipboard');
    }
    
    document.body.removeChild(textArea);
}

/**
 * Show copy success feedback on button
 */
function showCopySuccess(copyBtn) {
    const originalHtml = copyBtn.innerHTML;
    copyBtn.innerHTML = '<i data-lucide="check"></i> Copied!';
    copyBtn.classList.add('btn-success');
    if (typeof lucide !== 'undefined') lucide.createIcons();
    setTimeout(() => {
        copyBtn.innerHTML = originalHtml;
        copyBtn.classList.remove('btn-success');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }, 2000);
}

// ========== COLLAPSIBLE SECTIONS ==========
function initializeCollapsibleSections() {
    document.querySelectorAll('.collapsible-header').forEach(header => {
        header.addEventListener('click', function() {
            const targetId = this.dataset.target;
            const content = document.getElementById(targetId);
            
            if (content) {
                const isActive = this.classList.contains('active');
                
                if (isActive) {
                    // Collapse
                    this.classList.remove('active');
                    content.classList.remove('active');
                } else {
                    // Expand
                    this.classList.add('active');
                    content.classList.add('active');
                }
            }
        });
    });
}

// ========== EVENT ANIMATION SLIDERS ==========
function initializeEventAnimationSliders() {
    const events = ['follow', 'subscribe', 'share', 'gift', 'like'];
    
    events.forEach(eventType => {
        const sliderId = `soundboard-${eventType}-animation-volume-slider`;
        const inputId = `soundboard-${eventType}-animation-volume`;
        const labelId = `soundboard-${eventType}-animation-volume-label`;
        
        const slider = document.getElementById(sliderId);
        const input = document.getElementById(inputId);
        const label = document.getElementById(labelId);
        
        if (slider && input && label) {
            slider.addEventListener('input', function() {
                const percentage = this.value;
                const volumeValue = parseFloat(percentage) / 100.0;
                label.textContent = `${percentage}%`;
                input.value = volumeValue.toFixed(1);
            });
            
            input.addEventListener('change', function() {
                const volumeValue = parseFloat(this.value);
                const percentage = Math.round(volumeValue * 100);
                slider.value = percentage;
                label.textContent = `${percentage}%`;
            });
        }
    });
}
}
