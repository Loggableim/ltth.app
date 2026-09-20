const QuizShowPlugin = require('../plugins/quiz-show/main');
const Database = require('better-sqlite3');

describe('Quiz Show Plugin - Seeding', () => {
  let db;
  let plugin;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question TEXT NOT NULL,
        answers TEXT NOT NULL,
        correct INTEGER NOT NULL,
        category TEXT,
        difficulty INTEGER,
        info TEXT,
        package_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS question_packages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        category TEXT,
        question_count INTEGER,
        is_selected BOOLEAN DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE
      );
    `);

    const apiMock = {
      log: jest.fn(),
      emit: jest.fn(),
      getDatabase: () => ({ db })
    };

    plugin = new QuizShowPlugin(apiMock);
    plugin.db = db;
    plugin.mainDb = db;
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  test('seeds bundled Allgemeinwissen package on first call', async () => {
    await plugin.seedGeneralKnowledgePackage();

    const pkg = db.prepare('SELECT * FROM question_packages WHERE name = ?').get('Allgemeinwissen – 40 Fragen');
    expect(pkg).toBeDefined();
    expect(pkg.question_count).toBe(40);
    expect(pkg.category).toBe('Allgemeinwissen');

    const count = db.prepare('SELECT COUNT(*) as count FROM questions WHERE package_id = ?').get(pkg.id).count;
    expect(count).toBe(40);

    const category = db.prepare('SELECT * FROM categories WHERE name = ?').get('Allgemeinwissen');
    expect(category).toBeDefined();
  });

  test('is idempotent and does not re-seed if package already exists', async () => {
    await plugin.seedGeneralKnowledgePackage();
    await plugin.seedGeneralKnowledgePackage();

    const packages = db.prepare('SELECT * FROM question_packages WHERE name = ?').all('Allgemeinwissen – 40 Fragen');
    expect(packages.length).toBe(1);

    const count = db.prepare('SELECT COUNT(*) as count FROM questions WHERE package_id = ?').get(packages[0].id).count;
    expect(count).toBe(40);
  });
});
