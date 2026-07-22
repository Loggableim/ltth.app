#!/usr/bin/env node

/*
 * Bring the dashboard shell itself under the same locale contract as the
 * plugin views. The dashboard contains a large amount of static chrome that
 * used to sit outside the i18n client and therefore stayed English (or mixed
 * German/English) after a language switch.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dashboardPath = path.join(root, 'app', 'public', 'dashboard.html');
const localeDir = path.join(root, 'app', 'locales');
const languages = ['en', 'de', 'es', 'fr'];

const entries = {
  navigation: {
    developer_guides: { en: 'Developer Guides', de: 'Entwicklerleitfäden', es: 'Guías para desarrolladores', fr: 'Guides développeur' },
    webgpu_fireworks: { en: 'WebGPU Fireworks', de: 'WebGPU Fireworks', es: 'WebGPU Fireworks', fr: 'WebGPU Fireworks' }
  },
  dashboard: {
    optional: { en: '(Optional)', de: '(Optional)', es: '(Opcional)', fr: '(Facultatif)' },
    connection_details_diagnostics: { en: 'Connection Details & Diagnostics', de: 'Verbindungsdetails & Diagnose', es: 'Detalles de conexión y diagnóstico', fr: 'Détails de connexion et diagnostic' },
    panel_stream_time_explanation: { en: 'This panel shows how the stream start time was detected. If it shows "Connection Time" instead of a roomInfo field, the API may not be providing stream start time.', de: 'Dieses Panel zeigt, wie der Startzeitpunkt des Streams erkannt wurde. Wenn statt eines roomInfo-Feldes „Connection Time“ erscheint, liefert die API möglicherweise keine Startzeit.', es: 'Este panel muestra cómo se detectó el inicio del directo. Si aparece «Connection Time» en lugar de un campo roomInfo, es posible que la API no proporcione la hora de inicio.', fr: 'Ce panneau indique comment le début du live a été détecté. Si « Connection Time » apparaît au lieu d’un champ roomInfo, l’API ne fournit peut-être pas l’heure de début.' },
    community_chat: { en: 'Community Chat', de: 'Community-Chat', es: 'Chat de la comunidad', fr: 'Chat de la communauté' },
    loading_release_notes: { en: 'Loading the latest release notes…', de: 'Aktuelle Release Notes werden geladen …', es: 'Cargando las notas de la versión más reciente…', fr: 'Chargement des notes de version…' },
    chat: { en: 'Chat', de: 'Chat', es: 'Chat', fr: 'Chat' },
    subscribers: { en: 'Subscribers', de: 'Abonnenten', es: 'Suscriptores', fr: 'Abonnés' },
    currently_watching: { en: 'currently watching', de: 'sehen gerade zu', es: 'viendo ahora', fr: 'regardent actuellement' },
    messages: { en: 'messages', de: 'Nachrichten', es: 'mensajes', fr: 'messages' },
    total_likes: { en: 'total likes', de: 'Likes insgesamt', es: 'J’aime insgesamt', fr: 'likes au total' },
    total_coins: { en: 'total coins', de: 'Coins insgesamt', es: 'monedas en total', fr: 'pièces au total' },
    new_followers: { en: 'new followers', de: 'neue Follower', es: 'nuevos seguidores', fr: 'nouveaux abonnés' },
    gifts_received: { en: 'gifts received', de: 'erhaltene Geschenke', es: 'regalos recibidos', fr: 'cadeaux reçus' },
    no_viewers: { en: 'No viewers tracked yet', de: 'Noch keine Zuschauer erfasst', es: 'Aún no se han registrado espectadores', fr: 'Aucun spectateur enregistré' },
    no_messages: { en: 'No chat messages yet', de: 'Noch keine Chatnachrichten', es: 'Aún no hay mensajes del chat', fr: 'Aucun message dans le chat' },
    no_likes: { en: 'No likes yet', de: 'Noch keine Likes', es: 'Aún no hay Me gusta', fr: 'Aucun like pour le moment' },
    no_coins: { en: 'No coin gifts yet', de: 'Noch keine Coin-Geschenke', es: 'Aún no hay regalos de monedas', fr: 'Aucun cadeau en coins' },
    no_followers: { en: 'No followers yet', de: 'Noch keine Follower', es: 'Aún no hay seguidores', fr: 'Aucun abonné pour le moment' },
    no_subscribers: { en: 'No subscribers yet', de: 'Noch keine Abonnenten', es: 'Aún no hay suscriptores', fr: 'Aucun abonné pour le moment' },
    no_gifts: { en: 'No gifts yet', de: 'Noch keine Geschenke', es: 'Aún no hay regalos', fr: 'Aucun cadeau pour le moment' },
    event_time: { en: 'Time', de: 'Zeit', es: 'Hora', fr: 'Heure' },
    event_type: { en: 'Type', de: 'Typ', es: 'Tipo', fr: 'Type' },
    event_user: { en: 'User', de: 'Nutzer', es: 'Usuario', fr: 'Utilisateur' },
    event_details: { en: 'Details', de: 'Details', es: 'Detalles', fr: 'Détails' },
    automation_engine: { en: 'Automation Engine', de: 'Automation-Engine', es: 'Motor de automatización', fr: 'Moteur d’automatisation' },
    automation_engine_desc: { en: 'Global switch for all flows and timer triggers.', de: 'Globaler Schalter für alle Flows und Timer-Trigger.', es: 'Interruptor global para todos los flujos y activadores de temporizador.', fr: 'Interrupteur global pour tous les flux et déclencheurs de minuteur.' },
    active: { en: 'Active', de: 'Aktiv', es: 'Activo', fr: 'Actif' },
    enable: { en: 'Enable', de: 'Aktivieren', es: 'Activar', fr: 'Activer' },
    disable: { en: 'Disable', de: 'Deaktivieren', es: 'Desactivar', fr: 'Désactiver' },
    visual_flow_editor: { en: 'New: Visual IFTTT Flow Editor', de: 'Neu: Visueller IFTTT-Flow-Editor', es: 'Nuevo: editor visual de flujos IFTTT', fr: 'Nouveau : éditeur visuel de flux IFTTT' },
    active_plugins: { en: 'Active Plugins', de: 'Aktive Plugins', es: 'Plugins activos', fr: 'Plugins actifs' },
    inactive_plugins: { en: 'Inactive Plugins', de: 'Inaktive Plugins', es: 'Plugins inactivos', fr: 'Plugins inactifs' },
    total_plugins: { en: 'Total Plugins', de: 'Plugins gesamt', es: 'Plugins totales', fr: 'Total des plugins' },
    dev_status: { en: 'Dev Status:', de: 'Entwicklungsstatus:', es: 'Estado de desarrollo:', fr: 'État du développement :' },
    stable: { en: 'Stable', de: 'Stabil', es: 'Estable', fr: 'Stable' },
    working_beta: { en: 'Working Beta', de: 'Funktionierende Beta', es: 'Beta funcional', fr: 'Bêta fonctionnelle' },
    development_beta: { en: 'Development Beta', de: 'Entwicklungs-Beta', es: 'Beta en desarrollo', fr: 'Bêta en développement' },
    early_version: { en: 'Early Version', de: 'Frühe Version', es: 'Versión temprana', fr: 'Version préliminaire' },
    non_working_beta: { en: 'Non-working Beta', de: 'Nicht funktionsfähige Beta', es: 'Beta no funcional', fr: 'Bêta non fonctionnelle' },
    sort_name: { en: 'Sort by Name', de: 'Nach Name sortieren', es: 'Ordenar por nombre', fr: 'Trier par nom' },
    sort_status: { en: 'Sort by Status', de: 'Nach Status sortieren', es: 'Ordenar por estado', fr: 'Trier par état' },
    sort_type: { en: 'Sort by Type', de: 'Nach Typ sortieren', es: 'Ordenar por tipo', fr: 'Trier par type' },
    sort_author: { en: 'Sort by Author', de: 'Nach Autor sortieren', es: 'Ordenar por autor', fr: 'Trier par auteur' },
    compact: { en: 'Compact', de: 'Kompakt', es: 'Compacto', fr: 'Compact' }
  },
  settings: {
    enable_live_event_log: { en: 'Enable Live Event Log', de: 'Live-Ereignisprotokoll aktivieren', es: 'Activar registro de eventos en directo', fr: 'Activer le journal des événements live' },
    debug_only: { en: 'Debug only. Hidden from the navigation by default.', de: 'Nur für Debugging. Standardmäßig in der Navigation ausgeblendet.', es: 'Solo para depuración. Oculto de la navegación por defecto.', fr: 'Réservé au débogage. Masqué de la navigation par défaut.' },
    language_apply_immediately: { en: 'Language changes apply immediately', de: 'Sprachänderungen werden sofort übernommen', es: 'Los cambios de idioma se aplican de inmediato', fr: 'Les changements de langue sont appliqués immédiatement' },
    platform: { en: 'Platform:', de: 'Plattform:', es: 'Plataforma:', fr: 'Plateforme :' },
    status: { en: 'Status:', de: 'Status:', es: 'Estado:', fr: 'État :' },
    checking: { en: 'Checking…', de: 'Wird geprüft …', es: 'Comprobando…', fr: 'Vérification…' },
    eulerstream_title: { en: '⚡ Eulerstream', de: '⚡ Eulerstream', es: '⚡ Eulerstream', fr: '⚡ Eulerstream' },
    eulerstream_desc: { en: 'Direct WebSocket connection through the Eulerstream SDK', de: 'Direkte WebSocket-Verbindung über das Eulerstream-SDK', es: 'Conexión WebSocket directa mediante el SDK de Eulerstream', fr: 'Connexion WebSocket directe via le SDK Eulerstream' },
    api_key: { en: 'API Key', de: 'API-Key', es: 'Clave de API', fr: 'Clé API' },
    api_key_hint: { en: 'Starts with “euler_” or is a 64-character hexadecimal webhook secret', de: 'Beginnt mit „euler_“ oder ist ein 64-stelliges hexadezimales Webhook-Secret', es: 'Empieza por «euler_» o es un secreto de webhook hexadecimal de 64 caracteres', fr: 'Commence par « euler_ » ou correspond à un secret webhook hexadécimal de 64 caractères' },
    auto_connect_stream: { en: 'Connect automatically at startup', de: 'Beim Start automatisch verbinden', es: 'Conectar automáticamente al iniciar', fr: 'Se connecter automatiquement au démarrage' },
    auto_connect_stream_desc: { en: 'When enabled, the app automatically reconnects to the last stream.', de: 'Wenn aktiviert, verbindet sich die Software beim Start automatisch mit dem zuletzt verbundenen Stream.', es: 'Si está activado, la aplicación se conecta automáticamente al último directo.', fr: 'Lorsque cette option est activée, l’application se reconnecte automatiquement au dernier live.' }
  }
};

function setPath(target, key, value) {
  const parts = key.split('.');
  let cursor = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (!cursor[parts[i]] || typeof cursor[parts[i]] !== 'object') cursor[parts[i]] = {};
    cursor = cursor[parts[i]];
  }
  cursor[parts[parts.length - 1]] = value;
}

function flatten(node, prefix = '') {
  const output = [];
  for (const [key, value] of Object.entries(node)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value) && !Object.prototype.hasOwnProperty.call(value, 'en')) {
      output.push(...flatten(value, full));
    } else {
      output.push([full, value]);
    }
  }
  return output;
}

let html = fs.readFileSync(dashboardPath, 'utf8');
const replacements = new Map([
  ['<span class="sidebar-category-label">Core Functions</span>', '<span class="sidebar-category-label" data-i18n="navigation.core_functions">Core Functions</span>'],
  ['<span class="sidebar-category-label">Automations &amp; Goals</span>', '<span class="sidebar-category-label" data-i18n="navigation.automations_goals">Automations &amp; Goals</span>'],
  ['<span class="sidebar-category-label">Audio &amp; Voice</span>', '<span class="sidebar-category-label" data-i18n="navigation.audio_voice">Audio &amp; Voice</span>'],
  ['<span class="sidebar-category-label">Visual FX</span>', '<span class="sidebar-category-label" data-i18n="navigation.visual_fx">Visual FX</span>'],
  ['<span class="sidebar-category-label">Games &amp; Engagement</span>', '<span class="sidebar-category-label" data-i18n="navigation.games_engagement">Games &amp; Engagement</span>'],
  ['<span class="sidebar-item-text">WebGPU Fireworks</span>', '<span class="sidebar-item-text" data-i18n="navigation.webgpu_fireworks">WebGPU Fireworks</span>'],
  ['<span class="sidebar-item-text">Developer Guides</span>', '<span class="sidebar-item-text" data-i18n="navigation.developer_guides">Developer Guides</span>'],
  ['<span>(Optional)</span>', '<span data-i18n="dashboard.optional">(Optional)</span>'],
  ['<span>Community Chat</span>', '<span data-i18n="dashboard.community_chat">Community Chat</span>'],
  ['<span>Lade aktuelle Release Notes...</span>', '<span data-i18n="dashboard.loading_release_notes">Lade aktuelle Release Notes…</span>'],
  ['<span class="stats-bar-label">Chat</span>', '<span class="stats-bar-label" data-i18n="dashboard.chat">Chat</span>'],
  ['<span class="stats-bar-label">Subscribers</span>', '<span class="stats-bar-label" data-i18n="dashboard.subscribers">Subscribers</span>'],
  ['<span class="stats-panel-label">currently watching</span>', '<span class="stats-panel-label" data-i18n="dashboard.currently_watching">currently watching</span>'],
  ['<p class="stats-panel-empty">No viewers tracked yet</p>', '<p class="stats-panel-empty" data-i18n="dashboard.no_viewers">No viewers tracked yet</p>'],
  ['<span class="stats-panel-label">messages</span>', '<span class="stats-panel-label" data-i18n="dashboard.messages">messages</span>'],
  ['<p class="stats-panel-empty">No chat messages yet</p>', '<p class="stats-panel-empty" data-i18n="dashboard.no_messages">No chat messages yet</p>'],
  ['<span class="stats-panel-label">total likes</span>', '<span class="stats-panel-label" data-i18n="dashboard.total_likes">total likes</span>'],
  ['<p class="stats-panel-empty">No likes yet</p>', '<p class="stats-panel-empty" data-i18n="dashboard.no_likes">No likes yet</p>'],
  ['<span class="stats-panel-label">total coins</span>', '<span class="stats-panel-label" data-i18n="dashboard.total_coins">total coins</span>'],
  ['<p class="stats-panel-empty">No coin gifts yet</p>', '<p class="stats-panel-empty" data-i18n="dashboard.no_coins">No coin gifts yet</p>'],
  ['<span class="stats-panel-label">new followers</span>', '<span class="stats-panel-label" data-i18n="dashboard.new_followers">new followers</span>'],
  ['<p class="stats-panel-empty">No followers yet</p>', '<p class="stats-panel-empty" data-i18n="dashboard.no_followers">No followers yet</p>'],
  ['<span class="stats-panel-label">subscribers</span>', '<span class="stats-panel-label" data-i18n="dashboard.subscribers">subscribers</span>'],
  ['<p class="stats-panel-empty">No subscribers yet</p>', '<p class="stats-panel-empty" data-i18n="dashboard.no_subscribers">No subscribers yet</p>'],
  ['<span class="stats-panel-label">gifts received</span>', '<span class="stats-panel-label" data-i18n="dashboard.gifts_received">gifts received</span>'],
  ['<p class="stats-panel-empty">No gifts yet</p>', '<p class="stats-panel-empty" data-i18n="dashboard.no_gifts">No gifts yet</p>'],
  ['<th>Time</th>', '<th data-i18n="dashboard.event_time">Time</th>'],
  ['<th>Type</th>', '<th data-i18n="dashboard.event_type">Type</th>'],
  ['<th>User</th>', '<th data-i18n="dashboard.event_user">User</th>'],
  ['<th>Details</th>', '<th data-i18n="dashboard.event_details">Details</th>'],
  ['<strong>Automation Engine</strong>', '<strong data-i18n="dashboard.automation_engine">Automation Engine</strong>'],
  ['<p class="text-sm text-gray-400" style="margin:4px 0 0 0;">Globaler Schalter fuer alle Flows und Timer-Trigger.</p>', '<p class="text-sm text-gray-400" style="margin:4px 0 0 0;" data-i18n="dashboard.automation_engine_desc">Globaler Schalter für alle Flows und Timer-Trigger.</p>'],
  ['<span id="flows-global-enabled-label">Aktiv</span>', '<span id="flows-global-enabled-label" data-i18n="dashboard.active">Aktiv</span>'],
  ['<strong style="color: var(--color-accent-primary);">New: Visual IFTTT Flow Editor</strong>', '<strong style="color: var(--color-accent-primary);" data-i18n="dashboard.visual_flow_editor">New: Visual IFTTT Flow Editor</strong>'],
  ['<div class="stat-label">Active Plugins</div>', '<div class="stat-label" data-i18n="dashboard.active_plugins">Active Plugins</div>'],
  ['<div class="stat-label">Inactive Plugins</div>', '<div class="stat-label" data-i18n="dashboard.inactive_plugins">Inactive Plugins</div>'],
  ['<div class="stat-label">Total Plugins</div>', '<div class="stat-label" data-i18n="dashboard.total_plugins">Total Plugins</div>'],
  ['<span style="font-size: 0.85rem; color: var(--color-text-muted); font-weight: 500;">Dev Status:</span>', '<span style="font-size: 0.85rem; color: var(--color-text-muted); font-weight: 500;" data-i18n="dashboard.dev_status">Dev Status:</span>'],
  ['<span>Stable</span>', '<span data-i18n="dashboard.stable">Stable</span>'],
  ['<span>Working Beta</span>', '<span data-i18n="dashboard.working_beta">Working Beta</span>'],
  ['<span>Development Beta</span>', '<span data-i18n="dashboard.development_beta">Development Beta</span>'],
  ['<span>Early Version</span>', '<span data-i18n="dashboard.early_version">Early Version</span>'],
  ['<span>Non-working Beta</span>', '<span data-i18n="dashboard.non_working_beta">Non-working Beta</span>'],
  ['<option value="name">Sort by Name</option>', '<option value="name" data-i18n="dashboard.sort_name">Sort by Name</option>'],
  ['<option value="status">Sort by Status</option>', '<option value="status" data-i18n="dashboard.sort_status">Sort by Status</option>'],
  ['<option value="type">Sort by Type</option>', '<option value="type" data-i18n="dashboard.sort_type">Sort by Type</option>'],
  ['<option value="author">Sort by Author</option>', '<option value="author" data-i18n="dashboard.sort_author">Sort by Author</option>'],
  ['<span>Compact</span>', '<span data-i18n="dashboard.compact">Compact</span>'],
  ['<span id="show-live-event-log-label">Enable Live Event Log</span>', '<span id="show-live-event-log-label" data-i18n="settings.enable_live_event_log">Enable Live Event Log</span>'],
  ['<p class="text-xs text-gray-500 mt-2 ml-1">Debug only. Hidden from the navigation by default.</p>', '<p class="text-xs text-gray-500 mt-2 ml-1" data-i18n="settings.debug_only">Debug only. Hidden from the navigation by default.</p>'],
  ['<span>Language changes apply immediately</span>', '<span data-i18n="settings.language_apply_immediately">Language changes apply immediately</span>'],
  ['<span class="text-gray-400">Platform:</span>', '<span class="text-gray-400" data-i18n="settings.platform">Platform:</span>'],
  ['<span class="text-gray-400">Status:</span>', '<span class="text-gray-400" data-i18n="settings.status">Status:</span>'],
  ['<span id="autostart-status" class="ml-2">Checking...</span>', '<span id="autostart-status" class="ml-2" data-i18n="settings.checking">Checking…</span>'],
  ['<span>⚡ Eulerstream</span>', '<span data-i18n="settings.eulerstream_title">⚡ Eulerstream</span>'],
  ['<p class="text-xs text-gray-400 mt-0.5">Direkte WebSocket-Verbindung über Eulerstream SDK</p>', '<p class="text-xs text-gray-400 mt-0.5" data-i18n="settings.eulerstream_desc">Direkte WebSocket-Verbindung über das Eulerstream-SDK</p>'],
  ['<label>API Key</label>', '<label data-i18n="settings.api_key">API Key</label>'],
  ['<span>Automatisch beim Start verbinden</span>', '<span data-i18n="settings.auto_connect_stream">Automatisch beim Start verbinden</span>'],
  ['<span>Wenn aktiviert, verbindet sich die Software automatisch beim Start mit dem zuletzt verbundenen Stream</span>', '<span data-i18n="settings.auto_connect_stream_desc">Wenn aktiviert, verbindet sich die Software beim Start automatisch mit dem zuletzt verbundenen Stream.</span>']
]);

for (const [from, to] of replacements) html = html.split(from).join(to);
fs.writeFileSync(dashboardPath, html, 'utf8');

for (const lang of languages) {
  const localePath = path.join(localeDir, `${lang}.json`);
  const locale = JSON.parse(fs.readFileSync(localePath, 'utf8'));
  for (const [key, translations] of flatten(entries)) setPath(locale, key, translations[lang]);
  fs.writeFileSync(localePath, `${JSON.stringify(locale, null, 2)}\n`, 'utf8');
}

console.log(`Dashboard locale markers repaired (${replacements.size} templates, ${languages.length} locales).`);
