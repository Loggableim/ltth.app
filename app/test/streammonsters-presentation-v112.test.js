'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const Presentation = require('../plugins/streamalchemy/streammonsters-presentation');
const CreatorRuntime = require('../plugins/streamalchemy/streammonsters-creator-runtime');
const OverlayRuntime = require('../plugins/streamalchemy/streammonsters-overlay-runtime');
const StreamMonstersRoutes = require('../plugins/streamalchemy/backend/streammonsters/routes');

const PROFILE_IDS = [
  'portrait-720',
  'portrait-1080',
  'landscape-720',
  'landscape-1080'
];
const LAYER_IDS = [
  'arena',
  'egg-rail',
  'primary-cta',
  'journey',
  'reveal',
  'collection',
  'notifications',
  'hype',
  'branding'
];

function response() {
  return {
    statusCode: 200,
    payload: null,
    sentFile: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
    sendFile(filename) {
      this.sentFile = filename;
      return this;
    }
  };
}

function routeSubject(config = {}) {
  const registered = [];
  const active = {
    enabled: true,
    rulesVersion: 8,
    presentation: Presentation.createDefaultPresentation(),
    ...config
  };
  const routes = new StreamMonstersRoutes({
    api: {
      registerRoute: (method, routePath, handler) => {
        registered.push({ method, routePath, handler });
        return true;
      },
      emit: jest.fn(),
      log: jest.fn()
    },
    pluginDir: path.join(process.cwd(), 'plugins', 'streamalchemy'),
    store: {
      getRecentPublicEvents: () => [],
      getEggStateCounts: () => ({ incubating: 0, queued: 0, ready: 0 }),
      getStreamHype: () => ({ points: 0 }),
      getGiftMappings: () => []
    },
    engine: { streamKey: 'test', hatchDurationFor: () => 90_000 },
    configProvider: {
      getConfig: () => ({ streamMonsters: active }),
      updateConfig: update => ({ streamMonsters: { ...active, ...update.streamMonsters } })
    }
  });
  routes.register();
  return {
    routes,
    find: (method, routePath) => registered.find(route => (
      route.method === method && route.routePath === routePath
    ))?.handler
  };
}

describe('Stream Monsters 1.12 shared presentation contract', () => {
  test('defines four exact canvases, nine layers, three modes and integer basis-point rectangles', () => {
    expect(Presentation.PROFILE_IDS).toEqual(PROFILE_IDS);
    expect(Presentation.LAYER_IDS).toEqual(LAYER_IDS);
    expect(Presentation.LAYER_MODES).toEqual(['composite', 'dedicated', 'off']);
    expect(Presentation.PROFILES).toEqual({
      'portrait-720': { width: 720, height: 1280 },
      'portrait-1080': { width: 1080, height: 1920 },
      'landscape-720': { width: 1280, height: 720 },
      'landscape-1080': { width: 1920, height: 1080 }
    });

    const presentation = Presentation.createDefaultPresentation();
    expect(presentation.version).toBe(2);
    for (const profileId of PROFILE_IDS) {
      expect(Object.keys(presentation.profiles[profileId].layers)).toEqual(LAYER_IDS);
      for (const layer of Object.values(presentation.profiles[profileId].layers)) {
        expect(layer.mode).toBe('composite');
        for (const value of Object.values(layer.rect)) {
          expect(Number.isInteger(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(10_000);
        }
      }
      expect(Presentation.validatePresentation(presentation, { profileId }).valid).toBe(true);
    }
  });

  test('migrates legacy layouts to collision-free v2 without mutating input', () => {
    const legacy = {
      layouts: {
        portrait: { anchor: 'top-right', scale: 115 },
        landscape: { anchor: 'bottom-center', scale: 90 }
      }
    };
    const before = JSON.stringify(legacy);
    const migrated = Presentation.migratePresentation(legacy);

    expect(JSON.stringify(legacy)).toBe(before);
    expect(migrated.version).toBe(2);
    expect(migrated.migratedFrom).toBe('legacy-layouts');
    expect(Presentation.validatePresentation(migrated).valid).toBe(true);
  });

  test('blocks composite collisions with editable Likebar or TikTok-chat safe zones', () => {
    const presentation = Presentation.createDefaultPresentation();
    presentation.profiles['portrait-1080'].layers.arena.rect = {
      ...presentation.profiles['portrait-1080'].safeZones.likebar
    };

    const blocked = Presentation.validatePresentation(presentation, {
      profileId: 'portrait-1080'
    });
    expect(blocked.valid).toBe(false);
    expect(blocked.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'safe_zone_collision',
        profileId: 'portrait-1080',
        layerId: 'arena',
        safeZoneId: 'likebar'
      })
    ]));

    presentation.profiles['portrait-1080'].layers.arena.mode = 'dedicated';
    expect(Presentation.validatePresentation(presentation, {
      profileId: 'portrait-1080'
    }).valid).toBe(true);
  });

  test('edits with 0.5-percent snap, keyboard movement/resize, undo/reset and profile copy', () => {
    const editor = Presentation.createLayoutEditor({ profileId: 'portrait-1080' });
    const original = editor.snapshot().profiles['portrait-1080'].layers.arena.rect;

    editor.drag('arena', { x: 76, y: -24 });
    expect(editor.snapshot().profiles['portrait-1080'].layers.arena.rect).toEqual({
      ...original,
      x: original.x + 100,
      y: original.y
    });
    editor.keyboard('arena', 'ArrowRight');
    editor.keyboard('arena', 'ArrowDown', { resize: true, shiftKey: true });
    expect(editor.snapshot().profiles['portrait-1080'].layers.arena.rect).toEqual({
      x: original.x + 150,
      y: original.y,
      width: original.width,
      height: original.height + 500
    });
    expect(editor.undo()).toBe(true);
    expect(editor.snapshot().profiles['portrait-1080'].layers.arena.rect.height)
      .toBe(original.height);

    editor.copyProfile('portrait-1080', 'portrait-720');
    expect(editor.snapshot().profiles['portrait-720'].layers)
      .toEqual(editor.snapshot().profiles['portrait-1080'].layers);
    editor.reset('portrait-1080');
    expect(editor.snapshot().profiles['portrait-1080'])
      .toEqual(Presentation.createDefaultPresentation().profiles['portrait-1080']);
  });

  test('projects full-canvas composite and dedicated OBS sources with one audio owner', () => {
    const presentation = Presentation.createDefaultPresentation();
    for (const profileId of PROFILE_IDS) {
      presentation.profiles[profileId].layers.arena.mode = 'dedicated';
      presentation.profiles[profileId].layers['egg-rail'].mode = 'dedicated';
    }
    presentation.audioOwner = 'arena';
    const sources = Presentation.buildOverlaySources(presentation, {
      basePath: '/stream-monsters/overlay'
    });

    expect(sources).toHaveLength(PROFILE_IDS.length * 3);
    expect(sources.filter(source => source.audio)).toHaveLength(PROFILE_IDS.length);
    for (const profileId of PROFILE_IDS) {
      const profileSources = sources.filter(source => source.profile === profileId);
      expect(profileSources.map(source => source.view)).toEqual(['full', 'arena', 'egg-rail']);
      expect(profileSources.every(source => source.transparent === true)).toBe(true);
      expect(profileSources.find(source => source.view === 'arena').audio).toBe(true);
      expect(profileSources.find(source => source.view === 'full').audio).toBe(false);
    }
  });

  test('validates overlay view/profile and keeps the unchanged composite URL valid', () => {
    expect(Presentation.parseOverlayQuery('')).toEqual({ view: 'full', profile: null });
    expect(Presentation.parseOverlayQuery('?view=egg-rail&profile=portrait-720'))
      .toEqual({ view: 'egg-rail', profile: 'portrait-720' });
    expect(() => Presentation.parseOverlayQuery('?view=templates'))
      .toThrow('STREAM_MONSTERS_OVERLAY_VIEW_INVALID');
    expect(() => Presentation.parseOverlayQuery('?profile=portrait'))
      .toThrow('STREAM_MONSTERS_OVERLAY_PROFILE_INVALID');
  });

  test('shares geometry and visibility between creator preview and overlay runtime', () => {
    const presentation = Presentation.createDefaultPresentation();
    presentation.profiles['landscape-1080'].layers.hype.mode = 'off';
    presentation.profiles['landscape-1080'].layers.arena.mode = 'dedicated';

    expect(CreatorRuntime.presentationPreview(presentation, 'landscape-1080', 'full'))
      .toEqual(OverlayRuntime.presentationView(presentation, 'landscape-1080', 'full'));
    expect(OverlayRuntime.presentationView(presentation, 'landscape-1080', 'full').layers)
      .toEqual(expect.objectContaining({ arena: null, hype: null }));
    expect(OverlayRuntime.presentationView(presentation, 'landscape-1080', 'arena').layers.arena)
      .toEqual(presentation.profiles['landscape-1080'].layers.arena.rect);
  });

  test('does not override domain hidden state while applying layer visibility', () => {
    const dom = new JSDOM('<section data-sm-layer="reveal" hidden></section>');
    const reveal = dom.window.document.querySelector('[data-sm-layer="reveal"]');
    Presentation.applyPresentation({
      document: dom.window.document,
      presentation: Presentation.createDefaultPresentation(),
      profile: 'portrait-1080',
      view: 'full'
    });

    expect(reveal.hidden).toBe(true);
    expect(reveal.dataset.presentationExcluded).toBe('false');
  });
  test('abbreviates long handles in the middle while preserving the full ARIA label', () => {
    const full = '@very_long_stream_monster_viewer';
    const shortened = Presentation.presentHandle(full, { maxLength: 18 });
    expect(shortened.text.startsWith('@very_')).toBe(true);
    expect(shortened.text.endsWith('viewer')).toBe(true);
    expect(shortened.text).toContain('\u2026');
    expect(shortened.text.length).toBeLessThanOrEqual(18);
    expect(shortened.ariaLabel).toBe(full);
  });
});

describe('Stream Monsters 1.12 presentation routes and markup', () => {
  test('returns 400 for invalid overlay query values before sending HTML', () => {
    const { find } = routeSubject();
    const handler = find('GET', '/streammonsters/overlay');
    const invalidView = response();
    handler({ query: { view: 'template' }, originalUrl: '/streammonsters/overlay?view=template' }, invalidView);
    expect(invalidView.statusCode).toBe(400);
    expect(invalidView.payload).toEqual({ error: 'invalid_overlay_view' });
    expect(invalidView.sentFile).toBeNull();

    const invalidProfile = response();
    handler({ query: { profile: 'portrait' }, originalUrl: '/streammonsters/overlay?profile=portrait' }, invalidProfile);
    expect(invalidProfile.statusCode).toBe(400);
    expect(invalidProfile.payload).toEqual({ error: 'invalid_overlay_profile' });
    expect(invalidProfile.sentFile).toBeNull();

    const valid = response();
    handler({ query: {}, originalUrl: '/streammonsters/overlay' }, valid);
    expect(valid.statusCode).toBe(200);
    expect(valid.sentFile).toMatch(/streammonsters-overlay\.html$/);
  });

  test('exposes an admin overlay-sources API for canonical and compatibility paths', async () => {
    const presentation = Presentation.createDefaultPresentation();
    presentation.profiles['portrait-1080'].layers.arena.mode = 'dedicated';
    const { find } = routeSubject({ presentation });

    for (const routePath of [
      '/api/stream-monsters/overlay-sources',
      '/api/streammonsters/overlay-sources'
    ]) {
      const res = response();
      await find('GET', routePath)({
        ip: '127.0.0.1',
        socket: { remoteAddress: '127.0.0.1' },
        headers: {},
        query: {}
      }, res);
      expect(res.statusCode).toBe(200);
      expect(res.payload.success).toBe(true);
      expect(res.payload.profiles).toEqual(PROFILE_IDS);
      expect(res.payload.sources).toEqual(expect.arrayContaining([
        expect.objectContaining({
          profile: 'portrait-1080',
          view: 'arena',
          url: expect.stringContaining('view=arena&profile=portrait-1080')
        })
      ]));
    }
  });

  test('ships keyboard editor controls, layer hooks, one pair of announcers and a silent countdown', () => {
    const pluginDir = path.join(process.cwd(), 'plugins', 'streamalchemy');
    const uiHtml = fs.readFileSync(path.join(pluginDir, 'streammonsters-ui.html'), 'utf8');
    const overlayHtml = fs.readFileSync(path.join(pluginDir, 'streammonsters-overlay.html'), 'utf8');
    const editorJs = fs.readFileSync(
      path.join(pluginDir, 'streammonsters-layout-editor.js'), 'utf8'
    );
    const ui = new JSDOM(uiHtml).window.document;
    const overlay = new JSDOM(overlayHtml).window.document;

    expect(ui.getElementById('presentationProfile')).not.toBeNull();
    expect([...ui.querySelectorAll('[data-presentation-layer]')]
      .map(node => node.dataset.presentationLayer)).toEqual(LAYER_IDS);
    expect(ui.getElementById('presentationUndo')).not.toBeNull();
    expect(ui.getElementById('presentationReset')).not.toBeNull();
    expect(ui.getElementById('presentationCopy')).not.toBeNull();
    expect(editorJs).toContain("addEventListener('pointerdown'");
    expect(editorJs).toContain("addEventListener('keydown'");

    expect(overlay.querySelectorAll('[data-sm-announcer]')).toHaveLength(2);
    expect(overlay.getElementById('arena-countdown').getAttribute('aria-live')).toBeNull();
    expect(overlay.getElementById('arena-countdown').getAttribute('aria-hidden')).toBe('true');
    expect(overlay.getElementById('arena-countdown-ring')).not.toBeNull();
    expect(overlayHtml).toContain('streammonsters-presentation.js');
    expect(overlayHtml).toContain('data-sm-layer="arena"');
    expect(overlayHtml).toContain('data-sm-layer="egg-rail"');
    expect(overlayHtml).toContain('font-family:ui-monospace');
    expect(overlayHtml).toContain('phaseObserver.disconnect()');
  });
});
