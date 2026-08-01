const fs = require('fs');
const path = require('path');

const SCOPED_LOCALE_FILES = [
  ...['de', 'en', 'es', 'fr'].map(locale => path.join(__dirname, `../plugins/stream-monsters/locales/${locale}.json`)),
  ...['de', 'en', 'es', 'fr'].map(locale => path.join(__dirname, `../plugins/osc-bridge/locales/${locale}.json`)),
  ...['de', 'en', 'es', 'fr'].map(locale => path.join(__dirname, `../plugins/game-engine/locales/${locale}.json`)),
  ...['de', 'en', 'es', 'fr'].map(locale => path.join(__dirname, `../plugins/animazingpal/locales/${locale}.json`)),
  path.join(__dirname, '../locales/fr.json')
];

function stringLeaves(value, prefix = []) {
  if (typeof value === 'string') return [[prefix.join('.'), value]];
  if (!value || typeof value !== 'object') return [];

  return Object.entries(value).flatMap(([key, child]) => stringLeaves(child, [...prefix, key]));
}

function likelyLostCharacter(value) {
  const textWithoutUrls = value.replace(/https?:\/\/[^\s"']+/g, '');
  return /(?:[\p{L}]\?[\p{L}]|\?[\p{L}])/u.test(textWithoutUrls);
}

describe('scoped plugin locale character-loss regressions', () => {
  test('keeps accented UI text intact without treating URL queries as character loss', () => {
    const findings = SCOPED_LOCALE_FILES.flatMap(file => (
      stringLeaves(JSON.parse(fs.readFileSync(file, 'utf8')))
        .filter(([, value]) => likelyLostCharacter(value))
        .map(([key, value]) => `${path.relative(path.join(__dirname, '..'), file)}:${key}=${value}`)
    ));

    expect(likelyLostCharacter('https://localhost:3000/overlay?lang=fr&mode=preview')).toBe(false);
    const streamMonstersLocale = JSON.parse(fs.readFileSync(SCOPED_LOCALE_FILES[2], 'utf8'))
      .plugins.streamalchemy;
    expect(Object.keys(streamMonstersLocale)).toEqual(['ui']);
    expect(Object.keys(streamMonstersLocale.ui)).toEqual(['monsters']);
    expect(streamMonstersLocale.ui.monsters.title)
      .toBe('Stream Monsters · Portrait Arcade Rally');
    expect(streamMonstersLocale.ui.monsters.heartMeHelp).toContain('Team Heart');
    expect(JSON.parse(fs.readFileSync(SCOPED_LOCALE_FILES[7], 'utf8')).plugins['osc-bridge'].osc_bridge.config.target_host)
      .toBe('Hôte cible (IP de VRChat)');
    expect(JSON.parse(fs.readFileSync(SCOPED_LOCALE_FILES[7], 'utf8')).plugins['osc-bridge'].osc_bridge.custom_command.osc_value_help)
      .toBe('Valeur à envoyer (nombre, true, false ou texte)');
    expect(JSON.parse(fs.readFileSync(SCOPED_LOCALE_FILES[8], 'utf8')).plugins['game-engine'].labels.multi_wheel_system)
      .toBe('💡 Mehrere Glücksräder:');
    expect(JSON.parse(fs.readFileSync(SCOPED_LOCALE_FILES[15], 'utf8')).plugins.animazingpal.animazingpal.events.action_value)
      .toBe('Opération');
    expect(findings).toEqual([]);
  });
});
