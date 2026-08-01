'use strict';

const fs = require('fs');
const path = require('path');

const pluginDir = path.join(process.cwd(), 'plugins', 'streamalchemy');
const expected = Object.freeze({
  arenaEffectDamage: 'DMG {power}',
  arenaEffectShield: 'SHIELD {power}',
  arenaEffectHeal: 'HEAL {power}',
  arenaEffectBurn: 'BURN {power}',
  arenaEffectThorns: 'REFLECT {power}',
  arenaEffectWeaken: 'WEAKEN {power}',
  arenaEffectPierce: 'PIERCE {power}',
  arenaEffectEvade: 'EVADE {chance}%',
  arenaEffectReflect: 'REFLECT {power}',
  arenaEffectLifesteal: 'HEAL {ratio}% DMG',
  arenaEffectHits: 'HITS {hits}'
});

describe('Stream Monsters 1.12 visible effect tokens', () => {
  test.each(['de', 'en', 'es', 'fr'])('%s uses the language-neutral mechanic tokens', locale => {
    const bundle = JSON.parse(fs.readFileSync(
      path.join(pluginDir, 'locales', `${locale}.json`),
      'utf8'
    ));
    expect(Object.fromEntries(
      Object.keys(expected).map(key => [
        key,
        bundle.plugins.streamalchemy.ui.monsters[key]
      ])
    )).toEqual(expected);
  });

  test('fallback copy uses the same mechanic tokens', () => {
    const source = fs.readFileSync(
      path.join(pluginDir, 'streammonsters-arena-view.js'),
      'utf8'
    );
    Object.entries(expected).forEach(([key, value]) => {
      const fallbackKey = key.replace(/^arena/, '').replace(/^./, letter => letter.toLowerCase());
      expect(source).toContain(`${fallbackKey}: '${value}'`);
    });
  });
});
