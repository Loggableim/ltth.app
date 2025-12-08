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
            width_px: 1280,
            height_px: 720,
            emoji_set: ["💧","💙","💚","💜","❤️","🩵","✨","🌟","🔥","🎉"],
            use_custom_images: false,
            image_urls: [],
            effect: 'bounce', // 'bounce' | 'bubble' | 'none'
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
            gift_max_emojis: 50
        };

        // State
        let engine, render;
        let socket;
        let emojis = []; // Track emoji bodies and DOM elements
        let windForce = 0;
        let debugMode = false; // Set to true to show debug info
        let ground, leftWall, rightWall; // Store boundaries for dynamic resizing
        let canvasWidth, canvasHeight; // Current canvas dimensions

        // Initialize physics engine
        function initPhysics() {
            // Use window dimensions instead of config dimensions
            canvasWidth = window.innerWidth;
            canvasHeight = window.innerHeight;

            // Create engine
            engine = Engine.create({
                enableSleeping: false
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

            // Listen for collision with ground for bubble effect
            Events.on(engine, 'collisionStart', handleCollision);

            console.log(`✅ Physics initialized at ${canvasWidth}x${canvasHeight}`);
        }

        // Handle collision events (for bubble animation)
        function handleCollision(event) {
            if (config.effect === 'none') return;

            event.pairs.forEach(pair => {
                // Check if one of the bodies is the ground
                if (pair.bodyA.label === 'ground' || pair.bodyB.label === 'ground') {
                    const emojiBody = pair.bodyA.label === 'ground' ? pair.bodyB : pair.bodyA;

                    // Find emoji object
                    const emoji = emojis.find(e => e.body === emojiBody);
                    
                    // Allow bounce effect to trigger multiple times, but rate-limit to avoid excessive triggers
                    const now = performance.now();
                    if (emoji && !emoji.removed) {
                        // Only trigger bounce if enough time has passed since last bounce (prevent spam)
                        if (!emoji.lastBounceTime || now - emoji.lastBounceTime > 300) {
                            emoji.lastBounceTime = now;
                            triggerBubbleEffect(emoji);
                        }
                    }
                }
            });
        }

        // Trigger bubble/blop animation
        function triggerBubbleEffect(emoji) {
            if (!emoji.element || config.effect === 'none') return;

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

            // Optional: play sound (can be added later)
            // new Audio('/sounds/pop.mp3').play().catch(() => {});
        }

        // Resize canvas and physics world
        function resizeCanvas() {
            const newWidth = window.innerWidth;
            const newHeight = window.innerHeight;

            if (newWidth === canvasWidth && newHeight === canvasHeight) return;

            canvasWidth = newWidth;
            canvasHeight = newHeight;

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

            console.log(`📐 Canvas resized to ${canvasWidth}x${canvasHeight}`);
        }

        // Performance tracking
        let lastUpdateTime = performance.now();
        let frameCount = 0;
        let fps = 60;
        let fpsUpdateTime = performance.now();
        const TARGET_FRAME_TIME = 1000 / 60; // 60 FPS target

        // Main update loop with optimized performance
        function updateLoop(currentTime) {
            // Calculate delta time
            const deltaTime = currentTime - lastUpdateTime;

            // Throttle to target FPS (60 FPS)
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

            // Apply wind force to all emojis
            windForce += (Math.random() - 0.5) * config.physics_wind_variation;
            windForce = Math.max(-config.physics_wind_strength, Math.min(config.physics_wind_strength, windForce));

            emojis.forEach(emoji => {
                if (emoji.body) {
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

                    // Update DOM element position and rotation (optimized with transform3d)
                    if (emoji.element) {
                        const px = emoji.body.position.x;
                        const py = emoji.body.position.y;
                        const rotation = emoji.body.angle + emoji.rotation;
                        emoji.rotation += config.emoji_rotation_speed;

                        // Use transform3d for hardware acceleration
                        emoji.element.style.transform = `translate3d(${px}px, ${py}px, 0) translate(-50%, -50%) rotate(${rotation}rad)`;
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

            // Remove faded emojis (optimized filter)
            emojis = emojis.filter(emoji => !emoji.removed);

            // Limit max emojis (remove oldest first)
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

        // Spawn emoji
        function spawnEmoji(emoji, x, y, size) {
            // Normalize x position (0-1 to px) using canvasWidth
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

            // Add initial velocity (slight randomness)
            Body.setVelocity(body, {
                x: (Math.random() - 0.5) * 2,
                y: Math.random() * 2
            });

            // Add to world
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
                lastBounceTime: 0 // Track last bounce time to prevent spam
            };

            emojis.push(emojiObj);

            return emojiObj;
        }

        // Fade out emoji
        function fadeOutEmoji(emoji) {
            if (emoji.fading) return;

            emoji.fading = true;
            emoji.element.classList.add('fading');

            setTimeout(() => {
                removeEmoji(emoji);
            }, config.emoji_fade_duration_ms);
        }

        // Remove emoji
        function removeEmoji(emoji) {
            if (emoji.removed) return;

            emoji.removed = true;

            // Clean up any pending timeouts to prevent memory leaks
            if (emoji.bounceAnimationTimeout) {
                clearTimeout(emoji.bounceAnimationTimeout);
                emoji.bounceAnimationTimeout = null;
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
            if (!config.enabled) return;

            const count = data.count || 1;
            const emoji = data.emoji || getRandomEmoji();
            const x = data.x !== undefined ? data.x : Math.random();
            const y = data.y !== undefined ? data.y : 0;

            for (let i = 0; i < count; i++) {
                const size = config.emoji_min_size_px + Math.random() * (config.emoji_max_size_px - config.emoji_min_size_px);
                const offsetX = x + (Math.random() - 0.5) * 0.2; // Spread horizontally
                const offsetY = y - i * 5; // Stack vertically

                spawnEmoji(emoji, offsetX, offsetY, size);
            }

            console.log(`🌧️ Spawned ${count}x ${emoji} at (${x.toFixed(2)}, ${y})`);
        }

        // Get random emoji from config
        function getRandomEmoji() {
            if (config.emoji_set && config.emoji_set.length > 0) {
                return config.emoji_set[Math.floor(Math.random() * config.emoji_set.length)];
            }
            return '❓';
        }

        // Calculate emoji count for likes
        function calculateLikeEmojis(likeCount) {
            const count = Math.floor(likeCount / config.like_count_divisor);
            return Math.max(config.like_min_emojis, Math.min(config.like_max_emojis, count));
        }

        // Calculate emoji count for gifts
        function calculateGiftEmojis(coins) {
            const count = config.gift_base_emojis + Math.floor(coins * config.gift_coin_multiplier);
            return Math.min(config.gift_max_emojis, count);
        }

        // Update debug info
        function updateDebugInfo() {
            const debug = document.getElementById('debug-info');
            debug.style.display = 'block';
            debug.innerHTML = `
                <strong>Emoji Rain Debug</strong><br>
                Emojis: ${emojis.length} / ${config.max_emojis_on_screen}<br>
                Wind: ${windForce.toFixed(6)}<br>
                Bodies: ${engine.world.bodies.length}<br>
                Enabled: ${config.enabled ? 'Yes' : 'No'}
            `;
        }

        // Load configuration from server
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
                    }
                }
            } catch (error) {
                console.error('❌ Failed to load emoji rain config:', error);
            }
        }

        // Socket.IO setup
        function initSocket() {
            socket = io();

            socket.on('connect', () => {
                console.log('✅ Connected to server');
            });

            // Listen for emoji rain spawn events
            socket.on('emoji-rain:spawn', (data) => {
                handleSpawnEvent(data);
            });

            // Listen for config updates
            socket.on('emoji-rain:config-update', (data) => {
                if (data.config) {
                    Object.assign(config, data.config);
                    console.log('🔄 Config updated', config);

                    // Update physics
                    if (engine) {
                        engine.gravity.y = config.physics_gravity_y;
                    }
                }
            });

            // Listen for toggle
            socket.on('emoji-rain:toggle', (data) => {
                config.enabled = data.enabled;
                console.log('🔄 Emoji rain ' + (data.enabled ? 'enabled' : 'disabled'));
            });

            // Test event for debugging
            socket.on('emoji-rain:test', () => {
                handleSpawnEvent({ count: 10 });
            });
        }

        // Initialize everything
        async function init() {
            console.log('🌧️ Initializing Emoji Rain Overlay...');

            // Load config first
            await loadConfig();

            // Initialize physics
            initPhysics();

            // Initialize socket
            initSocket();

            // Start update loop
            requestAnimationFrame(updateLoop);

            console.log('✅ Emoji Rain Overlay ready!');
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

        // Cleanup on page unload (prevent memory leaks)
        window.addEventListener('beforeunload', () => {
            // Clean up all emojis
            emojis.forEach(emoji => removeEmoji(emoji));

            // Stop physics engine
            if (engine) {
                Engine.clear(engine);
            }

            console.log('🧹 Cleanup completed');
        });
