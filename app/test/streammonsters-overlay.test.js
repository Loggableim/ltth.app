const fs = require('fs');
const path = require('path');

describe('Stream Monsters OBS overlay', () => {
  test('listens to semantic egg, hatch, event and battle events', () => {
    const html = fs.readFileSync(path.join(process.cwd(), 'plugins', 'streamalchemy', 'streammonsters-overlay.html'), 'utf8');

    expect(html).toContain('streammonsters:egg_spawned');
    expect(html).toContain('streammonsters:egg_boosted');
    expect(html).toContain('streammonsters:gift_combo');
    expect(html).toContain('streammonsters:egg_hatched');
    expect(html).toContain('streammonsters:stream_started');
    expect(html).toContain('streammonsters:battle_started');
    expect(html).toContain('streammonsters:battle_completed');
    expect(html).toContain('!inventory');
  });
});
