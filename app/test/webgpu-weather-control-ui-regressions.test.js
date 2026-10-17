'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'webgpu-weather-control', 'ui.html'), 'utf8');
const document = new JSDOM(source).window.document;

test('effect intensity ranges preserve hundredths and render two decimal places', () => {
  const sliders = [...document.querySelectorAll('input[type="range"][id*="intensity"]')];
  expect(sliders.length).toBeGreaterThan(10);
  expect(sliders.every(slider => slider.step === '0.01')).toBe(true);
  expect(source).toContain('effectConfig.defaultIntensity.toFixed(2)');
  expect(source).toContain('mapping.intensity.toFixed(2)');
});

test('fog preset color is applied by the common config field adapter', () => {
  expect(source).toContain("fogColor: effect === 'fog' ? 'effect-fog-color' : null");
  expect(document.getElementById('effect-fog-color')).not.toBeNull();
});

test('active weather types from overlay diagnostics populate the active list', () => {
  expect(source).toContain("if (Array.isArray(metrics.effects)) renderActiveEffects(metrics.effects);");
  expect(source).toContain(".map(effect => typeof effect === 'string' ? { type: effect } : effect)");
});

test('German fallback labels retain UTF-8 umlauts and punctuation', () => {
  expect(source).toContain("'header.back': 'Zurück zum Dashboard'");
  expect(source).toContain("'stats.events': 'Ausgelöste Events'");
  expect(source).toContain("'effects.intensity': 'Intensität'");
  expect(source).toContain('Low – 100 max particles');
});
