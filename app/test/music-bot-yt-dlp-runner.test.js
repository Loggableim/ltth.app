const { EventEmitter } = require('events');
const YtDlpRunner = require('../plugins/music-bot/lib/yt-dlp-runner');

function makeChild(pid) {
  const child = new EventEmitter();
  child.pid = pid;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = jest.fn(() => true);
  return child;
}

function finish(child, output) {
  child.stdout.emit('data', Buffer.from(output));
  child.emit('close', 0);
}

describe('YtDlpRunner queue policy', () => {
  test('runs queued jobs by descending priority and preserves FIFO order for ties', async () => {
    const children = [];
    const spawnImpl = jest.fn(() => {
      const child = makeChild(children.length + 1);
      children.push(child);
      return child;
    });
    const runner = new YtDlpRunner({ maxConcurrent: 1, spawnImpl });
    const deadline = Date.now() + 10000;

    const first = runner.run('yt-dlp', ['first'], { deadline });
    const low = runner.run('yt-dlp', ['low'], { deadline, priority: -1 });
    const highFirst = runner.run('yt-dlp', ['high-first'], { deadline, priority: 5 });
    const highSecond = runner.run('yt-dlp', ['high-second'], { deadline, priority: 5 });

    expect(spawnImpl.mock.calls.map((call) => call[1][0])).toEqual(['first']);
    finish(children[0], ' first ');
    expect(spawnImpl.mock.calls.map((call) => call[1][0])).toEqual(['first', 'high-first']);
    finish(children[1], ' high-first ');
    expect(spawnImpl.mock.calls.map((call) => call[1][0])).toEqual(['first', 'high-first', 'high-second']);
    finish(children[2], ' high-second ');
    expect(spawnImpl.mock.calls.map((call) => call[1][0])).toEqual(['first', 'high-first', 'high-second', 'low']);
    finish(children[3], ' low ');

    await expect(Promise.all([first, highFirst, highSecond, low])).resolves.toEqual([
      'first', 'high-first', 'high-second', 'low'
    ]);
    expect(runner.getStatus()).toMatchObject({ active: 0, queued: 0, destroyed: false });
    await runner.destroy();
  });

  test('rejects work beyond the configured queue capacity and after destroy', async () => {
    const children = [];
    const runner = new YtDlpRunner({
      maxConcurrent: 1,
      maxQueue: 1,
      spawnImpl: jest.fn(() => {
        const child = makeChild(children.length + 1);
        children.push(child);
        return child;
      })
    });
    const deadline = Date.now() + 10000;
    const active = runner.run('yt-dlp', ['active'], { deadline });
    const queued = runner.run('yt-dlp', ['queued'], { deadline });

    await expect(runner.run('yt-dlp', ['overflow'], { deadline })).rejects.toThrow('yt-dlp queue is full');
    expect(runner.getStatus()).toMatchObject({ active: 1, queued: 1 });

    finish(children[0], 'active');
    finish(children[1], 'queued');
    await expect(Promise.all([active, queued])).resolves.toEqual(['active', 'queued']);
    await runner.destroy();

    await expect(runner.run('yt-dlp', ['after-destroy'], { deadline })).rejects.toMatchObject({
      name: 'AbortError',
      code: 'ABORT_ERR'
    });
  });
});
