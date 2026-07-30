'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const helperPath = path.join(
  process.cwd(),
  'plugins',
  'streamalchemy',
  'streammonsters-portrait-arena.js'
);
const overlayPath = path.join(
  process.cwd(),
  'plugins',
  'streamalchemy',
  'streammonsters-overlay.html'
);

let portraitArena = null;
let helperLoadError = null;
try {
  portraitArena = require(helperPath);
} catch (error) {
  helperLoadError = error;
}

function styleRules(document) {
  const collected = [];
  const visit = (rules, media = '') => {
    for (const rule of Array.from(rules || [])) {
      if (rule.selectorText) {
        collected.push({
          media,
          selector: rule.selectorText,
          style: rule.style
        });
      } else if (rule.cssRules) {
        visit(rule.cssRules, rule.conditionText || rule.media?.mediaText || media);
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) visit(sheet.cssRules);
  return collected;
}

describe('Stream Monsters bounded portrait arena', () => {
  test('exports the canonical variants and normalized portrait rectangles', () => {
    expect(helperLoadError).toBeNull();
    if (!portraitArena) return;

    expect(portraitArena.ARENA_VARIANTS).toEqual(['split-arena', 'classic']);
    expect(portraitArena.PORTRAIT_GEOMETRY).toEqual({
      arena: { left: 0.02, top: 0.118, right: 0.98, bottom: 0.578 },
      likebar: { left: 0.02, top: 0.578, right: 0.98, bottom: 0.74 },
      exception: { left: 0.03, top: 0.74, right: 0.97, bottom: 0.98 }
    });
    expect(portraitArena.normalizeVariant('split-arena')).toBe('split-arena');
    expect(portraitArena.normalizeVariant('classic')).toBe('classic');
    expect(portraitArena.normalizeVariant('wide')).toBe('classic');
    expect(portraitArena.normalizeVariant(null, 'split-arena')).toBe('split-arena');
    expect(portraitArena.normalizeVariant(null, 'wide')).toBe('classic');
  });

  test.each([
    [324, 581, {
      arena: [6.48, 68.558, 317.52, 335.818],
      likebar: [6.48, 335.818, 317.52, 429.94],
      exception: [9.72, 429.94, 314.28, 569.38]
    }],
    [477, 829, {
      arena: [9.54, 97.822, 467.46, 479.162],
      likebar: [9.54, 479.162, 467.46, 613.46],
      exception: [14.31, 613.46, 462.69, 812.42]
    }],
    [1080, 1920, {
      arena: [21.6, 226.56, 1058.4, 1109.76],
      likebar: [21.6, 1109.76, 1058.4, 1420.8],
      exception: [32.4, 1420.8, 1047.6, 1881.6]
    }]
  ])('projects unrounded arena zones at %ix%i', (width, height, expected) => {
    expect(helperLoadError).toBeNull();
    if (!portraitArena) return;

    const zones = portraitArena.viewportZones(width, height);
    for (const [name, edges] of Object.entries(expected)) {
      expect(zones[name].left).toBeCloseTo(edges[0], 10);
      expect(zones[name].top).toBeCloseTo(edges[1], 10);
      expect(zones[name].right).toBeCloseTo(edges[2], 10);
      expect(zones[name].bottom).toBeCloseTo(edges[3], 10);
      expect(zones[name].width).toBeCloseTo(edges[2] - edges[0], 10);
      expect(zones[name].height).toBeCloseTo(edges[3] - edges[1], 10);
    }
  });

  test('normalizes valid rectangle centers, clamps overflow and rejects zero geometry', () => {
    expect(helperLoadError).toBeNull();
    if (!portraitArena) return;

    const container = {
      left: 100,
      top: 50,
      right: 300,
      bottom: 150,
      width: 200,
      height: 100
    };
    expect(portraitArena.normalizedRectCenter({
      left: 150,
      top: 75,
      right: 170,
      bottom: 85,
      width: 20,
      height: 10
    }, container)).toEqual({ x: 0.3, y: 0.3 });
    expect(portraitArena.normalizedRectCenter({
      left: -50,
      top: 200,
      right: -30,
      bottom: 220,
      width: 20,
      height: 20
    }, container)).toEqual({ x: 0, y: 1 });
    expect(portraitArena.normalizedRectCenter(
      { left: 1, top: 1, right: 1, bottom: 2, width: 0, height: 1 },
      container
    )).toBeNull();
    expect(portraitArena.normalizedRectCenter(
      { left: 1, top: 1, right: 2, bottom: 2, width: 1, height: 1 },
      { ...container, right: 100, width: 0 }
    )).toBeNull();
    expect(portraitArena.normalizedRectCenter(
      { left: Number.NaN, top: 1, right: 2, bottom: 2, width: 1, height: 1 },
      container
    )).toBeNull();
    expect(portraitArena.normalizedRectCenter(
      { left: 5, top: 1, right: 4, bottom: 2, width: 1, height: 1 },
      container
    )).toBeNull();
    expect(portraitArena.normalizedRectCenter(
      { left: 1, top: 1, right: 2, bottom: 2, width: 1, height: 1 },
      { ...container, right: 100 }
    )).toBeNull();
  });

  test('nests every stage surface in one arena and only egg exceptions below it', () => {
    const dom = new JSDOM(fs.readFileSync(overlayPath, 'utf8'));
    const document = dom.window.document;
    const overlay = document.getElementById('streammonsters-overlay');
    const arena = document.getElementById('portrait-arena');
    const exceptionLane = document.getElementById('portrait-exception-lane');

    expect(Array.from(overlay.children).map(child => child.id)).toEqual([
      'portrait-arena',
      'portrait-exception-lane'
    ]);
    expect(arena?.dataset.arenaVariant).toBe('classic');
    expect(Array.from(exceptionLane?.children || []).map(child => child.id)).toEqual([
      'egg-lifecycle-notice',
      'egg-shelf'
    ]);
    expect(arena?.contains(exceptionLane)).toBe(false);

    for (const id of [
      'effects-canvas',
      'arcade-choreography',
      'brand',
      'hype',
      'toast',
      'reveal-stage',
      'egg-next-landscape',
      'battle',
      'arena-stat-card',
      'arena-chat-safe-zone',
      'chat-detail',
      'chat-card'
    ]) {
      expect(arena?.contains(document.getElementById(id))).toBe(true);
    }
    expect(exceptionLane?.contains(document.getElementById('egg-shelf'))).toBe(true);
    expect(exceptionLane?.contains(document.getElementById('egg-lifecycle-notice')))
      .toBe(true);
    expect(arena?.contains(document.getElementById('egg-shelf'))).toBe(false);
    expect(arena?.contains(document.getElementById('egg-lifecycle-notice'))).toBe(false);
    dom.window.close();
  });

  test('clips only the approved portrait zones and preserves full-viewport landscape', () => {
    const dom = new JSDOM(fs.readFileSync(overlayPath, 'utf8'));
    const rules = styleRules(dom.window.document);
    const baseArena = rules.find(rule => (
      rule.media === '' &&
      rule.selector.split(',').map(selector => selector.trim())
        .includes('#portrait-arena')
    ));
    const portraitRules = rules.filter(rule => rule.media.includes('orientation: portrait'));
    const bySelector = selector => portraitRules.find(rule => rule.selector === selector);

    expect(baseArena?.style.position).toBe('fixed');
    expect(baseArena?.style.inset).toBe('0px');
    expect(baseArena?.style.overflow).toBe('visible');
    expect(bySelector(':root')?.style.getPropertyValue('--portrait-arena-left')).toBe('2%');
    expect(bySelector(':root')?.style.getPropertyValue('--portrait-arena-top')).toBe('11.8%');
    expect(bySelector(':root')?.style.getPropertyValue('--portrait-arena-right')).toBe('2%');
    expect(bySelector(':root')?.style.getPropertyValue('--portrait-arena-bottom')).toBe('42.2%');
    expect(bySelector(':root')?.style.getPropertyValue('--portrait-exception-top')).toBe('74%');
    expect(bySelector(':root')?.style.getPropertyValue('--portrait-exception-right')).toBe('3%');
    expect(bySelector(':root')?.style.getPropertyValue('--portrait-exception-bottom')).toBe('2%');
    expect(bySelector(':root')?.style.getPropertyValue('--portrait-exception-left')).toBe('3%');
    expect(bySelector('#portrait-arena')?.style.overflow).toBe('clip');
    expect(bySelector('#portrait-arena')?.style.contain).toBe('paint');
    expect(bySelector('#portrait-exception-lane')?.style.display).toBe('grid');
    expect(bySelector('#portrait-exception-lane')?.style['grid-template-rows'])
      .toBe('auto minmax(0,1fr)');
    expect(bySelector('#battle')?.style.inset).toBe('0px');
    expect(bySelector('#battle')?.style.overflow).toBe('hidden');
    dom.window.close();
  });

  test('loads the arena helper before effects and ArenaView consumers', () => {
    const dom = new JSDOM(fs.readFileSync(overlayPath, 'utf8'));
    const sources = Array.from(dom.window.document.querySelectorAll('script[src]'))
      .map(script => script.getAttribute('src'));

    const helperIndex = sources.indexOf(
      '/plugins/streamalchemy/streammonsters-portrait-arena.js'
    );
    expect(helperIndex).toBeGreaterThan(-1);
    expect(helperIndex).toBeLessThan(sources.indexOf(
      '/plugins/streamalchemy/streammonsters-effects-renderer.js'
    ));
    expect(helperIndex).toBeLessThan(sources.indexOf(
      '/plugins/streamalchemy/streammonsters-arena-view.js'
    ));
    dom.window.close();
  });
});
