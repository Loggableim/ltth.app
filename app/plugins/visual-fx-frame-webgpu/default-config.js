/**
 * Shared Visual FX Frame WEBGPU defaults.
 *
 * This file runs in both CommonJS (plugin backend) and the browser renderer.
 * Keep trigger defaults in main.js because they depend on the trigger preset
 * registry; all visual defaults live here so the UI and renderer cannot drift.
 */
const VISUAL_FX_DEFAULT_CONFIG = Object.freeze({
  renderer: 'webgpu',
  visualStyle: 'hybrid',
  effectType: 'flames',
  qualityMode: 'obs-safe',
  resolutionPreset: 'tiktok-portrait',
  customWidth: 720,
  customHeight: 1280,
  frameMode: 'bottom',
  frameThickness: 150,
  framePositions: [{ x: 0, y: 0, width: 100, height: 100 }],
  flameColor: '#ff6600',
  backgroundTint: '#000000',
  backgroundTintOpacity: 0,
  flameSpeed: 0.5,
  flameIntensity: 1.3,
  flameBrightness: 0.38,
  enableGlow: true,
  enableAdditiveBlend: true,
  maskOnlyEdges: true,
  highDPI: true,
  noiseOctaves: 9,
  useHighQualityTextures: true,
  detailScaleAuto: true,
  edgeFeather: 0.46,
  frameCurve: 0.1,
  frameNoiseAmount: 0.12,
  animationEasing: 'linear',
  pulseEnabled: false,
  pulseAmount: 0.16,
  pulseSpeed: 1,
  bloomEnabled: true,
  bloomIntensity: 0.78,
  bloomThreshold: 0.58,
  bloomRadius: 4,
  layersEnabled: true,
  layerCount: 2,
  layerParallax: 0.18,
  chromaticAberration: 0.004,
  filmGrain: 0.015,
  depthIntensity: 0.66,
  cinematicContrast: 1.12,
  coreWhiteness: 0.66,
  emberTrailAmount: 0.28,
  sparkEnabled: true,
  sparkDensity: 0.52,
  heatDistortionEnabled: true,
  heatDistortionStrength: 0.24,
  smokeEnabled: false,
  smokeIntensity: 0.18,
  smokeSpeed: 0.22,
  smokeColor: '#2d2623',
  visualProfileVersion: 4
});

if (typeof window !== 'undefined') {
  window.VISUAL_FX_DEFAULT_CONFIG = VISUAL_FX_DEFAULT_CONFIG;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { VISUAL_FX_DEFAULT_CONFIG };
}
