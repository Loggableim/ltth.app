const fs = require('fs');
const path = require('path');

const pluginRoot = path.join(__dirname, '..', 'plugins', 'webgpu-fireworks');
const rendererSource = fs.readFileSync(path.join(pluginRoot, 'gpu', 'webgpu-particle-engine.js'), 'utf8');
const orchestrationSource = fs.readFileSync(path.join(pluginRoot, 'gpu', 'engine.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(pluginRoot, 'main.js'), 'utf8');
const WebGPUParticleEngine = require('../plugins/webgpu-fireworks/gpu/webgpu-particle-engine');
const { AudioManager, WebGPUFireworksEngine } = require('../plugins/webgpu-fireworks/gpu/engine');
const FireworksPlugin = require('../plugins/webgpu-fireworks/main');

function localeStrings(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(localeStrings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(localeStrings);
  return [];
}

function makeOrchestrator() {
  const engine = Object.create(WebGPUFireworksEngine.prototype);
  engine.audio = new AudioManager();
  engine.config = {
    crackleFrequency: 0.5,
    crackleVolume: 0.75,
    defaultColors: ['#ff0000', '#00ff00'],
    visualStyle: 'premium-hybrid'
  };
  engine.timelineQueue = [];
  engine.effectPlans = new Map();
  engine.activeShows = new Map();
  engine.crackleSequence = { eligible: 0, ordinal: 0, lastCrackleOrdinal: -100 };
  return engine;
}

function makeRendererHarness(options = {}) {
  const engine = new WebGPUParticleEngine({ width: 1920, height: 1080 }, options);
  const encoderLabels = [];
  const computePipelines = [];
  const renderPipelines = [];
  const dispatches = [];
  const draws = [];
  const makePass = kind => ({
    setBindGroup: jest.fn(),
    setPipeline: jest.fn(pipeline => (kind === 'compute' ? computePipelines : renderPipelines).push(pipeline)),
    dispatchWorkgroups: jest.fn((...args) => dispatches.push(args)),
    drawIndirect: jest.fn((...args) => draws.push(args)),
    draw: jest.fn((...args) => draws.push(args)),
    end: jest.fn()
  });
  const createCommandEncoder = jest.fn(descriptor => {
    encoderLabels.push(descriptor.label);
    return {
      beginComputePass: jest.fn(() => makePass('compute')),
      beginRenderPass: jest.fn(() => makePass('render')),
      copyBufferToBuffer: jest.fn(),
      resolveQuerySet: jest.fn(),
      finish: jest.fn(() => ({ label: descriptor.label }))
    };
  });
  const texture = () => ({ createView: jest.fn(() => ({})) });

  engine.initialized = true;
  engine.destroyed = false;
  engine.readbackPending = false;
  engine.lastReadbackAt = performance.now();
  engine.buffers = {
    uniforms: {}, commands: {}, coreIndirect: {}, trailIndirect: {}, counters: {}, readback: {}
  };
  engine.device = {
    queue: { writeBuffer: jest.fn(), submit: jest.fn() },
    createCommandEncoder
  };
  engine.computeBindGroup = {};
  engine.renderBindGroup = {};
  engine.pipelines = {
    reset: 'reset', spawn: 'spawn', update: 'update', secondary: 'secondary',
    trail: 'trail', glow: 'glow', core: 'core', composite: 'composite'
  };
  engine.sceneTexture = texture();
  engine.bloomTextureB = texture();
  engine.context = { getCurrentTexture: jest.fn(() => texture()) };
  engine.postBindGroups = { composite: {} };

  return { engine, encoderLabels, computePipelines, renderPipelines, dispatches, draws };
}

describe('WebGPU Fireworks premium graphics and synchronized crackling', () => {
  describe('emoji localization and follower avatar rockets', () => {
    test('stores translated emojis as Unicode instead of literal HTML entities', () => {
      for (const language of ['de', 'en', 'es', 'fr']) {
        const locale = require(`../plugins/webgpu-fireworks/locales/${language}.json`);
        expect(localeStrings(locale).some(value => /&#(?:x[0-9a-f]+|[0-9]+);/i.test(value))).toBe(false);
      }
      const english = require('../plugins/webgpu-fireworks/locales/en.json');
      expect(english.plugins['webgpu-fireworks'].webgpu_fireworks.visual_effects).toBe('✨ Visual Effects');
    });

    test('integrates a follower avatar into the rocket head without a trailing image particle', () => {
      const renderer = new WebGPUParticleEngine({ width: 1920, height: 1080 }, {});
      renderer.initialized = true;
      renderer.spawnRocket({
        effectId: 'follower-head', seed: 77, duration: 1.2,
        origin: { x: 320, y: 1080 }, target: { x: 960, y: 280 },
        headTextureIndex: 7, textureIndex: 7
      });
      expect(renderer.spawnQueue).toHaveLength(2);
      const [body, flame] = renderer.spawnQueue;
      expect(body).toMatchObject({ shape: 8, textureIndex: 7 });
      expect((body.flags >> 8) & 15).toBe(1);
      expect(body.flags & (1 << 14)).toBeTruthy();
      expect(flame).toMatchObject({ shape: 8, textureIndex: 0 });
      expect((flame.flags >> 8) & 15).toBe(2);
      expect(flame.flags & (1 << 14)).toBeFalsy();
      expect(renderer.spawnQueue.some(command => command.shape === 6)).toBe(false);
    });

    test('keeps ordinary avatar decals compatible and marks only follower rockets as heads', () => {
      const renderer = new WebGPUParticleEngine({ width: 1920, height: 1080 }, {});
      renderer.initialized = true;
      renderer.spawnRocket({ textureIndex: 5, duration: 1.2 });
      expect(renderer.spawnQueue).toHaveLength(3);
      expect(renderer.spawnQueue[2]).toMatchObject({ shape: 6, textureIndex: 5 });

      jest.useFakeTimers();
      const api = { getPluginDataDir: () => pluginRoot, emit: jest.fn(), log: jest.fn() };
      const plugin = new FireworksPlugin(api);
      plugin.config = {
        followerRocketCount: 2,
        followerShowAnimation: false,
        followerShowProfilePicture: true,
        activeShapes: ['heart'],
        colorMode: 'theme',
        defaultColors: ['#ff3366']
      };
      plugin.triggerFirework = jest.fn();
      plugin.handleFollowerEvent({ username: 'Follower', profilePictureUrl: 'https://example.test/avatar.png' });
      jest.runAllTimers();
      expect(plugin.triggerFirework).toHaveBeenCalledTimes(2);
      for (const [payload] of plugin.triggerFirework.mock.calls) {
        expect(payload).toMatchObject({
          type: 'follow',
          userAvatar: 'https://example.test/avatar.png',
          avatarRocketHead: true
        });
      }
      plugin.triggerFirework.mockClear();
      plugin.config.followerShowProfilePicture = false;
      plugin.handleFollowerEvent({ username: 'Follower', profilePictureUrl: 'https://example.test/avatar.png' });
      jest.runAllTimers();
      for (const [payload] of plugin.triggerFirework.mock.calls) {
        expect(payload).toMatchObject({ userAvatar: null, avatarRocketHead: false });
      }
      jest.useRealTimers();
    });

    test('falls back to a complete normal rocket when the avatar texture is unavailable', () => {
      const renderer = new WebGPUParticleEngine({ width: 1920, height: 1080 }, {});
      renderer.initialized = true;
      renderer.spawnRocket({ headTextureIndex: 0, duration: 1.2 });
      expect(renderer.spawnQueue).toHaveLength(2);
      expect(renderer.spawnQueue[0]).toMatchObject({ shape: 8, textureIndex: 0 });
      expect(renderer.spawnQueue[0].flags & (1 << 14)).toBeFalsy();
    });

    test('keeps the atlas head on the rocket shape and counter-rotates the profile sampling', () => {
      expect(mainSource).toContain('avatarRocketHead: options.avatarRocketHead === true');
      expect(orchestrationSource).toContain('headTextureIndex: explosion.avatarRocketHead ? avatarTexture : 0');
      expect(rendererSource).toContain('p.shape = command.shape');
      expect(rendererSource).toContain('(in.flags&16384u)!=0u');
      expect(rendererSource).toContain('let upright=vec2f(c*local.x-s*local.y,s*local.x+c*local.y)');
      expect(rendererSource).toContain("String(key).startsWith('avatar:')");
    });
  });

  describe('deterministic crackle planning', () => {
    test('keeps seeded tier rates stable and scales them with the frequency control', () => {
      const audio = new AudioManager();
      const sample = (tier, frequency) => Array.from({ length: 1000 }, (_, index) =>
        audio.choose(tier, 1, false, { seed: index + 1, crackleFrequency: frequency }).crackle !== null
      );

      expect(sample('big', 0)).not.toContain(true);
      const first = sample('big', 0.5);
      const second = sample('big', 0.5);
      expect(second).toEqual(first);
      expect(first.filter(Boolean)).toHaveLength(504);
      expect(sample('small', 1)).not.toContain(true);
      expect(sample('medium', 0.5).filter(Boolean)).toHaveLength(198);
      expect(sample('massive', 0.5).filter(Boolean)).toHaveLength(759);
    });

    test('explicit overrides couple the crackle sound and profile and remove crackling launches', () => {
      const audio = new AudioManager();
      expect(audio.applyCrackleOverride({
        launch: 'combined-crackling-bang', launchWindow: 4.55,
        crackle: 'crackling-long', crackleProfile: 'long'
      }, false, { tier: 'massive', seed: 7 })).toEqual({
        launch: 'launch-whistle', launchWindow: null, crackle: null, crackleProfile: null
      });
      expect(audio.applyCrackleOverride({
        launch: 'launch-whistle', launchWindow: null, crackle: null, crackleProfile: null
      }, true, { tier: 'massive', seed: 7 })).toMatchObject({
        crackle: 'crackling-long', crackleProfile: 'long'
      });
    });

    test('enforces a two-rocket cooldown and guarantees crackling after six eligible combo rockets', () => {
      const engine = makeOrchestrator();
      const withCrackle = () => ({
        launch: 'launch-whistle', launchWindow: null,
        bang: 'explosion-big', crackle: 'crackling-medium', crackleProfile: 'short'
      });

      expect(engine.applyCracklePolicy(withCrackle(), { combo: 1 }, 'big', 1).crackle).toBeTruthy();
      expect(engine.applyCracklePolicy(withCrackle(), { combo: 1 }, 'big', 2).crackle).toBeNull();
      expect(engine.applyCracklePolicy(withCrackle(), { combo: 1 }, 'big', 3).crackle).toBeNull();
      expect(engine.applyCracklePolicy(withCrackle(), { combo: 1 }, 'big', 4).crackle).toBeTruthy();

      engine.crackleSequence = { eligible: 0, ordinal: 0, lastCrackleOrdinal: -100 };
      let selected = null;
      for (let index = 0; index < 6; index++) {
        selected = engine.applyCracklePolicy({
          launch: 'launch-whistle', launchWindow: null,
          bang: 'explosion-big', crackle: null, crackleProfile: null
        }, { combo: 6 }, 'big', index + 10);
      }
      expect(selected).toMatchObject({ crackle: 'crackling-medium', crackleProfile: 'short' });
    });

    test('keeps a selected high-combo crackling effect as a real rocket', async () => {
      const engine = makeOrchestrator();
      engine.renderer = { initialized: true };
      engine.rendererStatus = { state: 'ready' };
      engine.baseWidth = 1920;
      engine.baseHeight = 1080;
      engine.config = {
        ...engine.config,
        maxParticles: 1000,
        avatarParticleChance: 0.3,
        particleSizeRange: [4, 12],
        gravity: 0.1,
        friction: 0.98,
        windStrength: 0.02,
        despawnFadeDuration: 3
      };
      engine.prepareImages = jest.fn().mockResolvedValue({ giftTexture: 0, avatarTexture: 0, avatarChance: 0.3 });

      const plan = await engine.handleTrigger({
        id: 'combo-crackle', seed: 1, combo: 8, tier: 'massive',
        position: { x: 0.5, y: 0.3 }, origin: { x: 0.5, y: 1.02 },
        intensity: 3, particleCount: 100, crackleFrequency: 0.5, playSound: false
      });

      expect(plan).toMatchObject({ crackleProfile: 'long' });
      expect(plan.launch.skipRocket).toBe(false);
      expect(plan.flightDuration).toBeGreaterThan(0);
    });

    test('plans finale crackling deterministically and disables it at frequency zero', () => {
      const first = makeOrchestrator();
      const firstResult = first.handleFinale({ id: 'finale', seed: 1234, intensity: 4, burstCount: 15, crackleFrequency: 0.5 });
      const firstEvents = first.timelineQueue.filter(event => event.type === 'finale-launch');
      const firstPayloads = firstEvents.map(event => event.payload);
      const second = makeOrchestrator();
      const secondResult = second.handleFinale({ id: 'finale', seed: 1234, intensity: 4, burstCount: 15, crackleFrequency: 0.5 });
      const secondEvents = second.timelineQueue.filter(event => event.type === 'finale-launch');
      const secondPayloads = secondEvents.map(event => event.payload);

      expect(secondResult).toEqual(firstResult);
      expect(secondPayloads).toEqual(firstPayloads);
      expect(firstResult).toMatchObject({ count: 15, crackleInterval: 3, frequency: 0.5 });
      expect(firstPayloads.every(payload => payload.forceRocket === true)).toBe(true);
      expect(firstPayloads.some(payload => payload.crackleEnabled)).toBe(true);
      expect(firstEvents.at(-1).due - firstEvents[0].due).toBeCloseTo(5000, 6);
      expect(firstEvents[1].due - firstEvents[0].due).toBeCloseTo(5000 / 14, 6);

      const muted = makeOrchestrator();
      expect(muted.handleFinale({ seed: 1234, intensity: 5, burstCount: 12, crackleFrequency: 0 }))
        .toMatchObject({ frequency: 0, crackleInterval: Number.POSITIVE_INFINITY, seededPhase: -1 });
      expect(muted.timelineQueue.filter(event => event.type === 'finale-launch')
        .every(event => event.payload.crackleEnabled === false)).toBe(true);
    });

    test('uses one ordered effect plan for launch, explosion and crackle', () => {
      const engine = makeOrchestrator();
      const explosion = {
        id: 'effect-42', intensity: 3,
        sound: { crackle: 'crackling-medium', crackleProfile: 'short' }
      };
      const plan = engine.createEffectPlan(explosion, { createdAt: 1000, flightDuration: 1.4, seed: 42 });
      expect(plan).toMatchObject({
        id: 'effect-42', launchAt: 1000, explodeAt: 2400,
        crackleAt: 2580, crackleProfile: 'short', crackleDuration: 0.65, cracklePulseCount: 4
      });

      engine.processLaunch = jest.fn();
      engine.processExplosion = jest.fn();
      engine.processCrackle = jest.fn();
      engine.audio.syncClock = jest.fn();
      engine.enqueueEffectPlan(plan);
      engine.processTimeline(2580);
      expect(engine.processLaunch).toHaveBeenCalledWith(plan, 1000, 2580);
      expect(engine.processExplosion).toHaveBeenCalledWith(explosion, plan, 2400, 2580);
      expect(engine.processCrackle).toHaveBeenCalledWith(plan, 2580, 2580);
      expect(engine.timelineQueue.map(event => event.type)).toEqual(['crackle-end', 'cleanup']);
    });
  });

  describe('crackle GPU pulses and shape contracts', () => {
    test.each([
      ['short', 0.65, 4],
      ['long', 1, 6]
    ])('creates the %s profile as timed GPU micro-pulses', (profile, expectedDuration, pulseCount) => {
      const engine = new WebGPUParticleEngine({ width: 1920, height: 1080 }, {});
      engine.initialized = true;
      const returnedDuration = engine.spawnCrackle({
        effectId: `crackle-${profile}`, seed: 99, profile, intensity: 1,
        origin: { x: 960, y: 320 }, colors: ['#fff4b0']
      });
      expect(returnedDuration).toBe(expectedDuration);
      expect(engine.spawnQueue).toHaveLength(1);
      const command = engine.spawnQueue[0];
      expect(command).toMatchObject({ shape: 7, pulseCount, globalCount: pulseCount * 4, secondary: 0 });
      expect(command.duration).toBe(expectedDuration);
      expect(command.particleDuration + command.emissionSpread).toBeCloseTo(expectedDuration, 6);
      expect((command.flags >> 3) & 7).toBe(pulseCount);
      expect((command.flags >> 8) & 15).toBe(8);
    });

    test('keeps one global contour index across multicolor shape commands', () => {
      const engine = new WebGPUParticleEngine({ width: 1920, height: 1080 }, {});
      engine.initialized = true;
      engine.spawnExplosion({
        effectId: 'heart-rainbow', seed: 77, shape: 'heart', count: 37,
        colors: ['#ff0000', '#00ff00', '#0000ff']
      });
      expect(engine.spawnQueue.map(command => command.count)).toEqual([13, 12, 12]);
      expect(engine.spawnQueue.map(command => command.globalIndexBase)).toEqual([0, 13, 25]);
      expect(engine.spawnQueue.every(command => command.globalCount === 37)).toBe(true);
      expect(new Set(engine.spawnQueue.map(command => command.effectId)).size).toBe(1);
    });
  });

  describe('audio mixer deadlines and telemetry', () => {
    test('enforces per-bus budgets and protects active crackling voices', () => {
      const audio = new AudioManager();
      const launchStops = Array.from({ length: 4 }, () => jest.fn());
      audio.activeVoices = launchStops.map((stop, index) => ({
        bus: 'launch', priority: 1, startedAt: index, protectedUntil: 0, source: { stop }
      }));
      expect(audio.makeVoiceRoom('launch', 2)).toBe(true);
      expect(launchStops.some(stop => stop.mock.calls.length > 0)).toBe(true);
      expect(audio.evictions).toBe(1);

      const protectedUntil = performance.now() + 5000;
      audio.activeVoices = Array.from({ length: 6 }, (_, index) => ({
        bus: 'crackle', priority: 4, startedAt: index, protectedUntil, source: { stop: jest.fn() }
      }));
      expect(audio.makeVoiceRoom('crackle', 5)).toBe(false);
      expect(audio.activeVoices).toHaveLength(6);
      expect(audio.evictions).toBe(1);
    });

    test('keeps a -1 dBFS ceiling and gives the HTML fallback mix headroom', () => {
      const audio = new AudioManager();
      audio.volume = 1;
      const voice = { bus: 'bang', level: 1 };
      audio.activeVoices = [voice];
      expect(audio.getHtmlVoiceVolume(voice)).toBeCloseTo(0.891250938, 7);
      audio.activeVoices = Array.from({ length: 4 }, () => ({ bus: 'launch', level: 1 }));
      expect(audio.getHtmlVoiceVolume(audio.activeVoices[0])).toBeCloseTo(0.891250938 / 2, 7);
    });

    test('drops stale audio instead of replaying it late', async () => {
      const audio = new AudioManager();
      const plannedAt = performance.now() - 500;
      await expect(audio.play('explosion-big', 1, 3, {
        effectId: 'stale-bang', eventType: 'bang-audio', bus: 'bang',
        plannedAt, maxLatenessMs: 100
      })).resolves.toBe(false);
      expect(audio.getTelemetry()).toMatchObject({ missedAudioEvents: 1 });
      expect(audio.getTelemetry().timelineEvents.at(-1)).toMatchObject({
        effectId: 'stale-bang', type: 'bang-audio', state: 'missed-stale'
      });
    });

    test('reports bus voice counts and caps timeline telemetry at 32 events', () => {
      const audio = new AudioManager();
      audio.activeVoices = [
        { bus: 'launch' }, { bus: 'bang' }, { bus: 'bang' }, { bus: 'crackle' }
      ];
      audio.evictions = 3;
      audio.missedEvents = 2;
      audio.crackleState = 'playing';
      audio.lastAudioProfile = 'long';
      audio.samplePeak = jest.fn(() => 0.5);
      for (let index = 0; index < 40; index++) {
        audio.recordTimelineEvent(`effect-${index}`, 'audio', index * 10, index * 10 + 2);
      }
      expect(audio.getTelemetry()).toMatchObject({
        lastAudioProfile: 'long', crackleState: 'playing',
        activeVoices: { launch: 1, bang: 2, crackle: 1, total: 4 },
        audioEvictions: 3, missedAudioEvents: 2, audioPeak: -6
      });
      expect(audio.getTelemetry().timelineEvents).toHaveLength(32);
      expect(audio.getTelemetry().timelineEvents[0].effectId).toBe('effect-8');
    });

    test('applies cue trims, playback limits and crackle volume before playback', () => {
      const audio = new AudioManager();
      audio.setCrackleVolume(0.5);
      const trimmedLaunch = audio.resolvePlayback('combined-whistle-tiny1', 1, 1, { offset: 0.2, maxDuration: 2 });
      expect(trimmedLaunch).toMatchObject({ bus: 'launch', offset: 0.2 });
      expect(trimmedLaunch.maxDuration).toBeCloseTo(0.64, 6);
      expect(audio.resolvePlayback('crackling-long', 1, 4, {})).toMatchObject({
        bus: 'crackle', offset: 0.1, maxDuration: 1, level: 0.31, playbackRate: 1
      });
    });

    test('fits bundled launch cues to the complete flight and fades into the bang frame', () => {
      const audio = new AudioManager();
      const shortFlight = audio.fitLaunchToFlight({
        launch: 'combined-whistle-normal', launchWindow: 3.08,
        bang: 'explosion-small', crackle: null, crackleProfile: null
      }, 0.6, 17);
      expect(shortFlight).toMatchObject({ launch: 'launch-basic2', launchWindow: 0.6 });

      const longFlight = audio.fitLaunchToFlight({
        launch: 'combined-whistle-tiny1', launchWindow: 0.84,
        bang: 'explosion-big', crackle: null, crackleProfile: null
      }, 1.8, 19);
      expect(longFlight).toMatchObject({ launch: 'launch-smooth2', launchWindow: 1.7 });
      expect(audio.resolvePlayback(longFlight.launch, 1, 1, {
        playbackRate: longFlight.launchWindow / 1.8,
        maxDuration: 1.8
      }).maxDuration).toBeCloseTo(1.8, 6);
    });
  });

  describe('renderer frame and post-processing contracts', () => {
    test('continues compute simulation when presentation is skipped', () => {
      const harness = makeRendererHarness();
      harness.engine.render(1 / 60, 1, { present: false });
      expect(harness.encoderLabels).toEqual(['fireworks-compute-frame']);
      expect(harness.computePipelines).toEqual(['reset', 'update', 'secondary']);
      expect(harness.dispatches).toHaveLength(3);
      expect(harness.renderPipelines).toHaveLength(0);
      expect(harness.engine.device.queue.submit).toHaveBeenCalledTimes(1);
    });

    test('advances a delayed frame through deterministic 60 Hz simulation steps', () => {
      const harness = makeRendererHarness();
      harness.engine.render(0.05, 1, { present: false });
      expect(harness.encoderLabels).toEqual([
        'fireworks-compute-frame', 'fireworks-compute-frame', 'fireworks-compute-frame'
      ]);
      expect(harness.computePipelines).toEqual([
        'reset', 'update', 'secondary',
        'reset', 'update', 'secondary',
        'reset', 'update', 'secondary'
      ]);
      expect(harness.engine.device.queue.submit).toHaveBeenCalledTimes(3);
      expect(harness.engine.simulationAccumulator).toBeCloseTo(0, 7);
    });

    test('trail and glow switches remove their real render passes without removing the core', () => {
      const disabled = makeRendererHarness();
      disabled.engine.setQuality({ trailsEnabled: false, glowEnabled: false, bloomEnabled: false });
      disabled.engine.render(1 / 60, 1);
      expect(disabled.renderPipelines).toContain('core');
      expect(disabled.renderPipelines).not.toContain('trail');
      expect(disabled.renderPipelines).not.toContain('glow');

      const enabled = makeRendererHarness({ trailsEnabled: true, glowEnabled: true, bloomEnabled: false });
      enabled.engine.setQuality({ trailsEnabled: true, glowEnabled: true, bloomEnabled: false });
      enabled.engine.render(1 / 60, 1);
      expect(enabled.renderPipelines).toEqual(expect.arrayContaining(['trail', 'glow', 'core']));
    });

    test('uses additive multi-level bloom and alpha-aware ACES composition', () => {
      expect(rendererSource).toContain("this.pipelines.bloomUpsample = await makePost('bloomUpsample'");
      expect(rendererSource).toContain("color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }");
      expect(rendererSource).toContain('fn aces(color:vec3f)->vec3f');
      expect(rendererSource).toContain('let straight=aces(radiance/max(alpha,0.001))');
      expect(rendererSource).toContain('straight*alpha');
    });
  });
});
