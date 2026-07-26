'use strict';

const fs = require('fs');
const path = require('path');

const pluginDir = path.join(process.cwd(), 'plugins', 'streamalchemy');

describe('Stream Monsters creator UI presentation controls', () => {
  test('wires persisted duration, pack, layout, Random mapping and scene demo controls', () => {
    const html = fs.readFileSync(path.join(pluginDir, 'streammonsters-ui.html'), 'utf8');

    for (const id of [
      'hatchPreset',
      'visualPack',
      'landscapeAnchor',
      'landscapeScale',
      'portraitAnchor',
      'portraitScale',
      'safeZonePreview',
      'safeZoneLayout',
      'safeZoneWarning',
      'monsterDex',
      'heartChainStatus',
      'streamMissionStatus',
      'demoScene',
      'demoTemplate',
      'runSceneDemo'
    ]) {
      expect(html).toContain(`id="${id}"`);
    }
    for (const duration of ['30000', '60000', '120000', '300000', '600000', '1800000']) {
      expect(html).toContain(`value="${duration}"`);
    }
    expect(html).toContain('value="furry"');
    expect(html).not.toContain('value="art_lab"');
    expect(html).not.toContain('value="kenney"');
    for (const scene of ['spawn', 'hatch', 'attack', 'defense', 'special']) {
      expect(html).toContain(`value="${scene}"`);
    }
    expect(html).toContain('value="Random"');
    expect(html).toContain('streammonsters-creator-runtime.js');
    expect(html).toContain('giftMappingCustomized');
    expect(html).toContain('buildConfigPayload');
    expect(html).toContain('safeZoneCollisions');
    expect(html).toContain('buildDexSlots');
    expect(html).toContain('/api/streammonsters/creator-catalog');
  });

  test('provides keyboard and live-region semantics for creator feedback', () => {
    const html = fs.readFileSync(path.join(pluginDir, 'streammonsters-ui.html'), 'utf8');

    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-label');
    expect(html).toContain(':focus-visible');
  });
});
