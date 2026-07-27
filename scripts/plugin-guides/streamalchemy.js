'use strict';

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

// Complete editorial and workflow contract for Stream Monsters 1.8. The
// workflow remains read-only so documentation captures cannot change a
// viewer's permanent collection or a creator's live configuration.
module.exports = Object.freeze({
  id: 'streamalchemy',
  route: UI_ROUTE,
  topic: {
    de: 'Geschenk-Eier, 72 Formen und interaktive A/B/C-Arena',
    en: 'gift eggs, 72 forms, and the interactive A/B/C arena',
    es: 'huevos por regalos, 72 formas y la arena interactiva A/B/C',
    fr: 'œufs obtenus par cadeaux, 72 formes et arène interactive A/B/C'
  },
  test: {
    de: 'die lokale Stream-Monsters-1.8-Vorschau',
    en: 'the local Stream Monsters 1.8 preview',
    es: 'la vista previa local de Stream Monsters 1.8',
    fr: 'l’aperçu local de Stream Monsters 1.8'
  },
  expected: {
    de: 'Gift-Mapping, 72-Formen-Katalog, A/B/C-Arena und Portrait-Overlay sind sichtbar',
    en: 'gift mapping, the 72-form catalog, the A/B/C arena, and the portrait overlay are visible',
    es: 'se ven el mapeo de regalos, el catálogo de 72 formas, la arena A/B/C y el overlay vertical',
    fr: 'le mappage des cadeaux, le catalogue de 72 formes, l’arène A/B/C et l’overlay portrait sont visibles'
  },
  requirement: 'standard',
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
      summary: 'Stream Monsters 1.8 verbindet vom Creator aktivierte Gift-Eier, optionale wiederkehrende Gratis-Eier, 72 gebündelte Furry-Formen, permanente Entwicklung und verdeckte A/B/C-Duelle in einer Portrait-first-Arena.',
      firstResult: 'Der Creator zeigt Live-Bereitschaft, Gift- und Gratis-Eier, alle 72 Formen, die verdeckte A/B/C-Arena und die OBS-Browserquelle, ohne eine LIVE-Aktion auszulösen.',
      requirements: 'LTTH 1.4.1 mit Stream Monsters 1.8. Für den lokalen Aufbau genügt der Creator; TikTok, GCCE und OBS werden erst für den Sendebetrieb benötigt.',
      safety: 'Verwende nur lokale Vorschauen. Gratis-Eier und Gifts verändern keine Kampfwerte oder Gewinnchancen. Stream Monsters 1.8 enthält kein Art Lab, keine Bildgenerierung und keinen Modell-Installer.',
      troubleshooting: 'Wenn Gifts, 72 Formen oder die A/B/C-Vorschau fehlen, prüfe den Plugin-Status, öffne /streammonsters/ui neu und kontrolliere die Hinweise im Live Center.',
      related: ['gcce', 'gift-catalog']
    },
    en: {
      title: 'Stream Monsters',
      summary: 'Stream Monsters 1.8 combines creator-enabled gift eggs, optional recurring free eggs, 72 bundled Furry forms, permanent progression, and sealed A/B/C battles in a portrait-first arena.',
      firstResult: 'The Creator shows live readiness, gift and free eggs, all 72 forms, the sealed A/B/C arena, and the OBS browser source without triggering a LIVE action.',
      requirements: 'LTTH 1.4.1 with Stream Monsters 1.8. The Creator is enough for local setup; TikTok, GCCE, and OBS are needed only for broadcast operation.',
      safety: 'Use local previews only while checking the setup. Free eggs and gifts never change combat stats or win odds. Stream Monsters 1.8 includes no Art Lab, image generation, or model installer.',
      troubleshooting: 'If gifts, the 72 forms, or the A/B/C preview are missing, check the plugin status, reopen /streammonsters/ui, and review the Live Center warnings.',
      related: ['gcce', 'gift-catalog']
    },
    es: {
      title: 'Stream Monsters',
      summary: 'Stream Monsters 1.8 combina huevos por regalos activados por el creador, huevos gratis periódicos opcionales, 72 formas Furry incluidas, progreso permanente y combates A/B/C sellados en una arena vertical.',
      firstResult: 'Creator muestra la preparación, los huevos por regalos y gratis, las 72 formas, la arena A/B/C sellada y la fuente de navegador de OBS sin activar ninguna acción LIVE.',
      requirements: 'LTTH 1.4.1 con Stream Monsters 1.8. Creator basta para la configuración local; TikTok, GCCE y OBS solo son necesarios para emitir.',
      safety: 'Usa únicamente vistas previas locales. Los huevos gratis y los regalos nunca cambian estadísticas ni probabilidades de victoria. Stream Monsters 1.8 no incluye Art Lab, generación de imágenes ni instalador de modelos.',
      troubleshooting: 'Si faltan los regalos, las 72 formas o la vista previa A/B/C, comprueba el estado del plugin, vuelve a abrir /streammonsters/ui y revisa los avisos de Live Center.',
      related: ['gcce', 'gift-catalog']
    },
    fr: {
      title: 'Stream Monsters',
      summary: 'Stream Monsters 1.8 réunit les œufs issus des cadeaux activés par le Creator, des œufs gratuits récurrents facultatifs, 72 formes Furry, une progression permanente et des combats A/B/C scellés dans une arène portrait.',
      firstResult: 'Le Creator affiche la préparation, les œufs par cadeaux et gratuits, les 72 formes, l’arène A/B/C scellée et la source navigateur OBS sans déclencher d’action LIVE.',
      requirements: 'LTTH 1.4.1 avec Stream Monsters 1.8. Le Creator suffit pour la configuration locale ; TikTok, GCCE et OBS ne sont nécessaires que pour la diffusion.',
      safety: 'Utilisez uniquement les aperçus locaux. Les œufs gratuits et cadeaux ne modifient jamais les statistiques ni les chances de victoire. Stream Monsters 1.8 ne comprend ni Art Lab, ni génération d’images, ni installateur de modèles.',
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
        alt: 'Stream Monsters 1.8 Live Center mit Broadcast-Status'
      },
      en: {
        title: 'Check the Live Center and broadcast readiness',
        body: 'Open the Stream Monsters Creator and review TikTok, GCCE, OBS, plugin, egg, arena, renderer, and audio status. Resolve visible warnings before going live.',
        expected: 'The Live Center shows every relevant broadcast state in one view.',
        alt: 'Stream Monsters 1.8 Live Center with broadcast status'
      },
      es: {
        title: 'Comprueba Live Center y la preparación para emitir',
        body: 'Abre Stream Monsters Creator y revisa el estado de TikTok, GCCE, OBS, el plugin, los huevos, la arena, el renderizador y el audio. Resuelve los avisos visibles antes del directo.',
        expected: 'Live Center muestra todos los estados importantes de emisión en una sola vista.',
        alt: 'Live Center de Stream Monsters 1.8 con estado de emisión'
      },
      fr: {
        title: 'Vérifiez le Live Center et la préparation à la diffusion',
        body: 'Ouvrez le Creator Stream Monsters et vérifiez l’état de TikTok, GCCE, OBS, du plugin, des œufs, de l’arène, du rendu et de l’audio. Corrigez les avertissements visibles avant le direct.',
        expected: 'Le Live Center affiche tous les états de diffusion importants dans une seule vue.',
        alt: 'Live Center de Stream Monsters 1.8 avec état de diffusion'
      }
    }),
    readOnlyStep('retention-rules', '#gameplay', {
      de: {
        title: 'Gratis-Eier, verdeckte Wahl und faire Saisonregeln prüfen',
        body: 'Wiederkehrende Gratis-Eier sind optional: 60 bis 31.536.000 Sekunden Cooldown, standardmäßig 24 Stunden. Beim ersten Chatkontakt bleibt das Ei 60 Sekunden reserviert; danach kann es öffentlich mit !adopt oder !adoptieren FIFO adoptiert werden. Im Kampf bleiben Entscheidungen verdeckt: 10 Sekunden Monsterwahl, 6 Sekunden A/B/C und 15 Sekunden für 1–4-Statpunkte. Striker, Guardian, Trickster und Sustain nutzen balancierte Elementvorteile. Daily- und Weekly-Quests bleiben gift- und siegunabhängig; nur die ersten 10 legitimen Tagesduelle ändern Arena Rating, jedes legitime Duell gibt Monster-XP.',
        expected: 'Gameplay zeigt Gratis-Ei-Cooldown, Tutorial-Hinweise, faire Rollen, Quests und Saisonregeln.',
        alt: 'Stream Monsters 1.8 Gameplay mit Gratis-Eiern und verdeckten Entscheidungen'
      },
      en: {
        title: 'Check free eggs, sealed choices, and fair season rules',
        body: 'Recurring free eggs are optional: a 60 to 31,536,000 second cooldown defaults to 24 hours. First chat contact reserves the egg for 60 seconds; it then enters the public FIFO and can be claimed with !adopt. Battle choices stay sealed: 10 seconds for a monster, 6 seconds for A/B/C, and 15 seconds for 1–4 stat points. Striker, Guardian, Trickster, and Sustain use balanced elemental advantages. Daily and weekly quests require neither gifts nor wins; only the first 10 legitimate daily battles alter Arena Rating, while every legitimate battle grants monster XP.',
        expected: 'Gameplay shows the free-egg cooldown, tutorial hints, fair roles, quests, and season boundaries.',
        alt: 'Stream Monsters 1.8 gameplay with free eggs and sealed choices'
      },
      es: {
        title: 'Comprueba huevos gratis, elecciones selladas y temporadas justas',
        body: 'Los huevos gratis periódicos son opcionales: el cooldown de 60 a 31.536.000 segundos usa 24 horas por defecto. El primer contacto por chat reserva el huevo 60 segundos; después pasa a la cola FIFO pública y se adopta con !adopt. Las elecciones quedan selladas: 10 segundos para monstruo, 6 segundos para A/B/C y 15 segundos para puntos 1–4. Striker, Guardian, Trickster y Sustain usan ventajas elementales equilibradas. Las misiones diarias y semanales no exigen regalos ni victorias; solo los primeros 10 duelos legítimos diarios cambian Arena Rating y todos dan XP al monstruo.',
        expected: 'Gameplay muestra el cooldown, las ayudas, los roles equilibrados, las misiones y los límites de temporada.',
        alt: 'Gameplay de Stream Monsters 1.8 con huevos gratis y elecciones selladas'
      },
      fr: {
        title: 'Vérifiez les œufs gratuits, les choix scellés et les saisons équitables',
        body: 'Les œufs gratuits récurrents sont facultatifs : le délai de 60 à 31 536 000 secondes vaut 24 heures par défaut. Le premier contact dans le chat réserve l’œuf 60 secondes ; il rejoint ensuite la file FIFO publique et s’adopte avec !adopt. Les choix restent scellés : 10 secondes pour le monstre, 6 secondes pour A/B/C et 15 secondes pour les points 1–4. Striker, Guardian, Trickster et Sustain utilisent des avantages élémentaires équilibrés. Les quêtes quotidiennes et hebdomadaires n’exigent ni cadeau ni victoire ; seuls les 10 premiers duels légitimes quotidiens modifient le classement Arena Rating, tandis que tous donnent de l’XP.',
        expected: 'Gameplay affiche le délai, les conseils, les rôles équilibrés, les quêtes et les limites de saison.',
        alt: 'Gameplay Stream Monsters 1.8 avec œufs gratuits et choix scellés'
      }
    }),
    readOnlyStep('automation-rule', '#gifts-chat', {
      de: {
        title: 'Geschenk-Eier und optionale Gratis-Eier einrichten',
        body: 'Wähle im vollständigen TikTok-Gift-Katalog ein Geschenk, ordne Spawn oder Boost und ein Element zu und prüfe die konfliktfreien Chat-Aliase. Gift-Mappings steuern ausschließlich Geschenk-Eier; das optionale wiederkehrende Gratis-Ei wird unabhängig davon unter Gameplay konfiguriert.',
        expected: 'Die Gifts-&-Chat-Ansicht zeigt aktive Gift-Mappings und die verfügbaren Ei-, Monster- und Battle-Kommandos.',
        alt: 'Stream Monsters 1.8 Geschenk-Eier, optionale Gratis-Eier und Chat-Aliase'
      },
      en: {
        title: 'Set up gift eggs, optional free eggs, and chat aliases',
        body: 'Choose a gift from the complete TikTok gift catalog, assign Spawn or Boost and an element, then review conflict-free chat aliases. Gift mappings only control gift-triggered eggs; configure the optional recurring free egg independently under Gameplay.',
        expected: 'The Gifts & Chat view shows enabled gift mappings and the available egg, monster, and battle commands.',
        alt: 'Stream Monsters 1.8 gift eggs, optional free eggs, and chat aliases'
      },
      es: {
        title: 'Configura huevos de regalos, huevos gratis opcionales y alias',
        body: 'Elige un regalo del catálogo completo de TikTok, asigna Spawn o Boost y un elemento, y revisa los alias de chat sin conflictos. Los mapeos solo controlan huevos activados por regalos; el huevo gratis periódico opcional se configura por separado en Gameplay.',
        expected: 'La vista Gifts & Chat muestra los mapeos activos y los comandos de huevos, monstruos y combate disponibles.',
        alt: 'Huevos de regalos, huevos gratis opcionales y alias en Stream Monsters 1.8'
      },
      fr: {
        title: 'Configurez les œufs-cadeaux, les œufs gratuits facultatifs et les alias',
        body: 'Choisissez un cadeau dans le catalogue TikTok complet, attribuez Spawn ou Boost et un élément, puis vérifiez les alias de chat sans conflit. Les mappages contrôlent uniquement les œufs déclenchés par cadeau ; configurez séparément l’œuf gratuit récurrent facultatif dans Gameplay.',
        expected: 'La vue Gifts & Chat affiche les mappages actifs et les commandes disponibles pour les œufs, monstres et combats.',
        alt: 'Œufs-cadeaux, œufs gratuits facultatifs et alias dans Stream Monsters 1.8'
      }
    }),
    readOnlyStep('action-chain', '#asset-library', {
      de: {
        title: '72 gebündelte Formen und Evolution kontrollieren',
        body: 'Prüfe 24 Vorlagen mit je drei verifizierten Furry-Stufen. Evolution II benötigt Meisterschaft 25 und 3 Essenz; Evolution III benötigt Meisterschaft 50 und insgesamt 8 Essenz. Die Evolution bleibt rein kosmetisch.',
        expected: 'Die Asset-Bibliothek bestätigt 72 gebündelte Formen und den Kenney-Notfall-Fallback.',
        alt: 'Stream Monsters 1.8 Asset-Bibliothek mit 72 Furry-Formen'
      },
      en: {
        title: 'Verify 72 bundled forms and evolution',
        body: 'Review 24 templates with three verified Furry stages each. Evolution II requires mastery 25 and 3 essence spent; Evolution III requires mastery 50 and 8 total essence spent. Evolution remains cosmetic only.',
        expected: 'The asset library confirms 72 bundled forms and the emergency Kenney fallback.',
        alt: 'Stream Monsters 1.8 asset library with 72 Furry forms'
      },
      es: {
        title: 'Comprueba las 72 formas incluidas y la evolución',
        body: 'Revisa 24 plantillas con tres etapas Furry verificadas cada una. Evolución II requiere maestría 25 y 3 de esencia gastada; Evolución III requiere maestría 50 y 8 de esencia total gastada. La evolución es solo cosmética.',
        expected: 'La biblioteca de recursos confirma 72 formas incluidas y el fallback de emergencia de Kenney.',
        alt: 'Biblioteca de Stream Monsters 1.8 con 72 formas Furry'
      },
      fr: {
        title: 'Vérifiez les 72 formes intégrées et l’évolution',
        body: 'Examinez 24 modèles avec trois stades Furry vérifiés chacun. L’évolution II exige la maîtrise 25 et 3 essences dépensées ; l’évolution III exige la maîtrise 50 et 8 essences dépensées au total. L’évolution reste purement cosmétique.',
        expected: 'La bibliothèque confirme 72 formes intégrées et le fallback d’urgence Kenney.',
        alt: 'Bibliothèque Stream Monsters 1.8 avec 72 formes Furry'
      }
    }),
    readOnlyStep('rule-dry-run', '#portraitStagePreview', {
      de: {
        title: 'Interaktive A/B/C-Arena im Portrait prüfen',
        body: 'Prüfe die 1080×1920-Vorschau mit zwei Kämpfern, HP, Spezialenergie und den Aktionen A, B und C. Die unteren 26 Prozent bleiben als TikTok-Chat-Safe-Zone frei.',
        expected: 'Die Portrait-Vorschau zeigt das interaktive A/B/C-Kampflayout und die reservierte Chat-Zone.',
        alt: 'Stream Monsters 1.8 Portrait-Arena mit A/B/C-Aktionen'
      },
      en: {
        title: 'Check the interactive A/B/C arena in portrait',
        body: 'Review the 1080×1920 preview with two fighters, HP, special energy, and the A, B, and C actions. The lower 26 percent remains reserved as the TikTok chat safe zone.',
        expected: 'The portrait preview shows the interactive A/B/C battle layout and reserved chat zone.',
        alt: 'Stream Monsters 1.8 portrait arena with A/B/C actions'
      },
      es: {
        title: 'Comprueba la arena interactiva A/B/C en vertical',
        body: 'Revisa la vista previa 1080×1920 con dos luchadores, HP, energía especial y las acciones A, B y C. El 26 por ciento inferior queda reservado como zona segura para el chat de TikTok.',
        expected: 'La vista vertical muestra el combate interactivo A/B/C y la zona de chat reservada.',
        alt: 'Arena vertical de Stream Monsters 1.8 con acciones A/B/C'
      },
      fr: {
        title: 'Vérifiez l’arène interactive A/B/C en portrait',
        body: 'Examinez l’aperçu 1080×1920 avec deux combattants, les PV, l’énergie spéciale et les actions A, B et C. Les 26 pour cent inférieurs restent réservés comme zone sûre pour le chat TikTok.',
        expected: 'L’aperçu portrait montre le combat interactif A/B/C et la zone de chat réservée.',
        alt: 'Arène portrait Stream Monsters 1.8 avec actions A/B/C'
      }
    }),
    readOnlyStep('alchemy-overlay', '#overlayUrl', {
      de: {
        title: 'Stream-Monsters-Overlay in OBS eintragen',
        body: 'Kopiere /streammonsters/overlay in eine OBS-Browserquelle. Wähle Portrait 1080×1920 oder Landscape 1920×1080 und prüfe Renderer-Qualität, Safe-Zone und die fünf Audio-Kanäle mit einer lokalen Demo.',
        expected: 'Die echte Overlay-URL und alle Broadcast-Vorschauen sind im Creator sichtbar.',
        alt: 'Stream Monsters 1.8 OBS-Overlay-URL und Portrait-Vorschau'
      },
      en: {
        title: 'Add the Stream Monsters overlay to OBS',
        body: 'Copy /streammonsters/overlay into an OBS browser source. Choose portrait 1080×1920 or landscape 1920×1080, then review renderer quality, safe zones, and the five audio channels with a local demo.',
        expected: 'The real overlay URL and every broadcast preview are visible in the Creator.',
        alt: 'Stream Monsters 1.8 OBS overlay URL and portrait preview'
      },
      es: {
        title: 'Añade el overlay de Stream Monsters a OBS',
        body: 'Copia /streammonsters/overlay en una fuente de navegador de OBS. Elige vertical 1080×1920 u horizontal 1920×1080 y comprueba la calidad del renderizador, las zonas seguras y los cinco canales de audio con una demo local.',
        expected: 'La URL real del overlay y todas las vistas de emisión son visibles en Creator.',
        alt: 'URL del overlay OBS y vista vertical de Stream Monsters 1.8'
      },
      fr: {
        title: 'Ajoutez l’overlay Stream Monsters à OBS',
        body: 'Copiez /streammonsters/overlay dans une source navigateur OBS. Choisissez le portrait 1080×1920 ou le paysage 1920×1080, puis vérifiez la qualité du rendu, les zones sûres et les cinq canaux audio avec une démo locale.',
        expected: 'L’URL réelle de l’overlay et tous les aperçus de diffusion sont visibles dans le Creator.',
        alt: 'URL de l’overlay OBS et aperçu portrait de Stream Monsters 1.8'
      }
    }),
    readOnlyStep('rule-reset', '#community-seasons', {
      de: {
        title: 'Permanenten Fortschritt schützen',
        body: 'Prüfe Sammlung, Arena Rating, Collector Score und Saison-Countdown nur lesend. Sammlung, Evolution, Level und Statpunkte bleiben saisonübergreifend permanent; die Doku-Prüfung setzt keine Zuschauerdaten zurück.',
        expected: 'Die Community-Ansicht trennt saisonale Ranglisten vom permanenten Monster-Fortschritt.',
        alt: 'Stream Monsters 1.8 Community- und Saisonansicht'
      },
      en: {
        title: 'Protect permanent progression',
        body: 'Review collections, Arena Rating, Collector Score, and the season countdown without changing them. Collections, evolution, levels, and stat points remain permanent across seasons; the documentation check resets no viewer data.',
        expected: 'The community view separates seasonal leaderboards from permanent monster progression.',
        alt: 'Stream Monsters 1.8 community and season view'
      },
      es: {
        title: 'Protege el progreso permanente',
        body: 'Revisa las colecciones, Arena Rating, Collector Score y la cuenta atrás de temporada sin modificarlos. Colección, evolución, niveles y puntos de estadísticas permanecen entre temporadas; la comprobación de documentación no reinicia datos.',
        expected: 'La vista de comunidad separa las clasificaciones de temporada del progreso permanente de los monstruos.',
        alt: 'Vista de comunidad y temporadas de Stream Monsters 1.8'
      },
      fr: {
        title: 'Protégez la progression permanente',
        body: 'Consultez les collections, l’Arena Rating, le Collector Score et le compte à rebours de saison sans les modifier. Collection, évolution, niveaux et points de statistiques restent permanents entre les saisons ; la vérification de documentation ne réinitialise aucune donnée.',
        expected: 'La vue Communauté sépare les classements saisonniers de la progression permanente des monstres.',
        alt: 'Vue Communauté et saisons de Stream Monsters 1.8'
      }
    })
  ]
});
