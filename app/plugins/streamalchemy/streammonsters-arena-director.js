(function attachStreamMonstersArenaDirector(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.StreamMonstersArenaDirector = api;
}(typeof globalThis === 'object' ? globalThis : this, () => {
  'use strict';

  const QUALITY_MODES = new Set(['auto', 'high', 'medium', 'low']);

  function createArenaGeometry(layout = 'portrait') {
    if (layout === 'landscape') {
      return Object.freeze({
        layout: 'landscape',
        width: 1920,
        height: 1080,
        gameplay: Object.freeze({ x: 0, y: 0, width: 1920, height: 1080 }),
        chatSafeZone: null,
        hud: Object.freeze({ x: 260, y: 70, width: 1400, height: 190 }),
        fighters: Object.freeze([
          Object.freeze({ slot: 1, x: 490, feetY: 960, scale: 0.96, facing: 'right' }),
          Object.freeze({ slot: 2, x: 1430, feetY: 960, scale: 0.96, facing: 'left' })
        ])
      });
    }
    return Object.freeze({
      layout: 'portrait',
      width: 1080,
      height: 1920,
      gameplay: Object.freeze({ x: 0, y: 0, width: 1080, height: 1421 }),
      chatSafeZone: Object.freeze({ x: 0, y: 1421, width: 1080, height: 499 }),
      hud: Object.freeze({ x: 58, y: 62, width: 964, height: 248 }),
      fighters: Object.freeze([
        Object.freeze({ slot: 1, x: 330, feetY: 1000, scale: 0.88, facing: 'right' }),
        Object.freeze({ slot: 2, x: 742, feetY: 1372, scale: 1.08, facing: 'left' })
      ])
    });
  }

  function canonicalImageUrl(fighter) {
    if (typeof fighter?.imageUrl === 'string' && fighter.imageUrl.startsWith('/plugins/streamalchemy/')) {
      return fighter.imageUrl;
    }
    const templateId = String(fighter?.templateId || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
    const element = String(fighter?.element || '').toLowerCase().replace(/[^a-z]/g, '');
    const stage = Math.max(1, Math.min(3, Number(fighter?.evolutionStage) || 1));
    if (!templateId) return '/plugins/streamalchemy/assets/branding/stream-monsters-icon.png';
    if (stage === 1) {
      return `/plugins/streamalchemy/assets/streammonsters/furry/${templateId}.png`;
    }
    return `/plugins/streamalchemy/assets/streammonsters/furry/evolution/${element}/${templateId}-stage${stage}.png`;
  }

  function normalizeFighters(fighters = []) {
    return [...fighters]
      .filter(fighter => Number(fighter?.slot) === 1 || Number(fighter?.slot) === 2)
      .sort((left, right) => Number(left.slot) - Number(right.slot))
      .map(fighter => Object.freeze({
        ...fighter,
        slot: Number(fighter.slot),
        side: Number(fighter.slot) === 1 ? 'left' : 'right',
        evolutionStage: Math.max(1, Math.min(3, Number(fighter.evolutionStage) || 1)),
        imageUrl: canonicalImageUrl(fighter)
      }));
  }

  function numeric(value) {
    return Number.isFinite(Number(value)) ? Number(value) : 0;
  }

  function buildActionTimeline(action = {}) {
    const beats = [
      {
        type: 'telegraph',
        atMs: 0,
        durationMs: 700,
        actorSlot: numeric(action.actorSlot),
        targetSlot: numeric(action.targetSlot),
        skill: action.skill || null
      },
      {
        type: 'advance',
        atMs: 700,
        durationMs: 350,
        actorSlot: numeric(action.actorSlot),
        targetSlot: numeric(action.targetSlot)
      }
    ];
    if (String(action.choice || action.skill?.type || '').toLowerCase() === 'c' ||
        String(action.skill?.type || '').toLowerCase() === 'special') {
      beats.push({
        type: 'special',
        atMs: 1050,
        durationMs: 250,
        element: action.skill?.element || null,
        vfxKey: action.skill?.vfxKey || null
      });
    }

    const hits = Array.isArray(action.hits) ? action.hits : [];
    const impactStart = 1300;
    hits.forEach((hit, index) => {
      const atMs = impactStart + (index * 440);
      beats.push({
        type: 'impact',
        atMs,
        durationMs: 260,
        hitIndex: numeric(hit.index) || index + 1,
        hpDamage: numeric(hit.hpDamage),
        shieldAbsorbed: numeric(hit.shieldAbsorbed),
        evaded: Boolean(hit.evaded),
        actorSlot: numeric(action.actorSlot),
        targetSlot: numeric(action.targetSlot)
      });
      beats.push({
        type: 'hud',
        atMs: atMs + 160,
        durationMs: 200,
        actorSlot: numeric(action.actorSlot),
        targetSlot: numeric(action.targetSlot),
        state: action.stateAfter || null
      });
    });

    let cursor = hits.length
      ? impactStart + ((hits.length - 1) * 440) + 340
      : impactStart;
    for (const outcome of Array.isArray(action.outcomes) ? action.outcomes : []) {
      if (!['shield', 'heal', 'lifesteal'].includes(outcome?.type)) continue;
      cursor += 180;
      beats.push({
        type: outcome.type === 'lifesteal' ? 'heal' : outcome.type,
        atMs: cursor,
        durationMs: 360,
        actorSlot: numeric(action.actorSlot),
        amount: numeric(outcome.amount)
      });
    }
    if (action.terminal) {
      cursor += 480;
      beats.push({
        type: 'knockout',
        atMs: cursor,
        durationMs: 900,
        targetSlot: numeric(action.targetSlot)
      });
    }
    cursor += action.terminal ? 900 : 480;
    beats.push({
      type: 'recover',
      atMs: cursor,
      durationMs: action.terminal ? 1200 : 550,
      actorSlot: numeric(action.actorSlot),
      targetSlot: numeric(action.targetSlot)
    });
    return beats;
  }

  function resolveQuality({ requested = 'auto', fps = 60 } = {}) {
    const normalized = QUALITY_MODES.has(requested) ? requested : 'auto';
    if (normalized !== 'auto') return normalized;
    const measured = Number(fps);
    if (!Number.isFinite(measured) || measured >= 50) return 'high';
    if (measured >= 30) return 'medium';
    return 'low';
  }

  function resolveRenderer({
    webgpuAvailable = false,
    requestedQuality = 'auto',
    fps = 60,
    reducedMotion = false,
    deviceLost = false
  } = {}) {
    const quality = resolveQuality({ requested: requestedQuality, fps });
    if (reducedMotion) {
      return { renderer: 'css', quality: 'low', fallbackReason: 'reduced_motion' };
    }
    if (webgpuAvailable && !deviceLost) {
      return { renderer: 'webgpu', quality, fallbackReason: null };
    }
    return {
      renderer: 'canvas2d',
      quality: quality === 'high' ? 'medium' : quality,
      fallbackReason: deviceLost ? 'webgpu_device_lost' : 'webgpu_unavailable'
    };
  }

  function createDirectorModel() {
    let activeMatch = null;
    let cursor = 0;
    const accepted = new Set();
    return {
      applySnapshot(snapshot = {}) {
        const candidate = Array.isArray(snapshot.matches)
          ? snapshot.matches.find(match => ['roster', 'action', 'finalizing'].includes(match?.state))
          : null;
        activeMatch = candidate ? {
          ...candidate,
          fighters: normalizeFighters(candidate.fighters),
          cursor: Math.max(0, numeric(candidate.cursor))
        } : null;
        cursor = activeMatch?.cursor || 0;
        accepted.clear();
        return { activeMatch };
      },
      acceptAction(matchId, action = {}) {
        const sequence = Math.max(0, numeric(action.eventSequence ?? action.sequence));
        if (!activeMatch || activeMatch.matchId !== matchId || sequence <= cursor) return false;
        const fingerprint = `${matchId}:${sequence}`;
        if (accepted.has(fingerprint)) return false;
        accepted.add(fingerprint);
        cursor = sequence;
        activeMatch.cursor = sequence;
        return true;
      },
      activeMatch: () => activeMatch,
      cursor: () => cursor
    };
  }

  return {
    createArenaGeometry,
    canonicalImageUrl,
    normalizeFighters,
    buildActionTimeline,
    resolveQuality,
    resolveRenderer,
    createDirectorModel
  };
}));
