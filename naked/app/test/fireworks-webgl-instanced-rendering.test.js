/**
 * Fireworks WebGL Instanced Rendering Test
 * Tests that WebGL2 renderer is properly integrated
 */

describe('Fireworks WebGL Instanced Rendering', () => {
    let engineCode;
    let webglCode;

    beforeAll(() => {
        const fs = require('fs');
        engineCode = fs.readFileSync('./plugins/fireworks/gpu/engine.js', 'utf-8');
        webglCode = fs.readFileSync('./plugins/fireworks/gpu/webgl-particle-engine.js', 'utf-8');
    });

    describe('WebGLParticleEngine Class', () => {
        test('should exist', () => {
            expect(webglCode).toContain('class WebGLParticleEngine');
        });

        test('should initialize WebGL2 context with optimal settings', () => {
            expect(webglCode).toContain('webgl2');
            expect(webglCode).toContain('antialias: false');
            expect(webglCode).toContain('alpha: true');
            expect(webglCode).toContain('premultipliedAlpha: false');
            expect(webglCode).toContain('desynchronized: true');
            expect(webglCode).toContain('powerPreference: \'high-performance\'');
        });

        test('should have vertex shader for instanced rendering', () => {
            expect(webglCode).toContain('#version 300 es');
            expect(webglCode).toContain('in vec2 a_position');
            expect(webglCode).toContain('in vec2 a_particlePos');
            expect(webglCode).toContain('in float a_size');
            expect(webglCode).toContain('in float a_alpha');
            expect(webglCode).toContain('in vec3 a_hsb');
            expect(webglCode).toContain('in float a_rotation');
        });

        test('should have fragment shader with HSB to RGB conversion', () => {
            expect(webglCode).toContain('vec3 hsb2rgb');
            expect(webglCode).toContain('smoothstep');
            expect(webglCode).toContain('outColor');
        });

        test('should implement additive blending', () => {
            expect(webglCode).toContain('gl.blendFunc(gl.SRC_ALPHA, gl.ONE)');
        });

        test('should use instanced rendering', () => {
            expect(webglCode).toContain('drawArraysInstanced');
            expect(webglCode).toContain('vertexAttribDivisor');
        });

        test('should have updateParticles method', () => {
            expect(webglCode).toContain('updateParticles(fireworks)');
        });

        test('should have render method', () => {
            expect(webglCode).toContain('render()');
        });

        test('should have resize and destroy methods', () => {
            expect(webglCode).toContain('resize(width, height)');
            expect(webglCode).toContain('destroy()');
        });

        test('should store 8 floats per particle', () => {
            expect(webglCode).toContain('8 floats per particle');
        });
    });

    describe('FireworksEngine Integration', () => {
        test('should have WebGL engine property', () => {
            expect(engineCode).toContain('this.webglEngine = null');
            expect(engineCode).toContain('this.useWebGL = false');
            expect(engineCode).toContain('this.rendererMode');
        });

        test('should have renderer config option', () => {
            expect(engineCode).toContain('renderer: \'webgl\'');
        });

        test('should have initRenderer method', () => {
            expect(engineCode).toContain('initRenderer()');
        });

        test('should force Canvas 2D in toaster mode', () => {
            expect(engineCode).toContain('if (this.config.toasterMode)');
            expect(engineCode).toContain('Toaster mode enabled, using Canvas 2D');
        });

        test('should try WebGL initialization', () => {
            expect(engineCode).toContain('new WebGLParticleEngine(this.canvas)');
            expect(engineCode).toContain('this.webglEngine.init()');
        });

        test('should have Canvas 2D fallback', () => {
            expect(engineCode).toContain('falling back to Canvas 2D');
            expect(engineCode).toContain('Using Canvas 2D fallback');
        });

        test('should have renderWebGL method', () => {
            expect(engineCode).toContain('renderWebGL()');
            expect(engineCode).toContain('this.webglEngine.updateParticles');
            expect(engineCode).toContain('this.webglEngine.render()');
        });

        test('should have renderCanvas method', () => {
            expect(engineCode).toContain('renderCanvas()');
        });

        test('should choose renderer in render loop', () => {
            expect(engineCode).toContain('if (this.useWebGL && this.webglEngine)');
            expect(engineCode).toContain('this.renderWebGL()');
            expect(engineCode).toContain('this.renderCanvas()');
        });

        test('should resize WebGL engine', () => {
            expect(engineCode).toContain('if (this.webglEngine && this.useWebGL)');
            expect(engineCode).toContain('this.webglEngine.resize');
        });

        test('should handle renderer config updates', () => {
            expect(engineCode).toContain('oldRenderer');
            expect(engineCode).toContain('oldToasterMode');
            expect(engineCode).toContain('Renderer config changed, re-initializing');
        });

        test('should show renderer mode in debug panel', () => {
            expect(engineCode).toContain('this.rendererMode.toUpperCase()');
        });
    });

    describe('Overlay HTML Integration', () => {
        test('should load WebGL engine script before main engine', () => {
            const fs = require('fs');
            const overlayHtml = fs.readFileSync('./plugins/fireworks/overlay.html', 'utf-8');
            
            expect(overlayHtml).toContain('webgl-particle-engine.js');
            
            // Check order: WebGL engine should come before main engine
            const webglScriptPos = overlayHtml.indexOf('webgl-particle-engine.js');
            const mainEnginePos = overlayHtml.indexOf('gpu/engine.js');
            
            expect(webglScriptPos).toBeLessThan(mainEnginePos);
        });
    });

    describe('Performance Requirements', () => {
        test('should support instanced rendering for performance', () => {
            // Verify that instanced rendering is used to reduce draw calls
            expect(webglCode).toContain('1 draw call for all particles');
            expect(webglCode).toContain('all particles in a single draw call');
        });

        test('should handle large particle counts', () => {
            expect(webglCode).toContain('this.maxParticles = 10000');
        });

        test('should cull invisible particles', () => {
            expect(webglCode).toContain('shouldRenderParticle');
            expect(webglCode).toContain('Alpha culling');
            expect(webglCode).toContain('Viewport culling');
        });
    });

    describe('Backward Compatibility', () => {
        test('should preserve existing particle physics', () => {
            // Physics should not be modified
            expect(engineCode).toContain('class Particle');
            expect(engineCode).toContain('class Firework');
            expect(engineCode).toContain('update(deltaTime = 1.0)');
        });

        test('should render non-circle particles with Canvas 2D', () => {
            expect(engineCode).toContain('renderNonCircleParticle');
            expect(engineCode).toContain('type === \'image\'');
            expect(engineCode).toContain('type === \'heart\'');
            expect(engineCode).toContain('type === \'paw\'');
        });

        test('should preserve existing render methods', () => {
            expect(engineCode).toContain('renderFirework');
            expect(engineCode).toContain('renderFireworkParticlesOnly');
            expect(engineCode).toContain('batchRenderCircles');
        });
    });
});
