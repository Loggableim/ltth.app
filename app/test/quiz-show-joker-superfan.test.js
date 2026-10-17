const QuizShow = require('../plugins/quiz-show/main');

function createPlugin() {
  const handlers = {};
  const api = {
    registerTikTokEvent: jest.fn((type, handler) => { handlers[type] = handler; }),
    emit: jest.fn(),
    log: jest.fn()
  };
  const plugin = new QuizShow(api);
  plugin.gameState.isRunning = true;
  plugin.gameState.currentQuestion = { answers: ['A', 'B', 'C', 'D'], correct: 0 };
  plugin.activate5050Joker = jest.fn(() => ({ hiddenAnswers: [1, 2] }));
  plugin.playSound = jest.fn();
  plugin.handleJokerCommand = jest.spyOn(plugin, 'handleJokerCommand');
  plugin.registerTikTokEvents();
  return { plugin, api, chatHandler: handlers.chat };
}

describe('Quiz Show SuperFan-only joker permission', () => {
  test.each([
    ['fanclub member', { teamMemberLevel: 3 }],
    ['subscriber', { isSubscriber: true }],
    ['missing role', {}],
    ['explicit false', { isSuperFan: false, superFan: false }]
  ])('does not pass %s through to joker processing', async (_label, roleData) => {
    const { plugin, api, chatHandler } = createPlugin();
    await chatHandler({ uniqueId: 'audit-user', nickname: 'Audit User', message: '!joker50', ...roleData });

    expect(plugin.handleJokerCommand).not.toHaveBeenCalled();
    expect(plugin.gameState.jokersUsed['50']).toBe(0);
    expect(plugin.gameState.jokerEvents).toHaveLength(0);
    expect(api.emit).not.toHaveBeenCalledWith('quiz-show:joker-activated', expect.anything());
  });

  test('explicit SuperFan status reaches the actual joker handler and activates one joker', async () => {
    const { plugin, api, chatHandler } = createPlugin();
    await chatHandler({ uniqueId: 'audit-superfan', nickname: 'Audit SuperFan', message: '!joker50', isSuperFan: true });

    expect(plugin.handleJokerCommand).toHaveBeenCalledWith('audit-superfan', 'Audit SuperFan', '!joker50');
    expect(plugin.activate5050Joker).toHaveBeenCalledTimes(1);
    expect(plugin.gameState.jokersUsed['50']).toBe(1);
    expect(plugin.gameState.jokerEvents).toHaveLength(1);
    expect(api.emit).toHaveBeenCalledWith('quiz-show:joker-activated', expect.objectContaining({
      type: '50', userId: 'audit-superfan', isGiftActivated: false
    }));
  });
});
