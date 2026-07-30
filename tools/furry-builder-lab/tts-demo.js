'use strict';

(function initTtsDemo(globalScope, factory) {
  const dependencies = typeof module === 'object' && module.exports
    ? {
      templateCanvasRenderer: require('./template-canvas-renderer'),
      templateDemoState: require('./template-demo-state'),
      templateRig: require('./template-rig')
    }
    : {
      templateCanvasRenderer: globalScope && globalScope.TemplateCanvasRenderer,
      templateDemoState: globalScope && globalScope.TemplateDemoState,
      templateRig: globalScope && globalScope.TemplateRig
    };
  const api = factory(dependencies);

  if (typeof module === 'object' && module.exports) module.exports = api;
  if (globalScope && globalScope.document) {
    api.mount(globalScope.document).catch((error) => {
      const status = globalScope.document.querySelector('#canvas-status');
      if (status) status.textContent = error.message;
    });
  }
})(typeof window === 'undefined' ? null : window, function createTtsDemo({
  templateCanvasRenderer,
  templateDemoState,
  templateRig
}) {
  const FRAME_STATES = Object.freeze({
    rest: Object.freeze({ label: 'Geschlossen', detail: 'Geschlossen · Ruheframe', level: 0 }),
    small: Object.freeze({ label: 'Klein', detail: 'Klein geöffnet · leiser Sprachanteil', level: 15 }),
    round: Object.freeze({ label: 'Rund', detail: 'Rund geöffnet · Vokalform', level: 40 }),
    wide: Object.freeze({ label: 'Weit', detail: 'Weit geöffnet · betonter Sprachanteil', level: 65 }),
    teeth: Object.freeze({ label: 'Zähne', detail: 'Zähne sichtbar · intensive Sprachform', level: 90 })
  });

  function clampLevel(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.min(100, Math.max(0, Math.round(parsed)));
  }

  function stateForLevel(value) {
    const level = clampLevel(value);
    if (level === 0) return 'rest';
    if (level <= 25) return 'small';
    if (level <= 50) return 'round';
    if (level <= 75) return 'wide';
    return 'teeth';
  }

  function selectTemplate(state, templateId) {
    return { ...state, templateId };
  }

  function templateAssetUrl(fileName, manifestUrl) {
    return new URL(fileName, manifestUrl).href;
  }

  function createManifestImageLoader(manifestUrl) {
    return (fileName) => new Promise((resolve, reject) => {
      if (typeof Image !== 'function') {
        reject(new Error('Die lokale Canvas-Demo kann keine Bilder laden.'));
        return;
      }

      const image = new Image();
      image.addEventListener('load', () => resolve(image), { once: true });
      image.addEventListener('error', () => reject(new Error(`Die Atlas-Datei konnte nicht geladen werden: ${fileName}`)), { once: true });
      image.src = templateAssetUrl(fileName, manifestUrl);
    });
  }

  function defaultLoadManifest(manifestUrl) {
    if (typeof fetch !== 'function') {
      return Promise.reject(new Error('Die Vorlage kann ohne Fetch-Unterstützung nicht geladen werden.'));
    }

    return fetch(manifestUrl).then((response) => {
      if (!response.ok) throw new Error('Die Face-Template-Vorlage konnte nicht geladen werden.');
      return response.json();
    });
  }

  function mount(documentRef, {
    manifest: suppliedManifest,
    createRenderer = templateCanvasRenderer && templateCanvasRenderer.createTemplateCanvasRenderer,
    loadManifest = defaultLoadManifest,
    manifestPath = 'assets/face-templates.json',
    loadImage,
    setInterval: setIntervalFn = globalThis.setInterval,
    clearInterval: clearIntervalFn = globalThis.clearInterval
  } = {}) {
    const canvas = documentRef.querySelector('#template-canvas');
    const slider = documentRef.querySelector('#audio-level');
    const sliderValue = documentRef.querySelector('#audio-level-value');
    const description = documentRef.querySelector('#state-description');
    const badge = documentRef.querySelector('#frame-badge');
    const previous = documentRef.querySelector('#template-prev');
    const next = documentRef.querySelector('#template-next');
    const rotationToggle = documentRef.querySelector('#rotation-toggle');
    const rotationMessage = documentRef.querySelector('#rotation-message');
    const canvasStatus = documentRef.querySelector('#canvas-status');
    const templateChips = Array.from(documentRef.querySelectorAll('[data-template-id]'));
    const stateButtons = Array.from(documentRef.querySelectorAll('[data-state]'));

    if (!canvas || !slider || !previous || !next || !rotationToggle) return Promise.resolve(null);
    if (typeof createRenderer !== 'function' || !templateDemoState || !templateRig) {
      return Promise.reject(new Error('Die lokale Canvas-Demo konnte nicht initialisiert werden.'));
    }

    const documentBaseUrl = documentRef.baseURI || (typeof location === 'object' ? location.href : 'http://localhost/');
    const manifestUrl = new URL(manifestPath, documentBaseUrl).href;
    const manifestPromise = suppliedManifest ? Promise.resolve(suppliedManifest) : loadManifest(manifestUrl);
    return manifestPromise.then((manifest) => {
      const templateIds = manifest.templates.map((template) => template.id);
      if (!templateIds.length) throw new Error('Die Face-Template-Vorlage enthält keine Figuren.');

      const renderer = createRenderer({
        canvas,
        manifest,
        loadImage: loadImage || createManifestImageLoader(manifestUrl),
        resolveTemplatePlan: templateRig.resolveTemplatePlan
      });
      let state = templateDemoState.createDemoState(templateIds[0], 'rest');
      let rotationTimer = null;

      function updateControls() {
        const frame = FRAME_STATES[state.mouthFrame];
        slider.value = String(state.audioLevel);
        if (sliderValue) sliderValue.textContent = String(state.audioLevel);
        if (description) description.textContent = frame.detail;
        if (badge) badge.textContent = frame.label.toUpperCase();
        templateChips.forEach((chip) => {
          const isSelected = chip.dataset.templateId === state.templateId;
          chip.classList.toggle('is-selected', isSelected);
          chip.setAttribute('aria-pressed', String(isSelected));
        });
        stateButtons.forEach((button) => {
          const isSelected = button.dataset.state === state.mouthFrame;
          button.classList.toggle('is-selected', isSelected);
          button.setAttribute('aria-pressed', String(isSelected));
        });
        rotationToggle.dataset.rotating = String(state.rotating);
        rotationToggle.setAttribute('aria-pressed', String(state.rotating));
        rotationToggle.textContent = state.rotating ? 'Automatische Rotation stoppen' : 'Automatische Rotation starten';
        if (rotationMessage) {
          rotationMessage.textContent = state.rotating
            ? 'Wechselt alle 2,6 Sekunden zur nächsten Vorlage.'
            : 'Automatische Rotation ist ausgeschaltet.';
        }
      }

      function renderState() {
        updateControls();
        return Promise.resolve(renderer.render(state.templateId, state.mouthFrame))
          .then(() => {
            if (canvasStatus) canvasStatus.textContent = 'Canvas-Vorlage bereit.';
          })
          .catch((error) => {
            if (canvasStatus) canvasStatus.textContent = error.message;
          });
      }

      function commit(nextState) {
        state = nextState;
        return renderState();
      }

      function setLevel(level) {
        const audioLevel = clampLevel(level);
        return commit({
          ...state,
          audioLevel,
          mouthFrame: stateForLevel(audioLevel)
        });
      }

      function setMouthFrame(mouthFrame) {
        const frame = FRAME_STATES[mouthFrame];
        if (!frame) return Promise.resolve();
        return commit({ ...state, mouthFrame, audioLevel: frame.level });
      }

      function setTemplate(templateId) {
        if (!templateIds.includes(templateId)) return Promise.resolve();
        return commit(selectTemplate(state, templateId));
      }

      function rotate(direction) {
        return commit(templateDemoState.rotateTemplate(state, templateIds, direction));
      }

      function startRotation() {
        if (rotationTimer !== null) return;
        state = { ...state, rotating: true };
        updateControls();
        rotationTimer = setIntervalFn(() => {
          rotate(1);
        }, 2600);
      }

      function stopRotation() {
        if (rotationTimer !== null) clearIntervalFn(rotationTimer);
        rotationTimer = null;
        state = { ...state, rotating: false };
        updateControls();
      }

      templateChips.forEach((chip) => {
        chip.addEventListener('click', () => {
          setTemplate(chip.dataset.templateId);
        });
      });
      stateButtons.forEach((button) => {
        button.addEventListener('click', () => {
          setMouthFrame(button.dataset.state);
        });
      });
      slider.addEventListener('input', (event) => {
        setLevel(event.target.value);
      });
      previous.addEventListener('click', () => {
        rotate(-1);
      });
      next.addEventListener('click', () => {
        rotate(1);
      });
      rotationToggle.addEventListener('click', () => {
        if (rotationTimer === null) startRotation();
        else stopRotation();
      });

      renderState();
      return {
        getState() {
          return { ...state };
        },
        setLevel,
        setTemplate,
        startRotation,
        stopRotation
      };
    });
  }

  return { FRAME_STATES, clampLevel, mount, selectTemplate, stateForLevel, templateAssetUrl };
});
