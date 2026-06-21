        // Matter.js aliases
        const Engine = Matter.Engine;
        const Render = Matter.Render;
        const World = Matter.World;
        const Bodies = Matter.Bodies;
        const Body = Matter.Body;
        const Events = Matter.Events;

        // Configuration
        let config = {
            enabled: true,
            width_px: 1920,
            height_px: 1080,
            emoji_set: ["💧","💙","💚","💜","❤️","🩵","✨","🌟","🔥","🎉"],
            use_custom_images: false,
            image_urls: [],
            effect: 'bounce',
            // Toaster Mode (Low-End PC Mode)
            toaster_mode: false,
            physics_gravity_y: 1.0,
            physics_air: 0.02,
            physics_friction: 0.1,
            physics_restitution: 0.6,
            emoji_min_size_px: 40,
            emoji_max_size_px: 80,
            emoji_rotation_speed: 0.05,
            emoji_lifetime_ms: 8000,
            emoji_fade_duration_ms: 1000,
            max_emojis_on_screen: 200,
            // Wind Simulation (BUG 5 fix: align config keys with engine.js)
            wind_enabled: false,
            wind_strength: 50,
            wind_direction: 'auto',
            // Bounce Physics
            bounce_damping: 0.1,
            floor_enabled: true,
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
            heart_balloon_test_count: 8,
            // OBS HUD specific settings
            obs_hud_enabled: true,
            obs_hud_width: 1920,
            obs_hud_height: 1080,
            enable_glow: true,
            enable_particles: true,
            enable_depth: true,
            target_fps: 60,
            // Rainbow mode
            rainbow_enabled: false,
            rainbow_speed: 1.0,
            // Pixel mode
            pixel_enabled: false,
            pixel_size: 4,
            // Color theme
            color_mode: 'off',
            color_intensity: 0.5
        };

        // Toaster mode presets - applied when toaster_mode is enabled
        // NOTE: Keep in sync with TOASTER_MODE_PRESETS in emoji-rain-engine.js
        const TOASTER_MODE_PRESETS = {
            max_emojis_on_screen: 50,        // Reduced from 200
            target_fps: 30,                   // Reduced from 60
            emoji_min_size_px: 30,            // Slightly smaller for performance
            emoji_max_size_px: 60,            // Slightly smaller for performance
            emoji_rotation_speed: 0,          // Disable rotation for performance
            wind_enabled: false,              // Disable wind simulation (not used in OBS HUD but kept for consistency)
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

        // Physics constants (must match engine.js)
        // <!-- SHARED MODULE CANDIDATE: extract to emoji-rain-shared.js -->
        const WALL_THICKNESS = 100; // Wall thickness in pixels (must match createBoundaries)
        const WIND_FORCE_MULTIPLIER = 300; // Force multiplier for wind (strength/100 × this value)
        const WIND_AUTO_VARIATION = 0.2; // Variation factor for auto wind mode
        const MAX_GROUND_BOUNCE_HORIZONTAL_SPEED = 4;
        const MIN_GROUND_BOUNCE_VERTICAL_SPEED = 6;
        const MAX_GROUND_BOUNCE_VERTICAL_SPEED = 18;
        const GROUND_POP_DELAY_MS = 1200;
        const MAX_RATE_LIMIT_QUEUE_SIZE = 500; // BUG 11 fix: prevent unbounded queue growth

        // State
        let engine, render;
        let socket;
        let emojis = []; // Track emoji bodies and DOM elements
        let heartBalloons = [];
        let emojiBodyMap = new Map(); // BUG 2 fix: Map physics bodies to emoji objects for O(1) lookup
        let particlePool = []; // Pool of reusable particle elements
        let userEmojiMap = {}; // User-specific emoji mappings
        let windForce = 0;
        let perfHudVisible = false;
        let resolutionIndicatorVisible = false;
        let ground, leftWall, rightWall;
        let canvasWidth, canvasHeight;
        let rainbowHueOffset = 0; // Rainbow animation state

        // Performance tracking
        let lastFrameTime = performance.now();
        let frameCount = 0;
        let fps = 60;
        let fpsUpdateTime = performance.now();
        // BUG 7 fix: TARGET_FRAME_TIME is no longer a const – calculated dynamically in updateLoop
        const COLOR_UPDATE_THROTTLE_MS = 100; // Throttle non-rainbow color updates for performance
        let lastUpdateTime = performance.now();

        // Freeze detection and OBS cache prevention
        let freezeDetectionEnabled = true; // Can be disabled for debugging
        let frozenFrameCount = 0; // Count consecutive seconds with 0 FPS
        const MAX_FROZEN_FRAMES = 3; // Auto-reload after 3 seconds of 0 FPS
        let freezeWarningShown = false;
        
        // Rate limiting queue - tracks emojis spawned per second
        let rateLimitQueue = []; // Stores individual emoji spawn requests
        let emojisSpawnedThisSecond = 0;
        let secondStartTime = performance.now();
        
        // Memory pressure detection for OBS browser cache prevention
        let lastMemoryCheck = performance.now();
        const MEMORY_CHECK_INTERVAL = 5000; // Check memory every 5 seconds
        const MEMORY_PRESSURE_THRESHOLD_MB = 150; // Aggressive cleanup above 150MB
        const MEMORY_CRITICAL_THRESHOLD_MB = 200; // Force reload above 200MB

        // Object pooling for particles
        const MAX_PARTICLE_POOL_SIZE = 100;

        // Initialize physics engine
        function initPhysics() {
            // Use configured OBS HUD dimensions
            canvasWidth = config.obs_hud_width || config.width_px || 1920;
            canvasHeight = config.obs_hud_height || config.height_px || 1080;

            // Set canvas container size
            const container = document.getElementById('canvas-container');
            container.style.width = canvasWidth + 'px';
            container.style.height = canvasHeight + 'px';

            // Update resolution indicator
            updateResolutionIndicator();

            // Create engine
            engine = Engine.create({
                enableSleeping: false,
                timing: {
                    timeScale: 1
                }
            });

            // Set gravity
            engine.gravity.y = config.physics_gravity_y;

            // Create invisible boundaries
            const thickness = 100;
            ground = Bodies.rectangle(
                canvasWidth / 2,
                canvasHeight + thickness / 2,
                canvasWidth + thickness * 2,
                thickness,
                {
                    isStatic: true,
                    friction: config.physics_friction,
                    restitution: config.physics_restitution,
                    label: 'ground'
                }
            );

            leftWall = Bodies.rectangle(
                -thickness / 2,
                canvasHeight / 2,
                thickness,
                canvasHeight + thickness * 2,
                {
                    isStatic: true,
                    friction: config.physics_friction,
                    restitution: config.physics_restitution
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
                    restitution: config.physics_restitution
                }
            );

            // BUG 4 fix: respect floor_enabled toggle
            if (config.floor_enabled) {
                World.add(engine.world, [ground, leftWall, rightWall]);
            } else {
                World.add(engine.world, [leftWall, rightWall]);
            }

            // Listen for collision with ground for bounce effect
            Events.on(engine, 'collisionStart', handleCollision);

            console.log(`✅ Physics initialized at ${canvasWidth}x${canvasHeight}`);
        }

        // Handle collision events (for bounce animation)
        function handleCollision(event) {
            if (config.effect === 'none') return;

            event.pairs.forEach(pair => {
                if (pair.bodyA.label === 'ground' || pair.bodyB.label === 'ground') {
                    const emojiBody = pair.bodyA.label === 'ground' ? pair.bodyB : pair.bodyA;
                    // BUG 2 fix: use Map for O(1) lookup instead of O(n) Array.find
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

        // Keep floor impacts playful without preserving extreme diagonal resolver velocity.
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

        // Let emojis bounce first, then disappear with the configured slow fade/pop.
        function scheduleGroundPop(emoji) {
            if (emoji.groundPopTimeout || emoji.fading || emoji.removed) return;

            emoji.groundPopTimeout = setTimeout(() => {
                emoji.groundPopTimeout = null;
                if (!emoji.removed) {
                    fadeOutEmoji(emoji);
                }
            }, GROUND_POP_DELAY_MS);
        }

        // Trigger bounce/blop animation with enhanced effects
        function triggerBounceEffect(emoji) {
            if (!emoji.element || config.effect === 'none') return;

            emoji.element.classList.add('bouncing');

            // Add temporary glow
            if (config.enable_glow) {
                emoji.element.classList.add('glowing');
                // Clear existing timeout if any
                if (emoji.glowTimeout) {
                    clearTimeout(emoji.glowTimeout);
                }
                emoji.glowTimeout = setTimeout(() => {
                    // Check if element still exists before removing class
                    if (emoji.element && !emoji.removed) {
                        emoji.element.classList.remove('glowing');
                    }
                    emoji.glowTimeout = null;
                }, 300);
            }

            // Spawn particles on impact
            if (config.enable_particles) {
                spawnImpactParticles(emoji.body.position.x, emoji.body.position.y, 8);
            }

            // Clear existing timeout if any
            if (emoji.bounceTimeout) {
                clearTimeout(emoji.bounceTimeout);
            }
            emoji.bounceTimeout = setTimeout(() => {
                // Check if element still exists before removing class
                if (emoji.element && !emoji.removed) {
                    emoji.element.classList.remove('bouncing');
                }
                emoji.bounceTimeout = null;
            }, 500);
        }

        // Spawn particle effects
        function spawnImpactParticles(x, y, count) {
            for (let i = 0; i < count; i++) {
                const particle = getParticleFromPool();

                const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
                const distance = 20 + Math.random() * 20;
                const px = x + Math.cos(angle) * distance;
                const py = y + Math.sin(angle) * distance;

                particle.style.left = px + 'px';
                particle.style.top = py + 'px';
                particle.style.background = `radial-gradient(circle,
                    rgba(255,255,255,${0.8 + Math.random() * 0.2}) 0%,
                    rgba(255,255,255,0) 70%)`;

                document.getElementById('canvas-container').appendChild(particle);

                // Return to pool after animation
                setTimeout(() => {
                    returnParticleToPool(particle);
                }, 600);
            }
        }

        // Object pooling for particles
        function getParticleFromPool() {
            if (particlePool.length > 0) {
                return particlePool.pop();
            }
            const particle = document.createElement('div');
            particle.className = 'particle-trail';
            return particle;
        }

        function returnParticleToPool(particle) {
            if (particle.parentNode) {
                particle.parentNode.removeChild(particle);
            }
            if (particlePool.length < MAX_PARTICLE_POOL_SIZE) {
                particlePool.push(particle);
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
                <div>⚠️ OBS OVERLAY FROZEN ⚠️</div>
                <div style="font-size: 18px; margin-top: 10px;">Auto-reloading in 2 seconds...</div>
                <div style="font-size: 14px; margin-top: 5px; opacity: 0.8;">Preventing OBS cache buildup</div>
            `;
            document.body.appendChild(warning);
        }

        /**
         * Show memory warning overlay before auto-reload
         */
        function showMemoryWarning(memoryMB) {
            const warning = document.createElement('div');
            warning.id = 'memory-warning';
            warning.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(255, 140, 0, 0.9);
                color: white;
                padding: 30px 50px;
                border-radius: 15px;
                font-size: 24px;
                font-weight: bold;
                text-align: center;
                z-index: 10000;
                border: 3px solid white;
                box-shadow: 0 0 30px rgba(255, 140, 0, 0.8);
            `;
            warning.innerHTML = `
                <div>⚠️ HIGH MEMORY USAGE ⚠️</div>
                <div style="font-size: 18px; margin-top: 10px;">${memoryMB.toFixed(2)}MB - Reloading...</div>
                <div style="font-size: 14px; margin-top: 5px; opacity: 0.8;">Preventing OBS browser crash</div>
            `;
            document.body.appendChild(warning);
        }

        /**
         * Perform aggressive cleanup to prevent OBS cache buildup
         * Removes old emojis, clears particle pool, and forces garbage collection hints
         */
        function performAggressiveCleanup() {
            console.log('[OBS HUD] 🧹 Performing aggressive cleanup...');
            
            const startEmojis = emojis.length;
            const startHeartBalloons = heartBalloons.length;
            const startBodies = engine ? engine.world.bodies.length : 0;
            const startParticles = particlePool.length;
            
            // Remove oldest 50% of emojis immediately
            const removeCount = Math.floor(emojis.length / 2);
            for (let i = 0; i < removeCount; i++) {
                if (emojis.length > 0) {
                    removeEmoji(emojis[0]);
                }
            }
            
            // Clear particle pool completely (clear in place to preserve references)
            particlePool.forEach(particle => {
                if (particle && particle.parentNode) {
                    particle.parentNode.removeChild(particle);
                }
            });
            particlePool.length = 0; // Clear array in place
            
            // Remove all particles from DOM
            const particles = document.querySelectorAll('.particle-trail');
            particles.forEach(particle => {
                if (particle && particle.parentNode) {
                    particle.parentNode.removeChild(particle);
                }
            });
            
            // Force filter remaining emojis to be collected
            emojis = emojis.filter(emoji => !emoji.removed);
            const removeBalloons = Math.floor(heartBalloons.length / 2);
            for (let i = 0; i < removeBalloons; i++) {
                if (heartBalloons.length > 0) {
                    removeHeartBalloon(heartBalloons[0]);
                    heartBalloons = heartBalloons.filter(balloon => !balloon.removed);
                }
            }
            
            // Hint for garbage collection (only available in debug mode)
            try {
                if (typeof window.gc === 'function') {
                    window.gc();
                }
            } catch (e) {
                // GC not available, that's okay
            }
            
            const endEmojis = emojis.length;
            const endBodies = engine ? engine.world.bodies.length : 0;
            
            console.log(`[OBS HUD] 🧹 Cleanup complete:`);
            console.log(`   - Emojis: ${startEmojis} → ${endEmojis} (removed ${startEmojis - endEmojis})`);
            console.log(`   - Bodies: ${startBodies} → ${endBodies}`);
            console.log(`   - Particles: ${startParticles} → 0`);
        }

        /**
         * Apply color filter based on theme
         * BUG 9 fix: use data-attributes and combineFilters() to prevent color overwriting pixel filter
         */
        function applyColorTheme(element, emoji = null) {
            let colorFilter = '';

            if (emoji && emoji.userColor) {
                colorFilter = `hue-rotate(${emoji.userColor}deg)`;
            } else if (config.rainbow_enabled) {
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

            element.setAttribute('data-color-filter', colorFilter);
            combineFilters(element);
        }

        /**
         * Apply pixel effect
         * BUG 8 fix: apply imageRendering on img element, use blur+contrast for text emojis
         */
        function applyPixelEffect(element) {
            let pixelFilter = '';

            if (config.pixel_enabled) {
                const img = element.querySelector('img');
                if (img) {
                    img.style.imageRendering = 'pixelated';
                } else {
                    const pixelAmount = config.pixel_size || 4;
                    const PIXEL_BLUR_MULTIPLIER = 0.5;
                    const PIXEL_CONTRAST = 2;
                    const blurAmount = pixelAmount * PIXEL_BLUR_MULTIPLIER;
                    pixelFilter = `blur(${blurAmount}px) contrast(${PIXEL_CONTRAST})`;
                }
            } else {
                const img = element.querySelector('img');
                if (img) {
                    img.style.imageRendering = '';
                }
            }

            element.setAttribute('data-pixel-filter', pixelFilter);
            combineFilters(element);
        }

        /**
         * Combine color and pixel filters without one overwriting the other
         * BUG 9 fix: mirrors engine.js combineFilters()
         */
        function combineFilters(element) {
            const colorFilter = element.getAttribute('data-color-filter') || '';
            const pixelFilter = element.getAttribute('data-pixel-filter') || '';
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
                    filter: drop-shadow(0 8px 14px rgba(0,0,0,0.28)) drop-shadow(0 0 18px rgba(255,255,255,0.22));
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
                    text-shadow: 0 4px 12px rgba(0,0,0,0.3), 0 0 18px rgba(255,255,255,0.24);
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
                    background: rgba(255,255,255,0.88);
                    box-shadow: 0 0 0 3px rgba(255,255,255,0.35), 0 8px 20px rgba(0,0,0,0.32);
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

        // Main update loop with dynamic FPS targeting
        function updateLoop(currentTime) {
            // Calculate delta time
            const deltaTime = currentTime - lastUpdateTime;

            // BUG 7 fix: calculate targetFrameTime dynamically based on config.target_fps
            const targetFrameTime = 1000 / (config.target_fps || 60);

            // Throttle to target FPS
            if (deltaTime < targetFrameTime) {
                requestAnimationFrame(updateLoop);
                return;
            }

            lastUpdateTime = currentTime - (deltaTime % targetFrameTime);

            // Update FPS counter
            frameCount++;
            if (currentTime - fpsUpdateTime >= 1000) {
                fps = Math.round(frameCount * 1000 / (currentTime - fpsUpdateTime));
                frameCount = 0;
                fpsUpdateTime = currentTime;
                
                // Freeze detection failsafe for OBS browser
                if (freezeDetectionEnabled) {
                    if (fps === 0) {
                        frozenFrameCount++;
                        
                        // Show warning after first frozen second
                        if (frozenFrameCount === 1 && !freezeWarningShown) {
                            console.warn('[OBS HUD] ⚠️ FPS dropped to 0, monitoring for freeze...');
                            freezeWarningShown = true;
                        }
                        
                        // Auto-reload after sustained freeze to prevent OBS cache buildup
                        if (frozenFrameCount >= MAX_FROZEN_FRAMES) {
                            console.error(`[OBS HUD] 🔄 FPS frozen for ${MAX_FROZEN_FRAMES} seconds, auto-reloading to prevent OBS cache issues...`);
                            // Show visual warning before reload
                            showFreezeWarning();
                            // Perform aggressive cleanup before reload
                            performAggressiveCleanup();
                            // Reload after 2 seconds to allow warning to be visible
                            setTimeout(() => {
                                window.location.reload();
                            }, 2000);
                            return; // Stop processing this frame
                        }
                    } else {
                        // FPS recovered, reset freeze counter
                        if (frozenFrameCount > 0) {
                            console.log(`[OBS HUD] ✅ FPS recovered (was frozen for ${frozenFrameCount}s)`);
                        }
                        frozenFrameCount = 0;
                        freezeWarningShown = false;
                    }
                }
                
                // Memory pressure detection for OBS browser cache prevention
                if (performance.memory && currentTime - lastMemoryCheck >= MEMORY_CHECK_INTERVAL) {
                    lastMemoryCheck = currentTime;
                    const memoryMB = performance.memory.usedJSHeapSize / 1048576;
                    
                    if (memoryMB > MEMORY_CRITICAL_THRESHOLD_MB) {
                        console.error(`[OBS HUD] 🚨 Critical memory usage: ${memoryMB.toFixed(2)}MB - Force reloading to prevent OBS crash...`);
                        // Show visual warning
                        showMemoryWarning(memoryMB);
                        // Perform aggressive cleanup
                        performAggressiveCleanup();
                        // Force reload to clear OBS browser cache
                        setTimeout(() => {
                            window.location.reload();
                        }, 2000);
                        return;
                    } else if (memoryMB > MEMORY_PRESSURE_THRESHOLD_MB) {
                        console.warn(`[OBS HUD] ⚠️ High memory usage: ${memoryMB.toFixed(2)}MB - Performing aggressive cleanup...`);
                        performAggressiveCleanup();
                    }
                }
            }

            // Run physics engine step (clamp delta to prevent warnings)
            const clampedDelta = Math.min(deltaTime, targetFrameTime);
            Engine.update(engine, clampedDelta);
            
            // Process rate limit queue (if enabled)
            processRateLimitQueue();

            // Update rainbow hue
            if (config.rainbow_enabled) {
                rainbowHueOffset = (rainbowHueOffset + config.rainbow_speed) % 360;
            }

            // BUG 5 fix: calculate wind force via shared calculateWindForce() function
            const currentWindForce = calculateWindForce();

            // Update all emojis
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

                    // BUG 5 fix: only apply wind when wind_enabled is true
                    if (config.wind_enabled) {
                        Body.applyForce(emoji.body, emoji.body.position, {
                            x: currentWindForce,
                            y: 0
                        });
                    }

                    // Apply air resistance
                    const velocity = emoji.body.velocity;
                    const airResistance = Math.min(1, Math.max(0, config.physics_air));
                    Body.setVelocity(emoji.body, {
                        x: velocity.x * (1 - airResistance),
                        y: velocity.y * (1 - airResistance)
                    });

                    // Update DOM element position and rotation (optimized)
                    if (emoji.element) {
                        const px = emoji.body.position.x;
                        const py = emoji.body.position.y;
                        const rotation = emoji.body.angle + emoji.rotation;
                        emoji.rotation += config.emoji_rotation_speed;

                        // Use transform for better performance
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

            // Limit max emojis (remove oldest first)
            while (emojis.length > config.max_emojis_on_screen) {
                const oldest = emojis[0];
                removeEmoji(oldest);
            }

            // Update performance HUD
            if (perfHudVisible) {
                updatePerfHUD(currentTime);
            }

            requestAnimationFrame(updateLoop);
        }

        /**
         * Calculate wind force based on configuration
         * BUG 5 fix: mirrors calculateWindForce() from engine.js
         * <!-- SHARED MODULE CANDIDATE: extract to emoji-rain-shared.js -->
         */
        function calculateWindForce() {
            if (!config.wind_enabled) {
                return 0;
            }
            const maxWindForce = (config.wind_strength / 100) * WIND_FORCE_MULTIPLIER;
            if (config.wind_direction === 'left') {
                return -maxWindForce;
            } else if (config.wind_direction === 'right') {
                return maxWindForce;
            } else {
                windForce += (Math.random() - 0.5) * maxWindForce * WIND_AUTO_VARIATION;
                windForce = Math.max(-maxWindForce, Math.min(maxWindForce, windForce));
                return windForce;
            }
        }

        // Spawn emoji with enhanced effects
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

            // BUG 1 fix: normalize x with safety margins to prevent emojis getting stuck in walls
            if (!canvasWidth || canvasWidth <= 0 || isNaN(canvasWidth)) {
                canvasWidth = 1920;
            }
            if (!canvasHeight || canvasHeight <= 0 || isNaN(canvasHeight)) {
                canvasHeight = 1080;
            }

            const minMargin = WALL_THICKNESS / 2 + size / 2;
            if (x >= 0 && x <= 1) {
                const safeWidth = canvasWidth - (minMargin * 2);
                if (safeWidth > 0) {
                    x = minMargin + (x * safeWidth);
                } else {
                    x = canvasWidth / 2;
                }
            } else {
                const minX = minMargin;
                const maxX = canvasWidth - minMargin;
                x = Math.max(minX, Math.min(maxX, x));
            }

            if (isNaN(x) || !isFinite(x)) {
                x = canvasWidth / 2;
            }
            if (isNaN(y) || !isFinite(y)) {
                y = 0;
            }

            y = normalizeCanvasY(y, size);

            // Create physics body (circle)
            const radius = size / 2;
            const body = Bodies.circle(x, y, radius, {
                friction: config.physics_friction,
                restitution: config.physics_restitution,
                density: 0.01,
                frictionAir: config.physics_air // BUG 6 fix: use config.physics_air instead of hardcoded 0
            });

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
            // BUG 2 fix: register in emojiBodyMap for O(1) collision lookup
            emojiBodyMap.set(body, emojiObj);

            // Apply pixel effect and color theme to the new emoji element
            applyPixelEffect(element);
            applyColorTheme(element, emojiObj);

            return emojiObj;
        }

        // Fade out emoji
        function fadeOutEmoji(emoji) {
            if (emoji.fading || emoji.removed) return;

            emoji.fading = true;
            if (emoji.element) {
                const fadeDuration = Math.max(0, Number(config.emoji_fade_duration_ms) || 0);
                emoji.element.style.transition = `opacity ${fadeDuration}ms ease, scale ${fadeDuration}ms ease-out, filter 0.3s ease`;
                emoji.element.style.scale = '0.1';
                emoji.element.classList.add('fading');
            }

            // Clear any pending timeout before setting a new one
            if (emoji.fadeTimeout) {
                clearTimeout(emoji.fadeTimeout);
            }
            
            emoji.fadeTimeout = setTimeout(() => {
                removeEmoji(emoji);
                emoji.fadeTimeout = null;
            }, config.emoji_fade_duration_ms);
        }

        // Remove emoji (with proper cleanup)
        function removeEmoji(emoji) {
            if (emoji.removed) return;

            emoji.removed = true;

            // Clean up all pending timeouts to prevent memory leaks
            if (emoji.fadeTimeout) {
                clearTimeout(emoji.fadeTimeout);
                emoji.fadeTimeout = null;
            }
            if (emoji.bounceTimeout) {
                clearTimeout(emoji.bounceTimeout);
                emoji.bounceTimeout = null;
            }
            if (emoji.glowTimeout) {
                clearTimeout(emoji.glowTimeout);
                emoji.glowTimeout = null;
            }
            if (emoji.groundPopTimeout) {
                clearTimeout(emoji.groundPopTimeout);
                emoji.groundPopTimeout = null;
            }

            // Remove from physics world
            if (emoji.body) {
                // BUG 2 fix: remove from emojiBodyMap before removing from world
                emojiBodyMap.delete(emoji.body);
                World.remove(engine.world, emoji.body);
                emoji.body = null;
            }

            // Remove DOM element
            if (emoji.element && emoji.element.parentNode) {
                emoji.element.parentNode.removeChild(emoji.element);
                emoji.element = null;
            }
        }

        /**
         * Calculate offsetX with safety clamping to prevent negative or out-of-bounds coordinates
         * BUG 12 fix: mirrors calculateOffsetX() from engine.js
         * <!-- SHARED MODULE CANDIDATE: extract to emoji-rain-shared.js -->
         */
        function calculateOffsetX(x) {
            if (x >= 0 && x <= 1) {
                return Math.max(0, Math.min(1, x + (Math.random() - 0.5) * 0.2));
            } else {
                return x + (Math.random() - 0.5) * 100;
            }
        }

        // Handle spawn event from server
        function handleSpawnEvent(data) {
            if (!config.enabled || !config.obs_hud_enabled) return;

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
            const color = data.color || null;

            console.log(`🌧️ [OBS HUD SPAWN] count=${count}, emoji=${emoji}, username=${username}, color=${color}, profilePictureUrl=${profilePictureUrl ? 'present' : 'none'}`);

            // If rate limiting is enabled, add individual emojis to the rate limit queue
            if (config.rate_limit_enabled && config.rate_limit_emojis_per_second > 0) {
                // BUG 11 fix: enforce max queue size to prevent unbounded memory growth
                if (rateLimitQueue.length + count > MAX_RATE_LIMIT_QUEUE_SIZE) {
                    const excess = rateLimitQueue.length + count - MAX_RATE_LIMIT_QUEUE_SIZE;
                    console.warn(`⚠️ [OBS HUD RATE LIMIT] Queue near limit, dropping ${excess} oldest entries`);
                    rateLimitQueue.splice(0, excess);
                }
                for (let i = 0; i < count; i++) {
                    const size = config.emoji_min_size_px + Math.random() * (config.emoji_max_size_px - config.emoji_min_size_px);
                    const offsetX = calculateOffsetX(x); // BUG 12 fix: use calculateOffsetX with clamping
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
                
                console.log(`⏱️ [OBS HUD RATE LIMIT] Queued ${count} emojis (queue size: ${rateLimitQueue.length})`);
            } else {
                // No rate limiting - spawn immediately
                for (let i = 0; i < count; i++) {
                    const size = config.emoji_min_size_px + Math.random() * (config.emoji_max_size_px - config.emoji_min_size_px);
                    const offsetX = calculateOffsetX(x); // BUG 12 fix: use calculateOffsetX with clamping
                    const offsetY = calculateOffsetY(y, i, size);

                    spawnEmoji(emoji, offsetX, offsetY, size, username, profilePictureUrl, color);
                }

                console.log(`🌧️ Spawned ${count}x ${emoji} at (${x.toFixed(2)}, ${y})${username ? ' for ' + username : ''}`);
            }
        }
        
        // Process rate limit queue - spawns emojis respecting the per-second limit
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
            
            if (emojisToSpawn > 0) {
                console.log(`⏱️ [OBS HUD RATE LIMIT] Spawned ${emojisToSpawn} emojis (${emojisSpawnedThisSecond}/${maxEmojisPerSecond} this second, ${rateLimitQueue.length} queued)`);
            }
        }

        // Get random emoji from config
        function getRandomEmoji() {
            if (config.emoji_set && config.emoji_set.length > 0) {
                return config.emoji_set[Math.floor(Math.random() * config.emoji_set.length)];
            }
            return '❓';
        }

        // Update performance HUD
        function updatePerfHUD(currentTime) {
            document.getElementById('fps').textContent = fps;
            document.getElementById('fps').className = fps < 30 ? 'perf-critical' : (fps < 50 ? 'perf-warning' : '');

            document.getElementById('emoji-count').textContent = emojis.length;
            document.getElementById('emoji-max').textContent = config.max_emojis_on_screen;

            document.getElementById('body-count').textContent = engine.world.bodies.length;

            // Memory usage (if available)
            if (performance.memory) {
                const memoryMB = (performance.memory.usedJSHeapSize / 1048576).toFixed(2);
                document.getElementById('memory-usage').textContent = memoryMB;
            }

            // Frame time
            const frameTime = (currentTime - lastFrameTime).toFixed(2);
            document.getElementById('frame-time').textContent = frameTime;
            lastFrameTime = currentTime;

            document.getElementById('perf-resolution').textContent = `${canvasWidth}x${canvasHeight}`;
        }

        // Update resolution indicator
        function updateResolutionIndicator() {
            const indicator = document.getElementById('resolution-indicator');
            indicator.textContent = `OBS HUD: ${canvasWidth}x${canvasHeight}`;
        }

        // Load configuration from server
        async function loadConfig() {
            try {
                const response = await fetch('/api/webgpu-emoji-rain/config');
                const data = await response.json();

                if (data.success && data.config) {
                    Object.assign(config, data.config);
                    console.log('✅ Config loaded', config);

                    // Update physics
                    if (engine) {
                        engine.gravity.y = config.physics_gravity_y;

                        // Update canvas size if resolution changed
                        const newWidth = config.obs_hud_width || config.width_px || 1920;
                        const newHeight = config.obs_hud_height || config.height_px || 1080;

                        if (newWidth !== canvasWidth || newHeight !== canvasHeight) {
                            resizeCanvas(newWidth, newHeight);
                        }
                    }

                    // Apply or remove toaster mode based on config
                    if (config.toaster_mode) {
                        applyToasterMode();
                    } else {
                        removeToasterMode();
                    }
                }
            } catch (error) {
                console.error('❌ Failed to load config:', error);
            }
        }

        // Load user emoji mappings
        async function loadUserEmojiMappings() {
            try {
                const response = await fetch('/api/webgpu-emoji-rain/user-mappings');
                const data = await response.json();

                if (data.success && data.mappings) {
                    userEmojiMap = data.mappings;
                    console.log('✅ [OBS HUD] User emoji mappings loaded:', userEmojiMap);
                    console.log('👤 [USER MAPPINGS] Total mappings:', Object.keys(userEmojiMap).length);
                    console.log('👤 [USER MAPPINGS] Users:', Object.keys(userEmojiMap).join(', '));
                }
            } catch (error) {
                console.error('❌ Failed to load user emoji mappings:', error);
            }
        }

        // Resize canvas and physics world
        function resizeCanvas(newWidth, newHeight) {
            canvasWidth = newWidth;
            canvasHeight = newHeight;

            const container = document.getElementById('canvas-container');
            container.style.width = canvasWidth + 'px';
            container.style.height = canvasHeight + 'px';

            // Update world boundaries
            const thickness = 100;

            Body.setPosition(ground, {
                x: canvasWidth / 2,
                y: canvasHeight + thickness / 2
            });
            Body.setVertices(ground, Bodies.rectangle(0, 0, canvasWidth + thickness * 2, thickness).vertices);

            Body.setPosition(leftWall, {
                x: -thickness / 2,
                y: canvasHeight / 2
            });
            Body.setVertices(leftWall, Bodies.rectangle(0, 0, thickness, canvasHeight + thickness * 2).vertices);

            Body.setPosition(rightWall, {
                x: canvasWidth + thickness / 2,
                y: canvasHeight / 2
            });
            Body.setVertices(rightWall, Bodies.rectangle(0, 0, thickness, canvasHeight + thickness * 2).vertices);

            updateResolutionIndicator();
            console.log(`📐 Canvas resized to ${canvasWidth}x${canvasHeight}`);
        }

        // Socket.IO setup
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
                rateLimitQueue = [];
            });

            socket.on('webgpu-emoji-rain:config-update', (data) => {
                if (data.config) {
                    const oldToasterMode = config.toaster_mode;
                    Object.assign(config, data.config);
                    console.log('🔄 Config updated', config);

                    // Handle toaster mode change
                    if (config.toaster_mode !== oldToasterMode) {
                        if (config.toaster_mode) {
                            applyToasterMode();
                        } else {
                            removeToasterMode();
                        }
                    }

                    if (engine) {
                        engine.gravity.y = config.physics_gravity_y;

                        // BUG 4 fix: handle floor toggle on config update
                        if (data.config.floor_enabled !== undefined) {
                            if (config.floor_enabled) {
                                if (!engine.world.bodies.includes(ground)) {
                                    World.add(engine.world, ground);
                                }
                            } else {
                                if (engine.world.bodies.includes(ground)) {
                                    World.remove(engine.world, ground);
                                }
                            }
                        }

                        const newWidth = config.obs_hud_width || config.width_px || 1920;
                        const newHeight = config.obs_hud_height || config.height_px || 1080;

                        if (newWidth !== canvasWidth || newHeight !== canvasHeight) {
                            resizeCanvas(newWidth, newHeight);
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
                    console.log('🔄 [OBS HUD] User emoji mappings updated', userEmojiMap);
                    console.log('👤 [USER MAPPINGS UPDATE] Total mappings:', Object.keys(userEmojiMap).length);
                    console.log('👤 [USER MAPPINGS UPDATE] Users:', Object.keys(userEmojiMap).join(', '));
                }
            });
        }

        // Initialize everything
        async function init() {
            console.log('🌧️ Initializing OBS HUD Emoji Rain Overlay...');

            await loadConfig();
            await loadUserEmojiMappings();
            initPhysics();
            initSocket();

            // Start update loop
            requestAnimationFrame(updateLoop);
            
            // Start periodic cleanup timer for OBS cache prevention
            // Clean up every 30 seconds to prevent gradual buildup
            setInterval(() => {
                if (emojis.length > config.max_emojis_on_screen * 0.8) {
                    console.log('[OBS HUD] 🧹 Periodic cleanup triggered (emoji count high)');
                    const removeCount = Math.floor(emojis.length * 0.3);
                    for (let i = 0; i < removeCount && emojis.length > 0; i++) {
                        removeEmoji(emojis[0]);
                    }
                }
                if (heartBalloons.length > config.max_emojis_on_screen * 0.8) {
                    const removeCount = Math.floor(heartBalloons.length * 0.3);
                    for (let i = 0; i < removeCount && heartBalloons.length > 0; i++) {
                        removeHeartBalloon(heartBalloons[0]);
                        heartBalloons = heartBalloons.filter(balloon => !balloon.removed);
                    }
                }
            }, 30000);

            console.log('✅ OBS HUD Emoji Rain Overlay ready!');
            console.log('🛡️ Freeze detection and OBS cache prevention active');
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl+P: Toggle performance HUD
            if (e.key === 'p' && e.ctrlKey) {
                e.preventDefault();
                perfHudVisible = !perfHudVisible;
                document.getElementById('perf-hud').classList.toggle('visible', perfHudVisible);
                console.log('Performance HUD: ' + perfHudVisible);
            }

            // Ctrl+R: Toggle resolution indicator
            if (e.key === 'r' && e.ctrlKey) {
                e.preventDefault();
                resolutionIndicatorVisible = !resolutionIndicatorVisible;
                document.getElementById('resolution-indicator').classList.toggle('visible', resolutionIndicatorVisible);
                console.log('Resolution indicator: ' + resolutionIndicatorVisible);
            }

            // Ctrl+T: Test spawn
            if (e.key === 't' && e.ctrlKey) {
                e.preventDefault();
                handleSpawnEvent({ count: 10 });
                console.log('Test spawn triggered');
            }
        });

        // Start when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }

        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
            // Clean up all emojis
            emojis.forEach(emoji => removeEmoji(emoji));
            heartBalloons.forEach(balloon => removeHeartBalloon(balloon));
            heartBalloons = [];

            // BUG 2 fix: clear emojiBodyMap on unload
            emojiBodyMap.clear();

            // Clear rate limit queue
            rateLimitQueue = [];

            // Clear particle pool
            particlePool = [];

            console.log('🧹 Cleanup completed');
        });

        // OBS Browser Source specific: Handle visibility changes
        // When OBS hides the browser source, we should cleanup to prevent cache buildup
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                console.log('[OBS HUD] 👁️ Overlay hidden - performing cleanup to prevent cache buildup');
                performAggressiveCleanup();
            } else {
                console.log('[OBS HUD] 👁️ Overlay visible again');
                // Reset freeze detection when becoming visible again
                frozenFrameCount = 0;
                freezeWarningShown = false;
            }
        });

        // Additional OBS-specific cleanup on page hide
        window.addEventListener('pagehide', () => {
            console.log('[OBS HUD] 📄 Page hiding - final cleanup');
            performAggressiveCleanup();
        });
