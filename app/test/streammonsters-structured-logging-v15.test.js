const StreamAlchemyPlugin = require('../plugins/stream-monsters');
const StreamMonstersCommandIngress = require(
  '../plugins/stream-monsters/backend/streammonsters/command-ingress'
);

describe('Stream Monsters structured diagnostics', () => {
  test('adds dedupe metadata and logs socket/domain events without raw viewer identity', () => {
    const api = {
      emit: jest.fn(),
      log: jest.fn()
    };
    const plugin = new StreamAlchemyPlugin(api);

    const emitted = plugin.emitStreamMonsters('streammonsters:egg_hatched', {
      userId: 'raw-private-viewer',
      egg: { egg_id: 'egg-a' },
      monster: { monster_id: 'monster-a' }
    });

    expect(emitted).toEqual(expect.objectContaining({
      eventId: expect.stringMatching(/^(?:sm-[a-f0-9]{32}|[a-f0-9-]{16,})$/i),
      correlationId: expect.stringMatching(/^(?:sm-[a-f0-9]{32}|[a-f0-9-]{16,})$/i)
    }));
    expect(api.emit).toHaveBeenCalledWith(
      'streammonsters:egg_hatched',
      expect.objectContaining({
        eventId: emitted.eventId,
        correlationId: emitted.correlationId
      })
    );
    const parsedLogs = api.log.mock.calls.map(([line]) => JSON.parse(line));
    expect(parsedLogs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        component: 'streammonsters',
        event: 'socket_emit',
        eventType: 'streammonsters:egg_hatched',
        eventId: emitted.eventId,
        correlationId: emitted.correlationId
      }),
      expect.objectContaining({
        component: 'streammonsters',
        event: 'hatch_completed'
      })
    ]));
    expect(JSON.stringify(api.log.mock.calls)).not.toContain('raw-private-viewer');
  });

  test('reports canonical alias resolution for fallback and GCCE transports', async () => {
    const onResolved = jest.fn();
    const ingress = new StreamMonstersCommandIngress({
      execute: jest.fn(async () => ({ success: true, status: 'eggs' })),
      emit: jest.fn(),
      resolveUserId: data => data.userId,
      onResolved
    });
    ingress.setCommands([{
      name: 'meineeier',
      commandName: 'eggs',
      minArgs: 0,
      maxArgs: 0,
      cooldown: { user: 0, global: 0 }
    }], '!');

    await ingress.handleFallback({
      userId: 'raw-private-viewer',
      comment: '!meineeier'
    });
    await ingress.executeCommand(
      'eggs',
      [],
      { userId: 'raw-private-viewer' },
      'gcce',
      'meineeier'
    );

    expect(onResolved.mock.calls.map(([entry]) => entry)).toEqual([
      {
        alias: 'meineeier',
        commandName: 'eggs',
        transport: 'fallback',
        userId: 'raw-private-viewer'
      },
      {
        alias: 'meineeier',
        commandName: 'eggs',
        transport: 'gcce',
        userId: 'raw-private-viewer'
      }
    ]);
  });

  test('reports unexpected command failures without exposing internal errors in chat', async () => {
    const onError = jest.fn();
    const emit = jest.fn();
    const ingress = new StreamMonstersCommandIngress({
      execute: jest.fn(async () => {
        throw new Error('database path and secret details');
      }),
      emit,
      resolveUserId: data => data.userId,
      onError
    });
    ingress.setCommands([{
      name: 'hatch',
      commandName: 'hatch',
      minArgs: 0,
      maxArgs: 1,
      cooldown: { user: 0, global: 0 }
    }], '!');

    await expect(ingress.handleFallback({
      userId: 'raw-private-viewer',
      comment: '!hatch'
    })).resolves.toEqual(expect.objectContaining({
      status: 'execution_failed',
      message: 'Command execution failed.'
    }));
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      commandName: 'hatch',
      transport: 'fallback',
      userId: 'raw-private-viewer',
      error: expect.any(Error)
    }));
    expect(JSON.stringify(emit.mock.calls)).not.toContain('database path');

    await expect(ingress.executeCommand(
      'hatch',
      [],
      { userId: 'raw-private-viewer' },
      'gcce',
      'hatch'
    )).rejects.toThrow('database path');
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      commandName: 'hatch',
      transport: 'gcce'
    }));
  });

  test('shares fallback cooldowns across aliases of the same action', async () => {
    const execute = jest.fn(async () => ({ success: true, status: 'eggs' }));
    const ingress = new StreamMonstersCommandIngress({
      execute,
      emit: jest.fn(),
      now: () => 1_000,
      resolveUserId: data => data.userId
    });
    ingress.setCommands(['eier', 'eierliste'].map(name => ({
      name,
      commandName: 'eggs',
      minArgs: 0,
      maxArgs: 0,
      cooldown: { user: 1_000, global: 0 }
    })), '!');

    await expect(ingress.handleFallback({
      userId: 'viewer-a',
      comment: '!eier'
    })).resolves.toEqual(expect.objectContaining({ success: true }));
    await expect(ingress.handleFallback({
      userId: 'viewer-a',
      comment: '!eierliste'
    })).resolves.toEqual(expect.objectContaining({ status: 'cooldown' }));
    expect(execute).toHaveBeenCalledTimes(1);
  });

  test('does not start fallback cooldowns for rejected domain actions', async () => {
    const execute = jest.fn()
      .mockResolvedValueOnce({ success: false, status: 'egg_not_ready' })
      .mockResolvedValueOnce({ success: true, status: 'hatched' });
    const ingress = new StreamMonstersCommandIngress({
      execute,
      emit: jest.fn(),
      now: () => 1_000,
      resolveUserId: data => data.userId
    });
    ingress.setCommands([{
      name: 'hatch',
      commandName: 'hatch',
      minArgs: 0,
      maxArgs: 1,
      cooldown: { user: 5_000, global: 5_000 }
    }], '!');

    await expect(ingress.handleFallback({
      userId: 'viewer-a',
      comment: '!hatch'
    })).resolves.toEqual(expect.objectContaining({ status: 'egg_not_ready' }));
    await expect(ingress.handleFallback({
      userId: 'viewer-a',
      comment: '!hatch'
    })).resolves.toEqual(expect.objectContaining({ status: 'hatched' }));
    expect(execute).toHaveBeenCalledTimes(2);
  });

  test('maps every reachable v5 match status to a localized card key', async () => {
    const statuses = [
      'reserved',
      'active',
      'roster_locked',
      'match_locked',
      'match_cancelled'
    ];
    const emit = jest.fn();
    const ingress = new StreamMonstersCommandIngress({
      execute: jest.fn(async (_context, commandName) => ({
        success: commandName !== 'match_locked',
        status: commandName
      })),
      emit
    });

    for (const status of statuses) {
      await ingress.executeCommand(status, [], { userId: 'viewer-a' }, 'fallback');
    }
    expect(emit.mock.calls.map(([, payload]) => payload.result.messageKey)).toEqual([
      'chatResultReserved',
      'chatResultActive',
      'chatResultRosterLocked',
      'chatResultMatchLocked',
      'chatResultMatchCancelled'
    ]);
  });
});
