(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.StreamMonstersPortraitArena = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const ARENA_VARIANTS = Object.freeze(['split-arena', 'classic']);
  const PORTRAIT_GEOMETRY = Object.freeze({
    arena: Object.freeze({
      left: 0.02,
      top: 0.118,
      right: 0.98,
      bottom: 0.578
    }),
    likebar: Object.freeze({
      left: 0.02,
      top: 0.578,
      right: 0.98,
      bottom: 0.74
    }),
    exception: Object.freeze({
      left: 0.03,
      top: 0.74,
      right: 0.97,
      bottom: 0.98
    })
  });

  function normalizeVariant(value, fallback = 'classic') {
    if (ARENA_VARIANTS.includes(value)) return value;
    return ARENA_VARIANTS.includes(fallback) ? fallback : 'classic';
  }

  function viewportZones(width, height) {
    const viewportWidth = Number(width);
    const viewportHeight = Number(height);
    return Object.fromEntries(
      Object.entries(PORTRAIT_GEOMETRY).map(([name, zone]) => {
        const left = zone.left * viewportWidth;
        const top = zone.top * viewportHeight;
        const right = zone.right * viewportWidth;
        const bottom = zone.bottom * viewportHeight;
        return [name, {
          left,
          top,
          right,
          bottom,
          width: right - left,
          height: bottom - top
        }];
      })
    );
  }

  function hasProperty(value, key) {
    return value != null && key in Object(value);
  }

  function dimensionsAgree(explicit, derived) {
    const scale = Math.max(1, Math.abs(explicit), Math.abs(derived));
    return Math.abs(explicit - derived) <= 1e-9 * scale;
  }

  function resolveAxis(rect, startKey, endKey, dimensionKey) {
    const start = Number(rect?.[startKey]);
    const hasEnd = hasProperty(rect, endKey);
    const hasDimension = hasProperty(rect, dimensionKey);
    const end = hasEnd ? Number(rect[endKey]) : null;
    const explicitDimension = hasDimension
      ? Number(rect[dimensionKey])
      : null;
    if (
      !Number.isFinite(start) ||
      (!hasEnd && !hasDimension) ||
      (hasEnd && (!Number.isFinite(end) || end <= start)) ||
      (
        hasDimension &&
        (!Number.isFinite(explicitDimension) || explicitDimension <= 0)
      )
    ) {
      return null;
    }
    const derivedDimension = hasEnd ? end - start : null;
    if (
      hasEnd &&
      hasDimension &&
      !dimensionsAgree(explicitDimension, derivedDimension)
    ) {
      return null;
    }
    return {
      start,
      dimension: hasDimension ? explicitDimension : derivedDimension
    };
  }

  function normalizedRectCenter(rect, containerRect) {
    const horizontal = resolveAxis(rect, 'left', 'right', 'width');
    const vertical = resolveAxis(rect, 'top', 'bottom', 'height');
    const containerHorizontal = resolveAxis(
      containerRect,
      'left',
      'right',
      'width'
    );
    const containerVertical = resolveAxis(
      containerRect,
      'top',
      'bottom',
      'height'
    );
    if (!horizontal || !vertical || !containerHorizontal || !containerVertical) {
      return null;
    }
    const clamp = value => Math.max(0, Math.min(1, value));
    return {
      x: clamp((
        horizontal.start +
        horizontal.dimension / 2 -
        containerHorizontal.start
      ) / containerHorizontal.dimension),
      y: clamp((
        vertical.start +
        vertical.dimension / 2 -
        containerVertical.start
      ) / containerVertical.dimension)
    };
  }

  return Object.freeze({
    ARENA_VARIANTS,
    PORTRAIT_GEOMETRY,
    normalizeVariant,
    viewportZones,
    normalizedRectCenter
  });
}));
