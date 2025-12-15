const socket = io();
let config = {};

// Load configuration on page load
async function loadConfig() {
    console.log('🔄 [EMOJI RAIN UI] Loading configuration...');
    try {
        const response = await fetch('/api/emoji-rain/config');
        console.log('📥 [EMOJI RAIN UI] Response status:', response.status);

        const data = await response.json();
        console.log('📦 [EMOJI RAIN UI] Response data:', JSON.stringify(data, null, 2));

        if (data.success) {
            config = data.config;
            console.log('✅ [EMOJI RAIN UI] Config loaded successfully:', JSON.stringify(config, null, 2));
            console.log('🔍 [EMOJI RAIN UI] Config type:', typeof config);
            console.log('🔍 [EMOJI RAIN UI] Config.enabled:', config.enabled);
            console.log('🔍 [EMOJI RAIN UI] Config.emoji_set:', config.emoji_set);
            console.log('🔍 [EMOJI RAIN UI] Config.emoji_set type:', typeof config.emoji_set, Array.isArray(config.emoji_set));
            updateUI();
        } else {
            console.error('❌ [EMOJI RAIN UI] Config load failed:', data.error);
            showNotification('Fehler: ' + (data.error || 'Unknown error'), true);
        }
    } catch (error) {
        console.error('❌ [EMOJI RAIN UI] Exception during config load:', error);
        console.error('❌ [EMOJI RAIN UI] Error stack:', error.stack);
        showNotification('Fehler beim Laden der Konfiguration', true);
    }
}

// Resolution presets
const resolutionPresets = {
    '720p': { width: 1280, height: 720 },
    '1080p': { width: 1920, height: 1080 },
    '1440p': { width: 2560, height: 1440 },
    '4k': { width: 3840, height: 2160 },
    '720p-portrait': { width: 720, height: 1280 },
    '1080p-portrait': { width: 1080, height: 1920 },
    '1440p-portrait': { width: 1440, height: 2560 },
    '4k-portrait': { width: 2160, height: 3840 }
};

// Apply resolution preset
function applyResolutionPreset() {
    const preset = document.getElementById('obs_hud_preset').value;
    if (preset !== 'custom' && resolutionPresets[preset]) {
        document.getElementById('obs_hud_width').value = resolutionPresets[preset].width;
        document.getElementById('obs_hud_height').value = resolutionPresets[preset].height;
    }
}

// Update UI with loaded config
function updateUI() {
    console.log('🎨 [EMOJI RAIN UI] Updating UI with config...');

    try {
        // Main toggle
        console.log('🎨 [EMOJI RAIN UI] Setting enabled toggle:', config.enabled);
        document.getElementById('enabled-toggle').checked = config.enabled;
        updateEnabledStatus();

        // Toaster mode
        console.log('🎨 [EMOJI RAIN UI] Setting toaster mode:', config.toaster_mode);
        document.getElementById('toaster_mode').checked = config.toaster_mode || false;

        // OBS HUD settings
        console.log('🎨 [EMOJI RAIN UI] Setting OBS HUD settings...');
        document.getElementById('obs_hud_enabled').checked = config.obs_hud_enabled !== false;
        document.getElementById('obs_hud_width').value = config.obs_hud_width || 1920;
        document.getElementById('obs_hud_height').value = config.obs_hud_height || 1080;
        document.getElementById('enable_glow').checked = config.enable_glow !== false;
        document.getElementById('enable_particles').checked = config.enable_particles !== false;
        document.getElementById('enable_depth').checked = config.enable_depth !== false;
        document.getElementById('obs_hud_target_fps').value = config.target_fps || 60;

        // Detect preset
        const width = config.obs_hud_width || 1920;
        const height = config.obs_hud_height || 1080;
        let detectedPreset = 'custom';
        for (const [preset, res] of Object.entries(resolutionPresets)) {
            if (res.width === width && res.height === height) {
                detectedPreset = preset;
                break;
            }
        }
        document.getElementById('obs_hud_preset').value = detectedPreset;
        console.log('🎨 [EMOJI RAIN UI] Detected resolution preset:', detectedPreset);

        // Canvas settings
        console.log('🎨 [EMOJI RAIN UI] Setting canvas settings...');
        document.getElementById('width_px').value = config.width_px || 1280;
        document.getElementById('height_px').value = config.height_px || 720;

        // Emoji set
        console.log('🎨 [EMOJI RAIN UI] Setting emoji set...');
        console.log('🎨 [EMOJI RAIN UI] config.emoji_set:', config.emoji_set);

        if (!config.emoji_set) {
            console.error('❌ [EMOJI RAIN UI] emoji_set is undefined or null!');
            config.emoji_set = ["💧","💙","💚","💜","❤️","🩵","✨","🌟","🔥","🎉"];
        }

        if (!Array.isArray(config.emoji_set)) {
            console.error('❌ [EMOJI RAIN UI] emoji_set is not an array:', typeof config.emoji_set);
            console.error('❌ [EMOJI RAIN UI] emoji_set value:', config.emoji_set);
            config.emoji_set = ["💧","💙","💚","💜","❤️","🩵","✨","🌟","🔥","🎉"];
        }

        document.getElementById('emoji_set').value = config.emoji_set.join(',');
        console.log('🎨 [EMOJI RAIN UI] Emoji set value set to:', document.getElementById('emoji_set').value);
        updateEmojiPreview();

        // Custom images
        console.log('🎨 [EMOJI RAIN UI] Setting custom images...');
        document.getElementById('use_custom_images').checked = config.use_custom_images || false;
        document.getElementById('image_urls').value = (config.image_urls || []).join('\n');

        // Effect
        console.log('🎨 [EMOJI RAIN UI] Setting effect...');
        document.getElementById('effect').value = config.effect || 'bounce';

        // Physics
        console.log('🎨 [EMOJI RAIN UI] Setting physics...');
        setRangeValue('physics_gravity_y', config.physics_gravity_y);
        setRangeValue('physics_air', config.physics_air);
        setRangeValue('physics_friction', config.physics_friction);
        setRangeValue('physics_restitution', config.physics_restitution);

        // Appearance
        console.log('🎨 [EMOJI RAIN UI] Setting appearance...');
        document.getElementById('emoji_min_size_px').value = config.emoji_min_size_px;
        document.getElementById('emoji_max_size_px').value = config.emoji_max_size_px;
        setRangeValue('emoji_rotation_speed', config.emoji_rotation_speed);
        document.getElementById('emoji_lifetime_ms').value = config.emoji_lifetime_ms;
        document.getElementById('emoji_fade_duration_ms').value = config.emoji_fade_duration_ms;
        document.getElementById('max_emojis_on_screen').value = config.max_emojis_on_screen;

        // Scaling rules
        console.log('🎨 [EMOJI RAIN UI] Setting scaling rules...');
        document.getElementById('like_count_divisor').value = config.like_count_divisor;
        document.getElementById('like_min_emojis').value = config.like_min_emojis;
        document.getElementById('like_max_emojis').value = config.like_max_emojis;
        document.getElementById('gift_base_emojis').value = config.gift_base_emojis;
        setRangeValue('gift_coin_multiplier', config.gift_coin_multiplier);
        document.getElementById('gift_max_emojis').value = config.gift_max_emojis;

        // Wind simulation
        console.log('🎨 [EMOJI RAIN UI] Setting wind simulation...');
        document.getElementById('wind_enabled').checked = config.wind_enabled || false;
        setRangeValue('wind_strength', config.wind_strength !== undefined ? config.wind_strength : 50);
        document.getElementById('wind_direction').value = config.wind_direction || 'auto';

        // Bounce physics
        console.log('🎨 [EMOJI RAIN UI] Setting bounce physics...');
        document.getElementById('floor_enabled').checked = config.floor_enabled !== false;
        setRangeValue('bounce_height', config.bounce_height !== undefined ? config.bounce_height : 0.6);
        setRangeValue('bounce_damping', config.bounce_damping !== undefined ? config.bounce_damping : 0.1);

        // Color theme
        console.log('🎨 [EMOJI RAIN UI] Setting color theme...');
        document.getElementById('color_mode').value = config.color_mode || 'off';
        setRangeValue('color_intensity', config.color_intensity !== undefined ? config.color_intensity : 0.5);

        // Rainbow mode
        console.log('🎨 [EMOJI RAIN UI] Setting rainbow mode...');
        document.getElementById('rainbow_enabled').checked = config.rainbow_enabled || false;
        setRangeValue('rainbow_speed', config.rainbow_speed !== undefined ? config.rainbow_speed : 1.0);

        // Pixel mode
        console.log('🎨 [EMOJI RAIN UI] Setting pixel mode...');
        document.getElementById('pixel_enabled').checked = config.pixel_enabled || false;
        setRangeValue('pixel_size', config.pixel_size !== undefined ? config.pixel_size : 4);

        // SuperFan burst
        console.log('🎨 [EMOJI RAIN UI] Setting SuperFan burst...');
        document.getElementById('superfan_burst_enabled').checked = config.superfan_burst_enabled !== false;
        setRangeValue('superfan_burst_intensity', config.superfan_burst_intensity !== undefined ? config.superfan_burst_intensity : 3.0);
        document.getElementById('superfan_burst_duration').value = config.superfan_burst_duration || 2000;

        // FPS optimization
        console.log('🎨 [EMOJI RAIN UI] Setting FPS optimization...');
        document.getElementById('fps_optimization_enabled').checked = config.fps_optimization_enabled !== false;
        setRangeValue('fps_sensitivity', config.fps_sensitivity !== undefined ? config.fps_sensitivity : 0.8);
        document.getElementById('target_fps_optimization').value = config.target_fps || 60;

        console.log('✅ [EMOJI RAIN UI] UI update completed successfully');
    } catch (error) {
        console.error('❌ [EMOJI RAIN UI] Error updating UI:', error);
        console.error('❌ [EMOJI RAIN UI] Error stack:', error.stack);
        showNotification('Fehler beim Aktualisieren der UI', true);
    }
}

function setRangeValue(id, value) {
    const input = document.getElementById(id);
    const valueDisplay = document.getElementById(id + '_value');
    
    // Check if elements exist before accessing them
    if (!input) {
        console.warn(`⚠️ [EMOJI RAIN UI] Element with id "${id}" not found`);
        return;
    }
    
    input.value = value;
    
    if (valueDisplay) {
        valueDisplay.textContent = value;
    } else {
        console.warn(`⚠️ [EMOJI RAIN UI] Value display element "${id}_value" not found`);
    }
}

// Save configuration
async function saveConfig() {
    const imageUrlsText = document.getElementById('image_urls').value;
    const imageUrls = imageUrlsText.split('\n').map(url => url.trim()).filter(url => url);

    const newConfig = {
        enabled: document.getElementById('enabled-toggle').checked,
        // Toaster mode (Low-End PC Mode)
        toaster_mode: document.getElementById('toaster_mode').checked,
        // OBS HUD settings
        obs_hud_enabled: document.getElementById('obs_hud_enabled').checked,
        obs_hud_width: parseInt(document.getElementById('obs_hud_width').value),
        obs_hud_height: parseInt(document.getElementById('obs_hud_height').value),
        enable_glow: document.getElementById('enable_glow').checked,
        enable_particles: document.getElementById('enable_particles').checked,
        enable_depth: document.getElementById('enable_depth').checked,
        target_fps: parseInt(document.getElementById('target_fps').value),
        // Standard canvas settings
        width_px: parseInt(document.getElementById('width_px').value),
        height_px: parseInt(document.getElementById('height_px').value),
        emoji_set: document.getElementById('emoji_set').value.split(',').map(e => e.trim()).filter(e => e),
        use_custom_images: document.getElementById('use_custom_images').checked,
        image_urls: imageUrls,
        effect: document.getElementById('effect').value,
        physics_gravity_y: parseFloat(document.getElementById('physics_gravity_y').value),
        physics_air: parseFloat(document.getElementById('physics_air').value),
        physics_friction: parseFloat(document.getElementById('physics_friction').value),
        physics_restitution: parseFloat(document.getElementById('physics_restitution').value),
        // Wind simulation
        wind_enabled: document.getElementById('wind_enabled').checked,
        wind_strength: parseFloat(document.getElementById('wind_strength').value),
        wind_direction: document.getElementById('wind_direction').value,
        // Bounce physics
        floor_enabled: document.getElementById('floor_enabled').checked,
        bounce_height: parseFloat(document.getElementById('bounce_height').value),
        bounce_damping: parseFloat(document.getElementById('bounce_damping').value),
        // Color theme
        color_mode: document.getElementById('color_mode').value,
        color_intensity: parseFloat(document.getElementById('color_intensity').value),
        // Rainbow mode
        rainbow_enabled: document.getElementById('rainbow_enabled').checked,
        rainbow_speed: parseFloat(document.getElementById('rainbow_speed').value),
        // Pixel mode
        pixel_enabled: document.getElementById('pixel_enabled').checked,
        pixel_size: parseInt(document.getElementById('pixel_size').value),
        // SuperFan burst
        superfan_burst_enabled: document.getElementById('superfan_burst_enabled').checked,
        superfan_burst_intensity: parseFloat(document.getElementById('superfan_burst_intensity').value),
        superfan_burst_duration: parseInt(document.getElementById('superfan_burst_duration').value),
        // FPS optimization
        fps_optimization_enabled: document.getElementById('fps_optimization_enabled').checked,
        fps_sensitivity: parseFloat(document.getElementById('fps_sensitivity').value),
        // Appearance
        emoji_min_size_px: parseInt(document.getElementById('emoji_min_size_px').value),
        emoji_max_size_px: parseInt(document.getElementById('emoji_max_size_px').value),
        emoji_rotation_speed: parseFloat(document.getElementById('emoji_rotation_speed').value),
        emoji_lifetime_ms: parseInt(document.getElementById('emoji_lifetime_ms').value),
        emoji_fade_duration_ms: parseInt(document.getElementById('emoji_fade_duration_ms').value),
        max_emojis_on_screen: parseInt(document.getElementById('max_emojis_on_screen').value),
        // Scaling rules
        like_count_divisor: parseInt(document.getElementById('like_count_divisor').value),
        like_min_emojis: parseInt(document.getElementById('like_min_emojis').value),
        like_max_emojis: parseInt(document.getElementById('like_max_emojis').value),
        gift_base_emojis: parseInt(document.getElementById('gift_base_emojis').value),
        gift_coin_multiplier: parseFloat(document.getElementById('gift_coin_multiplier').value),
        gift_max_emojis: parseInt(document.getElementById('gift_max_emojis').value)
    };

    try {
        const response = await fetch('/api/emoji-rain/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config: newConfig, enabled: newConfig.enabled })
        });

        const data = await response.json();

        if (data.success) {
            config = newConfig;
            showNotification('Konfiguration gespeichert!');
        } else {
            showNotification('Fehler beim Speichern: ' + data.error, true);
        }
    } catch (error) {
        showNotification('Netzwerkfehler beim Speichern', true);
        console.error(error);
    }
}

// Test emoji rain with debouncing
const TEST_BUTTON_COOLDOWN_MS = 1000; // 1 second cooldown
let testEmojiRainInProgress = false;
async function testEmojiRain() {
    // Prevent rapid clicks by checking if a test is already in progress
    if (testEmojiRainInProgress) {
        showNotification('Bitte warten, Test läuft bereits...', true);
        return;
    }

    try {
        testEmojiRainInProgress = true;
        
        // Disable the test button to prevent rapid clicks
        const testButton = document.getElementById('test-emoji-rain-btn');
        if (testButton) {
            testButton.disabled = true;
            testButton.style.opacity = '0.6';
            testButton.style.cursor = 'not-allowed';
        }

        const response = await fetch('/api/emoji-rain/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ count: 10 })
        });

        const data = await response.json();

        if (data.success) {
            showNotification('Test-Emojis gespawnt!');
        } else {
            showNotification('Fehler: ' + data.error, true);
        }
    } catch (error) {
        showNotification('Netzwerkfehler beim Testen', true);
        console.error(error);
    } finally {
        // Re-enable the button after a short delay to prevent rapid clicks
        setTimeout(() => {
            testEmojiRainInProgress = false;
            const testButton = document.getElementById('test-emoji-rain-btn');
            if (testButton) {
                testButton.disabled = false;
                testButton.style.opacity = '1';
                testButton.style.cursor = 'pointer';
            }
        }, TEST_BUTTON_COOLDOWN_MS);
    }
}

// Toggle enabled status - listener added below
function onEnabledToggleChange(event) {
    const enabled = event.target.checked;

    fetch('/api/emoji-rain/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            config.enabled = enabled;
            updateEnabledStatus();
            showNotification(enabled ? 'Emoji Rain aktiviert!' : 'Emoji Rain deaktiviert!');
        } else {
            event.target.checked = !enabled;
            showNotification('Fehler: ' + data.error, true);
        }
    })
    .catch(error => {
        event.target.checked = !enabled;
        showNotification('Netzwerkfehler', true);
        console.error(error);
    });
}

function updateEnabledStatus() {
    const status = document.getElementById('enabled-status');
    const enabled = document.getElementById('enabled-toggle').checked;
    status.textContent = enabled ? 'Aktiviert' : 'Deaktiviert';
    status.style.color = enabled ? '#4CAF50' : '#ccc';
}

// Update emoji preview
function updateEmojiPreview() {
    const input = document.getElementById('emoji_set').value;
    const emojis = input.split(',').map(e => e.trim()).filter(e => e);
    const preview = document.getElementById('emoji-preview');

    preview.innerHTML = '';
    emojis.forEach(emoji => {
        const span = document.createElement('span');
        span.className = 'emoji-preview-item';
        span.textContent = emoji;
        preview.appendChild(span);
    });
}

// Range input value display
function setupRangeInputs() {
    document.querySelectorAll('input[type="range"]').forEach(input => {
        input.addEventListener('input', function() {
            const valueDisplay = document.getElementById(this.id + '_value');
            if (valueDisplay) {
                valueDisplay.textContent = this.value;
            }
        });
    });
}

// Show notification
function showNotification(message, isError = false) {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = 'notification' + (isError ? ' error' : '');
    notification.classList.add('show');

    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// Upload images
async function uploadImages() {
    const fileInput = document.getElementById('image-upload');
    const files = fileInput.files;

    if (files.length === 0) {
        showNotification('Bitte wähle mindestens eine Datei aus', true);
        return;
    }

    const progressEl = document.getElementById('upload-progress');
    progressEl.style.display = 'block';
    progressEl.textContent = `Uploading ${files.length} file(s)...`;

    let uploaded = 0;
    let failed = 0;

    for (let i = 0; i < files.length; i++) {
        const formData = new FormData();
        formData.append('image', files[i]);

        try {
            const response = await fetch('/api/emoji-rain/upload', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (data.success) {
                uploaded++;
                progressEl.textContent = `Uploaded ${uploaded}/${files.length}...`;
            } else {
                failed++;
                console.error('Upload failed:', data.error);
            }
        } catch (error) {
            failed++;
            console.error('Upload error:', error);
        }
    }

    // Clear file input
    fileInput.value = '';

    // Hide progress
    setTimeout(() => {
        progressEl.style.display = 'none';
    }, 2000);

    // Show result
    if (failed > 0) {
        showNotification(`${uploaded} hochgeladen, ${failed} fehlgeschlagen`, failed > uploaded);
    } else {
        showNotification(`${uploaded} Bild(er) erfolgreich hochgeladen!`);
    }

    // Refresh image list
    await loadUploadedImages();
}

// Load uploaded images
async function loadUploadedImages() {
    try {
        const response = await fetch('/api/emoji-rain/images');
        const data = await response.json();

        const grid = document.getElementById('uploaded-images-grid');

        if (data.success && data.images.length > 0) {
            grid.innerHTML = '';

            // Update image URLs in textarea
            const currentUrls = document.getElementById('image_urls').value.split('\n').map(u => u.trim()).filter(u => u);
            const uploadedUrls = data.images.map(img => img.url);
            const allUrls = [...new Set([...uploadedUrls, ...currentUrls])];
            document.getElementById('image_urls').value = allUrls.join('\n');

            // Render image grid - CSP-compliant (no innerHTML with inline styles)
            data.images.forEach(img => {
                const item = document.createElement('div');
                item.className = 'image-item';

                // Create img element
                const imgEl = document.createElement('img');
                imgEl.src = img.url;
                imgEl.alt = img.filename;
                imgEl.title = img.filename;

                // Create delete button
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'delete-btn';
                deleteBtn.setAttribute('data-filename', img.filename);
                deleteBtn.title = 'Löschen';
                deleteBtn.textContent = '×';

                item.appendChild(imgEl);
                item.appendChild(deleteBtn);
                grid.appendChild(item);
            });
        } else {
            // CSP-compliant: Create element instead of innerHTML with inline styles
            grid.innerHTML = '';
            const emptyMsg = document.createElement('div');
            emptyMsg.textContent = 'Keine Bilder hochgeladen';
            emptyMsg.style.textAlign = 'center';
            emptyMsg.style.color = '#9ca3af';
            emptyMsg.style.gridColumn = '1 / -1';
            grid.appendChild(emptyMsg);
        }
    } catch (error) {
        console.error('Error loading images:', error);
    }
}

// Delete image
async function deleteImage(filename) {
    if (!confirm(`Bild "${filename}" wirklich löschen?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/emoji-rain/images/${filename}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            showNotification('Bild gelöscht!');

            // Remove URL from textarea
            const currentUrls = document.getElementById('image_urls').value.split('\n');
            const urlToRemove = `/uploads/emoji-rain/${filename}`;
            const newUrls = currentUrls.filter(url => url.trim() !== urlToRemove);
            document.getElementById('image_urls').value = newUrls.join('\n');

            // Reload image list
            await loadUploadedImages();
        } else {
            showNotification('Fehler beim Löschen: ' + data.error, true);
        }
    } catch (error) {
        showNotification('Netzwerkfehler beim Löschen', true);
        console.error(error);
    }
}

// ========== USER EMOJI MAPPINGS ==========

let userEmojiMappings = {};

// Load user emoji mappings
async function loadUserEmojiMappings() {
    try {
        const response = await fetch('/api/emoji-rain/user-mappings');
        const data = await response.json();

        if (data.success) {
            userEmojiMappings = data.mappings || {};
            renderUserEmojiMappings();
        }
    } catch (error) {
        console.error('Error loading user emoji mappings:', error);
    }
}

// Render user emoji mappings
function renderUserEmojiMappings() {
    const container = document.getElementById('user-emoji-mappings');
    container.innerHTML = '';

    const filter = document.getElementById('user_filter')?.value?.toLowerCase() || '';

    const entries = Object.entries(userEmojiMappings).filter(([username]) => 
        username.toLowerCase().includes(filter)
    );

    if (entries.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.textContent = filter ? 'Keine passenden Benutzer gefunden' : 'Keine Zuordnungen';
        emptyMsg.style.textAlign = 'center';
        emptyMsg.style.color = '#9ca3af';
        container.appendChild(emptyMsg);
        return;
    }

    entries.forEach(([username, emoji]) => {
        const item = document.createElement('div');
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        item.style.padding = '10px';
        item.style.background = 'rgba(255,255,255,0.05)';
        item.style.borderRadius = '5px';
        item.style.marginBottom = '5px';

        const info = document.createElement('div');
        info.style.display = 'flex';
        info.style.gap = '10px';
        info.style.alignItems = 'center';

        const usernameSpan = document.createElement('span');
        usernameSpan.textContent = username;
        usernameSpan.style.fontWeight = 'bold';

        const emojiSpan = document.createElement('span');
        emojiSpan.textContent = emoji;
        emojiSpan.style.fontSize = '1.5em';

        info.appendChild(usernameSpan);
        info.appendChild(emojiSpan);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'danger';
        deleteBtn.textContent = '🗑️ Löschen';
        deleteBtn.style.padding = '5px 10px';
        deleteBtn.style.fontSize = '0.9em';
        deleteBtn.addEventListener('click', () => deleteUserMapping(username));

        item.appendChild(info);
        item.appendChild(deleteBtn);
        container.appendChild(item);
    });
}

// Add user emoji mapping
async function addUserMapping() {
    const username = document.getElementById('new_user_name').value.trim();
    const emoji = document.getElementById('new_user_emoji').value.trim();

    if (!username || !emoji) {
        showNotification('Bitte Benutzername und Emoji angeben', true);
        return;
    }

    userEmojiMappings[username] = emoji;
    await saveUserEmojiMappings();

    document.getElementById('new_user_name').value = '';
    document.getElementById('new_user_emoji').value = '';
}

// Delete user emoji mapping
async function deleteUserMapping(username) {
    if (!confirm(`Zuordnung für "${username}" wirklich löschen?`)) {
        return;
    }

    delete userEmojiMappings[username];
    await saveUserEmojiMappings();
}

// Save user emoji mappings
async function saveUserEmojiMappings() {
    try {
        const response = await fetch('/api/emoji-rain/user-mappings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mappings: userEmojiMappings })
        });

        const data = await response.json();

        if (data.success) {
            showNotification('Benutzer-Zuordnungen gespeichert!');
            renderUserEmojiMappings();
        } else {
            showNotification('Fehler beim Speichern: ' + data.error, true);
        }
    } catch (error) {
        showNotification('Netzwerkfehler beim Speichern', true);
        console.error(error);
    }
}

// ========== PERFORMANCE MONITORING ==========

// Update performance display (called from socket updates or polling)
function updatePerformanceDisplay(fps, activeEmojis, mode) {
    const fpsDisplay = document.getElementById('current-fps-display');
    const emojisDisplay = document.getElementById('active-emojis-display');
    const modeDisplay = document.getElementById('performance-mode-display');

    if (fpsDisplay) fpsDisplay.textContent = fps || '--';
    if (emojisDisplay) emojisDisplay.textContent = activeEmojis || '--';
    if (modeDisplay) {
        modeDisplay.textContent = mode || 'Normal';
        // Color based on mode
        if (mode === 'minimal') {
            modeDisplay.style.color = '#f44336';
        } else if (mode === 'reduced') {
            modeDisplay.style.color = '#ff9800';
        } else {
            modeDisplay.style.color = '#4CAF50';
        }
    }
}

// ========== INITIALIZATION ==========

// Initialize everything when DOM is ready
// ========== BENCHMARK FUNCTIONS ==========

let benchmarkActive = false;
let benchmarkResults = null;
let benchmarkPreviewWindow = null;

/**
 * Start FPS benchmark
 */
async function startBenchmark() {
    const targetFPS = parseInt(document.getElementById('target_fps').value) || 60;
    
    if (benchmarkActive) {
        showNotification('Benchmark läuft bereits', true);
        return;
    }
    
    try {
        console.log(`🔬 Starting benchmark (Target: ${targetFPS} FPS)`);
        
        // Open preview window so user can see the benchmark
        const previewWidth = 800;
        const previewHeight = 600;
        const left = (screen.width - previewWidth) / 2;
        const top = (screen.height - previewHeight) / 2;
        
        // Note: Preview window shows overlay.html which must be from same origin
        const overlayUrl = '/plugins/emoji-rain/overlay.html';
        
        benchmarkPreviewWindow = window.open(
            overlayUrl,
            'EmojiRainBenchmarkPreview',
            `width=${previewWidth},height=${previewHeight},left=${left},top=${top},resizable=yes,scrollbars=no,status=no,menubar=no,toolbar=no,location=no`
        );
        
        if (!benchmarkPreviewWindow) {
            throw new Error('Konnte Preview-Fenster nicht öffnen. Bitte Pop-ups erlauben.');
        }
        
        // Update UI
        document.getElementById('start-benchmark-btn').style.display = 'none';
        document.getElementById('stop-benchmark-btn').style.display = 'inline-block';
        document.getElementById('benchmark-progress').style.display = 'block';
        document.getElementById('benchmark-results').style.display = 'none';
        
        benchmarkActive = true;
        benchmarkResults = null;
        
        // Wait for preview window to load before starting benchmark
        // Use a promise-based approach to detect when window is ready
        await new Promise((resolve, reject) => {
            let checkCount = 0;
            const maxChecks = 20; // 2 seconds max wait
            
            const checkInterval = setInterval(() => {
                checkCount++;
                
                try {
                    // Check if window is loaded and ready
                    // Note: This may throw on cross-origin access, so wrap in try-catch
                    if (benchmarkPreviewWindow && !benchmarkPreviewWindow.closed && 
                        benchmarkPreviewWindow.document && benchmarkPreviewWindow.document.readyState === 'complete') {
                        clearInterval(checkInterval);
                        resolve();
                    } else if (checkCount >= maxChecks) {
                        clearInterval(checkInterval);
                        // Proceed anyway after timeout
                        resolve();
                    } else if (!benchmarkPreviewWindow || benchmarkPreviewWindow.closed) {
                        clearInterval(checkInterval);
                        reject(new Error('Preview window was closed'));
                    }
                } catch (e) {
                    // Cross-origin or other access error - assume window is loading
                    if (checkCount >= maxChecks) {
                        clearInterval(checkInterval);
                        resolve(); // Proceed anyway after timeout
                    }
                }
            }, 100);
        });
        
        // Start benchmark via API
        const response = await fetch('/api/emoji-rain/benchmark/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetFPS })
        });
        
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || 'Benchmark start failed');
        }
        
        showNotification('Benchmark gestartet - Fortschritt im Preview-Fenster sichtbar', false);
        
    } catch (error) {
        console.error('Error starting benchmark:', error);
        showNotification('Fehler beim Starten des Benchmarks: ' + error.message, true);
        
        // Close preview window if it was opened
        if (benchmarkPreviewWindow && !benchmarkPreviewWindow.closed) {
            benchmarkPreviewWindow.close();
            benchmarkPreviewWindow = null;
        }
        
        resetBenchmarkUI();
    }
}

/**
 * Stop FPS benchmark
 */
async function stopBenchmark() {
    try {
        console.log('⏹️ Stopping benchmark');
        
        const response = await fetch('/api/emoji-rain/benchmark/stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || 'Benchmark stop failed');
        }
        
        // Close preview window
        if (benchmarkPreviewWindow && !benchmarkPreviewWindow.closed) {
            benchmarkPreviewWindow.close();
            benchmarkPreviewWindow = null;
        }
        
        showNotification('Benchmark gestoppt', false);
        resetBenchmarkUI();
    } catch (error) {
        console.error('Error stopping benchmark:', error);
        showNotification('Fehler beim Stoppen des Benchmarks', true);
        resetBenchmarkUI();
    }
}

/**
 * Apply specific benchmark preset (called when user clicks on a result row)
 */
async function applyBenchmarkPreset(presetName) {
    if (!benchmarkResults || !benchmarkResults.results) {
        showNotification('Keine Benchmark-Ergebnisse verfügbar', true);
        return;
    }
    
    // Find the selected preset
    const selectedPreset = benchmarkResults.results.find(r => r.name === presetName);
    if (!selectedPreset) {
        showNotification('Preset nicht gefunden', true);
        return;
    }
    
    const targetFPS = benchmarkResults.targetFPS || 60;
    
    // Check if the selected setting doesn't meet the target FPS
    if (!selectedPreset.meetsTarget) {
        const warningMessage = `⚠️ WARNUNG: Diese Einstellung erreicht nicht die Ziel-FPS!\n\n` +
            `Gewählte Einstellung: ${selectedPreset.name}\n` +
            `Ziel: ${targetFPS} FPS\n` +
            `Erreicht: ${selectedPreset.avgFPS} FPS (±${selectedPreset.stdDev})\n` +
            `Mindest-FPS: ${selectedPreset.minFPS}\n\n` +
            `Diese Einstellung könnte zu ruckeligem Gameplay führen. ` +
            `Möchten Sie diese Einstellung trotzdem anwenden?`;
        
        if (!confirm(warningMessage)) {
            console.log('User cancelled applying sub-optimal preset');
            showNotification('Anwendung abgebrochen', false);
            return;
        }
    }
    
    // Check for low reliability (high variance between runs)
    if (selectedPreset.reliability === 'low') {
        const reliabilityWarning = `⚠️ HINWEIS: Diese Einstellung zeigt inkonsistente Performance!\n\n` +
            `FPS-Schwankung: ±${selectedPreset.stdDev} FPS\n` +
            `Dies bedeutet, die Performance kann stark variieren.\n\n` +
            `Möchten Sie fortfahren?`;
        
        if (!confirm(reliabilityWarning)) {
            console.log('User cancelled due to low reliability');
            showNotification('Anwendung abgebrochen', false);
            return;
        }
    }
    
    try {
        console.log('✨ Applying selected preset:', selectedPreset);
        
        const response = await fetch('/api/emoji-rain/benchmark/apply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ settings: selectedPreset.settings })
        });
        
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || 'Apply settings failed');
        }
        
        showNotification(`Einstellung "${selectedPreset.name}" erfolgreich angewendet!`, false);
        
        // Reload config to update UI
        setTimeout(() => {
            loadConfig();
        }, 500);
    } catch (error) {
        console.error('Error applying preset:', error);
        showNotification('Fehler beim Anwenden der Einstellungen', true);
    }
}

/**
 * Apply optimized settings from benchmark
 */
async function applyOptimizedSettings() {
    if (!benchmarkResults || !benchmarkResults.optimal) {
        showNotification('Keine optimierten Einstellungen verfügbar', true);
        return;
    }
    
    try {
        const optimal = benchmarkResults.optimal;
        const targetFPS = benchmarkResults.targetFPS || 60;
        
        // Check if the selected setting doesn't meet the target FPS
        if (!optimal.meetsTarget) {
            const warningMessage = `⚠️ WARNUNG: Diese Einstellung erreicht nicht die Ziel-FPS!\n\n` +
                `Ziel: ${targetFPS} FPS\n` +
                `Erreicht: ${optimal.avgFPS} FPS (±${optimal.stdDev})\n` +
                `Mindest-FPS: ${optimal.minFPS}\n\n` +
                `Diese Einstellung könnte zu ruckeligem Gameplay führen. ` +
                `Möchten Sie diese Einstellung trotzdem anwenden?`;
            
            if (!confirm(warningMessage)) {
                console.log('User cancelled applying sub-optimal settings');
                showNotification('Anwendung abgebrochen', false);
                return;
            }
        }
        
        // Check for low reliability (high variance between runs)
        if (optimal.reliability === 'low') {
            const reliabilityWarning = `⚠️ HINWEIS: Diese Einstellung zeigt inkonsistente Performance!\n\n` +
                `FPS-Schwankung: ±${optimal.stdDev} FPS\n` +
                `Dies bedeutet, die Performance kann stark variieren.\n\n` +
                `Möchten Sie fortfahren?`;
            
            if (!confirm(reliabilityWarning)) {
                console.log('User cancelled due to low reliability');
                showNotification('Anwendung abgebrochen', false);
                return;
            }
        }
        
        console.log('✨ Applying optimized settings:', optimal);
        
        const response = await fetch('/api/emoji-rain/benchmark/apply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ settings: optimal.settings })
        });
        
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || 'Apply settings failed');
        }
        
        showNotification('Optimierte Einstellungen erfolgreich angewendet!', false);
        
        // Reload config to update UI
        setTimeout(() => {
            loadConfig();
        }, 500);
    } catch (error) {
        console.error('Error applying optimized settings:', error);
        showNotification('Fehler beim Anwenden der Einstellungen', true);
    }
}

/**
 * Reset benchmark UI to initial state
 */
function resetBenchmarkUI() {
    benchmarkActive = false;
    
    // Close preview window if still open
    if (benchmarkPreviewWindow && !benchmarkPreviewWindow.closed) {
        benchmarkPreviewWindow.close();
        benchmarkPreviewWindow = null;
    }
    
    document.getElementById('start-benchmark-btn').style.display = 'inline-block';
    document.getElementById('stop-benchmark-btn').style.display = 'none';
    document.getElementById('benchmark-progress').style.display = 'none';
}

/**
 * Update benchmark progress display
 */
function updateBenchmarkProgress(data) {
    if (data.type === 'progress') {
        const progressPercent = (data.test / data.total) * 100;
        document.getElementById('benchmark-progress-bar').style.width = progressPercent + '%';
        document.getElementById('benchmark-status').textContent = `Test ${data.test}/${data.total}: ${data.name}`;
    } else if (data.type === 'complete') {
        // Benchmark complete
        benchmarkActive = false;
        benchmarkResults = data;
        
        // Close preview window
        if (benchmarkPreviewWindow && !benchmarkPreviewWindow.closed) {
            benchmarkPreviewWindow.close();
            benchmarkPreviewWindow = null;
        }
        
        // Hide progress, show results
        document.getElementById('benchmark-progress').style.display = 'none';
        document.getElementById('start-benchmark-btn').style.display = 'inline-block';
        document.getElementById('stop-benchmark-btn').style.display = 'none';
        
        // Display results
        displayBenchmarkResults(data);
        
        showNotification('Benchmark abgeschlossen!', false);
    } else if (data.type === 'stopped') {
        resetBenchmarkUI();
    }
}

/**
 * Display benchmark results
 */
function displayBenchmarkResults(data) {
    const resultsDiv = document.getElementById('benchmark-results');
    const contentDiv = document.getElementById('benchmark-results-content');
    const optimalDiv = document.getElementById('optimal-settings');
    
    // Build enhanced results table with reliability info
    let html = '<div style="margin-bottom: 10px; color: var(--color-text-secondary); font-size: 0.9em;">';
    html += '💡 <strong>Tipp:</strong> Klicke auf eine Zeile um diese Einstellung direkt anzuwenden';
    html += '</div>';
    
    html += '<table style="width: 100%; border-collapse: collapse; font-size: 0.9em;">';
    html += '<tr style="border-bottom: 2px solid var(--color-border); font-weight: bold;">';
    html += '<th style="text-align: left; padding: 8px;">Qualität</th>';
    html += '<th style="text-align: center; padding: 8px;">Ø FPS</th>';
    html += '<th style="text-align: center; padding: 8px;">Min</th>';
    html += '<th style="text-align: center; padding: 8px;">Max</th>';
    html += '<th style="text-align: center; padding: 8px;">Zuverlässigkeit</th>';
    html += '<th style="text-align: center; padding: 8px;">Status</th>';
    html += '</tr>';
    
    const targetFPS = data.targetFPS || 60;
    
    data.results.forEach(result => {
        // Color coding based on performance
        let rowColor = '';
        let statusIcon = '';
        let statusText = '';
        
        if (result.meetsTarget) {
            rowColor = 'background: var(--color-success-bg);';
            statusIcon = '✅';
            statusText = 'Ziel erreicht';
        } else if (result.avgFPS >= targetFPS * 0.85) {
            rowColor = 'background: rgba(255, 193, 7, 0.1);'; // Yellow tint
            statusIcon = '⚠️';
            statusText = 'Fast erreicht';
        } else {
            rowColor = 'background: rgba(220, 53, 69, 0.1);'; // Red tint
            statusIcon = '❌';
            statusText = 'Zu langsam';
        }
        
        // Reliability indicator
        const reliabilityEmoji = result.reliability === 'high' ? '🟢' : 
                                 result.reliability === 'medium' ? '🟡' : '🔴';
        const reliabilityText = `${reliabilityEmoji} ±${result.stdDev}`;
        
        // Make rows clickable with hover effect (no inline handlers)
        const rowStyle = `${rowColor} cursor: pointer;`;
        const rowClass = 'benchmark-result-row';
        
        html += `<tr style="border-bottom: 1px solid var(--color-border); ${rowStyle}" class="${rowClass}" data-preset="${result.name}">`;
        html += `<td style="padding: 8px;"><strong>${result.name}</strong></td>`;
        html += `<td style="text-align: center; padding: 8px;"><strong style="font-size: 1.1em;">${result.avgFPS}</strong></td>`;
        html += `<td style="text-align: center; padding: 8px;">${result.minFPS}</td>`;
        html += `<td style="text-align: center; padding: 8px;">${result.maxFPS}</td>`;
        html += `<td style="text-align: center; padding: 8px;" title="FPS-Schwankung über ${result.runs} Läufe">${reliabilityText}</td>`;
        html += `<td style="text-align: center; padding: 8px;">${statusIcon} ${statusText}</td>`;
        html += '</tr>';
    });
    
    html += '</table>';
    
    // Add legend
    html += '<div style="margin-top: 15px; padding: 10px; background: var(--color-bg-secondary); border-radius: 6px; font-size: 0.85em;">';
    html += '<strong>📊 Legende:</strong><br>';
    html += '<span style="margin-right: 15px;">🟢 Hohe Zuverlässigkeit (±&lt;5 FPS)</span>';
    html += '<span style="margin-right: 15px;">🟡 Mittlere Zuverlässigkeit (±5-10 FPS)</span>';
    html += '<span>🔴 Niedrige Zuverlässigkeit (±&gt;10 FPS)</span>';
    html += '</div>';
    
    contentDiv.innerHTML = html;
    
    // Add click and hover handlers to result rows (CSP-compliant)
    document.querySelectorAll('.benchmark-result-row').forEach(row => {
        // Click handler
        row.addEventListener('click', function() {
            const presetName = this.getAttribute('data-preset');
            applyBenchmarkPreset(presetName);
        });
        
        // Hover effect using CSS-in-JS (better than inline handlers)
        row.addEventListener('mouseenter', function() {
            this.style.opacity = '0.7';
        });
        row.addEventListener('mouseleave', function() {
            this.style.opacity = '1';
        });
    });
    
    resultsDiv.style.display = 'block';
    
    // Show optimal settings if available
    if (data.optimal) {
        const optimalPerf = data.optimal.meetsTarget ? '✅ Erreicht Ziel-FPS' : '⚠️ Erreicht Ziel-FPS nicht';
        const reliabilityStatus = data.optimal.reliability === 'high' ? '🟢 Sehr stabil' :
                                   data.optimal.reliability === 'medium' ? '🟡 Relativ stabil' :
                                   '🔴 Instabil - Vorsicht';
        
        document.getElementById('optimal-name').textContent = data.optimal.name;
        document.getElementById('optimal-details').innerHTML = 
            `<strong>Performance:</strong> ${optimalPerf}<br>` +
            `<strong>Durchschnitt:</strong> ${data.optimal.avgFPS} FPS (±${data.optimal.stdDev})<br>` +
            `<strong>Bereich:</strong> ${data.optimal.minFPS} - ${data.optimal.maxFPS} FPS<br>` +
            `<strong>Stabilität:</strong> ${reliabilityStatus} (${data.optimal.runs} Testläufe)`;
        optimalDiv.style.display = 'block';
    } else {
        optimalDiv.style.display = 'none';
    }
}

function initializeEmojiRainUI() {
    console.log('🚀 [EMOJI RAIN UI] Initializing Emoji Rain UI...');

    loadConfig();
    loadUploadedImages();
    loadUserEmojiMappings();

    console.log('✅ [EMOJI RAIN UI] Initialization started');

    // ========== EVENT LISTENERS (CSP-compliant) ==========

    // Enable/disable toggle
    document.getElementById('enabled-toggle').addEventListener('change', onEnabledToggleChange);

    // Resolution preset selector
    document.getElementById('obs_hud_preset').addEventListener('change', applyResolutionPreset);

    // Upload images button
    document.getElementById('upload-images-btn').addEventListener('click', uploadImages);

    // Save config button
    document.getElementById('save-config-btn').addEventListener('click', saveConfig);

    // Test emoji rain button
    document.getElementById('test-emoji-rain-btn').addEventListener('click', testEmojiRain);

    // Benchmark buttons
    document.getElementById('start-benchmark-btn').addEventListener('click', startBenchmark);
    document.getElementById('stop-benchmark-btn').addEventListener('click', stopBenchmark);
    document.getElementById('apply-optimal-btn').addEventListener('click', applyOptimizedSettings);

    // Emoji set input
    document.getElementById('emoji_set').addEventListener('input', updateEmojiPreview);

    // User emoji mapping
    document.getElementById('add-user-mapping-btn').addEventListener('click', addUserMapping);
    document.getElementById('user_filter').addEventListener('input', renderUserEmojiMappings);

    // Range inputs
    setupRangeInputs();

    // Delete image buttons (event delegation)
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('delete-btn')) {
            const filename = e.target.getAttribute('data-filename');
            if (filename) {
                deleteImage(filename);
            }
        }
    });

    // Setup socket listener for performance updates
    socket.on('emoji-rain:performance-update', (data) => {
        updatePerformanceDisplay(data.fps, data.activeEmojis, data.mode);
    });

    // Setup socket listener for benchmark updates
    socket.on('emoji-rain:benchmark-update', (data) => {
        updateBenchmarkProgress(data);
    });
}

// Run when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeEmojiRainUI);
} else {
    initializeEmojiRainUI();
}
