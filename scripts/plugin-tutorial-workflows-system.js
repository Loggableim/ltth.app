'use strict';

const { step, guide } = require('./plugin-tutorial-workflow-helpers');

function copy(de, en, es, fr) {
  return {
    de: { title: de[0], body: de[1], expected: de[2], alt: de[3] },
    en: { title: en[0], body: en[1], expected: en[2], alt: en[3] },
    es: { title: es[0], body: es[1], expected: es[2], alt: es[3] },
    fr: { title: fr[0], body: fr[1], expected: fr[2], alt: fr[3] }
  };
}

function inspect(id, route, selector, names) {
  return step(id, route, selector, copy(
    [`${names.de} pruefen`, `Oeffne ${route} im temporaeren Testprofil und lies ${names.de}; dieser Schritt sendet keine Anfrage mit Seiteneffekt.`, `${names.de} ist sichtbar.`, `${names.de} in der lokalen Oberflaeche.`],
    [`Inspect ${names.en}`, `Open ${route} in the temporary test profile and inspect ${names.en}; this step sends no request with a side effect.`, `${names.en} is visible.`, `${names.en} in the local interface.`],
    [`Inspeccionar ${names.es}`, `Abre ${route} en el perfil temporal y revisa ${names.es}; este paso no envia solicitudes con efectos.`, `${names.es} es visible.`, `${names.es} en la interfaz local.`],
    [`Inspecter ${names.fr}`, `Ouvrez ${route} dans le profil de test temporaire et examinez ${names.fr} ; cette etape n envoie aucune requete avec effet.`, `${names.fr} est visible.`, `${names.fr} dans l interface locale.`]
  ), { operations: [{ type: 'inspect', selector }], postconditions: [{ type: 'visible', selector }] });
}

function labels(de, en, es, fr) { return { de, en, es, fr }; }

function meta(title, summary, result, requirements, safety, troubleshooting) {
  return {
    de: { title: title.de, summary: summary.de, firstResult: result.de, requirements: requirements.de, safety: safety.de, troubleshooting: troubleshooting.de },
    en: { title: title.en, summary: summary.en, firstResult: result.en, requirements: requirements.en, safety: safety.en, troubleshooting: troubleshooting.en },
    es: { title: title.es, summary: summary.es, firstResult: result.es, requirements: requirements.es, safety: safety.es, troubleshooting: troubleshooting.es },
    fr: { title: title.fr, summary: summary.fr, firstResult: result.fr, requirements: requirements.fr, safety: safety.fr, troubleshooting: troubleshooting.fr }
  };
}

const LOCAL = labels('Aktives Plugin und ein temporaeres lokales Testprofil.', 'An enabled plugin and a temporary local test profile.', 'Plugin activo y perfil local temporal de prueba.', 'Plugin actif et profil de test local temporaire.');
const READ_ONLY = labels('Nur Lesen und lokale Vorschau; keine produktiven Daten, Zugangsdaten, Exporte oder API-Aktionen ausloesen.', 'Read-only inspection and local preview only; do not trigger production data, credentials, exports, or API actions.', 'Solo inspeccion y vista previa local; no actives datos de produccion, credenciales, exportaciones ni acciones API.', 'Inspection en lecture seule et apercu local uniquement ; ne declenchez ni donnees de production, identifiants, exportations ni actions API.');
const FIX = labels('Plugin-Status pruefen und die angegebene Route erneut oeffnen.', 'Check plugin status and reopen the stated route.', 'Comprueba el estado del plugin y vuelve a abrir la ruta indicada.', 'Verifiez l etat du plugin puis rouvrez la route indiquee.');

module.exports = {
  'api-bridge': guide({
    id: 'api-bridge', route: '/api-bridge/ui', requirement: 'api', safety: 'credentials', mode: 'api', related: ['data-source', 'gcce'],
    copy: meta(labels('API Bridge lesen', 'Read API Bridge', 'Leer API Bridge', 'Lire API Bridge'), labels('Prueft den lokalen GET-Vertrag der Bridge, ohne eine Aktion auszufuehren.', 'Checks the bridge local GET contract without executing an action.', 'Revisa el contrato GET local de Bridge sin ejecutar acciones.', 'Verifie le contrat GET local de Bridge sans executer d action.'), labels('Info, Aktionen und Ereignisendpunkt sind als lesbare Referenz sichtbar.', 'Info, actions, and event endpoints are visible as a read-only reference.', 'Info, acciones y endpoint de eventos son visibles como referencia.', 'Les endpoints info, actions et events sont visibles comme reference.'), LOCAL, READ_ONLY, FIX),
    steps: [
      inspect('bridge-overview', '/api-bridge/ui', '#bridge-overview', labels('die lokale Read-only-Einordnung', 'the local read-only introduction', 'la introduccion local de solo lectura', 'l introduction locale en lecture seule')),
      inspect('bridge-info', '/api-bridge/ui', '#bridge-info', labels('GET /api/bridge/info', 'GET /api/bridge/info', 'GET /api/bridge/info', 'GET /api/bridge/info')),
      inspect('bridge-actions', '/api-bridge/ui', '#bridge-actions', labels('GET /api/bridge/actions', 'GET /api/bridge/actions', 'GET /api/bridge/actions', 'GET /api/bridge/actions')),
      inspect('bridge-events', '/api-bridge/ui', '#bridge-events', labels('GET /api/bridge/events?limit=1', 'GET /api/bridge/events?limit=1', 'GET /api/bridge/events?limit=1', 'GET /api/bridge/events?limit=1')),
      inspect('bridge-post-boundary', '/api-bridge/ui', '#bridge-safety', labels('die POST-Sicherheitsgrenze', 'the POST safety boundary', 'el limite de seguridad POST', 'la limite de securite POST'))
    ]
  }),
  'config-import': guide({
    id: 'config-import', route: '/plugins/config-import/ui.html', requirement: 'local', safety: 'credentials', mode: 'ui', related: ['data-source', 'store-admin'],
    copy: meta(labels('Config Import absichern', 'Safeguard Config Import', 'Proteger Config Import', 'Securiser Config Import'), labels('Dokumentiert Auswahl und Wiederherstellungsbereiche, ohne ein Backup zu erzeugen oder einzuspielen.', 'Documents selection and restore areas without creating or importing a backup.', 'Documenta seleccion y restauracion sin crear ni importar respaldo.', 'Documente les zones de selection et restauration sans creer ni importer de sauvegarde.'), labels('Die Export- und Importbereiche sind sichtbar, ohne Dateien anzufassen.', 'Export and import areas are visible without touching files.', 'Las areas de exportacion e importacion son visibles sin tocar archivos.', 'Les zones export et import sont visibles sans toucher aux fichiers.'), LOCAL, READ_ONLY, FIX),
    steps: [
      inspect('backup-overview', '/plugins/config-import/ui.html', '.tab-btn[data-tab="export"]', labels('die Backup-Uebersicht', 'the backup overview', 'la vista general de copias', 'la vue d ensemble des sauvegardes')),
      inspect('export-tab', '/plugins/config-import/ui.html', '#tab-export', labels('den Exportbereich', 'the export area', 'el area de exportacion', 'la zone d export')),
      inspect('global-toggle', '/plugins/config-import/ui.html', '#incGlobal', labels('die Auswahl globaler Einstellungen', 'the global-settings selection', 'la seleccion de ajustes globales', 'la selection des reglages globaux')),
      inspect('export-boundary', '/plugins/config-import/ui.html', '#exportBtn', labels('die nicht ausgeloeste Backup-Aktion', 'the backup action left untriggered', 'la accion de copia no activada', 'l action de sauvegarde non declenchee')),
      inspect('import-tab', '/plugins/config-import/ui.html', '.tab-btn[data-tab="import"]', labels('den Import- und Wiederherstellungsbereich', 'the import and restore area', 'el area de importacion y restauracion', 'la zone d importation et restauration'))
    ]
  }),
  'data-source': guide({
    id: 'data-source', route: '/plugins/data-source/ui.html', requirement: 'network', safety: 'credentials', mode: 'ui', related: ['api-bridge', 'sidekick'],
    copy: meta(labels('Datenquelle vergleichen', 'Compare Data Sources', 'Comparar fuentes de datos', 'Comparer les sources de donnees'), labels('Vergleicht Eulerstream und TikFinity lokal, ohne eine externe Quelle zu aktivieren.', 'Compares Eulerstream and TikFinity locally without enabling an external source.', 'Compara Eulerstream y TikFinity localmente sin activar fuente externa.', 'Compare Eulerstream et TikFinity localement sans activer de source externe.'), labels('Die Quelle und die lokalen TikFinity-Felder sind sichtbar.', 'The source state and local TikFinity fields are visible.', 'El estado de fuente y campos locales de TikFinity son visibles.', 'L etat de source et les champs TikFinity locaux sont visibles.'), LOCAL, READ_ONLY, FIX),
    steps: [
      inspect('source-status', '/plugins/data-source/ui.html', '#status-badge', labels('den aktiven Quellenstatus', 'the active source status', 'el estado de fuente activo', 'le statut de source active')),
      inspect('eulerstream-card', '/plugins/data-source/ui.html', '#card-eulerstream', labels('die Eulerstream-Karte', 'the Eulerstream card', 'la tarjeta Eulerstream', 'la carte Eulerstream')),
      inspect('tikfinity-card', '/plugins/data-source/ui.html', '#card-tikfinity', labels('die TikFinity-Karte', 'the TikFinity card', 'la tarjeta TikFinity', 'la carte TikFinity')),
      inspect('tikfinity-port', '/plugins/data-source/ui.html', '#tikfinity-port', labels('das lokale TikFinity-Portfeld', 'the local TikFinity port field', 'el campo de puerto TikFinity local', 'le champ de port TikFinity local')),
      inspect('save-boundary', '/plugins/data-source/ui.html', '#btn-save-tikfinity', labels('die nicht ausgeloeste Speichern-Aktion', 'the save action left untriggered', 'la accion guardar no activada', 'l action enregistrer non declenchee'))
    ]
  }),
  gcce: guide({
    id: 'gcce', route: '/gcce/ui', requirement: 'local', safety: 'local', mode: 'ui', overlay: '/plugins/gcce/overlay-hud', related: ['game-engine', 'api-bridge'],
    copy: meta(labels('GCCE kontrolliert pruefen', 'Inspect GCCE safely', 'Inspeccionar GCCE con seguridad', 'Inspecter GCCE en securite'), labels('Zeigt Dashboard, Commands, Monitoring und HUD ohne Chat-Gamepad-Eingaben.', 'Shows Dashboard, Commands, Monitoring, and HUD without chat-gamepad input.', 'Muestra panel, comandos, monitorizacion y HUD sin entrada de gamepad por chat.', 'Affiche tableau, commandes, suivi et HUD sans entree gamepad par chat.'), labels('Die getrennten GCCE-Bereiche sind sichtbar; keine Steueraktion wird gesendet.', 'The separate GCCE areas are visible; no control action is sent.', 'Las areas GCCE son visibles; no se envia accion de control.', 'Les zones GCCE sont visibles ; aucune action de controle n est envoyee.'), LOCAL, READ_ONLY, FIX),
    steps: [
      inspect('dashboard', '/gcce/ui', '#tab-dashboard', labels('das GCCE-Dashboard', 'the GCCE dashboard', 'el panel GCCE', 'le tableau GCCE')),
      inspect('refresh-boundary', '/gcce/ui', '#btn-refresh-stats', labels('die lokale Statistik-Aktualisierung', 'the local statistics refresh', 'la actualizacion local de estadisticas', 'le rafraichissement local des statistiques')),
      inspect('commands', '/gcce/ui', '#tab-commands', labels('den Commands-Bereich', 'the Commands area', 'el area de comandos', 'la zone Commands')),
      inspect('monitoring', '/gcce/ui', '#tab-monitoring', labels('den Monitoring-Bereich', 'the Monitoring area', 'el area de monitorizacion', 'la zone Monitoring')),
      inspect('hud', '/gcce/ui', '#tab-hud', labels('die HUD-Overlay-Konfiguration', 'the HUD overlay configuration', 'la configuracion del overlay HUD', 'la configuration de l overlay HUD'))
    ]
  }),
  'gift-catalog': guide({
    id: 'gift-catalog', route: '/gift-catalog/ui', requirement: 'network', safety: 'credentials', mode: 'ui', related: ['advanced-timer', 'soundboard'],
    copy: meta(labels('Gift Catalog vorbereiten', 'Prepare Gift Catalog', 'Preparar Gift Catalog', 'Preparer Gift Catalog'), labels('Prueft Sprach- und Katalogfelder ohne eine externe Katalogabfrage oder Speicherung.', 'Inspects language and catalog fields without external catalog lookup or saving.', 'Revisa idioma y catalogo sin consulta externa ni guardado.', 'Inspecte les champs langue et catalogue sans recherche externe ni enregistrement.'), labels('Status und Sprachfelder sind als lokale Eingabeflaeche sichtbar.', 'Status and language fields are visible as a local input surface.', 'Estado y campos de idioma son visibles como interfaz local.', 'Le statut et les champs de langue sont visibles comme surface locale.'), LOCAL, READ_ONLY, FIX),
    steps: [
      inspect('catalog-status', '/gift-catalog/ui', '#connection-state', labels('den Katalog-Verbindungsstatus', 'the catalog connection status', 'el estado de conexion del catalogo', 'le statut de connexion du catalogue')),
      inspect('catalog-guide', '/gift-catalog/ui', '#guide-tabs', labels('die Gift-Catalog-Anleitungskarte', 'the Gift Catalog guide card', 'la tarjeta de guia Gift Catalog', 'la carte guide Gift Catalog')),
      inspect('catalog-form', '/gift-catalog/ui', '#config-form', labels('das Katalog-Konfigurationsformular', 'the catalog configuration form', 'el formulario de configuracion del catalogo', 'le formulaire de configuration du catalogue')),
      inspect('app-language', '/gift-catalog/ui', '#app-language', labels('das App-Sprachfeld', 'the app-language field', 'el campo de idioma de la aplicacion', 'le champ de langue de l application')),
      inspect('browser-language', '/gift-catalog/ui', '#browser-language', labels('das Browser-Sprachfeld', 'the browser-language field', 'el campo de idioma del navegador', 'le champ de langue du navigateur'))
    ]
  }),
  'store-admin': guide({
    id: 'store-admin', route: '/api/plugin-store/config', requirement: 'admin', safety: 'credentials', mode: 'api', related: ['config-import', 'api-bridge'],
    copy: meta(labels('Store Admin technisch pruefen', 'Inspect Store Admin technically', 'Inspeccionar Store Admin tecnicamente', 'Inspecter Store Admin techniquement'), labels('Prueft das lokale Plugin-Inventar sowie Laufzeit-, Health-, Debug- und Initialisierungsstatus ohne Anmeldung, Lizenzanspruch oder Paketmutation.', 'Checks local plugin inventory plus runtime, health, debug, and initialization status without sign-in, license claims, or package mutation.', 'Revisa inventario local de plugins y estado de ejecucion, salud, depuracion e inicializacion sin iniciar sesion, reclamar licencia ni mutar paquetes.', 'Verifie l inventaire local des plugins ainsi que les etats d execution, sante, debug et initialisation sans connexion, reclamation de licence ni mutation de paquet.'), labels('Fuenf sichere lokale JSON-Vertraege fuer Inventar und Service-Status sind lesbar; keine Anmeldungs- oder Schluesselantwort wird gezeigt.', 'Five safe local JSON contracts for inventory and service status are readable; no sign-in or key response is shown.', 'Cinco contratos JSON locales seguros para inventario y estado de servicio son legibles; no se muestra respuesta de inicio de sesion ni claves.', 'Cinq contrats JSON locaux surs pour inventaire et etat du service sont lisibles ; aucune reponse de connexion ni cle n est affichee.'), labels('Lokales LTTH-Testprofil; keine Store-Anmeldung erforderlich.', 'A local LTTH test profile; no Store sign-in required.', 'Perfil local de prueba LTTH; no requiere inicio de sesion Store.', 'Profil de test LTTH local ; aucune connexion Store requise.'), labels('Nur GET-Routen oeffnen. Kein POST, DELETE, License Claim, Install, Revoke oder Community-Source-Aufruf ausfuehren.', 'Open GET routes only. Do not perform POST, DELETE, license claims, installs, revokes, or community-source calls.', 'Abre solo rutas GET. No ejecutes POST, DELETE, reclamos de licencia, instalaciones, revocaciones ni fuentes comunitarias.', 'Ouvrez uniquement des routes GET. N executez ni POST, DELETE, reclamation de licence, installation, revocation ou source communautaire.'), labels('Wenn eine Route nicht lesbar ist, pruefe den lokalen Server und die Plugin-Route. Authentifizierte Account- und Source-Routen gehoeren nicht in dieses anonyme Testprofil.', 'If a route is not readable, check the local server and plugin route. Authenticated account and source routes do not belong in this anonymous test profile.', 'Si una ruta no es legible, comprueba el servidor local y la ruta del plugin. Las rutas autenticadas de cuenta y fuentes no pertenecen a este perfil anonimo.', 'Si une route nest pas lisible, verifiez le serveur local et la route du plugin. Les routes authentifiees de compte et de sources ne font pas partie de ce profil anonyme.')),
    steps: [
      inspect('admin-shell', '/api/plugins', 'pre', labels('das lokale Plugin-Inventar', 'the local plugin inventory', 'el inventario local de plugins', 'l inventaire local des plugins')),
      inspect('session-control', '/api/status', 'pre', labels('den lokalen Laufzeitstatus vor einer Store-Aktion', 'the local runtime status before a store action', 'el estado local de ejecucion antes de una accion Store', 'l etat local dexecution avant une action Store')),
      inspect('health-control', '/api/health', 'pre', labels('den lokalen Health-Vertrag vor jeder Store-Mutation', 'the local health contract before any store mutation', 'el contrato local de salud antes de cualquier mutacion Store', 'le contrat de sante local avant toute mutation Store')),
      inspect('feedback-control', '/api/debug/status', 'pre', labels('den sichtbaren lokalen Debug-Status', 'the visible local debug status', 'el estado de depuracion local visible', 'le statut de debug local visible')),
      inspect('search-boundary', '/api/init-state', 'pre', labels('den lokalen Initialisierungsstatus vor einer Store-Aktion', 'the local initialization status before a store action', 'el estado local de inicializacion antes de una accion Store', 'l etat local d initialisation avant une action Store'))
    ]
  })
};
