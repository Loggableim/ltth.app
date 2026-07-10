const fs = require('fs');
const path = require('path');

const pluginRoot = path.join(__dirname, '..', 'plugins', 'webgpu-fireworks');
const read = relative => fs.readFileSync(path.join(pluginRoot, relative), 'utf8');

describe('WebGPU Fireworks native migration', () => {
  const rendererSource = read('gpu/webgpu-particle-engine.js');
  const orchestrationSource = read('gpu/engine.js');
  const overlaySource = read('overlay.html');
  const mainSource = read('main.js');
  const settingsSource = read('ui/settings.js');
  const settingsHtml = read('ui/settings.html');
  const manifest = JSON.parse(read('plugin.json'));

  test('is a WebGPU-only plugin with no legacy renderer files', () => {
    expect(manifest.id).toBe('webgpu-fireworks');
    expect(manifest.version).toBe('2.0.0');
    expect(manifest.features).toEqual(expect.arrayContaining([
      'webgpu-compute-simulation',
      'webgpu-indirect-rendering',
      'hdr-bloom-pipeline'
    ]));
    expect(fs.existsSync(path.join(pluginRoot, 'gpu', 'webgl-particle-engine.js'))).toBe(false);
    expect(fs.existsSync(path.join(pluginRoot, 'gpu', 'particle-system-soa.js'))).toBe(false);
    expect(overlaySource).toContain('webgpu-particle-engine.js?v=2.0.0-native-webgpu');
    expect(overlaySource).not.toContain('webgl-particle-engine');
  });

  test('migrates all legacy renderer values to webgpu', () => {
    const { normalizeConfig } = require('../plugins/webgpu-fireworks/lib/config-schema');
    for (const renderer of ['auto', 'webgl', 'canvas', 'webgpu', 'invalid']) {
      const config = normalizeConfig({ renderer, gpuAcceleration: false });
      expect(config.renderer).toBe('webgpu');
      expect(config).not.toHaveProperty('gpuAcceleration');
    }
    expect(normalizeConfig({ avatarParticleChance: 0 }).avatarParticleChance).toBe(0);
    expect(mainSource).toContain('avatarParticleChance: this.config.avatarParticleChance ?? 0.3');
  });

  test('contains native WebGPU capability and premultiplied-alpha setup', () => {
    expect(rendererSource).toContain('navigator.gpu.requestAdapter');
    expect(rendererSource).toContain('this.adapter.requestDevice');
    expect(rendererSource).toContain('maxStorageBuffersPerShaderStage: 9');
    expect(rendererSource).toContain("getContext('webgpu')");
    expect(rendererSource).toContain("alphaMode: 'premultiplied'");
    expect(rendererSource).not.toContain("getContext('webgl2')");
  });

  test('contains compute simulation, atomic allocation and indirect draws', () => {
    expect(rendererSource).toContain("entryPoint: 'spawnParticles'");
    expect(rendererSource).toContain("entryPoint: 'updateParticles'");
    expect(rendererSource).toContain("entryPoint: 'spawnSecondary'");
    expect(rendererSource).toContain('atomicCompareExchangeWeak');
    expect(rendererSource).toContain('atomicAdd(&counters.droppedCount');
    expect(rendererSource).toContain('drawIndirect(this.buffers.coreIndirect');
    expect(rendererSource).toContain('drawIndirect(this.buffers.trailIndirect');
  });

  test('contains HDR bloom and alpha-aware composition', () => {
    expect(rendererSource).toContain("format: 'rgba16float'");
    expect(rendererSource).toContain("makePost('brightExtract'");
    expect(rendererSource).toContain("makePost('kawaseBlur'");
    expect(rendererSource).toContain("makePost('composite'");
    expect(rendererSource).toContain('let alpha=max(scene.a,bloomAlpha)');
  });

  test('keeps shape contracts and density caps', () => {
    const WebGPUParticleEngine = require('../plugins/webgpu-fireworks/gpu/webgpu-particle-engine');
    const engine = new WebGPUParticleEngine({ width: 1920, height: 1080 }, {});
    engine.initialized = true;
    engine.spawnExplosion({ shape: 'paws', count: 100, colors: ['#ffffff'] });
    expect(engine.spawnQueue.reduce((sum, command) => sum + command.count, 0)).toBe(9);
    expect(new Set(engine.spawnQueue.map(command => command.shape))).toEqual(new Set([2]));
    engine.spawnQueue.length = 0;
    engine.spawnExplosion({ shape: 'spiral', count: 100, colors: ['#ffffff'] });
    expect(engine.spawnQueue.reduce((sum, command) => sum + command.count, 0)).toBe(14);
    expect(new Set(engine.spawnQueue.map(command => command.shape))).toEqual(new Set([5]));
    engine.spawnQueue.length = 0;
    engine.spawnExplosion({ shape: 'burst', count: 50, colors: ['#ff0000'] });
    expect(new Set(engine.spawnQueue.map(command => command.shape))).toEqual(new Set([0]));
    engine.spawnQueue.length = 0;
    engine.spawnExplosion({ shape: 'star', count: 50, colors: ['#ff0000'] });
    expect(new Set(engine.spawnQueue.map(command => command.shape))).toEqual(new Set([3]));
  });

  test('keeps configured palettes instead of generating renderer-side random hues', () => {
    const WebGPUParticleEngine = require('../plugins/webgpu-fireworks/gpu/webgpu-particle-engine');
    const engine = new WebGPUParticleEngine({ width: 1920, height: 1080 }, {});
    engine.initialized = true;
    engine.spawnExplosion({ shape: 'heart', count: 12, colors: ['#ff0000', '#00ff00'] });
    expect(engine.spawnQueue).toHaveLength(2);
    expect(engine.spawnQueue.map(command => command.color)).toEqual([
      [1, 0, 0, 1],
      [0, 1, 0, 1]
    ]);
  });

  test('clears stale device-loss reasons after a successful recovery status', () => {
    const WebGPUParticleEngine = require('../plugins/webgpu-fireworks/gpu/webgpu-particle-engine');
    const statuses = [];
    const engine = new WebGPUParticleEngine({ width: 1920, height: 1080 }, {
      onStatus: status => statuses.push(status)
    });
    engine.metrics.reason = 'Device was destroyed.';
    engine._emitStatus('ready');
    expect(statuses.at(-1)).toMatchObject({ state: 'ready', backend: 'webgpu' });
    expect(statuses.at(-1)).not.toHaveProperty('reason');
  });

  test('orchestrates visual explosion and audio in the same CPU frame', () => {
    const processStart = orchestrationSource.indexOf('processExplosion(explosion)');
    const processEnd = orchestrationSource.indexOf('handleFinale(data', processStart);
    const processBody = orchestrationSource.slice(processStart, processEnd);
    expect(processBody).toContain('this.renderer.spawnExplosion');
    expect(processBody).toContain('this.audio.play(explosion.sound.bang');
    expect(processBody.indexOf('this.renderer.spawnExplosion')).toBeLessThan(processBody.indexOf('this.audio.play(explosion.sound.bang'));
    expect(orchestrationSource).not.toContain('class Particle ');
  });

  test('reports renderer status through socket, API and settings', () => {
    expect(mainSource).toContain("socket.on('webgpu-fireworks:renderer-status'");
    expect(mainSource).toContain("fallback: 'none'");
    expect(orchestrationSource).toContain("this.socket.emit('webgpu-fireworks:renderer-status'");
    expect(settingsSource).toContain("fetch('/api/webgpu-fireworks/status'");
    expect(settingsHtml).toContain('id="webgpu-runtime-state"');
    expect(settingsHtml).toContain('id="webgpu-origin"');
  });

  test('has no WebGL or Canvas fallback in the loaded runtime', () => {
    expect(orchestrationSource).not.toMatch(/WebGL|webgl|renderCanvas|useWebGL/);
    expect(rendererSource).not.toMatch(/WebGL|webgl|renderCanvas|useWebGL/);
    expect(overlaySource).not.toMatch(/webgl-particle|particle-system-soa/);
  });
});
