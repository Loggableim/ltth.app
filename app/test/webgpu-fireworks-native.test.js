const fs = require('fs');
const path = require('path');
const vm = require('vm');

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
    expect(manifest.version).toBe('3.0.0');
    expect(manifest.devStatus).toBe('working-beta');
    expect(manifest.features).toEqual(expect.arrayContaining([
      'webgpu-compute-simulation',
      'webgpu-indirect-rendering',
      'hdr-bloom-pipeline'
    ]));
    expect(fs.existsSync(path.join(pluginRoot, 'gpu', 'webgl-particle-engine.js'))).toBe(false);
    expect(fs.existsSync(path.join(pluginRoot, 'gpu', 'particle-system-soa.js'))).toBe(false);
    expect(overlaySource).toContain('webgpu-particle-engine.js?v=3.0.0-avatar-head-1');
    expect(settingsHtml).toContain('show-style-options.js?v=3.0.0-style-options-1');
    expect(settingsHtml).toContain('settings.js?v=3.0.0-avatar-head-1');
    expect(overlaySource).not.toContain('webgl-particle-engine');
  });

  test('loads renderer and orchestration as consecutive classic scripts', () => {
    const browserContext = vm.createContext({
      WebGPUFireworksSpawnCommandPolicy: {},
      WebGPUFireworksShowPlanV2Runtime: {}
    });

    expect(() => new vm.Script(rendererSource).runInContext(browserContext)).not.toThrow();
    expect(() => new vm.Script(orchestrationSource).runInContext(browserContext)).not.toThrow();
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
    expect(rendererSource).toContain('var result = 0xffffffffu');
    expect(rendererSource).toMatch(/return result;\r?\n}\r?\nfn releaseParticle/);
    expect(rendererSource).toContain('drawIndirect(this.buffers.coreIndirect');
    expect(rendererSource).toContain('drawIndirect(this.buffers.trailIndirect');
  });

  test('contains HDR bloom and alpha-aware composition', () => {
    expect(rendererSource).toContain("format: 'rgba16float'");
    expect(rendererSource).toContain("makePost('brightExtract'");
    expect(rendererSource).toContain("makePost('kawaseBlur'");
    expect(rendererSource).toContain("makePost('composite'");
    expect(rendererSource).toContain('let alpha=clamp(max(scene.a,bloomAlpha)');
    expect(rendererSource).toContain('fireworks-bloom-quarter-a');
    expect(rendererSource).toContain('fireworks-bloom-eighth-a');
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
    const burstMain = engine.spawnQueue.filter(command => command.shape === 0 && ((command.flags >> 8) & 15) === 3);
    expect(burstMain.reduce((sum, command) => sum + command.count, 0)).toBe(60);
    expect(engine.spawnQueue.some(command => command.shape === 3)).toBe(false);
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
    const processStart = orchestrationSource.indexOf('processExplosion(explosion, plan = null');
    const processEnd = orchestrationSource.indexOf('handleFinale(data', processStart);
    const processBody = orchestrationSource.slice(processStart, processEnd);
    expect(processBody).toContain('this.renderer.spawnExplosion');
    expect(processBody).toContain('this.audio.play(explosion.sound.bang');
    expect(processBody.indexOf('this.renderer.spawnExplosion')).toBeLessThan(processBody.indexOf('this.audio.play(explosion.sound.bang'));
    expect(orchestrationSource).toContain('this.processTimeline(now)');
    expect(orchestrationSource).not.toContain('class Particle ');
  });

  test('loads the complete cinematic launch library without surrendering frame-synchronous bangs', () => {
    for (const sound of [
      'combined-crackling-bang',
      'combined-whistle-normal',
      'combined-whistle-tiny1',
      'combined-whistle-tiny2',
      'combined-whistle-tiny3',
      'combined-whistle-tiny4'
    ]) expect(orchestrationSource).toContain(sound);
    expect(orchestrationSource).toContain('fitLaunchToFlight(selection, flightDuration, seed)');
    expect(orchestrationSource).toContain('maxDuration: launchDuration');
    expect(orchestrationSource).toContain('source.stop(stopAt)');
    expect(orchestrationSource).toContain('this.audio.play(explosion.sound.bang');
  });

  test('couples crackling audio to the dedicated visible GPU crackle window', () => {
    const processStart = orchestrationSource.indexOf('processCrackle(plan, plannedAt, actualAt)');
    const processEnd = orchestrationSource.indexOf('async handleTrigger(data', processStart);
    const processBody = orchestrationSource.slice(processStart, processEnd);
    expect(processBody).toContain('this.renderer.spawnCrackle({');
    expect(processBody).toContain('profile: plan.crackleProfile');
    expect(processBody).toContain('pulseCount: plan.cracklePulseCount');
    expect(processBody).toContain('maxDuration: crackleDuration');
    expect(processBody).toContain('offset: this.audio.CRACKLE_OFFSETS[explosion.sound.crackle] || 0');
    expect(processBody).toContain("bus: 'crackle'");
    expect(processBody).toContain('void this.audio.play(explosion.sound.crackle, 1, 4');
    expect(processBody).not.toContain('setTimeout');
    expect(processBody.indexOf('this.renderer.spawnCrackle({')).toBeLessThan(processBody.indexOf('this.audio.play(explosion.sound.crackle'));
    expect(rendererSource).toContain('spawnCrackle(options = {})');
    expect(rendererSource).toContain('role: 8');
  });

  test('forces planned and legacy finale bursts through timed rocket flights', () => {
    expect(orchestrationSource).toContain('forceRocket: true');
    expect(orchestrationSource).toContain("type: 'finale-launch'");
    expect(orchestrationSource).toContain('plannedLaunchAt');
    expect(orchestrationSource).toContain('plannedExplodeAt');
    expect(orchestrationSource).toContain('const baseCrackleInterval = intensity >= 4 ? 3 : intensity >= 3 ? 4 : 5');
    expect(orchestrationSource).toContain('finaleDuration / (count - 1)');
    expect(orchestrationSource).toContain('crackleEnabled,');
    expect(orchestrationSource).toContain('let skipRocket = !forceRocket && combo >= 5');
    expect(orchestrationSource).toContain('this.audio.choose(tier, forceRocket ? 1 : combo, false, {');
    expect(orchestrationSource).toContain('if (sound.crackle && skipRocket)');
  });

  test('uses semantic particle sizes and incandescent directional sparks', () => {
    expect(orchestrationSource).toContain('const shapeSizeProfiles = {');
    expect(orchestrationSource).toContain("paws: { base: 43, min: 36, max: 56 }");
    expect(rendererSource).toContain('vec2f(2.6,0.42)');
    expect(rendererSource).toContain('p.rotation = atan2(p.velocity.y, p.velocity.x)');
    expect(rendererSource).toContain("color: '#fff4d6'");
    expect(rendererSource).toContain('1.0-position.y/uniforms.height*2.0');
    expect(rendererSource).toContain('0.5-p[index].y*0.5');
    expect(rendererSource).toContain('fn rocketCoverage(uv:vec2f,time:f32,seed:u32)');
    expect(rendererSource).toContain('let fins=');
    expect(rendererSource).toContain('let flame=');
    expect(rendererSource).toContain('p.rotation = atan2(p.velocity.y, p.velocity.x + curveVelocity)');
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
