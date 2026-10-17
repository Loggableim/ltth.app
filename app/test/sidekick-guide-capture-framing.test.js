'use strict';

const path = require('path');
const { screenshotClipForAnchor } = require('../../scripts/lib/capture-framing');
const { buildDocsSpec } = require('../../scripts/docs-screenshot-spec');

describe('Sidekick status guide capture framing', () => {
  test('fits the left status zone and right controls in the same real panel crop', () => {
    const spec = buildDocsSpec(path.resolve(__dirname, '../..'));
    const asset = spec.assets.find((entry) => entry.id === 'sidekick__status-view');
    const viewport = {
      scrollX: 0,
      scrollY: 0,
      scrollWidth: 1440,
      clientWidth: 1440,
      height: 900,
      scrollHeight: 900
    };
    // Measured from the unchanged shipped Sidekick panel and prior local receipt.
    const panel = { left: 20, top: 181, width: 1400, height: 584 };
    const leftStatusZone = { left: panel.left, right: panel.left + 360 };
    const rightControlsZone = { left: panel.left + 980, right: panel.left + panel.width };
    const crop = screenshotClipForAnchor(viewport, panel, asset.workflow.captureRule.imageCrop);

    expect(asset.workflow.captureRule.viewport).toEqual({ width: 1440, height: 900 });
    expect(asset.workflow.captureRule.imageCrop).toEqual({ width: 1400, height: 620 });
    expect(crop).toEqual({ x: 20, y: 163, width: 1400, height: 620 });
    expect(crop.x).toBeLessThanOrEqual(leftStatusZone.left);
    expect(crop.x + crop.width).toBeGreaterThanOrEqual(rightControlsZone.right);
    expect(crop.y).toBeLessThanOrEqual(panel.top);
    expect(crop.y + crop.height).toBeGreaterThanOrEqual(panel.top + panel.height);
    expect(crop.x + crop.width).toBeLessThanOrEqual(viewport.clientWidth);
    expect(crop.y + crop.height).toBeLessThanOrEqual(viewport.height);
  });

  test('describes only avatar and LIVE connection avoidance in all guide locales', () => {
    const guide = require('../../scripts/plugin-guides/sidekick');
    const step = guide.steps.find((entry) => entry.id === 'status-view');
    for (const locale of ['de', 'en', 'es', 'fr']) {
      expect(step.copy[locale].body).toMatch(/avatar/i);
      expect(step.copy[locale].body).toMatch(/LIVE/i);
      expect(step.copy[locale].body).not.toMatch(/starts no connection|startet keine Verbindung|no inicia conexiones|ne démarre aucune connexion/i);
    }
  });
});
