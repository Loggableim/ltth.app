(function attachStreamMonstersEggStageView(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.StreamMonstersEggStageView = api;
}(typeof globalThis === 'object' ? globalThis : this, () => {
  'use strict';

  const MAX_VISIBLE_EGGS = 8;
  const ADOPT_CALLOUT_MS = 8_000;
  const COUNTDOWN_INTERVAL_MS = 1_000;

  function boundedText(value, maximum = 96) {
    return String(value ?? '')
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim()
      .slice(0, maximum);
  }

  function isPublicFreeEgg(egg = {}) {
    return egg.provenance === 'free' &&
      egg.state === 'public' &&
      egg.adoptionStatus === 'public' &&
      egg.adoptable === true;
  }

  function isClaimedFreeInventoryEgg(egg = {}) {
    return egg.provenance === 'free' &&
      egg.ownershipState === 'owned' &&
      !['reserved', 'public'].includes(egg.state);
  }

  function formatCountdown(milliseconds) {
    const totalSeconds = Math.max(0, Math.ceil((Number(milliseconds) || 0) / 1_000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function replaceTokens(template, tokens = {}) {
    return Object.entries(tokens).reduce(
      (value, [key, token]) => value.replaceAll(`{${key}}`, String(token)),
      String(template || '')
    );
  }

  function shelfTiming(egg = {}, {
    nowMs = Date.now(),
    labels = {},
    hatchReference = '!hatch',
    adoptReference = '!adopt'
  } = {}) {
    const timing = egg.timing || {};
    if (egg.state === 'ready') {
      return replaceTokens(labels.ready || 'Ready · {command}', {
        command: hatchReference
      });
    }
    if (egg.state === 'expired') return labels.expired || 'Rotten';
    if (egg.state === 'queued') {
      return replaceTokens(labels.queued || 'Queue #{position}', {
        position: Number(egg.queuePosition) || 1
      });
    }
    if (egg.state === 'reserved') {
      return replaceTokens(labels.reserved || 'Reserved · {time}', {
        time: formatCountdown(Math.max(0, Number(timing.publicAtMs) - Number(nowMs)))
      });
    }
    if (isPublicFreeEgg(egg)) {
      return replaceTokens(labels.public || 'Free · {command}', {
        command: adoptReference
      });
    }
    return replaceTokens(labels.incubating || 'Hatches in {time}', {
      time: formatCountdown(Math.max(0, Number(timing.readyAtMs) - Number(nowMs)))
    });
  }

  function buildAdoptionNotice(type, payload = {}) {
    const egg = normalizeEgg(payload.eggStage || payload.egg_stage || payload.egg);
    if (!egg || egg.provenance !== 'free') return null;
    if (
      type === 'free_egg_reserved' &&
      egg.state === 'reserved' &&
      egg.adoptionStatus === 'reserved'
    ) {
      return {
        kind: 'reserved',
        viewer: egg.displayName,
        placement: 'upper-third',
        size: 'compact',
        durationMs: 5_000
      };
    }
    if (type === 'free_egg_public' && isPublicFreeEgg(egg)) {
      return {
        kind: 'public',
        viewer: egg.displayName,
        placement: 'upper-third',
        size: 'compact',
        durationMs: 5_000
      };
    }
    return null;
  }

  function safeViewerName(value) {
    const normalized = boundedText(value, 64);
    if (
      !normalized ||
      /^(?:unknown|unbekannt|viewer)$/i.test(normalized) ||
      /^@?\d{5,}$/.test(normalized)
    ) return '';
    return normalized;
  }

  function readableDuration(nowMs, deadlineMs, minimumMs = 12_000) {
    const remaining = Number(deadlineMs) - Number(nowMs);
    return Number.isFinite(remaining) && remaining > 0
      ? Math.min(Math.max(1, Number(minimumMs) || 12_000), remaining)
      : Math.max(1, Number(minimumMs) || 12_000);
  }

  function buildLifecycleNotice(type, payload = {}, {
    commands = {},
    nowMs = Date.now()
  } = {}) {
    const normalizedType = String(type || '')
      .replace(/^streammonsters:/, '')
      .toLowerCase();
    const source = payload.eggStage || payload.egg_stage || payload.egg ||
      payload.removedEggStage || payload.removed_egg_stage;
    const egg = normalizeEgg(source);
    if (!egg) return null;
    const timing = egg.timing || {};
    const viewer = safeViewerName(
      payload.displayName || payload.viewerName || egg.displayName
    );
    const command = key => boundedText(commands[key], 48);
    const commandList = (...keys) => [...new Set(
      keys.map(command).filter(Boolean)
    )].slice(0, 2);
    const common = {
      viewer,
      placement: 'upper-third',
      size: 'large-readable',
      durationMs: 12_000,
      visualId: egg.visualId,
      element: egg.element,
      queuePosition: Math.max(0, Number(egg.queuePosition) || 0),
      params: {
        viewer,
        element: egg.element,
        position: Math.max(0, Number(egg.queuePosition) || 0)
      },
      sideEffectKey: boundedText(
        payload.eventId || payload.correlationId ||
          `${normalizedType}:${egg.visualId}`,
        160
      )
    };

    if (
      ['egg_landed', 'egg_spawned'].includes(normalizedType) &&
      egg.provenance === 'gift' &&
      egg.ownershipState === 'owned'
    ) {
      return {
        ...common,
        kind: 'gift_owned',
        titleKey: 'eggLifecycleGiftOwnedTitle',
        copyKey: 'eggLifecycleGiftOwnedCopy',
        commands: commandList('eggs', 'hatch')
      };
    }

    if (normalizedType === 'free_egg_reserved') {
      if (
        egg.provenance === 'gift' ||
        (egg.state && egg.state !== 'reserved') ||
        (egg.adoptionStatus && egg.adoptionStatus !== 'reserved')
      ) return null;
      return {
        ...common,
        kind: 'free_reserved',
        titleKey: 'eggLifecycleFreeReservedTitle',
        copyKey: 'eggLifecycleFreeReservedCopy',
        durationMs: readableDuration(nowMs, timing.publicAtMs),
        commands: commandList('adopt')
      };
    }

    if (normalizedType === 'free_egg_public') {
      if (
        egg.provenance === 'gift' ||
        (egg.state && egg.state !== 'public') ||
        (egg.adoptionStatus && egg.adoptionStatus !== 'public')
      ) return null;
      return {
        ...common,
        kind: 'free_public',
        titleKey: 'eggLifecycleFreePublicTitle',
        copyKey: 'eggLifecycleFreePublicCopy',
        durationMs: readableDuration(
          nowMs,
          timing.expiresAtMs ?? timing.expiryAtMs
        ),
        commands: commandList('adopt')
      };
    }

    if (normalizedType === 'free_egg_claimed') {
      if (egg.provenance === 'gift') return null;
      return {
        ...common,
        kind: 'free_claimed',
        titleKey: 'eggLifecycleFreeClaimedTitle',
        copyKey: 'eggLifecycleFreeClaimedCopy',
        commands: commandList('eggs', 'hatch')
      };
    }

    if (['hatch_not_ready', 'egg_not_ready'].includes(normalizedType)) {
      const remainingMs = Math.max(
        0,
        Number(payload.remainingMs ?? payload.remaining_ms) ||
          (Number(timing.readyAtMs) - Number(nowMs)) ||
          0
      );
      const remaining = formatCountdown(remainingMs);
      return {
        ...common,
        kind: 'hatch_wait',
        titleKey: 'eggLifecycleWaitTitle',
        copyKey: common.queuePosition > 0
          ? 'eggLifecycleWaitQueuedCopy'
          : 'eggLifecycleWaitCopy',
        remaining,
        durationMs: readableDuration(nowMs, Number(nowMs) + remainingMs),
        params: {
          ...common.params,
          time: remaining
        },
        commands: commandList('eggs')
      };
    }

    if (normalizedType === 'egg_ready') {
      return {
        ...common,
        kind: 'ready',
        titleKey: 'eggLifecycleReadyTitle',
        copyKey: 'eggLifecycleReadyCopy',
        durationMs: readableDuration(
          nowMs,
          timing.expiresAtMs ?? timing.expiryAtMs
        ),
        commands: commandList('hatch')
      };
    }

    if (['egg_auto_hatched', 'auto_hatch_completed'].includes(normalizedType)) {
      const monster = boundedText(payload.monster?.name, 64);
      return {
        ...common,
        kind: 'auto_hatched',
        titleKey: 'eggLifecycleAutoHatchedTitle',
        copyKey: 'eggLifecycleAutoHatchedCopy',
        params: {
          ...common.params,
          monster
        },
        commands: commandList('monsters')
      };
    }

    if (
      ['egg_expired', 'egg_rotted'].includes(normalizedType) ||
      (normalizedType === 'egg_stage_removed' && egg.state === 'expired')
    ) {
      return {
        ...common,
        kind: 'expired',
        titleKey: 'eggLifecycleExpiredTitle',
        copyKey: 'eggLifecycleExpiredCopy',
        commands: commandList('eggs')
      };
    }

    return null;
  }

  function priority(egg = {}) {
    if (isPublicFreeEgg(egg)) return 0;
    if (egg.state === 'ready') return 1;
    if (egg.state === 'incubating' || egg.state === 'queued') return 2;
    return 3;
  }

  function hashText(value) {
    let hash = 2166136261;
    for (const character of String(value || 'egg')) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function deterministicEggMotion(visualId, _index = 0, reducedMotion = false) {
    const hash = hashText(visualId);
    return {
      phase: 'settled',
      lane: hash % 4,
      flyFromX: -46 + ((hash >>> 5) % 93),
      bounceHeight: 14 + ((hash >>> 12) % 22),
      settleRotation: -7 + ((hash >>> 18) % 15),
      delayMs: reducedMotion ? 0 : (hash >>> 23) % 240,
      durationMs: reducedMotion ? 0 : 760 + ((hash >>> 8) % 280)
    };
  }

  function visibleCapacity(width) {
    const viewportWidth = Math.max(0, Number(width) || 0);
    if (viewportWidth > 0 && viewportWidth <= 520) return 5;
    if (viewportWidth > 0 && viewportWidth <= 760) return 6;
    if (viewportWidth > 0 && viewportWidth <= 920) return 7;
    return MAX_VISIBLE_EGGS;
  }

  function normalizeEgg(egg = {}) {
    const visualId = boundedText(egg.visualId, 64);
    if (!visualId) return null;
    return {
      ...egg,
      visualId,
      displayName: boundedText(egg.displayName, 64) || 'Viewer',
      element: boundedText(egg.element, 24) || 'Lunar',
      variant: boundedText(egg.variant, 24) || 'standard'
    };
  }

  function buildShelfModel(eggStage = [], {
    maxVisible = MAX_VISIBLE_EGGS,
    rotationIndex = 0,
    reducedMotion = false
  } = {}) {
    const normalized = (Array.isArray(eggStage) ? eggStage : [])
      .map(egg => normalizeEgg(egg))
      .filter(egg => egg && !isClaimedFreeInventoryEgg(egg))
      .sort((left, right) => (
        priority(left) - priority(right) ||
        (Number(left.queuePosition) || Number.MAX_SAFE_INTEGER) -
          (Number(right.queuePosition) || Number.MAX_SAFE_INTEGER) ||
        (Number(left.timing?.landedAtMs) || 0) -
          (Number(right.timing?.landedAtMs) || 0) ||
        left.visualId.localeCompare(right.visualId)
      ))
      .map((egg, index) => ({
        ...egg,
        motion: deterministicEggMotion(egg.visualId, index, reducedMotion)
      }));
    const visibleLimit = Math.max(1, Math.min(MAX_VISIBLE_EGGS, Number(maxVisible) || 1));
    const visible = normalized.slice(0, visibleLimit);
    const hidden = normalized.slice(visibleLimit);
    const boundedRotation = hidden.length
      ? ((Number(rotationIndex) || 0) % hidden.length + hidden.length) % hidden.length
      : 0;
    return {
      visible,
      overflow: hidden.length
        ? {
            count: hidden.length,
            label: `+${hidden.length}`,
            preview: hidden[boundedRotation],
            rotationIndex: boundedRotation
          }
        : null,
      total: normalized.length,
      adoptable: normalized.filter(isPublicFreeEgg).length,
      ready: normalized.filter(egg => egg.state === 'ready').length,
      incubating: normalized.filter(egg => (
        egg.state === 'incubating' || egg.state === 'queued'
      )).length
    };
  }

  function createEggStageView(options = {}) {
    const documentLike = options.document;
    if (!documentLike) throw new Error('STREAM_MONSTERS_EGG_STAGE_DOCUMENT_REQUIRED');
    const root = options.root || documentLike.getElementById('egg-shelf');
    if (!root) throw new Error('STREAM_MONSTERS_EGG_STAGE_ROOT_REQUIRED');
    const slots = root.querySelector('[data-egg-slots]');
    const overflow = root.querySelector('[data-egg-overflow]');
    const now = options.now || (() => Date.now());
    const schedule = options.setTimeout || setTimeout;
    const cancel = options.clearTimeout || clearTimeout;
    const labels = options.labels || {};
    const getHatchReference = options.getHatchReference || (() => '!hatch');
    const getAdoptReference = options.getAdoptReference || (() => '!adopt');
    const reducedMotion = Boolean(options.reducedMotion);
    const calloutDeadlineById = new Map();
    const calloutTimers = new Map();
    const landingTimers = new Map();
    const landingStartedAtById = new Map();
    const eggsById = new Map();
    const pendingLandingIds = new Set();
    let rotationIndex = 0;
    let rotationTimer = null;
    let countdownTimer = null;

    function safeImageUrl(value) {
      const url = boundedText(value, 512);
      return /^\/plugins\/streamalchemy\/assets\/[a-z0-9./_-]+$/i.test(url)
        ? url
        : '';
    }

    function removeCallout(visualId) {
      root.querySelectorAll('[data-egg-id]').forEach(item => {
        if (item.dataset.eggId === visualId) {
          item.querySelector('[data-adopt-callout]')?.remove();
        }
      });
      const handle = calloutTimers.get(visualId);
      if (handle != null) cancel(handle);
      calloutTimers.delete(visualId);
    }

    function createEggNode(egg, index) {
      const item = documentLike.createElement('article');
      item.className = 'egg-shelf-item';
      if (pendingLandingIds.has(egg.visualId) && !reducedMotion) {
        item.classList.add('landing');
      }
      item.dataset.eggId = egg.visualId;
      item.dataset.state = boundedText(egg.state, 24);
      item.dataset.provenance = boundedText(egg.provenance, 24);
      item.dataset.element = egg.element.toLowerCase();
      item.dataset.adoptable = String(isPublicFreeEgg(egg));
      item.style.setProperty('--egg-lane', String(egg.motion.lane));
      item.style.setProperty('--egg-fly-x', `${egg.motion.flyFromX}vw`);
      item.style.setProperty('--egg-bounce', `${egg.motion.bounceHeight}px`);
      item.style.setProperty('--egg-settle-rotation', `${egg.motion.settleRotation}deg`);
      item.style.setProperty('--egg-motion-delay', `${egg.motion.delayMs}ms`);
      item.style.setProperty('--egg-motion-duration', `${egg.motion.durationMs}ms`);
      item.style.setProperty('--egg-index', String(index));

      const art = documentLike.createElement('div');
      art.className = 'egg-shelf-art';
      const imageUrl = safeImageUrl(egg.imageUrl);
      if (imageUrl) {
        const image = documentLike.createElement('img');
        image.src = imageUrl;
        image.alt = `${egg.element} egg`;
        art.appendChild(image);
      } else {
        art.textContent = '🥚';
        art.dataset.fallback = 'true';
      }
      item.appendChild(art);

      const timing = documentLike.createElement('span');
      timing.dataset.eggTiming = '';
      timing.textContent = shelfTiming(egg, {
        nowMs: now(),
        labels,
        hatchReference: getHatchReference(),
        adoptReference: getAdoptReference()
      });
      item.appendChild(timing);

      if (isPublicFreeEgg(egg)) {
        item.classList.add('gold-ring', 'public-free');
        let deadline = calloutDeadlineById.get(egg.visualId);
        if (deadline == null) {
          deadline = now() + ADOPT_CALLOUT_MS;
          calloutDeadlineById.set(egg.visualId, deadline);
        }
        if (deadline > now()) {
          const callout = documentLike.createElement('span');
          callout.dataset.adoptCallout = '';
          callout.textContent = '!adopt';
          item.appendChild(callout);
          const existing = calloutTimers.get(egg.visualId);
          if (existing != null) cancel(existing);
          calloutTimers.set(egg.visualId, schedule(
            () => removeCallout(egg.visualId),
            Math.max(0, deadline - now())
          ));
        }
      } else {
        calloutDeadlineById.delete(egg.visualId);
        removeCallout(egg.visualId);
      }
      return item;
    }

    function settleLanding(visualId, item) {
      if (!item || item.dataset.eggId !== visualId) return;
      item.classList.remove('landing');
      pendingLandingIds.delete(visualId);
      landingStartedAtById.delete(visualId);
      const handle = landingTimers.get(visualId);
      if (handle != null) cancel(handle);
      landingTimers.delete(visualId);
    }

    function createKeyedEggNode(egg, index) {
      const item = createEggNode(egg, index);
      item.style.setProperty(
        '--egg-public-jump-delay',
        `${egg.motion.delayMs + egg.motion.durationMs + 80}ms`
      );
      item.addEventListener('animationend', event => {
        if (event.animationName && event.animationName !== 'egg-shelf-land') return;
        settleLanding(egg.visualId, item);
      });
      if (item.classList.contains('landing')) {
        const existing = landingTimers.get(egg.visualId);
        if (existing != null) cancel(existing);
        landingTimers.set(egg.visualId, schedule(
          () => settleLanding(egg.visualId, item),
          egg.motion.delayMs + egg.motion.durationMs + 180
        ));
      }
      return item;
    }

    function updateKeyedEggNode(item, egg, index) {
      const landingStartedAt = landingStartedAtById.get(egg.visualId);
      if (
        item.classList.contains('landing') &&
        Number.isFinite(Number(landingStartedAt)) &&
        now() - Number(landingStartedAt) >= 900
      ) {
        settleLanding(egg.visualId, item);
      }
      item.dataset.state = boundedText(egg.state, 24);
      item.dataset.provenance = boundedText(egg.provenance, 24);
      item.dataset.element = egg.element.toLowerCase();
      item.dataset.adoptable = String(isPublicFreeEgg(egg));
      item.style.setProperty('--egg-lane', String(egg.motion.lane));
      item.style.setProperty('--egg-fly-x', `${egg.motion.flyFromX}vw`);
      item.style.setProperty('--egg-bounce', `${egg.motion.bounceHeight}px`);
      item.style.setProperty('--egg-settle-rotation', `${egg.motion.settleRotation}deg`);
      item.style.setProperty('--egg-motion-delay', `${egg.motion.delayMs}ms`);
      item.style.setProperty('--egg-motion-duration', `${egg.motion.durationMs}ms`);
      item.style.setProperty(
        '--egg-public-jump-delay',
        item.classList.contains('landing')
          ? `${egg.motion.delayMs + egg.motion.durationMs + 80}ms`
          : '80ms'
      );
      item.style.setProperty('--egg-index', String(index));
      const timing = item.querySelector('[data-egg-timing]');
      if (timing) {
        timing.textContent = shelfTiming(egg, {
          nowMs: now(),
          labels,
          hatchReference: getHatchReference(),
          adoptReference: getAdoptReference()
        });
      }
      const publicEgg = isPublicFreeEgg(egg);
      item.classList.toggle('gold-ring', publicEgg);
      item.classList.toggle('public-free', publicEgg);
      if (publicEgg) {
        let deadline = calloutDeadlineById.get(egg.visualId);
        if (deadline == null) {
          deadline = now() + ADOPT_CALLOUT_MS;
          calloutDeadlineById.set(egg.visualId, deadline);
        }
        let callout = item.querySelector('[data-adopt-callout]');
        if (deadline > now() && !callout) {
          callout = documentLike.createElement('span');
          callout.dataset.adoptCallout = '';
          callout.textContent = '!adopt';
          item.appendChild(callout);
        }
        const existing = calloutTimers.get(egg.visualId);
        if (existing != null) cancel(existing);
        if (deadline > now()) {
          calloutTimers.set(egg.visualId, schedule(
            () => removeCallout(egg.visualId),
            Math.max(0, deadline - now())
          ));
        }
      } else {
        calloutDeadlineById.delete(egg.visualId);
        removeCallout(egg.visualId);
      }
      return item;
    }

    function render() {
      const viewportWidth = Number(
        options.viewportWidth?.() ||
        root.clientWidth ||
        documentLike.defaultView?.innerWidth
      );
      const model = buildShelfModel([...eggsById.values()], {
        maxVisible: visibleCapacity(viewportWidth),
        rotationIndex,
        reducedMotion
      });
      if (slots) {
        const visibleIds = new Set(model.visible.map(egg => egg.visualId));
        slots.querySelectorAll('[data-egg-id]').forEach(item => {
          if (!visibleIds.has(item.dataset.eggId)) item.remove();
        });
        model.visible.forEach((egg, index) => {
          const current = [...slots.children].find(item => (
            item.dataset?.eggId === egg.visualId
          ));
          slots.appendChild(
            current
              ? updateKeyedEggNode(current, egg, index)
              : createKeyedEggNode(egg, index)
          );
        });
      }
      if (overflow) {
        overflow.replaceChildren();
        overflow.hidden = !model.overflow;
        if (model.overflow) {
          overflow.dataset.previewEggId = model.overflow.preview.visualId;
          const pendingPreview = pendingLandingIds.delete(model.overflow.preview.visualId);
          const preview = createEggNode(model.overflow.preview, MAX_VISIBLE_EGGS);
          if (pendingPreview) pendingLandingIds.add(model.overflow.preview.visualId);
          preview.classList.remove('landing');
          preview.classList.add('egg-overflow-preview');
          const label = documentLike.createElement('strong');
          label.textContent = model.overflow.label;
          overflow.append(preview, label);
        } else {
          delete overflow.dataset.previewEggId;
        }
      }
      root.dataset.total = String(model.total);
      root.dataset.adoptable = String(model.adoptable);
      root.dataset.ready = String(model.ready);
      root.dataset.incubating = String(model.incubating);
      return model;
    }

    function applySnapshot(eggStage = []) {
      eggsById.clear();
      pendingLandingIds.clear();
      landingStartedAtById.clear();
      for (const egg of Array.isArray(eggStage) ? eggStage : []) {
        const visualId = boundedText(egg?.visualId, 64);
        if (visualId && !isClaimedFreeInventoryEgg(egg)) eggsById.set(visualId, egg);
      }
      return render();
    }

    function applyEvent(type, payload = {}) {
      if (type === 'free_egg_claimed') {
        const removedId = boundedText(
          payload.removedEggStage?.visualId ||
          payload.eggStage?.visualId ||
          payload.visualId,
          64
        );
        if (!removedId) return false;
        eggsById.delete(removedId);
        calloutDeadlineById.delete(removedId);
        removeCallout(removedId);
        render();
        return true;
      }
      const egg = payload.eggStage || payload.egg_stage || payload.egg;
      const visualId = boundedText(egg?.visualId || payload.visualId, 64);
      if (!visualId) return false;
      const isNewLanding = type === 'egg_landed' && !eggsById.has(visualId);
      if (type === 'egg_landed' && !isNewLanding) {
        const current = [...root.querySelectorAll('[data-egg-id]')]
          .find(item => item.dataset.eggId === visualId);
        settleLanding(visualId, current);
      }
      if (
        type === 'egg_stage_removed' ||
        egg?.state === 'claimed'
      ) {
        eggsById.delete(visualId);
        calloutDeadlineById.delete(visualId);
        removeCallout(visualId);
      } else {
        eggsById.set(visualId, { ...egg, visualId });
        if (isNewLanding) {
          pendingLandingIds.add(visualId);
          landingStartedAtById.set(visualId, now());
        }
      }
      render();
      return true;
    }

    function rotateOverflow() {
      rotationIndex += 1;
      return render();
    }

    if (typeof options.setInterval === 'function') {
      rotationTimer = options.setInterval(rotateOverflow, 3_000);
      countdownTimer = options.setInterval(render, COUNTDOWN_INTERVAL_MS);
    }

    return {
      applyEvent,
      applySnapshot,
      model: () => buildShelfModel([...eggsById.values()], {
        rotationIndex,
        reducedMotion
      }),
      render,
      rotateOverflow,
      destroy() {
        for (const handle of calloutTimers.values()) cancel(handle);
        calloutTimers.clear();
        for (const handle of landingTimers.values()) cancel(handle);
        landingTimers.clear();
        landingStartedAtById.clear();
        if (rotationTimer != null && typeof options.clearInterval === 'function') {
          options.clearInterval(rotationTimer);
        }
        rotationTimer = null;
        if (countdownTimer != null && typeof options.clearInterval === 'function') {
          options.clearInterval(countdownTimer);
        }
        countdownTimer = null;
      }
    };
  }

  return {
    ADOPT_CALLOUT_MS,
    COUNTDOWN_INTERVAL_MS,
    MAX_VISIBLE_EGGS,
    buildAdoptionNotice,
    buildLifecycleNotice,
    buildShelfModel,
    createEggStageView,
    deterministicEggMotion,
    formatCountdown,
    isClaimedFreeInventoryEgg,
    isPublicFreeEgg,
    shelfTiming,
    visibleCapacity
  };
}));
