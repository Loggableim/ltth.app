const CommandParser = require('../plugins/music-bot/lib/command-parser');

function createParser(commandAliases) {
  return new CommandParser({
    commandPrefix: '!',
    commands: { request: 'sr' },
    commandAliases: { request: commandAliases },
    permissions: { request: 'viewer' }
  }, null, null, null, {
    getDatabase: () => ({ prepare: () => ({ get: () => null }) }),
    log: jest.fn()
  }, null, null);
}

describe('Music Bot command parser', () => {
  test('accepts a request alias saved with the command prefix', async () => {
    const commands = [];
    const parser = createParser(['!play']);

    await parser.parse(
      { message: '!play I Need a Hero', username: 'viewer' },
      (command) => commands.push(command)
    );

    expect(commands).toEqual([{ type: 'request', query: 'I Need a Hero' }]);
  });
});
