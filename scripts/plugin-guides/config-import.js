'use strict';

// Canonical guide facts for this plugin. Step wording and captures are
// assembled by the shared documentation renderer.
module.exports = Object.freeze({
  id: 'config-import',
  route: '/plugins/config-import/ui.html',
  topic: ['Backup-Datei, Export und Wiederherstellungsprüfung', 'backup file, export, and restore check', 'archivo de copia, exportación y comprobación de restauración', 'fichier de sauvegarde, export et contrôle de restauration'],
  test: ['einen Export in das temporäre Testprofil', 'an export into the temporary test profile', 'una exportación al perfil de prueba temporal', 'un export dans le profil de test temporaire'],
  expected: ['eine Testdatei wird erzeugt, ohne dein Produktivprofil zu überschreiben', 'a test file is created without overwriting your production profile', 'se crea un archivo de prueba sin sobrescribir tu perfil de producción', 'un fichier de test est créé sans écraser votre profil de production'],
  options: { safety: 'local', related: ['data-source', 'store-admin'] }
});
