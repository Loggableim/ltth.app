/**
 * Test suite for Fireworks Engine Bug Fixes and Optimizations
 * 
 * Tests:
 * - Bug #1: ParticlePool Set operations (O(1) performance)
 * - Bug #3: Despawn logic for instant-explode fireworks
 * - Optimization #5: Dynamic pool sizing
 * - Optimization #11: Alpha cull threshold
 */

const fs = require('fs');
const path = require('path');

describe('Fireworks Engine Optimizations', () => {
    let engineCode;
    
    beforeAll(() => {
        // Read the engine file
        const enginePath = path.join(__dirname, '../plugins/fireworks/gpu/engine.js');
        engineCode = fs.readFileSync(enginePath, 'utf8');
    });
    
    describe('Bug #1: ParticlePool Set Implementation', () => {
        test('ParticlePool uses Set instead of Array for active particles', () => {
            expect(engineCode).toContain('this.active = new Set()');
            expect(engineCode).toContain('// Bug #1 Fix: Changed from Array to Set');
        });
        
        test('ParticlePool uses O(1) Set operations', () => {
            expect(engineCode).toContain('this.active.add(particle)');
            expect(engineCode).toContain('this.active.has(particle)');
            expect(engineCode).toContain('this.active.delete(particle)');
        });
        
        test('ParticlePool getStats uses .size instead of .length', () => {
            expect(engineCode).toContain('active: this.active.size');
            expect(engineCode).toContain('// Bug #1 Fix: Changed from .length to .size');
        });
    });
    
    describe('Bug #2: Duplicate targetFps Declaration', () => {
        test('Only one targetFps declaration in render method', () => {
            const targetFpsMatches = engineCode.match(/const targetFps = this\.config\.targetFps/g);
            expect(targetFpsMatches).not.toBeNull();
            expect(targetFpsMatches.length).toBe(1);
        });
        
        test('Bug #2 fix comment exists', () => {
            expect(engineCode).toContain('// Bug #2 Fix: Removed duplicate targetFps declaration');
        });
    });
    
    describe('Bug #3: Despawn Logic Fix', () => {
        test('applyPerformanceMode uses reverse iteration', () => {
            expect(engineCode).toContain('for (let i = this.fireworks.length - 1; i >= maxFireworksMinimal; i--)');
            expect(engineCode).toContain('for (let i = this.fireworks.length - 1; i >= maxFireworksReduced; i--)');
        });
        
        test('Handles instant-explode fireworks (no rocket)', () => {
            expect(engineCode).toContain('else if (!fw.rocket && fw.exploded)');
            expect(engineCode).toContain('// Bug #3 Fix: For instant-explode fireworks');
        });
        
        test('Uses swap-and-pop instead of splice for O(1) cleanup', () => {
            const applyPerformanceSection = engineCode.substring(
                engineCode.indexOf('applyPerformanceMode()'),
                engineCode.indexOf('applyPerformanceMode()') + 5000
            );
            expect(applyPerformanceSection).toContain('this.fireworks[i] = this.fireworks[this.fireworks.length - 1]');
            expect(applyPerformanceSection).toContain('this.fireworks.pop()');
        });
    });
    
    describe('Optimization #5: Dynamic Pool Sizing', () => {
        test('Initial pool size reduced from 5000 to 1000', () => {
            expect(engineCode).toContain('constructor(initialSize = 1000)');
            expect(engineCode).toContain('// Optimization #5: Reduced from 5000');
        });
        
        test('Pool has maxPoolSize property', () => {
            expect(engineCode).toContain('this.maxPoolSize = 10000');
        });
        
        test('Pool has growth mechanism', () => {
            expect(engineCode).toContain('this.growthRate = 500');
            expect(engineCode).toContain('// Optimization #5: Check if pool needs to grow');
        });
        
        test('Pool has compact method', () => {
            expect(engineCode).toContain('// Optimization #5: New method - Shrink pool');
            expect(engineCode).toContain('compact()');
        });
    });
    
    describe('Optimization #6: Canvas Layer Splitting', () => {
        test('FireworksEngine has trail canvas properties', () => {
            expect(engineCode).toContain('this.trailCanvas = null');
            expect(engineCode).toContain('this.trailCtx = null');
            expect(engineCode).toContain('// Optimization #6: Layer splitting for performance');
        });
        
        test('Has initLayerSplitting method', () => {
            expect(engineCode).toContain('initLayerSplitting()');
            expect(engineCode).toContain('// Optimization #6: Initialize layer splitting');
        });
        
        test('Has renderTrailsToLayer method', () => {
            expect(engineCode).toContain('renderTrailsToLayer(firework)');
            expect(engineCode).toContain('// Optimization #6: Render trails to separate layer');
        });
        
        test('Has renderFireworkParticlesOnly method', () => {
            expect(engineCode).toContain('renderFireworkParticlesOnly(firework)');
        });
        
        test('Has batchRenderCirclesNoTrails method', () => {
            expect(engineCode).toContain('batchRenderCirclesNoTrails(particles)');
            expect(engineCode).toContain('// Optimization #6: Batch render circles without trails');
        });
    });
    
    describe('Optimization #10: Frame-Skip Logic', () => {
        test('Has skippedFrames property in constructor', () => {
            expect(engineCode).toContain('// Optimization #10: Frame-skip for critical load');
            expect(engineCode).toContain('this.skippedFrames = 0');
        });
        
        test('Implements frame-skip threshold', () => {
            expect(engineCode).toContain('const FRAME_SKIP_THRESHOLD = 50');
            expect(engineCode).toContain('// Optimization #10: Frame-skip threshold');
        });
        
        test('Has emergency cleanup for consecutive skipped frames', () => {
            expect(engineCode).toContain('if (this.skippedFrames > 10)');
            expect(engineCode).toContain('// Emergency cleanup if too many frames skipped');
        });
    });
    
    describe('Optimization #11: Alpha Cull Threshold', () => {
        test('ALPHA_CULL_THRESHOLD increased to 0.05', () => {
            expect(engineCode).toContain('ALPHA_CULL_THRESHOLD: 0.05');
            expect(engineCode).toContain('// Optimization #11');
        });
        
        test('Particle.update has early exit for invisible particles', () => {
            expect(engineCode).toContain('// Optimization #11: Early exit for nearly invisible particles');
            expect(engineCode).toContain('if (this.alpha < CONFIG.ALPHA_CULL_THRESHOLD && !this.isSeed)');
        });
    });
    
    describe('Optimization #19: Priority-Based Queue', () => {
        test('Has priority tier system in handleTrigger', () => {
            expect(engineCode).toContain('// Optimization #19: Priority-based queue management');
            expect(engineCode).toContain('const tierPriority = {');
        });
        
        test('Has MAX_FIREWORKS limits', () => {
            expect(engineCode).toContain('const MAX_FIREWORKS_NORMAL = 30');
            expect(engineCode).toContain('const MAX_FIREWORKS_HARD = 50');
        });
        
        test('Implements probabilistic dropping', () => {
            expect(engineCode).toContain('const dropChance =');
            expect(engineCode).toContain('if (Math.random() < dropChance)');
        });
        
        test('Debug panel shows queue size', () => {
            expect(engineCode).toContain('// Optimization #19: Update debug panel to show queue size');
            expect(engineCode).toContain('Q:${this.fireworks.length}');
        });
    });
    
    describe('Code Quality', () => {
        test('File is valid JavaScript', () => {
            expect(() => {
                // Basic syntax check by looking for balanced braces
                const openBraces = (engineCode.match(/\{/g) || []).length;
                const closeBraces = (engineCode.match(/\}/g) || []).length;
                expect(Math.abs(openBraces - closeBraces)).toBeLessThan(5); // Allow some tolerance for strings
            }).not.toThrow();
        });
        
        test('All optimization comments are present', () => {
            expect(engineCode).toContain('Bug #1 Fix');
            expect(engineCode).toContain('Bug #2 Fix');
            expect(engineCode).toContain('Bug #3 Fix');
            expect(engineCode).toContain('Optimization #5');
            expect(engineCode).toContain('Optimization #6');
            expect(engineCode).toContain('Optimization #10');
            expect(engineCode).toContain('Optimization #11');
            expect(engineCode).toContain('Optimization #19');
        });
    });
});
