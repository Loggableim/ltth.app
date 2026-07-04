const socket = io();
let config = {};

// Load configuration on page load
async function loadConfig() {
    console.log('?? [EMOJI RAIN UI] Loading configuration...');
    try {
        const response = await fetch('/api/webgpu-emoji-rain/config');
        console.log('?? [EMOJI RAIN UI] Response status:', response.status);

        const data = await response.json();
        console.log('?? [EMOJI RAIN UI] Response data:', JSON.stringify(data, null, 2));

        if (data.success) {
            config = data.config;
            console.log('? [EMOJI RAIN UI] Config loaded successfully:', JSON.stringify(config, null, 2));
            console.log('?? [EMOJI RAIN UI] Config type:', typeof config);
            console.log('?? [EMOJI RAIN UI] Config.enabled:', config.enabled);
            console.log('?? [EMOJI RAIN UI] Config.emoji_set:', config.emoji_set);
            console.log('?? [EMOJI RAIN UI] Config.emoji_set type:', typeof config.emoji_set, Array.isArray(config.emoji_set));
            updateUI();
        } else {
            console.error('? [EMOJI RAIN UI] Config load failed:', data.error);
            showNotification('Fehler: ' + (data.error || 'Unknown error'), true);
        }
    } catch (error) {
        console.error('? [EMOJI RAIN UI] Exception during config load:', error);
        console.error('? [EMOJI RAIN UI] Error stack:', error.stack);
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

const visualModePresets = {
    premium_stage: {
        effect: 'bounce',
        color_mode: 'cool',
        color_intensity: 0.45,
        rainbow_enabled: false,
        rainbow_speed: 1.0,
        pixel_enabled: false,
        pixel_size: 4,
        enable_glow: true,
        enable_particles: true,
        enable_depth: true,
        physics_gravity_y: 0.88,
        physics_air: 0.028,
        physics_friction: 0.11,
        physics_restitution: 0.62,
        bounce_height: 0.62,
        bounce_damping: 0.15,
        emoji_min_size_px: 38,
        emoji_max_size_px: 80,
        emoji_rotation_speed: 0.035,
        emoji_lifetime_ms: 7600,
        emoji_fade_duration_ms: 1100,
        max_emojis_on_screen: 170,
        rate_limit_enabled: true,
        rate_limit_emojis_per_second: 26,
        like_count_divisor: 22,
        like_min_emojis: 1,
        like_max_emojis: 10,
        gift_base_emojis: 5,
        gift_coin_multiplier: 0.09,
        gift_max_emojis: 42,
        heart_balloon_like_divisor: 2,
        heart_balloon_min_hearts: 1,
        heart_balloon_max_hearts: 16,
        target_fps: 60,
        fps_optimization_enabled: true,
        fps_sensitivity: 0.75,
        superfan_burst_intensity: 3.8
    },
    pupcid_balanced: {
        effect: 'bounce',
        color_mode: 'cool',
        color_intensity: 0.35,
        rainbow_enabled: false,
        rainbow_speed: 1.0,
        pixel_enabled: false,
        pixel_size: 4,
        enable_glow: true,
        enable_particles: true,
        enable_depth: true,
        physics_gravity_y: 0.9,
        physics_air: 0.03,
        physics_friction: 0.12,
        physics_restitution: 0.55,
        bounce_height: 0.55,
        bounce_damping: 0.18,
        emoji_min_size_px: 36,
        emoji_max_size_px: 72,
        emoji_rotation_speed: 0.04,
        emoji_lifetime_ms: 7000,
        emoji_fade_duration_ms: 900,
        max_emojis_on_screen: 160,
        rate_limit_enabled: true,
        rate_limit_emojis_per_second: 24,
        like_count_divisor: 25,
        like_min_emojis: 1,
        like_max_emojis: 8,
        gift_base_emojis: 4,
        gift_coin_multiplier: 0.08,
        gift_max_emojis: 36,
        heart_balloon_like_divisor: 2,
        heart_balloon_min_hearts: 1,
        heart_balloon_max_hearts: 16,
        target_fps: 60,
        fps_optimization_enabled: true,
        fps_sensitivity: 0.8
    },
    glow_burst: {
        effect: 'bounce',
        color_mode: 'neon',
        color_intensity: 0.65,
        rainbow_enabled: false,
        pixel_enabled: false,
        enable_glow: true,
        enable_particles: true,
        enable_depth: true,
        emoji_min_size_px: 42,
        emoji_max_size_px: 86,
        max_emojis_on_screen: 180,
        rate_limit_enabled: true,
        rate_limit_emojis_per_second: 28,
        gift_base_emojis: 5,
        gift_coin_multiplier: 0.09,
        gift_max_emojis: 42,
        superfan_burst_intensity: 3.5
    },
    rainbow_live: {
        effect: 'bubble',
        color_mode: 'off',
        color_intensity: 0.5,
        rainbow_enabled: true,
        rainbow_speed: 1.3,
        pixel_enabled: false,
        enable_glow: true,
        enable_particles: true,
        enable_depth: true,
        emoji_min_size_px: 36,
        emoji_max_size_px: 76,
        max_emojis_on_screen: 150,
        rate_limit_enabled: true,
        rate_limit_emojis_per_second: 22
    },
    retro_pixel: {
        effect: 'bubble',
        color_mode: 'warm',
        color_intensity: 0.4,
        rainbow_enabled: false,
        pixel_enabled: true,
        pixel_size: 5,
        enable_glow: false,
        enable_particles: false,
        enable_depth: false,
        emoji_min_size_px: 34,
        emoji_max_size_px: 68,
        emoji_rotation_speed: 0.02,
        max_emojis_on_screen: 130,
        rate_limit_enabled: true,
        rate_limit_emojis_per_second: 20
    }
};

function setControlValue(id, value) {
    const element = document.getElementById(id);
    if (!element) return;

    if (element.type === 'checkbox') {
        element.checked = Boolean(value);
    } else {
        element.value = value;
        const valueDisplay = document.getElementById(id + '_value');
        if (valueDisplay) valueDisplay.textContent = value;
    }
}

function applyVisualModePreset() {
    const mode = document.getElementById('visual_mode').value;
    const preset = visualModePresets[mode];
    if (!preset) return;

    Object.entries(preset).forEach(([key, value]) => setControlValue(key, value));
}

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
    console.log('?? [EMOJI RAIN UI] Updating UI with config...');

    try {
        // Main toggle
        console.log('?? [EMOJI RAIN UI] Setting enabled toggle:', config.enabled);
        document.getElementById('enabled-toggle').checked = config.enabled;
        updateEnabledStatus();

        // TikTok visual effects overlay settings
        document.getElementById('visual_mode').value = config.visual_mode || 'premium_stage';

        // Toaster mode
        console.log('?? [EMOJI RAIN UI] Setting toaster mode:', config.toaster_mode);
        document.getElementById('toaster_mode').checked = config.toaster_mode || false;

        // OBS HUD settings
        console.log('?? [EMOJI RAIN UI] Setting OBS HUD settings...');
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
        console.log('?? [EMOJI RAIN UI] Detected resolution preset:', detectedPreset);

        // Emoji set
        console.log('?? [EMOJI RAIN UI] Setting emoji set...');
        console.log('?? [EMOJI RAIN UI] config.emoji_set:', config.emoji_set);

        if (!config.emoji_set) {
            console.error('? [EMOJI RAIN UI] emoji_set is undefined or null!');
            config.emoji_set = ["??","??","??","??","??","??","?","??","??","??"];
        }

        if (!Array.isArray(config.emoji_set)) {
            console.error('? [EMOJI RAIN UI] emoji_set is not an array:', typeof config.emoji_set);
            console.error('? [EMOJI RAIN UI] emoji_set value:', config.emoji_set);
            config.emoji_set = ["??","??","??","??","??","??","?","??","??","??"];
        }

        document.getElementById('emoji_set').value = config.emoji_set.join(',');
        console.log('?? [EMOJI RAIN UI] Emoji set value set to:', document.getElementById('emoji_set').value);
        updateEmojiPreview();

        // Custom images
        console.log('?? [EMOJI RAIN UI] Setting custom images...');
        document.getElementById('use_custom_images').checked = config.use_custom_images || false;
        document.getElementById('image_urls').value = (config.image_urls || []).join('\n');

        // Effect
        console.log('?? [EMOJI RAIN UI] Setting effect...');
        document.getElementById('effect').value = config.effect || 'bounce';

        // Physics
        console.log('?? [EMOJI RAIN UI] Setting physics...');
        setRangeValue('physics_gravity_y', config.physics_gravity_y);
        setRangeValue('physics_air', config.physics_air);
        setRangeValue('physics_friction', config.physics_friction);
        setRangeValue('physics_restitution', config.physics_restitution);

        // Appearance
        console.log('?? [EMOJI RAIN UI] Setting appearance...');
        document.getElementById('emoji_min_size_px').value = config.emoji_min_size_px;
        document.getElementById('emoji_max_size_px').value = config.emoji_max_size_px;
        setRangeValue('emoji_rotation_speed', config.emoji_rotation_speed);
        document.getElementById('emoji_lifetime_ms').value = config.emoji_lifetime_ms;
        document.getElementById('emoji_fade_duration_ms').value = config.emoji_fade_duration_ms;
        document.getElementById('max_emojis_on_screen').value = config.max_emojis_on_screen;

        // Rate limiting
        console.log('?? [EMOJI RAIN UI] Setting rate limiting...');
        document.getElementById('rate_limit_enabled').checked = config.rate_limit_enabled || false;
        document.getElementById('rate_limit_emojis_per_second').value = config.rate_limit_emojis_per_second !== undefined ? config.rate_limit_emojis_per_second : 30;

        // Scaling rules
        console.log('?? [EMOJI RAIN UI] Setting scaling rules...');
        document.getElementById('like_count_divisor').value = config.like_count_divisor;
        document.getElementById('like_min_emojis').value = config.like_min_emojis;
        document.getElementById('like_max_emojis').value = config.like_max_emojis;
        document.getElementById('gift_base_emojis').value = config.gift_base_emojis;
        setRangeValue('gift_coin_multiplier', config.gift_coin_multiplier);
        document.getElementById('gift_max_emojis').value = config.gift_max_emojis;

        // Geschenk-Kugeln
        console.log('?? [EMOJI RAIN UI] Setting gift ball configuration...');
        document.getElementById('gift_balls_enabled').checked = config.gift_balls_enabled === true;
        document.getElementById('gift_ball_min_size_px').value = config.gift_ball_min_size_px || 44;
        document.getElementById('gift_ball_max_size_px').value = config.gift_ball_max_size_px || 128;
        document.getElementById('gift_ball_price_reference_coins').value = config.gift_ball_price_reference_coins || 1000;
        document.getElementById('gift_ball_min_despawn_ms').value = config.gift_ball_min_despawn_ms || 9000;
        document.getElementById('gift_ball_max_despawn_ms').value = config.gift_ball_max_despawn_ms || 20000;
        document.getElementById('gift_ball_despawn_per_coin_ms').value = config.gift_ball_despawn_per_coin_ms || 25;
        document.getElementById('gift_ball_despawn_multiplier').value = config.gift_ball_despawn_multiplier || 1;
        document.getElementById('gift_ball_base_count').value = config.gift_ball_base_count || 1;
        document.getElementById('gift_ball_series_count_divisor').value = config.gift_ball_series_count_divisor || 3;
        document.getElementById('gift_ball_max_count').value = config.gift_ball_max_count || 24;

        // Gift ball price-tier sizing
        console.log('?? [EMOJI RAIN UI] Setting gift ball tier sizing...');
        document.getElementById('gift_ball_tier_thresholds_enabled').checked = config.gift_ball_tier_thresholds_enabled === true;
        document.getElementById('gift_ball_tier_size_1').value = config.gift_ball_tier_size_1 ?? 44;
        document.getElementById('gift_ball_tier_size_2').value = config.gift_ball_tier_size_2 ?? 80;
        document.getElementById('gift_ball_tier_size_3').value = config.gift_ball_tier_size_3 ?? 150;
        document.getElementById('gift_ball_tier_size_4').value = config.gift_ball_tier_size_4 ?? 300;
        document.getElementById('gift_ball_tier_size_5').value = config.gift_ball_tier_size_5 ?? 700;
        document.getElementById('gift_ball_tier_size_6').value = config.gift_ball_tier_size_6 ?? 5000;

        // Herzballons
        console.log('🎨 [EMOJI RAIN UI] Setting Herzballons configuration...');
        document.getElementById('heart_balloons_enabled').checked = config.heart_balloons_enabled !== false;
        document.getElementById('heart_balloon_like_divisor').value = config.heart_balloon_like_divisor || 1;
        document.getElementById('heart_balloon_min_hearts').value = config.heart_balloon_min_hearts || 1;
        document.getElementById('heart_balloon_max_hearts').value = config.heart_balloon_max_hearts || 24;
        document.getElementById('heart_balloon_profile_every').value = config.heart_balloon_profile_every || 5;
        setRangeValue('heart_balloon_pop_y', config.heart_balloon_pop_y !== undefined ? config.heart_balloon_pop_y : 0.5);
        setRangeValue('heart_balloon_wind_strength', config.heart_balloon_wind_strength !== undefined ? config.heart_balloon_wind_strength : 0.45);
        document.getElementById('heart_balloon_test_count').value = config.heart_balloon_test_count || 8;

        // Sticker rain configuration
        console.log('?? [EMOJI RAIN UI] Setting sticker rain configuration...');
        document.getElementById('sticker_enabled').checked = config.sticker_enabled !== false;
        document.getElementById('sticker_base_count').value = config.sticker_base_count || 5;
        document.getElementById('sticker_fan_level_multiplier').value = config.sticker_fan_level_multiplier || 3;
        document.getElementById('sticker_max_count').value = config.sticker_max_count || 30;
        document.getElementById('sticker_user_cooldown_ms').value = config.sticker_user_cooldown_ms || 10000;
        document.getElementById('sticker_superfan_cooldown_ms').value = config.sticker_superfan_cooldown_ms || 5000;
        document.getElementById('sticker_superfan_burst_enabled').checked = config.sticker_superfan_burst_enabled !== false;

        // Wind simulation
        console.log('?? [EMOJI RAIN UI] Setting wind simulation...');
        document.getElementById('wind_enabled').checked = config.wind_enabled || false;
        setRangeValue('wind_strength', config.wind_strength !== undefined ? config.wind_strength : 50);
        document.getElementById('wind_direction').value = config.wind_direction || 'auto';

        // Bounce physics
        console.log('?? [EMOJI RAIN UI] Setting bounce physics...');
        document.getElementById('floor_enabled').checked = config.floor_enabled !== false;
        setRangeValue('bounce_height', config.bounce_height !== undefined ? config.bounce_height : 0.6);
        setRangeValue('bounce_damping', config.bounce_damping !== undefined ? config.bounce_damping : 0.1);

        // Color theme
        console.log('?? [EMOJI RAIN UI] Setting color theme...');
        document.getElementById('color_mode').value = config.color_mode || 'off';
        setRangeValue('color_intensity', config.color_intensity !== undefined ? config.color_intensity : 0.5);

        // Rainbow mode
        console.log('?? [EMOJI RAIN UI] Setting rainbow mode...');
        document.getElementById('rainbow_enabled').checked = config.rainbow_enabled || false;
        setRangeValue('rainbow_speed', config.rainbow_speed !== undefined ? config.rainbow_speed : 1.0);

        // Pixel mode
        console.log('?? [EMOJI RAIN UI] Setting pixel mode...');
        document.getElementById('pixel_enabled').checked = config.pixel_enabled || false;
        setRangeValue('pixel_size', config.pixel_size !== undefined ? config.pixel_size : 4);

        // SuperFan burst
        console.log('?? [EMOJI RAIN UI] Setting SuperFan burst...');
        document.getElementById('superfan_burst_enabled').checked = config.superfan_burst_enabled !== false;
        setRangeValue('superfan_burst_intensity', config.superfan_burst_intensity !== undefined ? config.superfan_burst_intensity : 3.0);
        document.getElementById('superfan_burst_duration').value = config.superfan_burst_duration || 2000;

        // FPS optimization
        console.log('?? [EMOJI RAIN UI] Setting FPS optimization...');
        document.getElementById('fps_optimization_enabled').checked = config.fps_optimization_enabled !== false;
        setRangeValue('fps_sensitivity', config.fps_sensitivity !== undefined ? config.fps_sensitivity : 0.8);
        document.getElementById('target_fps_optimization').value = config.target_fps || 60;

        console.log('? [EMOJI RAIN UI] UI update completed successfully');
    } catch (error) {
        console.error('? [EMOJI RAIN UI] Error updating UI:', error);
        console.error('? [EMOJI RAIN UI] Error stack:', error.stack);
        showNotification('Fehler beim Aktualisieren der UI', true);
    }
}

function setRangeValue(id, value) {
    const input = document.getElementById(id);
    const valueDisplay = document.getElementById(id + '_value');
    
    // Check if elements exist before accessing them
    if (!input) {
        console.warn(`?? [EMOJI RAIN UI] Element with id "${id}" not found`);
        return;
    }
    
    input.value = value;
    
    if (valueDisplay) {
        valueDisplay.textContent = value;
    } else {
        console.warn(`?? [EMOJI RAIN UI] Value display element "${id}_value" not found`);
    }
}

// Save configuration
async function saveConfig() {
    const imageUrlsText = document.getElementById('image_urls').value;
    const imageUrls = imageUrlsText.split('\n').map(url => url.trim()).filter(url => url);

    const newConfig = {
        enabled: document.getElementById('enabled-toggle').checked,
        visual_mode: document.getElementById('visual_mode').value,
        pupcid_defaults_version: 1,
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
        // Rate limiting
        rate_limit_enabled: document.getElementById('rate_limit_enabled').checked,
        rate_limit_emojis_per_second: parseInt(document.getElementById('rate_limit_emojis_per_second').value),
        // Scaling rules
        like_count_divisor: parseInt(document.getElementById('like_count_divisor').value),
        like_min_emojis: parseInt(document.getElementById('like_min_emojis').value),
        like_max_emojis: parseInt(document.getElementById('like_max_emojis').value),
        gift_base_emojis: parseInt(document.getElementById('gift_base_emojis').value),
        gift_coin_multiplier: parseFloat(document.getElementById('gift_coin_multiplier').value),
        gift_max_emojis: parseInt(document.getElementById('gift_max_emojis').value),
        // Geschenk-Kugeln
        gift_balls_enabled: document.getElementById('gift_balls_enabled').checked,
        gift_ball_min_size_px: parseInt(document.getElementById('gift_ball_min_size_px').value),
        gift_ball_max_size_px: parseInt(document.getElementById('gift_ball_max_size_px').value),
        gift_ball_price_reference_coins: parseInt(document.getElementById('gift_ball_price_reference_coins').value),
        gift_ball_min_despawn_ms: parseInt(document.getElementById('gift_ball_min_despawn_ms').value),
        gift_ball_max_despawn_ms: parseInt(document.getElementById('gift_ball_max_despawn_ms').value),
        gift_ball_despawn_per_coin_ms: parseFloat(document.getElementById('gift_ball_despawn_per_coin_ms').value),
        gift_ball_despawn_multiplier: parseFloat(document.getElementById('gift_ball_despawn_multiplier').value),
        gift_ball_base_count: parseInt(document.getElementById('gift_ball_base_count').value),
        gift_ball_series_count_divisor: parseInt(document.getElementById('gift_ball_series_count_divisor').value),
        gift_ball_max_count: parseInt(document.getElementById('gift_ball_max_count').value),
        gift_ball_tier_thresholds_enabled: document.getElementById('gift_ball_tier_thresholds_enabled').checked,
        gift_ball_tier_size_1: parseInt(document.getElementById('gift_ball_tier_size_1').value),
        gift_ball_tier_size_2: parseInt(document.getElementById('gift_ball_tier_size_2').value),
        gift_ball_tier_size_3: parseInt(document.getElementById('gift_ball_tier_size_3').value),
        gift_ball_tier_size_4: parseInt(document.getElementById('gift_ball_tier_size_4').value),
        gift_ball_tier_size_5: parseInt(document.getElementById('gift_ball_tier_size_5').value),
        gift_ball_tier_size_6: parseInt(document.getElementById('gift_ball_tier_size_6').value),
        // Herzballons
        heart_balloons_enabled: document.getElementById('heart_balloons_enabled').checked,
        heart_balloon_like_divisor: parseInt(document.getElementById('heart_balloon_like_divisor').value),
        heart_balloon_min_hearts: parseInt(document.getElementById('heart_balloon_min_hearts').value),
        heart_balloon_max_hearts: parseInt(document.getElementById('heart_balloon_max_hearts').value),
        heart_balloon_profile_every: parseInt(document.getElementById('heart_balloon_profile_every').value),
        heart_balloon_pop_y: parseFloat(document.getElementById('heart_balloon_pop_y').value),
        heart_balloon_wind_strength: parseFloat(document.getElementById('heart_balloon_wind_strength').value),
        heart_balloon_test_count: parseInt(document.getElementById('heart_balloon_test_count').value),
        // Sticker rain configuration
        sticker_enabled: document.getElementById('sticker_enabled').checked,
        sticker_base_count: parseInt(document.getElementById('sticker_base_count').value),
        sticker_fan_level_multiplier: parseInt(document.getElementById('sticker_fan_level_multiplier').value),
        sticker_max_count: parseInt(document.getElementById('sticker_max_count').value),
        sticker_user_cooldown_ms: parseInt(document.getElementById('sticker_user_cooldown_ms').value),
        sticker_superfan_cooldown_ms: parseInt(document.getElementById('sticker_superfan_cooldown_ms').value),
        sticker_superfan_burst_enabled: document.getElementById('sticker_superfan_burst_enabled').checked
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
        showNotification('Bitte warten, Test l�uft bereits...', true);
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

async function testHeartBalloons() {
    try {
        const response = await fetch('/api/webgpu-emoji-rain/test-heart-balloons', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                count: parseInt(document.getElementById('heart_balloon_test_count').value) || 8,
                username: 'Herzballons Test'
            })
        });

        const data = await response.json();

        if (data.success) {
            showNotification('Herzballons gespawnt!');
        } else {
            showNotification('Fehler beim Herzballons-Test: ' + data.error, true);
        }
    } catch (error) {
        showNotification('Netzwerkfehler beim Herzballons-Test', true);
        console.error(error);
    }
}

async function testGiftBall() {
    try {
        const response = await fetch('/api/webgpu-emoji-rain/test-gift-ball', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                giftName: 'Test Gift',
                price: parseInt(document.getElementById('gift_ball_price_reference_coins').value, 10) || 100,
                username: 'Geschenk Test'
            })
        });

        const data = await response.json();

        if (data.success) {
            showNotification('Geschenk-Kugel gespawnt!');
        } else {
            showNotification('Fehler beim Geschenk-Kugel-Test: ' + data.error, true);
        }
    } catch (error) {
        showNotification('Netzwerkfehler beim Geschenk-Kugel-Test', true);
        console.error(error);
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
        showNotification('Bitte w�hle mindestens eine Datei aus', true);
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
                deleteBtn.title = 'L�schen';
                deleteBtn.textContent = '�';

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
    if (!confirm(`Bild "${filename}" wirklich l�schen?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/webgpu-emoji-rain/images/${filename}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            showNotification('Bild gel�scht!');

            // Remove URL from textarea
            const currentUrls = document.getElementById('image_urls').value.split('\n');
            const urlToRemove = `/uploads/webgpu-emoji-rain/${filename}`;
            const newUrls = currentUrls.filter(url => url.trim() !== urlToRemove);
            document.getElementById('image_urls').value = newUrls.join('\n');

            // Reload image list
            await loadUploadedImages();
        } else {
            showNotification('Fehler beim L�schen: ' + data.error, true);
        }
    } catch (error) {
        showNotification('Netzwerkfehler beim L�schen', true);
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
        // Check if using profile picture marker
        if (emoji === '{{profilePicture}}') {
            emojiSpan.textContent = '??? Profilbild';
            emojiSpan.style.fontSize = '1em';
            emojiSpan.style.fontStyle = 'italic';
        } else {
            emojiSpan.textContent = emoji;
            emojiSpan.style.fontSize = '1.5em';
        }

        info.appendChild(usernameSpan);
        info.appendChild(emojiSpan);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'danger';
        deleteBtn.textContent = '??? L�schen';
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
    const useProfilePicture = document.getElementById('use_profile_picture').checked;
    const emoji = useProfilePicture ? '{{profilePicture}}' : document.getElementById('new_user_emoji').value.trim();

    if (!username) {
        showNotification('Bitte Benutzername angeben', true);
        return;
    }

    if (!useProfilePicture && !emoji) {
        showNotification('Bitte Emoji angeben oder Profilbild-Option aktivieren', true);
        return;
    }

    userEmojiMappings[username] = emoji;
    await saveUserEmojiMappings();

    document.getElementById('new_user_name').value = '';
    document.getElementById('new_user_emoji').value = '';
    document.getElementById('use_profile_picture').checked = false;
}

// Delete user emoji mapping
async function deleteUserMapping(username) {
    if (!confirm(`Zuordnung f�r "${username}" wirklich l�schen?`)) {
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
    console.log('?? [EMOJI RAIN UI] Initializing Emoji Rain UI...');

    loadConfig();
    loadUploadedImages();
    loadUserEmojiMappings();

    console.log('? [EMOJI RAIN UI] Initialization started');

    // ========== EVENT LISTENERS (CSP-compliant) ==========

    // Enable/disable toggle
    document.getElementById('enabled-toggle').addEventListener('change', onEnabledToggleChange);

    // Resolution preset selector
    document.getElementById('obs_hud_preset').addEventListener('change', applyResolutionPreset);

    // Visual mode selector
    document.getElementById('visual_mode').addEventListener('change', applyVisualModePreset);

    // Upload images button
    document.getElementById('upload-images-btn').addEventListener('click', uploadImages);

    // Save config button
    document.getElementById('save-config-btn').addEventListener('click', saveConfig);

    // Test emoji rain button
    document.getElementById('test-emoji-rain-btn').addEventListener('click', testEmojiRain);

    // Test gift ball button
    document.getElementById('test-gift-ball-btn').addEventListener('click', testGiftBall);

    // Test heart balloons button
    document.getElementById('test-heart-balloons-btn').addEventListener('click', testHeartBalloons);

    // Emoji set input
    document.getElementById('emoji_set').addEventListener('input', updateEmojiPreview);

    // User emoji mapping
    document.getElementById('add-user-mapping-btn').addEventListener('click', addUserMapping);
    document.getElementById('user_filter').addEventListener('input', renderUserEmojiMappings);
    
    // Profile picture checkbox - disable/enable emoji input
    document.getElementById('use_profile_picture').addEventListener('change', (e) => {
        const emojiInput = document.getElementById('new_user_emoji');
        if (e.target.checked) {
            emojiInput.disabled = true;
            emojiInput.placeholder = 'Profilbild wird verwendet';
        } else {
            emojiInput.disabled = false;
            emojiInput.placeholder = '??';
        }
    });

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
