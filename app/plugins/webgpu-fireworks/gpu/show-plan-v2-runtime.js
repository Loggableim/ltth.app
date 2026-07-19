'use strict';

(function exposeShowPlanV2Runtime(root, factory) {
  const runtime = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = runtime;
  if (root) root.WebGPUFireworksShowPlanV2Runtime = runtime;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const PLAN_VERSION = 2;
  const LAUNCH_MODES = new Set(['rocket', 'airburst', 'ground']);
  const PRIMITIVES = new Set(['radial', 'ring', 'spiral', 'palm', 'crossette', 'comet', 'mine', 'glyph']);
  const GLYPHS = new Set([
    'paw', 'heart', 'star', 'fox-head', 'wolf-head', 'dragon', 'dragon-wing', 'tail',
    'boykisser', 'trans-flag'
  ]);
  const PHASES = new Set(['opening', 'build', 'highlight', 'calm', 'bridge', 'breath', 'finale']);
  const TIERS = new Set(['small', 'medium', 'big', 'massive']);
  const PRIORITIES = new Set(['core', 'accent', 'decorative']);
  const PREMIUM_BUILT_IN_STYLES = new Set([
    'nishiki-kamuro',
    'aurora-cathedral',
    'royal-brocade',
    'phoenix-ascension',
    'furry-celebration'
  ]);
  const COLOR_PATTERN = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;
  const DEFAULT_RENDER_HINTS = Object.freeze({
    depthEnabled: false,
    launchDepth: 0,
    burstDepth: 0,
    glyphScale: 1
  });
  const MAX_REQUIRED_SHOW_COMMANDS = 28;
  const TIER_RANK = Object.freeze({ small: 0, medium: 1, big: 2, massive: 3 });
  const ROLE_ALIASES = Object.freeze({
    'baroque-wall': 'brocade',
    vault: 'cathedral',
    comet: 'cathedral',
    crossette: 'chrysanthemum',
    palm: 'brocade',
    pistil: 'brocade',
    'heavy-single': 'mine',
    'wing-fan': 'wings',
    celebration: 'rainbow',
    'gold-crown': 'rainbow'
  });
  const CURATED_ROLES = new Set([
    'single', 'call', 'pair', 'response', 'ballet', 'accent', 'floral', 'volley',
    'salute', 'heavy', 'crown', 'wall', 'wave', 'peony', 'chrysanthemum',
    'willow', 'cathedral', 'brocade', 'mine', 'wings', 'dragon', 'rainbow'
  ]);

  const finite = value => Number.isFinite(Number(value));
  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

  function fail(message) {
    throw new TypeError(`Invalid ShowPlanV2: ${message}`);
  }

  function assertPoint(point, path, maximumY) {
    if (!point || typeof point !== 'object' || Array.isArray(point) || !finite(point.x) || !finite(point.y)) {
      fail(`${path} must be a finite point`);
    }
    if (Number(point.x) < 0 || Number(point.x) > 1 || Number(point.y) < 0 || Number(point.y) > maximumY) {
      fail(`${path} is outside the normalized stage`);
    }
  }

  function assertLayer(layer, path) {
    if (!layer || typeof layer !== 'object' || Array.isArray(layer)) fail(`${path} must be an object`);
    if (!PRIMITIVES.has(layer.primitive)) fail(`${path}.primitive is unsupported`);
    if (layer.primitive === 'glyph' && !GLYPHS.has(layer.glyph)) fail(`${path}.glyph is unsupported`);
    if (!Number.isInteger(layer.delayMs) || layer.delayMs < 0) fail(`${path}.delayMs must be a non-negative integer`);
    if (!Number.isInteger(layer.density) || layer.density < 1 || layer.density > 8192) fail(`${path}.density is unsupported`);
    if (!finite(layer.size) || Number(layer.size) < 0.05 || Number(layer.size) > 10) fail(`${path}.size is unsupported`);
    if (!Number.isInteger(layer.lifetimeMs) || layer.lifetimeMs < 1 || layer.lifetimeMs > 10000) fail(`${path}.lifetimeMs is unsupported`);
    if (!finite(layer.gravity) || Number(layer.gravity) < -10 || Number(layer.gravity) > 10) fail(`${path}.gravity is unsupported`);
    if (!finite(layer.drag) || Number(layer.drag) < 0 || Number(layer.drag) > 1) fail(`${path}.drag is unsupported`);
    for (const property of ['trail', 'split', 'strobe', 'core']) {
      if (typeof layer[property] !== 'boolean') fail(`${path}.${property} must be boolean`);
    }
    if (!PRIORITIES.has(layer.priority)) fail(`${path}.priority is unsupported`);
    if (layer.priority === 'decorative' && layer.core) fail(`${path} has an inconsistent decorative core`);
    if (!Array.isArray(layer.colors) || layer.colors.length < 1 || layer.colors.length > 4) {
      fail(`${path}.colors must contain between one and four colors`);
    }
    if (layer.colors.some(color => typeof color !== 'string' || !COLOR_PATTERN.test(color))) {
      fail(`${path}.colors must use hexadecimal colors`);
    }
  }

  function assertRenderHints(renderHints, path) {
    if (!renderHints || typeof renderHints !== 'object' || Array.isArray(renderHints)) {
      fail(`${path} must be an object`);
    }
    if (typeof renderHints.depthEnabled !== 'boolean') fail(`${path}.depthEnabled must be boolean`);
    for (const property of ['launchDepth', 'burstDepth']) {
      if (!Number.isFinite(renderHints[property]) || renderHints[property] < -1 || renderHints[property] > 1) {
        fail(`${path}.${property} must be finite and between -1 and 1`);
      }
    }
    if (!Number.isFinite(renderHints.glyphScale) || renderHints.glyphScale < 0.5 || renderHints.glyphScale > 2) {
      fail(`${path}.glyphScale must be finite and between 0.5 and 2`);
    }
    if (renderHints.glyphExtent !== undefined && (!Number.isFinite(renderHints.glyphExtent)
      || renderHints.glyphExtent <= 0 || renderHints.glyphExtent > 1)) {
      fail(`${path}.glyphExtent must be finite and greater than zero through one`);
    }
  }

  function normalizeRenderHints(renderHints) {
    if (renderHints === undefined) return { ...DEFAULT_RENDER_HINTS };
    return {
      depthEnabled: renderHints.depthEnabled,
      launchDepth: Number(renderHints.launchDepth),
      burstDepth: Number(renderHints.burstDepth),
      glyphScale: Number(renderHints.glyphScale),
      ...(renderHints.glyphExtent === undefined ? {} : { glyphExtent: Number(renderHints.glyphExtent) })
    };
  }

  function assertShowPlanV2(showPlan) {
    const version = Number(showPlan?.planVersion);
    if (version !== PLAN_VERSION) throw new TypeError(`Unsupported ShowPlan version ${String(showPlan?.planVersion)}.`);
    if (!finite(showPlan.durationMs) || Number(showPlan.durationMs) <= 0) fail('durationMs must be positive');
    if (!Array.isArray(showPlan.cues) || showPlan.cues.length < 1) fail('cues must be a non-empty array');
    if (!['classic', 'premium-realistic'].includes(showPlan.materialProfile)) fail('materialProfile is unsupported');

    showPlan.cues.forEach((cue, cueIndex) => {
      const cuePath = `cues.${cueIndex}`;
      if (!cue || typeof cue !== 'object' || Array.isArray(cue)) fail(`${cuePath} must be an object`);
      if (!finite(cue.beatAtMs) || Number(cue.beatAtMs) < 0 || Number(cue.beatAtMs) > Number(showPlan.durationMs)) {
        fail(`${cuePath}.beatAtMs is outside the show duration`);
      }
      if (!PHASES.has(cue.phase)) fail(`${cuePath}.phase is unsupported`);
      if (typeof cue.formation !== 'string' || !cue.formation.trim()) fail(`${cuePath}.formation is required`);
      if (!Array.isArray(cue.shells) || cue.shells.length < 1) fail(`${cuePath}.shells must be a non-empty array`);
      cue.shells.forEach((shell, shellIndex) => {
        const shellPath = `${cuePath}.shells.${shellIndex}`;
        if (!shell || typeof shell !== 'object' || Array.isArray(shell)) fail(`${shellPath} must be an object`);
        if (!LAUNCH_MODES.has(shell.launchMode)) fail(`${shellPath} launch mode is unsupported`);
        if (shell.renderHints !== undefined) assertRenderHints(shell.renderHints, `${shellPath}.renderHints`);
        assertPoint(shell.origin, `${shellPath}.origin`, 1.1);
        assertPoint(shell.target, `${shellPath}.target`, 1);
        if (!TIERS.has(shell.tier)) fail(`${shellPath}.tier is unsupported`);
        if (!Array.isArray(shell.layers) || shell.layers.length < 1 || shell.layers.length > 4) {
          fail(`${shellPath}.layers must contain between one and four layers`);
        }
        shell.layers.forEach((layer, layerIndex) => {
          const layerPath = `${shellPath}.layers.${layerIndex}`;
          assertLayer(layer, layerPath);
          if (Number(cue.beatAtMs) + layer.delayMs >= Number(showPlan.durationMs)) {
            fail(`${layerPath} starts after the complete duration`);
          }
        });
      });
    });
    return showPlan;
  }

  function hashString(value) {
    let hash = 2166136261;
    const text = String(value ?? '');
    for (let index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function layerSeed(showSeed, shell, layer) {
    return ((Number(shell.seed ?? showSeed) >>> 0) ^ hashString(layer.id || layer.primitive)) >>> 0;
  }

  function withSeededRocketColor(shell, seed) {
    const palette = Array.isArray(shell?.palette) && shell.palette.length
      ? shell.palette
      : shell?.colors;
    if (!Array.isArray(palette) || palette.length < 1) return shell;
    const colorIndex = (Number(seed) >>> 0) % palette.length;
    return {
      ...shell,
      colors: [...palette.slice(colorIndex), ...palette.slice(0, colorIndex)]
    };
  }

  function normalizeRole(value) {
    const role = String(value || '').trim().toLowerCase();
    if (ROLE_ALIASES[role]) return ROLE_ALIASES[role];
    return CURATED_ROLES.has(role) ? role : null;
  }

  function detectRole(cue, shell) {
    const direct = normalizeRole(shell?.soundRole);
    if (direct) return direct;
    const formation = String(cue?.formation || '').toLowerCase();
    const formationRole = normalizeRole(formation);
    if (formationRole) return formationRole;
    for (const layer of shell?.layers || []) {
      if (layer.primitive === 'mine') return 'mine';
      if (layer.primitive === 'glyph' && layer.glyph === 'dragon') return 'dragon';
      if (layer.primitive === 'glyph' && layer.glyph === 'dragon-wing') return 'wings';
      if (layer.primitive === 'palm') return cue?.phase === 'finale' ? 'brocade' : 'willow';
      if (layer.primitive === 'crossette') return 'chrysanthemum';
    }
    if (cue?.importance === 'final-wave' || cue?.phase === 'finale') return 'wave';
    if (cue?.importance === 'essential' || cue?.phase === 'highlight') return 'accent';
    if (cue?.phase === 'build') return 'pair';
    return 'single';
  }

  function resolveCueAudioProfile(cue) {
    const shells = Array.isArray(cue?.shells) ? cue.shells : [];
    const dominant = shells.reduce((best, shell) => {
      if (!best) return shell;
      return (TIER_RANK[shell.tier] ?? -1) > (TIER_RANK[best.tier] ?? -1) ? shell : best;
    }, null);
    const tier = dominant?.tier && Object.prototype.hasOwnProperty.call(TIER_RANK, dominant.tier)
      ? dominant.tier
      : 'medium';
    const role = detectRole(cue, dominant);
    const finaleWall = cue?.importance === 'final-wave' && /wall|wave|crown/i.test(String(cue?.formation || ''));
    return {
      role,
      tier,
      voiceCount: finaleWall ? 2 : 1,
      crackle: shells.some(shell => shell.crackleEnabled === true)
    };
  }

  function toPixels(point, width, height) {
    return { x: Number(point.x) * width, y: Number(point.y) * height };
  }

  function calculateRocketFlightMs(target, renderHints = DEFAULT_RENDER_HINTS) {
    const travel = 1 - clamp(Number(target?.y) || 0, 0, 1);
    if (renderHints.depthEnabled !== true) return Math.round((0.55 + travel * 1.25) * 1000);
    const depthTravel = Number(renderHints.burstDepth) - Number(renderHints.launchDepth);
    return Math.round((0.55 + Math.hypot(travel, depthTravel) * 1.25) * 1000);
  }

  function analyzeShowPlanV2CommandDemand(showPlan) {
    assertShowPlanV2(showPlan);
    const commandsByTime = new Map();
    const addDemand = (timeMs, required, optional) => {
      const demand = commandsByTime.get(timeMs) || { timeMs, required: 0, optional: 0, total: 0 };
      demand.required += required;
      demand.optional += optional;
      demand.total += required + optional;
      commandsByTime.set(timeMs, demand);
    };

    for (const cue of showPlan.cues) {
      const cueDue = Number(cue.beatAtMs);
      for (const shell of cue.shells) {
        if (shell.launchMode === 'rocket') {
          const renderHints = normalizeRenderHints(shell.renderHints);
          const naturalFlightDurationMs = calculateRocketFlightMs(shell.target, renderHints);
          const flightDurationMs = Math.min(naturalFlightDurationMs, Math.max(0, cueDue));
          addDemand(cueDue - flightDurationMs, 1, 1);
        }
        for (const layer of shell.layers) {
          addDemand(cueDue + Number(layer.delayMs), layer.core === true ? 1 : 0, layer.core === true ? 0 : 1);
        }
      }
    }

    const timeline = [...commandsByTime.values()].sort((left, right) => left.timeMs - right.timeMs);
    const peakFor = key => timeline.reduce((peak, demand) => (
      demand[key] > peak[key] ? demand : peak
    ), { timeMs: null, required: 0, optional: 0, total: 0 });
    const requiredPeak = peakFor('required');
    const optionalPeak = peakFor('optional');
    const totalPeak = peakFor('total');
    return {
      peakRequiredCommands: requiredPeak.required,
      peakRequiredCommandsAtMs: requiredPeak.timeMs,
      peakOptionalCommands: optionalPeak.optional,
      peakOptionalCommandsAtMs: optionalPeak.timeMs,
      peakTotalCommands: totalPeak.total,
      peakTotalCommandsAtMs: totalPeak.timeMs,
      commandsAtRequiredPeak: {
        required: requiredPeak.required,
        optional: requiredPeak.optional,
        total: requiredPeak.total
      }
    };
  }

  function assertShowPlanV2CommandBudget(showPlan) {
    const demand = analyzeShowPlanV2CommandDemand(showPlan);
    if (demand.peakRequiredCommands <= MAX_REQUIRED_SHOW_COMMANDS) return demand;
    const error = new RangeError('ShowPlanV2 required spawn commands exceed the reserved per-beat budget.');
    error.code = 'spawn_command_budget_exceeded';
    error.details = {
      timeMs: demand.peakRequiredCommandsAtMs,
      max: MAX_REQUIRED_SHOW_COMMANDS,
      actual: demand.peakRequiredCommands,
      optional: demand.commandsAtRequiredPeak.optional,
      total: demand.commandsAtRequiredPeak.total,
      reservedGiftCommands: 4
    };
    error.diagnostics = demand;
    throw error;
  }

  function groupRocketLaunches(rocketEvents, windowMs = 50) {
    const groups = [];
    for (const event of rocketEvents) {
      const previous = groups.at(-1);
      if (!previous || event.due - previous.lastDue > windowMs) {
        groups.push({ due: event.due, lastDue: event.due, rockets: [event] });
      } else {
        previous.lastDue = event.due;
        previous.rockets.push(event);
      }
    }
    return groups;
  }

  function buildShowPlanV2Runtime(showPlan, options = {}) {
    const commandDemand = assertShowPlanV2CommandBudget(showPlan);
    const startAt = finite(options.startAt) ? Number(options.startAt) : 0;
    const width = Math.max(1, Number(options.width) || 1920);
    const height = Math.max(1, Number(options.height) || 1080);
    const durationMs = Number(showPlan.durationMs);
    const completeAt = startAt + durationMs;
    const materialProfile = PREMIUM_BUILT_IN_STYLES.has(showPlan.style)
      ? 'premium-realistic'
      : showPlan.materialProfile;
    const events = [];
    const rocketEvents = [];
    const commandsByBeat = new Map();
    let sequence = 0;
    let shellCount = 0;
    let layerCount = 0;
    let lastPhase = null;

    const push = event => events.push({ ...event, _sequence: sequence++ });
    const cues = showPlan.cues.map((cue, index) => ({ cue, index }))
      .sort((left, right) => Number(left.cue.beatAtMs) - Number(right.cue.beatAtMs) || left.index - right.index);

    for (const { cue, index: cueIndex } of cues) {
      const cueId = cue.id || `${showPlan.id || 'show'}:cue:${cueIndex + 1}`;
      const cueDue = startAt + Number(cue.beatAtMs);
      const beatId = `${showPlan.id || 'show'}:${Number(cue.beatAtMs)}`;
      const cueLayerSchedule = [];
      if (cue.phase !== lastPhase) {
        push({ type: 'finale-v2-phase', due: cueDue, order: -20, finaleId: showPlan.id, phase: cue.phase });
        lastPhase = cue.phase;
      }

      cue.shells.forEach((shell, shellIndex) => {
        shellCount++;
        const shellId = shell.id || `${cueId}:shell:${shellIndex + 1}`;
        const origin = toPixels(shell.origin, width, height);
        const target = toPixels(shell.target, width, height);
        const renderHints = normalizeRenderHints(shell.renderHints);
        if (shell.launchMode === 'rocket') {
          const rocketSeed = Number(shell.seed ?? showPlan.seed) >>> 0;
          const naturalFlightDurationMs = calculateRocketFlightMs(shell.target, renderHints);
          const flightDurationMs = Math.min(naturalFlightDurationMs, Math.max(0, Number(cue.beatAtMs)));
          const due = cueDue - flightDurationMs;
          const event = {
            type: 'finale-v2-rocket',
            due,
            order: 0,
            finaleId: showPlan.id,
            cueId,
            shellId,
            shell: showPlan.style === 'furry-celebration'
              ? withSeededRocketColor(shell, rocketSeed)
              : shell,
            origin,
            target,
            renderHints,
            flightDurationMs,
            admissionBatchId: due,
            beatId,
            materialProfile,
            visualStyle: options.visualStyle,
            seed: rocketSeed
          };
          rocketEvents.push(event);
          push(event);
        }

        shell.layers.forEach((sourceLayer, layerIndex) => {
          const due = cueDue + Number(sourceLayer.delayMs);
          const remainingMs = Math.floor(completeAt - due);
          if (remainingMs <= 0) fail(`${cueId}.shells.${shellIndex}.layers.${layerIndex} starts after the complete duration`);
          const effectiveLayer = {
            ...sourceLayer,
            colors: [...sourceLayer.colors],
            lifetimeMs: Math.min(Number(sourceLayer.lifetimeMs), remainingMs)
          };
          const ground = shell.launchMode === 'ground';
          const contextOrigin = ground ? origin : target;
          const contextTarget = ground ? target : target;
          const activeLayerLoad = (commandsByBeat.get(due) || 0) + 1;
          commandsByBeat.set(due, activeLayerLoad);
          cueLayerSchedule.push({ due, core: sourceLayer.core === true });
          layerCount++;
          push({
            type: 'finale-v2-layer',
            due,
            admissionBatchId: due,
            order: 20 + layerIndex,
            finaleId: showPlan.id,
            cueId,
            shellId,
            layer: effectiveLayer,
            context: {
              origin: contextOrigin,
              target: contextTarget,
              launchMode: shell.launchMode,
              materialProfile,
              visualStyle: options.visualStyle,
              powerScale: Number(shell.powerScale) || 1,
              seed: layerSeed(showPlan.seed, shell, sourceLayer),
              effectId: sourceLayer.id || `${shellId}:layer:${layerIndex + 1}`,
              correlationId: shellId,
              lane: 'show',
              priority: sourceLayer.priority,
              required: sourceLayer.core === true,
              beatId,
              admissionBatchId: due,
              activeLayerLoad: null,
              renderHints
            }
          });
        });
      });

      if (options.playSound !== false) {
        const profile = resolveCueAudioProfile(cue);
        const coreLayerSchedule = cueLayerSchedule.filter(item => item.core);
        const bangSchedule = coreLayerSchedule.length ? coreLayerSchedule : cueLayerSchedule;
        const bangDue = Math.min(...bangSchedule.map(item => item.due));
        push({
          type: 'finale-v2-bang-audio',
          due: bangDue,
          order: 80,
          finaleId: showPlan.id,
          cueId,
          ...profile
        });
        const crackleDue = bangDue + 180;
        if (profile.crackle && crackleDue < completeAt) {
          push({
            type: 'finale-v2-crackle-audio',
            due: crackleDue,
            order: 90,
            finaleId: showPlan.id,
            cueId,
            role: profile.role,
            tier: profile.tier,
            maxDurationMs: Math.min(profile.tier === 'massive' ? 1000 : 650, completeAt - crackleDue)
          });
        }
      }
    }

    if (options.playSound !== false) {
      for (const group of groupRocketLaunches([...rocketEvents].sort((left, right) => left.due - right.due))) {
        const profiles = group.rockets.map(rocket => resolveCueAudioProfile({
          ...showPlan.cues.find(cue => (cue.id || '') === rocket.cueId),
          shells: [rocket.shell]
        }));
        const dominantIndex = profiles.reduce((best, profile, index) => (
          (TIER_RANK[profile.tier] ?? -1) > (TIER_RANK[profiles[best]?.tier] ?? -1) ? index : best
        ), 0);
        const dominant = profiles[dominantIndex] || { role: 'single', tier: 'medium' };
        push({
          type: 'finale-v2-launch-audio',
          due: group.due,
          order: 1,
          finaleId: showPlan.id,
          shellIds: group.rockets.map(rocket => rocket.shellId),
          role: dominant.role,
          tier: dominant.tier,
          flightDurationMs: Math.max(...group.rockets.map(rocket => rocket.flightDurationMs))
        });
      }
    }

    for (const event of events) {
      if (event.type === 'finale-v2-layer') event.context.activeLayerLoad = commandsByBeat.get(event.due) || 0;
    }

    push({ type: 'finale-complete', due: completeAt, order: 1000, finaleId: showPlan.id });
    events.sort((left, right) => left.due - right.due || left.order - right.order || left._sequence - right._sequence);
    const cleanedEvents = events.map(({ _sequence, ...event }) => event);
    const audioGroups = {
      launch: cleanedEvents.filter(event => event.type === 'finale-v2-launch-audio').length,
      bang: cleanedEvents.filter(event => event.type === 'finale-v2-bang-audio').length,
      crackle: cleanedEvents.filter(event => event.type === 'finale-v2-crackle-audio').length
    };

    return {
      planVersion: PLAN_VERSION,
      finaleId: showPlan.id,
      durationMs,
      completeAt,
      materialProfile,
      shellCount,
      layerCount,
      rocketCount: rocketEvents.length,
      commandCount: layerCount + rocketEvents.length * 2,
      maxLayerCommandsAtBeat: Math.max(0, ...commandsByBeat.values()),
      ...commandDemand,
      audioGroups,
      events: cleanedEvents
    };
  }

  return Object.freeze({
    PLAN_VERSION,
    MAX_REQUIRED_SHOW_COMMANDS,
    analyzeShowPlanV2CommandDemand,
    assertShowPlanV2,
    assertShowPlanV2CommandBudget,
    buildShowPlanV2Runtime,
    calculateRocketFlightMs,
    normalizeRenderHints,
    resolveCueAudioProfile
  });
});
