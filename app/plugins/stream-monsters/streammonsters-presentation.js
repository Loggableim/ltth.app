(function attachStreamMonstersPresentation(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.StreamMonstersPresentation = api;
}(typeof globalThis === 'object' ? globalThis : this, () => {
  'use strict';

  const VERSION = 2;
  const SNAP_BASIS_POINTS = 50;
  const PROFILE_IDS = Object.freeze([
    'portrait-720',
    'portrait-1080',
    'landscape-720',
    'landscape-1080'
  ]);
  const PROFILES = Object.freeze({
    'portrait-720': Object.freeze({ width: 720, height: 1280 }),
    'portrait-1080': Object.freeze({ width: 1080, height: 1920 }),
    'landscape-720': Object.freeze({ width: 1280, height: 720 }),
    'landscape-1080': Object.freeze({ width: 1920, height: 1080 })
  });
  const LAYER_IDS = Object.freeze([
    'arena',
    'egg-rail',
    'primary-cta',
    'journey',
    'reveal',
    'collection',
    'notifications',
    'hype',
    'branding'
  ]);
  const VIEW_IDS = Object.freeze(['full', ...LAYER_IDS]);
  const LAYER_MODES = Object.freeze(['composite', 'dedicated', 'off']);
  const SAFE_ZONE_IDS = Object.freeze(['likebar', 'tiktokChat']);

  const PORTRAIT_RECTS = Object.freeze({
    arena: Object.freeze({ x: 200, y: 1500, width: 6500, height: 5200 }),
    'egg-rail': Object.freeze({ x: 300, y: 8500, width: 6300, height: 1200 }),
    'primary-cta': Object.freeze({ x: 1500, y: 7000, width: 4800, height: 900 }),
    journey: Object.freeze({ x: 300, y: 300, width: 6500, height: 900 }),
    reveal: Object.freeze({ x: 800, y: 1600, width: 5600, height: 5000 }),
    collection: Object.freeze({ x: 400, y: 1400, width: 6100, height: 6000 }),
    notifications: Object.freeze({ x: 400, y: 300, width: 5500, height: 900 }),
    hype: Object.freeze({ x: 300, y: 7600, width: 3000, height: 700 }),
    branding: Object.freeze({ x: 3800, y: 7900, width: 2600, height: 600 })
  });
  const LANDSCAPE_RECTS = Object.freeze({
    arena: Object.freeze({ x: 300, y: 900, width: 7400, height: 6800 }),
    'egg-rail': Object.freeze({ x: 300, y: 8300, width: 7400, height: 1300 }),
    'primary-cta': Object.freeze({ x: 1800, y: 7400, width: 4700, height: 900 }),
    journey: Object.freeze({ x: 300, y: 250, width: 6000, height: 600 }),
    reveal: Object.freeze({ x: 1000, y: 1000, width: 5500, height: 6000 }),
    collection: Object.freeze({ x: 700, y: 800, width: 6500, height: 7000 }),
    notifications: Object.freeze({ x: 300, y: 200, width: 5000, height: 650 }),
    hype: Object.freeze({ x: 300, y: 7700, width: 2500, height: 500 }),
    branding: Object.freeze({ x: 5000, y: 7800, width: 2500, height: 500 })
  });
  const PORTRAIT_SAFE_ZONES = Object.freeze({
    likebar: Object.freeze({ x: 7600, y: 500, width: 2200, height: 1500 }),
    tiktokChat: Object.freeze({ x: 7000, y: 2400, width: 2800, height: 7300 })
  });
  const LANDSCAPE_SAFE_ZONES = Object.freeze({
    likebar: Object.freeze({ x: 8200, y: 300, width: 1600, height: 1400 }),
    tiktokChat: Object.freeze({ x: 8000, y: 2000, width: 1800, height: 7600 })
  });

  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
    }
    return value;
  }

  function profileDefaults(profileId) {
    const portrait = String(profileId).startsWith('portrait-');
    const rectangles = portrait ? PORTRAIT_RECTS : LANDSCAPE_RECTS;
    const safeZones = portrait ? PORTRAIT_SAFE_ZONES : LANDSCAPE_SAFE_ZONES;
    return {
      layers: Object.fromEntries(LAYER_IDS.map(layerId => [layerId, {
        mode: 'composite',
        rect: clone(rectangles[layerId])
      }])),
      safeZones: clone(safeZones)
    };
  }

  function createDefaultPresentation() {
    return {
      version: VERSION,
      audioOwner: 'full',
      profiles: Object.fromEntries(PROFILE_IDS.map(profileId => [
        profileId,
        profileDefaults(profileId)
      ]))
    };
  }

  function integer(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.round(numeric) : fallback;
  }

  function snap(value) {
    return Math.round(integer(value) / SNAP_BASIS_POINTS) * SNAP_BASIS_POINTS;
  }

  function normalizeRect(input, fallback) {
    const base = fallback || { x: 0, y: 0, width: 1000, height: 1000 };
    const width = Math.max(
      SNAP_BASIS_POINTS,
      Math.min(10_000, snap(input?.width ?? base.width))
    );
    const height = Math.max(
      SNAP_BASIS_POINTS,
      Math.min(10_000, snap(input?.height ?? base.height))
    );
    const x = Math.max(0, Math.min(10_000 - width, snap(input?.x ?? base.x)));
    const y = Math.max(0, Math.min(10_000 - height, snap(input?.y ?? base.y)));
    return { x, y, width, height };
  }

  function rectanglesOverlap(first = {}, second = {}) {
    return first.x < second.x + second.width &&
      first.x + first.width > second.x &&
      first.y < second.y + second.height &&
      first.y + first.height > second.y;
  }

  function normalizePresentation(input = {}) {
    const source = input?.presentation && typeof input.presentation === 'object'
      ? input.presentation
      : input;
    const defaults = createDefaultPresentation();
    const normalized = {
      version: VERSION,
      audioOwner: ['full', ...LAYER_IDS].includes(source?.audioOwner)
        ? source.audioOwner
        : 'full',
      profiles: {}
    };
    for (const profileId of PROFILE_IDS) {
      const profileSource = source?.profiles?.[profileId] || {};
      const profileDefault = defaults.profiles[profileId];
      normalized.profiles[profileId] = {
        layers: Object.fromEntries(LAYER_IDS.map(layerId => {
          const layer = profileSource.layers?.[layerId] || {};
          return [layerId, {
            mode: LAYER_MODES.includes(layer.mode) ? layer.mode : 'composite',
            rect: normalizeRect(layer.rect, profileDefault.layers[layerId].rect)
          }];
        })),
        safeZones: Object.fromEntries(SAFE_ZONE_IDS.map(safeZoneId => [
          safeZoneId,
          normalizeRect(
            profileSource.safeZones?.[safeZoneId],
            profileDefault.safeZones[safeZoneId]
          )
        ]))
      };
    }
    return normalized;
  }

  function validateRect(rect) {
    return rect &&
      ['x', 'y', 'width', 'height'].every(key => Number.isInteger(rect[key])) &&
      rect.x >= 0 && rect.y >= 0 && rect.width > 0 && rect.height > 0 &&
      rect.x + rect.width <= 10_000 && rect.y + rect.height <= 10_000;
  }

  function validatePresentation(input, { profileId = null } = {}) {
    const errors = [];
    if (!input || input.version !== VERSION || !input.profiles) {
      errors.push({ code: 'presentation_version_invalid' });
      return { valid: false, errors };
    }
    const profiles = profileId ? [profileId] : PROFILE_IDS;
    if (profileId && !PROFILE_IDS.includes(profileId)) {
      return { valid: false, errors: [{ code: 'profile_invalid', profileId }] };
    }
    if (!['full', ...LAYER_IDS].includes(input.audioOwner)) {
      errors.push({ code: 'audio_owner_invalid' });
    }
    for (const currentProfileId of profiles) {
      const profile = input.profiles[currentProfileId];
      if (!profile) {
        errors.push({ code: 'profile_missing', profileId: currentProfileId });
        continue;
      }
      for (const safeZoneId of SAFE_ZONE_IDS) {
        if (!validateRect(profile.safeZones?.[safeZoneId])) {
          errors.push({
            code: 'safe_zone_rect_invalid',
            profileId: currentProfileId,
            safeZoneId
          });
        }
      }
      for (const layerId of LAYER_IDS) {
        const layer = profile.layers?.[layerId];
        if (!layer || !LAYER_MODES.includes(layer.mode)) {
          errors.push({ code: 'layer_mode_invalid', profileId: currentProfileId, layerId });
          continue;
        }
        if (!validateRect(layer.rect)) {
          errors.push({ code: 'layer_rect_invalid', profileId: currentProfileId, layerId });
          continue;
        }
        if (layer.mode !== 'composite') continue;
        for (const safeZoneId of SAFE_ZONE_IDS) {
          const safeZone = profile.safeZones?.[safeZoneId];
          if (validateRect(safeZone) && rectanglesOverlap(layer.rect, safeZone)) {
            errors.push({
              code: 'safe_zone_collision',
              profileId: currentProfileId,
              layerId,
              safeZoneId
            });
          }
        }
      }
    }
    return { valid: errors.length === 0, errors };
  }

  function migratePresentation(input = {}) {
    const source = input?.presentation && typeof input.presentation === 'object'
      ? input.presentation
      : input;
    if (source?.version === VERSION) return normalizePresentation(source);
    return {
      ...createDefaultPresentation(),
      migratedFrom: source?.layouts ? 'legacy-layouts' : 'default'
    };
  }

  function createLayoutEditor({ presentation, profileId = PROFILE_IDS[0] } = {}) {
    let selectedProfile = PROFILE_IDS.includes(profileId) ? profileId : PROFILE_IDS[0];
    let current = presentation?.version === VERSION
      ? normalizePresentation(presentation)
      : migratePresentation(presentation || {});
    const history = [];
    const remember = () => history.push(clone(current));
    const changeLayerRect = (layerId, transform) => {
      if (!LAYER_IDS.includes(layerId)) return false;
      remember();
      const layer = current.profiles[selectedProfile].layers[layerId];
      layer.rect = normalizeRect(transform(clone(layer.rect)), layer.rect);
      return true;
    };
    return {
      profile(profile) {
        if (PROFILE_IDS.includes(profile)) selectedProfile = profile;
        return selectedProfile;
      },
      snapshot: () => clone(current),
      drag(layerId, delta = {}) {
        return changeLayerRect(layerId, rect => ({
          ...rect,
          x: rect.x + snap(delta.x),
          y: rect.y + snap(delta.y)
        }));
      },
      resize(layerId, delta = {}) {
        return changeLayerRect(layerId, rect => ({
          ...rect,
          width: rect.width + snap(delta.width),
          height: rect.height + snap(delta.height)
        }));
      },
      keyboard(layerId, key, { shiftKey = false, resize = false } = {}) {
        const amount = shiftKey ? 500 : SNAP_BASIS_POINTS;
        const delta = {
          ArrowLeft: { x: -amount, y: 0 },
          ArrowRight: { x: amount, y: 0 },
          ArrowUp: { x: 0, y: -amount },
          ArrowDown: { x: 0, y: amount }
        }[key];
        if (!delta) return false;
        return resize
          ? this.resize(layerId, { width: delta.x, height: delta.y })
          : this.drag(layerId, delta);
      },
      setMode(layerId, mode) {
        if (!LAYER_IDS.includes(layerId) || !LAYER_MODES.includes(mode)) return false;
        remember();
        current.profiles[selectedProfile].layers[layerId].mode = mode;
        return true;
      },
      setSafeZone(safeZoneId, rect) {
        if (!SAFE_ZONE_IDS.includes(safeZoneId)) return false;
        remember();
        const previous = current.profiles[selectedProfile].safeZones[safeZoneId];
        current.profiles[selectedProfile].safeZones[safeZoneId] = normalizeRect(rect, previous);
        return true;
      },
      setAudioOwner(owner) {
        if (!['full', ...LAYER_IDS].includes(owner)) return false;
        remember();
        current.audioOwner = owner;
        return true;
      },
      copyProfile(fromProfileId, toProfileId) {
        if (!PROFILE_IDS.includes(fromProfileId) || !PROFILE_IDS.includes(toProfileId)) return false;
        const sameOrientation = fromProfileId.split('-')[0] === toProfileId.split('-')[0];
        if (!sameOrientation) return false;
        remember();
        current.profiles[toProfileId] = clone(current.profiles[fromProfileId]);
        selectedProfile = toProfileId;
        return true;
      },
      undo() {
        if (!history.length) return false;
        current = history.pop();
        return true;
      },
      reset(targetProfileId = selectedProfile) {
        if (!PROFILE_IDS.includes(targetProfileId)) return false;
        remember();
        current.profiles[targetProfileId] = profileDefaults(targetProfileId);
        return true;
      },
      validation() {
        return validatePresentation(current, { profileId: selectedProfile });
      }
    };
  }

  function parseOverlayQuery(input = '') {
    let params;
    if (input instanceof URLSearchParams) {
      params = input;
    } else if (input && typeof input === 'object') {
      params = new URLSearchParams();
      for (const [key, value] of Object.entries(input)) {
        if (value !== undefined && value !== null) params.set(key, String(value));
      }
    } else {
      const text = String(input || '');
      params = new URLSearchParams(text.includes('?') ? text.split('?').slice(1).join('?') : text);
    }
    const view = params.get('view') || 'full';
    const profile = params.get('profile') || null;
    if (!VIEW_IDS.includes(view)) {
      const error = new Error('STREAM_MONSTERS_OVERLAY_VIEW_INVALID');
      error.code = error.message;
      throw error;
    }
    if (profile !== null && !PROFILE_IDS.includes(profile)) {
      const error = new Error('STREAM_MONSTERS_OVERLAY_PROFILE_INVALID');
      error.code = error.message;
      throw error;
    }
    return { view, profile };
  }

  function resolveProfileId({ profile = null, width = 0, height = 0 } = {}) {
    if (PROFILE_IDS.includes(profile)) return profile;
    const portrait = Number(width) < Number(height);
    if (portrait) return Number(height) >= 1600 ? 'portrait-1080' : 'portrait-720';
    return Number(width) >= 1600 ? 'landscape-1080' : 'landscape-720';
  }

  function presentationView(input, profileId, view = 'full') {
    const presentation = normalizePresentation(input);
    const resolvedProfileId = PROFILE_IDS.includes(profileId) ? profileId : PROFILE_IDS[0];
    const resolvedView = VIEW_IDS.includes(view) ? view : 'full';
    const profile = presentation.profiles[resolvedProfileId];
    return {
      version: VERSION,
      profile: resolvedProfileId,
      width: PROFILES[resolvedProfileId].width,
      height: PROFILES[resolvedProfileId].height,
      view: resolvedView,
      audio: presentation.audioOwner === resolvedView || (
        resolvedView === 'full' &&
        presentation.audioOwner !== 'full' &&
        profile.layers[presentation.audioOwner]?.mode === 'composite'
      ) || (resolvedView === 'full' && presentation.audioOwner === 'full'),
      safeZones: clone(profile.safeZones),
      layers: Object.fromEntries(LAYER_IDS.map(layerId => {
        const layer = profile.layers[layerId];
        const visible = resolvedView === 'full'
          ? layer.mode === 'composite'
          : resolvedView === layerId && layer.mode === 'dedicated';
        return [layerId, visible ? clone(layer.rect) : null];
      }))
    };
  }

  function buildOverlaySources(input, { basePath = '/stream-monsters/overlay' } = {}) {
    const presentation = normalizePresentation(input);
    return PROFILE_IDS.flatMap(profileId => {
      const profile = presentation.profiles[profileId];
      const views = [
        'full',
        ...LAYER_IDS.filter(layerId => profile.layers[layerId].mode === 'dedicated')
      ];
      return views.map(view => ({
        profile: profileId,
        view,
        width: PROFILES[profileId].width,
        height: PROFILES[profileId].height,
        transparent: true,
        audio: presentationView(presentation, profileId, view).audio,
        url: `${basePath}?view=${encodeURIComponent(view)}&profile=${encodeURIComponent(profileId)}`
      }));
    });
  }

  function applyPresentation({
    document: documentLike,
    presentation,
    profile,
    view = 'full',
    width = 0,
    height = 0
  } = {}) {
    if (!documentLike?.querySelectorAll) return null;
    const profileId = resolveProfileId({ profile, width, height });
    const projected = presentationView(presentation, profileId, view);
    const root = documentLike.documentElement;
    if (root?.dataset) {
      root.dataset.presentationVersion = String(VERSION);
      root.dataset.presentationProfile = profileId;
      root.dataset.presentationView = view;
      root.dataset.audioOwner = projected.audio ? 'true' : 'false';
    }
    for (const element of documentLike.querySelectorAll('[data-sm-layer]')) {
      const layerId = element.dataset.smLayer;
      const rect = projected.layers[layerId];
      element.dataset.presentationExcluded = String(!rect);
      if (!rect) continue;
      element.style.setProperty('--sm-x', `${rect.x / 100}%`);
      element.style.setProperty('--sm-y', `${rect.y / 100}%`);
      element.style.setProperty('--sm-width', `${rect.width / 100}%`);
      element.style.setProperty('--sm-height', `${rect.height / 100}%`);
    }
    return projected;
  }

  function presentHandle(value, { maxLength = 22 } = {}) {
    const full = String(value || '');
    const limit = Math.max(7, integer(maxLength, 22));
    if (full.length <= limit) return { text: full, ariaLabel: full };
    const remaining = limit - 1;
    const startLength = Math.ceil(remaining / 2);
    const endLength = Math.floor(remaining / 2);
    return {
      text: `${full.slice(0, startLength)}…${full.slice(-endLength)}`,
      ariaLabel: full
    };
  }

  return {
    VERSION,
    SNAP_BASIS_POINTS,
    PROFILE_IDS,
    PROFILES,
    LAYER_IDS,
    VIEW_IDS,
    LAYER_MODES,
    SAFE_ZONE_IDS,
    applyPresentation,
    buildOverlaySources,
    createDefaultPresentation,
    createLayoutEditor,
    migratePresentation,
    normalizePresentation,
    normalizeRect,
    parseOverlayQuery,
    presentationView,
    presentHandle,
    rectanglesOverlap,
    resolveProfileId,
    validatePresentation
  };
}));
