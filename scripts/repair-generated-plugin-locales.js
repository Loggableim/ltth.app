const fs = require('fs');
const path = require('path');

const common = {
  de: { save: 'Speichern', cancel: 'Abbrechen', refresh: 'Aktualisieren', close: 'Schließen', test: 'Testen', clear: 'Leeren', ready: 'Bereit', loading: 'Wird geladen …', connected: 'Verbunden', disconnected: 'Getrennt', error: 'Fehler', saved: 'Einstellungen gespeichert.', failed: 'Einstellungen konnten nicht gespeichert werden.', noData: 'Keine Daten verfügbar.', confirm: 'Bist du sicher?' },
  es: { save: 'Guardar', cancel: 'Cancelar', refresh: 'Actualizar', close: 'Cerrar', test: 'Probar', clear: 'Borrar', ready: 'Listo', loading: 'Cargando …', connected: 'Conectado', disconnected: 'Desconectado', error: 'Error', saved: 'Ajustes guardados.', failed: 'No se pudieron guardar los ajustes.', noData: 'No hay datos disponibles.', confirm: '¿Seguro que quieres continuar?' },
  fr: { save: 'Enregistrer', cancel: 'Annuler', refresh: 'Actualiser', close: 'Fermer', test: 'Tester', clear: 'Effacer', ready: 'Prêt', loading: 'Chargement…', connected: 'Connecté', disconnected: 'Déconnecté', error: 'Erreur', saved: 'Réglages enregistrés.', failed: 'Impossible d’enregistrer les réglages.', noData: 'Aucune donnée disponible.', confirm: 'Voulez-vous continuer ?' }
};

const descriptions = {
  'api-bridge': {
    root: 'api_bridge', de: { name: 'API-Bridge', description: 'Steuert LTTH über HTTP- und WebSocket-APIs aus externen Anwendungen.' }, es: { name: 'Puente API', description: 'Permite controlar LTTH desde aplicaciones externas mediante APIs HTTP y WebSocket.' }, fr: { name: 'Pont API', description: 'Permet à des applications externes de contrôler LTTH via des API HTTP et WebSocket.' }
  },
  'data-source': {
    root: 'data_source', de: { name: 'Datenquellen-Manager', description: 'Wähle Eulerstream oder TikFinity als TikTok-Datenquelle.' }, es: { name: 'Gestor de fuentes de datos', description: 'Elige Eulerstream o TikFinity como fuente de datos de TikTok.' }, fr: { name: 'Gestionnaire de sources de données', description: 'Choisissez Eulerstream ou TikFinity comme source de données TikTok.' }
  },
  'gift-catalog': {
    root: 'gift_catalog', de: { name: 'Geschenkkatalog', description: 'TikTok-Geschenkdaten nach Sprache und Region aktualisieren und prüfen.' }, es: { name: 'Catálogo de regalos', description: 'Actualiza y consulta el catálogo de regalos de TikTok por idioma y región.' }, fr: { name: 'Catalogue de cadeaux', description: 'Actualisez et consultez le catalogue de cadeaux TikTok par langue et région.' }
  },
  'music-bot': {
    root: 'music_bot', de: { name: 'Musik-Bot', description: 'Zuschauer können Musik im TikTok-LIVE-Chat anfordern, überspringen und verwalten.' }, es: { name: 'Bot de música', description: 'Permite pedir, saltar y gestionar música en TikTok LIVE mediante comandos del chat.' }, fr: { name: 'Bot musical', description: 'Les spectateurs peuvent demander, passer et gérer la musique dans le chat TikTok LIVE.' }
  },
  'stt-ticker': {
    root: 'stt_ticker', de: { name: 'STT-Ticker', description: 'Live-Untertitel-Overlay, das Host-Sprache für barrierearme OBS-Streams transkribiert.' }, es: { name: 'Ticker STT', description: 'Overlay de subtítulos en directo que transcribe la voz del host para streams OBS accesibles.' }, fr: { name: 'Ticker STT', description: 'Overlay de sous-titres en direct qui transcrit la voix de l’hôte pour des streams OBS accessibles.' }
  },
  toptier: {
    root: 'toptier', de: { name: 'Top Tier', description: 'Live-Likes- und Geschenk-Rangliste mit Verfall, Ranganimationen sowie Hoch- und Querformat-Overlays.' }, es: { name: 'Top Tier', description: 'Clasificación de likes y regalos en directo con decaimiento, animaciones de rango y overlays verticales u horizontales.' }, fr: { name: 'Top Tier', description: 'Classement des likes et cadeaux en direct avec décroissance, animations de rang et overlays portrait ou paysage.' }
  },
  'flame-overlay': {
    root: 'flame_overlay', de: { name: 'Visual-FX-Frame', description: 'Broadcast-sichere WebGL-Effekte mit Live-Triggern, Presets und transparentem OBS-Output.' }, es: { name: 'Marco de efectos visuales', description: 'Efectos WebGL seguros para emisión con activadores en directo, presets y salida OBS transparente.' }, fr: { name: 'Cadre d’effets visuels', description: 'Effets WebGL prêts pour la diffusion avec déclencheurs live, préréglages et sortie OBS transparente.' }
  }
};

for (const [plugin, config] of Object.entries(descriptions)) {
  for (const [locale, words] of Object.entries(common)) {
    const file = path.join(__dirname, '..', 'app', 'plugins', plugin, 'locales', `${locale}.json`);
    const current = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    const block = current[config.root] || {};
    const localized = config[locale];
    block.plugin = { ...block.plugin, ...localized };
    block.ui = {
      ...block.ui,
      actions: { ...block.ui?.actions, save: words.save, cancel: words.cancel, refresh: words.refresh, close: words.close, test: words.test, clear: words.clear },
      status: { ...block.ui?.status, ready: words.ready, loading: words.loading, connected: words.connected, disconnected: words.disconnected, error: words.error },
      messages: { ...block.ui?.messages, saved: words.saved, failed: words.failed, noData: words.noData, confirm: words.confirm }
    };
    current[config.root] = block;
    fs.writeFileSync(file, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
  }
}
