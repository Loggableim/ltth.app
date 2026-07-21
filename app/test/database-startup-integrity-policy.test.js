jest.mock('better-sqlite3', () => jest.fn());

const Database = require('better-sqlite3');
const DatabaseManager = require('../modules/database');

function createDatabaseMock(integrityResult = [{ integrity_check: 'ok' }]) {
  return {
    open: true,
    close: jest.fn(),
    pragma: jest.fn(() => integrityResult),
    prepare: jest.fn(() => ({
      get: jest.fn(() => ({ name: 'settings' })),
      run: jest.fn(),
      all: jest.fn()
    }))
  };
}

describe('DatabaseManager startup integrity policy', () => {
  let initializeTables;
  let setupShutdownHandler;

  beforeEach(() => {
    initializeTables = jest.spyOn(DatabaseManager.prototype, 'initializeTables').mockImplementation(() => {});
    setupShutdownHandler = jest.spyOn(DatabaseManager.prototype, 'setupShutdownHandler').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    Database.mockReset();
  });

  test('opens an existing database without running integrity_check', () => {
    const database = createDatabaseMock();
    Database.mockImplementation(() => database);

    new DatabaseManager('C:\\profiles\\default.db');

    expect(database.pragma).not.toHaveBeenCalled();
    expect(initializeTables).toHaveBeenCalledTimes(1);
    expect(setupShutdownHandler).toHaveBeenCalledTimes(1);
  });

  test('runs integrity_check only through the explicit diagnostic method', () => {
    const database = createDatabaseMock([{ integrity_check: '*** corrupt ***' }]);
    Database.mockImplementation(() => database);
    const manager = new DatabaseManager('C:\\profiles\\default.db');
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      expect(() => manager.assertDatabaseIntegrity()).toThrow('DATABASE_CORRUPTED');
    } finally {
      consoleError.mockRestore();
    }
    expect(database.pragma).toHaveBeenCalledWith('integrity_check');
  });
});
