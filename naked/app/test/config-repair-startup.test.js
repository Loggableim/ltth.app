const ConfigRepair = require('../modules/config-repair');

describe('ConfigRepair startup mode', () => {
  test('can skip expensive profile database repair during blocking startup repair', () => {
    const repair = new ConfigRepair(
      {
        getConfigDir: () => 'C:/tmp/ltth-config',
        ensureDirectoriesExist: jest.fn(),
        getUserConfigsDir: () => 'C:/tmp/ltth-config/user_configs'
      },
      {
        activeProfilePath: 'C:/tmp/ltth-config/active-profile.txt'
      },
      { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
    );

    repair.assertWritable = jest.fn();
    repair.repairOrphanedSqliteSidecars = jest.fn();
    repair.repairProfileDatabases = jest.fn();
    repair.recoverBackedUpBrokenProfiles = jest.fn();
    repair.repairActiveProfile = jest.fn();
    repair.writeReportIfNeeded = jest.fn();

    repair.runStartupRepair({ repairProfileDatabases: false });

    expect(repair.repairProfileDatabases).not.toHaveBeenCalled();
    expect(repair.repairActiveProfile).toHaveBeenCalledTimes(1);
  });
});
