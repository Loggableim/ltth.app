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
    
    // Scaling rules
    like_count_divisor: 10,
    like_min_emojis: 1,
    like_max_emojis: 20,
    gift_base_emojis: 3,
    gift_coin_multiplier: 0.1,
    gift_max_emojis: 50
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

// Rate limiting for spawn events to prevent overwhelming the system
let spawnQueue = [];
let lastSpawnTime = 0;
const MIN_SPAWN_INTERVAL_MS = 50; // Minimum 50ms between spawn batches
const MAX_SPAWN_QUEUE_SIZE = 100; // Maximum queued spawn events

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
    const thickness = 100;
    
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
                    
                    // Apply bounce damping - reduce velocity after bounce
                    if (config.bounce_damping > 0) {
                        // Clamp damping to [0, 1] to prevent velocity reversal
                        const dampingFactor = 1 - Math.min(1, Math.max(0, config.bounce_damping));
                        const currentVelocity = emoji.body.velocity;
                        Body.setVelocity(emoji.body, {
                            x: currentVelocity.x * dampingFactor,
                            y: currentVelocity.y * dampingFactor
                        });
                    }
                    
                    triggerBounceEffect(emoji);
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
    const thickness = 100;

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

    const maxWindForce = (config.wind_strength / 100) * 0.01;
    
    if (config.wind_direction === 'left') {
        return -maxWindForce;
    } else if (config.wind_direction === 'right') {
        return maxWindForce;
    } else {
        // Auto mode - add variation
        windForce += (Math.random() - 0.5) * maxWindForce * 0.1;
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
 * Spawn emoji
 */
function spawnEmoji(emoji, x, y, size, username = null, color = null) {
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

    // Normalize x position (0-1 to px) with safety margins
    if (x >= 0 && x <= 1) {
        // Add margin from edges to prevent emojis getting stuck
        // Use the emoji size as the minimum margin
        const margin = size;
        const safeWidth = canvasWidth - (margin * 2);
        x = margin + (x * safeWidth);
    } else {
        // For absolute positions, ensure x is within safe bounds
        const margin = size;
        const minX = margin;
        const maxX = canvasWidth - margin;
        x = Math.max(minX, Math.min(maxX, x));
    }
    
    // Ensure x and y are valid numbers
    if (isNaN(x) || !isFinite(x)) {
        console.error(`⚠️ [SPAWN] Invalid x position: ${x}, using canvasWidth/2`);
        x = canvasWidth / 2;
    }
    if (isNaN(y) || !isFinite(y)) {
        console.error(`⚠️ [SPAWN] Invalid y position: ${y}, using 0`);
        y = 0;
    }
    
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

    console.log(`⚙️ [SPAWN] Created body with friction=${config.physics_friction}, restitution=${config.bounce_height}, frictionAir=${config.physics_air}`);

    // Add initial velocity
    Body.setVelocity(body, {
        x: (Math.random() - 0.5) * 2,
        y: Math.random() * 2
    });

    World.add(engine.world, body);

    // Create DOM element
    const element = document.createElement('div');
    element.className = 'emoji-sprite';

    // Use custom image or emoji
    if (config.use_custom_images && config.image_urls && config.image_urls.length > 0) {
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

    // Set initial position AND ensure it's applied immediately
    // This prevents emojis from briefly appearing at 0,0 (top-left corner)
    element.style.position = 'absolute';
    element.style.left = '0';
    element.style.top = '0';
    element.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;

    // Now add to DOM - element already has correct position
    document.getElementById('canvas-container').appendChild(element);

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

    const count = data.count || 1;
    const emoji = data.emoji || getRandomEmoji();
    const x = data.x !== undefined ? data.x : Math.random();
    const y = data.y !== undefined ? data.y : 0;
    const username = data.username || null;
    const isBurst = data.burst || false;
    const color = data.color || null;

    console.log(`🌧️ [SPAWN EVENT] count=${count}, emoji=${emoji}, username=${username}, burst=${isBurst}, color=${color}`);

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
        spawnQueue.push({ emoji, x, y, actualCount, username, color, isBurst });
        // Only log queue size every 10 events to reduce console spam
        if (spawnQueue.length % 10 === 0 || debugMode) {
            console.log(`⏸️ [SPAWN] Queued spawn event (queue size: ${spawnQueue.length})`);
        }
        return;
    }

    // Process this spawn immediately
    processSpawn(emoji, x, y, actualCount, username, color, isBurst);
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
        processSpawn(event.emoji, event.x, event.y, event.actualCount, event.username, event.color, event.isBurst);
        lastSpawnTime = now;
    }
}

/**
 * Process a single spawn event
 */
function processSpawn(emoji, x, y, actualCount, username, color, isBurst) {
    for (let i = 0; i < actualCount; i++) {
        const size = config.emoji_min_size_px + Math.random() * (config.emoji_max_size_px - config.emoji_min_size_px);
        const offsetX = x + (Math.random() - 0.5) * 0.2;
        const offsetY = y - i * 5;

        spawnEmoji(emoji, offsetX, offsetY, size, username, color);
    }

    console.log(`🌧️ Spawned ${actualCount}x ${emoji} at (${x.toFixed(2)}, ${y})${isBurst ? ' [BURST]' : ''}${username ? ' for ' + username : ''}`);
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
        Enabled: ${config.enabled ? 'Yes' : 'No'}
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
