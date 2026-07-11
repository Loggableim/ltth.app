#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const roots = [
  path.join(__dirname, '..', 'locales'),
  path.join(__dirname, '..', 'app', 'locales'),
  path.join(__dirname, '..', 'app', 'plugins')
];
const marker = /(?:�.|�.|�.|�.|�|�)/g;

function repairString(value) {
  let result = String(value);
  for (let pass = 0; pass < 2; pass += 1) {
    const candidate = Buffer.from(result, 'latin1').toString('utf8');
    const currentScore = (result.match(marker) || []).length;
    const candidateScore = (candidate.match(marker) || []).length;
    if (candidateScore < currentScore) result = candidate;
    else break;
  }
  return result;
}

const REPLACEMENTS = {
  de: [
    ['läuft', 'läuft'], ['L?uft', 'Läuft'], ['F?r', 'Für'], ['für', 'für'], ['F?hr', 'Führ'], ['f?hr', 'führ'],
    ['über', 'über'], ['Verf?g', 'Verfüg'], ['ben?tigt', 'benötigt'], ['n?tig', 'nötig'], ['h?lt', 'hält'], ['h?ufig', 'häufig'],
    ['können', 'können'], ['K?nnen', 'Können'], ['m?ssen', 'müssen'], ['w?hrend', 'während'], ['sp?ter', 'später'],
    ['M?glich', 'Möglich'], ['m?glich', 'möglich'], ['l?sst', 'lässt'], ['L?sung', 'Lösung'], ['l?sung', 'lösung'],
    ['f?llt', 'fällt'], ['n?chste', 'nächste'], ['N?chste', 'Nächste'], ['pr?f', 'prüf'], ['Pr?f', 'Prüf'],
    ['unterstützt', 'unterstützt'], ['Unterst?tzt', 'Unterstützt'], ['?ffne', 'öffne'], ['?ffnen', 'öffnen'], ['?ffentlich', 'öffentlich'],
    ['propriet?r', 'proprietär'], ['Proprietärer', 'Proprietärer'], ['f?hig', 'fähig'], ['k?mmern', 'kümmern'], ['herunterlädt', 'herunterlädt'],
    ['?Weitere', '„Weitere'], ['?Trotzdem', '„Trotzdem'], ['für', 'für'], ['über', 'über']
  ],
  es: [
    ['sesi?n', 'sesión'], ['n?cleo', 'núcleo'], ['configuración', 'configuración'], ['aplicaci?n', 'aplicación'], ['m?s', 'más'],
    ['instalaci?n', 'instalación'], ['p?gina', 'página'], ['est? ', 'está '], ['también', 'también'], ['versi?n', 'versión'],
    ['tecnolog?a', 'tecnología'], ['documentaci?n', 'documentación'], ['autom?t', 'automát'], ['descripción', 'descripción'],
    ['conexión', 'conexión'], ['pr?xima', 'próxima'], ['pr?ximos', 'próximos'], ['sí ', 'sí '], ['?Qu?', '¿Qué'], ['?C?mo', '¿Cómo'],
    ['?Cu?l', '¿Cuál'], ['?Qui?n', '¿Quién'], ['?Est?', '¿Está'], ['?LTTH', '¿LTTH'], ['C?digo', 'Código'], ['c?digo', 'código'],
    ['peque?a', 'pequeña'], ['aplicaci?n', 'aplicación'], ['a?n', 'aún'], ['c?digo', 'código'], ['m?todo', 'método'], ['ejec?talo', 'ejecútalo'],
    ['ej?cuta', 'ejecuta'], ['Encontrar?s', 'Encontrarás'], ['públicos', 'públicos'], ['producci?n', 'producción'], ['est?n', 'están'], ['T?cnico', 'Técnico'],
    ['?Pup', '¿Pup'], ['?Debo', '¿Debo'], ['?La ', '¿La '], ['?Necesito', '¿Necesito'], ['?Mis ', '¿Mis ']
  ],
  fr: [
    ['c?ur', 'cœur'], ['síex', 's’ex'], ['n?cess', 'nécess'], ['d?taill', 'détaill'], ['t?l?charg', 'télécharg'],
    ['r?gl', 'régl'], ['configur?e', 'configurée'], ['d?velopp', 'développ'], ['d?pend', 'dépend'], ['sípar', 'sépar'],
    ['cr?e', 'crée'], ['personnalisí', 'personnalisé'], ['pr?t', 'prêt'], ['propri?t', 'propriété'], ['d?monstr', 'démonstr'],
    ['déjà', 'déjà'], ['m?thod', 'méthod'], ['recommand?', 'recommandé'], ['n?cessit', 'nécessit'], ['síexécute', 's’exécute'],
    ['sípar?e', 'séparée'], ['détaillée', 'détaillée'], ['r?fürence', 'référence'], ['d?pannage', 'dépannage'], ['d?p?t', 'dépôt'],
    ['t?l?charg', 'télécharg'], ['pr?vue', 'prévue'], ['pr?t', 'prêt'], ['sign?e', 'signée'], ['sign?es', 'signées'], ['donn?es', 'données'],
    ['b?ta', 'bêta'], ['fonctionnalit?s', 'fonctionnalités'], ['mises ? jour', 'mises à jour'], ['? jour', 'à jour'], ['Recommand?', 'Recommandé'],
    ['exécutez', 'exécutez'], ['systèmes', 'systèmes'], ['d?tails', 'détails'], ['fr?quentes', 'fréquentes']
  ]
};

function repairReplacementMarkers(value, language) {
  let result = value;
  for (const [from, to] of REPLACEMENTS[language] || []) result = result.split(from).join(to);
  return result;
}

function repairValue(value, language) {
  if (typeof value === 'string') return repairReplacementMarkers(repairString(value), language);
  if (Array.isArray(value)) return value.map(child => repairValue(child, language));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, repairValue(child, language)]));
  }
  return value;
}

function repairFile(file) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return false;
  }
  const fileName = path.basename(file).toLowerCase();
  const language = ['de', 'en', 'es', 'fr'].find(locale => fileName === `${locale}.json` || fileName.includes(`-${locale}.json`)) || 'en';
  const repaired = repairValue(parsed, language);
  fs.writeFileSync(file, `${JSON.stringify(repaired, null, 2)}\n`, 'utf8');
  return true;
}

function walk(directory) {
  let count = 0;
  if (!fs.existsSync(directory)) return count;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) count += walk(full);
    else if (entry.name.endsWith('.json') && repairFile(full)) count += 1;
  }
  return count;
}

console.log(`Repaired ${roots.reduce((count, root) => count + walk(root), 0)} locale JSON files.`);
