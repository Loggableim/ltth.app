#!/usr/bin/env node

/**
 * Script to add multilingual descriptions to all plugin.json files
 * Phase 4: Plugin Descriptions & Metadata Implementation
 */

const fs = require('fs');
const path = require('path');

// Plugin descriptions in 4 languages (EN, DE, ES, FR)
const pluginDescriptions = {
  'advanced-timer': {
    en: 'Professional multi-timer system with event triggers, automation, viewer interaction, and customizable overlays. Perfect for subathons, challenges, stream schedules, and goals.',
    de: 'Professionelles Multi-Timer-System mit Event-Triggern, Automatisierung, Zuschauer-Interaktion und anpassbaren Overlays. Perfekt für Subathons, Challenges, Stream-Zeitpläne und Ziele.',
    es: 'Sistema profesional de múltiples temporizadores con activadores de eventos, automatización, interacción con espectadores y overlays personalizables. Perfecto para subathons, desafíos, horarios de transmisión y objetivos.',
    fr: 'Système professionnel de minuteries multiples avec déclencheurs d\'événements, automatisation, interaction avec les spectateurs et overlays personnalisables. Parfait pour les subathons, défis, plannings de stream et objectifs.'
  },
  'api-bridge': {
    en: 'Enables external applications to control the tool via HTTP and WebSocket. Provides REST API endpoints and real-time event streaming for third-party integrations.',
    de: 'Ermöglicht externen Anwendungen die Steuerung des Tools via HTTP und WebSocket. Bietet REST-API-Endpunkte und Echtzeit-Event-Streaming für Drittanbieter-Integrationen.',
    es: 'Permite que aplicaciones externas controlen la herramienta mediante HTTP y WebSocket. Proporciona endpoints de API REST y streaming de eventos en tiempo real para integraciones de terceros.',
    fr: 'Permet aux applications externes de contrôler l\'outil via HTTP et WebSocket. Fournit des endpoints API REST et streaming d\'événements en temps réel pour les intégrations tierces.'
  },
  'chatango': {
    en: 'Integrates Chatango chat rooms into your stream. Configure embeddable chat widgets, customize appearance, and receive chat messages as events for use in flows and automations.',
    de: 'Integriert Chatango-Chaträume in Ihren Stream. Konfigurieren Sie einbettbare Chat-Widgets, passen Sie das Aussehen an und erhalten Sie Chat-Nachrichten als Events für Flows und Automatisierungen.',
    es: 'Integra salas de chat de Chatango en tu transmisión. Configura widgets de chat insertables, personaliza la apariencia y recibe mensajes de chat como eventos para usar en flujos y automatizaciones.',
    fr: 'Intègre les salons de chat Chatango dans votre stream. Configurez des widgets de chat intégrables, personnalisez l\'apparence et recevez les messages de chat comme événements pour les flux et automatisations.'
  },
  'clarityhud': {
    en: 'Ultra-minimalistic, VR-optimized and accessible HUD overlays for chat and activity feeds. Designed for clarity and readability in virtual reality environments.',
    de: 'Ultra-minimalistische, VR-optimierte und barrierefreie HUD-Overlays für Chat und Activity-Feeds. Entwickelt für Klarheit und Lesbarkeit in Virtual-Reality-Umgebungen.',
    es: 'Overlays HUD ultra minimalistas, optimizados para VR y accesibles para chat y feeds de actividad. Diseñados para claridad y legibilidad en entornos de realidad virtual.',
    fr: 'Overlays HUD ultra-minimalistes, optimisés VR et accessibles pour chat et flux d\'activité. Conçus pour la clarté et la lisibilité dans les environnements de réalité virtuelle.'
  },
  'coinbattle': {
    en: 'Live battle game where viewers compete by sending TikTok gifts to collect coins. Features team battles, multiplier events, historical rankings, badges, and customizable overlays.',
    de: 'Live-Battle-Spiel, bei dem Zuschauer durch TikTok-Geschenke Münzen sammeln. Bietet Team-Battles, Multiplikator-Events, historische Rankings, Badges und anpassbare Overlays.',
    es: 'Juego de batalla en vivo donde los espectadores compiten enviando regalos de TikTok para recolectar monedas. Incluye batallas por equipos, eventos multiplicadores, rankings históricos, insignias y overlays personalizables.',
    fr: 'Jeu de bataille en direct où les spectateurs rivalisent en envoyant des cadeaux TikTok pour collecter des pièces. Comprend des batailles d\'équipe, événements multiplicateurs, classements historiques, badges et overlays personnalisables.'
  },
  'config-import': {
    en: 'Import settings from old installation paths to the current config location. Utility for migrating configurations during updates or reinstallations.',
    de: 'Importiert Einstellungen von alten Installationspfaden zum aktuellen Konfigurationsspeicherort. Dienstprogramm für die Migration von Konfigurationen bei Updates oder Neuinstallationen.',
    es: 'Importa configuraciones desde rutas de instalación antiguas a la ubicación de configuración actual. Utilidad para migrar configuraciones durante actualizaciones o reinstalaciones.',
    fr: 'Importe les paramètres depuis d\'anciens chemins d\'installation vers l\'emplacement de configuration actuel. Utilitaire pour migrer les configurations lors de mises à jour ou réinstallations.'
  },
  'fireworks-webgpu': {
    en: 'WebGPU-accelerated fireworks effects with gift-specific displays, combo systems, and interactive triggers. Features native WebGPU rendering with compute shaders for maximum performance.',
    de: 'WebGPU-beschleunigte Feuerwerk-Effekte mit geschenkspezifischen Anzeigen, Combo-Systemen und interaktiven Triggern. Bietet natives WebGPU-Rendering mit Compute-Shadern für maximale Performance.',
    es: 'Efectos de fuegos artificiales acelerados por WebGPU con pantallas específicas de regalos, sistemas de combo y activadores interactivos. Presenta renderizado WebGPU nativo con shaders de cómputo para máximo rendimiento.',
    fr: 'Effets de feux d\'artifice accélérés WebGPU avec affichages spécifiques aux cadeaux, systèmes de combo et déclencheurs interactifs. Utilise le rendu WebGPU natif avec shaders de calcul pour performance maximale.'
  },
  'fireworks': {
    en: 'GPU-accelerated fireworks effects with gift-specific displays, combo systems, and interactive triggers. Features WebGL/WebGPU rendering with Canvas fallback for broad compatibility.',
    de: 'GPU-beschleunigte Feuerwerk-Effekte mit geschenkspezifischen Anzeigen, Combo-Systemen und interaktiven Triggern. Bietet WebGL/WebGPU-Rendering mit Canvas-Fallback für breite Kompatibilität.',
    es: 'Efectos de fuegos artificiales acelerados por GPU con pantallas específicas de regalos, sistemas de combo y activadores interactivos. Presenta renderizado WebGL/WebGPU con respaldo Canvas para amplia compatibilidad.',
    fr: 'Effets de feux d\'artifice accélérés GPU avec affichages spécifiques aux cadeaux, systèmes de combo et déclencheurs interactifs. Utilise le rendu WebGL/WebGPU avec repli Canvas pour large compatibilité.'
  },
  'flame-overlay': {
    en: 'Configurable WebGL flame border overlay for TikTok livestreams. Features customizable colors, intensity, speed, and frame thickness with transparent background for OBS integration.',
    de: 'Konfigurierbares WebGL-Flammen-Rahmen-Overlay für TikTok-Livestreams. Bietet anpassbare Farben, Intensität, Geschwindigkeit und Rahmenstärke mit transparentem Hintergrund für OBS-Integration.',
    es: 'Overlay de marco de llamas WebGL configurable para transmisiones en vivo de TikTok. Presenta colores personalizables, intensidad, velocidad y grosor de marco con fondo transparente para integración OBS.',
    fr: 'Overlay de cadre de flammes WebGL configurable pour les livestreams TikTok. Propose couleurs personnalisables, intensité, vitesse et épaisseur de cadre avec fond transparent pour intégration OBS.'
  },
  'gcce-hud': {
    en: 'Customizable HUD overlay system with text and image display via chat commands. Integrated with Global Chat Command Engine for dynamic content control.',
    de: 'Anpassbares HUD-Overlay-System mit Text- und Bildanzeige über Chat-Befehle. Integriert mit Global Chat Command Engine für dynamische Inhaltssteuerung.',
    es: 'Sistema de overlay HUD personalizable con visualización de texto e imágenes mediante comandos de chat. Integrado con Global Chat Command Engine para control de contenido dinámico.',
    fr: 'Système d\'overlay HUD personnalisable avec affichage de texte et images via commandes de chat. Intégré avec Global Chat Command Engine pour contrôle de contenu dynamique.'
  },
  'gcce': {
    en: 'Universal chat command interpreter and framework for all plugins. Provides centralized command parsing, permission management, and extensible command registration system.',
    de: 'Universeller Chat-Befehls-Interpreter und Framework für alle Plugins. Bietet zentralisierte Befehlsanalyse, Berechtigungsverwaltung und erweiterbares Befehlsregistrierungssystem.',
    es: 'Intérprete universal de comandos de chat y framework para todos los plugins. Proporciona análisis centralizado de comandos, gestión de permisos y sistema extensible de registro de comandos.',
    fr: 'Interpréteur universel de commandes de chat et framework pour tous les plugins. Fournit analyse centralisée des commandes, gestion des permissions et système extensible d\'enregistrement de commandes.'
  },
  'gift-milestone': {
    en: 'Celebrate coin milestones with custom animations (GIF, MP4) and audio. Triggers special celebrations when cumulative gift coins reach configured thresholds with overlay support.',
    de: 'Feiern Sie Münz-Meilensteine mit benutzerdefinierten Animationen (GIF, MP4) und Audio. Löst spezielle Feierlichkeiten aus, wenn kumulative Geschenk-Münzen konfigurierte Schwellenwerte mit Overlay-Unterstützung erreichen.',
    es: 'Celebra hitos de monedas con animaciones personalizadas (GIF, MP4) y audio. Activa celebraciones especiales cuando las monedas de regalo acumuladas alcanzan umbrales configurados con soporte de overlay.',
    fr: 'Célébrez les jalons de pièces avec animations personnalisées (GIF, MP4) et audio. Déclenche des célébrations spéciales lorsque les pièces de cadeaux cumulées atteignent les seuils configurés avec support d\'overlay.'
  },
  'goals': {
    en: 'Complete Live Goals system with Coin, Likes, Follower, and Custom goal types. Real-time tracking with Event API and customizable overlays for viewer engagement.',
    de: 'Komplettes Live-Ziele-System mit Münz-, Likes-, Follower- und benutzerdefinierten Zieltypen. Echtzeit-Tracking mit Event-API und anpassbaren Overlays für Zuschauer-Engagement.',
    es: 'Sistema completo de objetivos en vivo con tipos de objetivos de monedas, likes, seguidores y personalizados. Seguimiento en tiempo real con API de eventos y overlays personalizables para la participación del espectador.',
    fr: 'Système complet d\'objectifs en direct avec types d\'objectifs Pièces, Likes, Abonnés et personnalisés. Suivi en temps réel avec API d\'événements et overlays personnalisables pour l\'engagement des spectateurs.'
  },
  'hybridshock': {
    en: 'Bidirectional bridge between TikTok Live events and HybridShock API (HTTP/WebSocket). Features flexible mapping system, action queue, rate limiting, and advanced debugging tools.',
    de: 'Bidirektionale Brücke zwischen TikTok-Live-Events und HybridShock-API (HTTP/WebSocket). Bietet flexibles Mapping-System, Action-Queue, Rate-Limiting und erweiterte Debugging-Tools.',
    es: 'Puente bidireccional entre eventos en vivo de TikTok y API de HybridShock (HTTP/WebSocket). Presenta sistema de mapeo flexible, cola de acciones, limitación de tasa y herramientas de depuración avanzadas.',
    fr: 'Pont bidirectionnel entre événements TikTok Live et API HybridShock (HTTP/WebSocket). Comprend système de mappage flexible, file d\'actions, limitation de débit et outils de débogage avancés.'
  },
  'lastevent-spotlight': {
    en: 'Live overlays showing the last active user for each event type (follower, like, chatter, share, gifter, subscriber). Perfect for recognizing recent viewer interactions.',
    de: 'Live-Overlays, die den zuletzt aktiven Benutzer für jeden Event-Typ anzeigen (Follower, Like, Chatter, Share, Gifter, Subscriber). Perfekt zum Erkennen aktueller Zuschauer-Interaktionen.',
    es: 'Overlays en vivo que muestran el último usuario activo para cada tipo de evento (seguidor, like, chatter, compartir, donante, suscriptor). Perfecto para reconocer interacciones recientes de espectadores.',
    fr: 'Overlays en direct affichant le dernier utilisateur actif pour chaque type d\'événement (abonné, like, chatter, partage, donateur, souscripteur). Parfait pour reconnaître les interactions récentes des spectateurs.'
  },
  'leaderboard': {
    en: 'Real-time leaderboard for top gifters with 5 theme designs, session and all-time tracking, and preview mode. Displays top contributors as an OBS overlay with overtake animations.',
    de: 'Echtzeit-Bestenliste für Top-Gifter mit 5 Theme-Designs, Sitzungs- und All-Time-Tracking und Vorschaumodus. Zeigt Top-Beitragende als OBS-Overlay mit Überholungsanimationen an.',
    es: 'Tabla de clasificación en tiempo real para los principales donantes con 5 diseños de temas, seguimiento de sesión y de todos los tiempos, y modo de vista previa. Muestra los principales contribuyentes como overlay de OBS con animaciones de adelantamiento.',
    fr: 'Classement en temps réel pour les meilleurs donateurs avec 5 designs de thèmes, suivi de session et de tous les temps, et mode aperçu. Affiche les principaux contributeurs comme overlay OBS avec animations de dépassement.'
  },
  'minecraft-connect': {
    en: 'Bidirectional real-time integration between TikTok Live events and Minecraft (Java Edition). WebSocket bridge server enables custom events, commands, and in-game interactions.',
    de: 'Bidirektionale Echtzeit-Integration zwischen TikTok-Live-Events und Minecraft (Java Edition). WebSocket-Bridge-Server ermöglicht benutzerdefinierte Events, Befehle und In-Game-Interaktionen.',
    es: 'Integración bidireccional en tiempo real entre eventos en vivo de TikTok y Minecraft (Java Edition). El servidor puente WebSocket permite eventos personalizados, comandos e interacciones en el juego.',
    fr: 'Intégration bidirectionnelle en temps réel entre événements TikTok Live et Minecraft (Java Edition). Le serveur pont WebSocket permet événements personnalisés, commandes et interactions en jeu.'
  },
  'multicam': {
    en: 'Switches OBS scenes via gifts or chat commands; supports Spout feeds, cameras 1-5. Perfect for dynamic multi-camera setups with automated scene switching.',
    de: 'Wechselt OBS-Szenen über Geschenke oder Chat-Befehle; unterstützt Spout-Feeds, Kameras 1-5. Perfekt für dynamische Multi-Kamera-Setups mit automatisiertem Szenenwechsel.',
    es: 'Cambia escenas de OBS mediante regalos o comandos de chat; admite feeds Spout, cámaras 1-5. Perfecto para configuraciones dinámicas de múltiples cámaras con cambio de escena automatizado.',
    fr: 'Change les scènes OBS via cadeaux ou commandes de chat; prend en charge les flux Spout, caméras 1-5. Parfait pour les configurations multi-caméras dynamiques avec changement de scène automatisé.'
  },
  'openshock': {
    en: 'Complete OpenShock API integration for TikTok Live events with event mapping, pattern system, safety layer, queue management, and professional overlay support.',
    de: 'Vollständige OpenShock-API-Integration für TikTok-Live-Events mit Event-Mapping, Pattern-System, Safety-Layer, Queue-Management und professioneller Overlay-Unterstützung.',
    es: 'Integración completa de API de OpenShock para eventos en vivo de TikTok con mapeo de eventos, sistema de patrones, capa de seguridad, gestión de colas y soporte de overlay profesional.',
    fr: 'Intégration API OpenShock complète pour événements TikTok Live avec mappage d\'événements, système de patterns, couche de sécurité, gestion de file d\'attente et support d\'overlay professionnel.'
  },
  'osc-bridge': {
    en: 'Persistent OSC bridge for VRChat integration. Enables bidirectional communication between TikTok events and VRChat avatars via standardized OSC parameters.',
    de: 'Dauerhafte OSC-Brücke für VRChat-Integration. Ermöglicht bidirektionale Kommunikation zwischen TikTok-Events und VRChat-Avataren über standardisierte OSC-Parameter.',
    es: 'Puente OSC persistente para integración de VRChat. Permite comunicación bidireccional entre eventos de TikTok y avatares de VRChat mediante parámetros OSC estandarizados.',
    fr: 'Pont OSC persistant pour intégration VRChat. Permet communication bidirectionnelle entre événements TikTok et avatars VRChat via paramètres OSC standardisés.'
  },
  'quiz-show': {
    en: 'Interactive quiz show plugin for TikTok livestreams with chat integration, jokers, and leaderboard. Features question database management, Superfan jokers, and high-end overlay animations.',
    de: 'Interaktives Quiz-Show-Plugin für TikTok-Livestreams mit Chat-Integration, Jokern und Bestenliste. Bietet Fragendatenbank-Verwaltung, Superfan-Joker und hochwertige Overlay-Animationen.',
    es: 'Plugin de programa de concursos interactivo para transmisiones en vivo de TikTok con integración de chat, comodines y tabla de clasificación. Presenta gestión de base de datos de preguntas, comodines Superfan y animaciones de overlay de alta gama.',
    fr: 'Plugin de jeu-questionnaire interactif pour livestreams TikTok avec intégration de chat, jokers et classement. Comprend gestion de base de données de questions, jokers Superfan et animations d\'overlay haut de gamme.'
  },
  'soundboard': {
    en: 'Gift-specific sounds, audio queue management, and MyInstants integration for TikTok events. Features customizable sound mappings, volume control, and queue prioritization.',
    de: 'Geschenkspezifische Sounds, Audio-Queue-Management und MyInstants-Integration für TikTok-Events. Bietet anpassbare Sound-Mappings, Lautstärkeregelung und Queue-Priorisierung.',
    es: 'Sonidos específicos de regalos, gestión de cola de audio e integración de MyInstants para eventos de TikTok. Presenta mapeos de sonido personalizables, control de volumen y priorización de cola.',
    fr: 'Sons spécifiques aux cadeaux, gestion de file d\'attente audio et intégration MyInstants pour événements TikTok. Comprend mappages de sons personnalisables, contrôle du volume et priorisation de file d\'attente.'
  },
  'streamalchemy': {
    en: 'Transform TikTok gifts into virtual RPG items with crafting mechanics and AI-generated icons. Features inventory system, item crafting, and recipe management.',
    de: 'Verwandeln Sie TikTok-Geschenke in virtuelle RPG-Items mit Crafting-Mechaniken und KI-generierten Icons. Bietet Inventarsystem, Item-Crafting und Rezept-Verwaltung.',
    es: 'Transforma regalos de TikTok en objetos RPG virtuales con mecánicas de elaboración e iconos generados por IA. Presenta sistema de inventario, elaboración de objetos y gestión de recetas.',
    fr: 'Transforme les cadeaux TikTok en objets RPG virtuels avec mécaniques d\'artisanat et icônes générées par IA. Comprend système d\'inventaire, fabrication d\'objets et gestion de recettes.'
  },
  'thermal-printer': {
    en: 'Prints TikTok Live events (chat, gifts, follows) physically on a thermal printer (ESC/POS). Supports USB and network printers with customizable print templates.',
    de: 'Druckt TikTok-Live-Events (Chat, Geschenke, Follows) physisch auf einem Thermodrucker (ESC/POS). Unterstützt USB- und Netzwerkdrucker mit anpassbaren Druckvorlagen.',
    es: 'Imprime eventos en vivo de TikTok (chat, regalos, seguimientos) físicamente en una impresora térmica (ESC/POS). Admite impresoras USB y de red con plantillas de impresión personalizables.',
    fr: 'Imprime les événements TikTok Live (chat, cadeaux, abonnements) physiquement sur une imprimante thermique (ESC/POS). Prend en charge les imprimantes USB et réseau avec modèles d\'impression personnalisables.'
  },
  'tts': {
    en: 'Enterprise-grade TTS plugin with multi-engine support (TikTok, Google Cloud, Speechify, ElevenLabs), permission system, language detection, caching, and queue management.',
    de: 'Enterprise-Grade-TTS-Plugin mit Multi-Engine-Unterstützung (TikTok, Google Cloud, Speechify, ElevenLabs), Berechtigungssystem, Spracherkennung, Caching und Queue-Management.',
    es: 'Plugin TTS de nivel empresarial con soporte multi-motor (TikTok, Google Cloud, Speechify, ElevenLabs), sistema de permisos, detección de idioma, almacenamiento en caché y gestión de colas.',
    fr: 'Plugin TTS de niveau entreprise avec support multi-moteur (TikTok, Google Cloud, Speechify, ElevenLabs), système de permissions, détection de langue, mise en cache et gestion de file d\'attente.'
  },
  'vdoninja': {
    en: 'VDO.Ninja integration for multi-guest streaming. Manages rooms, guests, layouts, and audio controls for professional multi-cam setups with seamless guest integration.',
    de: 'VDO.Ninja-Integration für Multi-Guest-Streaming. Verwaltet Räume, Gäste, Layouts und Audio-Kontrollen für professionelle Multi-Cam-Setups mit nahtloser Gast-Integration.',
    es: 'Integración de VDO.Ninja para transmisión con múltiples invitados. Gestiona salas, invitados, diseños y controles de audio para configuraciones multi-cámara profesionales con integración fluida de invitados.',
    fr: 'Intégration VDO.Ninja pour streaming multi-invités. Gère les salles, invités, dispositions et contrôles audio pour configurations multi-caméras professionnelles avec intégration transparente des invités.'
  },
  'viewer-xp': {
    en: 'Comprehensive viewer XP and leveling system with persistent storage, daily bonuses, streaks, badges, and leaderboards. Gamifies viewer engagement across multiple streams.',
    de: 'Umfassendes Zuschauer-XP- und Leveling-System mit persistenter Speicherung, täglichen Boni, Streaks, Badges und Bestenlisten. Gamifiziert Zuschauer-Engagement über mehrere Streams hinweg.',
    es: 'Sistema integral de XP y nivelación de espectadores con almacenamiento persistente, bonificaciones diarias, rachas, insignias y tablas de clasificación. Gamifica la participación del espectador a través de múltiples transmisiones.',
    fr: 'Système complet d\'XP et de niveau de spectateurs avec stockage persistant, bonus quotidiens, séries, badges et classements. Gamifie l\'engagement des spectateurs sur plusieurs streams.'
  },
  'weather-control': {
    en: 'Professional weather effects plugin with rain, snow, storm, fog, thunder, sunbeam, and glitch cloud effects for TikTok Live overlays. Features customizable intensity and layering.',
    de: 'Professionelles Wettereffekt-Plugin mit Regen, Schnee, Sturm, Nebel, Donner, Sonnenstrahl und Glitch-Cloud-Effekten für TikTok-Live-Overlays. Bietet anpassbare Intensität und Layering.',
    es: 'Plugin profesional de efectos climáticos con lluvia, nieve, tormenta, niebla, trueno, rayo de sol y efectos de nube con falla para overlays de TikTok Live. Presenta intensidad y capas personalizables.',
    fr: 'Plugin d\'effets météorologiques professionnel avec pluie, neige, tempête, brouillard, tonnerre, rayon de soleil et effets de nuage glitch pour overlays TikTok Live. Comprend intensité et superposition personnalisables.'
  }
};

const pluginsDir = path.join(__dirname, 'app', 'plugins');

function updatePluginDescriptions() {
  let successCount = 0;
  let errorCount = 0;
  const updatedPlugins = [];
  const errors = [];

  console.log('Starting plugin description updates...\n');

  for (const [pluginId, descriptions] of Object.entries(pluginDescriptions)) {
    const pluginJsonPath = path.join(pluginsDir, pluginId, 'plugin.json');

    try {
      // Check if plugin.json exists
      if (!fs.existsSync(pluginJsonPath)) {
        const error = `Plugin ${pluginId}: plugin.json not found at ${pluginJsonPath}`;
        console.error(`❌ ${error}`);
        errors.push(error);
        errorCount++;
        continue;
      }

      // Read existing plugin.json
      const pluginJsonContent = fs.readFileSync(pluginJsonPath, 'utf8');
      const pluginJson = JSON.parse(pluginJsonContent);

      // Check if already has descriptions field (skip if it does)
      if (pluginJson.descriptions && Object.keys(pluginJson.descriptions).length === 4) {
        console.log(`⏭️  Plugin ${pluginId}: Already has descriptions field, skipping`);
        continue;
      }

      // Add descriptions field
      pluginJson.descriptions = descriptions;

      // Write back to file with proper formatting (2 spaces indentation)
      fs.writeFileSync(pluginJsonPath, JSON.stringify(pluginJson, null, 2) + '\n', 'utf8');

      console.log(`✅ Plugin ${pluginId}: Updated successfully`);
      updatedPlugins.push(pluginId);
      successCount++;

    } catch (error) {
      const errorMsg = `Plugin ${pluginId}: ${error.message}`;
      console.error(`❌ ${errorMsg}`);
      errors.push(errorMsg);
      errorCount++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('UPDATE SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total plugins processed: ${Object.keys(pluginDescriptions).length}`);
  console.log(`Successfully updated: ${successCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log(`Skipped (already updated): ${Object.keys(pluginDescriptions).length - successCount - errorCount}`);

  if (updatedPlugins.length > 0) {
    console.log('\nUpdated plugins:');
    updatedPlugins.forEach(id => console.log(`  - ${id}`));
  }

  if (errors.length > 0) {
    console.log('\nErrors encountered:');
    errors.forEach(err => console.log(`  - ${err}`));
  }

  console.log('\n' + '='.repeat(60));

  return {
    success: errorCount === 0,
    successCount,
    errorCount,
    updatedPlugins,
    errors
  };
}

// Run the update
const result = updatePluginDescriptions();
process.exit(result.success ? 0 : 1);
