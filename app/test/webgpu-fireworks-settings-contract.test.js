'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const {
  CONFIG_ENUMS,
  CONFIG_LIMITS,
  normalizeConfig
} = require('../plugins/webgpu-fireworks/lib/config-schema');
const SettingsContract = require('../plugins/webgpu-fireworks/ui/settings-contract');

const pluginRoot = path.join(__dirname, '..', 'plugins', 'webgpu-fireworks');
const html = fs.readFileSync(path.join(pluginRoot, 'ui', 'settings.html'), 'utf8');

test('exports one complete numeric control contract', () => {
  expect(CONFIG_LIMITS).toEqual(expect.objectContaining({
    maxParticles: { min: 200, max: 3000, step: 1, uiScale: 1 },
    maxTotalParticles: { min: 512, max: 16384, step: 1, uiScale: 1 },
    targetFps: { min: 24, max: 120, step: 1, uiScale: 1 },
    minFps: { min: 15, max: 60, step: 1, uiScale: 1 },
    minTargetFps: { min: 20, max: 50, step: 1, uiScale: 1 }
  }));
});

test('covers every range and select in the shipped settings document', () => {
  const document = new JSDOM(html).window.document;
  const rangeIds = [...document.querySelectorAll('input[type="range"]')].map(node => node.id).sort();
  const selectIds = [...document.querySelectorAll('select[id]')].map(node => node.id).sort();
  expect(rangeIds).toHaveLength(23);
  expect(selectIds).toHaveLength(20);
  expect(Object.keys(SettingsContract.RANGE_CONTROLS).sort()).toEqual(rangeIds);
  expect(Object.keys(SettingsContract.ENUM_CONTROLS).sort()).toEqual(selectIds);
  SettingsContract.applyConfigContracts(document, { limits: CONFIG_LIMITS, enums: CONFIG_ENUMS });
  for (const [id, field] of Object.entries(SettingsContract.RANGE_CONTROLS)) {
    const input = document.getElementById(id);
    const { min, max, step, uiScale } = CONFIG_LIMITS[field];
    expect(Number(input.min)).toBe(min * uiScale);
    expect(Number(input.max)).toBe(max * uiScale);
    expect(Number(input.step)).toBe(step * uiScale);
    expect(input.disabled).toBe(false);
  }
  for (const [id, descriptor] of Object.entries(SettingsContract.ENUM_CONTROLS)) {
    const contract = CONFIG_ENUMS[descriptor.contract];
    const dynamicPattern = contract.dynamicPattern
      ? new RegExp(contract.dynamicPattern, contract.dynamicFlags || '')
      : null;
    const values = [...document.getElementById(id).options].map(option => option.value);
    expect(values.filter(value => !dynamicPattern?.test(value))).toEqual(contract.values);
    expect(values.every(value => contract.values.includes(value) || dynamicPattern?.test(value))).toBe(true);
    expect(document.getElementById(id).disabled).toBe(false);
  }
});

test.each([
  ['maxParticles', 200],
  ['maxParticles', 3000],
  ['maxTotalParticles', 512],
  ['maxTotalParticles', 8192],
  ['maxTotalParticles', 10000],
  ['maxTotalParticles', 16384],
  ['targetFps', 24],
  ['targetFps', 120],
  ['minFps', 15],
  ['minFps', 60],
  ['minTargetFps', 20],
  ['minTargetFps', 50],
  ['superfanFinaleIntensity', 1],
  ['superfanFinaleIntensity', 10],
  ['superfanEndCardDuration', 1000],
  ['superfanEndCardDuration', 10000],
  ['superfanEndCardScale', 0.5],
  ['superfanEndCardScale', 2]
])('round-trips %s=%i through schema and its real range input', (field, value) => {
  const document = new JSDOM(html).window.document;
  SettingsContract.applyConfigContracts(document, { limits: CONFIG_LIMITS, enums: CONFIG_ENUMS });
  SettingsContract.writeNumericConfig(document, { targetFps: 120, [field]: value });
  expect(SettingsContract.readNumericConfig(document)[field]).toBe(value);
  expect(normalizeConfig({ targetFps: 120, [field]: value })[field]).toBe(value);
});

test('round-trips both backend boundaries for every shipped range control', () => {
  const document = new JSDOM(html).window.document;
  SettingsContract.applyConfigContracts(document, { limits: CONFIG_LIMITS, enums: CONFIG_ENUMS });
  for (const field of Object.values(SettingsContract.RANGE_CONTROLS)) {
    const limits = CONFIG_LIMITS[field];
    for (const value of [limits.min, limits.max]) {
      SettingsContract.writeNumericConfig(document, { targetFps: 120, [field]: value });
      expect(SettingsContract.readNumericConfig(document)[field]).toBe(value);
      expect(normalizeConfig({ targetFps: 120, [field]: value })[field]).toBe(value);
    }
  }
});

test('keeps relational FPS controls coherent without inventing browser bounds', () => {
  const document = new JSDOM(html).window.document;
  SettingsContract.applyConfigContracts(document, { limits: CONFIG_LIMITS, enums: CONFIG_ENUMS });
  SettingsContract.writeNumericConfig(document, { targetFps: 24, minFps: 60, minTargetFps: 50 });
  SettingsContract.reconcileFpsControls(document);
  expect(SettingsContract.readNumericConfig(document)).toMatchObject({
    targetFps: 24,
    minFps: 24,
    minTargetFps: 24
  });
});

test('fails closed when either contract is absent or a select contains an invalid value', () => {
  const document = new JSDOM(html).window.document;
  expect(() => SettingsContract.applyConfigContracts(document, { limits: CONFIG_LIMITS }))
    .toThrow(/enum/i);
  expect([...document.querySelectorAll('input[type="range"], select[id]')].every(node => node.disabled))
    .toBe(true);

  document.getElementById('superfan-finale-style').appendChild(
    Object.assign(document.createElement('option'), { value: 'custom:not-a-uuid' })
  );
  expect(() => SettingsContract.applyConfigContracts(document, { limits: CONFIG_LIMITS, enums: CONFIG_ENUMS }))
    .toThrow(/superfan-finale-style/i);
  expect(document.getElementById('superfan-finale-style').disabled).toBe(true);
});
