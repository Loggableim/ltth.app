#!/usr/bin/env node

/**
 * Seed the four-language locale contract for plugins that predate the
 * namespaced locale convention. The dictionaries are intentionally explicit:
 * they provide translated metadata and stable common UI labels while each
 * plugin migrates its remaining templates to data-i18n keys.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'app', 'plugins');
const locales = {
  en: {
    actions: { save: 'Save', cancel: 'Cancel', refresh: 'Refresh', close: 'Close', test: 'Test', clear: 'Clear' },
    status: { ready: 'Ready', loading: 'Loading…', connected: 'Connected', disconnected: 'Disconnected', error: 'Error' },
    messages: { saved: 'Settings saved.', failed: 'Could not save settings.', noData: 'No data available.', confirm: 'Are you sure?' }
  },
  de: {
    actions: { save: 'Speichern', cancel: 'Abbrechen', refresh: 'Aktualisieren', close: 'Schließen', test: 'Testen', clear: 'Leeren' },
    status: { ready: 'Bereit', loading: 'Wird geladen…', connected: 'Verbunden', disconnected: 'Getrennt', error: 'Fehler' },
    messages: { saved: 'Einstellungen gespeichert.', failed: 'Einstellungen konnten nicht gespeichert werden.', noData: 'Keine Daten verfügbar.', confirm: 'Bist du sicher?' }
  },
  es: {
    actions: { save: 'Guardar', cancel: 'Cancelar', refresh: 'Actualizar', close: 'Cerrar', test: 'Probar', clear: 'Vaciar' },
    status: { ready: 'Listo', loading: 'Cargando…', connected: 'Conectado', disconnected: 'Desconectado', error: 'Error' },
    messages: { saved: 'Configuración guardada.', failed: 'No se pudo guardar la configuración.', noData: 'No hay datos disponibles.', confirm: '¿Estás seguro?' }
  },
  fr: {
    actions: { save: 'Enregistrer', cancel: 'Annuler', refresh: 'Actualiser', close: 'Fermer', test: 'Tester', clear: 'Effacer' },
    status: { ready: 'Prêt', loading: 'Chargement…', connected: 'Connecté', disconnected: 'Déconnecté', error: 'Erreur' },
    messages: { saved: 'Paramètres enregistrés.', failed: 'Impossible d’enregistrer les paramètres.', noData: 'Aucune donnée disponible.', confirm: 'Confirmer ?' }
  }
};

const plugins = {
  'api-bridge': {
    en: ['API Bridge', 'Enables external applications to control LTTH through HTTP and WebSocket APIs.'],
    de: ['API Bridge', 'Ermöglicht externen Anwendungen die Steuerung von LTTH über HTTP- und WebSocket-APIs.'],
    es: ['API Bridge', 'Permite controlar LTTH desde aplicaciones externas mediante APIs HTTP y WebSocket.'],
    fr: ['API Bridge', 'Permet à des applications externes de contrôler LTTH via des API HTTP et WebSocket.']
  },
  },
  'flame-overlay': {
    en: ['Visual FX Frame', 'Broadcast-safe WebGL effects with live triggers, presets and transparent OBS output.'],
    de: ['Visual FX Frame', 'Broadcast-sichere WebGL-Effekte mit Live-Triggern, Presets und transparentem OBS-Ausgang.'],
    es: ['Visual FX Frame', 'Efectos WebGL seguros para emisión con activadores en directo, presets y salida OBS transparente.'],
    fr: ['Visual FX Frame', 'Effets WebGL adaptés au broadcast avec déclencheurs en direct, préréglages et sortie OBS transparente.']
  },
  'gift-catalog': {
    en: ['Gift Catalog', 'Refresh and inspect TikTok gift catalog data by language and region.'],
    de: ['Geschenkkatalog', 'Aktualisiere und prüfe den TikTok-Geschenkkatalog nach Sprache und Region.'],
    es: ['Catálogo de regalos', 'Actualiza y revisa el catálogo de regalos de TikTok por idioma y región.'],
    fr: ['Catalogue de cadeaux', 'Actualisez et inspectez le catalogue de cadeaux TikTok par langue et région.']
  },
  'interactive-story': {
    en: ['Interactive Story Generator', 'Create AI-assisted interactive stories with chat voting, voices and OBS overlays.'],
    de: ['Interaktiver Story-Generator', 'Erstelle KI-gestützte interaktive Geschichten mit Chat-Abstimmungen, Stimmen und OBS-Overlays.'],
    es: ['Generador de historias interactivas', 'Crea historias interactivas con IA, votaciones en el chat, voces y overlays para OBS.'],
    fr: ['Générateur d’histoires interactives', 'Créez des histoires interactives avec IA, votes dans le chat, voix et overlays OBS.']
  },
  'music-bot': {
    en: ['Music Bot', 'Let viewers request, skip and manage music in TikTok LIVE through chat commands.'],
    de: ['Music Bot', 'Lass Zuschauer Musik in TikTok LIVE per Chat-Befehl anfordern, überspringen und verwalten.'],
    es: ['Bot de música', 'Permite a los espectadores solicitar, saltar y gestionar música en TikTok LIVE mediante comandos.'],
    fr: ['Bot musical', 'Permettez aux spectateurs de demander, ignorer et gérer la musique sur TikTok LIVE par commandes.']
  },
  sidekick: {
    en: ['Sidekick', 'Intelligent stream assistant for event analysis, automatic responses and stream analytics.'],
    de: ['Sidekick', 'Intelligenter Stream-Assistent für Event-Analyse, automatische Antworten und Stream-Analysen.'],
    es: ['Sidekick', 'Asistente inteligente para analizar eventos, responder automáticamente y consultar analíticas.'],
    fr: ['Sidekick', 'Assistant de stream intelligent pour analyser les événements, répondre automatiquement et suivre les statistiques.']
  },
  'stt-ticker': {
    en: ['STT Ticker', 'Live caption overlay that transcribes host speech for accessible OBS streams.'],
    de: ['STT-Ticker', 'Live-Untertitel-Overlay, das die Sprache des Hosts für barrierearme OBS-Streams transkribiert.'],
    es: ['Ticker STT', 'Overlay de subtítulos en directo que transcribe la voz del anfitrión para streams OBS accesibles.'],
    fr: ['Ticker STT', 'Overlay de sous-titres en direct qui transcrit la voix de l’hôte pour des streams OBS accessibles.']
  },
  'talking-heads': {
    en: ['Talking Heads', 'Generate animated 2D avatars with synchronized TTS speech and OBS integration.'],
    de: ['Talking Heads', 'Erzeuge animierte 2D-Avatare mit synchroner TTS-Sprache und OBS-Integration.'],
    es: ['Talking Heads', 'Genera avatares 2D animados con voz TTS sincronizada e integración con OBS.'],
    fr: ['Talking Heads', 'Générez des avatars 2D animés avec voix TTS synchronisée et intégration OBS.']
  },
  toptier: {
    en: ['Top Tier', 'Live likes and gifts leaderboard with decay, rank animations and portrait or landscape overlays.'],
    de: ['Top Tier', 'Live-Like- und Geschenk-Rangliste mit Decay, Rang-Animationen sowie Hoch- und Querformat-Overlays.'],
    es: ['Top Tier', 'Clasificación de likes y regalos en directo con decaimiento, animaciones y overlays verticales u horizontales.'],
    fr: ['Top Tier', 'Classement des likes et cadeaux en direct avec décroissance, animations et overlays portrait ou paysage.']
  },
  tts: {
    en: ['Text-to-Speech System', 'Enterprise TTS with multiple engines, permissions, language detection, caching and queue management.'],
    de: ['Text-to-Speech-System', 'Enterprise-TTS mit mehreren Engines, Berechtigungen, Spracherkennung, Caching und Warteschlangenverwaltung.'],
    es: ['Sistema de texto a voz', 'TTS empresarial con varios motores, permisos, detección de idioma, caché y gestión de colas.'],
    fr: ['Système de synthèse vocale', 'TTS d’entreprise avec plusieurs moteurs, permissions, détection de langue, cache et gestion de file.']
  }
};

for (const [id, translations] of Object.entries(plugins)) {
  const localeDir = path.join(root, id, 'locales');
  fs.mkdirSync(localeDir, { recursive: true });
  for (const locale of Object.keys(locales)) {
    const [name, description] = translations[locale];
    const namespace = id.replace(/-/g, '_');
    const output = {
      [namespace]: {
        plugin: { name, description },
        ui: {
          title: name,
          actions: locales[locale].actions,
          status: locales[locale].status,
          messages: locales[locale].messages
        }
      }
    };
    fs.writeFileSync(path.join(localeDir, `${locale}.json`), `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  }
}

console.log(`Generated four-language locale seeds for ${Object.keys(plugins).length} plugins.`);
