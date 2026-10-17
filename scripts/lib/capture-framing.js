'use strict';

function screenshotClipForAnchor(viewport, anchorRect, crop = null) {
  const requestedWidth = crop?.width || 640;
  const requestedHeight = crop?.height || 560;
  const width = Math.min(viewport.clientWidth, requestedWidth);
  const height = Math.min(viewport.height, requestedHeight);
  // Screenshot clip coordinates are relative to the current viewport. The
  // anchor rect already uses viewport coordinates; adding scroll offsets here
  // moves the crop outside the image area after scrollIntoView().
  const anchorCenterX = anchorRect.left + (anchorRect.width / 2);
  const anchorCenterY = anchorRect.top + (anchorRect.height / 2);
  const maxX = Math.max(0, viewport.clientWidth - width);
  const maxY = Math.max(0, viewport.height - height);
  return {
    x: Math.round(Math.max(0, Math.min(anchorCenterX - (width / 2), maxX))),
    y: Math.round(Math.max(0, Math.min(anchorCenterY - (height / 2), maxY))),
    width,
    height
  };
}

module.exports = { screenshotClipForAnchor };
