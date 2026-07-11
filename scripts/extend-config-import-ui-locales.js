const fs = require('fs');
const path = require('path');

const ui = {
  en: {
    pageTitle: 'Config Backup & Restore - Pup Cid\'s Little TikTool Helper',
    heroTitle: '💾 Config Backup & Restore',
    heroDescription: 'Export your current configuration to a secure backup, restore from a previous backup, or migrate from an older installation.',
    tabExport: '📤 Export Backup',
    tabImport: '📥 Import Backup',
    tabLegacy: '🗂️ Legacy Import',
    exportTitle: '📤 Export Current Configuration',
    exportDescription: 'Create a complete backup ZIP of your settings. The backup can be restored later using the Import tab.',
    whatToInclude: 'What to include',
    exportButton: '📦 Create Backup ZIP',
    backupCreated: '✅ Backup Created',
    importTitle: '📥 Import Backup File',
    importDescription: 'Upload a ZIP backup file created by this tool. The backup will be previewed before anything is changed.',
    dropBackup: 'Drop your backup ZIP here',
    browseFiles: 'or click to browse files',
    removeFile: 'Remove file',
    validateButton: '🔍 Validate & Preview',
    previewTitle: '🔍 Import Preview',
    pluginDetails: 'Plugin details',
    importMode: 'Import mode',
    modeMerge: '🔀 Merge (keep existing settings)',
    modeReplace: '♻️ Replace (overwrite settings)',
    sectionsRestore: 'Sections to restore',
    globalSettings: '🌍 Global Settings',
    pluginSettings: '🔌 Plugin Settings',
    pluginData: '📁 Plugin Data Files',
    uploads: '🖼️ Uploads',
    userData: '🗄️ User Data',
    importButton: '🚀 Import Selected Data',
    cancelButton: 'Cancel',
    resultTitle: '📋 Import Result',
    showDetails: '🔽 Show Details',
    hideDetails: '🔼 Hide Details',
    importAnother: '📥 Import Another Backup',
    detectedOldConfigs: 'Detected Old Configs',
    detectedOldConfigsDesc: 'Known LTTH locations were scanned for old profiles, plugin data, uploads, and user data.',
    legacyTitle: '🗂️ Import from Old Installation Path',
    legacyDescription: 'Enter the directory where your old LTTH installation was installed. The tool will scan for configuration files and import them into the current persistent storage location.',
    oldInstallationPath: 'Old Installation Path',
    pathPlaceholder: 'e.g. C:\\Users\\You\\ltth or /home/you/ltth',
    scanButton: '🔍 Scan',
    importedProfileName: 'Profile name for imported config (optional)',
    profilePlaceholder: 'imported-config',
    foundInPath: 'Found in path',
    importLegacyButton: '🚀 Import from this path',
    importing: 'Importing…',
    noPluginSettings: 'No plugin settings in this backup.',
    found: 'Found',
    filesDetected: 'file(s) detected',
    importResult: '📋 Import Result',
    backupApiUnavailable: 'Could not reach the backup API. Make sure the server is running.',
    backupNotReady: 'Backup system not fully initialised. Export may be unavailable.'
  },
  de: {
    pageTitle: 'Konfigurationssicherung & Wiederherstellung – Pup Cids Little TikTool Helper',
    heroTitle: '💾 Konfiguration sichern & wiederherstellen',
    heroDescription: 'Exportiere deine aktuelle Konfiguration als sichere Sicherung, stelle eine frühere Sicherung wieder her oder migriere eine ältere Installation.',
    tabExport: '📤 Sicherung exportieren', tabImport: '📥 Sicherung importieren', tabLegacy: '🗂️ Legacy-Import',
    exportTitle: '📤 Aktuelle Konfiguration exportieren', exportDescription: 'Erstelle eine vollständige ZIP-Sicherung deiner Einstellungen. Du kannst sie später im Import-Tab wiederherstellen.', whatToInclude: 'Einschließen', exportButton: '📦 ZIP-Sicherung erstellen', backupCreated: '✅ Sicherung erstellt',
    importTitle: '📥 Sicherungsdatei importieren', importDescription: 'Lade eine mit diesem Tool erstellte ZIP-Sicherung hoch. Vor Änderungen wird eine Vorschau angezeigt.', dropBackup: 'Sicherungs-ZIP hier ablegen', browseFiles: 'oder klicken, um Dateien auszuwählen', removeFile: 'Datei entfernen', validateButton: '🔍 Prüfen & Vorschau', previewTitle: '🔍 Importvorschau', pluginDetails: 'Plugin-Details', importMode: 'Importmodus', modeMerge: '🔀 Zusammenführen (bestehende Einstellungen behalten)', modeReplace: '♻️ Ersetzen (Einstellungen überschreiben)', sectionsRestore: 'Wiederherzustellende Bereiche', globalSettings: '🌍 Globale Einstellungen', pluginSettings: '🔌 Plugin-Einstellungen', pluginData: '📁 Plugin-Datendateien', uploads: '🖼️ Uploads', userData: '🗄️ Benutzerdaten', importButton: '🚀 Ausgewählte Daten importieren', cancelButton: 'Abbrechen', resultTitle: '📋 Importergebnis', showDetails: '🔽 Details anzeigen', hideDetails: '🔼 Details ausblenden', importAnother: '📥 Weitere Sicherung importieren',
    detectedOldConfigs: 'Alte Konfigurationen erkannt', detectedOldConfigsDesc: 'Bekannte LTTH-Speicherorte wurden nach alten Profilen, Plugin-Daten, Uploads und Benutzerdaten durchsucht.', legacyTitle: '🗂️ Aus altem Installationspfad importieren', legacyDescription: 'Gib den Ordner deiner alten LTTH-Installation ein. Das Tool sucht nach Konfigurationsdateien und importiert sie in den aktuellen dauerhaften Speicher.', oldInstallationPath: 'Alter Installationspfad', pathPlaceholder: 'z. B. C:\\Users\\Du\\ltth oder /home/du/ltth', scanButton: '🔍 Suchen', importedProfileName: 'Profilname für importierte Konfiguration (optional)', profilePlaceholder: 'importierte-konfiguration', foundInPath: 'Im Pfad gefunden', importLegacyButton: '🚀 Aus diesem Pfad importieren', importing: 'Wird importiert…', noPluginSettings: 'Keine Plugin-Einstellungen in dieser Sicherung.', found: 'Gefunden', filesDetected: 'Datei(en) erkannt', importResult: '📋 Importergebnis', backupApiUnavailable: 'Die Sicherungs-API ist nicht erreichbar. Stelle sicher, dass der Server läuft.', backupNotReady: 'Das Sicherungssystem ist nicht vollständig initialisiert. Der Export ist eventuell nicht verfügbar.'
  },
  es: {
    pageTitle: 'Copia y restauración de configuración - Pup Cid\'s Little TikTool Helper', heroTitle: '💾 Copia y restauración de configuración', heroDescription: 'Exporta tu configuración actual a una copia segura, restaura una copia anterior o migra una instalación antigua.', tabExport: '📤 Exportar copia', tabImport: '📥 Importar copia', tabLegacy: '🗂️ Importación antigua', exportTitle: '📤 Exportar configuración actual', exportDescription: 'Crea un ZIP completo de tus ajustes. Podrás restaurarlo más tarde desde la pestaña Importar.', whatToInclude: 'Qué incluir', exportButton: '📦 Crear ZIP de copia', backupCreated: '✅ Copia creada', importTitle: '📥 Importar archivo de copia', importDescription: 'Sube un ZIP creado por esta herramienta. Verás una vista previa antes de cambiar nada.', dropBackup: 'Suelta aquí tu ZIP de copia', browseFiles: 'o haz clic para buscar archivos', removeFile: 'Quitar archivo', validateButton: '🔍 Validar y previsualizar', previewTitle: '🔍 Vista previa de importación', pluginDetails: 'Detalles de plugins', importMode: 'Modo de importación', modeMerge: '🔀 Combinar (conservar ajustes existentes)', modeReplace: '♻️ Reemplazar (sobrescribir ajustes)', sectionsRestore: 'Secciones que restaurar', globalSettings: '🌍 Ajustes globales', pluginSettings: '🔌 Ajustes de plugins', pluginData: '📁 Archivos de datos de plugins', uploads: '🖼️ Subidas', userData: '🗄️ Datos de usuario', importButton: '🚀 Importar datos seleccionados', cancelButton: 'Cancelar', resultTitle: '📋 Resultado de importación', showDetails: '🔽 Mostrar detalles', hideDetails: '🔼 Ocultar detalles', importAnother: '📥 Importar otra copia', detectedOldConfigs: 'Configuraciones antiguas detectadas', detectedOldConfigsDesc: 'Se buscaron perfiles, datos de plugins, subidas y datos de usuario en ubicaciones conocidas de LTTH.', legacyTitle: '🗂️ Importar desde una instalación antigua', legacyDescription: 'Introduce la carpeta de tu instalación antigua de LTTH. La herramienta buscará archivos de configuración y los importará al almacenamiento persistente actual.', oldInstallationPath: 'Ruta de instalación antigua', pathPlaceholder: 'p. ej., C:\\Users\\Tú\\ltth o /home/tú/ltth', scanButton: '🔍 Escanear', importedProfileName: 'Nombre del perfil importado (opcional)', profilePlaceholder: 'configuracion-importada', foundInPath: 'Encontrado en la ruta', importLegacyButton: '🚀 Importar desde esta ruta', importing: 'Importando…', noPluginSettings: 'No hay ajustes de plugins en esta copia.', found: 'Encontrado', filesDetected: 'archivo(s) detectado(s)', importResult: '📋 Resultado de importación', backupApiUnavailable: 'No se pudo conectar con la API de copias. Comprueba que el servidor esté activo.', backupNotReady: 'El sistema de copias no está completamente inicializado. La exportación podría no estar disponible.'
  },
  fr: {
    pageTitle: 'Sauvegarde et restauration de configuration – Pup Cid\'s Little TikTool Helper', heroTitle: '💾 Sauvegarder et restaurer la configuration', heroDescription: 'Exportez votre configuration actuelle dans une sauvegarde sécurisée, restaurez une sauvegarde précédente ou migrez une ancienne installation.', tabExport: '📤 Exporter une sauvegarde', tabImport: '📥 Importer une sauvegarde', tabLegacy: '🗂️ Import ancien', exportTitle: '📤 Exporter la configuration actuelle', exportDescription: 'Créez une sauvegarde ZIP complète de vos réglages. Elle pourra être restaurée depuis l’onglet Importer.', whatToInclude: 'Éléments à inclure', exportButton: '📦 Créer la sauvegarde ZIP', backupCreated: '✅ Sauvegarde créée', importTitle: '📥 Importer un fichier de sauvegarde', importDescription: 'Envoyez un fichier ZIP créé par cet outil. Un aperçu sera affiché avant toute modification.', dropBackup: 'Déposez votre ZIP ici', browseFiles: 'ou cliquez pour parcourir les fichiers', removeFile: 'Supprimer le fichier', validateButton: '🔍 Vérifier et prévisualiser', previewTitle: '🔍 Aperçu de l’importation', pluginDetails: 'Détails des plugins', importMode: 'Mode d’importation', modeMerge: '🔀 Fusionner (conserver les réglages existants)', modeReplace: '♻️ Remplacer (écraser les réglages)', sectionsRestore: 'Sections à restaurer', globalSettings: '🌍 Réglages globaux', pluginSettings: '🔌 Réglages des plugins', pluginData: '📁 Fichiers de données des plugins', uploads: '🖼️ Fichiers envoyés', userData: '🗄️ Données utilisateur', importButton: '🚀 Importer les données sélectionnées', cancelButton: 'Annuler', resultTitle: '📋 Résultat de l’importation', showDetails: '🔽 Afficher les détails', hideDetails: '🔼 Masquer les détails', importAnother: '📥 Importer une autre sauvegarde', detectedOldConfigs: 'Anciennes configurations détectées', detectedOldConfigsDesc: 'Les emplacements LTTH connus ont été analysés pour trouver d’anciens profils, données de plugins, fichiers envoyés et données utilisateur.', legacyTitle: '🗂️ Importer depuis une ancienne installation', legacyDescription: 'Saisissez le dossier de votre ancienne installation LTTH. L’outil recherchera les fichiers de configuration et les importera dans le stockage persistant actuel.', oldInstallationPath: 'Ancien chemin d’installation', pathPlaceholder: 'ex. C:\\Users\\Vous\\ltth ou /home/vous/ltth', scanButton: '🔍 Analyser', importedProfileName: 'Nom du profil importé (facultatif)', profilePlaceholder: 'configuration-importee', foundInPath: 'Éléments trouvés dans le chemin', importLegacyButton: '🚀 Importer depuis ce chemin', importing: 'Importation…', noPluginSettings: 'Aucun réglage de plugin dans cette sauvegarde.', found: 'Trouvé', filesDetected: 'fichier(s) détecté(s)', importResult: '📋 Résultat de l’importation', backupApiUnavailable: 'Impossible de joindre l’API de sauvegarde. Vérifiez que le serveur fonctionne.', backupNotReady: 'Le système de sauvegarde n’est pas entièrement initialisé. L’export peut être indisponible.'
  }
};

for (const [locale, values] of Object.entries(ui)) {
  const file = path.join(__dirname, '..', 'app', 'plugins', 'config-import', 'locales', `${locale}.json`);
  const current = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  current['config-import'].ui = values;
  fs.writeFileSync(file, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
}
