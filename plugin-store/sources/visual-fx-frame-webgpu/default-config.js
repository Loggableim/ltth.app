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
  visualVariant: 'custom',
  effectType: 'flames',
  qualityMode: 'obs-safe',
  resolutionPreset: 'tiktok-portrait',
  customWidth: 720,
  customHeight: 1280,
  frameMode: 'bottom',
  frameStyle: 'classic',
  frameThickness: 150,
  frameGap: 10,
  segmentCount: 18,
  designControls: {
    'solar-forge': { emberFlow: 0.72, moltenCrust: 0.64 },
    'prism-reactor': { refraction: 0.68, sweepSpeed: 0.55 },
    'arcane-bloom': { runeDensity: 0.62, orbitSpeed: 0.5 },
    'tempest-rift': { arcCount: 0.58, riftTurbulence: 0.6 },
    'quantum-circuit': { traceDensity: 0.6, hudSweep: 0.5 }
  },
  framePositions: [{ x: 0, y: 0, width: 100, height: 100 }],
  flameColor: '#ff6600',
  secondaryColor: '#ffd36a',
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
  pulsePattern: 'breathe',
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
  visualProfileVersion: 6
});

if (typeof window !== 'undefined') {
  window.VISUAL_FX_DEFAULT_CONFIG = VISUAL_FX_DEFAULT_CONFIG;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { VISUAL_FX_DEFAULT_CONFIG };
}
