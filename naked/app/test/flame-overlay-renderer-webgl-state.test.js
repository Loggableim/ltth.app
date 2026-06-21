const fs = require('fs');
const path = require('path');

describe('Flame Overlay renderer WebGL state management', () => {
    const rendererDir = path.join(__dirname, '..', 'plugins', 'flame-overlay', 'renderer');
    const postProcessorPath = path.join(rendererDir, 'post-processor.js');
    const effectsEnginePath = path.join(rendererDir, 'effects-engine.js');
    
    test('post-processor renderToFramebuffer manages framebuffer viewport and clear state', () => {
        const content = fs.readFileSync(postProcessorPath, 'utf8');
        
        expect(content).toContain('const fb = this.framebuffers[framebufferName];');
        expect(content).toContain('if (!fb) {');
        expect(content).toContain('console.warn(`[PostProcessor] Missing framebuffer: ${framebufferName}`);');
        expect(content).toContain('const isBloom = framebufferName !== \'scene\';');
        expect(content).toContain('gl.viewport(0, 0, width, height);');
        expect(content).toContain('gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);');
        expect(content).toContain('gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);');
    });
    
    test('effects-engine keeps renderScene encapsulated and smoke rendering delegated safely', () => {
        const content = fs.readFileSync(effectsEnginePath, 'utf8');
        
        expect(content).toContain('renderScene() {');
        expect(content).toContain('if (this.config.smokeEnabled && typeof this.renderSmoke === \'function\')');
        expect(content).toContain('this.renderSmoke(time);');
        expect(content).toContain('renderSmoke(time) {');
    });
    
    test('effects-engine render resets framebuffer and viewport before final composite and non-bloom path', () => {
        const content = fs.readFileSync(effectsEnginePath, 'utf8');
        
        expect(content).toContain('gl.bindFramebuffer(gl.FRAMEBUFFER, null);');
        expect(content).toContain('gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);');
        expect(content).toContain('this.postProcessor.composite(');
        expect(content).toContain('// Direct rendering without bloom');
    });
    
    test('effects-engine selects the initial effect after shader programs are built', () => {
        const content = fs.readFileSync(effectsEnginePath, 'utf8');
        const initBody = content.match(/async init\(\) \{([\s\S]*?)\n    async loadConfig\(\)/)[1];
        const setupIndex = initBody.indexOf('this.setupAllShaders();');
        const switchIndex = initBody.indexOf("this.switchEffect(this.config.effectType || 'flames');");
        
        expect(setupIndex).toBeGreaterThan(-1);
        expect(switchIndex).toBeGreaterThan(setupIndex);
    });
});
