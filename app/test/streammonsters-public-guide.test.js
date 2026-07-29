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
    const catalog = read('js/streammonsters-catalog.generated.js');
    const pagesBuilder = read('scripts/build_pages_bundle.py');
    const sitemap = read('sitemap.xml');

    expect(page).toContain('https://ltth.app/streammonsters');
    expect(page).toContain('/js/streammonsters-guide.js');
    expect(page).toContain('/css/streammonsters-guide.css');
    expect(page).toContain('id="monster-dex"');
    expect(page).toContain('id="command-reference"');
    expect(page).toContain('id="rules"');
    expect(page.indexOf('/js/streammonsters-catalog.generated.js'))
      .toBeLessThan(page.indexOf('/js/streammonsters-guide.js'));
    expect(page).toContain(
      '/js/streammonsters-catalog.generated.js?v=20260729'
    );
    expect(guide).toContain('STREAM_MONSTERS_PUBLIC_CATALOG');
    expect(catalog).toContain('"name": "Ashfang"');
    expect(catalog).toContain('"name": "Tsuki"');
    expect(catalog).toContain('"element": "Ember"');
    expect(catalog).toContain('"element": "Lunar"');
    expect(guide).toContain("de:");
    expect(guide).toContain("en:");
    expect(guide).toContain("es:");
    expect(guide).toContain("fr:");
    expect(catalog).toContain('/assets/streammonsters/furry/');
    expect(catalog).toContain('ashfang-stage3.webp');
    expect(page).toContain('/assets/streammonsters/furry/neonclaw.webp');
    expect(page).not.toContain('/assets/streammonsters/furry/neonclaw.png');
    expect(pagesBuilder).toContain('"streammonsters"');
    expect(pagesBuilder).not.toContain('app/plugins/streamalchemy/assets/streammonsters/furry');
    expect(sitemap).toContain('https://ltth.app/streammonsters/');
  });

  test('documents the implemented default aliases and fair battle controls', () => {
    const guide = read('js/streammonsters-guide.js');

    ['eier', 'eierliste', 'meineeier', 'eggs', 'hatch', 'monsters', 'monster', 'choose',
      'evolve', 'battle', 'leavebattle', 'rank', 'quests', 'adopt', 'adoptieren',
      'monstershelp', 'A', 'B', 'C'].forEach(token => expect(guide).toContain(token));
    expect(guide).toContain('86400');
    expect(guide).toContain('24');
    expect(guide).toContain('72');
  });

  test('publishes a compact WebP-only Furry roster for the public Monsterdex', () => {
    const furryDirectory = path.join(root, 'assets', 'streammonsters', 'furry');
    const webpFiles = fs.readdirSync(furryDirectory).filter(file => file.endsWith('.webp'));
    const pngFiles = fs.readdirSync(furryDirectory).filter(file => file.endsWith('.png'));

    expect(webpFiles).toHaveLength(24);
    expect(pngFiles).toHaveLength(0);
    expect(webpFiles).toEqual(expect.arrayContaining(['ashfang.webp', 'tsuki.webp']));
  });
});
