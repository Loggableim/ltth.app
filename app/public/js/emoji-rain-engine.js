/**
 * EmojiRain Engine - Enhanced physics-based emoji rain with advanced features
 * CSP-Compliant - No inline scripts or event handlers
 * 
 * Features:
 * - Gift-triggered rain with flow integration
 * - SuperFan burst mode
 * - Per-user emoji selection
 * - Wind simulation
 * - Bounce physics with configurable floor
 * - Color themes (Warm, Cool, Neon, Pastel)
 * - Rainbow mode
 * - Retro pixel mode
 * - Dynamic FPS optimization
 */

// Matter.js aliases
const Engine = Matter.Engine;
const Render = Matter.Render;
const World = Matter.World;
const Bodies = Matter.Bodies;
const Body = Matter.Body;
const Events = Matter.Events;

// Enhanced Configuration with new features
let config = {
    enabled: true,
    emoji_set: ["💧","💙","💚","💜","❤️","🩵","✨","🌟","🔥","🎉"],
    use_custom_images: false,
    image_urls: [],
    effect: 'bounce',
    visual_mode: 'pupcid_balanced',
    pupcid_defaults_version: 1,
    
    // Toaster Mode (Low-End PC Mode)
    toaster_mode: false, // When enabled, reduces resource usage significantly
    
    // Physics
    physics_gravity_y: 0.9,
    physics_air: 0.03,
    physics_friction: 0.12,
    physics_restitution: 0.55,
    
    // Wind Simulation
    wind_enabled: false,
    wind_strength: 50, // 0-100
    wind_direction: 'auto', // 'auto', 'left', 'right'
    
    // Bounce Physics
    bounce_enabled: true,
    bounce_height: 0.55, // Same as restitution
    bounce_damping: 0.18,
    floor_enabled: true,
    
    // Emoji Appearance
    emoji_min_size_px: 36,
    emoji_max_size_px: 72,
    emoji_rotation_speed: 0.04,
    emoji_lifetime_ms: 7000,
    emoji_fade_duration_ms: 900,
    max_emojis_on_screen: 160,
    
    // Color Theme
    color_mode: 'cool', // 'off', 'warm', 'cool', 'neon', 'pastel'
    color_intensity: 0.35, // 0-1
    
    // Rainbow Mode
    rainbow_enabled: false,
    rainbow_speed: 1.0, // Speed of hue rotation
    
    // Pixel Mode
    pixel_enabled: false,
    pixel_size: 4, // 1-10
    
    // FPS Optimization
    fps_optimization_enabled: true,
    fps_sensitivity: 0.8, // 0-1, higher = more aggressive
    target_fps: 30,
    adaptive_resolution_enabled: true,
    adaptive_resolution_min_fps: 25,
    adaptive_resolution_target_fps: 30,
    adaptive_resolution_max_scale: 1,
    adaptive_resolution_min_scale: 0.6,
    adaptive_resolution_step_down: 0.08,
    adaptive_resolution_step_up: 0.04,
    adaptive_resolution_cooldown_ms: 1500,
    
    // SuperFan Burst
    superfan_burst_enabled: true,
    superfan_burst_intensity: 3.0,
    superfan_burst_duration: 2000,
    
    // Rate Limiting Queue
    rate_limit_enabled: true,
    rate_limit_emojis_per_second: 24,
    
    // Scaling rules
    like_count_divisor: 25,
    like_min_emojis: 1,
    like_max_emojis: 8,
    gift_base_emojis: 4,
    gift_coin_multiplier: 0.08,
    gift_max_emojis: 36,

    // Gift balls
    gift_balls_enabled: false,
    gift_ball_min_size_px: 44,
    gift_ball_max_size_px: 128,
    gift_ball_price_reference_coins: 1000,
    gift_ball_min_despawn_ms: 5000,
    gift_ball_max_despawn_ms: 20000,
    gift_ball_despawn_per_coin_ms: 25,
    gift_ball_despawn_multiplier: 1,

    // Herzballons
    heart_balloons_enabled: true,
    heart_balloon_like_divisor: 1,
    heart_balloon_min_hearts: 5,
    heart_balloon_max_hearts: 16,
    heart_balloon_profile_every: 5,
    heart_balloon_pop_y: 0.5,
    heart_balloon_wind_strength: 0.45,
    heart_balloon_test_count: 8
};

// Toaster mode presets - applied when toaster_mode is enabled
// NOTE: Keep in sync with TOASTER_MODE_PRESETS in emoji-rain-obs-hud.js
const TOASTER_MODE_PRESETS = {
    max_emojis_on_screen: 50,        // Reduced from 200
    target_fps: 30,                   // Reduced from 60
    emoji_min_size_px: 30,            // Slightly smaller for performance
    emoji_max_size_px: 60,            // Slightly smaller for performance
    emoji_rotation_speed: 0,          // Disable rotation for performance
    wind_enabled: false,              // Disable wind simulation
    rainbow_enabled: false,           // Disable rainbow mode
    pixel_enabled: false,             // Disable pixel mode
    color_mode: 'off',                // Disable color filters
    enable_glow: false,               // Disable glow effects
    enable_particles: false,          // Disable particle effects
    enable_depth: false,              // Disable depth/shadow effects
    superfan_burst_intensity: 1.5,    // Reduced burst intensity
    like_max_emojis: 10,              // Reduced max emojis per like
    gift_max_emojis: 25               // Reduced max emojis per gift
};

// Store original config values before toaster mode
let originalConfigValues = {};

// User emoji mappings
let userEmojiMap = {};

// State
let engine, render;
let socket;
let emojis = [];
let heartBalloons = [];
let emojiBodyMap = new Map(); // Map physics bodies to emoji objects for fast lookup
let windForce = 0;
let debugMode = false;
let ground, leftWall, rightWall;
let canvasWidth, canvasHeight;

const OVERLAY_LAYER_ALIASES = {
    all: 'all',
    default: 'all',
    combined: 'all',
    full: 'all',
    alle: 'all',
    komplett: 'all',
    emoji: 'emoji',
    emojis: 'emoji',
    emojiregen: 'emoji',
    hearts: 'hearts',
    heart: 'hearts',
    'heart-balloons': 'hearts',
    herzballons: 'hearts',
    herzen: 'hearts',
    gifts: 'gifts',
    gift: 'gifts',
    'gift-balls': 'gifts',
    geschenkeregen: 'gifts',
    geschenke: 'gifts',
    'emoji-gifts': 'emoji-gifts',
    'emoji-gift': 'emoji-gifts',
    'emojis-gifts': 'emoji-gifts',
    'emojiregen-geschenkeregen': 'emoji-gifts',
    'emojiregen-geschenke': 'emoji-gifts',
    'emoji-geschenke': 'emoji-gifts'
};

const OVERLAY_LAYER_PERMISSIONS = {
    all: ['emoji', 'hearts', 'gifts'],
    emoji: ['emoji'],
    hearts: ['hearts'],
    gifts: ['gifts'],
    'emoji-gifts': ['emoji', 'gifts']
};

let overlayLayer = detectOverlayLayer();

function normalizeOverlayLayer(value) {
    const raw = String(value || '').trim().toLowerCase().replace(/_/g, '-');
    if (!raw) return 'all';

    if (raw.includes(',') || raw.includes('+')) {
        const parts = raw.split(/[,+]/).map(part => normalizeOverlayLayer(part));
        const hasEmoji = parts.includes('emoji');
        const hasGifts = parts.includes('gifts');
        const hasHearts = parts.includes('hearts');
        if (hasEmoji && hasGifts && !hasHearts) return 'emoji-gifts';
        if (hasEmoji && hasGifts && hasHearts) return 'all';
    }

    return OVERLAY_LAYER_ALIASES[raw] || 'all';
}

function detectOverlayLayer() {
    const params = new window.URLSearchParams(window.location.search || '');
    const explicitLayer = params.get('layer') || params.get('layers') || params.get('mode');
    if (explicitLayer) {
        return normalizeOverlayLayer(explicitLayer);
    }

    const pathParts = (window.location.pathname || '').split('/').filter(Boolean);
    const obsIndex = pathParts.indexOf('obs-hud');
    if (obsIndex >= 0 && pathParts[obsIndex + 1]) {
        return normalizeOverlayLayer(pathParts[obsIndex + 1]);
    }

    return 'all';
}

function overlayAllowsEventCategory(category) {
    const allowedCategories = OVERLAY_LAYER_PERMISSIONS[overlayLayer] || OVERLAY_LAYER_PERMISSIONS.all;
    return allowedCategories.includes(category);
}

// FPS tracking
let lastUpdateTime = performance.now();
let frameCount = 0;
let cleanupFrameCounter = 0;  // Periodic cleanup counter (every 60 frames)
const CLEANUP_INTERVAL = 60;  // Clean up removed emojis every 60 frames
let currentFPS = 60;
let fpsUpdateTime = performance.now();
let fpsHistory = [];
const FPS_HISTORY_SIZE = 60;
const COLOR_UPDATE_THROTTLE_MS = 100; // Throttle non-rainbow color updates for performance
let adaptiveRenderScale = 1;
let lastAdaptiveResolutionUpdate = 0;

// Freeze detection and failsafe
let freezeDetectionEnabled = true; // Can be disabled for debugging
let frozenFrameCount = 0; // Count consecutive frames with 0 FPS
const MAX_FROZEN_FRAMES = 3; // Reload after 3 consecutive seconds of 0 FPS
let freezeWarningShown = false;

// Rate limiting for spawn events to prevent overwhelming the system
let spawnQueue = [];
let lastSpawnTime = 0;
const MIN_SPAWN_INTERVAL_MS = 50; // Minimum 50ms between spawn batches
const MAX_SPAWN_QUEUE_SIZE = 100; // Maximum queued spawn events

// Rate limiting queue - tracks emojis spawned per second
let rateLimitQueue = []; // Stores individual emoji spawn requests
let emojisSpawnedThisSecond = 0;
let secondStartTime = performance.now();
const MAX_RATE_LIMIT_QUEUE_SIZE = 500; // BUG 11 fix: prevent unbounded rateLimitQueue growth

// Physics constants
const WALL_THICKNESS = 100; // Wall thickness in pixels (must match createBoundaries)
const WIND_FORCE_MULTIPLIER = 300; // Force multiplier for wind (strength/100 × this value)
const WIND_AUTO_VARIATION = 0.2; // Variation factor for auto wind mode (0-1, higher = more random)

// Rainbow animation state
let rainbowHueOffset = 0;

// Performance state
let performanceMode = 'normal'; // 'normal', 'reduced', 'minimal'
let adaptivePerformanceTier = 'normal'; // 'normal', 'reduced', 'minimal'

// Toaster mode state
let toasterModeActive = false;

/**
 * Apply toaster mode settings for low-end PCs
 * Reduces resource usage by limiting effects and emoji count
 */
function applyToasterMode() {
    if (toasterModeActive) return; // Already applied
    
    console.log('🍞 [TOASTER MODE] Activating toaster mode for low-end PCs...');
    
    // Store original values before applying toaster mode
    for (const key of Object.keys(TOASTER_MODE_PRESETS)) {
        if (config[key] !== undefined) {
            originalConfigValues[key] = config[key];
        }
    }
    
    // Apply toaster mode presets
    Object.assign(config, TOASTER_MODE_PRESETS);
    toasterModeActive = true;
    
    // Remove any existing expensive CSS effects
    document.body.classList.add('toaster-mode');
    
    console.log('🍞 [TOASTER MODE] Active - Settings applied:');
    console.log(`   - Max emojis: ${config.max_emojis_on_screen}`);
    console.log(`   - Target FPS: ${config.target_fps}`);
    console.log(`   - Rotation: ${config.emoji_rotation_speed === 0 ? 'disabled' : 'enabled'}`);
    console.log(`   - Wind: ${config.wind_enabled ? 'enabled' : 'disabled'}`);
    console.log(`   - Effects: minimal`);
}

/**
 * Remove toaster mode and restore original settings
 */
function removeToasterMode() {
    if (!toasterModeActive) return; // Not active
    
    console.log('🍞 [TOASTER MODE] Deactivating toaster mode...');
    
    // Restore original values
    for (const key of Object.keys(originalConfigValues)) {
        config[key] = originalConfigValues[key];
    }
    
    originalConfigValues = {};
    toasterModeActive = false;
    
    // Remove CSS class
    document.body.classList.remove('toaster-mode');
    
    console.log('🍞 [TOASTER MODE] Deactivated - Original settings restored');
}

/**
 * Check if toaster mode is currently active
 */
function isToasterModeActive() {
    return toasterModeActive;
}

/**
 * Initialize physics engine
 */
function initPhysics() {
    canvasWidth = window.innerWidth;
    canvasHeight = window.innerHeight;
    
    // Ensure canvas dimensions are valid
    if (canvasWidth <= 0 || isNaN(canvasWidth)) {
        console.warn(`⚠️ Invalid canvasWidth: ${canvasWidth}, using 1920 as fallback`);
        canvasWidth = 1920;
    }
    if (canvasHeight <= 0 || isNaN(canvasHeight)) {
        console.warn(`⚠️ Invalid canvasHeight: ${canvasHeight}, using 1080 as fallback`);
        canvasHeight = 1080;
    }

    engine = Engine.create({
        enableSleeping: false
    });

    engine.gravity.y = config.physics_gravity_y;

    // Create boundaries
    createBoundaries();

    // Listen for collisions
    Events.on(engine, 'collisionStart', handleCollision);

    console.log(`✅ Physics initialized at ${canvasWidth}x${canvasHeight}`);
}

/**
 * Create world boundaries (floor and walls)
 */
function createBoundaries() {
    const thickness = WALL_THICKNESS;
    
    // Ground (floor)
    ground = Bodies.rectangle(
        canvasWidth / 2,
        canvasHeight + thickness / 2,
        canvasWidth + thickness * 2,
        thickness,
        {
            isStatic: true,
            friction: config.physics_friction,
            restitution: config.bounce_height,
            label: 'ground'
        }
    );

    // Walls
    leftWall = Bodies.rectangle(
        -thickness / 2,
        canvasHeight / 2,
        thickness,
        canvasHeight + thickness * 2,
        {
            isStatic: true,
            friction: config.physics_friction,
            restitution: config.bounce_height
        }
    );

    rightWall = Bodies.rectangle(
        canvasWidth + thickness / 2,
        canvasHeight / 2,
        thickness,
        canvasHeight + thickness * 2,
        {
            isStatic: true,
            friction: config.physics_friction,
            restitution: config.bounce_height
        }
    );

    // Only add ground if floor is enabled
    if (config.floor_enabled) {
        World.add(engine.world, [ground, leftWall, rightWall]);
    } else {
        World.add(engine.world, [leftWall, rightWall]);
    }
}

/**
 * Handle collision events
 */
function handleCollision(event) {
    if (config.effect === 'none') return;

    event.pairs.forEach(pair => {
        if (pair.bodyA.label === 'ground' || pair.bodyB.label === 'ground') {
            const emojiBody = pair.bodyA.label === 'ground' ? pair.bodyB : pair.bodyA;
            // Use Map for O(1) lookup instead of O(n) find
            const emoji = emojiBodyMap.get(emojiBody);
            
            // Allow bounce effect to trigger multiple times, but rate-limit to avoid excessive triggers
            const now = performance.now();
            if (emoji && !emoji.removed) {
                // Only trigger bounce if enough time has passed since last bounce (prevent spam)
                if (!emoji.lastBounceTime || now - emoji.lastBounceTime > 300) {
                    emoji.lastBounceTime = now;
                }
            }
        }
    });
}

/**
 * Trigger bounce/bubble animation
 */
function triggerBounceEffect(emoji) {
    if (!emoji.element || config.effect === 'none') return;

    const impactProfile = emoji.visualProfile || getVisualStageProfile(
        emoji.spawnKind || 'default',
        emoji.size,
        emoji.isBurst
    );
    const bounceDuration = impactProfile.emphasis === 'gift' || impactProfile.emphasis === 'superfan'
        ? 520
        : (impactProfile.emphasis === 'sticker' ? 460 : 400);
    emoji.impactScale = Math.max(emoji.impactScale || 1, impactProfile.pulseScale || 1.08);
    
    // Both 'bounce' and 'bubble' effects use the same bubbleBlop animation
    // The difference is in the physics settings, not the animation
    
    // Reset animation to trigger it again properly
    emoji.element.style.animation = 'none';
    // Force reflow
    void emoji.element.offsetWidth;
    emoji.element.style.animation = `bubbleBlop ${bounceDuration}ms cubic-bezier(0.68, -0.55, 0.265, 1.55)`;
    
    // Clean up animation after it completes
    if (emoji.bounceAnimationTimeout) {
        clearTimeout(emoji.bounceAnimationTimeout);
    }
    emoji.bounceAnimationTimeout = setTimeout(() => {
        if (emoji.element && !emoji.removed) {
            emoji.element.style.animation = '';
            emoji.impactScale = 1;
        }
        emoji.bounceAnimationTimeout = null;
    }, bounceDuration);
}

/**
 * Resize canvas and physics world
 */
function resizeCanvas() {
    const newWidth = window.innerWidth;
    const newHeight = window.innerHeight;

    if (newWidth === canvasWidth && newHeight === canvasHeight) return;

    canvasWidth = newWidth;
    canvasHeight = newHeight;

    updateBoundaries();

    console.log(`📐 Canvas resized to ${canvasWidth}x${canvasHeight}`);
}

/**
 * Update world boundaries
 */
function updateBoundaries() {
    const thickness = WALL_THICKNESS;

    // Update positions and sizes without creating new vertices (prevents memory leak)
    Body.setPosition(ground, {
        x: canvasWidth / 2,
        y: canvasHeight + thickness / 2
    });
    
    Body.setPosition(leftWall, {
        x: -thickness / 2,
        y: canvasHeight / 2
    });

    Body.setPosition(rightWall, {
        x: canvasWidth + thickness / 2,
        y: canvasHeight / 2
    });
    
    // Only update vertices if dimensions changed significantly
    // This reduces the memory allocation overhead
    const currentGroundWidth = ground.bounds.max.x - ground.bounds.min.x;
    const targetGroundWidth = canvasWidth + thickness * 2;
    
    if (Math.abs(currentGroundWidth - targetGroundWidth) > 10) {
        Body.setVertices(ground, Bodies.rectangle(0, 0, canvasWidth + thickness * 2, thickness).vertices);
        Body.setVertices(leftWall, Bodies.rectangle(0, 0, thickness, canvasHeight + thickness * 2).vertices);
        Body.setVertices(rightWall, Bodies.rectangle(0, 0, thickness, canvasHeight + thickness * 2).vertices);
    }
}

/**
 * Calculate wind force based on configuration
 */
function calculateWindForce() {
    if (!config.wind_enabled) {
        return 0;
    }

    // Wind force needs to overcome emoji mass (typically 10-50 for density 0.01, radius 20-40)
    // Force = mass × acceleration. For visible effect, we need ~3-10 px/s² acceleration
    // At strength 50: force 150 gives ~5 px/s² for average emoji (mass ~30)
    // At strength 100: force 300 gives ~10 px/s² for average emoji
    const maxWindForce = (config.wind_strength / 100) * WIND_FORCE_MULTIPLIER;
    
    if (config.wind_direction === 'left') {
        return -maxWindForce;
    } else if (config.wind_direction === 'right') {
        return maxWindForce;
    } else {
        // Auto mode - add variation with smoother changes
        windForce += (Math.random() - 0.5) * maxWindForce * WIND_AUTO_VARIATION;
        windForce = Math.max(-maxWindForce, Math.min(maxWindForce, windForce));
        return windForce;
    }
}

/**
 * Apply color filter based on theme
 */
function applyColorTheme(element, emoji = null) {
    // Build the color filter
    let colorFilter = '';
    
    // Check for user-specific color first
    if (emoji && emoji.userColor) {
        colorFilter = `hue-rotate(${emoji.userColor}deg)`;
    } else if (config.rainbow_enabled) {
        // Rainbow takes precedence
        const hue = rainbowHueOffset % 360;
        colorFilter = `hue-rotate(${hue}deg)`;
    } else if (config.color_mode !== 'off') {
        const intensity = config.color_intensity;
        
        switch (config.color_mode) {
            case 'warm':
                colorFilter = `sepia(${intensity * 0.8}) saturate(${1 + intensity * 0.5}) brightness(${1 + intensity * 0.2})`;
                break;
            case 'cool':
                colorFilter = `hue-rotate(180deg) saturate(${1 + intensity}) brightness(${0.9 + intensity * 0.1})`;
                break;
            case 'neon':
                colorFilter = `saturate(${2 + intensity * 2}) brightness(${1.2 + intensity * 0.3}) contrast(${1.2})`;
                break;
            case 'pastel':
                colorFilter = `saturate(${0.5 + intensity * 0.3}) brightness(${1.1 + intensity * 0.2})`;
                break;
        }
    }
    
    // Store the color filter for later combination
    element.setAttribute('data-color-filter', colorFilter);
    
    // Combine with pixel filter if it exists
    combineFilters(element);
}

/**
 * Apply pixel effect
 */
function applyPixelEffect(element) {
    let pixelFilter = '';
    
    if (config.pixel_enabled) {
        // For images, use image-rendering on the img element
        const img = element.querySelector('img');
        if (img) {
            img.style.imageRendering = 'pixelated';
        } else {
            // For text emojis, apply filter-based pixelation
            const pixelAmount = config.pixel_size || 4;
            
            // Constants for pixel effect tuning
            const PIXEL_BLUR_MULTIPLIER = 0.5; // Adjust blur intensity based on pixel size
            const PIXEL_CONTRAST = 2; // Contrast boost for pixelation effect
            
            // The blur creates the pixelation, we adjust based on pixel_size
            const blurAmount = pixelAmount * PIXEL_BLUR_MULTIPLIER;
            
            pixelFilter = `blur(${blurAmount}px) contrast(${PIXEL_CONTRAST})`;
        }
    } else {
        // Clear image-rendering when pixel mode is disabled
        const img = element.querySelector('img');
        if (img) {
            img.style.imageRendering = '';
        }
    }
    
    // Store the pixel filter for later combination
    element.setAttribute('data-pixel-filter', pixelFilter);
    
    // Combine with color filter if it exists
    combineFilters(element);
}

/**
 * Combine color and pixel filters
 */
function combineFilters(element) {
    const colorFilter = element.getAttribute('data-color-filter') || '';
    const pixelFilter = element.getAttribute('data-pixel-filter') || '';
    const visualFilter = element.getAttribute('data-visual-filter') || '';
    
    // Combine both filters
    const filters = [colorFilter, pixelFilter, visualFilter].filter(f => f).join(' ');
    element.style.filter = filters;
}

function syncVisualModeState() {
    if (!document.body) {
        return;
    }

    document.body.dataset.visualMode = config.visual_mode || 'premium_stage';
    document.body.dataset.toasterMode = config.toaster_mode ? 'true' : 'false';
}

function clampRenderScale(value) {
    return clamp(value, config.adaptive_resolution_min_scale || 0.6, config.adaptive_resolution_max_scale || 1);
}

function getAdaptiveRenderScale() {
    return adaptiveRenderScale;
}

function setAdaptiveRenderScale(nextScale, force = false) {
    const minScale = config.adaptive_resolution_min_scale || 0.6;
    const maxScale = config.adaptive_resolution_max_scale || 1;
    const clamped = clamp(nextScale, minScale, maxScale);

    if (!force && Math.abs(clamped - adaptiveRenderScale) < 0.01) {
        return adaptiveRenderScale;
    }

    adaptiveRenderScale = clamped;
    document.body?.style?.setProperty('--emoji-rain-render-scale', adaptiveRenderScale.toFixed(3));
    return adaptiveRenderScale;
}

function quantizeForAdaptiveRender(value) {
    const scale = getAdaptiveRenderScale();
    if (!Number.isFinite(value) || scale >= 0.995) {
        return value;
    }

    return Math.round(value * scale) / scale;
}

function updateAdaptiveResolution(currentFPSValue) {
    if (!config.adaptive_resolution_enabled) {
        setAdaptiveRenderScale(1);
        return;
    }

    const now = performance.now();
    if (now - lastAdaptiveResolutionUpdate < (config.adaptive_resolution_cooldown_ms || 1500)) {
        return;
    }

    const targetFPS = config.adaptive_resolution_target_fps || 30;
    const minFPS = config.adaptive_resolution_min_fps || 25;
    const minScale = config.adaptive_resolution_min_scale || 0.6;
    const maxScale = config.adaptive_resolution_max_scale || 1;
    const downwardThreshold = targetFPS;
    const upwardThreshold = Math.max(targetFPS + 3, targetFPS * 1.1);

    if (currentFPSValue < minFPS) {
        setAdaptiveRenderScale(Math.max(minScale, adaptiveRenderScale - (config.adaptive_resolution_step_down || 0.08)));
        lastAdaptiveResolutionUpdate = now;
        applyAdaptivePerformanceTier('minimal');
        return;
    }

    if (currentFPSValue < downwardThreshold) {
        setAdaptiveRenderScale(Math.max(minScale, adaptiveRenderScale - (config.adaptive_resolution_step_down || 0.08)));
        lastAdaptiveResolutionUpdate = now;
        applyAdaptivePerformanceTier(getAdaptivePerformanceTier(currentFPSValue));
        return;
    }

    if (currentFPSValue > upwardThreshold && adaptiveRenderScale < maxScale) {
        setAdaptiveRenderScale(Math.min(maxScale, adaptiveRenderScale + (config.adaptive_resolution_step_up || 0.04)));
        lastAdaptiveResolutionUpdate = now;
        applyAdaptivePerformanceTier(getAdaptivePerformanceTier(currentFPSValue));
        return;
    }

    if (currentFPSValue >= targetFPS && adaptiveRenderScale !== maxScale) {
        setAdaptiveRenderScale(Math.min(maxScale, adaptiveRenderScale + (config.adaptive_resolution_step_up || 0.04)));
        lastAdaptiveResolutionUpdate = now;
        applyAdaptivePerformanceTier(getAdaptivePerformanceTier(currentFPSValue));
    }
}

function getAdaptivePerformanceTier(currentFPSValue) {
    const targetFPS = config.adaptive_resolution_target_fps || 30;
    const minFPS = config.adaptive_resolution_min_fps || 25;

    if (currentFPSValue < minFPS || adaptiveRenderScale <= (config.adaptive_resolution_min_scale || 0.6) + 0.01) {
        return 'minimal';
    }

    if (currentFPSValue < targetFPS || adaptiveRenderScale < 0.9) {
        return 'reduced';
    }

    return 'normal';
}

function applyAdaptivePerformanceTier(nextTier) {
    if (!nextTier || nextTier === adaptivePerformanceTier) {
        return;
    }

    adaptivePerformanceTier = nextTier;
    if (document.body) {
        document.body.dataset.adaptivePerformanceTier = nextTier;
    }

    const isReduced = nextTier === 'reduced' || nextTier === 'minimal';
    const isMinimal = nextTier === 'minimal';

    config.enable_glow = !isReduced;
    config.enable_particles = !isMinimal;
    config.enable_depth = !isReduced;

    if (isReduced) {
        config.rate_limit_emojis_per_second = Math.min(config.rate_limit_emojis_per_second || 24, 18);
        config.max_emojis_on_screen = Math.min(config.max_emojis_on_screen, isMinimal ? 36 : 48);
        config.gift_max_emojis = Math.min(config.gift_max_emojis, isMinimal ? 18 : 24);
        config.like_max_emojis = Math.min(config.like_max_emojis, isMinimal ? 4 : 6);
    }

    if (isMinimal) {
        config.wind_enabled = false;
        config.rainbow_enabled = false;
        config.color_mode = 'off';
        config.heart_balloon_profile_every = Math.max(8, config.heart_balloon_profile_every || 5);
        config.heart_balloon_max_hearts = Math.min(config.heart_balloon_max_hearts || 16, 10);
        config.heart_balloon_wind_strength = Math.min(config.heart_balloon_wind_strength || 0.45, 0.2);
        config.heart_balloon_pop_y = Math.min(config.heart_balloon_pop_y || 0.5, 0.42);
        config.gift_ball_max_count = Math.min(config.gift_ball_max_count || 24, 10);
    }
}

function getDampedSpawnCount(baseCount, kind = 'default') {
    const safeBase = Math.max(1, Math.floor(Number(baseCount) || 1));
    let multiplier = 1;

    if (adaptivePerformanceTier === 'reduced') {
        multiplier = kind === 'gift' ? 0.8 : 0.7;
    } else if (adaptivePerformanceTier === 'minimal') {
        multiplier = kind === 'gift' ? 0.5 : 0.45;
    }

    return Math.max(1, Math.floor(safeBase * multiplier));
}

function determineSpawnKind(data = {}, isBurst = false) {
    const reason = String(data.reason || data.source || '').toLowerCase();
    const mode = String(data.mode || data.type || '').toLowerCase();

    if (mode === 'gift-balls') {
        return 'gift';
    }

    if (mode === 'heart-balloons') {
        return 'heart';
    }

    if (reason.includes('sticker')) {
        return isBurst ? 'superfan' : 'sticker';
    }

    if (reason.includes('gift')) {
        return isBurst ? 'superfan' : 'gift';
    }

    if (reason.includes('like')) {
        return isBurst ? 'superfan' : 'like';
    }

    if (reason.includes('heart')) {
        return 'heart';
    }

    if (reason.includes('follow')) {
        return 'follow';
    }

    if (reason.includes('share')) {
        return 'share';
    }

    if (reason.includes('subscribe')) {
        return 'subscribe';
    }

    if (isBurst || data.burst) {
        return 'superfan';
    }

    return 'default';
}

function getVisualStageProfile(spawnKind, size, isBurst) {
    const premiumStage = config.visual_mode === 'premium_stage';
    const toasterMode = Boolean(config.toaster_mode);
    const safeSize = Number.isFinite(Number(size)) ? Number(size) : 48;

    let profile = {
        layer: safeSize >= 68 ? 'foreground' : (safeSize < 42 ? 'background' : 'mid'),
        emphasis: 'default',
        opacity: 0.92,
        scale: safeSize >= 68 ? 1.05 : (safeSize < 42 ? 0.9 : 0.98),
        blur: safeSize < 42 ? 0.5 : 0,
        shadowBlur: safeSize >= 68 ? 16 : 12,
        glowBlur: safeSize >= 68 ? 20 : 14,
        shadowColor: 'rgba(0, 0, 0, 0.28)',
        glowColor: 'rgba(255, 255, 255, 0.18)',
        saturation: 1.02,
        brightness: 1.0,
        trailCount: safeSize >= 68 ? 8 : 4,
        trailRadius: safeSize >= 68 ? 18 : 12,
        pulseScale: isBurst ? 1.16 : 1.08,
        premiumStage,
        toasterMode
    };

    switch (spawnKind) {
        case 'gift':
            profile = {
                ...profile,
                layer: 'foreground',
                emphasis: 'gift',
                opacity: 1,
                scale: 1.08,
                shadowBlur: 18,
                glowBlur: 28,
                shadowColor: 'rgba(72, 42, 0, 0.36)',
                glowColor: 'rgba(255, 214, 138, 0.78)',
                trailCount: 10,
                trailRadius: 24,
                pulseScale: isBurst ? 1.22 : 1.14
            };
            break;
        case 'superfan':
            profile = {
                ...profile,
                layer: 'foreground',
                emphasis: 'superfan',
                opacity: 1,
                scale: 1.09,
                shadowBlur: 20,
                glowBlur: 34,
                shadowColor: 'rgba(96, 72, 10, 0.38)',
                glowColor: 'rgba(255, 222, 120, 0.95)',
                trailCount: 12,
                trailRadius: 26,
                pulseScale: 1.26
            };
            break;
        case 'sticker':
            profile = {
                ...profile,
                layer: 'mid',
                emphasis: 'sticker',
                opacity: 0.98,
                scale: 1.02,
                shadowBlur: 14,
                glowBlur: 22,
                shadowColor: 'rgba(13, 45, 74, 0.34)',
                glowColor: 'rgba(100, 215, 255, 0.66)',
                trailCount: 8,
                trailRadius: 18,
                pulseScale: 1.16
            };
            break;
        case 'like':
            profile = {
                ...profile,
                layer: 'mid',
                emphasis: 'like',
                opacity: 0.9,
                scale: 0.96,
                shadowBlur: 12,
                glowBlur: 16,
                shadowColor: 'rgba(58, 10, 31, 0.24)',
                glowColor: 'rgba(255, 105, 180, 0.54)',
                trailCount: 6,
                trailRadius: 14,
                pulseScale: 1.1
            };
            break;
        case 'heart':
            profile = {
                ...profile,
                layer: 'foreground',
                emphasis: 'heart',
                opacity: 1,
                scale: 1.03,
                shadowBlur: 14,
                glowBlur: 24,
                shadowColor: 'rgba(87, 14, 43, 0.3)',
                glowColor: 'rgba(255, 86, 144, 0.7)',
                trailCount: 8,
                trailRadius: 16,
                pulseScale: 1.14
            };
            break;
        case 'follow':
        case 'share':
        case 'subscribe':
            profile = {
                ...profile,
                layer: 'mid',
                emphasis: spawnKind,
                opacity: 0.94,
                scale: 0.98,
                glowBlur: 18,
                trailCount: 5,
                trailRadius: 14
            };
            break;
        default:
            break;
    }

    if (!premiumStage) {
        profile.opacity *= 0.97;
        profile.glowBlur *= 0.8;
        profile.trailCount = Math.max(2, Math.round(profile.trailCount * 0.8));
        profile.trailRadius = Math.max(8, Math.round(profile.trailRadius * 0.8));
    }

    if (toasterMode) {
        profile.opacity = Math.min(profile.opacity, 0.92);
        profile.scale = Math.min(profile.scale, 1.02);
        profile.blur = 0;
        profile.shadowBlur = 6;
        profile.glowBlur = 0;
        profile.trailCount = 0;
        profile.trailRadius = 0;
        profile.pulseScale = 1.05;
    }

    if (adaptivePerformanceTier === 'reduced') {
        profile.glowBlur = 0;
        profile.shadowBlur = Math.min(profile.shadowBlur, 6);
        profile.trailCount = Math.max(0, Math.floor(profile.trailCount * 0.4));
        profile.trailRadius = Math.max(0, Math.floor(profile.trailRadius * 0.5));
        profile.brightness = Math.min(profile.brightness, 1.04);
    } else if (adaptivePerformanceTier === 'minimal') {
        profile.glowBlur = 0;
        profile.shadowBlur = 0;
        profile.trailCount = 0;
        profile.trailRadius = 0;
        profile.blur = 0;
        profile.brightness = Math.min(profile.brightness, 0.98);
        profile.saturation = Math.min(profile.saturation, 1);
    }

    return profile;
}

function applyVisualPresentation(element, emojiObj) {
    if (!element || !emojiObj) {
        return;
    }

    const profile = emojiObj.visualProfile || getVisualStageProfile(
        emojiObj.spawnKind || 'default',
        emojiObj.size,
        emojiObj.isBurst
    );

    emojiObj.visualProfile = profile;
    element.dataset.visualMode = config.visual_mode || 'premium_stage';
    element.dataset.emphasis = profile.emphasis;
    element.dataset.layer = profile.layer;
    element.dataset.burst = emojiObj.isBurst ? 'true' : 'false';
    element.classList.toggle('premium-stage-sprite', profile.premiumStage);

    const visualFilters = [];
    if (profile.blur > 0) {
        visualFilters.push(`blur(${profile.blur}px)`);
    }
    if (profile.shadowBlur > 0) {
        visualFilters.push(`drop-shadow(0 ${Math.max(1, Math.round(profile.shadowBlur / 4))}px ${profile.shadowBlur}px ${profile.shadowColor})`);
    }
    if (profile.glowBlur > 0) {
        visualFilters.push(`drop-shadow(0 0 ${profile.glowBlur}px ${profile.glowColor})`);
    }
    visualFilters.push(`saturate(${profile.saturation}) brightness(${profile.brightness})`);

    element.setAttribute('data-visual-filter', visualFilters.join(' '));
    element.style.opacity = String(profile.opacity);
    element.style.setProperty('--emoji-base-scale', String(profile.scale));
    element.style.setProperty('--emoji-layer', profile.layer);
    element.style.setProperty('--emoji-trail-count', String(profile.trailCount));

    combineFilters(element);
}

function ensureHeartBalloonStyles() {
    if (document.getElementById('heart-balloon-styles')) {
        return;
    }

    const style = document.createElement('style');
    style.id = 'heart-balloon-styles';
    style.textContent = `
        .heart-balloon {
            position: absolute;
            left: 0;
            top: 0;
            pointer-events: none;
            user-select: none;
            transform-origin: center bottom;
            will-change: transform, opacity;
        }
        .heart-balloon-bubble {
            position: relative;
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--heart-color, #ff4d8d);
            font-family: "Segoe UI Symbol", "Apple Color Emoji", sans-serif;
            font-weight: 800;
            line-height: 1;
            text-shadow: 0 3px 10px rgba(0,0,0,0.24), 0 0 12px rgba(255,255,255,0.22);
            filter: none;
        }
        .heart-balloon-bubble::after {
            content: "";
            position: absolute;
            inset: 10% 14%;
            border-radius: 50%;
            background:
                radial-gradient(circle at 34% 28%, rgba(255,255,255,0.54), rgba(255,255,255,0.18) 22%, transparent 48%),
                radial-gradient(circle at 50% 58%, color-mix(in srgb, var(--heart-color, #ff4d8d) 88%, white 12%), var(--heart-color, #ff4d8d) 58%, color-mix(in srgb, var(--heart-color, #ff4d8d) 62%, black 38%) 100%);
            clip-path: path('M 50 88 C 12 63 7 36 25 22 C 35 14 47 14 50 24 C 53 14 65 14 75 22 C 93 36 88 63 50 88 Z');
            box-shadow: inset 0 0 0 2px rgba(255,255,255,0.1);
            pointer-events: none;
        }
        .heart-balloon-profile {
            border-radius: 50%;
            overflow: hidden;
            border: 4px solid var(--heart-color, #ff4d8d);
            background: rgba(255,255,255,0.85);
            box-shadow: 0 0 0 3px rgba(255,255,255,0.35), 0 8px 18px rgba(0,0,0,0.28);
        }
        .heart-balloon-profile img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
        }
        .heart-balloon-string {
            position: absolute;
            left: 50%;
            top: 82%;
            width: 1px;
            height: 42%;
            background: linear-gradient(to bottom, rgba(255,255,255,0.72), rgba(255,255,255,0));
            transform: translateX(-50%);
            opacity: 0.85;
        }
        .heart-balloon.popping {
            opacity: 0;
        }
        .heart-balloon-fragment {
            position: absolute;
            left: 50%;
            top: 50%;
            width: 10%;
            height: 10%;
            border-radius: 50%;
            background: var(--heart-color, #ff4d8d);
            animation: heartBalloonFragment 360ms ease-out forwards;
        }
        @keyframes heartBalloonPop {
            0% { opacity: 1; scale: 1; }
            55% { opacity: 0.95; scale: 1.32; }
            100% { opacity: 0; scale: 0.1; }
        }
        @keyframes heartBalloonFragment {
            to {
                opacity: 0;
                transform: translate(var(--dx), var(--dy)) scale(0.2);
            }
        }
    `;
    document.head.appendChild(style);
}

function ensureGiftBallStyles() {
    if (document.getElementById('gift-ball-styles')) {
        return;
    }

    const style = document.createElement('style');
    style.id = 'gift-ball-styles';
    style.textContent = `
        .gift-ball {
            width: var(--gift-ball-size, 72px);
            height: var(--gift-ball-size, 72px);
            border-radius: 50%;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
            background:
                radial-gradient(circle at 30% 24%, rgba(255,255,255,0.86), rgba(255,255,255,0.22) 28%, rgba(255,255,255,0.06) 55%),
                rgba(255,255,255,0.2);
            border: 2px solid rgba(255,255,255,0.72);
            box-shadow: 0 10px 22px rgba(0,0,0,0.32), inset 0 -8px 18px rgba(0,0,0,0.16), inset 0 8px 16px rgba(255,255,255,0.34);
            pointer-events: none;
            user-select: none;
        }
        .gift-ball img {
            width: 78%;
            height: 78%;
            object-fit: contain;
            display: block;
            filter: drop-shadow(0 4px 8px rgba(0,0,0,0.28));
        }
    `;
    document.head.appendChild(style);
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function normalizeCanvasX(x, size) {
    const minMargin = Math.max(24, size * 0.55);
    const safeWidth = Math.max(1, canvasWidth - minMargin * 2);

    if (typeof x === 'number' && x >= 0 && x <= 1) {
        return minMargin + x * safeWidth;
    }

    if (typeof x === 'number' && isFinite(x)) {
        return clamp(x, minMargin, canvasWidth - minMargin);
    }

    return minMargin + Math.random() * safeWidth;
}

function normalizeCanvasY(y, size) {
    const minY = -size;
    const maxY = canvasHeight + size;

    if (typeof y === 'number' && isFinite(y)) {
        if (y >= 0 && y <= 1) {
            return y * canvasHeight;
        }

        return clamp(y, minY, maxY);
    }

    return 0;
}

function calculateOffsetY(y, index, size) {
    const baseY = normalizeCanvasY(y, size);
    return clamp(baseY - index * 5, -size, canvasHeight + size);
}

function createHeartBalloonElement(size, color, profilePictureUrl, username, useProfilePicture) {
    const element = document.createElement('div');
    element.className = 'heart-balloon';
    element.style.width = size + 'px';
    element.style.height = size + 'px';
    element.style.setProperty('--heart-color', color);
    element.dataset.visualMode = config.visual_mode || 'premium_stage';
    element.dataset.emphasis = 'heart';
    element.dataset.layer = 'foreground';
    element.classList.toggle('premium-stage-sprite', config.visual_mode === 'premium_stage');

    const bubble = document.createElement('div');
    bubble.className = 'heart-balloon-bubble';
    bubble.style.fontSize = size + 'px';

    if (useProfilePicture && profilePictureUrl) {
        bubble.classList.add('heart-balloon-profile');
        const img = document.createElement('img');
        img.src = profilePictureUrl;
        img.alt = username || 'viewer';
        img.onerror = () => {
            bubble.classList.remove('heart-balloon-profile');
            bubble.textContent = '\u2665';
        };
        bubble.appendChild(img);
    } else {
        bubble.textContent = '\u2665';
    }

    const string = document.createElement('div');
    string.className = 'heart-balloon-string';

    element.appendChild(bubble);
    element.appendChild(string);
    document.getElementById('canvas-container').appendChild(element);

    return element;
}

function spawnHeartBalloon(data, index) {
    ensureHeartBalloonStyles();

    const baseSize = config.emoji_min_size_px + Math.random() * (config.emoji_max_size_px - config.emoji_min_size_px);
    const size = clamp(baseSize * 1.05, 34, 96);
    const profileEvery = Math.max(1, parseInt(data.profileEvery || config.heart_balloon_profile_every || 5, 10));
    const useProfilePicture = !!data.profilePictureUrl && (index + 1) % profileEvery === 0;
    const jitter = (Math.random() - 0.5) * 0.28;
    const sourceX = typeof data.x === 'number' ? clamp(data.x + jitter, 0.02, 0.98) : Math.random();
    const x = normalizeCanvasX(sourceX, size);
    const y = canvasHeight + size + Math.random() * 32;
    const popRatio = clamp(
        typeof data.popY === 'number' ? data.popY : (config.heart_balloon_pop_y || 0.5),
        0.25,
        0.75
    );
    const color = data.heartColor || '#ff4d8d';
    const element = createHeartBalloonElement(size, color, data.profilePictureUrl, data.username, useProfilePicture);

    const balloon = {
        element,
        x,
        y,
        baseX: x,
        size,
        color,
        username: data.username || null,
        profilePictureUrl: data.profilePictureUrl || null,
        useProfilePicture,
        speed: canvasHeight / (250 + Math.random() * 80),
        windStrength: typeof data.windStrength === 'number' ? data.windStrength : (config.heart_balloon_wind_strength || 0.45),
        windVelocity: (Math.random() - 0.5) * 0.7,
        phase: Math.random() * Math.PI * 2,
        sway: 18 + Math.random() * 26,
        popY: canvasHeight * popRatio + (Math.random() - 0.5) * canvasHeight * 0.08,
        spawnTime: performance.now(),
        popping: false,
        removed: false
    };

    heartBalloons.push(balloon);
    updateHeartBalloonElement(balloon, performance.now());
}

function spawnHeartBalloons(data) {
    if (config.heart_balloons_enabled === false) {
        return;
    }

    const requestedCount = parseInt(data.count || 1, 10);
    const safeCount = Number.isFinite(requestedCount) ? requestedCount : 1;
    const count = Math.max(1, Math.min(getDampedSpawnCount(safeCount, 'heart'), config.heart_balloon_max_hearts || 24));

    for (let i = 0; i < count; i++) {
        setTimeout(() => {
            spawnHeartBalloon(data, i);
        }, i * 95);
    }
}

function createGiftBallElement(size, giftImageUrl, giftName) {
    const element = document.createElement('div');
    element.className = 'emoji-sprite gift-ball';
    element.style.setProperty('--gift-ball-size', size + 'px');
    element.style.width = size + 'px';
    element.style.height = size + 'px';
    element.style.position = 'absolute';
    element.style.left = '0';
    element.style.top = '0';
    element.style.visibility = 'hidden';
    element.dataset.visualMode = config.visual_mode || 'premium_stage';
    element.dataset.emphasis = 'gift';
    element.dataset.layer = 'foreground';
    element.classList.toggle('premium-stage-sprite', config.visual_mode === 'premium_stage');

    if (giftImageUrl) {
        const img = document.createElement('img');
        img.src = giftImageUrl;
        img.alt = giftName || 'Gift';
        img.onerror = () => {
            img.style.display = 'none';
            element.textContent = '🎁';
            element.style.fontSize = Math.round(size * 0.62) + 'px';
        };
        element.appendChild(img);
    } else {
        element.textContent = '🎁';
        element.style.fontSize = Math.round(size * 0.62) + 'px';
    }

    document.getElementById('canvas-container').appendChild(element);
    return element;
}

function getGiftBallDropCount(data) {
    const requestedCount = parseInt(data.count || 1, 10);
    const safeCount = Number.isFinite(requestedCount) ? requestedCount : 1;
    const configuredMax = parseInt(config.gift_ball_max_count || config.max_count_per_event || 24, 10);
    const maxCount = Math.max(1, Number.isFinite(configuredMax) ? configuredMax : 24);
    return Math.max(1, Math.min(safeCount, maxCount));
}

function spreadGiftBallX(baseX, index, count) {
    if (typeof baseX !== 'number' || !Number.isFinite(baseX)) {
        return Math.random();
    }

    if (count <= 1) {
        return clamp(baseX + (Math.random() - 0.5) * 0.08, 0.02, 0.98);
    }

    const spread = Math.min(0.42, Math.max(0.1, count * 0.018));
    const rowOffset = (index / (count - 1) - 0.5) * spread;
    const jitter = (Math.random() - 0.5) * 0.08;
    return clamp(baseX + rowOffset + jitter, 0.02, 0.98);
}

function spawnGiftBalls(data) {
    const count = getDampedSpawnCount(getGiftBallDropCount(data), 'gift');
    const baseX = typeof data.x === 'number' ? data.x : Math.random();
    const baseY = typeof data.y === 'number' ? data.y : null;

    for (let i = 0; i < count; i++) {
        const requestedSize = parseFloat(data.size || config.gift_ball_min_size_px || 44);
        const size = Number.isFinite(requestedSize) ? requestedSize : 44;
        spawnGiftBall({
            ...data,
            x: spreadGiftBallX(baseX, i, count),
            y: baseY === null ? -size - i * Math.max(6, size * 0.18) : baseY
        });
    }
}

function spawnGiftBall(data) {
    ensureGiftBallStyles();

    if (!canvasWidth || canvasWidth <= 0 || isNaN(canvasWidth)) {
        canvasWidth = window.innerWidth || 1920;
    }
    if (!canvasHeight || canvasHeight <= 0 || isNaN(canvasHeight)) {
        canvasHeight = window.innerHeight || 1080;
    }

    const minSize = Math.max(12, parseInt(config.gift_ball_min_size_px || 44, 10));
    const maxSize = Math.max(minSize, parseInt(config.gift_ball_max_size_px || 128, 10));
    const tierThresholdsEnabled = config.gift_ball_tier_thresholds_enabled === true;
    const requestedSize = parseFloat(data.size || minSize);
    const safeRequested = Number.isFinite(requestedSize) ? requestedSize : minSize;
    // When tier thresholds are enabled, the server already chose the exact size
    // for the matching price band — honour it instead of clamping it back down
    // to the legacy min/max range. We still enforce a hard floor of 12 px to
    // avoid 0/negative physics radii.
    const size = tierThresholdsEnabled
        ? Math.max(12, safeRequested)
        : clamp(safeRequested, minSize, maxSize);
    const x = normalizeCanvasX(typeof data.x === 'number' ? data.x : Math.random(), size);
    const y = normalizeCanvasY(typeof data.y === 'number' ? data.y : -size, size);
    const radius = size / 2;

    const body = Bodies.circle(x, y, radius, {
        label: 'gift-ball',
        friction: Math.max(0.08, config.physics_friction),
        restitution: Math.max(0.62, config.bounce_height || config.physics_restitution || 0.62),
        density: 0.012,
        frictionAir: Math.max(0.01, config.physics_air)
    });

    Body.setVelocity(body, {
        x: (Math.random() - 0.5) * 3,
        y: 1 + Math.random() * 2.4
    });

    World.add(engine.world, body);

    const element = createGiftBallElement(size, data.giftImageUrl, data.giftName);
    void element.offsetHeight;
    element.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
    element.style.visibility = 'visible';

    const minDespawn = Math.max(1000, parseInt(config.gift_ball_min_despawn_ms || 9000, 10));
    const maxDespawn = Math.max(minDespawn, parseInt(config.gift_ball_max_despawn_ms || 20000, 10));
    const requestedDespawn = parseInt(data.despawnMs || minDespawn, 10);
    const despawnMs = clamp(Number.isFinite(requestedDespawn) ? requestedDespawn : minDespawn, minDespawn, maxDespawn);
    const giftBall = {
        body,
        element,
        emoji: data.giftName || 'Gift',
        size,
        rotation: 0,
        spawnTime: performance.now(),
        fading: false,
        removed: false,
        lastBounceTime: 0,
        username: data.username || null,
        userColor: null,
        lastColorUpdate: performance.now(),
        giftBall: true,
        giftName: data.giftName || null,
        giftImageUrl: data.giftImageUrl || null,
        price: data.price || null,
        despawnMs
    };

    emojis.push(giftBall);
    emojiBodyMap.set(body, giftBall);

    giftBall.giftDespawnTimeout = setTimeout(() => {
        fadeOutEmoji(giftBall);
        giftBall.giftDespawnTimeout = null;
    }, despawnMs);

    return giftBall;
}

function updateHeartBalloonElement(balloon, currentTime) {
    if (!balloon.element || balloon.removed) {
        return;
    }

    const elapsed = currentTime - balloon.spawnTime;
    const sway = Math.sin(elapsed * 0.0024 + balloon.phase) * balloon.sway;
    const bob = Math.sin(elapsed * 0.006 + balloon.phase) * 5;
    const rotate = Math.sin(elapsed * 0.002 + balloon.phase) * 7;
    const scale = balloon.useProfilePicture ? 0.92 : 1;
    const renderX = quantizeForAdaptiveRender(balloon.x + sway);
    const renderY = quantizeForAdaptiveRender(balloon.y + bob);

    balloon.element.style.transform = `translate3d(${renderX}px, ${renderY}px, 0) translate(-50%, -50%) rotate(${rotate}deg) scale(${scale})`;
}

function updateHeartBalloons(currentTime, deltaTime) {
    if (heartBalloons.length === 0) {
        return;
    }

    const frameFactor = Math.min(3, deltaTime / 16.67);

    heartBalloons.forEach(balloon => {
        if (balloon.removed || balloon.popping) {
            return;
        }

        balloon.y -= balloon.speed * frameFactor;
        balloon.windVelocity += (Math.random() - 0.5) * balloon.windStrength * 0.08 * frameFactor;
        balloon.windVelocity *= 0.985;
        balloon.x = clamp(balloon.x + balloon.windVelocity * frameFactor, balloon.size * 0.45, canvasWidth - balloon.size * 0.45);

        updateHeartBalloonElement(balloon, currentTime);

        if (balloon.y <= balloon.popY) {
            popHeartBalloon(balloon);
        }
    });

    // Periodic cleanup: only filter every CLEANUP_INTERVAL frames to avoid per-frame array allocations
    if (cleanupFrameCounter % CLEANUP_INTERVAL === 0) {
        heartBalloons = heartBalloons.filter(balloon => !balloon.removed);
    }

    while (heartBalloons.length > config.max_emojis_on_screen) {
        removeHeartBalloon(heartBalloons[0]);
        heartBalloons = heartBalloons.filter(balloon => !balloon.removed);
    }
}

function popHeartBalloon(balloon) {
    if (balloon.popping || balloon.removed) {
        return;
    }

    balloon.popping = true;

    if (balloon.element) {
        const currentTransform = balloon.element.style.transform || '';
        balloon.element.classList.add('popping');
        balloon.element.style.transition = 'opacity 360ms ease-out, transform 360ms ease-out';
        balloon.element.style.transform = currentTransform;
        void balloon.element.offsetWidth;
        balloon.element.style.opacity = '0';
        balloon.element.style.transform = `${currentTransform} scale(0.1)`;

        for (let i = 0; i < 7; i++) {
            const fragment = document.createElement('span');
            fragment.className = 'heart-balloon-fragment';
            fragment.style.setProperty('--dx', `${Math.cos((Math.PI * 2 * i) / 7) * (22 + Math.random() * 34)}px`);
            fragment.style.setProperty('--dy', `${Math.sin((Math.PI * 2 * i) / 7) * (22 + Math.random() * 34)}px`);
            balloon.element.appendChild(fragment);
        }
    }

    balloon.removeTimeout = setTimeout(() => removeHeartBalloon(balloon), 380);
}

function removeHeartBalloon(balloon) {
    if (balloon.removed) {
        return;
    }

    balloon.removed = true;

    if (balloon.removeTimeout) {
        clearTimeout(balloon.removeTimeout);
        balloon.removeTimeout = null;
    }

    if (balloon.element && balloon.element.parentNode) {
        balloon.element.parentNode.removeChild(balloon.element);
    }
    balloon.element = null;
}

/**
 * Main update loop
 */
function updateLoop(currentTime) {
    // Calculate delta time
    const deltaTime = currentTime - lastUpdateTime;
    const targetFrameTime = 1000 / config.target_fps;

    // Throttle to target FPS
    if (deltaTime < targetFrameTime) {
        requestAnimationFrame(updateLoop);
        return;
    }

    lastUpdateTime = currentTime - (deltaTime % targetFrameTime);

    // Process queued spawn events
    processSpawnQueue();
    
    // Process rate limit queue (if enabled)
    processRateLimitQueue();

    // Update FPS counter
    frameCount++;
    if (currentTime - fpsUpdateTime >= 1000) {
        currentFPS = Math.round(frameCount * 1000 / (currentTime - fpsUpdateTime));
        frameCount = 0;
        fpsUpdateTime = currentTime;
        
        // Track FPS history
        fpsHistory.push(currentFPS);
        if (fpsHistory.length > FPS_HISTORY_SIZE) {
            fpsHistory.shift();
        }
        
        // Additional safety: prevent unbounded growth
        if (fpsHistory.length > FPS_HISTORY_SIZE * 2) {
            console.warn('⚠️ FPS history array grew too large, resetting');
            fpsHistory = fpsHistory.slice(-FPS_HISTORY_SIZE);
        }
        
        // Freeze detection failsafe
        if (freezeDetectionEnabled) {
            if (currentFPS === 0) {
                frozenFrameCount++;
                
                // Show warning after first frozen frame
                if (frozenFrameCount === 1 && !freezeWarningShown) {
                    console.warn('[EmojiRain] ⚠️ FPS dropped to 0, monitoring for freeze...');
                    freezeWarningShown = true;
                }
                
                // Auto-reload after sustained freeze
                if (frozenFrameCount >= MAX_FROZEN_FRAMES) {
                    console.error(`[EmojiRain] 🔄 FPS frozen for ${MAX_FROZEN_FRAMES} seconds, auto-reloading overlay to recover...`);
                    // Show visual warning before reload
                    showFreezeWarning();
                    // Reload after 2 seconds to allow warning to be visible
                    setTimeout(() => {
                        window.location.reload();
                    }, 2000);
                    return; // Stop processing this frame
                }
            } else {
                // FPS recovered, reset freeze counter
                if (frozenFrameCount > 0) {
                    console.log(`[EmojiRain] ✅ FPS recovered (was frozen for ${frozenFrameCount}s)`);
                }
                frozenFrameCount = 0;
                freezeWarningShown = false;
            }
        }
        
        // Check if FPS optimization is needed
        if (config.fps_optimization_enabled) {
            checkAndOptimizeFPS();
        }
        updateAdaptiveResolution(currentFPS);
    }

    // Run physics engine step
    const clampedDelta = Math.min(deltaTime, targetFrameTime);
    Engine.update(engine, clampedDelta);

    // Update rainbow hue
    if (config.rainbow_enabled) {
        rainbowHueOffset = (rainbowHueOffset + config.rainbow_speed) % 360;
    }

    // Calculate wind force
    const currentWindForce = calculateWindForce();

    // Update emojis
    emojis.forEach(emoji => {
        if (emoji.body) {
            // Check if emoji has escaped the world bounds
            const pos = emoji.body.position;
            const margin = 200; // Extra margin outside canvas
            if (pos.x < -margin || pos.x > canvasWidth + margin || 
                pos.y < -margin || pos.y > canvasHeight + margin) {
                // Emoji escaped, remove it
                removeEmoji(emoji);
                return;
            }

            // Apply wind
            if (config.wind_enabled) {
                Body.applyForce(emoji.body, emoji.body.position, {
                    x: currentWindForce,
                    y: 0
                });
            }

            // Apply air resistance (clamp to [0, 1] to prevent velocity reversal)
            const velocity = emoji.body.velocity;
            const airResistance = Math.min(1, Math.max(0, config.physics_air));
            Body.setVelocity(emoji.body, {
                x: velocity.x * (1 - airResistance),
                y: velocity.y * (1 - airResistance)
            });

            // Update DOM element
            if (emoji.element) {
                const px = quantizeForAdaptiveRender(emoji.body.position.x);
                const py = quantizeForAdaptiveRender(emoji.body.position.y);
                const rotation = emoji.body.angle + emoji.rotation;
                emoji.rotation += config.emoji_rotation_speed;
                const scale = Math.max(0.72, (emoji.stageScale || 1) * (emoji.impactScale || 1));

                emoji.element.style.transform = `translate3d(${px}px, ${py}px, 0) translate(-50%, -50%) rotate(${rotation}rad) scale(${scale})`;
                if (emoji.impactScale && emoji.impactScale > 1.001) {
                    emoji.impactScale = 1 + ((emoji.impactScale - 1) * 0.86);
                }
                
                // Update color theme:
                // - Rainbow mode needs to update every frame for smooth animation
                // - Other color modes only update periodically to save performance
                if (config.rainbow_enabled) {
                    if (!emoji.giftBall) {
                        applyColorTheme(emoji.element, emoji);
                    }
                    emoji.lastColorUpdate = currentTime;
                } else if (currentTime - emoji.lastColorUpdate > COLOR_UPDATE_THROTTLE_MS) {
                    if (!emoji.giftBall) {
                        applyColorTheme(emoji.element, emoji);
                    }
                    emoji.lastColorUpdate = currentTime;
                }
            }
        }

        // Check lifetime
                const lifetimeMs = emoji.despawnMs || emoji.lifetimeMs || config.emoji_lifetime_ms;
        if (emoji.spawnTime && lifetimeMs > 0) {
            const age = currentTime - emoji.spawnTime;
            if (age > lifetimeMs && !emoji.fading) {
                fadeOutEmoji(emoji);
            }
        }
    });

    updateHeartBalloons(currentTime, deltaTime);

    // Periodic cleanup: only filter every CLEANUP_INTERVAL frames to avoid per-frame array allocations
    cleanupFrameCounter++;
    if (cleanupFrameCounter % CLEANUP_INTERVAL === 0) {
        emojis = emojis.filter(emoji => !emoji.removed);
    }

    // Limit max emojis
    while (emojis.length > config.max_emojis_on_screen) {
        const oldest = emojis[0];
        removeEmoji(oldest);
    }

    // Update debug info
    if (debugMode) {
        updateDebugInfo();
    }

    requestAnimationFrame(updateLoop);
}

/**
 * Check FPS and optimize if needed
 */
function checkAndOptimizeFPS() {
    if (fpsHistory.length < 10) return;

    const avgFPS = fpsHistory.reduce((a, b) => a + b, 0) / fpsHistory.length;
    const fpsThreshold = config.target_fps * (1 - config.fps_sensitivity);

    if (avgFPS < fpsThreshold && performanceMode === 'normal') {
        // Switch to reduced performance mode
        performanceMode = 'reduced';
        console.log(`⚡ FPS optimization: Switching to reduced mode (FPS: ${avgFPS.toFixed(1)})`);
        
        // Reduce max emojis
        config.max_emojis_on_screen = Math.floor(config.max_emojis_on_screen * 0.7);
        
        // Disable expensive effects
        if (config.pixel_enabled) config.pixel_enabled = false;
        if (config.rainbow_enabled && config.color_mode !== 'off') config.rainbow_enabled = false;
        updateAdaptiveResolution(avgFPS);
        
    } else if (avgFPS < fpsThreshold * 0.7 && performanceMode === 'reduced') {
        // Switch to minimal performance mode
        performanceMode = 'minimal';
        console.log(`⚡ FPS optimization: Switching to minimal mode (FPS: ${avgFPS.toFixed(1)})`);
        
        // Further reduce max emojis
        config.max_emojis_on_screen = Math.floor(config.max_emojis_on_screen * 0.5);
        
        // Disable all expensive effects
        config.wind_enabled = false;
        config.rainbow_enabled = false;
        config.color_mode = 'off';
        updateAdaptiveResolution(avgFPS);
        
    } else if (avgFPS > config.target_fps * 0.95 && performanceMode !== 'normal') {
        // Restore normal performance mode
        performanceMode = 'normal';
        console.log(`⚡ FPS optimization: Restoring normal mode (FPS: ${avgFPS.toFixed(1)})`);
        
        // Reload config to restore settings
        loadConfig();
        updateAdaptiveResolution(avgFPS);
    }
}

/**
 * Show freeze warning overlay before auto-reload
 */
function showFreezeWarning() {
    // Create a visual warning overlay
    const warning = document.createElement('div');
    warning.id = 'freeze-warning';
    warning.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(255, 0, 0, 0.9);
        color: white;
        padding: 30px 50px;
        border-radius: 15px;
        font-size: 24px;
        font-weight: bold;
        text-align: center;
        z-index: 10000;
        border: 3px solid white;
        box-shadow: 0 0 30px rgba(255, 0, 0, 0.8);
    `;
    warning.innerHTML = `
        <div>⚠️ OVERLAY FROZEN ⚠️</div>
        <div style="font-size: 18px; margin-top: 10px;">Auto-reloading in 2 seconds...</div>
    `;
    document.body.appendChild(warning);
}

/**
 * Spawn emoji
 */
function spawnEmoji(emoji, x, y, size, username = null, profilePictureUrl = null, color = null, spawnKind = 'default', isBurst = false, lifetimeMs = null, assetLocked = false) {
    const normalizedLifetimeMs = Number(lifetimeMs);
    // Check for user-specific emoji (try multiple username formats)
    if (username) {
        // Try exact match first
        if (userEmojiMap[username]) {
            emoji = userEmojiMap[username];
            console.log(`👤 [USER MAPPING] Found emoji for ${username}: ${emoji}`);
        } else {
            // Try case-insensitive match
            const lowerUsername = username.toLowerCase();
            const mappedUser = Object.keys(userEmojiMap).find(key => 
                key.toLowerCase() === lowerUsername
            );
            if (mappedUser) {
                emoji = userEmojiMap[mappedUser];
                console.log(`👤 [USER MAPPING] Found emoji for ${username} (case-insensitive): ${emoji}`);
            }
        }
    }

    // Check if profile picture should be used
    const useProfilePicture = emoji === '{{profilePicture}}' && profilePictureUrl;
    if (emoji === '{{profilePicture}}' && !profilePictureUrl) {
        // User has profile-picture mapping but no URL was provided - use fallback emoji
        console.warn(`⚠️ [PROFILE PICTURE] No profile picture URL for ${username}, using fallback emoji`);
        emoji = '👤';
    } else if (useProfilePicture) {
        console.log(`🖼️ [PROFILE PICTURE] Using profile picture for ${username}: ${profilePictureUrl}`);
    }

    // Safety check: ensure canvasWidth is valid before position calculations
    if (!canvasWidth || canvasWidth <= 0 || isNaN(canvasWidth)) {
        console.error(`⚠️ [SPAWN] Invalid canvasWidth: ${canvasWidth}, using fallback 1920`);
        canvasWidth = 1920;
    }
    if (!canvasHeight || canvasHeight <= 0 || isNaN(canvasHeight)) {
        console.error(`⚠️ [SPAWN] Invalid canvasHeight: ${canvasHeight}, using fallback 1080`);
        canvasHeight = 1080;
    }
    
    // Normalize x position (0-1 to px) with safety margins
    if (x >= 0 && x <= 1) {
        // Add margin from edges to prevent emojis getting stuck in walls
        // Wall extends WALL_THICKNESS/2 (50px) into the canvas on each side
        // Margin must be at least WALL_THICKNESS/2 + emoji radius to ensure
        // the emoji body doesn't overlap with the wall
        const minMargin = WALL_THICKNESS / 2 + size / 2 + 1;
        const safeWidth = canvasWidth - (minMargin * 2);
        
        // Additional safety: ensure safeWidth is positive
        if (safeWidth > 0) {
            x = minMargin + (x * safeWidth);
        } else {
            // If canvas is too small, just center it
            console.warn(`⚠️ [SPAWN] Canvas too small for margins, centering emoji`);
            x = canvasWidth / 2;
        }
    } else {
        // For absolute positions, ensure x is within safe bounds
        // Use same margin calculation as above
        const minMargin = WALL_THICKNESS / 2 + size / 2 + 1;
        const minX = minMargin;
        const maxX = canvasWidth - minMargin;
        x = Math.max(minX, Math.min(maxX, x));
    }
    
    // Ensure x and y are valid numbers
    if (isNaN(x) || !isFinite(x)) {
        console.error(`⚠️ [SPAWN] Invalid x position after calculation: ${x}, using canvasWidth/2`);
        x = canvasWidth / 2;
    }
    if (isNaN(y) || !isFinite(y)) {
        console.error(`⚠️ [SPAWN] Invalid y position: ${y}, using 0`);
        y = 0;
    }
    
    y = normalizeCanvasY(y, size);

    const stageProfile = getVisualStageProfile(spawnKind, size, isBurst);
    
    // Log spawn position only in debug mode
    if (debugMode) {
        console.log(`⚙️ [SPAWN] Spawning emoji at position (${x.toFixed(2)}, ${y.toFixed(2)}) with size ${size}`);
    }

    // Create physics body
    const radius = size / 2;
    const body = Bodies.circle(x, y, radius, {
        friction: config.physics_friction,
        restitution: config.bounce_height,
        density: 0.01,
        frictionAir: config.physics_air
    });

    if (debugMode) {
        console.log(`⚙️ [SPAWN] Created body with friction=${config.physics_friction}, restitution=${config.bounce_height}, frictionAir=${config.physics_air}`);
    }

    // Add initial velocity
    Body.setVelocity(body, {
        x: (Math.random() - 0.5) * 2,
        y: Math.random() * 2
    });

    World.add(engine.world, body);

    // Create DOM element
    const element = document.createElement('div');
    element.className = 'emoji-sprite';

    // Use custom image, profile picture, or emoji
    if (useProfilePicture) {
        // Use TikTok profile picture
        const img = document.createElement('img');
        img.src = profilePictureUrl;
        img.style.width = size + 'px';
        img.style.height = size + 'px';
        img.style.borderRadius = '50%'; // Make it circular
        img.style.objectFit = 'cover';
        
        // Handle image load errors - fallback to default emoji
        img.onerror = () => {
            console.warn(`⚠️ [PROFILE PICTURE] Failed to load profile picture for ${username}, using fallback emoji`);
            img.style.display = 'none';
            element.textContent = '👤';
            element.style.fontSize = size + 'px';
        };
        
        element.appendChild(img);
    } else if (assetLocked !== true && config.use_custom_images && config.image_urls && config.image_urls.length > 0) {
        const imageUrl = config.image_urls[Math.floor(Math.random() * config.image_urls.length)];
        const img = document.createElement('img');
        img.src = imageUrl;
        img.style.width = size + 'px';
        img.style.height = size + 'px';
        img.addEventListener('error', () => {
            console.warn(`⚠️ [CUSTOM IMAGE] Failed to load custom image: ${imageUrl}`);
            img.style.display = 'none';
            element.textContent = '✨';
            element.style.fontSize = size + 'px';
            element.style.width = `${size}px`;
            element.style.height = `${size}px`;
            element.style.textAlign = 'center';
        });
        element.appendChild(img);
    } else {
        element.textContent = emoji;
        element.style.fontSize = size + 'px';
    }

    // Set initial position styles
    element.style.position = 'absolute';
    element.style.left = '0';
    element.style.top = '0';
    // Hide element initially to prevent flash at (0,0)
    element.style.visibility = 'hidden';

    // Add to DOM first
    document.getElementById('canvas-container').appendChild(element);
    
    // Force reflow to ensure element is in DOM before applying transform
    // offsetHeight is used because it's a reliable property that triggers reflow
    // without side effects (read-only, always available, minimal performance cost)
    void element.offsetHeight;
    
    // Now apply transform and show element
    element.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(${stageProfile.scale})`;
    element.style.visibility = 'visible';

    // Track emoji
    const emojiObj = {
        body: body,
        element: element,
        emoji: emoji,
        size: size,
        rotation: 0,
        spawnTime: performance.now(),
        fading: false,
        removed: false,
        lastBounceTime: 0, // Track last bounce time to prevent spam
        username: username,
        userColor: color, // Store user-specific color if provided
        lastColorUpdate: performance.now(), // Track when color was last updated
        spawnKind: spawnKind,
        isBurst: isBurst,
        lifetimeMs: Number.isFinite(normalizedLifetimeMs) && normalizedLifetimeMs > 0
            ? normalizedLifetimeMs
            : null,
        stageScale: stageProfile.scale,
        impactScale: 1,
        visualProfile: stageProfile
    };

    emojis.push(emojiObj);
    
    // Add to body map for fast collision lookup
    emojiBodyMap.set(body, emojiObj);

    // Apply pixel effect and color theme to the new emoji element
    applyPixelEffect(element);
    applyColorTheme(element, emojiObj);
    applyVisualPresentation(element, emojiObj);
    
    return emojiObj;
}

/**
 * Fade out emoji
 */
function fadeOutEmoji(emoji) {
    if (emoji.fading || emoji.removed) return;

    emoji.fading = true;
    if (emoji.element) {
        const fadeDuration = Math.max(0, Number(config.emoji_fade_duration_ms) || 0);
        emoji.element.style.transition = `opacity ${fadeDuration}ms ease`;
        emoji.element.classList.add('fading');
    }

    // Clear any pending timeouts before setting a new one
    if (emoji.fadeTimeout) {
        clearTimeout(emoji.fadeTimeout);
    }
    
    emoji.fadeTimeout = setTimeout(() => {
        removeEmoji(emoji);
        emoji.fadeTimeout = null;
    }, config.emoji_fade_duration_ms);
}

/**
 * Remove emoji
 */
function removeEmoji(emoji) {
    if (emoji.removed) return;

    emoji.removed = true;

    // Clean up any pending timeouts to prevent memory leaks
    if (emoji.fadeTimeout) {
        clearTimeout(emoji.fadeTimeout);
        emoji.fadeTimeout = null;
    }
    if (emoji.bounceAnimationTimeout) {
        clearTimeout(emoji.bounceAnimationTimeout);
        emoji.bounceAnimationTimeout = null;
    }
    if (emoji.groundPopTimeout) {
        clearTimeout(emoji.groundPopTimeout);
        emoji.groundPopTimeout = null;
    }
    if (emoji.giftDespawnTimeout) {
        clearTimeout(emoji.giftDespawnTimeout);
        emoji.giftDespawnTimeout = null;
    }

    if (emoji.body) {
        // Remove from body map
        emojiBodyMap.delete(emoji.body);
        World.remove(engine.world, emoji.body);
        emoji.body = null;
    }

    if (emoji.element && emoji.element.parentNode) {
        emoji.element.parentNode.removeChild(emoji.element);
        emoji.element = null;
    }
}

/**
 * Handle spawn event from server
 */
function handleSpawnEvent(data) {
    if (!config.enabled) return;

    if (data.mode === 'heart-balloons' || data.type === 'heart-balloons') {
        if (overlayAllowsEventCategory('hearts')) {
            spawnHeartBalloons(data);
        }
        return;
    }

    if (data.mode === 'gift-balls' || data.type === 'gift-balls') {
        if (overlayAllowsEventCategory('gifts')) {
            spawnGiftBalls(data);
        }
        return;
    }

    if (!overlayAllowsEventCategory('emoji')) {
        return;
    }

    const count = data.count || 1;
    const emoji = data.emoji || getRandomEmoji();
    const x = data.x !== undefined ? data.x : Math.random();
    const y = data.y !== undefined ? data.y : 0;
    const username = data.username || null;
    const profilePictureUrl = data.profilePictureUrl || null;
    const isBurst = data.burst || false;
    const color = data.color || null;
    const spawnKind = determineSpawnKind(data, isBurst);
    const lifetimeMs = data.lifetimeMs;
    const assetLocked = data.assetLocked === true;

    console.log(`🌧️ [SPAWN EVENT] count=${count}, emoji=${emoji}, username=${username}, burst=${isBurst}, color=${color}, profilePictureUrl=${profilePictureUrl ? 'present' : 'none'}`);

    // Apply burst multiplier
    const actualCount = isBurst ? Math.floor(count * config.superfan_burst_intensity) : count;

    // Check if we should queue this spawn event to prevent overwhelming the system
    const now = performance.now();
    const timeSinceLastSpawn = now - lastSpawnTime;
    
    // If queue is full, warn and drop the event
    if (spawnQueue.length >= MAX_SPAWN_QUEUE_SIZE) {
        console.warn(`⚠️ [SPAWN] Queue full (${MAX_SPAWN_QUEUE_SIZE}), dropping spawn event`);
        return;
    }
    
    // If we're spawning too quickly, queue the event
    if (timeSinceLastSpawn < MIN_SPAWN_INTERVAL_MS) {
        spawnQueue.push({ emoji, x, y, actualCount, username, profilePictureUrl, color, isBurst, spawnKind, lifetimeMs, assetLocked });
        // Only log queue size every 10 events to reduce console spam
        if (spawnQueue.length % 10 === 0 || debugMode) {
            console.log(`⏸️ [SPAWN] Queued spawn event (queue size: ${spawnQueue.length})`);
        }
        return;
    }

    // Process this spawn immediately
    processSpawn(emoji, x, y, actualCount, username, profilePictureUrl, color, isBurst, spawnKind, lifetimeMs, assetLocked);
    lastSpawnTime = now;
}

/**
 * Process queued spawn events
 */
function processSpawnQueue() {
    if (spawnQueue.length === 0) return;
    
    const now = performance.now();
    const timeSinceLastSpawn = now - lastSpawnTime;
    
    // Only process queue if enough time has passed
    if (timeSinceLastSpawn >= MIN_SPAWN_INTERVAL_MS) {
        const event = spawnQueue.shift();
        processSpawn(event.emoji, event.x, event.y, event.actualCount, event.username, event.profilePictureUrl, event.color, event.isBurst, event.spawnKind, event.lifetimeMs, event.assetLocked);
        lastSpawnTime = now;
    }
}

/**
 * Calculate offsetX with safety clamping to prevent negative coordinates
 * @param {number} x - The base x coordinate
 * @returns {number} The offset x coordinate
 */
function calculateOffsetX(x) {
    if (x >= 0 && x <= 1) {
        // Normalized coordinate: Offset and clamp to 0-1 range
        return Math.max(0, Math.min(1, x + (Math.random() - 0.5) * 0.2));
    } else {
        // Absolute coordinate: Offset in pixels
        return x + (Math.random() - 0.5) * 100;
    }
}

/**
 * Process a single spawn event
 */
function processSpawn(emoji, x, y, actualCount, username, profilePictureUrl, color, isBurst, spawnKind = 'default', lifetimeMs = null, assetLocked = false) {
    // If rate limiting is enabled, add individual emojis to the rate limit queue
    if (config.rate_limit_enabled && config.rate_limit_emojis_per_second > 0) {
        // BUG 11 fix: enforce max queue size to prevent unbounded memory growth
        if (rateLimitQueue.length + actualCount > MAX_RATE_LIMIT_QUEUE_SIZE) {
            const excess = rateLimitQueue.length + actualCount - MAX_RATE_LIMIT_QUEUE_SIZE;
            console.warn(`⚠️ [RATE LIMIT] Queue near limit, dropping ${excess} oldest entries`);
            rateLimitQueue.splice(0, excess);
        }
        for (let i = 0; i < actualCount; i++) {
            const size = config.emoji_min_size_px + Math.random() * (config.emoji_max_size_px - config.emoji_min_size_px);
            const offsetX = calculateOffsetX(x);
            const offsetY = calculateOffsetY(y, i, size);
            
            rateLimitQueue.push({
                emoji,
                x: offsetX,
                y: offsetY,
                size,
                username,
                profilePictureUrl,
                color,
                spawnKind,
                isBurst,
                lifetimeMs,
                assetLocked
            });
        }
        
        if (rateLimitQueue.length > 0 && debugMode) {
            console.log(`⏱️ [RATE LIMIT] Queued ${actualCount} emojis (queue size: ${rateLimitQueue.length})`);
        }
    } else {
        // No rate limiting - spawn immediately
        for (let i = 0; i < actualCount; i++) {
            const size = config.emoji_min_size_px + Math.random() * (config.emoji_max_size_px - config.emoji_min_size_px);
            const offsetX = calculateOffsetX(x);
            const offsetY = calculateOffsetY(y, i, size);

            spawnEmoji(emoji, offsetX, offsetY, size, username, profilePictureUrl, color, spawnKind, isBurst, lifetimeMs, assetLocked);
        }

        console.log(`🌧️ Spawned ${actualCount}x ${emoji} at (${x.toFixed(2)}, ${y})${isBurst ? ' [BURST]' : ''}${username ? ' for ' + username : ''}`);
    }
}

/**
 * Get random emoji from config
 */
function getRandomEmoji() {
    if (config.emoji_set && config.emoji_set.length > 0) {
        return config.emoji_set[Math.floor(Math.random() * config.emoji_set.length)];
    }
    return '❓';
}

/**
 * Process rate limit queue - spawns emojis respecting the per-second limit
 */
function processRateLimitQueue() {
    if (!config.rate_limit_enabled || config.rate_limit_emojis_per_second <= 0) {
        return;
    }
    
    if (rateLimitQueue.length === 0) {
        return;
    }
    
    const now = performance.now();
    const timeSinceSecondStart = now - secondStartTime;
    
    // Reset counter every second
    if (timeSinceSecondStart >= 1000) {
        emojisSpawnedThisSecond = 0;
        secondStartTime = now;
    }
    
    // Calculate how many emojis we can spawn this frame
    const maxEmojisPerSecond = config.rate_limit_emojis_per_second;
    const emojisAvailable = maxEmojisPerSecond - emojisSpawnedThisSecond;
    
    if (emojisAvailable <= 0) {
        // Rate limit reached for this second
        return;
    }
    
    // Spawn as many emojis as we're allowed
    const emojisToSpawn = Math.min(emojisAvailable, rateLimitQueue.length);
    
    for (let i = 0; i < emojisToSpawn; i++) {
        const emojiData = rateLimitQueue.shift();
        spawnEmoji(
            emojiData.emoji,
            emojiData.x,
            emojiData.y,
            emojiData.size,
            emojiData.username,
            emojiData.profilePictureUrl,
            emojiData.color,
            emojiData.spawnKind,
            emojiData.isBurst,
            emojiData.lifetimeMs,
            emojiData.assetLocked
        );
        emojisSpawnedThisSecond++;
    }
    
    if (debugMode && emojisToSpawn > 0) {
        console.log(`⏱️ [RATE LIMIT] Spawned ${emojisToSpawn} emojis (${emojisSpawnedThisSecond}/${maxEmojisPerSecond} this second, ${rateLimitQueue.length} queued)`);
    }
}


/**
 * Update debug info
 */
function updateDebugInfo() {
    const debug = document.getElementById('debug-info');
    debug.style.display = 'block';
    debug.innerHTML = `
        <strong>Emoji Rain Debug</strong><br>
        Emojis: ${emojis.length} / ${config.max_emojis_on_screen}<br>
        FPS: ${currentFPS} (Target: ${config.target_fps})<br>
        Mode: ${performanceMode}<br>
        Toaster: ${toasterModeActive ? '🍞 Active' : 'Off'}<br>
        Wind: ${windForce.toFixed(6)}<br>
        Bodies: ${engine.world.bodies.length}<br>
        Enabled: ${config.enabled ? 'Yes' : 'No'}<br>
        Rate Limit: ${config.rate_limit_enabled ? `${emojisSpawnedThisSecond}/${config.rate_limit_emojis_per_second}/s (Queue: ${rateLimitQueue.length})` : 'Off'}
    `;
}

/**
 * Load configuration from server
 */
async function loadConfig() {
    try {
        const response = await fetch('/api/emoji-rain/config');
        const data = await response.json();

        if (data.success && data.config) {
            Object.assign(config, data.config);
            syncVisualModeState();
            console.log('✅ Emoji rain config loaded', config);

            // Update physics
            if (engine) {
                resizeCanvas();
                engine.gravity.y = config.physics_gravity_y;
                console.log(`⚙️ [PHYSICS] Applied gravity: ${config.physics_gravity_y}`);
                
                // Update boundaries if floor setting changed
                if (config.floor_enabled) {
                    if (!engine.world.bodies.includes(ground)) {
                        World.add(engine.world, ground);
                        console.log('⚙️ [PHYSICS] Floor enabled on load');
                    }
                } else {
                    if (engine.world.bodies.includes(ground)) {
                        World.remove(engine.world, ground);
                        console.log('⚙️ [PHYSICS] Floor disabled on load');
                    }
                }
                
                // Update restitution (bounce)
                if (ground) {
                    ground.restitution = config.bounce_height;
                    ground.friction = config.physics_friction;
                }
                if (leftWall) {
                    leftWall.restitution = config.bounce_height;
                    leftWall.friction = config.physics_friction;
                }
                if (rightWall) {
                    rightWall.restitution = config.bounce_height;
                    rightWall.friction = config.physics_friction;
                }
                console.log(`⚙️ [PHYSICS] Applied bounce height: ${config.bounce_height}, friction: ${config.physics_friction}`);
            }
            
            // Apply or remove toaster mode based on config
            if (config.toaster_mode) {
                applyToasterMode();
            } else {
                removeToasterMode();
            }
            syncVisualModeState();
        }
    } catch (error) {
        console.error('❌ Failed to load emoji rain config:', error);
    }
}

/**
 * Load user emoji mappings
 */
async function loadUserEmojiMappings() {
    try {
        const response = await fetch('/api/emoji-rain/user-mappings');
        const data = await response.json();

        if (data.success && data.mappings) {
            userEmojiMap = data.mappings;
            console.log('✅ User emoji mappings loaded:', userEmojiMap);
            console.log('👤 [USER MAPPINGS] Total mappings:', Object.keys(userEmojiMap).length);
            console.log('👤 [USER MAPPINGS] Users:', Object.keys(userEmojiMap).join(', '));
        }
    } catch (error) {
        console.error('❌ Failed to load user emoji mappings:', error);
    }
}

/**
 * Socket.IO setup
 */
function initSocket() {
    socket = io();

    socket.on('connect', () => {
        console.log('✅ Connected to server');
    });

    socket.on('emoji-rain:spawn', (data) => {
        handleSpawnEvent(data);
    });

    socket.on('emoji-rain:heart-balloons', (data) => {
        if (overlayAllowsEventCategory('hearts')) {
            spawnHeartBalloons(data);
        }
    });

    socket.on('emoji-rain:gift-balls', (data) => {
        if (overlayAllowsEventCategory('gifts')) {
            spawnGiftBalls(data);
        }
    });

    socket.on('emoji-rain:clear', () => {
        emojis.forEach(emoji => removeEmoji(emoji));
        emojis = [];
        heartBalloons.forEach(balloon => removeHeartBalloon(balloon));
        heartBalloons = [];
        spawnQueue = [];
        rateLimitQueue = [];
    });

    socket.on('emoji-rain:config-update', (data) => {
        if (data.config) {
            console.log('🔄 [CONFIG UPDATE] Received new config:', data.config);
            console.log(`🔄 [CONFIG UPDATE] floor_enabled: ${data.config.floor_enabled}, wind_enabled: ${data.config.wind_enabled}`);
            
            // Store old values for comparison
            const oldGravity = config.physics_gravity_y;
            const oldFloorEnabled = config.floor_enabled;
            const oldBounceHeight = config.bounce_height;
            const oldWindEnabled = config.wind_enabled;
            const oldToasterMode = config.toaster_mode;
            
            // Update config
            Object.assign(config, data.config);
            console.log('🔄 Config updated', config);
            console.log(`🔄 [CONFIG UPDATE] After update - floor_enabled: ${config.floor_enabled}, wind_enabled: ${config.wind_enabled}`);

            // Handle toaster mode change
            if (config.toaster_mode !== oldToasterMode) {
                if (config.toaster_mode) {
                    applyToasterMode();
                } else {
                    removeToasterMode();
                }
            }
            syncVisualModeState();

            if (engine) {
                resizeCanvas();

                // Update gravity if changed
                if (config.physics_gravity_y !== oldGravity) {
                    engine.gravity.y = config.physics_gravity_y;
                    console.log(`⚙️ [PHYSICS] Updated gravity: ${config.physics_gravity_y}`);
                }
                
                // Update floor if changed
                if (config.floor_enabled !== oldFloorEnabled) {
                    console.log(`⚙️ [PHYSICS] Floor setting changed from ${oldFloorEnabled} to ${config.floor_enabled}`);
                    if (config.floor_enabled) {
                        if (!engine.world.bodies.includes(ground)) {
                            World.add(engine.world, ground);
                            console.log('⚙️ [PHYSICS] Floor enabled - ground added to world');
                        } else {
                            console.log('⚠️ [PHYSICS] Floor already in world, skipping add');
                        }
                    } else {
                        if (engine.world.bodies.includes(ground)) {
                            World.remove(engine.world, ground);
                            console.log('⚙️ [PHYSICS] Floor disabled - ground removed from world');
                        } else {
                            console.log('⚠️ [PHYSICS] Floor not in world, skipping remove');
                        }
                    }
                }
                
                // Update wind
                if (config.wind_enabled !== oldWindEnabled) {
                    console.log(`⚙️ [PHYSICS] Wind setting changed from ${oldWindEnabled} to ${config.wind_enabled}`);
                    // Wind force is calculated dynamically in calculateWindForce() based on config.wind_enabled
                    // No additional physics update needed here
                }
                
                // Update bounce/restitution if changed
                if (config.bounce_height !== oldBounceHeight) {
                    // Update ground restitution
                    if (ground) {
                        ground.restitution = config.bounce_height;
                    }
                    if (leftWall) {
                        leftWall.restitution = config.bounce_height;
                    }
                    if (rightWall) {
                        rightWall.restitution = config.bounce_height;
                    }
                    console.log(`⚙️ [PHYSICS] Updated bounce height: ${config.bounce_height}`);
                }
            }
        }
    });

    socket.on('emoji-rain:toggle', (data) => {
        config.enabled = data.enabled;
        console.log('🔄 Emoji rain ' + (data.enabled ? 'enabled' : 'disabled'));
    });

    socket.on('emoji-rain:user-mappings-update', (data) => {
        if (data.mappings) {
            userEmojiMap = data.mappings;
            console.log('🔄 User emoji mappings updated', userEmojiMap);
            console.log('👤 [USER MAPPINGS UPDATE] Total mappings:', Object.keys(userEmojiMap).length);
            console.log('👤 [USER MAPPINGS UPDATE] Users:', Object.keys(userEmojiMap).join(', '));
        }
    });
}

/**
 * Initialize everything
 */
async function init() {
    console.log('🌧️ Initializing Enhanced Emoji Rain Overlay...');

    // Load config and user mappings
    await loadConfig();
    await loadUserEmojiMappings();

    // Initialize physics
    initPhysics();

    // Initialize socket
    initSocket();

    // Start update loop
    requestAnimationFrame(updateLoop);

    console.log('✅ Enhanced Emoji Rain Overlay ready!');
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Handle window resize
window.addEventListener('resize', () => {
    resizeCanvas();
});

// Enable debug mode with keyboard shortcut
document.addEventListener('keydown', (e) => {
    if (e.key === 'd' && e.ctrlKey) {
        debugMode = !debugMode;
        if (!debugMode) {
            document.getElementById('debug-info').style.display = 'none';
        }
        console.log('Debug mode: ' + debugMode);
    }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    // Clean up all emojis and their timeouts
    emojis.forEach(emoji => removeEmoji(emoji));
    emojis = [];
    heartBalloons.forEach(balloon => removeHeartBalloon(balloon));
    heartBalloons = [];
    emojiBodyMap.clear();
    
    // Clear spawn queue
    spawnQueue = [];
    
    if (engine) {
        // Remove event listeners to prevent memory leaks
        Events.off(engine, 'collisionStart', handleCollision);
        Engine.clear(engine);
        engine = null;
    }
    
    console.log('🧹 Cleanup completed');
});
