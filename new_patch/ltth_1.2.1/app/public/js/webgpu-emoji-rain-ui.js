const socket = io();
let config = {};

// Load configuration on page load
async function loadConfig() {
    console.log('🔄 [EMOJI RAIN UI] Loading configuration...');
    try {
        const response = await fetch('/api/webgpu-emoji-rain/config');
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
        document.getElementById('target_fps').value = config.target_fps || 60;

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
        const response = await fetch('/api/webgpu-emoji-rain/config', {
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

        const response = await fetch('/api/webgpu-emoji-rain/test', {
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

    fetch('/api/webgpu-emoji-rain/toggle', {
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
            const response = await fetch('/api/webgpu-emoji-rain/upload', {
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
        const response = await fetch('/api/webgpu-emoji-rain/images');
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
        const response = await fetch(`/api/webgpu-emoji-rain/images/${filename}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            showNotification('Bild gelöscht!');

            // Remove URL from textarea
            const currentUrls = document.getElementById('image_urls').value.split('\n');
            const urlToRemove = `/uploads/webgpu-emoji-rain/${filename}`;
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
        const response = await fetch('/api/webgpu-emoji-rain/user-mappings');
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
        const response = await fetch('/api/webgpu-emoji-rain/user-mappings', {
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
    socket.on('webgpu-emoji-rain:performance-update', (data) => {
        updatePerformanceDisplay(data.fps, data.activeEmojis, data.mode);
    });
}

// Run when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeEmojiRainUI);
} else {
    initializeEmojiRainUI();
}
