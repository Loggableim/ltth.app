const CommandParser = require('../plugins/music-bot/lib/command-parser');
const { execFileSync } = require('child_process');
const path = require('path');

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
  test('reloads local command modules with the Music Bot entry point', () => {
    const script = [
      "const entry = require.resolve('./plugins/music-bot/main');",
      "const parser = require.resolve('./plugins/music-bot/lib/command-parser');",
      'require(entry);',
      'const before = require.cache[parser];',
      'delete require.cache[entry];',
      'require(entry);',
      "process.stdout.write(before === require.cache[parser] ? 'stale' : 'fresh');"
    ].join(' ');

    const result = execFileSync(process.execPath, ['-e', script], {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8'
    });

    expect(result).toBe('fresh');
  });

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
