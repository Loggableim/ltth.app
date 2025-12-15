// TTS Admin Panel JavaScript - Production Version
// CSP-compliant, no inline handlers, robust error handling

// ============================================================================
// GLOBAL STATE
// ============================================================================
let socket = null;
let currentConfig = {};
let currentUsers = [];
let currentFilter = 'all';
let voices = {};
let queuePollInterval = null;
let statsPollInterval = null;

// Debug logs state
let debugLogs = [];
let debugFilter = 'all';
let debugEnabled = true;
let autoScrollLogs = true;

// Connection state management
let isPageUnloading = false;
let socketReady = false;
let abortControllers = new Set();

// ============================================================================
// SOCKET.IO INITIALIZATION
// ============================================================================
function initializeSocket() {
    return new Promise((resolve, reject) => {
        try {
            if (typeof io !== 'undefined') {
                socket = io({
                    // Configure Socket.IO client for better reliability
                    autoConnect: true,
                    // Reduce reconnection attempts to prevent errors during page transitions
                    reconnectionAttempts: 5,
                    reconnectionDelay: 1000,
                    // Timeout faster to fail gracefully
                    timeout: 10000
                });

                socket.on('connect', () => {
                    socketReady = true;
                    console.log('✓ Socket.io connected');
                    resolve();
                });

                socket.on('connect_error', (error) => {
                    console.error('Socket.io connection error:', error);
                    // Resolve anyway to allow page to function with polling fallback
                    // This ensures the Promise doesn't hang indefinitely
                    resolve();
                });

                // Setup socket event listeners
                socket.on('tts:queue_update', () => {
                    if (!isPageUnloading) {
                        loadQueue().catch(err => console.error('Queue update failed:', err));
                    }
                });

                socket.on('tts:config_update', () => {
                    if (!isPageUnloading) {
                        loadConfig().catch(err => console.error('Config update failed:', err));
                    }
                });

                // Debug log listener
                socket.on('tts:debug', (logEntry) => {
                    if (!isPageUnloading) {
                        addDebugLog(logEntry);
                    }
                });

                socket.on('disconnect', () => {
                    socketReady = false;
                    console.log('Socket.io disconnected');
                });
            } else {
                console.warn('⚠ Socket.io not available - using polling only');
                resolve();
            }
        } catch (error) {
            console.error('Socket.io initialization error:', error);
            resolve(); // Resolve anyway to allow polling fallback
        }
    });
}

// ============================================================================
// FETCH HELPERS WITH VALIDATION
// ============================================================================

/**
 * Validates and parses JSON response with comprehensive error handling
 */
async function fetchJSON(url, options = {}) {
    // Don't make requests if page is unloading
    if (isPageUnloading) {
        throw new Error('Page is unloading, request cancelled');
    }

    // Create abort controller for this request
    const controller = new AbortController();
    abortControllers.add(controller);
    
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });

        // Check HTTP status
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Validate Content-Type
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('Expected JSON but got:', contentType, '\nResponse:', text.substring(0, 200));
            throw new Error(`Expected JSON but received ${contentType || 'unknown type'}`);
        }

        // Parse JSON with error handling
        let data;
        try {
            data = await response.json();
        } catch (parseError) {
            throw new Error(`JSON parse failed: ${parseError.message}`);
        }

        return data;

    } catch (error) {
        // Don't log errors if page is unloading or request was aborted
        if (!isPageUnloading && error.name !== 'AbortError') {
            console.error(`Fetch failed for ${url}:`, error);
        }
        throw error;
    } finally {
        // Clean up abort controller
        abortControllers.delete(controller);
    }
}

/**
 * POST request helper with JSON validation
 */
async function postJSON(url, body) {
    return fetchJSON(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
}

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 TTS Admin Panel initializing...');

    const statusEl = document.getElementById('init-status');
    const debugInfo = document.getElementById('debug-info');

    try {
        // Initialize Socket.io and wait for connection or timeout
        if (statusEl) statusEl.textContent = 'Connecting to server...';
        await initializeSocket();
        console.log('✓ Socket.io initialization complete');

        // Load configuration
        if (statusEl) statusEl.textContent = 'Loading configuration...';
        await loadConfig();
        console.log('✓ Config loaded');

        // Load voices
        if (statusEl) statusEl.textContent = 'Loading voices...';
        await loadVoices();
        console.log('✓ Voices loaded');

        // Load users (non-critical)
        if (statusEl) statusEl.textContent = 'Loading users...';
        try {
            await loadUsers();
            console.log('✓ Users loaded');
        } catch (error) {
            if (!isPageUnloading && error.name !== 'AbortError') {
                console.error('✗ Users load failed:', error);
                showNotification('Failed to load users (non-critical)', 'warning');
            }
        }

        // Load statistics (non-critical)
        if (statusEl) statusEl.textContent = 'Loading statistics...';
        try {
            await loadStats();
            console.log('✓ Stats loaded');
        } catch (error) {
            if (!isPageUnloading && error.name !== 'AbortError') {
                console.error('✗ Stats load failed:', error);
                showNotification('Failed to load statistics (non-critical)', 'warning');
            }
        }

        // Load plugin status (including debug mode)
        if (statusEl) statusEl.textContent = 'Loading plugin status...';
        try {
            await loadPluginStatus();
            console.log('✓ Plugin status loaded');
        } catch (error) {
            if (!isPageUnloading && error.name !== 'AbortError') {
                console.error('✗ Plugin status load failed:', error);
            }
        }

        // Load debug logs (non-critical)
        if (statusEl) statusEl.textContent = 'Loading debug logs...';
        try {
            await loadDebugLogs();
            updateDebugModeUI();
            console.log('✓ Debug logs loaded');
        } catch (error) {
            if (!isPageUnloading && error.name !== 'AbortError') {
                console.error('✗ Debug logs load failed:', error);
            }
        }

        // Load recent chat users for autocomplete (non-critical)
        try {
            await loadRecentUsers();
            console.log('✓ Recent users loaded for autocomplete');
        } catch (error) {
            if (!isPageUnloading && error.name !== 'AbortError') {
                console.error('✗ Recent users load failed:', error);
            }
        }

        // Setup event listeners
        setupEventListeners();

        // Start polling only after all initial loading is complete
        startQueuePolling();
        startStatsPolling();

        // Success!
        console.log('✓ TTS Admin Panel initialized successfully');
        if (statusEl) statusEl.innerHTML = '<span class="text-green-500">✓ Initialized successfully</span>';
        if (debugInfo) debugInfo.style.display = 'none';

    } catch (error) {
        if (!isPageUnloading) {
            console.error('✗ Initialization failed:', error);
            if (statusEl) {
                statusEl.innerHTML = `<span class="text-red-500">✗ Init failed: ${error.message}</span>`;
            }
            showNotification(`Initialization failed: ${error.message}`, 'error');
        }
        // Hide the loading banner even on error - the status element shows the error state
        if (debugInfo) debugInfo.style.display = 'none';
    }
});

// ============================================================================
// PAGE UNLOAD CLEANUP
// ============================================================================

// Handle page unload - clean up connections and cancel pending requests
window.addEventListener('beforeunload', () => {
    console.log('🔌 Page unloading - cleaning up connections...');
    isPageUnloading = true;
    
    // Stop polling
    if (queuePollInterval) {
        clearInterval(queuePollInterval);
        queuePollInterval = null;
    }
    
    if (statsPollInterval) {
        clearInterval(statsPollInterval);
        statsPollInterval = null;
    }
    
    // Abort all pending fetch requests
    abortControllers.forEach(controller => {
        try {
            controller.abort();
        } catch (e) {
            // Ignore abort errors
        }
    });
    abortControllers.clear();
    
    // Disconnect Socket.IO cleanly
    if (socket) {
        try {
            socket.disconnect();
        } catch (e) {
            // Ignore disconnect errors
        }
    }
});

// Also handle visibilitychange for when page becomes hidden
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // Page is hidden - pause polling to save resources
        if (queuePollInterval) {
            clearInterval(queuePollInterval);
            queuePollInterval = null;
        }
        if (statsPollInterval) {
            clearInterval(statsPollInterval);
            statsPollInterval = null;
        }
    } else {
        // Page is visible again - restart polling if not unloading
        if (!isPageUnloading) {
            startQueuePolling();
            startStatsPolling();
        }
    }
});

// ============================================================================
// TAB MANAGEMENT
// ============================================================================

function switchTab(tabName) {
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(el => {
        el.classList.add('hidden');
    });

    // Reset all tab buttons
    document.querySelectorAll('.tab-button').forEach(el => {
        el.classList.remove('border-blue-500', 'text-blue-400');
        el.classList.add('border-transparent', 'text-gray-400');
    });

    // Show selected tab
    const contentEl = document.getElementById(`content-${tabName}`);
    if (contentEl) {
        contentEl.classList.remove('hidden');
    }

    // Highlight selected button
    const buttonEl = document.getElementById(`tab-${tabName}`);
    if (buttonEl) {
        buttonEl.classList.remove('border-transparent', 'text-gray-400');
        buttonEl.classList.add('border-blue-500', 'text-blue-400');
    }

    // Refresh recent users when switching to users tab
    if (tabName === 'users') {
        loadRecentUsers().catch(err => console.error('Failed to refresh recent users:', err));
    }

    // Load voice clones when switching to voice-clones tab
    if (tabName === 'voice-clones') {
        loadVoiceClones().catch(err => console.error('Failed to load voice clones:', err));
    }
}

// ============================================================================
// CONFIGURATION MANAGEMENT
// ============================================================================

async function loadConfig() {
    try {
        const data = await fetchJSON('/api/tts/config');

        if (!data.success) {
            throw new Error(data.error || 'Unknown error loading config');
        }

        currentConfig = data.config;
        populateConfig(currentConfig);
        
        // Show/hide emotion selector based on current engine
        const selectedEngine = currentConfig.defaultEngine || 'tiktok';
        const emotionContainer = document.getElementById('defaultEmotionContainer');
        if (emotionContainer) {
            emotionContainer.style.display = (selectedEngine === 'speechify') ? 'block' : 'none';
        }

    } catch (error) {
        console.error('Failed to load config:', error);
        showNotification(`Failed to load configuration: ${error.message}`, 'error');
        throw error; // Re-throw for initialization to catch
    }
}

function populateConfig(config) {
    // Helper to safely set element value
    const setValue = (id, value) => {
        const el = document.getElementById(id);
        if (el) {
            if (el.type === 'checkbox') {
                el.checked = value;
            } else {
                el.value = value;
            }
        }
    };

    // Helper to safely set text content
    const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    // Populate all fields
    setValue('defaultEngine', config.defaultEngine || 'tiktok');
    setValue('defaultEmotion', config.defaultEmotion || '');
    setValue('volume', config.volume || 80);
    setText('volumeValue', config.volume || 80);
    setValue('speed', config.speed || 1.0);
    setText('speedValue', config.speed || 1.0);
    setValue('teamMinLevel', config.teamMinLevel || 0);
    setValue('rateLimit', config.rateLimit || 3);
    setValue('rateLimitWindow', config.rateLimitWindow || 60);
    setValue('maxQueueSize', config.maxQueueSize || 100);
    setValue('maxTextLength', config.maxTextLength || 300);
    setValue('profanityFilter', config.profanityFilter || 'moderate');
    setValue('duckOtherAudio', config.duckOtherAudio || false);
    setValue('duckVolume', (config.duckVolume || 0.3) * 100);
    setText('duckVolumeValue', Math.round((config.duckVolume || 0.3) * 100));
    setValue('enabledForChat', config.enabledForChat !== false);
    setValue('autoLanguageDetection', config.autoLanguageDetection !== false);
    setValue('enableAutoFallback', config.enableAutoFallback !== false);
    setValue('stripEmojis', config.stripEmojis || false);
    
    // Message prefix filter - convert array to space-separated string
    const prefixFilterValue = (config.messagePrefixFilter && Array.isArray(config.messagePrefixFilter)) 
        ? config.messagePrefixFilter.join(' ') 
        : '';
    setValue('messagePrefixFilter', prefixFilterValue);

    // Fallback engine activation settings
    setValue('enableTikTokFallback', config.enableTikTokFallback !== false);
    setValue('enableGoogleFallback', config.enableGoogleFallback !== false);
    setValue('enableSpeechifyFallback', config.enableSpeechifyFallback || false);
    setValue('enableElevenlabsFallback', config.enableElevenlabsFallback || false);
    setValue('enableOpenAIFallback', config.enableOpenAIFallback || false);
    setValue('enableFishAudioFallback', config.enableFishAudioFallback || false);
    setValue('enableSiliconFlowFallback', config.enableSiliconFlowFallback || false);

    // Language detection settings
    setValue('fallbackLanguage', config.fallbackLanguage || 'de');
    setValue('languageConfidenceThreshold', config.languageConfidenceThreshold || 0.90);
    setText('confidenceThresholdValue', Math.round((config.languageConfidenceThreshold || 0.90) * 100));
    setValue('languageMinTextLength', config.languageMinTextLength || 10);

    // Performance mode
    setValue('performanceMode', config.performanceMode || 'balanced');

    // API keys are now managed in the global Settings panel
    // (removed API key loading code)

    // Load TikTok SessionID (deprecated but kept for backwards compatibility)
    const tiktokSessionInput = document.getElementById('tiktokSessionId');
    if (tiktokSessionInput) {
        if (config.tiktokSessionId) {
            if (config.tiktokSessionId === '***HIDDEN***') {
                tiktokSessionInput.placeholder = 'SessionID configured (hidden for security)';
                tiktokSessionInput.value = '';
            } else {
                tiktokSessionInput.value = config.tiktokSessionId;
            }
        } else {
            tiktokSessionInput.placeholder = 'Enter SessionID...';
            tiktokSessionInput.value = '';
        }
    }
}

async function saveConfig() {
    try {
        // Gather all config values
        const config = {
            defaultEngine: document.getElementById('defaultEngine').value,
            defaultVoice: document.getElementById('defaultVoice').value,
            defaultEmotion: document.getElementById('defaultEmotion')?.value || null,
            volume: parseInt(document.getElementById('volume').value, 10),
            speed: parseFloat(document.getElementById('speed').value),
            teamMinLevel: parseInt(document.getElementById('teamMinLevel').value, 10),
            rateLimit: parseInt(document.getElementById('rateLimit').value, 10),
            rateLimitWindow: parseInt(document.getElementById('rateLimitWindow').value, 10),
            maxQueueSize: parseInt(document.getElementById('maxQueueSize').value, 10),
            maxTextLength: parseInt(document.getElementById('maxTextLength').value, 10),
            profanityFilter: document.getElementById('profanityFilter').value,
            duckOtherAudio: document.getElementById('duckOtherAudio').checked,
            duckVolume: parseInt(document.getElementById('duckVolume').value, 10) / 100,
            enabledForChat: document.getElementById('enabledForChat').checked,
            autoLanguageDetection: document.getElementById('autoLanguageDetection').checked,
            enableAutoFallback: document.getElementById('enableAutoFallback').checked,
            stripEmojis: document.getElementById('stripEmojis').checked,
            // Message prefix filter - convert space-separated string to array
            messagePrefixFilter: document.getElementById('messagePrefixFilter').value
                .split(/\s+/)
                .map(p => p.trim())
                .filter(p => p.length > 0),
            // Fallback engine activation settings
            enableTikTokFallback: document.getElementById('enableTikTokFallback')?.checked !== false,
            enableGoogleFallback: document.getElementById('enableGoogleFallback')?.checked || false,
            enableSpeechifyFallback: document.getElementById('enableSpeechifyFallback')?.checked || false,
            enableElevenlabsFallback: document.getElementById('enableElevenlabsFallback')?.checked || false,
            enableOpenAIFallback: document.getElementById('enableOpenAIFallback')?.checked || false,
            enableFishAudioFallback: document.getElementById('enableFishAudioFallback')?.checked || false,
            enableSiliconFlowFallback: document.getElementById('enableSiliconFlowFallback')?.checked || false,
            // Language detection settings
            fallbackLanguage: document.getElementById('fallbackLanguage').value,
            languageConfidenceThreshold: parseFloat(document.getElementById('languageConfidenceThreshold').value),
            languageMinTextLength: parseInt(document.getElementById('languageMinTextLength').value, 10),
            // Performance mode
            performanceMode: document.getElementById('performanceMode').value
        };

        // API keys are now managed in global Settings panel
        // (removed API key handling code)

        // Get TikTok SessionID (deprecated but kept for backwards compatibility)
        const tiktokSessionId = document.getElementById('tiktokSessionId')?.value?.trim();
        if (tiktokSessionId && tiktokSessionId !== '***HIDDEN***') {
            config.tiktokSessionId = tiktokSessionId;
        }

        // Save to server
        const data = await postJSON('/api/tts/config', config);

        if (!data.success) {
            throw new Error(data.error || 'Failed to save configuration');
        }

        currentConfig = data.config;
        showNotification('Configuration saved successfully', 'success');

    } catch (error) {
        console.error('Failed to save config:', error);
        showNotification(`Failed to save configuration: ${error.message}`, 'error');
    }
}

// ============================================================================
// VOICE MANAGEMENT
// ============================================================================

async function loadVoices() {
    try {
        const data = await fetchJSON('/api/tts/voices?engine=all');

        if (!data.success) {
            throw new Error(data.error || 'Failed to load voices');
        }

        voices = data.voices;
        populateVoiceSelect();
        populateManualVoiceSelect(); // Also populate manual assignment dropdown

    } catch (error) {
        console.error('Failed to load voices:', error);
        showNotification(`Failed to load voices: ${error.message}`, 'error');
        throw error;
    }
}

function populateVoiceSelect() {
    const select = document.getElementById('defaultVoice');
    if (!select) return;

    select.innerHTML = '';

    const engine = document.getElementById('defaultEngine')?.value || 'tiktok';
    const engineVoices = voices[engine];

    if (!engineVoices) {
        select.innerHTML = '<option value="">No voices available</option>';
        return;
    }

    const optgroup = document.createElement('optgroup');
    let voiceLabel;
    let sortedVoiceIds;

    if (engine === 'tiktok') {
        voiceLabel = 'TikTok TTS';
        sortedVoiceIds = Object.keys(engineVoices);
    } else if (engine === 'google') {
        voiceLabel = 'Google Cloud TTS';
        sortedVoiceIds = Object.keys(engineVoices);
    } else if (engine === 'speechify') {
        voiceLabel = '🎙️ Speechify';
        // Speechify voices sorted by language then name
        sortedVoiceIds = Object.keys(engineVoices).sort((a, b) => {
            const langCompare = engineVoices[a].language.localeCompare(engineVoices[b].language);
            if (langCompare !== 0) return langCompare;
            return engineVoices[a].name.localeCompare(engineVoices[b].name);
        });
    } else {
        voiceLabel = engine.toUpperCase() + ' TTS';
        sortedVoiceIds = Object.keys(engineVoices);
    }

    optgroup.label = voiceLabel;

    sortedVoiceIds.forEach(id => {
        const voice = engineVoices[id];
        const option = document.createElement('option');
        option.value = id;
        option.textContent = voice.name || id;
        optgroup.appendChild(option);
    });

    select.appendChild(optgroup);

    // Set current default voice - ONLY if it belongs to the selected engine
    if (currentConfig.defaultVoice && engineVoices[currentConfig.defaultVoice]) {
        select.value = currentConfig.defaultVoice;
    } else if (currentConfig.defaultVoice && !engineVoices[currentConfig.defaultVoice]) {
        // Voice doesn't belong to this engine - reset to first available voice
        const firstVoiceId = Object.keys(engineVoices)[0];
        if (firstVoiceId) {
            select.value = firstVoiceId;
            console.warn(`Default voice '${currentConfig.defaultVoice}' not available for engine '${engine}', reset to '${firstVoiceId}'`);
        }
    }
}

/**
 * Populate manual voice assignment dropdown
 */
function populateManualVoiceSelect() {
    const select = document.getElementById('manualVoice');
    if (!select) return;

    select.innerHTML = '';

    const engine = document.getElementById('manualEngine')?.value || 'tiktok';
    const engineVoices = voices[engine];

    if (!engineVoices) {
        select.innerHTML = '<option value="">No voices available</option>';
        return;
    }

    // Sort voices by name
    const sortedVoices = Object.entries(engineVoices).sort((a, b) => {
        return a[1].name.localeCompare(b[1].name);
    });

    sortedVoices.forEach(([id, voice]) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = voice.name || id;
        select.appendChild(option);
    });

    console.log(`[TTS] Populated manual voice select with ${sortedVoices.length} voices for engine '${engine}'`);
}

/**
 * Assign voice manually (username input)
 * IMPORTANT: Use username (uniqueId) as userId for consistency with TikTok events
 */
async function assignManualVoice() {
    const usernameInput = document.getElementById('manualUsername');
    const engineSelect = document.getElementById('manualEngine');
    const voiceSelect = document.getElementById('manualVoice');

    if (!usernameInput || !engineSelect || !voiceSelect) {
        showNotification('Form elements not found', 'error');
        return;
    }

    const username = usernameInput.value.trim();
    const engine = engineSelect.value;
    const voiceId = voiceSelect.value;

    // Validation
    if (!username) {
        showNotification('Please enter a username', 'warning');
        usernameInput.focus();
        return;
    }

    if (!voiceId) {
        showNotification('Please select a voice', 'warning');
        return;
    }

    console.log(`[TTS] Assigning voice '${voiceId}' (${engine}) to user '${username}'`);

    try {
        // CRITICAL: Use username as userId to match TikTok's uniqueId
        // TikTok uses uniqueId (username) as the primary identifier
        const userId = username;

        const data = await postJSON(`/api/tts/users/${encodeURIComponent(userId)}/voice`, {
            username: username,  // Store the same value for consistency
            voiceId,
            engine
        });

        if (!data.success) {
            throw new Error(data.error || 'Failed to assign voice');
        }

        showNotification(`✓ Voice '${voiceId}' (${engine}) assigned to ${username}`, 'success');

        // Clear form
        usernameInput.value = '';

        // Reload user list to show the newly assigned user
        await loadUsers(currentFilter);

    } catch (error) {
        console.error('Failed to assign voice manually:', error);
        showNotification(`Failed to assign voice: ${error.message}`, 'error');
    }
}

// ============================================================================
// USER MANAGEMENT
// ============================================================================

async function loadUsers(filter = null) {
    try {
        const filterParam = filter && filter !== 'all' ? `?filter=${filter}` : '';
        const data = await fetchJSON(`/api/tts/users${filterParam}`);

        if (!data.success) {
            throw new Error(data.error || 'Failed to load users');
        }

        currentUsers = data.users || [];
        renderUsers();

    } catch (error) {
        console.error('Failed to load users:', error);
        showNotification(`Failed to load users: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Load recent chat users for autocomplete
 */
async function loadRecentUsers() {
    try {
        const data = await fetchJSON('/api/tts/recent-users?limit=100');

        if (!data.success) {
            throw new Error(data.error || 'Failed to load recent users');
        }

        const datalist = document.getElementById('recentUsersList');
        if (datalist && data.users) {
            // Clear existing options
            datalist.innerHTML = '';
            
            // Add options for each recent user
            data.users.forEach(user => {
                const option = document.createElement('option');
                option.value = user.username;
                datalist.appendChild(option);
            });
            
            console.log(`Loaded ${data.users.length} recent users for autocomplete`);
        }

    } catch (error) {
        console.error('Failed to load recent users:', error);
        // Non-critical, don't throw
    }
}

function filterUsers(filter) {
    currentFilter = filter;

    // Update filter button styles
    document.querySelectorAll('.filter-btn').forEach(btn => {
        if (btn.dataset.filter === filter) {
            btn.classList.add('bg-blue-600');
            btn.classList.remove('bg-gray-700');
        } else {
            btn.classList.remove('bg-blue-600');
            btn.classList.add('bg-gray-700');
        }
    });

    loadUsers(filter === 'all' ? null : filter).catch(err => {
        console.error('Filter failed:', err);
    });
}

function renderUsers() {
    const list = document.getElementById('userList');
    if (!list) return;

    // No search filter - removed as requested
    const filtered = currentUsers;

    if (filtered.length === 0) {
        list.innerHTML = '<div class="text-gray-400 text-center py-8">No users found. Users are automatically created when they first use TTS.</div>';
        return;
    }

    console.log(`[TTS] Rendering ${filtered.length} users:`, filtered.map(u => ({
        user_id: u.user_id,
        username: u.username,
        voice: u.assigned_voice_id,
        engine: u.assigned_engine
    })));

    list.innerHTML = filtered.map(user => {
        const allowButton = !user.allow_tts
            ? `<button class="user-action-btn bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm" data-action="allow" data-user-id="${user.user_id}" data-username="${user.username}">Allow</button>`
            : `<button class="user-action-btn bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1 rounded text-sm" data-action="deny" data-user-id="${user.user_id}" data-username="${user.username}">Revoke</button>`;

        const blacklistButton = !user.is_blacklisted
            ? `<button class="user-action-btn bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm" data-action="blacklist" data-user-id="${user.user_id}" data-username="${user.username}">Blacklist</button>`
            : `<button class="user-action-btn bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm" data-action="unblacklist" data-user-id="${user.user_id}" data-username="${user.username}">Unblacklist</button>`;

        return `
            <div class="bg-gray-700 rounded p-4 flex justify-between items-center fade-in">
                <div class="flex-1">
                    <div class="font-bold">${escapeHtml(user.username)}</div>
                    <div class="text-sm text-gray-400">
                        User ID: ${escapeHtml(user.user_id)}
                    </div>
                    <div class="text-sm text-gray-300 mt-1">
                        ${user.assigned_voice_id ? `🎤 Voice: <strong>${escapeHtml(user.assigned_voice_id)}</strong> (${escapeHtml(user.assigned_engine || 'unknown')})` : '🔇 No voice assigned'}
                    </div>
                    <div class="text-xs text-gray-500 mt-1">
                        ${user.allow_tts ? '<span class="text-green-400">✓ Allowed</span>' : ''}
                        ${user.is_blacklisted ? '<span class="text-red-400">⛔ Blacklisted</span>' : ''}
                    </div>
                </div>
                <div class="flex space-x-2">
                    ${allowButton}
                    ${blacklistButton}
                    <button class="user-action-btn bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded text-sm" data-action="assign-voice" data-user-id="${user.user_id}" data-username="${user.username}">
                        ${user.assigned_voice_id ? 'Change' : 'Assign'} Voice
                    </button>
                </div>
            </div>
        `;
    }).join('');

    // Attach event listeners to user action buttons
    list.querySelectorAll('.user-action-btn').forEach(btn => {
        btn.addEventListener('click', handleUserAction);
    });
}

async function handleUserAction(event) {
    const btn = event.currentTarget;
    const action = btn.dataset.action;
    const userId = btn.dataset.userId;
    const username = btn.dataset.username;

    try {
        switch (action) {
            case 'allow':
                await allowUser(userId, username);
                break;
            case 'deny':
                await denyUser(userId, username);
                break;
            case 'blacklist':
                await blacklistUser(userId, username);
                break;
            case 'unblacklist':
                await unblacklistUser(userId);
                break;
            case 'assign-voice':
                assignVoiceDialog(userId, username);
                break;
        }
    } catch (error) {
        console.error('User action failed:', error);
    }
}

async function allowUser(userId, username) {
    try {
        const data = await postJSON(`/api/tts/users/${userId}/allow`, { username });

        if (!data.success) {
            throw new Error(data.error || 'Failed to allow user');
        }

        showNotification(`TTS allowed for ${username}`, 'success');
        await loadUsers(currentFilter);

    } catch (error) {
        console.error('Failed to allow user:', error);
        showNotification(`Failed to allow user: ${error.message}`, 'error');
    }
}

async function denyUser(userId, username) {
    try {
        const data = await postJSON(`/api/tts/users/${userId}/deny`, { username });

        if (!data.success) {
            throw new Error(data.error || 'Failed to deny user');
        }

        showNotification(`TTS revoked for ${username}`, 'success');
        await loadUsers(currentFilter);

    } catch (error) {
        console.error('Failed to deny user:', error);
        showNotification(`Failed to deny user: ${error.message}`, 'error');
    }
}

async function blacklistUser(userId, username) {
    if (!confirm(`Are you sure you want to blacklist ${username}?`)) return;

    try {
        const data = await postJSON(`/api/tts/users/${userId}/blacklist`, { username });

        if (!data.success) {
            throw new Error(data.error || 'Failed to blacklist user');
        }

        showNotification(`${username} has been blacklisted`, 'success');
        await loadUsers(currentFilter);

    } catch (error) {
        console.error('Failed to blacklist user:', error);
        showNotification(`Failed to blacklist user: ${error.message}`, 'error');
    }
}

async function unblacklistUser(userId) {
    try {
        const data = await postJSON(`/api/tts/users/${userId}/unblacklist`, {});

        if (!data.success) {
            throw new Error(data.error || 'Failed to unblacklist user');
        }

        showNotification('User removed from blacklist', 'success');
        await loadUsers(currentFilter);

    } catch (error) {
        console.error('Failed to unblacklist user:', error);
        showNotification(`Failed to unblacklist user: ${error.message}`, 'error');
    }
}

// Voice Assignment Modal State
let modalState = {
    userId: null,
    username: null,
    selectedVoiceId: null,
    selectedEngine: 'tiktok'
};

function assignVoiceDialog(userId, username) {
    console.log('[TTS] Opening voice assignment dialog for:', { userId, username });

    modalState.userId = userId;
    modalState.username = username;
    modalState.selectedVoiceId = null;
    modalState.selectedEngine = 'tiktok';
    modalState.selectedEmotion = null;

    const modal = document.getElementById('voiceAssignmentModal');
    const usernameEl = document.getElementById('modalUsername');
    const engineSelect = document.getElementById('modalEngine');
    const emotionSelect = document.getElementById('modalEmotion');
    const emotionContainer = document.getElementById('modalEmotionContainer');
    const voiceSearch = document.getElementById('modalVoiceSearch');

    console.log('[TTS] Modal elements found:', {
        modal: !!modal,
        usernameEl: !!usernameEl,
        engineSelect: !!engineSelect,
        emotionSelect: !!emotionSelect,
        emotionContainer: !!emotionContainer,
        voiceSearch: !!voiceSearch
    });

    if (!modal) {
        console.error('[TTS] Modal element not found! Cannot open voice assignment dialog.');
        showNotification('Error: Voice assignment dialog not available', 'error');
        return;
    }

    if (usernameEl) usernameEl.textContent = username;
    if (engineSelect) {
        engineSelect.value = 'tiktok';
        engineSelect.onchange = () => {
            modalState.selectedEngine = engineSelect.value;
            console.log('[TTS] Engine changed to:', modalState.selectedEngine);
            
            // Show/hide emotion selector
            if (emotionContainer) {
                emotionContainer.style.display = (modalState.selectedEngine === 'speechify') ? 'block' : 'none';
            }
            
            renderModalVoiceList();
        };
    }
    if (emotionSelect) {
        emotionSelect.value = '';
        emotionSelect.onchange = () => {
            modalState.selectedEmotion = emotionSelect.value || null;
            console.log('[TTS] Emotion changed to:', modalState.selectedEmotion);
        };
    }
    if (voiceSearch) {
        voiceSearch.value = '';
        voiceSearch.oninput = renderModalVoiceList;
    }

    // Initially hide emotion selector (will show if speechify is selected)
    if (emotionContainer) {
        emotionContainer.style.display = 'none';
    }

    console.log('[TTS] Rendering voice list...');
    renderModalVoiceList();

    console.log('[TTS] Opening modal...');
    modal.classList.remove('hidden');

    const confirmBtn = document.getElementById('confirmVoiceAssignment');
    if (confirmBtn) {
        confirmBtn.onclick = async () => {
            if (!modalState.selectedVoiceId) {
                showNotification('Please select a voice', 'error');
                return;
            }
            console.log('[TTS] Assigning voice:', modalState.selectedVoiceId, 'with emotion:', modalState.selectedEmotion, 'to user:', username);
            await assignVoice(modalState.userId, modalState.username, modalState.selectedVoiceId, modalState.selectedEngine, modalState.selectedEmotion);
            closeVoiceAssignmentModal();
        };
    }

    console.log('[TTS] Voice assignment dialog opened successfully');
}

function closeVoiceAssignmentModal() {
    const modal = document.getElementById('voiceAssignmentModal');
    if (modal) modal.classList.add('hidden');
    // TikTok TTS temporarily disabled in UI
    modalState = { userId: null, username: null, selectedVoiceId: null, selectedEngine: 'tiktok' };
}

function renderModalVoiceList() {
    const list = document.getElementById('modalVoiceList');
    if (!list) {
        console.warn('[TTS] modalVoiceList element not found');
        return;
    }

    const engine = modalState.selectedEngine;
    const voiceList = voices[engine];
    const searchTerm = document.getElementById('modalVoiceSearch')?.value.toLowerCase() || '';

    console.log('[TTS] Rendering voice list:', {
        engine,
        voiceCount: voiceList ? Object.keys(voiceList).length : 0,
        searchTerm,
        allVoices: Object.keys(voices)
    });

    if (!voiceList || Object.keys(voiceList).length === 0) {
        list.innerHTML = '<div class="text-gray-400 text-center py-4">No voices available for this engine</div>';
        console.warn('[TTS] No voices available for engine:', engine);
        return;
    }

    const filteredVoices = Object.entries(voiceList).filter(([id, voice]) =>
        id.toLowerCase().includes(searchTerm) ||
        voice.name.toLowerCase().includes(searchTerm) ||
        (voice.language && voice.language.toLowerCase().includes(searchTerm))
    );

    if (filteredVoices.length === 0) {
        list.innerHTML = '<div class="text-gray-400 text-center py-4">No voices match your search</div>';
        return;
    }

    list.innerHTML = filteredVoices.map(([id, voice]) => `
        <div
            class="voice-option p-3 rounded cursor-pointer hover:bg-gray-600 ${modalState.selectedVoiceId === id ? 'bg-blue-600' : 'bg-gray-800'}"
            data-voice-id="${escapeHtml(id)}"
        >
            <div class="font-bold">${escapeHtml(id)}</div>
            <div class="text-sm text-gray-300">${escapeHtml(voice.name)}</div>
            ${voice.language ? `<div class="text-xs text-gray-400">${escapeHtml(voice.language)}</div>` : ''}
        </div>
    `).join('');

    // Add event listeners to voice options
    list.querySelectorAll('.voice-option').forEach(option => {
        option.addEventListener('click', () => {
            const voiceId = option.dataset.voiceId;
            selectModalVoice(voiceId);
        });
    });
}

function selectModalVoice(voiceId) {
    modalState.selectedVoiceId = voiceId;
    renderModalVoiceList();
}

async function assignVoice(userId, username, voiceId, engine, emotion = null) {
    try {
        const data = await postJSON(`/api/tts/users/${userId}/voice`, {
            username,
            voiceId,
            engine,
            emotion
        });

        if (!data.success) {
            throw new Error(data.error || 'Failed to assign voice');
        }

        showNotification(`Voice assigned to ${username}`, 'success');
        await loadUsers(currentFilter);

    } catch (error) {
        console.error('Failed to assign voice:', error);
        showNotification(`Failed to assign voice: ${error.message}`, 'error');
    }
}

// ============================================================================
// QUEUE MANAGEMENT
// ============================================================================

function startQueuePolling() {
    // Don't start polling if page is unloading
    if (isPageUnloading) return;
    
    loadQueue().catch(err => {
        console.error('Initial queue load failed:', err);
    });
    
    queuePollInterval = setInterval(() => {
        if (!isPageUnloading) {
            loadQueue().catch(err => {
                console.error('Queue poll failed:', err);
            });
        }
    }, 2000);
}

async function loadQueue() {
    // Skip if page is unloading
    if (isPageUnloading) return;
    
    try {
        const data = await fetchJSON('/api/tts/queue');

        if (!data.success) {
            throw new Error(data.error || 'Failed to load queue');
        }

        renderQueue(data.queue);

    } catch (error) {
        // Don't log errors if page is unloading or request was aborted
        if (!isPageUnloading && error.name !== 'AbortError') {
            console.error('Failed to load queue:', error);
        }
        // Don't show notification for polling errors
    }
}

function renderQueue(queue) {
    const list = document.getElementById('queueList');
    const nowPlaying = document.getElementById('nowPlaying');

    // Render queue list
    if (list) {
        if (!queue.nextItems || queue.nextItems.length === 0) {
            list.innerHTML = '<div class="text-gray-400 text-center py-8">Queue is empty</div>';
        } else {
            list.innerHTML = queue.nextItems.map((item, i) => `
                <div class="bg-gray-700 rounded p-3 flex justify-between items-center">
                    <div>
                        <div class="font-bold">#${i + 1} - ${escapeHtml(item.username)}</div>
                        <div class="text-sm text-gray-400">${escapeHtml(item.text)}</div>
                    </div>
                    <div class="text-sm text-gray-500">Priority: ${item.priority}</div>
                </div>
            `).join('');
        }
    }

    // Render now playing
    if (nowPlaying) {
        if (queue.currentItem) {
            nowPlaying.innerHTML = `
                <div class="bg-gray-700 rounded p-4 pulse">
                    <div class="text-2xl mb-2">🔊</div>
                    <div class="font-bold text-lg">${escapeHtml(queue.currentItem.username)}</div>
                    <div class="text-sm text-gray-400 mt-2">"${escapeHtml(queue.currentItem.text)}"</div>
                </div>
            `;
        } else {
            nowPlaying.innerHTML = '<div class="text-gray-400">No audio playing</div>';
        }
    }
}

async function clearQueue() {
    if (!confirm('Clear entire queue?')) return;

    try {
        const data = await postJSON('/api/tts/queue/clear', {});

        if (!data.success) {
            throw new Error(data.error || 'Failed to clear queue');
        }

        showNotification(`Cleared ${data.cleared} items from queue`, 'success');
        await loadQueue();

    } catch (error) {
        console.error('Failed to clear queue:', error);
        showNotification(`Failed to clear queue: ${error.message}`, 'error');
    }
}

async function skipCurrent() {
    try {
        const data = await postJSON('/api/tts/queue/skip', {});

        if (!data.success) {
            throw new Error(data.error || 'Failed to skip');
        }

        if (data.skipped) {
            showNotification('Skipped current item', 'success');
            await loadQueue();
        } else {
            showNotification('Nothing to skip', 'info');
        }

    } catch (error) {
        console.error('Failed to skip:', error);
        showNotification(`Failed to skip: ${error.message}`, 'error');
    }
}

// ============================================================================
// TEST TTS
// ============================================================================

async function testTTS() {
    const input = document.getElementById('testText');
    if (!input) return;

    const text = input.value.trim();
    if (!text) {
        showNotification('Please enter text to test', 'warning');
        return;
    }

    try {
        const data = await postJSON('/api/tts/speak', {
            text,
            userId: 'admin',
            username: 'Admin',
            source: 'manual'
        });

        if (!data.success) {
            throw new Error(data.error || 'Failed to queue TTS');
        }

        showNotification('TTS queued successfully', 'success');
        input.value = ''; // Clear input
        await loadQueue();

    } catch (error) {
        console.error('Failed to test TTS:', error);
        showNotification(`Failed: ${error.message}`, 'error');
    }
}

// ============================================================================
// STATISTICS
// ============================================================================

function startStatsPolling() {
    // Don't start polling if page is unloading
    if (isPageUnloading) return;
    
    loadStats().catch(err => {
        console.error('Initial stats load failed:', err);
    });
    
    statsPollInterval = setInterval(() => {
        if (!isPageUnloading) {
            loadStats().catch(err => {
                console.error('Stats poll failed:', err);
            });
        }
    }, 5000);
}

async function loadStats() {
    // Skip if page is unloading
    if (isPageUnloading) return;
    
    try {
        const [queueRes, permRes] = await Promise.all([
            fetchJSON('/api/tts/queue'),
            fetchJSON('/api/tts/permissions/stats')
        ]);

        if (queueRes.success && queueRes.stats) {
            renderQueueStats(queueRes.stats);
        }

        if (permRes.success && permRes.stats) {
            renderPermissionStats(permRes.stats);
        }

    } catch (error) {
        // Don't log errors if page is unloading or request was aborted
        if (!isPageUnloading && error.name !== 'AbortError') {
            console.error('Failed to load stats:', error);
        }
        // Don't show notification for polling errors
    }
}

function renderQueueStats(stats) {
    const el = document.getElementById('queueStats');
    if (!el) return;

    el.innerHTML = `
        <div class="flex justify-between"><span>Total Queued:</span><span class="font-bold">${stats.totalQueued || 0}</span></div>
        <div class="flex justify-between"><span>Total Played:</span><span class="font-bold">${stats.totalPlayed || 0}</span></div>
        <div class="flex justify-between"><span>Total Dropped:</span><span class="font-bold text-red-400">${stats.totalDropped || 0}</span></div>
        <div class="flex justify-between"><span>Rate Limited:</span><span class="font-bold text-yellow-400">${stats.totalRateLimited || 0}</span></div>
        <div class="flex justify-between"><span>Current Queue:</span><span class="font-bold">${stats.currentQueueSize || 0}</span></div>
    `;
}

function renderPermissionStats(stats) {
    const el = document.getElementById('permissionStats');
    if (!el) return;

    el.innerHTML = `
        <div class="flex justify-between"><span>Total Users:</span><span class="font-bold">${stats.total_users || 0}</span></div>
        <div class="flex justify-between"><span>Whitelisted:</span><span class="font-bold text-green-400">${stats.whitelisted_users || 0}</span></div>
        <div class="flex justify-between"><span>Blacklisted:</span><span class="font-bold text-red-400">${stats.blacklisted_users || 0}</span></div>
        <div class="flex justify-between"><span>Voice Assigned:</span><span class="font-bold text-purple-400">${stats.voice_assigned_users || 0}</span></div>
    `;
}

// ============================================================================
// EVENT LISTENERS SETUP
// ============================================================================

function setupEventListeners() {
    // Tab buttons
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.addEventListener('click', () => {
            switchTab(btn.dataset.tab);
        });
    });

    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            filterUsers(btn.dataset.filter);
        });
    });

    // Range inputs with live value display
    const volumeInput = document.getElementById('volume');
    if (volumeInput) {
        volumeInput.addEventListener('input', (e) => {
            const valueEl = document.getElementById('volumeValue');
            if (valueEl) valueEl.textContent = e.target.value;
        });
    }

    const speedInput = document.getElementById('speed');
    if (speedInput) {
        speedInput.addEventListener('input', (e) => {
            const valueEl = document.getElementById('speedValue');
            if (valueEl) valueEl.textContent = e.target.value;
        });
    }

    const duckVolumeInput = document.getElementById('duckVolume');
    if (duckVolumeInput) {
        duckVolumeInput.addEventListener('input', (e) => {
            const valueEl = document.getElementById('duckVolumeValue');
            if (valueEl) valueEl.textContent = e.target.value;
        });
    }

    // Confidence threshold slider
    const confidenceThresholdInput = document.getElementById('languageConfidenceThreshold');
    if (confidenceThresholdInput) {
        confidenceThresholdInput.addEventListener('input', (e) => {
            const valueEl = document.getElementById('confidenceThresholdValue');
            if (valueEl) valueEl.textContent = Math.round(parseFloat(e.target.value) * 100);
        });
    }

    // Engine selector
    const engineSelect = document.getElementById('defaultEngine');
    if (engineSelect) {
        engineSelect.addEventListener('change', () => {
            const selectedEngine = engineSelect.value;
            const previousVoice = document.getElementById('defaultVoice')?.value;
            const previousEngine = currentConfig.defaultEngine;
            populateVoiceSelect();
            const newVoice = document.getElementById('defaultVoice')?.value;

            // Show/hide emotion selector
            const emotionContainer = document.getElementById('defaultEmotionContainer');
            if (emotionContainer) {
                emotionContainer.style.display = (selectedEngine === 'speechify') ? 'block' : 'none';
            }

            // Show/hide API key sections
            const googleKeySection = document.getElementById('google-api-key-section');
            const speechifyKeySection = document.getElementById('speechify-api-key-section');

            if (googleKeySection) {
                googleKeySection.style.display = (selectedEngine === 'google') ? 'block' : 'none';
            }
            if (speechifyKeySection) {
                speechifyKeySection.style.display = (selectedEngine === 'speechify') ? 'block' : 'none';
            }

            // Notify user if voice was automatically changed due to engine switch
            if (previousVoice && previousVoice !== newVoice && previousEngine !== engineSelect.value) {
                showNotification(
                    `Voice was reset from '${previousVoice}' to '${newVoice}' because it's not compatible with the selected engine. Please review and save.`,
                    'warning'
                );
            }
        });
    }

    // Manual voice assignment
    const manualEngineSelect = document.getElementById('manualEngine');
    if (manualEngineSelect) {
        manualEngineSelect.addEventListener('change', () => {
            populateManualVoiceSelect();
        });
    }

    const assignManualVoiceBtn = document.getElementById('assignManualVoiceBtn');
    if (assignManualVoiceBtn) {
        assignManualVoiceBtn.addEventListener('click', assignManualVoice);
    }

    // Allow Enter key in username field to trigger assignment
    const manualUsernameInput = document.getElementById('manualUsername');
    if (manualUsernameInput) {
        manualUsernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                assignManualVoice();
            }
        });
    }

    // Action buttons
    const saveConfigBtn = document.getElementById('saveConfigBtn');
    if (saveConfigBtn) {
        saveConfigBtn.addEventListener('click', saveConfig);
    }
    
    // Also hook up the top save button
    const saveConfigBtnTop = document.getElementById('saveConfigBtnTop');
    if (saveConfigBtnTop) {
        saveConfigBtnTop.addEventListener('click', saveConfig);
    }

    const clearQueueBtn = document.getElementById('clearQueueBtn');
    if (clearQueueBtn) {
        clearQueueBtn.addEventListener('click', clearQueue);
    }

    const skipCurrentBtn = document.getElementById('skipCurrentBtn');
    if (skipCurrentBtn) {
        skipCurrentBtn.addEventListener('click', skipCurrent);
    }

    const testTTSBtn = document.getElementById('testTTSBtn');
    if (testTTSBtn) {
        testTTSBtn.addEventListener('click', testTTS);
    }

    // Debug log controls
    const clearLogsBtn = document.getElementById('clearLogsBtn');
    if (clearLogsBtn) {
        clearLogsBtn.addEventListener('click', clearDebugLogs);
    }

    const toggleDebugBtn = document.getElementById('toggleDebugBtn');
    if (toggleDebugBtn) {
        toggleDebugBtn.addEventListener('click', toggleDebugMode);
    }

    const autoScrollLogsCheckbox = document.getElementById('autoScrollLogs');
    if (autoScrollLogsCheckbox) {
        autoScrollLogsCheckbox.addEventListener('change', (e) => {
            autoScrollLogs = e.target.checked;
        });
    }

    // Debug log filter buttons
    document.querySelectorAll('.log-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            filterDebugLogs(btn.dataset.category);
        });
    });

    // API key toggle handlers removed (now managed in global Settings panel)

    // Toggle TikTok SessionID visibility
    const toggleTiktokSession = document.getElementById('toggle-tiktok-session');
    const tiktokSessionInput = document.getElementById('tiktokSessionId');
    if (toggleTiktokSession && tiktokSessionInput) {
        toggleTiktokSession.addEventListener('click', () => {
            const type = tiktokSessionInput.type === 'password' ? 'text' : 'password';
            tiktokSessionInput.type = type;
            toggleTiktokSession.querySelector('i').classList.toggle('fa-eye');
            toggleTiktokSession.querySelector('i').classList.toggle('fa-eye-slash');
        });
    }

    // Modal close buttons
    const modalCloseX = document.getElementById('modalCloseX');
    if (modalCloseX) {
        modalCloseX.addEventListener('click', closeVoiceAssignmentModal);
    }

    const modalCancelBtn = document.getElementById('modalCancelBtn');
    if (modalCancelBtn) {
        modalCancelBtn.addEventListener('click', closeVoiceAssignmentModal);
    }

    // Close modal when clicking outside
    const modal = document.getElementById('voiceAssignmentModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeVoiceAssignmentModal();
            }
        });
    }

    // Initialize voice clones tab
    initVoiceClonesTab();
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

/**
 * Show notification toast
 */
function showNotification(message, type = 'info') {
    const colors = {
        success: 'bg-green-600',
        error: 'bg-red-600',
        warning: 'bg-yellow-600',
        info: 'bg-blue-600'
    };

    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 ${colors[type]} text-white px-6 py-3 rounded-lg shadow-xl z-50 fade-in`;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(-20px)';
        notification.style.transition = 'all 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ============================================================================
// PLUGIN STATUS
// ============================================================================

/**
 * Load plugin status from backend (including debug mode state)
 */
async function loadPluginStatus() {
    try {
        const data = await fetchJSON('/api/tts/status');

        if (data.success && data.status) {
            // Update debug enabled state
            debugEnabled = data.status.debugEnabled || false;
            console.log('[TTS] Plugin status loaded:', {
                debugEnabled,
                engines: data.status.engines,
                defaultEngine: data.status.config?.defaultEngine
            });
        }
    } catch (error) {
        console.error('Failed to load plugin status:', error);
    }
}

// ============================================================================
// DEBUG LOGS MANAGEMENT
// ============================================================================

/**
 * Load initial debug logs from server
 */
async function loadDebugLogs() {
    try {
        const data = await fetchJSON('/api/tts/debug/logs?limit=100');

        if (data.success && data.logs) {
            debugLogs = data.logs;
            renderDebugLogs();
            updateDebugStats();
        }
    } catch (error) {
        console.error('Failed to load debug logs:', error);
    }
}

/**
 * Add a new debug log entry (called by socket listener)
 */
function addDebugLog(logEntry) {
    debugLogs.push(logEntry);

    // Keep only last 500 logs in memory
    if (debugLogs.length > 500) {
        debugLogs.shift();
    }

    renderDebugLogs();
    updateDebugStats();
}

/**
 * Render debug logs to the UI
 */
function renderDebugLogs() {
    const container = document.getElementById('debugLogsList');
    if (!container) return;

    // Filter logs based on current filter
    let filteredLogs = debugLogs;
    if (debugFilter !== 'all') {
        if (debugFilter === 'SPEAK_STEP') {
            // Show all SPEAK_STEP1-6
            filteredLogs = debugLogs.filter(log => log.category.startsWith('SPEAK_STEP'));
        } else {
            filteredLogs = debugLogs.filter(log => log.category === debugFilter);
        }
    }

    // Render logs
    if (filteredLogs.length === 0) {
        container.innerHTML = '<div class="text-gray-500 text-center py-8">No logs match the current filter</div>';
    } else {
        container.innerHTML = filteredLogs.map(log => formatDebugLog(log)).join('');
    }

    // Auto-scroll to bottom
    if (autoScrollLogs) {
        const logsContainer = document.getElementById('debugLogsContainer');
        if (logsContainer) {
            logsContainer.scrollTop = logsContainer.scrollHeight;
        }
    }

    // Update displayed count
    const displayedCount = document.getElementById('displayedLogsCount');
    if (displayedCount) {
        displayedCount.textContent = filteredLogs.length;
    }
}

/**
 * Format a single debug log entry to HTML
 */
function formatDebugLog(log) {
    const categoryColors = {
        'INIT': 'text-blue-400',
        'TIKTOK_EVENT': 'text-purple-400',
        'SPEAK_START': 'text-green-400',
        'SPEAK_STEP1': 'text-yellow-300',
        'SPEAK_STEP2': 'text-yellow-300',
        'SPEAK_STEP3': 'text-yellow-300',
        'SPEAK_STEP4': 'text-yellow-300',
        'SPEAK_STEP5': 'text-yellow-300',
        'SPEAK_STEP6': 'text-yellow-300',
        'SPEAK_SUCCESS': 'text-green-500',
        'SPEAK_DENIED': 'text-red-400',
        'SPEAK_ERROR': 'text-red-600',
        'PLAYBACK': 'text-cyan-400'
    };

    const color = categoryColors[log.category] || 'text-gray-400';
    const timestamp = new Date(log.timestamp).toLocaleTimeString('de-DE', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3
    });

    let dataStr = '';
    if (log.data && Object.keys(log.data).length > 0) {
        dataStr = '<div class="text-gray-500 text-xs mt-1 pl-4">' +
            Object.entries(log.data)
                .map(([key, value]) => {
                    const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
                    return `${escapeHtml(key)}: ${escapeHtml(displayValue.substring(0, 100))}`;
                })
                .join(' | ') +
            '</div>';
    }

    return `
        <div class="border-b border-gray-800 py-2">
            <div class="flex items-start gap-3">
                <span class="text-gray-600 text-xs whitespace-nowrap">${timestamp}</span>
                <span class="${color} font-bold text-xs whitespace-nowrap min-w-[120px]">[${escapeHtml(log.category)}]</span>
                <span class="text-gray-300 text-xs flex-1">${escapeHtml(log.message)}</span>
            </div>
            ${dataStr}
        </div>
    `;
}

/**
 * Filter debug logs by category
 */
function filterDebugLogs(category) {
    debugFilter = category;

    // Update filter button styles
    document.querySelectorAll('.log-filter-btn').forEach(btn => {
        if (btn.dataset.category === category) {
            btn.classList.remove('bg-gray-700', 'hover:bg-gray-600');
            btn.classList.add('bg-blue-600');
        } else {
            btn.classList.add('bg-gray-700', 'hover:bg-gray-600');
            btn.classList.remove('bg-blue-600');
        }
    });

    renderDebugLogs();
}

/**
 * Clear debug logs
 */
async function clearDebugLogs() {
    if (!confirm('Clear all debug logs?')) return;

    try {
        const data = await postJSON('/api/tts/debug/clear', {});

        if (data.success) {
            debugLogs = [];
            renderDebugLogs();
            updateDebugStats();
            showNotification('Debug logs cleared', 'success');
        } else {
            throw new Error(data.error || 'Failed to clear logs');
        }
    } catch (error) {
        console.error('Failed to clear debug logs:', error);
        showNotification(`Failed to clear logs: ${error.message}`, 'error');
    }
}

/**
 * Toggle debug mode on/off
 */
async function toggleDebugMode() {
    try {
        const data = await postJSON('/api/tts/debug/toggle', {});

        if (data.success) {
            debugEnabled = data.debugEnabled;
            updateDebugModeUI();
            showNotification(`Debug mode ${debugEnabled ? 'enabled' : 'disabled'}`, 'success');
        } else {
            throw new Error(data.error || 'Failed to toggle debug mode');
        }
    } catch (error) {
        console.error('Failed to toggle debug mode:', error);
        showNotification(`Failed to toggle debug mode: ${error.message}`, 'error');
    }
}

/**
 * Update debug mode UI indicators
 */
function updateDebugModeUI() {
    const toggleText = document.getElementById('debugToggleText');
    const statusEl = document.getElementById('debugModeStatus');
    const liveUpdateStatus = document.getElementById('liveUpdateStatus');

    if (toggleText) {
        toggleText.textContent = debugEnabled ? 'Disable Debug' : 'Enable Debug';
    }

    if (statusEl) {
        statusEl.textContent = debugEnabled ? 'Enabled' : 'Disabled';
        statusEl.className = debugEnabled ? 'ml-2 font-bold text-green-500' : 'ml-2 font-bold text-red-500';
    }

    if (liveUpdateStatus) {
        if (debugEnabled && socket) {
            liveUpdateStatus.textContent = 'Active';
            liveUpdateStatus.className = 'ml-2 font-bold text-green-500 pulse';
        } else {
            liveUpdateStatus.textContent = 'Inactive';
            liveUpdateStatus.className = 'ml-2 font-bold text-gray-500';
        }
    }
}

/**
 * Update debug statistics
 */
function updateDebugStats() {
    const totalCount = document.getElementById('totalLogsCount');
    if (totalCount) {
        totalCount.textContent = debugLogs.length;
    }
}

// ============================================================================
// VOICE CLONES TAB FUNCTIONALITY
// ============================================================================

/**
 * Initialize voice clones tab
 */
function initVoiceClonesTab() {
    const form = document.getElementById('voiceCloneForm');
    const audioInput = document.getElementById('voiceCloneAudio');
    const refreshBtn = document.getElementById('refreshVoiceClonesBtn');

    // Audio file preview
    if (audioInput) {
        audioInput.addEventListener('change', handleAudioFileSelect);
    }

    // Form submission
    if (form) {
        form.addEventListener('submit', handleVoiceCloneCreate);
    }

    // Refresh button
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadVoiceClones);
    }

    // Check if Speechify is configured
    checkSpeechifyConfiguration();
}

/**
 * Check if Speechify API is configured
 */
async function checkSpeechifyConfiguration() {
    try {
        const config = await fetchJSON('/api/tts/config');
        const warning = document.getElementById('speechify-not-configured-warning');
        const form = document.getElementById('voiceCloneForm');
        
        if (config && config.config && config.config.speechifyApiKey) {
            if (warning) warning.classList.add('hidden');
            if (form) form.classList.remove('opacity-50', 'pointer-events-none');
        } else {
            if (warning) warning.classList.remove('hidden');
            if (form) form.classList.add('opacity-50', 'pointer-events-none');
        }
    } catch (error) {
        console.error('Failed to check Speechify configuration:', error);
    }
}

/**
 * Handle audio file selection and preview
 */
function handleAudioFileSelect(event) {
    const file = event.target.files[0];
    const preview = document.getElementById('audioPreview');
    const player = document.getElementById('audioPlayer');
    const fileName = document.getElementById('audioFileName');
    const fileSize = document.getElementById('audioFileSize');

    if (!file) {
        if (preview) preview.classList.add('hidden');
        // Clean up old object URL if exists
        if (player && player.src && player.src.startsWith('blob:')) {
            URL.revokeObjectURL(player.src);
            player.src = '';
        }
        return;
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
        showNotification('Audio file is too large. Maximum size is 5MB.', 'error');
        event.target.value = '';
        if (preview) preview.classList.add('hidden');
        return;
    }

    // Show preview
    if (preview) {
        preview.classList.remove('hidden');
        
        // Set audio source
        if (player) {
            // Clean up old object URL if exists
            if (player.src && player.src.startsWith('blob:')) {
                URL.revokeObjectURL(player.src);
            }
            
            const objectURL = URL.createObjectURL(file);
            player.src = objectURL;
            
            // Clean up when audio is loaded (once: true handles automatic removal)
            player.addEventListener('loadedmetadata', () => {
                // Object URL no longer needed after metadata is loaded
            }, { once: true });
        }

        // Display file info
        if (fileName) fileName.textContent = file.name;
        if (fileSize) {
            const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
            fileSize.textContent = `${sizeMB} MB`;
        }
    }
}

/**
 * Handle voice clone creation
 */
async function handleVoiceCloneCreate(event) {
    event.preventDefault();

    const nameInput = document.getElementById('voiceCloneName');
    const languageSelect = document.getElementById('voiceCloneLanguage');
    const audioInput = document.getElementById('voiceCloneAudio');
    const consentCheckbox = document.getElementById('voiceCloneConsent');
    const submitBtn = document.getElementById('createVoiceCloneBtn');
    const progress = document.getElementById('voiceCloneProgress');
    const resultDiv = document.getElementById('voiceCloneResult');

    // Validate inputs
    if (!nameInput?.value || !audioInput?.files?.[0] || !consentCheckbox?.checked) {
        showNotification('Please fill all required fields and confirm consent', 'error');
        return;
    }

    const file = audioInput.files[0];
    const voiceName = nameInput.value.trim();
    const language = languageSelect?.value || 'en';

    try {
        // Show progress
        if (submitBtn) submitBtn.disabled = true;
        if (progress) progress.classList.remove('hidden');
        if (resultDiv) {
            resultDiv.classList.add('hidden');
            resultDiv.innerHTML = '';
        }

        // Create FormData for multipart upload (more efficient than base64)
        const formData = new FormData();
        formData.append('audioFile', file);
        formData.append('voiceName', voiceName);
        formData.append('language', language);
        formData.append('consentConfirmation', 'I confirm this is my voice or I have explicit permission to use and clone this voice');

        // Upload using fetch (not fetchJSON since we're using FormData)
        const response = await fetch('/api/tts/voice-clones/create', {
            method: 'POST',
            body: formData
            // Note: Do NOT set Content-Type header - browser sets it automatically with boundary
        });

        const data = await response.json();

        if (data.success) {
            // Success
            showNotification(`Voice clone "${voiceName}" created successfully!`, 'success');
            
            // Show success message
            if (resultDiv) {
                resultDiv.innerHTML = `
                    <div class="bg-green-900 border-l-4 border-green-500 p-3 rounded">
                        <p class="text-sm text-green-100">
                            ✅ Voice clone created successfully! Voice ID: <code class="bg-green-800 px-2 py-1 rounded">${data.voice.voice_id}</code>
                        </p>
                    </div>
                `;
                resultDiv.classList.remove('hidden');
            }

            // Reset form
            event.target.reset();
            const preview = document.getElementById('audioPreview');
            if (preview) preview.classList.add('hidden');

            // Reload voice clones list
            await loadVoiceClones();
        } else {
            throw new Error(data.error || 'Failed to create voice clone');
        }
    } catch (error) {
        console.error('Failed to create voice clone:', error);
        showNotification(`Failed to create voice clone: ${error.message}`, 'error');
        
        // Show error message
        if (resultDiv) {
            resultDiv.innerHTML = `
                <div class="bg-red-900 border-l-4 border-red-500 p-3 rounded">
                    <p class="text-sm text-red-100">
                        ❌ ${error.message}
                    </p>
                </div>
            `;
            resultDiv.classList.remove('hidden');
        }
    } finally {
        // Hide progress
        if (submitBtn) submitBtn.disabled = false;
        if (progress) progress.classList.add('hidden');
    }
}

/**
 * Load and display voice clones
 */
async function loadVoiceClones() {
    const listContainer = document.getElementById('voiceClonesList');
    
    if (!listContainer) return;

    try {
        // Show loading
        listContainer.innerHTML = `
            <div class="text-center text-gray-400 py-8">
                <i class="fas fa-spinner fa-spin text-3xl mb-2"></i>
                <p>Loading voice clones...</p>
            </div>
        `;

        const response = await fetchJSON('/api/tts/voice-clones/list');

        if (response.success && response.voices) {
            const voices = response.voices;

            if (voices.length === 0) {
                listContainer.innerHTML = `
                    <div class="text-center text-gray-400 py-8">
                        <i class="fas fa-microphone text-4xl mb-2 opacity-50"></i>
                        <p>No voice clones yet. Create your first one!</p>
                    </div>
                `;
            } else {
                listContainer.innerHTML = voices.map(voice => {
                    const voiceId = voice.voice_id || voice.id;
                    const voiceName = voice.voice_name || voice.display_name || voice.name || 'Unnamed Voice';
                    const language = voice.language || 'Unknown';
                    const createdAt = voice.created_at ? new Date(voice.created_at).toLocaleDateString() : 'Unknown';

                    return `
                        <div class="bg-gray-700 rounded-lg p-4 hover:bg-gray-650 transition" data-voice-id="${escapeHtml(voiceId)}" data-voice-name="${escapeHtml(voiceName)}">
                            <div class="flex justify-between items-start">
                                <div class="flex-1">
                                    <h3 class="font-bold text-white mb-1">
                                        <i class="fas fa-microphone-alt text-blue-400"></i>
                                        ${escapeHtml(voiceName)}
                                    </h3>
                                    <div class="text-xs text-gray-400 space-y-1">
                                        <p><strong>ID:</strong> <code class="bg-gray-800 px-2 py-1 rounded">${escapeHtml(voiceId)}</code></p>
                                        <p><strong>Language:</strong> ${escapeHtml(language)}</p>
                                        ${createdAt !== 'Unknown' ? `<p><strong>Created:</strong> ${createdAt}</p>` : ''}
                                    </div>
                                </div>
                                <div class="flex flex-col space-y-2">
                                    <button 
                                        class="voice-clone-test-btn bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1 rounded"
                                        title="Test this voice"
                                    >
                                        🔊 Test
                                    </button>
                                    <button 
                                        class="voice-clone-delete-btn bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-1 rounded"
                                        title="Delete this voice"
                                    >
                                        🗑️ Delete
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');

                // Add event listeners using delegation
                setupVoiceCloneEventListeners();
            }
        } else {
            throw new Error(response.error || 'Failed to load voice clones');
        }
    } catch (error) {
        console.error('Failed to load voice clones:', error);
        listContainer.innerHTML = `
            <div class="text-center text-red-400 py-8">
                <i class="fas fa-exclamation-triangle text-3xl mb-2"></i>
                <p>Failed to load voice clones</p>
                <p class="text-sm mt-2">${escapeHtml(error.message)}</p>
            </div>
        `;
    }
}

/**
 * Setup event listeners for voice clone buttons using delegation
 */
function setupVoiceCloneEventListeners() {
    const listContainer = document.getElementById('voiceClonesList');
    
    if (!listContainer) return;

    // Remove old listeners if they exist
    listContainer.removeEventListener('click', handleVoiceCloneButtonClick);
    
    // Add new listener
    listContainer.addEventListener('click', handleVoiceCloneButtonClick);
}

/**
 * Handle voice clone button clicks (test/delete)
 */
function handleVoiceCloneButtonClick(event) {
    const target = event.target.closest('button');
    
    if (!target) return;

    const voiceItem = target.closest('[data-voice-id]');
    if (!voiceItem) return;

    const voiceId = voiceItem.dataset.voiceId;
    const voiceName = voiceItem.dataset.voiceName;

    if (target.classList.contains('voice-clone-test-btn')) {
        testVoiceClone(voiceId, voiceName);
    } else if (target.classList.contains('voice-clone-delete-btn')) {
        deleteVoiceClone(voiceId, voiceName);
    }
}

/**
 * Test a voice clone
 * Note: Using default text instead of prompt for better UX
 */
async function testVoiceClone(voiceId, voiceName) {
    try {
        // Use a default test text instead of prompt for better UX and security
        const testText = 'Hello! This is a test of my custom voice clone.';

        showNotification(`Testing voice "${voiceName}"...`, 'info');

        const response = await fetchJSON('/api/tts/speak', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: testText,
                engine: 'speechify',
                voiceId: voiceId,
                username: 'VoiceCloneTest'
            })
        });

        if (response.success) {
            showNotification('Voice test queued successfully!', 'success');
        } else {
            throw new Error(response.error || 'Failed to test voice');
        }
    } catch (error) {
        console.error('Failed to test voice clone:', error);
        showNotification(`Failed to test voice: ${error.message}`, 'error');
    }
}

/**
 * Delete a voice clone
 * Note: Using showNotification confirmation instead of confirm() for better UX
 */
async function deleteVoiceClone(voiceId, voiceName) {
    // For now, keep confirm() for simplicity, but ideally would use a modal
    // This is acceptable as it's only used in admin interface
    if (!confirm(`Are you sure you want to delete the voice clone "${voiceName}"?\n\nThis action cannot be undone.`)) {
        return;
    }

    try {
        showNotification(`Deleting voice "${voiceName}"...`, 'info');

        const response = await fetchJSON(`/api/tts/voice-clones/${voiceId}`, {
            method: 'DELETE'
        });

        if (response.success) {
            showNotification(`Voice "${voiceName}" deleted successfully!`, 'success');
            await loadVoiceClones();
        } else {
            throw new Error(response.error || 'Failed to delete voice clone');
        }
    } catch (error) {
        console.error('Failed to delete voice clone:', error);
        showNotification(`Failed to delete voice: ${error.message}`, 'error');
    }
}

