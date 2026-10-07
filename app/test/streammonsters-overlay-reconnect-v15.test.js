'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const Presentation = require('../plugins/stream-monsters/streammonsters-presentation');
const overlayRuntime = require('../plugins/stream-monsters/streammonsters-overlay-runtime');

const flush = () => new Promise(resolve => setImmediate(resolve));

async function waitFor(predicate, attempts = 30) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (predicate()) return true;
    await flush();
  }
  return false;
}

describe('Stream Monsters OBS rules-v5 reconnect integration', () => {
  test('animates missed pages once and reconnects at the current cursor without replay delay', async () => {
    const html = fs.readFileSync(path.join(
      process.cwd(),
      'plugins',
      'stream-monsters',
      'streammonsters-overlay.html'
    ), 'utf8');
    const socketHandlers = new Map();
    const arenaOperations = [];
    const snapshotVariants = [];
    const replayRequests = [];
    let replayPlaybackCalls = 0;
    const clearedIntervals = [];
    const intervals = new Map();
    const requestLog = [];
    const pendingStateFetches = [];
    let nextIntervalId = 0;
    let deferNextStateFetch = false;
    let socketDisconnected = false;
    let socketRemovedListeners = 0;
    let snapshot = {
      hype: { points: 0 },
      config: {
        hatchDurationMs: 120_000,
        portraitArenaVariant: 'split-arena'
      },
      gcce: { commandPrefix: '!', registeredCommands: [] },
      battle: {
        rulesVersion: 5,
        portraitArenaVariant: 'classic',
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
        window.setInterval = (callback, milliseconds = 0) => {
          const id = ++nextIntervalId;
          intervals.set(id, { callback, milliseconds });
          return id;
        };
        window.clearInterval = handle => {
          clearedIntervals.push(handle);
          intervals.delete(handle);
        };
        window.i18n = {
          init: async () => {},
          updateDOM: () => {},
          t: key => key
        };
        const socket = {
          on: (event, handler) => socketHandlers.set(event, handler),
          off: (event, handler) => {
            if (socketHandlers.get(event) === handler) socketHandlers.delete(event);
            socketRemovedListeners += 1;
            return socket;
          },
          disconnect: () => {
            socketDisconnected = true;
            return socket;
          }
        };
        window.io = () => socket;
        window.fetch = jest.fn((input, options = {}) => {
          const url = new URL(String(input), 'http://localhost:3000');
          requestLog.push(`${url.pathname}${url.search}`);
          if (url.pathname === '/api/stream-monsters/state' && deferNextStateFetch) {
            deferNextStateFetch = false;
            let resolveResponse;
            const promise = new Promise(resolve => { resolveResponse = resolve; });
            pendingStateFetches.push({
              signal:options.signal,
              promise,
              resolve:payload => resolveResponse({
                ok:true,
                status:200,
                json:async () => payload
              })
            });
            return promise;
          }
          if (url.pathname.includes('/assets/audio/manifest.json')) {
            return { ok: false, status: 404, json: async () => ({}) };
          }
          if (url.pathname.includes('/overlay/heartbeat')) {
            return { ok: true, status: 200, json: async () => ({ success: true }) };
          }
          if (url.pathname.includes('/battles/')) {
            const cursor = Number(url.searchParams.get('cursor'));
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
      window.StreamMonstersPresentation = Presentation;
        window.StreamMonstersPortraitArena = {
          normalizeVariant(value, fallback = 'classic') {
            return ['split-arena', 'classic'].includes(value) ? value : fallback;
          }
        };
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
            applySnapshot: value => {
              snapshotVariants.push(
                window.document.getElementById('portrait-arena')?.dataset.arenaVariant
              );
              arenaOperations.push(
                `snapshot:${value?.matches?.[0]?.cursor ?? 'none'}`
              );
            },
            openChoice: value => {
              replayPlaybackCalls += 1;
              arenaOperations.push(`open:${value.sequence || 7}`);
            },
            lockChoice: value => {
              replayPlaybackCalls += 1;
              arenaOperations.push(`lock:${value.sequence || 5}`);
            },
            revealChoices: value => arenaOperations.push(`reveal:${value.choices?.length || 0}`),
            playAction: async value => {
              replayPlaybackCalls += 1;
              arenaOperations.push(
                `action:${value.eventSequence || value.action?.eventSequence}`
              );
            },
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
      expect(snapshotVariants).toEqual(['split-arena']);

      socketHandlers.get('streammonsters:battle_choices_revealed')({
        matchId: 'match-reconnect',
        choices: [{ slot: 1, choice: 'A' }, { slot: 2, choice: 'C' }]
      });
      await waitFor(() => arenaOperations.includes('reveal:2'));
      expect(socketHandlers.has('streammonsters:tutorial_hint')).toBe(true);

      snapshot = {
        ...snapshot,
        config: {
          ...snapshot.config,
          portraitArenaVariant: undefined
        },
        battle: {
          rulesVersion: 5,
          portraitArenaVariant: 'classic',
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
      expect(replayPlaybackCalls).toBe(3);
      expect(snapshotVariants.at(-1)).toBe('classic');

      snapshot = {
        ...snapshot,
        config: {
          ...snapshot.config,
          portraitArenaVariant: 'wide'
        },
        battle: {
          ...snapshot.battle,
          portraitArenaVariant: 'split-arena'
        }
      };
      arenaOperations.length = 0;
      await socketHandlers.get('connect')();
      await waitFor(() => arenaOperations.includes('snapshot:7'));
      expect(replayRequests).toEqual([4, 6]);
      expect(arenaOperations).toEqual(['snapshot:7']);
      expect(replayPlaybackCalls).toBe(3);
      expect(snapshotVariants.at(-1)).toBe('classic');

      const connectHandler = socketHandlers.get('connect');
      const heartbeatInterval = [...intervals.values()][0];
      const operationsBeforeLifecycle = arenaOperations.length;
      dom.window.dispatchEvent(new dom.window.Event('beforeunload'));
      dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide', { persisted:true }));
      dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pageshow', { persisted:true }));
      const intervalsAfterPersistedRestore = intervals.size;
      const clearsAfterPersistedHide = clearedIntervals.length;
      const destroysAfterPersistedHide = arenaOperations.filter(operation => operation === 'destroy').length;
      const listenersAfterPersistedRestore = socketHandlers.size;
      const connectedAfterPersistedRestore = !socketDisconnected;
      heartbeatInterval.callback();
      await flush();
      const heartbeatsAfterPersistedRestore = requestLog.filter(url => (
        url === '/api/stream-monsters/overlay/heartbeat'
      )).length;

      deferNextStateFetch = true;
      const reconnectAfterRestore = connectHandler();
      await waitFor(() => pendingStateFetches.length === 1);
      const delayedSnapshot = pendingStateFetches[0];
      const operationsBeforeFinalHide = arenaOperations.length;
      dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide', { persisted:false }));
      dom.window.dispatchEvent(new dom.window.Event('beforeunload'));
      const abortAfterFinalHide = delayedSnapshot.signal?.aborted || false;
      const intervalsAfterFinalHide = intervals.size;
      const operationsAfterFinalCleanup = arenaOperations.length;
      const disconnectAfterFinalHide = socketDisconnected;
      const listenersAfterFinalHide = socketHandlers.size;
      const requestsAfterFinalHide = requestLog.length;

      delayedSnapshot.resolve(snapshot);
      await reconnectAfterRestore;
      await flush();
      const operationsAfterLateSnapshot = arenaOperations.length;
      heartbeatInterval.callback();
      const staleConnectRequestsBefore = requestLog.length;
      await connectHandler();
      const staleConnectRequestsAfter = requestLog.length;

      expect(intervalsAfterPersistedRestore).toBe(1);
      expect(clearsAfterPersistedHide).toBe(0);
      expect(destroysAfterPersistedHide).toBe(0);
      expect(listenersAfterPersistedRestore).toBeGreaterThan(0);
      expect(connectedAfterPersistedRestore).toBe(true);
      expect(heartbeatsAfterPersistedRestore).toBeGreaterThanOrEqual(2);
      expect(intervalsAfterFinalHide).toBe(0);
      expect(clearedIntervals).toHaveLength(1);
      expect(disconnectAfterFinalHide).toBe(true);
      expect(listenersAfterFinalHide).toBe(0);
      expect(socketRemovedListeners).toBeGreaterThan(0);
      expect(abortAfterFinalHide).toBe(true);
      expect(operationsAfterFinalCleanup).toBe(operationsBeforeFinalHide + 1);
      expect(arenaOperations.length).toBe(operationsAfterFinalCleanup);
      expect(operationsAfterLateSnapshot).toBe(operationsAfterFinalCleanup);
      expect(requestLog.length).toBe(requestsAfterFinalHide);
      expect(staleConnectRequestsAfter).toBe(staleConnectRequestsBefore);
      expect(operationsBeforeLifecycle).toBeGreaterThan(0);
    } finally {
      dom.window.close();
    }
  });
});
