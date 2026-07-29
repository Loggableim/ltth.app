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

  function isReservedFreeEgg(egg = {}) {
    return egg.provenance === 'free' &&
      egg.state === 'reserved' &&
      egg.adoptionStatus === 'reserved';
  }

  function isClaimedFreeInventoryEgg(egg = {}) {
    return egg.provenance === 'free' &&
      egg.ownershipState === 'owned';
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
      const time = formatCountdown(Math.max(
        0,
        Number(timing.expiresAtMs ?? timing.expiryAtMs) - Number(nowMs)
      ));
      return replaceTokens(labels.public || 'Free · {time}', {
        time,
        command: time
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

  function buildHatchRevealNotice(payload = {}, { commands = {} } = {}) {
    const automatic = payload.autoHatch === true;
    const monster = boundedText(payload.monster?.name, 64);
    const viewer = safeViewerName(
      payload.displayName || payload.viewerName || payload.owner?.displayName
    );
    const monstersCommand = boundedText(commands.monsters, 48);
    return {
      automatic,
      titleKey: automatic ? 'eggLifecycleAutoHatchedTitle' : 'hatchedTitle',
      copyKey: automatic ? 'eggLifecycleAutoHatchedCopy' : 'hatchedCopy',
      params: { monster, viewer },
      commands: monstersCommand ? [monstersCommand] : []
    };
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
    const ownedEggCommands = () => {
      const state = String(egg.state || '').toLowerCase();
      if (state === 'ready') return commandList('hatch');
      if (state === 'hatched') return commandList('monsters');
      return commandList('eggs');
    };
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
      (
        egg.ownershipState === 'owned' ||
        (egg.adoptionStatus === 'owned' && egg.adoptable !== true)
      )
    ) {
      return {
        ...common,
        kind: 'gift_owned',
        titleKey: 'eggLifecycleGiftOwnedTitle',
        copyKey: 'eggLifecycleGiftOwnedCopy',
        commands: ownedEggCommands()
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
        commands: ownedEggCommands()
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

    if (
      ['egg_auto_hatched', 'auto_hatch_completed'].includes(normalizedType) ||
      (normalizedType === 'egg_hatched' && payload.autoHatch === true)
    ) {
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

  function buildEventPresentation(type, payload = {}, options = {}) {
    const normalizedType = String(type || '')
      .replace(/^streammonsters:/, '')
      .toLowerCase();
    if (normalizedType === 'egg_landed') return null;

    const adoption = buildAdoptionNotice(normalizedType, payload);
    if (adoption) {
      const source = payload.eggStage || payload.egg_stage || payload.egg;
      const egg = normalizeEgg(source);
      const adoptCommand = boundedText(options.commands?.adopt, 48);
      const reserved = adoption.kind === 'reserved';
      return {
        ...adoption,
        kind: reserved ? 'free_reserved' : 'free_public',
        viewer: safeViewerName(adoption.viewer),
        visualId: egg?.visualId || '',
        element: egg?.element || '',
        titleKey: reserved
          ? 'eggLifecycleFreeReservedTitle'
          : 'eggLifecycleFreePublicTitle',
        copyKey: reserved
          ? 'eggLifecycleFreeReservedCopy'
          : 'eggLifecycleFreePublicCopy',
        params: {
          viewer: safeViewerName(adoption.viewer),
          element: egg?.element || '',
          command: adoptCommand
        },
        commands: adoptCommand ? [adoptCommand] : [],
        sideEffectKey: boundedText(
          payload.eventId || payload.correlationId ||
            `${normalizedType}:${egg?.visualId || 'egg'}`,
          160
        )
      };
    }

    return buildLifecycleNotice(normalizedType, payload, options);
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

  function orderedStageEggs(eggStage = [], reducedMotion = false) {
    return (Array.isArray(eggStage) ? eggStage : [])
      .map(egg => normalizeEgg(egg))
      .filter(egg => (
        egg &&
        egg.state !== 'expired' &&
        !isClaimedFreeInventoryEgg(egg)
      ))
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
  }

  function buildPortraitFocusModel(eggStage = [], {
    rotationIndex = 0,
    reducedMotion = false
  } = {}) {
    const eggs = orderedStageEggs(eggStage, reducedMotion);
    const freeOfferEggs = eggs.filter(egg => (
      isPublicFreeEgg(egg) || isReservedFreeEgg(egg)
    ));
    const activeEggs = eggs
      .filter(egg => (
        !isPublicFreeEgg(egg) &&
        !isReservedFreeEgg(egg) &&
        ['ready', 'incubating', 'queued', 'reserved'].includes(egg.state)
      ))
      .sort((left, right) => (
        ['ready', 'incubating', 'queued', 'reserved'].indexOf(left.state) -
          ['ready', 'incubating', 'queued', 'reserved'].indexOf(right.state) ||
        left.visualId.localeCompare(right.visualId)
      ));
    const turn = Math.max(0, Number(rotationIndex) || 0);
    const alternateIndex = Math.floor(turn / 2);
    let focus = null;

    if (freeOfferEggs.length && turn % 2 === 0) {
      focus = freeOfferEggs[alternateIndex % freeOfferEggs.length];
    } else if (activeEggs.length) {
      focus = activeEggs[alternateIndex % activeEggs.length];
    } else if (freeOfferEggs.length) {
      focus = freeOfferEggs[turn % freeOfferEggs.length];
    } else if (eggs.length) {
      focus = eggs[turn % eggs.length];
    }

    return {
      focus,
      position: focus ? eggs.findIndex(egg => egg.visualId === focus.visualId) + 1 : 0,
      total: eggs.length,
      rotationIndex: turn
    };
  }

  function buildShelfModel(eggStage = [], {
    maxVisible = MAX_VISIBLE_EGGS,
    rotationIndex = 0,
    reducedMotion = false
  } = {}) {
    const normalized = orderedStageEggs(eggStage, reducedMotion);
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
    let focusCard = root.querySelector('[data-egg-focus]');
    if (!focusCard) {
      focusCard = documentLike.createElement('article');
      focusCard.dataset.eggFocus = '';
      focusCard.hidden = true;
      root.appendChild(focusCard);
    }
    let adoptSummary = root.querySelector('[data-egg-adopt-summary]');
    if (!adoptSummary) {
      adoptSummary = documentLike.createElement('div');
      adoptSummary.dataset.eggAdoptSummary = '';
      adoptSummary.hidden = true;
      root.appendChild(adoptSummary);
    }
    const now = options.now || (() => Date.now());
    const schedule = options.setTimeout || setTimeout;
    const cancel = options.clearTimeout || clearTimeout;
    const staticLabels = options.labels || {};
    const getLabels = typeof options.getLabels === 'function'
      ? options.getLabels
      : () => staticLabels;
    const getHatchReference = options.getHatchReference || (() => '!hatch');
    const getAdoptReference = options.getAdoptReference || (() => '!adopt');
    const reducedMotion = Boolean(options.reducedMotion);
    const landingTimers = new Map();
    const eggsById = new Map();
    const pendingLandingIds = new Set();
    let overflowRotationIndex = 0;
    let focusRotationIndex = 0;
    let overflowRotationTimer = null;
    let focusRotationTimer = null;
    let countdownTimer = null;

    function currentLabels() {
      const resolved = getLabels();
      return resolved && typeof resolved === 'object' ? resolved : staticLabels;
    }

    function safeImageUrl(value) {
      const url = boundedText(value, 512);
      return /^\/plugins\/streamalchemy\/assets\/[a-z0-9./_-]+$/i.test(url) &&
        !url.split('/').includes('..')
        ? url
        : '';
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
        labels:currentLabels(),
        hatchReference: getHatchReference(),
        adoptReference: getAdoptReference()
      });
      item.appendChild(timing);

      if (isPublicFreeEgg(egg)) {
        item.classList.add('gold-ring', 'public-free');
      }
      return item;
    }

    function cancelPendingLanding(visualId) {
      pendingLandingIds.delete(visualId);
      const handle = landingTimers.get(visualId);
      if (handle != null) cancel(handle);
      landingTimers.delete(visualId);
    }

    function settleLanding(visualId, item) {
      if (!item || item.dataset.eggId !== visualId) return;
      item.classList.remove('landing');
      cancelPendingLanding(visualId);
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
          labels:currentLabels(),
          hatchReference: getHatchReference(),
          adoptReference: getAdoptReference()
        });
      }
      const publicEgg = isPublicFreeEgg(egg);
      item.classList.toggle('gold-ring', publicEgg);
      item.classList.toggle('public-free', publicEgg);
      return item;
    }

    function updateOverflow(model) {
      if (!overflow) return;
      overflow.hidden = !model.overflow;
      if (!model.overflow) {
        overflow.replaceChildren();
        delete overflow.dataset.previewEggId;
        return;
      }

      const previewEgg = model.overflow.preview;
      let preview = overflow.querySelector('.egg-overflow-preview');
      if (preview?.dataset.eggId === previewEgg.visualId) {
        updateKeyedEggNode(preview, previewEgg, MAX_VISIBLE_EGGS);
      } else {
        preview?.remove();
        const pendingPreview = pendingLandingIds.delete(previewEgg.visualId);
        preview = createEggNode(previewEgg, MAX_VISIBLE_EGGS);
        if (pendingPreview) pendingLandingIds.add(previewEgg.visualId);
        preview.classList.remove('landing');
        preview.classList.add('egg-overflow-preview');
        overflow.prepend(preview);
      }
      overflow.dataset.previewEggId = previewEgg.visualId;

      let count = overflow.querySelector('[data-egg-overflow-count]');
      if (!count) {
        count = documentLike.createElement('strong');
        count.dataset.eggOverflowCount = '';
        overflow.appendChild(count);
      }
      count.textContent = model.overflow.label;
    }

    function updateAdoptSummary(model) {
      if (!adoptSummary) return;
      adoptSummary.hidden = model.adoptable < 1;
      adoptSummary.textContent = model.adoptable > 0
        ? replaceTokens(
            currentLabels().adoptSummary || '{count} free · {command}',
            {
              count: model.adoptable,
              command: getAdoptReference()
            }
          )
        : '';
    }

    function focusTiming(egg) {
      const labels = currentLabels();
      const timing = egg.timing || {};
      if (isPublicFreeEgg(egg)) {
        return replaceTokens(labels.eggFocusPublic || labels.public || 'Free egg · {time} · {command}', {
          time: formatCountdown(Math.max(
            0,
            Number(timing.expiresAtMs ?? timing.expiryAtMs) - Number(now())
          )),
          command: getAdoptReference()
        });
      }
      if (egg.state === 'ready') {
        return replaceTokens(labels.eggFocusReady || labels.ready || 'Ready · {command}', {
          command: getHatchReference()
        });
      }
      if (egg.state === 'queued') {
        return replaceTokens(labels.eggFocusQueued || labels.queued || 'Queue #{position}', {
          position: Number(egg.queuePosition) || 1
        });
      }
      if (egg.state === 'reserved') {
        return replaceTokens(labels.eggFocusReserved || labels.reserved || 'Reserved · {time} · {command}', {
          time: formatCountdown(Math.max(0, Number(timing.publicAtMs) - Number(now()))),
          command: getAdoptReference()
        });
      }
      return replaceTokens(
        labels.eggFocusIncubating || labels.incubating || 'Hatches in {time}',
        {
          time: formatCountdown(Math.max(0, Number(timing.readyAtMs) - Number(now())))
        }
      );
    }

    function updateFocusCard(model) {
      if (!focusCard) return;
      const egg = model.focus;
      focusCard.hidden = !egg;
      if (!egg) {
        delete focusCard.dataset.eggId;
        return;
      }
      focusCard.dataset.eggId = egg.visualId;
      focusCard.dataset.state = boundedText(egg.state, 24);
      focusCard.dataset.provenance = boundedText(egg.provenance, 24);
      focusCard.dataset.element = egg.element.toLowerCase();
      focusCard.dataset.adoptable = String(isPublicFreeEgg(egg));

      let art = focusCard.querySelector('[data-egg-focus-art]');
      if (!art) {
        art = documentLike.createElement('div');
        art.dataset.eggFocusArt = '';
        art.className = 'egg-focus-art';
        focusCard.appendChild(art);
      }
      const imageUrl = safeImageUrl(egg.imageUrl);
      if (imageUrl) {
        let image = art.querySelector('img');
        if (!image) {
          image = documentLike.createElement('img');
          art.replaceChildren(image);
        }
        image.src = imageUrl;
        image.alt = `${egg.element} egg`;
        delete art.dataset.fallback;
      } else if (art.dataset.fallback !== 'true') {
        art.replaceChildren();
        art.textContent = '🥚';
        art.dataset.fallback = 'true';
      }

      const ensureLine = (name, className) => {
        let line = focusCard.querySelector(`[data-egg-focus-${name}]`);
        if (!line) {
          line = documentLike.createElement('span');
          line.dataset[`eggFocus${name[0].toUpperCase()}${name.slice(1)}`] = '';
          line.className = className;
          focusCard.appendChild(line);
        }
        return line;
      };
      const ownerLine = ensureLine('owner', 'egg-focus-owner');
      ownerLine.textContent = isPublicFreeEgg(egg)
        ? currentLabels().eggFocusOpenOwner || ''
        : replaceTokens(
            currentLabels().eggFocusOwner || 'Owner: {owner}',
            { owner: safeViewerName(egg.displayName) || 'Viewer' }
          );
      ensureLine('state', 'egg-focus-state').textContent = focusTiming(egg);
      ensureLine('position', 'egg-focus-position').textContent = replaceTokens(
        currentLabels().eggFocusPosition || '{position} / {total}',
        { position: model.position, total: model.total }
      );
    }

    function render() {
      const viewportWidth = Number(
        options.viewportWidth?.() ||
        root.clientWidth ||
        documentLike.defaultView?.innerWidth
      );
      const model = buildShelfModel([...eggsById.values()], {
        maxVisible: visibleCapacity(viewportWidth),
        rotationIndex:overflowRotationIndex,
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
      updateOverflow(model);
      updateAdoptSummary(model);
      updateFocusCard(buildPortraitFocusModel([...eggsById.values()], {
        rotationIndex:focusRotationIndex,
        reducedMotion
      }));
      root.dataset.total = String(model.total);
      root.dataset.adoptable = String(model.adoptable);
      root.dataset.ready = String(model.ready);
      root.dataset.incubating = String(model.incubating);
      return model;
    }

    function applySnapshot(eggStage = []) {
      eggsById.clear();
      pendingLandingIds.clear();
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
        cancelPendingLanding(removedId);
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
        type === 'egg_expired' ||
        isClaimedFreeInventoryEgg(egg) ||
        egg?.state === 'claimed'
      ) {
        eggsById.delete(visualId);
        cancelPendingLanding(visualId);
      } else {
        eggsById.set(visualId, { ...egg, visualId });
        if (isNewLanding) {
          pendingLandingIds.add(visualId);
        }
      }
      render();
      return true;
    }

    function rotateOverflow() {
      overflowRotationIndex += 1;
      return render();
    }

    function rotateFocus() {
      focusRotationIndex += 1;
      return render();
    }

    if (typeof options.setInterval === 'function') {
      overflowRotationTimer = options.setInterval(rotateOverflow, 3_000);
      focusRotationTimer = options.setInterval(rotateFocus, 5_000);
      countdownTimer = options.setInterval(render, COUNTDOWN_INTERVAL_MS);
    }

    return {
      applyEvent,
      applySnapshot,
      model: () => buildShelfModel([...eggsById.values()], {
        rotationIndex:overflowRotationIndex,
        reducedMotion
      }),
      render,
      rotateFocus,
      rotateOverflow,
      destroy() {
        for (const handle of landingTimers.values()) cancel(handle);
        landingTimers.clear();
        if (overflowRotationTimer != null && typeof options.clearInterval === 'function') {
          options.clearInterval(overflowRotationTimer);
        }
        overflowRotationTimer = null;
        if (focusRotationTimer != null && typeof options.clearInterval === 'function') {
          options.clearInterval(focusRotationTimer);
        }
        focusRotationTimer = null;
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
    buildEventPresentation,
    buildHatchRevealNotice,
    buildLifecycleNotice,
    buildPortraitFocusModel,
    buildShelfModel,
    createEggStageView,
    deterministicEggMotion,
    formatCountdown,
    isClaimedFreeInventoryEgg,
    isPublicFreeEgg,
    isReservedFreeEgg,
    shelfTiming,
    visibleCapacity
  };
}));
