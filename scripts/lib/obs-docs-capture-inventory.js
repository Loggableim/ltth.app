'use strict';

const { buildGuides } = require('../plugin-tutorial-source');
const { TEMPORARY_SOURCE_NAME, TUTORIAL_SCENE_NAME } = require('./obs-docs-capture-session');

const OBS_DOCS_CAPTURE_LOCALES = Object.freeze(['de', 'en', 'es', 'fr']);
const EXPECTED_OVERLAY_GUIDE_COUNT = 25;

// Each entry is an explicit Browser Source target, rather than a hidden
// fallback in the runner. This is the capture resolution declared for the
// corresponding shipped overlay workflow.
const OBS_OVERLAY_DIMENSIONS = Object.freeze({
  'advanced-timer': { width: 1280, height: 720 },
  chatango: { width: 1280, height: 720 },
  clarityhud: { width: 1280, height: 720 },
  coinbattle: { width: 1280, height: 720 },
  'emoji-rain': { width: 1280, height: 720 },
  fireworks: { width: 1280, height: 720 },
  openshock: { width: 1280, height: 720 },
  'interactive-story': { width: 1280, height: 720 },
  goals: { width: 1280, height: 720 },
  'game-engine': { width: 1280, height: 720 },
  'minecraft-connect': { width: 1280, height: 720 },
  'music-bot': { width: 1280, height: 720 },
  'quiz-show': { width: 1280, height: 720 },
  schnorrbecher: { width: 1280, height: 720 },
  spotlight: { width: 1280, height: 720 },
  streamalchemy: { width: 1280, height: 720 },
  'stt-ticker': { width: 1280, height: 720 },
  'talking-heads': { width: 1280, height: 720 },
  toptier: { width: 1280, height: 720 },
  'milestone-leaderboard': { width: 1280, height: 720 },
  'flame-overlay': { width: 1280, height: 720 },
  'visual-fx-frame-webgpu': { width: 1280, height: 720 },
  'weather-control': { width: 1280, height: 720 },
  'webgpu-emoji-rain': { width: 1280, height: 720 },
  'webgpu-fireworks': { width: 1280, height: 720 }
});

function localBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch (_) {
    throw new Error('OBS documentation capture base URL must be a localhost HTTP URL');
  }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error('OBS documentation capture base URL must be a localhost HTTP URL');
  }
  return url;
}

function localOverlayUrl(value) {
  const url = localBaseUrl(value);
  return url.toString();
}

function exactIds(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function buildObsCaptureInventory(repoRoot, { baseUrl }) {
  const localBase = localBaseUrl(baseUrl);
  const overlayGuides = buildGuides(repoRoot)
    .filter((guide) => typeof guide.overlay === 'string' && guide.overlay.startsWith('/'))
    .sort((left, right) => left.id.localeCompare(right.id));
  const guideIds = overlayGuides.map((guide) => guide.id);
  const declaredIds = Object.keys(OBS_OVERLAY_DIMENSIONS).sort();

  if (guideIds.length !== EXPECTED_OVERLAY_GUIDE_COUNT) {
    throw new Error(`Expected ${EXPECTED_OVERLAY_GUIDE_COUNT} overlay guides, found ${guideIds.length}`);
  }
  if (!exactIds(guideIds, declaredIds)) {
    const missing = guideIds.filter((id) => !declaredIds.includes(id));
    const stale = declaredIds.filter((id) => !guideIds.includes(id));
    throw new Error(`OBS overlay capture inventory mismatch. Missing: ${missing.join(', ') || 'none'}; stale: ${stale.join(', ') || 'none'}`);
  }

  return overlayGuides.flatMap((guide) => {
    const dimensions = OBS_OVERLAY_DIMENSIONS[guide.id];
    return OBS_DOCS_CAPTURE_LOCALES.map((locale) => {
      const overlayUrl = new URL(guide.overlay, localBase);
      overlayUrl.searchParams.set('lang', locale);
      return {
        plugin: guide.id,
        locale,
        sceneName: TUTORIAL_SCENE_NAME,
        sourceName: TEMPORARY_SOURCE_NAME,
        overlayPath: guide.overlay,
        overlayUrl: localOverlayUrl(overlayUrl.toString()),
        width: dimensions.width,
        height: dimensions.height
      };
    });
  });
}

module.exports = {
  OBS_DOCS_CAPTURE_LOCALES,
  EXPECTED_OVERLAY_GUIDE_COUNT,
  OBS_OVERLAY_DIMENSIONS,
  localOverlayUrl,
  buildObsCaptureInventory
};
