const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..', '..');
const pacing = require('../plugins/stream-monsters/streammonsters-rules-v8-pacing');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function renderGuide(locale = 'de') {
  const html = read('streammonsters/index.html')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: `https://ltth.app/streammonsters/?lang=${locale}`
  });
  dom.window.eval(read(
    'app/plugins/stream-monsters/streammonsters-rules-v8-pacing.js'
  ));
  dom.window.eval(read('js/streammonsters-guide.js'));
  return dom.window.document;
}

describe('Stream Monsters public Rules v8 tutorial', () => {
  test.each(['de', 'en', 'es', 'fr'])(
    'uses the Arcade Clash product label and subscriber positioning in %s',
    (locale) => {
      const document = renderGuide(locale);
      const arena = document.getElementById('arena').textContent;
      const page = document.body.textContent;

      expect(arena).toContain('Arcade Clash');
      expect(arena).not.toContain('Jackpot Clash');
      expect(page).toContain(
        JSON.parse(read('app/plugins/stream-monsters/product-contract.json'))
          .copy.subscription[locale]
      );
    }
  );

  test('explains the current incubation, free-egg and auto-hatch defaults', () => {
    const document = renderGuide('de');
    const rules = document.getElementById('rules').textContent;

    expect(rules).toContain('90 Sekunden');
    expect(rules).toContain('30 Sek.');
    expect(rules).toContain('1 Min.');
    expect(rules).toContain('2 Min.');
    expect(rules).toContain('5 Min.');
    expect(rules).toContain('10 Min.');
    expect(rules).toContain('30 Min.');
    expect(rules).toContain('86400 Sekunden');
    expect(rules).toContain('60 Sekunden');
    expect(rules).toContain('Auto-Hatch');
    expect(rules).toContain('300 Sekunden');
    expect(rules).not.toContain('Standard: 2 Minuten');
  });

  test.each([
    ['de', ['Portrait', 'A / B / C', 'Ergebnis', 'unteren 26 %', 'TikTok-Chat', 'Kamera']],
    ['en', ['Portrait', 'A / B / C', 'result', 'lower 26%', 'TikTok chat', 'camera']],
    ['es', ['vertical', 'A / B / C', 'resultado', '26 % inferior', 'chat de TikTok', 'c\u00e1mara']],
    ['fr', ['vertical', 'A / B / C', 'r\u00e9sultat', '26 % inf\u00e9rieurs', 'chat TikTok', 'cam\u00e9ra']]
  ])('explains the concise portrait battle flow in %s', (locale, tokens) => {
    const document = renderGuide(locale);
    const page = document.getElementById('main-content').textContent;
    tokens.forEach(token => expect(page).toContain(token));
  });

  const rosterSeconds = pacing.ROSTER_MS / 1000;
  const skillSeconds = pacing.SKILL_CHOICE_MS / 1000;
  const statSeconds = pacing.STAT_CHOICE_MS / 1000;
  test.each([
    ['de', [`${rosterSeconds} Sekunden`, `${skillSeconds} Sekunden`, `${statSeconds} Sekunden`, 'Runde 5', '30 %', 'K.-o.', 'Aufgabe']],
    ['en', [`${rosterSeconds} seconds`, `${skillSeconds} seconds`, `${statSeconds} seconds`, 'round 5', '30%', 'K.O.', 'Forfeit']],
    ['es', [`${rosterSeconds} segundos`, `${skillSeconds} segundos`, `${statSeconds} segundos`, 'ronda 5', '30 %', 'K.O.', 'abandono']],
    ['fr', [`${rosterSeconds} secondes`, `${skillSeconds} secondes`, `${statSeconds} secondes`, 'manche 5', '30 %', 'K.-O.', 'abandon']]
  ])('documents every decisive Rules v8 battle timing in %s', (locale, tokens) => {
    const document = renderGuide(locale);
    const arena = document.getElementById('arena').textContent;

    tokens.forEach(token => expect(arena).toContain(token));
    expect(arena).not.toContain('15 seconds');
    expect(arena).not.toContain('15 Sekunden');
  });

  test('renders every enabled standard alias as a complete chat command', () => {
    const document = renderGuide('de');
    const commandText = document.getElementById('command-reference').textContent;

    ['!eier', '!eierliste', '!meineeier', '!hatch', '!inventory', '!monsters',
      '!monster', '!choose', '!evolve', '!battle', '!leavebattle', '!rank',
      '!monsterrank', '!quests', '!adopt', '!adoptieren', '!monstershelp']
      .forEach(command => expect(commandText).toContain(command));
  });

  test.each([
    ['de', 'optional deaktiviert'],
    ['en', 'optional disabled'],
    ['es', 'opcional desactivado'],
    ['fr', 'optionnel désactivé']
  ])('marks !eggs as an inactive optional alias in %s', (locale, label) => {
    const document = renderGuide(locale);
    const disabledAlias = document.querySelector(
      '[data-command-alias="eggs"][data-command-enabled="false"]'
    );

    expect(disabledAlias).not.toBeNull();
    expect(disabledAlias.textContent).toContain('!eggs');
    expect(disabledAlias.textContent).toContain(label);
  });
});
