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

  function dimension(rect, start, end, size) {
    const explicit = Number(rect?.[size]);
    if (Number.isFinite(explicit)) return explicit;
    const startValue = Number(rect?.[start]);
    const endValue = Number(rect?.[end]);
    return endValue - startValue;
  }

  function invalidEnd(rect, key, start) {
    if (rect?.[key] == null) return false;
    const end = Number(rect[key]);
    return !Number.isFinite(end) || end <= start;
  }

  function normalizedRectCenter(rect, containerRect) {
    const left = Number(rect?.left);
    const top = Number(rect?.top);
    const width = dimension(rect, 'left', 'right', 'width');
    const height = dimension(rect, 'top', 'bottom', 'height');
    const containerLeft = Number(containerRect?.left);
    const containerTop = Number(containerRect?.top);
    const containerWidth = dimension(
      containerRect,
      'left',
      'right',
      'width'
    );
    const containerHeight = dimension(
      containerRect,
      'top',
      'bottom',
      'height'
    );
    if (
      ![
        left,
        top,
        width,
        height,
        containerLeft,
        containerTop,
        containerWidth,
        containerHeight
      ].every(Number.isFinite) ||
      width <= 0 ||
      height <= 0 ||
      containerWidth <= 0 ||
      containerHeight <= 0 ||
      invalidEnd(rect, 'right', left) ||
      invalidEnd(rect, 'bottom', top) ||
      invalidEnd(containerRect, 'right', containerLeft) ||
      invalidEnd(containerRect, 'bottom', containerTop)
    ) {
      return null;
    }
    const clamp = value => Math.max(0, Math.min(1, value));
    return {
      x: clamp((left + width / 2 - containerLeft) / containerWidth),
      y: clamp((top + height / 2 - containerTop) / containerHeight)
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
