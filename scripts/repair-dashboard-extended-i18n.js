#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const page = path.join(root, 'app', 'public', 'dashboard.html');
const localeDir = path.join(root, 'app', 'locales');
const languages = ['en', 'de', 'es', 'fr'];

const values = {
  dashboard: {
    release_notes: { en: 'Release Notes & Updates', de: 'Release Notes & Updates', es: 'Notas de versión y actualizaciones', fr: 'Notes de version et mises à jour' },
    older_releases: { en: 'Show older releases', de: 'Ältere Releases anzeigen', es: 'Mostrar versiones anteriores', fr: 'Afficher les anciennes versions' },
    tools_plugins: { en: 'Tools & Plugins', de: 'Werkzeuge & Plugins', es: 'Herramientas y plugins', fr: 'Outils et plugins' },
    live_event_log: { en: 'Live Event Log', de: 'Live-Ereignisprotokoll', es: 'Registro de eventos en directo', fr: 'Journal des événements live' },
    subscribers_superfans: { en: 'Subscribers / Superfans', de: 'Abonnenten / SuperFans', es: 'Suscriptores / SuperFans', fr: 'Abonnés / SuperFans' },
    ifttt_flows: { en: 'IFTTT Automation Flows', de: 'IFTTT-Automationsflows', es: 'Flujos de automatización IFTTT', fr: 'Flux d’automatisation IFTTT' },
    visual_flow_editor: { en: 'Visual Flow Editor', de: 'Visueller Flow-Editor', es: 'Editor visual de flujos', fr: 'Éditeur visuel de flux' },
    wizard: { en: 'Wizard', de: 'Assistent', es: 'Asistente', fr: 'Assistant' },
    quick_create: { en: 'Quick Create', de: 'Schnell erstellen', es: 'Creación rápida', fr: 'Création rapide' },
    import: { en: 'Import', de: 'Importieren', es: 'Importation', fr: 'Importer' },
    select_all: { en: 'Select all', de: 'Alle auswählen', es: 'Seleccionar todo', fr: 'Tout sélectionner' },
    enable: { en: 'Enable', de: 'Aktivieren', es: 'Activar', fr: 'Activer' },
    disable: { en: 'Disable', de: 'Deaktivieren', es: 'Desactivar', fr: 'Désactiver' },
    flow_description: { en: 'Create powerful automation flows with drag-and-drop interface. Supports triggers, conditions, actions, and real-time monitoring.', de: 'Erstelle leistungsfähige Automationsflows per Drag-and-drop. Unterstützt Trigger, Bedingungen, Aktionen und Echtzeitüberwachung.', es: 'Crea flujos de automatización potentes con arrastrar y soltar. Incluye activadores, condiciones, acciones y monitorización en tiempo real.', fr: 'Créez de puissants flux d’automatisation par glisser-déposer, avec déclencheurs, conditions, actions et suivi en temps réel.' },
    talking_heads: { en: 'Talking Heads - AI Avatar Animation', de: 'Talking Heads – KI-Avatar-Animation', es: 'Talking Heads – animación de avatares con IA', fr: 'Talking Heads – animation d’avatar IA' },
    open_new_tab: { en: 'Open in New Tab', de: 'In neuem Tab öffnen', es: 'Abrir en una pestaña nueva', fr: 'Ouvrir dans un nouvel onglet' },
    gift_milestone: { en: 'Gift Milestone Celebration', de: 'Geschenk-Meilenstein-Feier', es: 'Celebración de hitos de regalos', fr: 'Célébration des paliers de cadeaux' },
    upload_plugin: { en: 'Upload Plugin (ZIP)', de: 'Plugin hochladen (ZIP)', es: 'Subir plugin (ZIP)', fr: 'Téléverser un plugin (ZIP)' },
    reload_all: { en: 'Reload All', de: 'Alle neu laden', es: 'Recargar todo', fr: 'Tout recharger' },
    auto_start_boot: { en: 'Auto-Start on System Boot', de: 'Autostart beim Systemstart', es: 'Inicio automático al arrancar el sistema', fr: 'Démarrage automatique au lancement du système' },
    tiktok_source: { en: 'TikTok Data Source', de: 'TikTok-Datenquelle', es: 'Fuente de datos de TikTok', fr: 'Source de données TikTok' },
    tiktok_source_desc: { en: 'Choose the data source for TikTok LIVE events. Changes apply on the next connection.', de: 'Wähle die Datenquelle für TikTok-LIVE-Events. Die Änderung wird beim nächsten Verbinden aktiv.', es: 'Elige la fuente de datos para los eventos de TikTok LIVE. El cambio se aplicará en la próxima conexión.', fr: 'Choisissez la source des événements TikTok LIVE. Le changement s’appliquera à la prochaine connexion.' },
    tikfinity_required: { en: 'TikFinity Desktop App required', de: 'TikFinity-Desktop-App erforderlich', es: 'Se necesita la aplicación de escritorio TikFinity', fr: 'Application de bureau TikFinity requise' },
    tikfinity_required_desc: { en: 'Make sure the TikFinity Desktop App is running and connected to your TikTok account.', de: 'Stelle sicher, dass die TikFinity-Desktop-App läuft und mit deinem TikTok-Konto verbunden ist.', es: 'Asegúrate de que la aplicación TikFinity esté ejecutándose y conectada a tu cuenta de TikTok.', fr: 'Vérifiez que l’application TikFinity est ouverte et connectée à votre compte TikTok.' },
    save_tikfinity: { en: 'Save TikFinity settings', de: 'TikFinity-Einstellungen speichern', es: 'Guardar ajustes de TikFinity', fr: 'Enregistrer les réglages TikFinity' },
    eulerstream_key: { en: 'EulerStream API Key', de: 'EulerStream-API-Key', es: 'Clave API de EulerStream', fr: 'Clé API EulerStream' },
    save_api_key: { en: 'Save API Key', de: 'API-Key speichern', es: 'Guardar clave API', fr: 'Enregistrer la clé API' },
    api_keys: { en: 'API Keys', de: 'API-Keys', es: 'Claves API', fr: 'Clés API' },
    api_keys_desc: { en: 'Central management for all API keys. Only services with a valid key can be used.', de: 'Zentrale Verwaltung aller API-Keys. Nur Dienste mit gültigem Key können genutzt werden.', es: 'Gestión centralizada de todas las claves API. Solo se pueden usar servicios con una clave válida.', fr: 'Gestion centralisée des clés API. Seuls les services disposant d’une clé valide peuvent être utilisés.' },
    save_api_keys: { en: 'Save API Keys', de: 'API-Keys speichern', es: 'Guardar claves API', fr: 'Enregistrer les clés API' },
    openai_config: { en: 'OpenAI API Configuration', de: 'OpenAI-API-Konfiguration', es: 'Configuración de la API de OpenAI', fr: 'Configuration de l’API OpenAI' },
    openai_config_desc: { en: 'Configure your OpenAI API key for AI-powered features like quiz question generation. Get your API key at', de: 'Konfiguriere deinen OpenAI-API-Key für KI-Funktionen wie die Quiz-Fragengenerierung. Deinen API-Key erhältst du bei', es: 'Configura tu clave API de OpenAI para funciones como generar preguntas de quiz. Consigue tu clave en', fr: 'Configurez votre clé API OpenAI pour les fonctions IA comme la génération de questions de quiz. Obtenez-la sur' },
    save_openai: { en: 'Save OpenAI Configuration', de: 'OpenAI-Konfiguration speichern', es: 'Guardar configuración de OpenAI', fr: 'Enregistrer la configuration OpenAI' },
    user_profiles: { en: 'User Profiles', de: 'Benutzerprofile', es: 'Perfiles de usuario', fr: 'Profils utilisateur' },
    profile_switch_desc: { en: 'Switch between different configurations for different streaming setups.', de: 'Wechsle zwischen verschiedenen Konfigurationen für unterschiedliche Streaming-Setups.', es: 'Cambia entre distintas configuraciones para diferentes setups de streaming.', fr: 'Basculez entre différentes configurations selon vos setups de streaming.' },
    active_profile: { en: 'Active Profile:', de: 'Aktives Profil:', es: 'Perfil activo:', fr: 'Profil actif :' },
    profile_restart_warning: { en: '⚠️ Profile changes require application restart', de: '⚠️ Profiländerungen erfordern einen Neustart der Anwendung', es: '⚠️ Los cambios de perfil requieren reiniciar la aplicación', fr: '⚠️ Les changements de profil nécessitent un redémarrage de l’application' },
    auto_restart_profile: { en: 'Auto-Restart on Profile Switch', de: 'Autoneustart beim Profilwechsel', es: 'Reinicio automático al cambiar de perfil', fr: 'Redémarrage automatique lors du changement de profil' },
    profile_storage: { en: 'Configuration Storage Location', de: 'Speicherort der Konfiguration', es: 'Ubicación de almacenamiento de la configuración', fr: 'Emplacement de stockage de la configuration' },
    system_information: { en: 'System Information', de: 'Systeminformationen', es: 'Información del sistema', fr: 'Informations système' },
    gpu_rendering: { en: 'GPU & Rendering', de: 'GPU & Rendering', es: 'GPU y renderizado', fr: 'GPU et rendu' },
    logging_settings: { en: 'Logging Settings', de: 'Logging-Einstellungen', es: 'Ajustes de registro', fr: 'Réglages des journaux' },
    live_log_viewer: { en: 'Live Log Viewer', de: 'Live-Loganzeige', es: 'Visor de registros en directo', fr: 'Visualiseur de journaux live' },
    refresh_diagnostics: { en: 'Refresh Diagnostics', de: 'Diagnose aktualisieren', es: 'Actualizar diagnóstico', fr: 'Actualiser les diagnostics' },
    test_gpu: { en: 'Test GPU', de: 'GPU testen', es: 'Probar GPU', fr: 'Tester le GPU' },
    check_plugins: { en: 'Check Plugins', de: 'Plugins prüfen', es: 'Comprobar plugins', fr: 'Vérifier les plugins' },
    network_access: { en: 'Network Access', de: 'Netzwerkzugriff', es: 'Acceso de red', fr: 'Accès réseau' },
    save_network: { en: 'Save Network Settings', de: 'Netzwerkeinstellungen speichern', es: 'Guardar ajustes de red', fr: 'Enregistrer les réglages réseau' }
  }
};

let html = fs.readFileSync(page, 'utf8');
const replacements = [
  ['<span>Release Notes &amp; Updates</span>', '<span data-i18n="dashboard.release_notes">Release Notes &amp; Updates</span>'],
  ['<span>Ältere Releases anzeigen</span>', '<span data-i18n="dashboard.older_releases">Show older releases</span>'],
  ['<span>Tools &amp; Plugins</span>', '<span data-i18n="dashboard.tools_plugins">Tools &amp; Plugins</span>'],
  ['<span>Live Event Log</span>', '<span data-i18n="dashboard.live_event_log">Live Event Log</span>'],
  ['<span>Subscribers / Superfans</span>', '<span data-i18n="dashboard.subscribers_superfans">Subscribers / Superfans</span>'],
  ['<span>IFTTT Automation Flows</span>', '<span data-i18n="dashboard.ifttt_flows">IFTTT Automation Flows</span>'],
  ['<span>Visual Flow Editor</span>', '<span data-i18n="dashboard.visual_flow_editor">Visual Flow Editor</span>'],
  ['<span>�™ Wizard</span>', '<span data-i18n="dashboard.wizard">🧙 Wizard</span>'],
  ['<span>Quick Create</span>', '<span data-i18n="dashboard.quick_create">Quick Create</span>'],
  ['<span>📥 Import</span>', '<span data-i18n="dashboard.import">📥 Import</span>'],
  ['<span>Alle auswählen</span>', '<span data-i18n="dashboard.select_all">Select all</span>'],
  ['<span>✅ Aktivieren</span>', '<span data-i18n="dashboard.enable">✅ Enable</span>'],
  ['<span>⏸️ Deaktivieren</span>', '<span data-i18n="dashboard.disable">⏸️ Disable</span>'],
  ['<span>Talking Heads - AI Avatar Animation</span>', '<span data-i18n="dashboard.talking_heads">Talking Heads - AI Avatar Animation</span>'],
  ['<span>Open in New Tab</span>', '<span data-i18n="dashboard.open_new_tab">Open in New Tab</span>'],
  ['<span>Gift Milestone Celebration</span>', '<span data-i18n="dashboard.gift_milestone">Gift Milestone Celebration</span>'],
  ['<span>Upload Plugin (ZIP)</span>', '<span data-i18n="dashboard.upload_plugin">Upload Plugin (ZIP)</span>'],
  ['<span>Reload All</span>', '<span data-i18n="dashboard.reload_all">Reload All</span>'],
  ['<span>Auto-Start on System Boot</span>', '<span data-i18n="dashboard.auto_start_boot">Auto-Start on System Boot</span>'],
  ['<h3>TikTok Datenquelle</h3>', '<h3 data-i18n="dashboard.tiktok_source">TikTok Data Source</h3>'],
  ['<p class="text-sm text-gray-500">Wähle die Datenquelle für TikTok LIVE Events. Die Änderung wird beim nächsten Verbinden aktiv.</p>', '<p class="text-sm text-gray-500" data-i18n="dashboard.tiktok_source_desc">Choose the data source for TikTok LIVE events. Changes apply on the next connection.</p>'],
  ['<h4>TikFinity Desktop App erforderlich</h4>', '<h4 data-i18n="dashboard.tikfinity_required">TikFinity Desktop App required</h4>'],
  ['<p>Stelle sicher, dass die TikFinity Desktop App läuft und mit deinem TikTok-Account verbunden ist.</p>', '<p data-i18n="dashboard.tikfinity_required_desc">Make sure the TikFinity Desktop App is running and connected to your TikTok account.</p>'],
  ['>TikFinity Einstellungen speichern</button>', ' data-i18n="dashboard.save_tikfinity">Save TikFinity settings</button>'],
  ['<h3>EulerStream API Key</h3>', '<h3 data-i18n="dashboard.eulerstream_key">EulerStream API Key</h3>'],
  ['>Save API Key</button>', ' data-i18n="dashboard.save_api_key">Save API Key</button>'],
  ['<h3>API Keys</h3>', '<h3 data-i18n="dashboard.api_keys">API Keys</h3>'],
  ['<p>Zentrale Verwaltung aller API-Schlüssel. Nur Dienste mit gültigem Key können genutzt werden.</p>', '<p data-i18n="dashboard.api_keys_desc">Central management for all API keys. Only services with a valid key can be used.</p>'],
  ['>Save API Keys</button>', ' data-i18n="dashboard.save_api_keys">Save API Keys</button>'],
  ['<h3>OpenAI API Configuration</h3>', '<h3 data-i18n="dashboard.openai_config">OpenAI API Configuration</h3>'],
  ['>Save OpenAI Configuration</button>', ' data-i18n="dashboard.save_openai">Save OpenAI Configuration</button>'],
  ['<h2>User Profiles</h2>', '<h2 data-i18n="dashboard.user_profiles">User Profiles</h2>'],
  ['<span>Active Profile:</span>', '<span data-i18n="dashboard.active_profile">Active Profile:</span>'],
  ['<span>Configuration Storage Location</span>', '<span data-i18n="dashboard.profile_storage">Configuration Storage Location</span>'],
  ['<h2>System Information</h2>', '<h2 data-i18n="dashboard.system_information">System Information</h2>'],
  ['<h2>GPU &amp; Rendering</h2>', '<h2 data-i18n="dashboard.gpu_rendering">GPU &amp; Rendering</h2>'],
  ['<h2>Logging Settings</h2>', '<h2 data-i18n="dashboard.logging_settings">Logging Settings</h2>'],
  ['<h2>Live Log Viewer</h2>', '<h2 data-i18n="dashboard.live_log_viewer">Live Log Viewer</h2>'],
  ['>Refresh Diagnostics</button>', ' data-i18n="dashboard.refresh_diagnostics">Refresh Diagnostics</button>'],
  ['>Test GPU</button>', ' data-i18n="dashboard.test_gpu">Test GPU</button>'],
  ['>Check Plugins</button>', ' data-i18n="dashboard.check_plugins">Check Plugins</button>'],
  ['<h2>Network Access</h2>', '<h2 data-i18n="dashboard.network_access">Network Access</h2>'],
  ['>Save Network Settings</button>', ' data-i18n="dashboard.save_network">Save Network Settings</button>']
];
for (const pair of replacements) html = html.split(pair[0]).join(pair[1]);
fs.writeFileSync(page, html, 'utf8');
for (const language of languages) {
  const file = path.join(localeDir, language + '.json');
  const locale = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!locale.dashboard) locale.dashboard = {};
  for (const key of Object.keys(values.dashboard)) locale.dashboard[key] = values.dashboard[key][language];
  fs.writeFileSync(file, JSON.stringify(locale, null, 2) + '\n', 'utf8');
}
console.log('Extended dashboard locale markers repaired (' + replacements.length + ' templates).');
