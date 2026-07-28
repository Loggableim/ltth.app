const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

describe('Stream Monsters public guide', () => {
  test('publishes a dedicated, localized overview at /streammonsters', () => {
    const page = read('streammonsters/index.html');
    const guide = read('js/streammonsters-guide.js');
    const pagesBuilder = read('scripts/build_pages_bundle.py');

    expect(page).toContain('https://ltth.app/streammonsters');
    expect(page).toContain('/js/streammonsters-guide.js');
    expect(page).toContain('/css/streammonsters-guide.css');
    expect(page).toContain('id="monster-dex"');
    expect(page).toContain('id="command-reference"');
    expect(page).toContain('id="rules"');
    expect(guide).toContain('Ashfang');
    expect(guide).toContain('Tsuki');
    expect(guide).toContain("'Ember'");
    expect(guide).toContain("'Lunar'");
    expect(guide).toContain("de:");
    expect(guide).toContain("en:");
    expect(guide).toContain("es:");
    expect(guide).toContain("fr:");
    expect(guide).toContain('/assets/streammonsters/furry/');
    expect(pagesBuilder).toContain('"streammonsters"');
    expect(pagesBuilder).toContain('assets/streammonsters/furry');
  });

  test('documents the implemented default aliases and fair battle controls', () => {
    const guide = read('js/streammonsters-guide.js');

    ['eier', 'eierliste', 'meineeier', 'hatch', 'monsters', 'monster', 'choose',
      'evolve', 'battle', 'leavebattle', 'rank', 'quests', 'adopt', 'adoptieren',
      'monstershelp', 'A', 'B', 'C'].forEach(token => expect(guide).toContain(token));
    expect(guide).toContain('86400');
    expect(guide).toContain('24');
    expect(guide).toContain('72');
  });
});
