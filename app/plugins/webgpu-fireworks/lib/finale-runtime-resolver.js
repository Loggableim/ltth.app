'use strict';

function resolveFinaleSelection(options = {}) {
  const {
    requestedStyle,
    configuredStyle,
    builtInStyles,
    isCustomStyle,
    drawAuto,
    loadCustom,
    warnUnavailable
  } = options;

  const builtIns = Array.isArray(builtInStyles) ? builtInStyles : [];
  const builtInFallback = builtIns[0];
  const resolveCustom = style => {
    try {
      return { style, definition: loadCustom(style) };
    } catch (error) {
      warnUnavailable(style, error);
      return null;
    }
  };
  const resolveAuto = () => {
    const drawnStyle = drawAuto();
    if (builtIns.includes(drawnStyle)) return { style: drawnStyle, definition: null };
    if (isCustomStyle(drawnStyle)) {
      const custom = resolveCustom(drawnStyle);
      if (custom) return custom;
    }
    return { style: builtInFallback, definition: null };
  };

  if (requestedStyle === 'auto') return resolveAuto();
  if (builtIns.includes(requestedStyle)) return { style: requestedStyle, definition: null };
  if (!isCustomStyle(requestedStyle)) return resolveAuto();

  const requestedCustom = resolveCustom(requestedStyle);
  if (requestedCustom) return requestedCustom;
  if (configuredStyle === requestedStyle) return resolveAuto();
  if (builtIns.includes(configuredStyle)) return { style: configuredStyle, definition: null };
  if (isCustomStyle(configuredStyle)) {
    const configuredCustom = resolveCustom(configuredStyle);
    if (configuredCustom) return configuredCustom;
  }
  return resolveAuto();
}

module.exports = { resolveFinaleSelection };
