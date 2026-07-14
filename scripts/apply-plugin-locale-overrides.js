'use strict';

// Human-reviewed corrections for the small set of labels that a static
// translation pass cannot safely infer (emoji-prefixed labels and mixed
// product-language strings). This is a one-off development migration.
const fs = require('fs');
const path = require('path');

const LOCALES = ['de', 'en', 'es', 'fr'];
const root = path.join(__dirname, '..', 'app', 'plugins');
const entries = [
  ['coinbattle', 'plugins.coinbattle.labels.auf_standard_zurucksetzen', ['🔄 Auf Standard zurücksetzen', '🔄 Reset to defaults', '🔄 Restablecer valores predeterminados', '🔄 Réinitialiser les valeurs par défaut']],
  ['coinbattle', 'plugins.coinbattle.labels.auflosung', ['Auflösung', 'Resolution', 'Resolución', 'Résolution']],
  ['coinbattle', 'plugins.coinbattle.labels.die_unten_gezeigte_vorschau_zeigt_die_elemente_in', ['Die unten gezeigte Vorschau zeigt die Elemente in ihrer Position im Grid.', 'The preview below shows the elements in their grid positions.', 'La vista previa de abajo muestra los elementos en su posición dentro de la cuadrícula.', 'L’aperçu ci-dessous montre les éléments à leur position dans la grille.']],
  ['goals', 'plugins.goals.labels.feuerwerk_finale_bei_zielerreichung', ['Feuerwerk-Finale bei Zielerreichung', 'Fireworks finale when the goal is reached', 'Final de fuegos artificiales al alcanzar el objetivo', 'Final de feux d’artifice lorsque l’objectif est atteint']],
  ['milestone-leaderboard', 'plugins.milestone-leaderboard.labels.alle_benutzer_zurucksetzen', ['🗑️ Alle Benutzer zurücksetzen', '🗑️ Reset all users', '🗑️ Restablecer todos los usuarios', '🗑️ Réinitialiser tous les utilisateurs']],
  ['milestone-leaderboard', 'plugins.milestone-leaderboard.labels.medien_hochladen', ['🎬 Medien hochladen', '🎬 Upload media', '🎬 Subir medios', '🎬 Importer un média']],
  ['milestone-leaderboard', 'plugins.milestone-leaderboard.labels.neue_stufe_hinzufugen', ['➕ Neue Stufe hinzufügen', '➕ Add new level', '➕ Añadir nivel', '➕ Ajouter un niveau']],
  ['openshock', 'plugins.openshock.labels.dauer_millisekunden', ['Dauer (Millisekunden)', 'Duration (milliseconds)', 'Duración (milisegundos)', 'Durée (millisecondes)']],
  ['openshock', 'plugins.openshock.labels.schritt_hinzufugen', ['➕ Schritt hinzufügen', '➕ Add step', '➕ Añadir paso', '➕ Ajouter une étape']],
  ['openshock', 'plugins.openshock.labels.schritte_hinzufugen_fur_vorschau', ['Schritte hinzufügen für Vorschau', 'Add steps for preview', 'Añadir pasos para la vista previa', 'Ajouter des étapes pour l’aperçu']],
  ['quiz-show', 'plugins.quiz-show.labels.die_unten_gezeigte_vorschau_zeigt_die_elemente_in', ['Die unten gezeigte Vorschau zeigt die Elemente in ihrer Position im Grid.', 'The preview below shows the elements in their grid positions.', 'La vista previa de abajo muestra los elementos en su posición dentro de la cuadrícula.', 'L’aperçu ci-dessous montre les éléments à leur position dans la grille.']],
  ['streamalchemy', 'plugins.streamalchemy.streamalchemy.fusion.config_title', ['Fusion-Einstellungen', 'Fusion settings', 'Ajustes de fusión', 'Paramètres de fusion']],
  ['tts', 'plugins.tts.labels.nachrichten_werden_in_der_reihenfolge_durchrotiert', ['Nachrichten werden in der Reihenfolge durchrotiert', 'Messages rotate in sequence', 'Los mensajes rotan en orden', 'Les messages tournent dans l’ordre']],
  ['tts', 'plugins.tts.labels.unterschiedliche_tts_nachrichten_je_nach_gift_wert_4', ['Unterschiedliche TTS-Nachrichten je nach Gift-Wert (4 Stufen)', 'Different TTS messages by gift value (4 levels)', 'Mensajes TTS distintos según el valor del regalo (4 niveles)', 'Messages TTS différents selon la valeur du cadeau (4 niveaux)']],
  ['tts', 'plugins.tts.labels.zeit_zwischen_nachrichten', ['Zeit zwischen Nachrichten', 'Time between messages', 'Tiempo entre mensajes', 'Temps entre les messages']]
];

function setValue(target, dottedKey, value) {
  const parts = dottedKey.split('.');
  const last = parts.pop();
  const parent = parts.reduce((current, part) => current[part], target);
  parent[last] = value;
}

const byPlugin = new Map();
entries.forEach(([plugin, key, values]) => {
  if (!byPlugin.has(plugin)) byPlugin.set(plugin, []);
  byPlugin.get(plugin).push([key, values]);
});

byPlugin.forEach((overrides, plugin) => {
  LOCALES.forEach((locale, index) => {
    const localePath = path.join(root, plugin, 'locales', `${locale}.json`);
    const localeData = JSON.parse(fs.readFileSync(localePath, 'utf8'));
    overrides.forEach(([key, values]) => setValue(localeData, key, values[index]));
    fs.writeFileSync(localePath, `${JSON.stringify(localeData, null, 2)}\n`, 'utf8');
  });
});

console.log(`Applied ${entries.length} reviewed locale overrides.`);
