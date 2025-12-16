/**
 * Talking Heads UI JavaScript
 * Admin panel for configuring the Talking Heads plugin
 */

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize Lucide icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // Avatar styles configuration
    const avatarStyles = [
        { id: 'cartoon', icon: '🎨', name: 'Cartoon', description: 'Comic-style with bold colors' },
        { id: 'furry', icon: '🐾', name: 'Furry', description: 'Animal-inspired, soft and lively' },
        { id: 'tech', icon: '🤖', name: 'Tech', description: 'Futuristic neon/metallic look' },
        { id: 'medieval', icon: '⚔️', name: 'Medieval', description: 'Fantasy/medieval armor styling' },
        { id: 'noble', icon: '👑', name: 'Noble', description: 'Elegant, aristocratic portrait' },
        { id: 'whimsical', icon: '✨', name: 'Whimsical', description: 'Playful, fairytale vibe' },
        { id: 'realistic', icon: '📸', name: 'Realistic', description: 'Realistic portrait look' }
    ];

    // DOM Elements
    const elements = {
        enabled: document.getElementById('enabled'),
        debugLogging: document.getElementById('debugLogging'),
        obsEnabled: document.getElementById('obsEnabled'),
        imageProvider: document.getElementById('imageProvider'),
        styleGrid: document.getElementById('styleGrid'),
        permissionMode: document.getElementById('permissionMode'),
        teamLevelGroup: document.getElementById('teamLevelGroup'),
        minTeamLevel: document.getElementById('minTeamLevel'),
        fadeInDuration: document.getElementById('fadeInDuration'),
        fadeOutDuration: document.getElementById('fadeOutDuration'),
        blinkInterval: document.getElementById('blinkInterval'),
        cacheEnabled: document.getElementById('cacheEnabled'),
        cacheDurationDays: document.getElementById('cacheDurationDays'),
        cachedCount: document.getElementById('cachedCount'),
        activeCount: document.getElementById('activeCount'),
        clearCacheBtn: document.getElementById('clearCacheBtn'),
        testApiBtn: document.getElementById('testApiBtn'),
        testGenerateBtn: document.getElementById('testGenerateBtn'),
        testResult: document.getElementById('testResult'),
        saveConfigBtn: document.getElementById('saveConfigBtn'),
        debugSection: document.getElementById('debugSection'),
        debugLog: document.getElementById('debugLog'),
        apiStatus: document.getElementById('api-status'),
        apiKeyWarning: document.getElementById('api-key-warning'),
        overlayUrl: document.getElementById('overlayUrl'),
        copyOverlayUrl: document.getElementById('copyOverlayUrl')
    };

    let currentConfig = {};
    let selectedStyle = 'cartoon';

    // Initialize style grid
    function renderStyleGrid() {
        elements.styleGrid.innerHTML = avatarStyles.map(style => `
            <div class="style-card ${style.id === selectedStyle ? 'selected' : ''}" data-style="${style.id}">
                <div class="icon">${style.icon}</div>
                <div class="name">${style.name}</div>
                <div class="description">${style.description}</div>
            </div>
        `).join('');

        // Add click handlers
        elements.styleGrid.querySelectorAll('.style-card').forEach(card => {
            card.addEventListener('click', () => {
                selectedStyle = card.dataset.style;
                renderStyleGrid();
            });
        });
    }

    // Load configuration
    async function loadConfig() {
        try {
            const response = await fetch('/api/talking-heads/config');
            const data = await response.json();

            if (data.success) {
                currentConfig = data.config;

                // Update form elements
                elements.enabled.checked = currentConfig.enabled;
                elements.debugLogging.checked = currentConfig.debugLogging;
                elements.obsEnabled.checked = currentConfig.obsEnabled;
                elements.imageProvider.value = currentConfig.imageProvider;
                selectedStyle = currentConfig.style || 'cartoon';
                elements.permissionMode.value = currentConfig.permissionMode;
                elements.minTeamLevel.value = currentConfig.minTeamLevel;
                elements.fadeInDuration.value = currentConfig.fadeInDuration;
                elements.fadeOutDuration.value = currentConfig.fadeOutDuration;
                elements.blinkInterval.value = currentConfig.blinkInterval;
                elements.cacheEnabled.checked = currentConfig.cacheEnabled;
                elements.cacheDurationDays.value = currentConfig.cacheDurationDays;

                // Update UI based on config
                updatePermissionUI();
                updateDebugUI();
                updateApiStatus(data.config);
                renderStyleGrid();
            }
        } catch (error) {
            showNotification('Failed to load configuration: ' + error.message, 'error');
        }
    }

    // Load cache stats
    async function loadCacheStats() {
        try {
            const response = await fetch('/api/talking-heads/cache/stats');
            const data = await response.json();

            if (data.success) {
                elements.cachedCount.textContent = data.cachedAvatars;
                elements.activeCount.textContent = data.activeAnimations;
            }
        } catch (error) {
            console.error('Failed to load cache stats:', error);
        }
    }

    // Update API status display
    function updateApiStatus(config) {
        const hasOpenAI = config.hasOpenAIKey;
        const hasSiliconFlow = config.hasSiliconFlowKey;

        if (hasOpenAI || hasSiliconFlow) {
            const providers = [];
            if (hasOpenAI) providers.push('OpenAI');
            if (hasSiliconFlow) providers.push('SiliconFlow');

            elements.apiStatus.className = 'status-box success';
            elements.apiStatus.innerHTML = `✅ API configured: ${providers.join(', ')}`;
            elements.apiKeyWarning.style.display = 'none';
        } else {
            elements.apiStatus.className = 'status-box error';
            elements.apiStatus.innerHTML = '❌ No API key configured';
            elements.apiKeyWarning.style.display = 'block';
        }
    }

    // Update permission UI visibility
    function updatePermissionUI() {
        elements.teamLevelGroup.style.display = 
            elements.permissionMode.value === 'team' ? 'block' : 'none';
    }

    // Update debug UI visibility
    function updateDebugUI() {
        elements.debugSection.style.display = 
            elements.debugLogging.checked ? 'block' : 'none';
    }

    // Save configuration
    async function saveConfig() {
        const config = {
            enabled: elements.enabled.checked,
            debugLogging: elements.debugLogging.checked,
            obsEnabled: elements.obsEnabled.checked,
            imageProvider: elements.imageProvider.value,
            style: selectedStyle,
            permissionMode: elements.permissionMode.value,
            minTeamLevel: parseInt(elements.minTeamLevel.value) || 0,
            fadeInDuration: parseInt(elements.fadeInDuration.value) || 300,
            fadeOutDuration: parseInt(elements.fadeOutDuration.value) || 300,
            blinkInterval: parseInt(elements.blinkInterval.value) || 3000,
            cacheEnabled: elements.cacheEnabled.checked,
            cacheDurationDays: parseInt(elements.cacheDurationDays.value) || 7
        };

        try {
            elements.saveConfigBtn.disabled = true;
            elements.saveConfigBtn.innerHTML = '<span class="spinner"></span> Saving...';

            const response = await fetch('/api/talking-heads/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });

            const data = await response.json();

            if (data.success) {
                showNotification('Configuration saved', 'success');
                currentConfig = data.config;
            } else {
                showNotification('Failed to save: ' + data.error, 'error');
            }
        } catch (error) {
            showNotification('Failed to save: ' + error.message, 'error');
        } finally {
            elements.saveConfigBtn.disabled = false;
            elements.saveConfigBtn.innerHTML = '<i data-lucide="save"></i> Save configuration';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    }

    // Test API connection
    async function testApi() {
        try {
            elements.testApiBtn.disabled = true;
            elements.testApiBtn.innerHTML = '<span class="spinner"></span> Testing...';

            const response = await fetch('/api/talking-heads/test-api', {
                method: 'POST'
            });

            const data = await response.json();

            if (data.success) {
                showResult(`✅ ${data.message} (Provider: ${data.provider})`, 'success');
            } else {
                showResult(`❌ ${data.error}`, 'error');
            }
        } catch (error) {
            showResult(`❌ Test failed: ${error.message}`, 'error');
        } finally {
            elements.testApiBtn.disabled = false;
            elements.testApiBtn.innerHTML = '<i data-lucide="zap"></i> Test API';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    }

    // Test avatar generation
    async function testGenerate() {
        try {
            elements.testGenerateBtn.disabled = true;
            elements.testGenerateBtn.innerHTML = '<span class="spinner"></span> Generating...';
            showResult('Starting test generation... (can take 15-30 seconds)', '');

            const response = await fetch('/api/talking-heads/test-generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: 'TestUser' })
            });

            const data = await response.json();

            if (data.success) {
                showResult(`✅ Test avatar generated successfully (${data.sprites} sprites created)`, 'success');
                await loadCacheStats();
            } else {
                showResult(`❌ Generation failed: ${data.error}`, 'error');
            }
        } catch (error) {
            showResult(`❌ Test failed: ${error.message}`, 'error');
        } finally {
            elements.testGenerateBtn.disabled = false;
            elements.testGenerateBtn.innerHTML = '<i data-lucide="wand-2"></i> Generate test avatar';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    }

    // Clear cache
    async function clearCache() {
        if (!confirm('Are you sure you want to delete all cached avatars?')) {
            return;
        }

        try {
            elements.clearCacheBtn.disabled = true;

            const response = await fetch('/api/talking-heads/cache/clear', {
                method: 'POST'
            });

            const data = await response.json();

            if (data.success) {
                showNotification(`${data.cleared} avatars deleted`, 'success');
                await loadCacheStats();
            } else {
                showNotification('Failed to clear cache: ' + data.error, 'error');
            }
        } catch (error) {
            showNotification('Failed to clear cache: ' + error.message, 'error');
        } finally {
            elements.clearCacheBtn.disabled = false;
        }
    }

    // Show result in test result box
    function showResult(message, type) {
        elements.testResult.style.display = 'block';
        elements.testResult.className = `result-box ${type}`;
        elements.testResult.textContent = message;
    }

    // Show notification
    function showNotification(message, type) {
        // Simple notification - could be enhanced with a toast library
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            background: ${type === 'success' ? '#48bb78' : '#f56565'};
            color: white;
            border-radius: 8px;
            z-index: 1000;
            animation: slideIn 0.3s ease;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    // Setup overlay URL
    function setupOverlayUrl() {
        const baseUrl = window.location.origin;
        const overlayUrl = `${baseUrl}/plugins/talking-heads/overlay.html`;
        elements.overlayUrl.value = overlayUrl;
    }

    // Copy overlay URL
    function copyOverlayUrl() {
        elements.overlayUrl.select();
        document.execCommand('copy');
        showNotification('URL copied to clipboard', 'success');
    }

    // Add debug log entry
    function addDebugEntry(data) {
        const entry = document.createElement('div');
        entry.className = 'entry';
        entry.innerHTML = `
            <span class="timestamp">${new Date(data.timestamp).toLocaleTimeString()}</span>
            <span class="message">${data.message}</span>
        `;
        
        const placeholder = elements.debugLog.querySelector('.placeholder');
        if (placeholder) {
            placeholder.remove();
        }
        
        elements.debugLog.insertBefore(entry, elements.debugLog.firstChild);
        
        // Keep only last 50 entries
        while (elements.debugLog.children.length > 50) {
            elements.debugLog.lastChild.remove();
        }
    }

    // Setup WebSocket for real-time updates
    function setupWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        try {
            // Try Socket.IO if available
            if (typeof io !== 'undefined') {
                const socket = io(window.location.origin);
                
                socket.on('talking-heads:debug', (data) => {
                    if (elements.debugLogging.checked) {
                        addDebugEntry(data);
                    }
                });
                
                socket.on('talking-heads:config-updated', (config) => {
                    loadConfig();
                });
            }
        } catch (error) {
            console.warn('WebSocket connection failed:', error);
        }
    }

    // Event Listeners
    elements.permissionMode.addEventListener('change', updatePermissionUI);
    elements.debugLogging.addEventListener('change', updateDebugUI);
    elements.saveConfigBtn.addEventListener('click', saveConfig);
    elements.testApiBtn.addEventListener('click', testApi);
    elements.testGenerateBtn.addEventListener('click', testGenerate);
    elements.clearCacheBtn.addEventListener('click', clearCache);
    elements.copyOverlayUrl.addEventListener('click', copyOverlayUrl);

    // Initial load
    await loadConfig();
    await loadCacheStats();
    setupOverlayUrl();
    setupWebSocket();

    // Refresh stats periodically
    setInterval(loadCacheStats, 10000);
});
