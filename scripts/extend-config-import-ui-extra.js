const fs = require('fs');
const path = require('path');

const extra = {
  en: { userConfigs: 'User Configs', creatingBackup: 'Creating backup…', validating: 'Validating…', newKeys: 'New Keys', conflicts: 'Conflicts', dataFiles: 'Data Files', modeMergeDesc: 'Add missing settings only; existing values are kept.', modeReplaceDesc: 'Overwrite all matching settings with backup values.', importStatus: 'Importing…' },
  de: { userConfigs: 'Benutzerkonfigurationen', creatingBackup: 'Sicherung wird erstellt…', validating: 'Wird geprüft…', newKeys: 'Neue Schlüssel', conflicts: 'Konflikte', dataFiles: 'Datendateien', modeMergeDesc: 'Nur fehlende Einstellungen ergänzen; vorhandene Werte bleiben erhalten.', modeReplaceDesc: 'Alle passenden Einstellungen mit Sicherungswerten überschreiben.', importStatus: 'Wird importiert…' },
  es: { userConfigs: 'Configuraciones de usuario', creatingBackup: 'Creando copia…', validating: 'Validando…', newKeys: 'Claves nuevas', conflicts: 'Conflictos', dataFiles: 'Archivos de datos', modeMergeDesc: 'Añade solo ajustes que faltan; conserva los valores existentes.', modeReplaceDesc: 'Sobrescribe todos los ajustes coincidentes con los valores de la copia.', importStatus: 'Importando…' },
  fr: { userConfigs: 'Configurations utilisateur', creatingBackup: 'Création de la sauvegarde…', validating: 'Vérification…', newKeys: 'Nouvelles clés', conflicts: 'Conflits', dataFiles: 'Fichiers de données', modeMergeDesc: 'Ajoute uniquement les réglages manquants et conserve les valeurs existantes.', modeReplaceDesc: 'Écrase tous les réglages correspondants avec ceux de la sauvegarde.', importStatus: 'Importation…' }
};

for (const [locale, values] of Object.entries(extra)) {
  const file = path.join(__dirname, '..', 'app', 'plugins', 'config-import', 'locales', `${locale}.json`);
  const current = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  current['config-import'].ui = { ...(current['config-import'].ui || {}), ...values };
  fs.writeFileSync(file, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
}
