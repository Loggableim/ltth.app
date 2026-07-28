(function attachStreamMonstersEggStageView(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.StreamMonstersEggStageView = api;
}(typeof globalThis === 'object' ? globalThis : this, () => {
  'use strict';

  const MAX_VISIBLE_EGGS = 8;
  const ADOPT_CALLOUT_MS = 8_000;

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

  function deterministicEggMotion(visualId, index = 0, reducedMotion = false) {
    const hash = hashText(`${visualId}:${index}`);
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
      .filter(Boolean)
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
    const reducedMotion = Boolean(options.reducedMotion);
    const calloutDeadlineById = new Map();
    const calloutTimers = new Map();
    const eggsById = new Map();
    let rotationIndex = 0;
    let rotationTimer = null;

    function safeImageUrl(value) {
      const url = boundedText(value, 512);
      return /^\/plugins\/streamalchemy\/assets\/[a-z0-9./_-]+$/i.test(url)
        ? url
        : '';
    }

    function removeCallout(visualId) {
      const item = slots?.querySelector(`[data-egg-id="${visualId}"]`);
      item?.querySelector('[data-adopt-callout]')?.remove();
      const handle = calloutTimers.get(visualId);
      if (handle != null) cancel(handle);
      calloutTimers.delete(visualId);
    }

    function createEggNode(egg, index) {
      const item = documentLike.createElement('article');
      item.className = 'egg-shelf-item';
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

    function render() {
      const model = buildShelfModel([...eggsById.values()], {
        rotationIndex,
        reducedMotion
      });
      if (slots) {
        slots.replaceChildren(
          ...model.visible.map((egg, index) => createEggNode(egg, index))
        );
      }
      if (overflow) {
        overflow.replaceChildren();
        overflow.hidden = !model.overflow;
        if (model.overflow) {
          overflow.dataset.previewEggId = model.overflow.preview.visualId;
          const preview = createEggNode(model.overflow.preview, MAX_VISIBLE_EGGS);
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
      for (const egg of Array.isArray(eggStage) ? eggStage : []) {
        const visualId = boundedText(egg?.visualId, 64);
        if (visualId) eggsById.set(visualId, egg);
      }
      return render();
    }

    function applyEvent(type, payload = {}) {
      const egg = payload.eggStage || payload.egg_stage || payload.egg;
      const visualId = boundedText(egg?.visualId || payload.visualId, 64);
      if (!visualId) return false;
      if (
        type === 'egg_stage_removed' ||
        egg?.state === 'claimed' ||
        egg?.state === 'expired'
      ) {
        eggsById.delete(visualId);
        calloutDeadlineById.delete(visualId);
        removeCallout(visualId);
      } else {
        eggsById.set(visualId, { ...egg, visualId });
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
        if (rotationTimer != null && typeof options.clearInterval === 'function') {
          options.clearInterval(rotationTimer);
        }
        rotationTimer = null;
      }
    };
  }

  return {
    ADOPT_CALLOUT_MS,
    MAX_VISIBLE_EGGS,
    buildShelfModel,
    createEggStageView,
    deterministicEggMotion,
    isPublicFreeEgg
  };
}));
