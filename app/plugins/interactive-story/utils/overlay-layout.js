'use strict';

const ELEMENT_IDS = Object.freeze([
  'title',
  'content',
  'voting',
  'generating',
  'results',
  'participants'
]);

const DEFAULT_VIEWPORT = Object.freeze({ width: 1920, height: 1080 });

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function getViewport(viewport) {
  const width = Number(viewport?.width);
  const height = Number(viewport?.height);
  return {
    width: Number.isFinite(width) && width > 0 ? width : DEFAULT_VIEWPORT.width,
    height: Number.isFinite(height) && height > 0 ? height : DEFAULT_VIEWPORT.height
  };
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isValidLayout(payload) {
  if (!isPlainObject(payload) || payload.version !== 2 || !isPlainObject(payload.positions)) return false;

  return Object.entries(payload.positions).every(([elementId, position]) => (
    ELEMENT_IDS.includes(elementId) &&
    isPlainObject(position) &&
    Number.isFinite(position.x) &&
    Number.isFinite(position.y) &&
    position.x >= 0 && position.x <= 1 &&
    position.y >= 0 && position.y <= 1
  ));
}

function migrateLegacyPixels(payload, viewport) {
  const safeViewport = getViewport(viewport);
  const positions = isPlainObject(payload?.positions) ? payload.positions : {};
  const migrated = {};

  for (const elementId of ELEMENT_IDS) {
    const position = positions[elementId];
    if (!isPlainObject(position)) continue;
    const left = Number(position.left ?? position.x);
    const top = Number(position.top ?? position.y);
    if (!Number.isFinite(left) || !Number.isFinite(top)) continue;
    migrated[elementId] = {
      x: clamp(left / safeViewport.width),
      y: clamp(top / safeViewport.height)
    };
  }

  return { version: 2, positions: migrated };
}

function normalizeLayout(payload, viewport) {
  if (!isPlainObject(payload)) return resetLayout();
  if (payload.version !== 2) return migrateLegacyPixels(payload, viewport);

  const positions = isPlainObject(payload.positions) ? payload.positions : {};
  const normalized = {};
  for (const elementId of ELEMENT_IDS) {
    const position = positions[elementId];
    if (!isPlainObject(position) || !Number.isFinite(position.x) || !Number.isFinite(position.y)) continue;
    normalized[elementId] = {
      x: clamp(position.x),
      y: clamp(position.y)
    };
  }
  return { version: 2, positions: normalized };
}

function applyLayout(elementMap, layout, viewport) {
  const normalized = normalizeLayout(layout, viewport);
  for (const [elementId, position] of Object.entries(normalized.positions)) {
    const element = elementMap?.[elementId];
    if (!element?.style) continue;
    element.style.position = 'fixed';
    element.style.left = `${position.x * 100}%`;
    element.style.top = `${position.y * 100}%`;
    element.style.transform = 'none';
  }
}

function resetLayout() {
  return { version: 2, positions: {} };
}

module.exports = {
  DEFAULT_VIEWPORT,
  ELEMENT_IDS,
  applyLayout,
  isValidLayout,
  migrateLegacyPixels,
  normalizeLayout,
  resetLayout
};
