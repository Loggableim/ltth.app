const QuizShowPlugin = require('../plugins/quiz-show/main');
const Database = require('better-sqlite3');

describe('Quiz Show Plugin - category filter', () => {
  const defaultAnswers = JSON.stringify(['A', 'B', 'C', 'D']);

  const createPluginWithData = () => {
    const db = new Database(':memory:');

    db.exec(`
      CREATE TABLE questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question TEXT NOT NULL,
        answers TEXT NOT NULL,
        correct INTEGER NOT NULL,
        category TEXT,
        difficulty INTEGER,
        package_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE question_packages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        category TEXT,
        question_count INTEGER,
        is_selected BOOLEAN DEFAULT 0
      );
    `);

    const pkgId = db
      .prepare('INSERT INTO question_packages (name, category, question_count, is_selected) VALUES (?, ?, ?, 1)')
      .run('Mixed Package', 'Mixed', 2).lastInsertRowid;

    const insertQuestion = db.prepare(
      'INSERT INTO questions (question, answers, correct, category, difficulty, package_id) VALUES (?, ?, ?, ?, ?, ?)'
    );

    insertQuestion.run('Q1', defaultAnswers, 0, 'Science', 2, pkgId);
    insertQuestion.run('Q2', defaultAnswers, 1, 'History', 2, pkgId);

    const apiMock = {
      log: jest.fn(),
      emit: jest.fn(),
      getDatabase: () => ({ db })
    };

    const plugin = new QuizShowPlugin(apiMock);
    plugin.db = db;
    plugin.mainDb = db;

    // Ensure clean state and disable side effects for the test
    plugin.getTodaysAskedQuestionIds = jest.fn(() => new Set());
    plugin.recordQuestionAsked = jest.fn();
    plugin.getLastAskedMap = jest.fn(() => new Map());
    plugin.startTimer = jest.fn();
    plugin.playSound = jest.fn();
    plugin.broadcastGameState = jest.fn();
    plugin.preGenerateTTS = jest.fn();
    plugin.playTTS = jest.fn();

    return { plugin, db };
  };

  test('applies category filter even when packages are selected', async () => {
    const { plugin, db } = createPluginWithData();

    plugin.config.categoryFilter = ['History'];
    plugin.config.randomQuestions = true;

    await plugin.startRound();

    expect(plugin.gameState.currentQuestion.category).toBe('History');

    db.close();
  });
});
