/**
 * Fireworks Performance Test
 * Tests FPS throttling and frame-time independent physics
 */

describe('Fireworks Performance Optimizations', () => {
    let engineCode;

    // Load the engine code once before all tests
    beforeAll(() => {
        const fs = require('fs');
        engineCode = fs.readFileSync('./plugins/fireworks/gpu/engine.js', 'utf-8');
    });

    describe('FPS Throttling', () => {
        test('should have targetFps configuration', () => {
            expect(engineCode).toContain('targetFps: 60');
            expect(engineCode).toContain('minFps: 24');
        });

        test('should implement FPS throttling in render loop', () => {
            // Verify FPS throttling code exists
            expect(engineCode).toContain('FPS Throttling');
            expect(engineCode).toContain('targetFrameTime');
            expect(engineCode).toContain('timeSinceLastRender');
            expect(engineCode).toContain('Skip this frame if we\'re rendering too fast');
        });

        test('should track lastRenderTime for FPS limiting', () => {
            // Verify lastRenderTime is initialized
            expect(engineCode).toContain('this.lastRenderTime = performance.now()');
        });
    });

    describe('Frame-Time Independent Physics', () => {
        test('should pass deltaTime to update methods', () => {
            // Verify deltaTime is calculated using IDEAL_FRAME_TIME constant
            expect(engineCode).toContain('deltaTime = Math.min((now - this.lastTime) / CONFIG.IDEAL_FRAME_TIME, 3)');
            
            // Verify deltaTime is passed to firework update
            expect(engineCode).toContain('.update(deltaTime)');
        });

        test('Particle.update should accept deltaTime parameter', () => {
            // Find Particle class update method - use string contains for clarity
            expect(engineCode).toContain('update(deltaTime = 1.0)');
        });

        test('should apply deltaTime to physics calculations', () => {
            // Verify position updates use deltaTime
            expect(engineCode).toContain('this.x += this.vx * deltaTime');
            expect(engineCode).toContain('this.y += this.vy * deltaTime');
            
            // Verify velocity updates use deltaTime
            expect(engineCode).toContain('this.vx += this.ax * deltaTime');
            expect(engineCode).toContain('this.vy += this.ay * deltaTime');
            
            // Verify rotation uses deltaTime
            expect(engineCode).toContain('this.rotation += this.rotationSpeed * deltaTime');
            
            // Verify lifespan decay uses deltaTime
            expect(engineCode).toContain('this.lifespan -= this.decay * deltaTime');
        });

        test('should use frame-independent drag', () => {
            // Verify exponential drag with deltaTime
            expect(engineCode).toContain('Math.pow(this.drag, deltaTime)');
            expect(engineCode).toContain('frame-independent');
        });

        test('should use frame-independent trail fading', () => {
            // Verify trail fade factor uses deltaTime
            expect(engineCode).toContain('trailFadeFactor = 1 - (CONFIG.trailFadeSpeed * deltaTime)');
        });
    });

    describe('FPS-Based Particle Reduction', () => {
        test('should reduce particles when FPS is low', () => {
            // Verify FPS-based reduction logic
            expect(engineCode).toContain('Additional FPS-based reduction');
            expect(engineCode).toContain('if (this.engineFps < 30)');
            expect(engineCode).toContain('if (this.engineFps < 45)');
        });

        test('should apply 50% reduction when FPS < 30', () => {
            // Verify specific reduction amounts
            expect(engineCode).toMatch(/engineFps < 30[\s\S]*?baseParticles \*= 0\.5/);
        });

        test('should apply 25% reduction when FPS < 45', () => {
            // Verify specific reduction amounts
            expect(engineCode).toMatch(/engineFps < 45[\s\S]*?baseParticles \*= 0\.75/);
        });
    });

    describe('Rendering Optimizations', () => {
        test('should cull nearly invisible particles using ALPHA_CULL_THRESHOLD', () => {
            // Verify alpha culling with constant
            expect(engineCode).toContain('Alpha culling');
            expect(engineCode).toContain('ALPHA_CULL_THRESHOLD');
            expect(engineCode).toContain('if (p.alpha < CONFIG.ALPHA_CULL_THRESHOLD) return false');
        });

        test('should define performance constants', () => {
            // Verify performance constants are defined
            expect(engineCode).toContain('IDEAL_FRAME_TIME: 16.67');
            expect(engineCode).toContain('FPS_TIMING_TOLERANCE: 1');
            expect(engineCode).toContain('ALPHA_CULL_THRESHOLD: 0.05');
        });

        test('should use IDEAL_FRAME_TIME constant for deltaTime calculation', () => {
            // Verify IDEAL_FRAME_TIME is used in deltaTime calculation
            expect(engineCode).toContain('(now - this.lastTime) / CONFIG.IDEAL_FRAME_TIME');
        });

        test('should use FPS_TIMING_TOLERANCE for frame skipping', () => {
            // Verify FPS_TIMING_TOLERANCE is used
            expect(engineCode).toContain('CONFIG.FPS_TIMING_TOLERANCE');
        });

        test('should have viewport culling', () => {
            // Verify viewport culling
            expect(engineCode).toContain('Viewport Culling');
            expect(engineCode).toContain('margin = 100');
        });

        test('should use batch rendering for different particle types', () => {
            // Verify batch rendering methods exist
            expect(engineCode).toContain('batchRenderCircles');
            expect(engineCode).toContain('batchRenderImages');
            expect(engineCode).toContain('batchRenderHearts');
            expect(engineCode).toContain('batchRenderPaws');
        });
    });

    describe('Backward Compatibility', () => {
        test('deltaTime defaults to 1.0 if not provided', () => {
            // Verify default deltaTime parameter
            expect(engineCode).toContain('update(deltaTime = 1.0)');
        });
    });

    describe('Performance Mode Integration', () => {
        test('should have adaptive performance modes', () => {
            // Verify performance modes exist
            expect(engineCode).toContain('performanceMode');
            expect(engineCode).toContain('minimal');
            expect(engineCode).toContain('reduced');
            expect(engineCode).toContain('normal');
        });

        test('should adaptively adjust trail length based on FPS', () => {
            // Verify adaptive trail length
            expect(engineCode).toContain('Adaptive Trail-Length based on FPS');
            expect(engineCode).toMatch(/avgFps > 50[\s\S]*?CONFIG\.trailLength = 20/);
            expect(engineCode).toMatch(/avgFps > 25[\s\S]*?CONFIG\.trailLength = 5/);
        });
    });
});
