'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const helperPath = path.join(
  process.cwd(),
  'plugins',
  'stream-monsters',
  'streammonsters-portrait-arena.js'
);
const overlayPath = path.join(
  process.cwd(),
  'plugins',
  'stream-monsters',
  'streammonsters-overlay.html'
);
const acceptanceFixturePath = path.join(
  process.cwd(),
  'test',
  'browser-fixtures',
  'streammonsters-portrait-arena-acceptance.html'
);
const acceptanceRunnerPath = path.join(
  process.cwd(),
  'test',
  'streammonsters-portrait-arena-visual.browser.js'
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
  test('ships the complete real-browser acceptance matrix and fixture contract', () => {
    expect(fs.existsSync(acceptanceFixturePath)).toBe(true);
    expect(fs.existsSync(acceptanceRunnerPath)).toBe(true);
    if (
      !fs.existsSync(acceptanceFixturePath) ||
      !fs.existsSync(acceptanceRunnerPath)
    ) return;

    const fixtureSource = fs.readFileSync(acceptanceFixturePath, 'utf8');
    const runnerSource = fs.readFileSync(acceptanceRunnerPath, 'utf8');

    expect(fixtureSource).toContain('window.showArenaCase = showArenaCase;');
    expect(runnerSource).toContain(
      "const VIEWPORTS = Object.freeze([[324, 581], [477, 829], [1080, 1920]]);"
    );
    expect(runnerSource).toContain(
      "const VARIANTS = Object.freeze(['split-arena', 'classic']);"
    );
    expect(runnerSource).toContain(
      "const PHASES = Object.freeze(['choice', 'sealed', 'revealed', 'action', 'completed', 'egg-exception']);"
    );
    expect(runnerSource).toContain(
      "const RENDERERS = Object.freeze(['Canvas2D', 'CSS fallback', 'WebGPU']);"
    );
    expect(runnerSource).toContain(
      "const MOTION = Object.freeze(['normal', 'reduced']);"
    );
    expect(runnerSource).toContain(
      "path.join(repoRoot, 'app', 'output', 'playwright', 'streammonsters-bounded-arena')"
    );
    expect(runnerSource).toContain(
      "requestedPath.startsWith('/plugins/streamalchemy/')"
    );
    expect(runnerSource).toContain('`/app${requestedPath}`');
    expect(fixtureSource).toContain('firstClippingAncestor');
    expect(fixtureSource).toContain('rangeRect');
    expect(fixtureSource).toContain('overflowX');
    expect(fixtureSource).toContain('overflowY');
    expect(fixtureSource).toContain('selectionSemantics');
    expect(fixtureSource).toContain('visibleArenaDescendants');
    expect(fixtureSource).toContain('hudContract');
    expect(fixtureSource).toContain('collectToplineContract');
    expect(runnerSource).toContain('row.toplineContract.pass');
    expect(fixtureSource).toContain('collectCountdownContract');
    expect(runnerSource).toContain('row.countdownContract.pass');
    expect(fixtureSource).toContain('collectLeadContract');
    expect(runnerSource).toContain('row.leadContract.painted');
    expect(fixtureSource).toContain(
      "loadScript(`${ROOT}streammonsters-rules-v8-pacing.js`)"
    );
    expect(fixtureSource).toContain(
      "loadScript(`${ROOT}streammonsters-arena-director.js`)"
    );
    expect(fixtureSource).toContain(
      "loadScript(`${ROOT}streammonsters-arena-view.js`)"
    );
    expect(fixtureSource).toContain(
      "loadScript(`${ROOT}streammonsters-egg-stage-view.js`)"
    );
    expect(fixtureSource).toContain(
      'window.StreamMonstersArenaView.createArenaView'
    );
    expect(fixtureSource).toContain('arenaView.applySnapshot');
    expect(fixtureSource).toContain('arenaView.openChoice');
    expect(fixtureSource).toContain('arenaView.lockChoice');
    expect(fixtureSource).toContain('arenaView.revealChoices');
    expect(fixtureSource).toContain('arenaView.playAction');
    expect(fixtureSource).toContain('arenaView.complete');
    expect(fixtureSource).toContain("state: 'finalizing'");
    expect(fixtureSource).toContain(
      'window.StreamMonstersEggStageView.buildEventPresentation'
    );
    expect(fixtureSource).toContain(
      'window.StreamMonstersEggStageView.presentCompactLifecycleNotice'
    );
    for (const forbiddenFactory of [
      'function applyPhase(',
      'function applyActionVisualState(',
      'function recoverActionVisualState(',
      'battle.dataset.phase = phase',
      "selectedCard.classList.add('selected')",
      "setText('arena-action-player'",
      "setText('arena-action-key'",
      "setText('arena-action-skill'",
      "setText('arena-result-winner'",
      "setText('arena-result-compact-summary'",
      "notice.querySelector('[data-egg-notice-title]').textContent",
      "notice.querySelector('[data-egg-notice-action]').textContent"
    ]) {
      expect(fixtureSource).not.toContain(forbiddenFactory);
    }
    expect(runnerSource).toContain('record.horizontalClipped');
    expect(runnerSource).toContain('record.verticalClipped');
    expect(runnerSource).toContain('row.hudContract');
    expect(runnerSource).toContain(
      "const FIGHTER_HUD_PHASES = Object.freeze(['choice', 'sealed', 'revealed', 'action', 'egg-exception']);"
    );
    expect(runnerSource).toContain('FIGHTER_HUD_PHASES.includes(row.phase)');
    expect(fixtureSource).toContain('completedOwnership');
    expect(runnerSource).toContain('row.completedOwnership');
    expect(runnerSource).toContain('row.visibleArenaDescendants');
    expect(runnerSource).toContain('shelfRegionPaint');
    expect(runnerSource).toContain('omitBackground: false');
    expect(fixtureSource).toContain(
      'parent.scrollWidth > parent.clientWidth'
    );
    expect(fixtureSource).not.toContain(
      'parent.scrollWidth > parent.clientWidth + 1'
    );
    expect(runnerSource).not.toContain(
      'parent.scrollHeight > parent.clientHeight + 1'
    );
  });

  test('requires transparent effect proof from the full viewport', () => {
    const fixtureSource = fs.readFileSync(acceptanceFixturePath, 'utf8');
    const runnerSource = fs.readFileSync(acceptanceRunnerPath, 'utf8');

    expect(fixtureSource).toContain(
      'body[data-effect-capture="true"] #streammonsters-overlay > :not(#portrait-arena)'
    );
    expect(runnerSource).toContain(
      'const viewportPng = await page.screenshot({'
    );
    expect(runnerSource).not.toMatch(
      /const arenaPng = await page\.screenshot\(\{[\s\S]*?x: layout\.arena\.left/
    );
    expect(runnerSource).toContain('viewportAlpha.likebarAlphaPixels');
  });

  test('binds exact action, ink, all-viewport HUD, and cleanup evidence', () => {
    const fixtureSource = fs.readFileSync(acceptanceFixturePath, 'utf8');
    const runnerSource = fs.readFileSync(acceptanceRunnerPath, 'utf8');

    expect(fixtureSource).toContain('prepareTextInkProbe');
    expect(fixtureSource).toContain('unclipTextInkProbe');
    expect(fixtureSource).toContain('restoreTextInkProbe');
    expect(fixtureSource).toContain('verticalExtensionAncestor');
    expect(fixtureSource).toContain('partialExtensionAncestor');
    expect(fixtureSource).toContain('clipX');
    expect(fixtureSource).toContain('clipY');
    expect(fixtureSource).toContain('data-text-ink-neutral');
    expect(fixtureSource).toContain('data-text-ink-restoring');
    expect(fixtureSource).toContain('backdrop-filter:none!important');
    expect(fixtureSource).toContain('mix-blend-mode:normal!important');
    expect(fixtureSource).toContain('animation:none!important');
    expect(runnerSource).toContain('captureTextInkProbe');
    expect(runnerSource).toContain('compareAlphaMasks');
    expect(runnerSource).toContain('clippedPng');
    expect(runnerSource).toContain('unclippedPng');
    expect(runnerSource).toContain('missingOutsideGuardPixels');
    expect(runnerSource).toContain('missingOutsideXGuardPixels');
    expect(runnerSource).toContain('missingOutsideYGuardPixels');
    expect(runnerSource).toContain('missingAlphaRatio');
    expect(runnerSource).toContain('restoreStateMatches');
    expect(runnerSource).toContain('inkProbeCache');
    expect(runnerSource).toContain('evidence.inkProbes');
    const matrixLoopSource = runnerSource.slice(
      runnerSource.indexOf('for (const [width, height] of VIEWPORTS)')
    );
    expect(
      matrixLoopSource.indexOf('await captureEffectMetrics(page, row)')
    ).toBeLessThan(
      matrixLoopSource.indexOf('await attachTextInkProbes(')
    );
    const probeKeySource = runnerSource.match(
      /function textInkProbeKey\([^)]*\) \{[\s\S]*?\n\}/
    )?.[0] || '';
    expect(probeKeySource).toContain('record.textStyle');
    expect(probeKeySource).not.toContain('row.variant');
    expect(probeKeySource).not.toContain('row.phase');
    expect(runnerSource).toContain('row.action.paintedParts');
    expect(runnerSource).toContain("['key', 'skill', 'compactMetric']");
    expect(runnerSource).toContain("'C \u00b7 NOVA \u00b7 \u22127 HP'");
    expect(runnerSource).toContain('row.action.targetHp.changed');
    expect(fixtureSource).toContain('impactContract');
    expect(runnerSource).toContain('row.impactContract');
    expect(runnerSource).not.toContain('row.viewport.width === 324');
    expect(runnerSource).toContain('cleanup.errors');
    expect(runnerSource).not.toContain('.close().catch(() => {})');
  });

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

  test('preserves edge-only, dimension-only and floating rectangle call shapes', () => {
    expect(helperLoadError).toBeNull();
    if (!portraitArena) return;

    expect(portraitArena.normalizedRectCenter(
      { left: 150, top: 75, right: 170, bottom: 85 },
      { left: 100, top: 50, right: 300, bottom: 150 }
    )).toEqual({ x: 0.3, y: 0.3 });
    expect(portraitArena.normalizedRectCenter(
      { left: 150, top: 75, width: 20, height: 10 },
      { left: 100, top: 50, width: 200, height: 100 }
    )).toEqual({ x: 0.3, y: 0.3 });
    expect(portraitArena.normalizedRectCenter(
      {
        left: 0.1,
        top: 0.1,
        right: 0.3,
        bottom: 0.3,
        width: 0.2,
        height: 0.2
      },
      {
        left: 0,
        top: 0,
        right: 1,
        bottom: 1,
        width: 1,
        height: 1
      }
    )).toEqual({ x: 0.2, y: 0.2 });
  });

  test.each([
    [
      'explicit NaN rectangle width',
      { width: Number.NaN },
      {}
    ],
    [
      'explicit undefined rectangle width',
      { width: undefined },
      {}
    ],
    [
      'contradictory rectangle width and edges',
      { width: 2 },
      {}
    ],
    [
      'explicit NaN rectangle height',
      { height: Number.NaN },
      {}
    ],
    [
      'contradictory rectangle height and edges',
      { height: 2 },
      {}
    ],
    [
      'explicit negative rectangle height',
      { height: -1 },
      {}
    ],
    [
      'explicit NaN container width',
      {},
      { width: Number.NaN }
    ],
    [
      'explicit undefined container width',
      {},
      { width: undefined }
    ],
    [
      'contradictory container width and edges',
      {},
      { width: 50 }
    ],
    [
      'explicit NaN container height',
      {},
      { height: Number.NaN }
    ],
    [
      'contradictory container height and edges',
      {},
      { height: 50 }
    ],
    [
      'explicit zero container height',
      {},
      { height: 0 }
    ]
  ])('rejects %s', (_name, rectOverrides, containerOverrides) => {
    expect(helperLoadError).toBeNull();
    if (!portraitArena) return;

    const rect = {
      left: 10,
      top: 10,
      right: 20,
      bottom: 20,
      width: 10,
      height: 10,
      ...rectOverrides
    };
    const container = {
      left: 0,
      top: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      ...containerOverrides
    };
    expect(portraitArena.normalizedRectCenter(rect, container)).toBeNull();
  });

  test('nests every stage surface in one arena and only egg exceptions below it', () => {
    const dom = new JSDOM(fs.readFileSync(overlayPath, 'utf8'));
    const document = dom.window.document;
    const overlay = document.getElementById('streammonsters-overlay');
    const arena = document.getElementById('portrait-arena');
    const exceptionLane = document.getElementById('portrait-exception-lane');

    expect(Array.from(overlay.children).map(child => child.id)).toEqual([
      'phase-announcer',
      'critical-status-announcer',
      'portrait-arena',
      'hatch-reveal',
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
    expect(bySelector(':root')?.style.getPropertyValue('--portrait-exception-top')).toBe('58%');
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

  test('removes the redundant lead from bounded portrait variants only', () => {
    const dom = new JSDOM(fs.readFileSync(overlayPath, 'utf8'));
    const rules = styleRules(dom.window.document);
    const portraitLeadRule = rules.find(rule => (
      rule.media.includes('orientation: portrait') &&
      rule.selector.split(',').map(selector => selector.trim()).includes(
        '#portrait-arena[data-arena-variant="split-arena"] #arena-lead'
      ) &&
      rule.selector.split(',').map(selector => selector.trim()).includes(
        '#portrait-arena[data-arena-variant="classic"] #arena-lead'
      )
    ));
    const landscapeLeadRule = rules.find(rule => (
      rule.media.includes('orientation: landscape') &&
      rule.selector === '#battle[data-phase="action"] #arena-lead'
    ));

    expect(portraitLeadRule?.style.display).toBe('none');
    expect(landscapeLeadRule?.style.display).not.toBe('none');
    dom.window.close();
  });

  test('keeps short bounded-portrait skill names complete at mid widths', () => {
    const html = fs.readFileSync(overlayPath, 'utf8');
    expect(html).toContain(
      'font-size:clamp(9px,2vw,21px);'
    );
  });

  test('loads the arena helper before effects and ArenaView consumers', () => {
    const dom = new JSDOM(fs.readFileSync(overlayPath, 'utf8'));
    const sources = Array.from(dom.window.document.querySelectorAll('script[src]'))
      .map(script => script.getAttribute('src'));

    const helperIndex = sources.indexOf(
      '/plugins/stream-monsters/streammonsters-portrait-arena.js'
    );
    expect(helperIndex).toBeGreaterThan(-1);
    expect(helperIndex).toBeLessThan(sources.indexOf(
      '/plugins/stream-monsters/streammonsters-effects-renderer.js'
    ));
    expect(helperIndex).toBeLessThan(sources.indexOf(
      '/plugins/stream-monsters/streammonsters-arena-view.js'
    ));
    dom.window.close();
  });
});
