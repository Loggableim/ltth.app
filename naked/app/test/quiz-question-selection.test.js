const QuizShowPlugin = require('../plugins/quiz-show/main');

describe('Quiz Show Plugin - Question Selection', () => {
    const createPlugin = () => {
        const plugin = new QuizShowPlugin({ log: () => {} });
        plugin.config.totalRounds = 10;
        plugin.config.randomQuestions = true;
        plugin.gameState.currentRound = 0;
        plugin.getLastAskedMap = jest.fn().mockReturnValue(new Map());
        return plugin;
    };

    test('prefers harder questions in late rounds when available', () => {
        const plugin = createPlugin();
        plugin.gameState.currentRound = 7; // Round 8 should target hard questions

        const availableQuestions = [
            { id: 1, difficulty: 1 },
            { id: 2, difficulty: 2 },
            { id: 3, difficulty: 3 }
        ];

        const selected = plugin.selectNextQuestion(availableQuestions);
        expect(selected.id).toBe(3);
    });

    test('falls back to higher difficulties when preferred bucket is empty', () => {
        const plugin = createPlugin();
        plugin.gameState.currentRound = 7; // Prefers difficulty 3, but none exist

        const availableQuestions = [
            { id: 10, difficulty: 4 },
            { id: 11, difficulty: 1 }
        ];

        const selected = plugin.selectNextQuestion(availableQuestions);
        expect(selected.id).toBe(10);
    });

    test('prioritizes least recently asked within the same difficulty', () => {
        const plugin = createPlugin();
        const historyMap = new Map();
        historyMap.set(1, Date.now()); // Recently asked
        // Question 2 has no history entry => treated as oldest/never asked
        plugin.getLastAskedMap = jest.fn().mockReturnValue(historyMap);

        const availableQuestions = [
            { id: 1, difficulty: 1 },
            { id: 2, difficulty: 1 }
        ];

        const selected = plugin.selectNextQuestion(availableQuestions);
        expect(selected.id).toBe(2);
    });
});
