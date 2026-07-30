'use strict';
// BEGIN STREAM MONSTERS PRODUCT PROJECTION
const PRODUCT_PROJECTION = Object.freeze({
  "contractVersion": 1,
  "id": "streamalchemy",
  "name": "Stream Monsters",
  "version": "1.11.1",
  "nextVersion": "1.12.0",
  "packageFilename": "streamalchemy-1.11.1.zip",
  "rulesVersion": 8,
  "arenaLabel": "Arcade Clash",
  "access": {
    "type": "subscriber",
    "badge": "subscriber-only",
    "description": {
      "de": "In einem aktiven LTTH-Abonnement enthalten. Kein separater Plugin-Kauf.",
      "en": "Included with an active LTTH subscription. No separate plugin purchase.",
      "es": "Incluido con una suscripción LTTH activa. No requiere comprar el plugin por separado.",
      "fr": "Inclus avec un abonnement LTTH actif. Aucun achat séparé du plugin."
    }
  },
  "defaults": {
    "hatchDurationMs": 90000,
    "portraitBattleMode": "takeover-74",
    "portraitArenaVariant": "split-arena",
    "portraitProfile": "tiktok-live-studio-1080x1920"
  },
  "locales": [
    "de",
    "en",
    "es",
    "fr"
  ]
});
// END STREAM MONSTERS PRODUCT PROJECTION

const UI_ROUTE = '/streammonsters/ui';
const OVERLAY_ROUTE = '/streammonsters/overlay';
const LOCALES = ['de', 'en', 'es', 'fr'];

function localizedFields(copy, field) {
  return Object.fromEntries(LOCALES.map((locale) => [locale, copy[locale][field]]));
}

function workflowInstructions(copy) {
  return Object.fromEntries(LOCALES.map((locale) => [locale, {
    title: copy[locale].title,
    body: copy[locale].body,
    expected: copy[locale].expected
  }]));
}

function readOnlyStep(id, selector, copy) {
  return {
    id,
    copy,
    capture: {
      route: UI_ROUTE,
      assertVisible: selector,
      focusText: localizedFields(copy, 'title'),
      action: {
        type: 'open-plugin-surface',
        stepId: id
      },
      expected: localizedFields(copy, 'expected')
    },
    workflow: {
      route: UI_ROUTE,
      instructions: workflowInstructions(copy),
      operations: [
        { type: 'goto', route: UI_ROUTE },
        { type: 'open-plugin-surface', selector }
      ],
      postconditions: [
        { type: 'http-status', expected: [200, 304] },
        {
          type: 'url',
          expected: {
            path: UI_ROUTE,
            query: { lang: '$locale' },
            exactQuery: true
          }
        },
        { type: 'visible', selector },
        { type: 'console', expected: 'no-errors' }
      ],
      captureRule: {
        selector,
        viewport: { width: 1440, height: 900 },
        stateChange: false
      }
    }
  };
}

// Complete editorial and workflow contract for Stream Monsters 1.11. The
// workflow remains read-only so documentation captures cannot change a
// viewer's permanent collection or a creator's live configuration.
module.exports = Object.freeze({
  product: PRODUCT_PROJECTION,
  id: 'streamalchemy',
  route: UI_ROUTE,
  topic: {
    de: 'Geschenk-Eier, 72 Formen und interaktive A/B/C-Arena',
    en: 'gift eggs, 72 forms, and the interactive A/B/C arena',
    es: 'huevos por regalos, 72 formas y la arena interactiva A/B/C',
    fr: 'œufs obtenus par cadeaux, 72 formes et arène interactive A/B/C'
  },
  test: {
    de: 'die lokale Stream-Monsters-1.11-Vorschau',
    en: 'the local Stream Monsters 1.11 preview',
    es: 'la vista previa local de Stream Monsters 1.11',
    fr: 'l’aperçu local de Stream Monsters 1.11'
  },
  expected: {
    de: 'Gift-Mapping, 72-Formen-Katalog, A/B/C-Arena und Portrait-Overlay sind sichtbar',
    en: 'gift mapping, the 72-form catalog, the A/B/C arena, and the portrait overlay are visible',
    es: 'se ven el mapeo de regalos, el catálogo de 72 formas, la arena A/B/C y el overlay vertical',
    fr: 'le mappage des cadeaux, le catalogue de 72 formes, l’arène A/B/C et l’overlay portrait sont visibles'
  },
  requirement: 'subscriber',
  safety: 'local',
  mode: 'ui',
  overlay: OVERLAY_ROUTE,
  overlayWorkflowStepIds: ['alchemy-overlay'],
  related: [
    'gcce',
    'gift-catalog'
  ],
  copy: {
    de: {
      title: 'Stream Monsters',
      summary: `Stream Monsters 1.11 verbindet Gift- und optionale Gratis-Eier, 72 gebündelte Furry-Formen, zweisprachige Overlay-Führung und K.-o.-Duelle nach Rules v8 in der TikTok-sicheren 74/26-Portrait-Arena ${PRODUCT_PROJECTION.arenaLabel}.`,
      firstResult: 'Der Creator zeigt Live-Bereitschaft, Gift- und Gratis-Eier, alle 72 Formen, die verdeckte A/B/C-Arena und die OBS-Browserquelle, ohne eine LIVE-Aktion auszulösen.',
      requirements: `LTTH 1.4.1 mit Stream Monsters 1.11. Für den lokalen Aufbau genügt der Creator; TikTok, GCCE und OBS werden erst für den Sendebetrieb benötigt. ${PRODUCT_PROJECTION.access.description.de}`,
      safety: 'Verwende nur lokale Vorschauen. Gratis-Eier und Gifts verändern keine Kampfwerte oder Gewinnchancen. Stream Monsters 1.11 enthält kein Art Lab, keine Bildgenerierung und keinen Modell-Installer.',
      troubleshooting: 'Wenn Gifts, 72 Formen oder die A/B/C-Vorschau fehlen, prüfe den Plugin-Status, öffne /streammonsters/ui neu und kontrolliere die Hinweise im Live Center.',
      related: ['gcce', 'gift-catalog']
    },
    en: {
      title: 'Stream Monsters',
      summary: `Stream Monsters 1.11 combines gift and optional free eggs, 72 bundled Furry forms, bilingual overlay guidance, and sealed Rules v8 K.O. battles in the TikTok-safe 74/26 portrait ${PRODUCT_PROJECTION.arenaLabel} arena.`,
      firstResult: 'The Creator shows live readiness, gift and free eggs, all 72 forms, the sealed A/B/C arena, and the OBS browser source without triggering a LIVE action.',
      requirements: `LTTH 1.4.1 with Stream Monsters 1.11. The Creator is enough for local setup; TikTok, GCCE, and OBS are needed only for broadcast operation. ${PRODUCT_PROJECTION.access.description.en}`,
      safety: 'Use local previews only while checking the setup. Free eggs and gifts never change combat stats or win odds. Stream Monsters 1.11 includes no Art Lab, image generation, or model installer.',
      troubleshooting: 'If gifts, the 72 forms, or the A/B/C preview are missing, check the plugin status, reopen /streammonsters/ui, and review the Live Center warnings.',
      related: ['gcce', 'gift-catalog']
    },
    es: {
      title: 'Stream Monsters',
      summary: `Stream Monsters 1.11 combina huevos por regalos y gratis opcionales, 72 formas Furry, guía bilingüe y combates Rules v8 hasta K.O. en la arena vertical 74/26 ${PRODUCT_PROJECTION.arenaLabel}, segura para TikTok.`,
      firstResult: 'Creator muestra la preparación, los huevos por regalos y gratis, las 72 formas, la arena A/B/C sellada y la fuente de navegador de OBS sin activar ninguna acción LIVE.',
      requirements: `LTTH 1.4.1 con Stream Monsters 1.11. Creator basta para la configuración local; TikTok, GCCE y OBS solo son necesarios para emitir. ${PRODUCT_PROJECTION.access.description.es}`,
      safety: 'Usa únicamente vistas previas locales. Los huevos gratis y los regalos nunca cambian estadísticas ni probabilidades de victoria. Stream Monsters 1.11 no incluye Art Lab, generación de imágenes ni instalador de modelos.',
      troubleshooting: 'Si faltan los regalos, las 72 formas o la vista previa A/B/C, comprueba el estado del plugin, vuelve a abrir /streammonsters/ui y revisa los avisos de Live Center.',
      related: ['gcce', 'gift-catalog']
    },
    fr: {
      title: 'Stream Monsters',
      summary: `Stream Monsters 1.11 réunit les œufs-cadeaux et gratuits facultatifs, 72 formes Furry, un guide bilingue et des combats Rules v8 jusqu’au K.-O. dans l’arène portrait TikTok 74/26 ${PRODUCT_PROJECTION.arenaLabel}.`,
      firstResult: 'Le Creator affiche la préparation, les œufs par cadeaux et gratuits, les 72 formes, l’arène A/B/C scellée et la source navigateur OBS sans déclencher d’action LIVE.',
      requirements: `LTTH 1.4.1 avec Stream Monsters 1.11. Le Creator suffit pour la configuration locale ; TikTok, GCCE et OBS ne sont nécessaires que pour la diffusion. ${PRODUCT_PROJECTION.access.description.fr}`,
      safety: 'Utilisez uniquement les aperçus locaux. Les œufs gratuits et cadeaux ne modifient jamais les statistiques ni les chances de victoire. Stream Monsters 1.11 ne comprend ni Art Lab, ni génération d’images, ni installateur de modèles.',
      troubleshooting: 'Si les cadeaux, les 72 formes ou l’aperçu A/B/C manquent, vérifiez l’état du plugin, rouvrez /streammonsters/ui et consultez les avertissements du Live Center.',
      related: ['gcce', 'gift-catalog']
    }
  },
  steps: [
    readOnlyStep('alchemy-card', '#live-center', {
      de: {
        title: 'Live Center und Sendebereitschaft prüfen',
        body: 'Öffne den Stream-Monsters-Creator und prüfe TikTok-, GCCE-, OBS-, Plugin-, Ei-, Arena-, Renderer- und Audio-Status. Behebe sichtbare Warnungen, bevor du live gehst.',
        expected: 'Das Live Center zeigt alle relevanten Broadcast-Zustände in einer Ansicht.',
        alt: 'Stream Monsters 1.11 Live Center mit Broadcast-Status'
      },
      en: {
        title: 'Check the Live Center and broadcast readiness',
        body: 'Open the Stream Monsters Creator and review TikTok, GCCE, OBS, plugin, egg, arena, renderer, and audio status. Resolve visible warnings before going live.',
        expected: 'The Live Center shows every relevant broadcast state in one view.',
        alt: 'Stream Monsters 1.11 Live Center with broadcast status'
      },
      es: {
        title: 'Comprueba Live Center y la preparación para emitir',
        body: 'Abre Stream Monsters Creator y revisa el estado de TikTok, GCCE, OBS, el plugin, los huevos, la arena, el renderizador y el audio. Resuelve los avisos visibles antes del directo.',
        expected: 'Live Center muestra todos los estados importantes de emisión en una sola vista.',
        alt: 'Live Center de Stream Monsters 1.11 con estado de emisión'
      },
      fr: {
        title: 'Vérifiez le Live Center et la préparation à la diffusion',
        body: 'Ouvrez le Creator Stream Monsters et vérifiez l’état de TikTok, GCCE, OBS, du plugin, des œufs, de l’arène, du rendu et de l’audio. Corrigez les avertissements visibles avant le direct.',
        expected: 'Le Live Center affiche tous les états de diffusion importants dans une seule vue.',
        alt: 'Live Center de Stream Monsters 1.11 avec état de diffusion'
      }
    }),
    readOnlyStep('retention-rules', '#gameplay', {
      de: {
        title: 'Gratis-Eier, verdeckte Wahl und faire Saisonregeln prüfen',
        body: 'Neue Setups nutzen 90 Sekunden Brutzeit; gespeicherte Creator-Zeiten und vorhandene Eier bleiben unverändert. Wiederkehrende Gratis-Eier sind optional und 60 Sekunden reserviert, bevor sie öffentlich per !adopt oder !adoptieren FIFO adoptiert werden. Im Rules-v8-Kampf bleiben Entscheidungen verdeckt: 8 Sekunden Monsterwahl, 6 Sekunden A/B/C bei einer bzw. 10 Sekunden bei zwei Sprachen und 10 Sekunden für 1–4-Statpunkte. Ab Runde 5 beschleunigt Arena Collapse den Kampf bis K.-o. Nur die ersten 10 legitimen Tagesduelle ändern Arena Rating, jedes legitime Duell gibt Monster-XP.',
        expected: 'Gameplay zeigt Gratis-Ei-Cooldown, Tutorial-Hinweise, faire Rollen, Quests und Saisonregeln.',
        alt: 'Stream Monsters 1.11 Gameplay mit Gratis-Eiern und verdeckten Entscheidungen'
      },
      en: {
        title: 'Check free eggs, sealed choices, and fair season rules',
        body: 'Fresh setups use 90-second incubation; stored creator timings and existing eggs remain unchanged. Recurring free eggs are optional and reserved for 60 seconds before entering the public FIFO for !adopt. Rules v8 choices stay sealed: 8 seconds for a monster, 6 seconds for A/B/C with one language or 10 with two, and 10 seconds for 1–4 stat points. Arena Collapse accelerates combat from round 5 until K.O. Only the first 10 legitimate daily battles alter Arena Rating, while every legitimate battle grants monster XP.',
        expected: 'Gameplay shows the free-egg cooldown, tutorial hints, fair roles, quests, and season boundaries.',
        alt: 'Stream Monsters 1.11 gameplay with free eggs and sealed choices'
      },
      es: {
        title: 'Comprueba huevos gratis, elecciones selladas y temporadas justas',
        body: 'Las configuraciones nuevas usan 90 segundos; los tiempos guardados y huevos existentes no cambian. Los huevos gratis periódicos son opcionales y se reservan 60 segundos antes de pasar a la FIFO pública para !adopt. Rules v8 mantiene las elecciones selladas: 8 segundos para monstruo, 6 para A/B/C con una lengua o 10 con dos, y 10 para puntos 1–4. Arena Collapse acelera el combate desde la ronda 5 hasta K.O. Solo los primeros 10 duelos legítimos diarios cambian Arena Rating y todos dan XP.',
        expected: 'Gameplay muestra el cooldown, las ayudas, los roles equilibrados, las misiones y los límites de temporada.',
        alt: 'Gameplay de Stream Monsters 1.11 con huevos gratis y elecciones selladas'
      },
      fr: {
        title: 'Vérifiez les œufs gratuits, les choix scellés et les saisons équitables',
        body: 'Les nouvelles configurations utilisent 90 secondes ; les durées enregistrées et les œufs existants restent inchangés. Les œufs gratuits récurrents sont facultatifs et réservés 60 secondes avant de rejoindre la FIFO publique pour !adopt. Rules v8 garde les choix scellés : 8 secondes pour le monstre, 6 pour A/B/C avec une langue ou 10 avec deux, et 10 pour les points 1–4. Arena Collapse accélère le combat dès la manche 5 jusqu’au K.-O. Seuls les 10 premiers duels quotidiens modifient Arena Rating et tous donnent de l’XP.',
        expected: 'Gameplay affiche le délai, les conseils, les rôles équilibrés, les quêtes et les limites de saison.',
        alt: 'Gameplay Stream Monsters 1.11 avec œufs gratuits et choix scellés'
      }
    }),
    readOnlyStep('automation-rule', '#gifts-chat', {
      de: {
        title: 'Geschenk-Eier und optionale Gratis-Eier einrichten',
        body: 'Wähle im vollständigen TikTok-Gift-Katalog ein Geschenk, ordne Spawn oder Boost und ein Element zu und prüfe die konfliktfreien Chat-Aliase. Gift-Mappings steuern ausschließlich Geschenk-Eier; das optionale wiederkehrende Gratis-Ei wird unabhängig davon unter Gameplay konfiguriert.',
        expected: 'Die Gifts-&-Chat-Ansicht zeigt aktive Gift-Mappings und die verfügbaren Ei-, Monster- und Battle-Kommandos.',
        alt: 'Stream Monsters 1.11 Geschenk-Eier, optionale Gratis-Eier und Chat-Aliase'
      },
      en: {
        title: 'Set up gift eggs, optional free eggs, and chat aliases',
        body: 'Choose a gift from the complete TikTok gift catalog, assign Spawn or Boost and an element, then review conflict-free chat aliases. Gift mappings only control gift-triggered eggs; configure the optional recurring free egg independently under Gameplay.',
        expected: 'The Gifts & Chat view shows enabled gift mappings and the available egg, monster, and battle commands.',
        alt: 'Stream Monsters 1.11 gift eggs, optional free eggs, and chat aliases'
      },
      es: {
        title: 'Configura huevos de regalos, huevos gratis opcionales y alias',
        body: 'Elige un regalo del catálogo completo de TikTok, asigna Spawn o Boost y un elemento, y revisa los alias de chat sin conflictos. Los mapeos solo controlan huevos activados por regalos; el huevo gratis periódico opcional se configura por separado en Gameplay.',
        expected: 'La vista Gifts & Chat muestra los mapeos activos y los comandos de huevos, monstruos y combate disponibles.',
        alt: 'Huevos de regalos, huevos gratis opcionales y alias en Stream Monsters 1.11'
      },
      fr: {
        title: 'Configurez les œufs-cadeaux, les œufs gratuits facultatifs et les alias',
        body: 'Choisissez un cadeau dans le catalogue TikTok complet, attribuez Spawn ou Boost et un élément, puis vérifiez les alias de chat sans conflit. Les mappages contrôlent uniquement les œufs déclenchés par cadeau ; configurez séparément l’œuf gratuit récurrent facultatif dans Gameplay.',
        expected: 'La vue Gifts & Chat affiche les mappages actifs et les commandes disponibles pour les œufs, monstres et combats.',
        alt: 'Œufs-cadeaux, œufs gratuits facultatifs et alias dans Stream Monsters 1.11'
      }
    }),
    readOnlyStep('action-chain', '#asset-library', {
      de: {
        title: '72 gebündelte Formen und Evolution kontrollieren',
        body: 'Prüfe 24 Vorlagen mit je drei verifizierten Furry-Stufen. Evolution II benötigt Meisterschaft 25 und 3 Essenz; Evolution III benötigt Meisterschaft 50 und insgesamt 8 Essenz. Beide Stufen aktivieren feste Elementwerte und rollenspezifische Skill-Upgrades.',
        expected: 'Die Asset-Bibliothek bestätigt 72 gebündelte Formen und den Kenney-Notfall-Fallback.',
        alt: 'Stream Monsters 1.11 Asset-Bibliothek mit 72 Furry-Formen'
      },
      en: {
        title: 'Verify 72 bundled forms and evolution',
        body: 'Review 24 templates with three verified Furry stages each. Evolution II requires mastery 25 and 3 essence spent; Evolution III requires mastery 50 and 8 total essence spent. Both stages activate fixed elemental stats and role-specific skill upgrades.',
        expected: 'The asset library confirms 72 bundled forms and the emergency Kenney fallback.',
        alt: 'Stream Monsters 1.11 asset library with 72 Furry forms'
      },
      es: {
        title: 'Comprueba las 72 formas incluidas y la evolución',
        body: 'Revisa 24 plantillas con tres etapas Furry verificadas cada una. Evolución II requiere maestría 25 y 3 de esencia gastada; Evolución III requiere maestría 50 y 8 de esencia total gastada. Ambas etapas activan atributos elementales fijos y mejoras de habilidades según el rol.',
        expected: 'La biblioteca de recursos confirma 72 formas incluidas y el fallback de emergencia de Kenney.',
        alt: 'Biblioteca de Stream Monsters 1.11 con 72 formas Furry'
      },
      fr: {
        title: 'Vérifiez les 72 formes intégrées et l’évolution',
        body: 'Examinez 24 modèles avec trois stades Furry vérifiés chacun. L’évolution II exige la maîtrise 25 et 3 essences dépensées ; l’évolution III exige la maîtrise 50 et 8 essences dépensées au total. Ces stades activent des statistiques élémentaires fixes et des améliorations de compétence liées au rôle.',
        expected: 'La bibliothèque confirme 72 formes intégrées et le fallback d’urgence Kenney.',
        alt: 'Bibliothèque Stream Monsters 1.11 avec 72 formes Furry'
      }
    }),
    readOnlyStep('rule-dry-run', '#portraitBattlePreview', {
      de: {
        title: 'Interaktive A/B/C-Arena im Portrait prüfen',
        body: 'Prüfe die 1080×1920-Vorschau: Rules v8 zeigt beide Kämpfer, Namen, HP, Schild, Spezialenergie und lesbare A/B/C-Wirkungen in den oberen 74 Prozent. Ab Runde 5 wird Arena Collapse erklärt; K.-o.-Board und elementspezifische WebGPU-Effekte dürfen die unteren 26 Prozent TikTok-Chat-Safe-Zone nicht belegen.',
        expected: 'Die Portrait-Vorschau zeigt das interaktive A/B/C-Kampflayout und die reservierte Chat-Zone.',
        alt: 'Stream Monsters 1.11 Portrait-Arena mit A/B/C-Aktionen'
      },
      en: {
        title: 'Check the interactive A/B/C arena in portrait',
        body: 'Review the 1080×1920 preview: Rules v8 shows both fighters, names, HP, shield, Special charge and readable A/B/C effects in the upper 74 percent. Arena Collapse is explained from round 5; the K.O. board and element-specific WebGPU effects must leave the lower 26 percent TikTok chat safe zone clear.',
        expected: 'The portrait preview shows the interactive A/B/C battle layout and reserved chat zone.',
        alt: 'Stream Monsters 1.11 portrait arena with A/B/C actions'
      },
      es: {
        title: 'Comprueba la arena interactiva A/B/C en vertical',
        body: 'Revisa la vista 1080×1920: Rules v8 muestra luchadores, nombres, HP, escudo, carga Special y efectos A/B/C legibles en el 74 por ciento superior. Arena Collapse se explica desde la ronda 5; el tablero K.O. y los efectos WebGPU elementales dejan libre el 26 por ciento inferior para el chat.',
        expected: 'La vista vertical muestra el combate interactivo A/B/C y la zona de chat reservada.',
        alt: 'Arena vertical de Stream Monsters 1.11 con acciones A/B/C'
      },
      fr: {
        title: 'Vérifiez l’arène interactive A/B/C en portrait',
        body: 'Examinez l’aperçu 1080×1920 : Rules v8 affiche combattants, noms, PV, bouclier, charge Special et effets A/B/C lisibles dans les 74 pour cent supérieurs. Arena Collapse est expliqué dès la manche 5 ; le tableau K.-O. et les effets WebGPU élémentaires laissent libres les 26 pour cent inférieurs.',
        expected: 'L’aperçu portrait montre le combat interactif A/B/C et la zone de chat réservée.',
        alt: 'Arène portrait Stream Monsters 1.11 avec actions A/B/C'
      }
    }),
    readOnlyStep('alchemy-overlay', '#overlayUrl', {
      de: {
        title: 'Stream-Monsters-Overlay in OBS eintragen',
        body: 'Kopiere /streammonsters/overlay in eine OBS-Browserquelle. Wähle Portrait 1080×1920 oder Landscape 1920×1080 und prüfe Renderer-Qualität, Safe-Zone und die fünf Audio-Kanäle mit einer lokalen Demo.',
        expected: 'Die echte Overlay-URL und alle Broadcast-Vorschauen sind im Creator sichtbar.',
        alt: 'Stream Monsters 1.11 OBS-Overlay-URL und Portrait-Vorschau'
      },
      en: {
        title: 'Add the Stream Monsters overlay to OBS',
        body: 'Copy /streammonsters/overlay into an OBS browser source. Choose portrait 1080×1920 or landscape 1920×1080, then review renderer quality, safe zones, and the five audio channels with a local demo.',
        expected: 'The real overlay URL and every broadcast preview are visible in the Creator.',
        alt: 'Stream Monsters 1.11 OBS overlay URL and portrait preview'
      },
      es: {
        title: 'Añade el overlay de Stream Monsters a OBS',
        body: 'Copia /streammonsters/overlay en una fuente de navegador de OBS. Elige vertical 1080×1920 u horizontal 1920×1080 y comprueba la calidad del renderizador, las zonas seguras y los cinco canales de audio con una demo local.',
        expected: 'La URL real del overlay y todas las vistas de emisión son visibles en Creator.',
        alt: 'URL del overlay OBS y vista vertical de Stream Monsters 1.11'
      },
      fr: {
        title: 'Ajoutez l’overlay Stream Monsters à OBS',
        body: 'Copiez /streammonsters/overlay dans une source navigateur OBS. Choisissez le portrait 1080×1920 ou le paysage 1920×1080, puis vérifiez la qualité du rendu, les zones sûres et les cinq canaux audio avec une démo locale.',
        expected: 'L’URL réelle de l’overlay et tous les aperçus de diffusion sont visibles dans le Creator.',
        alt: 'URL de l’overlay OBS et aperçu portrait de Stream Monsters 1.11'
      }
    }),
    readOnlyStep('rule-reset', '#community-seasons', {
      de: {
        title: 'Permanenten Fortschritt schützen',
        body: 'Prüfe Sammlung, Arena Rating, Collector Score und Saison-Countdown nur lesend. Sammlung, Evolution, Level und Statpunkte bleiben saisonübergreifend permanent; die Doku-Prüfung setzt keine Zuschauerdaten zurück.',
        expected: 'Die Community-Ansicht trennt saisonale Ranglisten vom permanenten Monster-Fortschritt.',
        alt: 'Stream Monsters 1.11 Community- und Saisonansicht'
      },
      en: {
        title: 'Protect permanent progression',
        body: 'Review collections, Arena Rating, Collector Score, and the season countdown without changing them. Collections, evolution, levels, and stat points remain permanent across seasons; the documentation check resets no viewer data.',
        expected: 'The community view separates seasonal leaderboards from permanent monster progression.',
        alt: 'Stream Monsters 1.11 community and season view'
      },
      es: {
        title: 'Protege el progreso permanente',
        body: 'Revisa las colecciones, Arena Rating, Collector Score y la cuenta atrás de temporada sin modificarlos. Colección, evolución, niveles y puntos de estadísticas permanecen entre temporadas; la comprobación de documentación no reinicia datos.',
        expected: 'La vista de comunidad separa las clasificaciones de temporada del progreso permanente de los monstruos.',
        alt: 'Vista de comunidad y temporadas de Stream Monsters 1.11'
      },
      fr: {
        title: 'Protégez la progression permanente',
        body: 'Consultez les collections, l’Arena Rating, le Collector Score et le compte à rebours de saison sans les modifier. Collection, évolution, niveaux et points de statistiques restent permanents entre les saisons ; la vérification de documentation ne réinitialise aucune donnée.',
        expected: 'La vue Communauté sépare les classements saisonniers de la progression permanente des monstres.',
        alt: 'Vue Communauté et saisons de Stream Monsters 1.11'
      }
    })
  ]
});
