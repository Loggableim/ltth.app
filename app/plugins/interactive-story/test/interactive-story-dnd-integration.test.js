const InteractiveStoryPlugin = require('../main');
const StoryEngine = require('../engines/story-engine');

function createPlugin(config = {}) {
  const routes = {};
  const events = {};
  const io = { emit: jest.fn() };
  const api = {
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    getSocketIO: () => io,
    getDatabase: () => ({ prepare: () => ({ get: () => undefined }), getSetting: () => null }),
    getPluginDataDir: () => '/tmp',
    getConfig: () => config,
    setConfig: jest.fn(),
    registerRoute: (method, route, handler) => { routes[`${method}:${route}`] = handler; },
    registerSocket: jest.fn(),
    registerTikTokEvent: (event, handler) => { events[event] = handler; },
    log: jest.fn()
  };
  const plugin = new InteractiveStoryPlugin(api);
  plugin.currentSession = { id: 42, model: 'test-model' };
  plugin.currentChapter = { chapterNumber: 1, choices: ['Scout ahead', 'Make camp'] };
  plugin.votingSystem = { isActive: () => true, getStatus: () => ({ active: true }), processVote: jest.fn(() => true) };
  plugin.db.updateViewerStats = jest.fn();
  return { plugin, routes, events, io };
}

describe('Interactive Story pen-and-paper integration', () => {
  test('joins on the exact configured keyword before vote filtering and publishes a public roster', () => {
    const { plugin, events, io } = createPlugin({ storyMode: 'dnd', dndJoinKeyword: '!party' });
    plugin.participantRegistry = {
      join: jest.fn(() => ({ username: 'Alice', roleId: 'mage', roleName: 'Mage', status: 'active' })),
      recordVote: jest.fn(),
      list: jest.fn(() => [{ username: 'Alice', roleId: 'mage', roleName: 'Mage', status: 'active' }])
    };
    plugin._registerTikTokHandlers();

    events.chat({ uniqueId: 'alice-id', nickname: 'Alice', comment: ' !PARTY ' });
    events.chat({ uniqueId: 'bob-id', nickname: 'Bob', comment: '!party now' });

    expect(plugin.participantRegistry.join).toHaveBeenCalledTimes(1);
    expect(plugin.participantRegistry.join).toHaveBeenCalledWith(42, 'alice-id', 'Alice', 1);
    expect(io.emit).toHaveBeenCalledWith('story:dnd-participant-joined', expect.objectContaining({ username: 'Alice', roleId: 'mage' }));
    expect(io.emit).toHaveBeenCalledWith('story:dnd-participants-updated', [{ username: 'Alice', roleId: 'mage', roleName: 'Mage', status: 'active' }]);
    expect(plugin.votingSystem.processVote).toHaveBeenCalledTimes(1);
  });

  test('records only accepted participant votes and resolves missed rounds before the next chapter', async () => {
    const { plugin, events, io } = createPlugin({ storyMode: 'dnd' });
    plugin.participantRegistry = {
      recordVote: jest.fn(),
      resolveRound: jest.fn(() => ({
        updated: [{ username: 'Alice', missedRounds: 1, status: 'active' }],
        eliminated: [{ username: 'Bob', roleId: 'warrior', roleName: 'Warrior', missedRounds: 2, status: 'eliminated' }]
      })),
      list: jest.fn(() => [{ username: 'Alice', roleId: 'mage', roleName: 'Mage', status: 'active' }])
    };
    plugin._registerTikTokHandlers();
    events.chat({ uniqueId: 'alice-id', nickname: 'Alice', comment: '!a' });
    plugin.votingSystem.processVote.mockReturnValue(false);
    events.chat({ uniqueId: 'ignored-id', nickname: 'Ignored', comment: '!b' });
    plugin._generateNextChapterFromChoice = jest.fn().mockResolvedValue({});

    await plugin._handleVoteResults({ winnerIndex: 0, totalVotes: 1 });

    expect(plugin.participantRegistry.recordVote).toHaveBeenCalledWith(42, 'alice-id', 1);
    expect(plugin.participantRegistry.recordVote).toHaveBeenCalledTimes(1);
    expect(plugin.participantRegistry.resolveRound).toHaveBeenCalledWith(42, 1);
    expect(io.emit).toHaveBeenCalledWith('story:dnd-player-eliminated', expect.objectContaining({ username: 'Bob', status: 'eliminated' }));
    expect(plugin._generateNextChapterFromChoice).toHaveBeenCalledWith(0);
  });

  test('exposes only public participant snapshots through status and lifecycle routes', () => {
    const { plugin, routes } = createPlugin({ storyMode: 'dnd', dndJoinKeyword: '!join' });
    plugin.participantRegistry = {
      list: jest.fn((sessionId, options) => options.includeEliminated
        ? [{ username: 'Alice', roleId: 'mage', roleName: 'Mage', status: 'active' }, { username: 'Bob', status: 'eliminated' }]
        : [{ username: 'Alice', roleId: 'mage', roleName: 'Mage', status: 'active' }]),
      join: jest.fn(() => ({ username: 'Alice', roleId: 'mage', roleName: 'Mage', status: 'active' })),
      reset: jest.fn()
    };
    plugin._registerRoutes();
    const json = jest.fn();
    routes['get:/api/interactive-story/status']({}, { json });

    expect(json.mock.calls[0][0]).toEqual(expect.objectContaining({
      storyMode: 'dnd', joinKeyword: '!join',
      activeParticipants: [{ username: 'Alice', roleId: 'mage', roleName: 'Mage', status: 'active' }],
      eliminatedParticipants: [{ username: 'Bob', status: 'eliminated' }]
    }));
    expect(JSON.stringify(json.mock.calls[0][0])).not.toContain('alice-id');
    expect(routes['post:/api/interactive-story/participants/join']).toEqual(expect.any(Function));
    expect(routes['post:/api/interactive-story/participants/reset']).toEqual(expect.any(Function));
  });

  test('adds active role summaries to the next chapter prompt only in pen-and-paper mode', () => {
    const engine = new StoryEngine(null, { info: jest.fn(), warn: jest.fn(), error: jest.fn() }, { language: 'English' });
    const normalPrompt = engine._buildChapterPrompt(engine.themes.fantasy, '', 2, 'Scout ahead', 2);
    const dndPrompt = engine._buildChapterPrompt(engine.themes.fantasy, '', 2, 'Scout ahead', 2, [
      { username: 'Alice', roleName: 'Mage' },
      { username: 'Rin', roleName: 'Ranger' }
    ]);

    expect(normalPrompt).not.toContain('ACTIVE PARTY');
    expect(dndPrompt).toContain('ACTIVE PARTY:\n- Alice: Mage\n- Rin: Ranger');
  });
});
