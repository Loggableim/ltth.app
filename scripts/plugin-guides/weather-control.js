'use strict';

// Canonical guide facts for this plugin. Step wording and captures are
// assembled by the shared documentation renderer.
module.exports = Object.freeze({
  id: 'weather-control',
  route: '/plugins/weather-control/ui.html',
  topic: ['Wettereffect, Intensität und Lebenszyklus', 'weather effect, intensity, and lifecycle', 'efecto meteorológico, intensidad y ciclo de vida', 'effet météo, intensité et cycle de vie'],
  test: ['einen lokalen Wetterimpuls', 'a local weather pulse', 'un impulso meteorológico local', 'une impulsion météo locale'],
  expected: ['der Effekt startet und endet in der Vorschau ohne LIVE-Szene', 'the effect starts and ends in preview without a LIVE scene', 'el efecto inicia y termina en la vista previa sin escena LIVE', 'l’effet commence et finit dans l’aperçu sans scène LIVE'],
  options: { requirement: 'obs', safety: 'obs', overlay: '/plugins/weather-control/overlay.html', related: ['webgpu-fireworks', 'emoji-rain'] }
});
