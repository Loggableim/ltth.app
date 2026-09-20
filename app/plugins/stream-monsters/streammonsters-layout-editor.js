(function attachStreamMonstersLayoutEditor(root, factory) {
  const presentation = typeof module === 'object' && module.exports
    ? require('./streammonsters-presentation')
    : root.StreamMonstersPresentation;
  const api = factory(presentation);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.StreamMonstersLayoutEditor = api;
}(typeof globalThis === 'object' ? globalThis : this, Presentation => {
  'use strict';

  function mount({
    document: documentLike,
    window: windowLike,
    initial = null,
    onValidity = () => {}
  } = {}) {
    const hostDocument = documentLike || (typeof document === 'object' ? document : null);
    const hostWindow = windowLike || (typeof window === 'object' ? window : null);
    const canvas = hostDocument?.getElementById('presentationCanvas');
    const profileSelect = hostDocument?.getElementById('presentationProfile');
    const audioOwner = hostDocument?.getElementById('presentationAudioOwner');
    const errorOutput = hostDocument?.getElementById('presentationError');
    if (!canvas || !profileSelect || !audioOwner) return null;

    let editor = Presentation.createLayoutEditor({
      presentation: initial,
      profileId: profileSelect.value
    });
    let pointer = null;
    const selectedProfile = () => profileSelect.value;
    const applyRect = (node, rect) => {
      node.style.setProperty('--x', String(rect.x / 100));
      node.style.setProperty('--y', String(rect.y / 100));
      node.style.setProperty('--w', String(rect.width / 100));
      node.style.setProperty('--h', String(rect.height / 100));
    };
    const render = () => {
      const profileId = editor.profile(selectedProfile());
      const presentation = editor.snapshot();
      const profile = presentation.profiles[profileId];
      canvas.dataset.orientation = profileId.startsWith('portrait-')
        ? 'portrait'
        : 'landscape';
      for (const layerId of Presentation.LAYER_IDS) {
        const node = canvas.querySelector(`[data-presentation-layer="${layerId}"]`);
        const layer = profile.layers[layerId];
        if (!node) continue;
        applyRect(node, layer.rect);
        node.dataset.mode = layer.mode;
        node.setAttribute('aria-label', `${layerId}, ${layer.mode}`);
        const mode = node.querySelector(`[data-layer-mode="${layerId}"]`);
        if (mode) mode.value = layer.mode;
      }
      for (const safeZoneId of Presentation.SAFE_ZONE_IDS) {
        const node = canvas.querySelector(
          `[data-presentation-safe-zone="${safeZoneId}"]`
        );
        if (node) applyRect(node, profile.safeZones[safeZoneId]);
      }
      audioOwner.value = presentation.audioOwner;
      const validation = editor.validation();
      if (errorOutput) {
        errorOutput.textContent = validation.valid
          ? ''
          : validation.errors
            .filter(error => error.code === 'safe_zone_collision')
            .map(error => `${error.layerId} × ${error.safeZoneId}`)
            .join(', ');
      }
      onValidity(validation);
      return validation;
    };
    const currentRect = target => {
      const profile = editor.snapshot().profiles[selectedProfile()];
      if (target.dataset.presentationLayer) {
        return profile.layers[target.dataset.presentationLayer].rect;
      }
      return profile.safeZones[target.dataset.presentationSafeZone];
    };
    const changeSafeZone = (target, delta, resize) => {
      const rect = currentRect(target);
      const next = resize
        ? { ...rect, width: rect.width + delta.x, height: rect.height + delta.y }
        : { ...rect, x: rect.x + delta.x, y: rect.y + delta.y };
      editor.setSafeZone(target.dataset.presentationSafeZone, next);
    };
    const changeTarget = (target, delta, resize) => {
      const layerId = target.dataset.presentationLayer;
      if (layerId) {
        if (resize) editor.resize(layerId, { width: delta.x, height: delta.y });
        else editor.drag(layerId, delta);
      } else {
        changeSafeZone(target, delta, resize);
      }
      render();
    };
    const onPointerDown = event => {
      if (event.target.closest('select')) return;
      const target = event.target.closest(
        '[data-presentation-layer],[data-presentation-safe-zone]'
      );
      if (!target) return;
      pointer = {
        target,
        resize: Boolean(event.target.closest('[data-resize-handle]')),
        x: event.clientX,
        y: event.clientY
      };
      target.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    };
    const onPointerMove = event => {
      if (!pointer) return;
      const rect = canvas.getBoundingClientRect();
      const delta = {
        x: Math.round((event.clientX - pointer.x) / Math.max(1, rect.width) * 10_000),
        y: Math.round((event.clientY - pointer.y) / Math.max(1, rect.height) * 10_000)
      };
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      changeTarget(pointer.target, delta, pointer.resize);
    };
    const onPointerUp = () => { pointer = null; };
    const onKeyDown = event => {
      const target = event.target.closest(
        '[data-presentation-layer],[data-presentation-safe-zone]'
      );
      if (!target || !event.key.startsWith('Arrow')) return;
      const amount = event.shiftKey ? 500 : Presentation.SNAP_BASIS_POINTS;
      const delta = {
        ArrowLeft: { x: -amount, y: 0 },
        ArrowRight: { x: amount, y: 0 },
        ArrowUp: { x: 0, y: -amount },
        ArrowDown: { x: 0, y: amount }
      }[event.key];
      changeTarget(target, delta, event.altKey);
      event.preventDefault();
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    hostWindow.addEventListener('pointermove', onPointerMove);
    hostWindow.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('keydown', onKeyDown);
    profileSelect.addEventListener('change', render);
    audioOwner.addEventListener('change', () => {
      editor.setAudioOwner(audioOwner.value);
      render();
    });
    canvas.querySelectorAll('[data-layer-mode]').forEach(select => {
      select.addEventListener('change', () => {
        editor.setMode(select.dataset.layerMode, select.value);
        render();
      });
    });
    hostDocument.getElementById('presentationUndo')?.addEventListener('click', () => {
      editor.undo();
      render();
    });
    hostDocument.getElementById('presentationReset')?.addEventListener('click', () => {
      editor.reset();
      render();
    });
    hostDocument.getElementById('presentationCopy')?.addEventListener('click', () => {
      const from = selectedProfile();
      const to = from.endsWith('-1080')
        ? from.replace('-1080', '-720')
        : from.replace('-720', '-1080');
      editor.copyProfile(from, to);
      profileSelect.value = to;
      render();
    });
    render();

    return {
      load(presentation) {
        editor = Presentation.createLayoutEditor({
          presentation,
          profileId: selectedProfile()
        });
        render();
      },
      snapshot: () => editor.snapshot(),
      validation: () => editor.validation(),
      render,
      destroy() {
        hostWindow.removeEventListener('pointermove', onPointerMove);
        hostWindow.removeEventListener('pointerup', onPointerUp);
      }
    };
  }

  return { mount };
}));
