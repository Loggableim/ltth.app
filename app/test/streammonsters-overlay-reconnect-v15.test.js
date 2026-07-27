'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const overlayRuntime = require('../plugins/streamalchemy/streammonsters-overlay-runtime');

const flush = () => new Promise(resolve => setImmediate(resolve));

async function waitFor(predicate, attempts = 30) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (predicate()) return true;
    await flush();
  }
  return false;
}

describe('Stream Monsters OBS rules-v5 reconnect integration', () => {
  test('animates only missed replay pages before applying the final reconnect snapshot', async () => {
    const html = fs.readFileSync(path.join(
      process.cwd(),
      'plugins',
      'streamalchemy',
      'streammonsters-overlay.html'
    ), 'utf8');
    const socketHandlers = new Map();
    const arenaOperations = [];
    const replayRequests = [];
    const clearedIntervals = [];
    let snapshot = {
      hype: { points: 0 },
      config: { hatchDurationMs: 120_000 },
      gcce: { commandPrefix: '!', registeredCommands: [] },
      battle: {
        rulesVersion: 5,
        matches: [{
          matchId: 'match-reconnect',
          state: 'action',
          roundNumber: 1,
          cursor: 4,
          fighters: []
        }]
      }
    };
    const replayPages = new Map([
      [4, {
        success: true,
        matchId: 'match-reconnect',
        cursor: 6,
        hasMore: true,
        events: [{
          sequence: 5,
          eventId: 'match-reconnect:event:5',
          correlationId: 'match-reconnect',
          type: 'streammonsters:battle_choice_locked',
          payload: {
            matchId: 'match-reconnect',
            decision: { sequence: 5, slot: 1, choice: 'A' }
          }
        }, {
          sequence: 6,
          eventId: 'match-reconnect:event:6',
          correlationId: 'match-reconnect',
          type: 'streammonsters:battle_skill_used',
          payload: {
            matchId: 'match-reconnect',
            action: {
              matchId: 'match-reconnect',
              eventSequence: 6,
              actorSlot: 1,
              targetSlot: 2,
              choice: 'A',
              skill: { name: 'Crystal Fang', type: 'attack' },
              hits: []
            }
          }
        }]
      }],
      [6, {
        success: true,
        matchId: 'match-reconnect',
        cursor: 7,
        hasMore: false,
        events: [{
          sequence: 7,
          eventId: 'match-reconnect:event:7',
          correlationId: 'match-reconnect',
          type: 'streammonsters:battle_choice_opened',
          payload: {
            matchId: 'match-reconnect',
            round: 2,
            choices: ['A', 'B', 'C']
          }
        }]
      }]
    ]);

    const dom = new JSDOM(html, {
      url: 'http://localhost:3000/plugins/streamalchemy/overlay.html',
      runScripts: 'dangerously',
      beforeParse(window) {
        const nativeClearInterval = window.clearInterval.bind(window);
        window.clearInterval = handle => {
          clearedIntervals.push(handle);
          nativeClearInterval(handle);
        };
        window.i18n = {
          init: async () => {},
          updateDOM: () => {},
          t: key => key
        };
        window.io = () => ({
          on: (event, handler) => socketHandlers.set(event, handler)
        });
        window.fetch = jest.fn(async input => {
          const url = String(input);
          if (url.includes('/assets/audio/manifest.json')) {
            return { ok: false, status: 404, json: async () => ({}) };
          }
          if (url.includes('/overlay/heartbeat')) {
            return { ok: true, status: 200, json: async () => ({ success: true }) };
          }
          if (url.includes('/battles/')) {
            const parsed = new URL(url, 'http://localhost:3000');
            const cursor = Number(parsed.searchParams.get('cursor'));
            replayRequests.push(cursor);
            return {
              ok: true,
              status: 200,
              json: async () => replayPages.get(cursor)
            };
          }
          return {
            ok: true,
            status: 200,
            json: async () => snapshot
          };
        });
        window.StreamMonstersOverlayRuntime = overlayRuntime;
        window.StreamMonstersEffectsRenderer = {
          createEffectsRenderer: () => ({
            init: () => {},
            resize: () => {},
            play: async () => {},
            status: () => ({ backend: 'canvas2d', fps: 60 })
          })
        };
        window.StreamMonstersArenaView = {
          createArenaView: () => ({
            applyMatch: value => arenaOperations.push(`match:${value.matchId}`),
            applySnapshot: value => arenaOperations.push(
              `snapshot:${value?.matches?.[0]?.cursor ?? 'none'}`
            ),
            openChoice: value => arenaOperations.push(`open:${value.sequence || 7}`),
            lockChoice: value => arenaOperations.push(`lock:${value.sequence || 5}`),
            revealChoices: value => arenaOperations.push(`reveal:${value.choices?.length || 0}`),
            playAction: async value => arenaOperations.push(
              `action:${value.eventSequence || value.action?.eventSequence}`
            ),
            complete: async () => {},
            cancel: async () => {},
            destroy: () => arenaOperations.push('destroy')
          })
        };
      }
    });
    try {
      await waitFor(() => socketHandlers.has('connect'));

      await socketHandlers.get('connect')();
      await waitFor(() => arenaOperations.includes('snapshot:4'));
      expect(replayRequests).toEqual([]);
      expect(arenaOperations).toEqual(['snapshot:4']);

      socketHandlers.get('streammonsters:battle_choices_revealed')({
        matchId: 'match-reconnect',
        choices: [{ slot: 1, choice: 'A' }, { slot: 2, choice: 'C' }]
      });
      await waitFor(() => arenaOperations.includes('reveal:2'));
      expect(socketHandlers.has('streammonsters:tutorial_hint')).toBe(true);

      snapshot = {
        ...snapshot,
        battle: {
          rulesVersion: 5,
          matches: [{
            ...snapshot.battle.matches[0],
            roundNumber: 2,
            cursor: 7
          }]
        }
      };
      arenaOperations.length = 0;
      await socketHandlers.get('connect')();
      await waitFor(() => arenaOperations.includes('snapshot:7'));

      expect(replayRequests).toEqual([4, 6]);
      expect(arenaOperations).toEqual([
        'lock:5',
        'action:6',
        'open:7',
        'snapshot:7'
      ]);

      arenaOperations.length = 0;
      await socketHandlers.get('connect')();
      await waitFor(() => arenaOperations.includes('snapshot:7'));
      expect(replayRequests).toEqual([4, 6]);
      expect(arenaOperations).toEqual(['snapshot:7']);

      dom.window.dispatchEvent(new dom.window.Event('pagehide'));
      dom.window.dispatchEvent(new dom.window.Event('beforeunload'));
      expect(clearedIntervals).toHaveLength(1);
      expect(arenaOperations).toContain('destroy');
    } finally {
      dom.window.close();
    }
  });
});
