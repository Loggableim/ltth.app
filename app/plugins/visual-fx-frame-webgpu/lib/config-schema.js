const { VISUAL_FX_DEFAULT_CONFIG } = require('../default-config');

const VISUAL_STYLES = Object.freeze(['realistic', 'neon', 'hybrid']);
const EFFECT_TYPES = Object.freeze(['flames', 'particles', 'energy', 'lightning']);
const QUALITY_MODES = Object.freeze(['low-load', 'obs-safe', 'max-quality']);
const FRAME_MODES = Object.freeze(['bottom', 'top', 'sides', 'all']);

const DEFAULT_WEBGPU_CONFIG = VISUAL_FX_DEFAULT_CONFIG;

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function allowed(value, values, fallback) {
  return values.includes(value) ? value : fallback;
}

function normalizeFramePositions(value) {
  if (!Array.isArray(value) || value.length === 0) return clone(DEFAULT_WEBGPU_CONFIG.framePositions);
  return value.slice(0, 8).map(rect => ({
    x: Math.min(100, Math.max(0, Number(rect?.x) || 0)),
    y: Math.min(100, Math.max(0, Number(rect?.y) || 0)),
    width: Math.min(100, Math.max(1, Number(rect?.width) || 100)),
    height: Math.min(100, Math.max(1, Number(rect?.height) || 100))
  }));
}

function normalizeConfig(source = {}) {
  const result = {};
  for (const [key, fallback] of Object.entries(DEFAULT_WEBGPU_CONFIG)) {
    result[key] = Object.prototype.hasOwnProperty.call(source, key) ? clone(source[key]) : clone(fallback);
  }
  result.renderer = 'webgpu';
  result.visualStyle = allowed(source.visualStyle, VISUAL_STYLES, DEFAULT_WEBGPU_CONFIG.visualStyle);
  result.effectType = allowed(source.effectType, EFFECT_TYPES, DEFAULT_WEBGPU_CONFIG.effectType);
  result.qualityMode = allowed(source.qualityMode, QUALITY_MODES, DEFAULT_WEBGPU_CONFIG.qualityMode);
  result.frameMode = allowed(source.frameMode, FRAME_MODES, DEFAULT_WEBGPU_CONFIG.frameMode);
  result.framePositions = normalizeFramePositions(source.framePositions);
  result.visualProfileVersion = 4;
  return result;
}

function normalizeImportedFlameConfig(source = {}) {
  const result = normalizeConfig(source);
  if (typeof source.triggersEnabled === 'boolean') result.triggersEnabled = source.triggersEnabled;
  if (typeof source.chatColorCommands === 'boolean') result.chatColorCommands = source.chatColorCommands;
  if (Array.isArray(source.triggerRules)) result.triggerRules = clone(source.triggerRules.slice(0, 200));
  if (['default', 'hype', 'chill', 'party', 'custom'].includes(source.triggerPreset)) {
    result.triggerPreset = source.triggerPreset;
  }
  if (Number.isFinite(Number(source.triggerCooldown))) {
    result.triggerCooldown = Math.round(Math.min(600000, Math.max(0, Number(source.triggerCooldown))));
  }
  if (Number.isFinite(Number(source.triggerMaxStack))) {
    result.triggerMaxStack = Math.round(Math.min(50, Math.max(1, Number(source.triggerMaxStack))));
  }
  return result;
}

module.exports = {
  DEFAULT_WEBGPU_CONFIG,
  EFFECT_TYPES,
  FRAME_MODES,
  QUALITY_MODES,
  VISUAL_STYLES,
  normalizeConfig,
  normalizeImportedFlameConfig
};
