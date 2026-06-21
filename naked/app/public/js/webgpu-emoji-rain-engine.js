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
    width_px: 1280,
    height_px: 720,
    emoji_set: ["💧","💙","💚","💜","❤️","🩵","✨","🌟","🔥","🎉"],
    use_custom_images: false,
    image_urls: [],
    effect: 'bounce',
    
    // Toaster Mode (Low-End PC Mode)
    toaster_mode: false, // When enabled, reduces resource usage significantly
    
    // Physics
    physics_gravity_y: 1.0,
    physics_air: 0.02,
    physics_friction: 0.1,
    physics_restitution: 0.6,
    
    // Wind Simulation
    wind_enabled: false,
    wind_strength: 50, // 0-100
    wind_direction: 'auto', // 'auto', 'left', 'right'
    
    // Bounce Physics
    bounce_enabled: true,
    bounce_height: 0.6, // Same as restitution
    bounce_damping: 0.1,
    floor_enabled: true,
    
    // Emoji Appearance
    emoji_min_size_px: 40,
    emoji_max_size_px: 80,
    emoji_rotation_speed: 0.05,
    emoji_lifetime_ms: 8000,
    emoji_fade_duration_ms: 1000,
    max_emojis_on_screen: 200,
    
    // Color Theme
    color_mode: 'off', // 'off', 'warm', 'cool', 'neon', 'pastel'
    color_intensity: 0.5, // 0-1
    
    // Rainbow Mode
    rainbow_enabled: false,
    rainbow_speed: 1.0, // Speed of hue rotation
    
    // Pixel Mode
    pixel_enabled: false,
    pixel_size: 4, // 1-10
    
    // FPS Optimization
    fps_optimization_enabled: true,
    fps_sensitivity: 0.8, // 0-1, higher = more aggressive
    target_fps: 60,
    
    // SuperFan Burst
    superfan_burst_enabled: true,
    superfan_burst_intensity: 3.0,
    superfan_burst_duration: 2000,
    
    // Rate Limiting Queue
    rate_limit_enabled: false,
    rate_limit_emojis_per_second: 30,
    
    // Scaling rules
    like_count_divisor: 10,
    like_min_emojis: 1,
    like_max_emojis: 20,
    gift_base_emojis: 3,
    gift_coin_multiplier: 0.1,
    gift_max_emojis: 50,

    // Herzballons
    heart_balloons_enabled: true,
    heart_balloon_like_divisor: 1,
    heart_balloon_min_hearts: 1,
    heart_balloon_max_hearts: 24,
    heart_balloon_profile_every: 4,
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

// FPS tracking
let lastUpdateTime = performance.now();
let frameCount = 0;
let currentFPS = 60;
let fpsUpdateTime = performance.now();
let fpsHistory = [];
const FPS_HISTORY_SIZE = 60;
const COLOR_UPDATE_THROTTLE_MS = 100; // Throttle non-rainbow color updates for performance

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
const MAX_GROUND_BOUNCE_HORIZONTAL_SPEED = 4;
const MIN_GROUND_BOUNCE_VERTICAL_SPEED = 6;
const MAX_GROUND_BOUNCE_VERTICAL_SPEED = 18;
const GROUND_POP_DELAY_MS = 1200;

// Rainbow animation state
let rainbowHueOffset = 0;

// Performance state
let performanceMode = 'normal'; // 'normal', 'reduced', 'minimal'

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
                    applyGroundBounceVelocity(emoji);
                    scheduleGroundPop(emoji);
                    triggerBounceEffect(emoji);
                }
            }
        }
    });
}

/**
 * Keep floor impacts playful without preserving extreme diagonal resolver velocity.
 */
function applyGroundBounceVelocity(emoji) {
    if (!emoji.body) return;

    const currentVelocity = emoji.body.velocity || { x: 0, y: 0 };
    const dampingFactor = 1 - clamp(config.bounce_damping || 0, 0, 1);
    const configuredRestitution = typeof config.bounce_height === 'number'
        ? config.bounce_height
        : (typeof config.physics_restitution === 'number' ? config.physics_restitution : 0.6);
    const restitution = clamp(configuredRestitution, 0, 1);
    const horizontalSpeed = clamp(
        currentVelocity.x * dampingFactor,
        -MAX_GROUND_BOUNCE_HORIZONTAL_SPEED,
        MAX_GROUND_BOUNCE_HORIZONTAL_SPEED
    );
    const bounceSpeed = clamp(
        Math.abs(currentVelocity.y) * Math.max(0.35, restitution) * dampingFactor,
        MIN_GROUND_BOUNCE_VERTICAL_SPEED,
        MAX_GROUND_BOUNCE_VERTICAL_SPEED
    );

    Body.setVelocity(emoji.body, {
        x: horizontalSpeed,
        y: -bounceSpeed
    });
}

/**
 * Let emojis bounce first, then disappear with the configured slow fade/pop.
 */
function scheduleGroundPop(emoji) {
    if (emoji.groundPopTimeout || emoji.fading || emoji.removed) return;

    emoji.groundPopTimeout = setTimeout(() => {
        emoji.groundPopTimeout = null;
        if (!emoji.removed) {
            fadeOutEmoji(emoji);
        }
    }, GROUND_POP_DELAY_MS);
}

/**
 * Trigger bounce/bubble animation
 */
function triggerBounceEffect(emoji) {
    if (!emoji.element || config.effect === 'none') return;
    
    // Both 'bounce' and 'bubble' effects use the same bubbleBlop animation
    // The difference is in the physics settings, not the animation
    
    // Reset animation to trigger it again properly
    emoji.element.style.animation = 'none';
    // Force reflow
    void emoji.element.offsetWidth;
    emoji.element.style.animation = 'bubbleBlop 0.4s ease-out';
    
    // Clean up animation after it completes
    if (emoji.bounceAnimationTimeout) {
        clearTimeout(emoji.bounceAnimationTimeout);
    }
    emoji.bounceAnimationTimeout = setTimeout(() => {
        if (emoji.element && !emoji.removed) {
            emoji.element.style.animation = '';
        }
        emoji.bounceAnimationTimeout = null;
    }, 400);
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
    
    // Combine both filters
    const filters = [colorFilter, pixelFilter].filter(f => f).join(' ');
    element.style.filter = filters;
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
            filter: drop-shadow(0 8px 14px rgba(0,0,0,0.24));
        }
        .heart-balloon-bubble {
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--heart-color, #ff4d8d);
            font-family: "Segoe UI Symbol", "Apple Color Emoji", sans-serif;
            font-weight: 800;
            line-height: 1;
            text-shadow: 0 4px 12px rgba(0,0,0,0.26), 0 0 18px color-mix(in srgb, var(--heart-color, #ff4d8d) 55%, transparent);
        }
        .heart-balloon-bubble::after {
            content: "";
            position: absolute;
            inset: 16% 18% 52% 30%;
            border-radius: 999px;
            background: rgba(255,255,255,0.42);
            transform: rotate(-25deg);
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
    const profileEvery = Math.max(1, parseInt(data.profileEvery || config.heart_balloon_profile_every || 4, 10));
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
    const count = Math.max(1, Math.min(safeCount, config.heart_balloon_max_hearts || 24));

    for (let i = 0; i < count; i++) {
        setTimeout(() => {
            spawnHeartBalloon(data, i);
        }, i * 95);
    }
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

    balloon.element.style.transform = `translate3d(${balloon.x + sway}px, ${balloon.y + bob}px, 0) translate(-50%, -50%) rotate(${rotate}deg) scale(${scale})`;
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

    heartBalloons = heartBalloons.filter(balloon => !balloon.removed);

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
                    console.warn('[WebGPU Emoji Rain] ⚠️ FPS dropped to 0, monitoring for freeze...');
                    freezeWarningShown = true;
                }
                
                // Auto-reload after sustained freeze
                if (frozenFrameCount >= MAX_FROZEN_FRAMES) {
                    console.error(`[WebGPU Emoji Rain] 🔄 FPS frozen for ${MAX_FROZEN_FRAMES} seconds, auto-reloading overlay to recover...`);
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
                    console.log(`[WebGPU Emoji Rain] ✅ FPS recovered (was frozen for ${frozenFrameCount}s)`);
                }
                frozenFrameCount = 0;
                freezeWarningShown = false;
            }
        }
        
        // Check if FPS optimization is needed
        if (config.fps_optimization_enabled) {
            checkAndOptimizeFPS();
        }
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
                const px = emoji.body.position.x;
                const py = emoji.body.position.y;
                const rotation = emoji.body.angle + emoji.rotation;
                emoji.rotation += config.emoji_rotation_speed;

                emoji.element.style.transform = `translate3d(${px}px, ${py}px, 0) translate(-50%, -50%) rotate(${rotation}rad)`;
                
                // Update color theme:
                // - Rainbow mode needs to update every frame for smooth animation
                // - Other color modes only update periodically to save performance
                if (config.rainbow_enabled) {
                    applyColorTheme(emoji.element, emoji);
                    emoji.lastColorUpdate = currentTime;
                } else if (currentTime - emoji.lastColorUpdate > COLOR_UPDATE_THROTTLE_MS) {
                    applyColorTheme(emoji.element, emoji);
                    emoji.lastColorUpdate = currentTime;
                }
            }
        }

        // Check lifetime
        if (emoji.spawnTime && config.emoji_lifetime_ms > 0) {
            const age = currentTime - emoji.spawnTime;
            if (age > config.emoji_lifetime_ms && !emoji.fading) {
                fadeOutEmoji(emoji);
            }
        }
    });

    updateHeartBalloons(currentTime, deltaTime);

    // Remove faded emojis
    emojis = emojis.filter(emoji => !emoji.removed);

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
        
    } else if (avgFPS > config.target_fps * 0.95 && performanceMode !== 'normal') {
        // Restore normal performance mode
        performanceMode = 'normal';
        console.log(`⚡ FPS optimization: Restoring normal mode (FPS: ${avgFPS.toFixed(1)})`);
        
        // Reload config to restore settings
        loadConfig();
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
function spawnEmoji(emoji, x, y, size, username = null, profilePictureUrl = null, color = null) {
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
    } else if (config.use_custom_images && config.image_urls && config.image_urls.length > 0) {
        const imageUrl = config.image_urls[Math.floor(Math.random() * config.image_urls.length)];
        const img = document.createElement('img');
        img.src = imageUrl;
        img.style.width = size + 'px';
        img.style.height = size + 'px';
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
    element.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
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
        lastColorUpdate: performance.now() // Track when color was last updated
    };

    emojis.push(emojiObj);
    
    // Add to body map for fast collision lookup
    emojiBodyMap.set(body, emojiObj);

    // Apply pixel effect and color theme to the new emoji element
    applyPixelEffect(element);
    applyColorTheme(element, emojiObj);
    
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
        emoji.element.style.transition = `opacity ${fadeDuration}ms ease, scale ${fadeDuration}ms ease-out`;
        emoji.element.style.scale = '0.1';
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
        spawnHeartBalloons(data);
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
        spawnQueue.push({ emoji, x, y, actualCount, username, profilePictureUrl, color, isBurst });
        // Only log queue size every 10 events to reduce console spam
        if (spawnQueue.length % 10 === 0 || debugMode) {
            console.log(`⏸️ [SPAWN] Queued spawn event (queue size: ${spawnQueue.length})`);
        }
        return;
    }

    // Process this spawn immediately
    processSpawn(emoji, x, y, actualCount, username, profilePictureUrl, color, isBurst);
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
        processSpawn(event.emoji, event.x, event.y, event.actualCount, event.username, event.profilePictureUrl, event.color, event.isBurst);
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
function processSpawn(emoji, x, y, actualCount, username, profilePictureUrl, color, isBurst) {
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
                color
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

            spawnEmoji(emoji, offsetX, offsetY, size, username, profilePictureUrl, color);
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
            emojiData.color
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
        const response = await fetch('/api/webgpu-emoji-rain/config');
        const data = await response.json();

        if (data.success && data.config) {
            Object.assign(config, data.config);
            console.log('✅ Emoji rain config loaded', config);

            // Update physics
            if (engine) {
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
        const response = await fetch('/api/webgpu-emoji-rain/user-mappings');
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

    socket.on('webgpu-emoji-rain:spawn', (data) => {
        handleSpawnEvent(data);
    });

    socket.on('webgpu-emoji-rain:heart-balloons', (data) => {
        spawnHeartBalloons(data);
    });

    socket.on('webgpu-emoji-rain:clear', () => {
        emojis.forEach(emoji => removeEmoji(emoji));
        emojis = [];
        heartBalloons.forEach(balloon => removeHeartBalloon(balloon));
        heartBalloons = [];
        spawnQueue = [];
        rateLimitQueue = [];
    });

    socket.on('webgpu-emoji-rain:config-update', (data) => {
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

            if (engine) {
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

    socket.on('webgpu-emoji-rain:toggle', (data) => {
        config.enabled = data.enabled;
        console.log('🔄 Emoji rain ' + (data.enabled ? 'enabled' : 'disabled'));
    });

    socket.on('webgpu-emoji-rain:user-mappings-update', (data) => {
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
