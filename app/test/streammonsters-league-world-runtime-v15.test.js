'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const ChatCommands = require('../plugins/streamalchemy/backend/streammonsters/chat-commands');
const CommandIngress = require('../plugins/streamalchemy/backend/streammonsters/command-ingress');
const {
  projectChatResult
} = require('../plugins/streamalchemy/backend/streammonsters/public-event-projector');
const chatRuntime = require('../plugins/streamalchemy/streammonsters-chat-view');
const overlayRuntime = require('../plugins/streamalchemy/streammonsters-overlay-runtime');

const pluginDir = path.join(process.cwd(), 'plugins', 'streamalchemy');

describe('Stream Monsters 1.5 League World runtime cleanup', () => {
  test('reports Arena Rating and Collector Score as distinct rank systems', () => {
    const commands = new ChatCommands({
      store: {},
      engine: { markReadyEggs: jest.fn() },
      battleService: {},
      battleMatchService: {
        getCurrentArenaSeason: () => ({ seasonId: 'arena-28-1' }),
        getArenaRating: (seasonId, userId) => ({
          seasonId,
          viewerId: userId,
          rating: 1314,
          battlesRated: 7,
          tier: 'Crystal'
        })
      },
      progression: {
        recordCommand: jest.fn(),
        getViewerSeason: () => ({
          points: 275,
          rank: 'Gold',
          season: { season_id: 'collector-28-1' }
        })
      }
    });

    const result = commands.execute({ userId: 'viewer-a' }, 'rank');

    expect(result).toEqual(expect.objectContaining({
      success: true,
      status: 'rank',
      message: 'Arena Rating: Crystal · 1314. Collector Score: Gold · 275.',
      arena: expect.objectContaining({
        rating: 1314,
        tier: 'Crystal',
        battlesRated: 7
      }),
      collector: expect.objectContaining({
        points: 275,
        rank: 'Gold'
      })
    }));
    expect(result.score).toBe(result.collector);
  });

  test('renders the two rank systems as one readable upper overlay card', async () => {
    const dom = new JSDOM(`
      <!doctype html>
      <body>
        <section id="detail"></section>
        <div id="compact"></div>
      </body>
    `);
    const detail = dom.window.document.getElementById('detail');
    const compact = dom.window.document.getElementById('compact');
    const snapshots = [];
    const labels = {
      viewer: 'Viewer',
      rankCard: 'League ranks',
      arenaRating: 'Arena Rating',
      collectorScore: 'Collector Score',
      commandUnavailable: 'Unavailable'
    };
    const view = chatRuntime.createChatView({
      document: dom.window.document,
      detailElement: detail,
      compactElement: compact,
      translate: key => labels[key] || key,
      wait: async () => snapshots.push({
        kind: detail.dataset.kind,
        text: detail.textContent
      })
    });

    const shown = await view.show({
      displayName: 'Rival',
      result: {
        status: 'rank',
        arena: { rating: 1314, tier: 'Crystal' },
        collector: { points: 275, rank: 'Gold' }
      }
    });

    expect(shown).toEqual({ handled: true, kind: 'rank' });
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].kind).toBe('rank');
    expect(snapshots[0].text).toContain('Arena Rating');
    expect(snapshots[0].text).toContain('Crystal');
    expect(snapshots[0].text).toContain('1314');
    expect(snapshots[0].text).toContain('Collector Score');
    expect(snapshots[0].text).toContain('Gold');
    expect(snapshots[0].text).toContain('275');
    expect(detail.dataset.kind).toBeUndefined();
    expect(compact.textContent).toBe('');
  });

  test('projects only the public fields required by the two-system rank card', () => {
    const projected = projectChatResult({
      success: true,
      status: 'rank',
      messageKey: 'chatResultRank',
      arena: {
        viewerId: 'private-viewer',
        seasonId: 'private-arena-season',
        rating: 1314,
        battlesRated: 7,
        tier: 'Crystal'
      },
      collector: {
        user_id: 'private-viewer',
        season_id: 'private-collector-season',
        points: 275,
        rank: 'Gold',
        title: 'Gold Collector'
      }
    });

    expect(projected).toEqual(expect.objectContaining({
      arena: {
        rating: 1314,
        battlesRated: 7,
        tier: 'Crystal'
      },
      collector: {
        points: 275,
        rank: 'Gold'
      }
    }));
    expect(JSON.stringify(projected)).not.toContain('private-');
  });

  test('does not translate retired starter command results into live overlay cards', () => {
    const emit = jest.fn();
    const ingress = new CommandIngress({
      execute: jest.fn(),
      emit
    });

    ingress.emitResult('adopt', { userId: 'viewer-a' }, {
      success: false,
      status: 'starter_claimed'
    }, 'fallback');

    expect(emit).toHaveBeenCalledWith(
      'streammonsters:chat_result',
      expect.objectContaining({
        result: expect.objectContaining({ messageKey: 'chatResultUnknown' })
      })
    );
  });

  test('projects and localizes the personal free-egg cooldown with its remaining time', async () => {
    const emit = jest.fn();
    const ingress = new CommandIngress({
      execute: jest.fn(),
      emit
    });
    for (const [alias, transport] of [
      ['adopt', 'gcce'],
      ['adoptieren', 'fallback']
    ]) {
      ingress.emitResult(alias, {
        userId: 'private-viewer-id',
        username: 'ReadableViewer'
      }, {
        success: false,
        status: 'cooldown',
        cooldownKind: 'free_egg',
        remainingMs: 65_000,
        message: 'private server prose'
      }, transport);
    }

    const ingressPayloads = emit.mock.calls.map(([, payload]) => payload);
    for (const ingressPayload of ingressPayloads) {
      expect(ingressPayload.result).toEqual(expect.objectContaining({
        messageKey: 'chatResultAdoptCooldown',
        wait: {
          state: 'adopt_cooldown',
          remainingMs: 65_000
        },
        hint: '⏳ 01:05'
      }));
    }
    const ingressPayload = ingressPayloads[1];
    const projected = projectChatResult(ingressPayload.result);
    expect(projected).toEqual(expect.objectContaining({
      messageKey: 'chatResultAdoptCooldown',
      wait: expect.objectContaining({
        state: 'adopt_cooldown',
        remainingMs: 65_000
      })
    }));
    expect(overlayRuntime.chatMessageKey(projected))
      .toBe('chatResultAdoptCooldown');
    expect(JSON.stringify(projected)).not.toContain('private server prose');

    const dom = new JSDOM(`
      <!doctype html>
      <body>
        <section id="detail"></section>
        <div id="compact"></div>
      </body>
    `);
    const compact = dom.window.document.getElementById('compact');
    const snapshots = [];
    const view = chatRuntime.createChatView({
      document: dom.window.document,
      detailElement: dom.window.document.getElementById('detail'),
      compactElement: compact,
      translate: (key, params = {}) => key === 'chatResultAdoptCooldown'
        ? `Free egg available again in ${params.remaining}.`
        : key,
      wait: async () => snapshots.push(compact.textContent)
    });

    await view.show({
      displayName: ingressPayload.username,
      result: projected
    });

    expect(snapshots).toEqual([
      'ReadableViewer · Free egg available again in 01:05.'
    ]);
  });

  test('does not replay retired starter events after reconnect', () => {
    const replay = overlayRuntime.replayableRecentEvents({
      recentEvents: [{
        sequence: 1,
        eventId: 'legacy-starter-event',
        type: 'streammonsters:starter_claimed',
        payload: { displayName: 'Viewer' }
      }]
    });

    expect(replay).toEqual([]);
  });

  test('uses generic API errors for retired generation runtimes while preserving game errors', () => {
    expect(overlayRuntime.apiErrorKey(
      'STREAM_MONSTERS_RUNTIME_INSTALL_REQUEST_INVALID'
    )).toBe('apiErrorUnknown');
    expect(overlayRuntime.apiErrorKey(
      'STREAM_MONSTERS_AI_PROVIDER_UNAVAILABLE'
    )).toBe('apiErrorUnknown');
    expect(overlayRuntime.apiErrorKey(
      'STREAM_MONSTERS_POOL_ALREADY_RUNNING'
    )).toBe('apiErrorUnknown');
    expect(overlayRuntime.apiErrorKey(
      'STREAM_MONSTERS_GIFT_MAPPING_INVALID'
    )).toBe('apiErrorGiftMapping');
  });

  test('ships only Portrait Arcade Rally fallback branding and no starter socket path', () => {
    const indexSource = fs.readFileSync(path.join(pluginDir, 'index.js'), 'utf8');
    const overlaySource = fs.readFileSync(
      path.join(pluginDir, 'streammonsters-overlay.html'),
      'utf8'
    );
    const overlayDocument = new JSDOM(overlaySource).window.document;

    expect(indexSource).not.toContain('Collector Arena');
    expect(overlaySource).not.toContain('Collector Arena');
    expect(overlayDocument.title).toBe('Stream Monsters · Portrait Arcade Rally Overlay');
    expect(overlayDocument.getElementById('title').textContent).toBe('Portrait Arcade Rally');
    expect(overlaySource).not.toContain('starter_revealed');
    expect(overlaySource).not.toContain('streammonsters:starter_claimed');
  });
});
