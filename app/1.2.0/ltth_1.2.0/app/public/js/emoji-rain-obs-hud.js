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
            physics_wind_strength: 0.0005,
            physics_wind_variation: 0.0003,
            emoji_min_size_px: 40,
            emoji_max_size_px: 80,
            emoji_rotation_speed: 0.05,
            emoji_lifetime_ms: 8000,
            emoji_fade_duration_ms: 1000,
            max_emojis_on_screen: 200,
            like_count_divisor: 10,
            like_min_emojis: 1,
            like_max_emojis: 20,
            gift_base_emojis: 3,
            gift_coin_multiplier: 0.1,
            gift_max_emojis: 50,
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

        // State
        let engine, render;
        let socket;
        let emojis = []; // Track emoji bodies and DOM elements
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
        const TARGET_FRAME_TIME = 1000 / 60; // 60 FPS target
        const COLOR_UPDATE_THROTTLE_MS = 100; // Throttle non-rainbow color updates for performance
        let lastUpdateTime = performance.now();

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

            World.add(engine.world, [ground, leftWall, rightWall]);

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
                    const emoji = emojis.find(e => e.body === emojiBody);

                    // Allow bounce effect to trigger multiple times, but rate-limit to avoid excessive triggers
                    const now = performance.now();
                    if (emoji && !emoji.removed) {
                        // Only trigger bounce if enough time has passed since last bounce (prevent spam)
                        if (!emoji.lastBounceTime || now - emoji.lastBounceTime > 300) {
                            emoji.lastBounceTime = now;
                            triggerBounceEffect(emoji);
                        }
                    }
                }
            });
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
         * Apply color filter based on theme
         */
        function applyColorTheme(element, emoji = null) {
            // Check for user-specific color first
            if (emoji && emoji.userColor) {
                element.style.filter = `hue-rotate(${emoji.userColor}deg)`;
                return;
            }

            if (config.rainbow_enabled) {
                // Rainbow takes precedence
                const hue = rainbowHueOffset % 360;
                element.style.filter = `hue-rotate(${hue}deg)`;
                return;
            }

            if (config.color_mode === 'off') {
                element.style.filter = '';
                return;
            }

            const intensity = config.color_intensity;
            let filter = '';

            switch (config.color_mode) {
                case 'warm':
                    filter = `sepia(${intensity * 0.8}) saturate(${1 + intensity * 0.5}) brightness(${1 + intensity * 0.2})`;
                    break;
                case 'cool':
                    filter = `hue-rotate(180deg) saturate(${1 + intensity}) brightness(${0.9 + intensity * 0.1})`;
                    break;
                case 'neon':
                    filter = `saturate(${2 + intensity * 2}) brightness(${1.2 + intensity * 0.3}) contrast(${1.2})`;
                    break;
                case 'pastel':
                    filter = `saturate(${0.5 + intensity * 0.3}) brightness(${1.1 + intensity * 0.2})`;
                    break;
            }

            element.style.filter = filter;
        }

        /**
         * Apply pixel effect
         */
        function applyPixelEffect(element) {
            if (!config.pixel_enabled) {
                element.style.imageRendering = '';
                return;
            }

            element.style.imageRendering = 'pixelated';
        }

        // Main update loop with 60 FPS targeting
        function updateLoop(currentTime) {
            // Calculate delta time
            const deltaTime = currentTime - lastUpdateTime;

            // Throttle to target FPS
            if (deltaTime < TARGET_FRAME_TIME) {
                requestAnimationFrame(updateLoop);
                return;
            }

            lastUpdateTime = currentTime - (deltaTime % TARGET_FRAME_TIME);

            // Update FPS counter
            frameCount++;
            if (currentTime - fpsUpdateTime >= 1000) {
                fps = Math.round(frameCount * 1000 / (currentTime - fpsUpdateTime));
                frameCount = 0;
                fpsUpdateTime = currentTime;
            }

            // Run physics engine step (clamp delta to prevent warnings)
            const clampedDelta = Math.min(deltaTime, TARGET_FRAME_TIME);
            Engine.update(engine, clampedDelta);

            // Update rainbow hue
            if (config.rainbow_enabled) {
                rainbowHueOffset = (rainbowHueOffset + config.rainbow_speed) % 360;
            }

            // Apply wind force to all emojis
            windForce += (Math.random() - 0.5) * config.physics_wind_variation;
            windForce = Math.max(-config.physics_wind_strength, Math.min(config.physics_wind_strength, windForce));

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

                    // Apply wind
                    Body.applyForce(emoji.body, emoji.body.position, {
                        x: windForce,
                        y: 0
                    });

                    // Apply air resistance
                    const velocity = emoji.body.velocity;
                    Body.setVelocity(emoji.body, {
                        x: velocity.x * (1 - config.physics_air),
                        y: velocity.y * (1 - config.physics_air)
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

        // Spawn emoji with enhanced effects
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

            // Normalize x position (0-1 to px)
            if (x >= 0 && x <= 1) {
                x = x * canvasWidth;
            }

            // Create physics body (circle)
            const radius = size / 2;
            const body = Bodies.circle(x, y, radius, {
                friction: config.physics_friction,
                restitution: config.physics_restitution,
                density: 0.01,
                frictionAir: 0
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

            // Set initial position with explicit position style to prevent top-left corner freeze
            element.style.position = 'absolute';
            element.style.left = '0';
            element.style.top = '0';
            element.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;

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

            // Remove from physics world
            if (emoji.body) {
                World.remove(engine.world, emoji.body);
                emoji.body = null;
            }

            // Remove DOM element
            if (emoji.element && emoji.element.parentNode) {
                emoji.element.parentNode.removeChild(emoji.element);
                emoji.element = null;
            }
        }

        // Handle spawn event from server
        function handleSpawnEvent(data) {
            if (!config.enabled || !config.obs_hud_enabled) return;

            const count = data.count || 1;
            const emoji = data.emoji || getRandomEmoji();
            const x = data.x !== undefined ? data.x : Math.random();
            const y = data.y !== undefined ? data.y : 0;
            const username = data.username || null;
            const color = data.color || null;

            console.log(`🌧️ [OBS HUD SPAWN] count=${count}, emoji=${emoji}, username=${username}, color=${color}`);

            for (let i = 0; i < count; i++) {
                const size = config.emoji_min_size_px + Math.random() * (config.emoji_max_size_px - config.emoji_min_size_px);
                const offsetX = x + (Math.random() - 0.5) * 0.2;
                const offsetY = y - i * 5;

                spawnEmoji(emoji, offsetX, offsetY, size, username, color);
            }

            console.log(`🌧️ Spawned ${count}x ${emoji} at (${x.toFixed(2)}, ${y})${username ? ' for ' + username : ''}`);
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
                const response = await fetch('/api/emoji-rain/config');
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
                const response = await fetch('/api/emoji-rain/user-mappings');
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

            socket.on('emoji-rain:spawn', (data) => {
                handleSpawnEvent(data);
            });

            socket.on('emoji-rain:config-update', (data) => {
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

                        const newWidth = config.obs_hud_width || config.width_px || 1920;
                        const newHeight = config.obs_hud_height || config.height_px || 1080;

                        if (newWidth !== canvasWidth || newHeight !== canvasHeight) {
                            resizeCanvas(newWidth, newHeight);
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

            console.log('✅ OBS HUD Emoji Rain Overlay ready!');
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

            // Clear particle pool
            particlePool = [];

            console.log('🧹 Cleanup completed');
        });
