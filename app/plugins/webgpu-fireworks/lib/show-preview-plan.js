'use strict';

const PREVIEW_LEAD_MS = 2000;
const PREVIEW_SCOPES = Object.freeze(['cue', 'phase', 'show']);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class ShowPreviewPlanError extends Error {
  constructor(code, message, details = {}, status = 400) {
    super(message);
    this.name = 'ShowPreviewPlanError';
    this.code = code;
    this.status = status;
    this.details = clone(details);
  }
}

function cueTailMs(cue) {
  if (!Number.isFinite(cue?.timeMs) || !Array.isArray(cue.shells) || cue.shells.length === 0) {
    throw new ShowPreviewPlanError(
      'INVALID_PREVIEW_PLAN',
      'The selected preview cue has no valid shells.',
      { cueId: cue?.id || null },
      422
    );
  }
  const tails = [];
  for (const shell of cue.shells) {
    if (!Array.isArray(shell?.layers) || shell.layers.length === 0) {
      throw new ShowPreviewPlanError(
        'INVALID_PREVIEW_PLAN',
        'The selected preview cue has a shell without valid layers.',
        { cueId: cue.id || null, shellId: shell?.id || null },
        422
      );
    }
    for (const layer of shell.layers) {
      if (!Number.isFinite(layer?.delayMs) || !Number.isFinite(layer?.lifetimeMs)) {
        throw new ShowPreviewPlanError(
          'INVALID_PREVIEW_PLAN',
          'The selected preview cue has an invalid layer tail.',
          { cueId: cue.id || null, shellId: shell.id || null, layerId: layer?.id || null },
          422
        );
      }
      tails.push(cue.timeMs + layer.delayMs + layer.lifetimeMs);
    }
  }
  return Math.max(...tails);
}

function createShowPreviewPlan(sourcePlan, options = {}) {
  const scope = options.scope;
  if (!PREVIEW_SCOPES.includes(scope)) {
    throw new ShowPreviewPlanError(
      'INVALID_PREVIEW_SCOPE',
      'scope must be cue, phase, or show.',
      { scope, supportedScopes: [...PREVIEW_SCOPES] }
    );
  }

  const plan = clone(sourcePlan);
  if (scope === 'show') return plan;

  let selected;
  if (scope === 'cue') {
    if (!Number.isInteger(options.cueIndex)
      || options.cueIndex < 0
      || options.cueIndex >= plan.cues.length) {
      throw new ShowPreviewPlanError(
        'INVALID_PREVIEW_CUE',
        'cueIndex must identify an existing cue.',
        { cueIndex: options.cueIndex, cueCount: plan.cues.length }
      );
    }
    selected = [plan.cues[options.cueIndex]];
  } else {
    if (typeof options.phase !== 'string' || options.phase !== options.phase.trim()) {
      throw new ShowPreviewPlanError(
        'INVALID_PREVIEW_PHASE',
        'phase must identify an existing phase.',
        { phase: options.phase }
      );
    }
    selected = plan.cues.filter(cue => cue.phase === options.phase);
    if (selected.length === 0) {
      throw new ShowPreviewPlanError(
        'INVALID_PREVIEW_PHASE',
        'phase must identify an existing phase.',
        { phase: options.phase }
      );
    }
  }

  const offsetMs = PREVIEW_LEAD_MS - selected[0].timeMs;
  plan.cues = selected.map(cue => ({
    ...cue,
    timeMs: cue.timeMs + offsetMs,
    beatAtMs: cue.timeMs + offsetMs
  }));
  plan.durationMs = Math.max(...plan.cues.map(cueTailMs));
  return plan;
}

module.exports = {
  PREVIEW_LEAD_MS,
  PREVIEW_SCOPES,
  ShowPreviewPlanError,
  createShowPreviewPlan
};
