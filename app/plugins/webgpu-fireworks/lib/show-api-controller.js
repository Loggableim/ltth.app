'use strict';

const { randomUUID } = require('crypto');
const { ShowRepositoryError } = require('./show-repository');
const {
  ShowPreviewPlanError,
  createShowPreviewPlan
} = require('./show-preview-plan');

const DERIVABLE_VARIANTS = Object.freeze(['medium', 'short']);
const PUBLISH_VARIANTS = Object.freeze(['medium', 'short', 'long']);
const CUSTOM_ID_PATTERN = /^custom:([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
const BUILT_IN_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PREVIEW_VARIANTS = Object.freeze(['short', 'medium', 'long']);

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function hasVariants(definition, variants) {
  return isObject(definition?.variants)
    && variants.every(variant => isObject(definition.variants[variant]));
}

function deepFreeze(value) {
  Object.freeze(value);
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object' && !Object.isFrozen(child)) deepFreeze(child);
  }
  return value;
}

class ShowApiController {
  constructor(options = {}) {
    this.getRepository = options.getRepository;
    this.getRepositoryError = options.getRepositoryError;
    this.getPreviewRendererStatus = options.getPreviewRendererStatus;
    this.getConfig = options.getConfig;
    this.finaleShowPlanner = options.finaleShowPlanner;
    this.emitPreview = options.emitPreview;
    this.createPreviewRequestId = typeof options.createPreviewRequestId === 'function'
      ? options.createPreviewRequestId
      : () => `preview:${randomUUID()}`;
    this.log = typeof options.log === 'function' ? options.log : () => {};
  }

  registerRoutes(api) {
    const route = (method, routePath, handler) => {
      api.registerRoute(method, routePath, (req, res) => this._handle(handler, req, res));
    };

    route('get', '/api/webgpu-fireworks/shows', (req, res) => this.list(req, res));
    route('post', '/api/webgpu-fireworks/shows', (req, res) => this.create(req, res));
    route('post', '/api/webgpu-fireworks/shows/import', (req, res) => this.import(req, res));
    route('get', '/api/webgpu-fireworks/shows/:id/export', (req, res) => this.export(req, res));
    route('get', '/api/webgpu-fireworks/shows/:id', (req, res) => this.get(req, res));
    route('put', '/api/webgpu-fireworks/shows/:id/draft', (req, res) => this.saveDraft(req, res));
    route('post', '/api/webgpu-fireworks/shows/:id/validate', (req, res) => this.validate(req, res));
    route('post', '/api/webgpu-fireworks/shows/:id/publish', (req, res) => this.publish(req, res));
    route('post', '/api/webgpu-fireworks/shows/:id/duplicate', (req, res) => this.duplicate(req, res));
    route('post', '/api/webgpu-fireworks/shows/:id/derive', (req, res) => this.derive(req, res));
    route('post', '/api/webgpu-fireworks/shows/:id/preview', (req, res) => this.preview(req, res));
    route('post', '/api/webgpu-fireworks/shows/:id/archive', (req, res) => this.archive(req, res));
    route('post', '/api/webgpu-fireworks/shows/:id/restore', (req, res) => this.restore(req, res));
  }

  create(req, res) {
    const show = this._repository().create(req.body?.definition);
    return res.status(201).json({ success: true, show });
  }

  import(req, res) {
    const input = isObject(req.body)
      && Object.prototype.hasOwnProperty.call(req.body, 'definition')
      ? req.body.definition
      : req.body;
    const show = this._repository().importDefinition(input);
    return res.status(201).json({ success: true, show });
  }

  list(req, res) {
    const repository = this._repository({ allowUnavailable: true });
    const unavailable = Boolean(this._repositoryError());
    const records = unavailable ? repository.listBuiltIns() : repository.list();
    const shows = records.map(show => this._summary(show));
    const selectableStyles = unavailable
      ? records.map(show => this._selectorSummary(show))
      : repository.getSelectableStyles();
    const autoEligibleStyleIds = unavailable
      ? selectableStyles.filter(style => style.autoEligible).map(style => style.id)
      : repository.getAutoEligibleStyleIds();
    return res.json({
      success: true,
      shows,
      selectableStyles,
      autoEligibleStyleIds
    });
  }

  get(req, res) {
    const id = this._routeId(req.params.id);
    const repository = this._repository({ allowUnavailable: !id.startsWith('custom:') });
    const show = this._repositoryError()
      ? repository.getBuiltIn(id)
      : repository.get(id);
    return res.json({ success: true, show });
  }

  export(req, res) {
    const id = this._routeId(req.params.id);
    const repository = this._repository({ allowUnavailable: !id.startsWith('custom:') });
    if (this._repositoryError()) repository.getBuiltIn(id);
    const definition = JSON.parse(repository.exportJson(id));
    return res.json({ success: true, definition });
  }

  saveDraft(req, res) {
    const id = this._routeId(req.params.id);
    const show = this._repository().saveDraft(
      id,
      req.body?.definition,
      req.body?.expectedRevision
    );
    return res.json({ success: true, show });
  }

  validate(req, res) {
    const id = this._routeId(req.params.id);
    const repository = this._repository({ allowUnavailable: !id.startsWith('custom:') });
    const before = this._repositoryError()
      ? repository.getBuiltIn(id)
      : repository.get(id);
    if (before.builtIn) {
      const show = repository.validate(id);
      return res.json({
        success: true,
        autoDerived: false,
        derivedVariants: [],
        currentRevision: show.revision,
        show
      });
    }

    let show = repository.validate(id, req.body?.expectedRevision);
    const missingVariants = DERIVABLE_VARIANTS.filter(variant => (
      !isObject(show.definition?.variants?.[variant])
    ));
    const previouslyComplete = before.revisions.some(revision => (
      hasVariants(revision.definition, PUBLISH_VARIANTS)
    ));
    if (show.validation?.valid === true
      && isObject(show.definition?.variants?.long)
      && missingVariants.length > 0
      && !previouslyComplete) {
      show = repository.derive(id, show.revision, { variants: missingVariants });
      show = repository.validate(id, show.revision);
      return res.json({
        success: true,
        autoDerived: true,
        derivedVariants: missingVariants,
        currentRevision: show.revision,
        show
      });
    }

    return res.json({
      success: true,
      autoDerived: false,
      derivedVariants: [],
      currentRevision: show.revision,
      show
    });
  }

  publish(req, res) {
    const id = this._routeId(req.params.id);
    const repository = this._repository();
    const current = repository.get(id);
    if (current.builtIn) {
      repository.publish(id, req.body?.expectedRevision);
    }
    this._assertExpectedRevision(current, req.body?.expectedRevision);
    const missingVariants = PUBLISH_VARIANTS.filter(variant => (
      !isObject(current.definition?.variants?.[variant])
    ));
    if (missingVariants.length > 0) {
      throw new ShowRepositoryError(
        'PUBLISH_VARIANTS_REQUIRED',
        422,
        'Publishing requires short, medium, and long variants.',
        { id, currentRevision: current.revision, missingVariants }
      );
    }
    const show = repository.publish(id, req.body?.expectedRevision);
    return res.json({ success: true, show });
  }

  duplicate(req, res) {
    const id = this._routeId(req.params.id);
    const repository = this._repository();
    const current = repository.get(id);
    this._assertExpectedRevision(current, req.body?.expectedRevision);
    const options = {};
    if (isObject(req.body) && Object.prototype.hasOwnProperty.call(req.body, 'name')) {
      options.name = req.body.name;
    }
    const show = repository.duplicate(id, options);
    return res.status(201).json({ success: true, show });
  }

  derive(req, res) {
    const id = this._routeId(req.params.id);
    const repository = this._repository();
    const current = repository.get(id);
    if (current.builtIn) {
      repository.derive(id, req.body?.expectedRevision, req.body || {});
    }
    this._assertExpectedRevision(current, req.body?.expectedRevision);
    if (req.body?.overwrite === true && req.body?.confirmOverwrite !== true) {
      throw new ShowRepositoryError(
        'DERIVE_OVERWRITE_CONFIRMATION_REQUIRED',
        409,
        'Overwriting existing variants requires explicit confirmation.',
        { id, currentRevision: current.revision }
      );
    }
    const show = repository.derive(id, req.body?.expectedRevision, {
      variants: req.body?.variants,
      seed: req.body?.seed,
      overwrite: req.body?.overwrite === true
    });
    return res.json({ success: true, show });
  }

  preview(req, res) {
    const id = this._routeId(req.params.id);
    const body = isObject(req.body) ? req.body : {};
    if (!PREVIEW_VARIANTS.includes(body.variant)) {
      throw new ShowRepositoryError(
        'INVALID_PREVIEW_VARIANT',
        400,
        'variant must be short, medium, or long.',
        { variant: body.variant, supportedVariants: [...PREVIEW_VARIANTS] }
      );
    }

    const repository = this._repository({ allowUnavailable: !id.startsWith('custom:') });
    const show = this._repositoryError()
      ? repository.getBuiltIn(id)
      : repository.get(id);
    if (!show.builtIn) this._assertExpectedRevision(show, body.expectedRevision);

    const config = typeof this.getConfig === 'function' ? this.getConfig() || {} : {};
    const hasIntensity = Object.prototype.hasOwnProperty.call(body, 'intensity');
    if (hasIntensity && (typeof body.intensity !== 'number' || !Number.isFinite(body.intensity))) {
      throw new ShowRepositoryError(
        'INVALID_PREVIEW_INTENSITY',
        400,
        'intensity must be a finite number when provided.',
        { receivedType: typeof body.intensity }
      );
    }
    const intensityInput = hasIntensity ? body.intensity : config.goalFinaleIntensity;
    const intensityNumber = Number(intensityInput);
    const intensity = Number.isFinite(intensityNumber)
      ? Math.min(10, Math.max(1, intensityNumber))
      : 3;
    const seedNumber = Number(body.seed);
    const seed = Number.isFinite(seedNumber)
      ? (Math.trunc(seedNumber) >>> 0)
      : (Math.floor(Math.random() * 0x100000000) >>> 0);
    const requestId = String(this.createPreviewRequestId());
    const planOptions = {
      id: requestId,
      style: id,
      length: body.variant,
      orientation: config.orientation,
      intensity,
      seed
    };
    let sourcePlan;
    try {
      sourcePlan = show.builtIn
        ? this.finaleShowPlanner.plan(planOptions)
        : this.finaleShowPlanner.planDefinition(show.definition, planOptions);
    } catch (error) {
      if (error?.code !== 'PYRODSL_VALIDATION_FAILED') throw error;
      throw new ShowRepositoryError(
        'PREVIEW_DRAFT_INVALID',
        422,
        'The current custom show draft cannot be previewed.',
        { id, currentRevision: show.revision, errors: error.errors || [] }
      );
    }
    const showPlan = createShowPreviewPlan(sourcePlan, {
      scope: body.scope,
      cueIndex: body.cueIndex,
      phase: body.phase
    });

    const renderer = typeof this.getPreviewRendererStatus === 'function'
      ? this.getPreviewRendererStatus()
      : { freshRendererCount: 0, readyRendererCount: 0, busyRendererCount: 0 };
    if (renderer && renderer.busyRendererCount > 0) {
      throw new ShowRepositoryError(
        'FINALE_BUSY',
        409,
        'A finale is active or queued on a WebGPU renderer.',
        {
          readyRendererCount: renderer.readyRendererCount,
          busyRendererCount: renderer.busyRendererCount
        }
      );
    }
    if (!renderer || renderer.readyRendererCount < 1) {
      throw new ShowRepositoryError(
        'RENDERER_NOT_READY',
        503,
        'A fresh ready WebGPU renderer is required for preview.',
        {
          freshRendererCount: renderer?.freshRendererCount || 0,
          readyRendererCount: renderer?.readyRendererCount || 0
        }
      );
    }

    const metadata = JSON.parse(JSON.stringify(show.definition?.metadata || {}));
    const payload = {
      accepted: true,
      id: requestId,
      requestId,
      eventId: requestId,
      type: 'preview',
      preview: {
        scope: body.scope,
        cueIndex: body.scope === 'cue' ? body.cueIndex : null,
        phase: body.scope === 'phase' ? body.phase : null,
        sourceId: id,
        sourceRevision: show.revision,
        builtIn: show.builtIn === true,
        metadata
      },
      scope: body.scope,
      cueIndex: body.scope === 'cue' ? body.cueIndex : null,
      phase: body.scope === 'phase' ? body.phase : null,
      sourceId: id,
      sourceRevision: show.revision,
      builtIn: show.builtIn === true,
      metadata,
      style: id,
      variant: body.variant,
      length: body.variant,
      intensity,
      seed,
      materialProfile: showPlan.materialProfile,
      duration: showPlan.durationMs,
      durationMs: showPlan.durationMs,
      timestamp: Date.now(),
      showPlan,
      visualStyle: config.visualStyle,
      playSound: config.audioEnabled === true,
      audioVolume: config.audioVolume,
      audioMuted: config.audioEnabled !== true,
      audioMasterVolume: config.audioVolume,
      audio: {
        muted: config.audioEnabled !== true,
        masterVolume: config.audioVolume
      },
      rocketSound: config.rocketSound,
      explosionSound: config.explosionSound
    };
    const snapshot = deepFreeze(JSON.parse(JSON.stringify(payload)));
    if (typeof this.emitPreview === 'function') this.emitPreview(snapshot);
    return res.json({
      success: true,
      id: requestId,
      requestId,
      duration: snapshot.duration,
      durationMs: snapshot.durationMs,
      scope: snapshot.scope,
      sourceId: snapshot.sourceId,
      sourceRevision: snapshot.sourceRevision
    });
  }

  archive(req, res) {
    const id = this._routeId(req.params.id);
    const repository = this._repository();
    const show = repository.archive(id, req.body?.expectedRevision);
    return res.json({ success: true, show });
  }

  restore(req, res) {
    const id = this._routeId(req.params.id);
    const repository = this._repository();
    const show = repository.restore(id, req.body?.expectedRevision);
    return res.json({ success: true, show });
  }

  _assertExpectedRevision(show, expectedRevision) {
    if (!Number.isInteger(expectedRevision)) {
      throw new ShowRepositoryError(
        'EXPECTED_REVISION_REQUIRED',
        400,
        'expectedRevision must be an integer.',
        { id: show.id, currentRevision: show.revision }
      );
    }
    if (expectedRevision !== show.revision) {
      throw new ShowRepositoryError(
        'REVISION_CONFLICT',
        409,
        'The custom show draft was changed by another writer.',
        { id: show.id, expectedRevision, currentRevision: show.revision }
      );
    }
  }

  _summary(show) {
    const definition = show.definition || {};
    const metadata = definition.metadata || {};
    return {
      id: show.id,
      name: metadata.name || '',
      description: metadata.description || '',
      materialProfile: definition.materialProfile || null,
      autoEligible: definition.autoEligible === true,
      builtIn: show.builtIn === true,
      revision: show.revision,
      validatedRevision: show.builtIn ? 0 : (show.validatedRevision ?? null),
      publishedRevision: show.builtIn ? 0 : (show.publishedRevision ?? null),
      archived: show.archived === true,
      updatedAt: show.updatedAt ?? null
    };
  }

  _selectorSummary(show) {
    const definition = show.definition || {};
    const metadata = definition.metadata || {};
    return {
      id: show.id,
      name: metadata.name || '',
      description: metadata.description || '',
      materialProfile: definition.materialProfile || null,
      autoEligible: definition.autoEligible === true,
      builtIn: show.builtIn === true
    };
  }

  _routeId(input) {
    if (typeof input !== 'string' || input !== input.trim()) {
      throw this._invalidIdError();
    }
    const custom = input.match(CUSTOM_ID_PATTERN);
    if (custom) return `custom:${custom[1].toLowerCase()}`;
    if (/^custom:/i.test(input) || !BUILT_IN_ID_PATTERN.test(input)) {
      throw this._invalidIdError();
    }
    return input;
  }

  _invalidIdError() {
    return new ShowRepositoryError(
      'INVALID_SHOW_ID',
      400,
      'Show ID must be a built-in ID or custom:<uuid>.',
      {}
    );
  }

  _repositoryError() {
    return typeof this.getRepositoryError === 'function'
      ? this.getRepositoryError()
      : null;
  }

  _repository(options = {}) {
    const repository = typeof this.getRepository === 'function'
      ? this.getRepository()
      : null;
    if (!repository || (this._repositoryError() && options.allowUnavailable !== true)) {
      throw new ShowRepositoryError(
        'REPOSITORY_UNAVAILABLE',
        503,
        'The custom show repository is unavailable.',
        {}
      );
    }
    return repository;
  }

  _handle(handler, req, res) {
    try {
      return handler(req, res);
    } catch (error) {
      const typed = (error instanceof ShowRepositoryError || error instanceof ShowPreviewPlanError)
        && Number.isInteger(error.status)
        && typeof error.code === 'string';
      const status = typed ? error.status : 500;
      const code = typed ? error.code : 'INTERNAL_ERROR';
      const message = typed ? error.message : 'The show request could not be completed.';
      const storageError = code.startsWith('STORE_') || code === 'REPOSITORY_UNAVAILABLE';
      const details = !storageError && error?.details && typeof error.details === 'object'
        ? error.details
        : {};
      if (code === 'INTERNAL_ERROR') this.log('Show API request failed.', 'error');
      return res.status(status).json({ success: false, error: message, code, details });
    }
  }
}

module.exports = { ShowApiController };
