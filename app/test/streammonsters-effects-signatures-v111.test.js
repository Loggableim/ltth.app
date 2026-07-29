'use strict';

const {
  EFFECT_RECIPES,
  ELEMENT_PALETTES,
  ELEMENT_SIGNATURES,
  QUALITY_BUDGETS,
  SCENE_DURATIONS,
  buildEffectUniforms,
  createEffectsRenderer,
  resolveEffectRecipe,
  sceneChoreography
} = require('../plugins/streamalchemy/streammonsters-effects-renderer');

function deferred() {
  let resolve;
  const promise = new Promise(next => { resolve = next; });
  return { promise, resolve };
}

function createCanvasHarness({ webgpu = false, canvas2d = true } = {}) {
  const calls = [];
  const context2d = canvas2d ? {
    clearRect: jest.fn(),
    beginPath: jest.fn(),
    closePath: jest.fn(),
    arc: jest.fn(),
    stroke: jest.fn(),
    fill: jest.fn(),
    save: jest.fn(),
    restore: jest.fn(),
    translate: jest.fn(),
    scale: jest.fn(),
    rotate: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    quadraticCurveTo: jest.fn(),
    bezierCurveTo: jest.fn(),
    ellipse: jest.fn(),
    fillRect: jest.fn(),
    setLineDash: jest.fn(),
    set globalAlpha(value) { this.alpha = value; },
    set strokeStyle(value) { this.strokeColor = value; },
    set fillStyle(value) { this.fillColor = value; },
    set lineWidth(value) { this.width = value; }
  } : null;
  const pass = {
    setPipeline: jest.fn(),
    setBindGroup: jest.fn(),
    draw: jest.fn(),
    end: jest.fn()
  };
  const encoder = {
    beginRenderPass: jest.fn(() => pass),
    finish: jest.fn(() => ({ command: true }))
  };
  const lost = deferred();
  const device = {
    lost: lost.promise,
    createShaderModule: jest.fn(() => ({ shader: true })),
    createRenderPipeline: jest.fn(() => ({
      getBindGroupLayout: jest.fn(() => ({ layout: true }))
    })),
    createBuffer: jest.fn(() => ({ buffer: true })),
    createBindGroup: jest.fn(() => ({ bindGroup: true })),
    createCommandEncoder: jest.fn(() => encoder),
    queue: {
      writeBuffer: jest.fn((...args) => calls.push(args)),
      submit: jest.fn()
    }
  };
  const gpuContext = {
    configure: jest.fn(),
    getCurrentTexture: jest.fn(() => ({
      createView: jest.fn(() => ({ view: true }))
    }))
  };
  const styleValues = new Map();
  const canvas = {
    width: 1080,
    height: 1920,
    clientWidth: 1080,
    clientHeight: 1920,
    classList: { toggle: jest.fn() },
    dataset: {},
    style: {
      setProperty: jest.fn((key, value) => styleValues.set(key, value)),
      removeProperty: jest.fn(key => styleValues.delete(key))
    },
    getContext: jest.fn(type => {
      if (type === 'webgpu') return webgpu ? gpuContext : null;
      if (type === '2d') return context2d;
      return null;
    })
  };
  const gpu = webgpu ? {
    requestAdapter: jest.fn(async () => ({
      requestDevice: jest.fn(async () => device)
    })),
    getPreferredCanvasFormat: jest.fn(() => 'bgra8unorm')
  } : null;
  return {
    calls,
    canvas,
    context2d,
    device,
    gpu,
    lost,
    styleValues
  };
}

describe('Stream Monsters 1.11 element effect signatures', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('six elements expose distinct attack, defense and special motif signatures', () => {
    const expected = {
      Ember: {
        attack: ['flame-tongues', 'rising-sparks'],
        defense: ['heat-distortion-rings', 'ember-guard'],
        special: ['fire-vortex', 'radial-sparks', 'hot-core']
      },
      Tide: {
        attack: ['curved-water-ribbon', 'droplets'],
        defense: ['concentric-tide-rings', 'mist'],
        special: ['cresting-wave-arcs', 'foam-mist-burst']
      },
      Grove: {
        attack: ['winding-vine', 'leaf-shards'],
        defense: ['root-crystal-barrier'],
        special: ['root-eruption', 'leaf-spiral', 'crystal-bloom']
      },
      Gale: {
        attack: ['fast-wind-ribbons', 'feathers'],
        defense: ['pressure-rings'],
        special: ['cyclone-ribbons', 'feather-burst']
      },
      Volt: {
        attack: ['branching-lightning', 'afterimage'],
        defense: ['static-afterimage-shell'],
        special: ['chain-lightning-storm', 'white-flash']
      },
      Lunar: {
        attack: ['travelling-crescents', 'stars'],
        defense: ['shadow-veil'],
        special: ['eclipse-disc', 'crescents', 'orbiting-stars']
      }
    };

    expect(Object.keys(ELEMENT_SIGNATURES)).toEqual(Object.keys(expected));
    for (const [element, scenes] of Object.entries(expected)) {
      for (const [scene, motifs] of Object.entries(scenes)) {
        const choreography = sceneChoreography(scene, { element });
        expect(choreography.signature).toMatchObject({
          id: `${element.toLowerCase()}:${scene}`,
          element: element.toLowerCase(),
          scene,
          motifs
        });
      }
    }
    const ids = Object.keys(expected).flatMap(element => (
      ['attack', 'defense', 'special'].map(scene => (
        sceneChoreography(scene, { element }).signature.id
      ))
    ));
    expect(new Set(ids).size).toBe(18);
  });

  test('publishes the literal 18 semantic recipes and three-color element palettes', () => {
    const expected = {
      Ember: {
        palette: ['#ff5a36', '#ffb347', '#fff2b0'],
        attack: {
          description: 'directional flame tongues + rising sparks',
          motifs: ['flame-tongues', 'rising-sparks']
        },
        defense: {
          description: 'heat-distortion rings + ember guard',
          motifs: ['heat-distortion-rings', 'ember-guard']
        },
        special: {
          description: 'fire vortex + radial sparks + hot core',
          motifs: ['fire-vortex', 'radial-sparks', 'hot-core']
        }
      },
      Tide: {
        palette: ['#2bbcff', '#70f5ff', '#dffbff'],
        attack: {
          description: 'curved water ribbon + droplets',
          motifs: ['curved-water-ribbon', 'droplets']
        },
        defense: {
          description: 'concentric tide rings + mist',
          motifs: ['concentric-tide-rings', 'mist']
        },
        special: {
          description: 'cresting wave arcs + foam/mist burst',
          motifs: ['cresting-wave-arcs', 'foam-mist-burst']
        }
      },
      Grove: {
        palette: ['#48d17c', '#a8e65c', '#f4ffb0'],
        attack: {
          description: 'winding vine + leaf shards',
          motifs: ['winding-vine', 'leaf-shards']
        },
        defense: {
          description: 'root/crystal barrier',
          motifs: ['root-crystal-barrier']
        },
        special: {
          description: 'root eruption + leaf spiral + crystal bloom',
          motifs: ['root-eruption', 'leaf-spiral', 'crystal-bloom']
        }
      },
      Gale: {
        palette: ['#8ef3e2', '#d7ffff', '#b9cfff'],
        attack: {
          description: 'fast wind ribbons + feathers',
          motifs: ['fast-wind-ribbons', 'feathers']
        },
        defense: {
          description: 'pressure rings',
          motifs: ['pressure-rings']
        },
        special: {
          description: 'cyclone ribbons + feather burst',
          motifs: ['cyclone-ribbons', 'feather-burst']
        }
      },
      Volt: {
        palette: ['#ffe45e', '#7efcff', '#ffffff'],
        attack: {
          description: 'branching lightning + afterimage',
          motifs: ['branching-lightning', 'afterimage']
        },
        defense: {
          description: 'static afterimage shell',
          motifs: ['static-afterimage-shell']
        },
        special: {
          description: 'chain-lightning storm + white flash',
          motifs: ['chain-lightning-storm', 'white-flash']
        }
      },
      Lunar: {
        palette: ['#b98cff', '#6e5bff', '#f4e7ff'],
        attack: {
          description: 'travelling crescents + stars',
          motifs: ['travelling-crescents', 'stars']
        },
        defense: {
          description: 'shadow veil',
          motifs: ['shadow-veil']
        },
        special: {
          description: 'eclipse disc + crescents + orbiting stars',
          motifs: ['eclipse-disc', 'crescents', 'orbiting-stars']
        }
      }
    };

    expect(ELEMENT_PALETTES).toEqual(Object.fromEntries(
      Object.entries(expected).map(([element, recipe]) => [element, recipe.palette])
    ));
    for (const [element, elementExpected] of Object.entries(expected)) {
      for (const action of ['attack', 'defense', 'special']) {
        expect(EFFECT_RECIPES[element][action]).toEqual(expect.objectContaining({
          id: `${element.toLowerCase()}:${action}`,
          element,
          action,
          palette: elementExpected.palette,
          description: elementExpected[action].description,
          motifs: elementExpected[action].motifs
        }));
      }
    }
    expect(Object.values(EFFECT_RECIPES).flatMap(Object.values)).toHaveLength(18);
    expect(new Set(Object.values(EFFECT_RECIPES)
      .flatMap(Object.values)
      .map(recipe => recipe.motifCode)).size).toBe(18);
  });

  test('element and action choose the recipe while vfxKey changes only its accent seed', () => {
    const emberA = resolveEffectRecipe({
      element: 'Ember',
      action: 'attack',
      vfxKey: 'ashfang:attack'
    });
    const emberB = resolveEffectRecipe({
      element: 'Ember',
      action: 'attack',
      vfxKey: 'cinder:attack'
    });
    const tide = resolveEffectRecipe({
      element: 'Tide',
      action: 'attack',
      vfxKey: 'ashfang:attack'
    });

    expect(emberA).toEqual(expect.objectContaining({
      id: 'ember:attack',
      motifCode: EFFECT_RECIPES.Ember.attack.motifCode
    }));
    expect(emberB).toEqual(expect.objectContaining({
      id: 'ember:attack',
      motifCode: EFFECT_RECIPES.Ember.attack.motifCode
    }));
    expect(emberA.accentSeed).not.toBe(emberB.accentSeed);
    expect(tide.id).toBe('tide:attack');
    expect(tide.motifCode).not.toBe(emberA.motifCode);
  });

  test('hit shield heal evade and primary status alter GPU particle semantics', () => {
    const plain = buildEffectUniforms(sceneChoreography('attack', {
      element: 'Volt',
      actorSlot: 1,
      targetSlot: 2,
      vfxKey: 'pulse:attack'
    }), { timestamp: 500, progress: 0.45, phaseCode: 2, aspect: 0.5625 });
    const resolved = buildEffectUniforms(sceneChoreography('attack', {
      element: 'Volt',
      actorSlot: 1,
      targetSlot: 2,
      vfxKey: 'pulse:attack',
      hitIndex: 2,
      hitCount: 3,
      shieldGain: 5,
      healing: 4,
      evaded: true,
      statusEffects: [{ type: 'shock' }]
    }), { timestamp: 500, progress: 0.45, phaseCode: 2, aspect: 0.5625 });

    expect(resolved.semantic).toEqual(expect.objectContaining({
      recipeId: 'volt:attack',
      motifCode: EFFECT_RECIPES.Volt.attack.motifCode,
      hitIndex: 2,
      hitCount: 3,
      shield: 5,
      heal: 4,
      evade: 1,
      primaryStatus: 'shock'
    }));
    expect(resolved.values).not.toEqual(plain.values);
  });

  test('auto, high, medium and low expose bounded descending render budgets', () => {
    expect(Object.keys(QUALITY_BUDGETS)).toEqual(['auto', 'high', 'medium', 'low']);
    expect(QUALITY_BUDGETS).toEqual({
      auto: { particles: 72, trailSegments: 22, layers: 3, bloom: 0.82 },
      high: { particles: 112, trailSegments: 32, layers: 4, bloom: 1 },
      medium: { particles: 56, trailSegments: 18, layers: 3, bloom: 0.66 },
      low: { particles: 24, trailSegments: 8, layers: 2, bloom: 0.38 }
    });
    expect(sceneChoreography('special', { element: 'Volt', quality: 'invalid' }).quality)
      .toBe('auto');
    expect(sceneChoreography('special', { element: 'Volt', quality: 'low' }).budget)
      .toEqual(QUALITY_BUDGETS.low);
  });

  test('multi-hit choreography keeps source and target anchors plus readable outcomes', () => {
    const choreography = sceneChoreography('attack', {
      element: 'Volt',
      origin: { x: 0.18, y: 0.62 },
      targetOrigin: { x: 0.81, y: 0.38 },
      hitIndex: 2,
      hitCount: 4,
      hits: [{ hpDamage: 7, shieldAbsorbed: 2 }],
      outcomes: [
        { type: 'shield', amount: 4 },
        { type: 'heal', amount: 3 }
      ],
      statusEffects: [{ type: 'shock' }]
    });

    expect(choreography.origin).toEqual({ x: 0.18, y: 0.62 });
    expect(choreography.targetOrigin).toEqual({ x: 0.81, y: 0.38 });
    expect(choreography.hit).toEqual({ index: 2, count: 4 });
    expect(choreography.metadata).toEqual({
      damage: 7,
      shieldAbsorbed: 2,
      shield: 4,
      heal: 3,
      statuses: ['shock'],
      readable: 'Damage 7 · Absorbed 2 · Shield +4 · Heal +3 · Shock'
    });

    const slotAnchored = sceneChoreography('defense', {
      element: 'Grove',
      actorSlot: 2,
      targetSlot: 1,
      hpDamage: 5,
      shieldGain: 6,
      healing: 2,
      evaded: true
    });
    expect(slotAnchored.origin).toEqual({ x: 0.72, y: 0.52 });
    expect(slotAnchored.targetOrigin).toEqual(slotAnchored.origin);
    expect(slotAnchored.metadata).toEqual({
      damage: 5,
      shieldAbsorbed: 0,
      shield: 6,
      heal: 2,
      statuses: ['evade'],
      readable: 'Damage 5 · Shield +6 · Heal +2 · Evade'
    });
  });

  test('Canvas2D fallback publishes the same deterministic signature contract for CSS', async () => {
    const harness = createCanvasHarness();
    const renderer = createEffectsRenderer({
      canvas: harness.canvas,
      navigator: {},
      quality: 'medium',
      matchMedia: () => ({ matches: false }),
      requestAnimationFrame: callback => setTimeout(() => callback(Date.now()), 16),
      cancelAnimationFrame: clearTimeout,
      now: () => Date.now()
    });

    await renderer.init();
    const completion = renderer.play('attack', {
      element: 'Volt',
      origin: { x: 0.2, y: 0.6 },
      targetOrigin: { x: 0.8, y: 0.4 },
      hitIndex: 2,
      hitCount: 3,
      hits: [{ hpDamage: 8, shieldAbsorbed: 2 }],
      outcomes: [{ type: 'heal', amount: 3 }],
      statusEffects: [{ type: 'shock' }]
    });
    await jest.advanceTimersByTimeAsync(32);

    expect(harness.canvas.dataset).toEqual(expect.objectContaining({
      effectSignature: 'volt:attack',
      effectScene: 'attack',
      effectHit: '2/3',
      effectTarget: '0.800,0.400',
      effectQuality: 'medium',
      effectMetadata: 'Damage 8 · Absorbed 2 · Heal +3 · Shock'
    }));
    expect(harness.canvas.dataset.effectMotifs).toBe('branching-lightning,afterimage');
    expect(harness.context2d.translate).toHaveBeenCalledWith(216, 1152);
    expect(harness.context2d.lineTo).toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(SCENE_DURATIONS.attack);
    await expect(completion).resolves.toEqual(expect.objectContaining({
      signature: 'volt:attack',
      hit: { index: 2, count: 3 },
      metadata: expect.objectContaining({ damage: 8, heal: 3 })
    }));
  });

  test('CSS-only fallback advances the same phase timeline without a 2D context', async () => {
    const harness = createCanvasHarness({ canvas2d: false });
    const renderer = createEffectsRenderer({
      canvas: harness.canvas,
      navigator: {},
      matchMedia: () => ({ matches: false }),
      requestAnimationFrame: callback => setTimeout(() => callback(Date.now()), 16),
      cancelAnimationFrame: clearTimeout,
      now: () => Date.now()
    });

    await renderer.init();
    const completion = renderer.play('special', {
      element: 'Lunar',
      origin: { x: 0.3, y: 0.7 },
      targetOrigin: { x: 0.7, y: 0.3 }
    });
    await jest.advanceTimersByTimeAsync(32);

    expect(renderer.status()).toEqual(expect.objectContaining({
      renderer: 'css',
      quality: 'auto',
      effectiveQuality: 'auto',
      reducedMotion: false
    }));
    expect(harness.canvas.dataset.effectSignature).toBe('lunar:special');
    expect(harness.canvas.dataset.effectPhase).toBe('charge');
    expect(harness.styleValues.get('--sm-effect-color')).toBe('#b98cff');

    await jest.advanceTimersByTimeAsync(SCENE_DURATIONS.special);
    await completion;
  });

  test('WebGPU uniforms carry element, quality, hit, target and outcome semantics', async () => {
    const harness = createCanvasHarness({ webgpu: true });
    const renderer = createEffectsRenderer({
      canvas: harness.canvas,
      navigator: { gpu: harness.gpu },
      quality: 'high',
      matchMedia: () => ({ matches: false }),
      requestAnimationFrame: callback => setTimeout(() => callback(Date.now()), 16),
      cancelAnimationFrame: clearTimeout,
      now: () => Date.now()
    });

    await renderer.init();
    const completion = renderer.play('attack', {
      element: 'Volt',
      origin: { x: 0.2, y: 0.6 },
      targetOrigin: { x: 0.8, y: 0.4 },
      hitIndex: 2,
      hitCount: 3,
      outcomes: [
        { type: 'shield', amount: 4 },
        { type: 'heal', amount: 3 }
      ]
    });
    await jest.advanceTimersByTimeAsync(32);

    const uniforms = [...harness.calls.at(-1)[2]];
    expect(uniforms.slice(16, 20)).toEqual([
      1,
      expect.any(Number),
      EFFECT_RECIPES.Volt.attack.motifCode,
      3
    ]);
    expect(uniforms.slice(28, 32)).toEqual([
      expect.closeTo(0.8),
      expect.closeTo(0.4),
      2,
      3
    ]);
    expect(uniforms.slice(32, 34)).toEqual([4, 3]);
    expect(harness.canvas.dataset.effectSignature).toBe('volt:attack');

    await jest.advanceTimersByTimeAsync(SCENE_DURATIONS.attack);
    await completion;
  });

  test('status exposes reduced motion, device loss and automatic low-FPS budgeting', async () => {
    const reduced = createCanvasHarness();
    const reducedRenderer = createEffectsRenderer({
      canvas: reduced.canvas,
      navigator: {},
      quality: 'high',
      matchMedia: () => ({ matches: true })
    });
    await reducedRenderer.init();
    expect(reducedRenderer.status()).toEqual(expect.objectContaining({
      quality: 'high',
      effectiveQuality: 'low',
      reducedMotion: true,
      deviceLost: false,
      budget: QUALITY_BUDGETS.low
    }));

    const slow = createCanvasHarness();
    const slowRenderer = createEffectsRenderer({
      canvas: slow.canvas,
      navigator: {},
      quality: 'auto',
      lowFpsThreshold: 24,
      lowFpsSampleSize: 3,
      matchMedia: () => ({ matches: false }),
      requestAnimationFrame: callback => setTimeout(() => callback(Date.now()), 100),
      cancelAnimationFrame: clearTimeout,
      now: () => Date.now()
    });
    await slowRenderer.init();
    const slowPlay = slowRenderer.play('special', { element: 'Ember' });
    await jest.advanceTimersByTimeAsync(500);
    expect(slowRenderer.status()).toEqual(expect.objectContaining({
      quality: 'auto',
      effectiveQuality: 'low',
      fps: 10,
      fpsDegraded: true,
      budget: QUALITY_BUDGETS.low
    }));
    await jest.advanceTimersByTimeAsync(SCENE_DURATIONS.special);
    await slowPlay;

    const gpu = createCanvasHarness({ webgpu: true });
    const gpuRenderer = createEffectsRenderer({
      canvas: gpu.canvas,
      navigator: { gpu: gpu.gpu },
      matchMedia: () => ({ matches: false })
    });
    await gpuRenderer.init();
    gpu.lost.resolve({ reason: 'destroyed' });
    await Promise.resolve();
    expect(gpuRenderer.status()).toEqual(expect.objectContaining({
      deviceLost: true,
      fallbackReason: 'device-lost',
      renderer: 'canvas2d'
    }));
  });
});
