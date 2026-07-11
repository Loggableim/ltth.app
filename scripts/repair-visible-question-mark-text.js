const fs = require('fs');

const replacements = new Map([
  ['Vollst?ndige', 'Vollständige'],
  ['Browser?Source', 'Browser-Source'],
  ['Auth?Token', 'Auth-Token'],
  ['Live?Updates', 'Live-Updates'],
  ['duraci?n', 'duración'],
  ['funci?n', 'función'],
  ['l?autorisation', "l'autorisation"],
  ['synth?se', 'synthèse'],
  ['Animaze-Ausgabeger?t', 'Animaze-Ausgabegerät'],
  ['Ausgabe-Ger?t', 'Ausgabe-Gerät'],
  ['Audioger?t', 'Audiogerät'],
  ['ausw?hlen', 'auswählen'],
  ['pr?fen', 'prüfen'],
  ['ausf?hren', 'ausführen'],
  ['Ti?ng Vi?t', 'Tiếng Việt'],
  ['??? Profilbild', '🖼️ Profilbild'],
  ['vollst?ndig', 'vollständig'],
  ['pers?nlich', 'persönlich'],
  ['N?chster', 'Nächster'],
  ['f?r', 'für'],
  ['verf?gbar', 'verfügbar'],
  ['?nderungen', 'Änderungen'],
  ['k?nnen', 'können'],
  ['hinzuf?gen', 'hinzufügen']
]);

const files = [
  'app/locales/es.json',
  'app/locales/fr.json',
  'app/plugins/animazingpal/main.js',
  'app/plugins/goals/ui.html',
  'app/plugins/stt-ticker/ui.html',
  'app/plugins/tts/utils/language-detector.js',
  'app/public/js/emoji-rain-ui.js',
  'app/public/js/webgpu-emoji-rain-ui.js',
  'features/plugin-system.html',
  'features/toptier.html'
];

for (const file of files) {
  let source = fs.readFileSync(file, 'utf8');
  for (const [from, to] of replacements) source = source.split(from).join(to);
  if (file === 'app/plugins/goals/ui.html') source = source.split('<span>???</span>').join('<span>👁️</span>');
  if (file === 'features/plugin-system.html') {
    const icons = ['🔌', '🧩', '🔄', '🛠️', '🪝', '🛡️', '🎙️', '🎨', '🎮', '📡', '🧰', '🔒'];
    let iconIndex = 0;
    source = source.replace(/\?{2,3}/g, () => icons[iconIndex++] || '•');
  }
  fs.writeFileSync(file, source, 'utf8');
}

// Restore native language names that were lost in legacy selector data.
for (const file of ['app/plugins/stt-ticker/ui.html', 'app/plugins/tts/utils/language-detector.js']) {
  let source = fs.readFileSync(file, 'utf8');
  const pairs = [
    ["'ru', '???????'", "'ru', 'Русский'"], ["'ja', '???'", "'ja', '日本語'"],
    ["'ko', '???'", "'ko', '한국어'"], ["'ar', '???????'", "'ar', 'العربية'"],
    ["'uk', '??????????'", "'uk', 'Українська'"], ["'el', '????????'", "'el', 'Ελληνικά'"],
    ["'he', '?????'", "'he', 'עברית'"], ["'th', '???'", "'th', 'ไทย'"],
    ["'zh', '??'", "'zh', '中文'"],
    ["'ru': '???????'", "'ru': 'Русский'"], ["'ja': '???'", "'ja': '日本語'"],
    ["'ko': '???'", "'ko': '한국어'"], ["'ar': '???????'", "'ar': 'العربية'"],
    ["'uk': '??????????'", "'uk': 'Українська'"], ["'el': '????????'", "'el': 'Ελληνικά'"],
    ["'he': '?????'", "'he': 'עברית'"], ["'th': '???????'", "'th': 'ไทย'"], ["'th': '???'", "'th': 'ไทย'"],
    ["'zh': '??'", "'zh': '中文'"]
  ];
  for (const [from, to] of pairs) source = source.split(from).join(to);
  fs.writeFileSync(file, source, 'utf8');
}

console.log(`Repaired visible question-mark text in ${files.length} active files.`);

const localeValues = {
  de: {
    '2ac559309248': 'Vollständige API-Dokumentation:',
    '78bfe0a5f067': 'Einfache Integration als Browser-Source mit konfigurierbaren URLs, Auth-Token und Live-Updates ohne Neustart.'
  },
  en: {
    '2ac559309248': 'Full API documentation:',
    '78bfe0a5f067': 'Easy integration as a browser source with configurable URLs, auth token and live updates without restarting.'
  },
  es: {
    '2ac559309248': 'Documentación completa de la API:',
    '78bfe0a5f067': 'Integración sencilla como Browser Source con URLs configurables, token de autenticación y actualizaciones en vivo sin reiniciar.'
  },
  fr: {
    '2ac559309248': 'Documentation complète de l’API :',
    '78bfe0a5f067': 'Intégration simple comme source navigateur avec URL configurables, jeton d’authentification et mises à jour en direct sans redémarrage.'
  }
};
for (const [locale, values] of Object.entries(localeValues)) {
  const file = `locales/${locale}.json`;
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  json.generated = json.generated || {};
  Object.assign(json.generated, values);
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n', 'utf8');
}
